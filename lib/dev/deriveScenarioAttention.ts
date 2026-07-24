/**
 * lib/dev/deriveScenarioAttention.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.2)
 *
 * Turns one scenario's STORABLE rows into the derived `AttentionItem[]` by
 * running the REAL production path: `deriveAlertRowFields -> deriveAttentionItems`.
 * Extracted from `buildBlockProps` so the switcher gallery and the (soon
 * removed) card gallery share exactly one derivation, and so the modal shows the
 * same items the cards did. Nothing here reimplements routing or placement.
 *
 * `deriveAttentionItems` has a pinned caller topology
 * (`tests/admin/_metaAttentionItemsTopology.test.ts`): the gallery is an
 * ADMITTED second caller, now via this module rather than `buildBlockProps`.
 */
import { deriveAttentionItems, type AttentionItem } from "@/lib/admin/attentionItems";
import { deriveAlertRowFields } from "@/lib/adminAlerts/deriveAlertRowFields";
import { type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";
import { shapeChangeFeed, type ChangeLogRow } from "@/lib/sync/feed/shapeChangeFeed";
import type { FeedEntry } from "@/lib/sync/holds/types";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import { GALLERY_SLUG } from "@/lib/dev/galleryModalTypes";

/** The modal's `feed` prop shape (`ChangesSectionProps["feed"]`). */
export type ScenarioFeed = { entries: FeedEntry[]; truncated: boolean } | null;

/** Synthetic rows have no database id; derivation only needs a stable one. */
function alertId(scenarioId: string, index: number): string {
  return `${scenarioId}-alert-${index}`;
}

function toAlertInputs(s: AttentionScenario) {
  return s.alerts.map((row, i) => ({
    id: alertId(s.id, i),
    code: row.code,
    context: row.context,
    raised_at: row.raised_at,
    occurrence_count: row.occurrence_count,
    ...deriveAlertRowFields(row, row.galleryIdentity ?? undefined),
    // GALLERY-ONLY override (spec §6.2): a declared crewMatch demos the fan-out
    // without a live roster; spread last so it wins over any derived value, and
    // spread-inserted to avoid an explicit undefined (exactOptional).
    ...(row.crewMatch ? { crewMatch: row.crewMatch } : {}),
  }));
}

function toChangeLogRows(s: AttentionScenario): ChangeLogRow[] {
  return (s.changeLog ?? []).map((row, i) => ({ id: `${s.id}-log-${i}`, ...row }));
}

function toHoldRows(s: AttentionScenario): HoldRow[] {
  return s.holds.map((h, i) => ({
    id: `${s.id}-hold-${i}`,
    entity_key: h.entity_key,
    held_value: h.held_value,
    proposed_value: h.proposed_value,
    base_modified_time: h.base_modified_time,
    created_at: h.base_modified_time,
  }));
}

/**
 * The scenario's hold feed in the MODAL's `feed` prop shape. The SAME entries
 * feed both the derived attention items (via `deriveScenarioAttention`) and the
 * modal's Changes section, so a hold-bearing scenario's changes-rail badge and
 * its Changes feed agree (a badge with an empty feed was Codex R1 P1).
 */
export function buildScenarioFeed(s: AttentionScenario): ScenarioFeed {
  // Deterministic contract (spec §3.1, R11): null EXACTLY when there are no
  // holds and no changeLog. `feedNull` plays no role here — its entry-exclusivity
  // guard means a feedNull scenario always lands in this absent-null arm, and
  // the infra `feed: null` override is applied solely by buildScenarioModalData.
  if (s.holds.length === 0 && (s.changeLog?.length ?? 0) === 0) return null;
  // The REAL production shaper: mapping, acceptable/undo predicates, and the
  // full-precision cross-source merge all come from shapeChangeFeed.
  return {
    entries: shapeChangeFeed(toChangeLogRows(s), toHoldRows(s)),
    truncated: s.feedTruncated === true,
  };
}

/** The real derived attention list for one scenario. */
export function deriveScenarioAttention(s: AttentionScenario): AttentionItem[] {
  const feed = buildScenarioFeed(s);
  return deriveAttentionItems({
    alerts: toAlertInputs(s),
    feed: feed === null ? null : { entries: feed.entries },
    slug: GALLERY_SLUG,
  });
}
