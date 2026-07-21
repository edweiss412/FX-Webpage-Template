/**
 * app/admin/dev/attention-gallery/buildBlockProps.ts
 * (spec 2026-07-20-attention-scenario-gallery §4.1)
 *
 * Turns one scenario into everything `ScenarioBlock` renders, by running the
 * REAL production path: `deriveAlertRowFields` -> `deriveAttentionItems` ->
 * `bucketAttention`. Nothing here reimplements routing or placement; if the
 * gallery ever disagreed with the modal, the disagreement would be invisible,
 * which defeats the instrument.
 *
 * Extracted from `page.tsx` because Next 16 permits only recognized route
 * exports from a page module, and because the render path is worth unit-testing
 * without booting a route.
 */
import { deriveAttentionItems, type AttentionItem } from "@/lib/admin/attentionItems";
import {
  bucketAttention,
  resolveEffectiveSection,
  type PlacementPredicates,
  type SectionAttention,
} from "@/lib/admin/sectionAttention";
import { deriveAlertRowFields } from "@/lib/adminAlerts/deriveAlertRowFields";
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";
import type { ReactNode } from "react";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import type {
  ReadoutRow,
  ScenarioBlockProps,
  ScenarioGroup,
} from "@/components/admin/dev/ScenarioBlock";

/** Fixed so a card's relative-time copy is stable across reloads and screenshots. */
export const GALLERY_NOW = new Date("2026-07-01T18:00:00.000Z");
export const GALLERY_SLUG = "gallery";

/** Synthetic rows have no database id; derivation only needs one that is stable. */
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
  }));
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
 * Flattens the bucket map into a stable, renderable list. Placement KIND is kept
 * distinct rather than merged: a card that never left the anchor bucket must not
 * be indistinguishable from one that fell back to the section top.
 */
function toGroups(
  map: SectionAttention,
  renderNote: (sectionId: string, count: number) => ReactNode,
): ScenarioGroup[] {
  const groups: ScenarioGroup[] = [];
  for (const [sectionId, b] of map) {
    if (b.sectionTop.length > 0) {
      groups.push({
        sectionId,
        placement: "sectionTop",
        anchorOrCrewKey: null,
        nodes: b.sectionTop,
      });
    }
    for (const [anchor, nodes] of b.byAnchor ?? new Map()) {
      groups.push({ sectionId, placement: "anchor", anchorOrCrewKey: anchor, nodes });
    }
    for (const [crewKey, nodes] of b.byCrewKey ?? new Map()) {
      groups.push({ sectionId, placement: "crewRow", anchorOrCrewKey: crewKey, nodes });
    }
    // The two parse codes travel as DOMAIN note items, not cards: the warnings
    // section composes them because the copy depends on warnings.length. Without
    // this the gallery would show an empty warnings section and read as a drop.
    if (b.notes && b.notes.length > 0) {
      groups.push({
        sectionId,
        placement: "sectionTop",
        anchorOrCrewKey: "notes",
        nodes: [renderNote(sectionId, b.notes.length)],
      });
    }
  }
  return groups;
}

function buildReadout(
  s: AttentionScenario,
  items: AttentionItem[],
  predicates: PlacementPredicates,
  groups: ScenarioGroup[],
): ReadoutRow[] {
  const rows: ReadoutRow[] = [
    { label: "scenario", value: s.id },
    { label: "tier", value: String(s.tier) },
    { label: "alerts / holds", value: `${s.alerts.length} / ${s.holds.length}` },
    { label: "placed cards", value: String(groups.reduce((n, g) => n + g.nodes.length, 0)) },
    {
      label: "warnings",
      value: s.warnings === undefined ? "absent (untouched)" : `${s.warnings.length} declared`,
    },
    { label: "degraded", value: String(s.degraded ?? false) },
  ];
  for (const item of items) {
    const effective =
      item.kind === "alert" ? resolveEffectiveSection(item, predicates) : item.sectionId;
    rows.push({
      label: `item ${item.id}`,
      value:
        `${item.kind} declared=${item.sectionId} effective=${effective} ` +
        `tone=${item.tone} actionable=${item.actionable}` +
        (item.crewKey === null ? "" : ` crewKey=${item.crewKey}`),
    });
  }
  return rows;
}

export function buildBlockProps(
  s: AttentionScenario,
  maxWidthPx: number | null,
  // REQUIRED, deliberately: a defaulted no-op would let the page forget to pass
  // a renderer and quietly show a gallery of empty groups.
  renderCard: (item: AttentionItem) => ReactNode,
  renderNote: (sectionId: string, count: number) => ReactNode = (id, n) =>
    `${n} parse note(s) composed by ${id}`,
): ScenarioBlockProps {
  const items = deriveAttentionItems({
    alerts: toAlertInputs(s),
    feed: s.holds.length === 0 ? null : { entries: toHoldRows(s).map(shapeHoldEntry) },
    slug: GALLERY_SLUG,
  });

  // Always-true defaults with the scenario's tier-2 overrides on top: the
  // predicates are the ONLY thing a structural axis varies, so they must reach
  // both bucketAttention and the readout's effective-section column from one
  // source, or the readout could disagree with the placement it describes.
  const predicates: PlacementPredicates = {
    sectionAvailable: s.bucket?.sectionAvailable ?? (() => true),
    anchorAvailable: s.bucket?.anchorAvailable ?? (() => true),
  };

  const map = bucketAttention(items, {
    renderCard,
    ...predicates,
    ...(s.bucket?.crewKeyRendered ? { crewKeyRendered: s.bucket.crewKeyRendered } : {}),
  });

  const groups = toGroups(map, renderNote);

  return {
    scenarioId: s.id,
    label: s.label,
    items,
    groups,
    holdItems: items.filter((i) => i.kind === "hold"),
    readout: buildReadout(s, items, predicates, groups),
    warnings: s.warnings ?? null,
    degraded: s.degraded ?? false,
    maxWidthPx,
  };
}
