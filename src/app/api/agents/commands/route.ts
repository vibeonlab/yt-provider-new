import { NextResponse } from "next/server";
import { pollAgentCommands } from "@/lib/server/schedulerStore";
import { incrementHttpRequest } from "@/lib/server/agentRequestCounters";

export async function GET(req: Request) {
  incrementHttpRequest();
  const { searchParams } = new URL(req.url);
  const agentId = (searchParams.get("agentId") || "").trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "agentId is required" },
      { status: 400 },
    );
  }

  const data = await pollAgentCommands(agentId);
  return NextResponse.json({ ok: true, data });
}

