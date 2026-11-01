import os
from dotenv import load_dotenv
from sqlmodel import create_engine, SQLModel, Session

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def get_engine():
    if not DATABASE_URL:
        print("[DB Warning] DATABASE_URL not set. Falling back to local SQLite: sqlite:///./terminal_agent.db")
        return create_engine("sqlite:///./terminal_agent.db", connect_args={"check_same_thread": False})
    
    try:
        eng = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300
        )
        # Test connection
        with eng.connect() as conn:
            pass
        return eng
    except Exception as e:
        print(f"[DB Warning] Could not connect to remote PostgreSQL ({e}).")
        print("Falling back to local SQLite database (terminal_agent.db) so the app continues running!")
        return create_engine("sqlite:///./terminal_agent.db", connect_args={"check_same_thread": False})

engine = get_engine()

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
