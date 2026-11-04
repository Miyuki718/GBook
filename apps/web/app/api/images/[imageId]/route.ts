import { getLibrary } from "@gbook/core";
import { guard, errorResponse } from "../../../../lib/security";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ imageId: string }> }) {
  try {
    guard(request);
    const { imageId } = await context.params;
    const image = getLibrary().bookImage(imageId);
    if (!image) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.mime,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
