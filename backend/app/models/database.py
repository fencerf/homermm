from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, unique=True, index=True, nullable=False)
    os_name = Column(String) # e.g. "Windows", "Linux"
    os_version = Column(String)
    cpu_info = Column(String)
    memory_total = Column(Integer) # In MB
    disk_total = Column(Integer) # In GB
    disk_used = Column(Integer, default=0) # In GB
    ip_address = Column(String)
    network_info = Column(Text, nullable=True) # JSON string of network details
    last_seen = Column(DateTime, default=datetime.utcnow)
    is_online = Column(Boolean, default=True)
    kopia_config = Column(Text, nullable=True) # JSON string of kopia policies
    agent_version = Column(String, nullable=True)

    updates = relationship("PendingUpdate", back_populates="machine", cascade="all, delete-orphan")
    tasks = relationship("AgentTask", back_populates="machine", cascade="all, delete-orphan")

class PendingUpdate(Base):
    __tablename__ = "pending_updates"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"))
    package_name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    current_version = Column(String)
    new_version = Column(String)
    update_type = Column(String, default="software") # "software" or "os"

    machine = relationship("Machine", back_populates="updates")

class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"))
    task_type = Column(String, nullable=False) # e.g. "update_software", "configure_kopia"
    payload = Column(Text) # JSON string with task details
    status = Column(String, default="pending") # pending, in_progress, completed, failed
    result_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    scheduled_for = Column(DateTime, nullable=True)
    completed_at = Column(DateTime)

    machine = relationship("Machine", back_populates="tasks")

class GlobalSettings(Base):
    __tablename__ = "global_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
