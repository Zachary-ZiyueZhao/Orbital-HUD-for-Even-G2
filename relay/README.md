# ORBITAL AI relay

开发版已经自带转发服务：重启 `npm run dev` 后，手机仍填写 `https://api.openai.com/v1` 和自己的 API Key，**AI relay URL 留空**。OpenAI 和 Tavily 请求会自动通过当前电脑转发，手机无需直接连接这些域名。电脑需要能访问 OpenAI；手机与电脑需要能互相连接。

正式安装的 `.ehpk` 内没有服务器，需要部署此目录中的独立 HTTPS relay。它适用于支持 Fetch API 的服务端运行环境；这里提供 Cloudflare Workers 入口：

```powershell
npx wrangler deploy --config relay/wrangler.jsonc
```

首次运行需在自己的 Cloudflare 账号登录；命令会创建一个 Worker，并输出实际的 `https://…workers.dev` 地址。本项目尚未替你部署外部服务。

部署后：

1. 展开手机设置 **Advanced connection**，在 **AI relay URL** 填入部署命令输出的 HTTPS 地址，不附加 `/v1`。**Chat API URL** 仍填 `https://api.openai.com/v1`，API Key 仍填自己的 OpenAI Key。
2. 将实际 relay origin 加入 `app.json` 的 `network.whitelist`，然后执行 `npm run pack` 并重新安装 `.ehpk`。不要在白名单里填示例域名或通配符。
3. 点击 **Check key**。成功时显示 Connected；失败时显示服务端的 HTTP 状态或 relay 的 DNS / 超时错误。

也可在项目根目录 `.env.local` 设置 `VITE_AI_RELAY_URL=https://你的实际relay域名`，作为新构建默认值；设置页填写的地址优先。使用用户自己的 relay 时，其域名同样需要加入白名单。

代理固定允许以下路由，不能传入任意目标 URL：

| Relay 路由 | 上游 |
| --- | --- |
| `POST /openai/chat/completions` | OpenAI Chat Completions |
| `POST /openai/responses` | OpenAI Responses，包含可选的内置联网搜索 |
| `POST /openai/audio/transcriptions` | OpenAI speech-to-text |
| `POST /openai/realtime/client_secrets` | OpenAI 短期实时转写凭证（0.1.38） |
| `GET /openai/models` | OpenAI 模型列表，仅检查连接，不生成回复 |
| `POST /tavily/search` | Tavily Search |
| `GET /health` | relay 本身健康状态；不表示 OpenAI 已连通 |
| `GET /leetcode/daily` | 国际站每日题，只读，无需 Key |
| `GET /leetcode/image?url=...` | 仅允许官方 `assets.leetcode.com/uploads/` 题目图片，无需 Key |

所有成功与错误响应均补充 CORS 头；保留上游状态码和 request ID。上游请求最长 60 秒，应用等待最长 70 秒；不会自动重试 POST，避免重复生成和重复计费。聊天与搜索请求大小有限制，语音上传上限约 26 MiB。

0.1.22 新增 `/openai/responses` 路由。已经部署旧版 relay 的用户，需要重新部署当前 Worker 才能经 relay 使用 OpenAI 内置搜索；正式安装版直接连接 OpenAI 时不需要部署 relay。开启联网且 Tavily Key 留空会复用 OpenAI 聊天 Key；填入 Tavily Key 时维持原有 Tavily 路径。

0.1.38 Teleprompt 的 Realtime 模式新增 `/openai/realtime/client_secrets`，旧 relay 需要重新部署；开发版重启 Vite 即可。凭证仅在内存中使用、60 秒内建立会话，不写入本地存储；WebSocket 使用短期凭证，不把长期 Key 放进 WebSocket 协议或 URL。音频 WebSocket 直接连接 `wss://api.openai.com`，此 relay 不转发 WebSocket，因此手机网络也必须能访问 OpenAI。若该连接不可用，可在 Teleprompt 的 Voice engine 选择 HTTP compatibility，继续使用原有语音转发路由。

当前 relay 按请求转发用户填写的 Key，不保存 Key、不记录请求正文，不使用共享 OpenAI Key。跨域请求不带 Cookie，目标地址固定且不跟随上游重定向。请只使用你自己控制和信任的 HTTPS relay；它会接收 Key、聊天、语音和搜索内容。此版本延续私人 HUD 的本地 Key 设置方式。公开发布时，应改为服务端保存 OpenAI Key，并增加独立用户认证和调用额度，参见 [OpenAI 官方认证要求](https://developers.openai.com/api/reference/overview#authentication)。

本地开发转发只供受信任的局域网调试使用，不能把 Vite 开发服务器公开到互联网。
