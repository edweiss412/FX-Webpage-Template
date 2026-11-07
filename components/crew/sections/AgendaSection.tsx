/**
 * components/crew/sections/AgendaSection.tsx — the crew page's Agenda section
 * (crew page redesign spec §6.2 `agenda` row, PR B Task 10).
 *
 * The agenda that sat at the top of the Schedule section, moved to a section of
 * its own with its wrapper unchanged: one "View agenda" affordance per link with
 * a Drive file id (`AgendaEmbed`, multi-doc), then the structured per-day schedule
 * for each link whose extraction is high-confidence, each folded to the viewer's
 * own days. It sits in the crew panel card titled with the registry label
 * "Agenda", with no card id and no header actions (the agenda has none), and its
 * own wrapper, tile id `crew:agenda:schedule` (plan decision 6). The shared block
 * (components/show-panels/AgendaScheduleBlock.tsx) is CALLED inside that wrapper,
 * so a throw from it or from the derivation is contained and recorded (spec §6.1).
 *
 * Membership (spec line 240, plan decision 1): listed only when the show has an
 * agenda link with a file and the viewer's dates are not suppressed; entitled
 * whenever they are not, so the shell builds this body for every such viewer,
 * content or not. An entitled viewer whose show has no agenda file (a deep link,
 * or a refresh that removed it under an open sheet) sees "No agenda on file yet."
 * A viewer whose dates are suppressed is not entitled and gets no body at all;
 * the guard below keeps a direct render from showing them any agenda line either
 * (spec §6.2: "Hidden for suppressed viewers").
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` resolves via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section
 * does not swallow it).
 */
import { Fragment, type JSX } from "react";

import { AgendaEmbed } from "@/components/agenda/AgendaEmbed";
import { EmptyState } from "@/components/atoms/EmptyState";
import { hasAgendaFile } from "@/components/crew/agendaScheduleRows";
import { agendaPanel } from "@/components/crew/sections/agendaRows";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { AgendaScheduleBlock } from "@/components/show-panels/AgendaScheduleBlock";
import { PanelCard } from "@/components/show-panels/PanelCard";
import type { CardReportContext } from "@/lib/crew/cardReportContext";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";

type AgendaSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  /** Uniform with the other sections; the agenda card has no report button. */
  cardReport?: CardReportContext | null;
};

export function AgendaSection({
  data,
  viewer,
  showId,
  ledger,
}: AgendaSectionProps): JSX.Element | null {
  // Single canonical viewer resolution; a malformed crewMembers projection
  // throws MalformedProjectionError OUTSIDE WrappedSection so the route-level
  // handler sees it.
  const { dateRestriction } = resolveViewerContext(viewer, data);
  if (suppressesDates(dateRestriction)) return null;

  return (
    <div data-testid="section-agenda" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:agenda:schedule"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          const agendaLinks = data.show.agenda_links;
          if (!hasAgendaFile(agendaLinks)) {
            return (
              <div data-testid="section-empty">
                <EmptyState label="No agenda on file yet." />
              </div>
            );
          }
          const panel = agendaPanel(data, dateRestriction);
          return (
            <PanelCard sectionId="agenda">
              <div data-testid="agenda-area" className="flex min-w-0 flex-col gap-3">
                <AgendaEmbed
                  showId={showId}
                  agendaLinks={agendaLinks}
                  searchTargets={panel.embedTargets}
                />
                {panel.blocks.map((block) =>
                  block === null ? null : (
                    // CALLED, not rendered as an element, so a throw from the shared
                    // block is inside the wrapper's catch (spec §6.1, error containment).
                    <Fragment key={block.key}>
                      {AgendaScheduleBlock({
                        extraction: block.extraction,
                        label: block.label,
                        search: block.search,
                        viewerDays: block.viewerDays,
                        dayHeadingAs: "h3",
                      })}
                    </Fragment>
                  ),
                )}
              </div>
            </PanelCard>
          );
        }}
      />
    </div>
  );
}
