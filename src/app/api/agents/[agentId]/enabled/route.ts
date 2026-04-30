import { NextResponse } from "next/server";
import { setAgentEnabled } from "@/lib/server/agentStore";

type Body = { enabled: boolean };

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;
  const body = (await req.json()) as Body;
  const enabled = !!body?.enabled;
  const result = await setAgentEnabled(agentId, enabled);
  return NextResponse.json(result);
}

