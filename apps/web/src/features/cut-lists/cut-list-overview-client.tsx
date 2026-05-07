"use client";

import Link from "next/link";
import { ArrowRight, Scissors } from "lucide-react";
import type { CutListSnapshotSummary } from "@lemnixpro/shared-contracts";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EmptyState } from "@/ui/empty-state";
import { EntitySummaryCard } from "@/ui/entity-summary-card";
import { InlineRefresh } from "@/ui/inline-refresh";
import { StatusBadge } from "@/ui/status-badge";
import { workspaceQueries } from "@/lib/workspace-query";

type CutListOverviewClientProps = {
  isFetching?: boolean;
  snapshots: CutListSnapshotSummary[];
};

export function CutListOverviewClient({
  isFetching = false,
  snapshots
}: CutListOverviewClientProps) {
  const queryClient = useQueryClient();
  const prefetchDetail = (id: string) => {
    void queryClient.prefetchQuery(workspaceQueries.cutListDetail(id));
  };

  return (
    <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <CardHeader className="flex flex-col gap-3 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-blue-50 text-blue-700">
            <Scissors className="size-5" />
          </div>
          <div>
            <CardTitle>Otonom oluşturulan kesim listeleri</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {snapshots.length} adet yıl/hafta kesim listesi bulundu. Eşleşmeyen
              sayısı, üretim planı satırının aktif ana profil ile (ürün kodu, ürün adı,
              güvenli renk/ebat) eşlenemediği durumları gösterir; veri veya profil
              düzeltildiğinde güncel rakamlar yeniden hesaplama ile güncellenir.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFetching ? <InlineRefresh /> : null}
          <StatusBadge tone={snapshots.length > 0 ? "success" : "neutral"}>
            {snapshots.length > 0
              ? "Hazır"
              : isFetching
                ? "Yükleniyor"
                : "Henüz yok"}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {snapshots.length === 0 ? (
          <EmptyState
            description="Üretim planında bir batch aktif olduğunda ilgili yıl ve hafta için kesim listesi otomatik oluşur."
            title="Henüz otonom kesim listesi yok"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshots.map((snapshot, index) => (
              <EntitySummaryCard
                actions={
                  <Button asChild variant="outline">
                    <Link
                      href={`/kesim-listesi/${snapshot.id}`}
                      onFocus={() => prefetchDetail(snapshot.id)}
                      onPointerEnter={() => prefetchDetail(snapshot.id)}
                      prefetch
                    >
                      Listeyi aç
                      <ArrowRight />
                    </Link>
                  </Button>
                }
                description={new Date(snapshot.createdAt).toLocaleDateString("tr-TR")}
                eyebrow={`${snapshot.planYear} / Hafta ${snapshot.weekNumber}`}
                facts={[
                  { label: "Eşleşen satır", value: snapshot.matchedProductionRows },
                  { label: "Toplam satır", value: snapshot.totalProductionRows },
                  {
                    label: "Eşleşmeyen",
                    value: snapshot.unmatchedProductionRows
                  }
                ]}
                key={snapshot.id}
                status={index === 0 ? <StatusBadge tone="success">Son liste</StatusBadge> : null}
                title={`${snapshot.planYear} - ${snapshot.weekNumber}. Hafta`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
