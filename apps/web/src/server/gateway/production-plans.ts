import "server-only";

import type {
  ProductionPlanActiveBatchRowsResponse,
  ProductionPlanImportBatch,
  ProductionPlanImportBatchDetail,
  ProductionPlanImportRow,
  ProductionPlanImportRowsPage,
  UpdateProductionPlanRowRequest
} from "@lemnixpro/shared-contracts";

import { requestGatewayWithSession } from "./http";

export function listProductionPlanImports(): Promise<ProductionPlanImportBatch[]> {
  return requestGatewayWithSession<ProductionPlanImportBatch[]>(
    "/production-plan-imports"
  );
}

export function listProductionPlanWeekBatches(
  weekNumber: number
): Promise<ProductionPlanImportBatch[]> {
  return requestGatewayWithSession<ProductionPlanImportBatch[]>(
    `/production-plan-weeks/${weekNumber}/batches`
  );
}

export function getProductionPlanImport(
  id: string
): Promise<ProductionPlanImportBatchDetail> {
  return requestGatewayWithSession<ProductionPlanImportBatchDetail>(
    `/production-plan-imports/${id}`
  );
}

export function getProductionPlanRows(
  id: string
): Promise<ProductionPlanImportRow[]> {
  return requestGatewayWithSession<ProductionPlanImportRow[]>(
    `/production-plan-imports/${id}/rows`
  );
}

export function getProductionPlanRowsPage(
  id: string,
  query: { limit: number; offset: number }
): Promise<ProductionPlanImportRowsPage> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset)
  });

  return requestGatewayWithSession<ProductionPlanImportRowsPage>(
    `/production-plan-imports/${id}/rows/paged?${params.toString()}`
  );
}

export function activateProductionPlanImport(
  id: string
): Promise<ProductionPlanImportBatch> {
  return requestGatewayWithSession<ProductionPlanImportBatch>(
    `/production-plan-imports/${id}/activate`,
    {
      method: "POST"
    }
  );
}

export function deleteProductionPlanImport(id: string): Promise<void> {
  return requestGatewayWithSession<void>(`/production-plan-imports/${id}`, {
    method: "DELETE"
  });
}

export function getActiveProductionPlanBatch(
  weekNumber: number
): Promise<ProductionPlanImportBatch> {
  return requestGatewayWithSession<ProductionPlanImportBatch>(
    `/production-plan-weeks/${weekNumber}/active-batch`
  );
}

export function getActiveProductionPlanRows(
  weekNumber: number
): Promise<ProductionPlanActiveBatchRowsResponse> {
  return requestGatewayWithSession<ProductionPlanActiveBatchRowsResponse>(
    `/production-plan-weeks/${weekNumber}/active-batch/rows`
  );
}

export function uploadProductionPlan(
  file: File
): Promise<ProductionPlanImportBatch> {
  const formData = new FormData();
  formData.set("file", file);

  return requestGatewayWithSession<ProductionPlanImportBatch>(
    "/production-plan-imports",
    {
      method: "POST",
      body: formData
    }
  );
}

export function updateProductionPlanRow(
  id: string,
  request: UpdateProductionPlanRowRequest
): Promise<ProductionPlanImportRow> {
  return requestGatewayWithSession<ProductionPlanImportRow>(
    `/production-plan-rows/${id}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );
}
