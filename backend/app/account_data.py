from __future__ import annotations

from typing import Any
from uuid import uuid4

import httpx

from .config import Settings


class AccountDataError(RuntimeError):
    pass


class SupabaseAccountDataService:
    """Exports or erases account data using server-only Supabase credentials."""

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise AccountDataError("Account data operations are not configured.")
        self.rest_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.auth_url = settings.supabase_url.rstrip("/") + "/auth/v1/admin/users"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.request(
                    method,
                    url,
                    headers=self.headers,
                    **kwargs,
                )
        except httpx.HTTPError as error:
            raise AccountDataError(
                "The account data service is temporarily unavailable."
            ) from error
        if response.status_code >= 400:
            raise AccountDataError("The account data operation failed.")
        return response

    async def _rows(
        self,
        table: str,
        params: dict[str, str],
    ) -> list[dict[str, Any]]:
        response = await self._request(
            "GET",
            f"{self.rest_url}/{table}",
            params={**params, "select": "*"},
        )
        return response.json()

    async def export(self, user_id: str, email: str | None) -> dict[str, Any]:
        interviews = await self._rows("interviews", {"user_id": f"eq.{user_id}"})
        interview_ids = [row["id"] for row in interviews]
        messages: list[dict[str, Any]] = []
        feedback: list[dict[str, Any]] = []
        if interview_ids:
            joined = ",".join(interview_ids)
            messages = await self._rows(
                "interview_messages", {"interview_id": f"in.({joined})"}
            )
            feedback = await self._rows(
                "interview_feedback", {"interview_id": f"in.({joined})"}
            )
        checkouts = await self._rows(
            "billing_checkouts", {"user_id": f"eq.{user_id}"}
        )
        friend_connections = await self._rows(
            "friend_connections",
            {
                "or": (
                    f"(requester_user_id.eq.{user_id},"
                    f"addressee_user_id.eq.{user_id})"
                )
            },
        )
        return {
            "account": {"id": user_id, "email": email},
            "profile": await self._rows("profiles", {"id": f"eq.{user_id}"}),
            "progress": await self._rows("user_progress", {"user_id": f"eq.{user_id}"}),
            "interviews": interviews,
            "interview_messages": messages,
            "interview_feedback": feedback,
            "usage_events": await self._rows("usage_events", {"user_id": f"eq.{user_id}"}),
            "trial_usage": await self._rows("ai_interview_usage", {"user_id": f"eq.{user_id}"}),
            "billing_checkouts": checkouts,
            "billing_entitlements": await self._rows(
                "billing_entitlements", {"user_id": f"eq.{user_id}"}
            ),
            "billing_usage": await self._rows(
                "billing_usage_ledger", {"user_id": f"eq.{user_id}"}
            ),
            "website_feedback": await self._rows(
                "website_feedback", {"user_id": f"eq.{user_id}"}
            ),
            "contact_requests": await self._rows(
                "contact_requests", {"user_id": f"eq.{user_id}"}
            ),
            "friend_connections": friend_connections,
            "friend_request_attempts": await self._rows(
                "friend_request_attempts", {"requester_user_id": f"eq.{user_id}"}
            ),
        }

    async def delete(self, user_id: str) -> None:
        # Financial records may need statutory retention. Remove their account
        # link while preserving provider references needed for disputes/tax.
        anonymous_id = f"deleted:{uuid4()}"
        for table in ("billing_usage_ledger", "billing_entitlements"):
            await self._request(
                "DELETE",
                f"{self.rest_url}/{table}",
                params={"user_id": f"eq.{user_id}"},
            )
        await self._request(
            "PATCH",
            f"{self.rest_url}/billing_checkouts",
            params={"user_id": f"eq.{user_id}"},
            json={"user_id": anonymous_id},
        )
        for table in ("website_feedback", "contact_requests"):
            await self._request(
                "DELETE",
                f"{self.rest_url}/{table}",
                params={"user_id": f"eq.{user_id}"},
            )
        # Foreign-key cascades remove profiles, interviews, messages, feedback,
        # progress, trial usage and ordinary usage events.
        await self._request("DELETE", f"{self.auth_url}/{user_id}")
