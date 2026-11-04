"use client";
import { Reader } from "./reader";
import { useSession } from "./session";
import type { Book } from "../lib/books";
import type { BookImage } from "@gbook/core/types";
export function ReaderGate({ book, images }: { book: Book; images: BookImage[] }) {
  const { loaded } = useSession();
  return loaded ? (
    <Reader key={book.id} book={book} images={images} />
  ) : (
    <main className="p-8" role="status">
      正在读取本地阅读记录…
    </main>
  );
}
