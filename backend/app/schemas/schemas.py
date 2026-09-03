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
    boot_time: Optional[int] = None
    reboot_pending: Optional[bool] = False

class MachineCreate(MachineBase):
    pass

class Machine(MachineBase):
    id: int
    last_seen: datetime
    is_online: bool
    pending_software_updates: Optional[int] = 0
    pending_os_updates: Optional[int] = 0

    class Config:
        orm_mode = True
        from_attributes = True

class TaskResultBody(BaseModel):
    status: str
    result_message: Optional[str] = None

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
    action_id: Optional[str] = None

class AgentLogCreate(BaseModel):
    timestamp: datetime
    level: str
    message: str
    module: Optional[str] = None
    action_id: Optional[str] = None

class AgentLogsBatch(BaseModel):
    logs: List[AgentLogCreate]

class OSEventLog(BaseModel):
    id: int
    timestamp: datetime
    level: Optional[str] = None
    message: Optional[str] = None
    source: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class AgentLog(BaseModel):
    id: int
    timestamp: datetime
    level: str
    message: str
    module: Optional[str] = None
    action_id: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class AuditLog(BaseModel):
    id: int
    timestamp: datetime
    action: str
    user: str
    details: str
    action_id: Optional[str] = None

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
    action_id: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True


class ScheduledTaskBase(BaseModel):
    task_name: str
    schedule: str
    command: str

class ScheduledTaskCreate(ScheduledTaskBase):
    pass

class ScheduledTask(ScheduledTaskBase):
    id: int
    machine_id: int

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
