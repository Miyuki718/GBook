import { notFound } from "next/navigation";
import { getLibrary } from "@gbook/core";
import { ReaderGate } from "../../../components/reader-gate";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  try {
    const library = getLibrary();
    return <ReaderGate book={library.book(bookId)} images={library.bookImages(bookId)} />;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "not_found")
      notFound();
    throw e;
  }
}
