import { getLibrary } from "@gbook/core";
import { guard, sessionHeaders, errorResponse } from "../../../lib/security";
export const runtime = "nodejs";
export function GET(request: Request) {
  try {
    guard(request);
    const session = sessionHeaders(request);
    return Response.json(
      { ...getLibrary().snapshot(), csrf: session.csrf },
      {
        headers: { "set-cookie": session.cookie, "cache-control": "no-store" },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
