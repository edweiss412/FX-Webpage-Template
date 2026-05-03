/**
 * components/atoms/Section.tsx — the canonical tile wrapper (M4 Task 4.4
 * shared atoms; spec §8.4 + DESIGN.md §3, §7).
 *
 * Every M4 tile (Lodging, Venue, Crew, Contacts, Schedule, …) wraps its
 * body in <Section>. The atom encapsulates the §8.4 tile contract so
 * tiles don't restate it — and so the Tailwind v4 stretch hygiene
 * (memory/feedback_tailwind_v4_flex_items_stretch.md) lives in ONE
 * place:
 *
 *   • outer wrapper  : `h-full min-h-(--spacing-tile-min-h)
 *                       flex flex-col rounded-md border border-border
 *                       bg-surface p-(--spacing-tile-pad)`
 *   • heading slot   : `<h2>` — the page title is `<h1>` (Header.tsx),
 *                      so tile headings sit at the next semantic step.
 *                      `text-xs uppercase tracking-wide text-text-faint`
 *                      is the tile-eyebrow read; an optional
 *                      `headingTone="prominent"` switches it to the
 *                      tile-title read for tiles whose primary value is
 *                      the heading itself (e.g., venue name).
 *   • body           : `<dl>` when the section is mostly KeyValue
 *                      pairs; `<div>` when free-form. The atom defaults
 *                      to <dl>; pass `bodyAs="div"` to override. The
 *                      body wrapper ALSO carries `max-h-(--spacing-tile-
 *                      overflow) overflow-y-auto` so any tile whose
 *                      intrinsic content height exceeds the §8.4
 *                      240px ceiling keeps its overflow internal — the
 *                      tile itself never grows past the row, the body
 *                      scrolls. This is THE single source of truth for
 *                      the §8.4 invariant 4 contract; tiles do NOT
 *                      restate it. Verified end-to-end by
 *                      tests/e2e/layout-dimensions.spec.ts.
 *
 * Why <h2> and not <h3>: page hierarchy is <h1>=show title (Header) →
 * <h2>=tile heading. The Right Now card uses its own <h2> at the same
 * level (it's a sibling section, not a sub-heading of the tile grid).
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";

type SectionProps = {
  /**
   * `data-testid` for the tile's outer wrapper. Every tile gets a
   * stable id (e.g., `lodging-tile`) so e2e tests can assert presence
   * + content without coupling to internal markup.
   */
  testId: string;

  /** Tile heading text. Rendered inside an <h2>. */
  heading: string;

  /**
   * Heading visual tone:
   *   • `'eyebrow'` (default) — small uppercase tracking-wide label;
   *     used when the tile body is the primary content (Lodging,
   *     Crew, Contacts).
   *   • `'prominent'` — larger, semibold; used when the heading
   *     itself is a primary value (e.g., the venue name).
   */
  headingTone?: "eyebrow" | "prominent";

  /**
   * Optional secondary line rendered immediately under the heading
   * (e.g., venue address under venue name). Free-form ReactNode.
   */
  subheading?: ReactNode;

  /**
   * The tile body. Wrapped in a <dl> by default since most tiles
   * render a stack of <KeyValue> rows. Pass `bodyAs="div"` to switch
   * (e.g., for the Crew tile that wants <ul> semantics one level
   * deeper).
   */
  bodyAs?: "dl" | "div";

  /** Body content. */
  children: ReactNode;

  /** Optional supplementary aria-label for screen readers. */
  ariaLabel?: string;
};

export function Section({
  testId,
  heading,
  headingTone = "eyebrow",
  subheading,
  bodyAs = "dl",
  children,
  ariaLabel,
}: SectionProps) {
  // Tailwind v4 stretch hygiene: the tile-grid in app/show/[slug]/page.tsx
  // declares `items-stretch`; this wrapper MUST declare `h-full` to
  // actually consume the stretched cell. Without it, tiles collapse to
  // intrinsic content height and the §8.4 row-stretch invariant fails.
  // See memory/feedback_tailwind_v4_flex_items_stretch.md and the Task
  // 4.13 layout-dimensions Playwright assertion that verifies it end-
  // to-end.
  const outerClass = [
    "h-full min-h-(--spacing-tile-min-h)",
    "flex flex-col gap-3",
    "rounded-md border border-border bg-surface",
    "p-(--spacing-tile-pad)",
  ].join(" ");

  // Heading classes by tone.
  const headingClass =
    headingTone === "prominent"
      ? "text-lg font-semibold leading-tight tracking-tight text-text-strong"
      : "text-xs font-medium uppercase tracking-[0.14em] text-text-faint";

  // Body element + class. <dl> for description-list tiles, <div>
  // otherwise. Both stretch to fill the remaining vertical space so
  // the tile's bottom edge stays aligned across the row.
  const Body = bodyAs === "dl" ? "dl" : "div";

  return (
    <article
      data-testid={testId}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      className={outerClass}
    >
      <header className="flex flex-col gap-1">
        <h2 className={headingClass}>{heading}</h2>
        {subheading ? (
          <div className="text-sm text-text-subtle">{subheading}</div>
        ) : null}
      </header>
      {/*
        §8.4 invariant 4 (internal-overflow rule). Tailwind v4 token map:
        `max-h-(--spacing-tile-overflow)` resolves to 240px and
        `overflow-y-auto` triggers the scroll container when intrinsic
        content height exceeds it. Tiles whose body fits inside 240px
        never see scroll because content < container; tiles that overflow
        keep the excess internal, never blowing past their row track.
        Verified by tests/e2e/layout-dimensions.spec.ts (AC-4.4).
      */}
      <Body className="flex flex-1 flex-col gap-3 overflow-y-auto max-h-(--spacing-tile-overflow)">
        {children}
      </Body>
    </article>
  );
}
