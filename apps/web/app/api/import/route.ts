import { getLibrary, DomainError } from "@gbook/core";
import { importBook } from "@gbook/core/import";
import { IMPORT_FILE_LIMIT } from "@gbook/core/limits";
import { guard, readLimited, errorResponse } from "../../../lib/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guard(request, true);
    const bytes = await readLimited(request, IMPORT_FILE_LIMIT + 1_000_000);
    const form = await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("请选择文件");
    const book = importBook(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );
    getLibrary().addBook(book);
    return Response.json({ id: book.id });
  } catch (e) {
    return errorResponse(e);
  }
}
