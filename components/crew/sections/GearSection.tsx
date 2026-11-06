/**
 * components/crew/sections/GearSection.tsx — crew-redesign §9 "Gear" section.
 *
 * Its cards all left: the Tech specs, keynote and opening reel for Event details (crew
 * page redesign PR C Task 5), the pack list for its own section (Task 6), and the
 * scope and room details for Rooms (Task 7). It holds nothing but its empty state until
 * it retires in Task 8.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `viewer` flags resolve via `resolveViewerContext` (which throws
 * MalformedProjectionError on a malformed crewMembers projection — this section
 * does not swallow it).
 */
import type { JSX } from "react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { type CardReportContext } from "@/lib/crew/cardReportContext";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";

type GearSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function GearSection({ data, viewer }: GearSectionProps): JSX.Element {
  resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-gear" className="flex flex-col gap-4">
      <div data-testid="section-empty">
        <EmptyState label="No gear details on file yet." />
      </div>
    </div>
  );
}
