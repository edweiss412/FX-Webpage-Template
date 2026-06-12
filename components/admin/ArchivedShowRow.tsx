/**
 * components/admin/ArchivedShowRow.tsx (M12.2 Phase B2 Task 6.2 — spec §3.1).
 *
 * Read-only row for the dashboard's Archived segment. Unlike the Active
 * segment's <ShowsTable> rows (whole-row link + Re-sync / share / rotate
 * affordances on the per-show page), an archived row exposes ONLY:
 *   - the title,
 *   - an "Archived" pill (neutral/idle — the show is retired, crew-unreachable),
 *   - the archived-time line: "Archived {relative archived_at}" when set, else
 *     the fallback "Archived (date unknown)" (defense for any row seeded with a
 *     null archived_at outside the §6.1 legacy backfill, which should leave
 *     none — §3.1),
 *   - a one-tap Unarchive action (UnarchiveShowButton),
 *   - an "Open" link to the per-show admin page.
 * NO Re-sync, share, or rotate controls (those are gated `published && !archived`
 * and live on the per-show page).
 *
 * Dimensional invariants (§3.3): the row is `items-center`; the pill + action
 * cluster is `self-center`, so the Unarchive control + Archived pill stay within
 * the row height with no overflow. (Tailwind v4 does NOT default `.flex` to
 * align-items:stretch — the alignment is stated explicitly here; the real-browser
 * assertion lands in Phase 9.)
 *
 * Server Component — receives a pre-fetched ActiveShowRow (the shared dashboard
 * row shape; `archivedAt` is populated for archived rows) and the request-scoped
 * `now` from <Dashboard />. `unarchiveAction` is threaded down to the
 * (client) UnarchiveShowButton.
 */
import Link from "next/link";
import { formatRelative, type ActiveShowRow } from "@/lib/admin/showDisplay";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";

type ArchivedShowRowProps = {
  row: ActiveShowRow;
  now: Date;
  unarchiveAction: (showId: string) => Promise<void>;
};

export function ArchivedShowRow({ row, now, unarchiveAction }: ArchivedShowRowProps) {
  const archivedLine =
    row.archivedAt !== null
      ? `Archived ${formatRelative(row.archivedAt, now)}`
      : "Archived (date unknown)";

  return (
    <li
      data-testid={`archived-show-row-${row.slug}`}
      className="flex flex-col items-stretch gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-tile min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between"
    >
      {/* Title + archived metadata */}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-text-strong">
            {row.title ?? row.slug}
          </span>
          <span
            data-testid={`archived-pill-${row.slug}`}
            className="inline-flex items-center gap-1 self-center rounded-pill border border-status-idle px-2 py-0.5 text-xs font-semibold text-status-idle-text"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-idle" />
            Archived
          </span>
        </div>
        <span className="text-sm text-text-subtle tabular-nums">{archivedLine}</span>
      </div>

      {/* Actions — Unarchive + Open. self-center keeps them within row height. */}
      <div className="flex shrink-0 items-center gap-3 self-center">
        <UnarchiveShowButton showId={row.id} unarchiveAction={unarchiveAction} />
        <Link
          href={`/admin/show/${encodeURIComponent(row.slug)}`}
          data-testid={`archived-show-open-${row.slug}`}
          className="inline-flex min-h-tap-min items-center justify-center self-center px-3 text-sm font-medium text-accent-on-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open
        </Link>
      </div>
    </li>
  );
}
