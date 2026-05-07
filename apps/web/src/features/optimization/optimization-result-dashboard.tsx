"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  ChevronDown,
  ChevronUp,
  Download,
  Gauge,
  LayoutGrid,
  Layers3,
  PackageOpen,
  Recycle,
  Ruler,
  Scissors,
  TrendingDown,
  Truck
} from "lucide-react";

import type {
  OptimizationLeftoverPiece,
  OptimizationProfileBreakdown,
  OptimizationResultPayload,
  OptimizationStockRequirement,
  OptimizationWorkOrderItem
} from "@lemnixpro/shared-contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";

import {
  type CopyableColumn,
  OptimizationCopyableTable
} from "./optimization-copyable-table";
import { PatternBar } from "./pattern-bar";
import { cn } from "@/lib/utils";

type Props = {
  payload: OptimizationResultPayload;
  requestId: string;
};

function fmtMm(value: number): string {
  return value.toLocaleString("tr-TR");
}

function fmtMeters(mm: number): string {
  return `${(mm / 1000).toLocaleString("tr-TR", {
    maximumFractionDigits: 2
  })} m`;
}

export function OptimizationResultDashboard({ payload, requestId }: Props) {
  const metrics = payload.metrics;
  const distinctPatternsTotal =
    metrics.distinctPatternTypesTotal ?? payload.patterns.length;
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [metricsOpen, setMetricsOpen] = useState(true);

  const breakdownCount = payload.profileBreakdowns.length;

  useEffect(() => {
    if (breakdownCount === 0) {
      return;
    }
    setSelectedProfileIndex((index) => Math.min(index, breakdownCount - 1));
  }, [breakdownCount]);

  const selectedBreakdown = payload.profileBreakdowns[selectedProfileIndex];
  const patternsForSelectedBreakdown = useMemo(() => {
    if (!selectedBreakdown) {
      return [];
    }
    const allowed = new Set(selectedBreakdown.patternIds);
    return payload.patterns.filter((p) => allowed.has(p.patternId));
  }, [payload.patterns, selectedBreakdown]);

  const workOrderColumns = useMemo((): CopyableColumn<OptimizationWorkOrderItem>[] => {
    return [
      {
        id: "wo",
        header: "İş emri",
        accessor: (r) => r.workOrderNumber ?? "—",
        cell: (r) => (
          <span className="font-mono text-xs text-zinc-900">{r.workOrderNumber ?? "—"}</span>
        )
      },
      {
        id: "profile",
        header: "Profil",
        accessor: (r) => r.mainProfileCode,
        cell: (r) => <span className="font-mono text-xs text-zinc-900">{r.mainProfileCode}</span>
      },
      {
        id: "cutCode",
        header: "Kesim kodu",
        accessor: (r) => r.cuttingCode,
        cell: (r) => <span className="font-mono text-xs">{r.cuttingCode}</span>
      },
      {
        id: "cutName",
        header: "Kesim adı",
        accessor: (r) => r.cuttingName,
        cell: (r) => <span className="text-zinc-700">{r.cuttingName}</span>
      },
      {
        id: "len",
        header: "Uzunluk (mm)",
        accessor: (r) => String(r.pieceLengthMm),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums">{fmtMm(r.pieceLengthMm)} mm</span>
        )
      },
      {
        id: "qty",
        header: "Adet",
        accessor: (r) => String(r.fulfilledCount),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums">{r.fulfilledCount}</span>
        )
      }
    ];
  }, []);

  const leftoverColumns = useMemo((): CopyableColumn<OptimizationLeftoverPiece>[] => {
    return [
      {
        id: "profile",
        header: "Profil",
        accessor: (r) => r.mainProfileCode,
        cell: (r) => <span className="font-mono text-xs">{r.mainProfileCode}</span>
      },
      {
        id: "length",
        header: "Uzunluk (mm)",
        accessor: (r) => String(r.lengthMm),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums">{fmtMm(r.lengthMm)} mm</span>
        )
      },
      {
        id: "count",
        header: "Adet",
        accessor: (r) => String(r.count),
        align: "right",
        cell: (r) => <span className="font-mono text-xs tabular-nums">{r.count}</span>
      },
      {
        id: "totalM",
        header: "Toplam (m)",
        accessor: (r) =>
          ((r.lengthMm * r.count) / 1000).toLocaleString("tr-TR", {
            maximumFractionDigits: 3
          }),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums text-zinc-800">
            {fmtMeters(r.lengthMm * r.count)}
          </span>
        )
      }
    ];
  }, []);

  const stockColumns = useMemo((): CopyableColumn<OptimizationStockRequirement>[] => {
    return [
      {
        id: "profile",
        header: "Profil",
        accessor: (r) => r.mainProfileCode,
        cell: (r) => <span className="font-mono text-xs">{r.mainProfileCode}</span>
      },
      {
        id: "stockLen",
        header: "Stok uzunluğu (mm)",
        accessor: (r) => String(r.stockBarLengthMm),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums">{fmtMm(r.stockBarLengthMm)} mm</span>
        )
      },
      {
        id: "role",
        header: "Rol",
        accessor: (r) => (r.stockBarRole === "primary" ? "Birincil" : "İkincil"),
        cell: (r) => (
          <Badge variant={r.stockBarRole === "primary" ? "outline" : "secondary"}>
            {r.stockBarRole === "primary" ? "Birincil" : "İkincil"}
          </Badge>
        )
      },
      {
        id: "need",
        header: "İhtiyaç (adet)",
        accessor: (r) => String(r.requiredCount),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums">{r.requiredCount}</span>
        )
      },
      {
        id: "totalM",
        header: "Toplam (m)",
        accessor: (r) => ((r.stockBarLengthMm * r.requiredCount) / 1000).toString(),
        align: "right",
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums">
            {fmtMeters(r.stockBarLengthMm * r.requiredCount)}
          </span>
        )
      }
    ];
  }, []);

  return (
    <div className={cn("flex flex-col", metricsOpen ? "gap-4" : "gap-1")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/enterprise-optimizasyon">
            <ArrowLeft className="size-4" /> Geri
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span>İstek</span>
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
              {requestId}
            </code>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-zinc-200 bg-white text-xs shadow-sm"
            onClick={() => setMetricsOpen((o) => !o)}
            aria-expanded={metricsOpen}
          >
            {metricsOpen ? (
              <ChevronUp className="size-4 text-zinc-500" />
            ) : (
              <ChevronDown className="size-4 text-zinc-500" />
            )}
            {metricsOpen ? "Özet metrikleri gizle" : "Özet metrikleri göster"}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
          metricsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MetricCard
          icon={Gauge}
          label="Verimlilik"
          value={`%${metrics.efficiencyPct.toFixed(2)}`}
          tone={
            metrics.efficiencyPct >= 95
              ? "emerald"
              : metrics.efficiencyPct >= 85
                ? "amber"
                : "rose"
          }
        />
        <MetricCard
          icon={Layers3}
          label="İş emri sayısı"
          value={`${metrics.workOrderCount}`}
        />
        <MetricCard
          icon={Boxes}
          label="Fiziksel stok kesimi"
          value={`${metrics.totalStockBars}`}
          subtext={`Σ kullanım — ${fmtMeters(metrics.totalStockLengthMm)} top. stok uzunluğu`}
        />
        <MetricCard
          icon={LayoutGrid}
          label="Benzersiz kesim şablonu"
          value={`${distinctPatternsTotal}`}
          subtext="Makine programı çeşitliliği (distinct pattern)"
        />
        <MetricCard
          icon={Scissors}
          label="Kesilen parça"
          value={`${metrics.totalCutPieces}`}
        />
        <MetricCard
          icon={TrendingDown}
          label="Toplam fire"
          subtext={`${fmtMm(metrics.totalKerfMm)} kerf · ${fmtMm(metrics.totalSafetyTrimMm)} güvenlik · ${fmtMm(metrics.totalHurdaMm)} hurda`}
          value={fmtMm(metrics.totalKerfMm + metrics.totalSafetyTrimMm + metrics.totalHurdaMm) + " mm"}
          tone="rose"
        />
        <MetricCard
          icon={Recycle}
          label="Yeniden kullanılabilir"
          subtext={`${metrics.reusableLeftoverPieceCount} adet · ${fmtMeters(metrics.reusableLeftoverLengthMm)}`}
          value={fmtMeters(metrics.reusableLeftoverLengthMm)}
          tone="emerald"
        />
        <MetricCard
          icon={Ruler}
          label="Üretime giden"
          value={fmtMeters(metrics.productiveLengthMm)}
          tone="emerald"
        />
        <MetricCard
          icon={Truck}
          label="Fireye giden"
          value={fmtMeters(metrics.wasteLengthMm)}
          tone="amber"
        />
          </section>
        </div>
      </div>

      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="orders">İş emri görünümü</TabsTrigger>
          <TabsTrigger value="profiles">Profil dağılımı</TabsTrigger>
          <TabsTrigger value="leftovers">Artık stok / Analiz</TabsTrigger>
          <TabsTrigger value="stock">Stok ihtiyacı</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OptimizationCopyableTable
            columns={workOrderColumns}
            description="Veri hücresinde sürükleyerek veya Ctrl ile hücre seçin; Seçimi kopyala / Ctrl+C seçili hücreleri TSV yapar. Başlık veya satır numarası tam sütun/satır."
            emptyMessage="Bu sonuç için iş emri satırı yok."
            rowKeyPrefix="wo"
            rows={payload.workOrderItems}
            title="İş emri × profil × parça"
          />
        </TabsContent>

        <TabsContent value="profiles" className="mt-4">
          {breakdownCount === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-zinc-500">
                Profil dağılımı için kayıt yok.
              </CardContent>
            </Card>
          ) : (
            <div
              className={cn(
                // lg: sticky sol sütunda overflow-hidden atasını yapışmayı bozar; görünür taşmayı xl köşede sınırlamak için yalnızca mobilde kes.
                "flex flex-col overflow-x-hidden rounded-xl border border-zinc-200 bg-zinc-50/40 shadow-sm max-lg:overflow-hidden",
                // Sağ sütun içeriği kadar uzar (şelale). Sol liste viewport içinde kendi scrollbar’ına sahip.
                "lg:min-h-[20rem] lg:flex-row lg:items-start lg:overflow-visible"
              )}
            >
              <aside
                className={cn(
                  "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-zinc-200 bg-white lg:w-[min(100%,18rem)] lg:border-b-0 lg:border-r",
                  // Uzun profil listesinde iç kaydırma; yapışkan + max-yükseklik ile görünüm alanı garanti.
                  "lg:sticky lg:top-[calc(4rem+1.25rem)] lg:z-20 lg:self-start lg:max-h-[calc(100dvh-6.5rem)]"
                )}
              >
                <div className="shrink-0 border-b border-zinc-100 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Ana profiller
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Seçilen gruba göre barlar sağda
                  </p>
                </div>
                <nav
                  className={cn(
                    "flex min-h-0 flex-1 gap-1 overflow-x-auto overflow-y-auto overscroll-y-contain p-2 max-sm:max-h-[40vh]",
                    "lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
                  )}
                  aria-label="Profil listesi"
                >
                  {payload.profileBreakdowns.map((breakdown, index) => (
                    <button
                      key={`${breakdown.mainProfileId}-${breakdown.materialColorClass}-${index}`}
                      type="button"
                      onClick={() => setSelectedProfileIndex(index)}
                      className={cn(
                        "shrink-0 rounded-lg border px-3 py-2.5 text-left transition-colors lg:shrink",
                        selectedProfileIndex === index
                          ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                          : "border-transparent bg-white/80 text-zinc-800 hover:bg-zinc-100"
                      )}
                    >
                      <div
                        className={cn(
                          "font-mono text-sm font-semibold",
                          selectedProfileIndex === index ? "text-white" : "text-zinc-900"
                        )}
                      >
                        {breakdown.mainProfileCode}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 line-clamp-2 text-xs",
                          selectedProfileIndex === index
                            ? "text-zinc-200"
                            : "text-zinc-500"
                        )}
                      >
                        {breakdown.mainProfileName}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge
                          variant={
                            selectedProfileIndex === index ? "secondary" : "outline"
                          }
                          className={cn(
                            "text-[10px]",
                            selectedProfileIndex === index &&
                              "border-white/30 bg-white/15 text-white"
                          )}
                        >
                          {breakdown.materialColorClass === "anodized"
                            ? "Eloksal"
                            : "Boyalı"}
                        </Badge>
                        <Badge
                          variant={
                            selectedProfileIndex === index ? "secondary" : "outline"
                          }
                          className={cn(
                            "font-mono text-[10px]",
                            selectedProfileIndex === index &&
                              "border-white/30 bg-white/15 text-white"
                          )}
                        >
                          %{breakdown.efficiencyPct.toFixed(1)}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </nav>
              </aside>
              <div className="min-h-0 min-w-0 flex-1 bg-white p-4">
                {selectedBreakdown ? (
                  <ProfileBreakdownCard
                    breakdown={selectedBreakdown}
                    patterns={patternsForSelectedBreakdown}
                  />
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="leftovers" className="mt-4">
          <OptimizationCopyableTable
            columns={leftoverColumns}
            description="Başlık / satır seçimi veya hücre sürükleyerek seçim; panoya TSV."
            emptyMessage="Yeniden kullanılabilir parça oluşmadı."
            rowKeyPrefix="lo"
            rows={payload.leftovers}
            title="Artık stok / yeniden kullanılabilir uzunluklar"
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <OptimizationCopyableTable
            columns={stockColumns}
            description="Başlık / satır seçimi veya hücre sürükleyerek seçim; panoya TSV."
            emptyMessage="Stok ihtiyacı satırı yok."
            rowKeyPrefix="st"
            rows={payload.stockRequirements}
            title="Stok ihtiyaç listesi"
            toolbarExtra={
              <Button
                className="h-8 gap-1.5 border-zinc-200 bg-white text-xs shadow-sm"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => downloadStockCsv(payload)}
              >
                <Download className="size-3.5" /> CSV indir
              </Button>
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  tone
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
  tone?: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : tone === "rose"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-zinc-50 text-zinc-700 ring-zinc-200";
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`grid size-9 place-items-center rounded-md ring-1 ${toneClass}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </div>
          <div className="mt-0.5 text-lg font-semibold text-zinc-900">{value}</div>
          {subtext ? (
            <div className="mt-0.5 truncate text-xs text-zinc-500">{subtext}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function collectDistinctWorkOrderLabels(
  patterns: OptimizationResultPayload["patterns"]
): string[] {
  const set = new Set<string>();
  for (const pat of patterns) {
    for (const piece of pat.pieces) {
      for (const wo of piece.workOrderNumbers ?? []) {
        const t = wo.trim();
        if (t) set.add(t);
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
}

function ProfileBreakdownCard({
  breakdown,
  patterns
}: {
  breakdown: OptimizationProfileBreakdown;
  patterns: OptimizationResultPayload["patterns"];
}) {
  const totalStock = patterns.reduce(
    (acc, pattern) => acc + pattern.stockBarLengthMm * pattern.usageCount,
    0
  );
  const distinctTemplates =
    breakdown.distinctPatternCount ?? breakdown.patternIds.length;
  const workOrderLabels = collectDistinctWorkOrderLabels(patterns);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="font-mono text-base">{breakdown.mainProfileCode}</CardTitle>
          <p className="mt-0.5 text-xs text-zinc-500">{breakdown.mainProfileName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={breakdown.materialColorClass === "anodized" ? "secondary" : "outline"}>
            {breakdown.materialColorClass === "anodized" ? "Eloksal" : "Boyalı"}
          </Badge>
          <Badge variant="outline">%{breakdown.efficiencyPct.toFixed(2)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Fiziksel kesim">{breakdown.totalBars}</Stat>
          <Stat label="Benzersiz şablon">{distinctTemplates}</Stat>
          <Stat label="Toplam stok">{fmtMeters(totalStock)}</Stat>
          <Stat label="Üretken">{fmtMeters(breakdown.totalProductiveLengthMm)}</Stat>
          <Stat label="Hurda">{fmtMm(breakdown.totalHurdaMm)} mm</Stat>
        </div>
        {workOrderLabels.length > 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Bu kesime dahil iş emirleri
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {workOrderLabels.map((wo) => (
                <Badge key={wo} variant="outline" className="font-mono text-[10px]">
                  {wo}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          {patterns.map((pattern) => (
            <PatternBar key={pattern.patternId} pattern={pattern} />
          ))}
          {patterns.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
              <PackageOpen className="mx-auto mb-1 size-4" /> Bu profil için pattern üretilmedi.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-zinc-900">{children}</div>
    </div>
  );
}

function downloadStockCsv(payload: OptimizationResultPayload): void {
  const lines = ["profile_code,stock_bar_length_mm,role,required_count"];
  for (const req of payload.stockRequirements) {
    lines.push(
      [req.mainProfileCode, req.stockBarLengthMm, req.stockBarRole, req.requiredCount].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stok-ihtiyaci-${payload.planYear}-w${payload.weekNumber}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
