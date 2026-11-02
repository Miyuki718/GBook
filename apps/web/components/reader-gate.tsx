"use client";
import { Reader } from "./reader";
import { useSession } from "./session";
import type { Book } from "../lib/books";
export function ReaderGate({ book }: { book: Book }) {
  const { loaded } = useSession();
  return loaded ? (
    <Reader key={book.id} book={book} />
  ) : (
    <main className="p-8" role="status">
      正在读取本地阅读记录…
    </main>
  );
}
