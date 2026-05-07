"use client";

import { useQuery } from "@tanstack/react-query";

import { ProductionPlanBoardClient } from "@/features/production-plans/production-plan-board-client";
import { workspaceQueries } from "@/lib/workspace-query";
import { CompactDataSkeleton } from "@/ui/compact-data-skeleton";
import { EmptyState } from "@/ui/empty-state";

export function UretimPlaniPageClient() {
  const importsQuery = useQuery(workspaceQueries.productionPlanImports());

  if (importsQuery.isError && !importsQuery.data) {
    return (
      <EmptyState
        description={importsQuery.error.message}
        title="Üretim planı alınamadı"
      />
    );
  }

  if (importsQuery.isLoading && !importsQuery.data) {
    return <CompactDataSkeleton rows={3} />;
  }

  return (
    <ProductionPlanBoardClient
      batches={importsQuery.data ?? []}
      isFetching={importsQuery.isFetching}
    />
  );
}
