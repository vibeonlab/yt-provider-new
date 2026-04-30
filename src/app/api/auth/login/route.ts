import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { signAdminSession, verifyAdminLogin } from "@/lib/server/adminAuth";
import { verifyCaptcha } from "@/lib/server/captcha";

type LoginBody = {
  account: string;
  password: string;
  captcha: string;
  rememberMe?: boolean;
};

export async function POST(req: Request) {
  const body = (await req.json()) as LoginBody;
  const account = body?.account?.trim();
  const password = body?.password ?? "";
  const captchaInput = body?.captcha ?? "";

  if (!account || !password || !captchaInput) {
    return NextResponse.json(
      { ok: false, error: "请填写账号、密码和验证码" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const expectedHash = cookieStore.get("captcha_hash")?.value;
  const expiresAtRaw = cookieStore.get("captcha_expires_at")?.value;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0;

  if (!expectedHash || !expiresAt || Number.isNaN(expiresAt)) {
    return NextResponse.json(
      { ok: false, error: "验证码已过期或不存在，请重新获取" },
      { status: 400 },
    );
  }

  const captchaOk = verifyCaptcha({
    inputCode: captchaInput.trim(),
    expectedHash,
    expiresAt,
  });

  if (!captchaOk) {
    return NextResponse.json(
      { ok: false, error: "验证码错误" },
      { status: 401 },
    );
  }

  const loginOk = await verifyAdminLogin({
    account: account ?? "",
    password,
  });
  if (!loginOk) {
    return NextResponse.json(
      { ok: false, error: "账号或密码错误" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  const maxAge = body.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
  res.cookies.set("admin_session", signAdminSession("ytadmin"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return res;
}

