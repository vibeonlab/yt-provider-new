/**
 * 一次性数据同步：Supabase 托管 Postgres → 自建 Postgres。
 *
 * 用法（在装好 Node 18+ / pnpm-lock 同步之后）：
 *   1) 已经先在自建 Postgres 上执行过 db/schema.sql
 *   2) 设置 env：
 *        SOURCE_SUPABASE_URL=...
 *        SOURCE_SUPABASE_SERVICE_ROLE_KEY=...
 *        TARGET_DATABASE_URL=postgres://yt_app:****@127.0.0.1:5432/youtube_provider
 *      （可选）SYNC_TRUNCATE=1  → 同步前清空目标表
 *   3) 运行：
 *        npx tsx scripts/sync-from-supabase.ts
 *
 * 行为：
 *   - 按外键依赖顺序：agents → streamers → browser_slots → commands → assignments
 *     → admin_auth → operation_logs。
 *   - 默认 ON CONFLICT (主键/唯一键) DO UPDATE，幂等可重复执行。
 *   - 用 streaming + 1000 行/批，避免一次拉爆内存。
 *
 * 该脚本不会改你 Supabase 项目里的任何数据；只读 source，写 target。
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Pool, types } from "pg";

const SOURCE_URL = process.env.SOURCE_SUPABASE_URL || process.env.SUPABASE_URL;
const SOURCE_KEY =
  process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const TARGET_DB =
  process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error(
    "缺少 SOURCE_SUPABASE_URL / SOURCE_SUPABASE_SERVICE_ROLE_KEY（或 SUPABASE_*），无法读取 Supabase 数据。",
  );
  process.exit(1);
}
if (!TARGET_DB) {
  console.error("缺少 TARGET_DATABASE_URL（或 DATABASE_URL），无法写入自建 Postgres。");
  process.exit(1);
}

types.setTypeParser(1114, (val: string) => val);
types.setTypeParser(1184, (val: string) => val);

const supabase = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pool = new Pool({ connectionString: TARGET_DB });

const PAGE_SIZE = 1000;

type TableSpec = {
  name: string;
  /** 用于 ON CONFLICT 的列；若是主键自身（id）也写在这里。 */
  conflictCols: string[];
  /** 哪些列是 jsonb，需要 JSON.stringify 并 ::jsonb 转换。 */
  jsonbCols?: string[];
  /** Supabase 上要 select 的列；空字符串等于 *。 */
  selectCols?: string;
  /** 用于排序分页的列（一般是 created_at 或 id）。 */
  orderCol?: string;
};

const TABLES: TableSpec[] = [
  { name: "agents", conflictCols: ["id"], orderCol: "created_at" },
  { name: "streamers", conflictCols: ["id"], orderCol: "created_at" },
  { name: "browser_slots", conflictCols: ["id"], orderCol: "created_at" },
  {
    name: "commands",
    conflictCols: ["id"],
    jsonbCols: ["payload"],
    orderCol: "created_at",
  },
  { name: "assignments", conflictCols: ["id"], orderCol: "created_at" },
  { name: "admin_auth", conflictCols: ["account"], orderCol: "account" },
  {
    name: "operation_logs",
    conflictCols: ["id"],
    jsonbCols: ["meta"],
    orderCol: "created_at",
  },
];

async function syncTable(spec: TableSpec) {
  console.log(`\n🚚 同步表 ${spec.name} ...`);

  if (process.env.SYNC_TRUNCATE === "1") {
    console.log(`   - SYNC_TRUNCATE=1 → TRUNCATE ${spec.name} CASCADE`);
    await pool.query(`TRUNCATE TABLE public."${spec.name}" CASCADE;`);
  }

  let from = 0;
  let total = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    let query = supabase
      .from(spec.name)
      .select(spec.selectCols || "*")
      .range(from, to);
    if (spec.orderCol) {
      query = query.order(spec.orderCol, { ascending: true });
    }
    const { data, error } = await query;
    if (error) {
      console.error(`   ❌ 拉取 ${spec.name} 失败：`, error.message);
      throw error;
    }
    const rows = (data || []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) break;

    await insertBatch(spec, rows);
    total += rows.length;
    console.log(`   - 已写入 ${total} 行（本批 ${rows.length}）`);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`✅ 表 ${spec.name} 完成，共 ${total} 行`);
}

async function insertBatch(
  spec: TableSpec,
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;
  const colSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
  const cols = [...colSet];

  const jsonbSet = new Set(spec.jsonbCols ?? []);

  const values: unknown[] = [];
  let pIdx = 1;
  const valuesSql = rows
    .map((r) => {
      const phs = cols.map((c) => {
        const ph = jsonbSet.has(c) ? `$${pIdx}::jsonb` : `$${pIdx}`;
        pIdx += 1;
        const raw = r[c] ?? null;
        values.push(jsonbSet.has(c) && raw !== null ? JSON.stringify(raw) : raw);
        return ph;
      });
      return `(${phs.join(", ")})`;
    })
    .join(", ");

  const colSqlList = cols.map((c) => `"${c}"`).join(", ");
  const conflictCols = spec.conflictCols.length
    ? ` ON CONFLICT (${spec.conflictCols.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${cols
        .filter((c) => !spec.conflictCols.includes(c))
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(", ") || ""}`
    : "";
  const conflictSql =
    conflictCols.endsWith("DO UPDATE SET ") || conflictCols === ""
      ? ` ON CONFLICT (${spec.conflictCols.map((c) => `"${c}"`).join(", ")}) DO NOTHING`
      : conflictCols;

  const sql = `INSERT INTO public."${spec.name}" (${colSqlList}) VALUES ${valuesSql}${conflictSql}`;
  await pool.query(sql, values);
}

(async function main() {
  console.log("🌐 Source:", SOURCE_URL);
  console.log("🗄  Target:", TARGET_DB.replace(/:[^:@/]+@/, ":****@"));
  for (const spec of TABLES) {
    await syncTable(spec);
  }
  await pool.end();
  console.log("\n🎉 全部表同步完成。");
})().catch((err) => {
  console.error("\n❗ 同步失败：", err);
  pool.end();
  process.exit(1);
});
