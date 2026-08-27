from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .config import Settings


class FriendServiceError(RuntimeError):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


class SupabaseFriendService:
    """Manages consent-based friendships with server-only database access."""

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise FriendServiceError("Friend connections are not configured.")
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
            raise FriendServiceError(
                "The friend service is temporarily unavailable."
            ) from error
        if response.status_code >= 400:
            raise FriendServiceError("The friend operation failed.")
        return response

    async def _rows(
        self,
        table: str,
        params: dict[str, str],
        select: str = "*",
    ) -> list[dict[str, Any]]:
        response = await self._request(
            "GET", table, params={**params, "select": select}
        )
        return response.json()

    async def _connections(self, user_id: str) -> list[dict[str, Any]]:
        return await self._rows(
            "friend_connections",
            {
                "or": (
                    f"(requester_user_id.eq.{user_id},"
                    f"addressee_user_id.eq.{user_id})"
                ),
                "order": "created_at.desc",
            },
        )

    @staticmethod
    def _public_progress(progress_row: dict[str, Any] | None) -> dict[str, Any]:
        progress = (progress_row or {}).get("progress") or {}
        profile = progress.get("profile") or {}
        return {
            "username": profile.get("username"),
            "avatar": profile.get("avatar"),
            "ranking": profile.get("ranking"),
            "total_solved": int(profile.get("totalSolved") or 0),
            "easy_solved": int(profile.get("easySolved") or 0),
            "medium_solved": int(profile.get("mediumSolved") or 0),
            "hard_solved": int(profile.get("hardSolved") or 0),
            "synced_at": profile.get("syncedAt"),
        }

    async def list(self, user_id: str) -> list[dict[str, Any]]:
        connections = await self._connections(user_id)
        if not connections:
            return []

        other_ids = {
            row["addressee_user_id"]
            if row["requester_user_id"] == user_id
            else row["requester_user_id"]
            for row in connections
        }
        ids = ",".join(sorted(other_ids))
        profiles = await self._rows(
            "profiles", {"id": f"in.({ids})"}, "id,email,display_name"
        )
        profiles_by_id = {row["id"]: row for row in profiles}

        accepted_ids = {
            (
                row["addressee_user_id"]
                if row["requester_user_id"] == user_id
                else row["requester_user_id"]
            )
            for row in connections
            if row["status"] == "accepted"
        }
        progress_by_id: dict[str, dict[str, Any]] = {}
        if accepted_ids:
            accepted = ",".join(sorted(accepted_ids))
            progress_rows = await self._rows(
                "user_progress", {"user_id": f"in.({accepted})"}, "user_id,progress"
            )
            progress_by_id = {row["user_id"]: row for row in progress_rows}

        result: list[dict[str, Any]] = []
        for row in connections:
            requester = row["requester_user_id"]
            other_id = row["addressee_user_id"] if requester == user_id else requester
            profile = profiles_by_id.get(other_id, {})
            status = row["status"]
            direction = (
                "connected"
                if status == "accepted"
                else "sent" if requester == user_id else "received"
            )
            public_progress = (
                self._public_progress(progress_by_id.get(other_id))
                if status == "accepted"
                else self._public_progress(None)
            )
            result.append({
                "relationship_id": row["id"],
                "account_user_id": other_id,
                "email": profile.get("email") or "Unknown account",
                "display_name": (
                    profile.get("display_name")
                    if status == "accepted" or direction == "received"
                    else None
                ),
                "status": status,
                "direction": direction,
                **public_progress,
            })
        return result

    async def create(self, user_id: str, email: str) -> list[dict[str, Any]]:
        normalized_email = email.strip().lower()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        attempts = await self._rows(
            "friend_request_attempts",
            {
                "requester_user_id": f"eq.{user_id}",
                "attempted_at": f"gte.{cutoff}",
                "limit": "30",
            },
            "id",
        )
        if len(attempts) >= 30:
            raise FriendServiceError(
                "Friend request limit reached. Try again later.", 429
            )
        await self._request(
            "POST",
            "friend_request_attempts",
            headers={"Prefer": "return=minimal"},
            json={"requester_user_id": user_id},
        )
        profiles = await self._rows(
            "profiles",
            {"email": f"eq.{normalized_email}", "limit": "2"},
            "id,email",
        )
        if len(profiles) != 1:
            return await self.list(user_id)
        other_id = profiles[0]["id"]
        if other_id == user_id:
            raise FriendServiceError("You cannot add your own account.", 409)

        connections = await self._connections(user_id)
        existing = next(
            (
                row
                for row in connections
                if other_id in (row["requester_user_id"], row["addressee_user_id"])
            ),
            None,
        )
        if existing:
            if (
                existing["status"] == "pending"
                and existing["addressee_user_id"] == user_id
            ):
                await self.accept(user_id, existing["id"])
            return await self.list(user_id)

        outgoing_pending = sum(
            row["status"] == "pending" and row["requester_user_id"] == user_id
            for row in connections
        )
        if outgoing_pending >= 30:
            raise FriendServiceError(
                "Resolve an existing friend request before sending another.", 429
            )
        await self._request(
            "POST",
            "friend_connections",
            headers={"Prefer": "return=minimal"},
            json={
                "requester_user_id": user_id,
                "addressee_user_id": other_id,
                "status": "pending",
            },
        )
        return await self.list(user_id)

    async def accept(self, user_id: str, relationship_id: str) -> list[dict[str, Any]]:
        response = await self._request(
            "PATCH",
            "friend_connections",
            headers={"Prefer": "return=representation"},
            params={
                "id": f"eq.{relationship_id}",
                "addressee_user_id": f"eq.{user_id}",
                "status": "eq.pending",
            },
            json={
                "status": "accepted",
                "accepted_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        if not response.json():
            raise FriendServiceError("Pending friend request not found.", 404)
        return await self.list(user_id)

    async def remove(self, user_id: str, relationship_id: str) -> None:
        response = await self._request(
            "DELETE",
            "friend_connections",
            headers={"Prefer": "return=representation"},
            params={
                "id": f"eq.{relationship_id}",
                "or": (
                    f"(requester_user_id.eq.{user_id},"
                    f"addressee_user_id.eq.{user_id})"
                ),
            },
        )
        if not response.json():
            raise FriendServiceError("Friend connection not found.", 404)
