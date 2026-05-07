import { OperasyonAnalitigiClient } from "@/features/workspace/operasyon-analitigi-client";
import { PageHeader } from "@/ui/page-header";

export default function OperasyonAnalitigiPage() {
  return (
    <div className="page-stack">
      <PageHeader
        badge={{ label: "Anlık", tone: "info" }}
        description="Haftalık plan, aktif batch ve kesim snapshot akışını tek ekranda izleyin."
        eyebrow="Operasyon görünürlüğü"
        title="Operasyon Analitiği"
      />
      <OperasyonAnalitigiClient />
    </div>
  );
}
