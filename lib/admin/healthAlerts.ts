// lib/admin/healthAlerts.ts
//
// Paginated developer-detail loader for the HealthAlertsPanel on
// /admin/dev/telemetry (spec 2026-07-04-alert-audience-split §6.6).
//
// Health weight lives in the CATALOG, not a DB column, so the panel orders
// "degraded before notice" via TWO partitioned queries — this loader runs ONE
// partition per call (`weight`). Each query requests SIZE+1 rows via
// `.range(page*SIZE, page*SIZE+SIZE)` (inclusive both ends → SIZE+1 rows) so a
// full page is distinguishable from a larger partition: `hasMore =
// data.length > SIZE`, `rows = data.slice(0, SIZE)`. A bare .range(...,SIZE-1)
// (exactly SIZE) could not tell a full page from an overflowing partition.
//
// Typed reads (invariant 9): destructure { data, error }; construction throw /
// returned error / any await throw → { kind:"infra_error" } (the panel degrades
// VISIBLE on it, never a silent empty). Bounded per _metaBoundedReads via .range.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEGRADED_HEALTH_CODES, NOTICE_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";
import {
  resolveAlertIdentities,
  type AlertIdentitiesResult,
} from "@/lib/adminAlerts/resolveAlertIdentities";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import { log } from "@/lib/log";

export const HEALTH_PANEL_PAGE_SIZE = 50;

export type HealthAlertRow = {
  id: string;
  code: string;
  show_id: string | null;
  slug: string | null;
  context: Record<string, unknown> | null;
  occurrence_count: number;
  raised_at: string;
  // At-a-glance identity (alert-at-a-glance-identity extension to the health
  // UI). Resolved crew/show/sheet/email line, or null for global/uncataloged
  // codes. DEFINITE field (exactOptionalPropertyTypes ON) — never
  // optional-undefined. includePii:true (developer-only page → raw email OK).
  identityText: string | null;
};

export type LoadHealthAlertsResult =
  | { kind: "ok"; rows: HealthAlertRow[]; hasMore: boolean }
  | { kind: "infra_error" };

// The `shows(slug)` embed returns an object, null, or (defensively) an array.
function embeddedSlug(shows: unknown): string | null {
  if (!shows) return null;
  const row = Array.isArray(shows) ? shows[0] : shows;
  if (row && typeof row === "object" && typeof (row as { slug?: unknown }).slug === "string") {
    return (row as { slug: string }).slug;
  }
  return null;
}

export async function loadHealthAlerts({
  weight,
  page,
}: {
  weight: "degraded" | "notice";
  page: number;
}): Promise<LoadHealthAlertsResult> {
  const codes = weight === "degraded" ? DEGRADED_HEALTH_CODES : NOTICE_HEALTH_CODES;
  // Clamp non-numeric / negative page params to 0 (crafted ?dpage=foo / ?dpage=-1).
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;
  const SIZE = HEALTH_PANEL_PAGE_SIZE;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }

  // Read the health-alert rows. This try/catch wraps ONLY the read so the
  // supabase-derived await's catch stays adjacent to it (invariant 9 /
  // tests/admin/_metaInfraContract catch-window). Identity resolution is a
  // SEPARATE step below with its own try/catch — mirroring fetchPerShowAlerts
  // (read in its own try, resolve after) — so the additive resolve block never
  // lengthens the read's try body.
  let rows: Omit<HealthAlertRow, "identityText">[];
  let hasMore: boolean;
  try {
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, code, show_id, context, occurrence_count, raised_at, shows(slug)")
      .in("code", codes)
      .is("resolved_at", null)
      .order("raised_at", { ascending: false })
      .range(safePage * SIZE, safePage * SIZE + SIZE); // SIZE+1 rows (inclusive range)
    if (error) return { kind: "infra_error" };
    const arr = Array.isArray(data) ? data : [];
    hasMore = arr.length > SIZE;
    rows = arr.slice(0, SIZE).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        code: r.code as string,
        show_id: (r.show_id as string | null) ?? null,
        slug: embeddedSlug(r.shows),
        context: (r.context as Record<string, unknown> | null) ?? null,
        occurrence_count: typeof r.occurrence_count === "number" ? r.occurrence_count : 0,
        raised_at: r.raised_at as string,
      };
    });
  } catch {
    return { kind: "infra_error" };
  }

  // At-a-glance identity (spec §3.1–§3.3), mirroring fetchPerShowAlerts.
  // Health alerts carry their OWN scope, so each row's OWN show_id is the
  // ResolverRow show_id (NOT an injected page-level id). Resolve ONCE over the
  // SLICED page rows (≤SIZE) so batching stays bounded (≤3 reads). includePii:
  // true — the telemetry page is requireDeveloper-gated. The resolver never
  // throws on a returned DB error (it degrades to kind:"infra_error" with a
  // partial/empty map), but wrap defensively; on ANY fault (thrown OR
  // infra_error) log a degraded event and use whatever survived — but STILL
  // return every row (identity is additive, never gating).
  const resolverRows = rows.map((r) => ({
    id: r.id,
    code: r.code,
    show_id: r.show_id,
    occurrence_count: r.occurrence_count,
    identityContext: projectIdentityContext(r.context, { includePii: true }),
  }));
  let identities: AlertIdentitiesResult["identities"] = new Map();
  try {
    const resolved = await resolveAlertIdentities(
      resolverRows,
      // The full SupabaseClient generic is deeper than the resolver's narrow
      // SupabaseLike shape; TS can flag TS2589 on the direct pass. Cast through
      // the resolver's own parameter type (production precedent:
      // app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts).
      supabase as unknown as Parameters<typeof resolveAlertIdentities>[1],
      { includePii: true },
    );
    // Use the (possibly partial) map REGARDLESS of kind — on infra_error it
    // still carries whatever resolved before the fault (spec §3.2 partial
    // degradation; e.g. the email segment survives a failed crew lookup).
    identities = resolved.identities;
    if (resolved.kind === "infra_error") {
      log.error("alert identity resolve degraded", { source: "admin.healthAlerts" });
    }
  } catch (err) {
    log.error("alert identity resolve degraded", { source: "admin.healthAlerts", error: err });
  }

  const withIdentity: HealthAlertRow[] = rows.map((r) => {
    const identity = identities.get(r.id);
    return { ...r, identityText: identity ? describeAlert(identity, { includePii: true }) : null };
  });
  return { kind: "ok", rows: withIdentity, hasMore };
}
