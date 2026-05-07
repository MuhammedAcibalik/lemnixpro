import { Inject, Injectable } from "@nestjs/common";

import type { CutListSnapshotDetail } from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";

@Injectable()
export class CutListClient {
  constructor(
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async getSnapshotById(snapshotId: string): Promise<CutListSnapshotDetail> {
    return this.request<CutListSnapshotDetail>(`/cut-lists/${snapshotId}`, {
      method: "GET"
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamService.request<T>(
      this.upstreamService.getCutListServiceBaseUrl(),
      path,
      init
    );
  }
}
