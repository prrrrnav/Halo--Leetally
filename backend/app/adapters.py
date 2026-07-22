from datetime import datetime, timezone
from uuid import uuid4
import jwt
from fastapi import HTTPException, status
from .domain import AIProvider, AuthenticatedUser, AuthProvider, Interview, InterviewRepository, PaymentProvider

class MockAuthProvider(AuthProvider):
    async def verify_token(self, token: str) -> AuthenticatedUser:
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
        return AuthenticatedUser(id=token, email=f"{token}@example.test")

class SupabaseJWTAuthProvider(AuthProvider):
    def __init__(self, secret: str, audience: str = "authenticated"):
        self.secret, self.audience = secret, audience

    async def verify_token(self, token: str) -> AuthenticatedUser:
        if not self.secret:
            raise RuntimeError("SUPABASE_JWT_SECRET is required")
        try:
            payload = jwt.decode(token, self.secret, algorithms=["HS256"], audience=self.audience)
            return AuthenticatedUser(id=payload["sub"], email=payload.get("email"))
        except (jwt.PyJWTError, KeyError) as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

class InMemoryInterviewRepository(InterviewRepository):
    def __init__(self): self.items: dict[str, Interview] = {}
    async def create(self, user_id: str, data: dict) -> Interview:
        item = Interview(id=str(uuid4()), user_id=user_id, status="created", created_at=datetime.now(timezone.utc), **data)
        self.items[item.id] = item
        return item
    async def get(self, interview_id: str, user_id: str) -> Interview | None:
        item = self.items.get(interview_id)
        return item if item and item.user_id == user_id else None

class MockAIProvider(AIProvider):
    async def reply(self, interview: Interview, candidate_message: str) -> str:
        if not candidate_message.strip(): return "Please explain your approach before you begin coding."
        return "Good start. What are the time and space complexities, and which edge cases would you test?"

class NoopPaymentProvider(PaymentProvider):
    async def create_checkout(self, user_id: str, plan: str) -> str:
        raise NotImplementedError("Payments are intentionally disabled for the MVP")

