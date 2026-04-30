import { NextResponse } from "next/server";
import { listOperationLogs } from "@/lib/server/operationLogs";

export async function GET() {
  const data = await listOperationLogs();
  return NextResponse.json({ ok: true, data });
}

