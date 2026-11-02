/**
 * components/crew/sections/ContactsSection.tsx — the crew page's Contacts
 * section (crew page redesign spec §6.2 `contacts` row, PR B Task 7).
 *
 * The crew panel card titled "Contacts" (the registry label, spec line 404)
 * around the shared Contacts body (components/show-panels/ContactsBody.tsx),
 * CALLED with the crew props (`contactsPanel`): one row per `data.contacts`
 * entry (venue and in-house AV), NEVER `show.client_contact` (the client rep is
 * not a crew-facing contact), capped at `CONTACTS_INLINE_CAP` with a
 * `[data-testid="contacts-overflow-stub"]` overflow affordance. The card keeps
 * the `crew-contacts` card id and its header actions (spec line 328), and the
 * section its own wrapper, `crew:contacts:list` (plan decision 6).
 *
 * Membership is "always" (spec line 240): with no contacts the section shows its
 * own empty state. A failed contacts read shows its load-failure block to an
 * admin only, as the Crew section did before the move (spec line 241); every
 * other viewer sees the section as the projection left it.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` flags resolve via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section
 * does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { CONTACTS_CARD_ID, contactsPanel } from "@/components/crew/sections/contactsRows";
import { ContactsBody } from "@/components/show-panels/ContactsBody";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";

// The inline cap lives with the row derivation (contactsRows.ts); re-exported
// here, beside the section that renders it.
export { CONTACTS_INLINE_CAP } from "@/components/crew/sections/contactsRows";

type ContactsSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function ContactsSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: ContactsSectionProps): JSX.Element {
  // Single canonical viewer resolution; a malformed crewMembers projection
  // throws MalformedProjectionError OUTSIDE WrappedSection so the route-level
  // handler sees it.
  const { isAdmin } = resolveViewerContext(viewer, data);

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The
  // contacts block is ungated (the gate is satisfied for all viewers), so the
  // FETCH error surfaces an inline degraded block to admin only. NO
  // upsertAdminAlert (the _CrewShell projection alert is the sole producer).
  const contactsFetchFailed = Boolean(data.tileErrors["contacts"]) && isAdmin;

  return (
    <div data-testid="section-contacts" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:contacts:list"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // The shared body's crew props (capped, notes, search targets) from contactsRows.ts.
          const panel = contactsPanel(data);
          const hasContacts = data.contacts.length > 0;
          return (
            <>
              {contactsFetchFailed ? <SectionTileError domain="contacts" /> : null}
              {!hasContacts && !contactsFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState label="No contacts on file yet." />
                </div>
              ) : null}
              {hasContacts ? (
                <PanelCard
                  sectionId="contacts"
                  cardId={CONTACTS_CARD_ID}
                  actions={
                    <CardHeaderActions
                      cardId={CONTACTS_CARD_ID}
                      driveFileId={data.driveFileId}
                      anchor={data.sourceAnchors[CARD_REGION_MAP[CONTACTS_CARD_ID]]}
                      showId={showId}
                      cardReport={cardReport}
                    />
                  }
                >
                  {/* CALLED, not rendered as an element, so a throw from the
                      body is inside the wrapper's catch (spec §6.1, error
                      containment). */}
                  {ContactsBody({
                    ...panel.body,
                    overflow: (hidden) => (
                      <p
                        data-testid="contacts-overflow-stub"
                        data-search-skip=""
                        data-tile-show-more="true"
                        className="rounded-sm border-t border-border bg-surface-sunken px-3 py-2 pt-4 text-sm text-text-subtle"
                      >
                        <span className="tabular-nums">+{hidden}</span>{" "}
                        {hidden === 1 ? "more contact" : "more contacts"} on the source sheet
                      </p>
                    ),
                  })}
                </PanelCard>
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}
