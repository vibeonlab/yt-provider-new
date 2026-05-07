import { WebSocket } from "ws";
import { getAgentSocket } from "@/lib/server/agentWsHub";
import { pollAgentCommands } from "@/lib/server/schedulerStore";

export async function flushAgentCommandSockets(agentIds: string[]) {
  for (const agentId of agentIds) {
    const ws = getAgentSocket(agentId);
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    try {
      const data = await pollAgentCommands(agentId);
      if (data.length === 0) continue;
      ws.send(JSON.stringify({ type: "commands", data }));
    } catch {
      /* ignore */
    }
  }
}
