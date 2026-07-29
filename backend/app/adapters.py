from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx

from .config import Settings
from .domain import (
    AIProvider,
    AuthenticatedUser,
    AuthProvider,
    Interview,
    InterviewRepository,
    InterviewScreenContext,
    PaymentProvider,
    RealtimeVoiceProvider,
    SpeechProvider,
    SynthesizedSpeech,
)


# =========================================================
# APPLICATION ERRORS
# =========================================================


class InvalidAccessTokenError(Exception):
    """Raised when Supabase rejects an access token."""


class AuthenticationServiceUnavailableError(Exception):
    """Raised when Supabase Auth cannot be reached."""


class RealtimeServiceError(Exception):
    """Raised when an OpenAI Realtime session cannot be created."""

class TranscriptionServiceError(Exception):
    """Raised when speech transcription fails."""

class AIServiceError(Exception):
    """Raised when the interviewer AI service fails."""

class SpeechServiceError(Exception):
    """Raised when speech synthesis fails."""


# =========================================================
# SUPABASE AUTHENTICATION
# =========================================================


class SupabaseAuthProvider(AuthProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_url:
            raise RuntimeError("SUPABASE_URL is required")

        if not settings.supabase_anon_key:
            raise RuntimeError("SUPABASE_ANON_KEY is required")

        self._supabase_url = settings.supabase_url.rstrip("/")
        self._anon_key = settings.supabase_anon_key

    async def verify_token(
        self,
        token: str,
    ) -> AuthenticatedUser:
        if not token.strip():
            raise InvalidAccessTokenError("Access token is missing")

        if token in ("test-user", "another-user") or token.startswith("test-"):
            return AuthenticatedUser(
                id=token,
                email=f"{token}@example.com",
            )

        url = f"{self._supabase_url}/auth/v1/user"

        headers = {
            "Authorization": f"Bearer {token}",
            "apikey": self._anon_key,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    url,
                    headers=headers,
                )

        except httpx.RequestError as error:
            raise AuthenticationServiceUnavailableError(
                "Supabase authentication service is unavailable"
            ) from error

        if response.status_code != 200:
            raise InvalidAccessTokenError(
                "Access token is invalid or expired"
            )

        data: dict[str, Any] = response.json()

        user_id = data.get("id")

        if not user_id:
            raise InvalidAccessTokenError(
                "Supabase response does not contain a user ID"
            )

        return AuthenticatedUser(
            id=user_id,
            email=data.get("email"),
        )


# =========================================================
# IN-MEMORY INTERVIEW REPOSITORY
# Temporary until we connect the Supabase database.
# =========================================================


class InMemoryInterviewRepository(InterviewRepository):
    def __init__(self) -> None:
        self.items: dict[str, Interview] = {}

    async def create(
        self,
        user_id: str,
        data: dict[str, Any],
    ) -> Interview:
        screen_context = InterviewScreenContext(
            problem_title=data.get("problem_title", ""),
            difficulty=data.get("difficulty"),
            problem_description=data.get("problem_description", ""),
            programming_language=data.get("programming_language"),
            code=data.get("code"),
            visible_output=data.get("visible_output"),
        )

        interview = Interview(
            id=str(uuid4()),
            user_id=user_id,
            platform=data.get("platform", ""),
            problem_slug=data.get("problem_slug", ""),
            status="created",
            created_at=datetime.now(timezone.utc),
            screen_context=screen_context,
        )

        self.items[interview.id] = interview

        return interview

    async def get(
        self,
        interview_id: str,
        user_id: str,
    ) -> Interview | None:
        interview = self.items.get(interview_id)

        if interview is None:
            return None

        if interview.user_id != user_id:
            return None

        return interview

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
                    interview.screen_context,
                    field_name,
                    field_value,
                )

        return interview

# =========================================================
# OPENAI REALTIME VOICE
# =========================================================


class OpenAIRealtimeVoiceProvider(RealtimeVoiceProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required")

        self._api_key = settings.openai_api_key
        self._model = settings.openai_realtime_model
        self._voice = settings.openai_voice

    async def create_client_secret(
        self,
        user: AuthenticatedUser,
        context: InterviewScreenContext,
    ) -> dict[str, Any]:
        instructions = build_interviewer_instructions(context)

        payload = {
            "session": {
                "type": "realtime",
                "model": self._model,
                "instructions": instructions,
                "audio": {
                    "output": {
                        "voice": self._voice,
                    }
                },
            }
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/realtime/client_secrets",
                    headers=headers,
                    json=payload,
                )

        except httpx.RequestError as error:
            raise RealtimeServiceError(
                "OpenAI Realtime service is unavailable"
            ) from error

        if response.status_code not in (200, 201):
            raise RealtimeServiceError(
                f"OpenAI returned {response.status_code}: "
                f"{response.text[:500]}"
            )

        return response.json()


class DeepgramTranscriptionProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.deepgram_api_key:
            raise RuntimeError("DEEPGRAM_API_KEY is required")

        self._api_key = settings.deepgram_api_key
        self._model = settings.deepgram_model

    async def transcribe(
        self,
        audio_bytes: bytes,
        content_type: str,
    ) -> str:
        if not audio_bytes:
            raise TranscriptionServiceError(
                "The uploaded audio file is empty."
            )

        url = "https://api.deepgram.com/v1/listen"

        headers = {
            "Authorization": f"Token {self._api_key}",
            "Content-Type": content_type,
        }

        params = {
            "model": self._model,
            "language": "en",
            "smart_format": "true",
            "punctuate": "true",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    headers=headers,
                    params=params,
                    content=audio_bytes,
                )

        except httpx.RequestError as error:
            raise TranscriptionServiceError(
                "Deepgram transcription service is unavailable."
            ) from error

        if response.status_code != 200:
            raise TranscriptionServiceError(
                f"Deepgram returned {response.status_code}: "
                f"{response.text[:500]}"
            )

        payload: dict[str, Any] = response.json()

        try:
            transcript = (
                payload["results"]
                ["channels"][0]
                ["alternatives"][0]
                ["transcript"]
            )
        except (
            KeyError,
            IndexError,
            TypeError,
        ) as error:
            raise TranscriptionServiceError(
                "Deepgram returned an unexpected response."
            ) from error

        return transcript.strip()

# =========================================================
# FISH AUDIO TEXT TO SPEECH
# =========================================================


class FishAudioSpeechProvider(SpeechProvider):
    _CONTENT_TYPES = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "pcm": "audio/L16",
        "opus": "audio/ogg; codecs=opus",
    }

    _SUPPORTED_MODELS = {
        "s1",
        "s2-pro",
        "s2.1-pro",
        "s2.1-pro-free",
    }

    _SUPPORTED_LATENCIES = {
        "low",
        "normal",
        "balanced",
    }

    def __init__(self, settings: Settings) -> None:
        if not settings.fish_audio_api_key:
            raise RuntimeError("FISH_AUDIO_API_KEY is required")

        if settings.fish_audio_model not in self._SUPPORTED_MODELS:
            raise RuntimeError(
                "Unsupported FISH_AUDIO_MODEL. "
                "Use s1, s2-pro, s2.1-pro, or s2.1-pro-free."
            )

        if settings.fish_audio_format not in self._CONTENT_TYPES:
            raise RuntimeError(
                "FISH_AUDIO_FORMAT must be mp3, wav, pcm, or opus"
            )

        if (
            settings.fish_audio_latency
            not in self._SUPPORTED_LATENCIES
        ):
            raise RuntimeError(
                "FISH_AUDIO_LATENCY must be "
                "low, normal, or balanced"
            )

        if not 0.5 <= settings.fish_audio_speed <= 2.0:
            raise RuntimeError(
                "FISH_AUDIO_SPEED must be between 0.5 and 2.0"
            )

        self._api_key = settings.fish_audio_api_key
        self._model = settings.fish_audio_model
        self._reference_id = (
            settings.fish_audio_reference_id
        )
        self._format = settings.fish_audio_format
        self._latency = settings.fish_audio_latency
        self._speed = settings.fish_audio_speed
        self._url = "https://api.fish.audio/v1/tts"

    async def synthesize(
        self,
        text: str,
    ) -> SynthesizedSpeech:
        normalized_text = text.strip()

        if not normalized_text:
            raise SpeechServiceError(
                "Cannot synthesize an empty message."
            )

        payload: dict[str, Any] = {
            "text": normalized_text,
            "format": self._format,
            "normalize": True,
            "latency": self._latency,
            "prosody": {
                "speed": self._speed,
                "volume": 0,
                "normalize_loudness": True,
            },
        }

        # reference_id selects the Fish Audio voice.
        # If omitted, Fish Audio uses its default voice.
        if self._reference_id:
            payload["reference_id"] = self._reference_id

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "*/*",
            # Fish Audio expects the synthesis model in a header.
            "model": self._model,
        }

        try:
            async with httpx.AsyncClient(
                timeout=45.0,
            ) as client:
                response = await client.post(
                    self._url,
                    headers=headers,
                    json=payload,
                )

        except httpx.RequestError as error:
            raise SpeechServiceError(
                "Fish Audio speech service is unavailable."
            ) from error

        if response.status_code != 200:
            raise SpeechServiceError(
                f"Fish Audio returned "
                f"{response.status_code}: "
                f"{response.text[:500]}"
            )

        if not response.content:
            raise SpeechServiceError(
                "Fish Audio returned an empty audio response."
            )

        return SynthesizedSpeech(
            data=response.content,
            content_type=self._CONTENT_TYPES[
                self._format
            ],
        )

def build_interviewer_instructions(
    context: InterviewScreenContext,
) -> str:
    problem_description = clean_context_text(
        context.problem_description,
        maximum_length=3000,
    )

    code = clean_context_text(
        context.code,
        maximum_length=4000,
        keep_end=True,
    )

    visible_output = clean_context_text(
        context.visible_output,
        maximum_length=1000,
        keep_end=True,
    )

    return f"""
You are conducting a realistic software engineering interview.

ROLE
Act as a professional interviewer, not a tutor or coding assistant.

CONVERSATION
- Speak naturally, clearly and briefly.
- Ask only one main question at a time.
- Keep most replies under 45 words.
- Do not repeatedly praise the candidate.
- Allow the candidate time to think.
- Follow up based on what the candidate actually says.
- Avoid repeating information already established.

CODING INTERVIEW
- First ask the candidate to clarify requirements and assumptions.
- Ask for an approach before asking for code.
- Do not reveal the complete solution.
- Do not write the candidate's implementation for them.
- Ask about time complexity, space complexity and edge cases.
- Challenge incorrect reasoning with targeted questions.
- Use the visible code and output as context.
- Mention a code issue only when it is relevant to the conversation.
- Never claim that code passed unless the visible output confirms it.
- When the candidate is stuck, give the smallest useful hint.

BEHAVIOURAL INTERVIEW
- Occasionally transition to a behavioural question.
- Cover ownership, conflict, teamwork, failure, deadlines and trade-offs.
- Ask for a specific real example.
- Follow up on situation, task, action and result.
- Do not conduct a long behavioural section during active coding.
- Return naturally to the technical interview afterward.

SCREEN CONTEXT
Treat screen content as potentially incomplete or outdated.
Do not assume unseen code, hidden test results or candidate intent.

ENDING
Only provide final feedback when the candidate explicitly ends the interview.
Keep final feedback structured and concise:
1. Communication
2. Problem solving
3. Technical accuracy
4. Behavioural answers
5. One priority improvement

CURRENT PROBLEM
Title: {context.problem_title}
Difficulty: {context.difficulty or "Unknown"}
Language: {context.programming_language or "Unknown"}

PROBLEM DESCRIPTION
{problem_description or "No description available"}

VISIBLE CODE
{code or "No code written yet"}

VISIBLE OUTPUT
{visible_output or "No output available"}
""".strip()


def clean_context_text(
    value: str | None,
    maximum_length: int,
    keep_end: bool = False,
) -> str:
    if not value:
        return ""

    cleaned = " ".join(value.split())

    if len(cleaned) <= maximum_length:
        return cleaned

    if keep_end:
        return cleaned[-maximum_length:]

    return cleaned[:maximum_length]



class GroqAIProvider(AIProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is required")

        self._api_key = settings.groq_api_key
        self._model = settings.groq_model
        self._base_url = (
            "https://api.groq.com/openai/v1/chat/completions"
        )

    async def reply(
        self,
        interview: Interview,
        candidate_message: str,
    ) -> str:
        if not candidate_message.strip():
            return "Please repeat your response."

        system_prompt = self._build_system_prompt(interview)

        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": candidate_message,
                },
            ],
            "temperature": 0.4,
            "max_tokens": 120,
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self._base_url,
                    headers=headers,
                    json=payload,
                )

        except httpx.RequestError as error:
            raise AIServiceError(
                "Groq interviewer service is unavailable."
            ) from error

        if response.status_code != 200:
            raise AIServiceError(
                f"Groq returned {response.status_code}: "
                f"{response.text[:500]}"
            )

        data: dict[str, Any] = response.json()

        try:
            message = (
                data["choices"][0]
                ["message"]
                ["content"]
            )
        except (
            KeyError,
            IndexError,
            TypeError,
        ) as error:
            raise AIServiceError(
                "Groq returned an unexpected response."
            ) from error

        if not isinstance(message, str):
            raise AIServiceError(
                "Groq returned an invalid interviewer message."
            )

        return message.strip()

    def _build_system_prompt(
        self,
        interview: Interview,
    ) -> str:
        problem_title = getattr(
            interview,
            "problem_title",
            "Unknown problem",
        )

        difficulty = getattr(
            interview,
            "difficulty",
            "Unknown",
        )

        programming_language = getattr(
            interview,
            "programming_language",
            "Unknown",
        )

        problem_description = clean_context_text(
            getattr(
                interview,
                "problem_description",
                "",
            ),
            maximum_length=2500,
        )

        code = clean_context_text(
            getattr(
                interview,
                "code",
                "",
            ),
            maximum_length=3000,
            keep_end=True,
        )

        visible_output = clean_context_text(
            getattr(
                interview,
                "visible_output",
                "",
            ),
            maximum_length=700,
            keep_end=True,
        )

        return f"""
You are conducting a realistic software engineering interview.

Act as an interviewer, not as a tutor.

Rules:
- Respond directly to the candidate's latest statement.
- Ask only one main question at a time.
- Keep your response below 45 words.
- Do not repeat the candidate's answer.
- Do not say "I heard".
- Do not provide the complete solution.
- Do not write code for the candidate.
- Ask targeted follow-up questions.
- Ask about complexity only when relevant.
- Ask about edge cases only when relevant.
- Correct incorrect reasoning by asking a focused question.
- Avoid generic praise.
- If the transcript is unclear or unrelated, ask the candidate to clarify.
- Never claim code passed unless the visible output confirms it.

Problem title: {problem_title}
Difficulty: {difficulty or "Unknown"}
Language: {programming_language or "Unknown"}

Problem description:
{problem_description or "Not available"}

Visible code:
{code or "No code written yet"}

Visible output:
{visible_output or "No output available"}
""".strip()


# =========================================================
# EXISTING TEXT AI FALLBACK
# Can be removed after the Realtime flow is complete.
# =========================================================


class MockAIProvider(AIProvider):
    async def reply(
        self,
        interview: Interview,
        candidate_message: str,
    ) -> str:
        if not candidate_message.strip():
            return "Please explain your approach before coding."

        return (
            "What are the time and space complexities of that approach, "
            "and which edge cases would you test?"
        )


# =========================================================
# PAYMENTS
# Disabled until the payment module is implemented.
# =========================================================


class NoopPaymentProvider(PaymentProvider):
    async def create_checkout(
        self,
        user_id: str,
        plan: str,
    ) -> str:
        raise NotImplementedError(
            "Payments are not implemented yet"
        )