import { Inject, Injectable } from "@nestjs/common";

import type {
  ProductionPlanActiveBatchRowsResponse,
  ProductionPlanImportBatch,
  ProductionPlanImportBatchDetail,
  ProductionPlanImportRow,
  ProductionPlanImportRowsPage,
  UpdateProductionPlanRowRequest
} from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";
import { UpstreamHttpClient } from "./upstream-http.client";

export type UploadedGatewayFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class ProductionPlanImportsClient {
  constructor(
    @Inject(UpstreamHttpClient)
    private readonly upstreamHttpClient: UpstreamHttpClient,
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async createImport(file?: UploadedGatewayFile): Promise<ProductionPlanImportBatch> {
    const formData = new FormData();

    if (file) {
      formData.set(
        "file",
        new Blob([file.buffer], {
          type:
            file.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }),
        file.originalname
      );
    }

    return this.request<ProductionPlanImportBatch>("/production-plan-imports", {
      method: "POST",
      body: formData
    });
  }

  async findAllImports(): Promise<ProductionPlanImportBatch[]> {
    return this.request<ProductionPlanImportBatch[]>("/production-plan-imports", {
      method: "GET"
    });
  }

  async findImportsByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanImportBatch[]> {
    return this.request<ProductionPlanImportBatch[]>(
      `/production-plan-weeks/${weekNumber}/batches`,
      {
        method: "GET"
      }
    );
  }

  async findImportById(id: string): Promise<ProductionPlanImportBatchDetail> {
    return this.request<ProductionPlanImportBatchDetail>(
      `/production-plan-imports/${id}`,
      {
        method: "GET"
      }
    );
  }

  async findRowsByBatchId(id: string): Promise<ProductionPlanImportRow[]> {
    return this.request<ProductionPlanImportRow[]>(
      `/production-plan-imports/${id}/rows`,
      {
        method: "GET"
      }
    );
  }

  async findRowsByBatchIdPaged(
    id: string,
    query: { limit: number; offset: number }
  ): Promise<ProductionPlanImportRowsPage> {
    const params = new URLSearchParams({
      limit: String(query.limit),
      offset: String(query.offset)
    });

    return this.request<ProductionPlanImportRowsPage>(
      `/production-plan-imports/${id}/rows/paged?${params.toString()}`,
      {
        method: "GET"
      }
    );
  }

  async activateImport(id: string): Promise<ProductionPlanImportBatch> {
    return this.request<ProductionPlanImportBatch>(
      `/production-plan-imports/${id}/activate`,
      {
        method: "POST"
      }
    );
  }

  async deleteImport(id: string): Promise<void> {
    await this.request<unknown>(`/production-plan-imports/${id}`, {
      method: "DELETE"
    });
  }

  async findActiveBatchByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanImportBatch> {
    return this.request<ProductionPlanImportBatch>(
      `/production-plan-weeks/${weekNumber}/active-batch`,
      {
        method: "GET"
      }
    );
  }

  async findActiveBatchRowsByWeekNumber(
    weekNumber: number
  ): Promise<ProductionPlanActiveBatchRowsResponse> {
    return this.request<ProductionPlanActiveBatchRowsResponse>(
      `/production-plan-weeks/${weekNumber}/active-batch/rows`,
      {
        method: "GET"
      }
    );
  }

  async updateRow(
    id: string,
    request: UpdateProductionPlanRowRequest
  ): Promise<ProductionPlanImportRow> {
    return this.request<ProductionPlanImportRow>(`/production-plan-rows/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  private request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamHttpClient.request<T>(
      this.upstreamService.getProductionPlanServiceBaseUrl(),
      path,
      init
    );
  }
}
