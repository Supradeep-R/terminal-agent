import os
import json
import uuid
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from sqlmodel import Session, select

from app.db import engine
from app.models import AgentSession, AgentStep
from app.sandbox import execute_command
from app.runner_manager import runner_manager
from app.safety import check_command_safety
from app.dev_tools import view_file_content, edit_file_content, grep_search_content
from app.llm.base import BaseLLMProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.router import LLMRouter

load_dotenv()

def get_configured_router() -> LLMRouter:
    providers: List[BaseLLMProvider] = []

    # 1. Primary: Google Gemini
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        providers.append(GeminiProvider(api_key=gemini_key, model_name="gemini-3.6-flash"))

    # 2. Fallback 1: Groq Cloud
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        providers.append(OpenAICompatibleProvider(
            name="Groq",
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_key,
            model_name="qwen/qwen3.8-27b"
        ))

    # 3. Fallback 2: OpenRouter
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if openrouter_key:
        providers.append(OpenAICompatibleProvider(
            name="OpenRouter",
            base_url="https://openrouter.ai/api/v1",
            api_key=openrouter_key,
            model_name="meta-llama/llama-3.3-70b-instruct:free"
        ))

    if not providers:
        raise ValueError("No valid LLM API keys found in .env!")

    return LLMRouter(providers)

TOOLS_SCHEMA = [
    {
        "name": "run_terminal_command",
        "description": "Executes a shell command in the terminal sandbox (tests, package management, git, system commands).",
        "parameters": {
            "type": "object",
            "properties": {
                "thought": {
                    "type": "string",
                    "description": "Your internal step-by-step reasoning: why did you choose this command and what outcome do you expect?"
                },
                "command": {
                    "type": "string",
                    "description": "The exact shell command line to execute (e.g. 'pytest', 'npm test', 'dir')."
                }
            },
            "required": ["command", "thought"]
        }
    },
    {
        "name": "view_file",
        "description": "Inspects the content of a file with line numbers. Use this before editing to inspect exact syntax and lines.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative or absolute path of the file to read."
                },
                "start_line": {
                    "type": "integer",
                    "description": "Optional starting line number (1-indexed)."
                },
                "end_line": {
                    "type": "integer",
                    "description": "Optional ending line number (inclusive)."
                },
                "thought": {
                    "type": "string",
                    "description": "Why you need to inspect this file and what you are looking for."
                }
            },
            "required": ["path", "thought"]
        }
    },
    {
        "name": "edit_file",
        "description": "Surgically replaces a unique code snippet with new code in a file and generates a visual Unified Diff. Always view the file first to copy the exact target snippet.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to modify."
                },
                "target_string": {
                    "type": "string",
                    "description": "The exact existing code snippet to be replaced (including exact indentation and whitespace)."
                },
                "replacement_string": {
                    "type": "string",
                    "description": "The new replacement code snippet."
                },
                "thought": {
                    "type": "string",
                    "description": "Explanation of the code change and why it resolves the goal."
                }
            },
            "required": ["path", "target_string", "replacement_string", "thought"]
        }
    },
    {
        "name": "grep_search",
        "description": "Fast recursive search for keywords, functions, or imports across files in a directory.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The text, function name, or keyword to search for."
                },
                "path": {
                    "type": "string",
                    "description": "Directory path to search in (defaults to '.')."
                },
                "thought": {
                    "type": "string",
                    "description": "Why you are searching for this term."
                }
            },
            "required": ["query", "thought"]
        }
    }
]

SYSTEM_INSTRUCTION = (
    "You are an elite Autonomous AI Coding & Terminal Agent. "
    "Your job is to achieve the user's goal by combining structured developer tools and terminal commands.\n\n"
    "TOOL USAGE BEST PRACTICES:\n"
    "1. To read files: use 'view_file' with line numbers instead of 'cat' or 'type'.\n"
    "2. To modify files: use 'edit_file' with the exact target snippet and replacement snippet. This produces clean unified diffs. Always view the file first!\n"
    "3. To find code: use 'grep_search' across the directory.\n"
    "4. To run tests, build, or check environment: use 'run_terminal_command'.\n"
    "5. In every tool call, always provide clear reasoning in 'thought'.\n"
    "6. When the goal is completed, provide a concise final summary without calling any more tools.\n"
    "7. STRICT NON-INTERACTIVE COMMANDS: Never execute interactive commands or commands that prompt for human input. In PowerShell, ALWAYS separate multiple statements with semicolons ';' (e.g. '$folder = ...; Set-Content ...'). For cmdlets like Join-Path, always supply both -Path and -ChildPath explicitly (e.g. Join-Path -Path $folder -ChildPath 'file.txt') so it never pauses to ask for input."
)

# Set of sessions requested to stop immediately
cancelled_sessions: set = set()

def cancel_session(session_id: uuid.UUID):
    cancelled_sessions.add(str(session_id))
    with Session(engine) as db:
        session_item = db.get(AgentSession, session_id)
        if session_item:
            session_item.status = "stopped"
            db.add(session_item)
            db.commit()
            user_id = session_item.user_id or "guest"
            runner_manager.cancel_execution(user_id)
            print(f"[Agent] Session {session_id} marked as stopped by user.")


def build_conversation_history(db: Session, session_item: AgentSession, follow_up_prompt: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Reconstructs the multi-turn conversation history from the database so the agent
    retains full memory across follow-up prompts.
    """
    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": session_item.goal}
    ]

    # Query all past steps for this session in order
    statement = select(AgentStep).where(AgentStep.session_id == session_item.id).order_by(AgentStep.step_number.asc())
    past_steps = db.exec(statement).all()

    for step in past_steps:
        if step.command == "user_prompt":
            messages.append({
                "role": "user",
                "content": step.output or ""
            })
        elif step.command == "response":
            messages.append({
                "role": "assistant",
                "content": step.output or ""
            })
        else:
            messages.append({
                "role": "assistant",
                "content": f"Executed: {step.command}"
            })
            messages.append({
                "role": "user",
                "content": f"Terminal Output:\n{step.output}"
            })

    # If this is a follow-up turn in the ongoing chat and not already in past_steps
    if follow_up_prompt and follow_up_prompt.strip() and not any(s.command == "user_prompt" and s.output == follow_up_prompt.strip() for s in past_steps):
        messages.append({
            "role": "user",
            "content": follow_up_prompt.strip()
        })

    return messages


def run_agent_loop(session_id: uuid.UUID, follow_up_prompt: Optional[str] = None, max_steps: int = 10):
    router = get_configured_router()

    with Session(engine) as db:
        session_item = db.get(AgentSession, session_id)
        if not session_item:
            return

        session_item.status = "running"
        db.add(session_item)
        db.commit()

        # Determine starting step number first
        statement = select(AgentStep).where(AgentStep.session_id == session_id).order_by(AgentStep.step_number.desc())
        last_step = db.exec(statement).first()
        current_step_number = last_step.step_number if last_step else 0

        # If this is a follow-up prompt, ensure it's recorded if not already saved
        if follow_up_prompt and follow_up_prompt.strip():
            if not last_step or last_step.command != "user_prompt" or last_step.output != follow_up_prompt.strip():
                current_step_number += 1
                user_step = AgentStep(
                    session_id=session_id,
                    step_number=current_step_number,
                    thought="User Follow-up",
                    command="user_prompt",
                    output=follow_up_prompt.strip()
                )
                db.add(user_step)
                db.commit()

        # Reconstruct full multi-turn history from DB
        messages = build_conversation_history(db, session_item, follow_up_prompt)

        # Check if user has an active Local Runner connected
        user_id = session_item.user_id or "guest"
        has_local_runner = runner_manager.is_connected(user_id)
        runner_info = runner_manager.get_info(user_id) if has_local_runner else None

        # Tailor system instruction to the actual active execution environment
        if has_local_runner:
            platform_desc = runner_info.get("platform", "Local OS") if runner_info else "Local OS"
            working_dir = runner_info.get("cwd", "") if runner_info else ""
            env_instruction = (
                f"\n\nCURRENT EXECUTION ENVIRONMENT: You are connected directly to the user's local machine ({platform_desc}) via the Local Runner bridge. "
                f"The current local working directory is '{working_dir}'. "
                "You have full permission and access to local files, folders, and PowerShell/Bash terminal commands."
            )
            env_label = "Local Machine"
        else:
            env_instruction = (
                "\n\nCURRENT EXECUTION ENVIRONMENT: You are currently running inside an isolated cloud Linux container sandbox. "
                "CRITICAL: This cloud sandbox CANNOT access the user's personal laptop files or Windows drive paths (such as 'C:\\Users\\...'). "
                "If the user asks to inspect or modify their local computer files, explain that they are in Cloud Sandbox mode and need to connect their Local Runner using the button in the UI."
            )
            env_label = "Cloud Sandbox"

        dynamic_system_prompt = SYSTEM_INSTRUCTION + env_instruction

        steps_in_this_turn = 0

        try:
            while steps_in_this_turn < max_steps:
                # Check for user cancellation before LLM inference
                if str(session_id) in cancelled_sessions:
                    print(f"[Agent] Session {session_id} stopped by user before LLM call.")
                    session_item.status = "stopped"
                    db.add(session_item)
                    db.commit()
                    cancelled_sessions.discard(str(session_id))
                    return

                llm_response = router.generate(
                    messages=messages,
                    system_instruction=dynamic_system_prompt,
                    tools=TOOLS_SCHEMA
                )

                routing_trace_json = json.dumps(llm_response.routing_trace) if getattr(llm_response, "routing_trace", None) else None
                model_identifier = f"{llm_response.provider_name} ({llm_response.model_name}) • {env_label}"

                # Case 1: No tool calls -> Agent finished this turn
                if not llm_response.tool_calls:
                    print(f"[Agent] Turn Complete. Final Answer: {llm_response.text}")
                    if llm_response.text:
                        current_step_number += 1
                        step_record = AgentStep(
                            session_id=session_id,
                            step_number=current_step_number,
                            thought="Synthesized final summary and verified goal accomplishment.",
                            command="response",
                            output=llm_response.text,
                            model_name=model_identifier,
                            routing_trace=routing_trace_json
                        )
                        db.add(step_record)
                        db.commit()
                    break

                # Case 2: Agent requested tool calls
                for tool_call in llm_response.tool_calls:
                    # Check for user cancellation before tool execution
                    if str(session_id) in cancelled_sessions:
                        print(f"[Agent] Session {session_id} stopped by user before tool call.")
                        session_item.status = "stopped"
                        db.add(session_item)
                        db.commit()
                        cancelled_sessions.discard(str(session_id))
                        return

                    tool_name = tool_call.name
                    thought_content = tool_call.args.get("thought") or (llm_response.text.strip() if llm_response.text else None) or "Executing tool to progress toward goal."

                    # 1. Determine command string & check safety
                    if tool_name == "run_terminal_command":
                        command_to_run = tool_call.args.get("command", "")
                        is_dangerous, risk_reason = check_command_safety(command_to_run)

                        if is_dangerous:
                            print(f"[Security Guardrail] Intercepted dangerous command: {command_to_run} ({risk_reason})")
                            session_item.status = "awaiting_approval"
                            session_item.pending_command = command_to_run
                            session_item.pending_thought = thought_content
                            session_item.pending_risk = risk_reason
                            db.add(session_item)
                            db.commit()
                            return  # Pause loop and wait for human decision

                        step_command = command_to_run

                    elif tool_name == "view_file":
                        file_path = tool_call.args.get("path", "")
                        s_line = tool_call.args.get("start_line")
                        e_line = tool_call.args.get("end_line")
                        step_command = f"view_file {file_path}"
                        if s_line or e_line:
                            step_command += f" ({s_line or 1}-{e_line or 'end'})"

                    elif tool_name == "edit_file":
                        file_path = tool_call.args.get("path", "")
                        step_command = f"edit_file {file_path}"

                    elif tool_name == "grep_search":
                        query = tool_call.args.get("query", "")
                        search_path = tool_call.args.get("path", ".")
                        step_command = f"grep_search '{query}' in {search_path}"

                    else:
                        step_command = f"tool {tool_name}"

                    steps_in_this_turn += 1
                    current_step_number += 1

                    # ⚡ LIVE SIMULTANEOUS DISPLAY: Save step immediately with output=None
                    # This allows the frontend to show the thought, tool name, and command actively executing!
                    step_record = AgentStep(
                        session_id=session_id,
                        step_number=current_step_number,
                        thought=thought_content,
                        command=step_command,
                        output=None,
                        model_name=model_identifier,
                        routing_trace=routing_trace_json
                    )
                    db.add(step_record)
                    db.commit()
                    db.refresh(step_record)

                    # Now execute the tool
                    if tool_name == "run_terminal_command":
                        print(f"[Agent] Step {current_step_number} [{env_label}]: Executing -> {command_to_run}")
                        if has_local_runner:
                            output, exit_code = runner_manager.execute_remote(user_id, command_to_run)
                        else:
                            output, exit_code = execute_command(command_to_run)

                    elif tool_name == "view_file":
                        print(f"[Agent] Step {current_step_number} [{env_label}]: Viewing file -> {file_path}")
                        if has_local_runner:
                            output, exit_code = runner_manager.execute_remote_tool(user_id, "view_file", {"path": file_path, "start_line": s_line, "end_line": e_line})
                        else:
                            output, exit_code = view_file_content(file_path, s_line, e_line)

                    elif tool_name == "edit_file":
                        target = tool_call.args.get("target_string", "")
                        replacement = tool_call.args.get("replacement_string", "")
                        print(f"[Agent] Step {current_step_number} [{env_label}]: Editing file -> {file_path}")
                        if has_local_runner:
                            output, exit_code = runner_manager.execute_remote_tool(user_id, "edit_file", {"path": file_path, "target_string": target, "replacement_string": replacement})
                        else:
                            output, exit_code = edit_file_content(file_path, target, replacement)

                    elif tool_name == "grep_search":
                        print(f"[Agent] Step {current_step_number} [{env_label}]: Searching -> '{query}'")
                        if has_local_runner:
                            output, exit_code = runner_manager.execute_remote_tool(user_id, "grep", {"query": query, "path": search_path})
                        else:
                            output, exit_code = grep_search_content(query, search_path)

                    else:
                        output, exit_code = f"Unknown tool: {tool_name}", 1

                    # Update step record with the final output once execution finishes
                    step_record.output = output
                    db.add(step_record)
                    db.commit()

                    # Feed output back into message context for next loop
                    messages.append({
                        "role": "assistant",
                        "content": f"I executed: {step_command}"
                    })
                    messages.append({
                        "role": "user",
                        "content": f"Tool Output [Exit Code {exit_code}]:\n{output}"
                    })

            if session_item.status not in ["stopped", "awaiting_approval"]:
                session_item.status = "completed"
                db.add(session_item)
                db.commit()

        except Exception as e:
            print(f"[Agent Error] {e}")
            session_item.status = "failed"
            db.add(session_item)
            db.commit()


def handle_approval_decision(session_id: uuid.UUID, decision: str, feedback: Optional[str] = None):
    """
    Called when human approves or rejects an intercepted dangerous command.
    If approved: executes the command and resumes autonomous agent loop.
    If rejected: feeds rejection feedback into agent context and prompts agent to safely re-plan.
    """
    with Session(engine) as db:
        session_item = db.get(AgentSession, session_id)
        if not session_item or session_item.status != "awaiting_approval":
            return

        cmd = session_item.pending_command or ""
        thought = session_item.pending_thought or ""
        user_id = session_item.user_id or "guest"
        has_local_runner = runner_manager.is_connected(user_id)

        # Clear pending state
        session_item.pending_command = None
        session_item.pending_thought = None
        session_item.pending_risk = None
        session_item.status = "running"
        db.add(session_item)
        db.commit()

        # Determine next step number
        statement = select(AgentStep).where(AgentStep.session_id == session_id).order_by(AgentStep.step_number.desc())
        last_step = db.exec(statement).first()
        next_step_num = (last_step.step_number + 1) if last_step else 1

        if decision == "approve":
            print(f"[HITL Approved] Executing approved command: {cmd}")
            if has_local_runner:
                output, exit_code = runner_manager.execute_remote(user_id, cmd)
                env_label = "Local Machine"
            else:
                output, exit_code = execute_command(cmd)
                env_label = "Server Sandbox"

            step_record = AgentStep(
                session_id=session_id,
                step_number=next_step_num,
                thought=f"[Human Approved] {thought}",
                command=cmd,
                output=output,
                model_name=f"Human-in-the-Loop Approved • {env_label}"
            )
            db.add(step_record)
            db.commit()

            # Resume agent loop to continue following turns
            run_agent_loop(session_id)

        else:  # Reject
            print(f"[HITL Rejected] Command rejected: {cmd}")
            rejection_msg = feedback.strip() if feedback and feedback.strip() else "Execution denied by user. Please propose a safer alternative or proceed without running this destructive command."
            step_record = AgentStep(
                session_id=session_id,
                step_number=next_step_num,
                thought="Destructive command rejected by human reviewer.",
                command=f"blocked: {cmd}",
                output=f"[Permission Denied by User]: {rejection_msg}",
                model_name="Human-in-the-Loop Guardrail"
            )
            db.add(step_record)
            db.commit()

            # Resume agent loop with rejection feedback so agent re-plans safely
            run_agent_loop(session_id, follow_up_prompt=f"The command '{cmd}' was REJECTED by the user with note: '{rejection_msg}'. Please adapt your plan safely.")
