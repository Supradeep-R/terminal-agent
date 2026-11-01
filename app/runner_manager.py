import asyncio
import uuid
import json
from typing import Dict, Any, Tuple, Optional
from fastapi import WebSocket

class RunnerManager:
    def __init__(self):
        # Map user_id -> WebSocket
        self.active_runners: Dict[str, WebSocket] = {}
        # Map user_id -> runner metadata (hostname, os, shell, connected_at)
        self.runner_info: Dict[str, Dict[str, Any]] = {}
        # Map request_id -> asyncio.Future
        self.pending_requests: Dict[str, asyncio.Future] = {}
        # Reference to main event loop
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def register(self, user_id: str, websocket: WebSocket, metadata: Dict[str, Any]):
        self.active_runners[user_id] = websocket
        self.runner_info[user_id] = metadata
        print(f"[RunnerManager] Registered local runner for user: {user_id} ({metadata.get('platform', 'unknown')})")

    def unregister(self, user_id: str):
        if user_id in self.active_runners:
            del self.active_runners[user_id]
        if user_id in self.runner_info:
            del self.runner_info[user_id]
        print(f"[RunnerManager] Unregistered local runner for user: {user_id}")

    def is_connected(self, user_id: str) -> bool:
        return user_id in self.active_runners

    def get_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self.runner_info.get(user_id)

    def handle_message(self, message_data: dict):
        """Called when runner sends a message back over WebSocket."""
        msg_type = message_data.get("type")
        if msg_type == "exec_result":
            req_id = message_data.get("request_id")
            if req_id and req_id in self.pending_requests:
                fut = self.pending_requests[req_id]
                if not fut.done():
                    fut.set_result({
                        "output": message_data.get("output", ""),
                        "exit_code": message_data.get("exit_code", 0)
                    })

    async def _send_exec_async(self, user_id: str, command: str, timeout: int = 45) -> Tuple[str, int]:
        websocket = self.active_runners.get(user_id)
        if not websocket:
            return f"[Runner Error] Local runner disconnected for user {user_id}", -1

        req_id = str(uuid.uuid4())
        fut = asyncio.get_running_loop().create_future()
        self.pending_requests[req_id] = fut

        payload = {
            "type": "exec",
            "request_id": req_id,
            "command": command,
            "timeout": timeout
        }

        try:
            await websocket.send_text(json.dumps(payload))
            result = await asyncio.wait_for(fut, timeout=timeout + 5)
            return result["output"], result["exit_code"]
        except asyncio.TimeoutError:
            return f"[Runner Error] Command timed out after {timeout}s on local machine.", -1
        except Exception as e:
            return f"[Runner Error] Communication error with local runner: {e}", -1
        finally:
            self.pending_requests.pop(req_id, None)

    def execute_remote(self, user_id: str, command: str, timeout: int = 45) -> Tuple[str, int]:
        """
        Synchronous entrypoint called from the agent background thread.
        Dispatches async WebSocket request on the main event loop and waits for response.
        """
        if not self.is_connected(user_id):
            return f"[Runner Error] No local runner connected for user {user_id}", -1

        if not self.loop or self.loop.is_closed():
            return "[Runner Error] Main server event loop not available", -1

        coro = self._send_exec_async(user_id, command, timeout=timeout)
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            return future.result(timeout=timeout + 10)
        except Exception as e:
            return f"[Runner Error] Failed waiting for local runner execution: {e}", -1

# Global singleton
runner_manager = RunnerManager()
