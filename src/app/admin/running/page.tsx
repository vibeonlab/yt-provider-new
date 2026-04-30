"use client";

import { useEffect, useMemo, useState } from "react";

type BrowserStatus = {
  id: string;
  name: string;
  agentId?: string;
  agentName?: string;
  agentStatus?: "online" | "offline";
  browserName?: string;
  wsUrl: string;
  connected: boolean;
  tabsCount: number;
  activeUrl: string;
  tabs?: string[];
};

export default function RunningPage() {
  const [items, setItems] = useState<BrowserStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchStatuses() {
    const res = await fetch("/api/browsers/status", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; data: BrowserStatus[] };
    setItems(data.data ?? []);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchStatuses();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      const res = await fetch("/api/browsers/status", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; data: BrowserStatus[] };
      if (!active) return;
      setItems(data.data ?? []);
      setLoading(false);
    };

    void fetchData();
    const timer = window.setInterval(fetchData, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const programItems = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        programName: string;
        connected: boolean;
        tabs: string[];
      }
    >();

    items.forEach((item) => {
      const key = item.agentId || item.agentName || item.name || item.id;
      const current = groups.get(key);
      const nextTabs = item.tabs && item.tabs.length > 0 ? item.tabs : [];
      if (!current) {
        groups.set(key, {
          id: key,
          programName: item.agentName || item.name || "-",
          connected: item.connected || item.agentStatus === "online",
          tabs: [...nextTabs],
        });
        return;
      }
      current.connected =
        current.connected || item.connected || item.agentStatus === "online";
      current.tabs.push(...nextTabs);
    });

    return Array.from(groups.values());
  }, [items]);

  return (
    <section>
      <h2 className="text-2xl font-semibold text-zinc-900">运行面板</h2>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          显示每个浏览器连接状态、Tab 数量、当前访问地址
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className={refreshing ? "animate-spin" : ""}
          >
            <path
              d="M20 11A8 8 0 1 0 12 20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M20 4V11H13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{refreshing ? "刷新中..." : "刷新"}</span>
        </button>
      </div>

      {loading ? (
        <div className="mt-6 text-sm text-zinc-500">加载中...</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4">
          {programItems.map((p) => (
            <article
              key={p.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-zinc-900">{p.programName}</h3>
                <span
                  className={[
                    "text-xs px-2 py-1 rounded-full",
                    p.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-zinc-100 text-zinc-600",
                  ].join(" ")}
                >
                  {p.connected ? "已连接" : "未连接"}
                </span>
              </div>

              <div className="mt-3 text-sm text-zinc-600">
                <div className="space-y-2">
                  {p.tabs.length > 0 ? (
                    p.tabs.map((tab, idx) => (
                      <div
                        key={`${p.id}-tab-${idx + 1}`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 break-all"
                      >
                        <span
                          className={[
                            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                            idx % 4 === 0
                              ? "bg-blue-100 text-blue-700"
                              : idx % 4 === 1
                                ? "bg-emerald-100 text-emerald-700"
                                : idx % 4 === 2
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-violet-100 text-violet-700",
                          ].join(" ")}
                        >
                          {`#${idx + 1}`}
                        </span>
                        <span>{tab}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-400">未上报标签明细</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

