import subprocess
import os
from typing import Tuple

def execute_command(command: str, timeout_seconds: int = 30) -> Tuple[str, int]:
    try:
        clean_cmd = command.strip()
        # On Windows, use PowerShell so cmdlets (like Get-ChildItem) and standard commands work
        if os.name == 'nt':
            if clean_cmd.lower().startswith("powershell -command "):
                clean_cmd = clean_cmd[len("powershell -command "):].strip()
                if (clean_cmd.startswith('"') and clean_cmd.endswith('"')) or (clean_cmd.startswith("'") and clean_cmd.endswith("'")):
                    clean_cmd = clean_cmd[1:-1]
            elif clean_cmd.lower().startswith("powershell "):
                clean_cmd = clean_cmd[len("powershell "):].strip()

            args = ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", clean_cmd]
            result = subprocess.run(
                args,
                text=True,
                capture_output=True,
                stdin=subprocess.DEVNULL,
                timeout=timeout_seconds
            )
        else:
            result = subprocess.run(
                command,
                shell=True,
                text=True,
                capture_output=True,
                stdin=subprocess.DEVNULL,
                timeout=timeout_seconds
            )

        output = result.stdout + result.stderr
        exitcode = result.returncode
        return output, exitcode

    except subprocess.TimeoutExpired as e:
        stdout_so_far = e.stdout if e.stdout else ""
        stderr_so_far = e.stderr if e.stderr else ""
        output = stdout_so_far + stderr_so_far
        output += f"\n[Error: Timeout exception after {timeout_seconds}s: {str(e)}]"
        exitcode = -1
        return output, exitcode

    except Exception as e:
        return f"[System Error: {str(e)}]", -1
