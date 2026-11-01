import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class AgentSession(SQLModel, table = True):
    __tablename__ = "sessions"

    id: Optional[uuid.UUID] = Field(
        default_factory = uuid.uuid4,
        primary_key = True,
        index = True
    )
    goal: str
    status: str = Field(default="Pending")
    created_at: datetime = Field(
        default_factory = lambda: datetime.now(timezone.utc)
    )
    steps: List["AgentStep"] = Relationship(
        back_populates = "session",
        sa_relationship_kwargs = {"cascade":"all, delete-orphan"}
    )

class AgentStep(SQLModel, table = True):
    __tablename__ = "steps"

    id: Optional[uuid.UUID] = Field(
        default_factory = uuid.uuid4,
        primary_key = True,
        index = True
    )
    session_id : uuid.UUID = Field(foreign_key= "sessions.id")
    step_number : int
    thought : Optional[str] = Field(default = None)
    command: str
    output: Optional[str] = Field(default = None)
    created_at: datetime = Field(
        default_factory = lambda: datetime.now(timezone.utc)
    )

    session: AgentSession = Relationship(back_populates= "steps")

# Pydantic / SQLModel Read Schema including relationships
class AgentSessionRead(SQLModel):
    id: uuid.UUID
    goal: str
    status: str
    created_at: datetime
    steps: List[AgentStep] = []
