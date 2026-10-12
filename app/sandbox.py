import subprocess
from typing import Tuple

def execute_command(command:str, timeout_seconds:int=30) -> Tuple[str,int]:

    try:
        result = subprocess.run(
            command,
            shell=True,
            text=True,
            capture_output=True,
            timeout=timeout_seconds
        )
        output = result.stdout+result.stderr
        exitcode= result.returncode
        return output,exitcode

    except subprocess.TimeoutExpired as e:
        stdout_so_far = e.stdout if e.stdout else ""
        stderr_so_far = e.stderr if e.stderr else ""
        output = stdout_so_far+stderr_so_far
        output += f"\n[Error: Timout exception: {str(e)}]"
        exitcode = -1
        return output, exitcode

    except Exception as e:
        return f"[System Error:{str(e)}]", -1