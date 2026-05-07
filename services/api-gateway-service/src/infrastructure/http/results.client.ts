import { Inject, Injectable } from "@nestjs/common";

import type { OptimizationResultRecord } from "@lemnixpro/shared-contracts";

import { UpstreamHttpClient } from "./upstream-http.client";
import { UpstreamService } from "./upstream.service";

@Injectable()
export class ResultsClient {
  constructor(
    @Inject(UpstreamHttpClient)
    private readonly upstreamHttpClient: UpstreamHttpClient,
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async findAll(): Promise<OptimizationResultRecord[]> {
    return this.request<OptimizationResultRecord[]>("/results", {
      method: "GET"
    });
  }

  async findById(id: string): Promise<OptimizationResultRecord> {
    return this.request<OptimizationResultRecord>(`/results/${id}`, {
      method: "GET"
    });
  }

  private request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamHttpClient.request<T>(
      this.upstreamService.getResultServiceBaseUrl(),
      path,
      init
    );
  }
}
