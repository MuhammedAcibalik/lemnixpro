from typing import Literal

from pydantic import BaseModel


class OptimizationMainProfileInput(BaseModel):
    id: str
    code: str
    name: str
    linked_product_code: str
    linked_product_name: str
    stock_length_mm: int


class OptimizationDemandRow(BaseModel):
    production_row_id: str
    row_index: int
    main_profile_id: str
    main_profile_code: str
    customer_name: str | None = None
    ordering_party_code: str | None = None
    customer_order_number: str | None = None
    customer_order_item_number: str | None = None
    work_order_number: str | None = None
    material_code: str
    material_name: str | None = None
    quantity: float
    order_unit: str
    planned_finish_date: str | None = None
    department_code: str | None = None
    priority: str | None = None


class OptimizationRequestSummary(BaseModel):
    id: str
    week_number: int
    source_batch_id: str
    status: Literal["created", "ready", "failed_preparation"]
    matched_rows: int
    unmatched_rows: int
    created_at: str
    updated_at: str


class OptimizationRequestPayload(BaseModel):
    week_number: int
    source_batch_id: str
    main_profiles: list[OptimizationMainProfileInput]
    demand_rows: list[OptimizationDemandRow]


class OptimizationRequest(BaseModel):
    request: OptimizationRequestSummary
    payload: OptimizationRequestPayload
