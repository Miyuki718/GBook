export type Chapter = {
  id: string;
  title: string;
  paragraphs: string[];
  contentHash?: string;
};
export type Book = {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  color: string;
  motif: string;
  description: string;
  chapters: Chapter[];
};
export type BookSummary = Omit<Book, "chapters"> & { chapterCount: number };
export type BookImage = {
  id: string;
  chapterId: string;
  beforeParagraph: number;
  inlineOffset: number | null;
  alt: string;
};
export type ImportedImage = Omit<BookImage, "id"> & {
  mime: string;
  bytes: Uint8Array;
};
export type Annotation = {
  id: string;
  bookId: string;
  chapterId: string;
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
  note: string;
  createdAt: string;
  contentHash: string;
  source: "web" | "mcp";
  revision: number;
};
export type Message = {
  id: string;
  annotationId: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed" | "interrupted";
  model: string;
  error: string;
  createdAt: string;
  requestId: string;
};
export type Position = {
  revision?: number;
  bookId: string;
  chapterId: string;
  offset: number;
  percent: number;
};
export type Bookmark = {
  id: string;
  bookId: string;
  chapterId: string;
  offset: number;
  label: string;
  createdAt: string;
};
export type Snapshot = {
  books: BookSummary[];
  annotations: Annotation[];
  progress: Record<string, number>;
  positions: Record<string, Position>;
  bookmarks: Bookmark[];
};
