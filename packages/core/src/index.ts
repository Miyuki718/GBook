import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { dataDirectory } from "./paths.ts";
import type {
  Book,
  Annotation,
  Message,
  Position,
  Bookmark,
  Snapshot,
  BookImage,
  ImportedImage,
} from "./types.ts";
export * from "./types.ts";
export { dataDirectory } from "./paths.ts";
export const chapterText = (c: { paragraphs: string[] }) =>
  c.paragraphs.join("\n\n");
export const contentHash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class DomainError extends Error {
  code: string;
  constructor(message: string, code = "invalid_request") {
    super(message);
    this.code = code;
  }
}
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new DomainError(message);
}
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w-]+$/);
const chapterSchema = z.object({
  id,
  title: z.string().min(1).max(300),
  paragraphs: z.array(z.string().max(1_000_000)).min(1).max(10000),
  contentHash: z.string().optional(),
});
export const bookSchema = z.object({
  id,
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300),
  author: z.string().max(300),
  color: z.enum(["sand", "sage", "plum"]),
  motif: z.string().max(4),
  description: z.string().max(1000),
  chapters: z.array(chapterSchema).min(1).max(1000),
});
const anchorSchema = z.object({
  id: id.optional(),
  bookId: id,
  chapterId: id,
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  exact: z.string().min(1).max(20000),
  note: z.string().max(4000).optional(),
  revision: z.number().int().min(1).optional(),
});
export class Library {
  native: Database.Database;
  db: ReturnType<typeof drizzle>;
  constructor(filename = join(dataDirectory(), "library.db")) {
    mkdirSync(dirname(filename), { recursive: true });
    this.native = new Database(filename);
    this.native.pragma("journal_mode = WAL");
    this.native.pragma("foreign_keys = ON");
    this.native.pragma("busy_timeout = 5000");
    this.db = drizzle(this.native);
  }
  migrate() {
    migrate(this.db, {
      migrationsFolder: resolve(
        process.env.GBOOK_ROOT || process.cwd(),
        "packages/core/migrations",
      ),
    });
  }
  close() {
    this.native.close();
  }
  addBook(input: unknown) {
    const b = bookSchema.parse(input);
    assert(
      new Set(b.chapters.map((c) => c.id)).size === b.chapters.length,
      "章节 ID 重复",
    );
    assert(JSON.stringify(b).length <= 10_000_000, "书籍正文过大");
    for (const c of b.chapters) c.contentHash = contentHash(chapterText(c));
    this.db.run(
      sql`INSERT INTO books(id,title,document) VALUES(${b.id},${b.title},${JSON.stringify(b)})`,
    );
    return b;
  }
  book(bookId: string): Book {
    const row = this.db.get(
      sql`SELECT document FROM books WHERE id=${bookId} AND deleted=0`,
    ) as { document: string } | undefined;
    if (!row) throw new DomainError("书籍不存在", "not_found");
    return JSON.parse(row.document);
  }
  saveImportedBook(book: Book, images: ImportedImage[], existingId?: string) {
    return this.native.transaction(() => {
      const saved = existingId ? this.book(existingId) : this.addBook(book);
      if (existingId) {
        assert(
          saved.chapters.length === book.chapters.length &&
            saved.chapters.every((chapter, index) =>
              chapterText(chapter) === chapterText(book.chapters[index])),
          "EPUB 正文与现有书籍不一致，请选择原来的文件",
        );
        assert(images.length, "这份 EPUB 没有可导入的图片");
        this.native.prepare("DELETE FROM book_images WHERE book_id = ?").run(saved.id);
      }
      const chapterIds = new Map(book.chapters.map((chapter, index) =>
        [chapter.id, saved.chapters[index].id]));
      const insert = this.native.prepare(
        "INSERT INTO book_images (id, book_id, chapter_id, before_paragraph, inline_offset, alt, mime, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const image of images) {
        insert.run(randomUUID(), saved.id, chapterIds.get(image.chapterId),
          image.beforeParagraph, image.inlineOffset, image.alt, image.mime, Buffer.from(image.bytes));
      }
      return saved;
    })();
  }
  bookImages(bookId: string) {
    return this.native.prepare(
      "SELECT id, chapter_id AS chapterId, before_paragraph AS beforeParagraph, inline_offset AS inlineOffset, alt FROM book_images WHERE book_id = ? ORDER BY rowid",
    ).all(bookId) as BookImage[];
  }
  bookImage(imageId: string) {
    return this.native.prepare(
      "SELECT mime, bytes FROM book_images JOIN books ON books.id = book_images.book_id WHERE book_images.id = ? AND books.deleted = 0",
    ).get(imageId) as { mime: string; bytes: Buffer } | undefined;
  }
  books() {
    return (
      this.db.all(
        sql`SELECT document FROM books WHERE deleted=0 ORDER BY rowid DESC`,
      ) as { document: string }[]
    ).map((r) => {
      const { chapters, ...rest } = JSON.parse(r.document) as Book;
      return { ...rest, chapterCount: chapters.length };
    });
  }
  removeBook(bookId: string) {
    this.book(bookId);
    this.db.run(sql`UPDATE books SET deleted=1 WHERE id=${bookId}`);
  }
  restoreBook(bookId: string) {
    this.db.run(sql`UPDATE books SET deleted=0 WHERE id=${id.parse(bookId)}`);
  }
  trash() {
    return this.db.all(
      sql`SELECT id,title FROM books WHERE deleted=1 ORDER BY rowid DESC`,
    ) as { id: string; title: string }[];
  }
  updateBook(input: unknown) {
    const v = z
      .object({
        id,
        title: z.string().min(1).max(300),
        author: z.string().max(300),
        description: z.string().max(1000),
      })
      .parse(input);
    const b = { ...this.book(v.id), ...v };
    this.db.run(
      sql`UPDATE books SET title=${b.title},document=${JSON.stringify(b)} WHERE id=${b.id}`,
    );
    return b;
  }
  annotation(annotationId: string): Annotation {
    const row = this.db.get(
      sql`SELECT document FROM annotations WHERE id=${annotationId}`,
    ) as { document: string } | undefined;
    if (!row) throw new DomainError("批注不存在", "not_found");
    const a = JSON.parse(row.document) as Annotation;
    this.book(a.bookId);
    return a;
  }
  annotations(bookId?: string) {
    return (
      this.db.all(
        bookId
          ? sql`SELECT document FROM annotations WHERE book_id=${bookId} ORDER BY rowid`
          : sql`SELECT a.document FROM annotations a JOIN books b ON b.id=a.book_id WHERE b.deleted=0 ORDER BY a.rowid`,
      ) as { document: string }[]
    ).map((r) => JSON.parse(r.document) as Annotation);
  }
  saveAnnotation(input: unknown, source: "web" | "mcp" = "web") {
    const a = anchorSchema.parse(input);
    return this.native.transaction(() => {
      const b = this.book(a.bookId),
        c = b.chapters.find((c) => c.id === a.chapterId);
      assert(c, "章节不存在");
      const text = chapterText(c);
      assert(
        a.start < a.end &&
          a.end <= text.length &&
          text.slice(a.start, a.end) === a.exact,
        "原文定位不匹配，请重新选择",
      );
      let existing: Annotation | undefined;
      if (a.id) existing = this.annotation(a.id);
      else
        existing = this.annotations(a.bookId).find(
          (v) =>
            v.chapterId === a.chapterId &&
            v.start === a.start &&
            v.end === a.end,
        );
      if (existing) {
        assert(
          existing.bookId === a.bookId &&
            existing.chapterId === a.chapterId &&
            existing.start === a.start &&
            existing.end === a.end,
          "不能移动已有批注",
        );
        assert(
          a.revision === existing.revision,
          "批注已在其他入口修改，请刷新后重试",
        );
      }
      const result: Annotation = {
        id: existing?.id ?? randomUUID(),
        bookId: b.id,
        chapterId: c.id,
        start: a.start,
        end: a.end,
        exact: a.exact,
        prefix: text.slice(Math.max(0, a.start - 24), a.start),
        suffix: text.slice(a.end, a.end + 24),
        note: a.note ?? existing?.note ?? "",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        contentHash: contentHash(text),
        source,
        revision: (existing?.revision ?? 0) + 1,
      };
      this.db.run(
        sql`INSERT INTO annotations(id,book_id,chapter_id,document) VALUES(${result.id},${b.id},${c.id},${JSON.stringify(result)}) ON CONFLICT(id) DO UPDATE SET document=excluded.document`,
      );
      return result;
    })();
  }
  deleteAnnotation(annotationId: string) {
    this.annotation(annotationId);
    assert(
      !this.messages(annotationId).some((m) => m.status === "pending"),
      "请先停止当前生成",
    );
    this.db.run(sql`DELETE FROM annotations WHERE id=${annotationId}`);
  }
  position(input: unknown, checkRevision = false) {
    const p = z
      .object({
        bookId: id,
        chapterId: id,
        offset: z.number().int().min(0),
        percent: z.number().min(0).max(100),
        revision: z.number().int().min(0).optional(),
      })
      .parse(input);
    const b = this.book(p.bookId),
      c = b.chapters.find((c) => c.id === p.chapterId);
    assert(c && p.offset <= chapterText(c).length, "无效阅读位置");
    return this.native.transaction(() => {
      const row = this.db.get(sql`SELECT document FROM positions WHERE book_id=${p.bookId}`) as { document: string } | undefined;
      const revision = row ? (JSON.parse(row.document) as Position).revision ?? 0 : 0;
      if (checkRevision && p.revision !== revision) {
        throw new DomainError("另一台设备已更新阅读进度，请载入最新位置。", "progress_conflict");
      }
      const saved = { ...p, revision: revision + 1 };
      this.db.run(
        sql`INSERT INTO positions(book_id,document) VALUES(${p.bookId},${JSON.stringify(saved)}) ON CONFLICT(book_id) DO UPDATE SET document=excluded.document`,
      );
      return saved;
    }).immediate();
  }
  positions() {
    return Object.fromEntries(
      (
        this.db.all(
          sql`SELECT p.document FROM positions p JOIN books b ON b.id=p.book_id WHERE b.deleted=0`,
        ) as { document: string }[]
      ).map((r) => {
        const p = JSON.parse(r.document) as Position;
        return [p.bookId, p];
      }),
    );
  }
  bookmark(input: unknown) {
    const p = z
      .object({
        bookId: id,
        chapterId: id,
        offset: z.number().int().min(0),
        label: z.string().max(200),
      })
      .parse(input);
    const b = this.book(p.bookId),
      c = b.chapters.find((c) => c.id === p.chapterId);
    assert(c && p.offset <= chapterText(c).length, "无效书签位置");
    const v = { ...p, id: randomUUID(), createdAt: new Date().toISOString() };
    this.db.run(
      sql`INSERT INTO bookmarks VALUES(${v.id},${b.id},${JSON.stringify(v)})`,
    );
    return v;
  }
  bookmarks() {
    return (
      this.db.all(
        sql`SELECT m.document FROM bookmarks m JOIN books b ON m.book_id=b.id WHERE b.deleted=0 ORDER BY m.rowid`,
      ) as { document: string }[]
    ).map((r) => JSON.parse(r.document) as Bookmark);
  }
  deleteBookmark(bookmarkId: string) {
    this.db.run(sql`DELETE FROM bookmarks WHERE id=${id.parse(bookmarkId)}`);
  }
  snapshot(): Snapshot {
    const positions = this.positions();
    return {
      books: this.books(),
      annotations: this.annotations(),
      positions,
      progress: Object.fromEntries(
        Object.entries(positions).map(([k, p]) => [k, p.percent]),
      ),
      bookmarks: this.bookmarks(),
    };
  }
  messages(annotationId: string): Message[] {
    return this.db.all(
      sql`SELECT id,annotation_id as annotationId,request_id as requestId,role,content,status,model,error,created_at as createdAt FROM messages WHERE annotation_id=${annotationId} ORDER BY rowid`,
    ) as Message[];
  }
  beginDiscussion(
    annotationId: string,
    question: string,
    model: string,
    requestId: string,
  ) {
    z.string().uuid().parse(requestId);
    z.string().min(1).max(4000).parse(question);
    z.string().min(1).max(150).parse(model);
    return this.native.transaction(() => {
      const a = this.annotation(annotationId);
      assert(
        !this.messages(annotationId).some((m) => m.status === "pending"),
        "这条批注仍在生成中",
      );
      assert(
        !this.db.get(
          sql`SELECT id FROM messages WHERE request_id=${requestId}`,
        ),
        "这次请求已提交，请刷新查看历史",
      );
      const now = new Date().toISOString();
      this.db.run(
        sql`INSERT INTO messages VALUES(${randomUUID()},${a.id},${requestId},'user',${question},'completed','', '',${now})`,
      );
      const assistantId = randomUUID();
      this.db.run(
        sql`INSERT INTO messages VALUES(${assistantId},${a.id},${requestId},'assistant','','pending',${model},'',${now})`,
      );
      return { annotation: a, assistantId };
    })();
  }
  finishDiscussion(
    messageId: string,
    content: string,
    status: "completed" | "failed" | "interrupted",
    error = "",
  ) {
    this.db.run(
      sql`UPDATE messages SET content=${content.slice(0, 1000000)},status=${status},error=${error.slice(0, 200)} WHERE id=${messageId} AND status='pending'`,
    );
  }
  recover() {
    this.db.run(
      sql`UPDATE messages SET status='interrupted',error='应用已重启，请重试' WHERE status='pending'`,
    );
  }
  search(bookId: string, query: string) {
    const b = this.book(bookId),
      q = z.string().min(1).max(200).parse(query.trim());
    const matches: {
      chapterId: string;
      chapterTitle: string;
      start: number;
      end: number;
      excerpt: string;
    }[] = [];
    for (const c of b.chapters) {
      const text = chapterText(c);
      let at = 0;
      while ((at = text.indexOf(q, at)) >= 0 && matches.length < 100) {
        matches.push({
          chapterId: c.id,
          chapterTitle: c.title,
          start: at,
          end: at + q.length,
          excerpt: text.slice(Math.max(0, at - 30), at + q.length + 50),
        });
        at += q.length;
      }
    }
    return matches;
  }
  exportBackup() {
    return {
      format: "gbook-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      books: this.books().map((b) => this.book(b.id)),
      annotations: this.annotations(),
      messages: this.db.all(
        sql`SELECT m.id,m.annotation_id as annotationId,m.request_id as requestId,m.role,m.content,m.status,m.model,m.error,m.created_at as createdAt FROM messages m JOIN annotations a ON a.id=m.annotation_id JOIN books b ON b.id=a.book_id WHERE b.deleted=0 ORDER BY m.rowid`,
      ) as Message[],
      positions: Object.values(this.positions()),
      bookmarks: this.bookmarks(),
    };
  }
  importBackup(input: unknown) {
    const schema = z.object({
      format: z.literal("gbook-backup"),
      version: z.literal(1),
      books: z.array(bookSchema).max(1000),
      annotations: z
        .array(
          anchorSchema.extend({
            id,
            createdAt: z.string(),
            revision: z.number().int().min(1),
            source: z.enum(["web", "mcp"]).optional(),
          }),
        )
        .max(100000),
      messages: z
        .array(
          z.object({
            id,
            annotationId: id,
            requestId: id,
            role: z.enum(["user", "assistant"]),
            content: z.string().max(1000000),
            status: z.enum(["completed", "failed", "interrupted", "pending"]),
            model: z.string().max(150),
            error: z.string().max(200),
            createdAt: z.string(),
          }),
        )
        .max(200000),
      positions: z.array(
        z.object({
          bookId: id,
          chapterId: id,
          offset: z.number().int().min(0),
          percent: z.number().min(0).max(100),
        }),
      ),
      bookmarks: z.array(
        z.object({
          id,
          bookId: id,
          chapterId: id,
          offset: z.number().int().min(0),
          label: z.string().max(200),
          createdAt: z.string(),
        }),
      ),
    });
    const data = schema.parse(input);
    assert(
      new Set(data.books.map((b) => b.id)).size === data.books.length,
      "备份包含重复书籍 ID",
    );
    assert(
      new Set(data.annotations.map((a) => a.id)).size ===
        data.annotations.length,
      "备份包含重复批注 ID",
    );
    assert(
      new Set(data.messages.map((m) => m.id)).size === data.messages.length,
      "备份包含重复消息 ID",
    );
    return this.native.transaction(() => {
      const mapping = new Map<string, string>();
      let imported = 0;
      for (const book of data.books) {
        const newId = randomUUID();
        mapping.set(book.id, newId);
        this.addBook({ ...book, id: newId });
        imported++;
      }
      const amap = new Map<string, string>();
      for (const a of data.annotations) {
        const b = mapping.get(a.bookId);
        assert(b, "备份包含未知书籍");
        const saved = this.saveAnnotation({
          ...a,
          id: undefined,
          revision: undefined,
          bookId: b,
        });
        const restored = {
          ...saved,
          createdAt: a.createdAt,
          source: a.source ?? "web",
        };
        this.db.run(
          sql`UPDATE annotations SET document=${JSON.stringify(restored)} WHERE id=${saved.id}`,
        );
        amap.set(a.id, saved.id);
      }
      const requests = new Map<string, string>();
      for (const m of data.messages) {
        const a = amap.get(m.annotationId);
        assert(a, "备份包含未知批注");
        const request = requests.get(m.requestId) ?? randomUUID();
        requests.set(m.requestId, request);
        this.db.run(
          sql`INSERT INTO messages VALUES(${randomUUID()},${a},${request},${m.role},${m.content},${m.status === "pending" ? "interrupted" : m.status},${m.model},${m.error},${m.createdAt})`,
        );
      }
      for (const p of data.positions) {
        assert(mapping.has(p.bookId), "无效进度书籍");
        this.position({ ...p, bookId: mapping.get(p.bookId) });
      }
      for (const b of data.bookmarks) {
        assert(mapping.has(b.bookId), "无效书签书籍");
        const saved = this.bookmark({ ...b, bookId: mapping.get(b.bookId) });
        this.db.run(
          sql`UPDATE bookmarks SET document=${JSON.stringify({ ...saved, createdAt: b.createdAt })} WHERE id=${saved.id}`,
        );
      }
      return { imported, bookIds: [...mapping.values()] };
    })();
  }
  async backupFile(destination: string) {
    await this.native.backup(destination);
  }
}
const globalStore = globalThis as typeof globalThis & {
  gbookLibrary?: Library;
};
export function getLibrary() {
  const previous: unknown = globalStore.gbookLibrary;
  if (previous && !(previous instanceof Library)) {
    (previous as { close: () => void }).close();
    globalStore.gbookLibrary = undefined;
  }
  if (!globalStore.gbookLibrary) globalStore.gbookLibrary = new Library();
  return globalStore.gbookLibrary;
}
