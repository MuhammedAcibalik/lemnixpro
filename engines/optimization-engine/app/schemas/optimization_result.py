from pydantic import BaseModel


class OptimizationResult(BaseModel):
    job_id: str
    result_id: str
    completed_at: str
    status: str
