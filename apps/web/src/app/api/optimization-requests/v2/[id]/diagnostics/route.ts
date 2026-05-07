import { gatewayJsonResponse } from "@/server/api/json-response";
import { getOptimizationDiagnosticsV2 } from "@/server/gateway/optimization-requests";

export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return gatewayJsonResponse(async () => {
    const { id } = await context.params;
    return getOptimizationDiagnosticsV2(id);
  }, { cache: "no-store" });
}
