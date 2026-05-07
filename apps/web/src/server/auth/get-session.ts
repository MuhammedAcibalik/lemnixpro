import "server-only";

import type { AuthenticatedUser } from "@lemnixpro/shared-contracts";
import { redirect } from "next/navigation";

import { DASHBOARD_ROUTE, LOGIN_ROUTE } from "@/lib/auth";

import { getCurrentUser } from "../gateway/auth";
import { isGatewayRequestError } from "../gateway/http";

import { readSessionToken } from "./session";

export type AppSession = {
  token: string;
  user: AuthenticatedUser;
};

export type LightweightSession = {
  token: string;
};

export async function getOptionalSession(): Promise<AppSession | null> {
  const token = await readSessionToken();

  if (!token) {
    return null;
  }

  try {
    const response = await getCurrentUser(token);

    return {
      token,
      user: response.user
    };
  } catch (error) {
    if (isGatewayRequestError(error) && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function requireSession(): Promise<AppSession> {
  const session = await getOptionalSession();

  if (!session) {
    redirect(LOGIN_ROUTE);
  }

  return session;
}

export async function requireSessionCookie(): Promise<LightweightSession> {
  const token = await readSessionToken();

  if (!token) {
    redirect(LOGIN_ROUTE);
  }

  return {
    token
  };
}

export async function redirectIfAuthenticated(): Promise<void> {
  const session = await getOptionalSession();

  if (session) {
    redirect(DASHBOARD_ROUTE);
  }
}
