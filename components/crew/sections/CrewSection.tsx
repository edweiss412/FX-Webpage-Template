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
 * Layout: ≥720px renders the two columns side-by-side; <720px stacks them. The
 * flex row is `items-stretch` and each column is `h-full` because Tailwind v4
 * here does NOT default `.flex` to `align-items: stretch` (§4.9 dimensional
 * invariant) — both must be explicit so the two equal-height cards stay flush.
 * There is no `md` breakpoint in this project; the `min-[720px]:` arbitrary
 * variant is the single source of the column split.
 *
 * Generic-optional reads route through `shouldHideGenericOptional` so a
 * sentinel name/role (`''`/`TBD`/`N/A`/`TBA`) never seeds a PersonRow heading;
 * PersonRow itself already guards notes / phone / email.
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
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type CrewSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
};

/**
 * Cardinality cap for the crew roster before the `[data-tile-show-more]`
 * overflow affordance renders. Ported verbatim from CrewTile (CREW_INLINE_CAP
 * = 8) so the two surfaces agree on the roster floor.
 */
export const CREW_INLINE_CAP = 8;

/**
 * Cardinality cap for the key-contacts column before its overflow affordance
 * renders. Ported verbatim from ContactsTile (CONTACTS_INLINE_CAP = 6).
 */
export const CONTACTS_INLINE_CAP = 6;

/** Human-readable fallback heading for a nameless contact row. */
function contactFallbackLabel(kind: ShowForViewer["contacts"][number]["kind"]): string {
  switch (kind) {
    case "venue":
      return "Venue contact";
    case "in_house_av":
      return "In-house AV";
    default:
      return "Contact";
  }
}

export function CrewSection({ data, viewer, showId }: CrewSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + none-restriction;
  // crew/admin_preview → matched row; a malformed crewMembers projection throws
  // MalformedProjectionError (the page's existing infra arm catches it — this is
  // INTENTIONALLY outside WrappedSection so the route-level handler sees it).
  resolveViewerContext(viewer, data);

  // The viewer's own crew row id, used to stamp the "You" chip. Admin viewers
  // have no crewMemberId so nobody is highlighted as "You".
  const viewerCrewId =
    viewer.kind === "crew" || viewer.kind === "admin_preview" ? viewer.crewMemberId : null;

  return (
    <div data-testid="section-crew" className="flex flex-col gap-4">
      <WrappedSection
        tileId="crew:crew:roster"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // --- Column A: Show crew --------------------------------------------------
          const crewMembers = data.crewMembers;
          const visibleCrew = crewMembers.slice(0, CREW_INLINE_CAP);
          const crewOverflow = Math.max(0, crewMembers.length - CREW_INLINE_CAP);
          const hasCrew = crewMembers.length > 0;

          // --- Column B: Key contacts (NOT client_contact) --------------------------
          const contacts = data.contacts;
          const visibleContacts = contacts.slice(0, CONTACTS_INLINE_CAP);
          const contactsOverflow = Math.max(0, contacts.length - CONTACTS_INLINE_CAP);
          const hasContacts = contacts.length > 0;

          const bothEmpty = !hasCrew && !hasContacts;

          return (
            <>
              {bothEmpty ? (
                <div data-testid="section-empty">
                  <EmptyState label="No crew or contacts on file yet." />
                </div>
              ) : null}

              {bothEmpty ? null : (
                <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-stretch">
                  {hasCrew ? (
                    <div className="h-full flex-1" data-testid="crew-roster">
                      <SectionCard title="Show crew">
                        <ul className="flex flex-col gap-4">
                          {visibleCrew.map((member) => {
                            // Sentinel-guard the free-text heading source: a sentinel
                            // role must not seed PersonRow's role eyebrow.
                            const role = shouldHideGenericOptional(member.role)
                              ? undefined
                              : member.role;
                            return (
                              <div key={member.id} data-testid="crew-person-row">
                                <PersonRow
                                  person={{
                                    name: member.name,
                                    ...(role !== undefined ? { role } : {}),
                                    ...(member.phone !== null ? { phone: member.phone } : {}),
                                    ...(member.email !== null ? { email: member.email } : {}),
                                    you: viewerCrewId !== null && member.id === viewerCrewId,
                                    lead: member.roleFlags.includes("LEAD"),
                                  }}
                                />
                              </div>
                            );
                          })}
                          {crewOverflow > 0 ? (
                            <li
                              data-testid="crew-overflow-stub"
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
                    <div className="h-full flex-1" data-testid="crew-contacts">
                      <SectionCard title="Key contacts">
                        <ul className="flex flex-col gap-4">
                          {visibleContacts.map((contact, idx) => {
                            const name =
                              contact.name !== null && !shouldHideGenericOptional(contact.name)
                                ? contact.name
                                : undefined;
                            return (
                              <div key={`${contact.kind}-${idx}`} data-testid="contact-person-row">
                                <PersonRow
                                  person={{
                                    ...(name !== undefined ? { name } : {}),
                                    fallbackLabel: contactFallbackLabel(contact.kind),
                                    ...(contact.phone !== null ? { phone: contact.phone } : {}),
                                    ...(contact.email !== null ? { email: contact.email } : {}),
                                    ...(contact.notes !== null ? { notes: contact.notes } : {}),
                                  }}
                                />
                              </div>
                            );
                          })}
                          {contactsOverflow > 0 ? (
                            <li
                              data-testid="contacts-overflow-stub"
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
