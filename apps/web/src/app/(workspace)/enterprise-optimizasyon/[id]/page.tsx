import { OptimizationDetailClient } from "@/features/optimization/optimization-detail-client";

export default async function EnterpriseOptimizasyonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OptimizationDetailClient requestId={id} />;
}
