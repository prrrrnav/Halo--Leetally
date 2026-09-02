from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .config import Settings
from .domain import AuthenticatedUser


class FeedbackServiceError(RuntimeError):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


class SupabaseFeedbackService:
    """Stores feedback and exposes it only through an owner-gated API."""

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise FeedbackServiceError("Feedback storage is not configured.")
        self.settings = settings
        self.rest_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, table: str, **kwargs: Any) -> httpx.Response:
        headers = {**self.headers, **kwargs.pop("headers", {})}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.request(
                    method,
                    f"{self.rest_url}/{table}",
                    headers=headers,
                    **kwargs,
                )
        except httpx.HTTPError as error:
            raise FeedbackServiceError(
                "Feedback is temporarily unavailable. Please try again."
            ) from error
        if response.status_code >= 400:
            raise FeedbackServiceError("The feedback operation failed.")
        return response

    async def submit(
        self,
        user: AuthenticatedUser,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not user.email:
            raise FeedbackServiceError("An account email is required.", 400)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        recent = await self._request(
            "GET",
            "website_feedback",
            params={
                "user_id": f"eq.{user.id}",
                "created_at": f"gte.{cutoff}",
                "select": "id",
                "limit": "10",
            },
        )
        if len(recent.json()) >= 10:
            raise FeedbackServiceError(
                "Feedback limit reached. Please try again tomorrow.", 429
            )

        feedback_response = await self._request(
            "POST",
            "website_feedback",
            headers={"Prefer": "return=representation"},
            json={
                "user_id": user.id,
                "name": user.email.split("@", 1)[0][:100],
                "email": user.email,
                "message": payload["message"].strip(),
                "rating": payload["rating"],
            },
        )
        feedback = feedback_response.json()[0]

        verified_interview_id: str | None = None
        requested_interview_id = payload.get("interview_id")
        if requested_interview_id:
            interview_response = await self._request(
                "GET",
                "interviews",
                params={
                    "id": f"eq.{requested_interview_id}",
                    "user_id": f"eq.{user.id}",
                    "select": "id",
                    "limit": "1",
                },
            )
            if interview_response.json():
                verified_interview_id = str(requested_interview_id)

        metadata = {
            "feedback_id": feedback["id"],
            "source": "interviewer_extension",
            "extension_version": payload.get("extension_version", "unknown"),
            "problem_slug": payload.get("problem_slug"),
            "problem_title": payload.get("problem_title"),
            "difficulty": payload.get("difficulty"),
            "interview_type": payload.get("interview_type"),
        }
        await self._request(
            "POST",
            "usage_events",
            headers={"Prefer": "return=minimal"},
            json={
                "user_id": user.id,
                "interview_id": verified_interview_id,
                "event_type": "interviewer_feedback",
                "quantity": 1,
                "metadata": metadata,
            },
        )
        return {**feedback, "metadata": metadata}

    async def owner_list(self, user: AuthenticatedUser) -> list[dict[str, Any]]:
        owner_email = self.settings.feedback_admin_email.strip().casefold()
        if not user.email or user.email.casefold() != owner_email:
            raise FeedbackServiceError("Feedback inbox is owner-only.", 403)
        feedback_rows = (await self._request(
            "GET",
            "website_feedback",
            params={
                "select": "id,email,message,rating,created_at",
                "order": "created_at.desc",
                "limit": "100",
            },
        )).json()
        event_rows = (await self._request(
            "GET",
            "usage_events",
            params={
                "event_type": "eq.interviewer_feedback",
                "select": "metadata",
                "order": "created_at.desc",
                "limit": "200",
            },
        )).json()
        metadata_by_id = {
            str(row.get("metadata", {}).get("feedback_id")): row.get("metadata", {})
            for row in event_rows
            if row.get("metadata", {}).get("feedback_id")
        }
        return [
            {**row, "metadata": metadata_by_id.get(str(row["id"]), {})}
            for row in feedback_rows
        ]
