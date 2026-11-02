"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "./session";
import type { Annotation, Message } from "@gbook/core/types";
export function Discussion({
  annotation,
  ensureSaved,
}: {
  annotation?: Annotation;
  ensureSaved: () => Promise<Annotation | undefined>;
}) {
  const { api } = useSession();
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [models, setModels] = useState<{ slug: string; displayName: string }[]>([]),
    [model, setModel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [partial, setPartial] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (annotation)
      api<Message[]>(`/api/library?annotationId=${annotation.id}`)
        .then(setMessages)
        .catch((e) => setError(e.message));
    else setMessages([]);
  }, [annotation?.id]);
  useEffect(() => {
    api<{ models: { slug: string; displayName: string }[] }>("/api/auth")
      .then((data) => {
        setModels(data.models);
        setModel(data.models[0]?.slug || "");
      })
      .catch(() => {});
    return () => abort.current?.abort();
  }, []);
  async function ask() {
    setBusy(true);
    setError("");
    setPartial("");
    const controller = new AbortController();
    abort.current = controller;
    let saved = annotation;
    try {
      saved = await ensureSaved();
      if (!saved) throw new Error("请先保存批注");
      const state = await api<{ csrf: string }>("/api/state");
      const response = await fetch("/api/discuss", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gbook-csrf": state.csrf,
        },
        body: JSON.stringify({
          annotationId: saved.id,
          question: question.trim() || "请回应我的批注，并一起分析这段原文。",
          model,
          requestId: crypto.randomUUID(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "请求失败");
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        doneEvent = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, split));
          buffer = buffer.slice(split + 1);
          if (event.type === "delta") setPartial((p) => p + event.text);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") doneEvent = true;
        }
      }
      if (!doneEvent)
        throw new Error("连接中断，已收到的内容会保留为未完成状态");
      setQuestion("");
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "已停止，部分内容已保留"
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      abort.current = null;
      if (saved) {
        try {
          setMessages(
            await api<Message[]>(`/api/library?annotationId=${saved.id}`),
          );
          setPartial("");
        } catch {
          /* leave partial visible */
        }
      }
    }
  }
  return (
    <section className="discussion">
      <div className="field-label">
        <span className="avatar">G</span>共读讨论
      </div>
      {messages.map((m) => (
        <div className={`message ${m.role}`} key={m.id}>
          <small>
            {m.role === "assistant" ? "GPT" : "我"} ·{" "}
            {m.status === "completed"
              ? "已保存"
              : m.status === "pending"
                ? "生成中"
                : m.status === "failed"
                  ? "生成失败"
                  : "已中断"}{" "}
            {m.model}
          </small>
          <p>{m.content || "暂无生成内容"}</p>
          {m.error && <small role="status">{m.error}</small>}
        </div>
      ))}
      {busy && (
        <div className="message assistant">
          <small>GPT · 正在生成</small>
          <p>{partial || "等待回复…"}</p>
        </div>
      )}
      {!models.length ? (
        <p className="session-notice">
          请先到 <Link href="/settings">连接与数据</Link> 连接
          ChatGPT，再回来发起讨论。
        </p>
      ) : (
        <>
          <label className="field-label">
            模型
            <select
              aria-label="共读模型"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
            >
              {models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="follow-up"
            aria-label="追问 GPT"
            placeholder="追问，或直接让 GPT 回应你的批注…"
            maxLength={4000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
          />
          <div className="action-row">
            <button
              className="primary-button"
              disabled={busy || !model}
              onClick={ask}
            >
              让 GPT 回应
            </button>
            {busy && (
              <button
                className="secondary-button"
                onClick={() => abort.current?.abort()}
              >
                停止生成
              </button>
            )}
          </div>
          <small>
            将发送所选片段、附近上下文、你的批注及本条讨论最近 20 条消息。
          </small>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
