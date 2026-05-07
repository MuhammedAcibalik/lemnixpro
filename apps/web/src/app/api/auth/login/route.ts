import type { LoginRequest } from "@lemnixpro/shared-contracts";
import { NextResponse } from "next/server";

import { login } from "@/server/gateway/auth";
import { getGatewayErrorMessage, isGatewayRequestError } from "@/server/gateway/http";
import { writeSessionToken } from "@/server/auth/session";

export async function POST(request: Request) {
  let payload: LoginRequest;

  try {
    payload = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json(
      {
        message: "Gecerli bir giris istegi gonderin."
      },
      {
        status: 400
      }
    );
  }

  try {
    const response = await login(payload);

    await writeSessionToken(response.accessToken, response.expiresIn);

    return NextResponse.json(
      {
        user: response.user
      },
      {
        status: 200
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: getGatewayErrorMessage(error)
      },
      {
        status: isGatewayRequestError(error) ? error.status : 500
      }
    );
  }
}
