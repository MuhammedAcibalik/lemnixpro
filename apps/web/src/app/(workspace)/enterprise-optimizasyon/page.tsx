import { EnterpriseOptimizasyonClient } from "@/features/workspace/enterprise-optimizasyon-client";
import { PageHeader } from "@/ui/page-header";

export default function EnterpriseOptimizasyonPage() {
  return (
    <div className="page-stack">
      <PageHeader
        badge={{ label: "Anlık", tone: "info" }}
        description="Kesim listesi snapshot'larından optimizasyon kuyruğunu, eşleşme durumunu ve işlem hazırlığını takip edin."
        eyebrow="Optimizasyon"
        title="Enterprise Optimizasyon"
      />
      <EnterpriseOptimizasyonClient />
    </div>
  );
}
