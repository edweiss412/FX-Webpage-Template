/**
 * components/crew/sections/HomeSection.tsx — the composed home's server body
 * (crew page redesign spec §3.2, §4.5, §6.2; plan Task 11). It replaced
 * `TodaySection`: the home is the Today section of spec §5.1, so its root keeps
 * `data-testid="section-today"`.
 *
 * The section controller mounts the day row, the pass and the run-of-show card
 * from the shell's server-built props and places this body after them: below
 * the run card in compact, beside the day row, pass and run card in wide
 * (components/crew/CrewSections.tsx). In order, it renders:
 *
 *   - the admin fetch-failure blocks for rooms, hotel and contacts, for the
 *     audience Today showed them to (an admin; crew see omission), so a failed
 *     fetch never shows an admin nothing (spec §5.1). No `upsertAdminAlert`:
 *     the shell's projection alert is the sole producer;
 *   - the quick facts (spec §4.5), built on the server by `buildQuickFacts`, so
 *     the client island receives only what this viewer may see;
 *   - the show notes card: the 5-source aggregation venue, hotel, room,
 *     transport, contact (`SOURCE_CAP` / `TRUNCATE_AT`), the transport note
 *     behind `transportTileVisible`;
 *   - the full Dress code card (spec §6.2, PR A and PR B), the destination of
 *     the pass's truncated "Dress code" cell.
 *
 * The notes and Dress code cards keep Today's card ids (`today-notes`,
 * `today-dress`) and header actions (spec §6.4). The quick facts summarize
 * several sheet regions and carry none.
 *
 * Every piece sits inside the render-fault wrapper Today used
 * (`crew:today:notes`), so a throw anywhere in the derivation renders the
 * fallback and records the tile. A body with nothing to show renders no child,
 * and the root hides itself (`empty:hidden`), so the wide layout's left column
 * takes the full width.
 *
 * `client_contact` is read NOWHERE: the actionable contacts list is the only
 * contact source (phase 1 §4.2).
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`
 * or `nowDate()` inside). `today` and `showId` are passed in.
 */
import { ChevronRight } from "lucide-react";
import type { JSX } from "react";

import { CrewQuickFacts } from "@/components/crew/CrewQuickFacts";
import { DressCodeLines } from "@/components/crew/DressCodeLines";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { NoteIcon } from "@/components/crew/icons/sectionIcons";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { TODAY_TITLES, todayRows } from "@/components/crew/sections/todayRows";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { buildQuickFacts } from "@/lib/crew/quickFacts";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { cn } from "@/lib/ui/cn";

export { SOURCE_CAP, TRUNCATE_AT } from "@/components/crew/sections/todayRows";

type HomeSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function HomeSection({
  data,
  viewer,
  today,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: HomeSectionProps): JSX.Element {
  // Single canonical viewer resolution, OUTSIDE the wrapper: a malformed
  // projection throws MalformedProjectionError to the route's infra arm rather
  // than the per-block fallback.
  const ctx = resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-today" className="flex min-w-0 flex-col gap-4 empty:hidden lg:flex-1">
      <WrappedSection
        ledger={ledger}
        tileId="crew:today:notes"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // Notes and dress with their search targets: todayRows.ts, shared with
          // the Today search builder.
          const model = todayRows(data, ctx);
          const facts = buildQuickFacts({ data, viewer, today });

          // §4.13 mechanism #3, active-section FETCH-error visual fallback. rooms
          // feeds the pass's Room cell (scope shown to all, so effectively
          // ungated); hotel feeds the hotel fact and the pass's "Hotel tonight";
          // contacts feeds "Who to call" and the contact notes. admin: an inline
          // degraded block; crew: omission (a false gate is a silent omission, no
          // boundary widening). Composes with the wrapper's render-throw arm.
          const roomsFetchFailed = Boolean(data.tileErrors["rooms"]) && ctx.isAdmin;
          const hotelFetchFailed = Boolean(data.tileErrors["hotel"]) && ctx.isAdmin;
          const contactsFetchFailed = Boolean(data.tileErrors["contacts"]) && ctx.isAdmin;

          const notesCard =
            model.noteRows.length > 0 ? (
              <div data-testid="today-notes" data-card-id="today-notes">
                <SectionCard icon={<NoteIcon />} title={TODAY_TITLES.showNotes}>
                  <ul className="flex flex-col gap-2">
                    {model.noteRows.map((entry, idx) => {
                      const { display, truncated } = entry;
                      return (
                        <li
                          key={`${entry.source}-${idx}`}
                          data-source={entry.source}
                          // One search line: the label and the FULL text. A
                          // truncated note's cut preview below is skipped.
                          data-search-target={entry.target}
                          {...(truncated ? { "data-truncated": "true" } : {})}
                          className="rounded-sm border border-border bg-surface"
                        >
                          <details className="group">
                            {/* Chevron, not a bare row: this summary suppresses
                                the native marker, so the chevron is what says a
                                truncated value expands (design doc
                                2026-08-25-ui-polish-class-sweep-design.md, D10). */}
                            <summary className="flex min-h-tap-min cursor-pointer list-none flex-col gap-1 rounded-sm px-3 py-2 [&::-webkit-details-marker]:hidden">
                              <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                {entry.label}
                                <ChevronRight
                                  aria-hidden="true"
                                  className="inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"
                                />
                              </span>
                              <span
                                data-search-skip={truncated ? "" : undefined}
                                className={cn(
                                  "text-sm/snug text-text",
                                  truncated ? "group-open:hidden" : "",
                                )}
                              >
                                {display}
                              </span>
                            </summary>
                            {truncated ? (
                              <div className="whitespace-pre-wrap border-t border-border p-3 text-sm/relaxed text-text">
                                {entry.text}
                              </div>
                            ) : null}
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                  {model.notesOverflow > 0 ? (
                    <div
                      data-testid="today-notes-overflow"
                      data-search-skip=""
                      className="mt-2 rounded-sm bg-surface-sunken px-3 py-2 text-sm text-text-subtle"
                    >
                      <span className="tabular-nums">+{model.notesOverflow}</span>{" "}
                      {model.notesOverflow === 1 ? "more note" : "more notes"} on the source sheet
                    </div>
                  ) : null}
                </SectionCard>
              </div>
            ) : null;

          const dressCard = model.dress ? (
            <div data-testid="today-dress" data-card-id="today-dress">
              <SectionCard
                title={TODAY_TITLES.dress}
                action={
                  <CardHeaderActions
                    cardId="today-dress"
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["today-dress"]]}
                    showId={showId}
                    cardReport={cardReport}
                  />
                }
              >
                <DressCodeLines value={model.dress.value} searchTargets={model.dress.targets} />
              </SectionCard>
            </div>
          ) : null;

          return (
            <>
              {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}
              {contactsFetchFailed ? <SectionTileError domain="contacts" /> : null}
              {facts.length > 0 ? <CrewQuickFacts facts={facts} /> : null}
              {notesCard}
              {dressCard}
            </>
          );
        }}
      />
    </div>
  );
}
