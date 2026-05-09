import http from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachAgentWebSocketServer } from "@/lib/server/agentWsSocket";
import { autoReplenishOnlineStreamers } from "@/lib/server/schedulerStore";

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

  /**
   * 关键修复：Next.js 16 的 next/dist/server/next.js 中 `getRequestHandler` 会在
   * 第一次 HTTP 请求时调用 `setupWebSocketHandler`，悄悄给我们这台 http.Server
   * 再挂一个 `upgrade` 监听器，并对未匹配到路由的 WS upgrade 调用 `socket.end()`，
   * 直接把我们已升级好的 WebSocket 关掉（症状：握手成功后 ~26ms 出现 1006）。
   *
   * 方案：在 prepare 之后立即把内部 `didWebSocketSetup` 置为 true，让 Next.js
   * 跳过其 upgrade 监听注册，由我们自己的 attachAgentWebSocketServer 全权处理。
   */
  const appAsAny = app as unknown as { didWebSocketSetup?: boolean };
  appAsAny.didWebSocketSetup = true;

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

  /**
   * 双保险：万一未来 Next.js 改名或在别处又挂了 upgrade 监听，
   * 这里把所有非我们 handler 的 upgrade 监听清掉再加回我们的 handler。
   */
  const ourUpgradeListeners = server.listeners("upgrade");
  server.removeAllListeners("upgrade");
  ourUpgradeListeners.forEach((listener) =>
    server.on("upgrade", listener as (...args: unknown[]) => void),
  );

  server.listen(port, hostname, () => {
    console.log(
      `> Ready on http://${hostname}:${port} (agent WebSocket: /api/agents/ws?agentId=...) — upgrade listeners=${server.listenerCount(
        "upgrade",
      )}`,
    );

    /**
     * 定时补足：状态为 online 且 running 数 < 购买人数的主播，各 goOnline 一次。
     * AUTO_REPLENISH_INTERVAL_MS=0 可关闭；默认 30s。
     */
    const replenishMs = parseInt(
      process.env.AUTO_REPLENISH_INTERVAL_MS || "30000",
      10,
    );
    if (Number.isFinite(replenishMs) && replenishMs > 0) {
      const tick = () => {
        void autoReplenishOnlineStreamers()
          .then(({ shortfalls, totalAllocated }) => {
            if (totalAllocated > 0) {
              console.log(
                `[auto-replenish] shortfalls=${shortfalls} allocated=${totalAllocated}`,
              );
            }
          })
          .catch((err) => console.error("[auto-replenish]", err));
      };
      setInterval(tick, replenishMs);
      setTimeout(tick, 15_000);
      console.log(
        `[server] auto-replenish online streamers every ${replenishMs}ms (set AUTO_REPLENISH_INTERVAL_MS=0 to disable)`,
      );
    }
  });
})();
