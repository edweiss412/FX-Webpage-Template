/**
 * components/admin/Dashboard.tsx (M12.2 Phase A — spec §3/§5)
 *
 * Post-onboarding /admin dashboard. Server Component orchestrator.
 * `fetchDashboardData` is the bounded data layer (spec §3.2/§3.3/§3.4):
 *   - Active shows = `archived = false` (BOTH published + unpublished in-flight),
 *     bounded `.limit(ACTIVE_SHOWS_CAP)` + exact `activeCount` (head:true).
 *   - per-row `isLive = published && today∈[travelIn..travelOut]` in the show's
 *     timezone (shared resolveShowTimezone), single `now` read; `liveCount = Σ`.
 *   - `crewTotal` = exact head:true count; per-show `crewCount` = paginate-
 *     until-complete (child rows never truncated, R17).
 *   - needs-attention = two bounded pending streams + bounded existence lookup,
 *     merged/sliced/classified by buildNeedsAttention (catalog-safe copy).
 *
 * Every Supabase await is wrapped per AGENTS.md §1.9 (typed infra_error).
 * The redesigned composition (StatStrip + ShowsTable ⟷ NeedsAttentionInbox +
 * footer) lands in Task 7; this file ships the data layer + interim render.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowDate } from "@/lib/time/now";
import { type ActiveShowRow } from "@/components/admin/ActiveShowsPanel";
import { DashboardFooter } from "@/components/admin/DashboardFooter";
import { StatStrip } from "@/components/admin/StatStrip";
import { ShowsTable } from "@/components/admin/ShowsTable";
import { ArchivedShowRow } from "@/components/admin/ArchivedShowRow";
import { DashboardBucketSegmentedControl } from "@/components/admin/DashboardBucketSegmentedControl";
import { unarchiveShowAction } from "@/app/admin/show/[slug]/_actions";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { formatIsoForTimezone } from "@/lib/time/rightNow";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { isShowLiveOnDate } from "@/lib/time/showSpan";
import { RENDER_CAP, type NeedsAttention } from "@/lib/admin/needsAttention";
import { loadNeedsAttention } from "@/lib/admin/loadNeedsAttention";

// V7 — pinned literals, chosen ≫ FXAV scale and < PostgREST's ~1000 row cap.
export const ACTIVE_SHOWS_CAP = 500;
// Page size for the per-show crew-count paginate-until-complete loop (R17).
export const CREW_PAGE_SIZE = 1000;

// M12.2 Phase B2 (§3.1) — the dashboard show list is a two-state segmented
// bucket. The selected segment is a URL search-param threaded from the page;
// the RSC re-fetches server-side so back/forward + refresh behave.
export type DashboardBucket = "active" | "archived";

export type DashboardData = {
  rows: ActiveShowRow[];
  // Which segment `rows` belongs to (echoed back so the component can render
  // the right list shape — read-only ArchivedShowRows vs ShowsTable).
  bucket: DashboardBucket;
  activeCount: number;
  // M12.2 Phase B2 (§3.1) — ALWAYS computed (the inactive segment's label needs
  // its count even when its rows aren't fetched), via a count-only head query.
  archivedCount: number;
  liveCount: number;
  needReviewCount: number;
  crewTotal: number;
  statsScope: "global" | "shown";
  overflowCount: number;
  needsAttention: NeedsAttention;
};

type DatesJson = {
  travelIn?: string | null;
  set?: string | null;
  showDays?: unknown;
  travelOut?: string | null;
};

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

// Exported for tests/admin/_metaInfraContract.test.ts — registry row for the
// §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function fetchDashboardData(
  options: { bucket?: DashboardBucket } = {},
): Promise<DashboardData | { kind: "infra_error"; message: string }> {
  // §3.1 — default to the Active segment; the page threads the ?bucket param.
  const bucket: DashboardBucket = options.bucket === "archived" ? "archived" : "active";
  const isArchived = bucket === "archived";
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const now = await nowDate();

  // ── Show list for the SELECTED segment, bounded (§3.1) ──
  //   Active   = archived=false (Live + Publishing… + Held), ordered by sync.
  //   Archived = archived=true, ordered archived_at DESC NULLS LAST, id
  //              (deterministic — most-recently-archived first; null times last,
  //              tie-broken by id so the order is stable across reads).
  // `archived_at` feeds the ArchivedShowRow time line (§3.1). (The
  // Held-vs-Publishing pill split is sourced from the readfinalizeowned_b2 RPC
  // below — NOT requires_resync, which a clean Unarchive catch-up clears.)
  // Ordering tuple for the selected segment: archived → archived_at DESC NULLS
  // LAST then id (deterministic, null times last); active → last_synced_at DESC.
  // Built as data so the query below stays ONE chained `.from().select()…limit()`
  // statement (the bounded-read meta-test, tests/admin/_metaBoundedReads.test.ts,
  // splits on `;` and requires the `.limit(` bound in the same statement).
  const showOrder: ReadonlyArray<[string, { ascending: boolean; nullsFirst: boolean }]> =
    isArchived
      ? [
          ["archived_at", { ascending: false, nullsFirst: false }],
          ["id", { ascending: true, nullsFirst: false }],
        ]
      : [["last_synced_at", { ascending: false, nullsFirst: false }]];

  let showsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await showOrder
      .reduce(
        (acc, [col, opts]) => acc.order(col, opts),
        supabase
          .from("shows")
          .select(
            "id, slug, title, drive_file_id, dates, venue, last_synced_at, last_sync_status, published, requires_resync, archived_at",
          )
          .eq("archived", isArchived),
      )
      .limit(ACTIVE_SHOWS_CAP);
    if (q.error) {
      return { kind: "infra_error", message: `shows query failed: ${q.error.message}` };
    }
    showsRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Exact totals — truthful even if the rendered list is capped (§3.3). BOTH
  // counts are ALWAYS computed regardless of `bucket`: the inactive segment's
  // label ("Archived (N)" / "Active") needs its count even though its rows are
  // not fetched (§3.1). Two count-only (head:true) queries.
  let activeCount: number;
  try {
    const q = await supabase
      .from("shows")
      .select("id", { count: "exact", head: true })
      .eq("archived", false);
    if (q.error) {
      return { kind: "infra_error", message: `shows active count query failed: ${q.error.message}` };
    }
    // Fall back to the rendered length ONLY when this is the selected bucket
    // (so a null count from a head-less mock still resolves); otherwise 0.
    activeCount = q.count ?? (isArchived ? 0 : showsRows.length);
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows active count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let archivedCount: number;
  try {
    const q = await supabase
      .from("shows")
      .select("id", { count: "exact", head: true })
      .eq("archived", true);
    if (q.error) {
      return { kind: "infra_error", message: `shows archived count query failed: ${q.error.message}` };
    }
    archivedCount = q.count ?? (isArchived ? showsRows.length : 0);
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows archived count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // stats/overflow are scoped to the SELECTED bucket (that is what `showsRows`
  // holds); the StatStrip's "Active shows" stat keeps reading `activeCount`.
  const selectedCount = isArchived ? archivedCount : activeCount;
  const statsScope: "global" | "shown" =
    selectedCount > ACTIVE_SHOWS_CAP ? "shown" : "global";
  const overflowCount = Math.max(0, selectedCount - showsRows.length);

  // ── isLive per row (single `now`; shared tz + span helpers), liveCount = Σ ──
  const activeShowIds = showsRows.map((s) => s.id as string);

  // crewTotal — exact head:true count over the active set (never a truncatable
  // row-fetch sum, §3.4). Short-circuit on empty id set (R28 — no .in([])).
  let crewTotal = 0;
  if (activeShowIds.length > 0) {
    try {
      const q = await supabase
        .from("crew_members")
        .select("show_id", { count: "exact", head: true })
        .in("show_id", activeShowIds);
      if (q.error) {
        return { kind: "infra_error", message: `crew_members count query failed: ${q.error.message}` };
      }
      crewTotal = q.count ?? 0;
    } catch (err) {
      return {
        kind: "infra_error",
        message: `crew_members count query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Per-show crewCount — paginate-until-complete so one-to-many child rows are
  // never truncated by the PostgREST cap (R17 / §3.4). NOT a single .in() row
  // fetch. Short-circuit on empty id set.
  const crewCountByShow = new Map<string, number>();
  if (activeShowIds.length > 0) {
    try {
      let offset = 0;
      for (;;) {
        const q = await supabase
          .from("crew_members")
          .select("show_id")
          .in("show_id", activeShowIds)
          .order("show_id", { ascending: true })
          .range(offset, offset + CREW_PAGE_SIZE - 1);
        if (q.error) {
          return { kind: "infra_error", message: `crew_members query failed: ${q.error.message}` };
        }
        const page = (q.data ?? []) as ReadonlyArray<{ show_id?: string }>;
        for (const row of page) {
          if (!row.show_id) continue;
          crewCountByShow.set(row.show_id, (crewCountByShow.get(row.show_id) ?? 0) + 1);
        }
        if (page.length < CREW_PAGE_SIZE) break;
        offset += CREW_PAGE_SIZE;
      }
    } catch (err) {
      return {
        kind: "infra_error",
        message: `crew_members query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // §3.2 — finalize-owned ("Publishing…") vs Held discriminator. The ONLY
  // authoritative source is whether an ACTIVE wizard finalize checkpoint owns
  // the show, computed by the SECURITY DEFINER predicate
  // `public.readfinalizeowned_b2(p_show_id)` (the same fn the archive/publish/
  // DEF-1 guards use; migration 20260601000000:13). `requires_resync` is NOT a
  // valid proxy — the Unarchive catch-up clears it on a clean apply, so the
  // normal Held state has requires_resync=false and would be mislabeled.
  //
  // Bounded by construction: queried ONLY for in-flight rows
  // (`!published && !archived`) of the ACTIVE segment — finalize is rare and
  // transient, so this set is tiny (usually 0). Archived-segment rows are never
  // finalize-owned. On ANY infra hiccup we fail toward "Held" (omit the id from
  // the owned set) — the safe, non-alarming label.
  const finalizeOwnedIds = new Set<string>();
  if (!isArchived) {
    const inFlightIds = showsRows
      .filter((s) => !Boolean(s.published))
      .map((s) => s.id as string);
    for (const showId of inFlightIds) {
      try {
        const q = await supabase.rpc("readfinalizeowned_b2", { p_show_id: showId });
        // Fail toward "Held": a returned error or a non-true value leaves the id
        // OUT of the owned set, so the pill is "Held — not published".
        if (!q.error && q.data === true) finalizeOwnedIds.add(showId);
      } catch {
        // Thrown infra fault → also fail toward "Held"; do not abort the whole
        // dashboard for a transient finalize-predicate read.
      }
    }
  }

  let liveCount = 0;
  const rows: ActiveShowRow[] = showsRows.map((s) => {
    const dates = (s.dates as DatesJson | null) ?? null;
    const published = Boolean(s.published);
    const todayIso = formatIsoForTimezone(now, resolveShowTimezone(s.venue as never));
    const isLive = published && isShowLiveOnDate(dates as never, todayIso);
    if (isLive) liveCount += 1;
    // §3.2 — finalize-owned iff an active wizard finalize checkpoint owns the
    // show (from the RPC set above). Archived rows are never finalize-owned.
    const finalizeOwned = !isArchived && !published && finalizeOwnedIds.has(s.id as string);
    return {
      id: s.id as string,
      slug: s.slug as string,
      title: (s.title as string | null) ?? null,
      showDateStart: deriveStart(dates),
      showDateEnd: deriveEnd(dates),
      crewCount: crewCountByShow.get(s.id as string) ?? 0,
      lastSyncedAt: (s.last_synced_at as string | null) ?? null,
      lastSyncStatus: (s.last_sync_status as string | null) ?? null,
      published,
      isLive,
      finalizeOwned,
      archivedAt: (s.archived_at as string | null) ?? null,
    };
  });

  // ── Needs-attention: extracted to lib/admin/loadNeedsAttention.ts (Task 1,
  // spec §4.1). The client constructed above is INJECTED; cap = RENDER_CAP.
  const na = await loadNeedsAttention({ cap: RENDER_CAP, supabase });
  if ("kind" in na) return na;

  return {
    rows,
    bucket,
    activeCount,
    archivedCount,
    liveCount,
    needReviewCount: na.totalCount,
    crewTotal,
    statsScope,
    overflowCount,
    needsAttention: na,
  };
}

export async function Dashboard(options: { bucket?: DashboardBucket } = {}) {
  const bucket: DashboardBucket = options.bucket === "archived" ? "archived" : "active";
  const result = await fetchDashboardData({ bucket });
  const now = await nowDate();

  if ("kind" in result) {
    return (
      <main
        data-testid="admin-dashboard-infra-error"
        className="mx-auto flex max-w-4xl flex-col gap-section-gap"
      >
        <header className="flex flex-col gap-2">
          <p
            className="text-xs font-medium uppercase text-text-subtle"
            style={{ letterSpacing: "var(--tracking-eyebrow)" }}
          >
            Admin
          </p>
          <h2 className="text-2xl font-semibold text-text-strong">
            We could not load your dashboard.
          </h2>
          <p className="max-w-prose text-base text-text-subtle">
            The admin database query failed. Refresh in a moment. If this keeps
            happening, contact the developer.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main
      data-testid="admin-dashboard"
      className="flex w-full flex-col gap-section-gap"
    >
      {/* Title + sub + eyebrow live in the shared <AdminPageHeader> rendered
          above <Dashboard/> in app/admin/page.tsx (Task 4.1 single title source).
          The dashboard-local "Open settings" link was removed (M12.6) — the
          top-nav "Settings" tab is the canonical affordance; a second link above
          the stat strip was redundant chrome. */}
      <StatStrip
        activeCount={result.activeCount}
        liveCount={result.liveCount}
        needReviewCount={result.needReviewCount}
        crewTotal={result.crewTotal}
        statsScope={result.statsScope}
      />

      {/* Two-col split: shows table ⟷ needs-attention. min-[720px]:items-stretch gives
          equal column height on desktop (Tailwind v4 default is NOT stretch,
          DESIGN §7). NB: the columns must NOT also set h-full — height:100% on a
          flex child is a non-auto cross-size that SUPPRESSES align-items:stretch
          (the real-browser layout test caught this). Stacks on mobile. */}
      {/* Two-col split gated at min-[1080px], NOT min-[720px]. This <main> is
          now full-width; the admin layout wrapper caps content at max-w-[1600px]
          (M12.4 item D2 — was max-w-6xl/1152px), so usable content now fills the
          desktop viewport up to 1600px before centering.
          The shows col must host ShowsTable's fixed tracks (8+5+12+1.25rem +
          gaps ≈ 484px) AND a usable minmax(0,1fr) title track after the inbox col
          is subtracted. The inbox is 320px (w-80) through the TIGHT split band
          (1080–1279px) and only widens to 360px at ≥1280px where the uncapped
          layout has slack — so the worst-case overhead at the 1080px activation
          width is unchanged (~862px), keeping the title track comfortably above
          the 120px floor. The band-sweep layout test (TITLE_BANDS up to 1280px)
          pins this; do NOT widen the inbox at the 1080–1152 bands or lower the
          split breakpoint without re-running it — either re-collapses the title. */}
      <div
        data-testid="dashboard-split"
        className="flex flex-col gap-tile-gap min-[1080px]:flex-row min-[1080px]:items-stretch"
      >
        <section
          data-testid="dashboard-shows-col"
          aria-label={result.bucket === "archived" ? "Archived shows" : "Active shows"}
          className="flex min-w-0 flex-col gap-3 min-[1080px]:flex-1"
        >
          {/* M12.4 item D4: for the ACTIVE bucket the "Active shows" title, the
              Find input, AND the segmented control share ONE header row, owned by
              <ShowsTable> (the Find client-state lives there). The ARCHIVED bucket
              has no Find, so it keeps its own title+control header row here. */}
          {result.bucket === "archived" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-text-strong">Archived shows</h3>
                  <span
                    data-testid="shows-count-chip"
                    className="inline-flex items-center rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-subtle"
                  >
                    {result.archivedCount}
                  </span>
                  <HoverHelp label="Help: Archived shows" testId="archived-help">
                    <p>
                      Shows you&apos;ve archived. Their crew links stay off until you unarchive and
                      republish.
                    </p>
                  </HoverHelp>
                </div>
                <DashboardBucketSegmentedControl
                  bucket={result.bucket}
                  activeCount={result.activeCount}
                  archivedCount={result.archivedCount}
                />
              </div>
              {result.rows.length === 0 ? (
                <p
                  data-testid="archived-empty"
                  className="rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
                >
                  No archived shows.
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {result.rows.map((row) => (
                      <ArchivedShowRow
                        key={row.id}
                        row={row}
                        now={now}
                        unarchiveAction={unarchiveShowAction}
                      />
                    ))}
                  </ul>
                  {result.overflowCount > 0 ? (
                    <p
                      data-testid="archived-overflow"
                      className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
                    >
                      Showing the first {result.rows.length} of {result.archivedCount} archived
                      shows. Contact the developer if you need the full list.
                    </p>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <ShowsTable
              rows={result.rows}
              now={now}
              activeCount={result.activeCount}
              overflowCount={result.overflowCount}
              title="Active shows"
              bucketControl={
                <DashboardBucketSegmentedControl
                  bucket={result.bucket}
                  activeCount={result.activeCount}
                  archivedCount={result.archivedCount}
                />
              }
            />
          )}
        </section>
        <section
          data-testid="dashboard-inbox-col"
          aria-label="Needs attention"
          className="flex flex-col gap-3 min-[1080px]:w-80 min-[1080px]:shrink-0 min-[1280px]:w-[480px]"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text-strong">Needs attention</h3>
            <span
              data-testid="needs-attention-count-chip"
              className="inline-flex items-center rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-subtle"
            >
              {result.needsAttention.totalCount}
            </span>
            <HoverHelp label="Help: Needs attention" testId="needs-attention-help">
              <p>
                Sheets and changes waiting on you: new shows to review, staged edits to approve, or
                sheets that couldn&apos;t be processed.
              </p>
            </HoverHelp>
          </div>
          <NeedsAttentionInbox
            items={result.needsAttention.items}
            totalCount={result.needsAttention.totalCount}
            renderedCount={result.needsAttention.renderedCount}
            overflowCount={result.needsAttention.overflowCount}
            now={now}
          />
        </section>
      </div>

      <DashboardFooter />
    </main>
  );
}
