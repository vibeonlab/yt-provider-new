import type { Server } from "node:http";
import { parse } from "node:url";
import { WebSocketServer } from "ws";
import { setAgentSocket } from "@/lib/server/agentWsHub";
import { flushAgentCommandSockets } from "@/lib/server/agentWsFlush";
import { updateHeartbeat, reportAgentStatus } from "@/lib/server/agentStore";

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

      wss.handleUpgrade(req, socket, head, (ws) => {
        void handleNewAgentSocket(ws, agentId);
      });
    } catch {
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

  ws.on("message", (raw) => {
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
  } catch {
    /* ignore */
  }

  await flushAgentCommandSockets([agentId]);
}
