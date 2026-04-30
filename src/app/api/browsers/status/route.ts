import { NextResponse } from "next/server";
import { listAgentBrowserStatuses } from "@/lib/server/agentStore";
import { listAgents } from "@/lib/server/agentStore";

export async function GET() {
  const [agentData, agents] = await Promise.all([
    listAgentBrowserStatuses(),
    listAgents(),
  ]);

  const existedAgentIds = new Set(
    agentData
      .map((item) => (item as { agentId?: string }).agentId)
      .filter((id): id is string => !!id),
  );

  const onlineWithoutSlots = agents
    .filter((a) => a.status === "online" && !existedAgentIds.has(a.agentId))
    .map((a) => ({
      id: `${a.agentId}:no-browser`,
      slotId: undefined as string | undefined,
      browserId: "",
      name: a.name,
      agentName: a.name,
      browserName: "",
      wsUrl: "",
      connected: a.status === "online",
      tabsCount: 0,
      activeUrl: "",
      tabs: [] as string[],
      agentId: a.agentId,
      agentStatus: a.status,
      updatedAt: a.updatedAt || a.lastHeartbeatAt || new Date().toISOString(),
    }));

  return NextResponse.json({ ok: true, data: [...agentData, ...onlineWithoutSlots] });
}

