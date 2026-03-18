from app.schemas.optimization_request import OptimizationQueueEnvelope
from app.schemas.optimization_result import OptimizationResult


class OptimizerService:
    def build_placeholder_result(
        self, envelope: OptimizationQueueEnvelope
    ) -> OptimizationResult:
        return OptimizationResult(
            job_id=envelope.request_id,
            result_id="pending-result",
            completed_at=envelope.queued_at,
            status="not_implemented",
        )
