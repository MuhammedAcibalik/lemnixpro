import { AnaSayfaClient } from "@/features/workspace/ana-sayfa-client";
import { PageHeader } from "@/ui/page-header";

export default function AnaSayfaPage() {
  return (
    <div className="page-stack">
      <PageHeader
        badge={{ label: "Anlık", tone: "success" }}
        description="Plan, profil, kesim ve optimizasyon hazırlığını tek kurumsal kontrol yüzeyinde takip edin."
        eyebrow="Operasyon merkezi"
        title="Ana Sayfa"
      />
      <AnaSayfaClient />
    </div>
  );
}
