from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from app.core.database import init_db
from app.api.router import api_router

app = FastAPI(title="Home Computer Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(api_router, prefix="/api")

# Serve the static files from the React build
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Serve index.html for all non-API routes to support React Router
        if not full_path.startswith("api"):
            return FileResponse("static/index.html")
else:
    @app.get("/")
    def read_root():
        return {"message": "HCMS API is running. Frontend build not found in /static."}
