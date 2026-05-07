import { NextResponse } from "next/server";
import { listStreamers } from "@/lib/server/schedulerStore";
import { verifyInternalTokenFromRequest } from "@/lib/server/internalTokenAuth";

export async function GET() {
  const auth = await verifyInternalTokenFromRequest();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const data = await listStreamers();
  return NextResponse.json({ ok: true, data });
}
