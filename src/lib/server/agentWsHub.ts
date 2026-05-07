import type { WebSocket } from "ws";

/** 每个 agentId 仅保留一条连接，避免多次 poll 把同批命令消费掉 */
const sockets = new Map<string, WebSocket>();

export function setAgentSocket(agentId: string, ws: WebSocket) {
  const prev = sockets.get(agentId);
  if (prev && prev !== ws) {
    try {
      prev.close(1000, "replaced");
    } catch {
      /* ignore */
    }
  }
  sockets.set(agentId, ws);
  ws.once("close", () => {
    if (sockets.get(agentId) === ws) sockets.delete(agentId);
  });
}

export function getAgentSocket(agentId: string): WebSocket | undefined {
  return sockets.get(agentId);
}

/** 有新命令入队时唤醒对应代理，通过 WebSocket 推送 */
export function notifyAgentsOfNewCommands(agentIds: Iterable<string>) {
  const unique = [...new Set(agentIds)].map((id) => id.trim()).filter(Boolean);
  if (unique.length === 0) return;
  void import("./agentWsFlush").then(({ flushAgentCommandSockets }) =>
    flushAgentCommandSockets(unique),
  );
}
