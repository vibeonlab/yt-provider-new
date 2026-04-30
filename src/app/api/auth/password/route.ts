import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { updateAdminPassword, verifyAdminSessionToken } from "@/lib/server/adminAuth";

type Body = {
  currentPassword: string;
  newPassword: string;
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("admin_session")?.value;
  if (!verifyAdminSessionToken(sessionToken)) {
    return NextResponse.json(
      { ok: false, error: "未登录或登录已过期" },
      { status: 401 },
    );
  }

  const body = (await req.json()) as Body;
  const currentPassword = body?.currentPassword ?? "";
  const newPassword = body?.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "请填写当前密码和新密码" },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof updateAdminPassword>>;
  try {
    result = await updateAdminPassword({ currentPassword, newPassword });
  } catch {
    return NextResponse.json(
      { ok: false, error: "密码系统配置异常，请检查 Supabase 管理员账号表" },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

