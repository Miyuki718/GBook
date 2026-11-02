"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { chapterText, type Book } from "../lib/books";
import { anchorFromSelection, segments, type Anchor } from "../lib/anchors";
import { useSession, type Annotation } from "./session";
import { Discussion } from "./discussion";

type Pending = { anchor: Anchor; x: number; y: number };
export function Reader({ book }: { book: Book }) {
  const {
    annotations,
    positions,
    bookmarks,
    api,
    refresh,
    saveAnnotation,
    savePosition,
  } = useSession();
  const [chapterIndex, setChapterIndex] = useState(() =>
    Math.max(
      0,
      book.chapters.findIndex(
        (c) =>
          c.id ===
            (typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("chapter")
              : null) || c.id === positions[book.id]?.chapterId,
      ),
    ),
  );
  const [fontSize, setFontSize] = useState(19);
  const [showNotes, setShowNotes] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<{
    anchor: Anchor;
    id?: string;
    revision?: number;
  } | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [saveError,setSaveError]=useState('');
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    {
      chapterId: string;
      chapterTitle: string;
      start: number;
      excerpt: string;
    }[]
  >([]);
  const locationOffset = useRef(0);
  const article = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const chapter = book.chapters[chapterIndex];
  const text = chapterText(chapter);
  const current = annotations.filter(
    (a) => a.bookId === book.id && a.chapterId === chapter.id,
  );
  const percentage = Math.round(
    ((chapterIndex + 1) / book.chapters.length) * 100,
  );
  useEffect(() => {
    if (editing) {
      dialog.current?.showModal();
      dialog.current?.querySelector("textarea")?.focus();
    }
  }, [editing]);
  useEffect(() => {
    const saved = positions[book.id];
    locationOffset.current = saved?.chapterId === chapter.id ? saved.offset : 0;
    const target = Array.from(
      article.current?.querySelectorAll<HTMLElement>("p[data-start]") ?? [],
    )
      .reverse()
      .find((p) => Number(p.dataset.start) <= locationOffset.current);
    if (locationOffset.current && target)
      target.scrollIntoView({ block: "start" });
    let timer: ReturnType<typeof setTimeout>;
    const persist = () => {
      const p = {
        bookId: book.id,
        chapterId: chapter.id,
        offset: locationOffset.current,
        percent: Math.round(
          ((chapterIndex + locationOffset.current / Math.max(1, text.length)) /
            book.chapters.length) *
            100,
        ),
      };
      savePosition(p).catch((e) => setToast(e.message));
    };
    const scroll = () => {
      clearTimeout(timer);
      const visible = Array.from(
        article.current?.querySelectorAll<HTMLElement>("p[data-start]") ?? [],
      ).find((p) => p.getBoundingClientRect().bottom > 80);
      if (visible) locationOffset.current = Number(visible.dataset.start);
      timer = setTimeout(persist, 500);
    };
    persist();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      clearTimeout(timer);
    };
  }, [book.id, chapter.id, savePosition]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const clear = () => setPending(null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !article.current?.contains(target) &&
        !target.closest('[role="toolbar"]')
      )
        setPending(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function capture() {
    if (!article.current || dialog.current?.open) return;
    const selection = window.getSelection();
    const anchor = anchorFromSelection(article.current, text, selection);
    if (!anchor || !selection) {
      setPending(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setPending({
      anchor,
      x: Math.max(
        115,
        Math.min(window.innerWidth - 115, rect.left + rect.width / 2),
      ),
      y: Math.max(76, Math.min(window.innerHeight - 100, rect.bottom + 10)),
    });
  }
  useEffect(() => {
    let frame = 0;
    const changed = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(capture);
    };
    document.addEventListener("selectionchange", changed);
    return () => {
      document.removeEventListener("selectionchange", changed);
      cancelAnimationFrame(frame);
    };
  }, [text]);
  function openEditor(anchor: Anchor, id?: string) {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const existing=id?annotations.find(a=>a.id===id):current.find(a=>a.start===anchor.start&&a.end===anchor.end);
    setEditing({ anchor, id:existing?.id??id,revision:existing?.revision });
    setNote(existing?.note??'');setSaveError('');
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }
  function closeEditor() {
    dialog.current?.close();
    setEditing(null);
    returnFocus.current?.focus();
  }
  async function save(
    anchor: Anchor,
    value: string | undefined,
    id?: string,
    revision?: number,
  ): Promise<Annotation | undefined> {
    if (text.slice(anchor.start, anchor.end) !== anchor.exact) {
      setToast("原文已变化，请重新选择。");setSaveError('原文已变化，请重新选择。');
      return;
    }
    const existing = id
      ? annotations.find((a) => a.id === id)
      : current.find((a) => a.start === anchor.start && a.end === anchor.end);
    try {
      setSaveError('');
      const saved = await saveAnnotation({
        ...anchor,
        id: id??existing?.id,
        revision: revision??existing?.revision,
        bookId: book.id,
        chapterId: chapter.id,
        note: value ?? existing?.note ?? "",
      });
      setPending(null);
      window.getSelection()?.removeAllRanges();
      setToast("已保存到本地");
      return saved;
    } catch (e) {
      setToast((e as Error).message);
      setSaveError((e as Error).message);
      return undefined;
    }
  }
  function go(index: number) {
    if (index < 0 || index >= book.chapters.length) return;
    setChapterIndex(index);
    setPending(null);
    window.getSelection()?.removeAllRanges();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openSaved(a: Annotation) {
    openEditor(a, a.id);
  }
  async function ensureSaved() {
    if (!editing) return;
    const saved = await save(editing.anchor, note.trim(), editing.id,editing.revision);
    if (saved) setEditing({ anchor: saved, id: saved.id,revision:saved.revision });
    return saved;
  }
  async function addBookmark() {
    try {
      await api("/api/library", {
        op: "bookmark.add",
        value: {
          bookId: book.id,
          chapterId: chapter.id,
          offset: locationOffset.current,
          label: chapter.title,
        },
      });
      await refresh();
      setToast("书签已保存");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  function jump(chapterId: string, offset: number) {
    const index = book.chapters.findIndex((c) => c.id === chapterId);
    go(index);
    setTimeout(() => {
      const p = Array.from(
        article.current?.querySelectorAll<HTMLElement>("p[data-start]") ?? [],
      )
        .reverse()
        .find((p) => Number(p.dataset.start) <= offset);
      p?.scrollIntoView({ block: "center" });
    }, 50);
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("annotation");
    const found = annotations.find((a) => a.id === id && a.bookId === book.id);
    if (found) {
      setChapterIndex(book.chapters.findIndex((c) => c.id === found.chapterId));
      openSaved(found);
    }
  }, [book.id]);
  let base = 0;
  return (
    <div
      className="reader-shell"
      onKeyDown={(e) => {
        if (e.key === "Escape") setPending(null);
      }}
    >
      <header className="reader-top">
        <Link href="/">‹ 返回书架</Link>
        <div className="reader-title">
          {book.title}
          <small>{book.author}</small>
        </div>
        <div className="reader-tools">
          <button className="icon-button" onClick={addBookmark}>
            ＋书签
          </button>
          <Link className="icon-button" href="/settings">
            连接
          </Link>
          <button
            className="icon-button"
            aria-label="缩小字号"
            disabled={fontSize <= 16}
            onClick={() => setFontSize((n) => n - 1)}
          >
            A−
          </button>
          <button
            className="icon-button"
            aria-label="放大字号"
            disabled={fontSize >= 26}
            onClick={() => setFontSize((n) => n + 1)}
          >
            A+
          </button>
          <button
            className="icon-button"
            aria-expanded={showNotes}
            onClick={() => setShowNotes((v) => !v)}
          >
            批注 {current.length}
          </button>
        </div>
      </header>
      <div className={`reader-grid ${showNotes ? "" : "hide-notes"}`}>
        <nav className="chapter-nav" aria-label="章节目录">
          <h2 className="rail-title">
            目录 <span>{book.chapters.length} 章</span>
          </h2>
          {book.chapters.map((c, i) => (
            <button
              key={c.id}
              className={i === chapterIndex ? "current" : ""}
              aria-current={i === chapterIndex ? "page" : undefined}
              onClick={() => go(i)}
            >
              <span>0{i + 1}　</span>
              {c.title}
            </button>
          ))}
          <small>
            拖动选中正文
            <br />
            留下一条属于你的批注。
          </small>
          <form
            className="book-search"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setResults(
                  await api(
                    `/api/library?bookId=${book.id}&q=${encodeURIComponent(search)}`,
                  ),
                );
              } catch (e) {
                setToast((e as Error).message);
              }
            }}
          >
            <input
              aria-label="搜索书内正文"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={200}
              placeholder="搜索本书…"
            />
            <button type="submit" disabled={!search.trim()}>
              查找
            </button>
          </form>
          <div className="search-results">
            {results.map((r, i) => (
              <button key={i} onClick={() => jump(r.chapterId, r.start)}>
                {r.chapterTitle}
                <small>{r.excerpt}</small>
              </button>
            ))}
          </div>
          <h2 className="rail-title">书签</h2>
          {bookmarks
            .filter((b) => b.bookId === book.id)
            .map((b) => (
              <div className="bookmark-row" key={b.id}>
                <button onClick={() => jump(b.chapterId, b.offset)}>
                  {b.label}
                </button>
                <button
                  aria-label={`删除书签 ${b.label}`}
                  onClick={async () => {
                    await api("/api/library", {
                      op: "bookmark.delete",
                      id: b.id,
                    });
                    await refresh();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
        </nav>
        <main className="reading-column">
          <div className="mobile-chapters">
            <select
              aria-label="选择章节"
              value={chapterIndex}
              onChange={(e) => go(Number(e.target.value))}
            >
              {book.chapters.map((c, i) => (
                <option value={i} key={c.id}>
                  {i + 1} · {c.title}
                </option>
              ))}
            </select>
            <details className="mobile-library-tools">
              <summary>书内搜索与书签</summary>
              <form
                className="book-search"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    setResults(
                      await api(
                        `/api/library?bookId=${book.id}&q=${encodeURIComponent(search)}`,
                      ),
                    );
                  } catch (e) {
                    setToast((e as Error).message);
                  }
                }}
              >
                <input
                  aria-label="手机书内搜索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={200}
                  placeholder="搜索本书…"
                />
                <button type="submit" disabled={!search.trim()}>
                  查找
                </button>
              </form>
              {results.map((r, i) => (
                <button
                  className="annotation-card"
                  key={i}
                  onClick={() => jump(r.chapterId, r.start)}
                >
                  {r.chapterTitle} · {r.excerpt}
                </button>
              ))}
              {bookmarks
                .filter((b) => b.bookId === book.id)
                .map((b) => (
                  <div className="bookmark-row" key={b.id}>
                    <button onClick={() => jump(b.chapterId, b.offset)}>
                      {b.label}
                    </button>
                    <button
                      aria-label={`移除书签 ${b.label}`}
                      onClick={async () => {
                        await api("/api/library", {
                          op: "bookmark.delete",
                          id: b.id,
                        });
                        await refresh();
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </details>
          </div>
          <p className="chapter-kicker">
            CHAPTER {String(chapterIndex + 1).padStart(2, "0")}
          </p>
          <h1>{chapter.title}</h1>
          <p className="chapter-intro">选中一句话，留住此刻的想法。</p>
          <article
            ref={article}
            className="reading-text"
            aria-label="书籍正文"
            tabIndex={0}
            style={{ fontSize }}
            onPointerUp={capture}
            onKeyUp={capture}
          >
            {chapter.paragraphs.map((paragraph, index) => {
              const paragraphBase = base;
              base += paragraph.length + 2;
              return (
                <p key={chapter.id + index} data-start={paragraphBase}>
                  {segments(paragraph, paragraphBase, current).map((s, i) =>
                    s.ids.length ? (
                      <mark
                        key={i}
                        tabIndex={0}
                        role="button"
                        aria-label={`查看高亮：${s.text}`}
                        onClick={() => {
                          if (window.getSelection()?.toString()) return;
                          const a = current.find(
                            (a) => a.id === s.ids[s.ids.length - 1],
                          );
                          if (a) openSaved(a);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const a = current.find(
                              (a) => a.id === s.ids[s.ids.length - 1],
                            );
                            if (a) openSaved(a);
                          }
                        }}
                      >
                        {s.text}
                      </mark>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                  {index < chapter.paragraphs.length - 1 ? "\n\n" : null}
                </p>
              );
            })}
          </article>
          <div className="chapter-pager">
            <button
              disabled={chapterIndex === 0}
              onClick={() => go(chapterIndex - 1)}
            >
              ← 上一章
            </button>
            <span>
              {chapterIndex + 1} / {book.chapters.length}
            </span>
            <button
              disabled={chapterIndex === book.chapters.length - 1}
              onClick={() => go(chapterIndex + 1)}
            >
              下一章 →
            </button>
          </div>
        </main>
        {showNotes && (
          <aside className="annotation-rail" aria-label="本章批注">
            <h2 className="rail-title">
              字里行间 <span>{current.length}</span>
            </h2>
            <p className="session-notice">
              批注与讨论保存在本机。<Link href="/notes">查看全部批注 →</Link>
            </p>
            {current.length === 0 ? (
              <div className="empty-state">
                <span>✳</span>
                <h3>想法，从这里开始</h3>
                <p>
                  选中触动你的文字，
                  <br />
                  划线，或写下此刻的想法。
                </p>
              </div>
            ) : (
              current.map((a) => (
                <button
                  className="annotation-card"
                  key={a.id}
                  onClick={() => openSaved(a)}
                >
                  <blockquote>{a.exact}</blockquote>
                  <p>{a.note || "只高亮，暂未添加批注"}</p>
                  <small>我 · 点击查看或编辑</small>
                </button>
              ))
            )}
          </aside>
        )}
      </div>
      <footer className="reader-bottom">
        <span>
          {chapterIndex + 1} / {book.chapters.length} 章
        </span>
        <div className="progress-track">
          <div style={{ width: `${percentage}%` }} />
        </div>
        <span>自动保存阅读位置 · 第 {chapterIndex + 1} 章</span>
      </footer>
      {pending && (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label="选中文字操作"
          style={{ left: pending.x, top: pending.y }}
          onPointerDown={(e) => e.preventDefault()}
        >
          <button onClick={() => save(pending.anchor, undefined)}>
            ⌁ 高亮
          </button>
          <button onClick={() => openEditor(pending.anchor)}>✎ 写批注</button>
          <button
            aria-label="取消选区"
            onClick={() => {
              setPending(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            ×
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="annotation-dialog"
        aria-labelledby="annotation-title"
        onCancel={() => setEditing(null)}
        onClose={() => setEditing(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              closeEditor();
          }
        }}
      >
        <div className="dialog-header">
          <h2 id="annotation-title">留在字里行间</h2>
          <button
            className="dialog-close"
            aria-label="关闭批注弹窗"
            onClick={closeEditor}
          >
            ×
          </button>
        </div>
        <div className="dialog-body">
          <blockquote className="quote-preview">
            {editing?.anchor.exact}
          </blockquote>
          <label className="field-label" htmlFor="annotation-note">
            <span className="avatar">我</span>我的想法
          </label>
          <textarea
            id="annotation-note"
            className="annotation-input"
            autoFocus
            maxLength={4000}
            placeholder="这段文字，让你想到了什么？"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {editing && (
            <Discussion
              annotation={annotations.find((a) => a.id === editing.id)}
              ensureSaved={ensureSaved}
            />
          )}
          {saveError&&<p className="error-text" role="alert">{saveError} {editing?.id&&<button className="secondary-button" onClick={async()=>{try{const latest=await api<Annotation>(`/api/library?noteId=${editing.id}`);if(note!==latest.note&&!window.confirm('载入最新版本将替换当前未保存的草稿，继续吗？'))return;setNote(latest.note);setEditing({anchor:latest,id:latest.id,revision:latest.revision});setSaveError('');await refresh();}catch(e){setSaveError((e as Error).message);}}}>载入最新版本</button>}</p>}
          <div className="dialog-footer">
            <small>{note.length} / 4000 · 保存在本机</small>
            <div className="flex items-center gap-4">
              <button className="secondary-button" onClick={closeEditor}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  if (await ensureSaved()) closeEditor();
                }}
              >
                {editing?.id ? "保存修改" : "保存高亮与批注"}
              </button>
              {editing?.id && (
                <button
                  className="secondary-button"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "删除这条高亮及全部讨论？此操作不可撤销。",
                      )
                    )
                      return;
                    try {
                      await api("/api/library", {
                        op: "annotation.delete",
                        id: editing.id,
                      });
                      await refresh();
                      closeEditor();
                    } catch (e) {
                      setToast((e as Error).message);
                      setSaveError((e as Error).message);
                    }
                  }}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
