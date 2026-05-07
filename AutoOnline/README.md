# AutoOnline

自动检测主播直播状态并调用后台接口自动上线 / 下线。

## 1) 配置

编辑同目录下 `appsettings.json`：

- `ServerBaseUrl`：管理后台地址，例如 `http://localhost:3000`
- `InternalApiToken`：与后台 `.env.local` 的 `INTERNAL_API_TOKEN` 保持一致
- `MinIntervalSeconds` / `MaxIntervalSeconds`：轮询随机间隔（默认 5~9 秒）

## 2) 运行

```bash
cd AutoOnline
dotnet run
```

目标框架：`.NET Framework 4.8`（`net48`）。

也可直接双击运行：

- `AutoOnline/start.bat`

## 3) 行为说明

- 首次启动只做基线检测：
  - 当时已经在直播的主播仅记录，不触发自动上线
- 后续每轮：
  - 非直播 -> 直播：调用 `POST /api/internal/auto-online/streamers/{id}/online`
  - 直播 -> 非直播：调用 `POST /api/internal/auto-online/streamers/{id}/offline`

## 4) 后台接口（内部 token 鉴权）

- `GET /api/internal/auto-online/streamers`
- `POST /api/internal/auto-online/streamers/{id}/online`
- `POST /api/internal/auto-online/streamers/{id}/offline`

请求头支持：

- `x-internal-token: <token>`
  或
- `Authorization: Bearer <token>`
