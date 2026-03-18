from __future__ import annotations

import importlib
import json
import logging
import threading
from types import ModuleType
from typing import Protocol

from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.schemas.optimization_request import OptimizationQueueEnvelope
from app.services.optimizer_service import OptimizationRequestHandled, OptimizerService


class DeliveryChannel(Protocol):
    def basic_ack(self, delivery_tag: int) -> None: ...

    def basic_nack(self, delivery_tag: int, requeue: bool = False) -> None: ...


class OptimizationWorker:
    def __init__(self) -> None:
        self.optimizer_service = OptimizerService()

    def handle(
        self, envelope: OptimizationQueueEnvelope
    ) -> OptimizationRequestHandled:
        return self.optimizer_service.handle_request(envelope)

    def handle_message(
        self, message_body: bytes | str | dict
    ) -> OptimizationRequestHandled:
        payload = self._normalize_message_body(message_body)
        envelope = OptimizationQueueEnvelope.model_validate(payload)
        return self.handle(envelope)

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
    ) -> None:
        self.settings = settings or get_settings()
        self.worker = worker or OptimizationWorker()
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
            connection = pika.BlockingConnection(
                pika.URLParameters(self.settings.rabbitmq_url)
            )
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
        self, channel: DeliveryChannel, delivery_tag: int, body: bytes | str | dict
    ) -> OptimizationRequestHandled | None:
        try:
            handled_request = self.worker.handle_message(body)
        except (ValidationError, json.JSONDecodeError) as exc:
            self._logger.warning(
                "Rejected invalid optimization request envelope for delivery %s: %s",
                delivery_tag,
                exc,
            )
            channel.basic_nack(delivery_tag=delivery_tag, requeue=False)

            return None
        except Exception:
            self._logger.exception(
                "Optimization request handling failed for delivery %s.",
                delivery_tag,
            )
            channel.basic_nack(delivery_tag=delivery_tag, requeue=True)
            raise

        channel.basic_ack(delivery_tag=delivery_tag)
        self._logger.info(
            'Handled optimization request "%s" from the queue.',
            handled_request.request_id,
        )

        return handled_request

    def _declare_topology(self, channel: object) -> None:
        channel.exchange_declare(
            exchange=self.settings.optimization_exchange,
            exchange_type="topic",
            durable=True,
        )
        channel.queue_declare(
            queue=self.settings.optimization_request_queue,
            durable=True,
        )
        channel.queue_bind(
            queue=self.settings.optimization_request_queue,
            exchange=self.settings.optimization_exchange,
            routing_key=self.settings.optimization_requested_routing_key,
        )

    def _on_message(
        self, channel: DeliveryChannel, method: object, _properties: object, body: bytes
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
