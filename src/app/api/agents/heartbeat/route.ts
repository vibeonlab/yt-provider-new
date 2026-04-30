import { NextResponse } from "next/server";
import { updateHeartbeat } from "@/lib/server/agentStore";

type Body = {
  agentId: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const agentId = body?.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "agentId is required" },
      { status: 400 },
    );
  }

  const result = await updateHeartbeat(agentId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

