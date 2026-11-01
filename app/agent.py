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
        "description": "Executes a shell command in the terminal sandbox and returns the stdout and stderr output.",
        "parameters": {
            "type": "object",
            "properties": {
                "thought": {
                    "type": "string",
                    "description": "Your internal step-by-step reasoning: why did you choose this specific command, what did previous outputs tell you, and what specific hypothesis or outcome are you testing?"
                },
                "command": {
                    "type": "string",
                    "description": "The exact shell command line to execute (e.g., 'dir', 'python main.py', 'pip list')."
                }
            },
            "required": ["command", "thought"]
        }
    }
]

SYSTEM_INSTRUCTION = (
    "You are an autonomous Terminal AI Agent running on Windows PowerShell. "
    "Your job is to achieve the user's goal by executing terminal commands using the 'run_terminal_command' tool.\n"
    "Crucial requirements:\n"
    "1. In every tool call, formulate clear, thoughtful reasoning in the 'thought' argument explaining why you are running this command and what you expect to achieve.\n"
    "2. Carefully inspect the terminal output after every command before deciding your next move.\n"
    "3. When the goal is fully achieved, provide a concise summary of what was accomplished without calling any more tools."
)


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
                    steps_in_this_turn += 1
                    current_step_number += 1
                    command_to_run = tool_call.args.get("command", "")
                    thought_content = tool_call.args.get("thought") or (llm_response.text.strip() if llm_response.text else None) or f"Executing '{command_to_run}' to progress toward goal."

                    print(f"[Agent] Step {current_step_number} [{env_label}]: Executing -> {command_to_run}")

                    # Route execution to local runner if connected, else cloud sandbox
                    if has_local_runner:
                        output, exit_code = runner_manager.execute_remote(user_id, command_to_run)
                    else:
                        output, exit_code = execute_command(command_to_run)

                    # Save step to database
                    step_record = AgentStep(
                        session_id=session_id,
                        step_number=current_step_number,
                        thought=thought_content,
                        command=command_to_run,
                        output=output,
                        model_name=model_identifier,
                        routing_trace=routing_trace_json
                    )
                    db.add(step_record)
                    db.commit()

                    # Feed output back into message context for next loop
                    messages.append({
                        "role": "assistant",
                        "content": f"I executed: {command_to_run}"
                    })
                    messages.append({
                        "role": "user",
                        "content": f"Terminal Output [Exit Code {exit_code}]:\n{output}"
                    })

            session_item.status = "completed"
            db.add(session_item)
            db.commit()

        except Exception as e:
            print(f"[Agent Error] {e}")
            session_item.status = "failed"
            db.add(session_item)
            db.commit()