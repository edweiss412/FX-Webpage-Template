/**
 * components/crew/sections/PackListSection.tsx — the crew page's Pack list section
 * (crew page redesign spec §6.2 `packlist` row, PR C Task 6).
 *
 * The crew panel card titled "Pack list" (the registry label) around the shared case
 * list (components/show-panels/PackListBody.tsx), CALLED with the crew props: the
 * 12-case cap and its stub, no items cap, so every item shows and the toggle's client
 * leaf never mounts, the raw snippets, numbered cases and search targets. The panel
 * keeps the old card's id, `gear-pack-list`, and its actions (spec line 328).
 *
 * Membership is an entitlement, not a content rule (spec line 240, plan decision 1):
 * the shell builds this section only when `isPackListVisibleToday` holds, so no body
 * reaches a gate false day's payload. A member with no pull sheet shows the empty
 * state. The pull sheet arrives on the show row, so there is no fetch to fail. Its own
 * wrapper is `crew:packlist:cases` (plan decision 5).
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` flags resolve via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section
 * does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { CASE_CAP, PACK_LIST_CARD_ID, packList } from "@/components/crew/sections/packListRows";
import { PackListBody } from "@/components/show-panels/PackListBody";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";

type PackListSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function PackListSection({
  data,
  viewer,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: PackListSectionProps): JSX.Element {
  // Outside the wrapper: a malformed projection reaches the route's infra arm.
  resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-packlist" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:packlist:cases"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          const { cases, targets, overflowCount } = packList(data);
          if (cases.length === 0) {
            return (
              <div data-testid="section-empty">
                <EmptyState label="No pack list on file yet." />
              </div>
            );
          }
          return (
            <PanelCard
              sectionId="packlist"
              cardId={PACK_LIST_CARD_ID}
              actions={
                <CardHeaderActions
                  cardId={PACK_LIST_CARD_ID}
                  driveFileId={data.driveFileId}
                  anchor={data.sourceAnchors[CARD_REGION_MAP[PACK_LIST_CARD_ID]]}
                  showId={showId}
                  cardReport={cardReport}
                />
              }
            >
              {/* CALLED, not rendered as an element, so a throw from the body is
                  inside the wrapper's catch (spec §6.1, error containment). */}
              {PackListBody({
                cases,
                cap: CASE_CAP,
                itemsCap: null,
                showRawSnippet: true,
                numbered: true,
                testIdPrefix: "crew-panel",
                targets,
                overflow: (
                  <div
                    data-testid="gear-pack-list-overflow-stub"
                    data-tile-show-more="true"
                    data-search-skip=""
                    className="rounded-sm bg-surface-sunken px-3 py-2 text-sm text-text-subtle"
                  >
                    <span className="tabular-nums">+{overflowCount}</span>{" "}
                    {overflowCount === 1 ? "more case" : "more cases"} on the source pull sheet
                  </div>
                ),
              })}
            </PanelCard>
          );
        }}
      />
    </div>
  );
}
