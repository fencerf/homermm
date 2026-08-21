from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from app.core.database import get_db
from app.models import database as models
from app.schemas import schemas
from app.core.logging_db import get_log_engine, AgentLog, enforce_log_retention
from app.core.websocket_manager import manager
from fastapi import WebSocket, WebSocketDisconnect

import os
from fastapi.responses import FileResponse

router = APIRouter()

AGENT_API_KEY = os.environ.get("AGENT_API_KEY", "dummy_agent_key_123")

def verify_agent_key(x_agent_key: str = Header(...)):
    if x_agent_key != AGENT_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Agent Key")

def get_agent_path():
    # Dev path (host machine) vs Docker path
    dev_path = os.path.join(os.path.dirname(__file__), "../../../../agent/agent.py")
    prod_path = os.path.join(os.path.dirname(__file__), "../../../agent/agent.py") # /app/app/api/endpoints -> /app/agent/agent.py
    if os.path.exists(prod_path):
        return prod_path
    return dev_path

@router.get("/download")
def download_agent(_: str = Depends(verify_agent_key)):
    agent_path = get_agent_path()
    if not os.path.exists(agent_path):
        raise HTTPException(status_code=404, detail="Agent file not found")
    return FileResponse(agent_path, filename="agent.py")

@router.post("/register", response_model=schemas.Machine)
def register_machine(machine: schemas.MachineCreate, db: Session = Depends(get_db), _: str = Depends(verify_agent_key)):
    db_machine = db.query(models.Machine).filter(models.Machine.hostname == machine.hostname).first()
    if db_machine:
        # Update existing
        for var, value in vars(machine).items():
            setattr(db_machine, var, value)
        db_machine.last_seen = datetime.utcnow()
        db_machine.is_online = True
    else:
        # Create new
        db_machine = models.Machine(**machine.model_dump())
        db.add(db_machine)

    db.commit()
    db.refresh(db_machine)
    return db_machine

@router.post("/{machine_id}/logs")
def submit_logs(machine_id: int, batch: schemas.AgentLogsBatch, db: Session = Depends(get_db), _: str = Depends(verify_agent_key)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    LogSession = get_log_engine(machine_id)
    with LogSession() as log_db:
        for log in batch.logs:
            new_log = AgentLog(
                timestamp=log.timestamp,
                level=log.level,
                message=log.message,
                module=log.module,
                action_id=log.action_id
            )
            log_db.add(new_log)
        log_db.commit()

    enforce_log_retention(machine_id)
    return {"status": "success"}

@router.post("/{machine_id}/updates")
def submit_updates(machine_id: int, updates: List[schemas.PendingUpdateCreate], db: Session = Depends(get_db), _: str = Depends(verify_agent_key)):
    # Clear old updates
    db.query(models.PendingUpdate).filter(models.PendingUpdate.machine_id == machine_id).delete()

    # Add new updates
    for update in updates:
        db_update = models.PendingUpdate(**update.model_dump(), machine_id=machine_id)
        db.add(db_update)

    db.commit()
    return {"status": "success"}

from sqlalchemy import or_

@router.get("/{machine_id}/tasks", response_model=List[schemas.AgentTask])
def get_pending_tasks(machine_id: int, db: Session = Depends(get_db), _: str = Depends(verify_agent_key)):
    now = datetime.utcnow()
    tasks = db.query(models.AgentTask).filter(
        models.AgentTask.machine_id == machine_id,
        models.AgentTask.status == "pending",
        or_(
            models.AgentTask.scheduled_for == None,
            models.AgentTask.scheduled_for <= now
        )
    ).all()

    # Mark as in progress once fetched
    for task in tasks:
        task.status = "in_progress"
    if tasks:
        db.commit()

    return tasks

from fastapi import Query

@router.websocket("/{machine_id}/ws")
async def websocket_agent_endpoint(websocket: WebSocket, machine_id: int, token: str = Query(None)):
    if token != AGENT_API_KEY:
        await websocket.close(code=1008)
        return
    await manager.connect_agent(websocket, machine_id)
    try:
        while True:
            data = await websocket.receive_json()
            # Relay incoming data from the agent to connected frontends
            await manager.relay_to_frontends(machine_id, data)
    except WebSocketDisconnect:
        manager.disconnect_agent(machine_id)

@router.post("/{machine_id}/tasks/{task_id}/result")
def submit_task_result(machine_id: int, task_id: int, result: schemas.TaskResultBody, db: Session = Depends(get_db), _: str = Depends(verify_agent_key)):
    task = db.query(models.AgentTask).filter(
        models.AgentTask.id == task_id,
        models.AgentTask.machine_id == machine_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = result.status
    task.result_message = result.result_message
    task.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "success"}
