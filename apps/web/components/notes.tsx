"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession } from "./session";
export function Notes() {
  const { annotations, books, loaded } = useSession();
  const [q, setQ] = useState("");
  const visible = annotations.filter((a) =>
    (
      a.note +
      a.exact +
      (books.find((b) => b.id === a.bookId)?.title || "")
    ).includes(q),
  );
  return (
    <main className="settings-page">
      <Link href="/">‹ 返回书架</Link>
      <h1>字里行间</h1>
      <label className="search">
        <input
          aria-label="搜索全部批注"
          placeholder="搜索原文、想法或书名"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <p>{annotations.length} 条已保存的高亮与批注</p>
      {!loaded ? (
        <p>正在读取…</p>
      ) : visible.length ? (
        visible.map((a) => (
          <Link
            className="annotation-card"
            href={`/read/${a.bookId}?chapter=${a.chapterId}&annotation=${a.id}`}
            key={a.id}
          >
            <small>
              {books.find((b) => b.id === a.bookId)?.title} ·{" "}
              {a.source === "mcp" ? "MCP" : "我"} ·{" "}
              {new Date(a.createdAt).toLocaleString("zh-CN")}
            </small>
            <blockquote>{a.exact}</blockquote>
            <p>{a.note || "仅高亮"}</p>
            <small>打开原文和讨论 →</small>
          </Link>
        ))
      ) : (
        <p>还没有匹配的批注。</p>
      )}
    </main>
  );
}
