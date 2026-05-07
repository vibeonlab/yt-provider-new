import http from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachAgentWebSocketServer } from "@/lib/server/agentWsSocket";

void (async function main() {
  /** 仅当显式 development 时为开发模式；其余一律 production（避免 PM2 未设 NODE_ENV 或误设时仍注入 HMR） */
  if (process.env.NODE_ENV !== "development") {
    process.env.NODE_ENV = "production";
  }
  const dev = process.env.NODE_ENV === "development";
  const hostname = process.env.LISTEN_HOST || "0.0.0.0";
  const port = parseInt(process.env.PORT || "3000", 10);

  console.log(
    `[server] Next dev=${dev} NODE_ENV=${process.env.NODE_ENV} — 若浏览器仍请求 /_next/webpack-hmr，说明未用本进程或需重新 build + 重启 PM2`,
  );

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
