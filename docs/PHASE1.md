# Phase 1：实现与测试

> 历史阶段记录。当前版本已接入数据库、AI 与 MCP；以 README 和 VALIDATION 为准。

## 第一步：正式骨架

根目录用 npm workspaces 管理 `apps/web`。不创建空的 AI、数据库或 MCP 包，等对应阶段有实际实现时再添加。
固定 Phase 0 验证过的 Next 16.4.3、React 19.3.1、TypeScript 7.0.2、Tailwind 4.3.3 和 PostCSS 8.5.32。
开启 strict，绑定 IPv4 回环地址，不加载外部字体或图片。
验证：骨架生产构建通过。

## 第二步：书架和路由

`app/page.tsx` 渲染 Shelf；`app/read/[bookId]/page.tsx` 根据书籍 ID 找到示例数据，找不到时调用 notFound。
这样 URL 可直接访问每本书，内容页和交互组件也保持分离。
参考截图的米白阅读环境、紫色划线和卡片样式；封面为 CSS 排版，不依赖远程素材。
正文是专为原型编写的示例，不是截图中受版权保护的书籍摘录。
验证：三条书籍路由生成、样式与生产构建通过，浏览器验证搜索空状态。

## 第三步：选区到高亮

`chapterText` 使用两个换行连接段落，DOM 中也显式输出同样分隔符。
这是定位的前提：正文 `textContent` 必须与标准文本一致，不能在正文节点里加入按钮文字或章节标题。

`anchorFromSelection` 先检查选区两端都在正文内，然后使用 Range 计算选区前文字的长度：

```ts
const start = prefix.toString().length;
const end = start + range.toString().length;
```

JavaScript 字符串的 length/slice 和 DOM Range 都使用 UTF-16 单位。保存 start/end，连同 exact/prefix/suffix，可区分同一章的重复句子。Phase 1 内容固定；正文版本/hash 与内容变化后的重新定位留待持久化阶段。

`segments` 在所有高亮边界处分割原文片段，并把覆盖该片段的高亮 ID 附上。显示时只把这些片段包装成 mark，其余仍是 React 文本。即使两条高亮重叠，拼接后的文字也不会重复或丢失。
跨段高亮拆成多个 mark，但仍指向同一条批注；重叠部分默认打开最后创建的覆盖批注，侧栏保留所有条目。

验证：两组算法测试覆盖重复文本、Unicode、非法边界、空白选区、跨段偏移和重叠还原；全部通过。浏览器以真实鼠标拖动验证跨行和跨自然段。

## 第四步：状态和弹窗

`SessionProvider` 包在根布局中。它在 Next 客户端路由切换时继续存在，因此不需要数据库也能演示返回书架后的批注数量和章节恢复。
它没有 localStorage 或网络保存能力，刷新后状态消失，界面明确提示。

`Reader` 将“待确认选区”“正在编辑的批注”和“已保存批注”分开：取消弹窗不修改已保存数据；保存后才调用 setAnnotations。
重复高亮同一范围不会重复创建；仅点击“高亮”不会清空该范围已有批注。
原生 dialog.showModal 提供模态与焦点约束，effect 在编辑状态更新后聚焦 textarea。这样不会先打开一个尚未填入原文的空弹窗。
Escape、关闭和取消均放弃未保存编辑；保存按钮才提交当前内容。AI 区域没有调用按钮或伪造回复。

验证：真实浏览器保存、修改、仅高亮、键盘 Enter 打开高亮、Escape 关闭、焦点返回、章节隔离、书架数量、第二章往返恢复均通过。
截图中多行 mark 的外接矩形中间可能是行间空白，测试点击实际划线文字可正常打开弹窗。

## 最终验证记录（2026-11-02）

- 每一步均生产构建；最终 `npm run build` 通过严格 TypeScript 检查。
- `npm test`：2 组测试，全部通过；`npm run typecheck` 通过。
- 正式前端 `npm audit`：0 项漏洞；不代表对未来版本的永久保证。
- 桌面 1365×900：书架、阅读三栏、居中弹窗检查通过。
- 390×844：无横向溢出，目录下拉框切章通过。尚未进行实体手机触摸长按选区验证。
- 已验证刷新后会话批注清空，与产品提示一致。
- 测试未读取 Phase 0 授权目录，未请求 OpenAI，未安装数据库依赖。

截图位于 `docs/screenshots/`，包含书架、阅读页、批注弹窗和窄屏阅读。测试服务器用于本轮检查，结束后关闭；再次查看运行 npm run dev。

## 下一阶段

Phase 2 才实现 SQLite schema、迁移、导入、批注持久化和进度；Phase 3 接入经过验证的 OAuth/Responses 适配器。
当前 reader 只处理固定章节文本，不是 EPUB 引擎，不承诺内容变化后仍能自动定位旧高亮。
