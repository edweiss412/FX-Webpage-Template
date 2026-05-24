/**
 * components/layout/Header.tsx — page-chrome header for /show/[slug].
 *
 * M9 C1 / M4-D3: shrunken to a context strip so the RightNowCard wins the
 * page's primary visual moment unambiguously. The title sits at text-
 * base/lg semibold (was text-2xl/3xl bold); the date · venue meta runs at
 * text-xs (was text-sm); the orange hairline is removed (it was fighting
 * the RightNowCard's accent dot); the FXAV wordmark tones down to text-
 * faint; vertical padding tightens to py-3/sm:py-4.
 *
 * Server Component — no interactivity. The theme-toggle button lives in
 * the Footer; the title here is a static read.
 *
 * Date rendering: `dates.set ?? dates.travelIn ?? dates.showDays[0]`. Same
 * fallback chain the slug uses (lib/parser/slug.ts:60-62) so the date the
 * crew sees in the URL is the date the crew sees in the header.
 */
import type { ReactNode } from "react";

import type { ShowRow } from "@/lib/parser/types";

type HeaderProps = {
  show: Pick<ShowRow, "title" | "client_label" | "dates" | "venue">;
  /**
   * Optional right-slot content. When provided (M11.5 §B Task C4), the
   * slot REPLACES the FXAV wordmark and stays visible on mobile —
   * crew rely on the IdentityChip's "Not you?" recovery affordance on
   * the same viewports that hide the decorative wordmark.
   */
  identityChip?: ReactNode;
};

/** Pick the show's display date — same fallback as the slug derivation. */
function pickHeaderDate(dates: ShowRow["dates"]): string | null {
  return dates.set ?? dates.travelIn ?? dates.showDays[0] ?? null;
}

/** Render an ISO date as "Month D, YYYY" — e.g. "April 17, 2026". */
function formatHeaderDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function Header({ show, identityChip }: HeaderProps) {
  const date = pickHeaderDate(show.dates);
  const venueLine = show.venue?.name ?? null;

  return (
    <header data-testid="page-header" className="border-b border-border bg-bg">
      <div className="mx-auto flex w-full max-w-[1200px] items-baseline justify-between gap-6 px-4 py-3 sm:px-8 sm:py-4">
        <div className="min-w-0 flex-1">
          {show.client_label ? (
            <p className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
              {show.client_label}
            </p>
          ) : null}
          <h1
            className={`text-base font-semibold leading-tight tracking-tight text-text-strong sm:text-lg ${
              show.client_label ? "mt-1" : ""
            }`}
          >
            {show.title}
          </h1>
          {(date || venueLine) && (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text-subtle">
              {date && (
                <time dateTime={date} className="font-medium text-text">
                  {formatHeaderDate(date)}
                </time>
              )}
              {date && venueLine && (
                <span aria-hidden="true" className="text-text-faint">
                  ·
                </span>
              )}
              {venueLine && <span>{venueLine}</span>}
            </p>
          )}
        </div>
        {identityChip !== undefined && identityChip !== null ? (
          <div className="shrink-0 self-start" data-testid="page-header-right-slot">
            {identityChip}
          </div>
        ) : (
          <p
            aria-label="FXAV"
            className="hidden shrink-0 self-start text-xs font-semibold uppercase tracking-eyebrow-strong text-text-faint sm:block"
            data-testid="page-header-fxav-wordmark"
          >
            FXAV
          </p>
        )}
      </div>
    </header>
  );
}
