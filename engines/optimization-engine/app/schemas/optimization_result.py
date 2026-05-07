from app.schemas.optimization_request import MessageMetadata, SharedContractModel


class OptimizationCompletedMessage(SharedContractModel):
    metadata: MessageMetadata
    job_id: str
    result_id: str
    completed_at: str


class OptimizationFailedMessage(SharedContractModel):
    metadata: MessageMetadata
    job_id: str
    failed_at: str
    reason: str
