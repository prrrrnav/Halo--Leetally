import base64
import hashlib
import json
import logging
import time
import io
import math
import struct
import wave
from datetime import datetime, timezone
from uuid import UUID, uuid4
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
    Request,
)
from fastapi.responses import JSONResponse, RedirectResponse
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
from .billing import (
    PLANS,
    BillingConfigurationError,
    BillingProviderError,
    BillingRepository,
    CashfreeClient,
    cashfree_webhook_unix_seconds,
    parse_lifecycle_webhook,
    parse_successful_webhook,
    verify_cashfree_signature,
)
from .account_data import AccountDataError, SupabaseAccountDataService
from .friends import FriendServiceError, SupabaseFriendService
from .dependencies import (
    current_user,
    get_ai_provider,
    get_realtime_voice_provider,
    get_speech_provider,
    get_repository,
    get_transcription_provider,
    get_billing_repository,
    get_cashfree_client,
    get_trial_access_repository,
)
from .domain import (
    AuthenticatedUser,
    InterviewRepository,
    InterviewScreenContext,
    RealtimeVoiceProvider,
    SpeechProvider,
)
from .schemas import (
    AccountDeleteIn,
    InterviewContextUpdate,
    InterviewCreate,
    InterviewOut,
    InterviewTurnOut,
    InterviewCompleteIn,
    InterviewAssessmentOut,
    RealtimeSessionCreate,
    UserOut,
    BillingCheckoutIn,
    BillingCheckoutOut,
    BillingEntitlementOut,
    BillingPlanOut,
    FriendConnectionOut,
    FriendRequestIn,
)
from .voice_profiles import company_voice_reference
from .trial_access import TrialAccessError, TrialAccessRepository


settings = get_settings()
logger = logging.getLogger("leetally.api")
MODEL_CAPACITY_MESSAGE = (
    "Our AI models are running at full capacity right now. "
    "Please try again in a few minutes."
)

app = FastAPI(
    title="LeetAlly API",
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([
        "https://leetcode.com",
        "https://www.leetcode.com",
        *settings.cors_origin_list,
    ])),
    allow_origin_regex=(
        None
        if settings.app_env.lower() == "production"
        else r"(chrome-extension|opera-extension)://.*|https?://(localhost|127\.0\.0\.1)(:\d+)?"
    ),
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
    ],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = (
        request.headers.get("x-request-id")
        or request.headers.get("x-vercel-id")
        or str(uuid4())
    )
    started_at = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as error:
        logger.exception(json.dumps({
            "level": "error",
            "event": "unhandled_request_error",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "error_type": type(error).__name__,
            "duration_ms": round((time.perf_counter() - started_at) * 1000),
        }))
        response = JSONResponse(
            status_code=500,
            content={
                "detail": "Something went wrong. Please try again.",
                "request_id": request_id,
            },
        )
    if response.status_code >= 400:
        log = logger.error if response.status_code >= 500 else logger.warning
        log(json.dumps({
            "level": "error" if response.status_code >= 500 else "warning",
            "event": "request_failed",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round((time.perf_counter() - started_at) * 1000),
        }))
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
    if request.url.path.startswith(("/api/v1/billing", "/api/v1/interviews", "/api/v1/account", "/api/v1/friends")):
        response.headers["Cache-Control"] = "no-store"
    if settings.app_env.lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": app.version,
    }


@app.get("/api/v1/health/ready")
async def readiness():
    missing: list[str] = []
    if settings.app_env.lower() != "production":
        missing.append("APP_ENV=production")
    for name, value in (
        ("SUPABASE_SERVICE_ROLE_KEY", settings.supabase_service_role_key),
        ("DEEPGRAM_API_KEY", settings.deepgram_api_key),
        ("GROQ_API_KEY", settings.groq_api_key),
        ("FISH_AUDIO_API_KEY", settings.fish_audio_api_key),
    ):
        if not value:
            missing.append(name)
    if not any(origin.startswith("chrome-extension://") for origin in settings.cors_origin_list):
        missing.append("exact chrome-extension:// origin in CORS_ORIGINS")
    if settings.billing_enabled:
        for name, value in (
            ("CASHFREE_CLIENT_ID", settings.cashfree_client_id),
            ("CASHFREE_CLIENT_SECRET", settings.cashfree_client_secret),
        ):
            if not value:
                missing.append(name)
        if settings.cashfree_environment != "production":
            missing.append("CASHFREE_ENVIRONMENT=production")
    if missing:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "missing": missing},
        )
    return {"status": "ready", "version": app.version}


@app.get("/api/v1/billing/plans", response_model=list[BillingPlanOut])
async def billing_plans():
    return [plan.public_dict() for plan in PLANS.values()]


@app.post("/api/v1/billing/checkout", response_model=BillingCheckoutOut)
async def create_billing_checkout(
    payload: BillingCheckoutIn,
    user: AuthenticatedUser = Depends(current_user),
    repository: BillingRepository = Depends(get_billing_repository),
):
    if not settings.billing_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not enabled yet.",
        )
    try:
        existing = await repository.get_entitlement(user.id)
        if existing is not None and existing.status == "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Your Beta Monthly plan is already active. Cancel renewal before starting another subscription.",
            )
        provider = get_cashfree_client(settings)
        plan = PLANS[payload.plan_id]
        checkout = await provider.create_checkout(
            user=user,
            plan=plan,
            customer_name=payload.customer_name,
            phone=payload.phone,
            auto_renew=True,
        )
        await repository.save_checkout(checkout)
    except BillingConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except BillingProviderError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
    return {
        "reference": checkout.reference,
        "plan_id": checkout.plan_id,
        "purchase_type": checkout.purchase_type,
        "amount_inr": checkout.amount_inr,
        "currency": checkout.currency,
        "session_id": checkout.provider_session_id,
        "environment": settings.cashfree_environment,
    }


@app.get("/api/v1/billing/me", response_model=BillingEntitlementOut)
async def billing_me(
    user: AuthenticatedUser = Depends(current_user),
    repository: BillingRepository = Depends(get_billing_repository),
):
    entitlement = await repository.get_entitlement(user.id)
    if entitlement is None:
        return {"status": "none"}
    return entitlement.public_dict()


@app.post("/api/v1/billing/webhooks/cashfree")
async def cashfree_webhook(
    request: Request,
    repository: BillingRepository = Depends(get_billing_repository),
):
    if not settings.billing_enabled or not settings.cashfree_client_secret:
        raise HTTPException(status_code=503, detail="Billing is not configured.")
    raw_body = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp", "")
    signature = request.headers.get("x-webhook-signature", "")
    try:
        webhook_time = cashfree_webhook_unix_seconds(timestamp)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="Invalid webhook timestamp.") from error
    if abs(int(time.time()) - webhook_time) > settings.cashfree_webhook_tolerance_seconds:
        raise HTTPException(status_code=401, detail="Expired webhook timestamp.")
    if not verify_cashfree_signature(
        raw_body, timestamp, signature, settings.cashfree_client_secret
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")
    payload_hash = hashlib.sha256(raw_body).hexdigest()
    event_id = request.headers.get("x-idempotency-key") or payload_hash
    try:
        reference, event_type, amount, currency = parse_successful_webhook(raw_body)
    except ValueError:
        try:
            reference, event_type, next_status, auto_renew = parse_lifecycle_webhook(raw_body)
        except ValueError:
            return {"accepted": True, "activated": False}
        checkout = await repository.get_checkout(reference)
        if checkout is None:
            return {"accepted": True, "activated": False}
        changed = await repository.update_lifecycle(
            reference, event_id, event_type, payload_hash, next_status, auto_renew
        )
        return {"accepted": True, "activated": False, "updated": changed}
    checkout = await repository.get_checkout(reference)
    if checkout is None:
        raise HTTPException(status_code=404, detail="Unknown billing reference.")
    if amount != checkout.amount_inr or currency != checkout.currency:
        raise HTTPException(status_code=400, detail="Payment amount or currency mismatch.")
    if checkout.purchase_type == "one_time":
        try:
            provider = get_cashfree_client(settings)
            is_paid = await provider.verify_paid_order(reference, PLANS[checkout.plan_id])
        except (BillingConfigurationError, BillingProviderError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        if not is_paid:
            raise HTTPException(status_code=400, detail="Cashfree order is not paid.")
    activated = await repository.activate(
        checkout=checkout,
        event_id=event_id,
        event_type=event_type,
        payload_hash=payload_hash,
    )
    return {"accepted": True, "activated": activated}


@app.post("/api/v1/billing/cancel")
async def cancel_billing_renewal(
    user: AuthenticatedUser = Depends(current_user),
    repository: BillingRepository = Depends(get_billing_repository),
):
    entitlement = await repository.get_entitlement(user.id)
    if entitlement is None or not entitlement.auto_renew or not entitlement.provider_reference:
        raise HTTPException(status_code=409, detail="There is no active automatic renewal to cancel.")
    try:
        provider = get_cashfree_client(settings)
        await provider.cancel_subscription(entitlement.provider_reference)
        await repository.cancel_renewal(entitlement.provider_reference)
    except (BillingConfigurationError, BillingProviderError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {"cancelled": True, "access_until": entitlement.period_end}


@app.api_route("/api/v1/billing/return", methods=["GET", "POST"])
async def billing_return():
    # The browser return is informational only. Entitlements are granted solely
    # by the signature-verified Cashfree webhook above.
    return RedirectResponse(
        settings.billing_customer_return_url,
        status_code=status.HTTP_303_SEE_OTHER,
    )


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
    trial_access: TrialAccessRepository = Depends(get_trial_access_repository),
    billing_repository: BillingRepository = Depends(get_billing_repository),
):
    access_tier = "trial"
    if settings.billing_enabled:
        try:
            entitlement = await billing_repository.get_entitlement(user.id)
        except BillingProviderError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="We could not verify your interview access. Please try again shortly.",
            ) from error
        if entitlement is not None and entitlement.status == "active":
            access_tier = "beta_monthly"

    if access_tier == "trial":
        try:
            trial_available = await trial_access.claim(
                user_id=user.id,
                limit=settings.ai_interview_trial_limit,
            )
        except TrialAccessError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="We could not verify trial access. Please try again shortly.",
            ) from error
        if not trial_available:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Your beta interview allowance has been used. Beta Monthly access will be available after payments launch.",
            )
    interview_data = payload.model_dump()
    interview_data["access_tier"] = access_tier
    return await repository.create(
        user_id=user.id,
        data=interview_data,
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
    billing_repository: BillingRepository = Depends(get_billing_repository),
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
    if interview.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview is already complete.",
        )

    content_type = (
        (audio.content_type or "")
        .split(";")[0]
        .strip()
        .lower()
    )

    allowed_content_types = {
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

    speech_duration_seconds, speech_rms = _inspect_pcm_wav(audio_bytes, content_type)
    if speech_duration_seconds < settings.minimum_billable_speech_ms / 1000:
        return InterviewTurnOut(
            transcript="",
            interviewer_message="",
        )
    if speech_rms is not None and speech_rms < settings.minimum_speech_rms:
        return InterviewTurnOut(
            transcript="",
            interviewer_message="",
        )

    if settings.billing_enabled and interview.access_tier == "beta_monthly":
        entitlement = await billing_repository.get_entitlement(user.id)
        if entitlement is None or entitlement.status != "active":
            raise HTTPException(status_code=402, detail="No active interview entitlement.")
        remaining_seconds = entitlement.minutes_limit * 60 - entitlement.speech_seconds_used
        if math.ceil(speech_duration_seconds) > remaining_seconds:
            raise HTTPException(status_code=402, detail="Speech allowance exceeded.")

    print(
        "Received interview audio:",
        {
            "interview_id": interview_id,
            "filename": audio.filename,
            "content_type": content_type,
            "size_bytes": len(audio_bytes),
        },
        flush=True,
    )

    turn_started_at = time.perf_counter()
    transcription_started_at = time.perf_counter()
    try:
        transcript = await transcription_provider.transcribe(
            audio_bytes=audio_bytes,
            content_type=content_type,
        )

    except TranscriptionServiceError as error:
        logger.error(json.dumps({
            "level": "error",
            "event": "model_service_unavailable",
            "service": "transcription",
            "interview_id": interview_id,
            "error_type": type(error).__name__,
            "error": str(error)[:500],
        }))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MODEL_CAPACITY_MESSAGE,
        ) from error

    print(
        "Deepgram transcription complete:",
        {
            "interview_id": interview_id,
            "transcript_length": len(transcript),
            "elapsed_seconds": round(time.perf_counter() - transcription_started_at, 3),
        },
        flush=True,
    )

    if not transcript:
        return InterviewTurnOut(
            transcript="",
            interviewer_message=(
                "I could not clearly hear your response. "
                "Please repeat it."
            ),
        )

    interview.phase = _advance_sde1_phase(interview, transcript)

    ai_started_at = time.perf_counter()
    try:
        interviewer_message = await ai_provider.reply(
            interview=interview,
            candidate_message=transcript,
        )

    except AIServiceError as error:
        logger.error(json.dumps({
            "level": "error",
            "event": "model_service_unavailable",
            "service": "interviewer",
            "interview_id": interview_id,
            "error_type": type(error).__name__,
            "error": str(error)[:500],
        }))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MODEL_CAPACITY_MESSAGE,
        ) from error

    if settings.billing_enabled and interview.access_tier == "beta_monthly":
        usage_event_id = hashlib.sha256(
            interview_id.encode("utf-8") + audio_bytes
        ).hexdigest()
        try:
            await billing_repository.consume_speech_seconds(
                user_id=user.id,
                event_id=usage_event_id,
                interview_id=interview_id,
                seconds=max(1, math.ceil(speech_duration_seconds)),
            )
        except BillingProviderError as error:
            raise HTTPException(status_code=402, detail=str(error)) from error

    await repository.add_turn(
        interview_id=interview_id,
        user_id=user.id,
        candidate_message=transcript,
        interviewer_message=interviewer_message,
        phase=interview.phase,
    )

    print(
        "Groq interviewer response complete:",
        {
            "interview_id": interview_id,
            "message_length": len(interviewer_message),
            "elapsed_seconds": round(time.perf_counter() - ai_started_at, 3),
        },
        flush=True,
    )

    interviewer_audio_base64: str | None = None
    interviewer_audio_content_type: str | None = None
    service_notice: str | None = None

    speech_started_at = time.perf_counter()
    try:
        synthesized_speech = await speech_provider.synthesize(
            interviewer_message,
            company_voice_reference(
                interview.target_company,
                settings.fish_audio_reference_id,
            ),
        )

    except SpeechServiceError as error:
        # Continue with text if Fish Audio is temporarily unavailable.
        service_notice = MODEL_CAPACITY_MESSAGE
        logger.error(json.dumps({
                "level": "error",
                "event": "model_service_unavailable",
                "service": "speech",
                "interview_id": interview_id,
                "error_type": type(error).__name__,
                "error": str(error)[:500],
                "elapsed_seconds": round(time.perf_counter() - speech_started_at, 3),
        }))

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
                "elapsed_seconds": round(time.perf_counter() - speech_started_at, 3),
                "turn_elapsed_seconds": round(time.perf_counter() - turn_started_at, 3),
            },
            flush=True,
        )

    print(
        "Interview context:",
        {
            "interview_id": interview.id,
            "problem_description_length": len(
                interview.problem_description or ""
            ),
            "difficulty": interview.difficulty,
            "programming_language":
            interview.screen_context.programming_language,
            "code_length": len(
                interview.code or ""
            ),
            "visible_output_length": len(interview.visible_output or ""),
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
        service_notice=service_notice,
        phase=interview.phase,
    )


def _advance_sde1_phase(interview, candidate_message: str) -> str:
    """Advance monotonically when observable evidence satisfies a phase."""
    order = ["clarification", "approach", "coding", "testing", "complexity", "wrap_up"]
    current_index = order.index(interview.phase) if interview.phase in order else 0
    text = candidate_message.lower()
    transcript = " ".join(turn.candidate_message.lower() for turn in interview.turns) + " " + text
    has_clarification = any(term in transcript for term in (
        "constraint", "assume", "input", "output", "duplicate", "sorted", "clarify"
    )) or len(interview.turns) >= 1
    has_approach = any(term in transcript for term in (
        "approach", "first", "then", "because", "hash map", "two pointer", "iterate", "recursive"
    ))
    has_code = len((interview.code or "").strip()) >= 40
    has_testing = any(term in transcript for term in (
        "test", "dry run", "edge case", "empty", "single element", "boundary", "example"
    )) or bool(interview.visible_output)
    has_complexity = any(term in transcript for term in (
        "complexity", "time is", "space is", "o(", "big o"
    ))
    evidence = [has_clarification, has_approach, has_code, has_testing, has_complexity]
    next_index = current_index
    while next_index < len(evidence) and evidence[next_index]:
        next_index += 1
    return order[min(next_index, len(order) - 1)]


def _inspect_pcm_wav(audio_bytes: bytes, content_type: str) -> tuple[float, float | None]:
    """Return trusted duration and RMS for our PCM WAV voice segments.

    Other allowed formats retain a conservative byte-derived duration of zero;
    the current extension always uploads PCM WAV.
    """
    if content_type not in {"audio/wav", "audio/x-wav"}:
        return 0.0, None
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            width = wav_file.getsampwidth()
            channels = wav_file.getnchannels()
            if rate <= 0 or width != 2 or channels != 1:
                return 0.0, None
            raw = wav_file.readframes(frames)
    except (wave.Error, EOFError):
        return 0.0, None
    sample_count = len(raw) // 2
    if sample_count == 0:
        return 0.0, 0.0
    samples = struct.unpack(f"<{sample_count}h", raw)
    rms = math.sqrt(sum(sample * sample for sample in samples) / sample_count) / 32768
    return frames / rate, rms


def _build_sde1_assessment(interview, duration_seconds: int) -> dict:
    transcript = " ".join(turn.candidate_message for turn in interview.turns)
    lowered = transcript.lower()
    words = len(transcript.split())
    code = interview.code or ""

    def dimension(base: int, evidence: list[str], action: str) -> dict:
        return {"score": max(1, min(10, base)), "evidence": evidence, "next_action": action}

    approach = any(term in lowered for term in ("approach", "first", "then", "because", "iterate", "pointer", "hash", "recursive"))
    complexity = "complexity" in lowered or "o(" in lowered or "time is" in lowered or "space is" in lowered
    edges = any(term in lowered for term in ("edge case", "empty", "duplicate", "null", "single element", "overflow", "boundary"))
    tests = any(term in lowered for term in ("test", "example", "dry run", "input"))
    has_code = len(code.strip()) >= 40
    turn_count = len(interview.turns)
    revision_count = len(interview.code_snapshots)

    dimensions = {
        "communication": dimension(
            3 + min(3, words // 70) + (2 if approach else 0),
            [f"Explained reasoning across {turn_count} spoken response{'s' if turn_count != 1 else ''}.", f"Captured {words} words of candidate explanation."],
            "Explain the solution in three ordered steps before writing code.",
        ),
        "problem_solving": dimension(
            3 + (3 if approach else 0) + (1 if turn_count >= 3 else 0),
            ["A structured approach was stated." if approach else "No clearly ordered approach was captured."],
            "State the invariant and why the chosen data structure fits the constraints.",
        ),
        "implementation": dimension(
            3 + (3 if has_code else 0) + (1 if interview.visible_output else 0),
            [f"Captured {revision_count} distinct code revision{'s' if revision_count != 1 else ''}.", "Visible run output was captured." if interview.visible_output else "No confirmed run output was captured."],
            "Finish a runnable implementation and validate it against representative inputs.",
        ),
        "complexity": dimension(
            7 if complexity else 3,
            ["Time or space complexity was discussed." if complexity else "No explicit time and space complexity statement was captured."],
            "End every solution with explicit time and space complexity.",
        ),
        "testing": dimension(
            3 + (2 if edges else 0) + (2 if tests else 0),
            [("Edge cases were discussed." if edges else "No explicit edge-case discussion was captured."), ("A test or dry run was discussed." if tests else "No test walkthrough was captured.")],
            "Dry-run one normal case and name at least two boundary cases.",
        ),
    }
    overall = round(sum(item["score"] for item in dimensions.values()) / len(dimensions))
    signal = "strong_hire" if overall >= 9 else "hire" if overall >= 7 else "lean_hire" if overall >= 5 else "not_yet"
    ranked = sorted(dimensions.items(), key=lambda item: item[1]["score"])
    improvements = [item[1]["next_action"] for item in ranked[:3]]
    strengths = [name.replace("_", " ").title() for name, item in dimensions.items() if item["score"] >= 7]
    return {
        "interview_id": interview.id,
        "level": "sde1",
        "overall_score": overall,
        "hiring_signal": signal,
        "summary": f"SDE-1 signal: {signal.replace('_', ' ')}. Your strongest evidence and gaps are tied to the recorded conversation and final code.",
        "dimensions": dimensions,
        "strengths": strengths or ["Completed a realistic spoken coding practice session"],
        "priority_improvements": improvements,
        "next_drills": [f"Redo {interview.problem_title} with a 2-minute approach explanation before coding.", improvements[0], "Complete one timed medium problem and verbalize tests before running code."],
        "duration_seconds": duration_seconds,
        "completed_at": datetime.now(timezone.utc),
    }


@app.post(
    "/api/v1/interviews/{interview_id}/complete",
    response_model=InterviewAssessmentOut,
)
async def complete_interview(
    interview_id: str,
    payload: InterviewCompleteIn,
    user: AuthenticatedUser = Depends(current_user),
    repository: InterviewRepository = Depends(get_repository),
):
    interview = await repository.get(interview_id, user.id)
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    assessment = interview.assessment or _build_sde1_assessment(interview, payload.duration_seconds)
    completed = await repository.complete(interview_id, user.id, assessment)
    if completed is None:
        raise HTTPException(status_code=404, detail="Interview not found.")
    return assessment

@app.post("/api/v1/realtime/session")
async def create_realtime_session(
    payload: RealtimeSessionCreate,
    user: AuthenticatedUser = Depends(current_user),
    voice_provider: RealtimeVoiceProvider = Depends(
        get_realtime_voice_provider
    ),
):
    if not settings.realtime_voice_enabled:
        raise HTTPException(
            status_code=404,
            detail="Realtime streaming is disabled; speech-gated mode is active.",
        )
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
    existing = await repository.get(interview_id=interview_id, user_id=user.id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found.",
        )
    if existing.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completed interview cannot be changed.",
        )
    interview = await repository.update_context(
        interview_id=interview_id,
        user_id=user.id,
        data=payload.model_dump(
            exclude_none=True,
        ),
    )

    print(
        "Interview context updated:",
        {
            "interview_id": interview_id,
            "language": payload.programming_language,
            "code_length": (
                len(payload.code)
                if payload.code is not None
                else None
            ),
        },
    )

    return interview


@app.get("/api/v1/account/export")
async def export_account_data(
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        service = SupabaseAccountDataService(settings)
        return await service.export(user.id, user.email)
    except AccountDataError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.delete("/api/v1/account")
async def delete_account(
    payload: AccountDeleteIn,
    user: AuthenticatedUser = Depends(current_user),
    billing_repository: BillingRepository = Depends(get_billing_repository),
):
    del payload
    entitlement = await billing_repository.get_entitlement(user.id)
    if entitlement is not None and entitlement.auto_renew:
        raise HTTPException(
            status_code=409,
            detail="Cancel automatic renewal before deleting the account.",
        )
    try:
        service = SupabaseAccountDataService(settings)
        await service.delete(user.id)
    except AccountDataError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"deleted": True}


@app.get("/api/v1/friends", response_model=list[FriendConnectionOut])
async def list_friends(user: AuthenticatedUser = Depends(current_user)):
    try:
        return await SupabaseFriendService(settings).list(user.id)
    except FriendServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@app.post("/api/v1/friends", response_model=list[FriendConnectionOut])
async def request_friend(
    payload: FriendRequestIn,
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        return await SupabaseFriendService(settings).create(user.id, payload.email)
    except FriendServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@app.post(
    "/api/v1/friends/{relationship_id}/accept",
    response_model=list[FriendConnectionOut],
)
async def accept_friend(
    relationship_id: UUID,
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        return await SupabaseFriendService(settings).accept(user.id, str(relationship_id))
    except FriendServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@app.delete("/api/v1/friends/{relationship_id}", status_code=204)
async def remove_friend(
    relationship_id: UUID,
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        await SupabaseFriendService(settings).remove(user.id, str(relationship_id))
    except FriendServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error
