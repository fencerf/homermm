from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.database import Base
import os
from sqlalchemy import text

DB_DIR = "./data"
if not os.path.exists(DB_DIR):
    os.makedirs(DB_DIR)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_DIR}/hcms.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

    # Graceful migration for existing databases
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE machines ADD COLUMN disk_used INTEGER DEFAULT 0"))
        except Exception:
            pass # Column likely exists

        try:
            conn.execute(text("ALTER TABLE machines ADD COLUMN kopia_config TEXT"))
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE pending_updates ADD COLUMN update_type VARCHAR DEFAULT 'software'"))
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE pending_updates ADD COLUMN description TEXT"))
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE agent_tasks ADD COLUMN scheduled_for DATETIME"))
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE machines ADD COLUMN network_info TEXT"))
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE machines ADD COLUMN agent_version VARCHAR"))
        except Exception:
            pass

        try:
            conn.execute(text("ALTER TABLE agent_tasks ADD COLUMN action_id VARCHAR"))
        except Exception:
            pass

        conn.commit()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
