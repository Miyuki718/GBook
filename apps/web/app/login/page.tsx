import { notFound } from "next/navigation";
import { ownerMode } from "../../lib/owner-session";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!ownerMode()) notFound();
  const { error } = await searchParams;
  return (
    <main className="settings-page">
      <h1>登录 GBook</h1>
      <form action="/api/owner" method="post" className="settings-card"
        data-library={process.env.GBOOK_OWNER_FORMAL === "1" ? "formal" : "preview"}>
        <h2>个人书库</h2>
        <p>使用你的 GBook 所有者密码继续阅读。</p>
        <label className="block" htmlFor="owner-password">密码</label>
        <input className="annotation-input" style={{ minHeight: 0, marginBlock: 12 }}
          id="owner-password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
        {error && <p role="alert">{error === "wait" ? "请稍等片刻再试。" : "密码不正确。"}</p>}
        <button className="primary-button" type="submit">登录</button>
      </form>
    </main>
  );
}
