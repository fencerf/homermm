from fastapi import APIRouter
from app.api.endpoints import agent, frontend

api_router = APIRouter()
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(frontend.router, prefix="/frontend", tags=["frontend"])
