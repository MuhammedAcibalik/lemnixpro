import { Inject, Injectable } from "@nestjs/common";

import type {
  CutListSnapshotDetail,
  CutListSnapshotSummary
} from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";
import { UpstreamHttpClient } from "./upstream-http.client";

@Injectable()
export class CutListsClient {
  constructor(
    @Inject(UpstreamHttpClient)
    private readonly upstreamHttpClient: UpstreamHttpClient,
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async createSnapshot(weekNumber: number): Promise<CutListSnapshotDetail> {
    return this.request<CutListSnapshotDetail>(
      `/cut-lists/weeks/${weekNumber}/snapshots`,
      {
        method: "POST"
      }
    );
  }

  async findAll(): Promise<CutListSnapshotSummary[]> {
    return this.request<CutListSnapshotSummary[]>("/cut-lists", {
      method: "GET"
    });
  }

  async findLatestByWeekNumber(weekNumber: number): Promise<CutListSnapshotDetail> {
    return this.request<CutListSnapshotDetail>(
      `/cut-lists/weeks/${weekNumber}/latest`,
      {
        method: "GET"
      }
    );
  }

  async findLatestByPlanYearAndWeekNumber(
    planYear: number,
    weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.request<CutListSnapshotDetail>(
      `/cut-lists/years/${planYear}/weeks/${weekNumber}/latest`,
      {
        method: "GET"
      }
    );
  }

  async findById(id: string): Promise<CutListSnapshotDetail> {
    return this.request<CutListSnapshotDetail>(`/cut-lists/${id}`, {
      method: "GET"
    });
  }

  private request<T>(path: string, init: RequestInit): Promise<T> {
    const baseUrl = this.upstreamService.getCutListServiceBaseUrl();

    return this.upstreamHttpClient.request<T>(baseUrl, path, {
      ...init,
      upstreamHint: `cut-list-service (${baseUrl})`
    });
  }
}
