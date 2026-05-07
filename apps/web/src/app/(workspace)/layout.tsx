import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireSessionCookie } from "@/server/auth/get-session";

type WorkspaceLayoutProps = Readonly<{
  children: ReactNode;
}>;

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children
}: WorkspaceLayoutProps) {
  await requireSessionCookie();

  return <AppShell>{children}</AppShell>;
}
