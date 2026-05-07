import { Inject, Injectable } from "@nestjs/common";

import { UpstreamService } from "./upstream.service";

import type { ProductionPlanActiveBatchRow } from "@lemnixpro/shared-contracts";

export type ProductionPlanImportBatchSummary = {
  id: string;
  fileName: string;
  sheetName: string;
  planYear: number | null;
  weekNumber: number | null;
  status: "imported" | "active" | "superseded";
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductionPlanActiveBatchRowsResponse = {
  batch: ProductionPlanImportBatchSummary;
  rows: ProductionPlanActiveBatchRow[];
};

@Injectable()
export class ProductionPlanClient {
  constructor(
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async getActiveBatchRowsByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanActiveBatchRowsResponse> {
    return this.request<ProductionPlanActiveBatchRowsResponse>(
      `/production-plan-weeks/${weekNumber}/active-batch/rows`,
      {
        method: "GET"
      }
    );
  }

  async getRowsByBatchId(batchId: string): Promise<ProductionPlanActiveBatchRow[]> {
    return this.request<ProductionPlanActiveBatchRow[]>(
      `/production-plan-imports/${batchId}/rows`,
      {
        method: "GET"
      }
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamService.request<T>(
      this.upstreamService.getProductionPlanServiceBaseUrl(),
      path,
      init
    );
  }
}
