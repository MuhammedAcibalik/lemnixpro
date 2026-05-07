"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withQuery } from "@/lib/query";
import {
  createOptimizationRequest,
  requeueOptimizationRequest
} from "@/server/gateway/optimization-requests";
import { getGatewayErrorMessage } from "@/server/gateway/http";

function readWeekNumber(formData: FormData): number {
  const value = formData.get("weekNumber");
  return Number(typeof value === "string" ? value : "");
}

export async function createOptimizationRequestAction(formData: FormData) {
  const weekNumber = readWeekNumber(formData);

  try {
    const response = await createOptimizationRequest({
      weekNumber
    });

    revalidatePath("/dashboard");
    revalidatePath("/optimization-requests");
    redirect(
      withQuery(`/optimization-requests/${response.request.id}`, {
        notice: "Optimizasyon istegi olusturuldu."
      })
    );
  } catch (error) {
    redirect(
      withQuery("/optimization-requests", {
        error: getGatewayErrorMessage(error),
        previewWeek: String(weekNumber)
      })
    );
  }
}

export async function requeueOptimizationRequestAction(id: string) {
  try {
    await requeueOptimizationRequest(id);
  } catch (error) {
    redirect(
      withQuery(`/optimization-requests/${id}`, {
        error: getGatewayErrorMessage(error)
      })
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/optimization-requests");
  revalidatePath(`/optimization-requests/${id}`);
  redirect(
    withQuery(`/optimization-requests/${id}`, {
      notice: "Istek yeniden kuyruga gonderildi."
    })
  );
}
