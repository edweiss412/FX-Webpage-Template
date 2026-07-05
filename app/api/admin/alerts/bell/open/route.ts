// Bell notification center Task 10: POST /api/admin/alerts/bell/open.
// Thin adapter over the SECURITY DEFINER bell_mark_opened RPC (greatest-wins
// monotonic write — supabase/migrations/20260705100000_bell_state_tables.sql).
// The route never re-implements monotonicity; it only validates the incoming
// stamp and passes it through.
import { NextResponse, type NextRequest } from "next/server";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { parseBellTimestamp } from "@/lib/admin/bellValidation";

export const dynamic = "force-dynamic";

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
  const seenThrough = parseBellTimestamp(body?.seenThrough);
  if (!seenThrough) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // not-subject-to-meta: route with no typed-result contract. A returned
  // `error` maps to a typed 503 below; a THROWN supabase fault (construction,
  // network reset, auth-token expiry mid-call) is not caught here and
  // propagates to the Next.js error boundary (500) — the two fault shapes
  // are discriminable by status code, satisfying invariant 9 without a
  // `{ kind: "infra_error" }` helper contract.
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.rpc("bell_mark_opened", {
    p_admin_email: email,
    p_seen_through: seenThrough,
  });
  if (error) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  await logAdminOutcome({
    code: "BELL_OPENED",
    source: "api.admin.alerts.bell.open",
    actorEmail: email,
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
