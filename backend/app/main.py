import base64
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware

from .adapters import (
    DeepgramTranscriptionProvider,
    AIServiceError,
    RealtimeServiceError,
    GroqAIProvider,
    SpeechServiceError,
    TranscriptionServiceError,
)
from .config import get_settings
from .dependencies import (
    current_user,
    get_ai_provider,
    get_realtime_voice_provider,
    get_speech_provider,
    get_repository,
    get_transcription_provider,
)
from .domain import (
    AuthenticatedUser,
    InterviewRepository,
    InterviewScreenContext,
    RealtimeVoiceProvider,
    SpeechProvider,
)
from .schemas import (
    InterviewContextUpdate,
    InterviewCreate,
    InterviewOut,
    InterviewTurnOut,
    RealtimeSessionCreate,
    SpeechSynthesisIn,
    SpeechSynthesisOut,
    UserOut,
)


settings = get_settings()

app = FastAPI(
    title="LeetAlly API",
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://leetcode.com",
        "https://www.leetcode.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"(chrome-extension|opera-extension)://.*",
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
    ],
)


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": app.version,
    }


@app.get(
    "/api/v1/auth/me",
    response_model=UserOut,
)
async def me(
    user: AuthenticatedUser = Depends(current_user),
) -> AuthenticatedUser:
    return user


@app.post(
    "/api/v1/interviews",
    response_model=InterviewOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview(
    payload: InterviewCreate,
    user: AuthenticatedUser = Depends(current_user),
    repository: InterviewRepository = Depends(get_repository),
):
    return await repository.create(
        user_id=user.id,
        data=payload.model_dump(),
    )


@app.get(
    "/api/v1/interviews/{interview_id}",
    response_model=InterviewOut,
)
async def read_interview(
    interview_id: str,
    user: AuthenticatedUser = Depends(current_user),
    repository: InterviewRepository = Depends(get_repository),
):
    interview = await repository.get(
        interview_id=interview_id,
        user_id=user.id,
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    return interview


@app.post(
    "/api/v1/interviews/{interview_id}/turns/audio",
    response_model=InterviewTurnOut,
)
async def submit_interview_audio(
    interview_id: str,
    audio: UploadFile = File(...),
    user: AuthenticatedUser = Depends(current_user),
    repository: InterviewRepository = Depends(
        get_repository
    ),
    transcription_provider: DeepgramTranscriptionProvider = Depends(
        get_transcription_provider
    ),
    ai_provider: GroqAIProvider = Depends(
        get_ai_provider
    ),
    speech_provider: SpeechProvider = Depends(
        get_speech_provider
    ),
) -> InterviewTurnOut:
    interview = await repository.get(
        interview_id=interview_id,
        user_id=user.id,
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    content_type = (
        (audio.content_type or "")
        .split(";")[0]
        .strip()
        .lower()
    )

    allowed_content_types = {
        "audio/webm",
        "audio/wav",
        "audio/x-wav",
    }

    if content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio type: {content_type}",
        )

    audio_bytes = await audio.read()

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded audio file is empty.",
        )

    max_audio_size_bytes = 10 * 1024 * 1024

    if len(audio_bytes) > max_audio_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The uploaded audio file is too large.",
        )

    print(
        "Received interview audio:",
        {
            "interview_id": interview_id,
            "user_id": user.id,
            "filename": audio.filename,
            "content_type": content_type,
            "size_bytes": len(audio_bytes),
        },
    )

    try:
        transcript = await transcription_provider.transcribe(
            audio_bytes=audio_bytes,
            content_type=content_type,
        )

    except TranscriptionServiceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    print(
        "Deepgram transcript:",
        {
            "interview_id": interview_id,
            "transcript": transcript,
        },
    )

    if not transcript:
        return InterviewTurnOut(
            transcript="",
            interviewer_message=(
                "I could not clearly hear your response. "
                "Please repeat it."
            ),
        )

    try:
        interviewer_message = await ai_provider.reply(
            interview=interview,
            candidate_message=transcript,
        )

    except AIServiceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    print(
        "Groq interviewer response:",
        {
            "interview_id": interview_id,
            "message": interviewer_message,
        },
    )

    interviewer_audio_base64: str | None = None
    interviewer_audio_content_type: str | None = None

    try:
        synthesized_speech = await speech_provider.synthesize(
            interviewer_message
        )

    except SpeechServiceError as error:
        # Continue with text if Fish Audio is temporarily unavailable.
        print(
            "Fish Audio synthesis failed:",
            {
                "interview_id": interview_id,
                "error": str(error),
            },
        )

    else:
        interviewer_audio_base64 = base64.b64encode(
            synthesized_speech.data
        ).decode("ascii")

        interviewer_audio_content_type = (
            synthesized_speech.content_type
        )

        print(
            "Fish Audio synthesis complete:",
            {
                "interview_id": interview_id,
                "content_type": (
                    interviewer_audio_content_type
                ),
                "size_bytes": len(
                    synthesized_speech.data
                ),
            },
        )

    print(
        "Interview context:",
        {
            "interview_id": interview.id,
            "problem_title": interview.problem_title,
            "problem_description_length": len(
                interview.problem_description or ""
            ),
            "difficulty": interview.difficulty,
            "programming_language":
            interview.screen_context.programming_language,
            "code_length": len(
                interview.code or ""
            ),
            "visible_output":
            interview.visible_output,
        },
    )

    return InterviewTurnOut(
        transcript=transcript,
        interviewer_message=interviewer_message,
        interviewer_audio_base64=(
            interviewer_audio_base64
        ),
        interviewer_audio_content_type=(
            interviewer_audio_content_type
        ),
    )

@app.post(
    "/api/v1/speech",
    response_model=SpeechSynthesisOut,
)
async def synthesize_speech(
    payload: SpeechSynthesisIn,
    user: AuthenticatedUser = Depends(current_user),
    speech_provider: SpeechProvider = Depends(
        get_speech_provider
    ),
) -> SpeechSynthesisOut:
    try:
        speech = await speech_provider.synthesize(
            payload.text
        )

    except SpeechServiceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    print(
        "Fish Audio standalone synthesis complete:",
        {
            "user_id": user.id,
            "content_type": speech.content_type,
            "size_bytes": len(speech.data),
        },
    )

    return SpeechSynthesisOut(
        audio_base64=base64.b64encode(
            speech.data
        ).decode("ascii"),
        audio_content_type=speech.content_type,
    )

@app.post("/api/v1/realtime/session")
async def create_realtime_session(
    payload: RealtimeSessionCreate,
    user: AuthenticatedUser = Depends(current_user),
    voice_provider: RealtimeVoiceProvider = Depends(
        get_realtime_voice_provider
    ),
):
    context = InterviewScreenContext(
        problem_title=payload.problem_title,
        problem_description=payload.problem_description,
        difficulty=payload.difficulty,
        programming_language=payload.programming_language,
        code=payload.code,
        visible_output=payload.visible_output,
    )

    try:
        return await voice_provider.create_client_secret(
            user=user,
            context=context,
        )

    except RealtimeServiceError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error


@app.patch(
    "/api/v1/interviews/{interview_id}/context",
    response_model=InterviewOut,
)
async def update_interview_context(
    interview_id: str,
    payload: InterviewContextUpdate,
    user: AuthenticatedUser = Depends(current_user),
    repository: InterviewRepository = Depends(get_repository),
):
    interview = await repository.update_context(
        interview_id=interview_id,
        user_id=user.id,
        data=payload.model_dump(
            exclude_none=True,
        ),
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )

    print(
        "Interview context updated:",
        {
            "interview_id": interview_id,
            "problem_title": payload.problem_title,
            "language": payload.programming_language,
            "code_length": (
                len(payload.code)
                if payload.code is not None
                else None
            ),
        },
    )

    return interview
