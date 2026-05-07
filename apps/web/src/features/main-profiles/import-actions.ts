"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withQuery } from "@/lib/query";
import { getGatewayErrorMessage } from "@/server/gateway/http";
import {
  createMainProfile,
  updateMainProfile,
  uploadMainProfiles
} from "@/server/gateway/main-profiles";

type EditableCuttingSpec = {
  cuttingCode: string;
  cuttingName: string;
  cuttingLengthMm: number;
  unitQuantity: number;
  unitName: string;
};

type EditableProfile = {
  id?: string;
  code: string;
  name: string;
  stockLengthMm: number;
  isActive: boolean;
  cuttingSpecs: EditableCuttingSpec[];
};

type EditableProductGroup = {
  productCode: string;
  productName: string;
  profiles: EditableProfile[];
};

export async function importMainProfiles(formData: FormData): Promise<void> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect(
      withQuery("/profil-yonetimi", {
        error: "Profil Yönetimi için geçerli bir .xlsx dosyası seçin."
      })
    );
  }

  const batch = await uploadMainProfiles(file).catch((error: unknown) => {
    redirect(
      withQuery("/profil-yonetimi", {
        error: getGatewayErrorMessage(error)
      })
    );
  });

  revalidatePath("/profil-yonetimi");
  revalidatePath("/ana-sayfa");
  redirect(
    withQuery("/profil-yonetimi", {
      notice: buildImportNotice(batch)
    })
  );
}

function buildImportNotice(batch: {
  importedProfileCount: number;
  importedCuttingSpecCount: number;
  invalidRowCount: number;
  invalidReasonCounts?: Array<{ reason: string; count: number }>;
}): string {
  const base = `${batch.importedProfileCount} profil ve ${batch.importedCuttingSpecCount} düz kesim içeri aktarıldı.`;

  if (batch.invalidRowCount <= 0) {
    return base;
  }

  const topReasons =
    batch.invalidReasonCounts
      ?.slice(0, 3)
      .map((entry) => `${entry.count}× ${entry.reason}`)
      .join("; ") ?? "";

  return `${base} ${batch.invalidRowCount} satır içeri alınmadı${
    topReasons ? ` (${topReasons})` : ""
  }.`;
}

export async function saveMainProfileProductGroup(
  formData: FormData
): Promise<void> {
  const rawPayload = formData.get("payload");

  if (typeof rawPayload !== "string" || rawPayload.trim() === "") {
    redirect(
      withQuery("/profil-yonetimi", {
        error: "Kaydedilecek profil verisi bulunamadı."
      })
    );
  }

  let payload: EditableProductGroup;

  try {
    payload = JSON.parse(rawPayload) as EditableProductGroup;
  } catch {
    redirect(
      withQuery("/profil-yonetimi", {
        error: "Profil düzenleme verisi okunamadı."
      })
    );
  }

  try {
    for (const profile of payload.profiles) {
      const request = {
        code: profile.code,
        name: profile.name,
        stockLengthMm: profile.stockLengthMm,
        linkedProductCode: payload.productCode,
        linkedProductName: payload.productName,
        isActive: profile.isActive,
        cuttingSpecs: profile.cuttingSpecs.map((spec) => ({
          cuttingCode: spec.cuttingCode,
          cuttingName: spec.cuttingName,
          cuttingLengthMm: spec.cuttingLengthMm,
          unitQuantity: spec.unitQuantity,
          unitName: spec.unitName
        }))
      };

      if (profile.id && !profile.id.startsWith("new-")) {
        await updateMainProfile(profile.id, request);
        continue;
      }

      await createMainProfile(request);
    }
  } catch (error) {
    redirect(
      withQuery("/profil-yonetimi", {
        error: getGatewayErrorMessage(error)
      })
    );
  }

  revalidatePath("/profil-yonetimi");
  revalidatePath("/ana-sayfa");
  redirect(
    withQuery("/profil-yonetimi", {
      notice: "Profil yönetimi verileri kaydedildi."
    })
  );
}
