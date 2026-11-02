import {
  createChatGPT,
  type ChatGPTClient,
} from "../vendor/siwc/dist/index.js";
import { dataDirectory } from "@gbook/core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Small JavaScript DPAPI adapter; OS calls remain server-only.
import { credentialEncryption } from "./dpapi.mjs";
const state = globalThis as typeof globalThis & { gbookAuth?: ChatGPTClient };
export function getAuth(): ChatGPTClient {
  if (state.gbookAuth) return state.gbookAuth;
  const storageDir = join(dataDirectory(), "auth");
  mkdirSync(storageDir, { recursive: true });
  if (process.platform === "win32") {
    const sid = spawnSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      windowsHide: true,
    }).stdout?.match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid) throw new Error("无法识别 Windows 凭证所有者");
    const acl = spawnSync(
      "icacls.exe",
      [
        storageDir,
        "/inheritance:r",
        "/grant:r",
        `*${sid}:(OI)(CI)F`,
        "*S-1-5-18:(OI)(CI)F",
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    if (acl.status !== 0) throw new Error("无法保护凭证目录");
  }
  state.gbookAuth = createChatGPT({
    appName: "GBook",
    appId: "gbook",
    redirectPort: 0,
    storageDir,
    credentialEncryption,
    sendHostId: true,
  });
  return state.gbookAuth;
}
export function authError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "unknown";
  const known: Record<string, string> = {
    sign_in_required: "请先连接 ChatGPT",
    sharing_not_enabled: "尚未授权套餐使用权限",
    connection_busy: "请先完成当前授权操作",
    network_error: "无法连接 OpenAI，请检查网络",
    subscription_sharing_usage_limit_exceeded:
      "ChatGPT 套餐额度已用完，请稍后重试",
    subscription_sharing_usage_unavailable: "当前账户套餐暂不可用",
    cancelled: "操作已取消或等待超时",
    stream_interrupted: "连接中断，部分内容已保存",
    response_incomplete: "模型未完整生成，部分内容已保存",
  };
  return known[code] ?? "连接或模型请求失败，请检查账号授权与网络后重试";
}
