import { NextResponse } from "next/server";
import { listAgents } from "@/lib/server/agentStore";

export async function GET() {
  const data = await listAgents();
  return NextResponse.json({ ok: true, data });
}

