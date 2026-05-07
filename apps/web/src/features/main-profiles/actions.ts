"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withQuery } from "@/lib/query";
import { createMainProfile, activateMainProfile, deactivateMainProfile, updateMainProfile } from "@/server/gateway/main-profiles";
import { getGatewayErrorMessage } from "@/server/gateway/http";

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value ? value : null;
}

function readBoolean(formData: FormData, key: string): boolean {
  return formData
    .getAll(key)
    .some((value) => typeof value === "string" && value.toLowerCase() === "true");
}

function buildMainProfileRequest(formData: FormData) {
  return {
    code: readString(formData, "code"),
    name: readString(formData, "name"),
    stockLengthMm: Number(readString(formData, "stockLengthMm")),
    linkedProductCode: readString(formData, "linkedProductCode"),
    linkedProductName: readString(formData, "linkedProductName"),
    isActive: readBoolean(formData, "isActive"),
    notes: readOptionalString(formData, "notes")
  };
}

export async function createMainProfileAction(formData: FormData) {
  try {
    await createMainProfile(buildMainProfileRequest(formData));
  } catch (error) {
    redirect(
      withQuery("/main-profiles/new", {
        error: getGatewayErrorMessage(error)
      })
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/main-profiles");
  redirect(
    withQuery("/main-profiles", {
      notice: "Main profile kaydi olusturuldu."
    })
  );
}

export async function updateMainProfileAction(id: string, formData: FormData) {
  try {
    await updateMainProfile(id, buildMainProfileRequest(formData));
  } catch (error) {
    redirect(
      withQuery(`/main-profiles/${id}`, {
        error: getGatewayErrorMessage(error)
      })
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/main-profiles");
  revalidatePath(`/main-profiles/${id}`);
  redirect(
    withQuery(`/main-profiles/${id}`, {
      notice: "Main profile guncellendi."
    })
  );
}

export async function activateMainProfileAction(id: string) {
  try {
    await activateMainProfile(id);
  } catch (error) {
    redirect(
      withQuery("/main-profiles", {
        error: getGatewayErrorMessage(error)
      })
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/main-profiles");
  revalidatePath(`/main-profiles/${id}`);
  redirect(
    withQuery("/main-profiles", {
      notice: "Main profile aktive alindi."
    })
  );
}

export async function deactivateMainProfileAction(id: string) {
  try {
    await deactivateMainProfile(id);
  } catch (error) {
    redirect(
      withQuery("/main-profiles", {
        error: getGatewayErrorMessage(error)
      })
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/main-profiles");
  revalidatePath(`/main-profiles/${id}`);
  redirect(
    withQuery("/main-profiles", {
      notice: "Main profile pasife alindi."
    })
  );
}
