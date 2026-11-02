CREATE TABLE books(id TEXT PRIMARY KEY, title TEXT NOT NULL, document TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE annotations(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, chapter_id TEXT NOT NULL, document TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX annotation_book ON annotations(book_id);
--> statement-breakpoint
CREATE TABLE messages(id TEXT PRIMARY KEY, annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE, request_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','interrupted')), model TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(request_id,role));
--> statement-breakpoint
CREATE TABLE positions(book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE, document TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE bookmarks(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, document TEXT NOT NULL);
