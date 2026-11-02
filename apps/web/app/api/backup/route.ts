import { getLibrary } from "@gbook/core";
import { guard, jsonBody, errorResponse } from "../../../lib/security";
export const runtime = "nodejs";
export function GET(request: Request) {
  try {
    guard(request);
    return Response.json(getLibrary().exportBackup(), {
      headers: {
        "content-disposition": 'attachment; filename="gbook-backup.json"',
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    guard(request, true);
    return Response.json(
      getLibrary().importBackup(await jsonBody(request, 30_000_000)),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
