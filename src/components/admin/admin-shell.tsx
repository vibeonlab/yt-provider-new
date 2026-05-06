"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { roboto } from "@/lib/fonts";

const navItems = [
  {
    href: "/admin/running",
    label: "运行面板",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 20H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admin/streamers",
    label: "主播设置",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M4 20C5.5 16.5 8.2 14 12 14C15.8 14 18.5 16.5 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admin/tasks",
    label: "任务明细",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 9H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 13H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admin/logs",
    label: "日志",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 7H16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 12H16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 17H13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    href: "/admin/system",
    label: "系统设置",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M19.4 15A1.7 1.7 0 0 0 19.7 16.9L19.8 17.1A2 2 0 0 1 17.1 19.8L16.9 19.7A1.7 1.7 0 0 0 15 19.4A1.7 1.7 0 0 0 14 21V21.3A2 2 0 0 1 10 21.3V21A1.7 1.7 0 0 0 9 19.4A1.7 1.7 0 0 0 7.1 19.7L6.9 19.8A2 2 0 0 1 4.2 17.1L4.3 16.9A1.7 1.7 0 0 0 4.6 15A1.7 1.7 0 0 0 3 14H2.7A2 2 0 0 1 2.7 10H3A1.7 1.7 0 0 0 4.6 9A1.7 1.7 0 0 0 4.3 7.1L4.2 6.9A2 2 0 0 1 6.9 4.2L7.1 4.3A1.7 1.7 0 0 0 9 4.6A1.7 1.7 0 0 0 10 3V2.7A2 2 0 0 1 14 2.7V3A1.7 1.7 0 0 0 15 4.6A1.7 1.7 0 0 0 16.9 4.3L17.1 4.2A2 2 0 0 1 19.8 6.9L19.7 7.1A1.7 1.7 0 0 0 19.4 9A1.7 1.7 0 0 0 21 10H21.3A2 2 0 0 1 21.3 14H21A1.7 1.7 0 0 0 19.4 15Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type ToastPayload = {
  variant: "success" | "error" | "warning";
  message: string;
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [resourceStats, setResourceStats] = useState({
    connectedTabs: 0,
    occupiedTabs: 0,
    availableTabs: 0,
  });
  /** 最近一次成功下发的目标模式（用于开关与标签展示）。 */
  const [powerMode, setPowerMode] = useState<"low" | "normal">("normal");
  const [cacheBusy, setCacheBusy] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const toastDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(payload: ToastPayload, durationMs = 4500) {
    if (toastDismissRef.current) {
      clearTimeout(toastDismissRef.current);
      toastDismissRef.current = null;
    }
    setToast(payload);
    toastDismissRef.current = setTimeout(() => {
      setToast(null);
      toastDismissRef.current = null;
    }, durationMs);
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      const [browsersRes, streamersRes] = await Promise.all([
        fetch("/api/browsers/status", { cache: "no-store" }),
        fetch("/api/streamers", { cache: "no-store" }),
      ]);
      const streamersData = (await streamersRes.json()) as {
        ok: boolean;
        data: Array<{
          currentOnlineCount: number;
        }>;
      };
      const browsersData = (await browsersRes.json()) as {
        ok: boolean;
        data: Array<{
          agentId?: string;
          browserId?: string;
          connected?: boolean;
        }>;
      };
      if (!active) return;

      const rows = browsersData.data ?? [];
      const connectedTabs = rows.filter(
        (r) => r.connected && !!r.agentId && !!r.browserId,
      ).length;
      const occupiedTabs = (streamersData.data ?? []).reduce(
        (sum, s) => sum + (Number(s.currentOnlineCount) || 0),
        0,
      );
      setResourceStats({
        connectedTabs,
        occupiedTabs,
        availableTabs: Math.max(0, connectedTabs - occupiedTabs),
      });
    };
    void loadStats();
    const timer = window.setInterval(() => {
      void loadStats();
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastDismissRef.current) clearTimeout(toastDismissRef.current);
    };
  }, []);

  async function broadcastClearCache() {
    if (cacheBusy) return;
    setCacheBusy(true);
    try {
      const res = await fetch("/api/admin/agent-browser-control", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_disk_cache" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        data?: { enqueued?: number };
        error?: string;
      };
      if (!res.ok || !data.ok) {
        showToast({
          variant: "error",
          message: data.error || `请求失败（${res.status}）`,
        });
        return;
      }
      const n = data.data?.enqueued ?? 0;
      if (n > 0) {
        showToast({
          variant: "success",
          message: `已向 ${n} 个浏览器下发清理磁盘缓存指令；客户端收到后即执行（仅 DiskCache，Cookie 与登录保留）。`,
        });
      } else {
        showToast({
          variant: "warning",
          message:
            "当前没有可下发指令的浏览器记录（与运行面板同源列表为空）。请打开运行面板确认是否出现该浏览器，并检查 Agent 是否已向本服务上报状态。",
        });
      }
    } finally {
      setCacheBusy(false);
    }
  }

  async function applyPowerMode(next: "low" | "normal") {
    if (powerBusy || next === powerMode) return;
    setPowerBusy(true);
    try {
      const res = await fetch("/api/admin/agent-browser-control", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_power_mode", mode: next }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        data?: { enqueued?: number };
        error?: string;
      };
      if (!res.ok || !data.ok) {
        showToast({
          variant: "error",
          message: data.error || `切换失败（${res.status}）`,
        });
        return;
      }
      const n = data.data?.enqueued ?? 0;
      if (n > 0) {
        setPowerMode(next);
        showToast({
          variant: "success",
          message:
            next === "low"
              ? `已向 ${n} 个浏览器下发低内存模式指令；客户端收到后将对全部标签生效。`
              : `已向 ${n} 个浏览器下发正常模式指令；客户端收到后将对全部标签生效。`,
        });
      } else {
        showToast({
          variant: "warning",
          message:
            "当前没有可下发指令的浏览器记录（与运行面板同源列表为空）。请打开运行面板确认是否出现该浏览器，并检查 Agent 是否已向本服务上报状态。",
        });
      }
    } finally {
      setPowerBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-zinc-50 flex">
      <aside className="w-64 border-r border-zinc-200 bg-white p-4 flex flex-col">
        <div className="mb-6 h-12 flex items-center gap-2">
          <span className="h-7 w-7 rounded-md bg-[#ff0000] text-white flex items-center justify-center">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect x="3" y="6.5" width="18" height="11" rx="3" fill="white" />
              <path d="M11 9.6L15.2 12L11 14.4V9.6Z" fill="#ff0000" />
            </svg>
          </span>
          <h1 className={`text-lg font-semibold text-zinc-900 ${roboto.className}`}>
            <span className="text-[#ff0000]">Youtube</span> Manager
          </h1>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex h-10 items-center rounded-lg px-3 text-sm font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30",
                  active
                    ? "bg-black text-white"
                    : "text-zinc-700 hover:bg-zinc-100 focus-visible:bg-black focus-visible:text-white",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

      </aside>

      <div className="flex-1 min-w-0">
        <header className="relative flex min-h-14 items-center border-b border-zinc-200 bg-white px-6 py-2 pr-28">
          <div
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs",
              resourceStats.availableTabs === 0
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700",
            ].join(" ")}
          >
            <span
              className={[
                "inline-flex h-2 w-2 rounded-full animate-pulse",
                resourceStats.availableTabs === 0 ? "bg-red-500" : "bg-emerald-500",
              ].join(" ")}
            />
            <span>
              可用 Tab <span className="font-semibold">{resourceStats.availableTabs}</span>
              <span
                className={
                  resourceStats.availableTabs === 0
                    ? "text-red-600/70"
                    : "text-emerald-600/70"
                }
              >
                {" "}
                / 已连接 {resourceStats.connectedTabs}
              </span>
              <span
                className={
                  resourceStats.availableTabs === 0
                    ? "text-red-600/70"
                    : "text-emerald-600/70"
                }
              >
                {" "}
                · 已占用 {resourceStats.occupiedTabs}
              </span>
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <button
              type="button"
              disabled={cacheBusy}
              onClick={() => void broadcastClearCache()}
              className={[
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors",
                "border-zinc-900 bg-zinc-950 text-white",
                "hover:bg-black hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
              ].join(" ")}
              title="仅清理磁盘缓存，不影响 Cookie 与登录状态"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0 text-white opacity-90"
                aria-hidden="true"
              >
                <path
                  d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m3 0v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M10 11v6M14 11v6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {cacheBusy ? "下发中…" : "清理缓存"}
            </button>

            <span className="h-6 w-px shrink-0 bg-zinc-200" aria-hidden="true" />

            <div
              className="flex shrink-0 items-center gap-2"
              title="点击标签切换并下发至全部已连接槽位；与客户端一致，全标签生效。"
            >
              <span className="text-[10px] font-medium tracking-wide text-zinc-400 whitespace-nowrap">
                内存模式
              </span>
              <div
                className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
                role="tablist"
                aria-label="内存模式"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={powerMode === "normal"}
                  disabled={powerBusy}
                  onClick={() => void applyPowerMode("normal")}
                  className={[
                    "min-w-[76px] rounded-md px-3 py-1.5 text-center text-xs font-medium transition-all",
                    powerMode === "normal"
                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/10"
                      : "text-zinc-500 hover:text-zinc-800",
                    powerBusy ? "cursor-wait opacity-60" : "",
                  ].join(" ")}
                >
                  正常
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={powerMode === "low"}
                  disabled={powerBusy}
                  onClick={() => void applyPowerMode("low")}
                  className={[
                    "min-w-[76px] rounded-md px-3 py-1.5 text-center text-xs font-medium transition-all",
                    powerMode === "low"
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-800",
                    powerBusy ? "cursor-wait opacity-60" : "",
                  ].join(" ")}
                >
                  低内存
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="absolute right-6 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M9 21H5C3.9 21 3 20.1 3 19V5C3 3.9 3.9 3 5 3H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 17L21 12L16 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>退出</span>
          </button>
        </header>
        <main className="p-6">{children}</main>
      </div>

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center p-3 sm:justify-end sm:pr-5"
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-white/95 px-4 py-3 text-sm text-zinc-800 shadow-lg backdrop-blur-sm",
              toast.variant === "success"
                ? "border-emerald-200/90 ring-1 ring-emerald-500/20"
                : "",
              toast.variant === "error"
                ? "border-red-200/90 ring-1 ring-red-500/20"
                : "",
              toast.variant === "warning"
                ? "border-amber-200/90 ring-1 ring-amber-500/20"
                : "",
            ].join(" ")}
          >
            {toast.variant === "success" ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M20 6L9 17L4 12"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : null}
            {toast.variant === "error" ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 8v5M12 16.5h.01M10.3 3.2L2.6 18.2A1.5 1.5 0 004 20.5h16a1.5 1.5 0 001.4-2.3L13.7 3.2a1.5 1.5 0 00-2.7 0z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : null}
            {toast.variant === "warning" ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 9v4M12 17h.01M11.2 4.5L3.5 19.5c-.5 1 .2 2 1.3 2h14.4c1.1 0 1.8-1 1.3-2L12.8 4.5c-.5-1-1.9-1-2.4 0z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : null}
            <p className="min-w-0 flex-1 leading-snug pt-0.5">{toast.message}</p>
            <button
              type="button"
              onClick={() => {
                if (toastDismissRef.current) {
                  clearTimeout(toastDismissRef.current);
                  toastDismissRef.current = null;
                }
                setToast(null);
              }}
              className="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

