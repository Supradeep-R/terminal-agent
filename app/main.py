import os
import json
import asyncio
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlmodel import Session, select
from typing import List, Optional
import uuid

from app.db import init_db, get_session
from app.agent import run_agent_loop, handle_approval_decision, cancel_session
from app.models import AgentSession, AgentStep, AgentSessionRead, SimpleUser
from app.runner_manager import runner_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing Database...")
    init_db()
    runner_manager.set_loop(asyncio.get_running_loop())
    print("Database & RunnerManager initialized successfully!")
    yield
    print("Shutting Down server...")

app = FastAPI(
    title="Terminal Agent API",
    description="Multi-Provider Autonomous Terminal Agent with Multi-Turn Persistent Memory",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend development and deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health", tags=["System"])
def health_check():
    return {"status": "ok", "message": "Terminal Agent API running"}

# Local Runner WebSocket & status endpoints
@app.websocket("/ws/runner/{user_id}")
async def runner_websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    try:
        init_data = await websocket.receive_text()
        metadata = json.loads(init_data) if init_data else {}
        await runner_manager.register(user_id, websocket, metadata)
        while True:
            msg = await websocket.receive_text()
            data = json.loads(msg)
            runner_manager.handle_message(data)
    except WebSocketDisconnect:
        runner_manager.unregister(user_id)
    except Exception as e:
        print(f"[WebSocket Error] {e}")
        runner_manager.unregister(user_id)

@app.get("/api/runner/status", tags=["Runner"])
def get_runner_status(user_id: str):
    """Returns whether a local runner daemon is currently connected for this user."""
    connected = runner_manager.is_connected(user_id)
    info = runner_manager.get_info(user_id) if connected else None
    return {"connected": connected, "info": info}

@app.get("/runner.py", tags=["Runner"])
def download_runner_script():
    """Download the standalone Python script to run on local machine."""
    runner_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "runner.py")
    if os.path.exists(runner_path):
        return FileResponse(runner_path, media_type="text/x-python", filename="runner.py")
    raise HTTPException(status_code=404, detail="runner.py script not found on server")

# Auth Endpoint: Login or auto-register simple username/password
@app.post("/api/auth/login", tags=["Auth"])
def login_or_register(user_data: dict, db: Session = Depends(get_session)):
    username = user_data.get("username", "").strip()
    password = user_data.get("password", "").strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    user = db.get(SimpleUser, username)
    if not user:
        # First time seeing this user: register them!
        new_user = SimpleUser(username=username, password=password)
        db.add(new_user)
        db.commit()
        return {"status": "registered", "username": username}
    else:
        if user.password != password:
            raise HTTPException(status_code=401, detail="Incorrect password for this username")
        return {"status": "authenticated", "username": username}

# 1. Create a new session (Start a new task)
@app.post("/api/sessions", response_model=AgentSessionRead, tags=["Sessions"])
@app.post("/api/session", response_model=AgentSessionRead, include_in_schema=False)
def create_session(
    goal_data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session)
):
    """
    Creates a new session and launches the agent loop in the background.
    Body format: {"goal": "Check project files", "user_id": "guest_123"}
    """
    if "goal" not in goal_data or not goal_data["goal"].strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")

    user_id = goal_data.get("user_id", "guest")
    new_session = AgentSession(goal=goal_data["goal"].strip(), user_id=user_id)
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Launch agent loop in background
    background_tasks.add_task(run_agent_loop, new_session.id)
    return new_session

# 2. Multi-Turn Follow-up Prompt (Continue conversation in same session)
@app.post("/api/sessions/{session_id}/prompt", response_model=AgentSessionRead, tags=["Sessions"])
def send_follow_up_prompt(
    session_id: uuid.UUID,
    prompt_data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session)
):
    """
    Sends a follow-up prompt to an existing session.
    The agent reconstructs past conversation & steps from the database,
    maintaining full multi-turn memory.
    Body format: {"prompt": "Now run tests on the files you just found"}
    """
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session not found")

    prompt = prompt_data.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    # Determine next step number and record user prompt step immediately
    statement = select(AgentStep).where(AgentStep.session_id == session_id).order_by(AgentStep.step_number.desc())
    last_step = db.exec(statement).first()
    next_step_num = (last_step.step_number + 1) if last_step else 1

    user_step = AgentStep(
        session_id=session_id,
        step_number=next_step_num,
        thought="User Follow-up",
        command="user_prompt",
        output=prompt
    )
    db.add(user_step)
    session_item.status = "running"
    db.add(session_item)
    db.commit()
    db.refresh(session_item)

    # Launch background agent loop with the follow-up prompt
    background_tasks.add_task(run_agent_loop, session_id, prompt)
    return session_item

# Human-in-the-Loop Safety Approval Endpoint
@app.post("/api/sessions/{session_id}/approval", response_model=AgentSessionRead, tags=["Sessions"])
def submit_approval(
    session_id: uuid.UUID,
    data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session)
):
    """
    Submits user decision ('approve' or 'reject') for a dangerous command intercepted by safety guardrails.
    """
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session not found")

    decision = data.get("decision", "").lower().strip()
    if decision not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Decision must be 'approve' or 'reject'")

    feedback = data.get("feedback")
    background_tasks.add_task(handle_approval_decision, session_id, decision, feedback)
    return session_item

# Stop / Cancel Running Session Immediately
@app.post("/api/sessions/{session_id}/stop", response_model=AgentSessionRead, tags=["Sessions"])
@app.post("/api/sessions/{session_id}/cancel", response_model=AgentSessionRead, include_in_schema=False)
def stop_session(session_id: uuid.UUID, db: Session = Depends(get_session)):
    """Stops an active running agent session immediately and kills any running process."""
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session not found")
    cancel_session(session_id)
    db.refresh(session_item)
    return session_item

# Send Interactive Standard Input (stdin) to active process
@app.post("/api/sessions/{session_id}/input", tags=["Sessions"])
def send_terminal_input(session_id: uuid.UUID, data: dict, db: Session = Depends(get_session)):
    """Delivers interactive text input (stdin) to a command waiting for user input."""
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session not found")
    user_id = session_item.user_id or "guest"
    input_text = data.get("input", "")
    runner_manager.send_input(user_id, input_text)
    return {"status": "sent", "input": input_text}

# 3. Get all sessions (For sidebar history)
@app.get("/api/sessions", response_model=List[AgentSession], tags=["Sessions"])
def get_sessions(user_id: Optional[str] = None, db: Session = Depends(get_session)):
    """Returns past sessions. If user_id is provided, filters to that user/guest only."""
    statement = select(AgentSession).order_by(AgentSession.created_at.desc())
    if user_id:
        statement = statement.where(AgentSession.user_id == user_id)
    results = db.exec(statement)
    return results.all()

# 4. Get a particular session details and steps
@app.get("/api/sessions/{session_id}", response_model=AgentSessionRead, tags=["Sessions"])
@app.get("/api/session/{session_id}", response_model=AgentSessionRead, include_in_schema=False)
def get_session_detail(session_id: uuid.UUID, db: Session = Depends(get_session)):
    """Returns session details including all recorded steps and outputs."""
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session item not found")
    return session_item

# 5. Delete a session
@app.delete("/api/sessions/{session_id}", tags=["Sessions"])
def delete_session(session_id: uuid.UUID, db: Session = Depends(get_session)):
    """Deletes a session and all its steps."""
    session_item = db.get(AgentSession, session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session_item)
    db.commit()
    return {"message": "Session deleted successfully"}

# 6. Serve React Frontend in production if built
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/")
    def read_root():
        return {"message": "Terminal Agent API running. Frontend not built yet."}
