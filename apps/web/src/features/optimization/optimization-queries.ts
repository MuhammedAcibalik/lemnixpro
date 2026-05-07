"use client";

import type {
  CreateOptimizationRequestFromSnapshotRequest,
  CreateOptimizationRequestFromSnapshotResponse,
  OptimizationDryRunResponseV2,
  OptimizationRequestDiagnosticsResponse,
  OptimizationRequestSummaryV2,
  OptimizationResultDetailResponse
} from "@lemnixpro/shared-contracts";
import { queryOptions } from "@tanstack/react-query";

import { fetchJson } from "@/lib/workspace-query";

export const optimizationQueryKeys = {
  dryRun: (snapshotId: string) =>
    ["optimization", "dry-run", snapshotId] as const,
  status: (requestId: string) =>
    ["optimization", "status", requestId] as const,
  result: (requestId: string) =>
    ["optimization", "result", requestId] as const,
  diagnostics: (requestId: string) =>
    ["optimization", "diagnostics", requestId] as const,
  bySnapshot: (snapshotId: string) =>
    ["optimization", "by-snapshot", snapshotId] as const
};

export const optimizationQueries = {
  status: (requestId: string) =>
    queryOptions({
      queryFn: () =>
        fetchJson<OptimizationRequestSummaryV2>(
          `/api/optimization-requests/v2/${requestId}/status`
        ),
      queryKey: optimizationQueryKeys.status(requestId)
    }),
  result: (requestId: string) =>
    queryOptions({
      queryFn: () =>
        fetchJson<OptimizationResultDetailResponse>(
          `/api/optimization-requests/v2/${requestId}/result`
        ),
      queryKey: optimizationQueryKeys.result(requestId)
    }),
  diagnostics: (requestId: string) =>
    queryOptions({
      queryFn: () =>
        fetchJson<OptimizationRequestDiagnosticsResponse>(
          `/api/optimization-requests/v2/${requestId}/diagnostics`
        ),
      queryKey: optimizationQueryKeys.diagnostics(requestId)
    }),
  bySnapshot: (snapshotId: string) =>
    queryOptions({
      queryFn: () =>
        fetchJson<OptimizationRequestSummaryV2[]>(
          `/api/optimization-requests/v2/by-snapshot/${snapshotId}`
        ),
      queryKey: optimizationQueryKeys.bySnapshot(snapshotId)
    })
};

export async function postOptimizationDryRun(
  body: CreateOptimizationRequestFromSnapshotRequest
): Promise<OptimizationDryRunResponseV2> {
  const response = await fetch(
    "/api/optimization-requests/v2/from-snapshot/dry-run",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    }
  );
  const payload = (await response.json().catch(() => null)) as
    | OptimizationDryRunResponseV2
    | { message?: string }
    | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message
        : "Optimizasyon önizlemesi oluşturulamadı.";
    throw new Error(message ?? "Optimizasyon önizlemesi oluşturulamadı.");
  }
  return payload as OptimizationDryRunResponseV2;
}

export async function postOptimizationFromSnapshot(
  body: CreateOptimizationRequestFromSnapshotRequest
): Promise<CreateOptimizationRequestFromSnapshotResponse> {
  const response = await fetch(
    "/api/optimization-requests/v2/from-snapshot",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    }
  );
  const payload = (await response.json().catch(() => null)) as
    | CreateOptimizationRequestFromSnapshotResponse
    | { message?: string }
    | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message
        : "Optimizasyon talebi oluşturulamadı.";
    throw new Error(message ?? "Optimizasyon talebi oluşturulamadı.");
  }
  return payload as CreateOptimizationRequestFromSnapshotResponse;
}
