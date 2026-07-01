"use client";
/**
 * components/crew/primitives/CardReportTrigger.tsx
 *
 * A recessive, icon-only per-card "report a problem" affordance that lives in a
 * SectionCard header `action` slot beside `SourceLink`. On click it opens the
 * shared `ReportModal` stamped with `fieldRef: { cardId, region }` so the filed
 * GitHub issue self-identifies which card + sheet region it is about (issue
 * #207 class). Styling mirrors `SourceLink`'s recessive treatment so it never
 * competes with the card title/content.
 *
 * The report surface + previewed-viewer context come from the `cardReport`
 * bundle (`lib/crew/cardReportContext.ts`), computed once in `_CrewShell`:
 * a plain crew viewer files as `crew`; the admin preview-as viewer files as
 * `admin` with `crewPreview` context, matching the footer override.
 */
import { useState, type ReactNode } from "react";
import { ReportModal, type ReportAutocapture } from "@/components/shared/ReportModal";
import type { CardId, RegionId } from "@/lib/sheet-links/buildSheetDeepLink";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";

/** Thin-stroke flag glyph — same icon family as SheetIcon; rendered ~14px. */
function FlagIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 21V4M4 4h11l-2 4 2 4H4" />
    </svg>
  );
}

export function CardReportTrigger({
  cardId,
  region,
  showId,
  cardReport = DEFAULT_CARD_REPORT,
}: {
  cardId: CardId;
  region: RegionId;
  showId: string;
  cardReport?: CardReportContext;
}): ReactNode {
  const [open, setOpen] = useState(false);
  // Defense-in-depth: a crew card always has a show, but never mount the modal
  // machinery without a show id (mirrors Footer's `{showId ? … }` guard).
  if (!showId) return null;

  const surfaceId = `${cardReport.surfaceIdScope}-${cardId}-${showId}`;
  const autocapture: ReportAutocapture = {
    ...cardReport.extraContext,
    fieldRef: { cardId, region },
  };

  return (
    <>
      <button
        type="button"
        data-slot="card-report-trigger"
        data-testid="card-report-trigger"
        aria-label="Report a problem with this card"
        onClick={() => setOpen(true)}
        className="inline-flex h-fit shrink-0 items-center text-text-faint transition-colors hover:text-text-subtle focus-visible:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&_svg]:size-3.5 [&_svg]:opacity-70"
      >
        <FlagIcon />
      </button>
      {open ? (
        <ReportModal
          open={open}
          onOpenChange={setOpen}
          surface={cardReport.surface}
          surfaceId={surfaceId}
          showId={showId}
          autocapture={autocapture}
        />
      ) : null}
    </>
  );
}
