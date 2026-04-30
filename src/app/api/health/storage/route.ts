import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({
      ok: true,
      data: {
        mode: "json-fallback",
        supabaseConfigured: false,
        supabaseReachable: false,
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
        supabaseConfigured: true,
        supabaseReachable: false,
        error: error.message,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      mode: "supabase",
      supabaseConfigured: true,
      supabaseReachable: true,
    },
  });
}

