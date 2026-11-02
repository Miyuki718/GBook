# 本地 v1 架构

```text
浏览器 → Next.js Route Handlers → @gbook/core → Drizzle → better-sqlite3 → SQLite
                                    ↑
Codex → STDIO MCP Server ────────────┘

Web 共读接口 → @gbook/auth → 官方本地 SDK → OpenAI Responses
                     └→ Windows DPAPI 加密存储
```

`core` 不依赖 React、Next 或 MCP；入口用各自的协议把输入交给同一服务。Web/MCP 各自持有 SQLite 连接，启用 WAL、外键和有限 busy_timeout。写入仍是单写入者，不承诺无限并发。

## 存储

SQL 迁移创建 books、annotations、messages、positions、bookmarks 五张业务表。Drizzle 同时维护迁移日志。
书籍章节作为经过 schema 校验的 JSON 文档存于 books；annotations 也保留定位文档，关系、索引和外键由 SQLite 管理。
当前本地规模下，这让导入/备份和书籍整体读取保持简单；全文搜索扫描所选书籍，未实现 FTS。后续需要更大书库时可迁移为独立章节表/FTS，而不改变入口协议。

每条高亮存 UTF-16 start/end、exact、prefix/suffix 和正文 SHA-256。服务端重新计算并核对位置，不信任客户端原文。
书籍信息可修改，但本版本没有直接改写章节正文的接口。修订号避免 Web/MCP 并发覆盖批注。

消息使用统一 user/assistant 角色与 pending/completed/failed/interrupted 状态；用户消息与 assistant 占位在同一事务创建，requestId 去重。
只有 SDK 确认 Responses completed 后才记 completed。停止、失败和重启均保留可区分的状态，已收到的部分文字不会被标为完成。
重启恢复由 Web 启动迁移步骤执行；MCP 启动不会打断 Web 中的 pending 请求。

## 客户端

根 SessionProvider 从 /api/state 读取已保存的快照，通过受保护接口逐条写入。没有整库覆盖式自动保存。
ReaderGate 等记录读取完成再初始化章节，防止默认第一章覆盖真实进度。
批注 dialog 内的 Discussion 发起真实流请求，展示持久历史与增量文字。输入、原文和回复都按 React 文本渲染。

## 安全

Proxy 和接口校验回环 Host；写接口再校验 Origin、HttpOnly/SameSite 会话 cookie 和 CSRF token。Next 内部 URL 的 localhost 规范化与真实 Host 分开处理。
禁止跨站请求与页面嵌入。文件内容按字节限制后再解析；EPUB 仅在内存中读取受限 XML/XHTML，拒绝路径越界、DRM 和实体声明。
凭证只在服务端，使用 DPAPI CurrentUser 与 Windows ACL；前端只有安全会话状态和模型目录。
MCP 依赖本机受信进程边界，不开放公网监听，不提供任意 SQL、路径读取或命令执行工具。
