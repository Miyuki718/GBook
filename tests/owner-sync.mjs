import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import http from "node:http";
import Database from "better-sqlite3";
import { strToU8, zipSync } from "fflate";

const origin = process.env.GBOOK_TEST_URL;
const password = process.env.GBOOK_TEST_PASSWORD;
assert.ok(origin && password);
const ownerRequest = (form, headers = {}) => fetch(origin + "/api/owner", {
  method: "POST", redirect: "manual", headers: { origin, ...headers },
  body: new URLSearchParams(form),
});
const blocked = await fetch(origin + "/api/state");
assert.equal(blocked.status, 401);
assert.equal((await fetch(origin + "/login")).headers.get("referrer-policy"), "same-origin");
assert.equal(await new Promise((resolve, reject) => {
  http.get(origin + "/api/state", { headers: { Host: "invalid.example:3127" } }, (response) => {
    response.resume();
    resolve(response.statusCode);
  }).on("error", reject);
}), 403);
assert.equal((await fetch(origin + "/", { redirect: "manual" })).status, 307);
assert.equal((await ownerRequest({ password }, { origin: "https://invalid.example" })).status, 403);
assert.equal((await ownerRequest({ password }, { origin: "null" })).status, 403);
assert.match((await ownerRequest({ password: "invalid" })).headers.get("location"), /error=invalid/);

async function device(userAgent) {
  await delay(1550);
  const login = await ownerRequest({ password }, { "user-agent": userAgent });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), origin + "/");
  const session = login.headers.get("set-cookie").split(";")[0];
  const headers = { cookie: session, "user-agent": userAgent };
  const initial = await fetch(origin + "/api/state", { headers });
  assert.equal(initial.status, 200);
  const csrfCookie = initial.headers.get("set-cookie").split(";")[0];
  const { csrf, ownerPreview } = await initial.json();
  assert.equal(ownerPreview, true);
  headers.cookie += "; " + csrfCookie;
  return {
    session,
    get: (path) => fetch(origin + path, { headers }),
    post: (path, body) => fetch(origin + path, {
      method: "POST",
      headers: { ...headers, origin, "x-gbook-csrf": csrf,
        ...(body instanceof FormData ? {} : { "content-type": "application/json" }) },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  };
}
const phone = await device("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
const tablet = await device("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)");
assert.notEqual(phone.session, tablet.session);
assert.equal((await phone.get("/api/auth")).status, 404);
assert.equal((await tablet.post("/api/discuss", {})).status, 404);

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=", "base64");
const epub = zipSync({
  "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),
  "book.opf": strToU8('<package><manifest><item id="c" href="c.xhtml"/></manifest><spine><itemref idref="c"/></spine></package>'),
  "c.xhtml": strToU8('<html><body><p>测试章节</p><img src="pixel.png" alt="同步插图"/><p>跨设备正文</p></body></html>'),
  "pixel.png": png,
});
const form = new FormData();
form.set("file", new Blob([epub]), "跨设备验收.epub");
const imported = await phone.post("/api/import", form);
assert.equal(imported.status, 200, await imported.clone().text());
const { id: bookId, imageCount } = await imported.json();
assert.equal(imageCount, 1);
const backup = await (await tablet.get("/api/backup")).json();
const book = backup.books.find((item) => item.id === bookId);
assert.deepEqual(book.chapters[0].paragraphs, ["测试章节", "跨设备正文"]);
const chapterId = book.chapters[0].id;
const db = new Database(join(process.env.GBOOK_DATA_DIR, "library.db"), { readonly: true });
const imageId = db.prepare("SELECT id FROM book_images WHERE book_id=?").pluck().get(bookId);
db.close();
const imagePath = "/api/images/" + imageId;
assert.equal((await fetch(origin + imagePath)).status, 401);
const image = await tablet.get(imagePath);
assert.equal(image.headers.get("content-type"), "image/png");
assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
assert.ok((await (await tablet.get("/read/" + bookId)).text()).includes(imageId));

async function write(device, op, value, status = 200) {
  const response = await device.post("/api/library", { op, value });
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
const location = { bookId, chapterId, offset: 0, percent: 10 };
const note = await write(phone, "annotation.save", {
  bookId, chapterId, start: 0, end: 4, exact: "测试章节", note: "手机批注",
});
const mark = await write(tablet, "bookmark.add", { ...location, label: "平板书签" });
const initial = await write(phone, "progress.save", { ...location, revision: 0 });
const next = await write(tablet, "progress.save", { ...location, offset: 6, percent: 60, revision: initial.revision });
await write(phone, "progress.save", { ...location, revision: initial.revision }, 409);
for (const client of [phone, tablet]) {
  const state = await (await client.get("/api/state")).json();
  assert.ok(state.books.some((item) => item.id === bookId));
  assert.ok(state.annotations.some((item) => item.id === note.id && item.note === "手机批注"));
  assert.ok(state.bookmarks.some((item) => item.id === mark.id && item.label === "平板书签"));
  assert.deepEqual(state.positions[bookId], next);
}
await write(phone, "book.update", {
  id: bookId, title: "改名后的测试书", author: book.author, description: book.description,
});
const renamed = await (await tablet.get("/api/state")).json();
assert.equal(renamed.books.find((item) => item.id === bookId).title, "改名后的测试书");
assert.deepEqual(renamed.positions[bookId], next);
assert.equal((await tablet.get(imagePath)).status, 200);
assert.equal((await ownerRequest({ op: "logout" }, { cookie: phone.session })).status, 303);
assert.equal((await phone.get("/api/state")).status, 401);
assert.equal((await tablet.get("/api/state")).status, 200);
console.log("PASS: independent phone/tablet sessions, EPUB and image, annotations, bookmarks, progress and conflict, logout isolation, AI disabled");
