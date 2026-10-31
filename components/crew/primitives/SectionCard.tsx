/**
 * components/crew/primitives/SectionCard.tsx — crew-redesign §4.6 primitive.
 *
 * A pure presentational card shell for a crew section. Header is optional
 * in every part: `icon`, `title`, and `action` each render ONLY when supplied;
 * `children` ALWAYS render. The card shape matches the established tile idiom
 * (DESIGN.md §3/§4: `rounded-md border border-border bg-surface p-tile-pad`)
 * so crew sections read as the same family as the M4 tiles.
 *
 * Props (binding contract): {icon?, title?, action?, eyebrow?, headingLevel?, children}.
 *
 * Header width (whole-diff review round 2, the CI-parity run's Gear titles): the
 * title block's basis is its min-content width (the icon and the title's longest
 * word) and it grows into whatever the action leaves, so a title wraps between
 * its words beside the action, as before; when not even its longest word fits
 * beside the action, the header wraps and the action takes its own line,
 * right-aligned, so a title is never squeezed to nothing. A label about the
 * card itself ("Your scope") is an `eyebrow` above the header, not part of the
 * action slot.
 *
 * Heading level: every crew page card sits under an h2 (a stacked section's
 * heading in the wide layout, the sheet's title, the Today block's heading), so
 * the title is an h3 unless a caller sets `headingLevel` (audit P2-4: at h2 a
 * card read as a sibling of the section holding it). A heading inside a card's
 * body is one level deeper again.
 *
 * Server Component (no `'use client'`) — props in, markup out.
 */
import type { ReactNode } from "react";

type SectionCardProps = {
  /** Optional leading glyph rendered inline before the title. */
  icon?: ReactNode;
  /** Optional eyebrow/section title. Omitted entirely when absent. */
  title?: string;
  /** Optional trailing action (e.g. a link/button), right-aligned in the header. */
  action?: ReactNode;
  /** Optional label above the header, about the card itself (Gear's "Your scope"). */
  eyebrow?: ReactNode;
  /** The title's heading level; 3 by default (the card sits under an h2). */
  headingLevel?: 2 | 3 | 4;
  /** Section body. Always rendered. */
  children: ReactNode;
};

const HEADING_TAG = { 2: "h2", 3: "h3", 4: "h4" } as const;

export function SectionCard({
  icon,
  title,
  action,
  eyebrow,
  headingLevel = 3,
  children,
}: SectionCardProps) {
  const Heading = HEADING_TAG[headingLevel];
  // The header row only renders when at least one of icon/title/action is
  // supplied — a card with body-only content gets no empty header band.
  const hasHeader = icon !== undefined || title !== undefined || action !== undefined;

  return (
    <section
      data-testid="section-card"
      // `h-full` lets the card fill an equal-height flex/grid slot when a parent
      // constrains height (§4.9 quick-cards row, crew columns). It is a no-op in
      // ordinary `flex-col` stacks where the parent does not constrain height, so
      // every other SectionCard call site is unaffected.
      className="flex h-full flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      {eyebrow !== undefined ? <div data-slot="section-card-eyebrow">{eyebrow}</div> : null}
      {hasHeader ? (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 grow basis-[min-content] items-center gap-2.5">
            {icon !== undefined ? (
              // Mock `.card-head .ico`: a sunken rounded square housing a ~15px
              // glyph (matches the established FactRows `.mini` treatment so card
              // headers and fact rows read as one icon family).
              <span
                data-slot="section-card-icon"
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-subtle [&_svg]:size-3.75"
              >
                {icon}
              </span>
            ) : null}
            {title !== undefined ? (
              <Heading
                data-slot="section-card-title"
                // The card title is a search group heading (spec §2.3): the
                // `group` a card's search entries name. It wraps rather than
                // truncates: beside the header actions ("In sheet" and the report
                // button) a one-line title was cut to "CREW SCHE…" in a 320px
                // sheet and "CREW S…" in the 1024 wide column, losing the card's
                // name (UI-gate re-run, critique N2; the run card's X10 class).
                data-search-group=""
                className="min-w-0 wrap-break-word text-xs font-medium uppercase tracking-eyebrow text-text-subtle"
              >
                {title}
              </Heading>
            ) : null}
          </div>
          {action !== undefined ? (
            <div data-slot="section-card-action" className="ml-auto flex shrink-0 items-center">
              {action}
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
