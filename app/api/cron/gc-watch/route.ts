import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { gcWatchChannels } from "@/lib/drive/watch";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("gc-watch", request, async () => {
    const result = await gcWatchChannels();
    return {
      response: NextResponse.json({ ok: true, stopped: result.stopped }),
      summary: { outcome: "ok", counts: { stopped: result.stopped.length } },
    };
  });
}
