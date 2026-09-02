from __future__ import annotations

import json
import hashlib
import logging
import math
import re
from abc import ABC, abstractmethod
from typing import Any

import httpx

from .config import Settings
from .domain import Interview


logger = logging.getLogger("leetally.api")


def build_memory_summary(interview: Interview, assessment: dict[str, Any]) -> str:
    """Create a compact, evidence-backed memory without retaining raw dialogue."""
    strengths = ", ".join(str(value) for value in assessment.get("strengths", [])[:3])
    improvements = ", ".join(
        str(value) for value in assessment.get("priority_improvements", [])[:3]
    )
    topics = ", ".join(interview.screen_context.problem_topics[:8])
    return " ".join(
        part for part in (
            f"Previous {interview.interview_type} interview on {interview.problem_title}.",
            f"Difficulty: {interview.difficulty or 'unknown'}.",
            f"Target company: {interview.target_company or 'general'}.",
            f"Topics: {topics}." if topics else "",
            f"Overall score: {assessment.get('overall_score', 'unknown')}/10.",
            f"Strengths: {strengths}." if strengths else "",
            f"Needs practice: {improvements}." if improvements else "",
        ) if part
    )[:2000]


def build_memory_query(interview: Interview) -> str:
    topics = ", ".join(interview.screen_context.problem_topics[:8])
    return " ".join(
        part for part in (
            f"{interview.interview_type} interview",
            interview.problem_title,
            interview.difficulty or "",
            interview.target_company or "",
            topics,
        ) if part
    )[:1000]


class InterviewMemoryService(ABC):
    @abstractmethod
    async def relevant(self, user_id: str, interview: Interview) -> list[str]:
        ...

    @abstractmethod
    async def remember(
        self, user_id: str, interview: Interview, assessment: dict[str, Any]
    ) -> None:
        ...


class InMemoryInterviewMemoryService(InterviewMemoryService):
    def __init__(self) -> None:
        self.items: dict[str, list[tuple[str, str]]] = {}

    async def relevant(self, user_id: str, interview: Interview) -> list[str]:
        del interview
        return [summary for _, summary in self.items.get(user_id, [])[-3:]][::-1]

    async def remember(
        self, user_id: str, interview: Interview, assessment: dict[str, Any]
    ) -> None:
        records = self.items.setdefault(user_id, [])
        summary = build_memory_summary(interview, assessment)
        records[:] = [item for item in records if item[0] != interview.id]
        records.append((interview.id, summary))


class SupabaseInterviewMemoryService(InterviewMemoryService):
    """Server-only vector memory with fail-open behavior for live interviews."""

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_service_role_key:
            raise RuntimeError("Personal memory storage is not configured.")
        self.settings = settings
        self.rest_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _embedding(self, text: str) -> list[float]:
        if self.settings.memory_embedding_provider.casefold() == "local":
            return self._local_embedding(text)
        if not self.settings.openai_api_key:
            raise ValueError("OpenAI embedding provider is not configured.")
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {self.settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.settings.memory_embedding_model,
                    "input": text,
                    "dimensions": self.settings.memory_embedding_dimensions,
                    "encoding_format": "float",
                },
            )
        response.raise_for_status()
        values = response.json()["data"][0]["embedding"]
        if len(values) != self.settings.memory_embedding_dimensions or not all(
            math.isfinite(float(value)) for value in values
        ):
            raise ValueError("Embedding response has invalid dimensions or values.")
        return [float(value) for value in values]

    def _local_embedding(self, text: str) -> list[float]:
        """Create a normalized feature-hashed embedding with no external call.

        The vocabulary is intentionally derived only from compact scorecard
        summaries and interview metadata. It gives pgvector useful lexical and
        topic similarity while keeping the default memory path quota-free.
        """
        dimensions = self.settings.memory_embedding_dimensions
        if dimensions <= 0:
            raise ValueError("Memory embedding dimensions must be positive.")
        vector = [0.0] * dimensions
        tokens = re.findall(r"[a-z0-9+#.-]{2,}", text.casefold())
        features = tokens + [
            f"{tokens[index]}::{tokens[index + 1]}"
            for index in range(len(tokens) - 1)
        ]
        for feature in features:
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            raw = int.from_bytes(digest, "big")
            index = raw % dimensions
            vector[index] += 1.0 if raw & 1 else -1.0
        magnitude = math.sqrt(sum(value * value for value in vector))
        if magnitude == 0:
            vector[0] = 1.0
            return vector
        return [value / magnitude for value in vector]

    async def relevant(self, user_id: str, interview: Interview) -> list[str]:
        try:
            embedding = await self._embedding(build_memory_query(interview))
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{self.rest_url}/rpc/match_interview_memories",
                    headers=self.headers,
                    json={
                        "p_user_id": user_id,
                        "p_query_embedding": embedding,
                        "p_match_threshold": self.settings.memory_match_threshold,
                        "p_match_count": self.settings.memory_match_count,
                    },
                )
            response.raise_for_status()
            rows = response.json()
            return [str(row["summary"])[:2000] for row in rows if row.get("summary")]
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            logger.warning(json.dumps({
                "level": "warning",
                "event": "personal_memory_retrieval_failed",
                "error_type": type(error).__name__,
            }))
            return []

    async def remember(
        self, user_id: str, interview: Interview, assessment: dict[str, Any]
    ) -> None:
        try:
            summary = build_memory_summary(interview, assessment)
            embedding = await self._embedding(summary)
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{self.rest_url}/interview_memories",
                    headers={**self.headers, "Prefer": "resolution=merge-duplicates"},
                    params={"on_conflict": "interview_id"},
                    json={
                        "user_id": user_id,
                        "interview_id": interview.id,
                        "memory_type": "interview_scorecard",
                        "summary": summary,
                        "metadata": {
                            "problem_slug": interview.problem_slug,
                            "problem_title": interview.problem_title,
                            "difficulty": interview.difficulty,
                            "target_company": interview.target_company,
                            "interview_type": interview.interview_type,
                            "topics": interview.screen_context.problem_topics[:8],
                        },
                        "embedding": embedding,
                    },
                )
            response.raise_for_status()
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            logger.warning(json.dumps({
                "level": "warning",
                "event": "personal_memory_write_failed",
                "interview_id": interview.id,
                "error_type": type(error).__name__,
            }))
