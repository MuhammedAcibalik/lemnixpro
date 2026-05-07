import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth";

import { getServerEnv } from "../env";

export function parseDurationToSeconds(value: string): number | undefined {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();

  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 60 * 60 * 24;
    default:
      return undefined;
  }
}

export async function readSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();

  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function requireSessionToken(): Promise<string> {
  const token = await readSessionToken();

  if (!token) {
    throw new Error("Session token is missing.");
  }

  return token;
}

export async function writeSessionToken(
  token: string,
  expiresIn: string
): Promise<void> {
  const cookieStore = await cookies();
  const { isProduction } = getServerEnv();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: parseDurationToSeconds(expiresIn)
  });
}

export async function clearSessionToken(): Promise<void> {
  const cookieStore = await cookies();
  const { isProduction } = getServerEnv();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: new Date(0)
  });
}
