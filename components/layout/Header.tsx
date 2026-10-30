/**
 * components/layout/Header.tsx — page-chrome header for /show/[slug].
 *
 * M9 C1 / M4-D3: shrunken to a context strip so the Today hero wins the
 * page's primary visual moment unambiguously. The title sits at text-
 * base/lg semibold (was text-2xl/3xl bold); the date line runs at
 * text-xs (was text-sm); the orange hairline is removed (it was fighting
 * the Today hero's accent dot); the FXAV wordmark tones down to text-
 * faint; vertical padding tightens to py-3/sm:py-4.
 *
 * Server Component. Its client islands are the theme switch (`ThemeToggle`)
 * and whatever the search slot is given.
 *
 * Crew page redesign (docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md
 * §4.1, §1.2):
 *
 *   - Eyebrow: client and venue on ONE line, "client · venue", each part
 *     hidden when it is a sentinel (`shouldHideGenericOptional`), the separator
 *     only between two present parts. The venue used to share the date line;
 *     the date line now carries the date alone.
 *   - Theme switch for EVERY crew-page viewer. An identified viewer has it just
 *     before the avatar menu, whose "Dark mode" checkbox stays; the two agree
 *     through the one theme store in `useAppliedTheme`. The avatar keeps the
 *     row's right edge, where its `right-0` popover was sized against the gutter.
 *   - Search slot: renders the node it is given (search's field, crew show
 *     search spec §9) and NOTHING, no wrapper, when given none. One element in
 *     both modes, placed by the row: below 1024px it wraps onto a full-width
 *     row of its own under the title (`order-last basis-full`); at 1024px and
 *     up (the crew page's mode boundary, spec §3.1) it returns to DOM order,
 *     between the title and the identity chip. DOM order is the wide order, so
 *     a screen reader hears title, search, chip in both modes.
 *   - Status slot: an empty element directly under the header bar, for the
 *     offline project to fill. Its parent (the crew shell's flex column) has
 *     no gap, so an empty slot costs nothing; in a gapped parent it would need
 *     DESIGN.md §7a's `empty:hidden`.
 *
 * Date rendering: `dates.set ?? dates.travelIn ?? dates.showDays[0]`. Same
 * fallback chain the slug uses (lib/parser/slug.ts:60-62) so the date the
 * crew sees in the URL is the date the crew sees in the header.
 */
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

import type { ShowRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type HeaderProps = {
  show: Pick<ShowRow, "title" | "client_label" | "dates" | "venue">;
  /**
   * Optional identity control (M11.5 §B Task C4). When provided, it REPLACES
   * the FXAV wordmark and stays visible on mobile — crew rely on the
   * IdentityChip's "Not you?" recovery affordance on the same viewports that
   * hide the decorative wordmark.
   */
  identityChip?: ReactNode;
  /**
   * Optional compact show-lifecycle pill (crew redesign Task 14 / D-2 /
   * wp-18). Ports the show-status surface out of the deleted
   * `ShowStatusTile` so the lifecycle state is visible on EVERY section
   * (it complements the home-only crew pass). The pill node is
   * server-rendered by `_CrewShell` from the request-scoped `today` —
   * a small badge only, NOT the pass's full live-ticking treatment.
   * Rendered next to the title. Omitted entirely when null/undefined so
   * Header stays backward-compatible for consumers that never pass it.
   */
  statusPill?: ReactNode;
  /**
   * Optional crew search field (crew show search spec §6.1, §9), rendered in
   * the search slot. Omitted entirely when null/undefined: no slot element.
   */
  search?: ReactNode;
};

/** One part of the eyebrow, or null when it is absent or a sentinel. */
function eyebrowPart(value: string | null | undefined): string | null {
  if (value == null || shouldHideGenericOptional(value)) return null;
  return value.trim();
}

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

export function Header({ show, identityChip, statusPill, search }: HeaderProps) {
  const date = pickHeaderDate(show.dates);
  const client = eyebrowPart(show.client_label);
  const venue = eyebrowPart(show.venue?.name);
  const hasEyebrow = client !== null || venue !== null;
  const hasIdentity = identityChip !== undefined && identityChip !== null;

  return (
    <>
      <header data-testid="page-header" className="border-b border-border bg-bg">
        {/* `flex-wrap` only ever wraps the search slot: the title block is
            `flex-1` (a zero basis) beside a small right slot, so without a
            search node the row is the single line it always was. `gap-y`
            equals the padding the search row used to carry under the title. */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 py-3 sm:gap-y-4 sm:px-8 sm:py-4">
          <div data-testid="page-header-title-block" className="min-w-0 flex-1">
            {hasEyebrow ? (
              <p
                data-testid="page-header-eyebrow"
                className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle"
              >
                {client}
                {client !== null && venue !== null ? (
                  <>
                    {/* The dot is for the eye; a screen reader hears the comma,
                        the pause the dot gives a sighted reader (the avatar
                        menu's identity line does the same). */}
                    <span className="sr-only">{", "}</span>
                    <span aria-hidden="true">{" · "}</span>
                  </>
                ) : null}
                {venue}
              </p>
            ) : null}
            {statusPill !== undefined && statusPill !== null ? (
              // Pill present (crew page): h1 + pill share a flex title row. The
              // mt-1 (when an eyebrow is above) lives on this wrapper.
              <div
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${hasEyebrow ? "mt-1" : ""}`}
              >
                <h1 className="text-base font-semibold leading-tight tracking-tight text-text-strong sm:text-lg">
                  {show.title}
                </h1>
                <span data-testid="header-status-pill" className="shrink-0">
                  {statusPill}
                </span>
              </div>
            ) : (
              // No pill: the h1 is the direct first child of the title block,
              // carrying its own mt-1 only under an eyebrow — preserving the
              // M4-D3 rebalance contract (no orphan eyebrow whitespace).
              <h1
                className={`text-base font-semibold leading-tight tracking-tight text-text-strong sm:text-lg${
                  hasEyebrow ? " mt-1" : ""
                }`}
              >
                {show.title}
              </h1>
            )}
            {date ? (
              <p className="mt-1 text-xs text-text-subtle">
                <time dateTime={date} className="font-medium text-text">
                  {formatHeaderDate(date)}
                </time>
              </p>
            ) : null}
          </div>
          {search !== undefined && search !== null ? (
            <div
              data-testid="page-header-search"
              className="order-last basis-full lg:order-0 lg:max-w-xl lg:grow lg:basis-0 lg:self-center"
            >
              {search}
            </div>
          ) : null}
          <div
            className="flex shrink-0 items-center gap-3 self-start"
            data-testid="page-header-right-slot"
            data-identity={hasIdentity ? undefined : "none"}
          >
            {hasIdentity ? (
              <>
                <ThemeToggle />
                {identityChip}
              </>
            ) : (
              <>
                {/* No resolved identity, so no avatar and no menu: the switch is
                    the only theme control on the page, with the decorative
                    wordmark beside it at >=sm where there is room for both. No
                    `aria-label`: it is prohibited on `role=paragraph` (ARIA 1.2)
                    and redundant with the element's own text (audit P3). */}
                <p
                  className="hidden text-xs font-semibold uppercase tracking-eyebrow-strong text-text-faint sm:block"
                  data-testid="page-header-fxav-wordmark"
                >
                  FXAV
                </p>
                <ThemeToggle />
              </>
            )}
          </div>
        </div>
      </header>
      <div data-testid="page-header-status-slot" />
    </>
  );
}
