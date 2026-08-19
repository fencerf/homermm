from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from app.core.database import get_db
from app.models import database as models
from app.schemas import schemas

router = APIRouter()

AGENT_API_KEY = "dummy_agent_key_123" # Hardcoded for now, could be in env vars

def verify_agent_key(x_agent_key: str = Header(...)):
    if x_agent_key != AGENT_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Agent Key")

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

@router.post("/{machine_id}/tasks/{task_id}/result")
def submit_task_result(machine_id: int, task_id: int, status: str, result_message: Optional[str] = None, db: Session = Depends(get_db), _: str = Depends(verify_agent_key)):
    task = db.query(models.AgentTask).filter(
        models.AgentTask.id == task_id,
        models.AgentTask.machine_id == machine_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = status
    task.result_message = result_message
    task.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "success"}
