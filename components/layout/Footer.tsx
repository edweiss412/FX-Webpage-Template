/**
 * components/layout/Footer.tsx — page-chrome footer for /show/[slug] (Task
 * 4.2 layout shell, plan lines 188-194).
 *
 * Quiet hairline. Three slots, left-to-right on desktop, stacked on mobile:
 *   1. "as of …" timestamp slot — placeholder for Task 4.16's stale-data
 *      UX. The element renders even with no asOf prop so Task 4.13's
 *      footer-presence assertion (data-testid="page-footer") passes.
 *   2. FXAV wordmark + copyright — small, neutral.
 *   3. Theme toggle — small `'use client'` island (`ThemeToggle`) that
 *      flips `<html data-theme>` and persists the choice in
 *      localStorage['fxav-theme']. The Footer itself stays a Server
 *      Component; only the toggle is a client island, per the impeccable
 *      v3 critique Finding 4 wire-up. PRODUCT.md commits to a "clearly
 *      discoverable theme toggle [that] respects `prefers-color-scheme`
 *      on first paint" — the no-FOUC inline script in `app/layout.tsx`
 *      handles the first-paint fallback; this slot carries the
 *      user-override.
 *
 * `mt-auto` is applied here so the footer pins to the viewport bottom on
 * short pages and flows on long pages (DESIGN.md §3 spacing rhythm + plan
 * line 191 sticky-vs-flow rule). The parent flex container (in layout.tsx)
 * declares `min-h-screen flex flex-col` to make `mt-auto` actually anchor.
 *
 * Server Component — interactivity is delegated to the ThemeToggle island.
 */
import { ThemeToggle } from "./ThemeToggle";
import { ReportButton } from "@/components/shared/ReportButton";
import { StaleFooter } from "@/components/shared/StaleFooter";

type FooterProps = {
  /**
   * ISO timestamp of the last successful sync. When provided, renders as a
   * `<time>` with "as of …" copy. When null/absent, renders an empty span
   * so the slot still exists for layout consistency.
   */
  asOf?: string | null;
  /**
   * Show id — when provided, the footer mounts a "Something looks wrong?"
   * ReportButton scoped to this show (M8 Task 8.4 §B). Crew members on
   * the venue floor file bug reports from this slot; the modal it opens
   * owns the idempotency-key + sessionStorage lifecycle.
   *
   * When null/absent, the report slot renders nothing — the footer is
   * also used in contexts (none today, but defensively) where no show
   * is in scope.
   */
  showId?: string | null;
  /** Crew page slug — used to derive a stable surfaceId for sessionStorage. */
  showSlug?: string | null;
  /**
   * Optional context the ReportModal autocaptures into the submit body.
   * The crew page passes viewerVisibleSection / lastSyncTimestamp /
   * staleTier / rightNowState; staged-review surfaces pass parse-shape
   * context. Forwarded verbatim into POST /api/report.
   */
  reportAutocapture?: React.ComponentProps<typeof ReportButton>["autocapture"];
  /**
   * `shows.last_synced_at` ISO timestamp. When provided alongside
   * `lastSyncStatus`, the asOf slot renders <StaleFooter> (Task 9.1)
   * with tier-aware copy + status precedence. When omitted, the slot
   * falls back to the legacy raw "as of …" rendering (or "syncing…").
   */
  lastSyncedAt?: string | null;
  /** `shows.last_sync_status`. Pairs with lastSyncedAt — see above. */
  lastSyncStatus?: string | null;
};

/** Render an ISO timestamp as a short "as of …" line. */
function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Date-only on small viewports keeps the line from wrapping awkwardly;
  // a future Task 4.16 polish task can restore time-of-day when stale.
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Footer({
  asOf,
  showId,
  showSlug,
  reportAutocapture,
  lastSyncedAt,
  lastSyncStatus,
}: FooterProps) {
  const year = new Date().getUTCFullYear();
  // surfaceId scope: one stable id per crew-page slug so sessionStorage
  // hydration finds the right persisted attempt across tab refresh.
  // Falls back to a generic id when no slug is in scope (defensive).
  const reportSurfaceId = showSlug ? `footer-crew-${showSlug}` : "footer-crew";
  return (
    <footer data-testid="page-footer" className="mt-auto border-t border-border bg-bg">
      <div className="mx-auto flex w-full max-w-300 flex-col items-start gap-3 px-4 py-6 text-xs text-text-subtle sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 sm:py-7">
        <p data-testid="page-footer-as-of" className="min-w-0">
          {lastSyncedAt ? (
            <StaleFooter lastSyncedAt={lastSyncedAt} lastSyncStatus={lastSyncStatus ?? null} />
          ) : asOf ? (
            <>
              <span className="text-text-faint">as of </span>
              <time dateTime={asOf} className="font-medium text-text">
                {formatAsOf(asOf)}
              </time>
            </>
          ) : (
            <span className="text-text-faint">syncing…</span>
          )}
        </p>
        <p className="font-semibold uppercase tracking-[0.18em] text-text-subtle">
          FXAV{" "}
          <span aria-hidden="true" className="font-regular text-text-faint">
            ·
          </span>{" "}
          <span className="font-regular tabular-nums">{year}</span>
        </p>
        {showId ? (
          <ReportButton
            surface="crew"
            surfaceId={reportSurfaceId}
            showId={showId}
            {...(reportAutocapture ? { autocapture: reportAutocapture } : {})}
          />
        ) : null}
        {/*
          Theme toggle. Client island — see ThemeToggle.tsx for the
          dataset/localStorage handshake and the no-FOUC contract with
          app/layout.tsx. The slot still satisfies the §3 ≥44px tap
          target via tokens; the icon glyph (Sun/Moon, lucide-react)
          shows the OPPOSITE of the current theme so the affordance
          reads "this is what you'll get if you tap."
        */}
        <ThemeToggle />
      </div>
    </footer>
  );
}
