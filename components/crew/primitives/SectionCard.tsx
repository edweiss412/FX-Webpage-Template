/**
 * components/crew/primitives/SectionCard.tsx — crew-redesign §4.6 primitive.
 *
 * A pure presentational card shell for a sub-nav section. Header is optional
 * in every part: `icon`, `title`, and `action` each render ONLY when supplied;
 * `children` ALWAYS render. The card shape matches the established tile idiom
 * (DESIGN.md §3/§4: `rounded-md border border-border bg-surface p-tile-pad`)
 * so crew sections read as the same family as the M4 tiles.
 *
 * Props (binding contract): {icon?, title?, action?, children}.
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
  /** Section body. Always rendered. */
  children: ReactNode;
};

export function SectionCard({ icon, title, action, children }: SectionCardProps) {
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
      {hasHeader ? (
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {icon !== undefined ? (
              <span
                data-slot="section-card-icon"
                aria-hidden="true"
                className="flex shrink-0 items-center text-text-faint"
              >
                {icon}
              </span>
            ) : null}
            {title !== undefined ? (
              <h2
                data-slot="section-card-title"
                className="truncate text-xs font-medium uppercase tracking-eyebrow text-text-faint"
              >
                {title}
              </h2>
            ) : null}
          </div>
          {action !== undefined ? (
            <div data-slot="section-card-action" className="flex shrink-0 items-center">
              {action}
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
