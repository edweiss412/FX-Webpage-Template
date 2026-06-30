import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";
import { summarizeSync } from "@/lib/cron/summarizeSync";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("sync", request, async () => {
    const result = await runScheduledCronSync({ logSync: writeSyncLog });
    return {
      response: NextResponse.json({ ok: true, processed: result.processed }),
      summary: summarizeSync(result),
    };
  });
}
