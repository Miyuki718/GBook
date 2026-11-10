import { getLibrary, DomainError } from "@gbook/core";
import { guard, jsonBody, errorResponse } from "../../../lib/security";
import { ownerMode } from "../../../lib/owner-session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guard(request, true);
    const body = await jsonBody(request),
      lib = getLibrary();
    switch (body.op) {
      case "annotation.save":
        return Response.json(lib.saveAnnotation(body.value));
      case "annotation.delete":
        lib.deleteAnnotation(body.id);
        break;
      case "book.delete":
        lib.removeBook(body.id);
        break;
      case "book.restore":
        lib.restoreBook(body.id);
        break;
      case "book.update":
        return Response.json(lib.updateBook(body.value));
      case "progress.save":
        return Response.json(lib.position(body.value, ownerMode()));
      case "bookmark.add":
        return Response.json(lib.bookmark(body.value));
      case "bookmark.delete":
        lib.deleteBookmark(body.id);
        break;
      default:
        throw new DomainError("未知操作");
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export function GET(request: Request) {
  try {
    guard(request);
    const url = new URL(request.url),
      lib = getLibrary();
    if(url.searchParams.has('noteId'))return Response.json(lib.annotation(url.searchParams.get('noteId')!));
    if (url.searchParams.has("trash")) return Response.json(lib.trash());
    if (url.searchParams.has("annotationId")) {
      const id = url.searchParams.get("annotationId")!;
      lib.annotation(id);
      return Response.json(lib.messages(id));
    }
    if (url.searchParams.has("q"))
      return Response.json(
        lib.search(
          url.searchParams.get("bookId") || "",
          url.searchParams.get("q") || "",
        ),
      );
    throw new DomainError("缺少查询条件");
  } catch (e) {
    return errorResponse(e);
  }
}
