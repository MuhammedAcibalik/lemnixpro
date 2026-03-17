from app.schemas.optimization_request import OptimizationRequest
from app.schemas.optimization_result import OptimizationResult


class OptimizerService:
    def build_placeholder_result(
        self, request: OptimizationRequest
    ) -> OptimizationResult:
        return OptimizationResult(
            job_id=request.job_id,
            result_id="pending-result",
            completed_at=request.requested_at,
            status="not_implemented",
        )
