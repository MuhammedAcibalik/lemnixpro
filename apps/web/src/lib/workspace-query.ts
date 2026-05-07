"use client";

import type {
  CutListSnapshotSummary,
  CutListSnapshotDetail,
  MainProfile,
  OptimizationRequestSummary,
  OptimizationResultRecord,
  ProductionPlanImportBatch,
  ProductionPlanImportRowsPage,
  WorkspaceOverviewResponse,
  WorkspaceOverviewServiceName
} from "@lemnixpro/shared-contracts";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

export const workspaceQueryDefaults = {
  gcTime: 5 * 60 * 1000,
  staleTime: 15 * 1000
};

export const workspaceQueryKeys = {
  cutLists: ["cut-lists"] as const,
  cutListDetail: (id: string) => ["cut-lists", id] as const,
  mainProfiles: ["main-profiles"] as const,
  optimizationRequests: ["optimization-requests"] as const,
  productionPlanImports: ["production-plans", "imports"] as const,
  productionPlanRows: (batchId: string, page: number) =>
    ["production-plans", "imports", batchId, "rows", page] as const,
  results: ["results"] as const,
  workspaceOverview: ["workspace", "overview"] as const
};

const workspaceQueryRoots = new Set<string>([
  "cut-lists",
  "main-profiles",
  "optimization-requests",
  "production-plans",
  "results",
  "workspace"
]);

export class WorkspaceRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly service: string | null;

  constructor(input: {
    message: string;
    status: number;
    code?: string | null;
    requestId?: string | null;
    service?: string | null;
  }) {
    super(input.message);
    this.name = "WorkspaceRequestError";
    this.status = input.status;
    this.code = input.code ?? null;
    this.requestId = input.requestId ?? null;
    this.service = input.service ?? null;
  }
}

export function isWorkspaceRequestError(
  error: unknown
): error is WorkspaceRequestError {
  return error instanceof WorkspaceRequestError;
}

export type WorkspaceMutationScope =
  | "cut-lists"
  | "main-profiles"
  | "optimization"
  | "production-plans"
  | "results"
  | "workspace";

export const workspaceInvalidationTargets: Record<
  WorkspaceMutationScope,
  QueryKey[]
> = {
  "cut-lists": [workspaceQueryKeys.cutLists, workspaceQueryKeys.workspaceOverview],
  "main-profiles": [
    workspaceQueryKeys.mainProfiles,
    workspaceQueryKeys.workspaceOverview,
    workspaceQueryKeys.cutLists
  ],
  optimization: [
    workspaceQueryKeys.optimizationRequests,
    workspaceQueryKeys.results,
    workspaceQueryKeys.workspaceOverview
  ],
  "production-plans": [
    workspaceQueryKeys.productionPlanImports,
    workspaceQueryKeys.cutLists,
    workspaceQueryKeys.workspaceOverview
  ],
  results: [workspaceQueryKeys.results, workspaceQueryKeys.workspaceOverview],
  workspace: [
    workspaceQueryKeys.workspaceOverview,
    workspaceQueryKeys.cutLists,
    workspaceQueryKeys.mainProfiles,
    workspaceQueryKeys.optimizationRequests,
    workspaceQueryKeys.productionPlanImports,
    workspaceQueryKeys.results
  ]
};

export const workspaceQueries = {
  cutLists: () =>
    queryOptions({
      queryFn: () => fetchJson<CutListSnapshotSummary[]>("/api/cut-lists"),
      queryKey: workspaceQueryKeys.cutLists
    }),
  cutListDetail: (id: string) =>
    queryOptions({
      queryFn: () => fetchJson<CutListSnapshotDetail>(`/api/cut-lists/${id}`),
      queryKey: workspaceQueryKeys.cutListDetail(id)
    }),
  mainProfiles: () =>
    queryOptions({
      queryFn: () => fetchJson<MainProfile[]>("/api/main-profiles"),
      queryKey: workspaceQueryKeys.mainProfiles
    }),
  optimizationRequests: () =>
    queryOptions({
      queryFn: () =>
        fetchJson<OptimizationRequestSummary[]>("/api/optimization-requests"),
      queryKey: workspaceQueryKeys.optimizationRequests
    }),
  productionPlanImports: () =>
    queryOptions({
      queryFn: () =>
        fetchJson<ProductionPlanImportBatch[]>("/api/production-plans/imports"),
      queryKey: workspaceQueryKeys.productionPlanImports
    }),
  productionPlanRows: (batchId: string, page: number, limit = 100) =>
    queryOptions({
      placeholderData: keepPreviousData,
      queryFn: () =>
        fetchJson<ProductionPlanImportRowsPage>(
          `/api/production-plans/imports/${batchId}/rows?limit=${limit}&offset=${(page - 1) * limit}`
        ),
      queryKey: workspaceQueryKeys.productionPlanRows(batchId, page)
    }),
  results: () =>
    queryOptions({
      queryFn: () => fetchJson<OptimizationResultRecord[]>("/api/results"),
      queryKey: workspaceQueryKeys.results
    }),
  workspaceOverview: () =>
    queryOptions({
      queryFn: () => fetchJson<WorkspaceOverviewResponse>("/api/workspace/overview"),
      queryKey: workspaceQueryKeys.workspaceOverview
    })
};

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      accept: "application/json"
    }
  });
  const payload = (await response.json().catch(() => null)) as
    | { code?: string; message?: string; requestId?: string; service?: string }
    | T
    | null;

  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(returnTo)}`);
      throw new WorkspaceRequestError({
        status: 401,
        message:
          "Oturum süresi doldu veya geçersiz. Giriş sayfasına yönlendiriliyorsunuz."
      });
    }

    const payloadRecord =
      payload && typeof payload === "object"
        ? (payload as {
            code?: string;
            message?: string;
            requestId?: string;
            service?: string;
          })
        : null;

    throw new WorkspaceRequestError({
      status: response.status,
      message: payloadRecord?.message ?? "Veri alınamadı.",
      code: payloadRecord?.code ?? null,
      requestId: payloadRecord?.requestId ?? null,
      service: payloadRecord?.service ?? null
    });
  }

  return payload as T;
}

export function findServiceStatus(
  overview: WorkspaceOverviewResponse | undefined,
  serviceName: WorkspaceOverviewServiceName
) {
  return overview?.services.find((service) => service.service === serviceName);
}

export function prefetchWorkspaceRoute(queryClient: QueryClient, href: string) {
  void queryClient.prefetchQuery({
    ...workspaceQueries.workspaceOverview(),
    retry: false
  });

  const overview = queryClient.getQueryData<WorkspaceOverviewResponse>(
    workspaceQueryKeys.workspaceOverview
  );

  if (href.startsWith("/ana-sayfa")) {
    return;
  }

  if (href.startsWith("/uretim-plani")) {
    prefetchHealthyService(queryClient, overview, "production-plans");
    return;
  }

  if (href.startsWith("/kesim-listesi")) {
    prefetchHealthyService(queryClient, overview, "cut-lists");
    return;
  }

  if (href.startsWith("/profil-yonetimi")) {
    prefetchHealthyService(queryClient, overview, "main-profiles");
    return;
  }

  if (href.startsWith("/enterprise-optimizasyon")) {
    prefetchHealthyService(queryClient, overview, "optimization-requests");
    return;
  }

  if (href.startsWith("/operasyon-analitigi")) {
    prefetchHealthyService(queryClient, overview, "cut-lists");
    return;
  }

  if (href.startsWith("/results")) {
    prefetchHealthyService(queryClient, overview, "results");
    return;
  }
}

export async function prefetchWorkspaceWarmCache(
  queryClient: QueryClient
): Promise<void> {
  const overview =
    queryClient.getQueryData<WorkspaceOverviewResponse>(
      workspaceQueryKeys.workspaceOverview
    ) ??
    (await queryClient
      .fetchQuery({
        ...workspaceQueries.workspaceOverview(),
        retry: false
      })
      .catch(() => null));

  if (!overview) {
    return;
  }

  prefetchHealthyService(queryClient, overview, "production-plans");
  prefetchHealthyService(queryClient, overview, "main-profiles");
  prefetchHealthyService(queryClient, overview, "cut-lists");
  prefetchHealthyService(queryClient, overview, "optimization-requests");
  prefetchHealthyService(queryClient, overview, "results");
}

export function invalidateWorkspaceQueries(
  queryClient: QueryClient,
  scope: WorkspaceMutationScope
) {
  for (const queryKey of workspaceInvalidationTargets[scope]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function isWorkspaceQueryKey(queryKey: QueryKey): boolean {
  const root = queryKey[0];

  return typeof root === "string" && workspaceQueryRoots.has(root);
}

function isServiceHealthy(
  overview: WorkspaceOverviewResponse | undefined,
  serviceName: WorkspaceOverviewServiceName
): boolean {
  return findServiceStatus(overview, serviceName)?.ok === true;
}

function prefetchHealthyService(
  queryClient: QueryClient,
  overview: WorkspaceOverviewResponse | undefined,
  serviceName: WorkspaceOverviewServiceName
) {
  if (!isServiceHealthy(overview, serviceName)) {
    return;
  }

  switch (serviceName) {
    case "cut-lists":
      void queryClient.prefetchQuery({
        ...workspaceQueries.cutLists(),
        retry: false
      });
      return;
    case "main-profiles":
      void queryClient.prefetchQuery({
        ...workspaceQueries.mainProfiles(),
        retry: false
      });
      return;
    case "optimization-requests":
      void queryClient.prefetchQuery({
        ...workspaceQueries.optimizationRequests(),
        retry: false
      });
      return;
    case "production-plans":
      void queryClient.prefetchQuery({
        ...workspaceQueries.productionPlanImports(),
        retry: false
      });
      return;
    case "results":
      void queryClient.prefetchQuery({
        ...workspaceQueries.results(),
        retry: false
      });
      return;
  }
}
