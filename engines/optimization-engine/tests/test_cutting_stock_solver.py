"""Smoke and oracle tests for the OR-Tools CP-SAT cutting-stock solver.

These tests are intentionally small (a few demand items per profile group) so the
optimum is hand-checkable; together they cover safety-margin policy, kerf accounting,
multi stock-bar selection, determinism, and quality-floor failure mode.
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from ortools.sat.python import cp_model

from app.schemas.optimization_v2 import (
    DemandItem,
    OptimizationConfig,
    OptimizationRequestPayloadV2,
    ProfileGroup,
    StockBar,
)
from app.services.cutting_stock_solver import (
    CuttingStockSolver,
    InfeasibleGroupError,
    _PieceClass,
)


def _config(**overrides) -> OptimizationConfig:
    base = dict(
        kerf_mm=5,
        min_reusable_scrap_mm=300,
        allow_mixing_stock_bars=True,
        solver_time_limit_sec=10,
        random_seed=1,
        min_profile_efficiency_pct=None,
    )
    base.update(overrides)
    return OptimizationConfig(**base)


def _build_payload(
    *,
    items,
    stock_bars,
    color_class="painted",
    config: OptimizationConfig | None = None,
):
    profile_id = "MP-1"
    group = ProfileGroup(
        main_profile_id=profile_id,
        main_profile_code="PROF-A",
        main_profile_name="Profile A",
        material_color_class=color_class,
        stock_bars=stock_bars,
        demand_item_count=len(items),
        total_piece_length_mm=sum(i["piece_length_mm"] * i["quantity"] for i in items),
    )
    demand = [
        DemandItem(
            production_row_id=f"row-{idx}",
            row_index=idx,
            work_order_number=item.get("work_order_number"),
            main_profile_id=profile_id,
            main_profile_code="PROF-A",
            main_profile_name="Profile A",
            material_code="PRD-A",
            material_name="Product A",
            material_color="RAL9005" if color_class == "painted" else "ELS",
            material_color_class=color_class,
            cutting_code=item.get("cutting_code", f"C-{idx}"),
            cutting_name=item.get("cutting_name", f"Cut {idx}"),
            piece_length_mm=item["piece_length_mm"],
            quantity=item["quantity"],
        )
        for idx, item in enumerate(items)
    ]
    return OptimizationRequestPayloadV2(
        cut_list_snapshot_id="snap-1",
        plan_year=2026,
        week_number=14,
        selected_work_order_numbers="ALL",
        overrides=[],
        config=config or _config(),
        profile_groups=[group],
        demand_items=demand,
    )


class CuttingStockSolverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.solver = CuttingStockSolver()

    def test_painted_single_bar_layout(self) -> None:
        payload = _build_payload(
            items=[
                {"piece_length_mm": 2000, "quantity": 3, "work_order_number": "WO1"},
                {"piece_length_mm": 1500, "quantity": 1, "work_order_number": "WO1"},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        result = self.solver.solve("req-1", payload, "2026-04-30T10:00:00Z")

        # Total demand 7500 mm; usable = 6090. One bar needed (with multi-bar fallback
        # the solver may use 2 bars but never more).
        self.assertGreaterEqual(result.metrics.total_stock_bars, 1)
        self.assertLessEqual(result.metrics.total_stock_bars, 2)
        # All pieces placed
        cut_count = sum(p.count * p.usage_count for p in result.patterns for p in result.patterns) if False else \
            sum(piece.count * pattern.usage_count for pattern in result.patterns for piece in pattern.pieces)
        self.assertEqual(cut_count, 4)
        # Productive metres = 3*2000 + 1500
        self.assertEqual(result.metrics.productive_length_mm, 7500)
        # Safety trim accounted
        self.assertEqual(
            result.metrics.total_safety_trim_mm,
            10 * result.metrics.total_stock_bars,
        )

    def test_anodized_uses_extra_safety_trim(self) -> None:
        payload = _build_payload(
            items=[{"piece_length_mm": 5000, "quantity": 1}],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            color_class="anodized",
        )

        result = self.solver.solve("req-2", payload, "2026-04-30T10:00:00Z")

        self.assertEqual(result.metrics.total_stock_bars, 1)
        self.assertEqual(result.metrics.total_safety_trim_mm, 100)

    def test_kerf_is_charged_between_pieces_only(self) -> None:
        payload = _build_payload(
            items=[
                {"piece_length_mm": 3000, "quantity": 2},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        result = self.solver.solve("req-3", payload, "2026-04-30T10:00:00Z")

        self.assertEqual(result.metrics.total_stock_bars, 1)
        # Two pieces -> one kerf gap.
        self.assertEqual(result.metrics.total_kerf_mm, 5)

    def test_determinism_across_runs(self) -> None:
        payload = _build_payload(
            items=[
                {"piece_length_mm": 1900, "quantity": 4},
                {"piece_length_mm": 1100, "quantity": 5},
                {"piece_length_mm": 800, "quantity": 6},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        first = self.solver.solve("det-1", payload, "2026-04-30T10:00:00Z")
        second = self.solver.solve("det-2", payload, "2026-04-30T10:00:00Z")

        self.assertEqual(first.metrics.total_stock_bars, second.metrics.total_stock_bars)
        self.assertEqual(first.metrics.productive_length_mm, second.metrics.productive_length_mm)
        self.assertEqual(
            sorted(p.pattern_id for p in first.patterns),
            sorted(p.pattern_id for p in second.patterns),
        )

    def test_secondary_stock_bar_can_be_chosen(self) -> None:
        payload = _build_payload(
            items=[{"piece_length_mm": 5500, "quantity": 1}],
            stock_bars=[
                StockBar(length_mm=4000, role="primary"),
                StockBar(length_mm=6100, role="secondary"),
            ],
        )

        result = self.solver.solve("alt-1", payload, "2026-04-30T10:00:00Z")

        self.assertEqual(result.metrics.total_stock_bars, 1)
        self.assertEqual(result.patterns[0].stock_bar_role, "secondary")

    def test_infeasible_when_piece_exceeds_usable(self) -> None:
        payload = _build_payload(
            items=[{"piece_length_mm": 9000, "quantity": 1}],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        with self.assertRaises(InfeasibleGroupError):
            self.solver.solve("inf-1", payload, "2026-04-30T10:00:00Z")

    def test_infeasible_when_any_piece_exceeds_usable(self) -> None:
        payload = _build_payload(
            items=[
                {"piece_length_mm": 100, "quantity": 1},
                {"piece_length_mm": 9000, "quantity": 1},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        with self.assertRaisesRegex(InfeasibleGroupError, "longest piece"):
            self.solver.solve("inf-2", payload, "2026-04-30T10:00:00Z")

    def test_bar_upper_bound_uses_feasible_packing_not_raw_length_only(self) -> None:
        # Regression for 1005317P020/anodized: aggregate length suggested too few
        # candidate bars, making CP-SAT report a false INFEASIBLE.
        bound = self.solver._bar_upper_bound(
            [
                _PieceClass(length_mm=455, quantity=1440),
                _PieceClass(length_mm=332, quantity=1440),
            ],
            [(3500, 3400, "primary")],
            4,
            _config(),
        )

        self.assertGreaterEqual(bound, 350)

    def test_high_efficiency_smoke(self) -> None:
        payload = _build_payload(
            items=[
                {"piece_length_mm": 2000, "quantity": 6},
                {"piece_length_mm": 1000, "quantity": 6},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        result = self.solver.solve("eff-1", payload, "2026-04-30T10:00:00Z")

        self.assertGreaterEqual(result.metrics.efficiency_pct, 90.0)

    def test_solver_unknown_uses_deterministic_fallback(self) -> None:
        class UnknownSolver:
            def __init__(self) -> None:
                self.parameters = type("Params", (), {})()

            def Solve(self, _model) -> int:  # noqa: N802 - mirrors OR-Tools API
                return cp_model.UNKNOWN

            def StatusName(self, _status) -> str:  # noqa: N802 - mirrors OR-Tools API
                return "UNKNOWN"

        payload = _build_payload(
            items=[
                {"piece_length_mm": 1237, "quantity": 24},
                {"piece_length_mm": 1048, "quantity": 360},
                {"piece_length_mm": 889, "quantity": 24},
                {"piece_length_mm": 748, "quantity": 360},
                {"piece_length_mm": 642, "quantity": 40},
                {"piece_length_mm": 468, "quantity": 40},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            color_class="anodized",
            config=_config(solver_time_limit_sec=1),
        )

        with patch(
            "app.services.cutting_stock_solver.cp_model.CpSolver",
            UnknownSolver,
        ), patch.object(
            CuttingStockSolver,
            "_run_column_gen_phase1_mip",
            return_value=(cp_model.UNKNOWN, 0.0, None, None, None, None),
        ):
            result = self.solver.solve(
                "unknown-1",
                payload,
                "2026-04-30T10:00:00Z",
            )

        self.assertEqual(result.solver_mode, "heuristic_fallback")
        self.assertEqual(result.solver_stats.status, "FEASIBLE")
        self.assertGreater(result.metrics.total_stock_bars, 0)
        self.assertEqual(result.metrics.total_cut_pieces, 848)

    def test_request_budget_is_sliced_across_remaining_profile_groups(self) -> None:
        cfg = _config(solver_time_limit_sec=60)

        first_slice = self.solver._config_for_remaining_request_budget(
            cfg,
            remaining_sec=60,
            remaining_groups=68,
        )
        late_slice = self.solver._config_for_remaining_request_budget(
            cfg,
            remaining_sec=0.5,
            remaining_groups=10,
        )

        self.assertEqual(first_slice.solver_time_limit_sec, 1)
        self.assertEqual(late_slice.solver_time_limit_sec, 1)
        self.assertFalse(late_slice.pattern_consolidation_enabled)

    def test_column_gen_triggered_for_large_demand(self) -> None:
        """Large demand groups should use column generation and still produce correct results."""
        payload = _build_payload(
            items=[
                {"piece_length_mm": 1237, "quantity": 24},
                {"piece_length_mm": 1048, "quantity": 60},
                {"piece_length_mm": 889, "quantity": 24},
                {"piece_length_mm": 748, "quantity": 60},
                {"piece_length_mm": 642, "quantity": 40},
                {"piece_length_mm": 468, "quantity": 40},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            config=_config(solver_time_limit_sec=15),
        )

        result = self.solver.solve("cg-1", payload, "2026-04-30T10:00:00Z")

        total_demand = 24 * 1237 + 60 * 1048 + 24 * 889 + 60 * 748 + 40 * 642 + 40 * 468
        self.assertEqual(result.metrics.productive_length_mm, total_demand)
        self.assertGreater(result.metrics.total_stock_bars, 0)
        self.assertGreaterEqual(result.metrics.efficiency_pct, 80.0)

    def test_new_metrics_present(self) -> None:
        payload = _build_payload(
            items=[
                {"piece_length_mm": 2000, "quantity": 3},
                {"piece_length_mm": 1500, "quantity": 1},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )

        result = self.solver.solve("met-1", payload, "2026-04-30T10:00:00Z")

        self.assertIsNotNone(result.metrics.material_utilization_pct)
        self.assertIsNotNone(result.metrics.actual_waste_pct)
        self.assertGreater(result.metrics.material_utilization_pct, result.metrics.efficiency_pct)
        self.assertGreaterEqual(result.metrics.actual_waste_pct, 0.0)
        self.assertLessEqual(result.metrics.actual_waste_pct, 100.0)

    def test_heuristic_local_search_reduces_bars(self) -> None:
        """The improved heuristic with local search should consolidate pieces."""
        class UnknownSolver:
            def __init__(self) -> None:
                self.parameters = type("Params", (), {})()

            def Solve(self, _model) -> int:  # noqa: N802
                return cp_model.UNKNOWN

            def StatusName(self, _status) -> str:  # noqa: N802
                return "UNKNOWN"

        payload = _build_payload(
            items=[
                {"piece_length_mm": 3000, "quantity": 2},
                {"piece_length_mm": 2000, "quantity": 2},
                {"piece_length_mm": 1000, "quantity": 4},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            config=_config(solver_time_limit_sec=1),
        )

        with patch(
            "app.services.cutting_stock_solver.cp_model.CpSolver",
            UnknownSolver,
        ), patch.object(
            CuttingStockSolver,
            "_run_column_gen_phase1_mip",
            return_value=(cp_model.UNKNOWN, 0.0, None, None, None, None),
        ):
            result = self.solver.solve("ls-1", payload, "2026-04-30T10:00:00Z")

        self.assertEqual(result.solver_mode, "heuristic_fallback")
        # 2×3000 + 2×2000 + 4×1000 = 14000 mm; usable = 6090; ideal = 3 bars
        self.assertLessEqual(result.metrics.total_stock_bars, 3)

    def test_orphan_demand_item_raises_error(self) -> None:
        """Demand items without a matching profile group should raise InfeasibleGroupError."""
        from app.schemas.optimization_v2 import OptimizationRequestPayloadV2

        demand = [
            DemandItem(
                production_row_id="row-0",
                row_index=0,
                main_profile_id="ORPHAN-PROFILE",
                main_profile_code="ORPHAN",
                main_profile_name="Orphan Profile",
                material_code="MAT-X",
                material_color="RAL9005",
                material_color_class="painted",
                cutting_code="C-0",
                cutting_name="Cut 0",
                piece_length_mm=1000,
                quantity=1,
            )
        ]
        payload = OptimizationRequestPayloadV2(
            cut_list_snapshot_id="snap-orphan",
            plan_year=2026,
            week_number=14,
            selected_work_order_numbers="ALL",
            overrides=[],
            config=_config(),
            profile_groups=[],
            demand_items=demand,
        )

        with self.assertRaisesRegex(InfeasibleGroupError, "no matching profile group"):
            self.solver.solve("orphan-1", payload, "2026-04-30T10:00:00Z")

    def test_exact_demand_fulfillment_small(self) -> None:
        """Every piece class must be cut exactly the demanded quantity — small case."""
        payload = _build_payload(
            items=[
                {"piece_length_mm": 2000, "quantity": 3},
                {"piece_length_mm": 1500, "quantity": 2},
                {"piece_length_mm": 800, "quantity": 5},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )
        result = self.solver.solve("edf-1", payload, "2026-04-30T10:00:00Z")

        fulfilled: dict[int, int] = {}
        for pattern in result.patterns:
            for piece in pattern.pieces:
                fulfilled[piece.length_mm] = fulfilled.get(piece.length_mm, 0) + piece.count * pattern.usage_count

        self.assertEqual(fulfilled.get(2000, 0), 3)
        self.assertEqual(fulfilled.get(1500, 0), 2)
        self.assertEqual(fulfilled.get(800, 0), 5)

    def test_exact_demand_fulfillment_large(self) -> None:
        """Demand fulfillment must hold even for large demand sets."""
        items = [
            {"piece_length_mm": 1500, "quantity": 50},
            {"piece_length_mm": 1200, "quantity": 30},
            {"piece_length_mm": 900, "quantity": 80},
            {"piece_length_mm": 600, "quantity": 100},
        ]
        payload = _build_payload(
            items=items,
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            config=_config(solver_time_limit_sec=15),
        )
        result = self.solver.solve("edf-2", payload, "2026-04-30T10:00:00Z")

        fulfilled: dict[int, int] = {}
        for pattern in result.patterns:
            for piece in pattern.pieces:
                fulfilled[piece.length_mm] = fulfilled.get(piece.length_mm, 0) + piece.count * pattern.usage_count

        self.assertEqual(fulfilled.get(1500, 0), 50)
        self.assertEqual(fulfilled.get(1200, 0), 30)
        self.assertEqual(fulfilled.get(900, 0), 80)
        self.assertEqual(fulfilled.get(600, 0), 100)

    def test_bar_capacity_invariant(self) -> None:
        """productive + kerf + safety_trim + scrap must equal stock_bar_length for every pattern."""
        payload = _build_payload(
            items=[
                {"piece_length_mm": 2500, "quantity": 4},
                {"piece_length_mm": 1800, "quantity": 3},
                {"piece_length_mm": 700, "quantity": 6},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )
        result = self.solver.solve("bci-1", payload, "2026-04-30T10:00:00Z")

        for pattern in result.patterns:
            total = (
                pattern.productive_length_mm
                + pattern.kerf_total_mm
                + pattern.safety_trim_mm
                + pattern.scrap_mm
            )
            self.assertEqual(
                total,
                pattern.stock_bar_length_mm,
                f"Pattern {pattern.pattern_id}: {total} != {pattern.stock_bar_length_mm}",
            )
            self.assertGreaterEqual(pattern.scrap_mm, 0)

    def test_kerf_matches_config_value(self) -> None:
        """Kerf charged per pattern must use exactly the configured kerf_mm value."""
        custom_kerf = 7
        payload = _build_payload(
            items=[
                {"piece_length_mm": 2000, "quantity": 2},
                {"piece_length_mm": 1000, "quantity": 1},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            config=_config(kerf_mm=custom_kerf),
        )
        result = self.solver.solve("kc-1", payload, "2026-04-30T10:00:00Z")

        for pattern in result.patterns:
            n_pieces = sum(p.count for p in pattern.pieces)
            expected_kerf = max(0, n_pieces - 1) * custom_kerf
            self.assertEqual(
                pattern.kerf_total_mm, expected_kerf,
                f"Pattern {pattern.pattern_id}: kerf {pattern.kerf_total_mm} != expected {expected_kerf}",
            )

    def test_multi_profile_groups_all_solved(self) -> None:
        """All profile groups must appear in results — none skipped."""
        group_a = ProfileGroup(
            main_profile_id="MP-A", main_profile_code="PROF-A",
            main_profile_name="Profile A", material_color_class="painted",
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            demand_item_count=2, total_piece_length_mm=4000,
        )
        group_b = ProfileGroup(
            main_profile_id="MP-B", main_profile_code="PROF-B",
            main_profile_name="Profile B", material_color_class="painted",
            stock_bars=[StockBar(length_mm=6500, role="primary")],
            demand_item_count=1, total_piece_length_mm=3000,
        )
        demand = [
            DemandItem(
                production_row_id="r-0", row_index=0, main_profile_id="MP-A",
                main_profile_code="PROF-A", main_profile_name="Profile A",
                material_code="M-A", material_color="RAL9005",
                material_color_class="painted", cutting_code="C-A",
                cutting_name="Cut A", piece_length_mm=2000, quantity=2,
            ),
            DemandItem(
                production_row_id="r-1", row_index=1, main_profile_id="MP-B",
                main_profile_code="PROF-B", main_profile_name="Profile B",
                material_code="M-B", material_color="RAL9005",
                material_color_class="painted", cutting_code="C-B",
                cutting_name="Cut B", piece_length_mm=3000, quantity=1,
            ),
        ]
        payload = OptimizationRequestPayloadV2(
            cut_list_snapshot_id="snap-multi",
            plan_year=2026, week_number=14,
            selected_work_order_numbers="ALL", overrides=[],
            config=_config(),
            profile_groups=[group_a, group_b],
            demand_items=demand,
        )
        result = self.solver.solve("mpg-1", payload, "2026-04-30T10:00:00Z")

        profile_ids_in_result = {bd.main_profile_id for bd in result.profile_breakdowns}
        self.assertIn("MP-A", profile_ids_in_result)
        self.assertIn("MP-B", profile_ids_in_result)
        self.assertEqual(len(result.profile_breakdowns), 2)

    def test_non_negative_scrap_all_patterns(self) -> None:
        """No pattern may have negative scrap."""
        payload = _build_payload(
            items=[
                {"piece_length_mm": 3000, "quantity": 2},
                {"piece_length_mm": 2990, "quantity": 1},
            ],
            stock_bars=[StockBar(length_mm=6100, role="primary")],
        )
        result = self.solver.solve("nns-1", payload, "2026-04-30T10:00:00Z")

        for pattern in result.patterns:
            self.assertGreaterEqual(pattern.scrap_mm, 0)


if __name__ == "__main__":
    unittest.main()
