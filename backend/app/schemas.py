from datetime import datetime
from pydantic import BaseModel, Field

class UserOut(BaseModel):
    id: str
    email: str | None = None

class InterviewCreate(BaseModel):
    platform: str = Field(pattern="^[a-z0-9_-]+$")
    problem_slug: str = Field(min_length=1, max_length=200)
    problem_title: str = Field(min_length=1, max_length=300)
    difficulty: str | None = None

class InterviewOut(InterviewCreate):
    id: str
    user_id: str
    status: str
    created_at: datetime

class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=5000)

class MessageOut(BaseModel):
    reply: str

