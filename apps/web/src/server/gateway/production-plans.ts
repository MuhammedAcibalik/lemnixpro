import "server-only";

import type {
  ProductionPlanActiveBatchRowsResponse,
  ProductionPlanImportBatch,
  ProductionPlanImportBatchDetail,
  ProductionPlanImportRow,
  ProductionPlanImportRowsPage,
  UpdateProductionPlanRowRequest
} from "@lemnixpro/shared-contracts";

import {
  readActiveFacilityHeaders,
  requireSingleActiveFacilityHeaders
} from "../facility-context";

import { requestGatewayWithSession } from "./http";

export async function listProductionPlanImports(): Promise<ProductionPlanImportBatch[]> {
  return requestGatewayWithSession<ProductionPlanImportBatch[]>(
    "/production-plan-imports",
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function listProductionPlanWeekBatches(
  weekNumber: number
): Promise<ProductionPlanImportBatch[]> {
  return requestGatewayWithSession<ProductionPlanImportBatch[]>(
    `/production-plan-weeks/${weekNumber}/batches`,
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function getProductionPlanImport(
  id: string
): Promise<ProductionPlanImportBatchDetail> {
  return requestGatewayWithSession<ProductionPlanImportBatchDetail>(
    `/production-plan-imports/${id}`,
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function getProductionPlanRows(
  id: string
): Promise<ProductionPlanImportRow[]> {
  return requestGatewayWithSession<ProductionPlanImportRow[]>(
    `/production-plan-imports/${id}/rows`,
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function getProductionPlanRowsPage(
  id: string,
  query: { limit: number; offset: number }
): Promise<ProductionPlanImportRowsPage> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset)
  });

  return requestGatewayWithSession<ProductionPlanImportRowsPage>(
    `/production-plan-imports/${id}/rows/paged?${params.toString()}`,
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function activateProductionPlanImport(
  id: string
): Promise<ProductionPlanImportBatch> {
  return requestGatewayWithSession<ProductionPlanImportBatch>(
    `/production-plan-imports/${id}/activate`,
    {
      method: "POST",
      headers: await requireSingleActiveFacilityHeaders()
    }
  );
}

export async function deleteProductionPlanImport(id: string): Promise<void> {
  return requestGatewayWithSession<void>(`/production-plan-imports/${id}`, {
    method: "DELETE",
    headers: await requireSingleActiveFacilityHeaders()
  });
}

export async function getActiveProductionPlanBatch(
  weekNumber: number
): Promise<ProductionPlanImportBatch> {
  return requestGatewayWithSession<ProductionPlanImportBatch>(
    `/production-plan-weeks/${weekNumber}/active-batch`,
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function getActiveProductionPlanRows(
  weekNumber: number
): Promise<ProductionPlanActiveBatchRowsResponse> {
  return requestGatewayWithSession<ProductionPlanActiveBatchRowsResponse>(
    `/production-plan-weeks/${weekNumber}/active-batch/rows`,
    {
      headers: await readActiveFacilityHeaders()
    }
  );
}

export async function uploadProductionPlan(
  file: File
): Promise<ProductionPlanImportBatch> {
  const formData = new FormData();
  formData.set("file", file);

  return requestGatewayWithSession<ProductionPlanImportBatch>(
    "/production-plan-imports",
    {
      method: "POST",
      headers: await requireSingleActiveFacilityHeaders(),
      body: formData
    }
  );
}

export async function updateProductionPlanRow(
  id: string,
  request: UpdateProductionPlanRowRequest
): Promise<ProductionPlanImportRow> {
  return requestGatewayWithSession<ProductionPlanImportRow>(
    `/production-plan-rows/${id}`,
    {
      method: "PATCH",
      headers: {
        ...(await requireSingleActiveFacilityHeaders()),
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );
}
