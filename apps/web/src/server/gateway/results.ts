import "server-only";

import type { OptimizationResultRecord } from "@lemnixpro/shared-contracts";

import { requestGatewayWithSession } from "./http";

export function listOptimizationResults(): Promise<OptimizationResultRecord[]> {
  return requestGatewayWithSession<OptimizationResultRecord[]>("/results");
}

export function getOptimizationResult(
  id: string
): Promise<OptimizationResultRecord> {
  return requestGatewayWithSession<OptimizationResultRecord>(`/results/${id}`);
}
