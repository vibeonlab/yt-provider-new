"use client";

import { useEffect, useMemo, useState } from "react";

const LOG_PAGE_SIZE = 20;

type LogLevel = "info" | "warning" | "error";

type OperationLog = {
  id: string;
  time: string; // ISO
  module: string;
  action: string;
  operator: string;
  detail: string;
  level: LogLevel;
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function levelStyle(level: LogLevel) {
  if (level === "error") return "bg-red-100 text-red-700";
  if (level === "warning") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function formatDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function LogsPage() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<"all" | LogLevel>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const maxSelectableDate = formatDateInput(new Date());
  const minSelectableDate = formatDateInput(
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  );

  async function loadLogs() {
    const isInitial = logs.length === 0 && !refreshing;
    if (!isInitial) setRefreshing(true);
    try {
      const res = await fetch("/api/logs", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        data: Array<{
          id: string;
          module: string;
          action: string;
          operator: string;
          detail: string;
          level: LogLevel;
          createdAt: string;
        }>;
      };
      setLogs(
        (data.data ?? []).map((x) => ({
          id: x.id,
          module: x.module,
          action: x.action,
          operator: x.operator,
          detail: x.detail,
          level: x.level,
          time: x.createdAt,
        })),
      );
      if (isInitial) setLoading(false);
    } finally {
      if (!isInitial) setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    const normalize = (
      data: Array<{
        id: string;
        module: string;
        action: string;
        operator: string;
        detail: string;
        level: LogLevel;
        createdAt: string;
      }>,
    ) =>
      (data ?? []).map((x) => ({
        id: x.id,
        module: x.module,
        action: x.action,
        operator: x.operator,
        detail: x.detail,
        level: x.level,
        time: x.createdAt,
      }));

    const loadInEffect = async () => {
      const res = await fetch("/api/logs", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        data: Array<{
          id: string;
          module: string;
          action: string;
          operator: string;
          detail: string;
          level: LogLevel;
          createdAt: string;
        }>;
      };
      if (!active) return;
      setLogs(normalize(data.data ?? []));
      setLoading(false);
    };

    const refreshInEffect = async () => {
      const res = await fetch("/api/logs", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        data: Array<{
          id: string;
          module: string;
          action: string;
          operator: string;
          detail: string;
          level: LogLevel;
          createdAt: string;
        }>;
      };
      if (!active) return;
      setLogs(normalize(data.data ?? []));
    };

    void loadInEffect();
    const timer = window.setInterval(() => {
      void refreshInEffect();
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const moduleOptions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.module))).sort(),
    [logs],
  );
  const sorted = [...logs].sort((a, b) => (a.time < b.time ? 1 : -1));
  const filtered = useMemo(() => {
    return sorted.filter((log) => {
      if (selectedDate && dayKey(log.time) !== selectedDate) return false;
      if (moduleFilter !== "all" && log.module !== moduleFilter) return false;
      if (levelFilter !== "all" && log.level !== levelFilter) return false;
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        const text = `${log.action} ${log.detail} ${log.operator} ${log.module}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [selectedDate, moduleFilter, levelFilter, keyword, sorted]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));

  // 分页要在分组之前做：每页固定 20 条，再把当前页内条目按日分组渲染
  const pagedLogs = useMemo(() => {
    const start = (page - 1) * LOG_PAGE_SIZE;
    return filtered.slice(start, start + LOG_PAGE_SIZE);
  }, [filtered, page]);

  // 筛选条件变化时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [selectedDate, moduleFilter, levelFilter, keyword]);

  // 数据刷新导致总页数缩水时把当前页夹住
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const groups = pagedLogs.reduce<Record<string, OperationLog[]>>(
    (acc, log) => {
      const key = dayKey(log.time);
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    },
    {},
  );

  const days = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-zinc-900">日志</h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>日期筛选</span>
          </button>

          {showCalendar ? (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg z-10">
              <div className="text-sm font-medium text-zinc-800">选择日期</div>
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20"
                value={selectedDate}
                min={minSelectableDate}
                max={maxSelectableDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setSelectedDate("");
                    return;
                  }
                  if (v < minSelectableDate || v > maxSelectableDate) {
                    return;
                  }
                  setSelectedDate(v);
                }}
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                  onClick={() => setSelectedDate("")}
                >
                  清除筛选
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
                  onClick={() => setShowCalendar(false)}
                >
                  完成
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-zinc-500 mt-1">按日期查看系统操作日志</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="all">全部模块</option>
          {moduleOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as "all" | LogLevel)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="all">全部级别</option>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索关键字（如 like_failed）"
          className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
        />
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
        >
          {refreshing ? "刷新中..." : "立即刷新"}
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
            加载中...
          </div>
        ) : days.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
            该日期暂无日志记录
          </div>
        ) : (
          days.map((day) => (
            <article
              key={day}
              className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
            >
              <div className="bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-800">
                {day}
              </div>
              <ul className="divide-y divide-zinc-100">
                {groups[day].map((log) => (
                  <li key={log.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-900 font-medium">
                          {log.action}
                        </div>
                        <div className="text-sm text-zinc-600 mt-1 break-all">
                          {log.detail}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">
                          模块：{log.module} · 操作人：{log.operator}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-zinc-500">
                          {formatTime(log.time)}
                        </div>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs ${levelStyle(log.level)}`}
                        >
                          {log.level}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>

      {!loading && filtered.length > 0 ? (
        <nav
          className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-700"
          aria-label="日志分页"
        >
          <span className="text-zinc-500">共 {filtered.length} 条</span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="px-2 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </nav>
      ) : null}
    </section>
  );
}

