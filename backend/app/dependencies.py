from fastapi import Depends, Header, HTTPException
from .adapters import InMemoryInterviewRepository, MockAIProvider, MockAuthProvider, SupabaseJWTAuthProvider
from .config import Settings, get_settings
from .domain import AIProvider, AuthenticatedUser, AuthProvider, InterviewRepository

repository = InMemoryInterviewRepository()
mock_ai = MockAIProvider()

def get_auth_provider(settings: Settings = Depends(get_settings)) -> AuthProvider:
    return SupabaseJWTAuthProvider(settings.supabase_jwt_secret) if settings.auth_mode == "supabase" else MockAuthProvider()

async def current_user(authorization: str | None = Header(default=None), provider: AuthProvider = Depends(get_auth_provider)) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return await provider.verify_token(authorization.removeprefix("Bearer ").strip())

def get_repository() -> InterviewRepository: return repository
def get_ai_provider() -> AIProvider: return mock_ai

