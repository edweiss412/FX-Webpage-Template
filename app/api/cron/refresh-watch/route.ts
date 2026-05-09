import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { refreshWatchSubscriptions } from "@/lib/drive/watch";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const result = await refreshWatchSubscriptions();
  return NextResponse.json({ ok: true, refreshed: result.refreshed });
}
