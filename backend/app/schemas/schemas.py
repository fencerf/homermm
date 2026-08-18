from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class MachineBase(BaseModel):
    hostname: str
    os_name: str
    os_version: str
    cpu_info: str
    memory_total: int
    disk_total: int
    ip_address: str

class MachineCreate(MachineBase):
    pass

class Machine(MachineBase):
    id: int
    last_seen: datetime
    is_online: bool

    class Config:
        orm_mode = True
        from_attributes = True

class PendingUpdateBase(BaseModel):
    package_name: str
    current_version: Optional[str] = None
    new_version: Optional[str] = None

class PendingUpdateCreate(PendingUpdateBase):
    pass

class PendingUpdate(PendingUpdateBase):
    id: int
    machine_id: int

    class Config:
        orm_mode = True
        from_attributes = True

class AgentTaskBase(BaseModel):
    task_type: str
    payload: str

class AgentTaskCreate(AgentTaskBase):
    pass

class AgentTask(AgentTaskBase):
    id: int
    machine_id: int
    status: str
    result_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        from_attributes = True

class GlobalSettingsBase(BaseModel):
    key: str
    value: str

class GlobalSettings(GlobalSettingsBase):
    class Config:
        orm_mode = True
        from_attributes = True
