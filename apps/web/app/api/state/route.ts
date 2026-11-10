import { getLibrary } from "@gbook/core";
import { guard, sessionHeaders, errorResponse } from "../../../lib/security";
import { ownerChatGPT, ownerMode } from "../../../lib/owner-session";
import { ownerServeHost } from "../../../lib/request-origin";
export const runtime = "nodejs";
export function GET(request: Request) {
  try {
    guard(request);
    const session = sessionHeaders(request);
    return Response.json(
      {
        ...getLibrary().snapshot(),
        csrf: session.csrf,
        ownerPreview: ownerMode(),
        chatGPTAvailable: !ownerMode() || ownerChatGPT(),
        privateHttps: Boolean(ownerServeHost()),
        formalLibrary: ownerMode() && process.env.GBOOK_OWNER_FORMAL === "1",
      },
      {
        headers: { "set-cookie": session.cookie, "cache-control": "no-store" },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
