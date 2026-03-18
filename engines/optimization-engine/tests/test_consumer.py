import json
import unittest

from app.core.config import Settings
from app.worker.consumer import RabbitMqOptimizationConsumer, OptimizationWorker


VALID_ENVELOPE = {
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

    def basic_ack(self, delivery_tag: int) -> None:
        self.acked.append(delivery_tag)

    def basic_nack(self, delivery_tag: int, requeue: bool = False) -> None:
        self.nacked.append((delivery_tag, requeue))


class FailingWorker:
    def handle_message(self, _message_body):  # pragma: no cover - exercised via test
        raise RuntimeError("worker failure")


class OptimizationConsumerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = Settings()

    def test_worker_parses_queue_envelope_and_returns_handled_summary(self) -> None:
        worker = OptimizationWorker()

        handled_request = worker.handle_message(json.dumps(VALID_ENVELOPE))

        self.assertEqual(
            handled_request.request_id,
            VALID_ENVELOPE["requestId"],
        )
        self.assertEqual(handled_request.status, "accepted")
        self.assertEqual(handled_request.main_profile_count, 1)
        self.assertEqual(handled_request.demand_row_count, 1)

    def test_consumer_acks_valid_delivery(self) -> None:
        consumer = RabbitMqOptimizationConsumer(settings=self.settings)
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=7, body=json.dumps(VALID_ENVELOPE)
        )

        self.assertIsNotNone(handled_request)
        self.assertEqual(channel.acked, [7])
        self.assertEqual(channel.nacked, [])

    def test_consumer_rejects_invalid_envelope_without_requeue(self) -> None:
        consumer = RabbitMqOptimizationConsumer(settings=self.settings)
        channel = FakeChannel()

        handled_request = consumer.process_delivery(
            channel, delivery_tag=9, body=b'{"requestId":"missing-payload"}'
        )

        self.assertIsNone(handled_request)
        self.assertEqual(channel.acked, [])
        self.assertEqual(channel.nacked, [(9, False)])

    def test_consumer_requeues_delivery_when_worker_fails(self) -> None:
        consumer = RabbitMqOptimizationConsumer(
            settings=self.settings, worker=FailingWorker()
        )
        channel = FakeChannel()

        with self.assertRaisesRegex(RuntimeError, "worker failure"):
            consumer.process_delivery(
                channel, delivery_tag=11, body=json.dumps(VALID_ENVELOPE)
            )

        self.assertEqual(channel.acked, [])
        self.assertEqual(channel.nacked, [(11, True)])


if __name__ == "__main__":
    unittest.main()
