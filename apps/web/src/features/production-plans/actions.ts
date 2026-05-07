"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withQuery } from "@/lib/query";
import { getGatewayErrorMessage } from "@/server/gateway/http";
import {
  activateProductionPlanImport,
  deleteProductionPlanImport,
  updateProductionPlanRow,
  uploadProductionPlan
} from "@/server/gateway/production-plans";

function readOptionalScalar(formData: FormData, key: string): string | null {
  const rawValue = formData.get(key);
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  return value ? value : null;
}

export async function uploadProductionPlanAction(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect(
      withQuery("/uretim-plani", {
        error: "Lütfen geçerli bir Excel dosyası seçin."
      })
    );
  }

  const batch = await uploadProductionPlan(file).catch((error: unknown) => {
    redirect(
      withQuery("/uretim-plani", {
        error: getGatewayErrorMessage(error)
      })
    );
  });

  revalidatePath("/ana-sayfa");
  revalidatePath("/kesim-listesi");
  revalidatePath("/uretim-plani");
  redirect(
    withQuery("/uretim-plani", {
      notice: `${batch.weekNumber ?? "?"}. hafta üretim planı yüklendi (${batch.totalRowCount} satır).`
    })
  );
}

export async function activateProductionPlanImportAction(id: string) {
  await activateProductionPlanImport(id).catch((error: unknown) => {
    redirect(
      withQuery("/uretim-plani", {
        error: getGatewayErrorMessage(error)
      })
    );
  });

  revalidatePath("/ana-sayfa");
  revalidatePath("/uretim-plani");
  redirect(
    withQuery("/uretim-plani", {
      notice: "Batch aktif hale getirildi."
    })
  );
}

export async function deleteProductionPlanImportAction(id: string) {
  await deleteProductionPlanImport(id).catch((error: unknown) => {
    redirect(
      withQuery("/uretim-plani", {
        error: getGatewayErrorMessage(error)
      })
    );
  });

  revalidatePath("/ana-sayfa");
  revalidatePath("/uretim-plani");
  redirect(
    withQuery("/uretim-plani", {
      notice: "Üretim planı silindi."
    })
  );
}

export async function updateProductionPlanRowAction(
  batchId: string,
  rowId: string,
  formData: FormData
) {
  await updateProductionPlanRow(rowId, {
    customerName: readOptionalScalar(formData, "customerName"),
    materialCode: readOptionalScalar(formData, "materialCode"),
    mainProfileCode: readOptionalScalar(formData, "mainProfileCode"),
    quantity: readOptionalScalar(formData, "quantity"),
    plannedFinishDate: readOptionalScalar(formData, "plannedFinishDate"),
    priority: readOptionalScalar(formData, "priority")
  }).catch((error: unknown) => {
    redirect(
      withQuery(`/production-plans/${batchId}`, {
        error: getGatewayErrorMessage(error),
        editRow: rowId
      })
    );
  });

  revalidatePath("/ana-sayfa");
  revalidatePath("/uretim-plani");
  revalidatePath(`/production-plans/${batchId}`);
  redirect(
    withQuery(`/production-plans/${batchId}`, {
      notice: "Satır düzeltmesi kaydedildi."
    })
  );
}
