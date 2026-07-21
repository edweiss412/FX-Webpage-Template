/**
 * tests/app/admin/attentionGalleryRender.test.tsx
 *
 * `buildBlockProps` — the gallery's render path (spec §4.1). It runs the REAL
 * `deriveAttentionItems` + `bucketAttention`, so these assertions are about
 * production placement behavior, not about a gallery-local reimplementation of
 * it. Failure modes caught: skipping derivation, ignoring a scenario's bucket
 * overrides, flattening the bucket map wrongly, or dropping holds.
 */
import { describe, expect, test } from "vitest";
import { buildBlockProps } from "@/app/admin/dev/attention-gallery/buildBlockProps";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import {
  T2_ANCHOR_ABSENT,
  T2_OVERVIEW_ABSENT,
  T2_SECTION_ABSENT,
  T2_HOLD_ONLY,
  T2_EMPTY,
  T2_MANY,
  MENU_CAP,
} from "@/lib/dev/attentionScenarios/tier2";
import { T3_HOLD_AND_DRIFT, T3_SHEET_MISSING } from "@/lib/dev/attentionScenarios/tier3";

/** Cards render as their own item id, so a group's `nodes` are checkable values
 *  rather than opaque elements — a placement assertion can then name WHICH card
 *  landed where, not merely how many did. */
function props(id: string, maxWidthPx: number | null = null) {
  const s = scenarioById(id);
  if (!s) throw new Error(`missing scenario ${id}`);
  return buildBlockProps(s, maxWidthPx, (item) => `card:${item.id}`);
}

describe("buildBlockProps", () => {
  test("derives items and honors the scenario's anchor override", () => {
    const p = props(T2_ANCHOR_ABSENT);
    expect(p.items.length).toBeGreaterThan(0);
    // anchorAvailable=false, and rooms has no section-top consumer, so the card
    // is redirected to OVERVIEW's section top (lib/admin/sectionAttention.ts:127-134).
    expect(p.groups.some((g) => g.placement === "anchor")).toBe(false);
    const overview = p.groups.find(
      (g) => g.sectionId === "overview" && g.placement === "sectionTop",
    );
    expect(overview?.nodes).toEqual([`card:${p.items[0]!.id}`]);
    expect(p.groups.some((g) => g.sectionId === "rooms")).toBe(false);
  });

  test("a card is never dropped, even when EVERY section reports unavailable", () => {
    // The plan predicted `groups === []` here, inherited from a spec claim Task 6
    // disproved: bucketAttention resolves an unavailable section to "overview"
    // unconditionally, never consulting sectionAvailable("overview"). That is the
    // structural no-drop guarantee, so the card MUST still be placed.
    const p = props(T2_OVERVIEW_ABSENT);
    expect(p.items.length).toBeGreaterThan(0);
    const placed = p.groups.flatMap((g) => g.nodes);
    expect(placed).toEqual([`card:${p.items[0]!.id}`]);
    expect(p.groups[0]?.sectionId).toBe("overview");
  });

  test("the readout records declared vs effective section, so a fallback is visible", () => {
    const p = props(T2_SECTION_ABSENT);
    const row = p.readout.find((r) => r.label.startsWith("item "));
    expect(row, "an item row exists").toBeDefined();
    // The scenario's alert routes to crew; only overview is available.
    expect(row?.value).toContain("declared=crew");
    expect(row?.value).toContain("effective=overview");
  });

  test("a scenario with no fallback shows declared === effective", () => {
    const row = props(T3_SHEET_MISSING).readout.find((r) => r.label.startsWith("item "));
    expect(row?.value).toMatch(/declared=(\w+) effective=\1\b/);
  });

  test("holds become holdItems and never enter the bucketed groups", () => {
    const p = props(T2_HOLD_ONLY);
    expect(p.holdItems.length).toBeGreaterThan(0);
    expect(p.holdItems.every((i) => i.kind === "hold")).toBe(true);
    expect(p.groups.reduce((n, g) => n + g.nodes.length, 0)).toBe(0);
    // The menu still counts them: holds are actionable items, just not bucketed.
    expect(p.items.some((i) => i.kind === "hold")).toBe(true);
  });

  test("an empty scenario yields empty everything without throwing", () => {
    const p = props(T2_EMPTY);
    expect(p.items).toEqual([]);
    expect(p.groups).toEqual([]);
    expect(p.holdItems).toEqual([]);
    expect(p.readout.length).toBeGreaterThan(0);
  });

  test("every declared alert reaches the menu at the MENU_CAP axis", () => {
    // Guards a silent slice: MENU_CAP items in, MENU_CAP items out.
    expect(props(T2_MANY).items).toHaveLength(MENU_CAP);
  });

  test("the warnings tri-state is threaded, not collapsed", () => {
    // Absent -> null (no warning surface); [] -> [] (surface, zero cards).
    expect(props(T3_SHEET_MISSING).warnings).toBeNull();
    expect(props(T3_HOLD_AND_DRIFT).warnings).toEqual([]);
  });

  test("degraded and label come from the scenario", () => {
    const p = props(T2_EMPTY);
    expect(p.degraded).toBe(false);
    expect(p.scenarioId).toBe(T2_EMPTY);
    expect(p.label.length).toBeGreaterThan(0);
  });

  test("threads maxWidthPx through unchanged", () => {
    expect(props(T2_ANCHOR_ABSENT, 390).maxWidthPx).toBe(390);
    expect(props(T2_ANCHOR_ABSENT, null).maxWidthPx).toBeNull();
  });
});
