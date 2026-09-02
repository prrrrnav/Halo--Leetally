from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"

    supabase_url: str
    supabase_anon_key: str

    openai_api_key: str
    openai_realtime_model: str = "gpt-realtime"
    openai_chat_model: str = "gpt-5-mini"
    openai_voice: str = "marin"
    realtime_voice_enabled: bool = False

    deepgram_api_key: str | None = None
    deepgram_model: str = "nova-3"

    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-20b"

    fish_audio_api_key: str | None = None

    fish_audio_model: str = "s2.1-pro-free"
    fish_audio_reference_id: str | None = None
    fish_audio_format: str = "mp3"
    fish_audio_latency: str = "low"
    fish_audio_speed: float = 1.1

    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    elevenlabs_output_format: str = "mp3_44100_128"

    cors_origins: str = "http://localhost:5173"

    billing_enabled: bool = False
    supabase_service_role_key: str | None = None
    cashfree_client_id: str | None = None
    cashfree_client_secret: str | None = None
    cashfree_environment: str = "sandbox"
    cashfree_api_version: str = "2025-01-01"
    billing_return_url: str = "http://localhost:8000/api/v1/billing/return"
    billing_customer_return_url: str = "http://localhost:5173/pricing?payment=return"
    cashfree_webhook_tolerance_seconds: int = 300
    minimum_billable_speech_ms: int = 400
    minimum_speech_rms: float = 0.003
    # Server-enforced lifetime allowance for free beta accounts.
    ai_interview_trial_limit: int = 2
    # Comma-separated, server-side account allowlist for uncapped interview access.
    unlimited_access_emails: str = ""
    feedback_admin_email: str = "watershaper9.1@gmail.com"

    # Personalized interview memory. Embeddings use the existing OpenAI key;
    # only compact scorecard summaries are stored, never audio.
    personal_memory_enabled: bool = True
    memory_embedding_provider: str = "local"
    memory_embedding_model: str = "text-embedding-3-small"
    memory_embedding_dimensions: int = 1536
    memory_match_count: int = 3
    memory_match_threshold: float = 0.2

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def unlimited_access_email_set(self) -> set[str]:
        return {
            email.strip().casefold()
            for email in self.unlimited_access_emails.split(",")
            if email.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
