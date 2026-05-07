"use client";

import type { OptimizationPattern } from "@lemnixpro/shared-contracts";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PatternBarProps = {
  pattern: OptimizationPattern;
  paletteFn?: (lengthMm: number, index: number) => string;
};

const DEFAULT_PALETTE = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500"
] as const;

const REUSABLE_CLASS = "bg-emerald-200 text-emerald-900 ring-1 ring-emerald-400/60";
const HURDA_CLASS = "bg-zinc-200 text-zinc-700 ring-1 ring-zinc-400/40";

function formatMm(value: number): string {
  return value.toLocaleString("tr-TR");
}

function defaultPalette(_lengthMm: number, index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] ?? DEFAULT_PALETTE[0];
}

export function PatternBar({ pattern, paletteFn = defaultPalette }: PatternBarProps) {
  const stockLength = Math.max(pattern.stockBarLengthMm, 1);
  const safetyTrim = pattern.safetyTrimMm;
  const reusable = pattern.reusableScrapMm;
  const hurda = pattern.hurdaMm;

  const minSegmentPct = 1.5;
  const segments: Array<{
    className: string;
    label: string;
    description: string;
    widthPct: number;
  }> = [];

  if (safetyTrim > 0) {
    segments.push({
      className: "bg-zinc-700/70 text-white",
      label: "GP",
      description: `Güvenlik payı (${formatMm(safetyTrim)} mm)`,
      widthPct: Math.max((safetyTrim / stockLength) * 100, 0)
    });
  }

  pattern.pieces.forEach((piece, idx) => {
    const totalLength = piece.lengthMm * piece.count;
    const widthPct = Math.max((totalLength / stockLength) * 100, minSegmentPct);
    segments.push({
      className: cn(
        paletteFn(piece.lengthMm, idx),
        "text-white shadow-[inset_0_-1px_0_rgba(15,23,42,0.18)]"
      ),
      label: `${piece.count}× ${formatMm(piece.lengthMm)}`,
      description: `${piece.cuttingCode} · ${piece.cuttingName} · ${piece.count} adet × ${formatMm(piece.lengthMm)} mm`,
      widthPct
    });
  });

  if (pattern.kerfTotalMm > 0) {
    segments.push({
      className: "bg-zinc-400/80 text-zinc-900",
      label: "K",
      description: `Toplam kerf (${formatMm(pattern.kerfTotalMm)} mm)`,
      widthPct: Math.max((pattern.kerfTotalMm / stockLength) * 100, 0)
    });
  }

  if (reusable > 0) {
    segments.push({
      className: REUSABLE_CLASS,
      label: `${formatMm(reusable)} mm`,
      description: `Yeniden kullanılabilir artık (${formatMm(reusable)} mm)`,
      widthPct: Math.max((reusable / stockLength) * 100, 0)
    });
  }

  if (hurda > 0) {
    segments.push({
      className: HURDA_CLASS,
      label: `${formatMm(hurda)} mm`,
      description: `Hurda (${formatMm(hurda)} mm)`,
      widthPct: Math.max((hurda / stockLength) * 100, 0)
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <div className="flex items-baseline gap-3">
          <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
            {pattern.usageCount}× kullanım
          </span>
          <span className="font-medium text-zinc-700">
            {pattern.mainProfileCode}
          </span>
          <span className="text-zinc-500">
            {formatMm(pattern.stockBarLengthMm)} mm ·{" "}
            {pattern.stockBarRole === "primary" ? "Birincil" : "İkincil"}
          </span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-xs font-semibold",
            pattern.efficiencyPct >= 95
              ? "bg-emerald-100 text-emerald-700"
              : pattern.efficiencyPct >= 85
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700"
          )}
        >
          %{pattern.efficiencyPct.toFixed(2)} verim
        </span>
      </div>
      <div
        aria-label={`Pattern ${pattern.patternId}`}
        className="flex h-10 w-full overflow-hidden rounded-md border border-zinc-300 bg-zinc-50"
        role="group"
      >
        {segments
          .filter((segment) => segment.widthPct > 0)
          .map((segment, index) => (
            <div
              className={cn(
                "flex h-full min-w-0 items-center justify-center overflow-hidden text-[11px] font-medium tracking-tight transition-all",
                segment.className
              )}
              key={`${segment.label}-${index}`}
              style={{ width: `${segment.widthPct}%` }}
              title={segment.description}
            >
              <span className="truncate px-1.5">{segment.label}</span>
            </div>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>Üretken: {formatMm(pattern.productiveLengthMm)} mm</span>
        <span>Kerf: {formatMm(pattern.kerfTotalMm)} mm</span>
        <span>Güvenlik: {formatMm(pattern.safetyTrimMm)} mm</span>
        <span>Artık: {formatMm(pattern.reusableScrapMm)} mm</span>
        <span>Hurda: {formatMm(pattern.hurdaMm)} mm</span>
      </div>
      <PatternPieceWorkOrders pieces={pattern.pieces} />
    </div>
  );
}

function PatternPieceWorkOrders({
  pieces
}: {
  pieces: OptimizationPattern["pieces"];
}) {
  const hasAnyWo = pieces.some(
    (piece) => (piece.workOrderNumbers?.length ?? 0) > 0
  );
  if (!hasAnyWo) {
    return null;
  }
  return (
    <div className="rounded-md border border-zinc-200/80 bg-zinc-50/90 px-3 py-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Parça → iş emri
      </div>
      <ul className="space-y-1.5 text-xs">
        {pieces.map((piece, idx) => (
          <li
            key={`${piece.cuttingCode}-${piece.lengthMm}-${idx}`}
            className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3"
          >
            <span className="font-mono text-zinc-800">
              {piece.cuttingCode}{" "}
              <span className="text-zinc-500">
                · {piece.count}× {formatMm(piece.lengthMm)} mm
              </span>
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {(piece.workOrderNumbers ?? []).length > 0 ? (
                (piece.workOrderNumbers ?? []).map((wo) => (
                  <Badge
                    key={wo}
                    variant="secondary"
                    className="max-w-full truncate font-mono text-[10px]"
                  >
                    {wo}
                  </Badge>
                ))
              ) : (
                <span className="text-zinc-400">İş emri yok</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
