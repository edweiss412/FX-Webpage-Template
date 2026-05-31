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

export type DashboardData = {
  rows: ActiveShowRow[];
  activeCount: number;
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
export async function fetchDashboardData(): Promise<
  DashboardData | { kind: "infra_error"; message: string }
> {
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

  // ── Active shows (archived = false; both published + in-flight), bounded ──
  let showsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("shows")
      .select(
        "id, slug, title, drive_file_id, dates, venue, last_synced_at, last_sync_status, published",
      )
      .eq("archived", false)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
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

  // Exact total — truthful even if the rendered list is capped (§3.3).
  let activeCount: number;
  try {
    const q = await supabase
      .from("shows")
      .select("id", { count: "exact", head: true })
      .eq("archived", false);
    if (q.error) {
      return { kind: "infra_error", message: `shows count query failed: ${q.error.message}` };
    }
    activeCount = q.count ?? showsRows.length;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const statsScope: "global" | "shown" =
    activeCount > ACTIVE_SHOWS_CAP ? "shown" : "global";
  const overflowCount = Math.max(0, activeCount - showsRows.length);

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
    const todayIso = formatIsoForTimezone(now, resolveShowTimezone(s.venue as never));
    const isLive = published && isShowLiveOnDate(dates as never, todayIso);
    if (isLive) liveCount += 1;
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
      .select("staged_id, drive_file_id, staged_modified_time, parse_result")
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
    activeCount,
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
      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">Dashboard</h2>
        <p className="max-w-prose text-base text-text-subtle">
          Your live shows and anything that needs review.
        </p>
        <p className="text-sm text-text-subtle">
          <Link
            href="/admin/settings"
            data-testid="admin-dashboard-settings-link"
            className="text-accent-on-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Open settings
          </Link>
        </p>
      </header>

      <StatStrip
        activeCount={result.activeCount}
        liveCount={result.liveCount}
        needReviewCount={result.needReviewCount}
        crewTotal={result.crewTotal}
        statsScope={result.statsScope}
      />

      {/* Two-col split: shows table ⟷ needs-attention. md:items-stretch gives
          equal column height on desktop (Tailwind v4 default is NOT stretch,
          DESIGN §7). NB: the columns must NOT also set h-full — height:100% on a
          flex child is a non-auto cross-size that SUPPRESSES align-items:stretch
          (the real-browser layout test caught this). Stacks on mobile. */}
      <div
        data-testid="dashboard-split"
        className="flex flex-col gap-tile-gap md:flex-row md:items-stretch"
      >
        <section
          data-testid="dashboard-shows-col"
          aria-label="Active shows"
          className="flex min-w-0 flex-col gap-3 md:flex-1"
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
          className="flex flex-col gap-3 md:w-80 md:shrink-0"
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
