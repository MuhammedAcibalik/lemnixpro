"""Material color -> safety trim policy.

CANONICAL SOURCE: ``packages/shared-contracts/src/index.ts`` (`COLOR_SAFETY_MARGIN_POLICIES`,
`classifyMaterialColor`). This module is a narrow Python mirror so the optimization
engine can reason about safety trims without importing TypeScript. If you change the
policy here, change it in shared-contracts as well; cross-language tests in the
orchestrator service guard against drift via integration round-trips.

Painted / coated profiles (RAL, R9005, pres renkler): trim 10 mm from the bar front
only. Anodized profiles (ELS, ELOKSAL, ANODIZE): trim 50 mm from both ends. Unknown
or blank colors fall back to "painted" because the painted policy has the smallest
usable-length penalty; choosing "anodized" by default would over-allocate stock.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ColorClass(str, Enum):
    PAINTED = "painted"
    ANODIZED = "anodized"


@dataclass(frozen=True)
class SafetyMarginPolicy:
    color_class: ColorClass
    front_trim_mm: int
    end_trim_mm: int

    @property
    def total_trim_mm(self) -> int:
        return self.front_trim_mm + self.end_trim_mm


MARGIN_TABLE: dict[ColorClass, SafetyMarginPolicy] = {
    ColorClass.PAINTED: SafetyMarginPolicy(
        color_class=ColorClass.PAINTED, front_trim_mm=10, end_trim_mm=0
    ),
    ColorClass.ANODIZED: SafetyMarginPolicy(
        color_class=ColorClass.ANODIZED, front_trim_mm=50, end_trim_mm=50
    ),
}

_ANODIZED_TOKENS = ("ELS", "ELOKSAL", "ELOX", "ELOXAL", "ANODIZE")


def classify(raw_color: str | None) -> ColorClass:
    if raw_color is None:
        return ColorClass.PAINTED

    normalized = raw_color.strip().upper()

    if normalized == "":
        return ColorClass.PAINTED

    for token in _ANODIZED_TOKENS:
        if token in normalized:
            return ColorClass.ANODIZED

    return ColorClass.PAINTED


def policy_for(raw_color: str | None) -> SafetyMarginPolicy:
    return MARGIN_TABLE[classify(raw_color)]
