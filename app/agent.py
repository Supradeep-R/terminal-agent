import os
import uuid
from dotenv import load_dotenv
from sqlmodel import Session
from google import genai
from google.genai import types

from app.db import engine
from app.models import AgentSession, AgentStep
from app.sandbox import execute_command

load_dotenv()

# Initialize Gemini Client
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY environment variable is not set!")

client = genai.Client(api_key=api_key)

# 1. Define the Tool function that Gemini can call
def run_terminal_command(command: str) -> str:
    """
    Executes a shell command in the terminal sandbox and returns the combined stdout and stderr output.
    
    Args:
        command: The exact shell command string to execute (e.g., 'dir', 'python main.py', 'pip list').
    """
    output, exit_code = execute_command(command)
    return f"[Exit Code: {exit_code}]\n{output}"


# 2. The Core Autonomous Agent Loop
def run_agent_loop(session_id: uuid.UUID, max_steps: int = 10):
    with Session(engine) as db:
        session_item = db.get(AgentSession, session_id)
        if not session_item:
            return

        # Mark session as running
        session_item.status = "running"
        db.add(session_item)
        db.commit()

        # System prompt configuring agent behavior
        system_instruction = (
            "You are an autonomous Terminal AI Agent running on Windows PowerShell. "
            "Your job is to achieve the user's goal by executing terminal commands using the 'run_terminal_command' tool. "
            "Carefully inspect the terminal output after every command before deciding your next move. "
            "When the goal is fully achieved, provide a concise summary of what was accomplished without calling any more tools."
        )

        try:
            # Create a multi-turn chat session with Gemini
            chat = client.chats.create(
                model="gemini-3.6-flash",
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=[run_terminal_command],
                    temperature=0.2, # Low temperature for more deterministic, focused commands
                )
            )

            # Send the initial goal
            response = chat.send_message(session_item.goal)
            step_count = 0

            # The Agent Loop: runs until Gemini stops requesting tool calls
            while step_count < max_steps:
                # Check if the model wants to call a tool
                if not response.function_calls:
                    # No tool calls means Gemini is finished and gave its final answer
                    break

                for call in response.function_calls:
                    step_count += 1
                    command_to_run = call.args.get("command", "")
                    
                    # Execute the command in our sandbox
                    terminal_result, exit_code = execute_command(command_to_run)

                    # Persist this step in Supabase
                    step_record = AgentStep(
                        session_id=session_id,
                        step_number=step_count,
                        thought=f"Executing tool: {call.name}",
                        command=command_to_run,
                        output=terminal_result
                    )
                    db.add(step_record)
                    db.commit()

                    print(response)
                    print(session_id+"Command given"+command_to_run)

                    # Send the terminal execution result back to Gemini
                    response = chat.send_message(
                        types.Part.from_function_response(
                            name=call.name,
                            response={"result": terminal_result}
                        )
                    )

            # Mark session completed
            session_item.status = "completed"
            db.add(session_item)
            db.commit()

        except Exception as e:
            print(f"Error in agent loop: {e}")
            session_item.status = "failed"
            db.add(session_item)
            db.commit()