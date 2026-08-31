import os
import time
import json
import logging
import asyncio
import threading
import requests
import sseclient
import pika

logger = logging.getLogger(__name__)

class BaseListener:
    def __init__(self, server_url, headers, machine_id, execute_task_cb):
        self.server_url = server_url
        self.headers = headers
        self.machine_id = machine_id
        self.execute_task_cb = execute_task_cb
        self.running = True

    def start(self):
        raise NotImplementedError()

    def stop(self):
        self.running = False

    def _handle_task(self, task):
        import agent # lazy import
        agent.local_data.action_id = task.get("action_id")
        logger.info(f"Executing task: {task.get('task_type')}")
        status, msg = self.execute_task_cb(task)
        try:
            requests.post(
                f"{self.server_url}/api/agent/{self.machine_id}/tasks/{task['id']}/result",
                json={"status": status, "result_message": msg},
                headers=self.headers
            )
        except Exception as e:
            logger.error(f"Failed to post task result: {e}")
        agent.local_data.action_id = None

class StandardPollingListener(BaseListener):
    def start(self):
        while self.running:
            try:
                resp = requests.get(f"{self.server_url}/api/agent/{self.machine_id}/tasks", headers=self.headers)
                tasks = resp.json()
                for task in tasks:
                    self._handle_task(task)
            except Exception as e:
                logger.error(f"Polling error: {e}")
            time.sleep(5)

class LongPollingListener(BaseListener):
    def start(self):
        while self.running:
            try:
                resp = requests.get(f"{self.server_url}/api/agent/{self.machine_id}/tasks?timeout=30", headers=self.headers, timeout=35)
                tasks = resp.json()
                for task in tasks:
                    self._handle_task(task)
            except requests.exceptions.ReadTimeout:
                pass # Normal for long polling
            except Exception as e:
                logger.error(f"Long polling error: {e}")
                time.sleep(5)

class SSEListener(BaseListener):
    def start(self):
        # We still do an initial poll to catch up on any missed events while starting
        try:
            resp = requests.get(f"{self.server_url}/api/agent/{self.machine_id}/tasks", headers=self.headers)
            tasks = resp.json()
            for task in tasks:
                self._handle_task(task)
        except:
            pass

        while self.running:
            try:
                response = requests.get(f"{self.server_url}/api/agent/{self.machine_id}/tasks/stream", stream=True, headers=self.headers)
                client = sseclient.SSEClient(response)
                for event in client.events():
                    if not self.running:
                        break
                    if event.event == 'new_task':
                        task = json.loads(event.data)
                        self._handle_task(task)
            except Exception as e:
                logger.error(f"SSE error: {e}. Reconnecting in 5 seconds...")
                time.sleep(5)

class AMQPListener(BaseListener):
    def __init__(self, amqp_url, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.amqp_url = amqp_url
        self.connection = None
        self.channel = None

    def start(self):
        while self.running:
            try:
                self.connection = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
                self.channel = self.connection.channel()

                # We declare an exchange for task distributions
                exchange_name = 'hcms_tasks'
                self.channel.exchange_declare(exchange=exchange_name, exchange_type='direct')

                # Create a queue specific to this machine
                queue_name = f'machine_{self.machine_id}_tasks'
                self.channel.queue_declare(queue=queue_name, durable=True)
                self.channel.queue_bind(exchange=exchange_name, queue=queue_name, routing_key=str(self.machine_id))

                self.channel.basic_qos(prefetch_count=1)
                self.channel.basic_consume(queue=queue_name, on_message_callback=self._callback)

                logger.info("AMQP Listener started and waiting for messages.")
                self.channel.start_consuming()
            except pika.exceptions.AMQPConnectionError as e:
                logger.error(f"AMQP Connection Error: {e}. Retrying in 5 seconds...")
                time.sleep(5)
            except Exception as e:
                logger.error(f"AMQP Error: {e}. Retrying in 5 seconds...")
                time.sleep(5)

    def _callback(self, ch, method, properties, body):
        try:
            task = json.loads(body)
            self._handle_task(task)
        except Exception as e:
            logger.error(f"Error handling AMQP task: {e}")
        finally:
            ch.basic_ack(delivery_tag=method.delivery_tag)

    def stop(self):
        super().stop()
        if self.connection and not self.connection.is_closed:
            self.connection.close()
