// Bell notification center Task 10: POST /api/admin/alerts/bell/read.
// Thin adapter over the SECURITY DEFINER bell_mark_read RPC (greatest-wins
// monotonic write — supabase/migrations/20260705100000_bell_state_tables.sql).
// Fail-closed visibility (spec §10): alertId validity is checked FIRST, then
// timestamp validity, then the alert must exist AND be visible to the
// viewer's tier (bellExcludedCodes) before the write ever happens — a
// non-developer viewer must not be able to distinguish "no such alert" from
// "a health alert I can't see" by probing this endpoint.
import { NextResponse, type NextRequest } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { parseBellTimestamp } from "@/lib/admin/bellValidation";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let email: string;
  try {
    ({ email } = await requireAdminIdentity());
  } catch (err) {
    if (err instanceof AdminInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/notFound() control flow propagates to Next
  }

  const body = await request.json().catch(() => null);

  // Precedence pinned (plan-review R2 candidate 3): alertId validity FIRST →
  // 404 (identifier namespace, spec §4); only then timestamp validity → 400.
  const alertId = typeof body?.alertId === "string" ? body.alertId : "";
  if (!UUID_RE.test(alertId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const seenActivityAt = parseBellTimestamp(body?.seenActivityAt);
  if (!seenActivityAt) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const viewerIsDeveloper = await isCurrentUserDeveloper();
  const supabase = createSupabaseServiceRoleClient();
  // not-subject-to-meta: route with no typed-result contract. A returned
  // `error` maps to a typed 503 below; a THROWN supabase fault (construction,
  // network reset, auth-token expiry mid-call) is not caught here and
  // propagates to the Next.js error boundary (500) — the two fault shapes
  // are discriminable by status code, satisfying invariant 9 without a
  // `{ kind: "infra_error" }` helper contract.
  const { data: rows, error: lookupError } = await supabase
    .from("admin_alerts")
    .select("id, code")
    .eq("id", alertId)
    .limit(1);
  if (lookupError) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const row = Array.isArray(rows)
    ? (rows[0] as { id: string; code: string } | undefined)
    : undefined;
  if (!row || bellExcludedCodes(viewerIsDeveloper).includes(row.code)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // not-subject-to-meta: same reasoning as the lookup above — returned
  // `error` → typed 503; a thrown fault propagates to the Next.js error
  // boundary (500), discriminable from the typed path.
  const { error } = await supabase.rpc("bell_mark_read", {
    p_alert_id: alertId,
    p_admin_email: email,
    p_seen_activity_at: seenActivityAt,
  });
  if (error) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  await logAdminOutcome({
    code: "BELL_READ_MARKED",
    source: "api.admin.alerts.bell.read",
    actorEmail: email,
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
