"use client";

import { useState } from "react";
import type {
  ProductionPlanImportBatch,
  ProductionPlanImportRow,
  ProductionPlanImportRowsPage
} from "@lemnixpro/shared-contracts";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { workspaceQueries } from "@/lib/workspace-query";
import { DataTableShell, type DataTableColumn } from "@/ui/data-table-shell";
import { EmptyState } from "@/ui/empty-state";
import { EntitySummaryCard } from "@/ui/entity-summary-card";
import { StatusBadge } from "@/ui/status-badge";

const ROW_LIMIT = 100;

export function ProductionPlanRowsController({
  batch
}: {
  batch: ProductionPlanImportBatch;
}) {
  const [page, setPage] = useState(1);
  const rowsQuery = useQuery(
    workspaceQueries.productionPlanRows(batch.id, page, ROW_LIMIT)
  );

  return (
    <ProductionPlanRowsPanel
      batch={batch}
      error={rowsQuery.error}
      isFetching={rowsQuery.isFetching}
      isLoading={rowsQuery.isLoading}
      onPageChange={setPage}
      page={page}
      rowsPage={rowsQuery.data ?? null}
    />
  );
}

function ProductionPlanRowsPanel({
  batch,
  error,
  isFetching,
  isLoading,
  page,
  onPageChange,
  rowsPage
}: {
  batch: ProductionPlanImportBatch;
  error: Error | null;
  isFetching: boolean;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  rowsPage: ProductionPlanImportRowsPage | null;
}) {
  if (isLoading && !rowsPage) {
    return <ProductionPlanRowsSkeleton />;
  }

  if (error && !rowsPage) {
    return <EmptyState description={error.message} title="Satırlar yüklenemedi" />;
  }

  if (!rowsPage) {
    return <ProductionPlanRowsSkeleton />;
  }

  const rows = rowsPage.rows;
  const totalPages = Math.max(1, Math.ceil(rowsPage.totalCount / rowsPage.limit));

  if (rows.length === 0) {
    return (
      <EmptyState
        description="Bu yükleme için satır bulunamadı."
        title="Satır yok"
      />
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            Hafta {batch.weekNumber ?? "-"} satırları
          </p>
          <p className="text-xs text-muted-foreground">
            {rowsPage.totalCount.toLocaleString("tr-TR")} kayıt · Sayfa {page}/
            {totalPages}
          </p>
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Önceki
            </Button>
            <Button
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Sonraki
            </Button>
          </div>
        ) : null}
      </div>

      <DataTableShell
        columns={rowColumns}
        emptyDescription="Bu batch için satır bulunamadı."
        emptyTitle="Satır yok"
        getRowKey={(row) => row.id}
        isFetching={isFetching}
        minWidth={1520}
        mobileCard={(row) => (
          <EntitySummaryCard
            description={row.materialName ?? "-"}
            eyebrow={`Satır ${row.rowIndex}`}
            facts={[
              { label: "Hafta", value: row.weekNumber ?? row.weekRaw ?? "-" },
              { label: "Miktar", value: formatNumber(row.quantity) },
              { label: "Profil kodu", value: row.mainProfileCode ?? "-" },
              { label: "Sipariş", value: row.workOrderNumber ?? "-" },
              {
                label: "Bölüm",
                value: row.departmentName ?? row.departmentCode ?? "-"
              }
            ]}
            status={
              <StatusBadge tone={row.isValid ? "success" : "danger"}>
                {row.isValid ? "Geçerli" : "Hatalı"}
              </StatusBadge>
            }
            title={row.materialCode ?? "Malzeme yok"}
          />
        )}
        rows={rows}
      />
    </div>
  );
}

export function ProductionPlanRowsSkeleton() {
  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton className="h-9 w-full" key={index} />
        ))}
      </div>
    </div>
  );
}

const rowColumns: DataTableColumn<ProductionPlanImportRow>[] = [
  { id: "row", header: "Sıra", cell: (row) => row.rowIndex, align: "center" },
  {
    id: "week",
    header: "Hafta",
    cell: (row) => row.weekNumber ?? row.weekRaw ?? "-",
    align: "center"
  },
  { id: "customer", header: "Ad", cell: (row) => row.customerName ?? "-" },
  {
    id: "party",
    header: "Sip. veren",
    cell: (row) => row.orderingPartyCode ?? "-",
    align: "center"
  },
  {
    id: "customerOrder",
    header: "Müşt. no.",
    cell: (row) => row.customerOrderNumber ?? "-",
    align: "center"
  },
  {
    id: "item",
    header: "Kalem",
    cell: (row) => row.customerOrderItemNumber ?? "-",
    align: "center"
  },
  {
    id: "workOrder",
    header: "Sipariş",
    cell: (row) => row.workOrderNumber ?? "-",
    align: "center"
  },
  {
    id: "materialCode",
    header: "Malzeme no.",
    cell: (row) => <strong>{row.materialCode ?? "-"}</strong>,
    align: "center"
  },
  {
    id: "materialName",
    header: "Malzeme kısa metni",
    cell: (row) => row.materialName ?? "-"
  },
  {
    id: "mainProfileCode",
    header: "Profil kodu",
    cell: (row) => row.mainProfileCode ?? "-",
    align: "center"
  },
  {
    id: "quantity",
    header: "Miktar",
    cell: (row) => formatNumber(row.quantity),
    align: "right"
  },
  {
    id: "unit",
    header: "Birim",
    cell: (row) => row.orderUnit ?? "-",
    align: "center"
  },
  {
    id: "finish",
    header: "Planlı bitiş",
    cell: (row) => formatPlanDate(row.plannedFinishDate),
    align: "center"
  },
  {
    id: "department",
    header: "Bölüm",
    cell: (row) => row.departmentName ?? row.departmentCode ?? "-",
    align: "center"
  },
  {
    id: "priority",
    header: "Önc.",
    cell: (row) => row.priorityLevel ?? row.priority ?? "-",
    align: "center"
  },
  {
    id: "status",
    header: "Durum",
    cell: (row) => (
      <StatusBadge tone={row.isValid ? "success" : "danger"}>
        {row.isValid ? "Geçerli" : "Hatalı"}
      </StatusBadge>
    ),
    align: "center"
  }
];

function formatPlanDate(isoDate: string | null): string {
  if (!isoDate) {
    return "-";
  }

  const [year, month, day] = isoDate.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
    year: "numeric"
  });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    maximumFractionDigits: 2
  });
}
