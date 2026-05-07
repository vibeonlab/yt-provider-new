import { Pool, types } from "pg";

/**
 * 自建 Postgres 连接池。共享单例，挂在 globalThis 上以避免 Next.js
 * 多模块加载时拿到不同实例。
 *
 * 支持的环境变量（任选其一即可）：
 *  - DATABASE_URL = postgres://user:pass@host:5432/db
 *  - PG_DATABASE_URL（同义，优先 DATABASE_URL）
 *
 * 可选：
 *  - PG_SSL=disable | require（默认按连接串里的 sslmode；本机连接通常不用 SSL）
 */

/**
 * 关键修正：pg 默认会把 timestamptz / timestamp 解析成本地时区的 Date。
 * 业务里直接消费成 ISO 字符串与 Supabase 兼容更稳，因此在 pool 创建前
 * 把这两类 OID 改成原样返回字符串。
 *  - 1114: timestamp without time zone
 *  - 1184: timestamp with time zone
 */
function configureTypeParsersOnce() {
  const g = globalThis as unknown as { __ytPgTypeParsersConfigured?: boolean };
  if (g.__ytPgTypeParsersConfigured) return;
  types.setTypeParser(1114, (val: string) => val);
  types.setTypeParser(1184, (val: string) => val);
  g.__ytPgTypeParsersConfigured = true;
}

const POOL_KEY = "__yt_pg_pool__";
type GlobalWithPool = typeof globalThis & {
  [POOL_KEY]?: Pool | null;
};

export function getPgPool(): Pool | null {
  const g = globalThis as GlobalWithPool;
  if (g[POOL_KEY] !== undefined) return g[POOL_KEY] ?? null;

  const connStr = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
  if (!connStr) {
    g[POOL_KEY] = null;
    return null;
  }

  configureTypeParsersOnce();

  const sslEnv = (process.env.PG_SSL || "").toLowerCase();
  const ssl =
    sslEnv === "require" || sslEnv === "true"
      ? { rejectUnauthorized: false }
      : sslEnv === "disable" || sslEnv === "false"
        ? false
        : undefined;

  const pool = new Pool({
    connectionString: connStr,
    max: parseInt(process.env.PG_POOL_MAX || "10", 10),
    idleTimeoutMillis: parseInt(
      process.env.PG_POOL_IDLE_MS || "30000",
      10,
    ),
    connectionTimeoutMillis: parseInt(
      process.env.PG_POOL_CONN_MS || "5000",
      10,
    ),
    ssl,
  });

  pool.on("error", (err) => {
    console.error("[pg-pool] idle client error", err);
  });

  g[POOL_KEY] = pool;
  return pool;
}

export function isPgConfigured(): boolean {
  return !!(process.env.DATABASE_URL || process.env.PG_DATABASE_URL);
}
