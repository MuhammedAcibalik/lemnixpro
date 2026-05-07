"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withQuery } from "@/lib/query";
import { createCutListSnapshot } from "@/server/gateway/cut-lists";
import { getGatewayErrorMessage } from "@/server/gateway/http";

export async function generateCutListSnapshot(formData: FormData): Promise<void> {
  const rawWeekNumber = formData.get("weekNumber");
  const weekNumber =
    typeof rawWeekNumber === "string" ? Number(rawWeekNumber) : Number.NaN;

  if (!Number.isInteger(weekNumber) || weekNumber <= 0) {
    redirect(
      withQuery("/kesim-listesi", {
        error: "Geçerli bir hafta numarası girin."
      })
    );
  }

  try {
    const detail = await createCutListSnapshot(weekNumber);

    revalidatePath("/ana-sayfa");
    revalidatePath("/kesim-listesi");
    redirect(
      withQuery(`/kesim-listesi/${detail.snapshot.id}`, {
        notice: `${weekNumber}. hafta kesim listesi üretildi.`
      })
    );
  } catch (error) {
    redirect(
      withQuery("/kesim-listesi", {
        error: getGatewayErrorMessage(error)
      })
    );
  }
}
