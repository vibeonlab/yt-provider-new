import type { Server } from "node:http";
import { parse } from "node:url";
import { WebSocketServer } from "ws";
import { setAgentSocket } from "@/lib/server/agentWsHub";
import { flushAgentCommandSockets } from "@/lib/server/agentWsFlush";
import { updateHeartbeat, reportAgentStatus } from "@/lib/server/agentStore";
import { incrementWsRequest } from "@/lib/server/agentRequestCounters";

type ClientMessage =
  | { type: "heartbeat" }
  | {
      type: "presence";
      browsers: Array<{
        browserId: string;
        name: string;
        wsUrl: string;
        connected: boolean;
        tabsCount: number;
        activeUrl: string;
        tabs?: string[];
      }>;
    };

export function attachAgentWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    try {
      const pathname = parse(req.url || "").pathname || "";
      if (pathname !== "/api/agents/ws") {
        socket.destroy();
        return;
      }
      const agentId = new URL(req.url || "", "http://localhost").searchParams
        .get("agentId")
        ?.trim();
      if (!agentId) {
        socket.destroy();
        return;
      }

      /** 关键：去掉 Node http.Server 在 upgrade 后仍可能继承到 socket 上的 timeout，
       * 否则一些 Node 版本会因 keepAliveTimeout/headersTimeout 在握手后立即踢断（1006）。 */
      try {
        socket.setTimeout(0);
        socket.setKeepAlive(true, 30_000);
        socket.setNoDelay(true);
      } catch {
        /* ignore */
      }

      console.log(
        `[agent-ws] upgrade accepted agentId=${agentId} remote=${socket.remoteAddress}:${socket.remotePort}`,
      );

      wss.handleUpgrade(req, socket, head, (ws) => {
        void handleNewAgentSocket(ws, agentId);
      });
    } catch (err) {
      console.error("[agent-ws] upgrade error", err);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
  });
}

async function handleNewAgentSocket(
  ws: import("ws").WebSocket,
  agentId: string,
) {
  setAgentSocket(agentId, ws);

  ws.on("close", (code, reason) => {
    console.log(
      `[agent-ws] close agentId=${agentId} code=${code} reason=${reason?.toString() || ""}`,
    );
  });
  ws.on("error", (err) => {
    console.error(`[agent-ws] error agentId=${agentId}`, err);
  });

  ws.on("message", (raw) => {
    incrementWsRequest();
    void (async () => {
      try {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        if (msg.type === "heartbeat") {
          await updateHeartbeat(agentId);
          return;
        }
        if (msg.type === "presence" && Array.isArray(msg.browsers)) {
          await updateHeartbeat(agentId);
          await reportAgentStatus({ agentId, browsers: msg.browsers });
        }
      } catch {
        /* ignore malformed */
      }
    })();
  });

  try {
    ws.send(JSON.stringify({ type: "welcome", agentId }));
  } catch (err) {
    console.error(`[agent-ws] welcome send failed agentId=${agentId}`, err);
  }

  try {
    await flushAgentCommandSockets([agentId]);
  } catch (err) {
    console.error(`[agent-ws] flush failed agentId=${agentId}`, err);
  }
}
