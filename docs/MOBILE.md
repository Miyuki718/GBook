# 在手机上使用 GBook

当前版本运行在 Windows 电脑上，启动器只监听 `127.0.0.1`，页面 Proxy 和 API 同时验证本机 Host。手机上的 localhost 指手机本身；即使连接相同 Wi-Fi，直接打开电脑 IP 也不受支持。公开 GitHub 仓库保存源码，不托管这套带数据库的服务或个人书库。

## 现在可用：手机远程访问自己的电脑

1. 在 Windows 电脑的项目目录运行 `npm start`，电脑浏览器打开 `http://127.0.0.1:3000`。
2. 在电脑 Chrome 打开 [Chrome 远程桌面](https://remotedesktop.google.com/access)，按照“设置远程访问”安装主机组件并设置 PIN。远程访问权限由用户自行开启；本项目没有安装或开启远程桌面。
3. Android 使用官方 Chrome 远程桌面应用；iPhone/iPad 可在浏览器打开同一远程桌面网址。使用同一 Google 账号，选择自己的电脑并输入 PIN。
4. 在远程电脑的浏览器中操作 GBook。电脑须保持开机、联网且 GBook 进程运行；书籍、进度和授权仍保存在这台电脑。

这是操控桌面窗口，不是手机原生 Web 阅读体验。远程桌面可以访问整台电脑，请仅使用自己的账号并保管 PIN。

官方步骤：[Android](https://support.google.com/chrome/answer/1649523?co=GENIE.Platform%3DAndroid&hl=zh-Hans)、[iPhone/iPad](https://support.google.com/chrome/answer/1649523?co=GENIE.Platform%3DiOS&hl=zh-Hans)。第三方服务可用性取决于当前网络。

## 后续：手机浏览器直接阅读

需要单独实现跨设备访问：优先通过私有网络和 HTTPS 访问，配合设备配对/登录、会话隔离、精确 Host 与 Origin 白名单，再验证触摸选区与高亮。OAuth 授权及 Windows DPAPI 凭证继续由电脑端处理。

当前没有开启这条入口，也没有修改 Windows 防火墙、配置隧道或进行公网部署。仅把监听地址改成 `0.0.0.0` 不足以安全支持手机访问。
