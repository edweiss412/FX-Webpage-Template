import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runDiagramGc } from "@/lib/sync/diagramGc";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("diagram-gc", request, async () => {
    const result = await runDiagramGc();
    return {
      response: NextResponse.json({ ok: true, ...result }),
      summary: {
        outcome: "ok",
        counts: {
          orphanBlobsDeleted: result.orphanBlobsDeleted,
          pendingPrefixesDeleted: result.pendingPrefixesDeleted,
          promotedRowsDeleted: result.promotedRowsDeleted,
        },
      },
    };
  });
}
