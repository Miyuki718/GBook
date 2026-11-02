# 技术决策

最新决策：用户已授权完成本地 v1 全部阶段，以下 Phase 1 的内存状态限制已由 SQLite 持久化替代。Web 与 MCP 共用 core；官方 SDK 与原许可证保留在 auth/vendor；导入只提取受限 EPUB 文字；备份恢复为新副本；公网部署和全局 Codex 配置不自动修改。详情见 ARCHITECTURE.md。

- 2026-11-02：沿用 Phase 0 已验收的 npm workspace、Next.js/TS/Tailwind 组合。当前仅建立有实际代码的 apps/web。
- Phase 1 使用 React Context 内存状态；明确刷新丢失，不提前引入数据库或浏览器持久化。
- 正文通过 React 文本节点渲染；选区以 UTF-16 偏移和引用片段定位，不以整句字符串匹配。
- 高亮采用按边界切分的 mark，保留重叠条目的 ID，避免直接操作 DOM 破坏 React 状态。
- 弹窗采用原生 dialog，使用 showModal 与输入焦点，保持接近参考截图的原文/个人想法/共读区域结构。
- 原型采用原创示例内容和 CSS 封面；不依赖外部内容下载或模型请求。
- 服务器安全、持久化、授权和数据库完整边界继续遵循 .phase0/ARCHITECTURE.md，在对应阶段实现。
