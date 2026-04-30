import { NextResponse } from "next/server";
import { cleanupOldOperationLogs } from "@/lib/server/operationLogs";
import { cleanupOldCommandTasks } from "@/lib/server/schedulerStore";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const headerSecret = req.headers.get("x-cron-secret") || "";
  return headerSecret === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [logResult, taskResult] = await Promise.all([
    cleanupOldOperationLogs(),
    cleanupOldCommandTasks(),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      logs: logResult,
      tasks: taskResult,
    },
  });
}
