/**
 * components/layout/Footer.tsx — page-chrome footer for /show/[slug] (Task
 * 4.2 layout shell, plan lines 188-194).
 *
 * THE ONE-ROW BAND (UI spec §2.2, ratified 2026-08-09 over three mockup rounds).
 * A raised band on `--color-surface-raised` — the token whose DESIGN.md §1.1
 * role literally includes "footer pinned-to-bottom variant" — carrying ONE row
 * at every width:
 *
 *   [ fine-print text cell, min-w-0 flex-1 ] [ report symbol, shrink-0 ]
 *
 * "One row" describes the DEFAULT state's look, not a promise long copy can
 * keep at 390px. The text cell WRAPS internally and never truncates: the
 * stale-warning copy ("This page hasn't updated recently. Text Doug to check on
 * it.") has to stay fully readable, which is the whole point of showing it.
 *
 * WHAT LEFT, AND WHY. The theme toggle is gone from here at every width —
 * ratified: "theme toggle doesn't belong in this grouping". It now lives in the
 * crew page header behind the avatar menu (`components/layout/Header.tsx`). The
 * report control lost its visible copy and kept its accessible name, so a
 * screen-reader user still hears the full invitation; the discoverability cost
 * of a symbol was surfaced on the mockup and ratified anyway (UI spec §4 limit 2).
 *
 * WHAT THE BAND DOES NOT OWN: bar clearance. That has exactly one owner,
 * `crew-shell`'s bottom padding, because padding INSIDE the footer moves the
 * footer's CONTENT up while the footer's own box still ends under the fixed bar.
 * A band that also carried clearance would ship silently oversized while the
 * geometry assertion still passed (UI spec §2.2).
 *
 * `mt-auto` is applied here so the footer pins to the viewport bottom on short
 * pages and flows on long pages (DESIGN.md §3 + the sticky-vs-flow rule). It
 * needs an unbroken flex chain to do anything: `page-shell` is
 * `flex min-h-screen flex-col` and `crew-shell` joins it as
 * `flex min-h-0 flex-1 flex-col`. It was a classless div until 2026-08-09, which
 * is why `mt-auto` silently did nothing (BL-CREW-FOOTER-NOT-ANCHORED-SHORT-CONTENT).
 *
 * The band still SCROLLS with the page — it is the page's end, not a second
 * fixed bar. Only clearance and layout changed.
 *
 * Server Component — no client island remains in this file.
 */
import { ReportButton } from "@/components/shared/ReportButton";
import { StaleFooter } from "@/components/shared/StaleFooter";
import { nowDate } from "@/lib/time/now";

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
   * `shows.last_checked_at` ISO timestamp (last successful Drive check). When
   * provided alongside `lastSyncStatus`, the asOf slot renders <StaleFooter>
   * (Task 9.1) with tier-aware copy + status precedence. When omitted, the slot
   * falls back to the legacy raw "as of …" rendering (or "syncing…").
   */
  lastCheckedAt?: string | null;
  /** `shows.last_sync_status`. Pairs with lastCheckedAt — see above. */
  lastSyncStatus?: string | null;
  /**
   * Override the report button surface and per-instance scope when the
   * footer is rendered inside the admin preview-as flow (M10 §B Task
   * 10.8 / §9.3). Without this, the footer's ReportButton hardcodes
   * `surface="crew"` and a per-slug surfaceId, which would silently
   * file admin-side preview reports as crew reports lacking the
   * crewPreview autocapture context. When provided, the footer mounts
   * the report button with the supplied surface + surfaceId so the
   * /api/report POST body carries the right audience and identity.
   */
  reportSurfaceOverride?: "admin" | "crew";
  reportSurfaceIdOverride?: string;
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

export async function Footer({
  asOf,
  showId,
  showSlug,
  reportAutocapture,
  lastCheckedAt,
  lastSyncStatus,
  reportSurfaceOverride,
  reportSurfaceIdOverride,
}: FooterProps) {
  // M11 Phase C Task C.2 / AC-11.38: single request-scoped "now" reused by
  // both the copyright year and the <StaleFooter> child. Production
  // behavior (no X-Screenshot-Frozen-Now header) is identical to new Date().
  const currentNow = await nowDate();
  const year = currentNow.getUTCFullYear();
  // surfaceId scope: one stable id per crew-page slug so sessionStorage
  // hydration finds the right persisted attempt across tab refresh.
  // Falls back to a generic id when no slug is in scope (defensive).
  const reportSurface = reportSurfaceOverride ?? "crew";
  const reportSurfaceId =
    reportSurfaceIdOverride ?? (showSlug ? `footer-crew-${showSlug}` : "footer-crew");
  return (
    <footer data-testid="page-footer" className="mt-auto border-t border-border bg-surface-raised">
      <div className="mx-auto flex w-full max-w-300 items-center gap-3 p-4 text-xs text-text-subtle sm:gap-6 sm:px-8 sm:py-5">
        {/*
          The wrapping text cell. `min-w-0` is load-bearing on a flex child: a
          flex item's default `min-width: auto` refuses to shrink below its
          content, so without it the longest stale string pushes the row wider
          than the viewport instead of wrapping inside the cell.
        */}
        <div
          data-testid="page-footer-fine-print"
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-1"
        >
          <p className="font-semibold uppercase tracking-eyebrow-strong text-text-subtle">
            FXAV{" "}
            <span aria-hidden="true" className="font-regular text-text-faint">
              ·
            </span>{" "}
            <span className="font-regular tabular-nums">{year}</span>
          </p>
          <span aria-hidden="true" className="text-text-faint">
            ·
          </span>
          {/*
            The freshness slot, three states kept VERBATIM from the stacked
            layout that preceded the band — this arc changed where they sit, not
            what they say or when they say it.
          */}
          <div data-testid="page-footer-as-of" className="min-w-0">
            {lastCheckedAt ? (
              <StaleFooter
                lastCheckedAt={lastCheckedAt}
                lastSyncStatus={lastSyncStatus ?? null}
                now={currentNow}
              />
            ) : asOf ? (
              <p>
                <span className="text-text-faint">as of </span>
                <time dateTime={asOf} className="font-medium text-text">
                  {formatAsOf(asOf)}
                </time>
              </p>
            ) : (
              <p>
                <span className="text-text-faint">syncing…</span>
              </p>
            )}
          </div>
        </div>
        {showId ? (
          <ReportButton
            surface={reportSurface}
            surfaceId={reportSurfaceId}
            showId={showId}
            variant="icon"
            ringOffset="surface-raised"
            {...(reportAutocapture ? { autocapture: reportAutocapture } : {})}
          />
        ) : null}
      </div>
    </footer>
  );
}
