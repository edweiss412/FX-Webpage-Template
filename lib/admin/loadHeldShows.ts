/**
 * lib/admin/loadHeldShows.ts (Task E1 — spec §5)
 *
 * Loader for the /admin/unpublished view: the Held shows (created but never
 * published — the "leave a clean sheet unchecked during setup" destination).
 *
 * Held = `published = false AND archived = false AND NOT finalize-owned`. The
 * finalize-owned exclusion reuses the SAME `readfinalizeowned_b2` SECURITY
 * DEFINER predicate the dashboard uses (components/admin/Dashboard.tsx
 * `readFinalizeOwned`, spec §5) — a transient "Publishing…" row (an active
 * wizard finalize checkpoint still owns the show) is NOT Held and must not
 * appear here. `requires_resync` is explicitly NOT a proxy (a clean Unarchive
 * catch-up clears it, so the normal Held state has requires_resync=false —
 * Dashboard.tsx:290-296).
 *
 * Every Supabase await is wrapped per AGENTS.md invariant 9 (typed
 * infra_error, table-specific "…threw" message). The finalize-owned RPC
 * fan-out fails TOWARD Held (id omitted) on any per-call fault, mirroring the
 * dashboard — a hiccup never hides a genuinely-Held show. Registered in
 * tests/admin/_metaInfraContract.test.ts (infraRegistry).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowDate } from "@/lib/time/now";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

// Bounded fan-out for the finalize-owned RPC reads (mirrors the dashboard's
// FINALIZE_OWNED_CONCURRENCY): sequential chunks, parallel within a chunk, so a
// burst of Held rows never opens an unbounded Promise.all.
const FINALIZE_OWNED_CONCURRENCY = 6;
// Bound the rendered list (Held is a small set; this is a safety cap so the
// page never tries to fan out the RPC over an unbounded row count).
const HELD_SHOWS_CAP = 200;

type DatesJson = {
  travelIn?: string | null;
  set?: string | null;
  showDays?: unknown;
  travelOut?: string | null;
};

// Inlined from Dashboard.tsx (local, not exported there) — derive a display
// start/end from the parsed dates JSON. Kept local so this loader does not
// reach into the dashboard's private helpers (no new shared coupling).
function deriveStart(dates: DatesJson | null): string | null {
  if (!dates) return null;
  const candidates: string[] = [];
  if (typeof dates.travelIn === "string") candidates.push(dates.travelIn);
  if (typeof dates.set === "string") candidates.push(dates.set);
  if (Array.isArray(dates.showDays) && dates.showDays.length > 0) {
    const first = dates.showDays[0];
    if (typeof first === "string") candidates.push(first);
  }
  if (candidates.length === 0) return null;
  return candidates.sort()[0] ?? null;
}

function deriveEnd(dates: DatesJson | null): string | null {
  if (!dates) return null;
  const candidates: string[] = [];
  if (Array.isArray(dates.showDays) && dates.showDays.length > 0) {
    const last = dates.showDays[dates.showDays.length - 1];
    if (typeof last === "string") candidates.push(last);
  }
  if (typeof dates.travelOut === "string") candidates.push(dates.travelOut);
  if (candidates.length === 0) return null;
  return candidates.sort().reverse()[0] ?? null;
}

export type LoadHeldShowsResult =
  | { kind: "ok"; rows: ActiveShowRow[]; now: Date }
  | { kind: "infra_error"; message: string };

export async function loadHeldShows(
  opts: {
    supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    now?: Date;
  } = {},
): Promise<LoadHeldShowsResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  if (opts.supabase) {
    supabase = opts.supabase;
  } else {
    try {
      supabase = await createSupabaseServerClient();
    } catch (err) {
      return {
        kind: "infra_error",
        message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const now = opts.now ?? (await nowDate());

  // ── Held candidates: archived=false AND published=false, bounded. ──
  // (The finalize-owned subset is excluded below via the RPC fan-out.)
  let showsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data, error } = await supabase
      .from("shows")
      .select(
        "id, slug, title, drive_file_id, dates, last_synced_at, last_sync_status, published, archived_at",
      )
      .eq("archived", false)
      .eq("published", false)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(HELD_SHOWS_CAP);
    if (error) {
      return { kind: "infra_error", message: `shows query failed: ${error.message}` };
    }
    showsRows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const candidateIds = showsRows.map((s) => s.id as string);

  // ── Per-show data-gaps (parse-data-quality-warnings §6.2b / Task 9). Read
  // shows_internal.parse_warnings for the held candidates and derive each show's
  // summarizeDataGaps. INVARIANT 9 (R10 F1): a returned error OR a thrown error
  // becomes a DISCRIMINABLE infra_error — NEVER a silent {total:0}. Collapsing a
  // failed read to "no data gaps" would hide warnings, recreating the exact
  // silent-drop this feature exists to kill, so this read FAILS VISIBLE (unlike
  // the finalize-owned RPC below, which fails TOWARD-Held by design). A show
  // genuinely absent from shows_internal (or with an empty array) → total 0 → no
  // chip; that null/absent case is kept distinct from a read failure.
  const dataGapsByShowId = new Map<string, DataGapsSummary>();
  if (candidateIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("shows_internal")
        .select("show_id, parse_warnings")
        .in("show_id", candidateIds);
      if (error) {
        return { kind: "infra_error", message: `shows_internal query failed: ${error.message}` };
      }
      for (const row of (data ?? []) as ReadonlyArray<Record<string, unknown>>) {
        const showId = row.show_id as string;
        const warnings = Array.isArray(row.parse_warnings)
          ? (row.parse_warnings as ParseWarning[])
          : [];
        dataGapsByShowId.set(showId, summarizeDataGaps(warnings));
      }
    } catch (err) {
      return {
        kind: "infra_error",
        message: `shows_internal query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Finalize-owned exclusion (the "Publishing…" set). Same predicate the
  // dashboard uses. Fail TOWARD Held (id omitted) on any per-call fault so a
  // hiccup never hides a Held show — the conservative direction here (a stray
  // Publishing… row showing for a beat is harmless; hiding a Held show is not).
  const finalizeOwnedIds = new Set<string>();
  for (let i = 0; i < candidateIds.length; i += FINALIZE_OWNED_CONCURRENCY) {
    const batch = candidateIds.slice(i, i + FINALIZE_OWNED_CONCURRENCY);
    const resolved = await Promise.all(
      batch.map((id) =>
        Promise.resolve()
          .then(() => supabase.rpc("readfinalizeowned_b2", { p_show_id: id }))
          .then(({ data, error }) => (!error && data === true ? id : null))
          .catch(() => null),
      ),
    );
    for (const id of resolved) if (id) finalizeOwnedIds.add(id);
  }

  const rows: ActiveShowRow[] = showsRows
    .filter((s) => !finalizeOwnedIds.has(s.id as string))
    .map((s) => {
      const dates = (s.dates as DatesJson | null) ?? null;
      return {
        id: s.id as string,
        slug: s.slug as string,
        title: (s.title as string | null) ?? null,
        showDateStart: deriveStart(dates),
        showDateEnd: deriveEnd(dates),
        // Crew count is not surfaced on this view (the Held list is about the
        // publish decision, not crew totals); null keeps the type satisfied and
        // the Crew column renders "0 crew" without a per-show crew read.
        crewCount: null,
        lastSyncedAt: (s.last_synced_at as string | null) ?? null,
        lastSyncStatus: (s.last_sync_status as string | null) ?? null,
        // A Held show is never published and never live.
        published: false,
        isLive: false,
        // Held by construction (finalize-owned rows were filtered out above), so
        // ShowsTable's StatePill renders the "Held — not published" pill.
        finalizeOwned: false,
        archivedAt: null,
        // parse-data-quality-warnings §6.2b — per-show data-gaps summary (absent
        // from shows_internal → {total:0} → no chip). A read FAILURE returned
        // earlier as infra_error, so reaching here means the read succeeded.
        dataGaps: dataGapsByShowId.get(s.id as string) ?? summarizeDataGaps([]),
      };
    });

  return { kind: "ok", rows, now };
}
