/**
 * components/admin/Dashboard.tsx (M10 §B Task 10.6 / Phase 2)
 *
 * Post-onboarding /admin dashboard per spec §9.1. Server Component
 * orchestrator. Fetches the panel data via the cookie-bound Supabase
 * server client (admin-RLS gated) and composes:
 *   - <ActiveShowsPanel /> (panel 1) — published shows list
 *   - <PendingPanel /> (panel 2) — pending_ingestions hard-fails +
 *     first-seen pending_syncs awaiting review
 *
 * The admin_alerts banner is already mounted at the layout level
 * (app/admin/layout.tsx → <AlertBanner />), so this surface does not
 * re-render it; we provide a header link to its #alerts anchor for
 * keyboard / a11y users that land on the dashboard scroll position.
 */
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowDate } from "@/lib/time/now";
import {
  ActiveShowsPanel,
  type ActiveShowRow,
} from "@/components/admin/ActiveShowsPanel";
import {
  PendingPanel,
  type PendingIngestionRow,
  type FirstSeenStagedRow,
} from "@/components/admin/PendingPanel";
import { Tour } from "@/components/admin/Tour";

type DashboardData = {
  shows: ActiveShowRow[];
  pendingIngestions: PendingIngestionRow[];
  firstSeenStaged: FirstSeenStagedRow[];
};

// Exported for tests/admin/_metaInfraContract.test.ts — registry row
// for the §B Supabase call-boundary contract (AGENTS.md §1.9).
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

  // AGENTS.md §1.9: every Supabase await wraps in try/catch so a thrown
  // infra fault surfaces as the same typed `infra_error` result as the
  // returned `.error` branch — never as an uncaught framework exception.
  let showsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("shows")
      .select(
        "id, slug, title, drive_file_id, dates, last_synced_at, last_sync_status, published",
      )
      .eq("published", true)
      .order("last_synced_at", { ascending: false, nullsFirst: false });
    if (q.error) {
      return {
        kind: "infra_error",
        message: `shows query failed: ${q.error.message}`,
      };
    }
    showsRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const showIds = showsRows.map((s) => s.id as string);
  const crewCountByShow = new Map<string, number>();
  if (showIds.length > 0) {
    // Treat crew_members errors like other dashboard queries — fail closed.
    // Silently converting a query error to "0 crew" hides RLS / schema /
    // infra failures behind plausible-but-false dashboard data and violates
    // the Supabase call-boundary invariant (AGENTS.md §1.9).
    let crewRows: ReadonlyArray<Record<string, unknown>>;
    try {
      const q = await supabase
        .from("crew_members")
        .select("show_id")
        .in("show_id", showIds);
      if (q.error) {
        return {
          kind: "infra_error",
          message: `crew_members query failed: ${q.error.message}`,
        };
      }
      crewRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
    } catch (err) {
      return {
        kind: "infra_error",
        message: `crew_members query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    for (const row of crewRows) {
      const id = (row as { show_id?: string }).show_id;
      if (!id) continue;
      crewCountByShow.set(id, (crewCountByShow.get(id) ?? 0) + 1);
    }
  }

  // Derive show date range from the `dates` jsonb column. Real schema
  // has dates: { travelIn, set, showDays: string[], travelOut }. Start =
  // earliest of {travelIn, set, showDays[0]}; end = latest of
  // {showDays[last], travelOut}. Each field can be null; missing rows
  // collapse to null endpoints.
  type DatesJson = {
    travelIn?: string | null;
    set?: string | null;
    showDays?: unknown;
    travelOut?: string | null;
  };
  const deriveStart = (dates: DatesJson | null): string | null => {
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
  };
  const deriveEnd = (dates: DatesJson | null): string | null => {
    if (!dates) return null;
    const candidates: string[] = [];
    if (Array.isArray(dates.showDays) && dates.showDays.length > 0) {
      const last = dates.showDays[dates.showDays.length - 1];
      if (typeof last === "string") candidates.push(last);
    }
    if (typeof dates.travelOut === "string") candidates.push(dates.travelOut);
    if (candidates.length === 0) return null;
    return candidates.sort().reverse()[0] ?? null;
  };

  const shows: ActiveShowRow[] = showsRows.map((s) => {
    const dates = (s.dates as DatesJson | null) ?? null;
    return {
      id: s.id as string,
      slug: s.slug as string,
      title: (s.title as string | null) ?? null,
      showDateStart: deriveStart(dates),
      showDateEnd: deriveEnd(dates),
      crewCount: crewCountByShow.get(s.id as string) ?? 0,
      lastSyncedAt: (s.last_synced_at as string | null) ?? null,
      lastSyncStatus: (s.last_sync_status as string | null) ?? null,
      published: Boolean(s.published),
    };
  });

  let pendingIngestionsRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const q = await supabase
      .from("pending_ingestions")
      .select(
        "id, drive_file_id, drive_file_name, first_seen_at, attempt_count, last_error_code, last_error_message",
      )
      .is("wizard_session_id", null)
      .order("first_seen_at", { ascending: false });
    if (q.error) {
      return {
        kind: "infra_error",
        message: `pending_ingestions query failed: ${q.error.message}`,
      };
    }
    pendingIngestionsRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const pendingIngestions: PendingIngestionRow[] = pendingIngestionsRows.map((row) => ({
    id: row.id as string,
    driveFileId: row.drive_file_id as string,
    driveFileName: (row.drive_file_name as string | null) ?? null,
    firstSeenAt: (row.first_seen_at as string | null) ?? null,
    attemptCount: (row.attempt_count as number) ?? 0,
    errorCode: (row.last_error_code as string | null) ?? null,
    errorMessage: (row.last_error_message as string | null) ?? null,
  }));

  const firstSeenStaged: FirstSeenStagedRow[] = [];
  if (showIds.length >= 0) {
    const knownDriveIds = new Set(
      showsRows.map((s) => s.drive_file_id as string),
    );
    let stagedRows: ReadonlyArray<Record<string, unknown>>;
    try {
      const q = await supabase
        .from("pending_syncs")
        .select("staged_id, drive_file_id, staged_modified_time, parse_result")
        .is("wizard_session_id", null)
        .order("staged_modified_time", { ascending: false });
      if (q.error) {
        return {
          kind: "infra_error",
          message: `pending_syncs query failed: ${q.error.message}`,
        };
      }
      stagedRows = (q.data ?? []) as ReadonlyArray<Record<string, unknown>>;
    } catch (err) {
      return {
        kind: "infra_error",
        message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    for (const row of stagedRows) {
      const driveFileId = row.drive_file_id as string;
      // First-seen = no `shows` row yet for this drive_file_id.
      if (knownDriveIds.has(driveFileId)) continue;
      const parseResult = row.parse_result as
        | { show?: { title?: string | null } }
        | null;
      firstSeenStaged.push({
        stagedId: row.staged_id as string,
        driveFileId,
        candidateTitle: parseResult?.show?.title ?? null,
        stagedModifiedTime: (row.staged_modified_time as string | null) ?? null,
      });
    }
  }

  return { shows, pendingIngestions, firstSeenStaged };
}

export async function Dashboard() {
  const result = await fetchDashboardData();
  // M11 Phase C (C.2 extension): hoist request-scoped wall-clock instant
  // and thread into <ActiveShowsPanel /> so the panel's relative-time
  // labels honor screenshot-frozen-now.
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
            The admin database query failed. Refresh in a moment. If this
            keeps happening, contact the developer.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main
      data-testid="admin-dashboard"
      className="mx-auto flex max-w-4xl flex-col gap-section-gap"
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

      <ActiveShowsPanel rows={result.shows} now={now} />
      <PendingPanel
        pendingIngestions={result.pendingIngestions}
        firstSeenStaged={result.firstSeenStaged}
      />

      <footer
        data-testid="admin-dashboard-footer"
        className="mt-section-gap flex flex-col gap-2 border-t border-border pt-section-gap"
      >
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          New here?
        </p>
        <p className="text-sm text-text-subtle">
          A short walkthrough of how this admin page is laid out.
        </p>
        <Tour />
      </footer>
    </main>
  );
}
