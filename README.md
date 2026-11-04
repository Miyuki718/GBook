# GBook · AI 共读阅读器

Windows 本机运行的 Web 阅读器。阅读、划线、记录个人想法，再围绕所选原文与 GPT 持续讨论。

## 启动

需要 Windows、Node.js 24 和 npm。在项目根目录运行：

```powershell
npm ci --ignore-scripts
npm run build
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File scripts/create-desktop-shortcut.ps1
```

如果拿到的是 ZIP，请先解压到固定目录，再在解压后的项目根目录运行以上命令。首次安装依赖需要联网。以后双击桌面的 **GBook** 即可启动并打开 `http://127.0.0.1:3030/`。移动项目后，在新目录重新运行创建脚本。

如果 ZIP 的 Windows 属性页显示「解除锁定」，确认下载来源后可先勾选它，再解压，以便本地 PowerShell 脚本能在 `RemoteSigned` 策略下运行。

快捷方式默认使用 `%LOCALAPPDATA%\GBook`。如果以前使用了其他书库目录，在创建脚本末尾加 `-DataDirectory "你的书库目录"`，指定包含 `library.db` 的文件夹。端口冲突时可加 `-Port 3031`。路径在创建时根据当前电脑生成。

也可以用 `npm start` 手动启动并打开 `http://127.0.0.1:3000`。开发时使用 `npm run dev`。
启动器会先执行版本化 SQLite 迁移，仅在全新书库中添加三本原创示例书；随后启动只监听回环地址的 Next.js。
请只启动一个使用同一数据目录的 Web 实例。

## 已实现

- 书架：搜索、编辑书名/作者/简介、移出与恢复。
- 导入：TXT、Markdown、无 DRM 的 EPUB；支持 EPUB 内嵌 PNG、JPEG、GIF、WebP 插图。
- 阅读外观：日间、纸色与夜间主题，目录独立滚动，可筛选章节及定位当前章。
- 阅读：目录、上下章、字号、书内搜索、位置恢复、书签、窄屏布局。
- 批注：跨行/跨段高亮、重叠高亮、编辑、删除、全部批注搜索、跳回原文。
- AI：ChatGPT OAuth、账户模型列表、Responses 流式回复、多轮追问、停止生成、讨论状态与历史持久化。
- 数据：SQLite + Drizzle、修订冲突检查、JSON 导出与恢复为新副本。
- MCP：独立 TypeScript STDIO Server，共享同一业务层和数据库，默认只读，写入需显式开启。
- 工程：严格 TypeScript、自动化核心/导入/STDIO/HTTP 测试、Windows CI 配置、许可证说明。

真实 AI 需要在“连接与数据”中完成 OpenAI 授权，并具有可用套餐权限/额度。应用不读取 ChatGPT 历史聊天或 Memory。
AI 请求只在主动点击后发送，包含选中原文、附近上下文、个人批注和本条最近讨论。无假回复、无自动计费重试。

## 数据和备份

默认目录：`%LOCALAPPDATA%\GBook`。`library.db` 保存书籍和阅读记录，`auth/` 保存 DPAPI 加密的授权数据。
业务 SQLite 本身未加密；OAuth 加密不能阻止同一 Windows 账号下的恶意进程。

“连接与数据 → 导出 JSON 备份”可保存当前书库；恢复时导入新副本，不覆盖原书库。
备份包含书籍及个人想法，不含 OAuth 凭证；已移出书架的书需先恢复再导出。
不要在应用写入时只复制主 `library.db` 文件；使用 JSON 导出或 SQLite 一致性备份。

高级自定义：设置 `GBOOK_DATA_DIR` 为绝对路径，可选择另一数据目录。更改目录不会自动搬迁旧数据或授权。
端口可通过 `PORT` 更改。代理设置继承运行环境，启动器启用 Node 的环境代理支持。

## 检验

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
```

`test:e2e` 在独立数据目录和 3127 端口启动生产实例，不需要 OpenAI 账号，不消耗模型额度，结束后清理自己的测试目录。
`node tests/http.mjs` 可对已运行的 3000 端口做合成数据检查；它会把合成书移出书架。
测试证据与未覆盖范围见 [docs/VALIDATION.md](docs/VALIDATION.md)。

`npm run test:live-ai` 是手动真实账号检查，会消耗模型额度，不在 CI 中运行；需先连接 ChatGPT 并保留指定原创浏览器验收样例。它不会改用用户书籍作为测试材料。

## Codex MCP

```powershell
npm run mcp:config
```

此命令只打印当前电脑的配置，不修改 Codex 全局设置。把打印的条目加入 Codex 的项目或用户 `config.toml`，重新加载连接。
默认 `GBOOK_MCP_WRITE="0"` 仅可读取。需要保存或修改笔记时改为 `"1"`。
直接运行 `npm run mcp` 时进程会等待 STDIO JSON-RPC，控制台没有 UI 是正常现象。
工具清单与示例见 [docs/MCP.md](docs/MCP.md)。

## 代码结构

```text
apps/web/             Next.js 页面、交互、HTTP 接口和本机安全校验
apps/mcp-server/      独立 TypeScript STDIO MCP
packages/core/       书库、定位校验、修订、讨论、备份与导入
packages/core/migrations/  版本化 SQL
packages/auth/       官方 SDK 适配、Windows DPAPI、保留的第三方 SDK
scripts/             启动、迁移与配置输出
tests/               核心、导入、MCP 和生产 HTTP 检验
docs/                使用说明、架构、决策与验证记录
.phase0/             本机保留的早期隔离验证，不随源码发布
```

关键实现讲解见 [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。

## 支持范围和许可证

旧版导入的 EPUB 可在阅读页点「补充 EPUB 插图」，选择原文件。正文一致时保留原书籍、批注和阅读位置，并补充图片。JSON 备份包含文字及阅读记录，恢复后可用原 EPUB 补图。

这是 Windows 本地单用户版本，不提供公网多用户、云同步、DRM 解密、PDF/OCR 或完整 EPUB 排版保真。阅读器只渲染提取的正文和受支持的本地图片。原书脚本、矢量 SVG 和远程资源不进入阅读页。
文件导入上限 100 MB，EPUB 解压总量上限 200 MB、单个条目上限 10 MB，解析后的正文 JSON 上限 1000 万字符；JSON 恢复上限 30 MB。大书性能取决于章节大小。

自写代码为 MIT；`packages/auth/vendor/siwc` 保留 OpenAI **Noncommercial License v1.0**，不能作为 MIT 重新授权。商业用途和 OpenAI 服务接入需单独核对。
详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。源码仓库：[Miyuki718/GBook](https://github.com/Miyuki718/GBook)。GitHub Actions 执行严格类型、测试、构建及隔离 HTTP 检验；具体结果以仓库 Actions 为准。未远程部署。

## 手机使用

当前只支持 Windows 本机访问。手机可以通过远程桌面操作电脑上的 GBook；手机浏览器直接访问需要后续增加受保护的跨设备入口。步骤见 [docs/MOBILE.md](docs/MOBILE.md)。
