import { gatewayJsonResponse } from "@/server/api/json-response";
import { listOptimizationRequests } from "@/server/gateway/optimization-requests";

export function GET() {
  return gatewayJsonResponse(() => listOptimizationRequests());
}
