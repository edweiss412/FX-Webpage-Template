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
import { correctionLoopCopy } from "@/components/admin/CorrectionLoopCallout";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import { UseRawControlBoundary } from "@/components/admin/UseRawControlBoundary";
import { RoleRecognizeControlBoundary } from "@/components/admin/RoleRecognizeControlBoundary";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";
import { findUseRawDecision } from "@/components/admin/wizard/step3ReviewSections";
import { crewRowKeyForWarning } from "@/lib/admin/crewRowKey";
import type { SectionWarningItem } from "@/lib/admin/sectionWarningModel";

/** Render crew-scoped active warnings for the RENDERED crew rows as under-row cards,
 *  keyed canonicalCrewKey(subject) (spec 2026-07-21-warning-card-identity-placement §5).
 *  Keys not in `renderedKeys` (over-cap / unmatched) are OMITTED — those items stay in the
 *  section group as fallback. Cards keep the same Report/Ignore + use-raw + recognize-role
 *  controls the group cards use, so the ignore lifecycle is identical. */
export function renderCrewUnderRowCards(args: {
  model: { warningsByCrewKey: Record<string, SectionWarningItem[]> } | undefined;
  published: {
    slug: string;
    showId: string;
    driveFileId: string | null;
    useRawDecisions: PublishedSectionData["useRawDecisions"];
  };
  renderedKeys: ReadonlySet<string>;
}): Map<string, ReactNode[]> {
  const out = new Map<string, ReactNode[]>();
  const model = args.model;
  if (!model) return out;
  const { slug, showId, driveFileId, useRawDecisions } = args.published;
  for (const [key, items] of Object.entries(model.warningsByCrewKey)) {
    if (!args.renderedKeys.has(key) || items.length === 0) continue;
    // ONE node PER WARNING (not one node wrapping all): the row host caps the merged
    // stack at 2 VISIBLE CARDS, so each card must be its own node or the cap and the
    // "N more" count operate at wrapper granularity and undercount (whole-diff HIGH).
    out.set(
      key,
      items.map((it, i) => (
        <PerShowActionableWarnings
          key={`crew-warn-${key}-${i}`}
          items={[it.warning]}
          driveFileId={driveFileId}
          renderItemControls={(w) => (
            <SectionWarningItemControls
              warning={w}
              reportSurfaceId={it.reportSurfaceId}
              mode="active"
              slug={slug}
              showId={showId}
              driveFileId={driveFileId}
              useRawDecisions={useRawDecisions}
            />
          )}
        />
      )),
    );
  }
  return out;
}

/** The set of canonical keys placed under a row for a section — the crew-scoped items to
 *  EXCLUDE from that section's group (they render under rows, not in the group). */
function underRowKeys(
  model: { warningsByCrewKey: Record<string, SectionWarningItem[]> },
  renderedKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(Object.keys(model.warningsByCrewKey).filter((k) => renderedKeys.has(k)));
}

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
        site="showpage"
      />
      {/* spec §8.1: recognize-role control for UNKNOWN_ROLE_TOKEN warnings; self-hides otherwise. */}
      <RoleRecognizeControlBoundary
        surface="show"
        showId={showId}
        warning={warning}
        site="showpage"
      />
    </>
  );
}

export function buildSectionWarningExtras(args: {
  bySection: SectionWarningRecord;
  /** Canonical keys placed under a crew row (spec §5): their crew-scoped cards render
   *  under rows, so they are EXCLUDED from the section group here (conservation — a card
   *  never renders twice). Absent → no crew filtering (byte-identical to today). */
  renderedCrewKeys?: ReadonlySet<string>;
}): (id: SectionId, d: SectionData, opts?: { seamless?: boolean }) => ReactNode {
  const { bySection, renderedCrewKeys } = args;
  // Lowercase-named (not a component): the surface calls it as a render callback per section.
  function renderSectionExtras(
    id: SectionId,
    d: SectionData,
    opts?: { seamless?: boolean },
  ): ReactNode {
    // §5.3 is published-only (staged warnings render through the modal's §E3 callouts +
    // Warnings section). The modal passes no renderSectionExtras anyway; this is defense.
    if (!isPublished(d)) return null;
    const model = bySection[id];
    if (!model || (model.active.length === 0 && model.ignored.length === 0)) return null;

    const { slug, showId, driveFileId, useRawDecisions } = d;
    const ignoredWarnings = model.ignored.map((a) => a.warning);

    // DQIGNORE-6 — the section's ACTIVE list, grouped by code. Each group's cards are a
    // server-derived <PerShowActionableWarnings> passed through BulkIgnoreControls as the
    // `cards` slot (RSC: server nodes as props of a client component), so the bulk "Ignore
    // all N" chip sits on its own group's eyebrow, bound to the cards it ignores. The report
    // surface ids come from the pre-derived model (ZERO crypto here); each card keeps the
    // self-hiding Report/Ignore + use-raw + recognize-role controls.
    // Crew-scoped codes: exclude items placed under a row (§5 conservation). Non-crew
    // groups are unchanged. Filtering shifts indices, so reportSurfaceId reads groupItems[i].
    const excludedKeys =
      renderedCrewKeys && id === "crew" ? underRowKeys(model, renderedCrewKeys) : null;
    const activeGroups: ActiveWarningGroup[] = model.activeGroups
      .map((g) => {
        // crew-warning-attachment §2A: per-ITEM exclusion via the shared keying
        // helper (autocorrect codes by subject; other codes by stripped crew
        // blockRef name) — the same expression the model used to build
        // warningsByCrewKey, so conservation is exact.
        const groupItems = excludedKeys
          ? g.items.filter((it) => {
              const k = crewRowKeyForWarning(it.warning);
              return !(k !== null && excludedKeys.has(k));
            })
          : g.items;
        // §6.2 emission (generalized, crew-warning-attachment R1): a group whose
        // cards ALL moved under rows and has no bulk chip (N<2) emits NO group —
        // otherwise an orphan eyebrow. A group can only be emptied by the filter
        // above, so this is exactly the legacy crew-scoped rule for every code.
        // The chip (bulk, counts ALL active N) stays whenever N>=2, even with an
        // empty fallback cards slot.
        if (groupItems.length === 0 && !g.bulk) {
          return null;
        }
        return {
          code: g.code,
          label: g.label,
          bulk: g.bulk,
          items: groupItems,
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .map((g) => ({
        code: g.code,
        label: g.label,
        bulk: g.bulk,
        cards: (
          <PerShowActionableWarnings
            items={g.items.map((it) => it.warning)}
            driveFileId={driveFileId}
            // warning-surface-trim §4.2: the SAME sentence the panel used to show
            // once, now per card and on demand. Sourced from the single exported
            // helper, never re-authored, so the two cannot drift.
            followUpCopy={correctionLoopCopy("resync")}
            renderItemControls={(w, i) => (
              <SectionWarningItemControls
                warning={w}
                reportSurfaceId={g.items[i]!.reportSurfaceId}
                mode="active"
                slug={slug}
                showId={showId}
                driveFileId={driveFileId}
                useRawDecisions={useRawDecisions}
              />
            )}
          />
        ),
      }));

    // Empty-seam guard (crew-warning-attachment R1-F3): every active card moved
    // under a row, no bulk chip survived, and nothing is ignored — the bordered
    // wrapper would render with zero children and read as a stray seam inside
    // the panel card. Evaluated on the POST-FILTER groups, not the pre-filter
    // model (which is non-empty by hypothesis here).
    if (activeGroups.length === 0 && ignoredWarnings.length === 0) return null;

    return (
      <div
        data-testid={`section-warning-controls-${id}`}
        // Spec 2026-07-22-warning-panel-polish §3.3: in the Silent state the
        // heading sits directly above these extras, so the border-t reads as a
        // heading underline; the caller passes seamless exactly when the
        // section body card is suppressed.
        className={
          opts?.seamless === true
            ? "flex flex-col gap-3"
            : "mt-3 flex flex-col gap-3 border-t border-border pt-3"
        }
      >
        {/* DQIGNORE-6 — the ACTIVE warnings grouped by code; each bulk "Ignore all N" chip is
            its group's eyebrow header, bound to the cards it ignores. BulkIgnoreControls renders
            BOTH the eyebrow/chip headers AND the grouped per-warning cards; renders null when
            this section has no active warnings. */}
        <div data-testid={`section-warning-active-${id}`}>
          <BulkIgnoreControls slug={slug} groups={activeGroups} />
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
                // NO followUpCopy here (impeccable critique P1a): "we'll re-read
                // the sheet and clear this" is a promise about work still to do,
                // and these are warnings the operator has already dismissed.
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
