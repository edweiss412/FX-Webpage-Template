// lib/admin/healthRollup.ts
//
// Bounded, EXACT app-health rollup (spec 2026-07-04-alert-audience-split §6.1).
// Runs on every admin layout render, so every signal is a `count:"exact",
// head:true` probe — never an unbounded row fetch PostgREST could silently
// truncate. Mirrors fetchUnresolvedAlertCount (lib/admin/alertCount.ts):
// construct client in try/catch → { kind:"infra_error" } on throw; each probe
// is validated SOLELY on `typeof count === "number"` (a head probe returns
// data:null by design — that is NORMAL, not an integrity failure).
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HEALTH_CODES, DEGRADED_HEALTH_CODES, dougSummaryFor } from "@/lib/adminAlerts/audience";

export type HealthSummaryLine = { text: string; count: number };
export type HealthStatus =
  | { kind: "ok" }
  | {
      kind: "notice" | "degraded";
      count: number;
      summaries: HealthSummaryLine[];
      overflowCount: number;
    }
  | { kind: "infra_error" };

/** Doug popover display cap (§6.4). Extra distinct summaries overflow to "+N more". */
export const POPOVER_SUMMARY_CAP = 4;

export async function fetchHealthRollup(): Promise<HealthStatus> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }

  // 1. Exact total head count over HEALTH_CODES. Short-circuit on the common
  //    healthy state so it costs a single count query.
  let totalCount: number;
  try {
    const query = supabase
      .from("admin_alerts")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("code", HEALTH_CODES);
    const { data: _total, count, error } = await query; // invariant 9: destructure { data, error }
    void _total;
    if (error || typeof count !== "number") return { kind: "infra_error" };
    totalCount = count;
  } catch {
    return { kind: "infra_error" };
  }
  if (totalCount === 0) return { kind: "ok" };

  // 2. Exact head count over DEGRADED_HEALTH_CODES → worst-active weight. An
  //    exact count can NEVER miss a red (no row scan to truncate).
  let kind: "degraded" | "notice";
  try {
    const query = supabase
      .from("admin_alerts")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("code", DEGRADED_HEALTH_CODES);
    const { data: _deg, count, error } = await query; // invariant 9
    void _deg;
    if (error || typeof count !== "number") return { kind: "infra_error" };
    kind = count > 0 ? "degraded" : "notice";
  } catch {
    return { kind: "infra_error" };
  }

  // 3. Exact per-code head counts over the ≤26 HEALTH_CODES (parallel; each a
  //    bounded count-head probe). Because every count is exact, no summary is
  //    omitted from the DATA SOURCE by sample truncation.
  let perCode: Array<{ code: string; count: number }>;
  try {
    perCode = await Promise.all(
      HEALTH_CODES.map(async (code) => {
        const query = supabase
          .from("admin_alerts")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null)
          .eq("code", code);
        const { data: _c, count, error } = await query; // invariant 9
        void _c;
        if (error || typeof count !== "number") throw new Error("per-code health count failed");
        return { code, count };
      }),
    );
  } catch {
    return { kind: "infra_error" };
  }

  const degradedSet = new Set(DEGRADED_HEALTH_CODES);
  const byText = new Map<string, { text: string; count: number; degraded: boolean }>();
  for (const { code, count } of perCode) {
    if (count <= 0) continue;
    const text = dougSummaryFor(code);
    if (!text) continue;
    const isDegraded = degradedSet.has(code);
    const existing = byText.get(text);
    if (existing) {
      existing.count += count;
      existing.degraded = existing.degraded || isDegraded;
    } else {
      byText.set(text, { text, count, degraded: isDegraded });
    }
  }
  const distinct = [...byText.values()].sort((a, b) => {
    if (a.degraded !== b.degraded) return a.degraded ? -1 : 1;
    return b.count - a.count;
  });
  const summaries: HealthSummaryLine[] = distinct
    .slice(0, POPOVER_SUMMARY_CAP)
    .map(({ text, count }) => ({ text, count }));
  const overflowCount = Math.max(0, distinct.length - POPOVER_SUMMARY_CAP);

  return { kind, count: totalCount, summaries, overflowCount };
}
