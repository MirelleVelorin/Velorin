# 本地 MCP 网关

## 启动

在项目根目录执行：

```bash
npm run gateway
```

默认地址：`http://电脑IP:8787`

手机和电脑需要连接同一个局域网。查看电脑局域网 IP：

```powershell
ipconfig
```

## 添加 MCP

编辑 `mcp-gateway/mcp-servers.json`，每个 MCP 一个配置。

### 本地 stdio MCP

```json
{
  "id": "my-mcp",
  "name": "我的 MCP",
  "enabled": true,
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "某个-mcp-包"],
  "env": {
    "API_KEY": "通过环境变量更安全"
  }
}
```

### 远程 HTTP MCP

```json
{
  "id": "remote-mcp",
  "name": "远程 MCP",
  "enabled": true,
  "transport": "streamable-http",
  "url": "https://example.com/mcp"
}
```

## 接口

- `GET /health`
- `GET /api/servers`
- `GET /api/tools?serverId=my-mcp`
- `POST /api/tools/call`，请求体：`{"serverId":"my-mcp","name":"工具名","arguments":{}}`

可通过环境变量设置：

- `MCP_GATEWAY_PORT`：默认 `8787`
- `MCP_GATEWAY_HOST`：默认 `0.0.0.0`
- `MCP_GATEWAY_TOKEN`：设置后要求 Bearer Token
# Error logs

After starting the gateway, open this page on the computer:

```text
http://127.0.0.1:8787/logs
```

The page refreshes every 3 seconds. The raw log file is:

```text
mcp-gateway/logs/app.log
```

Chat API errors from the phone are sent to this log automatically. API keys and authorization tokens are redacted.

