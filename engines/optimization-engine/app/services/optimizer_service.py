import logging
from typing import Literal

from pydantic import BaseModel

from app.schemas.optimization_request import OptimizationQueueEnvelope


class OptimizationRequestHandled(BaseModel):
    request_id: str
    week_number: int
    source_batch_id: str
    main_profile_count: int
    demand_row_count: int
    queued_at: str
    status: Literal["accepted"]


class OptimizerService:
    def __init__(self) -> None:
        self._logger = logging.getLogger(__name__)

    def handle_request(
        self, envelope: OptimizationQueueEnvelope
    ) -> OptimizationRequestHandled:
        handled_request = OptimizationRequestHandled(
            request_id=envelope.request_id,
            week_number=envelope.week_number,
            source_batch_id=envelope.source_batch_id,
            main_profile_count=len(envelope.payload.main_profiles),
            demand_row_count=len(envelope.payload.demand_rows),
            queued_at=envelope.queued_at,
            status="accepted",
        )
        self._logger.info(
            'Accepted optimization request "%s" with %s demand rows.',
            handled_request.request_id,
            handled_request.demand_row_count,
        )

        return handled_request
