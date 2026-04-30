import { NextResponse } from "next/server";
import { removeStreamer } from "@/lib/server/schedulerStore";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await removeStreamer(id);
  return NextResponse.json({ ok: true });
}

