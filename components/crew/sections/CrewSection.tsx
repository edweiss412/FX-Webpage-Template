/**
 * components/crew/sections/CrewSection.tsx — crew-redesign §9 "Crew" section.
 *
 * The roster: the crew panel card titled "Crew" (the registry label, crew page
 * redesign PR B Task 6) around the shared Crew body
 * (components/show-panels/CrewBody.tsx), CALLED with the crew props
 * (`rosterPanel`): one row per `data.crewMembers`, the viewer's "You" chip
 * (id === viewer.crewMemberId), department leads' "Lead" chip, the
 * partial-attendance chip, Call and Text when the phone has digits, Email behind
 * its sentinel gate. Capped at CREW_INLINE_CAP with a `[data-tile-show-more]`
 * "+N more" affordance when the roster is longer (N = crewMembers.length -
 * CREW_INLINE_CAP). Ported from CrewTile's §8.4 / AC-4.4 overflow idiom.
 *
 * The key contacts that shared this section are their own section from PR B
 * Task 7 (ContactsSection.tsx, spec line 304), so the roster is the whole
 * section: one card spanning the section, with no column split.
 *
 * Generic-optional reads route through `shouldHideGenericOptional`: the body
 * hides a sentinel role (`sentinels: "hide"`) and the crew email builder a
 * sentinel address. Those reads live in the sibling crewRows.ts, which the crew
 * search builder reads too.
 *
 * With no crew, a section-level `<EmptyState data-testid="section-empty">`
 * renders so the surface is never blank.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `today` + `showId` are passed in; `viewer` flags resolve via
 * `resolveViewerContext` (which throws MalformedProjectionError on a malformed
 * crewMembers projection — this section does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { ROSTER_CARD_ID, rosterPanel } from "@/components/crew/sections/crewRows";
import { CrewBody } from "@/components/show-panels/CrewBody";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

// The inline cap lives with the row derivation (crewRows.ts); re-exported here,
// where its consumers have always read it.
export { CREW_INLINE_CAP } from "@/components/crew/sections/crewRows";

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
  resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-crew" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:crew:roster"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // The shared body's crew props (capped, You/Lead/partial chips, search
          // targets) from crewRows.ts.
          const roster = rosterPanel(data, viewer);
          return data.crewMembers.length === 0 ? (
            <div data-testid="section-empty">
              <EmptyState label="No crew on file yet." />
            </div>
          ) : (
            <PanelCard
              sectionId="crew"
              cardId={ROSTER_CARD_ID}
              actions={
                <CardHeaderActions
                  cardId={ROSTER_CARD_ID}
                  driveFileId={data.driveFileId}
                  anchor={data.sourceAnchors[CARD_REGION_MAP[ROSTER_CARD_ID]]}
                  showId={showId}
                  cardReport={cardReport}
                />
              }
            >
              {/* CALLED, not rendered as an element, so a throw from the body is
                  inside the wrapper's catch (spec §6.1, error containment). */}
              {CrewBody({
                ...roster.body,
                overflow: (hidden) => (
                  <p
                    data-testid="crew-overflow-stub"
                    data-search-skip=""
                    data-tile-show-more="true"
                    className="rounded-sm border-t border-border bg-surface-sunken px-3 py-2 pt-4 text-sm text-text-subtle"
                  >
                    <span className="tabular-nums">+{hidden}</span>{" "}
                    {hidden === 1 ? "more crew member" : "more crew members"} on the source sheet
                  </p>
                ),
              })}
            </PanelCard>
          );
        }}
      />
    </div>
  );
}
