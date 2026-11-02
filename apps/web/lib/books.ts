export type { Book, Chapter } from "@gbook/core/types";
export const chapterText = (c: { paragraphs: string[] }) =>
  c.paragraphs.join("\n\n");
