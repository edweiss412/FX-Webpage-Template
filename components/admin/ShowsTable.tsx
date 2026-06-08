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
import { ChevronRight, Search } from "lucide-react";
import {
  formatDateRange,
  formatRelative,
  type ActiveShowRow,
} from "@/components/admin/ActiveShowsPanel";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { syncStatusBucket } from "@/lib/admin/syncStatus";

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

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      trimmed.length === 0
        ? rows
        : rows.filter((row) => rowTitle(row).toLowerCase().includes(trimmed)),
    [rows, trimmed],
  );

  // The Find control is hidden when there are no rows to search (the empty
  // state owns the surface). It always renders when ≥1 show exists, even if a
  // query filters everything out (so the user can clear the query).
  const showFind = rows.length > 0;

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
          <HoverHelp label="Help: Active shows" testId="shows-help">
            <p>
              Shows that are live or still in flight — everything not archived. The count is the
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
              No matches for “{query.trim()}” among the {rows.length} shown shows —{" "}
              {overflowCount} more aren’t loaded here.
            </>
          ) : (
            <>No shows match “{query.trim()}”.</>
          )}
        </div>
      ) : (
        // Clean table: ONE bordered/rounded container; header + rows separated
        // by light dividers (divide-y) — no per-row boxed cards (M12.3 item 10).
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {/* Header — desktop only; shares ROW_GRID column tracks with the rows. */}
          <div
            data-testid="shows-table-header"
            className={`hidden border-b border-border bg-surface-sunken px-4 py-2 text-xs font-medium uppercase text-text-subtle ${ROW_GRID}`}
            style={{ letterSpacing: "var(--tracking-eyebrow)" }}
          >
            <span>Show</span>
            <span>Dates</span>
            <span>Crew</span>
            <span>Sync status</span>
            <span aria-hidden="true" />
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((row) => {
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
                        <span className="truncate text-sm font-semibold text-text-strong">
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
        </div>
      )}

      {overflowCount > 0 ? (
        <p
          data-testid="shows-table-overflow"
          className="rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
        >
          Showing the first {rows.length} of {activeCount} shows. Contact the developer if you
          need the full list.
        </p>
      ) : null}
    </div>
  );
}
