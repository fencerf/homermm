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
    disk_used: int = 0
    kopia_config: Optional[str] = None
    ip_address: str
    network_info: Optional[str] = None
    agent_version: Optional[str] = None

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
    description: Optional[str] = None
    current_version: Optional[str] = None
    new_version: Optional[str] = None
    update_type: Optional[str] = "software"

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
    scheduled_for: Optional[datetime] = None

class AgentLogCreate(BaseModel):
    timestamp: datetime
    level: str
    message: str
    module: Optional[str] = None

class AgentLogsBatch(BaseModel):
    logs: List[AgentLogCreate]

class AgentLog(BaseModel):
    id: int
    timestamp: datetime
    level: str
    message: str
    module: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class AuditLog(BaseModel):
    id: int
    timestamp: datetime
    action: str
    user: str
    details: str

    class Config:
        orm_mode = True
        from_attributes = True

class AgentTaskCreate(AgentTaskBase):
    pass

class AgentTask(AgentTaskBase):
    id: int
    machine_id: int
    status: str
    result_message: Optional[str] = None
    created_at: datetime
    scheduled_for: Optional[datetime] = None
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
