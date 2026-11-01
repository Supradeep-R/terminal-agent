import os
import difflib
from typing import Tuple, Optional

def view_file_content(path: str, start_line: Optional[int] = None, end_line: Optional[int] = None) -> Tuple[str, int]:
    """Reads file content safely with line numbers."""
    if not os.path.exists(path):
        return f"[Error] File not found: {path}", 1
    if os.path.isdir(path):
        return f"[Error] Path is a directory, not a file: {path}", 1

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        total_lines = len(lines)
        s_line = max(1, start_line if start_line is not None else 1)
        e_line = min(total_lines, end_line if end_line is not None else total_lines)

        if s_line > total_lines:
            return f"[Info] File has only {total_lines} lines (requested from line {s_line}).", 0

        output_lines = []
        for i in range(s_line, e_line + 1):
            line_str = lines[i - 1].rstrip("\r\n")
            output_lines.append(f"{i:4d} | {line_str}")

        header = f"--- {path} (Lines {s_line}-{e_line} of {total_lines}) ---\n"
        return header + "\n".join(output_lines), 0
    except Exception as e:
        return f"[Error reading file] {e}", 1


def edit_file_content(path: str, target_string: str, replacement_string: str) -> Tuple[str, int]:
    """
    Surgically replaces target_string with replacement_string in path.
    Computes and returns a visual Unified Diff.
    """
    if not os.path.exists(path):
        return f"[Error] File not found: {path}", 1

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            original_content = f.read()

        if target_string not in original_content:
            return f"[Error] Target string not found in '{path}'. Please inspect the file with view_file first to check exact indentation and text.", 1

        # Replace target with replacement
        new_content = original_content.replace(target_string, replacement_string, 1)

        # Generate Unified Diff
        orig_lines = original_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)

        diff = list(difflib.unified_diff(
            orig_lines,
            new_lines,
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            lineterm=""
        ))

        # Write new content back to disk
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)

        diff_str = "\n".join(diff) if diff else "(No changes made)"
        return diff_str, 0
    except Exception as e:
        return f"[Error editing file] {e}", 1


def grep_search_content(query: str, root_dir: str = ".") -> Tuple[str, int]:
    """Recursively searches for query in text files."""
    if not os.path.exists(root_dir):
        return f"[Error] Directory not found: {root_dir}", 1

    results = []
    max_results = 50
    count = 0

    ignore_dirs = {".git", ".venv", "node_modules", "__pycache__", "dist", "build"}

    for root, dirs, files in os.walk(root_dir):
        # Exclude ignored directories
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for file in files:
            file_path = os.path.join(root, file)
            # Skip binary / large bundle files
            if file.endswith((".pyc", ".png", ".jpg", ".svg", ".ico", ".woff", ".woff2", ".map")):
                continue
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line_num, line in enumerate(f, 1):
                        if query.lower() in line.lower():
                            rel_path = os.path.relpath(file_path, root_dir)
                            results.append(f"{rel_path}:{line_num}: {line.strip()[:140]}")
                            count += 1
                            if count >= max_results:
                                results.append(f"... (reached maximum limit of {max_results} matches)")
                                return "\n".join(results), 0
            except Exception:
                continue

    if not results:
        return f"No matches found for '{query}' in '{root_dir}'.", 0

    return "\n".join(results), 0
