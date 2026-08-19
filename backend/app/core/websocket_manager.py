from fastapi import WebSocket
from typing import Dict, Optional
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Maps machine_id to the agent's WebSocket connection
        self.active_agents: Dict[int, WebSocket] = {}
        # Maps machine_id to a list of active frontend WebSocket connections
        self.active_frontends: Dict[int, list[WebSocket]] = {}

        # A dictionary to track pending requests that the frontend has made, waiting for agent response
        self.pending_requests: Dict[str, asyncio.Event] = {}
        self.request_responses: Dict[str, dict] = {}

    async def connect_agent(self, websocket: WebSocket, machine_id: int):
        await websocket.accept()
        self.active_agents[machine_id] = websocket
        logger.info(f"Agent {machine_id} connected via WebSocket")

    def disconnect_agent(self, machine_id: int):
        if machine_id in self.active_agents:
            del self.active_agents[machine_id]
            logger.info(f"Agent {machine_id} disconnected from WebSocket")

    async def connect_frontend(self, websocket: WebSocket, machine_id: int):
        await websocket.accept()
        if machine_id not in self.active_frontends:
            self.active_frontends[machine_id] = []
        self.active_frontends[machine_id].append(websocket)
        logger.info(f"Frontend connected to Agent {machine_id} via WebSocket")

    def disconnect_frontend(self, websocket: WebSocket, machine_id: int):
        if machine_id in self.active_frontends:
            if websocket in self.active_frontends[machine_id]:
                self.active_frontends[machine_id].remove(websocket)
                logger.info(f"Frontend disconnected from Agent {machine_id} WebSocket")
                if not self.active_frontends[machine_id]:
                    del self.active_frontends[machine_id]

    async def relay_to_agent(self, machine_id: int, message: dict):
        if machine_id in self.active_agents:
            websocket = self.active_agents[machine_id]
            await websocket.send_json(message)
        else:
            raise Exception("Agent is not currently connected via WebSocket")

    async def relay_to_frontends(self, machine_id: int, message: dict):
        if machine_id in self.active_frontends:
            disconnected = []
            for websocket in self.active_frontends[machine_id]:
                try:
                    await websocket.send_json(message)
                except Exception:
                    disconnected.append(websocket)
            for ws in disconnected:
                self.disconnect_frontend(ws, machine_id)

manager = ConnectionManager()
