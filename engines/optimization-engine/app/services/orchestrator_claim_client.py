from __future__ import annotations

from typing import Any, Literal

import httpx

from app.core.config import Settings, get_settings

# Must match @lemnixpro/shared-contracts `requestHeaders.internalServiceToken`.
_INTERNAL_SERVICE_TOKEN_HEADER = "x-lemnixpro-internal-token"

ClaimStatus = Literal["claimed", "skipped"]


class OptimizationClaimError(RuntimeError):
    pass


class OptimizationClaimClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def claim(self, request_id: str) -> dict[str, Any]:
        url = (
            self._settings.optimization_orchestrator_base_url.rstrip("/")
            + f"/internal/optimization-requests/v2/{request_id}/claim"
        )

        try:
            response = httpx.post(
                url,
                headers={
                    _INTERNAL_SERVICE_TOKEN_HEADER: (
                        self._settings.internal_service_auth_secret
                    )
                },
                timeout=self._settings.internal_request_timeout_sec,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise OptimizationClaimError(
                f"Optimization claim failed for request '{request_id}': {exc}"
            ) from exc

        payload = response.json()
        status = payload.get("status")
        if status not in ("claimed", "skipped"):
            raise OptimizationClaimError(
                f"Optimization claim returned invalid status for request '{request_id}'."
            )
        return payload
