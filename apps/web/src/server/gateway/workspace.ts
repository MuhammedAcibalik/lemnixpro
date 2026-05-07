import "server-only";

import type { WorkspaceOverviewResponse } from "@lemnixpro/shared-contracts";

import { requestGatewayWithSession } from "./http";

/**
 * Runs five upstream fan-outs in parallel; allow a modest buffer above default
 * `API_GATEWAY_REQUEST_TIMEOUT_MS` so cold Postgres / large lists do not 504 alone.
 */
export function getWorkspaceOverview(): Promise<WorkspaceOverviewResponse> {
  return requestGatewayWithSession<WorkspaceOverviewResponse>(
    "/workspace/overview",
    { timeoutMs: 18_000 }
  );
}
