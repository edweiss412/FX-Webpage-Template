import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runAssetRecoveryCron } from "@/lib/sync/assetRecovery";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const result = await runAssetRecoveryCron();
  return NextResponse.json({ ok: true, processed: result.processed });
}
