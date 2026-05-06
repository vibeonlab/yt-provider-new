import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { writeOperationLog } from "@/lib/server/operationLogs";

export type AgentBrowserStatus = {
  browserId: string;
  name: string;
  wsUrl: string;
  connected: boolean;
  tabsCount: number;
  activeUrl: string;
  tabs?: string[];
  updatedAt: string;
  /** Supabase `agents.id`（UUID），用于写入 `commands.agent_id`；JSON 模式下不含 */
  agentDatabaseId?: string;
  /** 对应代理最近一次心跳（ISO），便于广播等逻辑判断是否存活 */
  agentLastHeartbeatAt?: string;
};

export type AgentRecord = {
  agentId: string;
  name: string;
  host: string;
  capacity: number;
  status: "online" | "offline";
  lastHeartbeatAt: string;
  browsers: AgentBrowserStatus[];
  createdAt: string;
  updatedAt: string;
};

type AgentStore = {
  agents: AgentRecord[];
};

type AgentControlStore = {
  disabledAgentIds: string[];
};

const HEARTBEAT_TIMEOUT_MS = 20_000;

/** 用于判断代理是否仍在心跳窗口内（优先于仅看 status 字段）。 */
export function isAgentHeartbeatFresh(
  lastHeartbeatIso: string | undefined,
  timeoutMs = HEARTBEAT_TIMEOUT_MS,
): boolean {
  if (!lastHeartbeatIso) return false;
  const t = new Date(lastHeartbeatIso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= timeoutMs;
}

function storeFilePath() {
  return path.join(process.cwd(), "data", "agents.json");
}

async function ensureStore() {
  const filePath = storeFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await readFile(filePath, "utf-8");
  } catch {
    const initial: AgentStore = { agents: [] };
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readStore(): Promise<AgentStore> {
  await ensureStore();
  const raw = await readFile(storeFilePath(), "utf-8");
  const data = JSON.parse(raw) as AgentStore;
  return data;
}

async function writeStore(data: AgentStore) {
  await writeFile(storeFilePath(), JSON.stringify(data, null, 2), "utf-8");
}

function controlsFilePath() {
  return path.join(process.cwd(), "data", "agent-controls.json");
}

async function ensureControlsStore() {
  const filePath = controlsFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await readFile(filePath, "utf-8");
  } catch {
    const initial: AgentControlStore = { disabledAgentIds: [] };
    await writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readControlsStore(): Promise<AgentControlStore> {
  await ensureControlsStore();
  return JSON.parse(
    await readFile(controlsFilePath(), "utf-8"),
  ) as AgentControlStore;
}

/** 调度 / 广播侧判断禁用代理 */
export async function getDisabledAgentIdSet(): Promise<Set<string>> {
  const c = await readControlsStore();
  return new Set(c.disabledAgentIds ?? []);
}

/** 广播清理缓存 / 内存模式时的目标（每个浏览器一条）；不依赖 browser_slots.connected */
export type BroadcastCommandTarget = {
  agentId: string;
  browserId: string;
  slotId?: string;
  agentDatabaseId?: string;
};

/** 状态列表为空时，兜底用本地 JSON / DB 判断代理活性 */
const BROADCAST_AGENT_HEARTBEAT_MS = 90_000;

/**
 * 列出应接收广播控制命令的浏览器实例。
 * 优先与「运行面板」同源：使用 {@link listAgentBrowserStatuses} 中出现的每一条浏览器（只要有 agentId+browserId，不因心跳秒数排除）。
 * 若列表为空，再退回「近期有心跳的 DB 槽位 + 本地 agents.json」。
 */
export async function listBroadcastCommandTargets(): Promise<
  BroadcastCommandTarget[]
> {
  const disabled = await getDisabledAgentIdSet();
  const map = new Map<string, BroadcastCommandTarget>();

  function mergeTarget(t: BroadcastCommandTarget) {
    const aid = (t.agentId || "").trim();
    const bid = (t.browserId || "").trim();
    if (!aid || !bid || aid === "unknown" || disabled.has(aid)) return;
    const key = `${aid}:${bid}`;
    const prev = map.get(key);
    const hasDb =
      !!t.slotId &&
      !!t.agentDatabaseId &&
      String(t.slotId).length > 0 &&
      String(t.agentDatabaseId).length > 0;
    const prevHasDb =
      !!prev?.slotId &&
      !!prev?.agentDatabaseId &&
      String(prev.slotId).length > 0 &&
      String(prev.agentDatabaseId).length > 0;
    if (!prev) {
      map.set(key, {
        agentId: aid,
        browserId: bid,
        slotId: t.slotId,
        agentDatabaseId: t.agentDatabaseId,
      });
      return;
    }
    if (hasDb && !prevHasDb) {
      map.set(key, {
        agentId: aid,
        browserId: bid,
        slotId: t.slotId,
        agentDatabaseId: t.agentDatabaseId,
      });
    }
  }

  const statuses = await listAgentBrowserStatuses();
  for (const s of statuses) {
    mergeTarget({
      agentId: s.agentId || "",
      browserId: s.browserId || "",
      slotId: s.slotId,
      agentDatabaseId: s.agentDatabaseId,
    });
  }

  if (map.size > 0) {
    return [...map.values()];
  }

  const sinceIso = new Date(
    Date.now() - BROADCAST_AGENT_HEARTBEAT_MS,
  ).toISOString();

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: aliveAgents, error: agErr } = await admin
      .from("agents")
      .select("id,agent_id,last_heartbeat_at")
      .gte("last_heartbeat_at", sinceIso);

    if (!agErr && aliveAgents && aliveAgents.length > 0) {
      const pkToPublicId = new Map(
        aliveAgents.map((a) => [a.id as string, a.agent_id as string]),
      );
      const alivePk = aliveAgents.map((a) => a.id as string);
      const { data: slots } = await admin
        .from("browser_slots")
        .select("id,agent_id,browser_id")
        .in("agent_id", alivePk);

      for (const row of slots || []) {
        const agentId = pkToPublicId.get(row.agent_id as string);
        const browserId = ((row.browser_id as string) || "").trim();
        if (!agentId || !browserId || disabled.has(agentId)) continue;
        mergeTarget({
          agentId,
          browserId,
          slotId: row.id as string,
          agentDatabaseId: row.agent_id as string,
        });
      }
    }
  }

  const data = await readStore();
  const next = normalizeAgentStatuses(data);
  for (const agent of next.agents) {
    if (disabled.has(agent.agentId)) continue;
    if (
      !isAgentHeartbeatFresh(
        agent.lastHeartbeatAt,
        BROADCAST_AGENT_HEARTBEAT_MS,
      )
    ) {
      continue;
    }
    for (const b of agent.browsers) {
      const browserId = (b.browserId || "").trim();
      if (!browserId) continue;
      mergeTarget({
        agentId: agent.agentId,
        browserId,
      });
    }
  }

  return [...map.values()];
}

async function writeControlsStore(data: AgentControlStore) {
  await writeFile(controlsFilePath(), JSON.stringify(data, null, 2), "utf-8");
}

function normalizeAgentStatuses(data: AgentStore): AgentStore {
  const now = Date.now();
  const nextAgents = data.agents.map((agent) => {
    const diff = now - new Date(agent.lastHeartbeatAt).getTime();
    const status: AgentRecord["status"] =
      diff <= HEARTBEAT_TIMEOUT_MS ? "online" : "offline";
    return { ...agent, status };
  });
  return { agents: nextAgents };
}

export type RegisterAgentResult =
  | { ok: true; agentId: string }
  | { ok: false; error: string };

function formatSupabaseError(err: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}): string {
  const parts = [err.message, err.details, err.hint, err.code]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  return parts.join(" — ") || "数据库写入失败";
}

export async function registerAgent(input: {
  agentId?: string;
  name: string;
  host: string;
  capacity: number;
}): Promise<RegisterAgentResult> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const agentId =
      input.agentId?.trim() ||
      `agent_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    const now = new Date().toISOString();
    const { error } = await admin.from("agents").upsert(
      {
        agent_id: agentId,
        name: input.name,
        host: input.host,
        capacity: input.capacity,
        status: "online",
        last_heartbeat_at: now,
      },
      { onConflict: "agent_id" },
    );
    if (error) {
      return { ok: false, error: formatSupabaseError(error) };
    }
    return { ok: true, agentId };
  }

  const now = new Date().toISOString();
  const data = await readStore();
  const next = normalizeAgentStatuses(data);

  const agentId =
    input.agentId?.trim() ||
    `agent_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const found = next.agents.find((a) => a.agentId === agentId);

  if (found) {
    found.name = input.name;
    found.host = input.host;
    found.capacity = input.capacity;
    found.status = "online";
    found.lastHeartbeatAt = now;
    found.updatedAt = now;
  } else {
    next.agents.push({
      agentId,
      name: input.name,
      host: input.host,
      capacity: input.capacity,
      status: "online",
      lastHeartbeatAt: now,
      browsers: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeStore(next);
  return { ok: true, agentId };
}

export async function updateHeartbeat(agentId: string) {
  const admin = getSupabaseAdmin();
  if (admin) {
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("agents")
      .update({
        last_heartbeat_at: now,
        status: "online",
      })
      .eq("agent_id", agentId)
      .select("id")
      .limit(1);
    if (!error && data && data.length > 0) return { ok: true as const };
  }

  const now = new Date().toISOString();
  const data = await readStore();
  const next = normalizeAgentStatuses(data);
  const found = next.agents.find((a) => a.agentId === agentId);
  if (!found) return { ok: false as const, error: "agent not found" };

  found.lastHeartbeatAt = now;
  found.updatedAt = now;
  found.status = "online";
  await writeStore(next);
  return { ok: true as const };
}

export async function reportAgentStatus(input: {
  agentId: string;
  browsers: Array<{
    browserId: string;
    name: string;
    wsUrl: string;
    connected: boolean;
    tabsCount: number;
    activeUrl: string;
    tabs?: string[];
  }>;
}) {
  const admin = getSupabaseAdmin();
  if (admin) {
    const now = new Date().toISOString();
    const { data: agents, error: findError } = await admin
      .from("agents")
      .select("id")
      .eq("agent_id", input.agentId)
      .limit(1);
    if (!findError && agents && agents.length > 0) {
      const agentPk = agents[0].id as string;
      const { data: existingSlots } = await admin
        .from("browser_slots")
        .select("id,browser_id,state")
        .eq("agent_id", agentPk);
      const existingSlotIds = (existingSlots || [])
        .map((s) => s.id as string)
        .filter(Boolean);
      const runningAssignmentSlotSet = new Set<string>();
      if (existingSlotIds.length > 0) {
        const { data: runningAssignments } = await admin
          .from("assignments")
          .select("browser_slot_id")
          .in("browser_slot_id", existingSlotIds)
          .eq("status", "running");
        (runningAssignments || []).forEach((a) => {
          const sid = a.browser_slot_id as string;
          if (sid) runningAssignmentSlotSet.add(sid);
        });
      }
      const slotByBrowserId = new Map(
        (existingSlots || []).map((s) => [s.browser_id as string, s]),
      );
      const stateMap = new Map(
        (existingSlots || []).map((s) => [
          s.browser_id as string,
          (s.state as string) || "idle",
        ]),
      );
      const rows = input.browsers.map((b) => ({
        slotId: (slotByBrowserId.get(b.browserId)?.id as string) || "",
        agent_id: agentPk,
        browser_id: b.browserId,
        name: b.name,
        ws_url: b.wsUrl,
        // Scheduler state should follow actual assignment existence.
        state:
          runningAssignmentSlotSet.has(
            (slotByBrowserId.get(b.browserId)?.id as string) || "",
          )
            ? "busy"
            : stateMap.get(b.browserId) === "busy"
              ? "idle"
              : stateMap.get(b.browserId) || "idle",
        connected: !!b.connected,
        tabs_count: Math.max(0, Math.min(10, Number(b.tabsCount) || 0)),
        active_url: b.activeUrl || "",
        tabs: b.tabs?.slice(0, 10) ?? [],
      }));
      const upsertRows = rows.map(({ slotId: _slotId, ...rest }) => rest);
      const { error: upsertError } = await admin
        .from("browser_slots")
        .upsert(upsertRows, { onConflict: "agent_id,browser_id" });
      if (!upsertError) {
        const reportedIds = new Set(input.browsers.map((b) => b.browserId));
        const staleSlotIds = (existingSlots || [])
          .filter((s) => !reportedIds.has((s.browser_id as string) || ""))
          .map((s) => s.id as string)
          .filter(Boolean);

        // Any previously known slot not included in current heartbeat is treated as offline.
        if (staleSlotIds.length > 0) {
          await admin
            .from("browser_slots")
            .update({
              connected: false,
              tabs_count: 0,
              active_url: "",
              tabs: [],
              state: "idle",
            })
            .in("id", staleSlotIds);
        }

        await admin
          .from("agents")
          .update({
            last_heartbeat_at: now,
            status: "online",
          })
          .eq("id", agentPk);
        return { ok: true as const };
      }
    }
  }

  const now = new Date().toISOString();
  const data = await readStore();
  const next = normalizeAgentStatuses(data);
  const found = next.agents.find((a) => a.agentId === input.agentId);
  if (!found) return { ok: false as const, error: "agent not found" };

  found.browsers = input.browsers.map((b) => ({
    browserId: b.browserId,
    name: b.name,
    wsUrl: b.wsUrl,
    connected: !!b.connected,
    tabsCount: Math.max(0, Math.min(10, Number(b.tabsCount) || 0)),
    activeUrl: b.activeUrl || "",
    tabs: b.tabs?.slice(0, 10) ?? [],
    updatedAt: now,
  }));
  found.lastHeartbeatAt = now;
  found.updatedAt = now;
  found.status = "online";

  await writeStore(next);
  return { ok: true as const };
}

export async function listAgentBrowserStatuses() {
  const admin = getSupabaseAdmin();
  if (admin) {
    const now = new Date();
    const heartbeatDeadline = new Date(
      now.getTime() - HEARTBEAT_TIMEOUT_MS,
    ).toISOString();

    await admin
      .from("agents")
      .update({ status: "offline" })
      .lt("last_heartbeat_at", heartbeatDeadline);
    await admin
      .from("agents")
      .update({ status: "online" })
      .gte("last_heartbeat_at", heartbeatDeadline);

    const { data: agents, error: agentsError } = await admin
      .from("agents")
      .select("id,agent_id,name,status,last_heartbeat_at");
    if (!agentsError && agents && agents.length > 0) {
      const agentMap = new Map(
        agents.map((a) => [
          a.id as string,
          {
            agentId: a.agent_id as string,
            name: a.name as string,
            status: a.status as "online" | "offline",
            lastHeartbeatAt: (a.last_heartbeat_at as string) || "",
          },
        ]),
      );
      const agentIds = agents.map((a) => a.id as string);

      const { data: slots, error: slotError } = await admin
        .from("browser_slots")
        .select("id,agent_id,browser_id,name,ws_url,connected,tabs_count,active_url,tabs,updated_at")
        .in("agent_id", agentIds);

      if (!slotError && slots && slots.length > 0) {
        const controls = await readControlsStore();
        const disabledSet = new Set(controls.disabledAgentIds);
        return slots.map((s) => {
          const agent = agentMap.get(s.agent_id as string);
          const tabsValue = s.tabs;
          const tabs = Array.isArray(tabsValue)
            ? (tabsValue as string[])
            : [];
          const hb = agent?.lastHeartbeatAt || "";
          const agentAlive = isAgentHeartbeatFresh(hb);
          return {
            id: `${agent?.agentId || "unknown"}:${s.browser_id as string}`,
            slotId: s.id as string,
            agentDatabaseId: s.agent_id as string,
            browserId: s.browser_id as string,
            name: agent?.name || "Unknown",
            agentName: agent?.name || "Unknown",
            browserName: (s.name as string) || (s.browser_id as string) || "",
            wsUrl: (s.ws_url as string) || "",
            agentLastHeartbeatAt: hb || undefined,
            connected:
              agentAlive &&
              !disabledSet.has(agent?.agentId || "") &&
              Boolean(s.connected),
            tabsCount: Number(s.tabs_count) || 0,
            activeUrl: (s.active_url as string) || "",
            tabs,
            agentId: agent?.agentId || "unknown",
            agentStatus: agent?.status || "offline",
            updatedAt:
              (s.updated_at as string) || new Date().toISOString(),
          };
        });
      }
    }
  }

  const data = await readStore();
  const next = normalizeAgentStatuses(data);
  await writeStore(next);
  const controls = await readControlsStore();
  const disabledSet = new Set(controls.disabledAgentIds);

  return next.agents.flatMap((agent) =>
    agent.browsers.map((b) => ({
      id: `${agent.agentId}:${b.browserId}`,
      slotId: undefined as string | undefined,
      agentDatabaseId: undefined as string | undefined,
      browserId: b.browserId,
      name: agent.name,
      agentName: agent.name,
      browserName: b.name,
      wsUrl: b.wsUrl,
      agentLastHeartbeatAt: agent.lastHeartbeatAt,
      connected:
        isAgentHeartbeatFresh(agent.lastHeartbeatAt) &&
        !disabledSet.has(agent.agentId) &&
        b.connected,
      tabsCount: b.tabsCount,
      activeUrl: b.activeUrl,
      tabs: b.tabs ?? [],
      agentId: agent.agentId,
      agentStatus: agent.status,
      updatedAt: b.updatedAt,
    })),
  );
}

export async function listAgents() {
  const controls = await readControlsStore();
  const disabledSet = new Set(controls.disabledAgentIds);
  const admin = getSupabaseAdmin();
  if (admin) {
    const now = new Date();
    const heartbeatDeadline = new Date(
      now.getTime() - HEARTBEAT_TIMEOUT_MS,
    ).toISOString();
    await admin
      .from("agents")
      .update({ status: "offline" })
      .lt("last_heartbeat_at", heartbeatDeadline);
    await admin
      .from("agents")
      .update({ status: "online" })
      .gte("last_heartbeat_at", heartbeatDeadline);

    const { data, error } = await admin
      .from("agents")
      .select("id,agent_id,name,host,capacity,status,last_heartbeat_at,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (!error && data) {
      return data.map((a) => ({
        agentId: a.agent_id as string,
        name: a.name as string,
        host: a.host as string,
        capacity: Number(a.capacity) || 0,
        status: (a.status as "online" | "offline") || "offline",
        enabled: !disabledSet.has(a.agent_id as string),
        lastHeartbeatAt: (a.last_heartbeat_at as string) || "",
        createdAt: (a.created_at as string) || "",
        updatedAt: (a.updated_at as string) || "",
      }));
    }
  }

  const data = await readStore();
  const next = normalizeAgentStatuses(data);
  await writeStore(next);
  return next.agents.map((a) => ({
    agentId: a.agentId,
    name: a.name,
    host: a.host,
    capacity: a.capacity,
    status: a.status,
    enabled: !disabledSet.has(a.agentId),
    lastHeartbeatAt: a.lastHeartbeatAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

export async function setAgentEnabled(agentId: string, enabled: boolean) {
  const controls = await readControlsStore();
  const set = new Set(controls.disabledAgentIds);
  if (enabled) set.delete(agentId);
  else set.add(agentId);
  await writeControlsStore({ disabledAgentIds: [...set] });

  await writeOperationLog({
    module: "系统设置",
    action: enabled ? "启用调度" : "禁用调度",
    operator: "ytadmin",
    level: "warning",
    detail: `Agent ${agentId} 已${enabled ? "启用" : "禁用"}调度`,
    meta: {
      agentId,
      enabled,
    },
  });

  return { ok: true as const };
}

