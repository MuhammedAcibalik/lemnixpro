import json
import unittest

from app.core.config import Settings
from app.worker.consumer import RabbitMqOptimizationConsumer, OptimizationWorker


VALID_ENVELOPE = {
    "metadata": {
        "messageId": "55555555-5555-4555-8555-555555555555",
        "correlationId": "66666666-6666-4666-8666-666666666666",
        "attempt": 1,
        "occurredAt": "2026-03-18T09:00:00.000Z",
    },
    "requestId": "11111111-1111-4111-8111-111111111111",
    "weekNumber": 14,
    "sourceBatchId": "22222222-2222-4222-8222-222222222222",
    "payload": {
        "weekNumber": 14,
        "sourceBatchId": "22222222-2222-4222-8222-222222222222",
        "mainProfiles": [
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "code": "MP-001",
                "name": "Window Frame Profile",
                "linkedProductCode": "PRD-100",
                "linkedProductName": "Window Frame",
                "stockLengthMm": 6500,
            }
        ],
        "demandRows": [
            {
                "productionRowId": "44444444-4444-4444-8444-444444444444",
                "rowIndex": 2,
                "mainProfileId": "33333333-3333-4333-8333-333333333333",
                "mainProfileCode": "MP-001",
                "customerName": "Atlas Aluminyum",
                "orderingPartyCode": "OP-101",
                "customerOrderNumber": "000201",
                "customerOrderItemNumber": "00010",
                "workOrderNumber": "WO-101",
                "materialCode": "PRD-100",
                "materialName": "Window Frame",
                "quantity": 18,
                "orderUnit": "ADET",
                "plannedFinishDate": "2026-03-20",
                "departmentCode": "CUT01",
                "priority": "HIGH",
            }
        ],
    },
    "queuedAt": "2026-03-18T09:00:00.000Z",
}


class FakeChannel:
    def __init__(self) -> None:
        self.acked: list[int] = []
        self.nacked: list[tuple[int, bool]] = []
        self.published: list[tuple[str, str, str | bytes]] = []

    def basic_ack(self, delivery_tag: int) -> None:
        self.acked.append(delivery_tag)

    def basic_nack(self, delivery_tag: int, requeue: bool = False) -> None:
        self.nacked.append((delivery_tag, requeue))

    def basic_publish(self, exchange: str, routing_key: str, body: str | bytes) -> None:
        self.published.append((exchange, routing_key, body))


class FailingWorker:
    def handle_message(self, _message_body):  # pragma: no cover - exercised via test
        raise RuntimeError("worker failure")


class ClaimingClient:
    def __init__(self, response: dict) -> None:
        self.response = response
        self.claimed_ids: list[str] = []

    def claim(self, request_id: str) -> dict:
        self.claimed_ids.append(request_id)
        return self.response


class OptimizationConsumerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = Settings()

    def test_worker_parses_queue_envelope_and_returns_completed_message(self) -> None:
        worker = OptimizationWorker()

        handled_request = worker.handle_message(json.dumps(VALID_ENVELOPE))

        self.assertEqual(handled_request.job_id, VALID_ENVELOPE["requestId"])
        self.assertIsNone(handled_request.failed_message)
        self.assertIsNotNone(handled_request.completed_message)
        completed = handled_request.completed_message
        self.assertEqual(completed.job_id, VALID_ENVELOPE["requestId"])
        self.assertIsNotNone(completed.result_id)
        self.assertIsNotNone(completed.completed_at)

    def test_consumer_acks_valid_delivery(self) -> None:
        consumer = RabbitMqOptimizationConsumer(
            settings=self.settings,
            claim_client=ClaimingClient(
                {
                    "status": "claimed",
                    "requestId": VALID_ENVELOPE["requestId"],
                    "canonicalStatus": "running",
                    "startedAt": "2026-03-18T09:00:01.000Z",
                }
            ),
        )
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=7, body=json.dumps(VALID_ENVELOPE)
        )

        self.assertIsNotNone(handled_request)
        self.assertEqual(channel.acked, [7])
        self.assertEqual(channel.nacked, [])
        self.assertEqual(
            channel.published[1][1],
            self.settings.optimization_completed_routing_key,
        )

    def test_consumer_publishes_started_before_terminal_event(self) -> None:
        claim_client = ClaimingClient(
            {
                "status": "claimed",
                "requestId": VALID_ENVELOPE["requestId"],
                "canonicalStatus": "running",
                "startedAt": "2026-03-18T09:00:01.000Z",
            }
        )
        consumer = RabbitMqOptimizationConsumer(
            settings=self.settings,
            claim_client=claim_client,
        )
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=8, body=json.dumps(VALID_ENVELOPE)
        )

        self.assertIsNotNone(handled_request)
        self.assertEqual(claim_client.claimed_ids, [VALID_ENVELOPE["requestId"]])
        self.assertEqual(channel.acked, [8])
        self.assertEqual(
            channel.published[0][1],
            self.settings.optimization_started_routing_key,
        )
        self.assertEqual(
            channel.published[1][1],
            self.settings.optimization_completed_routing_key,
        )

    def test_consumer_rejects_invalid_envelope_without_event(self) -> None:
        consumer = RabbitMqOptimizationConsumer(settings=self.settings)
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=9, body=b'{"requestId":"missing-payload"}'
        )

        self.assertIsNone(handled_request)
        self.assertEqual(channel.acked, [9])
        self.assertEqual(channel.nacked, [])
        self.assertEqual(
            channel.published[0][1],
            self.settings.optimization_request_poison_routing_key,
        )

    def test_consumer_publishes_failed_event_when_worker_fails(self) -> None:
        consumer = RabbitMqOptimizationConsumer(
            settings=self.settings,
            worker=FailingWorker(),
            claim_client=ClaimingClient(
                {
                    "status": "claimed",
                    "requestId": VALID_ENVELOPE["requestId"],
                    "canonicalStatus": "running",
                    "startedAt": "2026-03-18T09:00:01.000Z",
                }
            ),
        )
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=11, body=json.dumps(VALID_ENVELOPE)
        )

        self.assertIsNone(handled_request)
        self.assertEqual(channel.acked, [11])
        self.assertEqual(channel.nacked, [])
        self.assertEqual(
            channel.published[1][1],
            self.settings.optimization_failed_routing_key,
        )

    def test_consumer_skips_stale_message_when_claim_is_rejected(self) -> None:
        class NeverCalledWorker:
            def handle_message(self, _message_body):  # pragma: no cover
                raise AssertionError("stale messages must not be solved")

        claim_client = ClaimingClient(
            {
                "status": "skipped",
                "requestId": VALID_ENVELOPE["requestId"],
                "canonicalStatus": "cancelled",
                "reason": "superseded_by_newer_request",
                "startedAt": None,
            }
        )
        consumer = RabbitMqOptimizationConsumer(
            settings=self.settings,
            worker=NeverCalledWorker(),
            claim_client=claim_client,
        )
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=12, body=json.dumps(VALID_ENVELOPE)
        )

        self.assertIsNone(handled_request)
        self.assertEqual(claim_client.claimed_ids, [VALID_ENVELOPE["requestId"]])
        self.assertEqual(channel.acked, [12])
        self.assertEqual(channel.nacked, [])
        self.assertEqual(channel.published, [])


if __name__ == "__main__":
    unittest.main()
