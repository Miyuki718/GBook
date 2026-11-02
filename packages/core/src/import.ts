import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { assert, DomainError } from "./index.ts";
import type { Book, Chapter } from "./types.ts";
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
export function importBook(filename: string, bytes: Uint8Array): Book {
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
          return /\.(xml|opf|xhtml|html|htm)$/i.test(file.name);
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
      ignoreAttributes: true,
      removeNSPrefix: true,
      processEntities: false,
    });
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
      function walk(nodes: unknown) {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
          for (const [tag, value] of Object.entries(
            node as Record<string, unknown>,
          )) {
            if (["script", "style", "svg", "head"].includes(tag)) continue;
            if (tag === "#text") output += String(value);
            else {
              walk(value);
              if (/^(p|div|h[1-6]|li|br|section)$/.test(tag)) output += "\n\n";
            }
          }
        }
      }
      walk(ordered.parse(xml(path)));
      output = output.replace(
        /&(amp|lt|gt|quot|apos|nbsp);/g,
        (_, e: string) =>
          ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[
            e
          ] ?? "",
      );
      const p = paragraphs(output);
      if (p.length)
        chapters.push({
          id: randomUUID(),
          title: p[0].slice(0, 100),
          paragraphs: p,
        });
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
