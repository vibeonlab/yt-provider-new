import { NextResponse } from "next/server";
import { listRecentCommandTasks } from "@/lib/server/schedulerStore";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get("limit") || "300");
  const limit = Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, limitRaw)) : 300;
  const data = await listRecentCommandTasks(limit);
  return NextResponse.json({ ok: true, data });
}

