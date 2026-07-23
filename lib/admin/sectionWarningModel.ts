import type { ParseWarning } from "@/lib/parser/types";
import { crewRowKeyForWarning } from "@/lib/admin/crewRowKey";
import { warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import { groupIgnorableByCode } from "@/lib/dataQuality/bulkIgnoreGroups";
import { groupActiveByCode } from "@/lib/dataQuality/groupActiveByCode";
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

/**
 * DQIGNORE-6 — one per-code group of a section's ACTIVE list, first-code-appearance order.
 * Each group carries its plain-language eyebrow `label`, the `bulk` "Ignore all N" descriptor
 * iff the code is bulk-eligible (>=2 distinct-content ignorable warnings), and the `items`
 * (warning + report surface id) that render as the group's cards. Serializable (no crypto,
 * no ReactNode) — the client extras factory wraps `items` in the card slot at render time.
 */
export type ActiveWarningCodeGroup = {
  code: string;
  label: string | null;
  bulk: BulkIgnoreGroupWithLabel | null;
  items: SectionWarningItem[];
};

export type SectionWarningModel = {
  /** Warnings still active for this section (not ignored), in routed order. */
  active: SectionWarningItem[];
  /** Warnings whose content fingerprint is in the ignored set — collapsed under a disclosure. */
  ignored: SectionWarningItem[];
  /** Codes with >=2 distinct-content ACTIVE ignorable warnings → one bulk "Ignore all N". */
  bulkGroups: BulkIgnoreGroupWithLabel[];
  /** The ACTIVE list grouped by code (first-appearance order) — every active code gets a group
   *  (eyebrow), bulk-eligible or not; the bulk chip rides only groups whose `bulk` is present. */
  activeGroups: ActiveWarningCodeGroup[];
  /** ACTIVE crew-row-scoped warnings indexed by crewRowKeyForWarning (the 2 autocorrect
   *  codes via canonicalCrewKey(subject); other codes via their crew blockRef name passed
   *  through stripDayRestrictionParen — spec 2026-07-23-crew-warning-attachment §2A), for
   *  under-row placement (spec 2026-07-21 §5.2). Non-blank keys only; render-agnostic
   *  (no CREW_CAP — the render layer decides cap/fallback).
   *  A plain Record, not a Map, so the model stays RSC-serializable. Empty on sections
   *  with no crew-scoped warnings. */
  warningsByCrewKey: Record<string, SectionWarningItem[]>;
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
    const activeItems = active.map(stamp);
    // DQIGNORE-6 — group the section's ACTIVE items by code (first-appearance order). Every
    // active code gets a group/eyebrow; `bulk` is attached only when the code is bulk-eligible
    // (matches a groupIgnorableByCode entry). Code order from groupActiveByCode; items gathered
    // per code preserving routed order (both derive from the same ordered `activeItems`).
    const bulkByCode = new Map(bulkGroups.map((g) => [g.code, g] as const));
    const itemsByCode = new Map<string, SectionWarningItem[]>();
    for (const it of activeItems) {
      const bucket = itemsByCode.get(it.warning.code);
      if (bucket) bucket.push(it);
      else itemsByCode.set(it.warning.code, [it]);
    }
    const activeGroups: ActiveWarningCodeGroup[] = groupActiveByCode(
      activeItems.map((it) => it.warning),
    ).map((g) => ({
      code: g.code,
      label: bulkGroupLabel(g.code),
      bulk: bulkByCode.get(g.code) ?? null,
      items: itemsByCode.get(g.code)!,
    }));
    // Index active crew-row-scoped warnings by crewRowKeyForWarning for under-row
    // placement (spec 2026-07-23 SS2A: autocorrect codes by subject, other codes by
    // stripped crew blockRef name). Non-null keys only; render-agnostic. Empty elsewhere.
    // Accumulate in a Map — a sheet-derived key (e.g. "constructor", "__proto__")
    // must not select an inherited Object.prototype member, so bracket-write on a
    // plain object is unsafe; Map.get/set is collision-free, and Object.fromEntries
    // materializes OWN properties for the RSC-serializable Record readers iterate.
    const crewKeyMap = new Map<string, SectionWarningItem[]>();
    for (const it of activeItems) {
      const key = crewRowKeyForWarning(it.warning);
      if (key === null) continue; // no usable crew identity → falls back to the group
      const bucket = crewKeyMap.get(key);
      if (bucket) bucket.push(it);
      else crewKeyMap.set(key, [it]);
    }
    const warningsByCrewKey: Record<string, SectionWarningItem[]> = Object.fromEntries(crewKeyMap);
    record[sid] = {
      active: activeItems,
      ignored: ignored.map(stamp),
      bulkGroups,
      activeGroups,
      warningsByCrewKey,
    };
  }
  return record;
}
