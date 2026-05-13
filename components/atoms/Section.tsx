/**
 * components/atoms/Section.tsx — the canonical tile wrapper (M4 Task 4.4
 * shared atoms; spec §8.4 + DESIGN.md §3, §7).
 *
 * Every M4 tile (Lodging, Venue, Crew, Contacts, Schedule, …) wraps its
 * body in <Section>. The atom encapsulates the §8.4 tile contract so
 * tiles don't restate it — and so the Tailwind v4 stretch hygiene
 * (memory/feedback_tailwind_v4_flex_items_stretch.md) lives in ONE
 * place.
 *
 * ---
 *
 * Variants (Task 4.13.distill — Finding 2 close-out).
 *
 * Shared design laws (DESIGN.md §9) ban "identical card grids with icon
 * + heading + text repeated." Pre-distill, ALL 13 tiles wrapped a
 * uniform `dl` of `KeyValue` rows in a single eyebrow-+-border-+-pad
 * card. The `variant` prop splits that into three shapes — each tile
 * MUST opt into one explicitly:
 *
 *   • `'reference'` (default — preserves pre-distill behavior)
 *       For tiles whose body is a stack of label/value pairs:
 *       Lodging, Venue, Transport, ShowStatus, Financials, Audio /
 *       Video / Lighting scope tiles, Notes ("Things to know").
 *       Body element defaults to <dl>; eyebrow heading; standard
 *       20px tile-pad.
 *
 *   • `'primary'`
 *       For tiles whose body IS the answer the crew member came for —
 *       a dense scannable list, NOT a description list. Schedule
 *       (timeline of show days) and PackList (numbered cases) use
 *       this variant. Body defaults to <div> (caller wraps its own
 *       <ol>/<ul>); eyebrow heading; tighter internal gap (gap-2.5
 *       instead of gap-3) so the per-row rhythm reads as a list, not
 *       a stack of fields.
 *
 *   • `'people'`
 *       For tiles whose body is a roster of humans — Crew and
 *       Contacts. Body defaults to <ul>; eyebrow heading; standard
 *       padding. Caller renders rows as avatar-chip + name-lead +
 *       role-subtle + tap-to-call/email controls (the avatar shape is
 *       a per-tile concern; the variant signals the body element +
 *       gap rhythm).
 *
 * Differentiation discipline (the "vary spacing for rhythm" law from
 * DESIGN.md §3.1, NOT a colored side-stripe): variants differ in
 *   - body element (<dl> vs <div> vs <ul>),
 *   - body inter-row gap (`gap-3` reference, `gap-2.5` primary,
 *     `gap-4` people),
 *   - heading-to-body gap (`gap-3` reference + people, `gap-2`
 *     primary so the leading row sits closer to the eyebrow),
 *
 * No side-stripe borders, no gradient text, no glassmorphism, no
 * nested cards — per `DESIGN.md §9` absolute bans.
 *
 * ---
 *
 * Constants always preserved by every variant (the §8.4 invariant
 * surface — Task 4.13 layout-dimensions Playwright proves these
 * end-to-end and would catch any regression):
 *
 *   • outer wrapper class:
 *     `h-full min-h-tile-min-h
 *       flex flex-col rounded-md border border-border bg-surface
 *       p-tile-pad`
 *   • body wrapper carries
 *     `max-h-tile-overflow overflow-y-auto`
 *     so the §8.4 internal-overflow rule is enforced inside ONE place
 *     (this atom). Tiles do NOT restate it.
 *   • heading is an `<h2>` — page hierarchy is <h1>=show title
 *     (Header), <h2>=tile heading. The Right Now card's <h2> is a
 *     sibling section, not a sub-heading.
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";

/**
 * The three tile shapes. See file header for assignment.
 */
type SectionVariant = "reference" | "primary" | "people";

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
   *     used when the tile body is the primary content.
   *   • `'prominent'` — larger, semibold; used when the heading
   *     itself is a primary value (e.g., the venue name).
   */
  headingTone?: "eyebrow" | "prominent";

  /**
   * Tile shape. Defaults to `'reference'` (the pre-distill behavior).
   * Each tile MUST opt in explicitly per the file header.
   */
  variant?: SectionVariant;

  /**
   * Optional ReactNode rendered immediately to the LEFT of the
   * heading inside the eyebrow row. Used by the scope tiles
   * (AudioScopeTile, VideoScopeTile, LightingScopeTile) to render a
   * leading lucide-react icon so the three otherwise-similar tiles
   * differentiate at a glance (Finding 8). The icon's color +
   * alignment are the caller's concern; the atom only allocates a
   * `flex items-center gap-1.5` slot.
   */
  headingIcon?: ReactNode;

  /**
   * Optional secondary line rendered immediately under the heading
   * (e.g., venue address under venue name). Free-form ReactNode.
   */
  subheading?: ReactNode;

  /**
   * Override the default body element for the chosen variant.
   * Defaults: `'dl'` for `'reference'`, `'div'` for `'primary'`,
   * `'ul'` for `'people'`. Callers that need a different element
   * (e.g., a Lodging tile rendering a stack of mini-blocks rather
   * than a single dl) pass `bodyAs="div"` explicitly.
   */
  bodyAs?: "dl" | "div" | "ul" | "ol";

  /** Body content. */
  children: ReactNode;

  /** Optional supplementary aria-label for screen readers. */
  ariaLabel?: string;
};

/**
 * Per-variant body element default. Callers can override via
 * `bodyAs`; this map is the fallback. Exported for tests so the
 * variant contract is asserted in one place.
 */
export const VARIANT_BODY_DEFAULT: Record<SectionVariant, "dl" | "div" | "ul"> = {
  reference: "dl",
  primary: "div",
  people: "ul",
};

export function Section({
  testId,
  heading,
  headingTone = "eyebrow",
  variant = "reference",
  headingIcon,
  subheading,
  bodyAs,
  children,
  ariaLabel,
}: SectionProps) {
  // Tailwind v4 stretch hygiene: the tile-grid in app/show/[slug]/page.tsx
  // declares `items-stretch`; this wrapper MUST declare `h-full` to
  // actually consume the stretched cell. Without it, tiles collapse to
  // intrinsic content height and the §8.4 row-stretch invariant fails.
  // See memory/feedback_tailwind_v4_flex_items_stretch.md and the Task
  // 4.13 layout-dimensions Playwright assertion that verifies it end-
  // to-end. The outer wrapper is variant-invariant — every variant
  // shares the same shell so the §8.4 dimensional invariants hold for
  // every tile regardless of shape.
  const outerClass = [
    "h-full min-h-tile-min-h",
    "flex flex-col",
    // Heading-to-body gap differs per variant — `primary` runs tighter
    // so the leading row of a timeline/numbered list sits closer to the
    // eyebrow, which reads as one unified scannable column instead of a
    // detached header + body. Reference + people keep the standard
    // gap-3 rhythm.
    variant === "primary" ? "gap-2" : "gap-3",
    "rounded-md border border-border bg-surface",
    "p-tile-pad",
  ].join(" ");

  // Heading classes by tone.
  const headingClass =
    headingTone === "prominent"
      ? "text-lg font-semibold leading-tight tracking-tight text-text-strong"
      : "text-xs font-medium uppercase tracking-eyebrow text-text-faint";

  // Resolve body element (caller override > variant default).
  const Body = bodyAs ?? VARIANT_BODY_DEFAULT[variant];

  // Body inter-row gap differs per variant per the file-header
  // discipline. People rows carry more breathing room (each row is a
  // person-block with two lines + tap targets); primary runs tighter
  // (dense scannable list); reference holds the standard 12px rhythm.
  const bodyGap = variant === "people" ? "gap-4" : variant === "primary" ? "gap-2.5" : "gap-3";

  return (
    <article
      data-testid={testId}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      className={outerClass}
    >
      <header className="flex flex-col gap-1">
        {/*
          Eyebrow row — when a leading icon is supplied (scope tiles),
          we wrap the icon + heading in a horizontal flex row so the
          icon sits visually inline with the eyebrow text. Without an
          icon, the heading renders directly (no extra DOM) so existing
          tests that scan text content stay stable.
        */}
        {headingIcon ? (
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-text-faint">
              {headingIcon}
            </span>
            <h2 className={headingClass}>{heading}</h2>
          </div>
        ) : (
          <h2 className={headingClass}>{heading}</h2>
        )}
        {subheading ? <div className="text-sm text-text-subtle">{subheading}</div> : null}
      </header>
      {/*
        §8.4 invariant 4 (internal-overflow rule). Tailwind v4 token map:
        `max-h-tile-overflow` resolves to 240px (`@theme` token
        `--spacing-tile-overflow`, canonical Tailwind v4 utility) and
        `overflow-y-auto` triggers the scroll container when intrinsic
        content height exceeds it. Tiles whose body fits inside 240px
        never see scroll because content < container; tiles that overflow
        keep the excess internal, never blowing past their row track.
        Verified by tests/e2e/layout-dimensions.spec.ts (AC-4.4).

        `flex-1` deliberately allows the body to grow into the row
        stretch (§8.4 invariant 2 — equal-height tiles in the first
        row). `max-h-tile-overflow` only kicks in once the
        body's intrinsic content height exceeds 240px (§8.4 invariant
        4); under that threshold the body fills whatever vertical space
        the stretched row gives it. Do NOT remove `flex-1` in a
        "simplify" pass — without it, equal-height stretch fails on
        rows where neighboring tiles are taller.

        The body class is variant-invariant on overflow (every variant
        gets the §8.4 contract) but variant-specific on inter-row gap
        per `bodyGap`.
      */}
      <Body className={`flex flex-1 flex-col ${bodyGap} overflow-y-auto max-h-tile-overflow`}>
        {children}
      </Body>
    </article>
  );
}
