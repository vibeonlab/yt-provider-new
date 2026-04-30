"use client";

import { useEffect, useState } from "react";

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

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

      <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
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
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={8}>
                  加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={8}>
                  暂无客户端数据（等待浏览器客户端注册）
                </td>
              </tr>
            ) : (
              rows.map((row) => (
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
                    <button
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

