# Terminal Agent: Architecture, System Design & Code Guide

A comprehensive, production-grade guide to building an autonomous AI Terminal Agent from scratch using Python, FastAPI, Supabase (PostgreSQL), and Multi-Provider LLM Fallbacks.

---

## 1. System Architecture Overview

A production Terminal Agent is composed of four modular subsystems:

```
[ FastAPI REST / WebSocket API ]
              │
    ┌─────────┴─────────┐
    ▼                   ▼
[ Supabase DB ]   [ LLM Fallback Router ]
(Sessions/Steps)        │
                  ┌─────┴─────┐
                  ▼           ▼
              [ Gemini ]   [ Groq / OpenRouter ]
                  │           │
                  └─────┬─────┘
                        ▼
            [ State-Machine Loop ]
                        │
                        ▼
            [ Terminal Sandbox ]
              (Subprocess Engine)
```

### 1.1 Database & Persistence Layer (Supabase / PostgreSQL)
* Persists user sessions and fine-grained execution steps (thoughts, commands, outputs, exit codes, timestamps).
* Uses `SQLModel` for Python type-safety, ORM relations, and automatic schema generation.

### 1.2 Sandboxed Process Execution Engine
* Executes shell commands on the operating system using Python's `subprocess` module.
* Enforces strict timeout limits (e.g., 30s) to prevent infinite hangs.
* Intercepts and merges both `stdout` (standard output) and `stderr` (error logs).
* Extracts exit codes (`0` for success, non-zero for failures).

### 1.3 Multi-Provider LLM Fallback Router
* Implements the **Adapter Pattern** to decouple our system from any single vendor.
* If the primary provider (Google Gemini) encounters a rate limit (HTTP `429`), it dynamically fails over to free OpenAI-compatible endpoints (Groq, OpenRouter, GitHub Models, Mistral) in milliseconds.

### 1.4 Explicit State-Machine Agent Loop
* A fully observable Python `while` loop implementing the **ReAct (Reason + Act)** paradigm.
* Dispatches tool calls, intercepts results, logs every step to Supabase, and handles multi-turn context memory.

---

## 2. Database Schema (PostgreSQL)

### Table 1: `sessions`
Represents an individual task run initiated by a user.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Unique task run identifier |
| `goal` | `TEXT` | `NOT NULL` | The user's prompt / task description |
| `status` | `TEXT` | `DEFAULT 'pending'` | `pending`, `running`, `completed`, `failed` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | UTC creation timestamp |

### Table 2: `steps`
Represents an individual tool execution or reasoning step within a session.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Unique step identifier |
| `session_id` | `UUID` | `FOREIGN KEY (sessions.id)` | Cascades on session deletion |
| `step_number` | `INTEGER` | `NOT NULL` | Order of execution (`1, 2, 3...`) |
| `thought` | `TEXT` | `NULLABLE` | LLM rationale / tool invocation label |
| `command` | `TEXT` | `NOT NULL` | Exact terminal command executed |
| `output` | `TEXT` | `NULLABLE` | Combined stdout and stderr |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | UTC execution timestamp |

---

## 3. Free LLM Provider Matrix

| Provider | Top Free Models | Protocol | Free Quota / Limits |
| :--- | :--- | :--- | :--- |
| **Google AI Studio** | `gemini-2.0-flash` | Native GenAI SDK | 15 RPM / 1,500 RPD |
| **Groq Cloud** | `llama-3.3-70b-versatile` | OpenAI REST Compatible | 30 RPM / 300 tokens/sec |
| **OpenRouter** | `deepseek-r1:free`, `llama-3.3-70b:free` | OpenAI REST Compatible | Free access to open models |
| **GitHub Models** | `gpt-4o-mini` | OpenAI REST Compatible | 15 RPM (Free with GitHub) |
| **Mistral AI** | `codestral-latest` | OpenAI REST Compatible | Free developer tier |

---

## 4. Complete Source Code

### 4.1 `requirements.txt`
```text
fastapi==0.111.0
uvicorn==0.30.1
sqlmodel==0.0.19
psycopg2-binary==2.9.9
python-dotenv==1.0.1
google-genai==0.1.1
openai>=1.30.0
```

---

### 4.2 `app/database.py`
```python
import os
from dotenv import load_dotenv
from sqlmodel import create_engine, SQLModel, Session

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set!")

# Connection pool manager
engine = create_engine(DATABASE_URL)

def init_db():
    """Initializes tables in Supabase."""
    SQLModel.metadata.create_all(engine)

def get_session():
    """FastAPI Dependency for database sessions."""
    with Session(engine) as session:
        yield session
```

---

### 4.3 `app/models.py`
```python
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class AgentSession(SQLModel, table=True):
    __tablename__ = "sessions"

    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True
    )
    goal: str
    status: str = Field(default="pending")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    steps: List["AgentStep"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class AgentStep(SQLModel, table=True):
    __tablename__ = "steps"

    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True
    )
    session_id: uuid.UUID = Field(foreign_key="sessions.id")
    step_number: int
    thought: Optional[str] = Field(default=None)
    command: str
    output: Optional[str] = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    session: AgentSession = Relationship(back_populates="steps")
```

---

### 4.4 `app/sandbox.py`
```python
import subprocess
from typing import Tuple

def execute_command(command: str, timeout_seconds: int = 30) -> Tuple[str, int]:
    """
    Executes a shell command on the host system with timeout protection and merged stdout/stderr.
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            text=True,
            capture_output=True,
            timeout=timeout_seconds
        )
        output = result.stdout + result.stderr
        exit_code = result.returncode
        return output, exit_code

    except subprocess.TimeoutExpired as e:
        stdout_so_far = e.stdout if e.stdout else ""
        stderr_so_far = e.stderr if e.stderr else ""
        output = stdout_so_far + stderr_so_far
        output += f"\n[ERROR: Command timed out after {timeout_seconds} seconds]"
        return output, -1
        
    except Exception as e:
        return f"[SYSTEM ERROR: {str(e)}]", -1
```

---

### 4.5 `app/llm/base.py`
```python
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class ToolCall(BaseModel):
    name: str
    args: Dict[str, Any]

class LLMResponse(BaseModel):
    text: Optional[str] = None
    tool_calls: List[ToolCall] = []
    provider_name: str
    model_name: str

class BaseLLMProvider(ABC):
    def __init__(self, name: str, model_name: str, api_key: str):
        self.name = name
        self.model_name = model_name
        self.api_key = api_key

    @abstractmethod
    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        pass
```

---

### 4.6 `app/llm/gemini_provider.py`
```python
from typing import List, Dict, Any
from google import genai
from google.genai import types
from app.llm.base import BaseLLMProvider, LLMResponse, ToolCall

class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model_name: str = "gemini-2.0-flash"):
        super().__init__(name="Gemini", model_name=model_name, api_key=api_key)
        self.client = genai.Client(api_key=api_key)

    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        gemini_tools = []
        for tool in tools:
            func_decl = types.FunctionDeclaration(
                name=tool["name"],
                description=tool["description"],
                parameters=tool.get("parameters")
            )
            gemini_tools.append(types.Tool(function_declarations=[func_decl]))

        contents = []
        for msg in messages:
            role = "user" if msg["role"] in ["user", "tool"] else "model"
            if "parts" in msg:
                contents.append(types.Content(role=role, parts=msg["parts"]))
            else:
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=gemini_tools if gemini_tools else None,
            temperature=0.2,
        )

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config
        )

        tool_calls = []
        if response.function_calls:
            for call in response.function_calls:
                tool_calls.append(ToolCall(name=call.name, args=call.args))

        return LLMResponse(
            text=response.text,
            tool_calls=tool_calls,
            provider_name=self.name,
            model_name=self.model_name
        )
```

---

### 4.7 `app/llm/openai_compatible_provider.py`
```python
from typing import List, Dict, Any
import json
from openai import OpenAI
from app.llm.base import BaseLLMProvider, LLMResponse, ToolCall

class OpenAICompatibleProvider(BaseLLMProvider):
    def __init__(self, name: str, base_url: str, api_key: str, model_name: str):
        super().__init__(name=name, model_name=model_name, api_key=api_key)
        self.client = OpenAI(base_url=base_url, api_key=api_key)

    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        openai_tools = []
        for tool in tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "parameters": tool.get("parameters", {"type": "object", "properties": {}})
                }
            })

        formatted_messages = [{"role": "system", "content": system_instruction}]
        for msg in messages:
            formatted_messages.append({
                "role": msg["role"],
                "content": str(msg["content"])
            })

        kwargs = {
            "model": self.model_name,
            "messages": formatted_messages,
            "temperature": 0.2,
        }
        if openai_tools:
            kwargs["tools"] = openai_tools

        response = self.client.chat.completions.create(**kwargs)
        choice = response.choices[0].message

        tool_calls = []
        if choice.tool_calls:
            for tc in choice.tool_calls:
                args = json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
                tool_calls.append(ToolCall(name=tc.function.name, args=args))

        return LLMResponse(
            text=choice.content,
            tool_calls=tool_calls,
            provider_name=self.name,
            model_name=self.model_name
        )
```

---

### 4.8 `app/llm/router.py`
```python
from typing import List, Dict, Any
from app.llm.base import BaseLLMProvider, LLMResponse

class LLMRouter:
    def __init__(self, providers: List[BaseLLMProvider]):
        self.providers = providers

    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        last_error = None
        for provider in self.providers:
            try:
                print(f"Attempting inference with [{provider.name} - {provider.model_name}]...")
                response = provider.generate(messages, system_instruction, tools)
                print(f"Success with [{provider.name}]!")
                return response
            except Exception as e:
                print(f"[WARNING] Provider {provider.name} failed with error: {e}. Trying next fallback...")
                last_error = e

        raise RuntimeError(f"All LLM providers failed! Last error: {last_error}")
```

---

### 4.9 `app/agent.py`
```python
import os
import uuid
from typing import List, Dict, Any
from dotenv import load_dotenv
from sqlmodel import Session

from app.database import engine
from app.models import AgentSession, AgentStep
from app.sandbox import execute_command
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
        providers.append(GeminiProvider(api_key=gemini_key, model_name="gemini-2.0-flash"))

    # 2. Fallback 1: Groq Cloud
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        providers.append(OpenAICompatibleProvider(
            name="Groq",
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_key,
            model_name="llama-3.3-70b-versatile"
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
        raise ValueError("No LLM API keys found in .env!")

    return LLMRouter(providers)

TOOLS_SCHEMA = [
    {
        "name": "run_terminal_command",
        "description": "Executes a shell command in the terminal sandbox and returns the stdout and stderr output.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The exact shell command line to execute (e.g., 'dir', 'python main.py', 'pip list')."
                }
            },
            "required": ["command"]
        }
    }
]

SYSTEM_INSTRUCTION = (
    "You are an autonomous Terminal AI Agent running on Windows PowerShell. "
    "Your job is to achieve the user's goal by executing terminal commands using the 'run_terminal_command' tool. "
    "Carefully inspect the terminal output after every command before deciding your next move. "
    "When the goal is fully achieved, provide a concise summary of what was accomplished without calling any more tools."
)

def run_agent_loop(session_id: uuid.UUID, max_steps: int = 10):
    router = get_configured_router()

    with Session(engine) as db:
        session_item = db.get(AgentSession, session_id)
        if not session_item:
            return

        session_item.status = "running"
        db.add(session_item)
        db.commit()

        messages: List[Dict[str, Any]] = [
            {"role": "user", "content": session_item.goal}
        ]

        step_count = 0

        try:
            while step_count < max_steps:
                llm_response = router.generate(
                    messages=messages,
                    system_instruction=SYSTEM_INSTRUCTION,
                    tools=TOOLS_SCHEMA
                )

                if not llm_response.tool_calls:
                    print(f"Goal Achieved! Final Answer: {llm_response.text}")
                    break

                for tool_call in llm_response.tool_calls:
                    step_count += 1
                    command_to_run = tool_call.args.get("command", "")
                    
                    print(f"Step {step_count}: Running command -> {command_to_run}")

                    output, exit_code = execute_command(command_to_run)

                    step_record = AgentStep(
                        session_id=session_id,
                        step_number=step_count,
                        thought=f"Invoked {tool_call.name} using {llm_response.provider_name}",
                        command=command_to_run,
                        output=output
                    )
                    db.add(step_record)
                    db.commit()

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
            print(f"Fatal error in agent loop: {e}")
            session_item.status = "failed"
            db.add(session_item)
            db.commit()
```

---

### 4.10 `app/main.py`
```python
from contextlib import asynccontextmanager
from typing import List
import uuid
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlmodel import select, Session

from app.database import init_db, get_session
from app.models import AgentSession, AgentStep
from app.agent import run_agent_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing database...")
    init_db()
    print("Database tables created successfully!")
    yield
    print("Shutting down server...")

app = FastAPI(lifespan=lifespan)

@app.get("/")
def read_root():
    return {"message": "Hello from Terminal Agent!"}

@app.post("/api/sessions", response_model=AgentSession)
def create_session(
    goal_data: dict, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_session)
):
    if "goal" not in goal_data or not goal_data["goal"].strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
    
    new_session = AgentSession(goal=goal_data["goal"])
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    background_tasks.add_task(run_agent_loop, new_session.id)
    return new_session

@app.get("/api/sessions", response_model=List[AgentSession])
def list_sessions(db: Session = Depends(get_session)):
    statement = select(AgentSession).order_by(AgentSession.created_at.desc())
    results = db.exec(statement)
    return results.all()

@app.get("/api/sessions/{session_id}", response_model=AgentSession)
def get_session_details(session_id: uuid.UUID, db: Session = Depends(get_session)):
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_item
```
