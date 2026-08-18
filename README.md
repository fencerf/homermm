# Home Computer Management System (HCMS)

HCMS is a centralized agent-based management system for home computers. It features a React frontend and a Python FastAPI backend that manages machines, software updates, and Kopia backup configuration.

## Deployment with Docker

1. Ensure Docker and Docker Compose are installed.
2. Build the frontend manually first on your host machine to ensure dependencies don't conflict with docker's environment:
```bash
cd frontend
npm install
npm run build
```
3. Run `docker compose up -d --build` from the root directory.
4. Access the web interface at `http://localhost:8000`.
   - Default login password: `admin`

Note: To run in the sandbox environment, you must use native deployment (the container cache driver appears to be broken):
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -c "from app.core.database import init_db; init_db()"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```


## Running the Agent

On each client machine (Windows or Linux):
1. Install Python 3.
2. Copy the `agent` folder to the client machine.
3. Run `pip install -r requirements.txt`.
4. Configure environment variables if needed (`SERVER_URL` or `AGENT_API_KEY`).
5. Run `python agent.py`.
