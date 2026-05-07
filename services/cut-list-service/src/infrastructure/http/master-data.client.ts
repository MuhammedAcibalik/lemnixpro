import { Inject, Injectable } from "@nestjs/common";

import { UpstreamService } from "./upstream.service";

export type MainProfileResponse = {
  id: string;
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  cuttingSpecs: {
    id: string;
    cuttingCode: string;
    cuttingName: string;
    cuttingLengthMm: number;
    unitQuantity: number;
    unitName: string;
  }[];
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class MasterDataClient {
  constructor(
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async getMainProfiles(): Promise<MainProfileResponse[]> {
    return this.request<MainProfileResponse[]>("/main-profiles", {
      method: "GET"
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamService.request<T>(
      this.upstreamService.getMasterDataServiceBaseUrl(),
      path,
      init
    );
  }
}
