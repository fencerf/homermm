import asyncio
import websockets
import json
import threading
import time

async def agent_client():
    uri = "ws://localhost:8000/api/agent/1/ws?token=dummy_agent_key_123"
    try:
        async with websockets.connect(uri) as websocket:
            print("Agent connected")
            while True:
                msg = await websocket.recv()
                print(f"Agent received: {msg}")
                data = json.loads(msg)
                if data.get("type") == "list_directory":
                     await websocket.send(json.dumps({"type": "directory_result", "current_path": data.get("path"), "items": [{"name": "test_folder", "is_dir": True}]}))
    except Exception as e:
        print(f"Agent ws error: {e}")

async def frontend_client():
    uri = "ws://localhost:8000/api/frontend/machines/1/ws?token=admin_secret_token"
    try:
        async with websockets.connect(uri) as websocket:
            print("Frontend connected")
            await websocket.send(json.dumps({"type": "list_directory", "path": "/"}))
            msg = await websocket.recv()
            print(f"Frontend received: {msg}")
    except Exception as e:
        print(f"Frontend ws error: {e}")

def run_agent():
    asyncio.run(agent_client())

def run_frontend():
    asyncio.run(frontend_client())

if __name__ == "__main__":
    t = threading.Thread(target=run_agent, daemon=True)
    t.start()
    time.sleep(1)
    run_frontend()
