"""Golden multiset from user benchmark RCA plan — verifies demand fulfilment vs fixture.

Twin diff: Lemnix OptimizationRequestPayloadV2 piece_classes must match
``tests/fixtures/golden_benchmark_multiset.json``.
RCA eksenleri: Σ usage_count (`metrics.total_stock_bars`) vs fiziksel referans,
ve benzersiz şablon sayısı (`metrics.distinct_pattern_types_total`).
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import unittest

from app.domain.color_policy import ColorClass, policy_for
from app.schemas.optimization_v2 import (
    DemandItem,
    OptimizationConfig,
    OptimizationRequestPayloadV2,
    ProfileGroup,
    StockBar,
)
from app.services.cutting_stock_solver import CuttingStockSolver

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "golden_benchmark_multiset.json"
REFERENCE_COUNTS = [
    ((1, 1, 1, 6, 3), 20),
    ((0, 3, 2, 7, 0), 9),
    ((0, 5, 0, 1, 6), 2),
    ((0, 3, 2, 6, 1), 1),
]
REFERENCE_LENGTH_ORDER = (876, 629, 455, 332, 245)


def _build_benchmark_payload(fixture: dict) -> OptimizationRequestPayloadV2:
    pid = "MP-BENCH-ELOKSAL"
    pcs = fixture["piecesMmQty"]
    group = ProfileGroup(
        main_profile_id=pid,
        main_profile_code="AP25-KANALSIZ-ELOKSAL",
        main_profile_name="Benchmark ELOKSAL 6100",
        material_color_class=fixture["materialColorClass"],
        stock_bars=[StockBar(length_mm=fixture["stockBarLengthMm"], role="primary")],
        demand_item_count=len(pcs),
        total_piece_length_mm=sum(r["pieceLengthMm"] * r["quantity"] for r in pcs),
    )
    demand = [
        DemandItem(
            production_row_id=f"bench-{i}",
            row_index=i,
            work_order_number="WO-BENCH",
            main_profile_id=pid,
            main_profile_code=group.main_profile_code,
            main_profile_name=group.main_profile_name,
            material_code="MAT-BENCH",
            material_name="Benchmark",
            material_color="ELS",
            material_color_class=fixture["materialColorClass"],
            cutting_code=f"C-{r['pieceLengthMm']}",
            cutting_name=f"{r['pieceLengthMm']} mm",
            piece_length_mm=r["pieceLengthMm"],
            quantity=r["quantity"],
        )
        for i, r in enumerate(pcs)
    ]
    config = OptimizationConfig(
        kerf_mm=5,
        min_reusable_scrap_mm=300,
        allow_mixing_stock_bars=True,
        solver_time_limit_sec=8,
        random_seed=42,
        min_profile_efficiency_pct=None,
    )
    return OptimizationRequestPayloadV2(
        cut_list_snapshot_id="snap-benchmark-rca",
        plan_year=2026,
        week_number=17,
        selected_work_order_numbers="ALL",
        overrides=[],
        config=config,
        profile_groups=[group],
        demand_items=demand,
    )


def _fixture_with_245(quantity: int) -> dict:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for row in data["piecesMmQty"]:
        if row["pieceLengthMm"] == 245:
            row["quantity"] = quantity
            break
    return data


def _build_real_1000891_payload(
    *, solver_time_limit_sec: int = 8
) -> OptimizationRequestPayloadV2:
    profile_id = "f1316a1b-25b0-483f-82f2-36b665461386"
    profile_code = "1000891P020"
    profile_name = "A.P. 25'LIK KANALSIZ ALT(ELOKSAL)6100MM"
    rows = [
        ("r-629-a", "2361125", "2021174P210", 629, 20),
        ("r-876", "2361125", "2021176P210", 876, 20),
        ("r-455", "2361126", "1000891P020-2021058P210", 455, 40),
        ("r-629-b", "2361126", "1000891P020-2021174P210", 629, 40),
        ("r-332", "2361860", "1000891P020-2021057P210", 332, 200),
        ("r-245", "2361860", "1000891P020-2021062P210", 245, 200),
    ]
    demand = [
        DemandItem(
            production_row_id=row_id,
            row_index=index,
            work_order_number=work_order,
            main_profile_id=profile_id,
            main_profile_code=profile_code,
            main_profile_name=profile_name,
            material_code="UCW255N4A",
            material_name="A.P. 25'LIK KANALSIZ ALT ELS",
            material_color="ELS",
            material_color_class="anodized",
            cutting_code=cutting_code,
            cutting_name=f"{cutting_length_mm} mm",
            piece_length_mm=cutting_length_mm,
            quantity=quantity,
        )
        for index, (row_id, work_order, cutting_code, cutting_length_mm, quantity)
        in enumerate(rows)
    ]
    group = ProfileGroup(
        main_profile_id=profile_id,
        main_profile_code=profile_code,
        main_profile_name=profile_name,
        material_color_class="anodized",
        stock_bars=[StockBar(length_mm=6100, role="primary")],
        demand_item_count=len(demand),
        total_piece_length_mm=sum(
            item.piece_length_mm * item.quantity for item in demand
        ),
    )
    config = OptimizationConfig(
        kerf_mm=4,
        min_reusable_scrap_mm=200,
        allow_mixing_stock_bars=True,
        solver_time_limit_sec=solver_time_limit_sec,
        random_seed=1,
        min_profile_efficiency_pct=None,
        pattern_consolidation_enabled=True,
        max_distinct_patterns_per_profile=5,
        max_stock_length_variety_per_profile=1,
        prefer_reusable_scrap=True,
        allow_post_repack_pattern_increase=False,
    )
    return OptimizationRequestPayloadV2(
        cut_list_snapshot_id="snap-real-1000891",
        plan_year=2026,
        week_number=15,
        selected_work_order_numbers="ALL",
        overrides=[],
        config=config,
        profile_groups=[group],
        demand_items=demand,
    )


def _reference_demand() -> Counter[int]:
    demand: Counter[int] = Counter()
    for counts, usage in REFERENCE_COUNTS:
        for length, count in zip(REFERENCE_LENGTH_ORDER, counts):
            demand[length] += count * usage
    return demand


def _assert_exact_demand_fulfillment(
    case: unittest.TestCase,
    result,
    rows: list[dict],
) -> None:
    fulfilled: dict[int, int] = {}
    for pat in result.patterns:
        for pc in pat.pieces:
            fulfilled[pc.length_mm] = (
                fulfilled.get(pc.length_mm, 0) + pc.count * pat.usage_count
            )
    for row in rows:
        case.assertEqual(fulfilled.get(row["pieceLengthMm"], 0), row["quantity"])


def _assert_pattern_capacity(case: unittest.TestCase, result) -> None:
    for pattern in result.patterns:
        case.assertEqual(
            pattern.productive_length_mm
            + pattern.kerf_total_mm
            + pattern.safety_trim_mm
            + pattern.scrap_mm,
            pattern.stock_bar_length_mm,
            pattern.pattern_id,
        )


def _assert_max_piece_count_per_pattern(
    case: unittest.TestCase,
    result,
    max_pieces: int,
) -> None:
    for pattern in result.patterns:
        piece_count = sum(piece.count for piece in pattern.pieces)
        case.assertLessEqual(piece_count, max_pieces, pattern.pattern_id)


class GoldenBenchmarkRcaTests(unittest.TestCase):
    def test_reference_templates_document_the_245_73_case(self) -> None:
        data = _fixture_with_245(73)
        reference = _reference_demand()
        for row in data["piecesMmQty"]:
            self.assertEqual(reference[row["pieceLengthMm"]], row["quantity"])

    def test_reference_templates_are_feasible_for_6100_anodized_stock(self) -> None:
        data = _fixture_with_245(73)
        payload = _build_benchmark_payload(data)
        solver = CuttingStockSolver()
        group, items = solver._group_demand(payload)[0]
        color_class = ColorClass(group.material_color_class)
        policy = policy_for(solver._policy_lookup_token(color_class))
        usable = group.stock_bars[0].length_mm - policy.total_trim_mm
        piece_lengths = [row["pieceLengthMm"] for row in data["piecesMmQty"]]

        for counts, _usage in REFERENCE_COUNTS:
            productive = sum(length * count for length, count in zip(piece_lengths, counts))
            piece_count = sum(counts)
            kerf_total = max(0, piece_count - 1) * payload.config.kerf_mm
            self.assertLessEqual(productive + kerf_total, usable)

    def test_solver_respects_physical_12_piece_bar_limit_for_245_variants(self) -> None:
        expected_bars_by_245_quantity = {
            73: 32,
            75: 33,
        }
        for quantity_245, expected_bars in expected_bars_by_245_quantity.items():
            with self.subTest(quantity_245=quantity_245):
                data = _fixture_with_245(quantity_245)
                payload = _build_benchmark_payload(data)
                payload.config.max_pieces_per_stock_bar = 12
                solver = CuttingStockSolver()
                first = solver.solve(
                    request_id=f"req-benchmark-rca-{quantity_245}-a",
                    payload=payload,
                    generated_at="2026-04-30T12:00:00Z",
                )
                second = solver.solve(
                    request_id=f"req-benchmark-rca-{quantity_245}-b",
                    payload=payload,
                    generated_at="2026-04-30T12:00:00Z",
                )

                _assert_exact_demand_fulfillment(self, first, data["piecesMmQty"])
                _assert_pattern_capacity(self, first)
                _assert_max_piece_count_per_pattern(self, first, 12)
                self.assertEqual(first.metrics.total_stock_bars, expected_bars)
                self.assertEqual(second.metrics.total_stock_bars, expected_bars)

    def test_real_1000891_profile_reaches_32_bar_target_without_piece_cap(self) -> None:
        payload = _build_real_1000891_payload(solver_time_limit_sec=8)
        result = CuttingStockSolver().solve(
            request_id="req-real-1000891",
            payload=payload,
            generated_at="2026-05-06T06:28:00Z",
        )

        _assert_exact_demand_fulfillment(
            self,
            result,
            [
                {"pieceLengthMm": 876, "quantity": 20},
                {"pieceLengthMm": 629, "quantity": 60},
                {"pieceLengthMm": 455, "quantity": 40},
                {"pieceLengthMm": 332, "quantity": 200},
                {"pieceLengthMm": 245, "quantity": 200},
            ],
        )
        _assert_pattern_capacity(self, result)
        self.assertEqual(result.metrics.total_stock_bars, 32)

    def test_pattern_pool_includes_reference_templates(self) -> None:
        data = _fixture_with_245(75)
        payload = _build_benchmark_payload(data)
        solver = CuttingStockSolver()
        group, items = solver._group_demand(payload)[0]
        color_class = ColorClass(group.material_color_class)
        policy = policy_for(solver._policy_lookup_token(color_class))
        usable_lengths = [
            (bar.length_mm, bar.length_mm - policy.total_trim_mm, bar.role)
            for bar in solver._effective_stock_bars(group, payload.config)
        ]
        piece_classes = solver._collapse_piece_classes(items)
        self.assertEqual([cls.length_mm for cls in piece_classes], list(REFERENCE_LENGTH_ORDER))

        patterns = solver._generate_feasible_patterns(
            piece_classes,
            usable_lengths,
            payload.config.kerf_mm,
            payload.config,
        )
        pattern_counts = {tuple(pattern["counts"]) for pattern in patterns}

        for counts, _usage in REFERENCE_COUNTS:
            self.assertIn(counts, pattern_counts)

    def test_deterministic_mixed_seed_includes_reference_templates_without_random_or_dfs(self) -> None:
        data = _fixture_with_245(75)
        payload = _build_benchmark_payload(data)
        solver = CuttingStockSolver()
        group, items = solver._group_demand(payload)[0]
        color_class = ColorClass(group.material_color_class)
        policy = policy_for(solver._policy_lookup_token(color_class))
        usable_lengths = [
            (bar.length_mm, bar.length_mm - policy.total_trim_mm, bar.role)
            for bar in solver._effective_stock_bars(group, payload.config)
        ]
        piece_classes = solver._collapse_piece_classes(items)
        patterns: list[dict] = []
        seen: set[str] = set()

        solver._seed_deterministic_mixed_patterns(
            patterns=patterns,
            seen=seen,
            piece_classes=piece_classes,
            usable_lengths_by_choice=usable_lengths,
            kerf=payload.config.kerf_mm,
            max_pieces_per_bar=solver._max_pieces_per_stock_bar(payload.config),
        )
        pattern_counts = {tuple(pattern["counts"]) for pattern in patterns}

        for counts, _usage in REFERENCE_COUNTS:
            self.assertIn(counts, pattern_counts)

    def test_fixture_demands_totals_documented_reference(self) -> None:
        data = _fixture_with_245(73)
        rows = data["piecesMmQty"]
        self.assertEqual(
            sum(r["pieceLengthMm"] * r["quantity"] for r in rows),
            876 * 20 + 629 * 60 + 455 * 40 + 332 * 191 + 245 * 73,
        )
        ref_phys = data["referencePhysicalCutsSigmaUsage"]
        ref_tmpl = data["referenceDistinctTemplates"]
        self.assertEqual(ref_phys, 32)
        self.assertEqual(ref_tmpl, 4)

        payload = _build_benchmark_payload(data)
        payload.config.max_pieces_per_stock_bar = 12
        payload.config.max_distinct_patterns_per_profile = 4
        payload.config.solver_time_limit_sec = 30
        solver = CuttingStockSolver()
        result = solver.solve(
            request_id="req-benchmark-rca",
            payload=payload,
            generated_at="2026-04-30T12:00:00Z",
        )

        _assert_exact_demand_fulfillment(self, result, rows)
        _assert_pattern_capacity(self, result)
        _assert_max_piece_count_per_pattern(self, result, 12)
        self.assertEqual(result.metrics.total_stock_bars, ref_phys)
        self.assertLessEqual(result.metrics.distinct_pattern_types_total, ref_tmpl)

        # RCA metrics surfaced on payload
        self.assertIsInstance(result.metrics.total_stock_bars, int)
        self.assertIsInstance(result.metrics.distinct_pattern_types_total, int)
        self.assertGreater(result.metrics.distinct_pattern_types_total, 0)
        bd = result.profile_breakdowns[0]
        self.assertEqual(
            bd.distinct_pattern_count if bd.distinct_pattern_count is not None else len(bd.pattern_ids),
            len(bd.pattern_ids),
        )

        self.assertTrue(result.profile_group_solve_telemetry)
        tel = result.profile_group_solve_telemetry[0]
        self.assertIn(tel.primary_model_path, ("column_gen", "bar_slot"))
        self.assertIsInstance(tel.heuristic_lex_compared, bool)


if __name__ == "__main__":
    unittest.main()
