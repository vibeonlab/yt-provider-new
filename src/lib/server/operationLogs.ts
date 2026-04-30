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
const LOG_RETENTION_DAYS = 3;

function retentionCutoffIso() {
  return new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function cleanupOldOperationLogs() {
  const cutoff = retentionCutoffIso();
  const admin = getSupabaseAdmin();
  if (admin) {
    const { error } = await admin.from("operation_logs").delete().lt("created_at", cutoff);
    return { ok: !error, mode: "supabase" as const };
  }

  const local = await readStore();
  const nextLogs = local.logs.filter((l) => l.createdAt >= cutoff);
  const deleted = local.logs.length - nextLogs.length;
  if (deleted > 0) {
    await writeStore({ logs: nextLogs });
  }
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
  const cutoff = retentionCutoffIso();
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
      await admin.from("operation_logs").delete().lt("created_at", cutoff);
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
  data.logs = data.logs.filter((l) => l.createdAt >= cutoff);
  if (data.logs.length > 5000) data.logs = data.logs.slice(0, 5000);
  await writeStore(data);
}

export async function listOperationLogs() {
  const cutoff = retentionCutoffIso();
  const admin = getSupabaseAdmin();
  if (admin) {
    await cleanupOldOperationLogs();
    const { data, error } = await admin
      .from("operation_logs")
      .select("id,module,action,level,operator,detail,created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1000);
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
  const nextLogs = local.logs.filter((l) => l.createdAt >= cutoff);
  if (nextLogs.length !== local.logs.length) {
    await writeStore({ logs: nextLogs });
  }
  return [...nextLogs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

