"use client";

import type { CutListSnapshotSummary } from "@lemnixpro/shared-contracts";
import { useQuery } from "@tanstack/react-query";

import { findServiceStatus, workspaceQueries } from "@/lib/workspace-query";
import { CompactDataSkeleton, MetricGridSkeleton } from "@/ui/compact-data-skeleton";
import { DataTableShell, type DataTableColumn } from "@/ui/data-table-shell";
import { EmptyState } from "@/ui/empty-state";
import { EntitySummaryCard } from "@/ui/entity-summary-card";
import { MetricCard } from "@/ui/metric-card";
import { Panel } from "@/ui/panel";
import { StatusBadge } from "@/ui/status-badge";

const columns: DataTableColumn<CutListSnapshotSummary>[] = [
  {
    align: "center",
    cell: (snapshot) => <strong>{snapshot.weekNumber}</strong>,
    header: "Hafta",
    id: "week"
  },
  {
    cell: (snapshot) => (
      <span className="grid gap-0.5">
        <span>Kesim listesi</span>
        <small className="text-xs text-muted-foreground">{snapshot.id}</small>
      </span>
    ),
    header: "Snapshot",
    id: "snapshot"
  },
  {
    align: "right",
    cell: (snapshot) => snapshot.matchedProductionRows,
    header: "Ürün",
    id: "products"
  },
  {
    align: "center",
    cell: (snapshot) => (
      <StatusBadge tone={snapshot.unmatchedProductionRows > 0 ? "danger" : "success"}>
        {snapshot.unmatchedProductionRows}
      </StatusBadge>
    ),
    header: "Eşleşmeyen",
    id: "unmatched"
  },
  {
    cell: (snapshot) => new Date(snapshot.createdAt).toLocaleString("tr-TR"),
    header: "Oluşturma",
    id: "created"
  }
];

export function OperasyonAnalitigiClient() {
  const overviewQuery = useQuery(workspaceQueries.workspaceOverview());
  const cutListsService = findServiceStatus(overviewQuery.data, "cut-lists");
  const snapshotsQuery = useQuery({
    ...workspaceQueries.cutLists(),
    enabled:
      overviewQuery.isSuccess &&
      overviewQuery.data !== undefined &&
      (cutListsService?.ok ?? false)
  });
  const summary = overviewQuery.data?.summary;
  const snapshots = snapshotsQuery.data ?? [];
  const latestSnapshots = snapshots.slice(0, 8);

  if (overviewQuery.isError && !overviewQuery.data) {
    return (
      <EmptyState
        description={overviewQuery.error.message}
        title="Operasyon özeti alınamadı"
      />
    );
  }

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <>
        <MetricGridSkeleton />
        <CompactDataSkeleton rows={4} />
      </>
    );
  }

  if (
    overviewQuery.data &&
    cutListsService &&
    cutListsService.ok === false
  ) {
    return (
      <>
        <section className="metric-grid">
          <MetricCard
            label="Aktif hafta batch'i"
            meta="Hafta bazlı canlı plan kaynağı"
            tone="success"
            value={`${summary?.activeBatchCount ?? 0}`}
          />
          <MetricCard
            label="Optimizasyon sonucu"
            meta={`${summary?.resultCount ?? 0} toplam sonuç kaydı`}
            tone="info"
            value={`${summary?.completedResultCount ?? 0}`}
          />
          <MetricCard
            label="Toplam kesim satırı"
            meta="Profil ve düz kesim satırları"
            tone="warning"
            value={`${summary?.totalCuttingLines ?? 0}`}
          />
          <MetricCard
            label="Eşleşmeyen ürün"
            meta="Profil yönetimi ile tamamlanmalı"
            tone={(summary?.totalUnmatchedRows ?? 0) > 0 ? "danger" : "success"}
            value={`${summary?.totalUnmatchedRows ?? 0}`}
          />
        </section>
        <Panel title="Son kesim snapshot'ları">
          <EmptyState
            description={
              cutListsService.message ??
              "Kesim listesi mikroservisi yanıt vermedi; kesim snapshot tablosu yüklenemiyor."
            }
            title="Kesim listesi geçici olarak kullanılamıyor"
          />
        </Panel>
      </>
    );
  }

  if (
    snapshotsQuery.fetchStatus !== "idle" &&
    snapshotsQuery.isPending &&
    !snapshotsQuery.data
  ) {
    return (
      <>
        <section className="metric-grid">
          <MetricCard
            label="Aktif hafta batch'i"
            meta="Hafta bazlı canlı plan kaynağı"
            tone="success"
            value={`${summary?.activeBatchCount ?? 0}`}
          />
          <MetricCard
            label="Optimizasyon sonucu"
            meta={`${summary?.resultCount ?? 0} toplam sonuç kaydı`}
            tone="info"
            value={`${summary?.completedResultCount ?? 0}`}
          />
          <MetricCard
            label="Toplam kesim satırı"
            meta="Profil ve düz kesim satırları"
            tone="warning"
            value={`${summary?.totalCuttingLines ?? 0}`}
          />
          <MetricCard
            label="Eşleşmeyen ürün"
            meta="Profil yönetimi ile tamamlanmalı"
            tone={(summary?.totalUnmatchedRows ?? 0) > 0 ? "danger" : "success"}
            value={`${summary?.totalUnmatchedRows ?? 0}`}
          />
        </section>
        <CompactDataSkeleton rows={4} />
      </>
    );
  }

  return (
    <>
      <section className="metric-grid">
        <MetricCard
          label="Aktif hafta batch'i"
          meta="Hafta bazlı canlı plan kaynağı"
          tone="success"
          value={`${summary?.activeBatchCount ?? 0}`}
        />
        <MetricCard
          label="Optimizasyon sonucu"
          meta={`${summary?.resultCount ?? 0} toplam sonuç kaydı`}
          tone="info"
          value={`${summary?.completedResultCount ?? 0}`}
        />
        <MetricCard
          label="Toplam kesim satırı"
          meta="Profil ve düz kesim satırları"
          tone="warning"
          value={`${summary?.totalCuttingLines ?? 0}`}
        />
        <MetricCard
          label="Eşleşmeyen ürün"
          meta="Profil yönetimi ile tamamlanmalı"
          tone={(summary?.totalUnmatchedRows ?? 0) > 0 ? "danger" : "success"}
          value={`${summary?.totalUnmatchedRows ?? 0}`}
        />
      </section>
      <Panel title="Son kesim snapshot'ları">
        <DataTableShell
          columns={columns}
          emptyDescription="Henüz analitik üretilecek kesim snapshot'ı yok."
          emptyTitle="Analitik verisi yok"
          getRowKey={(snapshot) => snapshot.id}
          isFetching={overviewQuery.isFetching || snapshotsQuery.isFetching}
          minWidth={920}
          mobileCard={(snapshot) => (
            <EntitySummaryCard
              description={new Date(snapshot.createdAt).toLocaleString("tr-TR")}
              eyebrow={`${snapshot.weekNumber}. hafta`}
              facts={[
                { label: "Ürün", value: snapshot.matchedProductionRows },
                { label: "Eşleşmeyen", value: snapshot.unmatchedProductionRows }
              ]}
              key={snapshot.id}
              status={
                <StatusBadge
                  tone={snapshot.unmatchedProductionRows > 0 ? "danger" : "success"}
                >
                  {snapshot.unmatchedProductionRows}
                </StatusBadge>
              }
              title="Kesim listesi"
            />
          )}
          rows={latestSnapshots}
        />
      </Panel>
    </>
  );
}
