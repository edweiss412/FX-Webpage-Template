/**
 * lib/adminAlerts/fetchPerShowAlerts.ts
 *
 * The per-show admin_alerts read path (relocated from the retired
 * PerShowAlertSection per spec 2026-07-19-published-show-alerts §3.1a; M10 §B
 * Task 10.7 lineage). Reads unresolved per-show rows (admin_alerts WHERE
 * show_id = $showId AND resolved_at IS NULL, HEALTH codes excluded), resolves
 * at-a-glance identity ONCE, and now also extracts `crewName` — the single
 * resolvable crew display name — for the attention surface's under-crew-row
 * banner placement.
 *
 * Registered in tests/admin/_metaInfraContract.test.ts (AGENTS.md invariant 9);
 * the registry row's path points here.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";
import { resolveAlertIdentities } from "@/lib/adminAlerts/resolveAlertIdentities";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import { deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { MessageParams } from "@/lib/messages/lookup";

export type AdminAlertRow = {
  id: string;
  code: string;
  context: Record<string, unknown> | null;
  raised_at: string;
  /** admin_alerts.occurrence_count (NOT NULL default 1) — drives the resolver's coalescing disclosure. */
  occurrence_count: number;
  /**
   * At-a-glance identity line (alert-at-a-glance-identity spec §3.1–§3.3): the
   * resolved crew/show/email/count string, or null for global / empty /
   * unknown-code / degraded rows. Definite field (exactOptionalPropertyTypes).
   */
  identityText: string | null;
  /**
   * Read-time template params (condensed-alert-copy §4.1): raw producer context
   * scalars merged with derived always-resolving keys.
   */
  messageParams: MessageParams;
  /**
   * The single resolvable crew display name for this alert, else null
   * (published-show-alerts §3.1a): ROLE_FLAGS_NOTICE → the sole projected
   * sanitized role-change name when exactly one change; otherwise the value of
   * an exactly-one "Crew"-labeled identity segment. Definite field.
   */
  crewName: string | null;
};

/**
 * §3.1a crewName rule. `projected` is the SAME sanitized projection the
 * resolver consumed (projectIdentityContext — capped, control-char-stripped),
 * never raw context; the segment fallback reads the resolved identity's
 * "Crew"-labeled segment (resolveAlertIdentities.ts label literal).
 */
function crewNameFor(
  code: string,
  projected: ReturnType<typeof projectIdentityContext>,
  identity: AlertIdentity | undefined,
): string | null {
  if (code === "ROLE_FLAGS_NOTICE") {
    const names = projected.display.role_change_crew_names;
    if (projected.counts.role_change_count !== 1 || !names || names.length !== 1) return null;
    const name = names[0]!;
    return name.trim().length > 0 ? name : null;
  }
  const crewSegs = (identity?.segments ?? []).filter((s) => s.label === "Crew");
  if (crewSegs.length !== 1) return null;
  const value = crewSegs[0]!.value;
  return value.trim().length > 0 ? value : null;
}

// Registered row for the §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function fetchPerShowAlerts(
  showId: string,
): Promise<AdminAlertRow[] | { kind: "infra_error"; message: string }> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  // Read the per-show alert rows. This try/catch wraps ONLY the read so the
  // supabase-derived await's catch stays adjacent to it (AGENTS.md §1.9 /
  // tests/admin/_metaInfraContract catch-window). Identity resolution is a
  // SEPARATE step below with its own try/catch.
  let rows: Omit<AdminAlertRow, "identityText" | "messageParams" | "crewName">[];
  try {
    // alert-audience-split §5: exclude `audience: "health"` codes from the
    // per-show Doug surface. HEALTH ONLY — unknown codes stay visible
    // (exclusion, not allowlist). The `.not(...in...)` value list must be
    // non-empty, so guard it.
    let query = supabase
      .from("admin_alerts")
      .select("id, code, context, raised_at, occurrence_count")
      .eq("show_id", showId)
      .is("resolved_at", null);
    if (HEALTH_CODES.length > 0) {
      query = query.not("code", "in", `(${HEALTH_CODES.map((c) => `"${c}"`).join(",")})`);
    }
    const { data, error } = await query.order("raised_at", { ascending: false });
    if (error) {
      return {
        kind: "infra_error",
        message: `admin_alerts query failed: ${error.message}`,
      };
    }
    rows = (data ?? []).map((row) => ({
      id: row.id as string,
      code: row.code as string,
      context: (row.context as Record<string, unknown> | null) ?? null,
      raised_at: row.raised_at as string,
      occurrence_count: (row.occurrence_count as number) ?? 1,
    }));
  } catch (err) {
    return {
      kind: "infra_error",
      message: `admin_alerts query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // At-a-glance identity (spec §3.1–§3.3). The caller's `showId` is
  // authoritative: injected as every row's ResolverRow `show_id`. Resolve ONCE
  // (the resolver batches all rows into ≤3 reads). On ANY fault (thrown OR
  // infra_error) log a degraded event and fall back to no identity — but STILL
  // return every alert (identity is additive, never gating). The projected
  // context is kept per row: crewName reads the SAME sanitized projection.
  const projectedById = new Map(
    rows.map((r) => [r.id, projectIdentityContext(r.context, { includePii: true })]),
  );
  const resolverRows = rows.map((r) => ({
    id: r.id,
    code: r.code,
    show_id: showId,
    occurrence_count: r.occurrence_count,
    identityContext: projectedById.get(r.id)!,
  }));
  let identities = new Map<string, AlertIdentity>();
  try {
    const resolved = await resolveAlertIdentities(
      resolverRows,
      // The full SupabaseClient generic is deeper than the resolver's narrow
      // SupabaseLike shape; cast through the resolver's own parameter type
      // (production precedent: onboarding staged apply route).
      supabase as unknown as Parameters<typeof resolveAlertIdentities>[1],
      { includePii: true },
    );
    // The resolver ALWAYS returns a (possibly partial) identities map — use it
    // REGARDLESS of kind so surviving segments still render; log when degraded.
    identities = resolved.identities;
    if (resolved.kind === "infra_error") {
      log.error("alert identity resolve degraded", {
        source: "admin.fetchPerShowAlerts",
      });
    }
  } catch (err) {
    log.error("alert identity resolve degraded", {
      source: "admin.fetchPerShowAlerts",
      error: err,
    });
  }
  return rows.map((r) => {
    const identity = identities.get(r.id);
    const identityText = identity ? describeAlert(identity, { includePii: true }) : null;
    const messageParams = deriveAlertMessageParams(r.code, r.context, identity ?? null);
    const crewName = crewNameFor(r.code, projectedById.get(r.id)!, identity);
    return { ...r, identityText, messageParams, crewName };
  });
}
