"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "./session";
import { Trash } from "./trash";
type AuthState = {
  session: { status: string; sharing: boolean; identity?: { email?: string } };
  models: { slug: string; displayName: string }[];
};
export function Settings() {
  const { api, refresh, loaded, ownerPreview, privateHttps, formalLibrary, chatGPTAvailable } = useSession();
  const [address, setAddress] = useState("");
  const [auth, setAuth] = useState<AuthState | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    try {
      setAuth(await api<AuthState>("/api/auth"));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    if (loaded && !ownerPreview) load();
  }, [loaded, ownerPreview]);
  useEffect(() => {
    if (privateHttps) setAddress(window.location.origin + "/");
  }, [privateHttps]);
  async function refreshLibrary() {
    setBusy(true);
    setMessage("");
    try {
      await refresh();
      setMessage("已刷新书库和阅读记录");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setMessage("已复制访问地址");
    } catch {
      setMessage("无法自动复制，请选中地址并手动复制。");
    }
  }
  async function connect(op: string) {
    setBusy(true);
    setMessage(
      op !== "disconnect"
        ? "请在系统浏览器中完成 OpenAI 授权，最长等待十分钟。"
        : "正在处理…",
    );
    try {
      await api("/api/auth", { op });
      await load();
      setMessage(
        op !== "disconnect" ? "ChatGPT 已连接" : "连接已断开，阅读记录仍保留",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    if (file.size > 30_000_000) {
      setMessage("备份需小于 30 MB");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ imported: number }>(
        "/api/backup",
        JSON.parse(await file.text()),
      );
      await refresh();
      setMessage(`已导入 ${result.imported} 本新副本，原书库未改变`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="settings-page">
      <Link href="/">‹ 返回书架</Link>
      <h1>连接与数据</h1>
      {ownerPreview ? (
        <section className="settings-card">
          <h2>{formalLibrary ? "个人书库 · 正式版" : "个人书库 · 测试版"}</h2>
          <p>{privateHttps
            ? "通过 Tailscale 私有 HTTPS 访问。其他设备加入同一个 Tailscale 网络后，可使用同一地址和 GBook 书库密码登录。"
            : "当前为跨设备测试书库。请使用启动时配置的访问地址。"}</p>
          {privateHttps && address && (
            <div className="settings-access">
              <label htmlFor="gbook-access-address">书库访问地址</label>
              <div className="action-row">
                <input id="gbook-access-address" value={address} readOnly />
                <button className="secondary-button" onClick={copyAddress}>复制地址</button>
              </div>
            </div>
          )}
          <p>登录同一书库后，各设备共享书籍、批注、书签和阅读进度。</p>
          <p>{chatGPTAvailable
            ? "AI 共读使用 Windows 本机授权的 ChatGPT 套餐。连接与授权请在 Windows 本机版管理。"
            : "当前书库未开启网页 AI。"}</p>
          <div className="action-row">
            <button className="secondary-button" disabled={busy} onClick={refreshLibrary}>刷新书库</button>
            <form action="/api/owner" method="post">
              <input type="hidden" name="op" value="logout" />
              <button className="secondary-button" type="submit">退出登录</button>
            </form>
          </div>
        </section>
      ) : loaded && <section className="settings-card">
        <h2>ChatGPT 共读</h2>
        <p>
          连接自己的 ChatGPT
          账号。只在你主动发起讨论时发送所选原文、周围上下文和本条讨论历史。
        </p>
        <p>
          状态：
          {auth?.session.status === "connected"
            ? auth.session.sharing
              ? "已连接 · 套餐使用已授权"
              : "已登录 · 尚未授权套餐使用"
            : auth?.session.status === "connecting"
              ? "等待浏览器授权"
              : "未连接"}{" "}
          {auth?.session.identity?.email}
        </p>
        <div className="action-row">
          <button
            className="primary-button"
            disabled={busy || auth?.session.status === "connecting"}
            onClick={() => connect("connect")}
          >
            Continue with ChatGPT
          </button>
          <button
            className="secondary-button"
            disabled={busy || auth?.session.status !== "connected"}
            onClick={() => connect("disconnect")}
          >
            断开连接
          </button>
          {auth?.session.status === "connected" && !auth.session.sharing && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => connect("enable-plan")}
            >
              启用套餐使用
            </button>
          )}
          {auth?.session.status === "connected" && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => connect("other-account")}
            >
              连接其他账号
            </button>
          )}
          <button className="secondary-button" onClick={load}>
            刷新连接状态
          </button>
          {(busy || auth?.session.status === "connecting") && (
            <button
              onClick={async () => {
                await api("/api/auth", { op: "cancel" }).catch(() => {});
                setBusy(false);
                setTimeout(load, 200);
              }}
            >
              取消授权等待
            </button>
          )}
        </div>
        <small>
          凭证在本机使用 Windows DPAPI 加密。套餐有使用限制，不读取 ChatGPT
          历史聊天或 Memory。
        </small>
      </section>}
      <section className="settings-card">
        <h2>备份与恢复</h2>
        <p>{ownerPreview
          ? "导出当前书库和阅读记录。恢复会导入新副本，请妥善保存备份文件。"
          : "导出书籍、批注、讨论、书签与阅读位置，不包含 OAuth 凭证。备份文件包含你的阅读内容，请自行妥善保存。"}</p>
        <div className="action-row">
          <a className="primary-button" href="/api/backup" download>
            导出 JSON 备份
          </a>
          <label className="file-button">
            恢复为新副本
            <input
              type="file"
              accept=".json"
              disabled={busy}
              onChange={(e) => {
                restore(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      <p role="status">{message}</p>
      <Trash />
      {loaded && !ownerPreview && <section className="settings-card">
        <h2>本地使用</h2>
        <p>
          数据默认保存在 %LOCALAPPDATA%\GBook。Web 与独立 MCP Server 共用同一
          SQLite 数据库。本版本不提供远程访问或多用户账号系统。
        </p>
        <p>DevKit 包含非商业用途许可，详见项目中的第三方许可说明。</p>
      </section>}
    </main>
  );
}
