import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "@gbook/core";
import { ownerServeHost } from "./request-origin";

export const ownerMode = () => process.env.GBOOK_OWNER_MODE === "1";
export const ownerChatGPT = () => ownerMode() && Boolean(ownerServeHost()) &&
  process.env.GBOOK_OWNER_FORMAL === "1" && Boolean(process.env.GBOOK_AUTH_DATA_DIR);
const cookieName = "gbook_owner";
const lifetime = 7 * 24 * 60 * 60;
const secure = () => ownerServeHost() ? "; Secure" : "";

function sessionPath(token: string) {
  return join(dataDirectory(), ".owner-sessions", createHash("sha256").update(token).digest("hex"));
}
function sessionToken(request: Request) {
  return request.headers.get("cookie")?.match(/(?:^|;\s*)gbook_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
}
export function hasOwnerSession(request: Request) {
  const token = sessionToken(request);
  if (!token) return false;
  try {
    return Number(readFileSync(sessionPath(token), "utf8")) > Date.now();
  } catch {
    return false;
  }
}
export function createOwnerSession() {
  const token = randomBytes(32).toString("hex");
  mkdirSync(join(dataDirectory(), ".owner-sessions"), { recursive: true, mode: 0o700 });
  writeFileSync(sessionPath(token), String(Date.now() + lifetime * 1000), { mode: 0o600, flag: "wx" });
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime}${secure()}`;
}
export function endOwnerSession(request: Request) {
  const token = sessionToken(request);
  if (token) {
    try { unlinkSync(sessionPath(token)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure()}`;
}
export async function verifyOwnerPassword(password: string) {
  const configured = process.env.GBOOK_OWNER_PASSWORD_HASH ?? "";
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(configured)) return false;
  const [salt, hash] = configured.split(":");
  const computed = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, Buffer.from(salt, "hex"), 64, (error, key) =>
      error ? reject(error) : resolve(key)),
  );
  return timingSafeEqual(computed, Buffer.from(hash, "hex"));
}
