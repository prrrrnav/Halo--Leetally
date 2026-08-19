from fastapi.testclient import TestClient
import base64
import hashlib
import hmac
import io
import struct
import wave
import asyncio
import pytest

from app.billing import (
    PLANS, BillingEntitlement, BillingProviderError, CheckoutRecord,
    InMemoryBillingRepository, cashfree_webhook_unix_seconds,
    parse_lifecycle_webhook, parse_successful_webhook, verify_cashfree_signature,
)
from app.dependencies import (
    get_ai_provider,
    get_speech_provider,
    get_transcription_provider,
)
from app.domain import SynthesizedSpeech
from app.adapters import GroqAIProvider
from app.main import _advance_sde1_phase, _inspect_pcm_wav, app
from app.dependencies import repository, trial_access_repository
from app.voice_profiles import COMPANY_VOICE_PROFILES, company_voice_reference

client = TestClient(app)
headers = {"Authorization": "Bearer test-user"}


@pytest.fixture(autouse=True)
def reset_in_memory_state():
    repository.items.clear()
    trial_access_repository.usage.clear()
    yield
    repository.items.clear()
    trial_access_repository.usage.clear()

def test_health():
    assert client.get("/api/v1/health").json()["status"] == "ok"
    readiness = client.get("/api/v1/health/ready")
    assert readiness.status_code == 503
    assert readiness.json()["detail"]["status"] == "not_ready"

def test_auth_required():
    assert client.get("/api/v1/auth/me").status_code == 401


def test_account_data_operations_require_server_configuration():
    assert client.get("/api/v1/account/export", headers=headers).status_code == 503
    response = client.request(
        "DELETE",
        "/api/v1/account",
        headers=headers,
        json={"confirmation": "DELETE"},
    )
    assert response.status_code == 503

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


def test_each_account_can_start_only_one_ai_interview():
    payload = {"platform":"leetcode","problem_slug":"two-sum","problem_title":"Two Sum","difficulty":"easy"}
    first = client.post("/api/v1/interviews", headers=headers, json=payload)
    second = client.post("/api/v1/interviews", headers=headers, json=payload)
    another_user = client.post(
        "/api/v1/interviews",
        headers={"Authorization": "Bearer another-user"},
        json=payload,
    )

    assert first.status_code == 201
    assert second.status_code == 429
    assert second.json()["detail"] == "Your one free AI interview has already been used. More access is coming soon."
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


def test_speech_endpoint_passes_selected_company_voice_to_fish_provider():
    class CapturingSpeechProvider:
        reference_id = None

        async def synthesize(self, text, reference_id=None):
            self.reference_id = reference_id
            return SynthesizedSpeech(data=b"company-voice", content_type="audio/mpeg")

    provider = CapturingSpeechProvider()
    app.dependency_overrides[get_speech_provider] = lambda: provider
    try:
        response = client.post(
            "/api/v1/speech",
            headers=headers,
            json={"text": "Welcome to the interview.", "company_id": "amazon"},
        )
    finally:
        app.dependency_overrides.pop(get_speech_provider, None)

    assert response.status_code == 200
    assert provider.reference_id == COMPANY_VOICE_PROFILES["amazon"].reference_id


def test_billing_plan_catalog_is_server_authoritative():
    response = client.get("/api/v1/billing/plans")
    assert response.status_code == 200
    plans = {plan["id"]: plan for plan in response.json()}
    assert plans["sde1_sprint"]["amount_inr"] == 799
    assert plans["sde1_sprint"]["interview_minutes_per_month"] == 240
    assert plans["sde1_intensive"]["amount_inr"] == 1_199
    assert plans["sde1_intensive"]["interview_minutes_per_month"] == 600
    assert plans["sde1_sprint"]["supports_auto_renew"] is True
    assert PLANS["sde1_sprint"].currency == "INR"


def test_checkout_requires_authentication():
    response = client.post("/api/v1/billing/checkout", json={
        "plan_id": "sde1_sprint",
        "customer_name": "Test User",
        "phone": "9876543210",
    })
    assert response.status_code == 401


def test_checkout_stays_disabled_until_credentials_are_configured():
    response = client.post("/api/v1/billing/checkout", headers=headers, json={
        "plan_id": "sde1_sprint",
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
    assert parse_successful_webhook(raw_body) == (
        "la_ord_123", "PAYMENT_SUCCESS_WEBHOOK", 34_999, "INR"
    )


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
    assert cashfree_webhook_unix_seconds("1746427759733") == 1746427759


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

    created = client.post("/api/v1/interviews", headers=headers, json={
        "platform": "leetcode", "problem_slug": "two-sum",
        "problem_title": "Two Sum", "difficulty": "easy",
    }).json()
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
        app.dependency_overrides.pop(get_transcription_provider, None)
        app.dependency_overrides.pop(get_ai_provider, None)
        app.dependency_overrides.pop(get_speech_provider, None)

    assert response.status_code == 200
    assert response.json()["transcript"] == "Can I assume the input contains duplicates?"
    assert response.json()["phase"] == "approach"
    assert response.json()["interviewer_message"] == "Yes. Now explain your approach."
    assert response.json()["interviewer_audio_content_type"] == "audio/mpeg"
    assert base64.b64decode(response.json()["interviewer_audio_base64"]) == b"voice"


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
            reference="ref", user_id="user", plan_id="sde1_sprint",
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


def test_speech_usage_refuses_users_without_entitlement():
    async def scenario():
        repository = InMemoryBillingRepository()
        with pytest.raises(BillingProviderError):
            await repository.consume_speech_seconds("free-user", "turn", "interview", 10)
    asyncio.run(scenario())
