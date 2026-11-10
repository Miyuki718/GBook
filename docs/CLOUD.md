# GBook 个人网站

## 本地所有者预览

在项目根目录用 PowerShell 7 执行：

```powershell
$env:GBOOK_PREVIEW_BUILD = '1'
npm run build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$env:GBOOK_OWNER_PASSWORD = Read-Host '设置测试密码（至少 12 字符）' -MaskInput
try { node scripts/owner-preview.mjs }
finally { Remove-Item Env:GBOOK_OWNER_PASSWORD, Env:GBOOK_PREVIEW_BUILD }
```

打开 http://127.0.0.1:3135/。用普通窗口和无痕窗口分别登录同一个所有者账号，可模拟两个设备。测试书库在 `.test-data/owner-preview`，预览构建也使用独立目录。网页 AI 在预览模式中关闭。使用 Ctrl+C 停止测试服务。

可在一个窗口导入带图的 EPUB 并加批注，在另一个窗口打开同一本书、加书签并翻章。可见页面约每 15 秒拉取一次共享状态，重新进入阅读页会恢复已保存的位置。已有阅读页保持当前位置，旧进度提交被拒绝时可点「载入最新位置」。

构建后运行 `node tests/production.mjs --owner` 可复测。测试使用两套独立会话和全新的临时书库，核验 EPUB、图像字节、批注、书签、进度冲突、注销和 AI 禁用。默认预览监听回环地址，适用于同一台电脑的双会话验证。

## 同一 Wi-Fi 真机测试

在可信 Wi-Fi 上，用上面的构建和密码设置步骤，把启动命令改为 `node scripts/owner-preview.mjs --lan <电脑的 Wi-Fi IPv4>`，例如 `node scripts/owner-preview.mjs --lan 192.168.1.20`。手机和平板连接同一 Wi-Fi 后，在浏览器打开 `http://<电脑的 Wi-Fi IPv4>:3135/` 并输入相同的测试密码。LAN 模式使用独立的 `.test-data/owner-lan` 书库。

测试使用 HTTP，密码和会话未在网络传输中加密。请只用测试密码和合成书籍，并避免访客网络或不受信任的 Wi-Fi。若 Windows 防火墙阻止连接，在管理员 PowerShell 中添加仅允许 Wi-Fi 网卡、本机所选 IPv4、TCP 3135 和对应本地子网的入站规则。测试结束后关闭进程并移除该规则。如果两台设备在同一 Wi-Fi 但仍无法连接，请检查路由器是否启用了设备隔离。

验收时，在手机打开一本有图的测试书并新增批注和书签。平板重新打开该书，确认正文、图片、批注和书签；再在平板翻到第二章，手机回书架后重新打开，确认接续到第二章。若两台设备同时推进阅读，按旧页面上的「载入最新位置」提示处理冲突。

自动化验收也可通过 `GBOOK_TEST_LAN_IP` 指定电脑的 Wi-Fi IPv4，再执行 `node tests/production.mjs --owner`。

### 用 Tailscale Serve 从外网测试

让电脑和移动设备加入同一个 Tailscale 私有网络。先使用隔离的预览构建，并将 LAN 测试库通过 `scripts/backup-library.mjs` 复制到 `.test-data/owner-serve/library.db`。首次复制后，HTTPS 测试独立保存阅读状态。

在 PowerShell 设置测试密码，再用设备的 Tailscale DNS 名称启动：

```powershell
$env:GBOOK_OWNER_PASSWORD = Read-Host '设置测试密码（至少 12 字符）' -MaskInput
try { node scripts/owner-preview.mjs --serve <设备名称.ts.net> }
finally { Remove-Item Env:GBOOK_OWNER_PASSWORD }
```

在管理员 PowerShell 先用 `tailscale serve status` 检查现有配置。确认 HTTPS 端口未被使用后，执行 `tailscale serve --bg http://127.0.0.1:3135`。如提示启用 HTTPS，按 Tailscale 的网页登录指引操作。预览服务只监听本机回环地址，浏览器通过 Serve 输出的私有 HTTPS 地址访问。测试结束后用 `tailscale serve --https=443 off` 撤掉该入口，并停止预览进程。

## 在自己的 Windows 电脑上运行正式私有书库

先按 README 安装依赖并启动一次本机版，确认书架可以打开。若要使用 AI，在本机版用自己的 ChatGPT 账号完成登录和套餐授权。配置完成后，按以下步骤准备私有网页：

1. 在电脑和手机安装 Tailscale，让设备加入同一私有网络。在管理员 PowerShell 检查 `tailscale serve status`，确认没有占用现有 HTTPS 路由后，执行 `tailscale serve --bg http://127.0.0.1:3135`，按提示启用 HTTPS。
2. 在普通 Windows PowerShell 中进入项目根目录，运行以下命令生成独立构建和书库副本。已有私有书库时跳过备份步骤，避免覆盖阅读记录。

```powershell
$env:GBOOK_PREVIEW_BUILD = '1'
try { npm run build } finally { Remove-Item Env:GBOOK_PREVIEW_BUILD }
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$library = Join-Path $env:LOCALAPPDATA 'GBook-Serve'
New-Item -ItemType Directory -Path $library -Force | Out-Null
$backup = Join-Path $library 'library.db'
if (!(Test-Path -LiteralPath $backup)) { node scripts/backup-library.mjs $backup }
```

3. 在同一项目目录运行 `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File scripts/open-gbook-serve.ps1`。首次启动设置书库密码。以后可以用同一个脚本启动，浏览器会自动打开本机的 Tailscale HTTPS 地址。手机使用同一地址和书库密码。

私有网页的批注、书签和进度保存在 `GBook-Serve` 副本中。网页与本机原书库独立。AI 共读由 Windows 主机使用本机加密保存的 ChatGPT 授权发起，账号授权与断开操作在本机版管理。该方式面向单个所有者的私有访问，套餐可用性以 OpenAI 对账号和部署场景的要求为准。

## 公网托管设计

第一版只开放一个所有者账号。电脑、手机和平板通过 HTTPS 访问同一套服务，登录后读写同一个书库。云端数据库是权威副本，网页版跨设备共享书籍、图片、批注、书签和阅读位置。本机版与网页版之间的双向合并、离线写入不属于第一版。

部署目标是一台可运行 Node.js 的主机，带持久磁盘、自动备份和 HTTPS 入口。保留 SQLite 和现有数据结构，先运行单个应用实例。原 EPUB 导入最多 100 MB，入口需要支持该大小和 multipart 开销。域名在确定主机后再绑定。

上线前先为页面、API 和图片统一加所有者登录，关闭公开注册。使用经过验证的认证组件和服务端可撤销的会话，并验证匿名请求、伪造来源及登出后的请求均无法读写书库。进度同步需考虑电脑和手机同时打开的情况，旧设备的延迟写入不能覆盖较新的位置。

## 迁移

在本机项目目录执行以下命令，指定一个尚不存在的文件。可按现有方式设置 GBOOK_DATA_DIR 来选择书库。

```powershell
node scripts/backup-library.mjs GBook-library-backup.db
```

SQLite 在线备份保存书籍正文、图片、批注、进度、书签和讨论记录。备份只读取 library.db，ChatGPT 凭证存放在独立目录。快照含私人阅读数据，应通过授权的私密传输迁移到服务器的数据目录，并在正式启用前用副本验证完整性和登录隔离。

## ChatGPT 套餐

网站登录和 ChatGPT 套餐授权分别管理。云端套餐接入需向 OpenAI 申请，获准后使用登记的回调和受保护的服务端令牌存储。正常续期通过刷新令牌完成，连接过期或撤销时需要重新授权。

阅读与同步可以先上线。等待云端套餐接入期间，本机 GBook 继续使用现有连接。参阅 [OpenAI 本机套餐集成与远程托管要求](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)、[网站 OAuth 接入](https://developers.openai.com/siwc/website)及[会话续期](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)。
