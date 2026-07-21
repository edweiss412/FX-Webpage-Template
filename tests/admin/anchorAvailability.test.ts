// @vitest-environment node
// attention-alert-routing §3.3: per-section anchor availability. `anchorsForData`
// returns a Map keyed by the anchor-hosting section (NOT a global set), reusing the
// SAME predicates the sub-block / field render gates use (`hasDiagramSignal`, the
// `stripOpeningReelText` reel cleanup) so availability and render cannot disagree.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { anchorsForData } from "@/lib/admin/attentionAnchorAvailability";
import type { SectionData } from "@/components/admin/review/sectionData";

// Minimal published SectionData — anchorsForData reads only `mode`, `diagrams`,
// and `eventDetails`. Cast through unknown so the fixture stays terse.
function published(over: {
  diagrams?: unknown;
  eventDetails?: Record<string, unknown> | null;
}): SectionData {
  return {
    mode: "published",
    diagrams: over.diagrams ?? null,
    eventDetails: over.eventDetails ?? null,
  } as unknown as SectionData;
}

// A persisted-diagrams object carrying a signal (linkedFolder != null → the same
// gate the published sub-block uses via resolveCurrentDiagrams + hasDiagramSignal).
const DIAGRAM_SIGNAL = {
  snapshot_revision_id: "rev-1",
  linkedFolder: { id: "folder-1" },
  embeddedImages: [],
  linkedFolderItems: [],
};

describe("anchorsForData", () => {
  it("diagram signal present → rooms set has diagrams", () => {
    const m = anchorsForData(published({ diagrams: DIAGRAM_SIGNAL }));
    expect(m.get("rooms")).toEqual(new Set(["diagrams"]));
  });

  it("no diagram signal → rooms absent (null and empty-shape both unavailable)", () => {
    expect(anchorsForData(published({ diagrams: null })).has("rooms")).toBe(false);
    expect(anchorsForData(published({ diagrams: {} })).has("rooms")).toBe(false);
    expect(
      anchorsForData(
        published({
          diagrams: {
            snapshot_revision_id: "rev-1",
            linkedFolder: null,
            embeddedImages: [],
            linkedFolderItems: [],
          },
        }),
      ).has("rooms"),
    ).toBe(false);
  });

  it("non-empty opening_reel → event set has opening_reel", () => {
    const m = anchorsForData(published({ eventDetails: { opening_reel: "https://x/reel" } }));
    expect(m.get("event")).toEqual(new Set(["opening_reel"]));
  });

  it("null / empty / whitespace opening_reel → event absent", () => {
    expect(anchorsForData(published({ eventDetails: null })).has("event")).toBe(false);
    expect(anchorsForData(published({ eventDetails: {} })).has("event")).toBe(false);
    expect(
      anchorsForData(published({ eventDetails: { opening_reel: "" } })).has("event"),
    ).toBe(false);
    expect(
      anchorsForData(published({ eventDetails: { opening_reel: "   " } })).has("event"),
    ).toBe(false);
  });

  it("returns a Map keyed by anchor-hosting section; crew never appears", () => {
    const m = anchorsForData(
      published({ diagrams: DIAGRAM_SIGNAL, eventDetails: { opening_reel: "reel" } }),
    );
    expect(m).toBeInstanceOf(Map);
    expect([...m.keys()].sort()).toEqual(["event", "rooms"]);
    expect(m.has("crew" as never)).toBe(false);
  });

  it("SOURCE: the module reuses the exported hasDiagramSignal, not a hand-rolled check", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/admin/attentionAnchorAvailability.ts"),
      "utf8",
    );
    expect(src).toMatch(/hasDiagramSignal/);
    expect(src).toMatch(/stripOpeningReelText/);
  });
});
