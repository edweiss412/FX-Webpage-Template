import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";
import { summarizeSync } from "@/lib/cron/summarizeSync";
// not-subject-to-meta: cron summary annotation, fail-open by contract
import { annotateSyncStateChange } from "@/lib/cron/annotateSyncStateChange";

// The scheduled sync processes every watched show in one invocation; each show's enrichment step
// may run agenda-PDF work up to ENRICH_STEP_TIMEOUT_MS (lib/sync/runScheduledCronSync.ts). 300s is
// the platform ceiling every sibling sync route pins explicitly (app/api/admin/onboarding/
// {extract-agenda,finalize,finalize-cas,scan}); pin it here too so the enrich budget is grounded in
// this route's own contract, not an implicit default (audit idx57 HIGH-2).
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("sync", request, async () => {
    const result = await runScheduledCronSync({ logSync: writeSyncLog });
    return {
      response: NextResponse.json({ ok: true, processed: result.processed }),
      summary: await annotateSyncStateChange(summarizeSync(result)),
    };
  });
}
