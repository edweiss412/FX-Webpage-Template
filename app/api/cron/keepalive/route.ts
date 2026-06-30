import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("keepalive", request, async () => ({
    response: NextResponse.json({ ok: true }),
    summary: { outcome: "ok" },
  }));
}
