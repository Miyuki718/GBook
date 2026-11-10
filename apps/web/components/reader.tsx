"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import type { BookImage } from "@gbook/core/types";
import { chapterText, type Book } from "../lib/books";
import { anchorFromSelection, segments, type Anchor } from "../lib/anchors";
import { useSession, type Annotation } from "./session";
import { Discussion } from "./discussion";
import { ChapterList } from "./chapter-list";

type Pending = { anchor: Anchor; x: number; y: number };
type ReaderTheme = "day" | "paper" | "night";
export function Reader({ book, images }: { book: Book; images: BookImage[] }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"目录" | "书签" | "批注" | "搜索" | "外观">("目录");
  const [recordQuery, setRecordQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const tocDialog = useRef<HTMLDialogElement>(null);
  const imageFile = useRef<HTMLInputElement>(null);
  const [addingImages, setAddingImages] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    try {
      const saved = localStorage.getItem("gbook-reader-theme");
      if (saved === "day" || saved === "night") return saved;
    } catch { /* Keep the default when storage is disabled. */ }
    return "paper";
  });
  const {
    annotations,
    positions,
    ownerPreview,
    chatGPTAvailable,
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
  const positionRevision = useRef(positions[book.id]?.revision ?? 0);
  const lastPosition = useRef(positions[book.id]);
  const pendingPosition = useRef(Promise.resolve());
  const conflict = useRef(false);
  const [positionConflict, setPositionConflict] = useState(false);
  const article = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const chapter = book.chapters[chapterIndex];
  const lastChapter = useRef(chapter.id);
  const illustrations = new Map<number, BookImage[]>();
  for (const image of images) {
    if (image.chapterId !== chapter.id) continue;
    const group = illustrations.get(image.beforeParagraph) ?? [];
    group.push(image);
    illustrations.set(image.beforeParagraph, group);
  }
  function renderImages(index: number) {
    return illustrations.get(index)?.filter((image) => image.inlineOffset === null).map((image) => (
      <figure className="epub-illustration" key={image.id}>
        <img src={`/api/images/${image.id}`} alt={image.alt || "书籍插图"} loading="lazy" draggable={false} />
      </figure>
    ));
  }
  async function addImages(file: File) {
    setAddingImages(true);
    try {
      const form = new FormData();
      form.set("bookId", book.id);
      form.set("file", file);
      const result = await api<{ imageCount: number }>("/api/import", form);
      router.refresh();
      setToast(`已补充 ${result.imageCount} 张插图`);
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setAddingImages(false);
    }
  }
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
      pendingPosition.current = pendingPosition.current.then(async () => {
        if (conflict.current) return;
        if (ownerPreview && lastPosition.current?.chapterId === p.chapterId &&
          lastPosition.current.offset === p.offset) return;
        try {
          const saved = await savePosition(ownerPreview ? { ...p, revision: positionRevision.current } : p);
          positionRevision.current = saved.revision ?? 0;
          lastPosition.current = saved;
        } catch (error) {
          const failure = error as Error & { status?: number };
          if (ownerPreview && failure.status === 409) {
            conflict.current = true;
            setPositionConflict(true);
          }
          setToast(failure.message);
        }
      });
    };
    const scroll = () => {
      clearTimeout(timer);
      const visible = Array.from(
        article.current?.querySelectorAll<HTMLElement>("p[data-start]") ?? [],
      ).find((p) => p.getBoundingClientRect().bottom > 80);
      if (visible) locationOffset.current = Number(visible.dataset.start);
      timer = setTimeout(persist, 500);
    };
    if (!ownerPreview || lastChapter.current !== chapter.id) persist();
    lastChapter.current = chapter.id;
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      clearTimeout(timer);
    };
  }, [book.id, chapter.id, savePosition, ownerPreview]);
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
  function openPanel(section: typeof panel) {
    setRecordQuery("");
    setPanel(section);
    tocDialog.current?.showModal();
  }
  function jumpFromPanel(chapterId: string, offset: number) {
    tocDialog.current?.close();
    jump(chapterId, offset);
  }
  const chapterNames = new Map(book.chapters.map((item) => [item.id, item.title]));
  const matchesRecord = (...values: (string | undefined)[]) =>
    values.join(" ").toLowerCase().includes(recordQuery.trim().toLowerCase());
  const savedBookmarks = bookmarks.filter((item) => item.bookId === book.id);
  const savedNotes = annotations.filter((item) => item.bookId === book.id);
  let base = 0;
  return (
    <div
      className="reader-shell"
      data-theme={theme}
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
          <button className="icon-button desktop-reader-action" onClick={() => openPanel("目录")}>阅读导航</button>
          <button className="icon-button" onClick={addBookmark}>＋书签</button>
          <button className="icon-button" onClick={() => openPanel("外观")}>Aa</button>
          <select className="icon-button reader-theme" aria-label="阅读主题" value={theme}
            onChange={(event) => {
              const next = event.target.value as ReaderTheme;
              setTheme(next);
              try { localStorage.setItem("gbook-reader-theme", next); } catch { /* Optional storage. */ }
            }}>
            <option value="day">日间</option>
            <option value="paper">纸色</option>
            <option value="night">夜间</option>
          </select>
        </div>
      </header>
      {positionConflict && (
        <div className="global-error" role="status">
          另一台设备已更新进度。
          <button onClick={() => location.assign(`/read/${book.id}`)}>载入最新位置</button>
        </div>
      )}
      <div className="reader-grid">
        <nav className="chapter-nav" aria-label="章节目录">
          <h2 className="rail-title">
            目录 <span>{book.chapters.length} 章</span>
          </h2>
          <ChapterList chapters={book.chapters} current={chapterIndex} onSelect={go} />
        </nav>
        <main className="reading-column">
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
              const inline = illustrations.get(index)?.filter((image) => image.inlineOffset !== null) ?? [];
              const cuts = inline.map((image) => paragraphBase + image.inlineOffset!);
              const renderInline = (offset: number) => inline
                .filter((image) => image.inlineOffset === offset)
                .map((image) => (
                  <img className="epub-inline-image" key={image.id} src={`/api/images/${image.id}`}
                    alt={image.alt || "行内插图"} loading="lazy" draggable={false} />
                ));
              let offset = 0;
              return (
                <Fragment key={chapter.id + index}>
                {renderImages(index)}
                <p data-start={paragraphBase}>
                  {segments(paragraph, paragraphBase, current, cuts).map((s, i) => {
                    const before = offset;
                    offset += s.text.length;
                    return (
                    <Fragment key={i}>
                    {renderInline(before)}
                    {s.ids.length ? (
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
                    )}
                    </Fragment>
                    );
                  })}
                  {renderInline(paragraph.length)}
                  {index < chapter.paragraphs.length - 1 ? "\n\n" : null}
                </p>
                </Fragment>
              );
            })}
            {renderImages(chapter.paragraphs.length)}
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
          <aside className="annotation-rail" aria-label="本章批注">
            <h2 className="rail-title">
              字里行间 <span>{current.length}</span>
            </h2>
            <p className="session-notice">
              <button onClick={() => openPanel("批注")}>查看本书全部批注 →</button>
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
      <nav className="reader-mobile-nav" aria-label="移动阅读工具">
        {(["目录", "书签", "批注", "搜索"] as const).map((item) => (
          <button key={item} onClick={() => openPanel(item)}>{item}</button>
        ))}
      </nav>
      <dialog ref={tocDialog} className="toc-dialog reader-panel" aria-labelledby="toc-title">
        <div className="toc-heading">
          <h2 id="toc-title">阅读导航</h2>
          <button className="icon-button" onClick={() => tocDialog.current?.close()}>关闭</button>
        </div>
        <div className="reader-panel-tabs" role="group" aria-label="阅读导航分类">
          {(["目录", "书签", "批注", "搜索", "外观"] as const).map((item) => (
            <button key={item} aria-pressed={panel === item} onClick={() => {
              setPanel(item);
              setRecordQuery("");
            }}>{item}</button>
          ))}
        </div>
        <div className="reader-panel-content" key={panel}>
          {panel === "目录" && (
            <ChapterList chapters={book.chapters} current={chapterIndex} onSelect={(index) => {
              tocDialog.current?.close();
              go(index);
            }} />
          )}
          {(panel === "书签" || panel === "批注") && (
            <>
              <input className="reader-panel-input" type="search" aria-label={`筛选${panel}`}
                placeholder={panel === "书签" ? "按书签或章节名称筛选" : "按批注、原文或章节筛选"}
                value={recordQuery} onChange={(event) => setRecordQuery(event.target.value)} />
              {panel === "书签" ? (
                <>
                  <button className="icon-button panel-add-bookmark" onClick={async () => {
                    tocDialog.current?.close();
                    await addBookmark();
                  }}>＋ 添加当前位置</button>
                  {savedBookmarks.filter((item) => matchesRecord(item.label, chapterNames.get(item.chapterId))).map((item) => (
                    <div className="reader-record" key={item.id}>
                      <button onClick={() => jumpFromPanel(item.chapterId, item.offset)}>
                        <strong>{item.label}</strong><small>{chapterNames.get(item.chapterId)} · 跳转</small>
                      </button>
                      <button className="icon-button" aria-label={`删除书签 ${item.label}`} onClick={async () => {
                        try { await api("/api/library", { op: "bookmark.delete", id: item.id }); await refresh(); }
                        catch (error) { setToast((error as Error).message); }
                      }}>删除</button>
                    </div>
                  ))}
                  {!savedBookmarks.some((item) => matchesRecord(item.label, chapterNames.get(item.chapterId))) &&
                    <p className="reader-panel-empty">{recordQuery ? "没有匹配的书签" : "还没有书签，点上方按钮添加。"}</p>}
                </>
              ) : (
                <>
                  {savedNotes.filter((item) => matchesRecord(item.note, item.exact, chapterNames.get(item.chapterId))).map((item) => (
                    <div className="reader-record" key={item.id}>
                      <button onClick={() => jumpFromPanel(item.chapterId, item.start)}>
                        <strong>{item.note || "高亮"}</strong><small>{item.exact}</small>
                        <small>{chapterNames.get(item.chapterId)} · 跳转</small>
                      </button>
                      <button className="icon-button" onClick={() => {
                        jumpFromPanel(item.chapterId, item.start);
                        openSaved(item);
                      }}>编辑</button>
                    </div>
                  ))}
                  {!savedNotes.some((item) => matchesRecord(item.note, item.exact, chapterNames.get(item.chapterId))) &&
                    <p className="reader-panel-empty">{recordQuery ? "没有匹配的批注" : "长按或选中正文，可以高亮和写批注。"}</p>}
                </>
              )}
            </>
          )}
          {panel === "搜索" && (
            <>
              <form className="book-search" onSubmit={async (event) => {
                event.preventDefault();
                if (!search.trim()) return;
                try {
                  setResults(await api(`/api/library?bookId=${book.id}&q=${encodeURIComponent(search.trim())}`));
                  setSearched(true);
                } catch (error) { setToast((error as Error).message); }
              }}>
                <input type="search" aria-label="搜索书内正文" maxLength={200}
                  value={search} placeholder="输入要找的正文…" onChange={(event) => {
                    setSearch(event.target.value);
                    setSearched(false);
                    setResults([]);
                  }} />
                <button className="icon-button" type="submit" disabled={!search.trim()}>查找</button>
              </form>
              {results.map((item, index) => (
                <button className="annotation-card" key={index} onClick={() => jumpFromPanel(item.chapterId, item.start)}>
                  <strong>{item.chapterTitle}</strong><p>{item.excerpt}</p>
                </button>
              ))}
              {searched && !results.length && <p className="reader-panel-empty">没有找到匹配正文。</p>}
            </>
          )}
          {panel === "外观" && <div className="reader-appearance">
          {book.subtitle.startsWith("EPUB") && images.length === 0 && (
            <>
              <button className="icon-button" disabled={addingImages} onClick={() => imageFile.current?.click()}>
                {addingImages ? "正在导入插图…" : "补充 EPUB 插图"}
              </button>
              <input ref={imageFile} type="file" accept=".epub" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void addImages(file);
              }} />
            </>
          )}
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
          </div>}
        </div>
      </dialog>
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
          {editing && chatGPTAvailable && (
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
