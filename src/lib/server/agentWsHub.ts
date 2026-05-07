import type { WebSocket } from "ws";

/**
 * 每个 agentId 仅保留一条连接，避免多次 poll 把同批命令消费掉。
 *
 * 重要：必须挂在 globalThis 上，确保 server.ts（tsx 加载）与 Next.js
 * 路由加载到的 agentWsHub 模块共享同一份 Map；否则 WS upgrade 注册的 socket
 * 与 API 路由 notifyAgentsOfNewCommands 时读到的 Map 不一致，命令会一直停留 pending。
 */
const globalKey = "__yt_agent_ws_sockets__";
type GlobalWithHub = typeof globalThis & {
  [globalKey]?: Map<string, WebSocket>;
};
const globalRef = globalThis as GlobalWithHub;
if (!globalRef[globalKey]) {
  globalRef[globalKey] = new Map<string, WebSocket>();
}
const sockets: Map<string, WebSocket> = globalRef[globalKey] as Map<
  string,
  WebSocket
>;

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
