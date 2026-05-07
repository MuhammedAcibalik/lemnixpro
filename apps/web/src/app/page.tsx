import { redirect } from "next/navigation";

import { DASHBOARD_ROUTE, LOGIN_ROUTE } from "@/lib/auth";
import { readSessionToken } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const token = await readSessionToken();

  redirect(token ? DASHBOARD_ROUTE : LOGIN_ROUTE);
}
