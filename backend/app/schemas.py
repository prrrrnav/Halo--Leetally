from datetime import datetime

from typing import Literal

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
    problem_topics: list[str] | None = Field(
        default=None,
        max_length=30,
    )
    interview_companies: list[str] | None = Field(
        default=None,
        max_length=50,
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
    target_company: Literal[
        "google", "amazon", "meta", "ibm", "accenture", "tcs",
        "hcltech", "american-express", "microsoft"
    ] = "google"
    interview_type: Literal["dsa", "behavioral", "lld", "hld"] = "dsa"
    level: Literal["sde1"] = "sde1"


class InterviewOut(InterviewCreate):
    id: str
    user_id: str
    status: str
    created_at: datetime
    phase: Literal["clarification", "approach", "coding", "testing", "complexity", "wrap_up"] = "clarification"


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
    company_id: Literal[
        "google", "amazon", "meta", "ibm", "accenture", "tcs",
        "hcltech", "american-express", "microsoft"
    ] = "google"


class SpeechSynthesisOut(BaseModel):
    audio_base64: str
    audio_content_type: str

class InterviewTurnOut(BaseModel):
    transcript: str
    interviewer_message: str
    interviewer_audio_base64: str | None = None
    interviewer_audio_content_type: str | None = None
    phase: Literal["clarification", "approach", "coding", "testing", "complexity", "wrap_up"] = "clarification"


class InterviewCompleteIn(BaseModel):
    duration_seconds: int = Field(default=0, ge=0, le=14_400)


class ScoreDimensionOut(BaseModel):
    score: int = Field(ge=1, le=10)
    evidence: list[str]
    next_action: str


class InterviewAssessmentOut(BaseModel):
    interview_id: str
    level: Literal["sde1"] = "sde1"
    overall_score: int = Field(ge=1, le=10)
    hiring_signal: Literal["strong_hire", "hire", "lean_hire", "not_yet"]
    summary: str
    dimensions: dict[str, ScoreDimensionOut]
    strengths: list[str]
    priority_improvements: list[str]
    next_drills: list[str]
    duration_seconds: int
    completed_at: datetime


class BillingPlanOut(BaseModel):
    id: str
    name: str
    purchase_type: Literal["subscription", "one_time"]
    amount_inr: int
    currency: str
    interview_minutes_per_month: int
    interval: str | None = None
    supports_auto_renew: bool = False
    period_days: int = 30


class BillingCheckoutIn(BaseModel):
    plan_id: Literal["sde1_sprint", "sde1_intensive"]
    customer_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(pattern=r"^[6-9][0-9]{9}$")
    auto_renew: bool = False


class BillingCheckoutOut(BaseModel):
    reference: str
    plan_id: str
    purchase_type: Literal["subscription", "one_time"]
    amount_inr: int
    currency: str
    session_id: str
    environment: str


class BillingEntitlementOut(BaseModel):
    plan_id: str | None = None
    status: str
    is_lifetime: bool = False
    minutes_limit: int = 0
    minutes_used: int = 0
    minutes_remaining: int = 0
    speech_seconds_used: int = 0
    auto_renew: bool = False
    period_start: datetime | None = None
    period_end: datetime | None = None
class AccountDeleteIn(BaseModel):
    confirmation: str = Field(pattern=r"^DELETE$")
