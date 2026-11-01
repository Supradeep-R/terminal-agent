"""
Terminal Agent - Local Runner Daemon
Connects your local machine (Windows/Mac/Linux) to the deployed Terminal Agent control plane.
This allows the cloud AI agent to run commands directly on your local terminal safely.
"""

import sys
import os
import time
import json
import socket
import platform
import argparse
import subprocess

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Auto-install websockets if missing
try:
    import websockets
    import asyncio
except ImportError:
    print("[Local Runner] 'websockets' library not found. Installing automatically...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
    import websockets
    import asyncio


def execute_local_command(command: str, timeout: int = 45):
    """Executes a command on the local OS and returns stdout/stderr and exit code."""
    try:
        if os.name == "nt":
            # Windows: Run in PowerShell
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
                capture_output=True,
                text=True,
                timeout=timeout
            )
        else:
            # Unix / macOS: Run in bash
            proc = subprocess.run(
                ["/bin/bash", "-c", command],
                capture_output=True,
                text=True,
                timeout=timeout
            )
        output = proc.stdout + proc.stderr
        return output.strip(), proc.returncode
    except subprocess.TimeoutExpired:
        return f"[Error] Command timed out after {timeout} seconds.", -1
    except Exception as e:
        return f"[Error] Execution failed: {e}", -1


async def run_daemon(server_url: str, user_id: str):
    # Normalize server URL to ws:// or wss://
    clean_url = server_url.rstrip("/")
    if clean_url.startswith("https://"):
        ws_url = clean_url.replace("https://", "wss://") + f"/ws/runner/{user_id}"
    elif clean_url.startswith("http://"):
        ws_url = clean_url.replace("http://", "ws://") + f"/ws/runner/{user_id}"
    elif clean_url.startswith("wss://") or clean_url.startswith("ws://"):
        ws_url = clean_url + f"/ws/runner/{user_id}"
    else:
        ws_url = f"wss://{clean_url}/ws/runner/{user_id}"

    banner = r"""
  _____                   _             _      _                    _   
 |_   _|__ _ __ _ __ ___ (_)_ __   __ _| |    / \   __ _  ___ _ __ | |_ 
   | |/ _ \ '__| '_ ` _ \| | '_ \ / _` | |   / _ \ / _` |/ _ \ '_ \| __|
   | |  __/ |  | | | | | | | | | | (_| | |  / ___ \ (_| |  __/ | | | |_ 
   |_|\___|_|  |_| |_| |_|_|_| |_|\__,_|_| /_/   \_\__, |\___|_| |_|\__|
                                                   |___/                 
    """
    print(banner)
    print("=" * 65)
    print(f"  Local Runner Daemon (v1.0)")
    print(f"  User / Guest ID : {user_id}")
    print(f"  Target Server   : {server_url}")
    print(f"  Local Platform  : {platform.system()} ({platform.release()})")
    print(f"  Local WorkingDir: {os.getcwd()}")
    print("=" * 65)

    backoff = 2
    while True:
        try:
            print(f"\n[Connecting] Establishing secure WebSocket bridge to: {ws_url}...")
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20) as ws:
                # 1. Handshake registration
                handshake = {
                    "type": "register",
                    "user_id": user_id,
                    "platform": platform.platform(),
                    "os": os.name,
                    "hostname": socket.gethostname(),
                    "cwd": os.getcwd()
                }
                await ws.send(json.dumps(handshake))
                print("[+] [CONNECTED] Local Runner is LIVE! Waiting for AI instructions...\n")
                backoff = 2

                # 2. Main command listener loop
                async for message in ws:
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type")

                        if msg_type == "exec":
                            req_id = data.get("request_id")
                            cmd = data.get("command", "")
                            timeout = data.get("timeout", 45)

                            print(f"\n>>> [COMMAND RECEIVED] > {cmd}")
                            start_time = time.time()

                            # Run command locally
                            output, exit_code = execute_local_command(cmd, timeout=timeout)
                            elapsed = time.time() - start_time

                            status_str = f"Exit {exit_code}" if exit_code == 0 else f"Failed ({exit_code})"
                            print(f"<<< [COMPLETED in {elapsed:.2f}s] {status_str}")
                            if output:
                                print(f"--- Output preview (first 100 chars) ---\n{output[:100]}...\n---------------------------------------")

                            # Send response back to cloud agent
                            response = {
                                "type": "exec_result",
                                "request_id": req_id,
                                "output": output,
                                "exit_code": exit_code
                            }
                            await ws.send(json.dumps(response))

                    except Exception as e:
                        print(f"[!] [Error processing message] {e}")

        except (websockets.exceptions.ConnectionClosed, websockets.exceptions.WebSocketException) as e:
            print(f"[-] [DISCONNECTED] Connection dropped ({e}). Reconnecting in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
        except Exception as e:
            print(f"[!] [CONNECTION ERROR] {e}. Retrying in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


def main():
    parser = argparse.ArgumentParser(description="Terminal Agent - Local Runner Daemon")
    parser.add_argument("--token", "-t", help="Your User ID or Guest ID from the web interface")
    parser.add_argument("--server", "-s", default="http://127.0.0.1:8000", help="URL of the Terminal Agent server (e.g. https://your-app.onrender.com)")
    args = parser.parse_args()

    token = args.token
    if not token:
        print("\n[Setup] No token specified.")
        token = input("Enter your User ID or Guest ID from the top/sidebar of the web UI: ").strip()

    if not token:
        print("[Error] User ID / Token is required to route commands to your machine.")
        sys.exit(1)

    asyncio.run(run_daemon(args.server, token))


if __name__ == "__main__":
    main()
