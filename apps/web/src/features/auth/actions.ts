"use server";

import type { LoginRequest } from "@lemnixpro/shared-contracts";
import { redirect } from "next/navigation";

import { DASHBOARD_ROUTE, LOGIN_ROUTE, safePostLoginRedirectPath } from "@/lib/auth";
import { clearSessionToken, writeSessionToken } from "@/server/auth/session";
import { login } from "@/server/gateway/auth";
import { getGatewayErrorMessage } from "@/server/gateway/http";

export type LoginFormState = {
  email: string;
  message: string | null;
};

export async function loginAction(
  _state: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const email = readString(formData, "email").trim().toLowerCase();
  const password = readString(formData, "password");
  const nextRaw = readString(formData, "next");
  const afterLogin =
    safePostLoginRedirectPath(nextRaw) ?? DASHBOARD_ROUTE;

  if (!email || !password) {
    return {
      email,
      message: "E-posta ve parola alanlarını doldurun."
    };
  }

  const payload: LoginRequest = {
    email,
    password
  };

  try {
    const response = await login(payload);
    await writeSessionToken(response.accessToken, response.expiresIn);
  } catch (error) {
    return {
      email,
      message: getGatewayErrorMessage(error)
    };
  }

  redirect(afterLogin);
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
  redirect(LOGIN_ROUTE);
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
