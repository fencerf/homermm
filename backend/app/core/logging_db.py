from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import datetime

Base = declarative_base()

class AgentLog(Base):
    __tablename__ = "agent_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    level = Column(String)
    message = Column(Text)
    module = Column(String, nullable=True)
    action_id = Column(String, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    action = Column(String)
    user = Column(String)
    details = Column(Text)
    action_id = Column(String, nullable=True)

from sqlalchemy import UniqueConstraint

class OSEventLog(Base):
    __tablename__ = "os_event_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    level = Column(String)
    message = Column(Text)
    source = Column(String)

    __table_args__ = (UniqueConstraint('timestamp', 'source', 'message', name='uix_os_event'),)

LOG_DB_DIR = "./data/logs"
if not os.path.exists(LOG_DB_DIR):
    os.makedirs(LOG_DB_DIR)

_log_engines = {}
_log_sessionmakers = {}

def get_log_engine(machine_id: int):
    if machine_id not in _log_engines:
        from sqlalchemy import text
        db_path = os.path.join(LOG_DB_DIR, f"logs_machine_{machine_id}.db")
        engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)

        # Migrations for logs db
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE agent_logs ADD COLUMN action_id VARCHAR"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE audit_logs ADD COLUMN action_id VARCHAR"))
            except Exception:
                pass
            conn.commit()

        _log_engines[machine_id] = engine
        _log_sessionmakers[machine_id] = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return _log_sessionmakers[machine_id]

def get_log_db(machine_id: int):
    SessionLocal = get_log_engine(machine_id)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def enforce_log_retention(machine_id: int):
    retention_days = int(os.environ.get("LOG_RETENTION_DAYS", "15"))
    cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)

    SessionLocal = get_log_engine(machine_id)
    with SessionLocal() as db:
        db.query(AgentLog).filter(AgentLog.timestamp < cutoff_date).delete()
        db.query(AuditLog).filter(AuditLog.timestamp < cutoff_date).delete()
        db.query(OSEventLog).filter(OSEventLog.timestamp < cutoff_date).delete()
        db.commit()

def log_audit_action(machine_id: int, action: str, user: str, details: str, action_id: str = None):
    SessionLocal = get_log_engine(machine_id)
    with SessionLocal() as db:
        new_log = AuditLog(action=action, user=user, details=details, action_id=action_id)
        db.add(new_log)
        db.commit()

    # Enforce retention on new audits as well
    enforce_log_retention(machine_id)
