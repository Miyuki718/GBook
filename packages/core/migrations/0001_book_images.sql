CREATE TABLE book_images (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  before_paragraph INTEGER NOT NULL,
  inline_offset INTEGER,
  alt TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL
);
--> statement-breakpoint
CREATE INDEX book_images_book ON book_images(book_id);
