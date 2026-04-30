import { NextResponse } from "next/server";
import { reportAgentStatus } from "@/lib/server/agentStore";

type Body = {
  agentId: string;
  browsers: Array<{
    browserId: string;
    name: string;
    wsUrl: string;
    connected: boolean;
    tabsCount: number;
    activeUrl: string;
    tabs?: string[];
  }>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const agentId = body?.agentId?.trim();
  const browsers = body?.browsers ?? [];
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "agentId is required" },
      { status: 400 },
    );
  }

  const result = await reportAgentStatus({ agentId, browsers });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

