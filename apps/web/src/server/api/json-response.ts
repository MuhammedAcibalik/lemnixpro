import { NextResponse } from "next/server";

import { getGatewayErrorMessage, isGatewayRequestError } from "@/server/gateway/http";

const privateCacheHeaders = {
  "cache-control": "private, max-age=5, stale-while-revalidate=30"
};

const noStoreHeaders = {
  "cache-control": "no-store"
};

type GatewayJsonResponseOptions = {
  cache?: "private" | "no-store";
};

export async function gatewayJsonResponse<T>(
  loader: () => Promise<T>,
  options: GatewayJsonResponseOptions = {}
): Promise<NextResponse> {
  const headers =
    options.cache === "no-store" ? noStoreHeaders : privateCacheHeaders;

  try {
    const payload = await loader();

    return NextResponse.json(payload, {
      headers
    });
  } catch (error) {
    const payload =
      isGatewayRequestError(error) && error.payload
        ? {
            ...(typeof error.payload.code === "string"
              ? { code: error.payload.code }
              : {}),
            ...(typeof error.payload.requestId === "string"
              ? { requestId: error.payload.requestId }
              : {}),
            ...(typeof error.payload.service === "string"
              ? { service: error.payload.service }
              : {})
          }
        : {};

    return NextResponse.json(
      {
        message: getGatewayErrorMessage(error),
        ...payload
      },
      {
        status: isGatewayRequestError(error) ? error.status : 500,
        headers
      }
    );
  }
}
