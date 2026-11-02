"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { Snapshot, Annotation, Position } from "@gbook/core/types";
export type { Annotation } from "@gbook/core/types";
type Session = Snapshot & {
  loaded: boolean;
  error: string;
  refresh: () => Promise<void>;
  api: <T = unknown>(url: string, body?: unknown) => Promise<T>;
  saveAnnotation: (input: unknown) => Promise<Annotation>;
  savePosition: (p: Position) => Promise<void>;
};
const Context = createContext<Session | null>(null);
const empty: Snapshot = {
  books: [],
  annotations: [],
  positions: {},
  progress: {},
  bookmarks: [],
};
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const csrf = useRef("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取本地书库");
    csrf.current = data.csrf;
    setSnapshot(data);
    setLoaded(true);
    setError("");
  }, []);
  const api = useCallback(
    async <T,>(url: string, body?: unknown): Promise<T> => {
      if (body !== undefined && !csrf.current) await refresh();
      const isForm = body instanceof FormData;
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? {}
            : {
                "x-gbook-csrf": csrf.current,
                ...(!isForm ? { "content-type": "application/json" } : {}),
              },
        body:
          body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      return data;
    },
    [refresh],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh().catch((e) => setError(e.message));
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  const saveAnnotation = useCallback(
    async (input: unknown) => {
      const a = await api<Annotation>("/api/library", {
        op: "annotation.save",
        value: input,
      });
      await refresh();
      return a;
    },
    [api, refresh],
  );
  const savePosition = useCallback(
    async (p: Position) => {
      await api("/api/library", { op: "progress.save", value: p });
      setSnapshot((s) => ({
        ...s,
        positions: { ...s.positions, [p.bookId]: p },
        progress: { ...s.progress, [p.bookId]: p.percent },
      }));
    },
    [api],
  );
  return (
    <Context.Provider
      value={{
        ...snapshot,
        loaded,
        error,
        refresh,
        api,
        saveAnnotation,
        savePosition,
      }}
    >
      {error && (
        <div className="global-error" role="alert">
          {error}{" "}
          <button onClick={() => refresh().catch((e) => setError(e.message))}>
            重试
          </button>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const state = useContext(Context);
  if (!state) throw new Error("Missing SessionProvider");
  return state;
}
