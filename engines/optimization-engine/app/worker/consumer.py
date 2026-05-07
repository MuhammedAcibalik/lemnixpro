"""RabbitMQ consumer for optimization request envelopes.

Forwards the raw payload to ``OptimizerService`` (which auto-detects V1 vs V2),
publishes either the rich completion or a typed failure event back to the
optimization exchange, and acknowledges the original delivery.
"""

from __future__ import annotations

import importlib
import json
import logging
import threading
from datetime import UTC, datetime
from types import ModuleType
from typing import Protocol
from uuid import uuid4

from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.schemas.optimization_result import OptimizationFailedMessage
from app.schemas.optimization_v2 import OptimizationStartedMessageV2
from app.services.orchestrator_claim_client import (
    OptimizationClaimClient,
    OptimizationClaimError,
)
from app.services.optimizer_service import HandledRequest, OptimizerService


class DeliveryChannel(Protocol):
    def basic_ack(self, delivery_tag: int) -> None: ...

    def basic_nack(self, delivery_tag: int, requeue: bool = False) -> None: ...

    def basic_publish(
        self, exchange: str, routing_key: str, body: bytes | str
    ) -> None: ...


class ClaimClient(Protocol):
    def claim(self, request_id: str) -> dict: ...


class OptimizationWorker:
    def __init__(self, optimizer_service: OptimizerService | None = None) -> None:
        self.optimizer_service = optimizer_service or OptimizerService()

    def handle_message(self, message_body: bytes | str | dict) -> HandledRequest:
        payload = self._normalize_message_body(message_body)
        return self.optimizer_service.handle_request(payload)

    def _normalize_message_body(self, message_body: bytes | str | dict) -> dict:
        if isinstance(message_body, dict):
            return message_body
        if isinstance(message_body, bytes):
            return json.loads(message_body.decode("utf-8"))
        return json.loads(message_body)


class RabbitMqOptimizationConsumer:
    def __init__(
        self,
        settings: Settings | None = None,
        worker: OptimizationWorker | None = None,
        claim_client: ClaimClient | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.worker = worker or OptimizationWorker()
        self.claim_client = claim_client or OptimizationClaimClient(self.settings)
        self._logger = logging.getLogger(__name__)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def ensure_runtime_available(self) -> None:
        self._load_pika()

    def start_in_background(self) -> threading.Thread:
        if self._thread and self._thread.is_alive():
            return self._thread

        self.ensure_runtime_available()
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self.run_forever,
            name="optimization-request-consumer",
            daemon=True,
        )
        self._thread.start()

        return self._thread

    def stop(self) -> None:
        self._stop_event.set()

    def run_forever(self) -> None:
        pika = self._load_pika()
        connection = None
        channel = None

        try:
            params = pika.URLParameters(self.settings.rabbitmq_url)
            params.heartbeat = self.settings.rabbitmq_heartbeat_sec
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            self._declare_topology(channel)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(
                queue=self.settings.optimization_request_queue,
                on_message_callback=self._on_message,
            )
            self._logger.info(
                'Starting optimization request consumer on queue "%s".',
                self.settings.optimization_request_queue,
            )

            while not self._stop_event.is_set():
                connection.process_data_events(time_limit=1)
        except Exception:
            self._logger.exception(
                "Optimization request consumer stopped unexpectedly."
            )
            raise
        finally:
            if channel is not None and getattr(channel, "is_open", False):
                channel.close()
            if connection is not None and getattr(connection, "is_open", False):
                connection.close()

    def process_delivery(
        self,
        channel: DeliveryChannel,
        delivery_tag: int,
        body: bytes | str | dict,
    ) -> HandledRequest | None:
        try:
            payload = self._normalize_message_body(body)
            job_id = payload.get("requestId") or payload.get("request_id")
            request_payload = payload.get("payload")
            if (
                not isinstance(job_id, str)
                or job_id.strip() == ""
                or not isinstance(request_payload, dict)
            ):
                raise ValueError("Optimization request envelope is missing requestId or payload.")

            claim = self.claim_client.claim(job_id)
            if claim.get("status") != "claimed":
                self._logger.info(
                    'Skipped optimization request "%s" before solve (claim=%s, reason=%s).',
                    job_id,
                    claim.get("canonicalStatus"),
                    claim.get("reason"),
                )
                channel.basic_ack(delivery_tag=delivery_tag)
                return None

            self._publish_started_event(
                channel,
                payload,
                started_at=claim.get("startedAt"),
            )
            handled = self.worker.handle_message(payload)
        except OptimizationClaimError as exc:
            self._logger.warning(
                "Optimization claim failed for delivery %s: %s",
                delivery_tag,
                exc,
            )
            channel.basic_nack(delivery_tag=delivery_tag, requeue=True)
            return None
        except (ValidationError, json.JSONDecodeError, ValueError) as exc:
            self._logger.warning(
                "Rejected invalid optimization request envelope for delivery %s: %s",
                delivery_tag,
                exc,
            )
            self._publish_poison_event(channel, body)
            channel.basic_ack(delivery_tag=delivery_tag)
            return None
        except Exception:
            self._logger.exception(
                "Optimization request handling failed for delivery %s.",
                delivery_tag,
            )
            self._publish_failed_event(channel, body)
            channel.basic_ack(delivery_tag=delivery_tag)
            return None

        if handled.is_failed and handled.failed_message is not None:
            channel.basic_publish(
                exchange=self.settings.optimization_exchange,
                routing_key=self.settings.optimization_failed_routing_key,
                body=handled.failed_message.model_dump_json(by_alias=True),
            )
            self._logger.info(
                'Published optimization.failed for job "%s".', handled.job_id
            )
        elif handled.completed_message is not None:
            channel.basic_publish(
                exchange=self.settings.optimization_exchange,
                routing_key=self.settings.optimization_completed_routing_key,
                body=handled.completed_message.model_dump_json(by_alias=True),
            )
            self._logger.info(
                'Published optimization.completed for job "%s".', handled.job_id
            )

        channel.basic_ack(delivery_tag=delivery_tag)
        return handled

    def _publish_started_event(
        self,
        channel: DeliveryChannel,
        body: bytes | str | dict,
        started_at: str | None = None,
    ) -> None:
        try:
            payload = self._normalize_message_body(body)
        except Exception:
            return

        job_id = payload.get("requestId") or payload.get("request_id")
        request_payload = payload.get("payload")
        if (
            not isinstance(job_id, str)
            or job_id.strip() == ""
            or not isinstance(request_payload, dict)
        ):
            return

        started_message = OptimizationStartedMessageV2(
            metadata={
                "messageId": str(uuid4()),
                "correlationId": self._extract_correlation_id(payload),
                "causationId": self._extract_message_id(payload),
                "attempt": 1,
                "occurredAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            },
            job_id=job_id,
            cut_list_snapshot_id=self._extract_cut_list_snapshot_id(payload),
            started_at=started_at
            if isinstance(started_at, str) and started_at.strip()
            else datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        )
        channel.basic_publish(
            exchange=self.settings.optimization_exchange,
            routing_key=self.settings.optimization_started_routing_key,
            body=started_message.model_dump_json(by_alias=True),
        )
        self._logger.info('Published optimization.started for job "%s".', job_id)

    def _publish_failed_event(
        self, channel: DeliveryChannel, body: bytes | str | dict
    ) -> None:
        try:
            payload = self._normalize_message_body(body)
            job_id = payload.get("requestId") or payload.get("request_id")
        except Exception:
            job_id = None

        if not isinstance(job_id, str) or job_id.strip() == "":
            return

        failed_message = OptimizationFailedMessage(
            metadata={
                "messageId": str(uuid4()),
                "correlationId": self._extract_correlation_id(payload),
                "causationId": self._extract_message_id(payload),
                "attempt": 1,
                "occurredAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            },
            job_id=job_id,
            failed_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            reason="Optimization request handling failed.",
        )
        channel.basic_publish(
            exchange=self.settings.optimization_exchange,
            routing_key=self.settings.optimization_failed_routing_key,
            body=failed_message.model_dump_json(by_alias=True),
        )

    def _publish_poison_event(
        self, channel: DeliveryChannel, body: bytes | str | dict
    ) -> None:
        if isinstance(body, (bytes, str)):
            poison_body = body
        else:
            poison_body = json.dumps(body)

        channel.basic_publish(
            exchange=self.settings.rabbitmq_dead_letter_exchange,
            routing_key=self.settings.optimization_request_poison_routing_key,
            body=poison_body,
        )

    def _extract_correlation_id(self, payload: dict) -> str:
        metadata = payload.get("metadata")

        if isinstance(metadata, dict):
            correlation_id = metadata.get("correlationId") or metadata.get(
                "correlation_id"
            )
            if isinstance(correlation_id, str) and correlation_id.strip():
                return correlation_id
        return str(uuid4())

    def _extract_message_id(self, payload: dict) -> str | None:
        metadata = payload.get("metadata")

        if isinstance(metadata, dict):
            message_id = metadata.get("messageId") or metadata.get("message_id")
            if isinstance(message_id, str) and message_id.strip():
                return message_id
        return None

    def _extract_cut_list_snapshot_id(self, payload: dict) -> str | None:
        snapshot_id = payload.get("cutListSnapshotId") or payload.get(
            "cut_list_snapshot_id"
        )
        if isinstance(snapshot_id, str) and snapshot_id.strip():
            return snapshot_id

        request_payload = payload.get("payload")
        if isinstance(request_payload, dict):
            snapshot_id = request_payload.get("cutListSnapshotId") or request_payload.get(
                "cut_list_snapshot_id"
            )
            if isinstance(snapshot_id, str) and snapshot_id.strip():
                return snapshot_id

        return None

    def _normalize_message_body(self, message_body: bytes | str | dict) -> dict:
        if isinstance(message_body, dict):
            return message_body
        if isinstance(message_body, bytes):
            return json.loads(message_body.decode("utf-8"))
        return json.loads(message_body)

    def _declare_topology(self, channel: object) -> None:
        channel.exchange_declare(
            exchange=self.settings.optimization_exchange,
            exchange_type="topic",
            durable=True,
        )
        channel.exchange_declare(
            exchange=self.settings.rabbitmq_dead_letter_exchange,
            exchange_type="topic",
            durable=True,
        )
        channel.exchange_declare(
            exchange=self.settings.rabbitmq_retry_exchange,
            exchange_type="topic",
            durable=True,
        )
        channel.queue_declare(
            queue=self.settings.optimization_request_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": self.settings.rabbitmq_retry_exchange,
                "x-dead-letter-routing-key": (
                    self.settings.optimization_requested_routing_key
                ),
            },
        )
        channel.queue_declare(
            queue=self.settings.optimization_request_retry_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": self.settings.optimization_exchange,
                "x-dead-letter-routing-key": (
                    self.settings.optimization_requested_routing_key
                ),
                "x-message-ttl": self.settings.rabbitmq_retry_delay_ms,
            },
        )
        channel.queue_declare(
            queue=self.settings.optimization_request_dead_letter_queue,
            durable=True,
        )
        channel.queue_bind(
            queue=self.settings.optimization_request_queue,
            exchange=self.settings.optimization_exchange,
            routing_key=self.settings.optimization_requested_routing_key,
        )
        channel.queue_bind(
            queue=self.settings.optimization_request_retry_queue,
            exchange=self.settings.rabbitmq_retry_exchange,
            routing_key=self.settings.optimization_requested_routing_key,
        )
        channel.queue_bind(
            queue=self.settings.optimization_request_dead_letter_queue,
            exchange=self.settings.rabbitmq_dead_letter_exchange,
            routing_key=self.settings.optimization_request_poison_routing_key,
        )

    def _on_message(
        self,
        channel: DeliveryChannel,
        method: object,
        _properties: object,
        body: bytes,
    ) -> None:
        delivery_tag = getattr(method, "delivery_tag")
        self.process_delivery(channel, delivery_tag, body)

    def _load_pika(self) -> ModuleType:
        try:
            return importlib.import_module("pika")
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "RabbitMQ consumer startup requires the 'pika' package. "
                "Install the optimization engine dependencies before running the service."
            ) from exc
