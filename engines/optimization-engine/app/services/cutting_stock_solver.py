"""1D cutting-stock optimization with multiple stock-bar lengths, kerf, and color-driven
safety trims, solved with Google OR-Tools CP-SAT only.

Algorithm
=========

For a single profile group (one main profile + one color class) the model treats every
candidate stock bar as a fixed-capacity bin whose usable length is

    usable_length(b) = chosen_stock_length(b) - front_trim - end_trim

Pieces of length ``L_i`` are placed onto bars; between any two pieces on the same bar
a kerf ``k`` is consumed by the saw blade (the first piece consumes no kerf because
the bar is already trimmed at the front). Pieces of identical length on the same bar
collapse into a count variable to keep the model compact under presolve.

Variables
---------

    bar_used[b] in {0, 1}                   — whether bar b is part of the solution
    bar_choice[b, c] in {0, 1}              — which stock-bar length c the bar uses
    count[b, i] in {0, qty_i}               — pieces of demand item i placed on bar b

Constraints
-----------

    sum_b count[b, i] == qty_i              — every demanded piece is produced
    sum_c bar_choice[b, c] == bar_used[b]   — exactly one length choice per used bar
    sum_i count[b, i] * (L_i + k) - k * pieces_on_bar_indicator[b]
        <= sum_c bar_choice[b, c] * usable_c
                                             — bar capacity respecting kerf
    count[b, i] > 0  =>  bar_used[b] = 1     — channeling
    bar_used[b] >= bar_used[b+1]             — symmetry breaking on identical bars

Objective
---------

Lexicographic (bars, scrap) — single weighted sum chosen so the first weight cannot be
defeated by any feasible scrap configuration:

    minimize  W_BAR * sum_b bar_used[b] + sum_b scrap[b]

with ``W_BAR > total_demand_length + B * max_usable_length``. CP-SAT integer arithmetic
preserves the strict lex order with this dominator weight.

Profile groups are independent and solved sequentially; results are aggregated and
patterns deduplicated by their ``(stock_length, multiset(piece_lengths))`` signature.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import time
from collections import Counter
from dataclasses import dataclass, field
from itertools import combinations
from typing import Iterable, Literal, Sequence

from ortools.linear_solver import pywraplp
from ortools.sat.python import cp_model

from app.domain.color_policy import (
    ColorClass,
    SafetyMarginPolicy,
    classify,
    policy_for,
)
from app.schemas.optimization_v2 import (
    DemandItem,
    LeftoverPiece,
    OptimizationConfig,
    OptimizationPattern,
    OptimizationRequestPayloadV2,
    OptimizationResultPayload,
    PatternPiece,
    ProfileBreakdown,
    ProfileGroup,
    ProfileGroupSolveTelemetry,
    ResultMetrics,
    SolverStats,
    StockBar,
    StockBarRole,
    StockRequirement,
    WorkOrderItem,
)

_LOGGER = logging.getLogger(__name__)


@dataclass
class _PieceClass:
    """Geometry-only bucket (length_mm); unified across different cutting_codes to prevent fragmentation."""

    length_mm: int
    quantity: int
    item_indices: list[int] = field(default_factory=list)


# One physical bar packing: nominal stock_len, usable, role, class-index counts, leftover scrap_mm.
UsedBarPack = tuple[int, int, StockBarRole, list[tuple[int, int]], int]


@dataclass
class _GroupSolution:
    group_key: tuple[str, ColorClass]
    main_profile_id: str
    main_profile_code: str
    main_profile_name: str
    color_class: ColorClass
    patterns: list[OptimizationPattern]
    profile_breakdown: ProfileBreakdown
    leftovers: list[LeftoverPiece]
    stock_requirements: list[StockRequirement]
    work_order_items: list[WorkOrderItem]
    solver_status: int
    solver_status_label: str
    solver_mode: str
    wall_time_sec: float
    best_objective: float | None
    best_bound: float | None
    num_conflicts: int | None
    num_branches: int | None
    group_solve_telemetry: ProfileGroupSolveTelemetry | None = None
    consolidation_snap: dict[str, int | bool | None] | None = None


@dataclass
class _RequestBudget:
    deadline_monotonic: float

    @classmethod
    def from_seconds(cls, seconds: int | float) -> "_RequestBudget":
        return cls(deadline_monotonic=time.monotonic() + max(float(seconds), 1.0))

    def remaining_sec(self) -> float:
        return max(0.0, self.deadline_monotonic - time.monotonic())


class CuttingStockSolver:
    def __init__(self) -> None:
        self._logger = _LOGGER

    def solve(
        self,
        request_id: str,
        payload: OptimizationRequestPayloadV2,
        generated_at: str,
    ) -> OptimizationResultPayload:
        groups = self._group_demand(payload)
        config = payload.config
        request_budget = _RequestBudget.from_seconds(config.solver_time_limit_sec)

        per_group_solutions: list[_GroupSolution] = []
        aggregate_status = "OPTIMAL"
        aggregate_solver_mode = "cp_sat"
        aggregate_wall = 0.0
        aggregate_best_obj = 0.0
        aggregate_best_bound = 0.0
        aggregate_conflicts = 0
        aggregate_branches = 0
        any_unknown_bound = False

        for group_index, (group, items) in enumerate(groups):
            remaining_groups = max(len(groups) - group_index, 1)
            group_config = self._config_for_remaining_request_budget(
                config,
                request_budget.remaining_sec(),
                remaining_groups,
            )
            solution = self._solve_group(group, items, group_config)
            per_group_solutions.append(solution)
            if solution.solver_mode == "heuristic_fallback":
                aggregate_solver_mode = "heuristic_fallback"
            aggregate_wall += solution.wall_time_sec
            aggregate_status = self._merge_status(
                aggregate_status, solution.solver_status_label
            )
            if solution.best_objective is not None:
                aggregate_best_obj += solution.best_objective
            if solution.best_bound is None:
                any_unknown_bound = True
            else:
                aggregate_best_bound += solution.best_bound
            aggregate_conflicts += solution.num_conflicts or 0
            aggregate_branches += solution.num_branches or 0

            if request_budget.remaining_sec() <= 0 and group_index < len(groups) - 1:
                self._logger.warning(
                    "Optimization request budget exhausted after %s/%s profile groups; "
                    "remaining groups will use one-second bounded fallback slices.",
                    group_index + 1,
                    len(groups),
                )

        all_patterns: list[OptimizationPattern] = []
        all_breakdowns: list[ProfileBreakdown] = []
        all_leftovers: list[LeftoverPiece] = []
        all_stock_requirements: list[StockRequirement] = []
        all_work_order_items: list[WorkOrderItem] = []

        for sol in per_group_solutions:
            all_patterns.extend(sol.patterns)
            all_breakdowns.append(sol.profile_breakdown)
            all_leftovers.extend(sol.leftovers)
            all_stock_requirements.extend(sol.stock_requirements)
            all_work_order_items.extend(sol.work_order_items)

        metrics = self._aggregate_metrics(
            payload=payload,
            patterns=all_patterns,
            leftovers=all_leftovers,
            best_objective=aggregate_best_obj,
            best_bound=None if any_unknown_bound else aggregate_best_bound,
        )

        group_telemetry = [
            sol.group_solve_telemetry
            for sol in per_group_solutions
            if sol.group_solve_telemetry is not None
        ]
        self._logger.info(
            "Optimization RCA summary: physical_stock_cuts=%s distinct_pattern_templates=%s "
            "profile_groups=%s telemetry_rows=%s",
            metrics.total_stock_bars,
            metrics.distinct_pattern_types_total,
            len(per_group_solutions),
            len(group_telemetry),
        )

        solver_stats = SolverStats(
            status=aggregate_status,  # type: ignore[arg-type]
            wall_time_sec=round(aggregate_wall, 4),
            best_objective=aggregate_best_obj if per_group_solutions else None,
            best_bound=None if any_unknown_bound else aggregate_best_bound,
            num_conflicts=aggregate_conflicts,
            num_branches=aggregate_branches,
        )

        return OptimizationResultPayload(
            request_id=request_id,
            cut_list_snapshot_id=payload.cut_list_snapshot_id,
            plan_year=payload.plan_year,
            week_number=payload.week_number,
            generated_at=generated_at,
            solver_mode=aggregate_solver_mode,
            metrics=metrics,
            profile_breakdowns=all_breakdowns,
            patterns=all_patterns,
            work_order_items=all_work_order_items,
            leftovers=all_leftovers,
            stock_requirements=all_stock_requirements,
            solver_stats=solver_stats,
            profile_group_solve_telemetry=group_telemetry,
        )

    def _group_demand(
        self, payload: OptimizationRequestPayloadV2
    ) -> list[tuple[ProfileGroup, list[DemandItem]]]:
        groups_by_key: dict[tuple[str, ColorClass], list[DemandItem]] = {}
        group_lookup: dict[tuple[str, ColorClass], ProfileGroup] = {}

        for group in payload.profile_groups:
            color_class = ColorClass(group.material_color_class)
            group_lookup[(group.main_profile_id, color_class)] = group
            groups_by_key[(group.main_profile_id, color_class)] = []

        for item in payload.demand_items:
            color_class = ColorClass(item.material_color_class)
            key = (item.main_profile_id, color_class)
            if key not in groups_by_key:
                raise InfeasibleGroupError(
                    f"Demand item for profile {item.main_profile_code} "
                    f"(color {color_class.value}) has no matching profile group. "
                    f"Stock bar information is missing — cannot optimize."
                )
            groups_by_key[key].append(item)

        ordered: list[tuple[ProfileGroup, list[DemandItem]]] = []
        for key, items in groups_by_key.items():
            if not items:
                self._logger.warning(
                    "Profile group %s (color %s) has no demand items — skipping.",
                    group_lookup[key].main_profile_code,
                    key[1].value,
                )
                continue
            ordered.append((group_lookup[key], items))
        return ordered

    def _config_for_remaining_request_budget(
        self,
        config: OptimizationConfig,
        remaining_sec: float,
        remaining_groups: int,
    ) -> OptimizationConfig:
        """Turn request-level wall-clock budget into a bounded group slice."""

        safe_remaining_groups = max(int(remaining_groups), 1)
        safe_remaining = max(float(remaining_sec), 0.0)
        slice_sec = safe_remaining / safe_remaining_groups
        bounded_slice = max(
            1,
            min(int(math.ceil(slice_sec)), int(config.solver_time_limit_sec)),
        )

        updates: dict[str, int | bool] = {
            "solver_time_limit_sec": bounded_slice,
        }
        if safe_remaining < 1.0:
            updates["pattern_consolidation_enabled"] = False

        return config.model_copy(update=updates)

    @staticmethod
    def _max_pieces_per_stock_bar(config: OptimizationConfig) -> int | None:
        if config.max_pieces_per_stock_bar is None:
            return None
        return max(1, int(config.max_pieces_per_stock_bar))

    # ── Threshold: groups with fewer total variables than this use the legacy
    #    bar-slot model; larger groups use the column-generation hybrid.
    #    Set to -1 to ALWAYS use column generation, as it natively minimizes patterns via OR-Tools.
    _COLUMN_GEN_VARIABLE_THRESHOLD = -1

    def _solve_group(
        self,
        group: ProfileGroup,
        items: Sequence[DemandItem],
        config: OptimizationConfig,
    ) -> _GroupSolution:
        color_class = ColorClass(group.material_color_class)
        policy = policy_for(self._policy_lookup_token(color_class))
        kerf = config.kerf_mm

        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]] = []
        for bar in self._effective_stock_bars(group, config):
            usable = bar.length_mm - policy.total_trim_mm
            if usable <= 0:
                continue
            usable_lengths_by_choice.append((bar.length_mm, usable, bar.role))

        if not usable_lengths_by_choice:
            raise InfeasibleGroupError(
                f"Profile {group.main_profile_code} has no usable stock bar after "
                f"applying safety trims for color class {color_class.value}."
            )

        max_usable = max(usable for _stock, usable, _role in usable_lengths_by_choice)
        max_piece_length = max(item.piece_length_mm for item in items)
        if max_piece_length > max_usable:
            raise InfeasibleGroupError(
                f"Profile {group.main_profile_code}: longest piece "
                f"({max_piece_length} mm) exceeds maximum usable length "
                f"({max_usable} mm) after safety trims."
            )

        piece_classes = self._collapse_piece_classes(items)
        bar_upper_bound = self._bar_upper_bound(
            piece_classes, usable_lengths_by_choice, kerf, config
        )

        common_kwargs = dict(
            group=group, items=items, config=config,
            usable_lengths_by_choice=usable_lengths_by_choice,
            piece_classes=piece_classes, policy=policy, kerf=kerf,
        )

        estimated_vars = bar_upper_bound * (len(piece_classes) + len(usable_lengths_by_choice) + 3)

        # Primary solve via CP-SAT (column-gen or bar-slot)
        is_column_gen = estimated_vars > self._COLUMN_GEN_VARIABLE_THRESHOLD
        if is_column_gen:
            cpsat_solution = self._solve_group_column_gen(
                **common_kwargs, bar_upper_bound=bar_upper_bound,
            )
        else:
            cpsat_solution = self._solve_group_bar_slot(
                **common_kwargs, bar_upper_bound=bar_upper_bound,
            )

        # Bar-slot OPTIMAL is provably optimal (direct piece-to-bar) → use directly.
        # Column-gen OPTIMAL only means best pattern selection → run heuristic too.
        def _solver_status_lit(label: str) -> (
            Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"]
        ):
            if label in (
                "OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN",
            ):
                return label  # type: ignore[return-value]
            return "UNKNOWN"

        pm_path = "column_gen" if is_column_gen else "bar_slot"

        if not is_column_gen and cpsat_solution.solver_status_label == "OPTIMAL":
            self._validate_group_solution(cpsat_solution, piece_classes, config)
            cpsat_solution.group_solve_telemetry = self._telemetry_merge_snap(
                ProfileGroupSolveTelemetry(
                    main_profile_code=group.main_profile_code,
                    material_color_class=group.material_color_class,
                    primary_model_path="bar_slot",
                    primary_leg_status=_solver_status_lit(
                        cpsat_solution.solver_status_label
                    ),
                    primary_leg_bars=cpsat_solution.profile_breakdown.total_bars,
                    primary_leg_scrap_mm=cpsat_solution.profile_breakdown.total_scrap_mm,
                    primary_leg_solver_mode="cp_sat",
                    heuristic_lex_compared=False,
                    secondary_leg_bars=None,
                    secondary_leg_scrap_mm=None,
                    heuristic_selected_lex=None,
                    winning_solver_mode="cp_sat",
                ),
                cpsat_solution.consolidation_snap,
            )
            return cpsat_solution

        # Run heuristic and pick the better result
        heuristic_solution = self._solve_group_with_heuristic(
            **common_kwargs,
            status_label="DUAL_PATH_COMPARISON",
            wall_time_sec=0.0,
        )

        cpsat_t = self._solution_production_tuple(cpsat_solution)
        heur_t = self._solution_production_tuple(heuristic_solution)

        if heur_t < cpsat_t:
            self._logger.info(
                "Heuristic beat CP-SAT for %s: tuple %s vs %s",
                group.main_profile_code,
                heur_t,
                cpsat_t,
            )
            best = heuristic_solution
        else:
            best = cpsat_solution

        heur_selected_lex = bool(heur_t < cpsat_t)
        best.group_solve_telemetry = ProfileGroupSolveTelemetry(
            main_profile_code=group.main_profile_code,
            material_color_class=group.material_color_class,
            primary_model_path=pm_path,  # type: ignore[arg-type]
            primary_leg_status=_solver_status_lit(cpsat_solution.solver_status_label),
            primary_leg_bars=cpsat_t[0],
            primary_leg_scrap_mm=cpsat_t[2],
            primary_leg_solver_mode=cpsat_solution.solver_mode,
            heuristic_lex_compared=True,
            secondary_leg_bars=heur_t[0],
            secondary_leg_scrap_mm=heur_t[2],
            heuristic_selected_lex=heur_selected_lex,
            winning_solver_mode=best.solver_mode,
        )

        self._validate_group_solution(best, piece_classes, config)
        best.group_solve_telemetry = self._telemetry_merge_snap(
            best.group_solve_telemetry, best.consolidation_snap
        )
        return best

    # ── Production scoring & pattern helpers ──────────────────────────────

    @staticmethod
    def _split_scrap(scrap_mm: int, config: OptimizationConfig) -> tuple[int, int]:
        return CuttingStockSolver._pattern_reusable_hurda(scrap_mm, config)

    @staticmethod
    def _pattern_hurda(scrap_mm: int, config: OptimizationConfig) -> int:
        return scrap_mm if scrap_mm < config.min_reusable_scrap_mm else 0

    @staticmethod
    def _pattern_reusable(scrap_mm: int, config: OptimizationConfig) -> int:
        return scrap_mm if scrap_mm >= config.min_reusable_scrap_mm else 0

    @staticmethod
    def _pattern_reusable_hurda(
        scrap_mm: int, config: OptimizationConfig
    ) -> tuple[int, int]:
        reusable = CuttingStockSolver._pattern_reusable(scrap_mm, config)
        hurda = scrap_mm - reusable
        return reusable, hurda

    @staticmethod
    def _allocate_class_count_to_demand_indices(
        cls: _PieceClass,
        items: Sequence[DemandItem],
        cls_piece_total: int,
    ) -> list[tuple[int, int]]:
        """Split aggregated class piece count onto demand rows proportional to WO qty."""
        if cls_piece_total <= 0:
            return []
        row_weights = [(idx, max(1, items[idx].quantity)) for idx in cls.item_indices]
        sw = sum(w for _, w in row_weights)
        if sw <= 0:
            return []

        allocations: dict[int, int] = {}
        prio: list[tuple[int, int]] = []
        for idx, w in row_weights:
            prod = cls_piece_total * w
            allocations[idx] = prod // sw
            prio.append((-(prod % sw), idx))

        shortfall = cls_piece_total - sum(allocations.values())
        prio.sort(key=lambda t: (t[0], t[1]))
        for k in range(shortfall):
            _, idx_pick = prio[k % len(prio)]
            allocations[idx_pick] += 1

        return [(idx, n) for idx, n in sorted(allocations.items()) if n > 0]

    def _merge_adjacent_pattern_pieces_for_display(
        self, pieces_raw: Sequence[PatternPiece]
    ) -> list[PatternPiece]:
        merged: list[PatternPiece] = []
        ordering = sorted(
            pieces_raw,
            key=lambda p: (-p.length_mm, p.cutting_code),
        )
        for pc in ordering:
            if (
                merged
                and merged[-1].cutting_code == pc.cutting_code
                and merged[-1].length_mm == pc.length_mm
            ):
                prev = merged[-1]
                wos = sorted({*prev.work_order_numbers, *pc.work_order_numbers})
                merged[-1] = PatternPiece(
                    cutting_code=prev.cutting_code,
                    cutting_name=prev.cutting_name,
                    length_mm=prev.length_mm,
                    count=prev.count + pc.count,
                    work_order_numbers=wos,
                )
            else:
                merged.append(pc)
        return merged

    def _pattern_signature(
        self,
        stock_len: int,
        role: StockBarRole,
        breakdown: list[tuple[int, int]],
    ) -> str:
        normalized = sorted(breakdown, key=lambda t: (t[0], t[1]))
        payload = {"stockLen": stock_len, "role": role, "breakdown": normalized}
        return hashlib.sha1(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[
            :16
        ]

    def _used_bars_score(
        self,
        used_bars: Sequence[UsedBarPack],
        *,
        piece_classes: list[_PieceClass],
        config: OptimizationConfig,
    ) -> tuple[int, int, int, int, int]:
        bars = len(used_bars)
        hurda = 0
        scrap = 0
        sigs: set[str] = set()
        stock_keys: set[tuple[int, StockBarRole]] = set()
        for stock_len, _usable, role, breakdown, scrap_mm in used_bars:
            hurda += self._pattern_hurda(scrap_mm, config)
            scrap += scrap_mm
            sigs.add(self._pattern_signature(stock_len, role, breakdown))
            stock_keys.add((stock_len, role))
        # Lex tuple for post-repack / dual-path compare:
        # bars -> hurda -> total scrap -> distinct pattern signatures -> stock variety.
        # Pattern count is a production-readability tie-break only; it must never
        # beat a physically better material result.
        return (bars, hurda, scrap, len(sigs), len(stock_keys))

    def _solution_production_tuple(self, sol: _GroupSolution) -> tuple[int, int, int, int, int]:
        bd = sol.profile_breakdown
        var = len({(p.stock_bar_length_mm, p.stock_bar_role) for p in sol.patterns})
        return (
            bd.total_bars,
            bd.total_hurda_mm,
            bd.total_scrap_mm,
            len(sol.patterns),
            var,
        )

    @staticmethod
    def _solver_wall_time_seconds(solver: object) -> float:
        wall = getattr(solver, "WallTime", None)
        return float(wall()) if callable(wall) else 0.0

    @staticmethod
    def _cp_sat_num_search_workers() -> int:
        """Parallel CP-SAT search workers.

        When ``OPTIMIZATION_NUM_SEARCH_WORKERS`` is unset, empty, or ``0``, use up to
        all logical CPUs (capped at 32). Otherwise use the configured positive count,
        clamped to ``[1, min(requested, cpu_count, 32)]``.

        Previously the default was ``1`` and the ceiling was ``8``, so machines with
        many cores barely benefited from parallelism.
        """
        cpu_cap = os.cpu_count() or 1
        ceiling = min(32, cpu_cap)
        raw = os.getenv("OPTIMIZATION_NUM_SEARCH_WORKERS")
        if raw is None or raw.strip() == "":
            return max(1, min(cpu_cap, 32))
        try:
            requested = int(raw.strip(), 10)
        except ValueError:
            return max(1, ceiling)
        if requested <= 0:
            return max(1, min(cpu_cap, 32))
        return max(1, min(requested, ceiling))

    def _configure_cp_solver(self, config: OptimizationConfig) -> cp_model.CpSolver:
        solver = cp_model.CpSolver()
        solver.parameters.num_search_workers = self._cp_sat_num_search_workers()
        solver.parameters.log_search_progress = False
        solver.parameters.random_seed = int(config.random_seed)
        return solver

    def _telemetry_merge_snap(
        self,
        base: ProfileGroupSolveTelemetry | None,
        snap: dict[str, int | bool | None] | None,
    ) -> ProfileGroupSolveTelemetry | None:
        if base is None or not snap:
            return base
        return base.model_copy(update=dict(snap))

    def _max_patterns_limit(self, n_classes: int, n_stocks: int) -> int:
        _ = n_classes, n_stocks
        return max(int(os.getenv("OPTIMIZATION_MAX_PATTERNS", "100000")), 5000)

    def _linear_production_objective_weights(
        self,
        *,
        bar_upper_bound: int,
        max_usable: int,
        min_reusable_mm: int,
    ) -> tuple[int, int, int]:
        """Dominating weights so lex order follows (bars, hurda, scrap_total)."""
        scrap_upper = bar_upper_bound * max_usable
        w_scrap = 1
        w_hurda = scrap_upper + 1
        hurda_bound = bar_upper_bound * max(int(min_reusable_mm), 1)
        w_bar = w_hurda * (hurda_bound + scrap_upper + 1) + 1
        return w_bar, w_hurda, w_scrap

    def _bar_slot_lex_weights(
        self,
        *,
        bar_upper_bound: int,
        max_usable: int,
        min_reusable_mm: int,
        n_stock_lengths: int,
    ) -> tuple[int, int, int, int]:
        """Dominating weights: (bars, scrap_total, hurda, nominal_variety_used)."""
        scrap_upper = bar_upper_bound * max_usable
        hurda_bound = bar_upper_bound * max(int(min_reusable_mm), 1)
        variety_bound = max(n_stock_lengths, 1)

        w_var = 1
        w_hurda = variety_bound * w_var + 1
        w_scrap = hurda_bound * w_hurda + variety_bound + 1
        w_bar = w_scrap * (scrap_upper + hurda_bound + variety_bound + 1) + 1

        return w_bar, w_hurda, w_var, w_scrap

    def _pack_from_column_usage(
        self,
        patterns: list[dict],
        piece_classes: list[_PieceClass],
        usage_values: Sequence[int],
    ) -> list[UsedBarPack]:
        out: list[UsedBarPack] = []
        for p_idx, use_count in enumerate(usage_values):
            if use_count <= 0:
                continue
            pat = patterns[p_idx]
            breakdown = [
                (i, pat["counts"][i])
                for i in range(len(piece_classes))
                if pat["counts"][i] > 0
            ]
            for _ in range(use_count):
                out.append(
                    (
                        pat["stock_len"],
                        pat["usable"],
                        pat["role"],
                        breakdown,
                        pat["scrap"],
                    )
                )
        return out

    def _run_column_gen_phase1(
        self,
        *,
        patterns: list[dict],
        piece_classes: list[_PieceClass],
        bar_upper_bound: int,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        config: OptimizationConfig,
        time_sec: float,
    ) -> tuple[
        int,
        float,
        list[int] | None,
        int | None,
        int | None,
        int | None,
    ]:
        model = cp_model.CpModel()
        max_usage_per_pattern = sum(cls.quantity for cls in piece_classes)
        usage: list[cp_model.IntVar] = []
        for p_idx in range(len(patterns)):
            usage.append(model.NewIntVar(0, max_usage_per_pattern, f"u_{p_idx}"))

        for i, cls in enumerate(piece_classes):
            model.Add(
                sum(
                    patterns[p_idx]["counts"][i] * usage[p_idx]
                    for p_idx in range(len(patterns))
                    if patterns[p_idx]["counts"][i] > 0
                )
                == cls.quantity
            )

        bar_count = model.NewIntVar(0, bar_upper_bound, "bar_count")
        model.Add(bar_count == sum(usage))

        max_usable = max(usable for _s, usable, _r in usable_lengths_by_choice)
        scrap_upper = bar_upper_bound * max_usable
        scrap_total = model.NewIntVar(0, scrap_upper, "scrap_total")
        model.Add(
            scrap_total
            == sum(patterns[p_idx]["scrap"] * usage[p_idx] for p_idx in range(len(patterns)))
        )

        hurda_terms: list[cp_model.LinearExpr] = []
        for p_idx, pat in enumerate(patterns):
            coef = (
                pat["scrap"]
                if pat["scrap"] < config.min_reusable_scrap_mm
                else 0
            )
            if coef:
                hurda_terms.append(usage[p_idx] * coef)
        hurda_total = model.NewIntVar(
            0,
            bar_upper_bound * max(config.min_reusable_scrap_mm, 1),
            "hurda_total",
        )
        if hurda_terms:
            model.Add(hurda_total == sum(hurda_terms))
        else:
            model.Add(hurda_total == 0)

        w_bar, w_hurda, w_scrap = self._linear_production_objective_weights(
            bar_upper_bound=bar_upper_bound,
            max_usable=max_usable,
            min_reusable_mm=config.min_reusable_scrap_mm,
        )
        model.Minimize(w_bar * bar_count + w_hurda * hurda_total + w_scrap * scrap_total)

        solver = self._configure_cp_solver(config)
        solver.parameters.max_time_in_seconds = float(time_sec)
        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return status, self._solver_wall_time_seconds(solver), None, None, None, None
        uvals = [solver.Value(u) for u in usage]
        return (
            status,
            self._solver_wall_time_seconds(solver),
            uvals,
            solver.Value(bar_count),
            solver.Value(hurda_total),
            solver.Value(scrap_total),
        )

    def _run_column_gen_phase1_mip(
        self,
        *,
        patterns: list[dict],
        piece_classes: list[_PieceClass],
        bar_upper_bound: int,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        config: OptimizationConfig,
        time_sec: float,
    ) -> tuple[
        int,
        float,
        list[int] | None,
        int | None,
        int | None,
        int | None,
    ]:
        started_at = time.monotonic()
        solver = pywraplp.Solver.CreateSolver("SCIP")
        if solver is None:
            solver = pywraplp.Solver.CreateSolver("CBC_MIXED_INTEGER_PROGRAMMING")
        if solver is None:
            return cp_model.UNKNOWN, 0.0, None, None, None, None

        solver.SetTimeLimit(max(1, int(float(time_sec) * 1000)))

        max_usage_per_pattern = sum(cls.quantity for cls in piece_classes)
        usage = [
            solver.IntVar(0, max_usage_per_pattern, f"mip_u_{p_idx}")
            for p_idx in range(len(patterns))
        ]

        for i, cls in enumerate(piece_classes):
            solver.Add(
                sum(
                    patterns[p_idx]["counts"][i] * usage[p_idx]
                    for p_idx in range(len(patterns))
                    if patterns[p_idx]["counts"][i] > 0
                )
                == cls.quantity
            )

        max_usable = max(usable for _s, usable, _r in usable_lengths_by_choice)
        bar_count_expr = sum(usage)
        scrap_expr = sum(
            patterns[p_idx]["scrap"] * usage[p_idx] for p_idx in range(len(patterns))
        )
        hurda_expr = sum(
            (
                patterns[p_idx]["scrap"]
                if patterns[p_idx]["scrap"] < config.min_reusable_scrap_mm
                else 0
            )
            * usage[p_idx]
            for p_idx in range(len(patterns))
        )

        w_bar, w_hurda, w_scrap = self._linear_production_objective_weights(
            bar_upper_bound=bar_upper_bound,
            max_usable=max_usable,
            min_reusable_mm=config.min_reusable_scrap_mm,
        )
        solver.Minimize(
            w_bar * bar_count_expr + w_hurda * hurda_expr + w_scrap * scrap_expr
        )

        status = solver.Solve()
        wall = time.monotonic() - started_at
        if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
            return cp_model.UNKNOWN, wall, None, None, None, None

        uvals = [max(0, int(round(var.solution_value()))) for var in usage]

        for i, cls in enumerate(piece_classes):
            fulfilled = sum(
                patterns[p_idx]["counts"][i] * uvals[p_idx]
                for p_idx in range(len(patterns))
                if patterns[p_idx]["counts"][i] > 0
            )
            if fulfilled != cls.quantity:
                return cp_model.UNKNOWN, wall, None, None, None, None

        bar_count = sum(uvals)
        hurda_total = sum(
            (
                patterns[p_idx]["scrap"]
                if patterns[p_idx]["scrap"] < config.min_reusable_scrap_mm
                else 0
            )
            * uvals[p_idx]
            for p_idx in range(len(patterns))
        )
        scrap_total = sum(
            patterns[p_idx]["scrap"] * uvals[p_idx] for p_idx in range(len(patterns))
        )
        mapped_status = (
            cp_model.OPTIMAL if status == pywraplp.Solver.OPTIMAL else cp_model.FEASIBLE
        )
        return mapped_status, wall, uvals, bar_count, hurda_total, scrap_total

    def _run_column_gen_phase2(
        self,
        *,
        patterns: list[dict],
        piece_classes: list[_PieceClass],
        bar_upper_bound: int,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        config: OptimizationConfig,
        time_sec: float,
        best_bars: int,
        best_hurda: int,
        pattern_cap: int | None,
        best_scrap: int | None = None,
        usage_hint: list[int] | None = None,
    ) -> tuple[int, float, list[int] | None]:
        max_usable = max(usable for _s, usable, _r in usable_lengths_by_choice)
        scrap_upper = bar_upper_bound * max_usable
        max_usage_per_pattern = sum(cls.quantity for cls in piece_classes)
        model = cp_model.CpModel()
        usage = [
            model.NewIntVar(0, max_usage_per_pattern, f"u2_{p}")
            for p in range(len(patterns))
        ]
        pat_on = [model.NewBoolVar(f"pon_{p}") for p in range(len(patterns))]
        for p in range(len(patterns)):
            model.Add(usage[p] <= max_usage_per_pattern * pat_on[p])
            model.Add(usage[p] >= pat_on[p])
            if usage_hint is not None:
                model.AddHint(usage[p], usage_hint[p])
                model.AddHint(pat_on[p], 1 if usage_hint[p] > 0 else 0)

        for i, cls in enumerate(piece_classes):
            model.Add(
                sum(
                    patterns[p_idx]["counts"][i] * usage[p_idx]
                    for p_idx in range(len(patterns))
                    if patterns[p_idx]["counts"][i] > 0
                )
                == cls.quantity
            )

        bar_count = model.NewIntVar(0, bar_upper_bound, "bar_count2")
        model.Add(bar_count == sum(usage))
        # Phase-2 is a template-readability refinement for the phase-1 physical
        # bar count. Keep the stock count fixed so CP-SAT does not spend time
        # proving unrelated lower-bar alternatives while the user is waiting for
        # stable production patterns.
        bar_ceiling = min(bar_upper_bound, max(int(best_bars), 0))
        model.Add(bar_count == bar_ceiling)

        scrap_total = model.NewIntVar(0, scrap_upper, "scrap_total2")
        model.Add(
            scrap_total
            == sum(patterns[p_idx]["scrap"] * usage[p_idx] for p_idx in range(len(patterns)))
        )
        if best_scrap is not None:
            model.Add(
                scrap_total
                <= max(0, int(best_scrap))
                + max(0, int(config.pattern_quality_tolerance_mm))
            )
        if usage_hint is not None:
            best_scrap_from_hint = sum(
                patterns[p_idx]["scrap"] * usage_hint[p_idx]
                for p_idx in range(len(patterns))
            )
            model.Add(
                scrap_total
                <= max(0, int(best_scrap_from_hint))
                + max(0, int(config.pattern_quality_tolerance_mm))
            )

        hurda_terms: list[cp_model.LinearExpr] = []
        for p_idx, pat in enumerate(patterns):
            coef = (
                pat["scrap"]
                if pat["scrap"] < config.min_reusable_scrap_mm
                else 0
            )
            if coef:
                hurda_terms.append(usage[p_idx] * coef)
        hurda_total = model.NewIntVar(
            0,
            bar_upper_bound * max(config.min_reusable_scrap_mm, 1),
            "hurda_total2",
        )
        if hurda_terms:
            model.Add(hurda_total == sum(hurda_terms))
        else:
            model.Add(hurda_total == 0)

        min_piece_length = min(cls.length_mm for cls in piece_classes)
        fit_excess_terms: list[cp_model.LinearExpr] = []
        for p_idx, pat in enumerate(patterns):
            fit_excess = max(0, int(pat["scrap"]) - min_piece_length + 1)
            if fit_excess:
                fit_excess_terms.append(usage[p_idx] * fit_excess)
        fit_excess_total = model.NewIntVar(
            0,
            bar_upper_bound * max_usable,
            "fit_excess_total2",
        )
        if fit_excess_terms:
            model.Add(fit_excess_total == sum(fit_excess_terms))
        else:
            model.Add(fit_excess_total == 0)

        pattern_count = model.NewIntVar(0, len(patterns), "pattern_count2")
        model.Add(pattern_count == sum(pat_on))
        if pattern_cap is not None:
            model.Add(pattern_count <= pattern_cap)

        stock_groups: dict[int, list[int]] = {}
        for p_idx, pat in enumerate(patterns):
            stock_groups.setdefault(pat["stock_idx"], []).append(p_idx)
        n_stocks = len(stock_groups)
        stock_pick: list[cp_model.BoolVar] = []
        for _sidx, p_idxs in sorted(stock_groups.items()):
            pick = model.NewBoolVar(f"stk_{_sidx}")
            stock_pick.append(pick)
            used_here = sum(usage[j] for j in p_idxs)
            model.Add(used_here >= 1).OnlyEnforceIf(pick)
            model.Add(used_here == 0).OnlyEnforceIf(pick.Not())

        variety = model.NewIntVar(0, n_stocks, "variety2")
        if stock_pick:
            model.Add(variety == sum(stock_pick))
        else:
            model.Add(variety == 0)

        if config.max_stock_length_variety_per_profile is not None:
            model.Add(variety <= config.max_stock_length_variety_per_profile)

        mixedness = sum(
            sum(1 for count in patterns[p_idx]["counts"] if count > 0) * usage[p_idx]
            for p_idx in range(len(patterns))
        )

        solver = self._configure_cp_solver(config)
        started_at = time.monotonic()
        deadline = started_at + max(float(time_sec), 0.001)
        final_status = cp_model.OPTIMAL
        best_usage: list[int] | None = None

        def remaining_time() -> float:
            return max(0.001, deadline - time.monotonic())

        def solve_stage(objective: cp_model.LinearExpr, name: str) -> int:
            nonlocal best_usage, final_status
            solver.parameters.max_time_in_seconds = remaining_time()
            model.Minimize(objective)
            stage_status = solver.Solve(model)
            if stage_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                self._logger.info(
                    "Column-gen phase-2 lexicographic stage %s returned %s.",
                    name,
                    solver.StatusName(stage_status),
                )
                return stage_status
            if stage_status != cp_model.OPTIMAL:
                final_status = cp_model.FEASIBLE
            best_usage = [solver.Value(u) for u in usage]
            return stage_status

        status = solve_stage(scrap_total, "min_total_scrap")
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return status, time.monotonic() - started_at, None
        model.Add(scrap_total == solver.Value(scrap_total))

        status = solve_stage(fit_excess_total, "min_piece_sized_leftover")
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return status, time.monotonic() - started_at, None
        model.Add(fit_excess_total == solver.Value(fit_excess_total))

        status = solve_stage(hurda_total, "min_hurda")
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return final_status, time.monotonic() - started_at, best_usage
        model.Add(hurda_total == solver.Value(hurda_total))

        status = solve_stage(pattern_count, "min_patterns")
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return final_status, time.monotonic() - started_at, best_usage
        model.Add(pattern_count == solver.Value(pattern_count))

        status = solve_stage(variety, "min_stock_variety")
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return final_status, time.monotonic() - started_at, best_usage
        model.Add(variety == solver.Value(variety))

        status = solve_stage(-mixedness, "max_mixedness")
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return final_status, time.monotonic() - started_at, best_usage

        if best_usage is None:
            return cp_model.UNKNOWN, time.monotonic() - started_at, None
        return (
            final_status,
            time.monotonic() - started_at,
            best_usage,
        )

    def _consolidate_packs_via_column_pool(
        self,
        *,
        used_bars: list[UsedBarPack],
        patterns: list[dict],
        piece_classes: list[_PieceClass],
        bar_upper_bound: int,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        config: OptimizationConfig,
        time_budget: float,
    ) -> tuple[list[UsedBarPack] | None, dict[str, int | bool | None]]:
        if not config.pattern_consolidation_enabled or time_budget <= 0:
            return None, {}
        base = self._used_bars_score(
            used_bars, piece_classes=piece_classes, config=config
        )
        meta: dict[str, int | bool | None] = {
            "pattern_cap_requested": config.max_distinct_patterns_per_profile,
            "pattern_cap_relaxed_to": None,
        }

        st2, _w2, u2 = self._run_column_gen_phase2(
            patterns=patterns,
            piece_classes=piece_classes,
            bar_upper_bound=bar_upper_bound,
            usable_lengths_by_choice=usable_lengths_by_choice,
            config=config,
            time_sec=time_budget,
            best_bars=base[0],
            best_hurda=base[1],
            pattern_cap=None,
            best_scrap=base[2],
        )

        if st2 not in (cp_model.OPTIMAL, cp_model.FEASIBLE) or u2 is None:
            return None, meta

        candidate = self._pack_from_column_usage(patterns, piece_classes, u2)
        ct = self._used_bars_score(
            candidate, piece_classes=piece_classes, config=config
        )
        
        # Tuple is (bars, hurda, scrap, patterns, ...)
        if ct[0] > base[0]:
            return None, meta

        best_pack = candidate
        
        if best_pack is None:
            return None, meta
        meta["consolidation_selected"] = True
        return best_pack, meta

    # ── Column Generation Hybrid ─────────────────────────────────────────

    def _solve_group_column_gen(
        self,
        *,
        group: ProfileGroup,
        items: Sequence[DemandItem],
        config: OptimizationConfig,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        piece_classes: list[_PieceClass],
        policy: SafetyMarginPolicy,
        kerf: int,
        bar_upper_bound: int,
    ) -> _GroupSolution:
        patterns = self._generate_feasible_patterns(
            piece_classes, usable_lengths_by_choice, kerf, config
        )
        
        # Seed the pool with patterns from the heuristic to guarantee a baseline
        heur_sol = self._solve_group_with_heuristic(
            group=group, items=items, config=config,
            usable_lengths_by_choice=usable_lengths_by_choice,
            piece_classes=piece_classes, policy=policy, kerf=kerf,
            status_label="HEURISTIC_SEEDING", wall_time_sec=0.0
        )
        seen_sigs = {f"{p['stock_len']}:{p['role']}:{tuple(p['counts'])}" for p in patterns}
        max_pieces_per_bar = self._max_pieces_per_stock_bar(config)
        for pat in heur_sol.patterns:
            # Convert OptimizationPattern back to internal dict format
            counts = [0] * len(piece_classes)
            for pp in pat.pieces:
                # Find the class index for this piece length
                for i, pc in enumerate(piece_classes):
                    if pc.length_mm == pp.length_mm:
                        counts[i] = pp.count
                        break
            if max_pieces_per_bar is not None and sum(counts) > max_pieces_per_bar:
                continue
            
            sig = f"{pat.stock_bar_length_mm}:{pat.stock_bar_role}:{tuple(counts)}"
            if sig not in seen_sigs:
                seen_sigs.add(sig)
                # Re-calculate scrap to ensure no negative values due to rounding or policy mismatches
                n_pieces = sum(counts)
                consumption = sum(c * pc.length_mm for c, pc in zip(counts, piece_classes))
                consumption += max(0, n_pieces - 1) * kerf
                
                patterns.append({
                    "stock_len": pat.stock_bar_length_mm,
                    "usable": pat.stock_bar_length_mm - policy.total_trim_mm,
                    "role": pat.stock_bar_role,
                    "stock_idx": next((i for i, (sl, _u, _r) in enumerate(usable_lengths_by_choice) if sl == pat.stock_bar_length_mm), 0),
                    "counts": counts,
                    "scrap": (pat.stock_bar_length_mm - policy.total_trim_mm) - consumption,
                })

        if not patterns:
            return self._solve_group_with_heuristic(
                group=group,
                items=items,
                config=config,
                usable_lengths_by_choice=usable_lengths_by_choice,
                piece_classes=piece_classes,
                policy=policy,
                kerf=kerf,
                status_label="PATTERN_GEN_EMPTY",
                wall_time_sec=0.0,
            )

        t_total = float(config.solver_time_limit_sec)
        t_phase1 = max(5.0, min(8.0, t_total * 0.25))
        st1, wall1, u1, b1, h1, _s1 = self._run_column_gen_phase1_mip(
            patterns=patterns,
            piece_classes=piece_classes,
            bar_upper_bound=bar_upper_bound,
            usable_lengths_by_choice=usable_lengths_by_choice,
            config=config,
            time_sec=t_phase1,
        )

        if st1 not in (cp_model.OPTIMAL, cp_model.FEASIBLE) or u1 is None:
            cp_sat_time = max(2.0, t_total * 0.45)
            st1, wall1, u1, b1, h1, _s1 = self._run_column_gen_phase1(
                patterns=patterns,
                piece_classes=piece_classes,
                bar_upper_bound=bar_upper_bound,
                usable_lengths_by_choice=usable_lengths_by_choice,
                config=config,
                time_sec=cp_sat_time,
            )

        extra_snap: dict[str, int | bool | None] = {
            "pattern_cap_requested": config.max_distinct_patterns_per_profile,
            "pattern_cap_relaxed_to": config.max_distinct_patterns_per_profile,
            "consolidation_selected": False,
        }

        if st1 not in (cp_model.OPTIMAL, cp_model.FEASIBLE) or u1 is None:
            solver_ref = self._configure_cp_solver(config)
            self._logger.warning(
                "Column-gen phase-1 CP-SAT returned %s for %s; falling back to heuristic.",
                solver_ref.StatusName(st1),
                group.main_profile_code,
            )
            return self._solve_group_with_heuristic(
                group=group,
                items=items,
                config=config,
                usable_lengths_by_choice=usable_lengths_by_choice,
                piece_classes=piece_classes,
                policy=policy,
                kerf=kerf,
                status_label="PHASE1_FAIL",
                wall_time_sec=wall1,
            )

        usage_final = u1
        wall_total = wall1
        status_final = st1
        patterns_final = patterns

        if config.pattern_consolidation_enabled:
            t_phase2_budget = max(0.0, t_total - wall_total)
            if t_phase2_budget < 2.0:
                t_phase2_budget = 0.0
        else:
            t_phase2_budget = 0.0

        if t_phase2_budget > 0:
            phase2_patterns = patterns
            phase2_hint = u1
            max_pieces_per_bar = self._max_pieces_per_stock_bar(config)
            if max_pieces_per_bar is not None:
                full_patterns = [
                    p for p in patterns if sum(p["counts"]) == max_pieces_per_bar
                ]
                if full_patterns:
                    st_full, w_full, u_full = self._run_column_gen_phase2(
                        patterns=full_patterns,
                        piece_classes=piece_classes,
                        bar_upper_bound=bar_upper_bound,
                        usable_lengths_by_choice=usable_lengths_by_choice,
                        config=config,
                        time_sec=max(2.0, min(t_phase2_budget, t_phase2_budget * 0.75)),
                        best_bars=b1 if b1 is not None else bar_upper_bound,
                        best_hurda=h1 if h1 is not None else 0,
                        pattern_cap=config.max_distinct_patterns_per_profile,
                        best_scrap=_s1,
                        usage_hint=None,
                    )
                    wall_total += w_full
                    t_phase2_budget = max(0.0, t_phase2_budget - w_full)
                    if st_full in (cp_model.OPTIMAL, cp_model.FEASIBLE) and u_full is not None:
                        usage_final = u_full
                        status_final = st_full
                        patterns_final = full_patterns
                        extra_snap["consolidation_selected"] = True
                        extra_snap["phase2_full_bar_pool_selected"] = True
                        t_phase2_budget = 0.0
                    else:
                        extra_snap["phase2_full_bar_pool_selected"] = False

        if t_phase2_budget > 0:
            st2, w2, u2 = self._run_column_gen_phase2(
                patterns=phase2_patterns,
                piece_classes=piece_classes,
                bar_upper_bound=bar_upper_bound,
                usable_lengths_by_choice=usable_lengths_by_choice,
                config=config,
                time_sec=t_phase2_budget,
                best_bars=b1 if b1 is not None else bar_upper_bound,
                best_hurda=h1 if h1 is not None else 0,
                pattern_cap=config.max_distinct_patterns_per_profile,
                best_scrap=_s1,
                usage_hint=phase2_hint,
            )
            wall_total += w2
            
            if st2 in (cp_model.OPTIMAL, cp_model.FEASIBLE) and u2 is not None:
                usage_final = u2
                status_final = st2
                patterns_final = phase2_patterns
                extra_snap["consolidation_selected"] = tuple(u2) != tuple(u1)
            else:
                self._logger.info(
                    "Column-gen phase-2 infeasible/timeout for profile %s — using phase-1 plan.",
                    group.main_profile_code,
                )

        used_bars = self._pack_from_column_usage(patterns_final, piece_classes, usage_final)
        solver_ref = self._configure_cp_solver(config)
        return self._build_group_solution_from_used_bars(
            group=group,
            items=items,
            piece_classes=piece_classes,
            used_bars=used_bars,
            usable_lengths_by_choice=usable_lengths_by_choice,
            policy=policy,
            kerf=kerf,
            config=config,
            solver_status=status_final,
            solver_status_label=solver_ref.StatusName(status_final),
            solver_mode="cp_sat",
            wall_time_sec=wall_total,
            best_objective=None,
            best_bound=None,
            num_conflicts=None,
            num_branches=None,
            skip_consolidation_milp=True,
            engine_extra_snap=extra_snap,
        )

    def _generate_feasible_patterns(
        self,
        piece_classes: list[_PieceClass],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        kerf: int,
        config: OptimizationConfig,
    ) -> list[dict]:
        """Enumerate feasible 1D patterns with deterministic ordering (production-safe)."""
        patterns: list[dict] = []
        seen_signatures: set[str] = set()

        n_cls = len(piece_classes)
        n_stocks = len(usable_lengths_by_choice)
        max_patterns = self._max_patterns_limit(n_cls, n_stocks)
        max_pieces_per_bar = self._max_pieces_per_stock_bar(config)

        # 1. Guarantee "Backbone" patterns (single-class fills) for every class/stock combo.
        for i, cls in enumerate(piece_classes):
            for stock_idx, (stock_len, usable, role) in enumerate(usable_lengths_by_choice):
                max_n = 0
                max_candidate = cls.quantity
                if max_pieces_per_bar is not None:
                    max_candidate = min(max_candidate, max_pieces_per_bar)
                for n in range(1, max_candidate + 1):
                    need = n * cls.length_mm + max(0, n - 1) * kerf
                    if need <= usable:
                        max_n = n
                    else:
                        break
                if max_n > 0:
                    counts = [0] * len(piece_classes)
                    counts[i] = max_n
                    self._add_to_pool(patterns, seen_signatures, stock_len, role, stock_idx, counts, usable, kerf, piece_classes, max_pieces_per_bar)

        # 2. Deterministic mixed-pattern seeding. This guards production benchmark
        # families where balanced mixed templates must exist before stochastic
        # seeding or capped DFS traversal can influence the candidate pool.
        self._seed_deterministic_mixed_patterns(
            patterns=patterns,
            seen=seen_signatures,
            piece_classes=piece_classes,
            usable_lengths_by_choice=usable_lengths_by_choice,
            kerf=kerf,
            max_pieces_per_bar=max_pieces_per_bar,
        )

        # 2. Stochastic Greedy Seeding: Run FFD with different shuffles to find "dense" balanced patterns.
        # This is critical for finding the 4-pattern solutions that require specific mixes.
        import random
        rng = random.Random(config.random_seed)
        
        for _ in range(1000):
            indices = list(range(len(piece_classes)))
            rng.shuffle(indices)
            for stock_idx, (stock_len, usable, role) in enumerate(usable_lengths_by_choice):
                rem = usable
                counts = [0] * len(piece_classes)
                n_p = 0
                for i in indices:
                    cls = piece_classes[i]
                    # Each piece needs (length + kerf). 
                    # If it's the very first piece of the bar, we 'gain' one kerf back.
                    fit_limit = (rem + kerf) // (cls.length_mm + kerf) if n_p == 0 else rem // (cls.length_mm + kerf)
                    if max_pieces_per_bar is not None:
                        fit_limit = min(fit_limit, max_pieces_per_bar - n_p)
                    fit = min(cls.quantity, max(0, fit_limit))
                    
                    if fit > 0:
                        counts[i] = fit
                        consumption = fit * cls.length_mm + (fit if n_p > 0 else fit - 1) * kerf
                        rem -= consumption
                        n_p += fit
                if n_p > 0:
                    self._add_to_pool(patterns, seen_signatures, stock_len, role, stock_idx, counts, usable, kerf, piece_classes, max_pieces_per_bar)

        # 3. Targeted Multi-Class Seeding: Focus on combining small subsets (2-5 classes).
        # This emulates the 'balanced' layouts like the ones the user provided.
        if len(piece_classes) > 1:
            for _ in range(500):
                n_select = rng.randint(2, min(5, len(piece_classes)))
                indices = rng.sample(range(len(piece_classes)), n_select)
                for stock_idx, (stock_len, usable, role) in enumerate(usable_lengths_by_choice):
                    rem = usable
                    counts = [0] * len(piece_classes)
                    n_p = 0
                    for i in indices:
                        cls = piece_classes[i]
                        fit_limit = (rem + kerf) // (cls.length_mm + kerf) if n_p == 0 else rem // (cls.length_mm + kerf)
                        if max_pieces_per_bar is not None:
                            fit_limit = min(fit_limit, max_pieces_per_bar - n_p)
                        fit = rng.randint(0, min(cls.quantity, max(0, fit_limit)))
                        if fit > 0:
                            counts[i] = fit
                            consumption = fit * cls.length_mm + (fit if n_p > 0 else fit - 1) * kerf
                            rem -= consumption
                            n_p += fit
                    if n_p > 0:
                        self._add_to_pool(patterns, seen_signatures, stock_len, role, stock_idx, counts, usable, kerf, piece_classes, max_pieces_per_bar)

        # 4. Enumerate diverse patterns via DFS
        if n_cls > 5:
            for stock_idx, (stock_len, usable, role) in enumerate(usable_lengths_by_choice):
                if len(patterns) >= max_patterns:
                    break
                counts = [0] * len(piece_classes)
                self._enumerate_patterns(
                    piece_classes=piece_classes,
                    usable=usable,
                    kerf=kerf,
                    stock_len=stock_len,
                    stock_idx=stock_idx,
                    role=role,
                    depth=0,
                    counts=counts,
                    remaining=usable,
                    n_pieces=0,
                    patterns=patterns,
                    seen=seen_signatures,
                    max_patterns=max_patterns,
                    max_pieces_per_bar=max_pieces_per_bar,
                )

        self._ensure_class_pattern_coverage(
            patterns=patterns,
            seen=seen_signatures,
            piece_classes=piece_classes,
            usable_lengths_by_choice=usable_lengths_by_choice,
            kerf=kerf,
            max_pieces_per_bar=max_pieces_per_bar,
        )

        min_reusable = config.min_reusable_scrap_mm

        def sort_key(p: dict) -> tuple[int, int, int, int, int, int, int]:
            hurda_p = p["scrap"] if p["scrap"] < min_reusable else 0
            n_on = sum(p["counts"])
            cov = sum(
                p["counts"][i] * piece_classes[i].quantity
                for i in range(len(piece_classes))
            )
            role_pri = 0 if p["role"] == "primary" else 1
            return (
                hurda_p,
                p["scrap"],
                -n_on,
                -cov,
                role_pri,
                p["stock_len"],
                p["stock_idx"],
            )

        patterns.sort(key=sort_key)
        return patterns

    def _seed_deterministic_mixed_patterns(
        self,
        *,
        patterns: list[dict],
        seen: set[str],
        piece_classes: list[_PieceClass],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        kerf: int,
        max_pieces_per_bar: int | None,
    ) -> None:
        if len(piece_classes) < 2:
            return

        max_added = max(
            int(os.getenv("OPTIMIZATION_DETERMINISTIC_MIXED_PATTERN_LIMIT", "12000")),
            1000,
        )
        added = 0
        subset_groups = self._deterministic_mixed_seed_subsets(piece_classes)

        for subset in subset_groups:
            if added >= max_added:
                break
            for stock_idx, (stock_len, usable, role) in enumerate(usable_lengths_by_choice):
                if added >= max_added:
                    break
                before = len(patterns)
                counts = [0] * len(piece_classes)
                self._enumerate_mixed_subset_patterns(
                    subset=subset,
                    subset_depth=0,
                    piece_classes=piece_classes,
                    usable=usable,
                    kerf=kerf,
                    stock_len=stock_len,
                    stock_idx=stock_idx,
                    role=role,
                    counts=counts,
                    remaining=usable,
                    n_pieces=0,
                    patterns=patterns,
                    seen=seen,
                    max_total_patterns=before + max_added - added,
                    max_pieces_per_bar=max_pieces_per_bar,
                )
                added += max(0, len(patterns) - before)

    @staticmethod
    def _deterministic_mixed_seed_subsets(
        piece_classes: list[_PieceClass],
    ) -> list[tuple[int, ...]]:
        n_cls = len(piece_classes)
        if n_cls <= 5:
            return [tuple(range(n_cls))]

        subsets: list[tuple[int, ...]] = []
        seen: set[tuple[int, ...]] = set()

        def add(indices: Iterable[int]) -> None:
            subset = tuple(sorted(set(indices)))
            if len(subset) < 2 or subset in seen:
                return
            seen.add(subset)
            subsets.append(subset)

        for start in range(0, n_cls):
            add(range(start, min(start + 5, n_cls)))

        demand_ranked = sorted(
            range(n_cls),
            key=lambda idx: (
                -(piece_classes[idx].length_mm * piece_classes[idx].quantity),
                -piece_classes[idx].quantity,
                idx,
            ),
        )
        add(demand_ranked[:5])

        for size in range(2, min(4, n_cls) + 1):
            for combo in combinations(range(min(n_cls, 8)), size):
                add(combo)

        return subsets

    def _enumerate_mixed_subset_patterns(
        self,
        *,
        subset: tuple[int, ...],
        subset_depth: int,
        piece_classes: list[_PieceClass],
        usable: int,
        kerf: int,
        stock_len: int,
        stock_idx: int,
        role: StockBarRole,
        counts: list[int],
        remaining: int,
        n_pieces: int,
        patterns: list[dict],
        seen: set[str],
        max_total_patterns: int,
        max_pieces_per_bar: int | None,
    ) -> None:
        if len(patterns) >= max_total_patterns:
            return
        if max_pieces_per_bar is not None and n_pieces > max_pieces_per_bar:
            return

        if subset_depth == len(subset):
            active_class_count = sum(1 for count in counts if count > 0)
            if n_pieces > 0 and active_class_count >= 2:
                self._add_to_pool(
                    patterns,
                    seen,
                    stock_len,
                    role,
                    stock_idx,
                    counts,
                    usable,
                    kerf,
                    piece_classes,
                    max_pieces_per_bar,
                )
            return

        cls_idx = subset[subset_depth]
        cls = piece_classes[cls_idx]
        max_fit = min(cls.quantity, remaining // cls.length_mm if cls.length_mm > 0 else 0)
        if max_pieces_per_bar is not None:
            max_fit = min(max_fit, max(0, max_pieces_per_bar - n_pieces))

        for qty in range(max_fit, -1, -1):
            if qty == 0:
                new_remaining = remaining
            else:
                kerf_delta = (
                    max(0, n_pieces + qty - 1) * kerf
                    - max(0, n_pieces - 1) * kerf
                )
                consumption = qty * cls.length_mm + kerf_delta
                if consumption > remaining:
                    continue
                new_remaining = remaining - consumption

            counts[cls_idx] = qty
            self._enumerate_mixed_subset_patterns(
                subset=subset,
                subset_depth=subset_depth + 1,
                piece_classes=piece_classes,
                usable=usable,
                kerf=kerf,
                stock_len=stock_len,
                stock_idx=stock_idx,
                role=role,
                counts=counts,
                remaining=new_remaining,
                n_pieces=n_pieces + qty,
                patterns=patterns,
                seen=seen,
                max_total_patterns=max_total_patterns,
                max_pieces_per_bar=max_pieces_per_bar,
            )

        counts[cls_idx] = 0

    def _ensure_class_pattern_coverage(
        self,
        *,
        patterns: list[dict],
        seen: set[str],
        piece_classes: list[_PieceClass],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        kerf: int,
        max_pieces_per_bar: int | None,
    ) -> None:
        covered: set[int] = set()
        for p in patterns:
            for i, c in enumerate(p["counts"]):
                if c > 0:
                    covered.add(i)
        for i in range(len(piece_classes)):
            if i in covered:
                continue
            cls = piece_classes[i]
            for stock_idx, (stock_len, usable, role) in enumerate(
                usable_lengths_by_choice
            ):
                if cls.length_mm > usable:
                    continue
                max_n = 0
                max_candidate = cls.quantity
                if max_pieces_per_bar is not None:
                    max_candidate = min(max_candidate, max_pieces_per_bar)
                for n in range(1, max_candidate + 1):
                    need = n * cls.length_mm + max(0, n - 1) * kerf
                    if need <= usable:
                        max_n = n
                    else:
                        break
                if max_n <= 0:
                    continue
                counts = [0] * len(piece_classes)
                counts[i] = max_n
                remaining = usable - (max_n * cls.length_mm + max(0, max_n - 1) * kerf)
                sig = f"{stock_len}:{role}:{tuple(counts)}"
                if sig in seen:
                    covered.add(i)
                    break
                seen.add(sig)
                patterns.append(
                    {
                        "stock_len": stock_len,
                        "usable": usable,
                        "role": role,
                        "stock_idx": stock_idx,
                        "counts": list(counts),
                        "scrap": remaining,
                    }
                )
                covered.add(i)
                break

    def _add_to_pool(self, patterns: list[dict], seen: set[str], stock_len: int, role: StockBarRole, stock_idx: int, counts: list[int], usable: int, kerf: int, piece_classes: list[_PieceClass], max_pieces_per_bar: int | None = None) -> None:
        if max_pieces_per_bar is not None and sum(counts) > max_pieces_per_bar:
            return
        sig = f"{stock_len}:{role}:{tuple(counts)}"
        if sig not in seen:
            seen.add(sig)
            n_pieces = sum(counts)
            consumption = sum(c * pc.length_mm for c, pc in zip(counts, piece_classes))
            consumption += max(0, n_pieces - 1) * kerf
            patterns.append({
                "stock_len": stock_len,
                "usable": usable,
                "role": role,
                "stock_idx": stock_idx,
                "counts": list(counts),
                "scrap": usable - consumption,
            })

    def _enumerate_patterns(
        self,
        *,
        piece_classes: list[_PieceClass],
        usable: int,
        kerf: int,
        stock_len: int,
        stock_idx: int,
        role: StockBarRole,
        depth: int,
        counts: list[int],
        remaining: int,
        n_pieces: int,
        patterns: list[dict],
        seen: set[str],
        max_patterns: int,
        max_pieces_per_bar: int | None,
    ) -> None:
        n = len(piece_classes)
        if depth == n:
            if n_pieces > 0:
                sig = f"{stock_len}:{role}:{tuple(counts)}"
                if sig not in seen:
                    seen.add(sig)
                    patterns.append(
                        {
                            "stock_len": stock_len,
                            "usable": usable,
                            "role": role,
                            "stock_idx": stock_idx,
                            "counts": list(counts),
                            "scrap": remaining,
                        }
                    )
            return

        if len(patterns) >= max_patterns:
            return

        cls = piece_classes[depth]
        piece_len = cls.length_mm
        max_fit = min(
            cls.quantity,
            remaining // piece_len if piece_len > 0 else 0,
        )
        if max_pieces_per_bar is not None:
            max_fit = min(max_fit, max(0, max_pieces_per_bar - n_pieces))

        for qty in range(max_fit, -1, -1):
            if qty == 0:
                new_remaining = remaining
            else:
                kerf_delta = (
                    max(0, n_pieces + qty - 1) * kerf - max(0, n_pieces - 1) * kerf
                )
                consumption = qty * piece_len + kerf_delta
                if consumption > remaining:
                    continue
                new_remaining = remaining - consumption

            counts[depth] = qty
            self._enumerate_patterns(
                piece_classes=piece_classes,
                usable=usable,
                kerf=kerf,
                stock_len=stock_len,
                stock_idx=stock_idx,
                role=role,
                depth=depth + 1,
                counts=counts,
                remaining=new_remaining,
                n_pieces=n_pieces + qty,
                patterns=patterns,
                seen=seen,
                max_patterns=max_patterns,
                max_pieces_per_bar=max_pieces_per_bar,
            )
        counts[depth] = 0
    # ── Legacy Bar-Slot Model ────────────────────────────────────────────

    def _solve_group_bar_slot(
        self,
        *,
        group: ProfileGroup,
        items: Sequence[DemandItem],
        config: OptimizationConfig,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        piece_classes: list[_PieceClass],
        policy: SafetyMarginPolicy,
        kerf: int,
        bar_upper_bound: int,
    ) -> _GroupSolution:
        max_usable = max(usable for _stock, usable, _role in usable_lengths_by_choice)

        model = cp_model.CpModel()

        bar_used: list[cp_model.IntVar] = []
        bar_choice: list[list[cp_model.IntVar]] = []
        chosen_usable: list[cp_model.IntVar] = []
        scrap: list[cp_model.IntVar] = []
        hurda_scr: list[cp_model.IntVar] = []
        count: list[list[cp_model.IntVar]] = []
        bar_has_pieces: list[cp_model.IntVar] = []

        usable_choice_values = [usable for _stock, usable, _role in usable_lengths_by_choice]

        for b in range(bar_upper_bound):
            used = model.NewBoolVar(f"used_{b}")
            bar_used.append(used)

            choices = []
            for c, (_stock_len, _usable, _role) in enumerate(usable_lengths_by_choice):
                choices.append(model.NewBoolVar(f"choice_{b}_{c}"))
            bar_choice.append(choices)
            model.Add(sum(choices) == used)

            usable_var = model.NewIntVar(0, max_usable, f"usable_{b}")
            model.Add(
                usable_var
                == sum(
                    choice * value
                    for choice, value in zip(choices, usable_choice_values)
                )
            )
            chosen_usable.append(usable_var)

            row_counts: list[cp_model.IntVar] = []
            for i, cls in enumerate(piece_classes):
                cnt = model.NewIntVar(0, cls.quantity, f"cnt_{b}_{i}")
                row_counts.append(cnt)
            count.append(row_counts)

            total_pieces_var = model.NewIntVar(
                0, sum(cls.quantity for cls in piece_classes), f"npieces_{b}"
            )
            model.Add(total_pieces_var == sum(row_counts))
            max_pieces_per_bar = self._max_pieces_per_stock_bar(config)
            if max_pieces_per_bar is not None:
                model.Add(total_pieces_var <= max_pieces_per_bar * used)

            has_pieces = model.NewBoolVar(f"has_pieces_{b}")
            model.Add(total_pieces_var >= 1).OnlyEnforceIf(has_pieces)
            model.Add(total_pieces_var == 0).OnlyEnforceIf(has_pieces.Not())
            bar_has_pieces.append(has_pieces)

            model.AddImplication(has_pieces, used)

            kerf_savings = model.NewIntVar(0, kerf, f"kerf_savings_{b}")
            model.Add(kerf_savings == kerf * has_pieces)

            scrap_var = model.NewIntVar(0, max_usable, f"scrap_{b}")
            model.Add(
                sum(
                    cnt * (cls.length_mm + kerf)
                    for cnt, cls in zip(row_counts, piece_classes)
                )
                - kerf_savings
                + scrap_var
                == usable_var
            )
            scrap.append(scrap_var)

            hurda_piece = model.NewIntVar(0, max_usable, f"hscrap_{b}")
            reuse_piece = model.NewIntVar(0, max_usable, f"rscrap_{b}")
            min_mr = max(0, int(config.min_reusable_scrap_mm))
            if min_mr <= 0:
                model.Add(hurda_piece == 0)
                model.Add(reuse_piece == scrap_var)
            else:
                is_reusable = model.NewBoolVar(f"scr_reuse_{b}")
                model.Add(hurda_piece + reuse_piece == scrap_var)
                model.Add(scrap_var >= min_mr).OnlyEnforceIf(is_reusable)
                model.Add(scrap_var <= min_mr - 1).OnlyEnforceIf(is_reusable.Not())
                model.Add(reuse_piece == scrap_var).OnlyEnforceIf(is_reusable)
                model.Add(reuse_piece == 0).OnlyEnforceIf(is_reusable.Not())
                model.Add(hurda_piece == 0).OnlyEnforceIf(is_reusable)
                model.Add(hurda_piece == scrap_var).OnlyEnforceIf(is_reusable.Not())
            hurda_scr.append(hurda_piece)

            model.Add(usable_var <= max_usable * used)

        for i, cls in enumerate(piece_classes):
            model.Add(sum(count[b][i] for b in range(bar_upper_bound)) == cls.quantity)

        for b in range(bar_upper_bound - 1):
            model.Add(bar_used[b] >= bar_used[b + 1])

        bar_count_var = model.NewIntVar(0, bar_upper_bound, "bar_count")
        model.Add(bar_count_var == sum(bar_used))

        n_stocks_in = len(usable_lengths_by_choice)
        nominal_kind_used = [
            model.NewBoolVar(f"nom_stock_used_{idx}") for idx in range(n_stocks_in)
        ]
        variety_count_var = model.NewIntVar(
            0, max(n_stocks_in, 1), "nominal_variety_bar_slot"
        )

        if n_stocks_in == 0:
            model.Add(variety_count_var == 0)
        else:
            for kind_idx in range(n_stocks_in):
                uses_kind = sum(
                    bar_choice[bar_ix][kind_idx] for bar_ix in range(bar_upper_bound)
                )
                model.Add(uses_kind >= 1).OnlyEnforceIf(nominal_kind_used[kind_idx])
                model.Add(uses_kind == 0).OnlyEnforceIf(nominal_kind_used[kind_idx].Not())
            model.Add(variety_count_var == sum(nominal_kind_used))

            if config.max_stock_length_variety_per_profile is not None:
                model.Add(
                    variety_count_var
                    <= int(config.max_stock_length_variety_per_profile)
                )

        scrap_total_upper = max_usable * bar_upper_bound

        hurda_total_var = model.NewIntVar(0, scrap_total_upper, "hurda_total_bar")
        model.Add(hurda_total_var == sum(hurda_scr))

        scrap_total_var = model.NewIntVar(0, scrap_total_upper, "scrap_total")
        model.Add(scrap_total_var == sum(scrap))

        w_bar, w_hurda, w_var, w_scrap = self._bar_slot_lex_weights(
            bar_upper_bound=bar_upper_bound,
            max_usable=max_usable,
            min_reusable_mm=config.min_reusable_scrap_mm,
            n_stock_lengths=n_stocks_in,
        )
        model.Minimize(
            w_bar * bar_count_var
            + w_hurda * hurda_total_var
            + w_var * variety_count_var
            + w_scrap * scrap_total_var
        )

        solver = self._configure_cp_solver(config)
        solver.parameters.max_time_in_seconds = float(config.solver_time_limit_sec)

        status = solver.Solve(model)
        status_label = solver.StatusName(status)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if status in (cp_model.UNKNOWN, cp_model.INFEASIBLE):
                return self._solve_group_with_heuristic(
                    group=group, items=items, config=config,
                    usable_lengths_by_choice=usable_lengths_by_choice,
                    piece_classes=piece_classes, policy=policy, kerf=kerf,
                    status_label=status_label,
                    wall_time_sec=solver.WallTime() if status != cp_model.UNKNOWN else float(config.solver_time_limit_sec),
                )
            raise InfeasibleGroupError(
                f"Solver returned non-feasible status {status_label} for profile "
                f"{group.main_profile_code} (color {ColorClass(group.material_color_class).value})."
            )

        return self._extract_solution(
            group=group, items=items, piece_classes=piece_classes,
            usable_lengths_by_choice=usable_lengths_by_choice,
            policy=policy, kerf=kerf, config=config,
            solver=solver, status_label=status_label, status=status,
            bar_used=bar_used, bar_choice=bar_choice, count=count, scrap=scrap,
        )

    def _solve_group_with_heuristic(
        self,
        *,
        group: ProfileGroup,
        items: Sequence[DemandItem],
        config: OptimizationConfig,
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        piece_classes: list[_PieceClass],
        policy: SafetyMarginPolicy,
        kerf: int,
        status_label: str,
        wall_time_sec: float,
    ) -> _GroupSolution:
        """Enhanced deterministic heuristic: FFD + multi-stock selection + local search."""

        if status_label == "DUAL_PATH_COMPARISON":
            self._logger.info(
                "Dual-path: running deterministic heuristic for profile %s "
                "(benchmark against primary CP-SAT leg).",
                group.main_profile_code,
            )
        else:
            if status_label != "HEURISTIC_SEEDING":
                self._logger.warning(
                    "CP-SAT returned %s for profile %s; using enhanced heuristic.",
                    status_label,
                    group.main_profile_code,
                )

        # Pass 1: Pure First-Fit-Decreasing (FFD).
        # We fill bars greedily class-by-class. Since piece_classes are sorted
        # by length descending, this naturally packs the largest pieces first
        # and maximizes the reuse of identical patterns for each class.
        bars: list[dict[str, object]] = []
        max_pieces_per_bar = self._max_pieces_per_stock_bar(config)

        for cls_idx, cls in enumerate(piece_classes):
            qty = cls.quantity
            while qty > 0:
                qty -= 1
                first_idx: int | None = None
                for index, bar in enumerate(bars):
                    pieces = bar["pieces"]
                    if not isinstance(pieces, list):
                        continue
                    if (
                        max_pieces_per_bar is not None
                        and len(pieces) >= max_pieces_per_bar
                    ):
                        continue
                    remaining = int(bar["remaining"])
                    consumption = cls.length_mm + (kerf if pieces else 0)
                    if consumption <= remaining:
                        first_idx = index
                        break

                if first_idx is not None:
                    bar = bars[first_idx]
                    pieces = bar["pieces"]
                    if isinstance(pieces, list):
                        pieces.append(cls_idx)
                        consumption = cls.length_mm + (kerf if len(pieces) > 1 else 0)
                        bar["remaining"] -= consumption
                    continue

                # Open new bar — pick smallest stock length that fits
                viable_choices = [
                    (stock_len, usable, role)
                    for stock_len, usable, role in usable_lengths_by_choice
                    if cls.length_mm <= usable
                ]
                if not viable_choices:
                    raise InfeasibleGroupError(
                        f"Profile {group.main_profile_code}: piece "
                        f"{cls.length_mm} mm cannot fit any usable stock bar."
                    )

                stock_len, usable, role = min(
                    viable_choices,
                    key=lambda choice: (
                        choice[1] - cls.length_mm,
                        choice[0],
                        choice[2],
                    ),
                )
                bars.append(
                    {
                        "stock_len": stock_len,
                        "usable": usable,
                        "role": role,
                        "remaining": usable - cls.length_mm,
                        "pieces": [cls_idx],
                    }
                )

        # Pass 2+3 removed: _post_optimize_bars (FFD Repack) in
        # _build_group_solution_from_used_bars handles consolidation
        # and stock shrinking for ALL solver paths including heuristic.

        # Remove empty bars (shouldn't happen but defensive)
        bars = [
            bar
            for bar in bars
            if isinstance(bar.get("pieces"), list) and bar["pieces"]
        ]

        used_bars: list[UsedBarPack] = []
        for bar in bars:
            pieces = bar["pieces"]
            if not isinstance(pieces, list):
                continue
            breakdown_counter = Counter(int(piece) for piece in pieces)
            breakdown = sorted(breakdown_counter.items(), key=lambda kv: kv[0])
            used_bars.append(
                (
                    int(bar["stock_len"]),
                    int(bar["usable"]),
                    bar["role"],  # type: ignore[arg-type]
                    breakdown,
                    int(bar["remaining"]),
                )
            )

        return self._build_group_solution_from_used_bars(
            group=group,
            items=items,
            piece_classes=piece_classes,
            used_bars=used_bars,
            usable_lengths_by_choice=usable_lengths_by_choice,
            policy=policy,
            kerf=kerf,
            config=config,
            solver_status=cp_model.FEASIBLE,
            solver_status_label="FEASIBLE",
            solver_mode="heuristic_fallback",
            wall_time_sec=wall_time_sec,
            best_objective=None,
            best_bound=None,
            num_conflicts=None,
            num_branches=None,
        )

    # ── Post-Validation ───────────────────────────────────────────────────

    def _validate_group_solution(
        self,
        solution: _GroupSolution,
        piece_classes: list[_PieceClass],
        config: OptimizationConfig,
    ) -> None:
        """Validate demand, capacity equality, scraps, hurda split."""

        fulfilled: Counter[int] = Counter()
        for pattern in solution.patterns:
            for piece in pattern.pieces:
                fulfilled[piece.length_mm] += (
                    piece.count * pattern.usage_count
                )

        for cls in piece_classes:
            key = cls.length_mm
            actual = fulfilled.get(key, 0)
            if actual != cls.quantity:
                raise InfeasibleGroupError(
                    f"Demand mismatch for {solution.main_profile_code}: "
                    f"{key}mm demanded {cls.quantity}, got {actual}."
                )

        for pattern in solution.patterns:
            expected = pattern.stock_bar_length_mm
            actual = (
                pattern.productive_length_mm
                + pattern.kerf_total_mm
                + pattern.safety_trim_mm
                + pattern.scrap_mm
            )
            if actual != expected:
                raise SolverValidationError(
                    "Bar capacity mismatch for pattern "
                    f"{pattern.pattern_id} on {solution.main_profile_code}: "
                    f"expected nominal {expected} mm, decomposition sums to {actual} mm "
                    f"(productive={pattern.productive_length_mm}, kerf="
                    f"{pattern.kerf_total_mm}, trim={pattern.safety_trim_mm}, "
                    f"scrap={pattern.scrap_mm})."
                )
            ru, hu = self._split_scrap(pattern.scrap_mm, config)
            if pattern.reusable_scrap_mm != ru or pattern.hurda_mm != hu:
                raise SolverValidationError(
                    f"scrap split invalid for pattern {pattern.pattern_id}: "
                    f"scrapMm={pattern.scrap_mm}, expected reusable={ru} hurda={hu}, "
                    f"got reusable={pattern.reusable_scrap_mm} hurda={pattern.hurda_mm}."
                )

        bars_from_patterns = sum(p.usage_count for p in solution.patterns)
        if bars_from_patterns != solution.profile_breakdown.total_bars:
            raise SolverValidationError(
                "Pattern usage_counts do not sum to profile totalBars for "
                f"{solution.main_profile_code}."
            )

        if len({p.pattern_id for p in solution.patterns}) != len(solution.patterns):
            raise SolverValidationError(f"Duplicate pattern_id in {solution.main_profile_code}.")

        inferred_distinct = len(solution.patterns)
        bd_val = solution.profile_breakdown.distinct_pattern_count
        if bd_val is not None and bd_val != inferred_distinct:
            raise SolverValidationError(
                "distinctPatternCount inconsistent with patterns list "
                f"for {solution.main_profile_code}."
            )

        for pattern in solution.patterns:
            max_pieces_per_bar = self._max_pieces_per_stock_bar(config)
            if max_pieces_per_bar is not None:
                piece_count = sum(piece.count for piece in pattern.pieces)
                if piece_count > max_pieces_per_bar:
                    raise SolverValidationError(
                        f"Pattern {pattern.pattern_id} for {solution.main_profile_code} "
                        f"has {piece_count} pieces; maxPiecesPerStockBar is "
                        f"{max_pieces_per_bar}."
                    )
            if pattern.scrap_mm < 0:
                raise SolverValidationError(
                    f"Negative scrap {pattern.scrap_mm}mm in pattern "
                    f"{pattern.pattern_id} for {solution.main_profile_code}."
                )

    def _post_repack_improves(
        self,
        *,
        baseline: tuple[int, int, int, int, int],
        cand: tuple[int, int, int, int, int],
        config: OptimizationConfig,
    ) -> bool:
        # Tuple: (bars, hurda, scrap, pattern_count, stock_variety)
        if cand[0] > baseline[0]:
            return False
        if (
            not config.allow_post_repack_pattern_increase
            and cand[:3] == baseline[:3]
            and cand[3] > baseline[3]
        ):
            return False
        return cand < baseline

    def _ffd_repack_from_class_order(
        self,
        ordered_cls_ids: list[int],
        *,
        piece_classes: list[_PieceClass],
        kerf: int,
        shrink_choices: list[tuple[int, int, StockBarRole]],
        max_pieces_per_bar: int | None,
    ) -> list[UsedBarPack]:
        """Greedy placement (FFD order defined by caller) → stock shrinking → packs."""

        def cls_len(cid: int) -> int:
            return piece_classes[cid].length_mm

        def calc_rem(ids: list[int], usable: int) -> int:
            if not ids:
                return usable
            ln = sum(cls_len(cid) for cid in ids)
            kt = max(0, len(ids) - 1) * kerf
            return usable - ln - kt

        bars: list[dict] = []
        for cid in ordered_cls_ids:
            first_idx: int | None = None
            ln = cls_len(cid)
            for idx, bar in enumerate(bars):
                if (
                    max_pieces_per_bar is not None
                    and len(bar["pieces"]) >= max_pieces_per_bar
                ):
                    continue
                consumption = ln + (kerf if bar["pieces"] else 0)
                if consumption <= bar["remaining"]:
                    first_idx = idx
                    break
            if first_idx is not None:
                bars[first_idx]["pieces"].append(cid)
                consumption = ln + (kerf if len(bars[first_idx]["pieces"]) > 1 else 0)
                bars[first_idx]["remaining"] -= consumption
            else:
                chosen = shrink_choices[-1]
                for sl, us, rl in shrink_choices:
                    if ln <= us:
                        chosen = (sl, us, rl)
                        break
                bars.append(
                    {
                        "stock_len": chosen[0],
                        "usable": chosen[1],
                        "role": chosen[2],
                        "pieces": [cid],
                        "remaining": chosen[1] - ln,
                    }
                )
        for bar in bars:
            ids_on = bar["pieces"]
            ln_tot = sum(cls_len(cid) for cid in ids_on)
            kt = max(0, len(ids_on) - 1) * kerf
            mn = ln_tot + kt
            for sl, us, rl in shrink_choices:
                if us >= mn:
                    if us < bar["usable"]:
                        bar["stock_len"] = sl
                        bar["usable"] = us
                        bar["role"] = rl
                    break
            bar["remaining"] = calc_rem(ids_on, bar["usable"])

        out: list[UsedBarPack] = []
        for bar in bars:
            c = Counter(bar["pieces"])
            breakdown = sorted(c.items())
            out.append(
                (
                    bar["stock_len"],
                    bar["usable"],
                    bar["role"],
                    breakdown,
                    bar["remaining"],
                )
            )
        return out

    def _post_optimize_bars(
        self,
        used_bars: list[UsedBarPack],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        kerf: int,
        *,
        piece_classes: list[_PieceClass],
        config: OptimizationConfig,
    ) -> list[UsedBarPack]:
        """FFD repack on class indices; optional pattern-count guard."""

        def cls_len(cid: int) -> int:
            return piece_classes[cid].length_mm

        if not used_bars:
            return used_bars

        def flatten_classes(packs: list[UsedBarPack]) -> list[int]:
            ids: list[int] = []
            for _sl, _us, _role, breakdown, _sc in packs:
                for cid, ct in breakdown:
                    ids.extend([cid] * ct)
            return ids

        all_ids = flatten_classes(used_bars)
        if not all_ids:
            return used_bars

        shrink_choices = sorted(usable_lengths_by_choice, key=lambda c: c[1])

        base_tuple = self._used_bars_score(
            used_bars, piece_classes=piece_classes, config=config
        )
        ordered_desc = sorted(all_ids, key=lambda cid: (-cls_len(cid), cid))
        ordered_asc = sorted(all_ids, key=lambda cid: (cls_len(cid), cid))
        ffd_kw = dict(
            piece_classes=piece_classes,
            kerf=kerf,
            shrink_choices=shrink_choices,
            max_pieces_per_bar=self._max_pieces_per_stock_bar(config),
        )
        candidates: list[list[UsedBarPack]] = [
            used_bars,
            self._ffd_repack_from_class_order(ordered_desc, **ffd_kw),
            self._ffd_repack_from_class_order(ordered_asc, **ffd_kw),
        ]
        best = used_bars
        best_t = base_tuple
        for label, cand in zip(("baseline", "ffd_desc", "ffd_asc"), candidates):
            ct = self._used_bars_score(
                cand, piece_classes=piece_classes, config=config
            )
            ok = self._post_repack_improves(
                baseline=base_tuple, cand=ct, config=config
            )
            if not ok:
                self._logger.info(
                    "post_repack: reject %s tuple=%s vs baseline=%s allowPatInc=%s",
                    label,
                    ct,
                    base_tuple,
                    config.allow_post_repack_pattern_increase,
                )
                continue
            if ct < best_t:
                best = cand
                best_t = ct
        self._logger.info(
            "post_repack: baseline=%s selected=%s telemetry=production_tuple",
            base_tuple,
            best_t,
        )
        return best

    def _build_group_solution_from_used_bars(
        self,
        *,
        group: ProfileGroup,
        items: Sequence[DemandItem],
        piece_classes: list[_PieceClass],
        used_bars: list[UsedBarPack],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        policy: SafetyMarginPolicy,
        kerf: int,
        config: OptimizationConfig,
        solver_status: int,
        solver_status_label: str,
        solver_mode: str,
        wall_time_sec: float,
        best_objective: float | None,
        best_bound: float | None,
        num_conflicts: int | None,
        num_branches: int | None,
        skip_consolidation_milp: bool = False,
        engine_extra_snap: dict[str, int | bool | None] | None = None,
    ) -> _GroupSolution:
        snap: dict[str, int | bool | None] = dict(engine_extra_snap or {})
        base_t = self._used_bars_score(
            used_bars, piece_classes=piece_classes, config=config
        )
        snap.setdefault("baseline_bars", base_t[0])
        snap.setdefault("baseline_hurda_mm", base_t[1])
        snap.setdefault("baseline_scrap_mm", base_t[2])
        snap.setdefault("baseline_distinct_patterns", base_t[3])

        consolidated_packs = used_bars
        if (
            config.pattern_consolidation_enabled
            and not skip_consolidation_milp
        ):
            patterns_pool = self._generate_feasible_patterns(
                piece_classes,
                usable_lengths_by_choice,
                kerf,
                config,
            )
            t_budget = max(3.0, float(config.solver_time_limit_sec) * 0.18)
            maybe_new, cmeta = self._consolidate_packs_via_column_pool(
                used_bars=used_bars,
                patterns=patterns_pool,
                piece_classes=piece_classes,
                bar_upper_bound=max(base_t[0], 1),
                usable_lengths_by_choice=usable_lengths_by_choice,
                config=config,
                time_budget=t_budget,
            )
            for k, v in cmeta.items():
                if k not in snap or snap.get(k) is None:
                    snap[k] = v
            if maybe_new is not None:
                consolidated_packs = maybe_new

        cons_t = self._used_bars_score(
            consolidated_packs,
            piece_classes=piece_classes,
            config=config,
        )
        snap["consolidated_bars"] = cons_t[0]
        snap["consolidated_hurda_mm"] = cons_t[1]
        snap["consolidated_scrap_mm"] = cons_t[2]
        snap["consolidated_distinct_patterns"] = cons_t[3]
        snap["stock_length_variety_count"] = cons_t[4]

        consolidated_packs = self._post_optimize_bars(
            consolidated_packs,
            usable_lengths_by_choice,
            kerf,
            piece_classes=piece_classes,
            config=config,
        )

        patterns_by_signature: dict[str, OptimizationPattern] = {}
        pattern_assignment_log: list[
            tuple[str, list[tuple[int, int]], int, StockBarRole]
        ] = []

        for stock_len, _usable, role, breakdown, scrap_value in consolidated_packs:
            sig = self._pattern_signature(stock_len, role, breakdown)
            pattern_id = f"P-{group.main_profile_code}-{sig}"

            if pattern_id in patterns_by_signature:
                existing = patterns_by_signature[pattern_id]
                existing.usage_count += 1
                pattern_assignment_log.append((pattern_id, breakdown, stock_len, role))
                continue

            kerf_total = (
                max(0, sum(cnt for _ci, cnt in breakdown) - 1) * kerf if breakdown else 0
            )
            productive = sum(piece_classes[ci].length_mm * cnt for ci, cnt in breakdown)
            safety_trim = policy.total_trim_mm
            reusable_scrap, hurda = self._split_scrap(scrap_value, config)
            efficiency = (
                round((productive / stock_len) * 100, 2) if stock_len > 0 else 0.0
            )

            chunks: list[PatternPiece] = []
            for ci, cnt in sorted(
                breakdown, key=lambda kv: (-piece_classes[kv[0]].length_mm, kv[0])
            ):
                if cnt <= 0:
                    continue
                pcl = piece_classes[ci]
                for item_idx, take in self._allocate_class_count_to_demand_indices(
                    pcl, items, cnt
                ):
                    it = items[item_idx]
                    wos = [it.work_order_number] if it.work_order_number else []
                    chunks.append(
                        PatternPiece(
                            cutting_code=it.cutting_code,
                            cutting_name=it.cutting_name,
                            length_mm=pcl.length_mm,
                            count=take,
                            work_order_numbers=wos,
                        )
                    )
            pieces = self._merge_adjacent_pattern_pieces_for_display(chunks)

            patterns_by_signature[pattern_id] = OptimizationPattern(
                pattern_id=pattern_id,
                main_profile_id=group.main_profile_id,
                main_profile_code=group.main_profile_code,
                stock_bar_length_mm=stock_len,
                stock_bar_role=role,
                usage_count=1,
                pieces=pieces,
                kerf_total_mm=kerf_total,
                safety_trim_mm=safety_trim,
                productive_length_mm=productive,
                scrap_mm=scrap_value,
                reusable_scrap_mm=reusable_scrap,
                hurda_mm=hurda,
                efficiency_pct=efficiency,
            )
            pattern_assignment_log.append((pattern_id, breakdown, stock_len, role))

        patterns = list(patterns_by_signature.values())
        leftovers = self._build_leftovers(
            patterns=patterns,
            group=group,
            min_reusable=config.min_reusable_scrap_mm,
        )
        stock_requirements = self._build_stock_requirements(
            patterns=patterns,
            group=group,
        )
        bd = self._build_profile_breakdown(group, patterns)
        work_order_items = self._build_work_order_items(
            items=items,
            piece_classes=piece_classes,
            assignment_log=pattern_assignment_log,
        )

        return _GroupSolution(
            group_key=(group.main_profile_id, ColorClass(group.material_color_class)),
            main_profile_id=group.main_profile_id,
            main_profile_code=group.main_profile_code,
            main_profile_name=group.main_profile_name,
            color_class=ColorClass(group.material_color_class),
            patterns=patterns,
            profile_breakdown=bd,
            leftovers=leftovers,
            stock_requirements=stock_requirements,
            work_order_items=work_order_items,
            solver_status=solver_status,
            solver_status_label=solver_status_label,
            solver_mode=solver_mode,
            wall_time_sec=wall_time_sec,
            best_objective=best_objective,
            best_bound=best_bound,
            num_conflicts=num_conflicts,
            num_branches=num_branches,
            consolidation_snap=snap,
        )

    def _extract_solution(
        self,
        *,
        group: ProfileGroup,
        items: Sequence[DemandItem],
        piece_classes: list[_PieceClass],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        policy: SafetyMarginPolicy,
        kerf: int,
        config: OptimizationConfig,
        solver: cp_model.CpSolver,
        status_label: str,
        status: int,
        bar_used: list[cp_model.IntVar],
        bar_choice: list[list[cp_model.IntVar]],
        count: list[list[cp_model.IntVar]],
        scrap: list[cp_model.IntVar],
    ) -> _GroupSolution:
        used_bars: list[UsedBarPack] = []
        for b, used_var in enumerate(bar_used):
            if solver.Value(used_var) != 1:
                continue
            chosen_c = next(
                c for c in range(len(usable_lengths_by_choice))
                if solver.Value(bar_choice[b][c]) == 1
            )
            stock_len, usable, role = usable_lengths_by_choice[chosen_c]
            piece_breakdown: list[tuple[int, int]] = []
            for i, cls in enumerate(piece_classes):
                cnt = solver.Value(count[b][i])
                if cnt > 0:
                    piece_breakdown.append((i, cnt))
            used_bars.append(
                (stock_len, usable, role, piece_breakdown, solver.Value(scrap[b]))
            )

        return self._build_group_solution_from_used_bars(
            group=group, items=items, piece_classes=piece_classes,
            used_bars=used_bars, usable_lengths_by_choice=usable_lengths_by_choice,
            policy=policy, kerf=kerf, config=config,
            solver_status=status, solver_status_label=status_label,
            solver_mode="cp_sat", wall_time_sec=solver.WallTime(),
            best_objective=solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            best_bound=solver.BestObjectiveBound() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            num_conflicts=solver.NumConflicts(),
            num_branches=solver.NumBranches(),
        )

    def _build_profile_breakdown(
        self, group: ProfileGroup, patterns: list[OptimizationPattern]
    ) -> ProfileBreakdown:
        total_bars = sum(p.usage_count for p in patterns)
        productive = sum(p.productive_length_mm * p.usage_count for p in patterns)
        kerf = sum(p.kerf_total_mm * p.usage_count for p in patterns)
        safety = sum(p.safety_trim_mm * p.usage_count for p in patterns)
        scrap_total = sum(p.scrap_mm * p.usage_count for p in patterns)
        reusable = sum(p.reusable_scrap_mm * p.usage_count for p in patterns)
        hurda = sum(p.hurda_mm * p.usage_count for p in patterns)
        total_stock = sum(p.stock_bar_length_mm * p.usage_count for p in patterns)
        efficiency = round((productive / total_stock) * 100, 2) if total_stock else 0.0

        return ProfileBreakdown(
            main_profile_id=group.main_profile_id,
            main_profile_code=group.main_profile_code,
            main_profile_name=group.main_profile_name,
            material_color_class=group.material_color_class,
            total_bars=total_bars,
            total_productive_length_mm=productive,
            total_kerf_mm=kerf,
            total_safety_trim_mm=safety,
            total_scrap_mm=scrap_total,
            total_reusable_scrap_mm=reusable,
            total_hurda_mm=hurda,
            efficiency_pct=efficiency,
            pattern_ids=[p.pattern_id for p in patterns],
            distinct_pattern_count=len(patterns),
        )

    def _build_leftovers(
        self,
        *,
        patterns: list[OptimizationPattern],
        group: ProfileGroup,
        min_reusable: int,
    ) -> list[LeftoverPiece]:
        counter: Counter[int] = Counter()
        for pattern in patterns:
            if pattern.reusable_scrap_mm >= min_reusable and pattern.reusable_scrap_mm > 0:
                counter[pattern.reusable_scrap_mm] += pattern.usage_count
        return [
            LeftoverPiece(
                main_profile_id=group.main_profile_id,
                main_profile_code=group.main_profile_code,
                length_mm=length,
                count=count,
            )
            for length, count in sorted(counter.items(), key=lambda kv: -kv[0])
        ]

    def _build_stock_requirements(
        self,
        *,
        patterns: list[OptimizationPattern],
        group: ProfileGroup,
    ) -> list[StockRequirement]:
        counter: Counter[tuple[int, StockBarRole]] = Counter()
        for pattern in patterns:
            counter[(pattern.stock_bar_length_mm, pattern.stock_bar_role)] += (
                pattern.usage_count
            )
        return [
            StockRequirement(
                main_profile_id=group.main_profile_id,
                main_profile_code=group.main_profile_code,
                stock_bar_length_mm=length,
                stock_bar_role=role,
                required_count=count,
            )
            for (length, role), count in sorted(
                counter.items(), key=lambda kv: (kv[0][1], -kv[0][0])
            )
        ]

    def _build_work_order_items(
        self,
        *,
        items: Sequence[DemandItem],
        piece_classes: list[_PieceClass],
        assignment_log: list[tuple[str, list[tuple[int, int]], int, StockBarRole]],
    ) -> list[WorkOrderItem]:
        pattern_ids_by_item_idx: dict[int, set[str]] = {}
        
        # We must distribute the usage of each class back to its constituent items.
        class_item_pools = {
            ci: list(piece_classes[ci].item_indices)
            for ci in range(len(piece_classes))
        }

        # Track remaining quantity for each item during distribution
        item_remaining = {idx: items[idx].quantity for idx in range(len(items))}

        for pattern_id, breakdown, _stock_len, _role in assignment_log:
            for cls_idx, cnt in breakdown:
                pool = class_item_pools[cls_idx]
                needed = cnt
                while needed > 0 and pool:
                    item_idx = pool[0]
                    take = min(needed, item_remaining[item_idx])
                    if take > 0:
                        pattern_ids_by_item_idx.setdefault(item_idx, set()).add(pattern_id)
                        item_remaining[item_idx] -= take
                        needed -= take
                    if item_remaining[item_idx] <= 0:
                        pool.pop(0)

        rows: list[WorkOrderItem] = []
        seen: set[tuple[str | None, str, str, int]] = set()
        for idx, item in enumerate(items):
            key = (
                item.work_order_number,
                item.main_profile_code,
                item.cutting_code,
                item.piece_length_mm,
            )
            if key in seen:
                continue
            seen.add(key)
            ids = sorted(pattern_ids_by_item_idx.get(idx, set()))
            rows.append(
                WorkOrderItem(
                    work_order_number=item.work_order_number,
                    main_profile_code=item.main_profile_code,
                    cutting_code=item.cutting_code,
                    cutting_name=item.cutting_name,
                    piece_length_mm=item.piece_length_mm,
                    fulfilled_count=item.quantity,
                    pattern_ids=ids,
                )
            )
        return rows

    def _aggregate_metrics(
        self,
        *,
        payload: OptimizationRequestPayloadV2,
        patterns: list[OptimizationPattern],
        leftovers: list[LeftoverPiece],
        best_objective: float,
        best_bound: float | None,
    ) -> ResultMetrics:
        total_bars = sum(p.usage_count for p in patterns)
        productive = sum(p.productive_length_mm * p.usage_count for p in patterns)
        kerf = sum(p.kerf_total_mm * p.usage_count for p in patterns)
        safety = sum(p.safety_trim_mm * p.usage_count for p in patterns)
        scrap = sum(p.scrap_mm * p.usage_count for p in patterns)
        reusable = sum(p.reusable_scrap_mm * p.usage_count for p in patterns)
        hurda = sum(p.hurda_mm * p.usage_count for p in patterns)
        total_stock = sum(p.stock_bar_length_mm * p.usage_count for p in patterns)
        cut_pieces = sum(piece.count * p.usage_count for p in patterns for piece in p.pieces)
        work_orders = {
            item.work_order_number for item in payload.demand_items if item.work_order_number
        }
        efficiency = round((productive / total_stock) * 100, 2) if total_stock else 0.0
        gap_pct: float | None = None
        if best_bound is not None and best_objective > 0:
            gap_pct = round(
                max(0.0, (best_objective - best_bound)) / best_objective * 100, 4
            )
        reusable_count = sum(piece.count for piece in leftovers)
        reusable_length = sum(piece.length_mm * piece.count for piece in leftovers)

        material_utilization = (
            round((productive + kerf + safety) / total_stock * 100, 2)
            if total_stock else 0.0
        )
        actual_waste = (
            round(hurda / total_stock * 100, 2) if total_stock else 0.0
        )
        recoverable_material_pct = (
            round((productive + reusable) / total_stock * 100, 2)
            if total_stock
            else None
        )

        return ResultMetrics(
            efficiency_pct=efficiency,
            work_order_count=len(work_orders),
            total_stock_bars=total_bars,
            total_cut_pieces=cut_pieces,
            total_kerf_mm=kerf,
            total_safety_trim_mm=safety,
            total_scrap_mm=scrap,
            total_reusable_scrap_mm=reusable,
            total_hurda_mm=hurda,
            reusable_leftover_piece_count=reusable_count,
            reusable_leftover_length_mm=reusable_length,
            productive_length_mm=productive,
            waste_length_mm=kerf + safety + hurda,
            total_stock_length_mm=total_stock,
            solver_gap_pct=gap_pct,
            material_utilization_pct=material_utilization,
            actual_waste_pct=actual_waste,
            distinct_pattern_types_total=len(patterns),
            recoverable_material_pct=recoverable_material_pct,
        )

    def _representative_cutting_name_for_class(
        self, items: Sequence[DemandItem], cls: _PieceClass
    ) -> str:
        if cls.item_indices:
            return items[cls.item_indices[0]].cutting_name
        return f"{cls.length_mm} mm"

    def _work_orders_for_class(
        self, items: Sequence[DemandItem], cls: _PieceClass
    ) -> list[str]:
        seen: list[str] = []
        for idx in cls.item_indices:
            wo = items[idx].work_order_number
            if wo and wo not in seen:
                seen.append(wo)
        return seen

    def _collapse_piece_classes(self, items: Sequence[DemandItem]) -> list[_PieceClass]:
        """Groups demand items by length only. Fragmentation by cutting_code is handled post-solve."""
        classes: dict[int, _PieceClass] = {}
        for idx, item in enumerate(items):
            key = item.piece_length_mm
            cls = classes.setdefault(
                key,
                _PieceClass(
                    length_mm=item.piece_length_mm,
                    quantity=0,
                ),
            )
            cls.quantity += item.quantity
            cls.item_indices.append(idx)

        return sorted(
            classes.values(),
            key=lambda c: -c.length_mm,
        )

    def _bar_upper_bound(
        self,
        piece_classes: list[_PieceClass],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        kerf: int,
        config: OptimizationConfig,
    ) -> int:
        max_usable = max(usable for _stock, usable, _role in usable_lengths_by_choice)
        max_pieces_per_bar = self._max_pieces_per_stock_bar(config)
        lower_bound = math.ceil(
            sum(cls.quantity * (cls.length_mm + kerf) for cls in piece_classes)
            / max(max_usable + kerf, 1)
        )
        if max_pieces_per_bar is not None:
            lower_bound = max(
                lower_bound,
                math.ceil(
                    sum(cls.quantity for cls in piece_classes) / max_pieces_per_bar
                ),
            )
        return max(
            lower_bound,
            self._deterministic_packing_bar_count(
                piece_classes=piece_classes,
                usable_lengths_by_choice=usable_lengths_by_choice,
                kerf=kerf,
                config=config,
            ),
            len(piece_classes),
            1,
        )

    def _deterministic_packing_bar_count(
        self,
        *,
        piece_classes: list[_PieceClass],
        usable_lengths_by_choice: list[tuple[int, int, StockBarRole]],
        kerf: int,
        config: OptimizationConfig,
    ) -> int:
        bars: list[dict[str, int]] = []
        max_pieces_per_bar = self._max_pieces_per_stock_bar(config)

        for piece_class in piece_classes:
            for _ in range(piece_class.quantity):
                first_idx: int | None = None
                for index, bar in enumerate(bars):
                    if (
                        max_pieces_per_bar is not None
                        and bar["piece_count"] >= max_pieces_per_bar
                    ):
                        continue
                    consumption = piece_class.length_mm + (
                        kerf if bar["piece_count"] > 0 else 0
                    )
                    if consumption <= bar["remaining"]:
                        first_idx = index
                        break

                if first_idx is not None:
                    bar = bars[first_idx]
                    consumption = piece_class.length_mm + (kerf if bar["piece_count"] > 0 else 0)
                    bar["remaining"] -= consumption
                    bar["piece_count"] += 1
                    continue

                viable_choices = [
                    (stock_len, usable, role)
                    for stock_len, usable, role in usable_lengths_by_choice
                    if piece_class.length_mm <= usable
                ]
                if not viable_choices:
                    raise InfeasibleGroupError(
                        f"Profile piece {piece_class.length_mm} mm cannot fit any usable stock bar."
                    )

                _stock_len, usable, _role = min(
                    viable_choices,
                    key=lambda choice: (
                        choice[1] - piece_class.length_mm,
                        choice[0],
                        choice[2],
                    ),
                )
                bars.append(
                    {
                        "remaining": usable - piece_class.length_mm,
                        "piece_count": 1,
                    }
                )

        return len(bars)

    def _effective_stock_bars(
        self, group: ProfileGroup, config: OptimizationConfig
    ) -> Iterable[StockBar]:
        if config.allow_mixing_stock_bars:
            return group.stock_bars
        return [bar for bar in group.stock_bars if bar.role == "primary"] or group.stock_bars

    def _policy_lookup_token(self, color_class: ColorClass) -> str:
        return "ELS" if color_class == ColorClass.ANODIZED else "PAINTED"

    def _merge_status(self, current: str, new: str) -> str:
        rank = {
            "OPTIMAL": 0,
            "FEASIBLE": 1,
            "UNKNOWN": 2,
            "MODEL_INVALID": 3,
            "INFEASIBLE": 4,
        }
        return current if rank.get(current, 2) >= rank.get(new, 2) else new


class InfeasibleGroupError(RuntimeError):
    """Raised when a profile group cannot be solved (e.g. demand exceeds capacity)."""


class SolverValidationError(RuntimeError):
    """Raised when a nominal feasible solution violates physical accounting."""



# Public reference to silence unused-import linters when callers want classify().
__all__ = [
    "CuttingStockSolver",
    "InfeasibleGroupError",
    "SolverValidationError",
    "classify",
]
