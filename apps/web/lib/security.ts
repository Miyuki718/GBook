import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "@gbook/core";
const shared = globalThis as typeof globalThis & {
  gbookSessionSecret?: Buffer;
};
const secret = () => (shared.gbookSessionSecret ??= randomBytes(32));
const sign = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("hex");
function equal(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function guard(request: Request, mutation = false) {
  const url = new URL(request.url),
    host = request.headers.get("host");
  // Next may normalize request.url to localhost even when the actual Host is 127.0.0.1.
  if (
    !host ||
    !/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host) ||
    host.split(":")[1] !== url.port
  )
    throw new DomainError("禁止非本机请求", "forbidden");
  const expectedOrigin = `${url.protocol}//${host}`;
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== expectedOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new DomainError("请求来源不匹配", "forbidden");
  if (mutation) {
    if (origin !== expectedOrigin)
      throw new DomainError("缺少同源校验", "forbidden");
    const token = readCookie(request);
    const csrf = request.headers.get("x-gbook-csrf") || "";
    if (!token || !equal(csrf, sign("csrf:" + token)))
      throw new DomainError("会话已失效，请刷新页面", "forbidden");
  }
}
function readCookie(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)gbook_session=([\w.-]+)/)?.[1];
  if (!cookie) return null;
  const [token, signature] = cookie.split(".");
  if (!token || !signature || !equal(signature, sign(token))) return null;
  return token;
}
export function sessionHeaders(request: Request) {
  const token = readCookie(request) || randomBytes(24).toString("hex");
  return {
    csrf: sign("csrf:" + token),
    cookie: `gbook_session=${token}.${sign(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
  };
}
export async function readLimited(request: Request, limit = 12_000_000) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw new DomainError("请求文件或内容过大");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
export async function jsonBody(request: Request, limit = 12_000_000) {
  return JSON.parse(
    new TextDecoder().decode(await readLimited(request, limit)),
  );
}
export function errorResponse(error: unknown) {
  const domain =
    error instanceof Error &&
    "code" in error &&
    ["invalid_request", "not_found", "forbidden"].includes(String(error.code));
  const code = domain ? String(error.code) : "invalid_request";
  const status = code === "forbidden" ? 403 : code === "not_found" ? 404 : 400;
  const message = domain
    ? error.message
    : typeof error === "object" && error && "issues" in error
      ? "输入内容不符合要求"
      : "操作失败，请检查输入或稍后重试";
  return Response.json({ error: message, code }, { status });
}
