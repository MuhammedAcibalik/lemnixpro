import { gatewayJsonResponse } from "@/server/api/json-response";
import { listCutListSnapshots } from "@/server/gateway/cut-lists";

export function GET() {
  return gatewayJsonResponse(() => listCutListSnapshots());
}
