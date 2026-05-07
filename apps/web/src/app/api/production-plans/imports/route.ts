import { gatewayJsonResponse } from "@/server/api/json-response";
import { listProductionPlanImports } from "@/server/gateway/production-plans";

export function GET() {
  return gatewayJsonResponse(() => listProductionPlanImports());
}
