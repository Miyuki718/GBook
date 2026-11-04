"use client";
import { useRef, useState } from "react";
import type { Chapter } from "@gbook/core/types";

export function ChapterList({ chapters, current, onSelect }: {
  chapters: Chapter[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const visible = chapters.map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter, index }) =>
      !query.trim() || chapter.title.toLowerCase().includes(query.trim().toLowerCase()) ||
      String(index + 1) === query.trim());
  function locate() {
    setQuery("");
    requestAnimationFrame(() => {
      const box = list.current;
      const item = box?.querySelector<HTMLElement>('[aria-current="page"]');
      if (box && item) box.scrollTop = item.offsetTop - (box.clientHeight - item.offsetHeight) / 2;
    });
  }
  return (
    <>
      <div className="toc-tools">
        <input aria-label="筛选章节" placeholder="章节名或序号" value={query}
          onChange={(event) => { setQuery(event.target.value); if (list.current) list.current.scrollTop = 0; }} />
        <button onClick={locate}>当前章</button>
      </div>
      <div ref={list} className="toc-list" tabIndex={0} aria-label="章节列表">
        {visible.map(({ chapter, index }) => (
          <button key={chapter.id} className={index === current ? "current" : ""}
            aria-current={index === current ? "page" : undefined} onClick={() => onSelect(index)}>
            <span>{String(index + 1).padStart(2, "0")}　</span>{chapter.title}
          </button>
        ))}
        {!visible.length && <p>没有匹配的章节</p>}
      </div>
    </>
  );
}
