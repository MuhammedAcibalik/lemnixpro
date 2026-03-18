import json

from app.schemas.optimization_request import OptimizationQueueEnvelope
from app.services.optimizer_service import OptimizerService


class OptimizationWorker:
    def __init__(self) -> None:
        self.optimizer_service = OptimizerService()

    def handle(self, envelope: OptimizationQueueEnvelope) -> None:
        self.optimizer_service.build_placeholder_result(envelope)

    def handle_message(self, message_body: bytes | str | dict) -> None:
        payload = self._normalize_message_body(message_body)
        envelope = OptimizationQueueEnvelope.model_validate(payload)
        self.handle(envelope)

    def _normalize_message_body(self, message_body: bytes | str | dict) -> dict:
        if isinstance(message_body, dict):
            return message_body

        if isinstance(message_body, bytes):
            return json.loads(message_body.decode("utf-8"))

        return json.loads(message_body)
