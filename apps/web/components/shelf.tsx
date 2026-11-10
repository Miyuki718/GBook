"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession } from "./session";
import { IMPORT_FILE_LIMIT } from "@gbook/core/limits";
export function Shelf() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const { books, annotations, progress, loaded, api, refresh } = useSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);
  const [editError, setEditError] = useState("");
  const [editingBook, setEditingBook] = useState<{
    id: string;
    title: string;
    author: string;
    description: string;
  } | null>(null);
  const editor = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (editingBook) editor.current?.showModal();
  }, [editingBook?.id]);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("正在解析本地书籍…");
    try {
      if (file.size > IMPORT_FILE_LIMIT) throw new Error("文件需不超过 100 MB");
      const form = new FormData();
      form.set("file", file);
      await api("/api/import", form);
      await refresh();
      setMessage("书籍已导入");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api("/api/library", { op: "book.delete", id });
      setRemoved(id);
      await refresh();
      setMessage("书籍已移出书架，可撤销");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const visible = books.filter(
    (b) =>
      (b.title + b.author).includes(query.trim()) &&
      (filter !== "reading" || progress[b.id] !== undefined),
  );
  return (
    <div className="shelf-shell">
      <aside className="shelf-nav">
        <Link className="brand" href="/">
          g<span>book</span>
          <span className="brand-dot" aria-hidden="true" />
        </Link>
        <div className="nav-caption">我的阅读空间</div>
        <button
          className={filter === "all" ? "nav-item active" : "nav-item"}
          onClick={() => setFilter("all")}
        >
          ▤ <span>我的书架</span>
          <small>{books.length}</small>
        </button>
        <button
          className={filter === "reading" ? "nav-item active" : "nav-item"}
          onClick={() => setFilter("reading")}
        >
          ◷ <span>正在阅读</span>
          <small>{Object.keys(progress).length}</small>
        </button>
        <div className="nav-note">
          <span className="small-star">✳</span>
          <p>
            每一次停留，
            <br />
            都有新的发现。
          </p>
          <small>和文字相遇，和自己对话。</small>
        </div>
        <div className="local-label">
          <span /> 本地阅读 · SQLite
        </div>
      </aside>
      <main className="shelf-main">
        <header className="shelf-top">
          <span className="shelf-context">个人阅读空间</span>
          <Link className="brand mobile-shelf-brand" href="/">gbook<span className="brand-dot" aria-hidden="true" /></Link>
          <nav className="action-row" aria-label="书架工具">
            <Link href="/notes">全部批注</Link>
            <Link href="/settings">设置</Link>
          </nav>
        </header>
        <section aria-label="我的书架">
          <div className="section-heading">
            <div>
              <h1>我的书架 <span>{books.length} 本</span></h1>
            </div>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="搜索书名或作者"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索书名或作者"
              />
            </label>
          </div>
          <div className="shelf-tabs">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              全部书籍
            </button>
            <button
              className={filter === "reading" ? "selected" : ""}
              onClick={() => setFilter("reading")}
            >
              正在阅读
            </button>
            <span>
              <label className="file-button">
                {busy ? "导入中…" : "＋ 导入书籍"}
                <input
                  type="file"
                  accept=".txt,.md,.epub"
                  disabled={busy}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </span>
          </div>
          <p role="status">
            {message}{" "}
            {removed && (
              <button
                className="secondary-button"
                onClick={async () => {
                  await api("/api/library", {
                    op: "book.restore",
                    id: removed,
                  });
                  setRemoved(null);
                  setMessage("已恢复书籍");
                  await refresh();
                }}
              >
                撤销移出
              </button>
            )}
          </p>
          {!loaded && <p role="status">正在读取本地书库…</p>}
          <div className="book-grid">
            {visible.map((b, index) => (
              <div className="book-entry" key={b.id}>
                <Link className="book-card" href={`/read/${b.id}`}>
                  <div className={`book-cover ${b.color}`}>
                    <div className="cover-top">
                      GBOOK ORIGINALS <span>0{index + 1}</span>
                    </div>
                    <div className="cover-title">{b.title}</div>
                    <div className="cover-subtitle">{b.subtitle}</div>
                    <div className="cover-bottom">
                      {b.author} <span>✳</span>
                    </div>
                  </div>
                  <div className="book-meta">
                    <h3>
                      {b.title}
                      <span aria-hidden="true">↗</span>
                    </h3>
                    <p>{b.description}</p>
                    <div className="book-status">
                      <span>
                        {progress[b.id] !== undefined ? "继续阅读" : "翻开看看"}
                      </span>
                      <span>
                        {annotations.filter((a) => a.bookId === b.id).length}{" "}
                        条批注
                      </span>
                    </div>
                    <div className="progress-track">
                      <div style={{ width: `${progress[b.id] ?? 0}%` }} />
                    </div>
                  </div>
                </Link>
                <div className="action-row">
                  <button
                    className="remove-book"
                    onClick={() =>
                      setEditingBook({
                        id: b.id,
                        title: b.title,
                        author: b.author,
                        description: b.description,
                      })
                    }
                    aria-label={`修改书名 ${b.title}`}
                  >
                    修改书名
                  </button>
                  <button
                    className="remove-book"
                    onClick={() => remove(b.id)}
                    aria-label={`移出书架 ${b.title}`}
                  >
                    移出书架
                  </button>
                </div>
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <div className="empty-state">
              <span>⌕</span>
              <h3>{query ? "没有找到这本书" : "还没有开始阅读"}</h3>
              <p>
                {query
                  ? "试试其他书名或作者。"
                  : "回到全部书籍，挑一本翻开吧。"}
              </p>
            </div>
          )}
        </section>
        <footer className="shelf-footer">
          <span>阅读，是一场不必赶路的旅行。</span>
          <span>本地保存 · 支持 TXT / Markdown / EPUB</span>
        </footer>
      </main>
      <dialog
        ref={editor}
        className="annotation-dialog"
        aria-label="编辑书籍信息"
        onClose={() => {
          setEditingBook(null);
          setEditError("");
        }}
      >
        <form
          className="dialog-body"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editingBook) return;
            const title = editingBook.title.trim();
            if (!title) {
              setEditError("请输入书名");
              return;
            }
            setEditError("");
            try {
              await api("/api/library", {
                op: "book.update",
                value: { ...editingBook, title },
              });
              await refresh();
              editor.current?.close();
              setMessage("书名已保存");
            } catch (e) {
              setEditError((e as Error).message);
            }
          }}
        >
          <h2 className="field-label">修改书名与书籍信息</h2>
          <label className="field-label">
            书名
            <input
              aria-label="书名"
              required
              maxLength={300}
              value={editingBook?.title || ""}
              onChange={(e) =>
                setEditingBook((v) =>
                  v ? { ...v, title: e.target.value } : null,
                )
              }
            />
          </label>
          <label className="field-label">
            作者
            <input
              aria-label="作者"
              maxLength={300}
              value={editingBook?.author || ""}
              onChange={(e) =>
                setEditingBook((v) =>
                  v ? { ...v, author: e.target.value } : null,
                )
              }
            />
          </label>
          <label className="field-label" htmlFor="book-description">
            简介
          </label>
          <textarea
            id="book-description"
            className="annotation-input"
            maxLength={1000}
            value={editingBook?.description || ""}
            onChange={(e) =>
              setEditingBook((v) =>
                v ? { ...v, description: e.target.value } : null,
              )
            }
          />
          {editError && <p className="error-text" role="alert">{editError}</p>}
          <div className="dialog-footer">
            <button type="button" onClick={() => editor.current?.close()}>
              取消
            </button>
            <button className="primary-button" type="submit">
              保存书籍信息
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
