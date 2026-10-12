from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from contextlib import asynccontextmanager
from sqlmodel import Session, select
from typing import List
import uuid

from app.db import init_db, get_session
from app.agent import run_agent_loop
from app.models import AgentSession, AgentStep

@asynccontextmanager
async def lifespan(app:FastAPI):
    print("Initializing Database")
    init_db()
    print("Database initialization successful")
    yield
    print("Shutting Down server")

app = FastAPI(lifespan=lifespan)

@app.get("/")
def read_root():
    return {"message": "Hello from terminal agent !"}

# Create a new session
@app.post("/api/session", response_model=AgentSession)
def create_session(goal_data:dict,background_tasks:BackgroundTasks, db: Session = Depends(get_session)):
    # Input format of goal_data = {"goal":"Delete folder named Test"}
    if "goal" not in goal_data or not goal_data["goal"].strip():
        raise HTTPException(status_code=400,detail="Goal can't be empty")
    new_session = AgentSession(goal=goal_data["goal"])
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    background_tasks.add_task(run_agent_loop,new_session.id)

    return new_session

# Get all sessions [For side bar]
@app.get("/api/sessions", response_model=List[AgentSession])
def get_sessions(db:Session=Depends(get_session)):
    statement = select(AgentSession).order_by(AgentSession.created_at.desc())
    results = db.exec(statement)
    return results.all()

# Get a particular session details
@app.get("/api/session/{session_id}",response_model=AgentSession)
def get_session_detail(session_id:uuid.UUID, db:Session=Depends(get_session)):
    session_item= db.get(AgentSession,session_id)
    if not session_item:
        raise HTTPException(status_code=404, detail="Session item not found")
    return session_item