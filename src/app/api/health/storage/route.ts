import { NextResponse } from "next/server";
import {
  getDatabaseMode,
  getSupabaseAdmin,
} from "@/lib/server/supabaseAdmin";

export async function GET() {
  const mode = getDatabaseMode();
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({
      ok: true,
      data: {
        mode: "json-fallback",
        databaseMode: mode,
        configured: false,
        reachable: false,
      },
    });
  }

  const { error } = await admin
    .from("agents")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({
      ok: true,
      data: {
        mode: "json-fallback",
        databaseMode: mode,
        configured: true,
        reachable: false,
        error: error.message,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      /** 兼容旧字段：mode 仍叫 supabase（因为业务代码走 supabase 风格 API），
       * databaseMode 才是真实的底层（postgres | supabase | json）。 */
      mode: "supabase",
      databaseMode: mode,
      configured: true,
      reachable: true,
    },
  });
}
