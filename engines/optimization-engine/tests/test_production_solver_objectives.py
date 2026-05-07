"""Production-oriented assertions: objectives, consolidation, telemetry, regressions."""

from __future__ import annotations

import json
import logging
import unittest
from pathlib import Path
from unittest.mock import patch

from ortools.sat.python import cp_model

from app.schemas.optimization_v2 import (
    DemandItem,
    OptimizationConfig,
    OptimizationRequestPayloadV2,
    ProfileGroup,
    StockBar,
    StockRequirement,
)
from app.services.cutting_stock_solver import CuttingStockSolver, _PieceClass

FIX_PROBLEM28 = Path(__file__).resolve().parent / "fixtures" / "problem_28_patterns_payload.json"
FIX_PROBLEM28_REAL = (
    Path(__file__).resolve().parent / "fixtures" / "problem_28_patterns_real_payload.json"
)


def _user_style_stock_aggregate(
    reqs: list[StockRequirement], *, profile_code: str
) -> dict[int, int]:
    """Nominal stock length (mm) → required bar count (legacy `876×N` style map)."""
    out: dict[int, int] = {}
    for row in reqs:
        if row.main_profile_code != profile_code:
            continue
        key = int(row.stock_bar_length_mm)
        out[key] = out.get(key, 0) + int(row.required_count)
    return dict(sorted(out.items()))


def _payload_from_problem_fixture(fixture: dict) -> OptimizationRequestPayloadV2:
    sl = fixture["stockBarLengthMm"]
    pcs = fixture["piecesMmQty"]
    pid = fixture.get("mainProfileId", "MP-R28")
    code = fixture.get("mainProfileCode", "MAIN-R28")
    name = fixture.get("mainProfileName", "Regression profile")
    group = ProfileGroup(
        main_profile_id=pid,
        main_profile_code=code,
        main_profile_name=name,
        material_color_class=fixture["materialColorClass"],
        stock_bars=[StockBar(length_mm=sl, role="primary")],
        demand_item_count=len(pcs),
        total_piece_length_mm=sum(r["pieceLengthMm"] * r["quantity"] for r in pcs),
    )
    demand = [
        DemandItem(
            production_row_id=f"p28-{i}",
            row_index=i,
            work_order_number="WO-R28",
            main_profile_id=group.main_profile_id,
            main_profile_code=group.main_profile_code,
            main_profile_name=group.main_profile_name,
            material_code="MAT",
            material_name="Alu",
            material_color="ELS",
            material_color_class=fixture["materialColorClass"],
            cutting_code=r.get("cuttingCode", f"CC{r['pieceLengthMm']}"),
            cutting_name=r.get("cuttingName", str(r["pieceLengthMm"])),
            piece_length_mm=r["pieceLengthMm"],
            quantity=r["quantity"],
        )
        for i, r in enumerate(pcs)
    ]
    return OptimizationRequestPayloadV2(
        cut_list_snapshot_id=fixture["cutListSnapshotId"],
        plan_year=fixture["planYear"],
        week_number=fixture["weekNumber"],
        selected_work_order_numbers="ALL",
        overrides=[],
        config=OptimizationConfig(),
        profile_groups=[group],
        demand_items=demand,
    )


def _payload_from_wire_dict(data: dict) -> OptimizationRequestPayloadV2:
    trimmed = dict(data)
    trimmed.pop("_meta", None)
    trimmed.pop("_comment", None)
    return OptimizationRequestPayloadV2.model_validate(trimmed)


class ProductionSolverObjectiveTests(unittest.TestCase):
    def test_default_optimization_config_matches_company_process(self) -> None:
        c = OptimizationConfig()
        self.assertEqual(c.kerf_mm, 4)
        self.assertEqual(c.min_reusable_scrap_mm, 200)
        self.assertTrue(c.pattern_consolidation_enabled)
        self.assertIsNone(c.max_pieces_per_stock_bar)
        self.assertEqual(c.max_distinct_patterns_per_profile, 5)
        self.assertEqual(c.max_stock_length_variety_per_profile, 1)
        self.assertEqual(c.pattern_quality_tolerance_mm, 0)
        self.assertTrue(c.prefer_reusable_scrap)
        self.assertFalse(c.allow_post_repack_pattern_increase)

    def test_reusable_scrap_is_not_hurda(self) -> None:
        s = CuttingStockSolver()
        cfg = OptimizationConfig(min_reusable_scrap_mm=200)
        self.assertEqual(s._split_scrap(673, cfg), (673, 0))
        self.assertEqual(s._pattern_hurda(673, cfg), 0)

        self.assertEqual(s._split_scrap(150, cfg), (0, 150))
        self.assertEqual(s._pattern_hurda(150, cfg), 150)

    def test_solver_fills_piece_sized_leftover_for_two_length_profile(self) -> None:
        code = "2022939P746"
        group = ProfileGroup(
            main_profile_id="mp-piece-sized-leftover",
            main_profile_code=code,
            main_profile_name="A.P.12X10 MM DEMIR CERC. 6100MM RAL3002",
            material_color_class="painted",
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            demand_item_count=2,
            total_piece_length_mm=(446 * 200) + (326 * 200),
        )
        demand = [
            DemandItem(
                production_row_id=f"row-{idx}",
                row_index=idx,
                work_order_number="2361432",
                main_profile_id=group.main_profile_id,
                main_profile_code=group.main_profile_code,
                main_profile_name=group.main_profile_name,
                material_code=group.main_profile_code,
                material_name=group.main_profile_name,
                material_color="RAL3002",
                material_color_class="painted",
                cutting_code=str(length),
                cutting_name=str(length),
                piece_length_mm=length,
                quantity=quantity,
            )
            for idx, (length, quantity) in enumerate(((446, 200), (326, 200)))
        ]
        payload = OptimizationRequestPayloadV2(
            cut_list_snapshot_id="snapshot-piece-sized-leftover",
            plan_year=2026,
            week_number=16,
            selected_work_order_numbers="ALL",
            overrides=[],
            config=OptimizationConfig(solver_time_limit_sec=20),
            profile_groups=[group],
            demand_items=demand,
        )

        result = CuttingStockSolver().solve(
            "request-piece-sized-leftover",
            payload,
            "2026-05-06T00:00:00Z",
        )
        breakdown = result.profile_breakdowns[0]

        self.assertEqual(breakdown.total_bars, 26)
        self.assertEqual(breakdown.total_scrap_mm, 2444)
        self.assertTrue(
            all(pattern.scrap_mm < 326 for pattern in result.patterns),
            msg="Solver must not leave a scrap segment that can fit the smallest required piece.",
        )

    def test_column_gen_phase2_never_increases_phase1_bar_count(self) -> None:
        solver = CuttingStockSolver()
        cfg = OptimizationConfig(
            min_reusable_scrap_mm=200,
            solver_time_limit_sec=5,
            random_seed=42,
        )
        piece_classes = [
            _PieceClass(length_mm=1000, quantity=4),
            _PieceClass(length_mm=1000, quantity=4),
        ]
        patterns = [
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [3, 1],
                "scrap": 2050,
            },
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [1, 3],
                "scrap": 2050,
            },
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [1, 1],
                "scrap": 4086,
            },
        ]

        status, _wall, usage = solver._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=piece_classes,
            bar_upper_bound=4,
            usable_lengths_by_choice=[(6100, 6090, "primary")],
            config=cfg,
            time_sec=5,
            best_bars=2,
            best_hurda=0,
            pattern_cap=None,
            usage_hint=[1, 1, 0],
        )

        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertIsNotNone(usage)
        self.assertLessEqual(sum(usage or []), 2)

    def test_problem_28_style_distinct_patterns_bounded(self) -> None:
        raw = json.loads(FIX_PROBLEM28.read_text(encoding="utf-8"))
        raw.pop("_comment", None)
        payload = _payload_from_problem_fixture(raw)
        solver = CuttingStockSolver()
        with patch.object(CuttingStockSolver, "_COLUMN_GEN_VARIABLE_THRESHOLD", 10):
            result = solver.solve("r28-regr", payload, "2026-04-30T10:30:00Z")
        bd = result.profile_breakdowns[0]
        dcnt = bd.distinct_pattern_count or len(bd.pattern_ids)
        self.assertLessEqual(dcnt, 10)
        rmp = result.metrics.recoverable_material_pct or 0.0
        self.assertGreaterEqual(rmp, 92.0)

    def test_real_problem_28_patterns_regresses_to_production_pattern_count(self) -> None:
        raw = json.loads(FIX_PROBLEM28_REAL.read_text(encoding="utf-8"))
        meta = raw.get("_meta", {})
        tgt_code = meta.get("primaryProfileCode", "MAIN-28REAL")
        doc_bad = meta.get("documentedPoorRun", {})

        payload = _payload_from_wire_dict(raw)
        solver = CuttingStockSolver()
        with patch.object(CuttingStockSolver, "_COLUMN_GEN_VARIABLE_THRESHOLD", 10):
            result = solver.solve("r28-real", payload, "2026-05-04T12:00:00Z")

        bd = next(b for b in result.profile_breakdowns if b.main_profile_code == tgt_code)
        dcnt = bd.distinct_pattern_count or len(bd.pattern_ids)
        self.assertLessEqual(dcnt, 5)
        rmp = result.metrics.recoverable_material_pct or 0.0
        self.assertGreaterEqual(rmp, 97.5)

        if doc_bad.get("totalBars") is not None:
            self.assertLessEqual(bd.total_bars, int(doc_bad["totalBars"]))
        if doc_bad.get("totalHurdaMm") is not None:
            self.assertLessEqual(bd.total_hurda_mm, int(doc_bad["totalHurdaMm"]))

        cfg = payload.config
        max_var = cfg.max_stock_length_variety_per_profile
        telem = [
            row
            for row in result.profile_group_solve_telemetry or []
            if row.main_profile_code == tgt_code
        ]
        self.assertGreaterEqual(len(telem), 1)
        tel = telem[0]
        if max_var is not None and tel.stock_length_variety_count is not None:
            self.assertLessEqual(tel.stock_length_variety_count, max_var)

        self.assertIsNotNone(tel.baseline_distinct_patterns)
        self.assertIsNotNone(tel.consolidated_distinct_patterns)
        self.assertIsNotNone(tel.baseline_hurda_mm)
        self.assertIsNotNone(tel.consolidated_hurda_mm)
        self.assertEqual(tel.pattern_cap_requested, cfg.max_distinct_patterns_per_profile)
        self.assertIn(tel.pattern_cap_relaxed_to, (None, cfg.max_distinct_patterns_per_profile))
        self.assertIsInstance(tel.consolidation_selected, bool)
        self.assertIsNotNone(tel.stock_length_variety_count)

        self.assertGreaterEqual(bd.total_reusable_scrap_mm, 0)

    def test_same_length_different_cutting_codes_traceability(self) -> None:
        solver = CuttingStockSolver()
        profile_id = "MP-TCODE"
        group = ProfileGroup(
            main_profile_id=profile_id,
            main_profile_code="TRACE",
            main_profile_name="Trace",
            material_color_class="painted",
            stock_bars=[StockBar(length_mm=6100, role="primary")],
            demand_item_count=2,
            total_piece_length_mm=2400 + 7200,
        )
        items = [
            DemandItem(
                production_row_id="a",
                row_index=0,
                work_order_number="WO1",
                main_profile_id=profile_id,
                main_profile_code="TRACE",
                main_profile_name="Trace",
                material_code="M",
                material_name=None,
                material_color="RAL",
                material_color_class="painted",
                cutting_code="CA",
                cutting_name="Cut A",
                piece_length_mm=1200,
                quantity=2,
            ),
            DemandItem(
                production_row_id="b",
                row_index=1,
                work_order_number="WO2",
                main_profile_id=profile_id,
                main_profile_code="TRACE",
                main_profile_name="Trace",
                material_code="M",
                material_name=None,
                material_color="RAL",
                material_color_class="painted",
                cutting_code="CB",
                cutting_name="Cut B",
                piece_length_mm=1200,
                quantity=6,
            ),
        ]
        cfg = OptimizationConfig(solver_time_limit_sec=60)
        payload = OptimizationRequestPayloadV2(
            cut_list_snapshot_id="snap-t",
            plan_year=2026,
            week_number=18,
            selected_work_order_numbers="ALL",
            overrides=[],
            config=cfg,
            profile_groups=[group],
            demand_items=items,
        )
        result = solver.solve("trace-cc", payload, "2026-04-30T11:00:00Z")
        tot_ca = sum(
            pc.count * p.usage_count
            for p in result.patterns
            for pc in p.pieces
            if pc.cutting_code == "CA"
        )
        tot_cb = sum(
            pc.count * p.usage_count
            for p in result.patterns
            for pc in p.pieces
            if pc.cutting_code == "CB"
        )
        self.assertEqual(tot_ca, 2)
        self.assertEqual(tot_cb, 6)
        fulfil = {(w.cutting_code, w.fulfilled_count) for w in result.work_order_items}
        self.assertIn(("CA", 2), fulfil)
        self.assertIn(("CB", 6), fulfil)

    def test_post_repack_rejects_pattern_count_increase_when_quality_equal(self) -> None:
        solver = CuttingStockSolver()
        cfg = OptimizationConfig(
            min_reusable_scrap_mm=200,
            pattern_quality_tolerance_mm=0,
            allow_post_repack_pattern_increase=False,
        )
        kerf = 4
        stock_len, usable_len = 6100, 6090
        cls0 = _PieceClass(length_mm=100, quantity=54)
        pcs = [cls0]

        def scrap_for_single_class_bar(piece_count: int) -> int:
            consumed = piece_count * cls0.length_mm + max(0, piece_count - 1) * kerf
            return usable_len - consumed

        def pack(counts: list[tuple[int, int]]) -> tuple:
            n = sum(c for _i, c in counts)
            return (
                stock_len,
                usable_len,
                "primary",
                sorted(counts),
                scrap_for_single_class_bar(n),
            )

        used: list = []
        used.extend([pack([(0, 5)])] * 4)
        used.extend([pack([(0, 4)])] * 4)
        used.extend([pack([(0, 3)])] * 4)
        used.extend([pack([(0, 2)])] * 3)

        base_tuple = solver._used_bars_score(used, piece_classes=pcs, config=cfg)
        # (bars, hurda_aggr, scrap_mm, distinct_pattern_sigs, nominal_variety)
        self.assertEqual(base_tuple[0], 15)
        self.assertEqual(base_tuple[1], 0)
        self.assertEqual(base_tuple[3], 4)

        base_scrap_total = base_tuple[2]
        fractured_scraps = [5700] * 14 + [base_scrap_total - 5700 * 14]
        fractured = [
            (stock_len, usable_len, "primary", [(0, k)], scrap_value)
            for k, scrap_value in zip(range(1, 16), fractured_scraps)
        ]

        fractured_tuple = solver._used_bars_score(
            fractured, piece_classes=pcs, config=cfg
        )
        self.assertEqual(fractured_tuple[0], 15)
        self.assertEqual(fractured_tuple[1], 0)
        self.assertEqual(fractured_tuple[2], base_tuple[2])
        self.assertEqual(fractured_tuple[3], 15)

        self.assertFalse(
            solver._post_repack_improves(
                baseline=base_tuple,
                cand=fractured_tuple,
                config=cfg,
            )
        )

        usable = [(stock_len, usable_len, "primary")]

        def boom(*_args, **_kw):
            return fractured

        with patch.object(
            CuttingStockSolver,
            "_ffd_repack_from_class_order",
            side_effect=boom,
        ):
            with self.assertLogs(
                "app.services.cutting_stock_solver", level=logging.INFO
            ) as log_ctx:
                out = solver._post_optimize_bars(
                    used,
                    usable_lengths_by_choice=usable,
                    kerf=kerf,
                    piece_classes=pcs,
                    config=cfg,
                )

        self.assertEqual(out, used)
        self.assertEqual(
            solver._used_bars_score(out, piece_classes=pcs, config=cfg),
            base_tuple,
        )
        reject_msgs = [
            r for r in log_ctx.records if "post_repack: reject" in r.getMessage()
        ]
        finalize_msgs = [
            r
            for r in log_ctx.records
            if "post_repack: baseline=" in r.getMessage()
            and "telemetry=production_tuple" in r.getMessage()
        ]
        self.assertGreaterEqual(len(reject_msgs), 1)
        self.assertGreaterEqual(len(finalize_msgs), 1)

    def test_post_repack_allows_quality_improvement_before_pattern_count(self) -> None:
        solver = CuttingStockSolver()
        cfg = OptimizationConfig(
            min_reusable_scrap_mm=200,
            pattern_quality_tolerance_mm=0,
            allow_post_repack_pattern_increase=False,
        )
        pcs = [
            _PieceClass(length_mm=100, quantity=2),
            _PieceClass(length_mm=120, quantity=2),
        ]

        baseline = [
            (6100, 6090, "primary", [(0, 1), (1, 1)], 150),
            (6100, 6090, "primary", [(0, 1), (1, 1)], 150),
        ]
        lower_hurda_more_patterns = [
            (6100, 6090, "primary", [(0, 2)], 0),
            (6100, 6090, "primary", [(1, 2)], 100),
        ]

        base_tuple = solver._used_bars_score(
            baseline, piece_classes=pcs, config=cfg
        )
        candidate_tuple = solver._used_bars_score(
            lower_hurda_more_patterns, piece_classes=pcs, config=cfg
        )

        self.assertEqual(base_tuple[0], candidate_tuple[0])
        self.assertGreater(candidate_tuple[3], base_tuple[3])
        self.assertLess(candidate_tuple[1], base_tuple[1])
        self.assertTrue(
            solver._post_repack_improves(
                baseline=base_tuple,
                cand=candidate_tuple,
                config=cfg,
            )
        )

    def test_stock_requirements_aggregate_matches_pattern_bar_count_bar_slot_path(
        self,
    ) -> None:
        solver = CuttingStockSolver()
        pid = "MP-REQROLL"
        group = ProfileGroup(
            main_profile_id=pid,
            main_profile_code="REQROLL",
            main_profile_name="Req roll-up",
            material_color_class="painted",
            stock_bars=[
                StockBar(length_mm=6100, role="primary"),
                StockBar(length_mm=6500, role="primary"),
            ],
            demand_item_count=2,
            total_piece_length_mm=2000 * 3 + 2800 * 2,
        )
        items = [
            DemandItem(
                production_row_id="rq-1",
                row_index=0,
                work_order_number="WO-REQ",
                main_profile_id=pid,
                main_profile_code="REQROLL",
                main_profile_name="Req roll-up",
                material_code="M",
                material_name="Alu",
                material_color="RAL",
                material_color_class="painted",
                cutting_code="S",
                cutting_name="2m",
                piece_length_mm=2000,
                quantity=3,
            ),
            DemandItem(
                production_row_id="rq-2",
                row_index=1,
                work_order_number="WO-REQ",
                main_profile_id=pid,
                main_profile_code="REQROLL",
                main_profile_name="Req roll-up",
                material_code="M",
                material_name="Alu",
                material_color="RAL",
                material_color_class="painted",
                cutting_code="L",
                cutting_name="2.8m",
                piece_length_mm=2800,
                quantity=2,
            ),
        ]
        cfg = OptimizationConfig(
            solver_time_limit_sec=30,
            max_stock_length_variety_per_profile=None,
        )
        payload = OptimizationRequestPayloadV2(
            cut_list_snapshot_id="snap-reqroll",
            plan_year=2026,
            week_number=20,
            selected_work_order_numbers="ALL",
            overrides=[],
            config=cfg,
            profile_groups=[group],
            demand_items=items,
        )
        with patch.object(CuttingStockSolver, "_COLUMN_GEN_VARIABLE_THRESHOLD", 10**9):
            result = solver.solve("job-reqroll", payload, "2026-05-05T12:00:00Z")

        bars_from_patterns = sum(p.usage_count for p in result.patterns)
        agg = _user_style_stock_aggregate(
            result.stock_requirements,
            profile_code="REQROLL",
        )
        total_from_agg = sum(agg.values())
        self.assertEqual(total_from_agg, bars_from_patterns)
        notation = "+".join(f"{ln}X{cnt}" for ln, cnt in agg.items())
        self.assertNotEqual(notation, "")
        self.assertIn("X", notation)

    def test_bar_slot_max_nominal_variety_enforced(self) -> None:
        solver = CuttingStockSolver()
        pid = "MP-VAR1"
        group = ProfileGroup(
            main_profile_id=pid,
            main_profile_code="VAR1CAP",
            main_profile_name="Variety cap bar-slot",
            material_color_class="painted",
            stock_bars=[
                StockBar(length_mm=6000, role="primary"),
                StockBar(length_mm=5500, role="primary"),
            ],
            demand_item_count=2,
            total_piece_length_mm=4980 * 2 + 2450 * 4,
        )
        items = [
            DemandItem(
                production_row_id="v-1",
                row_index=0,
                work_order_number="WO-V",
                main_profile_id=pid,
                main_profile_code="VAR1CAP",
                main_profile_name="Variety cap bar-slot",
                material_code="MAT",
                material_name="Alu",
                material_color="RAL",
                material_color_class="painted",
                cutting_code="BIG",
                cutting_name="4980",
                piece_length_mm=4980,
                quantity=2,
            ),
            DemandItem(
                production_row_id="v-2",
                row_index=1,
                work_order_number="WO-V",
                main_profile_id=pid,
                main_profile_code="VAR1CAP",
                main_profile_name="Variety cap bar-slot",
                material_code="MAT",
                material_name="Alu",
                material_color="RAL",
                material_color_class="painted",
                cutting_code="SML",
                cutting_name="2450",
                piece_length_mm=2450,
                quantity=4,
            ),
        ]
        cfg = OptimizationConfig(
            solver_time_limit_sec=30,
            max_stock_length_variety_per_profile=1,
            pattern_consolidation_enabled=False,
        )
        payload = OptimizationRequestPayloadV2(
            cut_list_snapshot_id="snap-var1",
            plan_year=2026,
            week_number=21,
            selected_work_order_numbers="ALL",
            overrides=[],
            config=cfg,
            profile_groups=[group],
            demand_items=items,
        )
        with patch.object(CuttingStockSolver, "_COLUMN_GEN_VARIABLE_THRESHOLD", 10**9):
            result = solver.solve("job-var1", payload, "2026-05-05T12:30:00Z")

        agg = _user_style_stock_aggregate(result.stock_requirements, profile_code="VAR1CAP")
        self.assertLessEqual(len(agg), 1, msg="Exactly one nominal stock length when cap is 1.")

        telem = [
            row
            for row in result.profile_group_solve_telemetry or []
            if row.main_profile_code == "VAR1CAP"
        ]
        self.assertGreaterEqual(len(telem), 1)
        if telem[0].stock_length_variety_count is not None:
            self.assertLessEqual(telem[0].stock_length_variety_count, 1)


class ColumnGenPhase2Tests(unittest.TestCase):
    def test_column_gen_phase2_prefers_less_total_scrap_before_hurda_classification(self) -> None:
        solver = CuttingStockSolver()
        pieces = [_PieceClass(length_mm=1000, quantity=1)]
        cfg = OptimizationConfig(
            solver_time_limit_sec=10,
            min_reusable_scrap_mm=200,
        )
        patterns = [
            {
                "stock_len": 1100,
                "usable": 1100,
                "role": "primary",
                "stock_idx": 0,
                "counts": [1],
                "scrap": 100,
            },
            {
                "stock_len": 1500,
                "usable": 1500,
                "role": "secondary",
                "stock_idx": 1,
                "counts": [1],
                "scrap": 500,
            },
        ]

        status, _wall, usage = solver._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=pieces,
            bar_upper_bound=1,
            usable_lengths_by_choice=[
                (1100, 1100, "primary"),
                (1500, 1500, "secondary"),
            ],
            config=cfg,
            time_sec=10.0,
            best_bars=1,
            best_hurda=0,
            pattern_cap=None,
            best_scrap=500,
            usage_hint=[0, 1],
        )

        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(usage, [1, 0])

    def test_column_gen_second_stage_fills_piece_sized_leftover_before_hurda_tie_break(self) -> None:
        solver = CuttingStockSolver()
        pieces = [
            _PieceClass(length_mm=446, quantity=16),
            _PieceClass(length_mm=326, quantity=14),
        ]
        cfg = OptimizationConfig(
            solver_time_limit_sec=10,
            min_reusable_scrap_mm=200,
            pattern_quality_tolerance_mm=0,
            pattern_consolidation_enabled=True,
        )
        patterns = [
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [12, 1],
                "scrap": 364,
            },
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [4, 13],
                "scrap": 4,
            },
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [12, 2],
                "scrap": 34,
            },
            {
                "stock_len": 6100,
                "usable": 6090,
                "role": "primary",
                "stock_idx": 0,
                "counts": [4, 12],
                "scrap": 334,
            },
        ]

        status, _wall, usage = solver._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=pieces,
            bar_upper_bound=2,
            usable_lengths_by_choice=[(6100, 6090, "primary")],
            config=cfg,
            time_sec=10.0,
            best_bars=2,
            best_hurda=4,
            pattern_cap=None,
            best_scrap=368,
            usage_hint=[1, 1, 0, 0],
        )

        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(usage, [0, 0, 1, 1])

    def test_column_gen_second_stage_prefers_quality_before_fewer_patterns(self) -> None:
        solver = CuttingStockSolver()
        pieces = [
            _PieceClass(length_mm=1000, quantity=2),
            _PieceClass(length_mm=1000, quantity=2),
        ]
        cfg = OptimizationConfig(
            solver_time_limit_sec=10,
            min_reusable_scrap_mm=10_000,
            pattern_quality_tolerance_mm=0,
            pattern_consolidation_enabled=True,
        )
        patterns = [
            {
                "stock_len": 2600,
                "usable": 2600,
                "role": "primary",
                "stock_idx": 0,
                "counts": [1, 1],
                "scrap": 596,
            },
            {
                "stock_len": 2104,
                "usable": 2104,
                "role": "primary",
                "stock_idx": 0,
                "counts": [2, 0],
                "scrap": 100,
            },
            {
                "stock_len": 2104,
                "usable": 2104,
                "role": "primary",
                "stock_idx": 0,
                "counts": [0, 2],
                "scrap": 100,
            },
        ]

        status, _wall, usage = solver._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=pieces,
            bar_upper_bound=2,
            usable_lengths_by_choice=[(2600, 2600, "primary")],
            config=cfg,
            time_sec=10.0,
            best_bars=2,
            best_hurda=1192,
            pattern_cap=None,
            usage_hint=[2, 0, 0],
        )

        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(usage, [0, 1, 1])

    def test_column_gen_second_stage_does_not_trade_hurda_for_fewer_patterns(self) -> None:
        solver = CuttingStockSolver()
        pieces = [
            _PieceClass(length_mm=1000, quantity=4),
            _PieceClass(length_mm=500, quantity=4),
        ]
        cfg = OptimizationConfig(
            solver_time_limit_sec=10,
            min_reusable_scrap_mm=10_000,
            pattern_quality_tolerance_mm=0,
            pattern_consolidation_enabled=True,
        )
        patterns = [
            {
                "stock_len": 2100,
                "usable": 2100,
                "role": "primary",
                "stock_idx": 0,
                "counts": [2, 1],
                "scrap": 0,
            },
            {
                "stock_len": 2100,
                "usable": 2100,
                "role": "primary",
                "stock_idx": 0,
                "counts": [2, 3],
                "scrap": 0,
            },
            {
                "stock_len": 6100,
                "usable": 6100,
                "role": "secondary",
                "stock_idx": 1,
                "counts": [2, 2],
                "scrap": 1000,
            },
        ]

        status, _wall, usage = solver._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=pieces,
            bar_upper_bound=2,
            usable_lengths_by_choice=[
                (2100, 2100, "primary"),
                (6100, 6100, "secondary"),
            ],
            config=cfg,
            time_sec=10.0,
            best_bars=2,
            best_hurda=0,
            pattern_cap=None,
            usage_hint=[1, 1, 0],
        )

        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(usage, [1, 1, 0])

    def test_column_gen_second_stage_does_not_trade_reusable_scrap_for_fewer_patterns(self) -> None:
        solver = CuttingStockSolver()
        pieces = [
            _PieceClass(length_mm=1000, quantity=4),
            _PieceClass(length_mm=500, quantity=4),
        ]
        cfg = OptimizationConfig(
            solver_time_limit_sec=10,
            min_reusable_scrap_mm=500,
            pattern_quality_tolerance_mm=0,
            pattern_consolidation_enabled=True,
        )
        patterns = [
            {
                "stock_len": 2100,
                "usable": 2100,
                "role": "primary",
                "stock_idx": 0,
                "counts": [2, 1],
                "scrap": 0,
            },
            {
                "stock_len": 2100,
                "usable": 2100,
                "role": "primary",
                "stock_idx": 0,
                "counts": [2, 3],
                "scrap": 0,
            },
            {
                "stock_len": 6100,
                "usable": 6100,
                "role": "secondary",
                "stock_idx": 1,
                "counts": [2, 2],
                "scrap": 1000,
            },
        ]

        status, _wall, usage = solver._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=pieces,
            bar_upper_bound=2,
            usable_lengths_by_choice=[
                (2100, 2100, "primary"),
                (6100, 6100, "secondary"),
            ],
            config=cfg,
            time_sec=10.0,
            best_bars=2,
            best_hurda=0,
            pattern_cap=None,
            usage_hint=[1, 1, 0],
        )

        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(usage, [1, 1, 0])

    def test_column_gen_second_stage_prefers_fewer_patterns_at_same_quality(self) -> None:
        solver = CuttingStockSolver()
        pieces = [_PieceClass(length_mm=100, quantity=10)]
        usable_lengths_by_choice = [(6100, 6090, "primary")]
        cfg = OptimizationConfig(
            solver_time_limit_sec=30,
            min_reusable_scrap_mm=200,
            pattern_quality_tolerance_mm=0,
            pattern_consolidation_enabled=True,
        )
        kerf = 4
        scrap_cell = (
            6090
            - (5 * 100 + max(0, 5 - 1) * kerf)
        )
        p_template = {
            "stock_len": 6100,
            "usable": 6090,
            "role": "primary",
            "stock_idx": 0,
            "counts": [5],
            "scrap": scrap_cell,
        }
        patterns = [dict(p_template), dict(p_template), dict(p_template)]
        kw = dict(
            patterns=patterns,
            piece_classes=pieces,
            bar_upper_bound=20,
            usable_lengths_by_choice=usable_lengths_by_choice,
            config=cfg,
        )
        st1, _, u1, b1, h1, _s1 = solver._run_column_gen_phase1(
            **kw,
            time_sec=25.0,
        )
        self.assertIn(st1, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        assert u1 is not None

        bars1 = sum(u1)
        hurda_coef = scrap_cell if scrap_cell < cfg.min_reusable_scrap_mm else 0
        hurda1 = hurda_coef * bars1
        scrap1 = scrap_cell * bars1

        assert b1 is not None

        st2, _, u2 = solver._run_column_gen_phase2(
            **kw,
            time_sec=30.0,
            best_bars=b1,
            best_hurda=hurda1,
            pattern_cap=None,
        )

        assert u2 is not None

        bars2 = sum(u2)

        scrap2_tot = scrap_cell * bars2

        hurda2 = hurda_coef * bars2
        usage_active_phase2 = sum(1 for z in u2 if z > 0)
        usage_active_phase1 = sum(1 for z in u1 if z > 0)

        self.assertLessEqual(scrap2_tot, scrap1)

        self.assertLessEqual(hurda2, hurda1)

        self.assertGreaterEqual(len(patterns), 2)
        self.assertGreaterEqual(
            usage_active_phase1,
            usage_active_phase2,
            msg="phase-2 must not inflate active pattern templates under quality slack",
        )
