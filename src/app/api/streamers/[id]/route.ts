import { NextResponse } from "next/server";
import { removeStreamer, updateStreamer } from "@/lib/server/schedulerStore";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await removeStreamer(id);
  return NextResponse.json({ ok: true });
}

type UpdateBody = {
  name?: string;
  liveUrl?: string;
  channelId?: string;
  targetOnlineCount?: number;
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as UpdateBody;
  const name = body?.name?.trim() || "";
  const liveUrl = body?.liveUrl?.trim() || "";
  const channelId = body?.channelId?.trim() || "";
  const targetOnlineCount = Number(body?.targetOnlineCount);

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "name is required" },
      { status: 400 },
    );
  }
  if (!liveUrl || !/^https?:\/\//i.test(liveUrl)) {
    return NextResponse.json(
      { ok: false, error: "liveUrl must start with http/https" },
      { status: 400 },
    );
  }
  if (!channelId) {
    return NextResponse.json(
      { ok: false, error: "channelId is required" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(targetOnlineCount) || targetOnlineCount < 1) {
    return NextResponse.json(
      { ok: false, error: "targetOnlineCount must be >= 1" },
      { status: 400 },
    );
  }

  const result = await updateStreamer(id, {
    name,
    liveUrl,
    channelId,
    targetOnlineCount,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}

