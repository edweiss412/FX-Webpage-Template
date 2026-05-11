import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runDiagramGc } from "@/lib/sync/diagramGc";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const result = await runDiagramGc();
  return NextResponse.json({ ok: true, ...result });
}
