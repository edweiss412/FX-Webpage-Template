// M12.2 Phase A Task 5 — ShowsTable (spec §5.2). M12.3 items 10/14: restyled to
// the design's CLEAN TABLE — a single bordered/rounded container with a header
// row (SHOW / DATES / CREW / SYNC STATUS) and light row dividers, denser rows
// (NOT heavy per-row boxed cards). Whole row links to /admin/show/{slug}.
//
// M12.3 item 10 — working "Find" search: a client-side, case-insensitive
// substring filter over the show title (slug fallback when title is null).
// This file is a client island so the filter is live without a round-trip.
//
// Title-area row-state badges (mutually exclusive, SEPARATE from the sync
// column): Live pill iff row.isLive (precomputed in fetchDashboardData — never
// recomputed here), Publishing badge iff !published. The Sync column is HEALTH
// only via syncStatusBucket (decoupled from live/publishing, R1).
//
// Mobile (<md=720px): the Dates/Crew/Sync columns collapse into a stacked
// sub-line under the title; the Live/Publishing pill stays with the title.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { formatDateRange, formatRelative, type ActiveShowRow } from "@/lib/admin/showDisplay";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { syncStatusBucket, type SyncBucket } from "@/lib/admin/syncStatus";

type ShowsTableProps = {
  rows: ActiveShowRow[];
  now: Date;
  activeCount: number;
  overflowCount: number;
  // M12.4 item D4 — the shows column header is owned here so the Find input
  // (client state) shares ONE row with the section title and the bucket toggle.
  // ShowsTable is the ACTIVE-bucket renderer, so the title defaults accordingly.
  title?: string;
  bucketControl?: ReactNode;
};

// Shared column tracks (header + every row) so the columns line up (spec §9).
// Explicit track widths (NOT `auto`): `auto` tracks size to each grid's own
// content, so the header grid and each row grid would compute DIFFERENT
// gridTemplateColumns and the labels wouldn't align (the real-browser layout
// test caught this). Fixed lengths + a 1fr title track make every grid resolve
// to identical tracks at the same container width.
// M12.10: the Dates track is 10rem (was 8rem) so the full "M/D/YY → M/D/YY"
// range always fits on ONE line (whitespace-nowrap) — the longest range
// ("12/31/26 → 12/31/26") measures ~140px, which 8rem (128px) truncated. The
// 1fr Show track lets long titles WRAP (no truncation) while the row stays
// vertically centered (items-center). Crew/Sync wrap within their tracks too.
const ROW_GRID =
  "min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_1.25rem] min-[720px]:items-center min-[720px]:gap-4";

// M12.10 — sortable columns. `null` = the server's incoming order (live-first),
// preserved until the user picks a column. Nulls (no dates / never-synced)
// always sort LAST regardless of direction; ties break by title for stability.
type SortKey = "title" | "dates" | "crew" | "sync";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

function sortValue(row: ActiveShowRow, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return rowTitle(row).toLowerCase();
    case "dates":
      // Match the RENDERED date: formatDateRange shows a value when EITHER
      // bound exists, so an end-only row must sort by its end (not as null).
      return row.showDateStart ?? row.showDateEnd; // ISO 'YYYY-MM-DD' or null
    case "crew":
      return row.crewCount ?? 0;
    case "sync": {
      // Sort by the VISIBLE health, not the (usually hidden) timestamp: the
      // SyncCell only renders the relative time for "ok" rows, so ordering by
      // lastSyncedAt would reorder every non-ok row by data the user can't see.
      // Group by bucket severity (problems first) then the visible label — both
      // are shown (dot color + text). Never null, so sync rows never sort "last".
      const { bucket, label } = syncStatusBucket(row.lastSyncStatus);
      return `${SYNC_SORT_RANK[bucket]}|${label}`;
    }
  }
}

// Severity order for the Sync column sort — most-attention-first (problems
// before healthy). Matches the visible dot color + label grouping.
const SYNC_SORT_RANK: Record<SyncBucket, number> = { warn: 0, review: 1, idle: 2, positive: 3 };

function sortRows(rows: ActiveShowRow[], sort: SortState): ActiveShowRow[] {
  if (!sort) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av == null && bv == null) return rowTitle(a).localeCompare(rowTitle(b));
    if (av == null) return 1; // nulls last, both directions
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return rowTitle(a).localeCompare(rowTitle(b)); // stable tiebreak
  });
}

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

// Title used by both the rendered cell and the Find filter (slug fallback).
function rowTitle(row: ActiveShowRow): string {
  return row.title ?? row.slug;
}

export function ShowsTable({
  rows,
  now,
  activeCount,
  overflowCount,
  title = "Active shows",
  bucketControl,
}: ShowsTableProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      trimmed.length === 0
        ? rows
        : rows.filter((row) => rowTitle(row).toLowerCase().includes(trimmed)),
    [rows, trimmed],
  );
  // Find narrows the set; sort orders it. Sorting after filtering keeps the two
  // independent (a sort persists across query edits).
  const visible = useMemo(() => sortRows(filtered, sort), [filtered, sort]);

  // The Find control is hidden when there are no rows to search (the empty
  // state owns the surface). It always renders when ≥1 show exists, even if a
  // query filters everything out (so the user can clear the query).
  const showFind = rows.length > 0;

  // M12.10 — a sortable column header. Click toggles asc↔desc on the active
  // column, or selects a new column (asc). The 44px tap floor (DESIGN §10) is
  // met by min-h-tap-min filling the header cell. SR users get the live sort
  // state via aria-label; the arrow glyph is decorative.
  const sortHeader = (key: SortKey, label: string) => {
    const active = sort?.key === key;
    const dir = active ? sort.dir : null;
    return (
      <button
        type="button"
        data-testid={`shows-sort-${key}`}
        aria-label={
          active
            ? `Sort by ${label}, currently ${dir === "asc" ? "ascending" : "descending"}`
            : `Sort by ${label}`
        }
        onClick={() =>
          setSort((prev) =>
            prev?.key === key
              ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
              : { key, dir: "asc" },
          )
        }
        className="flex min-h-tap-min w-full items-center gap-1 text-left transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
      >
        <span>{label}</span>
        {active ? (
          dir === "asc" ? (
            <ArrowUp aria-hidden="true" className="size-3 shrink-0 text-text" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3 shrink-0 text-text" />
          )
        ) : (
          <ChevronsUpDown aria-hidden="true" className="size-3 shrink-0 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div data-testid="shows-table" className="flex flex-col gap-3">
      {/* One header row: section title (left), Find + bucket toggle (right). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-text-strong">{title}</h3>
          <span
            data-testid="shows-count-chip"
            className="inline-flex items-center rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-subtle"
          >
            {activeCount}
          </span>
          <HoverHelp
            label="Help: Active shows"
            testId="shows-help"
            rootTestId="help-affordance--dashboard-active-shows--tooltip"
            learnMore={{ href: "/help/admin/dashboard#active-shows" }}
          >
            <p>
              Shows that are live or still in flight: everything not archived. The count is the
              total on your account, even if the list below is capped.
            </p>
          </HoverHelp>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showFind ? (
            <label className="relative block w-40 sm:w-52">
              <span className="sr-only">Find a show by name</span>
              <Search
                aria-hidden="true"
                size={16}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <input
                data-testid="shows-find-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find"
                aria-label="Find a show by name"
                className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-sm text-text-strong placeholder:text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
              />
            </label>
          ) : null}
          {bucketControl}
        </div>
      </div>

      {/* M12.10: when the list is CAPPED, the sort headers + Find only act on the
          loaded slice. Disclose that ABOVE the table — adjacent to the controls —
          so it's seen BEFORE the first sort/search, not hundreds of rows below
          (adversarial R4). Renders only when overflowCount>0. */}
      {overflowCount > 0 ? (
        <p
          data-testid="shows-table-overflow"
          className="rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
        >
          Showing the first {rows.length} of {activeCount} shows — sorting and Find apply to just
          these {rows.length}, not the full set. Contact the developer if you need the full list.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div
          data-testid="admin-active-shows-empty"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-4 text-base text-text-subtle"
        >
          <p className="font-semibold text-text-strong">You do not have any shows yet.</p>
          <p>Share a sheet into your watched Drive folder and the sync will pick it up.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div
          data-testid="shows-find-empty"
          className="rounded-md border border-border bg-surface-sunken p-4 text-sm text-text-subtle"
        >
          {overflowCount > 0 ? (
            // The active list is CAPPED (ACTIVE_SHOWS_CAP) — `overflowCount` more
            // rows are not loaded client-side, so Find only searched the shown
            // rows. A bare "No shows match" would falsely imply the full set was
            // searched (adversarial R1, M12.3). Scope the copy honestly so a
            // no-match never reads as "this show does not exist".
            <>
              No matches for “{query.trim()}” among the {rows.length} shown shows — {overflowCount}{" "}
              more aren’t loaded here.
            </>
          ) : (
            <>No shows match “{query.trim()}”.</>
          )}
        </div>
      ) : (
        // Clean table: ONE bordered/rounded container; header + rows separated
        // by light dividers (divide-y) — no per-row boxed cards (M12.3 item 10).
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {/* Header — desktop only; shares ROW_GRID column tracks with the rows.
              M12.10: each label is a sort button (44px tap area via min-h-tap-min,
              so the header row grows to ~44px). No py on the container — the
              buttons carry the height. */}
          <div
            data-testid="shows-table-header"
            className={`hidden border-b border-border bg-surface-sunken px-4 text-xs font-medium uppercase text-text-subtle ${ROW_GRID}`}
            style={{ letterSpacing: "var(--tracking-eyebrow)" }}
          >
            {sortHeader("title", "Show")}
            {sortHeader("dates", "Dates")}
            {sortHeader("crew", "Crew")}
            {sortHeader("sync", "Sync status")}
            <span aria-hidden="true" />
          </div>

          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const dates = formatDateRange(row.showDateStart, row.showDateEnd);
              const crewLabel = `${row.crewCount ?? 0} crew`;
              return (
                <li key={row.id}>
                  <Link
                    href={`/admin/show/${encodeURIComponent(row.slug)}`}
                    data-testid={`shows-table-row-${row.slug}`}
                    className={`flex flex-col gap-1 px-4 py-3 underline-offset-2 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${ROW_GRID}`}
                  >
                    {/* Show cell — title + state pill (always visible) */}
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {/* M12.10: title WRAPS (no truncate) — min-w-0 + break-words
                            let a long name flow to a second line; the row stays
                            vertically centered (grid items-center). */}
                        <span className="min-w-0 break-words text-sm font-semibold text-text-strong">
                          {rowTitle(row)}
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

                    {/* Desktop columns (hidden <md). M12.10: NO truncation.
                        Dates never wrap (whitespace-nowrap) and fit the widened
                        10rem track; Crew is short; Sync wraps within its track.
                        All vertically centered via the grid's items-center. */}
                    <span
                      data-testid={`shows-dates-${row.slug}`}
                      className="hidden whitespace-nowrap text-sm text-text-subtle tabular-nums min-[720px]:block"
                    >
                      {dates ?? "—"}
                    </span>
                    <span className="hidden text-sm text-text-subtle tabular-nums min-[720px]:block">
                      {crewLabel}
                    </span>
                    <span
                      data-testid={`shows-sync-${row.slug}`}
                      className="hidden text-sm min-[720px]:block"
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
        </div>
      )}

      {/* M12.12 row 4 — restage legend. Keyed on `visible` (the SAME post-Find,
          post-sort array the rows .map over), NEVER the unfiltered `rows` input:
          zero rows → no legend; rows visible but none in the review bucket → no
          legend; a Find query hiding every review row → no legend. Appears and
          disappears INSTANTLY — no AnimatePresence, no animation classes; a
          bucket switch while Find is non-empty recomputes from the new visible
          set, still instant. */}
      {visible.some((r) => syncStatusBucket(r.lastSyncStatus).bucket === "review") ? (
        <p className="text-sm text-text-subtle">
          <span aria-hidden="true">⚠ </span>
          <span className="font-semibold text-text-strong">Changes to review</span> means a sheet
          edit is staged and waiting for your approval.{" "}
          <Link
            href="/help/admin/review-queues#re-stage"
            data-testid="help-affordance--dashboard-restage--legend"
            className="font-semibold text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
          >
            What the sync statuses mean →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
