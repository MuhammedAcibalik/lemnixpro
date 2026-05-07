import { gatewayJsonResponse } from "@/server/api/json-response";
import { getCutListSnapshot } from "@/server/gateway/cut-lists";

type CutListDetailRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: CutListDetailRouteContext) {
  const { id } = await params;

  return gatewayJsonResponse(() => getCutListSnapshot(id));
}
