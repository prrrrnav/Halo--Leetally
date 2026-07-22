from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any

@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None

@dataclass
class Interview:
    id: str
    user_id: str
    platform: str
    problem_slug: str
    problem_title: str
    difficulty: str | None
    status: str
    created_at: datetime

class AuthProvider(ABC):
    @abstractmethod
    async def verify_token(self, token: str) -> AuthenticatedUser: ...

class InterviewRepository(ABC):
    @abstractmethod
    async def create(self, user_id: str, data: dict[str, Any]) -> Interview: ...
    @abstractmethod
    async def get(self, interview_id: str, user_id: str) -> Interview | None: ...

class AIProvider(ABC):
    @abstractmethod
    async def reply(self, interview: Interview, candidate_message: str) -> str: ...

class SpeechProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> bytes: ...

class PaymentProvider(ABC):
    @abstractmethod
    async def create_checkout(self, user_id: str, plan: str) -> str: ...

