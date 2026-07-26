from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"

    supabase_url: str
    supabase_anon_key: str

    openai_api_key: str
    openai_realtime_model: str = "gpt-realtime"
    openai_voice: str = "marin"

    deepgram_api_key: str | None = None
    deepgram_model: str = "nova-3"

    groq_api_key: str | None = None
    groq_model: str = "llama-3.1-8b-instant"

    cors_origins: str = "http://localhost:5173"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()