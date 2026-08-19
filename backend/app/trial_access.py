from __future__ import annotations

import asyncio
from typing import Protocol

import httpx

from .config import Settings


class TrialAccessError(RuntimeError):
    pass


class TrialAccessRepository(Protocol):
    async def claim(self, user_id: str, limit: int) -> bool: ...


class InMemoryTrialAccessRepository:
    def __init__(self) -> None:
        self.usage: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def claim(self, user_id: str, limit: int) -> bool:
        if limit < 0:
            return True
        async with self._lock:
            used = self.usage.get(user_id, 0)
            if used >= limit:
                return False
            self.usage[user_id] = used + 1
            return True


class SupabaseTrialAccessRepository:
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise TrialAccessError("Persistent trial access is not configured.")
        self.url = settings.supabase_url.rstrip("/") + "/rest/v1/rpc/claim_ai_interview_trial"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def claim(self, user_id: str, limit: int) -> bool:
        if limit < 0:
            return True
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    self.url,
                    headers=self.headers,
                    json={"p_user_id": user_id, "p_limit": limit},
                )
        except httpx.HTTPError as error:
            raise TrialAccessError("Trial access could not be verified.") from error
        if response.status_code >= 400:
            raise TrialAccessError("Trial access could not be verified.")
        return bool(response.json())
