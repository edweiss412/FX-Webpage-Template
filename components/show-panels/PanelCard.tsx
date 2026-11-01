/**
 * components/show-panels/PanelCard.tsx
 *
 * The crew panel card (crew page redesign spec §6.1 line 290): the card a crew
 * section draws around a shared body. Its box is the admin panel card's box
 * (surface, border, radius, padding and shadow tokens,
 * `ModalSectionChrome`'s unflagged branch in
 * components/admin/wizard/step3ReviewSections.tsx) and its chip is the admin's
 * 28px icon chip, proven equal by tests/components/show-panels/
 * panelCardParity.test.tsx. The label is an h3 (the card sits under the sheet's
 * or the stacked section's h2) and the section's search group heading.
 *
 * Label and glyph are the section's registry record (plan decision 4: a panel
 * card's title is its section's registry label), read through `showSection`.
 * The card's existing header actions arrive through `actions`, and its card id
 * is `data-card-id`, the search region of the lines inside it (spec §6.4).
 *
 * Server-safe and hook-free (the show-panels boundary).
 */
import type { ReactNode } from "react";

import { showSection, type ShowSectionId } from "@/lib/showSections/registry";

type PanelCardProps = {
  /** The registry section this card holds: its label and glyph. */
  sectionId: ShowSectionId;
  /** The card's id (`CARD_REGION_MAP`), emitted as `data-card-id` when present. */
  cardId?: string;
  /** The card's header actions (the source link and the report button). */
  actions?: ReactNode;
  children: ReactNode;
};

export function PanelCard({ sectionId, cardId, actions, children }: PanelCardProps) {
  const { label, icon: Icon } = showSection(sectionId);
  return (
    <section
      data-testid="crew-panel-card"
      data-card-id={cardId}
      className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
    >
      {/* The label's basis is its min-content width and it grows into what the
          actions leave, so it wraps between words beside them; when not even its
          longest word fits, the row wraps and the actions take their own line,
          right-aligned (the crew SectionCard's header rule). */}
      <header
        data-slot="panel-card-header"
        className="flex flex-wrap items-center justify-between gap-2"
      >
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
            className="min-w-0 wrap-break-word text-base font-semibold text-text-strong"
          >
            {label}
          </h3>
        </div>
        {actions !== undefined ? (
          // The crew cards' header action slot, the one every source-link and
          // report-button check scopes to (tests/components/crew/sourceLinkCoverage.test.tsx).
          <div data-slot="section-card-action" className="ml-auto flex shrink-0 items-center">
            {actions}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
