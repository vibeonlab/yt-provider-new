import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export type OperationLogRecord = {
  id: string;
  module: string;
  action: string;
  level: "info" | "warning" | "error";
  operator: string;
  detail: string;
  createdAt: string;
};

type LocalLogsStore = {
  logs: OperationLogRecord[];
};

/**
 * 操作日志只保留最新 N 条，超出的按 created_at 升序裁剪掉。
 * （之前是按"保留近 N 天"，会导致量级随时间膨胀；改成 cap 后内存/磁盘
 * 占用可控。）
 */
const LOG_RETENTION_COUNT = 1000;

export async function cleanupOldOperationLogs() {
  const admin = getSupabaseAdmin();
  if (admin) {
    /**
     * 取第 (RETENTION+1) 行的 created_at 作为分界点；行数 <= RETENTION 直接返回。
     * 边界点用 `<` 删，可能因为时间戳并列保留几条，这是可接受的近似。
     */
    const { data, error: probeErr } = await admin
      .from("operation_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(LOG_RETENTION_COUNT + 1);
    if (probeErr) {
      return { ok: false, mode: "supabase" as const };
    }
    if (!data || data.length <= LOG_RETENTION_COUNT) {
      return { ok: true, mode: "supabase" as const };
    }
    const cutoff = (data[LOG_RETENTION_COUNT] as { created_at: string })
      .created_at;
    const { error } = await admin
      .from("operation_logs")
      .delete()
      .lt("created_at", cutoff);
    return { ok: !error, mode: "supabase" as const };
  }

  const local = await readStore();
  if (local.logs.length <= LOG_RETENTION_COUNT) {
    return { ok: true, mode: "json" as const, deleted: 0 };
  }
  const sorted = [...local.logs].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  const nextLogs = sorted.slice(0, LOG_RETENTION_COUNT);
  const deleted = local.logs.length - nextLogs.length;
  await writeStore({ logs: nextLogs });
  return { ok: true, mode: "json" as const, deleted };
}

function filePath() {
  return path.join(process.cwd(), "data", "operation-logs.json");
}

function newId() {
  return `log_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

async function ensureStore() {
  const fp = filePath();
  await mkdir(path.dirname(fp), { recursive: true });
  try {
    await readFile(fp, "utf-8");
  } catch {
    await writeFile(fp, JSON.stringify({ logs: [] }, null, 2), "utf-8");
  }
}

async function readStore(): Promise<LocalLogsStore> {
  await ensureStore();
  return JSON.parse(await readFile(filePath(), "utf-8")) as LocalLogsStore;
}

async function writeStore(data: LocalLogsStore) {
  await writeFile(filePath(), JSON.stringify(data, null, 2), "utf-8");
}

export async function writeOperationLog(input: {
  module: string;
  action: string;
  level?: "info" | "warning" | "error";
  operator?: string;
  detail?: string;
  meta?: Record<string, unknown>;
}) {
  const level = input.level ?? "info";
  const operator = input.operator ?? "system";
  const detail = input.detail ?? "";
  const createdAt = new Date().toISOString();
  const admin = getSupabaseAdmin();

  if (admin) {
    const { error } = await admin.from("operation_logs").insert({
      module: input.module,
      action: input.action,
      level,
      operator,
      detail,
      meta: input.meta ?? {},
    });
    if (!error) {
      await cleanupOldOperationLogs();
      return;
    }
  }

  const data = await readStore();
  data.logs.unshift({
    id: newId(),
    module: input.module,
    action: input.action,
    level,
    operator,
    detail,
    createdAt,
  });
  if (data.logs.length > LOG_RETENTION_COUNT) {
    data.logs = data.logs
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, LOG_RETENTION_COUNT);
  }
  await writeStore(data);
}

export async function listOperationLogs() {
  const admin = getSupabaseAdmin();
  if (admin) {
    await cleanupOldOperationLogs();
    const { data, error } = await admin
      .from("operation_logs")
      .select("id,module,action,level,operator,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(LOG_RETENTION_COUNT);
    if (!error && data) {
      return data.map((row) => ({
        id: row.id as string,
        module: row.module as string,
        action: row.action as string,
        level: row.level as "info" | "warning" | "error",
        operator: row.operator as string,
        detail: row.detail as string,
        createdAt: row.created_at as string,
      }));
    }
  }

  const local = await readStore();
  const sorted = [...local.logs].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  if (sorted.length > LOG_RETENTION_COUNT) {
    const nextLogs = sorted.slice(0, LOG_RETENTION_COUNT);
    await writeStore({ logs: nextLogs });
    return nextLogs;
  }
  return sorted;
}

