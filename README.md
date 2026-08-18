# Home Computer Management System (HCMS)

HCMS is a centralized agent-based management system for home computers. It features a React frontend and a Python FastAPI backend that manages machines, software updates, and Kopia backup configuration.

## Deployment Instructions (Manual)

### 1. Build the Frontend
```bash
cd frontend
npm install
npm run build
```
Copy `frontend/dist` content to `backend/static`.

### 2. Run the Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -c "from app.core.database import init_db; init_db()"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Then access `http://localhost:8000`. The default login password is `admin`.

## Running the Agent

On each client machine (Windows or Linux):
1. Install Python 3.
2. Copy the `agent` folder to the client machine.
3. Run `pip install -r requirements.txt`.
4. Run `python agent.py`.
