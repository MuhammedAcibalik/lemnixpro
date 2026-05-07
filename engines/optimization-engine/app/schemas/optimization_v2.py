"""V2 transport contracts for cut-list-snapshot driven optimization.

Mirrors `packages/shared-contracts/src/index.ts` V2 types. Field names use camelCase
on the wire (driven by SharedContractModel.alias_generator). All values arrive in
millimetres (integer) and integer counts; floats appear only in computed
percentage / efficiency outputs.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator

from app.schemas.optimization_request import MessageMetadata, SharedContractModel

MaterialColorClass = Literal["painted", "anodized"]
StockBarRole = Literal["primary", "secondary"]
SolverMode = Literal["cp_sat", "heuristic_fallback"]


class StockBar(SharedContractModel):
    length_mm: int = Field(..., gt=0)
    role: StockBarRole


class ProfileGroupOverride(SharedContractModel):
    main_profile_id: str
    stock_bars: list[StockBar]
    display_code: str | None = None
    display_name: str | None = None


class DemandItem(SharedContractModel):
    production_row_id: str
    row_index: int
    work_order_number: str | None = None
    main_profile_id: str
    main_profile_code: str
    main_profile_name: str
    material_code: str
    material_name: str | None = None
    material_color: str
    material_color_class: MaterialColorClass
    cutting_code: str
    cutting_name: str
    piece_length_mm: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)


class ProfileGroup(SharedContractModel):
    main_profile_id: str
    main_profile_code: str
    main_profile_name: str
    material_color_class: MaterialColorClass
    stock_bars: list[StockBar]
    demand_item_count: int
    total_piece_length_mm: int


class OptimizationConfig(SharedContractModel):
    kerf_mm: int = Field(default=4, ge=0)
    min_reusable_scrap_mm: int = Field(default=200, ge=0)
    allow_mixing_stock_bars: bool = True
    solver_time_limit_sec: int = Field(default=60, gt=0)
    random_seed: int = Field(default=1)
    max_pieces_per_stock_bar: int | None = Field(
        default=None,
        description=(
            "Optional production cap for how many cut pieces may be assigned to one "
            "stock bar. Null keeps pure cutting-stock optimisation unconstrained."
        ),
    )
    min_profile_efficiency_pct: float | None = None
    pattern_consolidation_enabled: bool = True
    max_distinct_patterns_per_profile: int | None = Field(default=5)
    pattern_quality_tolerance_mm: int = Field(default=0, ge=0)
    max_stock_length_variety_per_profile: int | None = Field(
        default=1,
        description=(
            "Max distinct nominal stock lengths that may appear on used bars per profile "
            "(length + stock role distinguish rows). Separate from profile_groups[].stock_bars rows, "
            "which enumerate the allowable supply catalogue for this scenario."
        ),
    )
    prefer_reusable_scrap: bool = True
    allow_post_repack_pattern_increase: bool = False

    @field_validator(
        "max_distinct_patterns_per_profile",
        "max_stock_length_variety_per_profile",
        "max_pieces_per_stock_bar",
        mode="before",
    )
    @classmethod
    def _optional_positive(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, int) and value < 1:
            raise ValueError("Must be >= 1 when provided")
        return value


class OptimizationRequestPayloadV2(SharedContractModel):
    cut_list_snapshot_id: str
    plan_year: int
    week_number: int
    selected_work_order_numbers: list[str] | Literal["ALL"]
    overrides: list[ProfileGroupOverride]
    config: OptimizationConfig
    profile_groups: list[ProfileGroup]
    demand_items: list[DemandItem]


class OptimizationQueueEnvelopeV2(SharedContractModel):
    metadata: MessageMetadata
    request_id: str
    cut_list_snapshot_id: str
    plan_year: int
    week_number: int
    payload: OptimizationRequestPayloadV2
    queued_at: str


class PatternPiece(SharedContractModel):
    cutting_code: str
    cutting_name: str
    length_mm: int
    count: int
    work_order_numbers: list[str]


class OptimizationPattern(SharedContractModel):
    pattern_id: str
    main_profile_id: str
    main_profile_code: str
    stock_bar_length_mm: int
    stock_bar_role: StockBarRole
    usage_count: int
    pieces: list[PatternPiece]
    kerf_total_mm: int
    safety_trim_mm: int
    productive_length_mm: int
    scrap_mm: int
    reusable_scrap_mm: int
    hurda_mm: int
    efficiency_pct: float


class ProfileBreakdown(SharedContractModel):
    main_profile_id: str
    main_profile_code: str
    main_profile_name: str
    material_color_class: MaterialColorClass
    total_bars: int
    total_productive_length_mm: int
    total_kerf_mm: int
    total_safety_trim_mm: int
    total_scrap_mm: int
    total_reusable_scrap_mm: int
    total_hurda_mm: int
    efficiency_pct: float
    pattern_ids: list[str]
    distinct_pattern_count: int | None = None


class LeftoverPiece(SharedContractModel):
    main_profile_id: str
    main_profile_code: str
    length_mm: int
    count: int


class StockRequirement(SharedContractModel):
    main_profile_id: str
    main_profile_code: str
    stock_bar_length_mm: int
    stock_bar_role: StockBarRole
    required_count: int


class WorkOrderItem(SharedContractModel):
    work_order_number: str | None = None
    main_profile_code: str
    cutting_code: str
    cutting_name: str
    piece_length_mm: int
    fulfilled_count: int
    pattern_ids: list[str]


class ResultMetrics(SharedContractModel):
    efficiency_pct: float
    work_order_count: int
    total_stock_bars: int
    total_cut_pieces: int
    total_kerf_mm: int
    total_safety_trim_mm: int
    total_scrap_mm: int
    total_reusable_scrap_mm: int
    total_hurda_mm: int
    reusable_leftover_piece_count: int
    reusable_leftover_length_mm: int
    productive_length_mm: int
    waste_length_mm: int
    total_stock_length_mm: int
    solver_gap_pct: float | None = None
    material_utilization_pct: float | None = None
    actual_waste_pct: float | None = None
    distinct_pattern_types_total: int | None = None
    recoverable_material_pct: float | None = None


SolverStatusLiteral = Literal[
    "OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"
]


class SolverStats(SharedContractModel):
    status: SolverStatusLiteral
    wall_time_sec: float
    best_objective: float | None = None
    best_bound: float | None = None
    num_conflicts: int | None = None
    num_branches: int | None = None


PrimaryModelPathLiteral = Literal["column_gen", "bar_slot"]


class ProfileGroupSolveTelemetry(SharedContractModel):
    main_profile_code: str
    material_color_class: MaterialColorClass
    primary_model_path: PrimaryModelPathLiteral
    primary_leg_status: SolverStatusLiteral
    primary_leg_bars: int
    primary_leg_scrap_mm: int
    primary_leg_solver_mode: SolverMode
    heuristic_lex_compared: bool
    secondary_leg_bars: int | None = None
    secondary_leg_scrap_mm: int | None = None
    heuristic_selected_lex: bool | None = None
    winning_solver_mode: SolverMode
    baseline_bars: int | None = None
    baseline_hurda_mm: int | None = None
    baseline_scrap_mm: int | None = None
    baseline_distinct_patterns: int | None = None
    consolidated_bars: int | None = None
    consolidated_hurda_mm: int | None = None
    consolidated_scrap_mm: int | None = None
    consolidated_distinct_patterns: int | None = None
    pattern_cap_requested: int | None = None
    pattern_cap_relaxed_to: int | None = None
    stock_length_variety_count: int | None = None
    consolidation_selected: bool | None = None


class OptimizationResultPayload(SharedContractModel):
    request_id: str
    cut_list_snapshot_id: str
    plan_year: int
    week_number: int
    generated_at: str
    solver_mode: SolverMode = "cp_sat"
    metrics: ResultMetrics
    profile_breakdowns: list[ProfileBreakdown]
    patterns: list[OptimizationPattern]
    work_order_items: list[WorkOrderItem]
    leftovers: list[LeftoverPiece]
    stock_requirements: list[StockRequirement]
    solver_stats: SolverStats
    profile_group_solve_telemetry: list[ProfileGroupSolveTelemetry] = Field(
        default_factory=list
    )


class OptimizationCompletedMessageV2(SharedContractModel):
    metadata: MessageMetadata
    job_id: str
    result_id: str
    cut_list_snapshot_id: str
    completed_at: str
    payload: OptimizationResultPayload | None = None


class OptimizationStartedMessageV2(SharedContractModel):
    metadata: MessageMetadata
    job_id: str
    cut_list_snapshot_id: str | None = None
    started_at: str


FailureReasonCode = Literal[
    "preparation_failed",
    "infeasible",
    "solver_timeout",
    "quality_floor_violation",
    "internal_error",
    "superseded_by_newer_request",
    "stale_queue_timeout",
    "worker_claim_rejected",
]


class OptimizationFailedMessageV2(SharedContractModel):
    metadata: MessageMetadata
    job_id: str
    cut_list_snapshot_id: str | None = None
    failed_at: str
    reason: str
    reason_code: FailureReasonCode
