from typing import Literal

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class SharedContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class MessageMetadata(SharedContractModel):
    message_id: str
    correlation_id: str
    causation_id: str | None = None
    attempt: int
    occurred_at: str


class OptimizationMainProfileInput(SharedContractModel):
    id: str
    code: str
    name: str
    linked_product_code: str
    linked_product_name: str
    stock_length_mm: int


class OptimizationDemandRow(SharedContractModel):
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


class OptimizationRequestSummary(SharedContractModel):
    id: str
    week_number: int
    source_batch_id: str
    status: Literal["created", "ready", "queued", "failed_preparation"]
    matched_rows: int
    unmatched_rows: int
    queued_at: str | None = None
    created_at: str
    updated_at: str


class OptimizationRequestPayload(SharedContractModel):
    week_number: int
    source_batch_id: str
    main_profiles: list[OptimizationMainProfileInput]
    demand_rows: list[OptimizationDemandRow]


class OptimizationQueueEnvelope(SharedContractModel):
    metadata: MessageMetadata
    request_id: str
    week_number: int
    source_batch_id: str
    payload: OptimizationRequestPayload
    queued_at: str
