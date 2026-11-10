import { createOwnerSession, endOwnerSession, ownerMode, verifyOwnerPassword } from "../../../lib/owner-session";
import { errorResponse, guardOrigin, readLimited } from "../../../lib/security";

let nextAttempt = 0;

export async function POST(request: Request) {
  try {
    if (!ownerMode()) return new Response(null, { status: 404 });
    const origin = guardOrigin(request, true);
    const form = new URLSearchParams(new TextDecoder().decode(await readLimited(request, 2048)));
    const redirect = (path: string, cookie?: string) => {
      const headers = new Headers({ location: new URL(path, origin).href, "cache-control": "no-store" });
      if (cookie) headers.set("set-cookie", cookie);
      return new Response(null, { status: 303, headers });
    };
    if (form.get("op") === "logout") return redirect("/login", endOwnerSession(request));
    if (Date.now() < nextAttempt) return redirect("/login?error=wait");
    nextAttempt = Date.now() + 1500;
    const password = form.get("password") ?? "";
    if (!password || password.length > 256 || !await verifyOwnerPassword(password)) {
      return redirect("/login?error=invalid");
    }
    return redirect("/", createOwnerSession());
  } catch (error) {
    return errorResponse(error);
  }
}
