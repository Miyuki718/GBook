import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { assert, DomainError } from "./index.ts";
import type { Book, Chapter, ImportedImage } from "./types.ts";
import { IMPORT_FILE_LIMIT, EPUB_UNPACKED_LIMIT, EPUB_ENTRY_LIMIT, BOOK_TEXT_LIMIT } from "./limits.ts";
function paragraphs(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    try {
      return new TextDecoder("gb18030", { fatal: true }).decode(bytes);
    } catch {
      throw new DomainError("无法识别文本编码，请转为 UTF-8 后导入");
    }
  }
}
function imageMime(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 12));
  if (head.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (head.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (/^GIF8[79]a$/.test(head.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
}

const decodeEntities = (value: string) => value.replace(
  /&(amp|lt|gt|quot|apos|nbsp);/g,
  (_, entity: string) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[entity] ?? "",
);

export function importBook(filename: string, bytes: Uint8Array, images?: ImportedImage[]): Book {
  assert(
    bytes.byteLength > 0 && bytes.byteLength <= IMPORT_FILE_LIMIT,
    "文件应为 1 字节至 100 MB",
  );
  const extension = filename.split(".").pop()?.toLowerCase();
  assert(
    ["txt", "md", "epub"].includes(extension ?? ""),
    "仅支持 TXT、Markdown 和 EPUB",
  );
  const title = filename.replace(/\.[^.]+$/, "").slice(0, 250) || "未命名书籍";
  let author = "本地导入",
    chapters: Chapter[] = [];
  if (extension === "epub") {
    let size = 0,
      count = 0;
    let zip: ReturnType<typeof unzipSync>;
    try {
      zip = unzipSync(bytes, {
        filter: (file) => {
          assert(++count <= 4000, "EPUB 文件项过多");
          assert(
            !file.name.includes("\\") &&
              !file.name.startsWith("/") &&
              !file.name.split("/").includes(".."),
            "EPUB 路径不安全",
          );
          size += file.originalSize;
          assert(
            file.originalSize <= EPUB_ENTRY_LIMIT && size <= EPUB_UNPACKED_LIMIT,
            "EPUB 解压后过大",
          );
          return /\.(xml|opf|xhtml|html|htm)$/i.test(file.name) ||
            Boolean(images && /\.(png|jpe?g|gif|webp)$/i.test(file.name));
        },
      });
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError("EPUB 文件损坏或不受支持");
    }
    assert(!zip["META-INF/encryption.xml"], "暂不支持加密或 DRM EPUB");
    function xml(path: string) {
      const data = zip[path];
      assert(data, "EPUB 缺少必要文件");
      const value = strFromU8(data);
      assert(!/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(value), "不支持 EPUB 实体声明");
      return value.replace(/<!DOCTYPE[^>]*>/gi, "");
    }
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      processEntities: false,
    });
    const container = parser.parse(xml("META-INF/container.xml"));
    const root = container?.container?.rootfiles?.rootfile;
    const opfPath = (Array.isArray(root) ? root[0] : root)?.["@_full-path"];
    assert(typeof opfPath === "string", "EPUB 容器无效");
    const opf = parser.parse(xml(opfPath))?.package;
    assert(opf, "EPUB 目录无效");
    const creators = opf.metadata?.creator;
    author =
      (typeof creators === "string" ? creators : creators?.["#text"]) || author;
    const rawItems = opf.manifest?.item;
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    const refs = Array.isArray(opf.spine?.itemref)
      ? opf.spine.itemref
      : [opf.spine?.itemref];
    const ordered = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      removeNSPrefix: true,
      processEntities: false,
    });
    type PendingImage = Omit<ImportedImage, "chapterId">;
    let pending: PendingImage[] = [];
    let imageBytes = 0;
    for (const ref of refs) {
      const item = items.find((v) => v?.["@_id"] === ref?.["@_idref"]);
      if (!item || ref?.["@_linear"] === "no") continue;
      const href = item["@_href"];
      assert(
        typeof href === "string" && !/^[a-z]+:|^\/\//i.test(href),
        "EPUB 路径无效",
      );
      const path = posix.normalize(
        posix.join(
          posix.dirname(opfPath),
          decodeURIComponent(href.split("#")[0]),
        ),
      );
      assert(!path.startsWith("../"), "EPUB 路径越界");
      let output = "";
      const chapterImages: { image: PendingImage; offset: number; insideText: boolean }[] = [];
      function walk(nodes: unknown, imageOnly = false, insideText = false) {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
          for (const [tag, value] of Object.entries(
            node as Record<string, unknown>,
          )) {
            if ([":@", "script", "style", "head"].includes(tag)) continue;
            if (tag === "img" || tag === "image") {
              const attrs = (node as { ":@"?: Record<string, unknown> })[":@"];
              const source = attrs?.["@_src"] ?? attrs?.["@_href"];
              if (images && typeof source === "string") {
                const relative = decodeURIComponent(decodeEntities(source.split(/[?#]/)[0]));
                if (!relative.includes("\\") && !/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(relative)) {
                  const asset = posix.normalize(posix.join(posix.dirname(path), relative));
                  const data = zip[asset];
                  const mime = data instanceof Uint8Array ? imageMime(data) : undefined;
                  if (mime) {
                    imageBytes += data.length;
                    assert(imageBytes <= EPUB_UNPACKED_LIMIT, "EPUB 引用的图片过多");
                    chapterImages.push({ offset: output.length, insideText, image: {
                      beforeParagraph: 0, inlineOffset: null,
                      alt: decodeEntities(String(attrs?.["@_alt"] ?? "")).slice(0, 300), mime, bytes: data,
                    } });
                  }
                }
              }
            } else if (tag === "#text") {
              if (!imageOnly) output += String(value);
            }
            else {
              walk(value, imageOnly || tag === "svg", insideText || /^(p|li|h[1-6])$/.test(tag));
              if (!imageOnly && /^(p|div|h[1-6]|li|br|section)$/.test(tag)) output += "\n\n";
            }
          }
        }
      }
      walk(ordered.parse(xml(path)));
      const p = paragraphs(decodeEntities(output));
      for (const { image, offset, insideText } of chapterImages) {
        const before = decodeEntities(output.slice(0, offset)).replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
        const after = decodeEntities(output.slice(offset)).replace(/\r\n?/g, "\n");
        const left = before.split(/\n\s*\n/).at(-1) ?? "";
        const right = after.split(/\n\s*\n/)[0];
        const count = paragraphs(before).length;
        image.beforeParagraph = count;
        if (insideText && (left.trim() || right.trim())) {
          const index = left.trim() ? count - 1 : count;
          if (p[index] !== undefined) {
            image.beforeParagraph = index;
            image.inlineOffset = Math.min(p[index].length, left.trimStart().length);
          }
        }
        pending.push(image);
      }
      if (p.length) {
        const chapterId = randomUUID();
        chapters.push({
          id: chapterId,
          title: p[0].slice(0, 100),
          paragraphs: p,
        });
        for (const image of pending) images?.push({ ...image, chapterId });
        pending = [];
      }
    }
    if (pending.length) {
      if (!chapters.length) chapters.push({ id: randomUUID(), title: "插图", paragraphs: [""] });
      const last = chapters[chapters.length - 1];
      for (const image of pending) images?.push({ ...image, chapterId: last.id, beforeParagraph: last.paragraphs.length, inlineOffset: null });
    }
  } else {
    const text = decode(bytes);
    let heading = "正文",
      body: string[] = [];
    function flush() {
      const p = paragraphs(body.join("\n"));
      if (p.length)
        chapters.push({ id: randomUUID(), title: heading, paragraphs: p });
      body = [];
    }
    for (const line of text.split("\n")) {
      const match = line.match(
        extension === "md"
          ? /^#{1,2}\s+(.{1,100})$/
          : /^\s*(第[一二三四五六七八九十百千\d]+[章节卷].{0,80})\s*$/,
      );
      if (match) {
        flush();
        heading = match[1];
      } else body.push(line);
    }
    flush();
  }
  assert(
    chapters.length > 0 && chapters.length <= 1000,
    "没有可阅读的章节，或章节过多",
  );
  assert(JSON.stringify(chapters).length <= BOOK_TEXT_LIMIT, "书籍正文过大");
  return {
    id: randomUUID(),
    title,
    subtitle: extension!.toUpperCase() + " · LOCAL LIBRARY",
    author: String(author).slice(0, 300),
    description: `从本机导入的 ${extension!.toUpperCase()} 书籍`,
    color: "sand",
    motif: "读",
    chapters,
  };
}
