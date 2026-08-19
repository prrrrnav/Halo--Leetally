from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None

@dataclass(frozen=True)
class SynthesizedSpeech:
    data: bytes
    content_type: str


@dataclass
class Interview:
    id: str
    user_id: str
    platform: str
    problem_slug: str
    status: str
    created_at: datetime
    screen_context: InterviewScreenContext
    target_company: str | None = None
    interview_type: str = "dsa"
    level: str = "sde1"
    turns: list[InterviewTurn] = field(default_factory=list)
    completed_at: datetime | None = None
    assessment: dict[str, Any] | None = None
    phase: str = "clarification"
    code_snapshots: list[CodeSnapshot] = field(default_factory=list)

    @property
    def problem_title(self) -> str:
        return self.screen_context.problem_title

    @property
    def difficulty(self) -> str | None:
        return self.screen_context.difficulty

    @property
    def problem_description(self) -> str:
        return self.screen_context.problem_description


    @property
    def programming_language(self) -> str | None:
        return self.screen_context.programming_language

    @property
    def code(self) -> str | None:
        return self.screen_context.code

    @property
    def visible_output(self) -> str | None:
        return self.screen_context.visible_output


@dataclass
class InterviewScreenContext:
    problem_title: str
    problem_description: str = ""
    difficulty: str | None = None
    programming_language: str | None = None
    code: str | None = None
    visible_output: str | None = None
    problem_topics: list[str] = field(default_factory=list)
    interview_companies: list[str] = field(default_factory=list)


@dataclass
class InterviewTurn:
    candidate_message: str
    interviewer_message: str
    created_at: datetime
    code: str = ""


@dataclass
class CodeSnapshot:
    code: str
    programming_language: str
    created_at: datetime


class AuthProvider(ABC):
    @abstractmethod
    async def verify_token(
        self,
        token: str,
    ) -> AuthenticatedUser:
        ...


class InterviewRepository(ABC):
    @abstractmethod
    async def create(
        self,
        user_id: str,
        data: dict[str, Any],
    ) -> Interview:
        ...

    @abstractmethod
    async def get(
        self,
        interview_id: str,
        user_id: str,
    ) -> Interview | None:
        ...

    @abstractmethod
    async def update_context(
        self,
        interview_id: str,
        user_id: str,
        data: dict,
    ):
        interview = await self.get(
            interview_id=interview_id,
            user_id=user_id,
        )

        if interview is None:
            return None

        for field_name, field_value in data.items():
            if field_value is not None:
                setattr(
                    interview,
                    field_name,
                    field_value,
                )

        return interview

    @abstractmethod
    async def add_turn(
        self,
        interview_id: str,
        user_id: str,
        candidate_message: str,
        interviewer_message: str,
        phase: str | None = None,
    ) -> Interview | None:
        ...

    @abstractmethod
    async def complete(
        self,
        interview_id: str,
        user_id: str,
        assessment: dict[str, Any],
    ) -> Interview | None:
        ...


class AIProvider(ABC):
    @abstractmethod
    async def reply(
        self,
        interview: Interview,
        candidate_message: str,
    ) -> str:
        ...


class RealtimeVoiceProvider(ABC):
    @abstractmethod
    async def create_client_secret(
        self,
        user: AuthenticatedUser,
        context: InterviewScreenContext,
    ) -> dict[str, Any]:
        ...


class SpeechProvider(ABC):
    @abstractmethod
    async def synthesize(
        self,
        text: str,
        reference_id: str | None = None,
    ) -> SynthesizedSpeech:
        ...

class PaymentProvider(ABC):
    @abstractmethod
    async def create_checkout(
        self,
        user_id: str,
        plan: str,
    ) -> str:
        ...
