import { gatewayJsonResponse } from "@/server/api/json-response";
import { getOptimizationResultByJobId } from "@/server/gateway/optimization-requests";

export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return gatewayJsonResponse(async () => {
    const { id } = await context.params;
    return getOptimizationResultByJobId(id);
  }, { cache: "no-store" });
}
