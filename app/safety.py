import re
from typing import Dict, Any, Tuple

# Patterns for high-risk / destructive commands
DANGEROUS_PATTERNS = [
    # Destructive file removal
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b", "High-risk recursive force deletion ('rm -rf')"),
    (r"\brmdir\s+/[sS]\b", "Recursive directory deletion ('rmdir /s')"),
    (r"\bdel\s+/[fF]\b", "Force deletion of files ('del /f')"),
    (r"\bdel\s+/[sS]\b", "Recursive deletion of files ('del /s')"),
    (r"\bdel\s+\*\b", "Wildcard file deletion ('del *')"),
    (r"\bRemove-Item\s+.*-Recurse\b", "PowerShell recursive deletion ('Remove-Item -Recurse')"),
    (r"\bRemove-Item\s+.*-Force\b", "PowerShell forced deletion ('Remove-Item -Force')"),
    
    # Destructive disk / formatting
    (r"\bformat\s+[a-zA-Z]:", "Disk formatting command ('format')"),
    (r"\bdd\s+if=", "Low-level raw block copy / overwrite ('dd')"),
    (r"\bmkfs\b", "Filesystem re-creation ('mkfs')"),

    # Destructive git operations
    (r"\bgit\s+reset\s+--hard\b", "Destructive git state reset ('git reset --hard')"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f\b", "Uncommitted untracked file deletion ('git clean -f')"),
    (r"\bgit\s+push\s+.*--force\b", "Forced remote repository overwrite ('git push --force')"),

    # Database drops
    (r"\bDROP\s+DATABASE\b", "Destructive SQL database drop ('DROP DATABASE')"),
    (r"\bDROP\s+TABLE\b", "Destructive SQL table drop ('DROP TABLE')"),
    (r"\bTRUNCATE\s+TABLE\b", "Table truncation ('TRUNCATE TABLE')"),

    # System / Process termination
    (r"\bkill\s+-9\b", "Force kill process ('kill -9')"),
    (r"\bStop-Process\s+.*-Force\b", "PowerShell force terminate process ('Stop-Process -Force')"),
    (r"\btaskkill\s+.*\/f\b", "Force kill task ('taskkill /f')"),
    (r"\bshutdown\b", "System shutdown command"),
    (r"\breboot\b", "System reboot command"),

    # Security policy changes
    (r"\bSet-ExecutionPolicy\s+Unrestricted\b", "Disabling PowerShell security execution policy"),
    (r"\bchmod\s+777\b", "Insecure global permission change ('chmod 777')"),

    # Suspicious exfiltration / pipe to shell
    (r"curl\s+.*\|\s*(?:bash|sh|powershell|iex)", "Piping remote script directly to shell"),
    (r"wget\s+.*\|\s*(?:bash|sh|powershell|iex)", "Piping remote script directly to shell"),
    (r"Invoke-Expression\s*\(.*Invoke-WebRequest", "PowerShell remote code execution ('Invoke-Expression')"),
]

def check_command_safety(command: str) -> Tuple[bool, str]:
    """
    Evaluates a shell command against security guardrails.
    Returns (is_dangerous: bool, risk_reason: str).
    """
    clean_cmd = command.strip()
    for pattern, description in DANGEROUS_PATTERNS:
        if re.search(pattern, clean_cmd, re.IGNORECASE):
            return True, description

    return False, ""
