from fastapi import HTTPException, Header, Depends
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import database as models

# Only used for enrollment now, or backwards compatibility if configured
import os
AGENT_API_KEY = os.environ.get("AGENT_API_KEY", "dummy_agent_key_123")

def verify_agent_token(authorization: str = Header(...), db: Session = Depends(get_db)):
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid auth scheme")

        # Decode without verification first to get the machine ID
        unverified_claims = jwt.get_unverified_claims(token)
        machine_id = unverified_claims.get("sub")

        if not machine_id:
            raise HTTPException(status_code=401, detail="Invalid token subject")

        machine = db.query(models.Machine).filter(models.Machine.id == int(machine_id)).first()
        if not machine or not machine.public_key:
            raise HTTPException(status_code=401, detail="Machine not enrolled")

        if machine.approval_status != "approved":
            raise HTTPException(status_code=403, detail="Machine pending approval")

        # Verify signature using the machine's specific public key
        payload = jwt.decode(token, machine.public_key, algorithms=["RS256"])
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

# Legacy fallback for backward compatibility while testing, or for enrollment
def verify_agent_key(x_agent_key: str = Header(None), authorization: str = Header(None), db: Session = Depends(get_db)):
    if authorization and authorization.startswith("Bearer "):
        return verify_agent_token(authorization, db)

    if x_agent_key != AGENT_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Agent Key")
    return {"sub": "legacy"}
