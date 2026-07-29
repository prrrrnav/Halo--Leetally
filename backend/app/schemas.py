from datetime import datetime

from pydantic import BaseModel, Field

class InterviewContextUpdate(BaseModel):
    problem_title: str | None = Field(
        default=None,
        max_length=500,
    )
    problem_description: str | None = Field(
        default=None,
        max_length=20_000,
    )
    difficulty: str | None = Field(
        default=None,
        max_length=50,
    )
    programming_language: str | None = Field(
        default=None,
        max_length=100,
    )
    code: str | None = Field(
        default=None,
        max_length=100_000,
    )
    visible_output: str | None = Field(
        default=None,
        max_length=20_000,
    )

class UserOut(BaseModel):
    id: str
    email: str | None = None


class InterviewCreate(BaseModel):
    platform: str = Field(
        min_length=1,
        max_length=50,
        pattern=r"^[a-z0-9_-]+$",
    )
    problem_slug: str = Field(
        min_length=1,
        max_length=200,
    )
    problem_title: str = Field(
        min_length=1,
        max_length=300,
    )
    difficulty: str | None = Field(
        default=None,
        max_length=30,
    )


class InterviewOut(InterviewCreate):
    id: str
    user_id: str
    status: str
    created_at: datetime


class RealtimeSessionCreate(BaseModel):
    problem_title: str = Field(
        min_length=1,
        max_length=300,
    )
    problem_description: str = Field(
        min_length=1,
        max_length=10000,
    )
    difficulty: str | None = Field(
        default=None,
        max_length=30,
    )
    programming_language: str | None = Field(
        default=None,
        max_length=50,
    )
    code: str | None = Field(
        default=None,
        max_length=20000,
    )
    visible_output: str | None = Field(
        default=None,
        max_length=5000,
    )


class MessageIn(BaseModel):
    content: str = Field(
        min_length=1,
        max_length=5000,
    )


class MessageOut(BaseModel):
    reply: str

class SpeechSynthesisIn(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=5000,
    )


class SpeechSynthesisOut(BaseModel):
    audio_base64: str
    audio_content_type: str

class InterviewTurnOut(BaseModel):
    transcript: str
    interviewer_message: str
    interviewer_audio_base64: str | None = None
    interviewer_audio_content_type: str | None = None