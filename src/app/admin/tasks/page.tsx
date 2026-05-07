"use client";

import { useEffect, useMemo, useState } from "react";

const TASK_PAGE_SIZE = 20;

type Row = {
  commandId: string;
  type: "open_stream" | "go_home" | "clear_disk_cache" | "set_power_mode";
  status: "pending" | "sent" | "done" | "failed";
  message: string;
  agentId: string;
  agentName: string;
  browserId: string;
  browserName: string;
  streamerId: string;
  streamerName: string;
  retryAttempt: number;
  createdAt: string;
  updatedAt: string;
};

function statusStyle(status: Row["status"]) {
  if (status === "done") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "sent") return "bg-blue-100 text-blue-700";
  return "bg-zinc-100 text-zinc-700";
}

export default function TasksPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "all" | Row["status"]
  >("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  async function load() {
    const res = await fetch("/api/tasks/recent?limit=500", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; data: Row[] };
    setRows(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    const firstLoad = async () => {
      const res = await fetch("/api/tasks/recent?limit=500", {
        cache: "no-store",
      });
      const data = (await res.json()) as { ok: boolean; data: Row[] };
      if (!active) return;
      setRows(data.data ?? []);
      setLoading(false);
    };
    void firstLoad();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const text = `${r.commandId} ${r.message} ${r.agentId} ${r.agentName} ${r.browserId} ${r.browserName} ${r.streamerName} ${r.type}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, keyword]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TASK_PAGE_SIZE));

  const pagedRows = useMemo(() => {
    const start = (page - 1) * TASK_PAGE_SIZE;
    return filtered.slice(start, start + TASK_PAGE_SIZE);
  }, [filtered, page]);

  // 筛选条件变化时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [statusFilter, keyword]);

  // 总页数变化时（数据刷新导致页数缩水）把当前页夹住
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  return (
    <section>
      <h2 className="text-2xl font-semibold text-zinc-900">任务明细</h2>
      <p className="text-sm text-zinc-500 mt-1">
        最近调度命令、状态、重试与失败原因
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | Row["status"])}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="all">全部状态</option>
          <option value="pending">pending</option>
          <option value="sent">sent</option>
          <option value="done">done</option>
          <option value="failed">failed</option>
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索 commandId / 错误 / agent / streamer"
          className="w-80 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[1280px] text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="text-left px-4 py-3">创建时间</th>
              <th className="text-left px-4 py-3">命令ID</th>
              <th className="text-left px-4 py-3">类型</th>
              <th className="text-left px-4 py-3">状态</th>
              <th className="text-left px-4 py-3">重试</th>
              <th className="text-left px-4 py-3">主播</th>
              <th className="text-left px-4 py-3">Agent</th>
              <th className="text-left px-4 py-3">Browser</th>
              <th className="text-left px-4 py-3">信息</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={9}>
                  加载中...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={9}>
                  暂无任务记录
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => (
                <tr key={r.commandId} className="border-t border-zinc-100">
                  <td className="px-4 py-3 text-zinc-600">
                    {r.createdAt
                      ? new Date(r.createdAt).toLocaleString("zh-CN")
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 break-all">{r.commandId}</td>
                  <td className="px-4 py-3">{r.type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs ${statusStyle(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">r{r.retryAttempt}</td>
                  <td className="px-4 py-3">{r.streamerName || r.streamerId || "-"}</td>
                  <td className="px-4 py-3">
                    {r.agentName || r.agentId || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {r.browserName || r.browserId || "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 break-all">{r.message || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 ? (
        <nav
          className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-700"
          aria-label="任务列表分页"
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

