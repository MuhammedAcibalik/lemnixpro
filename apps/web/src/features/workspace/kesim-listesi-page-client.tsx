"use client";

import { useQuery } from "@tanstack/react-query";

import { CutListOverviewClient } from "@/features/cut-lists/cut-list-overview-client";
import { findServiceStatus, workspaceQueries } from "@/lib/workspace-query";
import { CompactDataSkeleton } from "@/ui/compact-data-skeleton";
import { EmptyState } from "@/ui/empty-state";

export function KesimListesiPageClient() {
  const overviewQuery = useQuery(workspaceQueries.workspaceOverview());
  const cutListsService = findServiceStatus(overviewQuery.data, "cut-lists");
  const snapshotsQuery = useQuery({
    ...workspaceQueries.cutLists(),
    enabled:
      overviewQuery.isSuccess &&
      overviewQuery.data !== undefined &&
      (cutListsService?.ok ?? false)
  });

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <CompactDataSkeleton rows={3} />;
  }

  if (overviewQuery.isError && !overviewQuery.data) {
    return (
      <EmptyState
        description={overviewQuery.error.message}
        title="Operasyon özeti alınamadı"
      />
    );
  }

  if (
    overviewQuery.data &&
    cutListsService &&
    cutListsService.ok === false
  ) {
    return (
      <EmptyState
        description={
          cutListsService.message ??
          "Kesim listesi mikroservisi şu anda kullanılamıyor."
        }
        title="Kesim listeleri yüklenemedi"
      />
    );
  }

  if (
    snapshotsQuery.fetchStatus !== "idle" &&
    snapshotsQuery.isPending &&
    !snapshotsQuery.data
  ) {
    return <CompactDataSkeleton rows={3} />;
  }

  if (snapshotsQuery.isError && !snapshotsQuery.data) {
    return (
      <EmptyState
        description={snapshotsQuery.error.message}
        title="Kesim listeleri alınamadı"
      />
    );
  }

  return (
    <CutListOverviewClient
      isFetching={snapshotsQuery.isFetching}
      snapshots={snapshotsQuery.data ?? []}
    />
  );
}
