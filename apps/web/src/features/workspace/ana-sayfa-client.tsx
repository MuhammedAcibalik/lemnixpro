"use client";

import { ClipboardList, Gauge, Layers3, Scissors } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { workspaceQueries } from "@/lib/workspace-query";
import { EmptyState } from "@/ui/empty-state";
import { MetricCard } from "@/ui/metric-card";
import { Panel } from "@/ui/panel";
import { MetricGridSkeleton } from "@/ui/compact-data-skeleton";

const capabilities = [
  {
    icon: ClipboardList,
    label: "Üretim planı",
    text: "Excel ile gelen sipariş verisi sürümlenir, doğrulanır ve aktif plan olarak seçilir.",
    title: "Haftalık batch disiplini"
  },
  {
    icon: Layers3,
    label: "Profil yönetimi",
    text: "Ana ürün, profil ve düz kesim tanımları tek yönetim yüzeyinde korunur.",
    title: "Ana ürün hiyerarşisi"
  },
  {
    icon: Scissors,
    label: "Kesim listesi",
    text: "Aktif hafta planı ile aktif profil verisi eşleştirilir ve haftalık liste üretilir.",
    title: "Snapshot üretimi"
  },
  {
    icon: Gauge,
    label: "Optimizasyon",
    text: "Eşleşen talepler optimizasyon kuyruğuna hazırlanır; eksikler görünür kalır.",
    title: "Hazırlık ve izlenebilirlik"
  }
];

export function AnaSayfaClient() {
  const overviewQuery = useQuery(workspaceQueries.workspaceOverview());
  const summary = overviewQuery.data?.summary;

  return (
    <>
      {overviewQuery.isError && !overviewQuery.data ? (
        <EmptyState
          description={overviewQuery.error.message}
          title="Operasyon özeti alınamadı"
        />
      ) : null}
      {overviewQuery.isLoading && !overviewQuery.data ? (
        <MetricGridSkeleton />
      ) : (
        <section className="metric-grid">
          <MetricCard
            label="Aktif hafta"
            meta={`${summary?.activeBatchCount ?? 0} aktif batch`}
            tone="success"
            value={summary?.activeWeek ? `${summary.activeWeek}` : "-"}
          />
          <MetricCard
            label="Profil kapsamı"
            meta={`${summary?.cuttingSpecCount ?? 0} düz kesim tanımı`}
            tone="info"
            value={`${summary?.profileCount ?? 0}`}
          />
          <MetricCard
            label="Plan satırı"
            meta="Geçerli içe aktarılan satır"
            tone="neutral"
            value={`${summary?.validProductionRows ?? 0}`}
          />
          <MetricCard
            label="Eşleşmeyen"
            meta="Son kesim snapshot'ı"
            tone={summary?.latestCutListUnmatchedRows ? "danger" : "success"}
            value={
              summary?.latestCutListUnmatchedRows !== null &&
              summary?.latestCutListUnmatchedRows !== undefined
                ? `${summary.latestCutListUnmatchedRows}`
                : "-"
            }
          />
        </section>
      )}
      <Panel
        description="Mikroservis sınırları korunurken web katmanı yalnızca operasyon orkestrasyonu yapar."
        title="LemnixPRO operasyon modeli"
      >
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {capabilities.map((capability) => {
            const Icon = capability.icon;

            return (
              <Card
                className="shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                key={capability.label}
              >
                <CardContent className="grid gap-3 p-4">
                  <div className="grid size-9 place-items-center rounded-md bg-blue-50 text-blue-700">
                    <Icon className="size-4" />
                  </div>
                  <div className="grid gap-1">
                    <p className="text-[11px] font-semibold uppercase text-primary">
                      {capability.label}
                    </p>
                    <h2 className="text-base font-semibold text-foreground">
                      {capability.title}
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {capability.text}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </Panel>
    </>
  );
}
