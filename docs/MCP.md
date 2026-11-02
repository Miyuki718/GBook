# 独立 MCP Server

运行环境：Node 24，安装根 workspace 依赖后使用。STDIO 只输出协议消息，不能向 stdout 随意 console.log。

运行 `npm run mcp:config` 可打印适用于本机路径的 TOML。将条目加入 Codex 项目/用户配置，避免覆盖其他已有条目。配置结构依据官方说明：https://learn.chatgpt.com/docs/extend/mcp 。
项目只提供配置生成，不自动改写用户的全局 Codex 配置。

默认工具：

| 工具 | 功能 |
|---|---|
| list_books | 本地书架 |
| get_book_outline | 章节 ID 与标题 |
| get_chapter | 分页读取章节文字与正文 hash |
| search_book | 正文关键字查找 |
| list_annotations | 原文高亮、笔记和 revision |
| get_discussion | 保存的共读历史 |
| get_reading_progress | 位置与书签 |

`GBOOK_MCP_WRITE=1` 时增加 create_annotation 和 update_annotation。来源由服务端固定为 mcp，不能伪造成 Web。
创建前读取原文并计算 UTF-16 start/end，传 exact；修改前读取最新 revision，冲突时重新读取，不盲目覆盖。

示例对话：“列出 GBook 的书架”“读取《把日子读慢》的目录”“整理我在这本书里的个人想法”。
MCP 不共享 GBook 的 OAuth 凭证，也不代替 Codex 自己的模型登录；Web 共读与 Codex 调用是两条不同链路。

自动化测试用官方 MCP Client 启动真实子进程，验证只读工具清单、get_chapter 以及开启写入后的数据库回读。当前聊天未自动注入新 MCP 工具，配置后需由宿主重新加载。
