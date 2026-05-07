import { NextResponse } from "next/server";

import { clearSessionToken } from "@/server/auth/session";

export async function POST() {
  await clearSessionToken();

  return NextResponse.json(
    {
      ok: true
    },
    {
      status: 200
    }
  );
}
