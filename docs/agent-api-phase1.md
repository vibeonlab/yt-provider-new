# Agent API（Phase 1）

用于 WinForm 客户端（EageSoop）与管理后台的最小打通。

## 1) 注册 Agent

- `POST /api/agents/register`

请求体：

```json
{
  "agentId": "optional-fixed-id",
  "name": "PC-01",
  "host": "192.168.1.10",
  "capacity": 10
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "agentId": "agent_xxx"
  }
}
```

---

## 2) 心跳

- `POST /api/agents/heartbeat`

请求体：

```json
{
  "agentId": "agent_xxx"
}
```

建议每 5~10 秒发送一次。20 秒超时会被判定为离线。

---

## 3) 上报浏览器状态

- `POST /api/agents/status`

请求体：

```json
{
  "agentId": "agent_xxx",
  "browsers": [
    {
      "browserId": "slot-1",
      "name": "Browser-01",
      "wsUrl": "ws://127.0.0.1:9001",
      "connected": true,
      "tabsCount": 3,
      "activeUrl": "https://www.youtube.com/watch?v=xxxx",
      "tabs": [
        "https://www.youtube.com/",
        "https://studio.youtube.com/",
        "https://www.youtube.com/watch?v=xxxx"
      ]
    }
  ]
}
```

---

## 4) 运行面板读取

- 前端已有：`GET /api/browsers/status`
- 逻辑：优先显示 Agent 上报数据；若暂无上报，回退到本地 mock。

---

## 5) 存储位置

- `data/agents.json`

Phase 1 先用 JSON 持久化，后续可迁移到数据库。

---

## Phase 2（已加入的接口）

### Agent 拉取命令

- `GET /api/agents/commands?agentId=xxx`

返回示例：

```json
{
  "ok": true,
  "data": [
    {
      "id": "cmd_xxx",
      "agentId": "agent_xxx",
      "browserId": "User1",
      "type": "open_stream",
      "streamerId": "s1",
      "payload": {
        "url": "https://youtube.com/live/abc-001"
      }
    }
  ]
}
```

### Agent 回传命令执行结果

- `POST /api/agents/command-result`

```json
{
  "commandId": "cmd_xxx",
  "success": true,
  "message": "open_stream done"
}
```

### 后台主播上线/下线

- `POST /api/streamers/{id}/online`
- `POST /api/streamers/{id}/offline`

> 下线命令会下发 `go_home`，客户端应跳转 `https://www.youtube.com/`。

---

## Supabase：`commands.type` 约束（广播清理缓存 / 内存模式）

管理端会向 `commands` 表写入 `type` 为下列值的行：

| `type`              | 说明 |
|---------------------|------|
| `open_stream`       | 原有：打开直播间 |
| `go_home`           | 原有：回首页 |
| `clear_disk_cache`  | 仅清 DiskCache，不影响 Cookie |
| `set_power_mode`    | `payload.mode` 为 `low` / `normal` |

若插入时报错 `commands_type_check`，说明数据库仍只允许旧类型，请在 Supabase SQL Editor 执行：

- 仓库内脚本：`docs/supabase-commands-type-migration.sql`

执行后重新调用 `POST /api/admin/agent-browser-control` 即可正常 `enqueued`。

客户端（EageSoop）需在轮询 `GET /api/agents/commands` 后识别上述 `type` 并执行（本项目 `Form1.cs` 已处理）。

