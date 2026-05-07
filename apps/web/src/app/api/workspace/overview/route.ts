import { gatewayJsonResponse } from "@/server/api/json-response";
import { getWorkspaceOverview } from "@/server/gateway/workspace";

export function GET() {
  return gatewayJsonResponse(() => getWorkspaceOverview());
}
