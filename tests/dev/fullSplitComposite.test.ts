// Behavioral pins for the curated full-split composite (spec
// docs/superpowers/specs/2026-07-22-attention-gallery-curated-composite.md §3-§4).
// Derived through the REAL deriveScenarioAttention - the same path the gallery
// route renders - so a classification or action-registry regression that would
// change what the gallery teaches fails here, not in a screenshot.
import { describe, expect, it } from "vitest";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import { T3_FULL_SPLIT } from "@/lib/dev/attentionScenarios/tier3";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { GALLERY_SLUG } from "@/lib/dev/galleryModalTypes";

describe("t3-full-attention-split composite", () => {
  const scenario = () => {
    const s = scenarioById(T3_FULL_SPLIT);
    if (!s) throw new Error("composite missing from catalog");
    return s;
  };

  it("is a tier-3 composite: exact code sequence, contexts, label, hold shape; warnings ABSENT", () => {
    const s = scenario();
    expect(s.tier).toBe(3);
    expect(s.label).toBe("Everything at once: confirm, review, and monitoring");
    // exact sequence + contexts (review R1 P2: a loose count pin would accept
    // duplicate self-heal codes or a dropped sheet context)
    expect(s.alerts.map((a) => a.code)).toEqual([
      "SHEET_UNAVAILABLE",
      "RESYNC_QUALITY_REGRESSED",
      "SYNC_STALLED",
      "DRIVE_FETCH_FAILED",
    ]);
    expect(s.alerts[0]?.context).toEqual({ drive_file_id: "gallery-fixture-file" });
    for (const a of s.alerts.slice(1)) expect(a.context).toEqual({});
    expect(s.holds).toHaveLength(1);
    expect(s.holds[0]).toMatchObject({
      kind: "mi11_pending",
      domain: "crew_email",
      entity_key: "ren-park",
    });
    expect("warnings" in s).toBe(false);
  });

  it("derives the full split: 1 actionable (the hold), 2 needs_look, 2 self_heal", () => {
    const items = deriveScenarioAttention(scenario());
    expect(items.filter((i) => i.actionable)).toHaveLength(1);
    expect(items.filter((i) => i.actionable)[0]?.kind).toBe("hold");
    expect(items.filter((i) => i.clearingKind === "needs_look")).toHaveLength(2);
    expect(items.filter((i) => i.clearingKind === "self_heal")).toHaveLength(2);
  });

  it("sheet row resolves the EXTERNAL link from context.drive_file_id (gallery has no show-level id)", () => {
    const items = deriveScenarioAttention(scenario());
    const sheet = items.find((i) => i.kind === "alert" && i.alert.code === "SHEET_UNAVAILABLE");
    if (sheet?.kind !== "alert") throw new Error("sheet item missing");
    expect(sheet.alert.action).toEqual({
      label: "Open in Sheet",
      href: "https://docs.google.com/spreadsheets/d/gallery-fixture-file/edit#gid=0",
      external: true,
    });
  });

  it("overview row resolves the INTERNAL anchor from the gallery slug", () => {
    const items = deriveScenarioAttention(scenario());
    const ov = items.find((i) => i.kind === "alert" && i.alert.code === "RESYNC_QUALITY_REGRESSED");
    if (ov?.kind !== "alert") throw new Error("overview item missing");
    expect(ov.alert.action).toEqual({
      label: "Go to Overview",
      href: `/admin?show=${GALLERY_SLUG}#overview`,
      external: false,
    });
  });
});
