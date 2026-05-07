import { NextResponse } from "next/server";

import { clearSessionToken, readSessionToken } from "@/server/auth/session";
import { getCurrentUser } from "@/server/gateway/auth";
import { isGatewayRequestError } from "@/server/gateway/http";

export async function GET() {
  const token = await readSessionToken();

  if (!token) {
    return NextResponse.json(
      {
        message: "Oturum bulunamadi."
      },
      {
        status: 401
      }
    );
  }

  try {
    const response = await getCurrentUser(token);

    return NextResponse.json(response, {
      status: 200
    });
  } catch (error) {
    if (isGatewayRequestError(error) && error.status === 401) {
      await clearSessionToken();
    }

    return NextResponse.json(
      {
        message: "Oturum dogrulanamadi."
      },
      {
        status: isGatewayRequestError(error) ? error.status : 500
      }
    );
  }
}
