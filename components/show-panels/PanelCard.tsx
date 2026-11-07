/**
 * components/show-panels/PanelCard.tsx
 *
 * The crew panel card (crew page redesign spec §6.1 line 290): the card a crew
 * section draws around a shared body, and around its crew-only blocks. Its box is
 * the admin panel card's box (surface, border, radius, padding and shadow tokens,
 * `ModalSectionChrome`'s unflagged branch in
 * components/admin/wizard/step3ReviewSections.tsx) and its chip is the admin's
 * 28px icon chip, proven equal by tests/components/show-panels/
 * panelCardParity.test.tsx.
 *
 * One title per section (docs/superpowers/specs/2026-11-07-crew-panel-followups-design.md
 * §4): the sheet's or the stacked section's h2 already names the section, so a card
 * given `sectionId` prints no title unless `titled` says it tells two cards apart. An
 * untitled card keeps the label as a `hidden` search group, because the search entries
 * inside it name that group and the parity harness reads it from the region; `hidden`
 * keeps it out of heading navigation. A crew-only card passes its own `title` and
 * `icon`, printed by default.
 *
 * The card's existing header actions arrive through `actions`, and its card id
 * is `data-card-id`, the search region of the lines inside it (spec §6.4).
 *
 * Server-safe and hook-free (the show-panels boundary).
 */
import type { ComponentType, ReactNode } from "react";

import { showSection, type ShowSectionId } from "@/lib/showSections/registry";

type PanelCardHeading =
  /** The registry section this card holds: its label and glyph. */
  | { sectionId: ShowSectionId; title?: never; icon?: never }
  /** A crew-only card's own title and glyph. */
  | { sectionId?: never; title: string; icon: ComponentType<{ className?: string }> };

type PanelCardProps = PanelCardHeading & {
  /** Print the title. Default: false with `sectionId`, true with `title`. */
  titled?: boolean;
  /** The title's search line id, emitted as `data-search-target`. */
  titleSearchTarget?: string;
  /** The card's id (`CARD_REGION_MAP`), emitted as `data-card-id` when present. */
  cardId?: string;
  /** The card's header actions (the source link and the report button). */
  actions?: ReactNode;
  children: ReactNode;
};

export function PanelCard(props: PanelCardProps) {
  const { titled, titleSearchTarget, cardId, actions, children } = props;
  const { label, icon: Icon } =
    props.sectionId !== undefined
      ? showSection(props.sectionId)
      : { label: props.title, icon: props.icon };
  const showTitle = titled ?? props.sectionId === undefined;
  return (
    <section
      data-testid="crew-panel-card"
      data-card-id={cardId}
      className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
    >
      {showTitle ? null : (
        <span hidden data-search-group="">
          {label}
        </span>
      )}
      {/* The label's basis is its min-content width and it grows into what the
          actions leave, so it wraps between words beside them; when not even its
          longest word fits, the row wraps and the actions take their own line,
          right-aligned (the crew SectionCard's header rule). */}
      {showTitle || actions !== undefined ? (
        <header
          data-slot="panel-card-header"
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {showTitle ? (
            <div className="flex min-w-0 grow basis-[min-content] items-center gap-2.5">
              <span
                data-slot="panel-card-chip"
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface-sunken text-text-subtle"
              >
                <Icon className="size-4" />
              </span>
              <h3
                data-search-group=""
                data-search-target={titleSearchTarget}
                className="min-w-0 wrap-break-word text-base font-semibold text-text-strong"
              >
                {label}
              </h3>
            </div>
          ) : null}
          {actions !== undefined ? (
            // The crew cards' header action slot, the one every source-link and
            // report-button check scopes to (tests/components/crew/sourceLinkCoverage.test.tsx).
            <div data-slot="section-card-action" className="ml-auto flex shrink-0 items-center">
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
