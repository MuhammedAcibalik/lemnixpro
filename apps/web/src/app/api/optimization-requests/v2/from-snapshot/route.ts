import { NextResponse } from "next/server";

import type { CreateOptimizationRequestFromSnapshotRequest } from "@lemnixpro/shared-contracts";

import { gatewayJsonResponse } from "@/server/api/json-response";
import { createOptimizationFromSnapshot } from "@/server/gateway/optimization-requests";

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateOptimizationRequestFromSnapshotRequest;
  try {
    body = (await request.json()) as CreateOptimizationRequestFromSnapshotRequest;
  } catch {
    return NextResponse.json(
      { message: "Geçersiz JSON gövdesi." },
      { status: 400 }
    );
  }

  return gatewayJsonResponse(() => createOptimizationFromSnapshot(body));
}
