import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { LOGIN_ROUTE, SESSION_COOKIE_NAME } from "@/lib/auth";

function isPublicPath(pathname: string): boolean {
  return pathname === LOGIN_ROUTE || pathname.startsWith("/api/auth");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
