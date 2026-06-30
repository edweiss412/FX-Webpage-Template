import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { refreshWatchSubscriptions } from "@/lib/drive/watch";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("refresh-watch", request, async () => {
    const result = await refreshWatchSubscriptions();
    return {
      response: NextResponse.json({ ok: true, refreshed: result.refreshed }),
      summary: { outcome: "ok", counts: { refreshed: result.refreshed.length } },
    };
  });
}
