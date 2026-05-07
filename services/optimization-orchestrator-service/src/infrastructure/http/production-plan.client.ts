import { Inject, Injectable } from "@nestjs/common";

import { UpstreamService } from "./upstream.service";

export type ProductionPlanImportBatchSummary = {
  id: string;
  fileName: string;
  sheetName: string;
  weekNumber: number | null;
  status: "imported" | "active" | "superseded";
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductionPlanActiveBatchRow = {
  id: string;
  rowIndex: number;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
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

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamService.request<T>(
      this.upstreamService.getProductionPlanServiceBaseUrl(),
      path,
      init
    );
  }
}
