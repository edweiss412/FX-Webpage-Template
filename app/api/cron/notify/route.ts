import { NextResponse, type NextRequest } from "next/server";

import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runDigestNotify, runRealtimeNotify } from "@/lib/notify/runNotify";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const job = new URL(request.url).searchParams.get("job");
  if (job === "realtime") return NextResponse.json(await runRealtimeNotify());
  if (job === "digest") return NextResponse.json(await runDigestNotify());

  return NextResponse.json({ ok: false, error: "unknown job" }, { status: 400 });
}
