import os
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlmodel import Session, select
from typing import List
import uuid

from app.db import init_db, get_session
from app.agent import run_agent_loop
from app.models import AgentSession, AgentStep, AgentSessionRead

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing Database...")
    init_db()
    print("Database initialization successful!")
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
    Body format: {"goal": "Check project files and create a readme"}
    """
    if "goal" not in goal_data or not goal_data["goal"].strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")

    new_session = AgentSession(goal=goal_data["goal"].strip())
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

    # Launch background agent loop with the follow-up prompt
    background_tasks.add_task(run_agent_loop, session_id, prompt)
    return session_item

# 3. Get all sessions (For sidebar history)
@app.get("/api/sessions", response_model=List[AgentSession], tags=["Sessions"])
def get_sessions(db: Session = Depends(get_session)):
    """Returns all past sessions ordered by newest first."""
    statement = select(AgentSession).order_by(AgentSession.created_at.desc())
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
