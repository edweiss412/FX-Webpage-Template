import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { refreshWatchSubscriptions, reconcileWatchChannels } from "@/lib/drive/watch";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("refresh-watch", request, async () => {
    const refresh = await refreshWatchSubscriptions();
    const reconcile = await reconcileWatchChannels(refresh);
    const infra = refresh.failures.length > 0 || reconcile.outcome === "infra_error";
    const body = {
      ok: !infra,
      refreshed: refresh.refreshed,
      refreshOrphaned: refresh.orphaned,
      refreshFailures: refresh.failures.length,
      reconcile: infra
        ? { outcome: reconcile.outcome, faults: reconcile.faults }
        : {
            outcome: reconcile.outcome,
            sweptPending: reconcile.sweptPending,
            escalated: reconcile.escalated,
          },
    };
    return {
      response: NextResponse.json(body, { status: infra ? 500 : 200 }),
      summary: {
        outcome: infra ? "infra" : "ok",
        counts: {
          refreshed: refresh.refreshed.length,
          refreshFailures: refresh.failures.length,
          sweptPending: reconcile.sweptPending,
          escalated: reconcile.escalated ? 1 : 0,
        },
      },
    };
  });
}
