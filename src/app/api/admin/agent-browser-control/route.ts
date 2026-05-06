import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/adminAuth";
import { enqueueBroadcastBrowserControl } from "@/lib/server/schedulerStore";

type Body = {
  action?: string;
  mode?: string;
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("admin_session")?.value;
  if (!verifyAdminSessionToken(sessionToken)) {
    return NextResponse.json(
      { ok: false, error: "未登录或登录已过期" },
      { status: 401 },
    );
  }

  const body = (await req.json()) as Body;
  const action = (body?.action || "").trim();

  if (action === "clear_disk_cache") {
    const result = await enqueueBroadcastBrowserControl({
      kind: "clear_disk_cache",
    });
    return NextResponse.json({ ok: true, data: result });
  }

  if (action === "set_power_mode") {
    const mode =
      (body?.mode || "").trim().toLowerCase() === "low" ? "low" : "normal";
    const result = await enqueueBroadcastBrowserControl({
      kind: "set_power_mode",
      mode,
    });
    return NextResponse.json({ ok: true, data: result });
  }

  return NextResponse.json(
    { ok: false, error: "unknown action" },
    { status: 400 },
  );
}
