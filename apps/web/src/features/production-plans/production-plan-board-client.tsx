"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductionPlanImportBatch } from "@lemnixpro/shared-contracts";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Table2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { activateProductionPlanImportAction } from "@/features/production-plans/actions";
import { DeleteProductionPlanBatchButton } from "@/features/production-plans/delete-production-plan-batch-button";
import { ProductionPlanRowsController } from "@/features/production-plans/production-plan-rows-panel";
import {
  canActivateProductionPlanBatch,
  getProductionPlanStatusMeta
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/ui/empty-state";
import { InlineRefresh } from "@/ui/inline-refresh";
import { StatusBadge } from "@/ui/status-badge";

type ProductionPlanBoardClientProps = {
  batches: ProductionPlanImportBatch[];
  isFetching?: boolean;
};

type WeekGroup = {
  weekNumber: number;
  label: string;
  batches: ProductionPlanImportBatch[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  activeBatchId: string | null;
};

type BatchSelection = Record<string, string>;

export function ProductionPlanBoardClient({
  batches,
  isFetching = false
}: ProductionPlanBoardClientProps) {
  const weekGroups = useMemo(() => buildWeekGroups(batches), [batches]);
  const firstWeek = weekGroups[0]?.weekNumber ?? null;
  const [openWeek, setOpenWeek] = useState<number | null>(() => firstWeek);
  const [selectedBatchByWeek, setSelectedBatchByWeek] =
    useState<BatchSelection>(() => buildInitialSelection(weekGroups));
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setSelectedBatchByWeek((current) => {
      const next = { ...current };

      for (const group of weekGroups) {
        const key = String(group.weekNumber);
        const stillExists = group.batches.some((batch) => batch.id === next[key]);

        if (!next[key] || !stillExists) {
          next[key] = getDefaultBatch(group)?.id ?? "";
        }
      }

      return next;
    });

    setOpenWeek((current) => {
      if (
        current !== null &&
        weekGroups.some((group) => group.weekNumber === current)
      ) {
        return current;
      }

      return firstWeek;
    });
  }, [firstWeek, weekGroups]);

  function scrollWeekIntoView(weekNumber: number) {
    const node = panelRefs.current[String(weekNumber)];
    if (!node) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start"
      });
    });
  }

  function toggleWeek(group: WeekGroup) {
    setOpenWeek((current) => {
      const next = current === group.weekNumber ? null : group.weekNumber;

      if (next !== null) {
        scrollWeekIntoView(next);
      }

      return next;
    });

    setSelectedBatchByWeek((current) => {
      const key = String(group.weekNumber);
      if (current[key]) {
        return current;
      }

      return {
        ...current,
        [key]: getDefaultBatch(group)?.id ?? ""
      };
    });
  }

  function selectBatch(group: WeekGroup, batchId: string) {
    setSelectedBatchByWeek((current) => ({
      ...current,
      [String(group.weekNumber)]: batchId
    }));
    setOpenWeek(group.weekNumber);
    scrollWeekIntoView(group.weekNumber);
  }

  if (weekGroups.length === 0) {
    return (
      <EmptyState
        description="Aktif üretim planı bulunmuyor. Yeni bir Excel dosyası yüklediğinizde haftalar burada açılır."
        title="Üretim planı bekleniyor"
      />
    );
  }

  return (
    <div className="space-y-3">
      {isFetching ? (
        <div className="flex justify-end">
          <InlineRefresh />
        </div>
      ) : null}
      {weekGroups.map((group) => {
        const groupKey = String(group.weekNumber);
        const isOpen = openWeek === group.weekNumber;
        const selectedBatch =
          group.batches.find((batch) => batch.id === selectedBatchByWeek[groupKey]) ??
          getDefaultBatch(group);

        return (
          <div
            key={group.weekNumber}
            ref={(node) => {
              panelRefs.current[groupKey] = node;
            }}
          >
            <Card className="overflow-hidden border-border/80 bg-card shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <button
                aria-controls={`production-week-${group.weekNumber}`}
                aria-expanded={isOpen}
                className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:flex-row md:items-center md:justify-between"
                onClick={() => toggleWeek(group)}
                type="button"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                    <CalendarDays className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-950">
                      {group.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {group.batches.length} yükleme ·{" "}
                      {group.totalRows.toLocaleString("tr-TR")} satır
                    </span>
                  </span>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  <BadgeLike
                    tone="success"
                    value={`${group.validRows.toLocaleString("tr-TR")} geçerli`}
                  />
                  {group.invalidRows > 0 ? (
                    <BadgeLike
                      tone="warning"
                      value={`${group.invalidRows.toLocaleString("tr-TR")} hatalı`}
                    />
                  ) : null}
                  {group.activeBatchId ? (
                    <BadgeLike tone="info" value="Aktif hafta" />
                  ) : null}
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                      isOpen ? "rotate-180" : "rotate-0"
                    )}
                    aria-hidden="true"
                  />
                </span>
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none",
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
                id={`production-week-${group.weekNumber}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <CardContent className="space-y-4 border-t bg-muted/10 p-4">
                    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                      {group.batches.map((batch) => (
                        <BatchCard
                          batch={batch}
                          isSelected={selectedBatch?.id === batch.id}
                          key={batch.id}
                          onSelect={() => selectBatch(group, batch.id)}
                        />
                      ))}
                    </div>

                    {selectedBatch ? (
                      <ProductionPlanRowsController
                        batch={selectedBatch}
                        key={selectedBatch.id}
                      />
                    ) : null}
                  </CardContent>
                </div>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function BatchCard({
  batch,
  isSelected,
  onSelect
}: {
  batch: ProductionPlanImportBatch;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const status = getProductionPlanStatusMeta(batch.status);
  const canActivate = canActivateProductionPlanBatch(batch);

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 transition-colors",
        isSelected
          ? "border-blue-300 bg-blue-50/55 shadow-[0_0_0_1px_rgba(37,99,235,0.12)]"
          : "border-border"
      )}
    >
      <button className="w-full text-left" onClick={onSelect} type="button">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              Hafta {batch.weekNumber ?? "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {batch.totalRowCount.toLocaleString("tr-TR")} satır ·{" "}
              {formatDateTime(batch.createdAt)}
            </p>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <MiniMetric
            icon={<Table2 className="size-3.5" aria-hidden="true" />}
            label="Satır"
            value={batch.totalRowCount.toLocaleString("tr-TR")}
          />
          <MiniMetric
            icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}
            label="Geçerli"
            value={batch.validRowCount.toLocaleString("tr-TR")}
          />
          <MiniMetric
            icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
            label="Hatalı"
            value={batch.invalidRowCount.toLocaleString("tr-TR")}
          />
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {batch.status === "active" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden="true" />
            Kullanımda
          </span>
        ) : canActivate ? (
          <form action={activateProductionPlanImportAction.bind(null, batch.id)}>
            <Button size="sm" type="submit" variant="outline">
              Aktif yap
            </Button>
          </form>
        ) : (
          <StatusBadge tone="neutral">Geçerli satır yok</StatusBadge>
        )}
        <DeleteProductionPlanBatchButton batchId={batch.id} />
      </div>
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="rounded-md border bg-muted/35 px-2 py-1.5">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="mt-1 block font-semibold text-slate-900">{value}</span>
    </span>
  );
}

function BadgeLike({
  tone,
  value
}: {
  tone: "info" | "success" | "warning";
  value: string;
}) {
  const styles: Record<"info" | "success" | "warning", string> = {
    info: "border-blue-200 bg-blue-50 text-blue-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  };

  return (
    <span
      className={cn("rounded-md border px-2 py-1 text-xs font-medium", styles[tone])}
    >
      {value}
    </span>
  );
}

function buildWeekGroups(batches: ProductionPlanImportBatch[]): WeekGroup[] {
  const grouped = new Map<number, ProductionPlanImportBatch[]>();

  for (const batch of batches) {
    const weekNumber = normalizeWeekNumber(batch.weekNumber);
    const list = grouped.get(weekNumber) ?? [];
    list.push(batch);
    grouped.set(weekNumber, list);
  }

  return Array.from(grouped.entries())
    .map(([weekNumber, list]) => {
      const sorted = [...list].sort(sortBatches);

      return {
        activeBatchId:
          sorted.find((batch) => batch.status === "active")?.id ?? null,
        batches: sorted,
        invalidRows: sorted.reduce(
          (total, batch) => total + batch.invalidRowCount,
          0
        ),
        label: weekNumber === -1 ? "Hafta atanmamış" : `Hafta ${weekNumber}`,
        totalRows: sorted.reduce(
          (total, batch) => total + batch.totalRowCount,
          0
        ),
        validRows: sorted.reduce(
          (total, batch) => total + batch.validRowCount,
          0
        ),
        weekNumber
      };
    })
    .sort(sortWeekGroups);
}

function buildInitialSelection(groups: WeekGroup[]): BatchSelection {
  return Object.fromEntries(
    groups.map((group) => [String(group.weekNumber), getDefaultBatch(group)?.id ?? ""])
  );
}

function getDefaultBatch(group: WeekGroup) {
  return group.batches.find((batch) => batch.status === "active") ?? group.batches[0] ?? null;
}

function sortBatches(left: ProductionPlanImportBatch, right: ProductionPlanImportBatch) {
  const statusScore = getBatchScore(left) - getBatchScore(right);
  if (statusScore !== 0) {
    return statusScore;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function sortWeekGroups(left: WeekGroup, right: WeekGroup) {
  if (left.weekNumber === -1) {
    return 1;
  }

  if (right.weekNumber === -1) {
    return -1;
  }

  return right.weekNumber - left.weekNumber;
}

function getBatchScore(batch: ProductionPlanImportBatch) {
  if (batch.status === "active") {
    return 0;
  }

  if (batch.status === "imported") {
    return 1;
  }

  return 2;
}

function normalizeWeekNumber(weekNumber: number | null) {
  return weekNumber ?? -1;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
