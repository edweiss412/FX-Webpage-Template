// M12.2 Phase A Task 5 — ShowsTable (spec §5.2). Replaces the ActiveShowsPanel
// row list. Dense table sharing ONE grid-template across header + rows (spec §9
// dimensional invariant). Whole row links to /admin/show/{slug}.
//
// Title-area row-state badges (mutually exclusive, SEPARATE from the sync
// column): Live pill iff row.isLive (precomputed in fetchDashboardData — never
// recomputed here), Publishing badge iff !published. The Sync column is HEALTH
// only via syncStatusBucket (decoupled from live/publishing, R1).
//
// Mobile (<md=720px): the Dates/Crew/Sync columns collapse into a stacked
// sub-line under the title; the Live/Publishing pill stays with the title.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  formatDateRange,
  formatRelative,
  type ActiveShowRow,
} from "@/components/admin/ActiveShowsPanel";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { syncStatusBucket } from "@/lib/admin/syncStatus";

type ShowsTableProps = {
  rows: ActiveShowRow[];
  now: Date;
  activeCount: number;
  overflowCount: number;
};

// Shared column tracks (header + every row) so the columns line up (spec §9).
// Explicit track widths (NOT `auto`): `auto` tracks size to each grid's own
// content, so the header grid and each row grid would compute DIFFERENT
// gridTemplateColumns and the labels wouldn't align (the real-browser layout
// test caught this). Fixed lengths + a 1fr title track make every grid resolve
// to identical tracks at the same container width.
const ROW_GRID =
  "min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1fr)_8rem_5rem_12rem_1.25rem] min-[720px]:items-center min-[720px]:gap-4";

function StatePill({ row }: { row: ActiveShowRow }) {
  if (row.isLive) {
    return (
      <span
        data-testid={`shows-live-pill-${row.slug}`}
        className="inline-flex items-center gap-1 rounded-pill border border-status-live px-2 py-0.5 text-xs font-semibold text-status-live-text"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-status-live" />
        Live
      </span>
    );
  }
  if (!row.published) {
    // §3.2 pill split: a finalize-owned in-flight row → "Publishing…" (warn);
    // a Held row (post-Unarchive, finalizeOwned=false) → "Held — not published"
    // (neutral/idle — NOT a new hue, NOT warn). Color is never the sole carrier
    // (DESIGN color-blind floor): each pill pairs its dot with a text label.
    if (row.finalizeOwned) {
      return (
        <span
          data-testid={`shows-publishing-${row.slug}`}
          className="inline-flex items-center gap-1 rounded-pill border border-status-warn px-2 py-0.5 text-xs font-semibold text-status-warn-text"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-status-warn" />
          Publishing…
        </span>
      );
    }
    return (
      <span
        data-testid={`shows-held-pill-${row.slug}`}
        className="inline-flex items-center gap-1 rounded-pill border border-status-idle px-2 py-0.5 text-xs font-semibold text-status-idle-text"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-status-idle" />
        Held — not published
      </span>
    );
  }
  return null;
}

function SyncCell({ row, now }: { row: ActiveShowRow; now: Date }) {
  const { bucket, label } = syncStatusBucket(row.lastSyncStatus);
  const display =
    row.lastSyncStatus === "ok" ? `Synced ${formatRelative(row.lastSyncedAt, now)}` : label;
  return <StatusIndicator status={bucket} label={display} />;
}

export function ShowsTable({ rows, now, activeCount, overflowCount }: ShowsTableProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="admin-active-shows-empty"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
      >
        <p className="font-semibold text-text-strong">You do not have any shows yet.</p>
        <p>
          Share a sheet into your watched Drive folder and the sync will pick it up.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="shows-table" className="flex flex-col gap-2">
      {/* Header — desktop only; shares ROW_GRID column tracks with the rows. */}
      <div
        data-testid="shows-table-header"
        className={`hidden px-tile-pad text-xs font-medium uppercase text-text-subtle ${ROW_GRID}`}
        style={{ letterSpacing: "var(--tracking-eyebrow)" }}
      >
        <span>Show</span>
        <span>Dates</span>
        <span>Crew</span>
        <span>Sync status</span>
        <span aria-hidden="true" />
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const dates = formatDateRange(row.showDateStart, row.showDateEnd);
          const crewLabel = `${row.crewCount ?? 0} crew`;
          return (
            <li key={row.id}>
              <Link
                href={`/admin/show/${encodeURIComponent(row.slug)}`}
                data-testid={`shows-table-row-${row.slug}`}
                className={`flex flex-col gap-1 rounded-md border border-border bg-surface p-tile-pad shadow-tile underline-offset-2 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${ROW_GRID}`}
              >
                {/* Show cell — title + state pill (always visible) */}
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold text-text-strong">
                      {row.title ?? row.slug}
                    </span>
                    <StatePill row={row} />
                  </div>
                  {/* Mobile stacked meta sub-line (hidden ≥md) */}
                  <div
                    data-testid={`shows-meta-mobile-${row.slug}`}
                    className="flex flex-col gap-1 text-sm text-text-subtle min-[720px]:hidden"
                  >
                    {dates ? <span className="tabular-nums">{dates}</span> : null}
                    <span className="tabular-nums">{crewLabel}</span>
                    <SyncCell row={row} now={now} />
                  </div>
                </div>

                {/* Desktop columns (hidden <md). min-w-0 + truncate so content
                    stays within its fixed grid track and never pushes alignment. */}
                <span className="hidden min-w-0 truncate text-sm text-text-subtle tabular-nums min-[720px]:block">
                  {dates ?? "—"}
                </span>
                <span className="hidden min-w-0 truncate text-sm text-text-subtle tabular-nums min-[720px]:block">
                  {crewLabel}
                </span>
                <span
                  data-testid={`shows-sync-${row.slug}`}
                  className="hidden min-w-0 overflow-hidden text-sm min-[720px]:block"
                >
                  <SyncCell row={row} now={now} />
                </span>
                <span
                  data-testid={`shows-chevron-${row.slug}`}
                  aria-hidden="true"
                  className="hidden text-text-faint min-[720px]:block"
                >
                  <ChevronRight size={16} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {overflowCount > 0 ? (
        <p
          data-testid="shows-table-overflow"
          className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
        >
          Showing the first {rows.length} of {activeCount} shows. Contact the developer if you
          need the full list.
        </p>
      ) : null}
    </div>
  );
}
