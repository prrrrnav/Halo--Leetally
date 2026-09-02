from fastapi.testclient import TestClient
import base64
import hashlib
import hmac
import io
import json
import struct
import time
import wave
import asyncio
from datetime import datetime, timedelta, timezone
import pytest

from app.billing import (
    PLANS, BillingEntitlement, BillingProviderError, CheckoutRecord,
    InMemoryBillingRepository, cashfree_webhook_unix_seconds,
    parse_lifecycle_webhook, parse_successful_webhook, verify_cashfree_signature,
)
from app.dependencies import (
    get_ai_provider,
    get_billing_repository,
    get_speech_provider,
    get_transcription_provider,
)
from app.domain import AuthenticatedUser, SynthesizedSpeech
from app.feedback import FeedbackServiceError, SupabaseFeedbackService
from app.friends import SupabaseFriendService
from app.adapters import (
    AIServiceError,
    GroqAIProvider,
    InvalidAccessTokenError,
    SpeechServiceError,
    SupabaseAuthProvider,
)
from app.config import Settings
from app.main import MODEL_CAPACITY_MESSAGE, _advance_sde1_phase, _inspect_pcm_wav, app, settings
from app.dependencies import (
    billing_repository,
    memory_service,
    repository,
    trial_access_repository,
)
from app.voice_profiles import COMPANY_VOICE_PROFILES, company_voice_reference

client = TestClient(app)
headers = {"Authorization": "Bearer test-user"}


@pytest.fixture(autouse=True)
def reset_in_memory_state():
    repository.items.clear()
    trial_access_repository.usage.clear()
    billing_repository.checkouts.clear()
    billing_repository.entitlements.clear()
    billing_repository.events.clear()
    memory_service.items.clear()
    yield
    repository.items.clear()
    trial_access_repository.usage.clear()
    billing_repository.checkouts.clear()
    billing_repository.entitlements.clear()
    billing_repository.events.clear()
    memory_service.items.clear()

def test_health():
    assert client.get("/api/v1/health").json()["status"] == "ok"
    readiness = client.get("/api/v1/health/ready")
    assert readiness.status_code == 503
    assert readiness.json()["detail"]["status"] == "not_ready"

def test_auth_required():
    assert client.get("/api/v1/auth/me").status_code == 401


def test_feedback_inbox_is_server_gated_to_owner_email():
    service = SupabaseFeedbackService(Settings(
        supabase_url="https://example.supabase.co",
        supabase_anon_key="anon",
        supabase_service_role_key="service-role",
        openai_api_key="test",
        feedback_admin_email="watershaper9.1@gmail.com",
    ))
    with pytest.raises(FeedbackServiceError) as blocked:
        asyncio.run(service.owner_list(AuthenticatedUser(
            id="not-owner",
            email="someone@example.com",
        )))
    assert blocked.value.status_code == 403


def test_production_auth_never_accepts_test_bearer_tokens(monkeypatch):
    class RejectingClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *args, **kwargs):
            return type("Response", (), {"status_code": 401})()

    monkeypatch.setattr("app.adapters.httpx.AsyncClient", RejectingClient)
    provider = SupabaseAuthProvider(Settings(
        app_env="production",
        supabase_url="https://example.supabase.co",
        supabase_anon_key="anon",
        openai_api_key="test",
    ))
    with pytest.raises(InvalidAccessTokenError):
        asyncio.run(provider.verify_token("test-user"))


def test_voice_provider_catalog_keeps_premium_voice_entitlement_gated():
    response = client.get("/api/v1/voice/providers", headers=headers)
    assert response.status_code == 200
    providers = {item["id"]: item for item in response.json()["providers"]}
    assert providers["fish"]["requires_paid"] is False
    assert providers["elevenlabs"]["requires_paid"] is True
    assert providers["elevenlabs"]["available"] is False


def test_trial_user_cannot_forge_elevenlabs_voice_request():
    class StubSpeechProvider:
        async def synthesize(self, text, reference_id=None):
            return SynthesizedSpeech(data=b"audio", content_type="audio/mpeg")

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode",
        "problem_slug": "two-sum",
        "problem_title": "Two Sum",
        "difficulty": "easy",
    }).json()
    app.dependency_overrides[get_speech_provider] = StubSpeechProvider
    try:
        response = client.post(
            f"/api/v1/interviews/{created['id']}/turns/audio/stream",
            headers=headers,
            data={"voice_provider": "elevenlabs"},
            files={"audio": ("candidate.wav", b"RIFF", "audio/wav")},
        )
    finally:
        app.dependency_overrides.pop(get_speech_provider, None)

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "ElevenLabs voice requires an active paid plan."
    )


def test_account_data_operations_require_server_configuration():
    assert client.get("/api/v1/account/export", headers=headers).status_code == 503
    response = client.request(
        "DELETE",
        "/api/v1/account",
        headers=headers,
        json={"confirmation": "DELETE"},
    )
    assert response.status_code == 503


def test_friend_connections_require_auth_and_server_configuration():
    assert client.get("/api/v1/friends").status_code == 401
    assert client.get("/api/v1/friends", headers=headers).status_code == 503
    assert client.post(
        "/api/v1/friends",
        headers=headers,
        json={"email": "friend@example.com"},
    ).status_code == 503
    assert client.post(
        "/api/v1/friends",
        headers=headers,
        json={"email": "not-an-email"},
    ).status_code == 422


def test_friend_progress_response_exposes_only_sanitized_profile_totals():
    public = SupabaseFriendService._public_progress({
        "progress": {
            "profile": {
                "username": "friend-user",
                "avatar": "https://example.com/avatar.png",
                "ranking": 42,
                "streak": 13,
                "totalSolved": 136,
                "easySolved": 88,
                "mediumSolved": 47,
                "hardSolved": 1,
                "syncedAt": "2026-08-27T00:00:00Z",
                "acceptedSlugs": ["private-problem"],
                "submissionActivity": {"2026-08-27": 12},
            },
            "interviews": [{"private": True}],
            "sheets": [{"private": True}],
        }
    })
    assert public == {
        "username": "friend-user",
        "avatar": "https://example.com/avatar.png",
        "ranking": 42,
        "streak": 13,
        "total_solved": 136,
        "easy_solved": 88,
        "medium_solved": 47,
        "hard_solved": 1,
        "synced_at": "2026-08-27T00:00:00Z",
    }

def test_create_and_read_interview():
    payload = {"platform":"leetcode","problem_slug":"two-sum","problem_title":"Two Sum","difficulty":"easy","target_company":"meta"}
    created = client.post("/api/v1/interviews", headers=headers, json=payload)
    assert created.status_code == 201
    assert created.json()["target_company"] == "meta"
    interview_id = created.json()["id"]
    fetched = client.get(f"/api/v1/interviews/{interview_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["target_company"] == "meta"
    assert client.get(f"/api/v1/interviews/{interview_id}", headers={"Authorization":"Bearer another-user"}).status_code == 404


def test_each_account_can_start_up_to_beta_interview_limit():
    payload = {"platform":"leetcode","problem_slug":"two-sum","problem_title":"Two Sum","difficulty":"easy"}
    first = client.post("/api/v1/interviews", headers=headers, json=payload)
    second = client.post("/api/v1/interviews", headers=headers, json=payload)
    another_user = client.post(
        "/api/v1/interviews",
        headers={"Authorization": "Bearer another-user"},
        json=payload,
    )

    assert first.status_code == 201
    assert second.status_code == 201

    exhausted = client.post("/api/v1/interviews", json=payload, headers=headers)
    assert exhausted.status_code == 402
    assert exhausted.json()["detail"] == "Your beta interview allowance has been used. Beta Monthly access will be available after payments launch."
    assert another_user.status_code == 201


def test_company_interview_history_reaches_the_ai_prompt():
    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
    response = client.patch(
        f"/api/v1/interviews/{created['id']}/context",
        headers=headers,
        json={
            "interview_companies": ["Google", "Amazon", "Meta"],
            "problem_topics": ["Array", "Hash Table"],
        },
    )
    assert response.status_code == 200

    provider = object.__new__(GroqAIProvider)
    prompt = provider._build_system_prompt(repository.items[created["id"]])
    assert "Community-reported companies that recently used this problem: Google, Amazon, Meta" in prompt
    assert "Problem topics:\nArray, Hash Table" in prompt
    assert "Do not present it as verified private company data" in prompt


def test_groq_failure_falls_back_to_openai_interviewer(monkeypatch):
    class FakeResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.headers = {"x-request-id": "sanitized-test-id"}
            self.text = ""

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, **kwargs):
            if "groq.com" in url:
                return FakeResponse(404, {})
            return FakeResponse(200, {
                "output": [{
                    "content": [{
                        "type": "output_text",
                        "text": "Why is a hash map the right trade-off here?",
                    }],
                }],
            })

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode",
        "problem_slug": "two-sum",
        "problem_title": "Two Sum",
        "difficulty": "easy",
    }).json()
    provider = object.__new__(GroqAIProvider)
    provider._api_key = "groq-test"
    provider._model = "groq-test-model"
    provider._base_url = "https://api.groq.com/openai/v1/chat/completions"
    provider._openai_api_key = "openai-test"
    provider._openai_model = "gpt-test"
    provider._openai_url = "https://api.openai.com/v1/responses"
    monkeypatch.setattr("app.adapters.httpx.AsyncClient", FakeClient)

    reply = asyncio.run(provider.reply(
        repository.items[created["id"]],
        "I will use a hash map.",
    ))
    assert reply == "Why is a hash map the right trade-off here?"


def test_complete_interview_returns_evidence_backed_sde1_scorecard():
    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode",
        "problem_slug": "two-sum",
        "problem_title": "Two Sum",
        "difficulty": "easy",
        "target_company": "google",
        "level": "sde1",
    })
    interview_id = created.json()["id"]
    context = client.patch(
        f"/api/v1/interviews/{interview_id}/context",
        headers=headers,
        json={
            "code": "def two_sum(nums, target):\n    seen = {}\n    return []",
            "visible_output": "Accepted",
            "programming_language": "Python",
        },
    )
    assert context.status_code == 200

    response = client.post(
        f"/api/v1/interviews/{interview_id}/complete",
        headers=headers,
        json={"duration_seconds": 900},
    )
    assert response.status_code == 200
    scorecard = response.json()
    assert scorecard["level"] == "sde1"
    assert scorecard["duration_seconds"] == 900
    assert set(scorecard["dimensions"]) == {
        "communication", "problem_solving", "implementation", "complexity", "testing"
    }
    assert scorecard["dimensions"]["implementation"]["evidence"]
    assert "1 distinct code revision" in scorecard["dimensions"]["implementation"]["evidence"][0]
    assert len(scorecard["next_drills"]) == 3
    assert client.patch(
        f"/api/v1/interviews/{interview_id}/context",
        headers=headers,
        json={"code": "mutate completed evidence"},
    ).status_code == 409
    assert client.post(
        f"/api/v1/interviews/{interview_id}/turns/audio",
        headers=headers,
        files={"audio": ("candidate.wav", b"RIFF", "audio/wav")},
    ).status_code == 409


def test_completed_scorecard_becomes_private_personal_interview_memory():
    first = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode",
        "problem_slug": "two-sum",
        "problem_title": "Two Sum",
        "difficulty": "easy",
        "target_company": "google",
        "level": "sde1",
    }).json()
    completed = client.post(
        f"/api/v1/interviews/{first['id']}/complete",
        headers=headers,
        json={"duration_seconds": 300},
    )
    assert completed.status_code == 200
    assert len(memory_service.items["test-user"]) == 1
    assert "Two Sum" in memory_service.items["test-user"][0][1]

    second = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode",
        "problem_slug": "three-sum",
        "problem_title": "3Sum",
        "difficulty": "medium",
        "target_company": "google",
        "level": "sde1",
    }).json()
    next_interview = repository.items[second["id"]]
    next_interview.personal_memory = asyncio.run(
        memory_service.relevant("test-user", next_interview)
    )
    prompt = GroqAIProvider(settings)._build_system_prompt(next_interview)
    assert "Relevant memories from this candidate" in prompt
    assert "Previous dsa interview on Two Sum" in prompt


def test_cannot_complete_another_users_interview():
    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "three-sum",
        "problem_title": "3Sum", "difficulty": "medium",
    })
    response = client.post(
        f"/api/v1/interviews/{created.json()['id']}/complete",
        headers={"Authorization": "Bearer another-user"},
        json={"duration_seconds": 60},
    )
    assert response.status_code == 404


def test_company_voices_are_fixed_and_google_supports_server_override():
    assert set(COMPANY_VOICE_PROFILES) == {
        "google", "amazon", "meta", "ibm", "accenture", "tcs",
        "hcltech", "american-express", "microsoft",
    }
    assert len({profile.reference_id for profile in COMPANY_VOICE_PROFILES.values()}) == 9
    assert company_voice_reference("google", "developer-google-voice") == "developer-google-voice"
    assert company_voice_reference("amazon", "developer-google-voice") == COMPANY_VOICE_PROFILES["amazon"].reference_id


def test_standalone_paid_voice_endpoint_is_not_exposed():
    response = client.post(
        "/api/v1/speech",
        headers=headers,
        json={"text": "Generate arbitrary paid audio.", "company_id": "amazon"},
    )
    assert response.status_code == 404


def test_billing_plan_catalog_is_server_authoritative():
    response = client.get("/api/v1/billing/plans")
    assert response.status_code == 200
    plans = {plan["id"]: plan for plan in response.json()}
    assert set(plans) == {"beta_monthly"}
    assert plans["beta_monthly"]["amount_inr"] == 799
    assert plans["beta_monthly"]["interview_minutes_per_month"] == 240
    assert plans["beta_monthly"]["purchase_type"] == "subscription"
    assert "company_specific_interviews" in plans["beta_monthly"]["features"]
    assert PLANS["beta_monthly"].currency == "INR"


def test_checkout_requires_authentication():
    response = client.post("/api/v1/billing/checkout", json={
        "plan_id": "beta_monthly",
        "customer_name": "Test User",
        "phone": "9876543210",
    })
    assert response.status_code == 401


def test_checkout_stays_disabled_until_credentials_are_configured():
    response = client.post("/api/v1/billing/checkout", headers=headers, json={
        "plan_id": "beta_monthly",
        "customer_name": "Test User",
        "phone": "9876543210",
    })
    assert response.status_code == 503


def test_cashfree_signature_uses_raw_body():
    raw_body = b'{"type":"PAYMENT_SUCCESS_WEBHOOK"}'
    timestamp = "1700000000"
    secret = "server-secret"
    signature = base64.b64encode(
        hmac.new(secret.encode(), timestamp.encode() + raw_body, hashlib.sha256).digest()
    ).decode()
    assert verify_cashfree_signature(raw_body, timestamp, signature, secret)
    assert not verify_cashfree_signature(raw_body + b" ", timestamp, signature, secret)


def test_successful_webhook_extracts_server_verification_fields():
    raw_body = b'''{
      "type":"PAYMENT_SUCCESS_WEBHOOK",
      "data": {
        "order":{"order_id":"la_ord_123","order_amount":34999,"order_currency":"INR"},
        "payment":{"payment_status":"SUCCESS","payment_amount":34999,"payment_currency":"INR"}
      }
    }'''
    with pytest.raises(ValueError):
        parse_successful_webhook(raw_body)


def test_successful_webhook_rejects_unknown_events_and_fractional_amounts_do_not_round():
    unknown = b'{"type":"SOMETHING_ELSE","data":{"subscription_id":"la_sub_123","payment_status":"SUCCESS","payment_amount":799,"payment_currency":"INR"}}'
    with pytest.raises(ValueError):
        parse_successful_webhook(unknown)
    fractional = b'{"type":"SUBSCRIPTION_PAYMENT_SUCCESS","data":{"subscription_id":"la_sub_123","payment_status":"SUCCESS","payment_amount":799.99,"payment_currency":"inr"}}'
    parsed = parse_successful_webhook(fractional)
    assert parsed[2] != 799
    assert parsed[3] == "INR"
    duplicate_auth = b'{"type":"SUBSCRIPTION_AUTH_STATUS","data":{"subscription_id":"la_sub_123","payment_status":"SUCCESS","payment_amount":799,"payment_currency":"INR"}}'
    with pytest.raises(ValueError):
        parse_successful_webhook(duplicate_auth)


def test_subscription_webhooks_support_direct_v2025_fields():
    raw_body = b'''{
      "type":"SUBSCRIPTION_PAYMENT_SUCCESS",
      "data":{"subscription_id":"la_sub_123","payment_status":"SUCCESS",
      "payment_amount":799,"payment_currency":"INR"}
    }'''
    assert parse_successful_webhook(raw_body) == (
        "la_sub_123", "SUBSCRIPTION_PAYMENT_SUCCESS", 799, "INR"
    )
    cancelled = b'''{"type":"SUBSCRIPTION_STATUS_CHANGED","data":{
      "subscription_details":{"subscription_id":"la_sub_123","subscription_status":"CUSTOMER_CANCELLED"}}}'''
    assert parse_lifecycle_webhook(cancelled) == (
        "la_sub_123", "SUBSCRIPTION_STATUS_CHANGED", None, False
    )
    active = b'''{"type":"SUBSCRIPTION_STATUS_CHANGED","data":{
      "subscription_details":{"subscription_id":"la_sub_123","subscription_status":"ACTIVE"}}}'''
    assert parse_lifecycle_webhook(active) == (
        "la_sub_123", "SUBSCRIPTION_STATUS_CHANGED", None, None
    )
    failed = b'''{"type":"SUBSCRIPTION_PAYMENT_FAILED","data":{
      "subscription_id":"la_sub_123","payment_status":"FAILED"}}'''
    assert parse_lifecycle_webhook(failed) == (
        "la_sub_123", "SUBSCRIPTION_PAYMENT_FAILED", None, None
    )
    assert cashfree_webhook_unix_seconds("1746427759733") == 1746427759


def test_signed_subscription_webhook_activates_once_and_rejects_wrong_amount():
    checkout = CheckoutRecord(
        reference="la_sub_secure", user_id="test-user", plan_id="beta_monthly",
        purchase_type="subscription", amount_inr=799, currency="INR",
        status="created", provider_session_id="session", idempotency_key="checkout-key",
    )
    asyncio.run(billing_repository.save_checkout(checkout))
    previous_enabled = settings.billing_enabled
    previous_secret = settings.cashfree_client_secret
    settings.billing_enabled = True
    settings.cashfree_client_secret = "webhook-secret"
    app.dependency_overrides[get_billing_repository] = lambda: billing_repository
    timestamp = str(int(time.time()))

    def deliver(amount: float, event_id: str):
        raw = json.dumps({
            "type": "SUBSCRIPTION_PAYMENT_SUCCESS",
            "data": {
                "subscription_id": "la_sub_secure", "payment_status": "SUCCESS",
                "payment_amount": amount, "payment_currency": "INR",
            },
        }, separators=(",", ":")).encode()
        signature = base64.b64encode(hmac.new(
            b"webhook-secret", timestamp.encode() + raw, hashlib.sha256,
        ).digest()).decode()
        return client.post(
            "/api/v1/billing/webhooks/cashfree", content=raw,
            headers={"content-type": "application/json", "x-webhook-timestamp": timestamp,
                     "x-webhook-signature": signature, "x-idempotency-key": event_id},
        )

    try:
        wrong = deliver(799.99, "wrong-amount")
        first = deliver(799, "payment-1")
        duplicate = deliver(799, "payment-1")
    finally:
        settings.billing_enabled = previous_enabled
        settings.cashfree_client_secret = previous_secret
        app.dependency_overrides.pop(get_billing_repository, None)

    assert wrong.status_code == 400
    assert first.json() == {"accepted": True, "activated": True}
    assert duplicate.json() == {"accepted": True, "activated": False}
    entitlement = asyncio.run(billing_repository.get_entitlement("test-user"))
    assert entitlement is not None
    assert entitlement.plan_id == "beta_monthly"
    assert entitlement.minutes_limit == 240


def _pcm_wav(seconds: float, amplitude: int) -> bytes:
    sample_rate = 16_000
    samples = [amplitude] * int(sample_rate * seconds)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return output.getvalue()


def test_server_audio_gate_measures_duration_and_rejectable_silence():
    duration, rms = _inspect_pcm_wav(_pcm_wav(0.75, 0), "audio/wav")
    assert duration == pytest.approx(0.75)
    assert rms == 0
    _, speech_rms = _inspect_pcm_wav(_pcm_wav(0.75, 4000), "audio/wav")
    assert speech_rms > 0.1


def test_audio_turn_transcribes_before_advancing_interview_phase():
    class StubTranscriptionProvider:
        async def transcribe(self, audio_bytes, content_type):
            return "Can I assume the input contains duplicates?"

    class StubAIProvider:
        async def reply(self, interview, candidate_message):
            assert interview.phase == "approach"
            return "Yes. Now explain your approach."

    class StubSpeechProvider:
        async def synthesize(self, text, reference_id=None):
            return SynthesizedSpeech(data=b"voice", content_type="audio/mpeg")

    previous_billing = settings.billing_enabled
    settings.billing_enabled = True
    app.dependency_overrides[get_billing_repository] = lambda: billing_repository
    try:
        created_response = client.post("/api/v1/interviews", headers=headers, json={
            "platform": "leetcode", "problem_slug": "two-sum",
            "problem_title": "Two Sum", "difficulty": "easy",
        })
        assert created_response.status_code == 201
        created = created_response.json()
        assert created["access_tier"] == "trial"
    except Exception:
        settings.billing_enabled = previous_billing
        app.dependency_overrides.pop(get_billing_repository, None)
        raise
    app.dependency_overrides[get_transcription_provider] = StubTranscriptionProvider
    app.dependency_overrides[get_ai_provider] = StubAIProvider
    app.dependency_overrides[get_speech_provider] = StubSpeechProvider
    try:
        response = client.post(
            f"/api/v1/interviews/{created['id']}/turns/audio",
            headers=headers,
            files={"audio": ("candidate.wav", _pcm_wav(0.75, 4000), "audio/wav")},
        )
    finally:
        settings.billing_enabled = previous_billing
        app.dependency_overrides.pop(get_billing_repository, None)
        app.dependency_overrides.pop(get_transcription_provider, None)
        app.dependency_overrides.pop(get_ai_provider, None)
        app.dependency_overrides.pop(get_speech_provider, None)

    assert response.status_code == 200
    assert response.json()["transcript"] == "Can I assume the input contains duplicates?"
    assert response.json()["phase"] == "approach"
    assert response.json()["interviewer_message"] == "Yes. Now explain your approach."
    assert response.json()["interviewer_audio_content_type"] == "audio/mpeg"
    assert base64.b64decode(response.json()["interviewer_audio_base64"]) == b"voice"


def test_audio_turn_streams_transcript_reply_and_voice_in_order():
    class StubTranscriptionProvider:
        async def transcribe(self, audio_bytes, content_type):
            return "I would use a hash map."

    class StreamingAIProvider:
        async def stream_reply(self, interview, candidate_message):
            yield "Explain "
            yield "the complexity."

        async def reply(self, interview, candidate_message):
            raise AssertionError("The streaming path should be used.")

    class StubSpeechProvider:
        async def synthesize(self, text, reference_id=None):
            assert text == "Explain the complexity."
            return SynthesizedSpeech(data=b"streamed-voice", content_type="audio/mpeg")

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
    app.dependency_overrides[get_transcription_provider] = StubTranscriptionProvider
    app.dependency_overrides[get_ai_provider] = StreamingAIProvider
    app.dependency_overrides[get_speech_provider] = StubSpeechProvider
    try:
        response = client.post(
            f"/api/v1/interviews/{created['id']}/turns/audio/stream",
            headers=headers,
            files={"audio": ("candidate.wav", _pcm_wav(0.75, 4000), "audio/wav")},
        )
    finally:
        app.dependency_overrides.pop(get_transcription_provider, None)
        app.dependency_overrides.pop(get_ai_provider, None)
        app.dependency_overrides.pop(get_speech_provider, None)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.index("event: transcript") < response.text.index("event: assistant_delta")
    assert response.text.index("event: assistant_delta") < response.text.index("event: audio")
    assert 'data: {"text":"Explain "}' in response.text
    assert 'data: {"text":"the complexity."}' in response.text
    assert base64.b64encode(b"streamed-voice").decode("ascii") in response.text
    assert response.text.rstrip().endswith(
        'data: {"phase":"clarification","service_notice":null}'
    )
    saved = repository.items[created["id"]]
    assert len(saved.turns) == 1
    assert saved.turns[0].candidate_message == "I would use a hash map."
    assert saved.turns[0].interviewer_message == "Explain the complexity."


def test_audio_turn_stream_uses_safe_fallback_when_model_is_unavailable():
    class StubTranscriptionProvider:
        async def transcribe(self, audio_bytes, content_type):
            return "My internal answer should not appear in logs or errors."

    class UnavailableStreamingAIProvider:
        async def stream_reply(self, interview, candidate_message):
            if False:
                yield ""
            raise AIServiceError("provider response contained sensitive diagnostics")

        async def reply(self, interview, candidate_message):
            raise AssertionError("The streaming path should be used.")

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
    app.dependency_overrides[get_transcription_provider] = StubTranscriptionProvider
    app.dependency_overrides[get_ai_provider] = UnavailableStreamingAIProvider
    try:
        response = client.post(
            f"/api/v1/interviews/{created['id']}/turns/audio/stream",
            headers=headers,
            files={"audio": ("candidate.wav", _pcm_wav(0.75, 4000), "audio/wav")},
        )
    finally:
        app.dependency_overrides.pop(get_transcription_provider, None)
        app.dependency_overrides.pop(get_ai_provider, None)

    assert response.status_code == 200
    assert "event: notice" in response.text
    assert MODEL_CAPACITY_MESSAGE in response.text
    assert "sensitive diagnostics" not in response.text
    assert "event: assistant_delta" in response.text
    assert "Please restate the key constraints" in response.text
    saved = repository.items[created["id"]]
    assert len(saved.turns) == 1
    assert saved.turns[0].candidate_message == "My internal answer should not appear in logs or errors."
    assert saved.turns[0].interviewer_message.startswith("Please restate the key constraints")


def test_model_outage_returns_capacity_message():
    class StubTranscriptionProvider:
        async def transcribe(self, audio_bytes, content_type):
            return "I would use a hash map."

    class UnavailableAIProvider:
        async def reply(self, interview, candidate_message):
            raise AIServiceError("provider unavailable")

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
    app.dependency_overrides[get_transcription_provider] = StubTranscriptionProvider
    app.dependency_overrides[get_ai_provider] = UnavailableAIProvider
    try:
        response = client.post(
            f"/api/v1/interviews/{created['id']}/turns/audio",
            headers=headers,
            files={"audio": ("candidate.wav", _pcm_wav(0.75, 4000), "audio/wav")},
        )
    finally:
        app.dependency_overrides.pop(get_transcription_provider, None)
        app.dependency_overrides.pop(get_ai_provider, None)

    assert response.status_code == 503
    assert response.json()["detail"] == MODEL_CAPACITY_MESSAGE
    assert response.headers["x-request-id"]


def test_speech_outage_keeps_text_interview_running_with_notice():
    class StubTranscriptionProvider:
        async def transcribe(self, audio_bytes, content_type):
            return "I would use a hash map."

    class StubAIProvider:
        async def reply(self, interview, candidate_message):
            return "Explain the time complexity."

    class UnavailableSpeechProvider:
        async def synthesize(self, text, reference_id=None):
            raise SpeechServiceError("provider unavailable")

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
    app.dependency_overrides[get_transcription_provider] = StubTranscriptionProvider
    app.dependency_overrides[get_ai_provider] = StubAIProvider
    app.dependency_overrides[get_speech_provider] = UnavailableSpeechProvider
    try:
        response = client.post(
            f"/api/v1/interviews/{created['id']}/turns/audio",
            headers=headers,
            files={"audio": ("candidate.wav", _pcm_wav(0.75, 4000), "audio/wav")},
        )
    finally:
        app.dependency_overrides.pop(get_transcription_provider, None)
        app.dependency_overrides.pop(get_ai_provider, None)
        app.dependency_overrides.pop(get_speech_provider, None)

    assert response.status_code == 200
    assert response.json()["interviewer_message"] == "Explain the time complexity."
    assert response.json()["service_notice"] == MODEL_CAPACITY_MESSAGE
    assert response.json()["interviewer_audio_base64"] is None


def test_sde1_phases_advance_from_observable_evidence():
    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
    interview = repository.items[created["id"]]
    assert _advance_sde1_phase(interview, "Can I assume the input contains duplicates?") == "approach"
    interview.phase = "approach"
    assert _advance_sde1_phase(interview, "My approach is to first iterate and use a hash map because lookup is constant time.") == "coding"
    interview.phase = "coding"
    interview.screen_context.code = "def solve(nums, target):\n    seen = {}\n    for value in nums:\n        pass"
    assert _advance_sde1_phase(interview, "I will implement that now.") == "testing"
    interview.phase = "testing"
    assert _advance_sde1_phase(interview, "I will dry run an example and test the empty input edge case.") == "complexity"
    interview.phase = "complexity"
    assert _advance_sde1_phase(interview, "The time complexity is O(n) and space is O(n).") == "wrap_up"


def test_speech_usage_accumulates_seconds_and_deduplicates_retries():
    async def scenario():
        repository = InMemoryBillingRepository()
        checkout = CheckoutRecord(
            reference="ref", user_id="user", plan_id="beta_monthly",
            purchase_type="subscription", amount_inr=799, currency="INR",
            status="created", provider_session_id="session", idempotency_key="key",
        )
        await repository.activate(checkout, "activation", "paid", "hash")
        remaining = await repository.consume_speech_seconds("user", "turn-1", "interview", 21)
        duplicate_remaining = await repository.consume_speech_seconds("user", "turn-1", "interview", 21)
        entitlement = await repository.get_entitlement("user")
        assert remaining == duplicate_remaining
        assert entitlement is not None
        assert entitlement.speech_seconds_used == 21
        assert entitlement.minutes_used == 1
    asyncio.run(scenario())


def test_lifetime_entitlement_has_no_speech_cap():
    async def scenario():
        repository = InMemoryBillingRepository()
        now = datetime.now(timezone.utc)
        repository.entitlements["founder"] = BillingEntitlement(
            user_id="founder",
            plan_id="lifetime",
            status="active",
            is_lifetime=True,
            minutes_limit=0,
            minutes_used=0,
            speech_seconds_used=0,
            period_start=now,
            period_end=now + timedelta(days=36_500),
        )
        remaining = await repository.consume_speech_seconds(
            "founder", "long-turn", "interview", 100_000,
        )
        duplicate = await repository.consume_speech_seconds(
            "founder", "long-turn", "interview", 100_000,
        )
        entitlement = await repository.get_entitlement("founder")
        assert entitlement is not None
        assert remaining == duplicate == 2_147_483_647
        assert entitlement.speech_seconds_used == 100_000
        public = entitlement.public_dict()
        assert public["plan_name"] == "LeetAlly Unlimited"
        assert public["is_lifetime"] is True
        assert public["usage_percent"] == 0
        assert "company_specific_interviews" in public["features"]
    asyncio.run(scenario())


def test_server_allowlisted_account_gets_unlimited_access():
    original = settings.unlimited_access_emails
    settings.unlimited_access_emails = " TEST-USER@example.com "
    try:
        entitlement = client.get("/api/v1/billing/me", headers=headers)
        assert entitlement.status_code == 200
        payload = entitlement.json()
        assert payload["status"] == "active"
        assert payload["plan_id"] == "lifetime"
        assert payload["plan_name"] == "LeetAlly Unlimited"
        assert payload["is_lifetime"] is True

        first = client.post("/api/v1/interviews", headers=headers, json={
            "platform": "leetcode", "problem_slug": "two-sum",
            "problem_title": "Two Sum", "difficulty": "easy",
        })
        second = client.post("/api/v1/interviews", headers=headers, json={
            "platform": "leetcode", "problem_slug": "three-sum",
            "problem_title": "Three Sum", "difficulty": "medium",
        })
        third = client.post("/api/v1/interviews", headers=headers, json={
            "platform": "leetcode", "problem_slug": "four-sum",
            "problem_title": "Four Sum", "difficulty": "medium",
        })
        assert [first.status_code, second.status_code, third.status_code] == [201, 201, 201]
        assert all(response.json()["access_tier"] == "beta_monthly" for response in (first, second, third))
        assert trial_access_repository.usage == {}
    finally:
        settings.unlimited_access_emails = original


def test_verified_renewal_adds_a_full_period_without_shortening_paid_access():
    async def scenario():
        repository = InMemoryBillingRepository()
        checkout = CheckoutRecord(
            reference="ref", user_id="user", plan_id="beta_monthly",
            purchase_type="subscription", amount_inr=799, currency="INR",
            status="created", provider_session_id="session", idempotency_key="key",
        )
        await repository.activate(
            checkout, "initial-payment", "SUBSCRIPTION_PAYMENT_SUCCESS", "hash-1"
        )
        first = await repository.get_entitlement("user")
        assert first is not None
        first_end = first.period_end
        await repository.activate(
            checkout, "renewal-payment", "SUBSCRIPTION_PAYMENT_SUCCESS", "hash-2"
        )
        renewed = await repository.get_entitlement("user")
        assert renewed is not None
        assert renewed.period_start == first_end
        assert renewed.period_end == first_end + timedelta(days=30)
    asyncio.run(scenario())


def test_active_beta_member_can_start_multiple_interviews_without_spending_trial():
    async def activate():
        checkout = CheckoutRecord(
            reference="beta-ref", user_id="test-user", plan_id="beta_monthly",
            purchase_type="subscription", amount_inr=799, currency="INR",
            status="created", provider_session_id="session", idempotency_key="key",
        )
        await billing_repository.activate(checkout, "paid-1", "SUBSCRIPTION_PAYMENT_SUCCESS", "hash")

    asyncio.run(activate())
    previous = settings.billing_enabled
    settings.billing_enabled = True
    app.dependency_overrides[get_billing_repository] = lambda: billing_repository
    payload = {"platform":"leetcode","problem_slug":"two-sum","problem_title":"Two Sum","difficulty":"easy"}
    try:
        first = client.post("/api/v1/interviews", headers=headers, json=payload)
        second = client.post("/api/v1/interviews", headers=headers, json=payload)
    finally:
        settings.billing_enabled = previous
        app.dependency_overrides.pop(get_billing_repository, None)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["access_tier"] == "beta_monthly"
    assert trial_access_repository.usage.get("test-user", 0) == 0


def test_speech_usage_refuses_users_without_entitlement():
    async def scenario():
        repository = InMemoryBillingRepository()
        with pytest.raises(BillingProviderError):
            await repository.consume_speech_seconds("free-user", "turn", "interview", 10)
    asyncio.run(scenario())
