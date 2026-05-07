import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/adminAuth";
import {
  getAgentRequestCounters,
  resetAgentRequestCounters,
} from "@/lib/server/agentRequestCounters";

async function ensureAdmin() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("admin_session")?.value;
  if (!verifyAdminSessionToken(sessionToken)) {
    return NextResponse.json(
      { ok: false, error: "未登录或登录已过期" },
      { status: 401 },
    );
  }
  return null;
}

export async function GET() {
  const denied = await ensureAdmin();
  if (denied) return denied;
  return NextResponse.json({ ok: true, data: getAgentRequestCounters() });
}

type Body = { action?: string };

export async function POST(req: Request) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Body;
  if (body?.action !== "reset") {
    return NextResponse.json(
      { ok: false, error: "未知操作" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, data: resetAgentRequestCounters() });
}
