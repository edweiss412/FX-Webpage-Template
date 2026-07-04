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

export const HEALTH_PANEL_PAGE_SIZE = 50;

export type HealthAlertRow = {
  id: string;
  code: string;
  show_id: string | null;
  slug: string | null;
  context: Record<string, unknown> | null;
  occurrence_count: number;
  raised_at: string;
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
    const hasMore = arr.length > SIZE;
    const rows: HealthAlertRow[] = arr.slice(0, SIZE).map((row) => {
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
    return { kind: "ok", rows, hasMore };
  } catch {
    return { kind: "infra_error" };
  }
}
