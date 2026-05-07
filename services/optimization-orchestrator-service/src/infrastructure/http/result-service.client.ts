import { Inject, Injectable } from "@nestjs/common";

import type { OptimizationResultDetailResponse } from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";

@Injectable()
export class ResultServiceClient {
  constructor(
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async getResultByJobId(
    jobId: string
  ): Promise<OptimizationResultDetailResponse> {
    return this.request<OptimizationResultDetailResponse>(
      `/results/by-job/${jobId}`,
      { method: "GET" }
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamService.request<T>(
      this.upstreamService.getResultServiceBaseUrl(),
      path,
      init
    );
  }
}
