import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";

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
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  priority: string | null;
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
    const baseUrl = this.upstreamService.getProductionPlanServiceBaseUrl();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers
      });
    } catch {
      throw new ServiceUnavailableException(
        "Production plan service is unavailable."
      );
    }

    const payload = await this.parsePayload(response);

    if (!response.ok) {
      throw new HttpException(this.normalizeErrorPayload(payload), response.status);
    }

    return payload as T;
  }

  private async parsePayload(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    return text ? { message: text } : { message: response.statusText };
  }

  private normalizeErrorPayload(payload: unknown): object {
    if (payload && typeof payload === "object") {
      return payload;
    }

    return {
      message: "Production plan service request failed."
    };
  }
}
