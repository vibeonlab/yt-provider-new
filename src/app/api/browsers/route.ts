import { NextResponse } from "next/server";
import {
  addBrowser,
  deleteBrowser,
  listBrowserConfigs,
  listBrowserStatuses,
} from "@/lib/mock/browserStore";

export async function GET() {
  // Merge config + live status so system page can show connection info too.
  const configs = listBrowserConfigs();
  const statuses = listBrowserStatuses();
  const statusMap = new Map(statuses.map((s) => [s.id, s]));
  const merged = configs.map((c) => ({
    ...c,
    connected: statusMap.get(c.id)?.connected ?? false,
    tabsCount: statusMap.get(c.id)?.tabsCount ?? 0,
    activeUrl: statusMap.get(c.id)?.activeUrl ?? "",
  }));
  return NextResponse.json({ ok: true, data: merged });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name: string; wsUrl: string };
  const name = body?.name?.trim();
  const wsUrl = body?.wsUrl?.trim();

  if (!name || !wsUrl) {
    return NextResponse.json(
      { ok: false, error: "缺少 name 或 wsUrl" },
      { status: 400 },
    );
  }

  const created = addBrowser({ name, wsUrl });
  return NextResponse.json({ ok: true, data: created }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = (await req.json()) as { id: string };
  const id = body?.id?.trim();

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "缺少 id" },
      { status: 400 },
    );
  }

  deleteBrowser(id);
  return NextResponse.json({ ok: true });
}

