import { Inject, Injectable } from "@nestjs/common";

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

import { UpstreamService } from "./upstream.service";
import { UpstreamHttpClient } from "./upstream-http.client";

@Injectable()
export class OptimizationRequestsClient {
  constructor(
    @Inject(UpstreamHttpClient)
    private readonly upstreamHttpClient: UpstreamHttpClient,
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async createDryRun(
    request: CreateOptimizationRequestRequest
  ): Promise<OptimizationDryRunResponse> {
    return this.request<OptimizationDryRunResponse>(
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

  async createRequest(
    request: CreateOptimizationRequestRequest
  ): Promise<CreateOptimizationRequestResponse> {
    return this.request<CreateOptimizationRequestResponse>("/optimization-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  async findReady(): Promise<OptimizationRequestSummary[]> {
    return this.request<OptimizationRequestSummary[]>("/optimization-requests/ready", {
      method: "GET"
    });
  }

  async findAll(): Promise<OptimizationRequestSummary[]> {
    return this.request<OptimizationRequestSummary[]>("/optimization-requests", {
      method: "GET"
    });
  }

  async findById(id: string): Promise<OptimizationRequestDetailResponse> {
    return this.request<OptimizationRequestDetailResponse>(
      `/optimization-requests/${id}`,
      {
        method: "GET"
      }
    );
  }

  async requeueRequest(id: string): Promise<OptimizationRequestRequeueResponse> {
    return this.request<OptimizationRequestRequeueResponse>(
      `/optimization-requests/${id}/requeue`,
      {
        method: "POST"
      }
    );
  }

  async createFromSnapshotDryRun(
    payload: CreateOptimizationRequestFromSnapshotRequest
  ): Promise<OptimizationDryRunResponseV2> {
    return this.request<OptimizationDryRunResponseV2>(
      "/optimization-requests/v2/from-snapshot/dry-run",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
  }

  async createFromSnapshot(
    payload: CreateOptimizationRequestFromSnapshotRequest
  ): Promise<CreateOptimizationRequestFromSnapshotResponse> {
    return this.request<CreateOptimizationRequestFromSnapshotResponse>(
      "/optimization-requests/v2/from-snapshot",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
  }

  async findRequestStatusV2(
    id: string
  ): Promise<OptimizationRequestSummaryV2> {
    return this.request<OptimizationRequestSummaryV2>(
      `/optimization-requests/v2/${id}/status`,
      { method: "GET" }
    );
  }

  async findRequestsBySnapshot(
    cutListSnapshotId: string
  ): Promise<OptimizationRequestSummaryV2[]> {
    return this.request<OptimizationRequestSummaryV2[]>(
      `/optimization-requests/v2/by-snapshot/${cutListSnapshotId}`,
      { method: "GET" }
    );
  }

  async findResultByJobId(
    jobId: string
  ): Promise<OptimizationResultDetailResponse> {
    return this.request<OptimizationResultDetailResponse>(
      `/optimization-requests/v2/${jobId}/result`,
      { method: "GET" }
    );
  }

  async findDiagnosticsV2(
    id: string
  ): Promise<OptimizationRequestDiagnosticsResponse> {
    return this.request<OptimizationRequestDiagnosticsResponse>(
      `/optimization-requests/v2/${id}/diagnostics`,
      { method: "GET" }
    );
  }

  private request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamHttpClient.request<T>(
      this.upstreamService.getOptimizationOrchestratorServiceBaseUrl(),
      path,
      init
    );
  }
}
