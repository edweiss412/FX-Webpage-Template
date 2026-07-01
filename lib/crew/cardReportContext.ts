/**
 * lib/crew/cardReportContext.ts — the per-card bug-report context bundle.
 *
 * NON-CLIENT module (no `"use client"`): the `CardReportContext` type and the
 * `DEFAULT_CARD_REPORT` constant are consumed by SERVER components
 * (`CardHeaderActions`, the crew section bodies, `_CrewShell`) as a type + a
 * runtime value. The established RSC pattern imports client *components* into
 * server parents but never reads runtime constants out of a `"use client"`
 * module — so these live here, and only the `CardReportTrigger` *component* is
 * imported from the client file.
 *
 * `buildCardReportContext` (below) mirrors the crew-page footer's report
 * override (`app/show/[slug]/[shareToken]/_CrewShell.tsx`): a plain crew viewer
 * files as `crew`; the admin preview-as viewer files as `admin` and carries the
 * previewed-viewer `crewPreview` context.
 */
import type { ReportAutocapture, ReportSurface } from "@/components/shared/ReportModal";

export type CardReportContext = {
  surface: ReportSurface;
  surfaceIdScope: string;
  extraContext: ReportAutocapture;
};

export const DEFAULT_CARD_REPORT: CardReportContext = {
  surface: "crew",
  surfaceIdScope: "crew-card",
  extraContext: {},
};

// buildCardReportContext(...) is added here in Task 5 (driven by its own test).
