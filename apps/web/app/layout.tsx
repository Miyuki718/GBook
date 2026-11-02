import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "../components/session";
export const metadata: Metadata = {
  title: "GBook · 共读时光",
  description: "读一本书，也读见自己的想法。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
