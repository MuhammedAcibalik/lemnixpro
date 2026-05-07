"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Scissors, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import type { CutListSnapshotSummary } from "@lemnixpro/shared-contracts";

import { workspaceQueries } from "@/lib/workspace-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { CompactDataSkeleton, MetricGridSkeleton } from "@/ui/compact-data-skeleton";
import { EmptyState } from "@/ui/empty-state";
import { EntitySummaryCard } from "@/ui/entity-summary-card";
import { InlineRefresh } from "@/ui/inline-refresh";
import { MetricCard } from "@/ui/metric-card";
import { StatusBadge } from "@/ui/status-badge";

import { OptimizationWizard } from "@/features/optimization/optimization-wizard";

export function EnterpriseOptimizasyonClient() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const cutListsQuery = useQuery(workspaceQueries.cutLists());
  const snapshots = cutListsQuery.data ?? [];
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    null
  );

  const detailQuery = useQuery({
    ...workspaceQueries.cutListDetail(selectedSnapshotId ?? ""),
    enabled: Boolean(selectedSnapshotId)
  });

  if (!hasMounted) {
    return (
      <>
        <MetricGridSkeleton />
        <CompactDataSkeleton rows={4} />
      </>
    );
  }

  if (cutListsQuery.isError && !cutListsQuery.data) {
    return (
      <EmptyState
        description={cutListsQuery.error.message}
        title="Kesim listesi snapshot'ları alınamadı"
      />
    );
  }

  if (cutListsQuery.isLoading && !cutListsQuery.data) {
    return (
      <>
        <MetricGridSkeleton />
        <CompactDataSkeleton rows={4} />
      </>
    );
  }

  const totalSnapshots = snapshots.length;
  const totalMatchedRows = snapshots.reduce(
    (acc, snapshot) => acc + snapshot.matchedProductionRows,
    0
  );
  const totalUnmatched = snapshots.reduce(
    (acc, snapshot) => acc + snapshot.unmatchedProductionRows,
    0
  );
  const totalCuttingLines = snapshots.reduce(
    (acc, snapshot) => acc + snapshot.totalCuttingLines,
    0
  );

  return (
    <>
      <section className="metric-grid">
        <MetricCard
          label="Snapshot sayısı"
          meta="Optimizasyon kaynağı"
          tone="info"
          value={`${totalSnapshots}`}
        />
        <MetricCard
          label="Eşleşen satır"
          meta="Optimizasyona girebilir"
          tone="success"
          value={`${totalMatchedRows}`}
        />
        <MetricCard
          label="Toplam kesim satırı"
          meta="Profil cutting line"
          tone="info"
          value={`${totalCuttingLines}`}
        />
        <MetricCard
          label="Eşleşmeyen"
          meta="Profil yönetimi kontrolü"
          tone={totalUnmatched > 0 ? "warning" : "success"}
          value={`${totalUnmatched}`}
        />
      </section>

      <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardHeader className="flex flex-col gap-3 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-violet-50 text-violet-700">
              <Workflow className="size-5" />
            </div>
            <div>
              <CardTitle>Optimizasyona alınabilir kesim listeleri</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Kesim listesi snapshot'ları doğrudan OR-Tools CP-SAT modeline
                kaynak olur. Seçtiğinizde override + iş emri seçimi + yapılandırma
                adımına geçersiniz.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cutListsQuery.isFetching ? <InlineRefresh /> : null}
            <StatusBadge tone={totalSnapshots > 0 ? "success" : "neutral"}>
              {totalSnapshots > 0 ? "Hazır" : "Henüz snapshot yok"}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {snapshots.length === 0 ? (
            <EmptyState
              description="Üretim planı aktive edildikten sonra ilgili haftaya ait kesim listesi otomatik oluşur ve burada görünür."
              title="Henüz snapshot yok"
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshots.map((snapshot) => (
                <SnapshotCard
                  key={snapshot.id}
                  snapshot={snapshot}
                  onSelect={() => setSelectedSnapshotId(snapshot.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSnapshotId && detailQuery.data ? (
        <OptimizationWizard
          detail={detailQuery.data}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSelectedSnapshotId(null);
            }
          }}
        />
      ) : null}

      {selectedSnapshotId && detailQuery.isLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-md bg-white px-4 py-3 shadow-lg">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Snapshot yükleniyor…</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SnapshotCard({
  snapshot,
  onSelect
}: {
  snapshot: CutListSnapshotSummary;
  onSelect: () => void;
}) {
  return (
    <EntitySummaryCard
      actions={
        <Button onClick={onSelect}>
          Optimizasyona al
          <ArrowRight />
        </Button>
      }
      description={
        <span className="flex items-center gap-1.5">
          <Scissors className="size-3.5" /> {snapshot.totalCuttingLines} kesim
          satırı
        </span>
      }
      eyebrow={`${snapshot.planYear} / Hafta ${snapshot.weekNumber}`}
      facts={[
        { label: "Eşleşen", value: snapshot.matchedProductionRows },
        { label: "Toplam", value: snapshot.totalProductionRows },
        { label: "Eşleşmeyen", value: snapshot.unmatchedProductionRows }
      ]}
      title={`${snapshot.planYear} - ${snapshot.weekNumber}. Hafta`}
    />
  );
}
