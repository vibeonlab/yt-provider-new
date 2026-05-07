# 自建 PostgreSQL 替代 Supabase

YoutubeProvider 现在内置了 **「supabase-js 兼容」直连 Postgres** 的薄客户端
（`src/lib/server/db/pgSupabaseShim.ts`），业务代码（`agentStore`、
`schedulerStore`、`adminAuth`、`operationLogs`、各 API 路由）**一行不动**就能
切换到你 VPS 上自己装的 Postgres 实例，从此摆脱 Supabase 云端 Egress。

## 切换规则

`getSupabaseAdmin()` 选择数据后端的优先级：

1. **`DATABASE_URL`** / `PG_DATABASE_URL` 已配置 → 走自建 Postgres（**新默认**）
2. 否则若 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY/ANON_KEY` 已配置 → 走 Supabase 托管 Postgres（兼容旧部署）
3. 都没有 → 回退本地 JSON（`data/*.json`）

```
   if (DATABASE_URL)        -> postgres
   else if (SUPABASE_URL)   -> supabase
   else                     -> json
```

## 一、VPS 安装并初始化 Postgres（一次性）

> 系统假设 Ubuntu 22.04 LTS。其它发行版/Docker 部署原理一致，命令略调整。

```bash
# 1) 安装
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# 2) 创建库 + 用户
sudo -u postgres psql <<'SQL'
CREATE DATABASE youtube_provider;
CREATE USER yt_app WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL ON DATABASE youtube_provider TO yt_app;
ALTER DATABASE youtube_provider OWNER TO yt_app;
SQL

#Forchat
sudo -u postgres psql <<'SQL'
CREATE DATABASE youtube_provider;
CREATE USER yt_app WITH PASSWORD 'lhcyqopco2';
GRANT ALL ON DATABASE youtube_provider TO yt_app;
ALTER DATABASE youtube_provider OWNER TO yt_app;
\c youtube_provider
GRANT ALL ON SCHEMA public TO yt_app;
ALTER SCHEMA public OWNER TO yt_app;
SQL

# 3) 应用 schema —— 用应用账号 yt_app 执行，保证表 owner 就是 yt_app
cd /var/www/youtube-provider     # 你的项目目录
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' psql \
  -h 127.0.0.1 -U yt_app -d youtube_provider -f db/schema.sql

# 如果你已经用 postgres 超级用户建过表（导致 owner=postgres，应用账号没权限），
# 用下面这段把 owner 改回 yt_app：
# sudo -u postgres psql -d youtube_provider <<'SQL'
# DO $$
# DECLARE r record;
# BEGIN
#   FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
#     EXECUTE format('ALTER TABLE public.%I OWNER TO yt_app', r.tablename);
#   END LOOP;
#   FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
#     EXECUTE format('ALTER SEQUENCE public.%I OWNER TO yt_app', r.sequence_name);
#   END LOOP;
# END$$;
# SQL
```

> 建议同时配置 Postgres 监听 `127.0.0.1`、关闭外网监听（默认即如此），避免暴露公网。

## 二、把现有 Supabase 数据迁到本地（一次性）

> 这一步**只读 Supabase，不写**——可在任何时候安全执行；导入完之后再做切换。

在项目根目录创建临时 `.env`：

```dotenv
SOURCE_SUPABASE_URL=https://xxxxxx.supabase.co
SOURCE_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
TARGET_DATABASE_URL=postgres://yt_app:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/youtube_provider
# 可选：SYNC_TRUNCATE=1 → 同步前清空目标表（默认走 ON CONFLICT 幂等）
```

# forchat
cat > /var/www/youtube-provider/.env <<'EOF'
SOURCE_SUPABASE_URL=https://jfthkrfmxnrtrnewgunw.supabase.co
SOURCE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmdGhrcmZteG5ydHJuZXdndW53Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQzMDIxMSwiZXhwIjoyMDkzMDA2MjExfQ.SREFqSUzkSqpNvieoL5Sz4UdxrGrUcRUwlvOt018ptY
TARGET_DATABASE_URL=postgres://yt_app:lhcyqopco2@127.0.0.1:5432/youtube_provider
EOF
chmod 600 .env

执行：

```bash
npm install                 # 确保 pg / dotenv 等依赖装好
npm run db:sync-from-supabase
```

终端会按外键依赖顺序逐表导入：`agents → streamers → browser_slots → commands →
assignments → admin_auth → operation_logs`。脚本支持重复运行（默认 ON CONFLICT
DO UPDATE），数据量大时分页（每页 1000 行）。

完成示例：

```
🚚 同步表 agents ...
   - 已写入 12 行（本批 12）
✅ 表 agents 完成，共 12 行
...
🎉 全部表同步完成。
```

## 三、把生产环境切到自建 Postgres

修改 PM2 / `.env`：

```diff
-# SUPABASE_URL=https://xxxxxx.supabase.co
-# SUPABASE_SERVICE_ROLE_KEY=...
+DATABASE_URL=postgres://yt_app:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/youtube_provider
```

`DATABASE_URL` 一旦配置，应用就**优先**走它。Supabase 的环境变量保留与否都行——
注释掉更安全（避免误连）。

```bash
pm2 restart youtube-provider --update-env
pm2 logs youtube-provider --lines 0
```

启动日志看到：

```
> Ready on http://0.0.0.0:3000 ...
```

之后任意管理页面操作（新增/删除主播、上下线、查看日志）都直接读写本机 Postgres，
**Supabase 云端流量归零**。

## 四、验证

- `https://ypn.obba.ai/api/health/storage` 应返回 `mode: "supabase"`（兼容字段
  名，但实际后端是自建 Postgres——这是因为代码统一走 supabase-js 兼容客户端）。
  你可以从 `pm2 logs` 里没有任何对 `*.supabase.co` 的网络访问来确认。
- `psql -c "SELECT count(*) FROM agents;"` 数量与 Supabase 一致。
- 客户端注册/心跳正常，`commands` 表里能看到新插入行。

## 五、回滚

任何时候想切回 Supabase：删/注释 `DATABASE_URL`，确保 `SUPABASE_*` 仍配置好，
重启即可。本地 Postgres 数据保留，再次切回时从两边新增数据需自行决定如何对账。

## 注意事项

- **JSONB 列**：`commands.payload` / `operation_logs.meta` 在 shim 里自动 `::jsonb`
  转换，业务代码无须改动。
- **text[] 列**：`browser_slots.tabs` 直接以 JS 字符串数组传入即可。
- **触发器**：`schema.sql` 给主要表加了 `BEFORE UPDATE` 触发器自动维护
  `updated_at`；想关闭直接 `DROP TRIGGER trg_<table>_set_updated_at ON public.<table>;`。
- **连接池**：默认 10 个连接，`PG_POOL_MAX` 可调。500 台 Agent 在 WS 模式下，
  服务端真正同时跑的并发查询不会很高，10 已足够；如需要再调大也别忘了调整
  Postgres 的 `max_connections`。
- **备份**：自建库要定期 `pg_dump`，如：
  ```bash
  pg_dump "postgres://yt_app:****@127.0.0.1:5432/youtube_provider" \
    -Fc -f /var/backups/yt-$(date +%F).dump
  ```
