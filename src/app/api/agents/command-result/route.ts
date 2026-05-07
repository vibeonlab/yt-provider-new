import { NextResponse } from "next/server";
import { markCommandResult } from "@/lib/server/schedulerStore";
import { incrementHttpRequest } from "@/lib/server/agentRequestCounters";

type Body = {
  commandId: string;
  success: boolean;
  message?: string;
};

export async function POST(req: Request) {
  incrementHttpRequest();
  const body = (await req.json()) as Body;
  const commandId = body?.commandId?.trim();
  if (!commandId) {
    return NextResponse.json(
      { ok: false, error: "commandId is required" },
      { status: 400 },
    );
  }
  const result = await markCommandResult({
    commandId,
    success: !!body.success,
    message: body.message,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}

