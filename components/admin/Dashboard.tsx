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
import {
  ActiveShowsPanel,
  type ActiveShowRow,
} from "@/components/admin/ActiveShowsPanel";
import {
  PendingPanel,
  type PendingIngestionRow,
  type FirstSeenStagedRow,
} from "@/components/admin/PendingPanel";

type DashboardData = {
  shows: ActiveShowRow[];
  pendingIngestions: PendingIngestionRow[];
  firstSeenStaged: FirstSeenStagedRow[];
};

async function fetchDashboardData(): Promise<
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

  const showsQuery = await supabase
    .from("shows")
    .select(
      "id, slug, title, drive_file_id, show_date_start, show_date_end, last_synced_at, last_sync_status, published",
    )
    .eq("published", true)
    .order("show_date_start", { ascending: true, nullsFirst: false });

  if (showsQuery.error) {
    return {
      kind: "infra_error",
      message: `shows query failed: ${showsQuery.error.message}`,
    };
  }

  const showIds = (showsQuery.data ?? []).map((s) => s.id as string);
  let crewCountByShow = new Map<string, number>();
  if (showIds.length > 0) {
    const crewQuery = await supabase
      .from("crew_members")
      .select("show_id")
      .in("show_id", showIds);
    if (!crewQuery.error && crewQuery.data) {
      const acc = new Map<string, number>();
      for (const row of crewQuery.data) {
        const id = (row as { show_id?: string }).show_id;
        if (!id) continue;
        acc.set(id, (acc.get(id) ?? 0) + 1);
      }
      crewCountByShow = acc;
    }
  }

  const shows: ActiveShowRow[] = (showsQuery.data ?? []).map((s) => ({
    id: s.id as string,
    slug: s.slug as string,
    title: (s.title as string | null) ?? null,
    showDateStart: (s.show_date_start as string | null) ?? null,
    showDateEnd: (s.show_date_end as string | null) ?? null,
    crewCount: crewCountByShow.get(s.id as string) ?? 0,
    lastSyncedAt: (s.last_synced_at as string | null) ?? null,
    lastSyncStatus: (s.last_sync_status as string | null) ?? null,
    published: Boolean(s.published),
  }));

  const pendingIngestionsQuery = await supabase
    .from("pending_ingestions")
    .select("id, drive_file_id, drive_file_name, first_seen_at, attempt_count, code, message")
    .is("wizard_session_id", null)
    .order("first_seen_at", { ascending: false });

  if (pendingIngestionsQuery.error) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query failed: ${pendingIngestionsQuery.error.message}`,
    };
  }

  const pendingIngestions: PendingIngestionRow[] = (
    pendingIngestionsQuery.data ?? []
  ).map((row) => ({
    id: row.id as string,
    driveFileId: row.drive_file_id as string,
    driveFileName: (row.drive_file_name as string | null) ?? null,
    firstSeenAt: (row.first_seen_at as string | null) ?? null,
    attemptCount: (row.attempt_count as number) ?? 0,
    errorCode: (row.code as string | null) ?? null,
    errorMessage: (row.message as string | null) ?? null,
  }));

  const firstSeenStaged: FirstSeenStagedRow[] = [];
  if (showIds.length >= 0) {
    const knownDriveIds = new Set(
      (showsQuery.data ?? []).map((s) => s.drive_file_id as string),
    );
    const stagedQuery = await supabase
      .from("pending_syncs")
      .select("staged_id, drive_file_id, staged_modified_time, parse_result")
      .is("wizard_session_id", null)
      .order("staged_modified_time", { ascending: false });
    if (stagedQuery.error) {
      return {
        kind: "infra_error",
        message: `pending_syncs query failed: ${stagedQuery.error.message}`,
      };
    }
    for (const row of stagedQuery.data ?? []) {
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

      <ActiveShowsPanel rows={result.shows} />
      <PendingPanel
        pendingIngestions={result.pendingIngestions}
        firstSeenStaged={result.firstSeenStaged}
      />
    </main>
  );
}
