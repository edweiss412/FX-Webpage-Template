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

type FooterProps = {
  /**
   * ISO timestamp of the last successful sync. When provided, renders as a
   * `<time>` with "as of …" copy. When null/absent, renders an empty span
   * so the slot still exists for layout consistency.
   */
  asOf?: string | null;
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

export function Footer({ asOf }: FooterProps) {
  const year = new Date().getUTCFullYear();
  return (
    <footer data-testid="page-footer" className="mt-auto border-t border-border bg-bg">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-3 px-4 py-6 text-xs text-text-subtle sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 sm:py-7">
        <p data-testid="page-footer-as-of" className="min-w-0">
          {asOf ? (
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
