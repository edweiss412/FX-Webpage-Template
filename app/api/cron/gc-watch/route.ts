import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { gcWatchChannels } from "@/lib/drive/watch";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const result = await gcWatchChannels();
  return NextResponse.json({ ok: true, stopped: result.stopped });
}
