import { NextResponse } from "next/server";
import { registerAgent } from "@/lib/server/agentStore";

type Body = {
  agentId?: string;
  name: string;
  host?: string;
  capacity?: number;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "name is required" },
      { status: 400 },
    );
  }

  const host = body.host?.trim() || "unknown-host";
  const capacity = Math.min(10, Math.max(1, Number(body.capacity) || 10));
  const result = await registerAgent({
    agentId: body.agentId,
    name,
    host,
    capacity,
  });

  return NextResponse.json({ ok: true, data: result });
}

