"use client";
import { useEffect, useState } from "react";
import { useSession } from "./session";
export function Trash() {
  const { api, refresh } = useSession();
  const [books, setBooks] = useState<{ id: string; title: string }[]>([]),
    [error, setError] = useState("");
  async function load() {
    setBooks(await api("/api/library?trash=1"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <section className="settings-card">
      <h2>已移出书架</h2>
      <p>移出的书籍仍留在本机，可随时恢复。不会在导出备份中包含这些书。</p>
      {books.length ? (
        books.map((b) => (
          <div className="action-row" key={b.id}>
            <span>{b.title}</span>
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  await api("/api/library", { op: "book.restore", id: b.id });
                  await load();
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              恢复到书架
            </button>
          </div>
        ))
      ) : (
        <p>没有已移出的书籍。</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
