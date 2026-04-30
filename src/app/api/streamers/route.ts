import { NextResponse } from "next/server";
import { addStreamer, listStreamers } from "@/lib/server/schedulerStore";

export async function GET() {
  const data = await listStreamers();
  return NextResponse.json({ ok: true, data });
}

type CreateBody = {
  name?: string;
  liveUrl?: string;
  channelId?: string;
  targetOnlineCount?: number;
};

export async function POST(req: Request) {
  const body = (await req.json()) as CreateBody;
  const name = body?.name?.trim() || "";
  const liveUrl = body?.liveUrl?.trim() || "";
  const channelId = body?.channelId?.trim() || "";
  const targetOnlineCount = Number(body?.targetOnlineCount);

  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }
  if (!liveUrl || !/^https?:\/\//i.test(liveUrl)) {
    return NextResponse.json(
      { ok: false, error: "liveUrl must start with http/https" },
      { status: 400 },
    );
  }
  if (!channelId) {
    return NextResponse.json({ ok: false, error: "channelId is required" }, { status: 400 });
  }
  if (!Number.isFinite(targetOnlineCount) || targetOnlineCount < 1) {
    return NextResponse.json(
      { ok: false, error: "targetOnlineCount must be >= 1" },
      { status: 400 },
    );
  }

  const result = await addStreamer({
    name,
    liveUrl,
    channelId,
    targetOnlineCount,
  });
  return NextResponse.json({ ok: result.ok });
}

