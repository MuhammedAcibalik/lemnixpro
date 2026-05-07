import { uploadProductionPlanAction } from "@/features/production-plans/actions";
import { ProductionPlanUploadForm } from "@/features/production-plans/production-plan-upload-form";
import { UretimPlaniPageClient } from "@/features/workspace/uretim-plani-page-client";
import { readFlashMessage } from "@/lib/query";
import { FlashMessage } from "@/ui/flash-message";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";

type UretimPlaniPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function UretimPlaniPage({
  searchParams
}: UretimPlaniPageProps) {
  const raw = await searchParams;
  const notice = readFlashMessage(raw.notice);
  const error = readFlashMessage(raw.error);

  return (
    <div className="page-stack">
      <PageHeader
        actions={
          <div id="production-plan-upload">
            <ProductionPlanUploadForm action={uploadProductionPlanAction} />
          </div>
        }
        badge={{ label: "Anlık", tone: "info" }}
        description="Haftalık importlar, aktif batch seçimi ve satır doğrulama akışı tek çalışma yüzeyinde yönetilir."
        eyebrow="Planlama"
        title="Üretim Planı"
      />

      {notice ? <FlashMessage message={notice} tone="success" /> : null}
      {error ? <FlashMessage message={error} tone="danger" /> : null}

      <Panel
        description="Hafta bazlı batch, aktivasyon ve satır doğrulama görünümü."
        title="Haftalık üretim planları"
      >
        <UretimPlaniPageClient />
      </Panel>
    </div>
  );
}
