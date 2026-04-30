import { NextResponse } from "next/server";
import { captchaSvg, generateCaptcha } from "@/lib/server/captcha";

export async function GET() {
  const { code, hash, expiresAt } = generateCaptcha();
  const svg = captchaSvg(code);

  const res = new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });

  // httpOnly: prevents client-side reading and easy bypass.
  res.cookies.set("captcha_hash", hash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120, // 2 min
  });

  res.cookies.set("captcha_expires_at", String(expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120,
  });

  return res;
}

