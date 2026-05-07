export const SESSION_COOKIE_NAME = "lemnix_session";

export const LOGIN_ROUTE = "/login";
export const DASHBOARD_ROUTE = "/ana-sayfa";

/** Post-login redirect: same-origin paths only (open-redirect guard). */
export function safePostLoginRedirectPath(next: string | undefined): string | null {
  if (!next || typeof next !== "string") {
    return null;
  }
  const t = next.trim();

  if (!t.startsWith("/") || t.startsWith("//")) {
    return null;
  }
  if (t.includes("://")) {
    return null;
  }
  const pathOnly = t.split(/[?#]/)[0] ?? "";

  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) {
    return null;
  }

  return t.length > 0 ? t : null;
}
