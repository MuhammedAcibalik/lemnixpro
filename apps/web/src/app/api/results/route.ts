import { gatewayJsonResponse } from "@/server/api/json-response";
import { listOptimizationResults } from "@/server/gateway/results";

export function GET() {
  return gatewayJsonResponse(() => listOptimizationResults());
}
