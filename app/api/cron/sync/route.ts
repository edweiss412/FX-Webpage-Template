import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const result = await runScheduledCronSync();
  return NextResponse.json({ ok: true, processed: result.processed });
}
