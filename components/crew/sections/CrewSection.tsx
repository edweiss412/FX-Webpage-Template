/**
 * components/crew/sections/CrewSection.tsx — crew-redesign §9 "Crew" section.
 *
 * The single synchronous Server Component that homes the deleted CrewTile +
 * ContactsTile into one curated two-column surface:
 *
 *   - Column A "Show crew" — one PersonRow per `data.crewMembers`. The viewer
 *     gets a "You" chip (id === viewer.crewMemberId); department leads get a
 *     "Lead" chip (roleFlags includes "LEAD"). Capped at CREW_INLINE_CAP with a
 *     `[data-tile-show-more]` "+N more" affordance when the roster is longer
 *     (N = crewMembers.length - CREW_INLINE_CAP). Ported from CrewTile's §8.4 /
 *     AC-4.4 overflow idiom.
 *   - Column B "Key contacts" — one PersonRow per `data.contacts` (venue /
 *     in-house AV). NEVER `data.show.client_contact` — the client rep is not a
 *     crew-facing key contact (§9 test 30). Capped at CONTACTS_INLINE_CAP with a
 *     `[data-testid="contacts-overflow-stub"]` overflow affordance.
 *
 * Layout: when BOTH columns have data the surface is a split-wide grid — Show
 * crew on the wide-left `1.6fr` track, Key contacts on the narrow-right `1fr` —
 * side-by-side once split (`@min-crew-split`), stacked (single column) below. The grid is
 * `items-start` so the SHORT "Key contacts" card takes its natural height
 * instead of stretching to match the tall roster and leaving dead space below it
 * (2026-06-21 owner amendment — see v1-pre-deployment-amendments). When only ONE side has
 * data (roster-only OR contacts-only) the wrapper is a plain `flex flex-col`
 * single full-width column so a one-sided surface never leaves a blank right
 * track. The split reads the body's CONTAINER, never the viewport (DESIGN.md §6);
 * `@min-crew-split:` is the single source of the column split.
 *
 * Generic-optional reads route through `shouldHideGenericOptional` so a
 * sentinel name/role (`''`/`TBD`/`N/A`/`TBA`) never seeds a PersonRow heading;
 * PersonRow itself already guards notes / phone / email. Those reads live in
 * the sibling crewRows.ts, which the crew search builder reads too.
 *
 * When BOTH columns are empty, a section-level `<EmptyState data-testid=
 * "section-empty">` renders so the surface is never blank.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `today` + `showId` are passed in; `viewer` flags resolve via
 * `resolveViewerContext` (which throws MalformedProjectionError on a malformed
 * crewMembers projection — this section does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { PhoneIcon, UsersIcon } from "@/components/crew/icons/sectionIcons";
import { WrappedSection } from "@/components/crew/WrappedSection";
import {
  CONTACTS_CARD_ID,
  CONTACTS_INLINE_CAP,
  CONTACTS_TITLE,
  CREW_INLINE_CAP,
  ROSTER_CARD_ID,
  ROSTER_TITLE,
  contactPersons,
  rosterPersons,
} from "@/components/crew/sections/crewRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

// The inline caps and the nameless-contact label live with the row derivation
// (crewRows.ts); re-exported here, where their consumers have always read them.
export {
  CONTACTS_INLINE_CAP,
  CREW_INLINE_CAP,
  contactFallbackLabel,
} from "@/components/crew/sections/crewRows";

type CrewSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function CrewSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: CrewSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + none-restriction;
  // crew/admin_preview → matched row; a malformed crewMembers projection throws
  // MalformedProjectionError (the page's existing infra arm catches it — this is
  // INTENTIONALLY outside WrappedSection so the route-level handler sees it).
  const { isAdmin } = resolveViewerContext(viewer, data);

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The
  // key-contacts column reads data.contacts; per _ShowBody §4.13 the contacts
  // block is ungated (the gate is satisfied for all viewers), so the FETCH
  // error surfaces an inline degraded block to admin and an omission to crew.
  // NO upsertAdminAlert (the _CrewShell projection alert is the sole producer).
  const contactsFetchFailed = Boolean(data.tileErrors["contacts"]) && isAdmin;

  return (
    <div data-testid="section-crew" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:crew:roster"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // --- Column A: Show crew --------------------------------------------------
          // Rows (capped, You/Lead/partial chips, search targets) from crewRows.ts.
          const crewMembers = data.crewMembers;
          const visibleCrew = rosterPersons(data, viewer);
          const crewOverflow = Math.max(0, crewMembers.length - CREW_INLINE_CAP);
          const hasCrew = crewMembers.length > 0;

          // --- Column B: Key contacts (NOT client_contact) --------------------------
          const contacts = data.contacts;
          const visibleContacts = contactPersons(data);
          const contactsOverflow = Math.max(0, contacts.length - CONTACTS_INLINE_CAP);
          const hasContacts = contacts.length > 0;

          const bothEmpty = !hasCrew && !hasContacts;
          // Split-wide grid (Show crew 1.6fr / Key contacts 1fr) ONLY when BOTH
          // columns have data; otherwise a single full-width column so a
          // one-sided surface never leaves a blank right track when split.
          const bothColumns = hasCrew && hasContacts;

          return (
            <>
              {contactsFetchFailed ? <SectionTileError domain="contacts" /> : null}

              {bothEmpty && !contactsFetchFailed ? (
                <div data-testid="section-empty">
                  <EmptyState label="No crew or contacts on file yet." />
                </div>
              ) : null}

              {bothEmpty ? null : (
                <div
                  className={
                    bothColumns
                      ? "grid grid-cols-1 gap-4 @min-crew-split:grid-cols-[1.6fr_1fr] @min-crew-split:items-start"
                      : "flex flex-col gap-4"
                  }
                >
                  {hasCrew ? (
                    <div
                      className="flex min-w-0 flex-col"
                      data-testid="crew-column"
                      data-crew-column="roster"
                      data-card-id={ROSTER_CARD_ID}
                    >
                      <SectionCard
                        icon={<UsersIcon />}
                        title={ROSTER_TITLE}
                        action={
                          <CardHeaderActions
                            cardId={ROSTER_CARD_ID}
                            driveFileId={data.driveFileId}
                            anchor={data.sourceAnchors[CARD_REGION_MAP[ROSTER_CARD_ID]]}
                            showId={showId}
                            cardReport={cardReport}
                          />
                        }
                      >
                        <ul className="flex flex-col gap-4">
                          {visibleCrew.map((row) => (
                            <div key={row.key} data-testid="crew-person-row">
                              <PersonRow person={row.person} />
                            </div>
                          ))}
                          {crewOverflow > 0 ? (
                            <li
                              data-testid="crew-overflow-stub"
                              data-search-skip=""
                              data-tile-show-more="true"
                              className="rounded-sm border-t border-border bg-surface-sunken px-3 py-2 pt-4 text-sm text-text-subtle"
                            >
                              <span className="tabular-nums">+{crewOverflow}</span>{" "}
                              {crewOverflow === 1 ? "more crew member" : "more crew members"} on the
                              source sheet
                            </li>
                          ) : null}
                        </ul>
                      </SectionCard>
                    </div>
                  ) : null}

                  {hasContacts ? (
                    <div
                      className="flex min-w-0 flex-col"
                      data-testid="crew-column"
                      data-crew-column="contacts"
                      data-card-id={CONTACTS_CARD_ID}
                    >
                      <SectionCard
                        icon={<PhoneIcon />}
                        title={CONTACTS_TITLE}
                        action={
                          <CardHeaderActions
                            cardId={CONTACTS_CARD_ID}
                            driveFileId={data.driveFileId}
                            anchor={data.sourceAnchors[CARD_REGION_MAP[CONTACTS_CARD_ID]]}
                            showId={showId}
                            cardReport={cardReport}
                          />
                        }
                      >
                        <ul className="flex flex-col gap-4">
                          {visibleContacts.map((row) => (
                            <div key={row.key} data-testid="contact-person-row">
                              <PersonRow person={row.person} />
                            </div>
                          ))}
                          {contactsOverflow > 0 ? (
                            <li
                              data-testid="contacts-overflow-stub"
                              data-search-skip=""
                              data-tile-show-more="true"
                              className="rounded-sm border-t border-border bg-surface-sunken px-3 py-2 pt-4 text-sm text-text-subtle"
                            >
                              <span className="tabular-nums">+{contactsOverflow}</span>{" "}
                              {contactsOverflow === 1 ? "more contact" : "more contacts"} on the
                              source sheet
                            </li>
                          ) : null}
                        </ul>
                      </SectionCard>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          );
        }}
      />
    </div>
  );
}
