"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [resourceStats, setResourceStats] = useState({
    connectedTabs: 0,
    occupiedTabs: 0,
    availableTabs: 0,
  });

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

  return (
    <div className="min-h-screen bg-zinc-50 flex">
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
        <header className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6">
          <div
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs",
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
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
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
    </div>
  );
}

