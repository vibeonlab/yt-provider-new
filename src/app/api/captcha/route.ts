import { NextResponse } from "next/server";
import { captchaSvg, generateCaptcha } from "@/lib/server/captcha";
import { shouldUseSecureCookies } from "@/lib/server/cookieSecure";

export async function GET() {
  const { code, hash, expiresAt } = generateCaptcha();
  const svg = captchaSvg(code);
  const secureCookies = await shouldUseSecureCookies();

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
    secure: secureCookies,
    path: "/",
    maxAge: 120, // 2 min
  });

  res.cookies.set("captcha_expires_at", String(expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    maxAge: 120,
  });

  return res;
}

