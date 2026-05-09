import { NextResponse } from "next/server";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";

export async function GET(): Promise<Response> {
  const result = await runScheduledCronSync();
  return NextResponse.json({ ok: true, processed: result.processed });
}
