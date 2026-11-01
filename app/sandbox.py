import subprocess
import os
from typing import Tuple

def execute_command(command: str, timeout_seconds: int = 30) -> Tuple[str, int]:
    try:
        # On Windows, use PowerShell so cmdlets (like Get-ChildItem) and standard commands work
        if os.name == 'nt':
            args = ["powershell", "-NoProfile", "-NonInteractive", "-Command", command]
            result = subprocess.run(
                args,
                text=True,
                capture_output=True,
                timeout=timeout_seconds
            )
        else:
            result = subprocess.run(
                command,
                shell=True,
                text=True,
                capture_output=True,
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
