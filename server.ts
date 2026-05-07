import http from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachAgentWebSocketServer } from "@/lib/server/agentWsSocket";

void (async function main() {
  const dev = process.env.NODE_ENV !== "production";
  const hostname = process.env.LISTEN_HOST || "0.0.0.0";
  const port = parseInt(process.env.PORT || "3000", 10);

  const app = next({ dev });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url || "", true);
      void handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Request error", err);
      if (!res.headersSent) res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  attachAgentWebSocketServer(server);

  server.listen(port, hostname, () => {
    console.log(
      `> Ready on http://${hostname}:${port} (agent WebSocket: /api/agents/ws?agentId=...)`,
    );
  });
})();
