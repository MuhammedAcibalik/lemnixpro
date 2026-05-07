import type { NextRequest } from "next/server";

import { gatewayJsonResponse } from "@/server/api/json-response";
import { getProductionPlanRowsPage } from "@/server/gateway/production-plans";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const limit = readPositiveInteger(searchParams.get("limit"), 100, 500);
  const offset = readNonNegativeInteger(searchParams.get("offset"), 0);

  return gatewayJsonResponse(() =>
    getProductionPlanRowsPage(id, {
      limit,
      offset
    })
  );
}

function readPositiveInteger(
  value: string | null,
  fallback: number,
  max: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(max, parsed);
}

function readNonNegativeInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
