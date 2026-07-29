from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

from .adapters import (
    AuthenticationServiceUnavailableError,
    InMemoryInterviewRepository,
    InvalidAccessTokenError,
    GroqAIProvider,
    OpenAIRealtimeVoiceProvider,
    SupabaseAuthProvider,
    DeepgramTranscriptionProvider,
    FishAudioSpeechProvider,
)
from .config import Settings, get_settings
from .domain import (
    AuthenticatedUser,
    AuthProvider,
    InterviewRepository,
    RealtimeVoiceProvider,
    SpeechProvider,
)


repository = InMemoryInterviewRepository()

bearer_scheme = HTTPBearer(auto_error=False)


def get_auth_provider(
    settings: Settings = Depends(get_settings),
) -> AuthProvider:
    return SupabaseAuthProvider(settings)


def get_realtime_voice_provider(
    settings: Settings = Depends(get_settings),
) -> RealtimeVoiceProvider:
    return OpenAIRealtimeVoiceProvider(settings)

def get_transcription_provider(
    settings: Settings = Depends(get_settings),
) -> DeepgramTranscriptionProvider:
    return DeepgramTranscriptionProvider(settings)

def get_ai_provider(
    settings: Settings = Depends(get_settings),
) -> GroqAIProvider:
    return GroqAIProvider(settings)

def get_speech_provider(
    settings: Settings = Depends(get_settings),
) -> SpeechProvider:
    return FishAudioSpeechProvider(settings)


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
    provider: AuthProvider = Depends(get_auth_provider),
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
        )

    try:
        return await provider.verify_token(
            credentials.credentials
        )

    except InvalidAccessTokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        ) from error

    except AuthenticationServiceUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from error


def get_repository() -> InterviewRepository:
    return repository