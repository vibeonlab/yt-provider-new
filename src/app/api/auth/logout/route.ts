import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/server/cookieSecure";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const secureCookies = await shouldUseSecureCookies();
  res.cookies.set("admin_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    maxAge: 0,
  });
  return res;
}

