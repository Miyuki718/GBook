import { getAuth, authError } from "@gbook/auth";
import { guard, jsonBody, errorResponse } from "../../../lib/security";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guard(request);
    const client = getAuth(),
      session = await client.getSession();
    const models = session.sharing
      ? await client.listModels({ signal: AbortSignal.timeout(30000) })
      : [];
    return Response.json(
      { session, models },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      e.code === "connection_busy"
    )
      return Response.json({
        session: { status: "connecting", sharing: false },
        models: [],
      });
    if (e && typeof e === "object" && "code" in e && e.code === "forbidden")
      return errorResponse(e);
    return Response.json({ error: authError(e) }, { status: 400 });
  }
}
export async function POST(request: Request) {
  try {
    guard(request, true);
    const { op } = await jsonBody(request),
      client = getAuth();
    if (op === "connect" || op === "enable-plan" || op === "other-account")
      return Response.json(
        await client.signIn({
          signal: request.signal,
          reconsent: op === "enable-plan",
          newProfile: op === "other-account",
        }),
      );
    if (op === "disconnect") {
      await client.disconnect();
      return Response.json({ ok: true });
    }
    if (op === "cancel") {
      client.cancelSignIn();
      return Response.json({ ok: true });
    }
    return Response.json({ error: "未知授权操作" }, { status: 400 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "forbidden")
      return errorResponse(e);
    return Response.json({ error: authError(e) }, { status: 400 });
  }
}
