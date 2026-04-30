import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { listAgentBrowserStatuses } from "@/lib/server/agentStore";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { writeOperationLog } from "@/lib/server/operationLogs";

export type StreamerRecord = {
  id: string;
  name: string;
  liveUrl: string;
  channelId: string;
  targetOnlineCount: number;
  currentOnlineCount: number;
  status: "online" | "offline";
};

export type AssignmentRecord = {
  id: string;
  streamerId: string;
  agentId: string;
  browserId: string;
  commandId: string;
  status: "running" | "released";
  createdAt: string;
  updatedAt: string;
};

export type CommandRecord = {
  id: string;
  agentId: string;
  browserId: string;
  type: "open_stream" | "go_home";
  streamerId: string;
  payload: {
    url: string;
  };
  status: "pending" | "sent" | "done" | "failed";
  message?: string;
  createdAt: string;
  updatedAt: string;
};

export type CommandTaskView = {
  commandId: string;
  type: "open_stream" | "go_home";
  status: "pending" | "sent" | "done" | "failed";
  message: string;
  agentId: string;
  agentName: string;
  browserId: string;
  browserName: string;
  streamerId: string;
  streamerName: string;
  retryAttempt: number;
  createdAt: string;
  updatedAt: string;
};

type SchedulerStore = {
  streamers: StreamerRecord[];
  assignments: AssignmentRecord[];
  commands: CommandRecord[];
};

const COMMAND_RETRY_MAX = 2;
const COMMAND_SENT_TIMEOUT_MS = 20_000;
const TASK_RETENTION_DAYS = 3;

function tasksRetentionCutoffIso() {
  return new Date(
    Date.now() - TASK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export async function cleanupOldCommandTasks() {
  const cutoff = tasksRetentionCutoffIso();
  const admin = getSupabaseAdmin();
  if (admin) {
    const { error } = await admin.from("commands").delete().lt("created_at", cutoff);
    return { ok: !error, mode: "supabase" as const };
  }

  const data = await readStore();
  const nextCommands = data.commands.filter((c) => c.createdAt >= cutoff);
  const deleted = data.commands.length - nextCommands.length;
  if (deleted > 0) {
    data.commands = nextCommands;
    await saveStore(data);
  }
  return { ok: true, mode: "json" as const, deleted };
}

function filePath() {
  return path.join(process.cwd(), "data", "scheduler.json");
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function retryRoot(commandId: string) {
  const idx = commandId.indexOf("::r");
  return idx === -1 ? commandId : commandId.slice(0, idx);
}

function retryAttemptFromMessage(message?: string) {
  if (!message) return 0;
  const match = message.match(/attempt:(\d+)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function retryAttemptFromCommandId(commandId: string) {
  const match = commandId.match(/::r(\d+)$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

async function ensureStore() {
  await mkdir(path.dirname(filePath()), { recursive: true });
  try {
    await readFile(filePath(), "utf-8");
  } catch {
    const initial: SchedulerStore = {
      streamers: [
        {
          id: "s1",
          name: "主播-A",
          liveUrl: "https://youtube.com/live/abc-001",
          channelId: "UCxxxx001",
          targetOnlineCount: 3,
          currentOnlineCount: 0,
          status: "offline",
        },
        {
          id: "s2",
          name: "主播-B",
          liveUrl: "https://youtube.com/live/abc-002",
          channelId: "UCxxxx002",
          targetOnlineCount: 2,
          currentOnlineCount: 0,
          status: "offline",
        },
      ],
      assignments: [],
      commands: [],
    };
    await writeFile(filePath(), JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readStore(): Promise<SchedulerStore> {
  await ensureStore();
  return JSON.parse(await readFile(filePath(), "utf-8")) as SchedulerStore;
}

async function saveStore(data: SchedulerStore) {
  await writeFile(filePath(), JSON.stringify(data, null, 2), "utf-8");
}

async function reconcileJsonAssignments(data: SchedulerStore) {
  const statuses = await listAgentBrowserStatuses();
  const connectedMap = new Map(
    statuses.map((s) => [`${s.agentId}:${s.browserId}`, s.connected]),
  );
  let changed = false;
  const now = new Date().toISOString();
  data.assignments.forEach((a) => {
    if (a.status !== "running") return;
    const key = `${a.agentId}:${a.browserId}`;
    if (!connectedMap.get(key)) {
      a.status = "released";
      a.updatedAt = now;
      changed = true;
    }
  });

  data.streamers.forEach((s) => {
    const count = data.assignments.filter(
      (a) => a.streamerId === s.id && a.status === "running",
    ).length;
    if (s.currentOnlineCount !== count) changed = true;
    s.currentOnlineCount = count;
    s.status = count > 0 ? "online" : "offline";
  });

  if (changed) await saveStore(data);
}

async function reconcileSupabaseAssignments() {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: running, error } = await admin
    .from("assignments")
    .select("id,streamer_id,agent_id,browser_slot_id,status")
    .eq("status", "running");
  if (error || !running || running.length === 0) return;

  const agentPkIds = [...new Set(running.map((r) => r.agent_id as string))];
  const slotPkIds = [...new Set(running.map((r) => r.browser_slot_id as string))];
  const { data: agents } = await admin
    .from("agents")
    .select("id,agent_id")
    .in("id", agentPkIds);
  const { data: slots } = await admin
    .from("browser_slots")
    .select("id,browser_id")
    .in("id", slotPkIds);

  const agentIdMap = new Map((agents || []).map((a) => [a.id as string, a.agent_id as string]));
  const browserIdMap = new Map((slots || []).map((s) => [s.id as string, s.browser_id as string]));
  const statuses = await listAgentBrowserStatuses();
  const connectedMap = new Map(
    statuses.map((s) => [`${s.agentId}:${s.browserId}`, s.connected]),
  );

  const toRelease = running.filter((r) => {
    const aid = agentIdMap.get(r.agent_id as string);
    const bid = browserIdMap.get(r.browser_slot_id as string);
    if (!aid || !bid) return true;
    return !connectedMap.get(`${aid}:${bid}`);
  });

  for (const r of toRelease) {
    await admin
      .from("assignments")
      .update({ status: "released" })
      .eq("id", r.id as string);
    await admin
      .from("browser_slots")
      .update({ state: "idle", current_streamer_id: null })
      .eq("id", r.browser_slot_id as string);
  }

  const { data: streamers } = await admin.from("streamers").select("id");
  for (const s of streamers || []) {
    const sid = s.id as string;
    const { count } = await admin
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("streamer_id", sid)
      .eq("status", "running");
    const current = count || 0;
    await admin
      .from("streamers")
      .update({
        current_online_count: current,
        status: current > 0 ? "online" : "offline",
      })
      .eq("id", sid);
  }
}

export async function listStreamers() {
  const admin = getSupabaseAdmin();
  if (admin) {
    await reconcileSupabaseAssignments();
    const { data, error } = await admin
      .from("streamers")
      .select(
        "id,name,live_url,channel_id,target_online_count,current_online_count,status",
      )
      .order("created_at", { ascending: true });
    if (!error && data) {
      return data.map((s) => ({
        id: s.id as string,
        name: s.name as string,
        liveUrl: s.live_url as string,
        channelId: s.channel_id as string,
        targetOnlineCount: Number(s.target_online_count) || 0,
        currentOnlineCount: Number(s.current_online_count) || 0,
        status: (s.status as "online" | "offline") || "offline",
      }));
    }
  }

  const data = await readStore();
  await reconcileJsonAssignments(data);
  return data.streamers;
}

export async function addStreamer(input: {
  name: string;
  liveUrl: string;
  channelId: string;
  targetOnlineCount: number;
}) {
  const name = input.name.trim();
  const liveUrl = input.liveUrl.trim();
  const channelId = input.channelId.trim();
  const targetOnlineCount = Math.max(1, Math.min(10, Math.floor(input.targetOnlineCount)));

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: inserted, error } = await admin
      .from("streamers")
      .insert({
        name,
        live_url: liveUrl,
        channel_id: channelId,
        target_online_count: targetOnlineCount,
        current_online_count: 0,
        status: "offline",
      })
      .select("id")
      .limit(1);
    if (!error) {
      await writeOperationLog({
        module: "主播设置",
        action: "新增主播",
        detail: `新增主播 ${name}(${channelId})`,
        operator: "ytadmin",
        level: "info",
        meta: { streamerId: (inserted?.[0]?.id as string) || "", name, channelId },
      });
      return { ok: true as const };
    }
  }

  const data = await readStore();
  data.streamers.push({
    id: newId("s"),
    name,
    liveUrl,
    channelId,
    targetOnlineCount,
    currentOnlineCount: 0,
    status: "offline",
  });
  await saveStore(data);
  await writeOperationLog({
    module: "主播设置",
    action: "新增主播",
    detail: `新增主播 ${name}(${channelId})`,
    operator: "ytadmin",
    level: "info",
    meta: { name, channelId },
  });
  return { ok: true as const };
}

export async function removeStreamer(id: string) {
  const admin = getSupabaseAdmin();
  if (admin) {
    await admin.from("streamers").delete().eq("id", id);
    await writeOperationLog({
      module: "主播设置",
      action: "删除主播",
      detail: `删除主播 ${id}`,
      operator: "ytadmin",
      level: "warning",
      meta: { streamerId: id },
    });
    return;
  }

  const data = await readStore();
  data.streamers = data.streamers.filter((s) => s.id !== id);
  data.assignments = data.assignments.filter((a) => a.streamerId !== id);
  data.commands = data.commands.filter((c) => c.streamerId !== id);
  await saveStore(data);
  await writeOperationLog({
    module: "主播设置",
    action: "删除主播",
    detail: `删除主播 ${id}`,
    operator: "ytadmin",
    level: "warning",
    meta: { streamerId: id },
  });
}

export async function markCommandResult(input: {
  commandId: string;
  success: boolean;
  message?: string;
}) {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: rows, error: rowError } = await admin
      .from("commands")
      .select(
        "id,command_id,agent_id,browser_slot_id,streamer_id,type,payload,message",
      )
      .eq("command_id", input.commandId)
      .limit(1);
    const row = rows?.[0];
    if (!rowError && row) {
      const { data: agentRows } = await admin
        .from("agents")
        .select("name,agent_id")
        .eq("id", row.agent_id as string)
        .limit(1);
      const { data: slotRows } = await admin
        .from("browser_slots")
        .select("name,browser_id")
        .eq("id", row.browser_slot_id as string)
        .limit(1);
      const agentName = (agentRows?.[0]?.name as string) || "";
      const browserName = (slotRows?.[0]?.name as string) || "";
      const agentLabel = agentName || ((agentRows?.[0]?.agent_id as string) || "");
      const browserLabel = browserName || ((slotRows?.[0]?.browser_id as string) || "");

      await admin
        .from("commands")
        .update({
          status: input.success ? "done" : "failed",
          message: input.message || "",
        })
        .eq("id", row.id as string);

      if (!input.success && (row.type as string) === "open_stream") {
        const root = retryRoot(row.command_id as string);
        const attempt = retryAttemptFromMessage(row.message as string);
        if (attempt < COMMAND_RETRY_MAX) {
          const nextAttempt = attempt + 1;
          const retryCommandId = `${root}::r${nextAttempt}`;
          await admin.from("commands").upsert(
            {
              command_id: retryCommandId,
              agent_id: row.agent_id,
              browser_slot_id: row.browser_slot_id,
              streamer_id: row.streamer_id,
              type: row.type,
              payload: row.payload || {},
              status: "pending",
              message: `retry-root:${root};attempt:${nextAttempt}`,
            },
            { onConflict: "command_id" },
          );
        }
      }

      await writeOperationLog({
        module: "调度",
        action: "命令回执",
        detail: `program=${agentLabel || "-"}, browser=${browserLabel || "-"}, command=${input.commandId}, success=${input.success}, message=${input.message || ""}`,
        operator: "agent",
        level: input.success ? "info" : "error",
        meta: { commandId: input.commandId, success: input.success },
      });
      return { ok: true as const };
    }
  }

  const data = await readStore();
  const cmd = data.commands.find((c) => c.id === input.commandId);
  if (!cmd) return { ok: false as const, error: "command not found" };
  const statusMap = new Map(
    (await listAgentBrowserStatuses()).map((s) => [
      `${s.agentId}:${s.browserId}`,
      {
        agentName: (s as { agentName?: string }).agentName || s.agentId,
        browserName:
          (s as { browserName?: string }).browserName || s.browserId,
      },
    ]),
  );
  const labels = statusMap.get(`${cmd.agentId}:${cmd.browserId}`);
  const root = retryRoot(cmd.id);
  const attempt = retryAttemptFromMessage(cmd.message);
  cmd.status = input.success ? "done" : "failed";
  cmd.message = input.message || "";
  cmd.updatedAt = new Date().toISOString();
  if (!input.success && cmd.type === "open_stream" && attempt < COMMAND_RETRY_MAX) {
    const nextAttempt = attempt + 1;
    data.commands.push({
      id: `${root}::r${nextAttempt}`,
      agentId: cmd.agentId,
      browserId: cmd.browserId,
      type: cmd.type,
      streamerId: cmd.streamerId,
      payload: cmd.payload,
      status: "pending",
      message: `retry-root:${root};attempt:${nextAttempt}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  await saveStore(data);
  await writeOperationLog({
    module: "调度",
    action: "命令回执",
    detail: `program=${labels?.agentName || cmd.agentId || "-"}, browser=${labels?.browserName || cmd.browserId || "-"}, command=${input.commandId}, success=${input.success}, message=${input.message || ""}`,
    operator: "agent",
    level: input.success ? "info" : "error",
    meta: { commandId: input.commandId, success: input.success },
  });
  return { ok: true as const };
}

export async function pollAgentCommands(agentId: string) {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: agents, error: agentError } = await admin
      .from("agents")
      .select("id")
      .eq("agent_id", agentId)
      .limit(1);
    if (!agentError && agents && agents.length > 0) {
      const agentPk = agents[0].id as string;
      const sentDeadline = new Date(
        Date.now() - COMMAND_SENT_TIMEOUT_MS,
      ).toISOString();
      await admin
        .from("commands")
        .update({ status: "pending" })
        .eq("agent_id", agentPk)
        .eq("status", "sent")
        .lt("updated_at", sentDeadline);

      const { data: commands, error: cmdError } = await admin
        .from("commands")
        .select(
          "id,command_id,type,payload,streamer_id,browser_slot_id,agent_id,status",
        )
        .eq("agent_id", agentPk)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);

      if (!cmdError && commands && commands.length > 0) {
        const slotIds = commands.map((c) => c.browser_slot_id as string);
        const { data: slots } = await admin
          .from("browser_slots")
          .select("id,browser_id")
          .in("id", slotIds);
        const slotMap = new Map(
          (slots || []).map((s) => [s.id as string, s.browser_id as string]),
        );

        await admin
          .from("commands")
          .update({ status: "sent" })
          .in(
            "id",
            commands.map((c) => c.id as string),
          );

        return commands.map((c) => ({
          id: c.command_id as string,
          agentId,
          browserId: slotMap.get(c.browser_slot_id as string) || "",
          type: c.type as "open_stream" | "go_home",
          streamerId: (c.streamer_id as string) || "",
          payload: (c.payload as { url: string }) || { url: "" },
          status: "sent" as const,
          createdAt: "",
          updatedAt: "",
        }));
      }
      return [];
    }
  }

  const data = await readStore();
  const sentDeadlineMs = Date.now() - COMMAND_SENT_TIMEOUT_MS;
  data.commands.forEach((c) => {
    if (
      c.agentId === agentId &&
      c.status === "sent" &&
      new Date(c.updatedAt).getTime() < sentDeadlineMs
    ) {
      c.status = "pending";
      c.updatedAt = new Date().toISOString();
    }
  });
  const now = new Date().toISOString();
  const pending = data.commands.filter(
    (c) => c.agentId === agentId && c.status === "pending",
  );
  pending.forEach((c) => {
    c.status = "sent";
    c.updatedAt = now;
  });
  if (pending.length > 0) await saveStore(data);
  return pending;
}

export async function goOnline(streamerId: string) {
  const admin = getSupabaseAdmin();
  if (admin) {
    await reconcileSupabaseAssignments();
    const { data: streamerRows } = await admin
      .from("streamers")
      .select("id,live_url,target_online_count,current_online_count")
      .eq("id", streamerId)
      .limit(1);
    if (!streamerRows || streamerRows.length === 0) {
      return { ok: false as const, error: "streamer not found" };
    }
    const streamer = streamerRows[0];

    const { data: runningRows } = await admin
      .from("assignments")
      .select("id")
      .eq("streamer_id", streamerId)
      .eq("status", "running");
    const current = (runningRows || []).length;
    const needed = Math.max(
      0,
      (Number(streamer.target_online_count) || 0) - current,
    );
    if (needed === 0) {
      await admin
        .from("streamers")
        .update({
          current_online_count: current,
          status: current > 0 ? "online" : "offline",
        })
        .eq("id", streamerId);
      return { ok: true as const, allocated: 0, currentOnlineCount: current };
    }

    const { data: onlineAgents } = await admin
      .from("agents")
      .select("id")
      .eq("status", "online");
    const onlineAgentIds = (onlineAgents || []).map((a) => a.id as string);
    if (onlineAgentIds.length === 0) {
      return { ok: true as const, allocated: 0, currentOnlineCount: current };
    }

    const { data: freeSlots } = await admin
      .from("browser_slots")
      .select("id,agent_id,browser_id")
      .in("agent_id", onlineAgentIds)
      .eq("connected", true)
      .eq("state", "idle")
      .limit(needed);
    const selected = freeSlots || [];

    for (const slot of selected) {
      const commandId = newId("cmd");
      const { data: cmdRows } = await admin
        .from("commands")
        .insert({
          command_id: commandId,
          agent_id: slot.agent_id,
          browser_slot_id: slot.id,
          streamer_id: streamerId,
          type: "open_stream",
          payload: { url: streamer.live_url as string },
          status: "pending",
        })
        .select("id")
        .limit(1);
      const commandPk = cmdRows?.[0]?.id as string;

      await admin.from("assignments").insert({
        streamer_id: streamerId,
        agent_id: slot.agent_id,
        browser_slot_id: slot.id,
        command_id: commandPk,
        status: "running",
      });
      await admin
        .from("browser_slots")
        .update({
          state: "busy",
          current_streamer_id: streamerId,
        })
        .eq("id", slot.id);
    }

    const nextCurrent = current + selected.length;
    await admin
      .from("streamers")
      .update({
        current_online_count: nextCurrent,
        status: nextCurrent > 0 ? "online" : "offline",
      })
      .eq("id", streamerId);
    await writeOperationLog({
      module: "主播设置",
      action: "主播上线",
      detail: `streamer=${streamerId}, allocated=${selected.length}, current=${nextCurrent}`,
      operator: "ytadmin",
      level: selected.length > 0 ? "info" : "warning",
      meta: { streamerId, allocated: selected.length, currentOnlineCount: nextCurrent },
    });
    return {
      ok: true as const,
      allocated: selected.length,
      currentOnlineCount: nextCurrent,
    };
  }

  const data = await readStore();
  await reconcileJsonAssignments(data);
  const streamer = data.streamers.find((s) => s.id === streamerId);
  if (!streamer) return { ok: false as const, error: "streamer not found" };

  const aliveAssignments = data.assignments.filter(
    (a) => a.streamerId === streamerId && a.status === "running",
  );
  const current = aliveAssignments.length;
  const needed = Math.max(0, streamer.targetOnlineCount - current);
  if (needed === 0) {
    streamer.currentOnlineCount = current;
    streamer.status = current > 0 ? "online" : "offline";
    await saveStore(data);
    return { ok: true as const, allocated: 0, currentOnlineCount: current };
  }

  const allStatuses = await listAgentBrowserStatuses();
  const busyKeys = new Set(
    data.assignments
      .filter((a) => a.status === "running")
      .map((a) => `${a.agentId}:${a.browserId}`),
  );

  const free = allStatuses.filter((b) => {
    const key = `${b.agentId}:${b.browserId}`;
    return b.connected && !busyKeys.has(key);
  });

  const selected = free.slice(0, needed);
  const now = new Date().toISOString();
  for (const browser of selected) {
    const commandId = newId("cmd");
    data.commands.push({
      id: commandId,
      agentId: browser.agentId,
      browserId: browser.browserId,
      type: "open_stream",
      streamerId,
      payload: { url: streamer.liveUrl },
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    data.assignments.push({
      id: newId("as"),
      streamerId,
      agentId: browser.agentId,
      browserId: browser.browserId,
      commandId,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
  }

  const nextCurrent = current + selected.length;
  streamer.currentOnlineCount = nextCurrent;
  streamer.status = nextCurrent > 0 ? "online" : "offline";
  await saveStore(data);
  await writeOperationLog({
    module: "主播设置",
    action: "主播上线",
    detail: `streamer=${streamerId}, allocated=${selected.length}, current=${nextCurrent}`,
    operator: "ytadmin",
    level: selected.length > 0 ? "info" : "warning",
    meta: { streamerId, allocated: selected.length, currentOnlineCount: nextCurrent },
  });
  return {
    ok: true as const,
    allocated: selected.length,
    currentOnlineCount: nextCurrent,
  };
}

export async function goOffline(streamerId: string) {
  const admin = getSupabaseAdmin();
  if (admin) {
    await reconcileSupabaseAssignments();
    const { data: streamerRows } = await admin
      .from("streamers")
      .select("id")
      .eq("id", streamerId)
      .limit(1);
    if (!streamerRows || streamerRows.length === 0) {
      return { ok: false as const, error: "streamer not found" };
    }

    const { data: running } = await admin
      .from("assignments")
      .select("id,agent_id,browser_slot_id")
      .eq("streamer_id", streamerId)
      .eq("status", "running");

    for (const assignment of running || []) {
      await admin.from("commands").insert({
        command_id: newId("cmd"),
        agent_id: assignment.agent_id,
        browser_slot_id: assignment.browser_slot_id,
        streamer_id: streamerId,
        type: "go_home",
        payload: { url: "https://www.youtube.com/" },
        status: "pending",
      });

      await admin
        .from("browser_slots")
        .update({ state: "idle", current_streamer_id: null })
        .eq("id", assignment.browser_slot_id as string);
      await admin
        .from("assignments")
        .update({ status: "released" })
        .eq("id", assignment.id as string);
    }

    await admin
      .from("streamers")
      .update({ current_online_count: 0, status: "offline" })
      .eq("id", streamerId);
    await writeOperationLog({
      module: "主播设置",
      action: "主播下线",
      detail: `streamer=${streamerId}, released=${(running || []).length}`,
      operator: "ytadmin",
      level: "info",
      meta: { streamerId, released: (running || []).length },
    });
    return { ok: true as const, released: (running || []).length };
  }

  const data = await readStore();
  await reconcileJsonAssignments(data);
  const streamer = data.streamers.find((s) => s.id === streamerId);
  if (!streamer) return { ok: false as const, error: "streamer not found" };

  const running = data.assignments.filter(
    (a) => a.streamerId === streamerId && a.status === "running",
  );
  const now = new Date().toISOString();

  running.forEach((assignment) => {
    data.commands.push({
      id: newId("cmd"),
      agentId: assignment.agentId,
      browserId: assignment.browserId,
      type: "go_home",
      streamerId,
      payload: { url: "https://www.youtube.com/" },
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    assignment.status = "released";
    assignment.updatedAt = now;
  });

  streamer.currentOnlineCount = 0;
  streamer.status = "offline";
  await saveStore(data);
  await writeOperationLog({
    module: "主播设置",
    action: "主播下线",
    detail: `streamer=${streamerId}, released=${running.length}`,
    operator: "ytadmin",
    level: "info",
    meta: { streamerId, released: running.length },
  });
  return { ok: true as const, released: running.length };
}

export async function listRecentCommandTasks(limit = 300): Promise<CommandTaskView[]> {
  const cutoff = tasksRetentionCutoffIso();
  const admin = getSupabaseAdmin();
  if (admin) {
    await cleanupOldCommandTasks();
    const { data: rows, error } = await admin
      .from("commands")
      .select(
        "command_id,type,status,message,created_at,updated_at,streamer_id,agent_id,browser_slot_id",
      )
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && rows) {
      const streamerIds = [...new Set(rows.map((r) => r.streamer_id as string).filter(Boolean))];
      const agentIds = [...new Set(rows.map((r) => r.agent_id as string).filter(Boolean))];
      const slotIds = [...new Set(rows.map((r) => r.browser_slot_id as string).filter(Boolean))];

      const { data: streamers } = streamerIds.length
        ? await admin.from("streamers").select("id,name").in("id", streamerIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const { data: agents } = agentIds.length
        ? await admin.from("agents").select("id,agent_id,name").in("id", agentIds)
        : { data: [] as Array<{ id: string; agent_id: string; name: string }> };
      const { data: slots } = slotIds.length
        ? await admin
            .from("browser_slots")
            .select("id,browser_id,name")
            .in("id", slotIds)
        : { data: [] as Array<{ id: string; browser_id: string; name: string }> };

      const streamerMap = new Map((streamers || []).map((s) => [s.id as string, s.name as string]));
      const agentMap = new Map((agents || []).map((a) => [a.id as string, a.agent_id as string]));
      const agentNameMap = new Map((agents || []).map((a) => [a.id as string, (a.name as string) || ""]));
      const slotMap = new Map((slots || []).map((s) => [s.id as string, s.browser_id as string]));
      const slotNameMap = new Map((slots || []).map((s) => [s.id as string, (s.name as string) || ""]));

      return rows.map((r) => {
        const commandId = (r.command_id as string) || "";
        return {
          commandId,
          type: (r.type as "open_stream" | "go_home") || "open_stream",
          status:
            (r.status as "pending" | "sent" | "done" | "failed") || "pending",
          message: (r.message as string) || "",
          agentId: agentMap.get(r.agent_id as string) || "",
          agentName: agentNameMap.get(r.agent_id as string) || "",
          browserId: slotMap.get(r.browser_slot_id as string) || "",
          browserName: slotNameMap.get(r.browser_slot_id as string) || "",
          streamerId: (r.streamer_id as string) || "",
          streamerName: streamerMap.get(r.streamer_id as string) || "",
          retryAttempt: retryAttemptFromCommandId(commandId),
          createdAt: (r.created_at as string) || "",
          updatedAt: (r.updated_at as string) || "",
        };
      });
    }
  }

  const data = await readStore();
  const nextCommands = data.commands.filter((c) => c.createdAt >= cutoff);
  if (nextCommands.length !== data.commands.length) {
    data.commands = nextCommands;
    await saveStore(data);
  }
  const streamerMap = new Map(data.streamers.map((s) => [s.id, s.name]));
  const statusMap = new Map(
    (await listAgentBrowserStatuses()).map((s) => [
      `${s.agentId}:${s.browserId}`,
      {
        agentName: (s as { agentName?: string }).agentName || "",
        browserName: (s as { browserName?: string }).browserName || "",
      },
    ]),
  );
  return [...nextCommands]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
    .map((c) => ({
      commandId: c.id,
      type: c.type,
      status: c.status,
      message: c.message || "",
      agentId: c.agentId,
      agentName: statusMap.get(`${c.agentId}:${c.browserId}`)?.agentName || "",
      browserId: c.browserId,
      browserName: statusMap.get(`${c.agentId}:${c.browserId}`)?.browserName || "",
      streamerId: c.streamerId,
      streamerName: streamerMap.get(c.streamerId) || "",
      retryAttempt: retryAttemptFromCommandId(c.id),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
}

