"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  commandId: string;
  type: "open_stream" | "go_home";
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
              filtered.map((r) => (
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
    </section>
  );
}

