from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import os
import json

from app.core.database import get_db
from app.models import database as models
from app.schemas import schemas

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
    return db.query(models.Machine).all()

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
    return db_task

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

@router.post("/auth/login")
def login(request: LoginRequest):
    if request.password == ADMIN_PASSWORD:
        return {"access_token": ADMIN_TOKEN, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Incorrect password")
