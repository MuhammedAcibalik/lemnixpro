import { gatewayJsonResponse } from "@/server/api/json-response";
import { listMainProfiles } from "@/server/gateway/main-profiles";

export function GET() {
  return gatewayJsonResponse(() => listMainProfiles());
}
