import { NextResponse } from "next/server";
import { updateAdminPassword } from "@/lib/server/adminAuth";

type Body = {
  currentPassword: string;
  newPassword: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const currentPassword = body?.currentPassword ?? "";
  const newPassword = body?.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "请填写当前密码和新密码" },
      { status: 400 },
    );
  }

  const result = await updateAdminPassword({ currentPassword, newPassword });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

