import type {
  OptimizationRequestStatus,
  OptimizationResultStatus,
  ProductionPlanImportBatch,
  ProductionPlanImportBatchStatus
} from "@lemnixpro/shared-contracts";
import type { UserRole } from "@lemnixpro/shared-types";

import type { ModuleStatus } from "./navigation";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "planned";

export function getAvailabilityMeta(
  availability: ModuleStatus
): { label: string; tone: StatusTone } {
  return availability === "active"
    ? { label: "Aktif yüzey", tone: "success" }
    : { label: "Hazırlanıyor", tone: "planned" };
}

/** Sunucu aktivasyonda özet/hafta düzeltmesi yapabilir; UI yalnızca geçerli satır yoksa engeller. */
export function canActivateProductionPlanBatch(
  batch: ProductionPlanImportBatch
): boolean {
  return batch.status !== "active" && batch.validRowCount > 0;
}

export function getProductionPlanStatusMeta(
  status: ProductionPlanImportBatchStatus
): { label: string; tone: StatusTone } {
  switch (status) {
    case "active":
      return { label: "Aktif batch", tone: "success" };
    case "superseded":
      return { label: "Yerini yenisi aldı", tone: "warning" };
    default:
      return { label: "İçe aktarıldı", tone: "info" };
  }
}

export function getOptimizationStatusMeta(
  status: OptimizationRequestStatus
): { label: string; tone: StatusTone } {
  switch (status) {
    case "queued":
      return { label: "Kuyrukta", tone: "success" };
    case "ready":
      return { label: "Hazır", tone: "info" };
    case "failed_preparation":
      return { label: "Hazırlık hatası", tone: "danger" };
    default:
      return { label: "Oluşturuldu", tone: "neutral" };
  }
}

export function getOptimizationResultStatusMeta(
  status: OptimizationResultStatus
): { label: string; tone: StatusTone } {
  return status === "completed"
    ? { label: "Tamamlandı", tone: "success" }
    : { label: "Hatalı", tone: "danger" };
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Yönetici";
    case "PLANNER":
      return "Planlamacı";
    default:
      return "Görüntüleyici";
  }
}
