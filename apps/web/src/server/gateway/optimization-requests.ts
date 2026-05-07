import "server-only";

import type {
  CreateOptimizationRequestFromSnapshotRequest,
  CreateOptimizationRequestFromSnapshotResponse,
  CreateOptimizationRequestRequest,
  CreateOptimizationRequestResponse,
  OptimizationDryRunResponse,
  OptimizationDryRunResponseV2,
  OptimizationRequestDiagnosticsResponse,
  OptimizationRequestDetailResponse,
  OptimizationRequestRequeueResponse,
  OptimizationRequestSummary,
  OptimizationRequestSummaryV2,
  OptimizationResultDetailResponse
} from "@lemnixpro/shared-contracts";

import { requestGatewayWithSession } from "./http";

export function listOptimizationRequests(): Promise<OptimizationRequestSummary[]> {
  return requestGatewayWithSession<OptimizationRequestSummary[]>(
    "/optimization-requests"
  );
}

export function listReadyOptimizationRequests(): Promise<OptimizationRequestSummary[]> {
  return requestGatewayWithSession<OptimizationRequestSummary[]>(
    "/optimization-requests/ready"
  );
}

export function getOptimizationRequest(
  id: string
): Promise<OptimizationRequestDetailResponse> {
  return requestGatewayWithSession<OptimizationRequestDetailResponse>(
    `/optimization-requests/${id}`
  );
}

export function createOptimizationDryRun(
  request: CreateOptimizationRequestRequest
): Promise<OptimizationDryRunResponse> {
  return requestGatewayWithSession<OptimizationDryRunResponse>(
    "/optimization-requests/dry-run",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );
}

export function createOptimizationRequest(
  request: CreateOptimizationRequestRequest
): Promise<CreateOptimizationRequestResponse> {
  return requestGatewayWithSession<CreateOptimizationRequestResponse>(
    "/optimization-requests",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );
}

export function requeueOptimizationRequest(
  id: string
): Promise<OptimizationRequestRequeueResponse> {
  return requestGatewayWithSession<OptimizationRequestRequeueResponse>(
    `/optimization-requests/${id}/requeue`,
    {
      method: "POST"
    }
  );
}

// ────────────────────────────  Enterprise Optimization V2  ─────────────────────────────

export function createOptimizationFromSnapshotDryRun(
  request: CreateOptimizationRequestFromSnapshotRequest
): Promise<OptimizationDryRunResponseV2> {
  return requestGatewayWithSession<OptimizationDryRunResponseV2>(
    "/optimization-requests/v2/from-snapshot/dry-run",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    }
  );
}

export function createOptimizationFromSnapshot(
  request: CreateOptimizationRequestFromSnapshotRequest
): Promise<CreateOptimizationRequestFromSnapshotResponse> {
  return requestGatewayWithSession<CreateOptimizationRequestFromSnapshotResponse>(
    "/optimization-requests/v2/from-snapshot",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    }
  );
}

export function getOptimizationRequestStatusV2(
  id: string
): Promise<OptimizationRequestSummaryV2> {
  return requestGatewayWithSession<OptimizationRequestSummaryV2>(
    `/optimization-requests/v2/${id}/status`
  );
}

export function listOptimizationRequestsBySnapshot(
  cutListSnapshotId: string
): Promise<OptimizationRequestSummaryV2[]> {
  return requestGatewayWithSession<OptimizationRequestSummaryV2[]>(
    `/optimization-requests/v2/by-snapshot/${cutListSnapshotId}`
  );
}

export function getOptimizationResultByJobId(
  jobId: string
): Promise<OptimizationResultDetailResponse> {
  return requestGatewayWithSession<OptimizationResultDetailResponse>(
    `/optimization-requests/v2/${jobId}/result`
  );
}

export function getOptimizationDiagnosticsV2(
  id: string
): Promise<OptimizationRequestDiagnosticsResponse> {
  return requestGatewayWithSession<OptimizationRequestDiagnosticsResponse>(
    `/optimization-requests/v2/${id}/diagnostics`
  );
}
