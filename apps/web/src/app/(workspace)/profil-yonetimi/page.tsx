import { ProfilYonetimiPageClient } from "@/features/workspace/profil-yonetimi-page-client";
import { readFlashMessage } from "@/lib/query";
import { FlashMessage } from "@/ui/flash-message";
import { PageHeader } from "@/ui/page-header";

type ProfilYonetimiPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
};

export default async function ProfilYonetimiPage({
  searchParams
}: ProfilYonetimiPageProps) {
  const { error, notice } = await searchParams;

  return (
    <div className="page-stack">
      <PageHeader
        badge={{ label: "Anlık", tone: "info" }}
        description="Ana ürün, ana profil ve düz kesim tanımlarını kurumsal operasyon standardında yönetin."
        eyebrow="Master data"
        title="Profil Yönetimi"
      />
      {readFlashMessage(notice) ? (
        <FlashMessage message={readFlashMessage(notice) ?? ""} tone="success" />
      ) : null}
      {readFlashMessage(error) ? (
        <FlashMessage message={readFlashMessage(error) ?? ""} tone="danger" />
      ) : null}
      <ProfilYonetimiPageClient />
    </div>
  );
}
