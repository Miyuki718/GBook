# GBook 开发规则

- Windows 本地 Next.js + TypeScript + Tailwind，按用户指令完成本地单用户全功能版本。
- 重要决策先解释；按步骤实现并运行有意义的验证。
- 保持 TypeScript strict。正文用 React 文本渲染，禁止直接注入书籍 HTML。
- .phase0 是隔离验证；不查看、输出或发布 private/ 凭证。升级同机 GBook 时，可用专用脚本不解密地迁移既有加密连接与 host 标识，保留目标备份，不覆盖已连接的正式账号。
- 不把令牌、用户书籍、数据库或个人数据提交到 Git。
- 需求与决策以用户最新指令及 docs 为准。用户已授权完成本地数据库、OAuth、AI、MCP 和测试；不要擅自远程部署。
