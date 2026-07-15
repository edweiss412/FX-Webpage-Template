import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { serializeWarningArray } from "./serializeWarning";
import {
  clampLimit,
  type PublishedWarningsFilters,
  type PublishedWarningsRow,
  type QueryPublishedWarningsResult,
} from "./types";

// §5.0: financials / raw_unrecognized are NEVER selected. shows(title, slug)
// embed rides the shows_internal.show_id → shows(id) FK (class H precedent —
// events/alerts already print title/slug raw).
const SELECT = "show_id, parse_warnings, shows(title, slug)";

type RawRow = {
  show_id: string;
  parse_warnings: unknown;
  shows: { title: string | null; slug: string | null } | { title: string | null; slug: string | null }[] | null;
};

export async function queryPublishedWarnings(
  filters: PublishedWarningsFilters,
): Promise<QueryPublishedWarningsResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("shows_internal")
      .select(SELECT, { count: "exact" })
      // First-element-exists, BEFORE the cap: warning-free/NULL/malformed rows
      // can never consume the page (Codex R1 F2 + R2 F3).
      .not("parse_warnings->0", "is", null);
    if (filters.showId) query = query.eq("show_id", filters.showId);
    const { data, error } = await query
      .order("show_id", { ascending: true })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "shows_internal read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): PublishedWarningsRow => {
      const show = Array.isArray(r.shows) ? r.shows[0] : r.shows;
      return {
        showId: r.show_id,
        showTitle: show?.title ?? null,
        showSlug: show?.slug ?? null,
        warnings: serializeWarningArray(r.parse_warnings, { includePii }),
      };
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "shows_internal read threw" };
  }
}
