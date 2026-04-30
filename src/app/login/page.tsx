"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LoginError = string | null;

export default function LoginPage() {
  const router = useRouter();
  const initialError = null;

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const [captchaVersion, setCaptchaVersion] = useState(1);
  const [error, setError] = useState<LoginError>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!account.trim() || !password || !captcha.trim()) {
      setError("请填写账号、密码和验证码");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: account.trim(),
          password,
          captcha,
          rememberMe,
        }),
      });

      const data = (await resp.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;

      if (!resp.ok || !data?.ok) {
        setError(data?.error || "登录失败");
        setCaptchaVersion((v) => v + 1);
        return;
      }

      router.push("/admin/running");
    } catch {
      setError("网络错误，请稍后再试");
      setCaptchaVersion((v) => v + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_14px_40px_rgba(0,0,0,0.12)] p-7">
        <div className="flex items-center justify-center mb-6">
          <div className="h-11 w-11 rounded-lg bg-[#ff0000] text-white flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="YouTube"
            >
              <rect x="3" y="6.5" width="18" height="11" rx="3" fill="white" />
              <path d="M11 9.6L15.2 12L11 14.4V9.6Z" fill="#ff0000" />
            </svg>
          </div>
        </div>

        <h1 className="text-center text-2xl font-semibold text-zinc-900">
          YouTube Manager
        </h1>

        <form className="mt-7 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <div className="text-sm font-medium text-zinc-700 mb-1">用户名</div>
            <input
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500"
              placeholder="请输入账号"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-zinc-700 mb-1">密码</div>
            <input
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-700 mb-1">验证码</div>
              <input
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500"
                placeholder="输入验证码"
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                inputMode="numeric"
              />
            </div>

            <div className="w-44">
              <div className="text-xs font-medium text-zinc-600 mb-1">
                点击刷新
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/captcha?v=${captchaVersion}`}
                alt="验证码"
                className="w-44 h-14 object-contain border border-zinc-200 rounded-xl bg-white cursor-pointer"
                onClick={() => setCaptchaVersion((v) => v + 1)}
              />
            </div>
          </div>

          <div className="flex items-center mt-2">
            <label className="flex items-center gap-2 text-sm text-zinc-600 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              记住我
            </label>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-[#ff0000] text-white font-semibold hover:bg-[#d70000] disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {loading ? (
              "登录中..."
            ) : (
              <>
                <span>Login</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M13 5L20 12L13 19"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 12H19"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

