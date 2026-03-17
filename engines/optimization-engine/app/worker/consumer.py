from app.schemas.optimization_request import OptimizationRequest
from app.services.optimizer_service import OptimizerService


class OptimizationWorker:
    def __init__(self) -> None:
        self.optimizer_service = OptimizerService()

    def handle(self, request: OptimizationRequest) -> None:
        self.optimizer_service.build_placeholder_result(request)
