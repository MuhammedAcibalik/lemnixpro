"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, FileText, Table2 } from "lucide-react";
import type {
  CutListCuttingLine,
  CutListProductItem,
  CutListSnapshotDetail
} from "@lemnixpro/shared-contracts";

import {
  WorkspaceDialog,
  WorkspaceDialogBody,
  WorkspaceDialogContent,
  WorkspaceDialogFooter,
  WorkspaceDialogHeader,
  WorkspaceDialogTitleBlock
} from "@/components/shell/workspace-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { DataTableShell, type DataTableColumn } from "@/ui/data-table-shell";
import { EntitySummaryCard } from "@/ui/entity-summary-card";
import { PageHeader } from "@/ui/page-header";
import { StatusBadge } from "@/ui/status-badge";

type CutListDetailClientProps = {
  detail: CutListSnapshotDetail;
};

const itemColumns: DataTableColumn<CutListProductItem>[] = [
  {
    id: "material",
    header: "Malzeme",
    cell: (item) => <strong>{item.materialCode}</strong>
  },
  {
    id: "name",
    header: "Ad",
    cell: (item) => item.materialName ?? "-"
  },
  {
    id: "workOrder",
    header: "İş emri",
    cell: (item) => item.workOrderNumber ?? "-"
  },
  {
    id: "color",
    header: "Renk",
    cell: (item) => item.materialColor
  },
  {
    id: "size",
    header: "Ebat",
    cell: (item) => item.materialSize ?? "-"
  },
  {
    id: "quantity",
    header: "Miktar",
    cell: (item) => `${item.orderQuantity} ${item.orderUnit ?? ""}`.trim(),
    align: "right"
  },
  {
    id: "cutting",
    header: "Kesim",
    cell: (item) => item.cuttingLines.length,
    align: "right"
  }
];

const cuttingLineColumns: DataTableColumn<CutListCuttingLine>[] = [
  {
    id: "profileCode",
    header: "Profil kodu",
    cell: (line) => line.profileCode
  },
  {
    id: "profileName",
    header: "Profil adı",
    cell: (line) => line.profileName
  },
  {
    id: "cuttingName",
    header: "Kesim adı",
    cell: (line) => line.cuttingName
  },
  {
    id: "length",
    header: "Ölçü",
    cell: (line) => `${line.cuttingLengthMm} mm`,
    align: "right"
  },
  {
    id: "quantity",
    header: "Miktar",
    cell: (line) => line.cuttingQuantity,
    align: "right"
  }
];

export function CutListDetailClient({ detail }: CutListDetailClientProps) {
  const [isTableMode, setIsTableMode] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CutListProductItem | null>(
    null
  );
  const totalOrderQuantity = detail.items.reduce(
    (total, item) => total + item.orderQuantity,
    0
  );

  return (
    <>
      <section className="grid gap-4">
        <PageHeader
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/kesim-listesi" prefetch>
                  <ArrowLeft />
                  Listeler
                </Link>
              </Button>
              <Button
                aria-label="PDF olarak yazdır"
                onClick={() => window.print()}
                type="button"
                variant="outline"
              >
                <FileText />
                Yazdır
              </Button>
              <Button
                aria-label="Tablo görünümünü değiştir"
                onClick={() => setIsTableMode((current) => !current)}
                type="button"
                variant="outline"
              >
                <Table2 />
                {isTableMode ? "Kart görünümü" : "Tablo görünümü"}
              </Button>
            </>
          }
          badge={{ label: `${detail.items.length} ürün`, tone: "info" }}
          description={`${detail.items.length} ürün · ${detail.snapshot.totalProductionRows} iş emri · ${totalOrderQuantity} adet`}
          eyebrow="Kesim listesi"
          title={`${detail.snapshot.planYear} / Hafta ${detail.snapshot.weekNumber} Kesim Listesi`}
        />

        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Haftalık kesim kalemleri</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Satırlar premium yoğun operasyon görünümü için optimize edildi.
                </p>
              </div>
              <StatusBadge tone="info">{detail.items.length} ürün</StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {isTableMode ? (
              <DataTableShell
                columns={itemColumns}
                emptyDescription="Bu snapshot içinde kesim kalemi yok."
                emptyTitle="Kesim kalemi yok"
                getRowKey={(item) => item.productionRowId}
                minWidth={1080}
                mobileCard={(item) => renderItemCard(item, setSelectedItem)}
                rowActions={(item) => (
                  <Button
                    onClick={() => setSelectedItem(item)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye />
                    Görüntüle
                  </Button>
                )}
                rows={detail.items}
              />
            ) : (
              <div className="grid gap-3">
                {detail.items.map((item) =>
                  renderItemCard(item, setSelectedItem)
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <WorkspaceDialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
          }
        }}
      >
        {selectedItem ? (
          <WorkspaceDialogContent size="lg">
            <WorkspaceDialogHeader>
              <WorkspaceDialogTitleBlock
                description={`Malzeme: ${selectedItem.materialCode} · Renk: ${selectedItem.materialColor} · Ebat: ${selectedItem.materialSize ?? "-"}`}
                eyebrow="Kesim kalemi"
                title={selectedItem.materialName ?? selectedItem.materialCode}
              />
            </WorkspaceDialogHeader>
            <WorkspaceDialogBody>
              <CuttingLines item={selectedItem} />
            </WorkspaceDialogBody>
            <WorkspaceDialogFooter>
              <Button onClick={() => setSelectedItem(null)} type="button">
                Kapat
              </Button>
            </WorkspaceDialogFooter>
          </WorkspaceDialogContent>
        ) : null}
      </WorkspaceDialog>

    </>
  );
}

function renderItemCard(
  item: CutListProductItem,
  setSelectedItem: (item: CutListProductItem) => void
) {
  return (
    <EntitySummaryCard
      actions={
        <>
          <Button onClick={() => setSelectedItem(item)} size="sm" type="button" variant="outline">
            <Eye />
            Görüntüle
          </Button>
        </>
      }
      description={item.materialName ?? item.materialCode}
      eyebrow={item.workOrderNumber ?? "İş emri yok"}
      facts={[
        { label: "Miktar", value: `${item.orderQuantity} ${item.orderUnit ?? "adet"}` },
        { label: "Kesim", value: item.cuttingLines.length },
        { label: "Renk", value: item.materialColor },
        { label: "Ebat", value: item.materialSize ?? "-" }
      ]}
      key={item.productionRowId}
      status={<StatusBadge tone="neutral">{item.materialCode}</StatusBadge>}
      title={item.materialName ?? item.materialCode}
    />
  );
}

function CuttingLines({ item }: { item: CutListProductItem }) {
  return (
    <DataTableShell
      columns={cuttingLineColumns}
      emptyDescription="Bu ürün için kesim satırı bulunamadı."
      emptyTitle="Kesim satırı yok"
      getRowKey={(line) => `${line.profileCode}-${line.cuttingCode}`}
      minWidth={820}
      rows={item.cuttingLines}
    />
  );
}
