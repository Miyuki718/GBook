import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "@gbook/core";
import { hasOwnerSession, ownerMode } from "./owner-session";
import { allowedOrigin, ownerServeHost } from "./request-origin";
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
export function guardOrigin(request: Request, mutation = false) {
  const expectedOrigin = allowedOrigin(request);
  if (!expectedOrigin)
    throw new DomainError("请使用 GBook 配置的访问地址", "forbidden");
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== expectedOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new DomainError("请求来源不匹配", "forbidden");
  if (mutation && origin !== expectedOrigin)
    throw new DomainError("缺少同源校验", "forbidden");
  return expectedOrigin;
}
export function guard(request: Request, mutation = false) {
  guardOrigin(request, mutation);
  if (ownerMode() && !hasOwnerSession(request))
    throw new DomainError("请先登录 GBook", "forbidden");
  if (mutation) {
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
    cookie: `gbook_session=${token}.${sign(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${ownerServeHost() ? "; Secure" : ""}`,
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
    ["invalid_request", "not_found", "forbidden", "progress_conflict"].includes(String(error.code));
  const code = domain ? String(error.code) : "invalid_request";
  const status = code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "progress_conflict" ? 409 : 400;
  const message = domain
    ? error.message
    : typeof error === "object" && error && "issues" in error
      ? "输入内容不符合要求"
      : "操作失败，请检查输入或稍后重试";
  return Response.json({ error: message, code }, { status });
}
