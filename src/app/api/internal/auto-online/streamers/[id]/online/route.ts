import { NextResponse } from "next/server";
import { goOnline } from "@/lib/server/schedulerStore";
import { verifyInternalTokenFromRequest } from "@/lib/server/internalTokenAuth";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await verifyInternalTokenFromRequest();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

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
