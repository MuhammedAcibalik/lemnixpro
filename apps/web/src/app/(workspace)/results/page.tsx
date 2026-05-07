import { ResultsPageClient } from "@/features/workspace/results-page-client";
import { PageHeader } from "@/ui/page-header";

export default function ResultsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        badge={{ label: "Anlık", tone: "info" }}
        description="Optimization engine tarafından yayınlanan completed/failed olaylarından oluşan sonuç kayıtlarını izleyin."
        eyebrow="Optimizasyon çıktıları"
        title="Sonuçlar"
      />
      <ResultsPageClient />
    </div>
  );
}
