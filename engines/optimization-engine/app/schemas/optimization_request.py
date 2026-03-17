from pydantic import BaseModel


class OptimizationRequest(BaseModel):
    job_id: str
    week_code: str
    requested_at: str
    requested_by: str
