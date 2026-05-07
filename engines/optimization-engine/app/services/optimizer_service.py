"""Top-level optimization request handler.

Decides between V1 legacy envelopes (production-row driven) and V2 envelopes
(cut-list-snapshot driven, OR-Tools CP-SAT). Returns a `HandledRequest` describing
the queue message and any out-of-band write that has already been performed (e.g.
HTTP fallback to result-service for oversized payloads).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.schemas.optimization_request import OptimizationQueueEnvelope
from app.schemas.optimization_result import OptimizationCompletedMessage
from app.schemas.optimization_v2 import (
    OptimizationCompletedMessageV2,
    OptimizationFailedMessageV2,
    OptimizationQueueEnvelopeV2,
    OptimizationRequestPayloadV2,
    OptimizationResultPayload,
)
from app.services.cutting_stock_solver import (
    CuttingStockSolver,
    InfeasibleGroupError,
)
from app.services.result_publisher import (
    ResultPublishError,
    ResultServiceClient,
    decide_inline_or_http,
    generate_result_id,
    serialize_payload,
)


@dataclass
class HandledRequest:
    completed_message: OptimizationCompletedMessage | OptimizationCompletedMessageV2 | None
    failed_message: OptimizationFailedMessageV2 | None
    job_id: str

    @property
    def is_failed(self) -> bool:
        return self.failed_message is not None


class OptimizerService:
    def __init__(
        self,
        solver: CuttingStockSolver | None = None,
        result_client: ResultServiceClient | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._logger = logging.getLogger(__name__)
        self._settings = settings or get_settings()
        self._solver = solver or CuttingStockSolver()
        self._result_client = result_client or ResultServiceClient(self._settings)

    def handle_request(
        self, raw_payload: dict[str, Any]
    ) -> HandledRequest:
        envelope_kind = self._detect_envelope_kind(raw_payload)
        if envelope_kind == "v2":
            return self._handle_v2(raw_payload)
        return self._handle_v1(raw_payload)

    def _detect_envelope_kind(self, raw_payload: dict[str, Any]) -> str:
        payload = raw_payload.get("payload")
        if isinstance(payload, dict) and "demandItems" in payload:
            return "v2"
        if isinstance(payload, dict) and "demand_items" in payload:
            return "v2"
        if "cutListSnapshotId" in raw_payload or "cut_list_snapshot_id" in raw_payload:
            return "v2"
        return "v1"

    def _handle_v1(self, raw_payload: dict[str, Any]) -> HandledRequest:
        envelope = OptimizationQueueEnvelope.model_validate(raw_payload)
        completed = OptimizationCompletedMessage(
            metadata={
                "messageId": str(uuid4()),
                "correlationId": envelope.metadata.correlation_id,
                "causationId": envelope.metadata.message_id,
                "attempt": 1,
                "occurredAt": _now_iso(),
            },
            job_id=envelope.request_id,
            result_id=generate_result_id(),
            completed_at=_now_iso(),
        )
        self._logger.info(
            "Handled legacy V1 optimization request '%s' as scaffold completion.",
            envelope.request_id,
        )
        return HandledRequest(
            completed_message=completed,
            failed_message=None,
            job_id=envelope.request_id,
        )

    def _handle_v2(self, raw_payload: dict[str, Any]) -> HandledRequest:
        try:
            envelope = OptimizationQueueEnvelopeV2.model_validate(raw_payload)
        except ValidationError as exc:
            failure = self._build_failure(
                job_id=str(raw_payload.get("requestId") or raw_payload.get("request_id") or "unknown"),
                cut_list_snapshot_id=None,
                reason=f"Optimization V2 envelope validation failed: {exc.errors()[:3]}",
                reason_code="preparation_failed",
                correlation_id=str(raw_payload.get("metadata", {}).get("correlationId", uuid4())),
                causation_id=None,
            )
            return HandledRequest(
                completed_message=None,
                failed_message=failure,
                job_id=failure.job_id,
            )

        try:
            payload = self._payload_with_request_timeout_cap(envelope.payload)
            payload = self._solver.solve(
                request_id=envelope.request_id,
                payload=payload,
                generated_at=_now_iso(),
            )
        except InfeasibleGroupError as exc:
            failure = self._build_failure(
                job_id=envelope.request_id,
                cut_list_snapshot_id=envelope.cut_list_snapshot_id,
                reason=str(exc),
                reason_code="infeasible",
                correlation_id=envelope.metadata.correlation_id,
                causation_id=envelope.metadata.message_id,
            )
            return HandledRequest(
                completed_message=None, failed_message=failure, job_id=envelope.request_id
            )
        except Exception as exc:  # noqa: BLE001 — surface any solver crash as a failure
            self._logger.exception(
                "Unhandled error while solving optimization request '%s'.",
                envelope.request_id,
            )
            failure = self._build_failure(
                job_id=envelope.request_id,
                cut_list_snapshot_id=envelope.cut_list_snapshot_id,
                reason=f"Internal optimizer error: {exc}",
                reason_code="internal_error",
                correlation_id=envelope.metadata.correlation_id,
                causation_id=envelope.metadata.message_id,
            )
            return HandledRequest(
                completed_message=None, failed_message=failure, job_id=envelope.request_id
            )

        floor = envelope.payload.config.min_profile_efficiency_pct
        if floor is not None and floor > 0:
            for breakdown in payload.profile_breakdowns:
                if breakdown.efficiency_pct < floor:
                    failure = self._build_failure(
                        job_id=envelope.request_id,
                        cut_list_snapshot_id=envelope.cut_list_snapshot_id,
                        reason=(
                            f"Profile {breakdown.main_profile_code} efficiency "
                            f"{breakdown.efficiency_pct}% is below configured floor {floor}%"
                        ),
                        reason_code="quality_floor_violation",
                        correlation_id=envelope.metadata.correlation_id,
                        causation_id=envelope.metadata.message_id,
                    )
                    return HandledRequest(
                        completed_message=None,
                        failed_message=failure,
                        job_id=envelope.request_id,
                    )

        return self._publish_completion(envelope, payload)

    def _payload_with_request_timeout_cap(
        self,
        payload: OptimizationRequestPayloadV2,
    ) -> OptimizationRequestPayloadV2:
        request_timeout = max(1, int(self._settings.optimization_request_timeout_sec))
        current_timeout = int(payload.config.solver_time_limit_sec)
        if current_timeout <= request_timeout:
            return payload

        return payload.model_copy(
            update={
                "config": payload.config.model_copy(
                    update={"solver_time_limit_sec": request_timeout}
                )
            }
        )

    def _publish_completion(
        self,
        envelope: OptimizationQueueEnvelopeV2,
        payload: OptimizationResultPayload,
    ) -> HandledRequest:
        payload_dict = payload.model_dump(by_alias=True)
        _serialized, byte_size = serialize_payload(payload_dict)
        inline = decide_inline_or_http(byte_size, self._settings)
        result_id = generate_result_id()
        completed_at = _now_iso()

        if not inline:
            try:
                result_id = self._result_client.write_payload(
                    {
                        "jobId": envelope.request_id,
                        "resultId": result_id,
                        "completedAt": completed_at,
                        "payload": payload_dict,
                    }
                )
            except ResultPublishError as exc:
                self._logger.error(
                    "Falling back to inline payload after result-service write failure: %s",
                    exc,
                )
                inline = True

        completed = OptimizationCompletedMessageV2(
            metadata={
                "messageId": str(uuid4()),
                "correlationId": envelope.metadata.correlation_id,
                "causationId": envelope.metadata.message_id,
                "attempt": 1,
                "occurredAt": _now_iso(),
            },
            job_id=envelope.request_id,
            result_id=result_id,
            cut_list_snapshot_id=envelope.cut_list_snapshot_id,
            completed_at=completed_at,
            payload=payload if inline else None,
        )
        self._logger.info(
            "Solved V2 optimization request '%s' (%d patterns, %d bars, inline=%s).",
            envelope.request_id,
            len(payload.patterns),
            payload.metrics.total_stock_bars,
            inline,
        )
        return HandledRequest(
            completed_message=completed,
            failed_message=None,
            job_id=envelope.request_id,
        )

    def _build_failure(
        self,
        *,
        job_id: str,
        cut_list_snapshot_id: str | None,
        reason: str,
        reason_code: str,
        correlation_id: str,
        causation_id: str | None,
    ) -> OptimizationFailedMessageV2:
        return OptimizationFailedMessageV2(
            metadata={
                "messageId": str(uuid4()),
                "correlationId": correlation_id,
                "causationId": causation_id,
                "attempt": 1,
                "occurredAt": _now_iso(),
            },
            job_id=job_id,
            cut_list_snapshot_id=cut_list_snapshot_id,
            failed_at=_now_iso(),
            reason=reason,
            reason_code=reason_code,  # type: ignore[arg-type]
        )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


# Backwards-compatible alias used by older imports.
OptimizationRequestHandled = OptimizationCompletedMessage
