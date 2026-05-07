import { gatewayJsonResponse } from "@/server/api/json-response";
import { listOptimizationRequestsBySnapshot } from "@/server/gateway/optimization-requests";

export function GET(
  _request: Request,
  context: { params: Promise<{ snapshotId: string }> }
) {
  return gatewayJsonResponse(async () => {
    const { snapshotId } = await context.params;
    return listOptimizationRequestsBySnapshot(snapshotId);
  }, { cache: "no-store" });
}
