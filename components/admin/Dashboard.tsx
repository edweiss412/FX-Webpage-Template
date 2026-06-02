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
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowDate } from "@/lib/time/now";
import { type ActiveShowRow } from "@/components/admin/ActiveShowsPanel";
import { DashboardFooter } from "@/components/admin/DashboardFooter";
import { StatStrip } from "@/components/admin/StatStrip";
import { ShowsTable } from "@/components/admin/ShowsTable";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { formatIsoForTimezone } from "@/lib/time/rightNow";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { isShowLiveOnDate } from "@/lib/time/showSpan";
import {
  RENDER_CAP,
  buildNeedsAttention,
  type NeedsAttention,
  type ShowExistence,
} from "@/lib/admin/needsAttention";

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
  // `requires_resync` feeds the Held-vs-Publishing pill split (§3.2);
  // `archived_at` feeds the ArchivedShowRow time line (§3.1).
  let showsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    let q = supabase
      .from("shows")
      .select(
        "id, slug, title, drive_file_id, dates, venue, last_synced_at, last_sync_status, published, requires_resync, archived_at",
      )
      .eq("archived", isArchived);
    q = isArchived
      ? q
          .order("archived_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
      : q.order("last_synced_at", { ascending: false, nullsFirst: false });
    const res = await q.limit(ACTIVE_SHOWS_CAP);
    if (res.error) {
      return { kind: "infra_error", message: `shows query failed: ${res.error.message}` };
    }
    showsRows = (res.data ?? []) as ReadonlyArray<Record<string, unknown>>;
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

  let liveCount = 0;
  const rows: ActiveShowRow[] = showsRows.map((s) => {
    const dates = (s.dates as DatesJson | null) ?? null;
    const published = Boolean(s.published);
    const requiresResync = Boolean(s.requires_resync);
    const todayIso = formatIsoForTimezone(now, resolveShowTimezone(s.venue as never));
    const isLive = published && isShowLiveOnDate(dates as never, todayIso);
    if (isLive) liveCount += 1;
    // §3.2 — finalize-owned ("Publishing…") vs Held: a Held show carries
    // requires_resync=true (set ONLY by unarchive_show); an unpublished row
    // WITHOUT it is wizard-finalize-in-flight. Archived rows are never
    // finalize-owned (the selected bucket's `archived` is `isArchived`).
    const finalizeOwned = !isArchived && !published && !requiresResync;
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

  // ── Needs-attention: two bounded pending streams + exact counts ──
  let ingestionRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("pending_ingestions")
      .select("id, drive_file_id, drive_file_name, last_attempt_at, last_error_code")
      .is("wizard_session_id", null)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(RENDER_CAP + 1);
    if (q.error) {
      return { kind: "infra_error", message: `pending_ingestions query failed: ${q.error.message}` };
    }
    ingestionRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let ingestionCount: number;
  try {
    const q = await supabase
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    if (q.error) {
      return { kind: "infra_error", message: `pending_ingestions count query failed: ${q.error.message}` };
    }
    ingestionCount = q.count ?? ingestionRows.length;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let syncRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, staged_modified_time, parse_result, triggered_review_items",
      )
      .is("wizard_session_id", null)
      .order("staged_modified_time", { ascending: false })
      .limit(RENDER_CAP + 1);
    if (q.error) {
      return { kind: "infra_error", message: `pending_syncs query failed: ${q.error.message}` };
    }
    syncRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let syncCount: number;
  try {
    const q = await supabase
      .from("pending_syncs")
      .select("staged_id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    if (q.error) {
      return { kind: "infra_error", message: `pending_syncs count query failed: ${q.error.message}` };
    }
    syncCount = q.count ?? syncRows.length;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Existence lookup keyed FROM the pending rows' drive_file_ids (bounded by the
  // capped pending reads, §3.3) — spans ALL shows (no published/archived
  // filter) so an archived/unpublished existing show classifies as
  // existing_staged, not first_seen. Short-circuit on empty id set (R28).
  const pendingDriveFileIds = Array.from(
    new Set(
      [
        ...ingestionRows.map((r) => r.drive_file_id as string),
        ...syncRows.map((r) => r.drive_file_id as string),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const existence: Record<string, ShowExistence> = {};
  if (pendingDriveFileIds.length > 0) {
    try {
      const q = await supabase
        .from("shows")
        .select("drive_file_id, slug, title, archived, published")
        .in("drive_file_id", pendingDriveFileIds);
      if (q.error) {
        return { kind: "infra_error", message: `existence query failed: ${q.error.message}` };
      }
      const existenceRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
      for (const row of existenceRows) {
        const id = row.drive_file_id as string | undefined;
        if (!id) continue;
        existence[id] = {
          slug: row.slug as string,
          title: (row.title as string | null) ?? null,
          published: Boolean(row.published),
          archived: Boolean(row.archived),
        };
      }
    } catch (err) {
      return {
        kind: "infra_error",
        message: `existence query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const needsAttention = buildNeedsAttention({
    ingestions: ingestionRows.map((r) => ({
      id: r.id as string,
      driveFileId: r.drive_file_id as string,
      driveFileName: (r.drive_file_name as string | null) ?? null,
      lastErrorCode: (r.last_error_code as string | null) ?? null,
      lastAttemptAt: (r.last_attempt_at as string | null) ?? null,
    })),
    syncs: syncRows.map((r) => {
      const parseResult = r.parse_result as { show?: { title?: string | null } } | null;
      return {
        stagedId: r.staged_id as string,
        driveFileId: r.drive_file_id as string,
        candidateTitle: parseResult?.show?.title ?? null,
        stagedModifiedTime: (r.staged_modified_time as string | null) ?? null,
      };
    }),
    existence,
    totalCounts: { ingestions: ingestionCount, syncs: syncCount },
  });

  return {
    rows,
    bucket,
    activeCount,
    archivedCount,
    liveCount,
    needReviewCount: needsAttention.totalCount,
    crewTotal,
    statsScope,
    overflowCount,
    needsAttention,
  };
}

export async function Dashboard() {
  const result = await fetchDashboardData();
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
      className="mx-auto flex max-w-5xl flex-col gap-section-gap"
    >
      {/* Title + sub + eyebrow now live in the shared <AdminPageHeader>
          rendered above <Dashboard/> in app/admin/page.tsx (Task 4.1 single
          title source). The settings link stays here as a dashboard-local
          affordance. */}
      <p className="text-sm text-text-subtle">
        <Link
          href="/admin/settings"
          data-testid="admin-dashboard-settings-link"
          className="text-accent-on-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open settings
        </Link>
      </p>

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
          max-w-5xl (1024px) and the admin layout wrapper is max-w-6xl
          (app/admin/layout.tsx), so usable content tops out ~1024px at desktop.
          The shows col must host ShowsTable's fixed tracks (8+5+12+1.25rem +
          gaps ≈ 484px) AND a usable minmax(0,1fr) title track after the 320px
          inbox col is subtracted; the constant overhead is ~862px, so the title
          track = contentWidth − 862. Below ~1046px viewport that goes negative
          (title starves to 0px — the bug this gate caught). Below 1080px the
          split stacks (single-column, full-width table → title has ample room);
          at/above 1080px it goes side-by-side with a title track kept
          comfortably above the 120px floor. Verified in the band-sweep layout
          test (do not lower without re-running it — a lower breakpoint
          re-collapses the title). */}
      <div
        data-testid="dashboard-split"
        className="flex flex-col gap-tile-gap min-[1080px]:flex-row min-[1080px]:items-stretch"
      >
        <section
          data-testid="dashboard-shows-col"
          aria-label="Active shows"
          className="flex min-w-0 flex-col gap-3 min-[1080px]:flex-1"
        >
          <h3 className="text-lg font-semibold text-text-strong">Active shows</h3>
          <ShowsTable
            rows={result.rows}
            now={now}
            activeCount={result.activeCount}
            overflowCount={result.overflowCount}
          />
        </section>
        <section
          data-testid="dashboard-inbox-col"
          aria-label="Needs attention"
          className="flex flex-col gap-3 min-[1080px]:w-80 min-[1080px]:shrink-0"
        >
          <h3 className="text-lg font-semibold text-text-strong">Needs attention</h3>
          <NeedsAttentionInbox
            items={result.needsAttention.items}
            totalCount={result.needsAttention.totalCount}
            renderedCount={result.needsAttention.renderedCount}
            overflowCount={result.needsAttention.overflowCount}
          />
        </section>
      </div>

      <DashboardFooter />
    </main>
  );
}
