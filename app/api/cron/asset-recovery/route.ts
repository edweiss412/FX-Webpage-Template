import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runAssetRecoveryCron } from "@/lib/sync/assetRecovery";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";
import { summarizeAssetRecovery } from "@/lib/cron/summarizeAssetRecovery";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("asset-recovery", request, async () => {
    const result = await runAssetRecoveryCron();
    return {
      response: NextResponse.json({ ok: true, processed: result.processed }),
      summary: summarizeAssetRecovery(result),
    };
  });
}
