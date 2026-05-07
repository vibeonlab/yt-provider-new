/**
 * 浏览器客户端（Agent）请求计数器。
 *
 * 管理后台顶部展示「HTTP 请求数 / WebSocket 请求数」并提供清零按钮。
 * 仅统计客户端方向的请求（/api/agents/* 与 WS 入站消息），不包含管理员浏览器请求。
 *
 * 必须挂在 globalThis，以避免 server.ts（tsx 加载）与 Next.js 路由
 * 加载该模块时拿到不同实例造成计数被分散到多个对象中。
 */
type CountersSnapshot = {
  http: number;
  ws: number;
  resetAt: string;
  updatedAt: string;
};

const globalKey = "__yt_agent_request_counters__";
type GlobalWithCounters = typeof globalThis & {
  [globalKey]?: CountersSnapshot;
};
const globalRef = globalThis as GlobalWithCounters;
if (!globalRef[globalKey]) {
  const now = new Date().toISOString();
  globalRef[globalKey] = {
    http: 0,
    ws: 0,
    resetAt: now,
    updatedAt: now,
  };
}
const state: CountersSnapshot = globalRef[globalKey] as CountersSnapshot;

export function incrementHttpRequest(): void {
  state.http += 1;
  state.updatedAt = new Date().toISOString();
}

export function incrementWsRequest(): void {
  state.ws += 1;
  state.updatedAt = new Date().toISOString();
}

export function getAgentRequestCounters(): CountersSnapshot {
  return { ...state };
}

export function resetAgentRequestCounters(): CountersSnapshot {
  const now = new Date().toISOString();
  state.http = 0;
  state.ws = 0;
  state.resetAt = now;
  state.updatedAt = now;
  return { ...state };
}
