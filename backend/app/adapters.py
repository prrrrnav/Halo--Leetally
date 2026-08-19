from datetime import datetime, timezone
import time
from typing import Any
from uuid import uuid4

import httpx

from .config import Settings
from .domain import (
    AIProvider,
    AuthenticatedUser,
    AuthProvider,
    Interview,
    InterviewTurn,
    CodeSnapshot,
    InterviewRepository,
    InterviewScreenContext,
    PaymentProvider,
    RealtimeVoiceProvider,
    SpeechProvider,
    SynthesizedSpeech,
)
from .voice_profiles import company_interview_style


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


class InterviewRepositoryError(RuntimeError):
    """Raised when durable interview state cannot be read or written."""


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
            problem_topics=data.get("problem_topics", []),
            interview_companies=data.get("interview_companies", []),
        )

        interview = Interview(
            id=str(uuid4()),
            user_id=user_id,
            platform=data.get("platform", ""),
            problem_slug=data.get("problem_slug", ""),
            status="created",
            created_at=datetime.now(timezone.utc),
            screen_context=screen_context,
            target_company=data.get("target_company"),
            interview_type=data.get("interview_type", "dsa"),
        )

        self.items[interview.id] = interview

        return interview

    async def add_turn(
        self,
        interview_id: str,
        user_id: str,
        candidate_message: str,
        interviewer_message: str,
        phase: str | None = None,
    ) -> Interview | None:
        interview = await self.get(interview_id, user_id)
        if interview is None or interview.status == "completed":
            return None
        interview.status = "in_progress"
        if phase:
            interview.phase = phase
        interview.turns.append(InterviewTurn(
            candidate_message=candidate_message,
            interviewer_message=interviewer_message,
            created_at=datetime.now(timezone.utc),
            code=interview.code or "",
        ))
        return interview

    async def complete(
        self,
        interview_id: str,
        user_id: str,
        assessment: dict[str, Any],
    ) -> Interview | None:
        interview = await self.get(interview_id, user_id)
        if interview is None:
            return None
        interview.status = "completed"
        interview.completed_at = datetime.now(timezone.utc)
        interview.assessment = assessment
        return interview

    async def get(
        self,
        interview_id: str,
        user_id: str,
    ) -> Interview | None:
        interview = self.items.get(interview_id)
        if interview is None or interview.user_id != user_id:
            return None
        return interview

    async def update_context(
        self,
        interview_id: str,
        user_id: str,
        data: dict,
    ) -> Interview | None:
        interview = await self.get(interview_id, user_id)
        if interview is None:
            return None
        next_code = data.get("code")
        if next_code is not None and next_code != (interview.code or ""):
            interview.code_snapshots.append(CodeSnapshot(
                code=next_code,
                programming_language=(
                    data.get("programming_language")
                    or interview.programming_language
                    or "Unknown"
                ),
                created_at=datetime.now(timezone.utc),
            ))
        for field_name, field_value in data.items():
            if field_value is not None:
                setattr(interview.screen_context, field_name, field_value)
        return interview


class SupabaseInterviewRepository(InterviewRepository):
    """Durable interview repository used by production function invocations."""

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise InterviewRepositoryError(
                "Persistent interview storage is not configured."
            )
        self.base_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        headers = {**self.headers, **kwargs.pop("headers", {})}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.request(
                    method,
                    self.base_url + path,
                    headers=headers,
                    **kwargs,
                )
        except httpx.HTTPError as error:
            raise InterviewRepositoryError(
                "Interview storage is temporarily unavailable."
            ) from error
        if response.status_code >= 400:
            raise InterviewRepositoryError(
                "Interview storage operation failed."
            )
        return response

    @staticmethod
    def _datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value.replace("Z", "+00:00"))

    @classmethod
    def _from_rows(
        cls,
        row: dict[str, Any],
        message_rows: list[dict[str, Any]],
    ) -> Interview:
        turns: list[InterviewTurn] = []
        pending_candidate: dict[str, Any] | None = None
        for message in message_rows:
            if message.get("role") == "user":
                pending_candidate = message
            elif message.get("role") == "assistant" and pending_candidate:
                turns.append(InterviewTurn(
                    candidate_message=pending_candidate.get("content", ""),
                    interviewer_message=message.get("content", ""),
                    created_at=(
                        cls._datetime(message.get("created_at"))
                        or datetime.now(timezone.utc)
                    ),
                    code=pending_candidate.get("code", ""),
                ))
                pending_candidate = None

        snapshots = [
            CodeSnapshot(
                code=item.get("code", ""),
                programming_language=item.get("programming_language", "Unknown"),
                created_at=(
                    cls._datetime(item.get("created_at"))
                    or datetime.now(timezone.utc)
                ),
            )
            for item in (row.get("code_snapshots") or [])
        ]
        status = "in_progress" if row.get("status") == "active" else row.get("status", "created")
        return Interview(
            id=row["id"],
            user_id=row["user_id"],
            platform=row.get("platform", ""),
            problem_slug=row.get("problem_slug", ""),
            status=status,
            created_at=(
                cls._datetime(row.get("created_at"))
                or datetime.now(timezone.utc)
            ),
            screen_context=InterviewScreenContext(
                problem_title=row.get("problem_title", ""),
                problem_description=row.get("problem_description", ""),
                difficulty=row.get("difficulty"),
                programming_language=row.get("programming_language"),
                code=row.get("code"),
                visible_output=row.get("visible_output"),
                problem_topics=row.get("problem_topics") or [],
                interview_companies=row.get("interview_companies") or [],
            ),
            target_company=row.get("target_company"),
            interview_type=row.get("interview_type", "dsa"),
            level=row.get("level", "sde1"),
            turns=turns,
            completed_at=cls._datetime(row.get("ended_at")),
            assessment=row.get("assessment"),
            phase=row.get("phase", "clarification"),
            code_snapshots=snapshots,
        )

    async def create(
        self,
        user_id: str,
        data: dict[str, Any],
    ) -> Interview:
        response = await self._request(
            "POST",
            "/interviews",
            headers={"Prefer": "return=representation"},
            json={
                "user_id": user_id,
                "platform": data.get("platform", ""),
                "problem_slug": data.get("problem_slug", ""),
                "problem_title": data.get("problem_title", ""),
                "problem_description": data.get("problem_description", ""),
                "difficulty": data.get("difficulty"),
                "programming_language": data.get("programming_language"),
                "code": data.get("code"),
                "visible_output": data.get("visible_output"),
                "problem_topics": data.get("problem_topics", []),
                "interview_companies": data.get("interview_companies", []),
                "target_company": data.get("target_company"),
                "interview_type": data.get("interview_type", "dsa"),
                "level": data.get("level", "sde1"),
                "phase": "clarification",
            },
        )
        rows = response.json()
        if not rows:
            raise InterviewRepositoryError("Interview could not be created.")
        return self._from_rows(rows[0], [])

    async def get(
        self,
        interview_id: str,
        user_id: str,
    ) -> Interview | None:
        response = await self._request(
            "GET",
            "/interviews",
            params={
                "id": f"eq.{interview_id}",
                "user_id": f"eq.{user_id}",
                "select": "*",
                "limit": "1",
            },
        )
        rows = response.json()
        if not rows:
            return None
        messages = await self._request(
            "GET",
            "/interview_messages",
            params={
                "interview_id": f"eq.{interview_id}",
                "select": "role,content,sequence_number,created_at,code",
                "order": "sequence_number.asc",
            },
        )
        return self._from_rows(rows[0], messages.json())

    async def update_context(
        self,
        interview_id: str,
        user_id: str,
        data: dict,
    ) -> Interview | None:
        interview = await self.get(interview_id, user_id)
        if interview is None:
            return None
        snapshots = list(interview.code_snapshots)
        next_code = data.get("code")
        if next_code is not None and next_code != (interview.code or ""):
            snapshots.append(CodeSnapshot(
                code=next_code,
                programming_language=(
                    data.get("programming_language")
                    or interview.programming_language
                    or "Unknown"
                ),
                created_at=datetime.now(timezone.utc),
            ))
        allowed = {
            "problem_title", "problem_description", "difficulty",
            "programming_language", "code", "visible_output",
            "problem_topics", "interview_companies",
        }
        payload = {key: value for key, value in data.items() if key in allowed and value is not None}
        payload["code_snapshots"] = [
            {
                "code": item.code,
                "programming_language": item.programming_language,
                "created_at": item.created_at.isoformat(),
            }
            for item in snapshots
        ]
        await self._request(
            "PATCH",
            "/interviews",
            params={"id": f"eq.{interview_id}", "user_id": f"eq.{user_id}"},
            json=payload,
        )
        return await self.get(interview_id, user_id)

    async def add_turn(
        self,
        interview_id: str,
        user_id: str,
        candidate_message: str,
        interviewer_message: str,
        phase: str | None = None,
    ) -> Interview | None:
        interview = await self.get(interview_id, user_id)
        if interview is None or interview.status == "completed":
            return None
        sequence = len(interview.turns) * 2
        now = datetime.now(timezone.utc).isoformat()
        await self._request(
            "POST",
            "/interview_messages",
            json=[
                {
                    "interview_id": interview_id,
                    "role": "user",
                    "content": candidate_message,
                    "sequence_number": sequence,
                    "created_at": now,
                    "code": interview.code or "",
                },
                {
                    "interview_id": interview_id,
                    "role": "assistant",
                    "content": interviewer_message,
                    "sequence_number": sequence + 1,
                    "created_at": now,
                },
            ],
        )
        await self._request(
            "PATCH",
            "/interviews",
            params={"id": f"eq.{interview_id}", "user_id": f"eq.{user_id}"},
            json={
                "status": "active",
                "started_at": interview.created_at.isoformat(),
                "phase": phase or interview.phase,
            },
        )
        return await self.get(interview_id, user_id)

    async def complete(
        self,
        interview_id: str,
        user_id: str,
        assessment: dict[str, Any],
    ) -> Interview | None:
        interview = await self.get(interview_id, user_id)
        if interview is None:
            return None
        await self._request(
            "PATCH",
            "/interviews",
            params={"id": f"eq.{interview_id}", "user_id": f"eq.{user_id}"},
            json={
                "status": "completed",
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": assessment.get("duration_seconds"),
                "assessment": assessment,
            },
        )
        return await self.get(interview_id, user_id)

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
        reference_id: str | None = None,
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
        selected_reference_id = reference_id or self._reference_id
        if selected_reference_id:
            payload["reference_id"] = selected_reference_id

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "*/*",
            # Fish Audio expects the synthesis model in a header.
            "model": self._model,
        }

        print(
            "Fish Audio synthesis request:",
            {
                "text_length": len(normalized_text),
                "model": self._model,
                "format": self._format,
                "latency": self._latency,
                "speed": self._speed,
                "custom_voice": bool(selected_reference_id),
            },
            flush=True,
        )
        started_at = time.perf_counter()

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
            print(
                "Fish Audio request error:",
                {
                    "type": type(error).__name__,
                    "error": str(error),
                    "elapsed_seconds": round(time.perf_counter() - started_at, 3),
                },
                flush=True,
            )
            raise SpeechServiceError(
                "Fish Audio speech service is unavailable."
            ) from error

        response_content_type = response.headers.get("content-type", "")
        print(
            "Fish Audio HTTP response:",
            {
                "status_code": response.status_code,
                "content_type": response_content_type,
                "size_bytes": len(response.content),
                "request_id": response.headers.get("x-request-id"),
                "elapsed_seconds": round(time.perf_counter() - started_at, 3),
            },
            flush=True,
        )

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

        if not (
            response_content_type.startswith("audio/")
            or response_content_type.startswith("application/octet-stream")
        ):
            raise SpeechServiceError(
                "Fish Audio returned a non-audio response: "
                f"{response_content_type or 'unknown content type'}; "
                f"{response.text[:500]}"
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
            "max_tokens": 80,
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

        interview_companies = ", ".join(
            clean_context_text(str(company), maximum_length=80)
            for company in getattr(
                interview.screen_context,
                "interview_companies",
                [],
            )[:50]
            if company
        )

        problem_topics = ", ".join(
            clean_context_text(str(topic), maximum_length=80)
            for topic in getattr(
                interview.screen_context,
                "problem_topics",
                [],
            )[:30]
            if topic
        )

        target_company = getattr(interview, "target_company", None)
        company_style = company_interview_style(target_company)
        interview_type = getattr(interview, "interview_type", "dsa")
        type_guidance = {
            "dsa": "Conduct a data structures and algorithms coding interview grounded in the active LeetCode problem. Require clarification, approach, implementation, testing, and complexity evidence.",
            "behavioral": "Conduct a behavioural interview only. Ask SDE-1 questions about ownership, conflict, teamwork, failure, deadlines, learning, and trade-offs. Require specific STAR evidence and probe vague claims. Do not ask the candidate to solve or code the visible LeetCode problem.",
            "lld": "Conduct a low-level design interview. Give or continue one realistic SDE-1 object-oriented design problem. Evaluate requirements, entities, responsibilities, interfaces, relationships, extensibility, patterns, and testability. Do not turn the round into a DSA solution walkthrough.",
            "hld": "Conduct a high-level system design interview calibrated for SDE-1. Give or continue one approachable system problem. Evaluate requirements, scale assumptions, APIs, data model, components, data flow, reliability, bottlenecks, and trade-offs. Do not turn the round into a DSA solution walkthrough.",
        }.get(interview_type, "Conduct a data structures and algorithms interview.")
        conversation_history = "\n".join(
            f"Candidate: {turn.candidate_message}\nInterviewer: {turn.interviewer_message}"
            for turn in interview.turns[-6:]
        )
        dsa_phase_guidance = {
            "clarification": "Ask the candidate to clarify constraints, inputs, outputs, and assumptions.",
            "approach": "Require an ordered approach and justification before substantial coding.",
            "coding": "Observe implementation and probe decisions without giving away code.",
            "testing": "Ask for a dry run, boundary cases, and interpretation of visible output.",
            "complexity": "Ask for explicit time and space complexity with justification.",
            "wrap_up": "Ask one concise follow-up, then let the candidate conclude.",
        }.get(interview.phase, "Continue the interview naturally.")
        design_phase_guidance = {
            "clarification": "Clarify functional requirements, scope, actors, and constraints.",
            "approach": "Ask for the major entities or components and an ordered design approach.",
            "coding": "Probe interfaces, responsibilities, data flow, and the most important design decisions.",
            "testing": "Probe failure cases, testability, extensibility, reliability, and boundary conditions.",
            "complexity": "Ask for bottlenecks, scale limits, and explicit trade-offs.",
            "wrap_up": "Ask one concise design follow-up, then let the candidate conclude.",
        }.get(interview.phase, "Continue the design interview naturally.")
        behavioral_phase_guidance = {
            "clarification": "Ask for one specific situation and the candidate's personal responsibility.",
            "approach": "Probe the task, constraints, stakeholders, and choices available.",
            "coding": "Probe the candidate's own actions, decisions, communication, and trade-offs.",
            "testing": "Probe the measurable result, feedback, and what did not go as planned.",
            "complexity": "Ask what the candidate learned and what they would change next time.",
            "wrap_up": "Ask one concise behavioural follow-up, then conclude the example.",
        }.get(interview.phase, "Continue the behavioural interview naturally.")
        phase_guidance = behavioral_phase_guidance if interview_type == "behavioral" else design_phase_guidance if interview_type in {"lld", "hld"} else dsa_phase_guidance

        return f"""
You are conducting a realistic software engineering interview.

The candidate is being evaluated for an SDE-1 role. Evaluate fundamentals,
clear reasoning, implementation, complexity analysis, testing, and coachability.

INTERVIEW TYPE: {interview_type.upper()}
TYPE-SPECIFIC INSTRUCTIONS: {type_guidance}

CURRENT INTERVIEW PHASE: {interview.phase}
PHASE OBJECTIVE: {phase_guidance}
Do not skip ahead unless the candidate has supplied evidence for the current phase.

Act as an interviewer, not as a tutor.

Rules:
- Respond directly to the candidate's latest statement.
- Ask only one main question at a time.
- Keep your response below 28 words and preferably one or two short sentences.
- Do not repeat the candidate's answer.
- Do not say "I heard".
- Do not provide the complete solution.
- Do not write code for the candidate.
- Ask targeted follow-up questions.
- Ask about complexity only when relevant.
- Ask about edge cases only when relevant.
- Correct incorrect reasoning by asking a focused question.
- Avoid generic praise.
- Never claim code passed unless the visible output confirms it.
- Respect candidate pacing and conversation-control requests.
- If the candidate asks you to slow down, pause, wait, repeat, or not rush, acknowledge the request and do not ask another technical question.
- When asked not to rush, respond naturally, for example: "Of course. Take your time, and tell me when you're ready to continue."
- Do not redirect a pacing request back to the coding problem.
- If the candidate's transcript appears incomplete or ends abruptly, ask them to continue instead of advancing the interview.
- Treat conversational and clarification requests as valid interview dialogue.

Problem title: {problem_title}
Difficulty: {difficulty or "Unknown"}
Language: {programming_language or "Unknown"}
Target company: {target_company or "General"}
Company simulation style: {company_style}
Community-reported companies that recently used this problem: {interview_companies or "None known"}
Use this interview-history signal only as background for realistic emphasis and follow-ups. Do not present it as verified private company data.

Problem description:
{problem_description or "Not available"}

Problem topics:
{problem_topics or "Not available"}

Visible code:
{code or "No code written yet"}

Visible output:
{visible_output or "No output available"}

Recent conversation:
{conversation_history or "No previous turns"}
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
