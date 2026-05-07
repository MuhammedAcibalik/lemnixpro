"use client";

import type { OptimizationResultRecord } from "@lemnixpro/shared-contracts";
import { useQuery } from "@tanstack/react-query";

import { getOptimizationResultStatusMeta } from "@/lib/status";
import { findServiceStatus, workspaceQueries } from "@/lib/workspace-query";
import { CompactDataSkeleton } from "@/ui/compact-data-skeleton";
import { DataTableShell, type DataTableColumn } from "@/ui/data-table-shell";
import { EmptyState } from "@/ui/empty-state";
import { EntitySummaryCard } from "@/ui/entity-summary-card";
import { Panel } from "@/ui/panel";
import { StatusBadge } from "@/ui/status-badge";

const columns: DataTableColumn<OptimizationResultRecord>[] = [
  {
    cell: (result) => (
      <span className="grid gap-0.5">
        <span>{result.jobId}</span>
        {result.reason ? (
          <small className="text-xs text-muted-foreground">{result.reason}</small>
        ) : null}
      </span>
    ),
    header: "Job",
    id: "job"
  },
  {
    cell: (result) => {
      const status = getOptimizationResultStatusMeta(result.status);

      return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
    },
    header: "Durum",
    id: "status"
  },
  {
    cell: (result) => result.resultId ?? "-",
    header: "Result",
    id: "result"
  },
  {
    cell: (result) =>
      new Date(
        result.completedAt ?? result.failedAt ?? result.createdAt
      ).toLocaleString("tr-TR"),
    header: "Zaman",
    id: "time"
  }
];

export function ResultsPageClient() {
  const overviewQuery = useQuery(workspaceQueries.workspaceOverview());
  const resultsService = findServiceStatus(overviewQuery.data, "results");
  const resultsQuery = useQuery({
    ...workspaceQueries.results(),
    enabled:
      overviewQuery.isSuccess &&
      overviewQuery.data !== undefined &&
      (resultsService?.ok ?? false)
  });

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <CompactDataSkeleton rows={4} />;
  }

  if (overviewQuery.isError && !overviewQuery.data) {
    return (
      <EmptyState
        description={overviewQuery.error.message}
        title="Operasyon özeti alınamadı"
      />
    );
  }

  if (overviewQuery.data && resultsService && resultsService.ok === false) {
    return (
      <EmptyState
        description={
          resultsService.message ??
          "Sonuç mikroservisi şu anda kullanılamıyor."
        }
        title="Sonuç kayıtları yüklenemedi"
      />
    );
  }

  if (
    resultsQuery.fetchStatus !== "idle" &&
    resultsQuery.isPending &&
    !resultsQuery.data
  ) {
    return <CompactDataSkeleton rows={4} />;
  }

  if (resultsQuery.isError && !resultsQuery.data) {
    return (
      <EmptyState
        description={resultsQuery.error.message}
        title="Sonuç kayıtları alınamadı"
      />
    );
  }

  return (
    <Panel title="Optimizasyon sonuç kayıtları">
      <DataTableShell
        columns={columns}
        emptyDescription="Henüz optimizasyon sonucu yok."
        emptyTitle="Sonuç kaydı yok"
        getRowKey={(result) => result.id}
        isFetching={resultsQuery.isFetching}
        minWidth={880}
        mobileCard={(result) => {
          const status = getOptimizationResultStatusMeta(result.status);

          return (
            <EntitySummaryCard
              description={new Date(
                result.completedAt ?? result.failedAt ?? result.createdAt
              ).toLocaleString("tr-TR")}
              eyebrow={result.jobId}
              facts={[
                { label: "Result", value: result.resultId ?? "-" },
                { label: "Durum", value: status.label }
              ]}
              key={result.id}
              status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
              title={result.reason ?? "Optimizasyon sonucu"}
            />
          );
        }}
        rows={resultsQuery.data ?? []}
      />
    </Panel>
  );
}
