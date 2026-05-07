import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPgPool, isPgConfigured } from "@/lib/server/db/pgPool";
import { PgSupabaseShim } from "@/lib/server/db/pgSupabaseShim";

/**
 * 数据后端选择规则（环境变量优先级，从上到下）：
 *
 *  1. `DATABASE_URL` / `PG_DATABASE_URL`：自建 Postgres，使用 supabase-js
 *     兼容的薄客户端（pgSupabaseShim），业务代码无需改动。这是新的默认推荐。
 *  2. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY`：仍走
 *     Supabase 托管 Postgres（兼容旧部署/本地开发）。
 *  3. 都没配置：返回 null，业务侧回退到本地 JSON 存储。
 *
 * 切换：在 .env / PM2 环境里把 `DATABASE_URL` 换掉即可。从 Supabase 切到
 * 自建 Postgres 之前，记得先用 `npm run db:sync-from-supabase` 把云端数据
 * 一次性导入本地数据库。
 */

/**
 * 业务侧仍以 `SupabaseClient` 类型使用，无论底层是真正的 Supabase 还是
 * `PgSupabaseShim`。两者在 `.from(...)` 链式调用上结构兼容，所以这里
 * 用 `unknown` 中转避免 TS 在结构上的轻微差异（PostgrestFilterBuilder
 * vs 我们的 PgBuilder）。
 */
let cached: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  if (isPgConfigured()) {
    const pool = getPgPool();
    if (pool) {
      const shim = new PgSupabaseShim(pool);
      cached = shim as unknown as SupabaseClient;
      return cached;
    }
  }

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

/**
 * 业务侧偶尔需要知道当前用的是哪种后端（仅用于诊断接口 / 日志），不要用
 * 它做业务分支——业务代码应该统一走 supabase 风格 API。
 */
export function getDatabaseMode(): "postgres" | "supabase" | "json" {
  if (isPgConfigured()) return "postgres";
  if (process.env.SUPABASE_URL) return "supabase";
  return "json";
}
