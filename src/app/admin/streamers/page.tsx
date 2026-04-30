"use client";

import { useEffect, useMemo, useState } from "react";

type Streamer = {
  id: string;
  name: string;
  liveUrl: string;
  channelId: string;
  maxOnline: number;
  currentOnline: number;
  status: "online" | "offline";
};

export default function StreamersPage() {
  const [items, setItems] = useState<Streamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [actionPendingKey, setActionPendingKey] = useState("");
  const [toast, setToast] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    message: string;
  }>({ visible: false, type: "info", message: "" });
  const [form, setForm] = useState({
    name: "",
    liveUrl: "",
    channelId: "",
    targetOnlineCount: 1,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    liveUrl: "",
    channelId: "",
    targetOnlineCount: 1,
  });

  function showToast(type: "success" | "error" | "info", message: string) {
    setToast({ visible: true, type, message });
    window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2200);
  }

  async function load() {
    const res = await fetch("/api/streamers", { cache: "no-store" });
    const data = (await res.json()) as {
      ok: boolean;
      data: Array<{
        id: string;
        name: string;
        liveUrl: string;
        channelId: string;
        targetOnlineCount: number;
        currentOnlineCount: number;
        status: "online" | "offline";
      }>;
    };
    setItems(
      (data.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        liveUrl: s.liveUrl,
        channelId: s.channelId,
        maxOnline: s.targetOnlineCount,
        currentOnline: s.currentOnlineCount,
        status: s.status,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      const res = await fetch("/api/streamers", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        data: Array<{
          id: string;
          name: string;
          liveUrl: string;
          channelId: string;
          targetOnlineCount: number;
          currentOnlineCount: number;
          status: "online" | "offline";
        }>;
      };
      if (!active) return;
      setItems(
        (data.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          liveUrl: s.liveUrl,
          channelId: s.channelId,
          maxOnline: s.targetOnlineCount,
          currentOnline: s.currentOnlineCount,
          status: s.status,
        })),
      );
      setLoading(false);
    };
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const online = items.filter((i) => i.status === "online").length;
    return { total: items.length, online };
  }, [items]);

  async function updateStatus(id: string, next: Streamer["status"]) {
    setActionPendingKey(`${id}:${next}`);
    const url =
      next === "online"
        ? `/api/streamers/${id}/online`
        : `/api/streamers/${id}/offline`;
    try {
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        allocated?: number;
        released?: number;
      };
      if (!res.ok || !data.ok) {
        showToast("error", data.error || `${next === "online" ? "上线" : "下线"}失败`);
        return;
      }
      await load();
      if (next === "online") {
        showToast("success", `上线成功，分配 ${data.allocated ?? 0} 个浏览器`);
      } else {
        showToast("info", `下线完成，释放 ${data.released ?? 0} 个浏览器`);
      }
    } finally {
      setActionPendingKey("");
    }
  }

  async function removeStreamer(id: string) {
    await fetch(`/api/streamers/${id}`, { method: "DELETE" });
    await load();
  }

  async function createStreamer(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");

    if (!form.name.trim()) return setCreateError("请填写主播名称");
    if (!/^https?:\/\//i.test(form.liveUrl.trim())) {
      return setCreateError("直播地址需以 http/https 开头");
    }
    if (!form.channelId.trim()) return setCreateError("请填写主播频道 ID");

    setSubmitting(true);
    try {
      const res = await fetch("/api/streamers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          liveUrl: form.liveUrl.trim(),
          channelId: form.channelId.trim(),
          targetOnlineCount: Number(form.targetOnlineCount) || 1,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setCreateError(data.error || "新增失败");
        return;
      }
      setCreating(false);
      setForm({ name: "", liveUrl: "", channelId: "", targetOnlineCount: 1 });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(streamer: Streamer) {
    setEditingId(streamer.id);
    setEditError("");
    setEditForm({
      name: streamer.name,
      liveUrl: streamer.liveUrl,
      channelId: streamer.channelId,
      targetOnlineCount: streamer.maxOnline,
    });
  }

  function closeEdit() {
    setEditingId(null);
    setEditSubmitting(false);
    setEditError("");
  }

  async function updateStreamer(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditError("");
    if (!editForm.name.trim()) return setEditError("请填写主播名称");
    if (!/^https?:\/\//i.test(editForm.liveUrl.trim())) {
      return setEditError("直播地址需以 http/https 开头");
    }
    if (!editForm.channelId.trim()) return setEditError("请填写主播频道 ID");

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/streamers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          liveUrl: editForm.liveUrl.trim(),
          channelId: editForm.channelId.trim(),
          targetOnlineCount: Number(editForm.targetOnlineCount) || 1,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEditError(data.error || "修改失败");
        return;
      }
      closeEdit();
      await load();
      showToast("success", "主播信息已更新");
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-zinc-900">主播设置</h2>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
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
              d="M12 5V19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5 12H19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>{creating ? "收起" : "新增"}</span>
        </button>
      </div>
      <p className="text-sm text-zinc-500 mt-1">
        已配置主播：{summary.total}，当前在线：{summary.online}
      </p>

      <div
        className={[
          "pointer-events-none fixed right-6 top-6 z-50 transition-all duration-300",
          toast.visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        ].join(" ")}
      >
        <div
          className={[
            "rounded-xl border px-4 py-2 text-sm shadow-lg backdrop-blur",
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-700"
              : toast.type === "error"
                ? "border-red-200 bg-red-50/95 text-red-700"
                : "border-blue-200 bg-blue-50/95 text-blue-700",
          ].join(" ")}
        >
          {toast.message}
        </div>
      </div>

      {creating ? (
        <form
          onSubmit={createStreamer}
          className="mt-4 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="主播名称"
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
            <input
              value={form.channelId}
              onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))}
              placeholder="主播频道 ID"
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
            <input
              value={form.liveUrl}
              onChange={(e) => setForm((f) => ({ ...f, liveUrl: e.target.value }))}
              placeholder="直播地址（https://...）"
              className="rounded-lg border border-zinc-300 px-3 py-2 md:col-span-2"
            />
            <input
              type="number"
              min={1}
              max={10}
              value={form.targetOnlineCount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  targetOnlineCount: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                }))
              }
              placeholder="购买上线人数"
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </div>
          {createError ? (
            <div className="mt-2 text-sm text-red-600">{createError}</div>
          ) : null}
          <div className="mt-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-zinc-900 text-white px-4 py-2 hover:bg-black disabled:opacity-60"
            >
              {submitting ? "提交中..." : "确认新增"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="text-left px-4 py-3">主播名称</th>
              <th className="text-left px-4 py-3">直播地址</th>
              <th className="text-left px-4 py-3">主播频道 ID</th>
              <th className="text-left px-4 py-3">购买上线人数</th>
              <th className="text-left px-4 py-3">当前上线人数</th>
              <th className="text-left px-4 py-3">状态</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={7}>
                  加载中...
                </td>
              </tr>
            ) : items.map((s) => (
              <tr key={s.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-medium text-zinc-900">{s.name}</td>
                <td className="px-4 py-3 text-blue-700 break-all">{s.liveUrl}</td>
                <td className="px-4 py-3 text-zinc-700">{s.channelId}</td>
                <td className="px-4 py-3 text-zinc-700">{s.maxOnline}</td>
                <td className="px-4 py-3 text-zinc-700">{s.currentOnline}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      "inline-flex rounded-full px-2 py-1 text-xs",
                      s.status === "online"
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-700",
                    ].join(" ")}
                  >
                    {s.status === "online" ? "在线" : "离线"}
                  </span>
                </td>
                <td className="px-4 py-3 space-x-2">
                  <button
                    disabled={actionPendingKey === `${s.id}:online`}
                    onClick={() => updateStatus(s.id, "online")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {actionPendingKey === `${s.id}:online` ? (
                      <>
                        <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                        <span>上线中...</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M6 11L12 5L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>上线</span>
                      </>
                    )}
                  </button>
                  <button
                    disabled={actionPendingKey === `${s.id}:offline`}
                    onClick={() => updateStatus(s.id, "offline")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-700 text-white px-3 py-1.5 hover:bg-zinc-800 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {actionPendingKey === `${s.id}:offline` ? (
                      <>
                        <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                        <span>下线中...</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M6 13L12 19L18 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>下线</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(s)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M4 20H8L18.5 9.5C19.3 8.7 19.3 7.3 18.5 6.5L17.5 5.5C16.7 4.7 15.3 4.7 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    <span>修改</span>
                  </button>
                  <button
                    onClick={() => removeStreamer(s.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-3 py-1.5 hover:bg-red-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M9 7V5H15V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 7L8 20H16L17 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    <span>删除</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <form
            onSubmit={updateStreamer}
            className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">修改主播</h3>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100"
              >
                关闭
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="主播名称"
                className="rounded-lg border border-zinc-300 px-3 py-2"
              />
              <input
                value={editForm.channelId}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, channelId: e.target.value }))
                }
                placeholder="主播频道 ID"
                className="rounded-lg border border-zinc-300 px-3 py-2"
              />
              <input
                value={editForm.liveUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, liveUrl: e.target.value }))}
                placeholder="直播地址（https://...）"
                className="rounded-lg border border-zinc-300 px-3 py-2 md:col-span-2"
              />
              <input
                type="number"
                min={1}
                max={10}
                value={editForm.targetOnlineCount}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    targetOnlineCount: Math.max(
                      1,
                      Math.min(10, Number(e.target.value) || 1),
                    ),
                  }))
                }
                placeholder="购买上线人数"
                className="rounded-lg border border-zinc-300 px-3 py-2"
              />
            </div>
            {editError ? (
              <div className="mt-2 text-sm text-red-600">{editError}</div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-black disabled:opacity-60"
              >
                {editSubmitting ? "保存中..." : "保存修改"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

