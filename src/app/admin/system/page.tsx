"use client";

import { useEffect, useMemo, useState } from "react";

const AGENT_PAGE_SIZE = 20;

type AgentRow = {
  agentId: string;
  name: string;
  host: string;
  capacity: number;
  status: "online" | "offline";
  enabled: boolean;
  lastHeartbeatAt: string;
};

export default function SystemPage() {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentPage, setAgentPage] = useState(1);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function load() {
    const res = await fetch("/api/agents", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; data: AgentRow[] };
    setRows(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; data: AgentRow[] };
      if (!active) return;
      setRows(data.data ?? []);
      setLoading(false);
    };
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);
    setPwdError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError("请填写完整密码信息");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("两次输入的新密码不一致");
      return;
    }

    setPwdSubmitting(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    setPwdSubmitting(false);

    if (!res.ok || !data.ok) {
      setPwdError(data.error || "修改密码失败");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwdMessage("密码修改成功，下次登录请使用新密码");
  }

  async function onToggleAgent(agentId: string, enabled: boolean) {
    await fetch(`/api/agents/${agentId}/enabled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    void load();
  }

  function showFeedback(type: "success" | "error", text: string) {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 2400);
  }

  function openDeleteConfirm(row: AgentRow) {
    setDeleteError(null);
    setDeleteTarget(row);
  }

  function closeDeleteConfirm() {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function confirmDeleteAgent() {
    if (!deleteTarget || deleteSubmitting) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(deleteTarget.agentId)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data?.ok) {
        setDeleteError(data?.error || `删除失败（${res.status}）`);
        return;
      }
      const removedName = deleteTarget.name || deleteTarget.agentId;
      setDeleteTarget(null);
      await load();
      showFeedback("success", `已删除 Agent「${removedName}」`);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "删除请求异常，请稍后重试",
      );
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const sortedAgents = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "zh-CN", {
          sensitivity: "base",
        }),
      ),
    [rows],
  );

  const agentTotalPages = Math.max(
    1,
    Math.ceil(sortedAgents.length / AGENT_PAGE_SIZE),
  );

  const pagedAgents = useMemo(() => {
    const start = (agentPage - 1) * AGENT_PAGE_SIZE;
    return sortedAgents.slice(start, start + AGENT_PAGE_SIZE);
  }, [sortedAgents, agentPage]);

  useEffect(() => {
    setAgentPage((p) => Math.min(p, agentTotalPages));
  }, [agentTotalPages]);

  return (
    <section>
      <h2 className="text-2xl font-semibold text-zinc-900">系统设置</h2>
      <p className="text-sm text-zinc-500 mt-1">
        管理客户端（Agent）状态与调度参与开关
      </p>

      <form
        onSubmit={onChangePassword}
        className="mt-5 rounded-xl border border-zinc-200 bg-white p-4"
      >
        <h3 className="font-medium text-zinc-900">管理员登录设置</h3>
        <p className="text-xs text-zinc-500 mt-1">固定账号：ytadmin</p>
        <div className="grid grid-cols-1 gap-3 mt-3">
          <input
            type="password"
            className="w-full max-w-md justify-self-start rounded-lg border border-zinc-300 px-3 py-2"
            placeholder="当前密码"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            type="password"
            className="w-full max-w-md justify-self-start rounded-lg border border-zinc-300 px-3 py-2"
            placeholder="新密码（至少6位）"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            type="password"
            className="w-full max-w-md justify-self-start rounded-lg border border-zinc-300 px-3 py-2"
            placeholder="确认新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {pwdError ? (
          <div className="mt-3 text-sm text-red-600">{pwdError}</div>
        ) : null}
        {pwdMessage ? (
          <div className="mt-3 text-sm text-emerald-700">{pwdMessage}</div>
        ) : null}

        <button
          type="submit"
          disabled={pwdSubmitting}
          className="mt-3 rounded-lg bg-zinc-900 text-white px-4 py-2 hover:bg-black disabled:opacity-60"
        >
          {pwdSubmitting ? "提交中..." : "修改登录密码"}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="text-lg font-medium text-zinc-900">客户端（Agent）列表</h3>
        {!loading ? (
          <p className="mt-1 text-xs text-zinc-500">
            按名称排序，共 {sortedAgents.length} 条，每页 {AGENT_PAGE_SIZE}{" "}
            条
          </p>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="text-left px-4 py-3">Agent ID</th>
              <th className="text-left px-4 py-3">名称</th>
              <th className="text-left px-4 py-3">主机</th>
              <th className="text-left px-4 py-3">容量</th>
              <th className="text-left px-4 py-3">在线状态</th>
              <th className="text-left px-4 py-3">调度状态</th>
              <th className="text-left px-4 py-3">最后心跳</th>
              <th className="text-left px-4 py-3 w-44">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={8}>
                  加载中...
                </td>
              </tr>
            ) : sortedAgents.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={8}>
                  暂无客户端数据（等待浏览器客户端注册）
                </td>
              </tr>
            ) : (
              pagedAgents.map((row) => (
                <tr key={row.agentId} className="border-t border-zinc-100">
                  <td className="px-4 py-3 text-zinc-700 break-all">{row.agentId}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.host}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.capacity}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-1 text-xs",
                        row.status === "online"
                          ? "bg-green-100 text-green-700"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {row.status === "online" ? "在线" : "离线"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-1 text-xs",
                        row.enabled
                          ? "bg-blue-100 text-blue-700"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {row.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {row.lastHeartbeatAt
                      ? new Date(row.lastHeartbeatAt).toLocaleString("zh-CN")
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleAgent(row.agentId, !row.enabled)}
                        className={[
                          "rounded-lg text-white px-3 py-1.5",
                          row.enabled
                            ? "bg-zinc-700 hover:bg-zinc-800"
                            : "bg-emerald-600 hover:bg-emerald-700",
                        ].join(" ")}
                      >
                        {row.enabled ? "禁用调度" : "启用调度"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700 hover:border-red-300 hover:bg-red-100"
                        title="删除该 Agent 的全部调度数据"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
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
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {feedback ? (
        <div
          className={[
            "fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg",
            feedback.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white",
          ].join(" ")}
          role="status"
        >
          {feedback.text}
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-agent-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm();
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-4 p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 8v5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
                  <path
                    d="M10.3 3.3 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <h4
                  id="delete-agent-title"
                  className="text-base font-semibold text-zinc-900"
                >
                  确认删除 Agent？
                </h4>
                <p className="mt-1 text-sm text-zinc-600">
                  即将删除
                  <span className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-900">
                    {deleteTarget.name || deleteTarget.agentId}
                  </span>
                  及其调度数据（assignments / commands / browser_slots）。
                  操作不可恢复。
                </p>
                {deleteError ? (
                  <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    {deleteError}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteAgent()}
                disabled={deleteSubmitting}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteSubmitting ? (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className="animate-spin"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeOpacity="0.3"
                      />
                      <path
                        d="M21 12a9 9 0 0 0-9-9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    删除中…
                  </>
                ) : (
                  "确认删除"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && sortedAgents.length > 0 ? (
        <nav
          className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-700"
          aria-label="Agent 列表分页"
        >
          <button
            type="button"
            disabled={agentPage <= 1}
            onClick={() => setAgentPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="px-2 tabular-nums">
            {agentPage} / {agentTotalPages}
          </span>
          <button
            type="button"
            disabled={agentPage >= agentTotalPages}
            onClick={() =>
              setAgentPage((p) => Math.min(agentTotalPages, p + 1))
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </nav>
      ) : null}
    </section>
  );
}

