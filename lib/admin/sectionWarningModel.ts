import type { ParseWarning } from "@/lib/parser/types";
import { warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import { groupIgnorableByCode } from "@/lib/dataQuality/bulkIgnoreGroups";
import { DATA_GAP_CLASS_LABELS } from "@/lib/parser/dataGaps";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import type { BulkIgnoreGroupWithLabel } from "@/components/admin/BulkIgnoreControls";

/**
 * SERVER-ONLY derivation for the consolidated show page's per-section warning controls
 * (spec §5.3). It transitively pulls `warningFingerprint` (node:crypto via
 * `buildReportSurfaceId` + `partitionByIgnored`), so it MUST run in the Server Component
 * (Task 13's page), NEVER in the client shell — `renderSectionExtras` runs client-side, so
 * the fingerprint/report-id/bulk-group work is done here up front and handed across the RSC
 * boundary as a plain, serializable record (`SectionWarningRecord`) with NO crypto in it.
 *
 * The routing helper is the same `warningsBySection` the surface uses for its rail chips /
 * §E3 callouts, so the per-section flag set and the per-section control list can never
 * disagree (spec §E2). Only `warn`-severity warnings are routed (info is dropped by
 * `warningsBySection`); an unmapped/unrendered warning folds into the `warnings` bucket.
 */
export type SectionWarningItem = {
  warning: ParseWarning;
  /** Opaque, order-independent surface id for the Report modal (crypto-derived here). */
  reportSurfaceId: string;
};

export type SectionWarningModel = {
  /** Warnings still active for this section (not ignored), in routed order. */
  active: SectionWarningItem[];
  /** Warnings whose content fingerprint is in the ignored set — collapsed under a disclosure. */
  ignored: SectionWarningItem[];
  /** Codes with >=2 distinct-content ACTIVE ignorable warnings → one bulk "Ignore all N". */
  bulkGroups: BulkIgnoreGroupWithLabel[];
};

/** Plain object (RSC-serializable — a Map is NOT). Only sections with warnings appear. */
export type SectionWarningRecord = Partial<Record<SectionId, SectionWarningModel>>;

/** Plain-language bulk-group label: catalog title, else the data-gap class label; NEVER the
 *  raw §12.4 code (invariant 5). `null` when neither is available. */
function bulkGroupLabel(code: string): string | null {
  const title = isMessageCode(code) ? messageFor(code as MessageCode).title : null;
  if (title) return title;
  if (code in DATA_GAP_CLASS_LABELS) {
    return DATA_GAP_CLASS_LABELS[code as keyof typeof DATA_GAP_CLASS_LABELS];
  }
  return null;
}

export function buildSectionWarningModel(input: {
  slug: string;
  warnings: readonly ParseWarning[];
  ignoredFingerprints: ReadonlySet<string>;
  renderedSectionIds: ReadonlySet<SectionId>;
}): SectionWarningRecord {
  const { slug, warnings, ignoredFingerprints, renderedSectionIds } = input;
  const bySection = warningsBySection(warnings, renderedSectionIds);
  const record: SectionWarningRecord = {};
  const stamp = (w: ParseWarning): SectionWarningItem => ({
    warning: w,
    reportSurfaceId: buildReportSurfaceId(slug, w),
  });
  for (const [sid, entries] of bySection) {
    const sectionWarnings = entries.map((e) => e.warning);
    const { active, ignored } = partitionByIgnored(sectionWarnings, ignoredFingerprints);
    const bulkGroups = groupIgnorableByCode(active).map((g) => ({
      ...g,
      label: bulkGroupLabel(g.code),
    }));
    record[sid] = {
      active: active.map(stamp),
      ignored: ignored.map(stamp),
      bulkGroups,
    };
  }
  return record;
}
