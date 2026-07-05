// Bell notification center Task 11: POST /api/admin/alerts/bell/config.
// Developer-gated (spec §3.4/§9): the only write path for
// app_settings.bell_history_days / bell_feed_cap. Out-of-range or non-integer
// input is a 400 that echoes BELL_LIMITS back (no silent clamp) so the dev
// footer can render the accepted bounds.
import { NextResponse, type NextRequest } from "next/server";
import { DeveloperInfraError, requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";

export const dynamic = "force-dynamic";

function parseBellConfigField(value: unknown, bounds: { min: number; max: number }): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < bounds.min || value > bounds.max) return null;
  return value;
}

export async function POST(request: NextRequest) {
  let email: string;
  try {
    ({ email } = await requireDeveloperIdentity());
  } catch (err) {
    if (err instanceof DeveloperInfraError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw err; // forbidden()/redirect() control flow propagates to Next
  }

  const body = await request.json().catch(() => null);
  const historyDays = parseBellConfigField(body?.historyDays, BELL_LIMITS.historyDays);
  const feedCap = parseBellConfigField(body?.feedCap, BELL_LIMITS.feedCap);
  if (historyDays === null || feedCap === null) {
    return NextResponse.json({ error: "invalid", limits: BELL_LIMITS }, { status: 400 });
  }

  // not-subject-to-meta: route with no typed-result contract, same reasoning
  // as the bell open/read routes — a returned `error` maps to a typed 503
  // below; a THROWN supabase fault (construction, network reset, auth-token
  // expiry mid-call) is not caught here and propagates to the Next.js error
  // boundary (500) — the two fault shapes are discriminable by status code,
  // satisfying invariant 9 without a `{ kind: "infra_error" }` helper contract.
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({ bell_history_days: historyDays, bell_feed_cap: feedCap })
    .eq("id", "default")
    .select("id");
  if (error || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  await logAdminOutcome({
    code: "BELL_CONFIG_UPDATED",
    source: "api.admin.alerts.bell.config",
    actorEmail: email,
    extra: { historyDays, feedCap },
  });
  return NextResponse.json(
    { ok: true, historyDays, feedCap },
    { headers: { "Cache-Control": "no-store" } },
  );
}
