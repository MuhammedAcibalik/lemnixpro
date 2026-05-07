"""One-off calibration helper for problem_28_patterns_real_payload baseline (run manually)."""

from __future__ import annotations

from unittest.mock import patch

from ortools.sat.python import cp_model

from app.schemas.optimization_v2 import (
    DemandItem,
    OptimizationConfig,
    OptimizationRequestPayloadV2,
    ProfileGroup,
    StockBar,
)
from app.services.cutting_stock_solver import CuttingStockSolver


def _payload() -> OptimizationRequestPayloadV2:
    pcs = [
        {"piece_length_mm": 1048, "quantity": 360},
        {"piece_length_mm": 898, "quantity": 288},
        {"piece_length_mm": 720, "quantity": 216},
        {"piece_length_mm": 540, "quantity": 180},
        {"piece_length_mm": 380, "quantity": 144},
    ]
    pid = "MP-R28REAL"
    grp = ProfileGroup(
        main_profile_id=pid,
        main_profile_code="MAIN-28REAL",
        main_profile_name="Regression 28-pattern profile",
        material_color_class="anodized",
        stock_bars=[StockBar(length_mm=6200, role="primary")],
        demand_item_count=len(pcs),
        total_piece_length_mm=sum(p["piece_length_mm"] * p["quantity"] for p in pcs),
    )
    demand = [
        DemandItem(
            production_row_id=f"r{i}",
            row_index=i,
            work_order_number="WO-X",
            main_profile_id=pid,
            main_profile_code=grp.main_profile_code,
            main_profile_name=grp.main_profile_name,
            material_code="M",
            material_name=None,
            material_color="ELS",
            material_color_class="anodized",
            cutting_code=f"C{p['piece_length_mm']}",
            cutting_name=str(p["piece_length_mm"]),
            piece_length_mm=p["piece_length_mm"],
            quantity=p["quantity"],
        )
        for i, p in enumerate(pcs)
    ]
    return OptimizationRequestPayloadV2(
        cut_list_snapshot_id="snap-r28real",
        plan_year=2026,
        week_number=19,
        selected_work_order_numbers="ALL",
        overrides=[],
        config=OptimizationConfig(solver_time_limit_sec=120),
        profile_groups=[grp],
        demand_items=demand,
    )


def main() -> None:
    s = CuttingStockSolver()
    pay = _payload()
    cfg_bad = OptimizationConfig(
        solver_time_limit_sec=120,
        pattern_consolidation_enabled=False,
        allow_post_repack_pattern_increase=True,
        max_distinct_patterns_per_profile=None,
        max_stock_length_variety_per_profile=None,
    )
    pay_bad = pay.model_copy(update={"config": cfg_bad})
    with patch.object(
        s,
        "_consolidate_packs_via_column_pool",
        return_value=(None, {}),
    ), patch.object(s, "_run_column_gen_phase2", return_value=(cp_model.INFEASIBLE, 0.0, None)), patch.object(CuttingStockSolver, "_COLUMN_GEN_VARIABLE_THRESHOLD", 0):
        r_bad = s.solve("cal-bad", pay_bad, "2026-05-04T10:00:00Z")
    pay_good = pay
    with patch.object(CuttingStockSolver, "_COLUMN_GEN_VARIABLE_THRESHOLD", 0):
        r_good = s.solve("cal-good", pay_good, "2026-05-04T10:00:00Z")
    bb = r_bad.profile_breakdowns[0]
    bg = r_good.profile_breakdowns[0]
    print("BAD consolidation off bars", bb.total_bars, "patterns", bb.distinct_pattern_count)
    print("GOOD default bars", bg.total_bars, "patterns", bg.distinct_pattern_count)
    print("GOOD rmp", r_good.metrics.recoverable_material_pct)


if __name__ == "__main__":
    main()
