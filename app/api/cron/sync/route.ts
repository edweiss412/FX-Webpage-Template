import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { deriveRequestId, runWithRequestContext } from "@/lib/log";

export async function GET(request: NextRequest): Promise<Response> {
  return runWithRequestContext({ requestId: deriveRequestId(request.headers) }, async () => {
    const rejected = rejectUnauthorizedCron(request);
    if (rejected) return rejected;

    const result = await runScheduledCronSync({ logSync: writeSyncLog });
    return NextResponse.json({ ok: true, processed: result.processed });
  });
}
