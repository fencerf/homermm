import asyncio
from typing import Dict, Any

class AgentEventManager:
    def __init__(self):
        # Maps machine_id to an asyncio.Queue
        self.listeners: Dict[int, asyncio.Queue] = {}

    def get_queue(self, machine_id: int) -> asyncio.Queue:
        if machine_id not in self.listeners:
            self.listeners[machine_id] = asyncio.Queue()
        return self.listeners[machine_id]

    async def notify_task_created(self, machine_id: int, task_data: dict):
        # Notify internal long-polling/SSE listeners
        if machine_id in self.listeners:
            # We don't want to block the sender
            try:
                self.listeners[machine_id].put_nowait(task_data)
            except asyncio.QueueFull:
                pass

        # Also publish to RabbitMQ if AMQP is configured
        import os
        amqp_url = os.environ.get("AMQP_URL")
        if amqp_url:
            import aio_pika
            import json
            try:
                connection = await aio_pika.connect_robust(amqp_url)
                async with connection:
                    channel = await connection.channel()
                    exchange = await channel.declare_exchange('hcms_tasks', aio_pika.ExchangeType.DIRECT)
                    message = aio_pika.Message(
                        body=json.dumps(task_data).encode(),
                        delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                    )
                    await exchange.publish(message, routing_key=str(machine_id))
            except Exception as e:
                print(f"Failed to publish task to AMQP broker: {e}")

agent_events = AgentEventManager()
