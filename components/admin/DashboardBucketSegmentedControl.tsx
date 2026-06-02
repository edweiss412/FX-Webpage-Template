/**
 * components/admin/DashboardBucketSegmentedControl.tsx (M12.2 Phase B2 Task 6.2
 * — spec §3.1 / §3.3).
 *
 * Server-driven two-state segmented control atop the dashboard show list:
 *   [ Active ] [ Archived (N) ]
 *
 * The selected segment is a URL search-param (?bucket=active|archived), so
 * back/forward + refresh behave and the RSC re-fetches server-side — NOT
 * client-only state (§3.1). Each ENABLED segment is therefore a Next.js
 * <Link>; the currently-selected one carries aria-current="page".
 *
 * Guard (§3.1): when the Archived count is 0 there is nothing to navigate to,
 * so the "Archived (0)" segment still renders but is DISABLED/muted — a plain
 * <span> (not a link) with aria-disabled="true". (The Active segment is never
 * count-disabled: the empty active list has its own ShowsTable empty-state.)
 *
 * Dimensional invariants (§3.3): the track is `items-stretch` so both segments
 * share the control's full height; each segment is `h-full`. Tailwind v4 does
 * NOT default `.flex` to align-items:stretch, so the stretch is stated
 * explicitly here and verified by the Phase-9 real-browser assertion.
 */
import Link from "next/link";
import type { DashboardBucket } from "@/components/admin/Dashboard";

type Props = {
  bucket: DashboardBucket;
  activeCount: number;
  archivedCount: number;
};

const SEG_BASE =
  "inline-flex h-full min-h-tap-min items-center justify-center rounded-sm px-4 py-1.5 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

function segClass(selected: boolean): string {
  return selected
    ? `${SEG_BASE} bg-surface text-text-strong shadow-tile`
    : `${SEG_BASE} text-text-subtle hover:text-text-strong`;
}

export function DashboardBucketSegmentedControl({ bucket, activeCount, archivedCount }: Props) {
  const archivedDisabled = archivedCount === 0;
  return (
    <div
      data-testid="dashboard-bucket-segmented"
      role="group"
      aria-label="Show bucket filter"
      className="inline-flex items-stretch gap-1 rounded-md border border-border bg-surface-sunken p-1"
    >
      {/* Navigation links, not ARIA tabs (no tabpanel) — selection is carried by aria-current="page". */}
      <Link
        href="?bucket=active"
        data-testid="dashboard-bucket-active"
        aria-current={bucket === "active" ? "page" : undefined}
        className={segClass(bucket === "active")}
      >
        Active
      </Link>

      {archivedDisabled ? (
        // Disabled segment shows a meaningful count, so its text must clear the AA floor (DESIGN hard
        // floor / sunlit readability) — text-subtle (6.09:1 light / 6.94:1 dark), not text-faint (3.02:1).
        <span
          data-testid="dashboard-bucket-archived"
          aria-disabled="true"
          className={`${SEG_BASE} cursor-not-allowed text-text-subtle`}
        >
          Archived ({archivedCount})
        </span>
      ) : (
        <Link
          href="?bucket=archived"
          data-testid="dashboard-bucket-archived"
          aria-current={bucket === "archived" ? "page" : undefined}
          className={segClass(bucket === "archived")}
        >
          Archived ({archivedCount})
        </Link>
      )}
    </div>
  );
}
