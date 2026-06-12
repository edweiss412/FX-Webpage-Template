import { NextResponse, type NextRequest } from "next/server";

import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runDigestNotify, runRealtimeNotify, type NotifyRunResult } from "@/lib/notify/runNotify";

/**
 * The orchestrators never throw; they RECORD dependency faults as data
 * (`delivery: { kind:'infra_error' }` and per-step `maintenance[].result.kind`).
 * The body always carries those recorded outcomes, but pg_cron / pg_net only see
 * the HTTP STATUS, so a 200 on a real infra fault would report scheduler-level
 * success while notifications / maintenance silently failed. Surface any infra
 * fault as a 5xx (the recorded-not-swallowed §4.4 intent) while keeping the full
 * result in the body. Deliberate skips (toggle off, config invalid, outside the
 * digest window) are NOT faults and stay 200.
 *
 * M12.13 §4.2 R27/R28: a PARTIAL per-kind toggle fault recorded inside an
 * otherwise-ok result — `toggleFaults` on the delivery summary (R27) or on a
 * maintenance step result (R28) — is ALSO a 5xx: bearer-token undo emails (or
 * their failure reconciliation) were silently dropped fail-closed, and the
 * scheduler must see that degradation. Deliberate toggle-OFF skips never carry
 * `toggleFaults` and remain 200.
 */
function recordsToggleFault(result: { toggleFaults?: string[] }): boolean {
  return (result.toggleFaults?.length ?? 0) > 0;
}

function statusFor(result: NotifyRunResult): number {
  const deliveryFault =
    result.delivery.kind === "infra_error" || recordsToggleFault(result.delivery);
  const maintenanceFault = result.maintenance.some(
    (step) => step.result.kind === "infra_error" || recordsToggleFault(step.result),
  );
  return deliveryFault || maintenanceFault ? 500 : 200;
}

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const job = new URL(request.url).searchParams.get("job");
  if (job === "realtime" || job === "digest") {
    const result = job === "realtime" ? await runRealtimeNotify() : await runDigestNotify();
    return NextResponse.json(result, { status: statusFor(result) });
  }

  return NextResponse.json({ ok: false, error: "unknown job" }, { status: 400 });
}
