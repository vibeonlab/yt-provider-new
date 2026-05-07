import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/adminAuth";
import { deleteAgent } from "@/lib/server/agentStore";

async function ensureAdmin() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("admin_session")?.value;
  if (!verifyAdminSessionToken(sessionToken)) {
    return NextResponse.json(
      { ok: false, error: "未登录或登录已过期" },
      { status: 401 },
    );
  }
  return null;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const { agentId } = await ctx.params;
  const result = await deleteAgent(agentId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
