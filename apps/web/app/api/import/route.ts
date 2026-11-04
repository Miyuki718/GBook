import { getLibrary, DomainError, type ImportedImage } from "@gbook/core";
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
    const bookId = form.get("bookId");
    if (bookId !== null && (typeof bookId !== "string" || !/\.epub$/i.test(file.name))) {
      throw new DomainError("请选择原来的 EPUB 文件");
    }
    const images: ImportedImage[] = [];
    const book = importBook(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
      images,
    );
    const saved = getLibrary().saveImportedBook(book, images, bookId ?? undefined);
    return Response.json({ id: saved.id, imageCount: images.length });
  } catch (e) {
    return errorResponse(e);
  }
}
