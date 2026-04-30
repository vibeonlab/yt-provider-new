# EageSoop Phase 1 接入说明

## 1. 配置后端地址

编辑 `EageSoop/App.config`：

- `ServerBaseUrl`：Next 管理后台地址（例如 `http://localhost:3000`）
- `AgentName`：客户端名称（建议每台机器不同）
- `HeartbeatIntervalMs`：心跳间隔
- `StatusReportIntervalMs`：状态上报间隔

## 2. 首次运行行为

- 程序启动后会自动注册 Agent
- 在程序目录生成 `agent.id`（用于固定客户端身份）
- 定时发送心跳和浏览器状态

## 3. 运行面板效果

- `/admin/running` 会优先显示 EageSoop 上报的状态
- 如果没有任何 Agent 上报，仍会显示原来的 mock 数据

## 4. 当前上报字段

- `browserId`
- `name`
- `connected`
- `tabsCount`（当前每个 WebView 固定为 1）
- `activeUrl`
- `tabs`（当前 URL 列表）

## 5. Phase 3（点赞增强）状态

`open_stream` 命令现在使用增强点赞流程：

- 多选择器尝试（兼容不同语言/页面结构）
- 分段重试（默认最多 3 次）
- 总超时控制（默认 12 秒）
- 失败原因分类回传（例如 `page_not_ready`、`like_button_not_found`、`like_timeout`）

这些结果会写入后台日志，便于排查命令失败原因。

