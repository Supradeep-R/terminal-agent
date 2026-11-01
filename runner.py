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


# Active process tracker for cancellation and stdin input
active_process = None


def execute_local_command(command: str, timeout: int = 45):
    """Executes a command on the local OS and returns stdout/stderr and exit code."""
    global active_process
    try:
        clean_cmd = command.strip()
        if os.name == "nt":
            # If command has redundant outer 'powershell -Command "..."', unwrap it to avoid nested quoting hang
            if clean_cmd.lower().startswith("powershell -command "):
                clean_cmd = clean_cmd[len("powershell -command "):].strip()
                if (clean_cmd.startswith('"') and clean_cmd.endswith('"')) or (clean_cmd.startswith("'") and clean_cmd.endswith("'")):
                    clean_cmd = clean_cmd[1:-1]
            elif clean_cmd.lower().startswith("powershell "):
                clean_cmd = clean_cmd[len("powershell "):].strip()

            active_process = subprocess.Popen(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", clean_cmd],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                text=True
            )
        else:
            # Unix / macOS: Run in bash
            active_process = subprocess.Popen(
                ["/bin/bash", "-c", command],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                text=True
            )

        stdout, stderr = active_process.communicate(timeout=timeout)
        output = stdout + stderr
        return output.strip(), active_process.returncode

    except subprocess.TimeoutExpired:
        if active_process:
            try:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(active_process.pid)], capture_output=True)
                else:
                    active_process.kill()
            except Exception:
                pass
        return f"[Runner Error] Command timed out after {timeout} seconds on local machine.", -1
    except Exception as e:
        return f"[Error] Execution failed: {e}", -1
    finally:
        active_process = None


def view_file_local(path: str, start_line=None, end_line=None):
    import os
    if not os.path.exists(path):
        return f"[Error] File not found: {path}", 1
    if os.path.isdir(path):
        return f"[Error] Path is a directory: {path}", 1
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        total = len(lines)
        s = max(1, start_line or 1)
        e = min(total, end_line or total)
        out = [f"{i:4d} | {lines[i-1].rstrip()}" for i in range(s, e + 1)]
        return f"--- {path} (Lines {s}-{e} of {total}) ---\n" + "\n".join(out), 0
    except Exception as err:
        return f"[Error reading file] {err}", 1


def edit_file_local(path: str, target_string: str, replacement_string: str):
    import os, difflib
    if not os.path.exists(path):
        return f"[Error] File not found: {path}", 1
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            orig = f.read()
        if target_string not in orig:
            return f"[Error] Target string not found in '{path}'. Please view the file to check indentation.", 1
        new_text = orig.replace(target_string, replacement_string, 1)
        diff = list(difflib.unified_diff(
            orig.splitlines(keepends=True),
            new_text.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            lineterm=""
        ))
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_text)
        return "\n".join(diff) if diff else "(No changes made)", 0
    except Exception as err:
        return f"[Error editing file] {err}", 1


def grep_local(query: str, path: str = "."):
    import os
    if not os.path.exists(path):
        return f"[Error] Path not found: {path}", 1
    results = []
    ignore = {".git", ".venv", "node_modules", "__pycache__", "dist", "build"}
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignore]
        for file in files:
            if file.endswith((".pyc", ".png", ".jpg", ".svg", ".ico", ".woff", ".woff2", ".map")):
                continue
            fp = os.path.join(root, file)
            try:
                with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                    for num, line in enumerate(f, 1):
                        if query.lower() in line.lower():
                            rel = os.path.relpath(fp, path)
                            results.append(f"{rel}:{num}: {line.strip()[:140]}")
                            if len(results) >= 40:
                                results.append("... (reached limit of 40 matches)")
                                return "\n".join(results), 0
            except Exception:
                continue
    return "\n".join(results) if results else f"No matches found for '{query}'.", 0


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

                        req_id = data.get("request_id")

                        # Immediate cancellation of running process
                        if msg_type == "cancel":
                            print("\n🛑 [CANCEL] Stopping active local process by user request...")
                            if active_process:
                                try:
                                    if os.name == "nt":
                                        subprocess.run(["taskkill", "/F", "/T", "/PID", str(active_process.pid)], capture_output=True)
                                    else:
                                        active_process.kill()
                                except Exception as err:
                                    print(f"[Cancel Error] {err}")
                            continue

                        # Standard input delivery from UI to active process
                        if msg_type == "input":
                            inp = data.get("input", "")
                            print(f"\n⌨️ [STDIN INPUT FROM UI] > {inp}")
                            if active_process and active_process.stdin:
                                try:
                                    active_process.stdin.write(inp + "\n")
                                    active_process.stdin.flush()
                                except Exception as err:
                                    print(f"[Stdin Error] {err}")
                            continue

                        if msg_type == "exec":
                            cmd = data.get("command", "")
                            timeout = data.get("timeout", 45)
                            print(f"\n>>> [COMMAND RECEIVED] > {cmd}")
                            start_time = time.time()
                            output, exit_code = execute_local_command(cmd, timeout=timeout)
                            elapsed = time.time() - start_time
                            status_str = f"Exit {exit_code}" if exit_code == 0 else f"Failed ({exit_code})"
                            print(f"<<< [COMPLETED in {elapsed:.2f}s] {status_str}")
                        elif msg_type == "view_file":
                            path = data.get("path", "")
                            print(f"\n>>> [VIEW FILE] > {path}")
                            output, exit_code = view_file_local(path, data.get("start_line"), data.get("end_line"))
                        elif msg_type == "edit_file":
                            path = data.get("path", "")
                            print(f"\n>>> [EDIT FILE (DIFF)] > {path}")
                            output, exit_code = edit_file_local(path, data.get("target_string", ""), data.get("replacement_string", ""))
                        elif msg_type == "grep":
                            query = data.get("query", "")
                            path = data.get("path", ".")
                            print(f"\n>>> [GREP SEARCH] > '{query}' in {path}")
                            output, exit_code = grep_local(query, path)
                        else:
                            output, exit_code = f"[Error] Unknown message type: {msg_type}", 1

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
