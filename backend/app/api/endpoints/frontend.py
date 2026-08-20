from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import os
import json

from app.core.database import get_db
from app.core.logging_db import log_audit_action, get_log_engine, AgentLog, AuditLog, LOG_DB_DIR
from app.models import database as models
from app.schemas import schemas
from app.core.websocket_manager import manager
from fastapi import WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse
import re

router = APIRouter()

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "admin_secret_token")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")

class LoginRequest(BaseModel):
    password: str

def verify_admin(authorization: str = Header(None)):
    if authorization != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.get("/machines", response_model=List[schemas.Machine])
def get_machines(db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    machines = db.query(models.Machine).all()
    results = []
    for machine in machines:
        software_updates = db.query(models.PendingUpdate).filter(
            models.PendingUpdate.machine_id == machine.id,
            models.PendingUpdate.update_type == 'software'
        ).count()
        os_updates = db.query(models.PendingUpdate).filter(
            models.PendingUpdate.machine_id == machine.id,
            models.PendingUpdate.update_type == 'os'
        ).count()

        m_dict = schemas.Machine.model_validate(machine).model_dump()
        m_dict['pending_software_updates'] = software_updates
        m_dict['pending_os_updates'] = os_updates
        results.append(m_dict)
    return results

@router.get("/machines/{machine_id}", response_model=schemas.Machine)
def get_machine(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine

@router.get("/machines/{machine_id}/updates", response_model=List[schemas.PendingUpdate])
def get_machine_updates(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    return db.query(models.PendingUpdate).filter(models.PendingUpdate.machine_id == machine_id).all()

@router.post("/machines/{machine_id}/tasks", response_model=schemas.AgentTask)
def create_task(machine_id: int, task: schemas.AgentTaskCreate, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    db_machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not db_machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    # Inject global Kopia settings if this is a Kopia task
    if task.task_type == "configure_kopia":
        settings = db.query(models.GlobalSettings).all()
        kopia_settings = {s.key: s.value for s in settings if s.key.startswith("kopia_")}
        try:
            payload = json.loads(task.payload)
        except json.JSONDecodeError:
            payload = {}
        payload["kopia_settings"] = kopia_settings
        task.payload = json.dumps(payload)

    db_task = models.AgentTask(**task.model_dump(), machine_id=machine_id)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    log_audit_action(
        machine_id=machine_id,
        action=f"Created task: {task.task_type}",
        user="admin", # Simplification since we have single-user admin token
        details=f"Task ID: {db_task.id}, Payload: {task.payload}",
        action_id=task.action_id
    )

    return db_task

@router.get("/machines/{machine_id}/tasks/{task_id}", response_model=schemas.AgentTask)
def get_task(machine_id: int, task_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    task = db.query(models.AgentTask).filter(
        models.AgentTask.id == task_id,
        models.AgentTask.machine_id == machine_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.get("/machines/{machine_id}/logs/agent", response_model=List[schemas.AgentLog])
def get_machine_agent_logs(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    LogSession = get_log_engine(machine_id)
    with LogSession() as log_db:
        return log_db.query(AgentLog).order_by(AgentLog.timestamp.desc()).limit(100).all()

@router.get("/machines/{machine_id}/logs/audit", response_model=List[schemas.AuditLog])
def get_machine_audit_logs(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    LogSession = get_log_engine(machine_id)
    with LogSession() as log_db:
        return log_db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100).all()

@router.get("/machines/{machine_id}/logs/size")
def get_machine_logs_size(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    db_path = os.path.join(LOG_DB_DIR, f"logs_machine_{machine_id}.db")
    size_kb = 0
    if os.path.exists(db_path):
        size_kb = os.path.getsize(db_path) / 1024.0
    return {"size_kb": size_kb}

@router.get("/machines/{machine_id}/actions")
def get_machine_actions(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    # Returns an aggregated timeline of user actions (AuditLogs), their correlated tasks, and agent logs
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    LogSession = get_log_engine(machine_id)

    with LogSession() as log_db:
        # Group by action_id where it exists
        audit_logs = log_db.query(AuditLog).filter(AuditLog.action_id.isnot(None)).order_by(AuditLog.timestamp.desc()).limit(50).all()

        actions = []
        for audit in audit_logs:
            action_id = audit.action_id

            # Find related tasks in main DB
            tasks = db.query(models.AgentTask).filter(models.AgentTask.action_id == action_id).all()
            task_data = [schemas.AgentTask.model_validate(t).model_dump() for t in tasks]

            # Find related agent logs in log DB
            agent_logs = log_db.query(AgentLog).filter(AgentLog.action_id == action_id).order_by(AgentLog.timestamp.asc()).all()
            agent_log_data = [{"timestamp": l.timestamp.isoformat(), "level": l.level, "message": l.message} for l in agent_logs]

            actions.append({
                "action_id": action_id,
                "timestamp": audit.timestamp.isoformat(),
                "user": audit.user,
                "action": audit.action,
                "details": audit.details,
                "tasks": task_data,
                "agent_logs": agent_log_data
            })

        return actions

@router.get("/timezone")
def get_server_timezone(_: str = Depends(verify_admin)):
    tz = os.environ.get("TZ", "UTC")
    return {"timezone": tz}

def get_agent_path():
    # Dev path (host machine) vs Docker path
    dev_path = os.path.join(os.path.dirname(__file__), "../../../../agent/agent.py")
    prod_path = os.path.join(os.path.dirname(__file__), "../../../agent/agent.py") # /app/app/api/endpoints -> /app/agent/agent.py
    if os.path.exists(prod_path):
        return prod_path
    return dev_path

@router.get("/agent/version")
def get_latest_agent_version(_: str = Depends(verify_admin)):
    agent_path = get_agent_path()
    try:
        with open(agent_path, "r") as f:
            content = f.read()
            match = re.search(r'AGENT_VERSION\s*=\s*["\']([^"\']+)["\']', content)
            if match:
                return {"version": match.group(1)}
    except Exception as e:
        pass
    return {"version": "unknown"}

@router.get("/agent/download")
def download_agent_frontend(_: str = Depends(verify_admin)):
    agent_path = get_agent_path()
    if not os.path.exists(agent_path):
        raise HTTPException(status_code=404, detail="Agent file not found")
    return FileResponse(agent_path, filename="agent.py")

@router.get("/settings", response_model=List[schemas.GlobalSettings])
def get_settings(db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    return db.query(models.GlobalSettings).all()

@router.post("/settings")
def update_settings(settings: List[schemas.GlobalSettingsBase], db: Session = Depends(get_db), _: str = Depends(verify_admin)):
    for setting in settings:
        db_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == setting.key).first()
        if db_setting:
            db_setting.value = setting.value
        else:
            db_setting = models.GlobalSettings(**setting.model_dump())
            db.add(db_setting)
    db.commit()
    return {"status": "success"}

from fastapi import Query

@router.websocket("/machines/{machine_id}/ws")
async def websocket_frontend_endpoint(websocket: WebSocket, machine_id: int, token: str = Query(None)):
    if token != ADMIN_TOKEN:
        await websocket.close(code=1008)
        return
    await manager.connect_frontend(websocket, machine_id)
    try:
        while True:
            data = await websocket.receive_json()
            # Relay requests from the frontend down to the agent
            try:
                await manager.relay_to_agent(machine_id, data)
            except Exception as e:
                await websocket.send_json({"error": str(e), "type": "error"})
    except WebSocketDisconnect:
        manager.disconnect_frontend(websocket, machine_id)

@router.post("/auth/login")
def login(request: LoginRequest):
    if request.password == ADMIN_PASSWORD:
        return {"access_token": ADMIN_TOKEN, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Incorrect password")
