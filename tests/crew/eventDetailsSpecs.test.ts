import { describe, it, expect } from "vitest";
import { EVENT_DETAILS_LABELS, CREW_TECH_SPEC_KEYS } from "@/lib/crew/eventDetailsSpecs";
import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";

// Canonical text keys = all parser canonical values EXCEPT the documented non-text exclusion.
const LABEL_EXCLUDED = new Set(["diagrams"]);
const ALREADY_RENDERED = new Set([
  "dress_code",
  "internet",
  "power",
  "keynote_requirements",
  "opening_reel",
]);

describe("eventDetailsSpecs whitelist", () => {
  it("labels exactly the canonical text keys (completeness, two-way)", () => {
    const canonicalText = new Set(
      [...new Set(Object.values(CANONICAL_KEY_MAP))].filter((k) => !LABEL_EXCLUDED.has(k)),
    );
    const labeled = new Set(Object.keys(EVENT_DETAILS_LABELS));
    expect([...labeled].sort()).toEqual([...canonicalText].sort());
  });

  it("every crew key is labeled and not already-rendered or diagrams", () => {
    for (const k of CREW_TECH_SPEC_KEYS) {
      expect(EVENT_DETAILS_LABELS[k], `crew key ${k} has no label`).toBeTruthy();
      expect(ALREADY_RENDERED.has(k), `crew key ${k} is already rendered elsewhere`).toBe(false);
      expect(k).not.toBe("diagrams");
    }
  });
});
