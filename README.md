# Home Computer Management System (HCMS)

HCMS is a centralized agent-based management system for home computers. It features a React frontend and a Python FastAPI backend that manages machines, software updates, and Kopia backup configuration.

## Deployment with Docker

1. Ensure Docker and Docker Compose are installed.
2. Run `docker compose up -d --build` from the root directory.
3. Access the web interface at `http://localhost:8000`.
   - Default login password: `admin`

## Running the Agent

On each client machine (Windows or Linux):
1. Install Python 3.
2. Copy the `agent` folder to the client machine.
3. Run `pip install -r requirements.txt`.
4. Configure environment variables if needed (`SERVER_URL` or `AGENT_API_KEY`).
5. Run `python agent.py`.
