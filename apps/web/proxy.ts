import { NextResponse, type NextRequest } from "next/server";
import { hasOwnerSession, ownerMode } from "./lib/owner-session";
import { allowedOrigin } from "./lib/request-origin";

export function proxy(request: NextRequest) {
  const url = new URL(request.url);
  const origin = allowedOrigin(request);
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse("请使用 GBook 配置的访问地址", { status: 403 });
  }
  if (!ownerMode()) return NextResponse.next();
  const headers = { "cache-control": "private, no-store" };
  if (url.pathname !== "/login" && url.pathname !== "/api/owner" && !hasOwnerSession(request)) {
    if (url.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "请先登录 GBook" }, { status: 401, headers });
    }
    return NextResponse.redirect(new URL("/login", origin), { headers });
  }
  return NextResponse.next({ headers });
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
