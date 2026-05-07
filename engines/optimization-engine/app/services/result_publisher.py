"""Publishes the rich OptimizationResultPayload to result-service.

Uses inline RabbitMQ payload when below the configured byte budget, falls back to a
direct HTTP POST when the payload is too large for safe queue transport. Either path
yields a single canonical `OptimizationCompletedMessageV2` on the queue carrying the
job/result identifiers; the rich payload either rides inline or is fetched from
result-service via its job-correlated read endpoint.
"""

from __future__ import annotations

import json
import logging
from uuid import uuid4

import httpx

from app.core.config import Settings


class ResultPublishError(RuntimeError):
    pass


class ResultServiceClient:
    """Thin HTTP client for the internal result-service write endpoint."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._logger = logging.getLogger(__name__)

    def write_payload(self, payload_json: dict) -> str:
        """Persist the result payload and return the assigned result_id."""

        url = f"{self._settings.result_service_base_url.rstrip('/')}/internal/results/payload"
        headers = {
            "x-lemnixpro-internal-token": self._settings.internal_service_auth_secret,
            "content-type": "application/json",
        }
        try:
            response = httpx.post(url, json=payload_json, headers=headers, timeout=20.0)
        except httpx.HTTPError as exc:
            raise ResultPublishError(
                f"Failed to write optimization payload to result-service at {url}: {exc}"
            ) from exc

        if response.status_code >= 400:
            raise ResultPublishError(
                f"result-service rejected payload write ({response.status_code}): "
                f"{response.text}"
            )

        body = response.json()
        result_id = body.get("resultId") or body.get("id")
        if not isinstance(result_id, str):
            raise ResultPublishError(
                f"result-service response missing resultId: {body}"
            )
        return result_id


def decide_inline_or_http(
    payload_json_bytes: int, settings: Settings
) -> bool:
    """Return True when the payload should be inlined on the queue message."""

    return payload_json_bytes <= settings.inline_payload_byte_limit


def serialize_payload(payload_dict: dict) -> tuple[str, int]:
    encoded = json.dumps(payload_dict, separators=(",", ":"))
    return encoded, len(encoded.encode("utf-8"))


def generate_result_id() -> str:
    return str(uuid4())
