import { NextResponse } from "next/server";
import { goOnline } from "@/lib/server/schedulerStore";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const result = await goOnline(id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, data: result });
}

