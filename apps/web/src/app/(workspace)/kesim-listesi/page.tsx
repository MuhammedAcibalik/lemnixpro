import { KesimListesiPageClient } from "@/features/workspace/kesim-listesi-page-client";
import { readFlashMessage } from "@/lib/query";
import { FlashMessage } from "@/ui/flash-message";
import { PageHeader } from "@/ui/page-header";

type KesimListesiPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function KesimListesiPage({
  searchParams
}: KesimListesiPageProps) {
  const { error, notice } = await searchParams;

  return (
    <div className="page-stack">
      <PageHeader
        badge={{ label: "Otonom", tone: "success" }}
        description="Aktif üretim planı batch'i onaylandığında kesim listesi yıl ve hafta bazında otomatik oluşturulur."
        eyebrow="Kesim listesi"
        title="Otonom Haftalık Kesim Listeleri"
      />
      {readFlashMessage(notice) ? (
        <FlashMessage message={readFlashMessage(notice) ?? ""} tone="success" />
      ) : null}
      {readFlashMessage(error) ? (
        <FlashMessage message={readFlashMessage(error) ?? ""} tone="danger" />
      ) : null}
      <KesimListesiPageClient />
    </div>
  );
}
