/**
 * components/admin/ActiveShowsPanel.tsx (M10 §B Task 10.6 / Phase 2)
 *
 * Panel 1 of the post-onboarding /admin Dashboard per spec §9.1.
 * Renders a list of `shows` rows with title, dates, crew count, and
 * last-sync status. Server Component — receives pre-fetched rows from
 * <Dashboard />.
 */
import Link from "next/link";
import { HelpTooltip } from "@/components/admin/HelpTooltip";

export type ActiveShowRow = {
  id: string;
  slug: string;
  title: string | null;
  showDateStart: string | null;
  showDateEnd: string | null;
  crewCount: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  published: boolean;
  // M12.2 Phase A (§3.2) — single-source live flag computed once in
  // fetchDashboardData (published && today∈span, show tz). ShowsTable's Live
  // pill reads this; it is never recomputed in the component.
  isLive: boolean;
  // M12.2 Phase B2 (§3.2) — finalize-ownership for the Held-vs-Publishing pill
  // split. Derived once in fetchDashboardData as
  // `!published && !archived && !requires_resync`: a Held show (the NEW B2
  // post-Unarchive state) carries `requires_resync=true`, which is set ONLY by
  // `unarchive_show` (migration 20260601000000:100); a wizard-finalize-in-flight
  // ("Publishing…") row never has it. ShowsTable reads this to pick the pill
  // (Held → status-idle; Publishing… → status-warn); never recomputed.
  finalizeOwned: boolean;
  // M12.2 Phase B2 (§3.1) — archived-segment rows only. `shows.archived_at`
  // ISO string, or null for a row seeded outside the legacy backfill (the
  // ArchivedShowRow renders "Archived (date unknown)" + sorts last). Always
  // null for active-segment rows.
  archivedAt: string | null;
};

type ActiveShowsPanelProps = {
  rows: ActiveShowRow[];
  /**
   * M11 Phase C (C.2 extension): request-scoped wall-clock instant
   * threaded from <Dashboard /> via `await nowDate()`. The panel is
   * deliberately kept synchronous (Option B) so it stays trivially
   * renderable in jsdom tests; the caller hoists the time read.
   */
  now: Date;
};

// Exported for reuse by the M12.2 ShowsTable (Task 5) so date/relative
// formatting stays identical between the legacy panel and the redesign.
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const toShort = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  };
  if (start && end) return `${toShort(start)} → ${toShort(end)}`;
  return toShort((start ?? end)!);
}

export function formatRelative(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusGlyph(status: string | null, published: boolean): {
  label: string;
  tone: "ok" | "warn" | "err" | "publishing";
} {
  if (!published) return { label: "Publishing…", tone: "publishing" };
  switch (status) {
    case "ok":
    case "synced":
      return { label: "✓", tone: "ok" };
    case "pending_review":
      return { label: "⚠ Review staged changes", tone: "warn" };
    case "parse_error":
    case "sheet_unavailable":
      return { label: "✗ Needs attention", tone: "err" };
    default:
      return { label: "·", tone: "ok" };
  }
}

function toneClass(tone: "ok" | "warn" | "err" | "publishing"): string {
  switch (tone) {
    case "ok":
      return "text-text-subtle";
    case "warn":
      return "text-warning-text";
    case "err":
      return "text-warning-text";
    case "publishing":
      return "text-accent-on-bg";
  }
}

export function ActiveShowsPanel({ rows, now }: ActiveShowsPanelProps) {
  return (
    <section
      data-testid="admin-active-shows-panel"
      aria-labelledby="active-shows-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <h3
          id="active-shows-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Active shows
        </h3>
        <HelpTooltip
          label="Help: Active shows"
          testId="help-affordance--dashboard-active-shows--tooltip"
        >
          <p>
            Every show whose sheet has been read and approved appears here.
            Tap a title to open its detail page or preview it as a crew
            member. The status next to each show tells you when it last
            synced from Drive and whether anything needs your attention.
          </p>
          <p className="mt-2">
            <a
              href="/help/admin/dashboard#active-shows"
              aria-label="Learn more about active shows"
              className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Learn more →
            </a>
          </p>
        </HelpTooltip>
      </div>
      {rows.length === 0 ? (
        <div
          data-testid="admin-active-shows-empty"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
        >
          <p className="font-semibold text-text-strong">
            You do not have any shows yet.
          </p>
          <p>
            Share a sheet into your watched Drive folder and the sync will
            pick it up.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const glyph = statusGlyph(row.lastSyncStatus, row.published);
            const dates = formatDateRange(row.showDateStart, row.showDateEnd);
            return (
              <li
                key={row.id}
                data-testid={`admin-active-show-row-${row.slug}`}
                className="flex flex-col gap-1 rounded-md border border-border bg-surface p-tile-pad sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex flex-col gap-0.5 sm:flex-1">
                  <Link
                    href={`/admin/show/${encodeURIComponent(row.slug)}`}
                    className="text-base font-semibold text-text-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {row.title ?? row.slug}
                  </Link>
                  {dates ? (
                    <p className="text-sm text-text-subtle tabular-nums">{dates}</p>
                  ) : null}
                </div>
                <p className="text-sm text-text-subtle tabular-nums sm:min-w-28">
                  {row.crewCount ?? 0} crew
                </p>
                <p
                  className={`text-sm tabular-nums ${toneClass(glyph.tone)} sm:min-w-40`}
                >
                  {formatRelative(row.lastSyncedAt, now)} · {glyph.label}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
