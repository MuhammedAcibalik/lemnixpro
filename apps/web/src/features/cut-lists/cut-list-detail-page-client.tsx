"use client";

import type { CutListUnmatchedRow } from "@lemnixpro/shared-contracts";
import { useQuery } from "@tanstack/react-query";

import { FlashMessage } from "@/ui/flash-message";
import { Panel } from "@/ui/panel";
import { CompactDataSkeleton } from "@/ui/compact-data-skeleton";
import { DataTableShell, type DataTableColumn } from "@/ui/data-table-shell";
import { EmptyState } from "@/ui/empty-state";
import { workspaceQueries } from "@/lib/workspace-query";

import { CutListDetailClient } from "./cut-list-detail-client";

type CutListDetailPageClientProps = {
  id: string;
  notice?: string | undefined;
};

const unmatchedColumns: DataTableColumn<CutListUnmatchedRow>[] = [
  {
    id: "materialCode",
    header: "Malzeme kodu",
    cell: (row) => row.materialCode ?? "-"
  },
  {
    id: "materialName",
    header: "Malzeme adı",
    cell: (row) => row.materialName ?? "-"
  },
  {
    id: "reason",
    header: "Sebep",
    cell: (row) => row.reasons.join(", ")
  }
];

export function CutListDetailPageClient({
  id,
  notice
}: CutListDetailPageClientProps) {
  const detailQuery = useQuery(workspaceQueries.cutListDetail(id));
  const detail = detailQuery.data;

  if (detailQuery.isError && !detail) {
    return (
      <EmptyState
        description={detailQuery.error.message}
        title="Kesim listesi alınamadı"
      />
    );
  }

  if (detailQuery.isLoading && !detail) {
    return <CompactDataSkeleton rows={4} />;
  }

  if (!detail) {
    return <CompactDataSkeleton rows={4} />;
  }

  return (
    <div className="page-stack">
      {notice ? <FlashMessage message={notice} tone="success" /> : null}
      <CutListDetailClient detail={detail} />
      {detail.unmatchedRows.length > 0 ? (
        <Panel
          description="Profil yönetimiyle tamamlanması gereken üretim satırları."
          title="Eşleşmeyen üretim satırları"
        >
          <DataTableShell
            columns={unmatchedColumns}
            emptyTitle="Eşleşmeyen satır yok"
            getRowKey={(row) => row.productionRowId}
            isFetching={detailQuery.isFetching}
            minWidth={760}
            rows={detail.unmatchedRows}
          />
        </Panel>
      ) : null}
    </div>
  );
}
