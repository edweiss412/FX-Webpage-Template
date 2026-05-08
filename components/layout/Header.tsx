/**
 * components/layout/Header.tsx — page-chrome header for /show/[slug] (Task
 * 4.2 layout shell, plan lines 188-194).
 *
 * Editorial-asymmetric posture per DESIGN.md §3.1 (rhythm) and the project
 * anti-pattern list (no centered-everything, no rounded-everything, no
 * SaaS-dashboard density). The title sits at the top-left with the read-
 * first weight; the FXAV mark sits at the top-right as a small wordmark;
 * a 1px orange hairline at the bottom of the band is the SINGLE color
 * moment above the fold (per the §1 ≤10% accent-coverage cap).
 *
 * Server Component — no interactivity at this milestone. The theme-toggle
 * button lives in the Footer; the title here is a static read.
 *
 * Date rendering: `dates.set ?? dates.travelIn ?? dates.showDays[0]`. Same
 * fallback chain the slug uses (lib/parser/slug.ts:60-62) so the date the
 * crew sees in the URL is the date the crew sees in the header.
 */
import type { ShowRow } from "@/lib/parser/types";

type HeaderProps = {
  show: Pick<ShowRow, "title" | "client_label" | "dates" | "venue">;
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

export function Header({ show }: HeaderProps) {
  const date = pickHeaderDate(show.dates);
  const venueLine = show.venue?.name ?? null;

  return (
    <header data-testid="page-header" className="border-b border-border bg-bg">
      <div className="mx-auto flex w-full max-w-[1200px] items-end justify-between gap-6 px-4 pb-5 pt-7 sm:px-8 sm:pb-6 sm:pt-9">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-text-faint">
            {show.client_label}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight text-text-strong sm:text-3xl">
            {show.title}
          </h1>
          {(date || venueLine) && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-text-subtle">
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
        <p
          aria-label="FXAV"
          className="hidden shrink-0 self-start text-xs font-semibold uppercase tracking-[0.22em] text-text-subtle sm:block"
        >
          FXAV
        </p>
      </div>
      {/*
        The single accent moment above the fold. 1px hairline of brand orange
        at the band's bottom edge — DESIGN.md §1 (≤10% accent coverage). Not
        a thicker stripe (DESIGN.md §9 bans side-stripe / heavy-rule borders)
        and not gradient (also banned). Solid orange, full-width, hairline.
      */}
      <div className="h-px w-full bg-accent" aria-hidden="true" />
    </header>
  );
}
