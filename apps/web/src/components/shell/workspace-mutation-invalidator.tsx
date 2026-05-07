"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import {
  invalidateWorkspaceQueries,
  workspaceQueryKeys,
  type WorkspaceMutationScope
} from "@/lib/workspace-query";

export function WorkspaceMutationInvalidator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const mutationSignal =
    searchParams.get("notice") ?? searchParams.get("error") ?? "";
  const scope = getMutationScope(pathname);

  useEffect(() => {
    if (!mutationSignal || !scope) {
      return;
    }

    invalidateWorkspaceQueries(queryClient, scope);

    if (scope !== "main-profiles") {
      return;
    }

    /**
     * Profil kaydı kesim reconcile'ı Rabbit + outbox üzerinden tetikler; snapshot birkaç
     * saniye sonra güncellenir. Tek invalidation kullanıcıya "hiç değişmedi" hissi verir.
     */
    const later = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.cutLists });
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.workspaceOverview
      });
    }, 5000);

    const laterAgain = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.cutLists });
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.workspaceOverview
      });
    }, 12000);

    return () => {
      window.clearTimeout(later);
      window.clearTimeout(laterAgain);
    };
  }, [mutationSignal, queryClient, scope]);

  return null;
}

function getMutationScope(pathname: string): WorkspaceMutationScope | null {
  if (pathname.startsWith("/uretim-plani")) {
    return "production-plans";
  }

  if (
    pathname.startsWith("/profil-yonetimi") ||
    pathname.startsWith("/main-profiles")
  ) {
    return "main-profiles";
  }

  if (pathname.startsWith("/kesim-listesi")) {
    return "cut-lists";
  }

  if (pathname.startsWith("/enterprise-optimizasyon")) {
    return "optimization";
  }

  if (pathname.startsWith("/results")) {
    return "results";
  }

  if (
    pathname.startsWith("/ana-sayfa") ||
    pathname.startsWith("/operasyon-analitigi")
  ) {
    return "workspace";
  }

  return null;
}
