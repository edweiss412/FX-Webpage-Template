import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ParseWarning } from "@/lib/parser/types";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import {
  isPublished,
  type PublishedSectionData,
  type SectionData,
} from "@/components/admin/review/sectionData";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import { UseRawControlBoundary } from "@/components/admin/UseRawControlBoundary";
import { RoleRecognizeControlBoundary } from "@/components/admin/RoleRecognizeControlBoundary";
import { BulkIgnoreControls } from "@/components/admin/BulkIgnoreControls";
import { findUseRawDecision } from "@/components/admin/wizard/step3ReviewSections";

/**
 * The `renderSectionExtras(id, d)` implementation the shared `ShowReviewSurface` invokes under
 * each section panel (spec §5.3, published mode only). Today's flat `PerShowActionableWarnings`
 * list dissolves: each parsed section renders ITS OWN warnings with the existing per-item
 * controls (Report/Ignore, use-raw, recognize-role), a per-section bulk-ignore affordance, and
 * an "Ignored (N)" disclosure.
 *
 * RSC boundary: this runs client-side (the surface is a client component), so it does ZERO
 * crypto. `buildSectionWarningModel` (SERVER, Task 13's page) already partitioned each section
 * by ignored fingerprint and stamped every warning with its report surface id; this factory
 * only renders the pre-derived, serializable record. The self-hiding control boundaries mean a
 * non-role / non-structural warning simply omits the irrelevant control.
 */
/** Server-action-backed per-warning controls (Report/Ignore, use-raw, recognize-role). One
 *  named component so the active + ignored lists share it without duplicating the block, and so
 *  the render-prop callbacks stay inline arrows (lint-clean). Every boundary self-hides when its
 *  code is out of scope. */
function SectionWarningItemControls(props: {
  warning: ParseWarning;
  reportSurfaceId: string;
  mode: "active" | "ignored";
  slug: string;
  showId: string;
  driveFileId: string | null;
  useRawDecisions: PublishedSectionData["useRawDecisions"];
}) {
  const { warning, reportSurfaceId, mode, slug, showId, driveFileId, useRawDecisions } = props;
  return (
    <>
      <DataQualityWarningControls
        slug={slug}
        showId={showId}
        warning={warning}
        driveFileId={driveFileId}
        mode={mode}
        reportSurfaceId={reportSurfaceId}
      />
      {/* spec §8: use-raw toggle for the 3 recoverable structural-transform warnings; self-hides
          (null) for every other code. */}
      <UseRawControlBoundary
        surface="show"
        showId={showId}
        warning={warning}
        decision={findUseRawDecision(warning, useRawDecisions)}
      />
      {/* spec §8.1: recognize-role control for UNKNOWN_ROLE_TOKEN warnings; self-hides otherwise. */}
      <RoleRecognizeControlBoundary surface="show" showId={showId} warning={warning} />
    </>
  );
}

export function buildSectionWarningExtras(args: {
  bySection: SectionWarningRecord;
}): (id: SectionId, d: SectionData) => ReactNode {
  const { bySection } = args;
  // Lowercase-named (not a component): the surface calls it as a render callback per section.
  function renderSectionExtras(id: SectionId, d: SectionData): ReactNode {
    // §5.3 is published-only (staged warnings render through the modal's §E3 callouts +
    // Warnings section). The modal passes no renderSectionExtras anyway; this is defense.
    if (!isPublished(d)) return null;
    const model = bySection[id];
    if (!model || (model.active.length === 0 && model.ignored.length === 0)) return null;

    const { slug, showId, driveFileId, useRawDecisions } = d;
    const activeWarnings = model.active.map((a) => a.warning);
    const ignoredWarnings = model.ignored.map((a) => a.warning);

    return (
      <div
        data-testid={`section-warning-controls-${id}`}
        className="mt-3 flex flex-col gap-3 border-t border-border pt-3"
      >
        {/* DQIGNORE-2 — per-section bulk "Ignore all N of this type"; renders nothing when no
            code has >=2 distinct-content active ignorable warnings. */}
        <BulkIgnoreControls slug={slug} groups={model.bulkGroups} />
        <div data-testid={`section-warning-active-${id}`}>
          <PerShowActionableWarnings
            items={activeWarnings}
            driveFileId={driveFileId}
            renderItemControls={(w, i) => (
              <SectionWarningItemControls
                warning={w}
                reportSurfaceId={model.active[i]!.reportSurfaceId}
                mode="active"
                slug={slug}
                showId={showId}
                driveFileId={driveFileId}
                useRawDecisions={useRawDecisions}
              />
            )}
          />
        </div>
        {/* Collapsible "Ignored (N)" subsection — content-keyed ignores that survive re-sync.
            Native <details>: chevron transform only, body instant. */}
        {ignoredWarnings.length > 0 ? (
          <details data-testid={`section-ignored-warnings-${id}`} className="group">
            <summary
              data-testid={`section-ignored-summary-${id}`}
              className="cursor-pointer list-none text-xs font-semibold uppercase tracking-eyebrow text-text-subtle hover:text-text [&::-webkit-details-marker]:hidden"
            >
              Ignored ({ignoredWarnings.length}){" "}
              <ChevronRight
                aria-hidden="true"
                className="ml-1 inline-block size-4 shrink-0 align-text-bottom transition-transform group-open:rotate-90"
              />
            </summary>
            <div className="mt-3" data-testid={`section-ignored-list-${id}`}>
              <PerShowActionableWarnings
                items={ignoredWarnings}
                driveFileId={driveFileId}
                tone="muted"
                renderItemControls={(w, i) => (
                  <SectionWarningItemControls
                    warning={w}
                    reportSurfaceId={model.ignored[i]!.reportSurfaceId}
                    mode="ignored"
                    slug={slug}
                    showId={showId}
                    driveFileId={driveFileId}
                    useRawDecisions={useRawDecisions}
                  />
                )}
              />
            </div>
          </details>
        ) : null}
      </div>
    );
  }
  return renderSectionExtras;
}
