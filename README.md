# Velorin

Velorin 是一个面向角色化长对话的 Expo / React Native AI 助手。它把多模型 API、角色卡、上下文管理、分层记忆、MCP 工具、语音和生活记录功能放进一个移动端应用中。

> 这是 Velorin 的公开示例仓库。个人 API Key、MCP Token、聊天数据、数据库、日志和本地配置不会放在仓库里。

## 功能概览

- 多个 OpenAI-compatible API 配置与模型选择
- API 重试、备用接口和错误提示
- 角色卡与按角色隔离的对话状态
- 上下文整理、摘要和可编辑的压缩结果
- MCP 网关与工具调用展示
- Ombre Brain 等外部记忆服务接入
- 流式回答、暂停生成、思考过程展示
- 文本转语音
- 饮食记录与理财提醒
- 本地 SQLite 数据存储

## 技术栈

- Expo SDK 57
- React Native 0.86
- React 19
- JavaScript
- Expo SQLite
- React Navigation
- Model Context Protocol SDK

## 本地运行

```powershell
npm install
npm start
```

然后使用 Expo Go 或开发版客户端打开项目。部分原生能力（例如语音、图片处理和后台能力）需要按照 Expo 的开发版构建流程运行，不能保证在 Expo Go 中完整可用。

## API 配置

应用内可以添加多个 API 配置。默认接口路径是 `/chat/completions`，因此通常只需要填写站点的 Base URL、API Key 和模型名；如果服务使用其他协议，再手动修改 API Path。

请不要把真实 Key 写入源代码、README、Git 历史或截图中。建议只在本机应用配置中填写，并在公开仓库前检查 Git diff。

## MCP 网关

MCP 网关代码位于 `mcp-gateway/`。启动方式：

```powershell
npm run gateway
```

默认监听：`http://电脑局域网IP:8787`。

首次使用时复制示例配置：

```powershell
Copy-Item mcp-gateway/mcp-servers.example.json mcp-gateway/mcp-servers.json
```

然后编辑本地的 `mcp-gateway/mcp-servers.json`，加入你自己的 MCP 地址和 Token。该文件已被 `.gitignore` 忽略，不应提交到 GitHub。

手机和电脑需要处于可以互相访问的网络中。若手机访问电脑上的网关，请把应用里的网关地址改成电脑的局域网 IP，而不是 `127.0.0.1`。

网关支持这些环境变量：

- `MCP_GATEWAY_PORT`：默认 `8787`
- `MCP_GATEWAY_HOST`：默认 `0.0.0.0`
- `MCP_GATEWAY_TOKEN`：可选的网关访问令牌
- `MCP_CONFIG`：自定义 MCP 配置路径
- `MCP_LOG_DIR` / `MCP_LOG_PATH`：日志路径

## 测试与检查

```powershell
node --test tests/*.test.cjs
node --check App.js
node --check db.js
node --check mcp-gateway/server.js
```

## 隐私与安全

Velorin 目前主要在本地保存应用数据。公开仓库不包含个人聊天记录、SQLite 数据库、MCP 私有配置或 API 凭据。部署到公网时，请为网关设置访问令牌，并避免直接暴露带有个人数据的端口。

## 当前状态

这是一个持续开发中的个人项目和作品集展示版本。功能和数据结构可能继续变化，部分原生能力仍需要开发版 APK 或正式构建环境验证。

## 许可证与第三方资源

本项目代码使用 MIT License。字体、图标、Expo、React Native 以及其他依赖遵循各自的许可证；字体授权文件保留在 `assets/fonts/` 中。

