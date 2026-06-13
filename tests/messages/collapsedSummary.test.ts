// @vitest-environment node
import { describe, it, expect } from "vitest";
import { firstSentence, stripEmphasis } from "../../lib/messages/collapsedSummary";

describe("firstSentence", () => {
  it("returns first sentence ending in period", () => {
    expect(firstSentence("A. B.")).toBe("A.");
  });
  it("does not split on decimal numbers", () => {
    expect(firstSentence("synced in 1.5 hours. Re-sync.")).toBe("synced in 1.5 hours.");
  });
  it("returns input unchanged when no sentence boundary", () => {
    expect(firstSentence("no period here")).toBe("no period here");
  });
  it("preserves em-dashes and stops at first boundary", () => {
    expect(firstSentence("Stalled — check it. More.")).toBe("Stalled — check it.");
  });
  it("handles empty string", () => {
    expect(firstSentence("")).toBe("");
  });
});

describe("stripEmphasis", () => {
  it("strips **bold**", () => {
    expect(stripEmphasis("**Made a mistake?**")).toBe("Made a mistake?");
  });
  it("strips *em*", () => {
    expect(stripEmphasis("*Cobalt*: x")).toBe("Cobalt: x");
  });
  it("strips leading _em_", () => {
    expect(stripEmphasis("_Cobalt_ x")).toBe("Cobalt x");
  });
  it("strips outer _em_ pair but keeps internal underscore", () => {
    expect(stripEmphasis("_Validation (SW-POST_SHOW)_ isn't here")).toBe(
      "Validation (SW-POST_SHOW) isn't here",
    );
  });
  it("leaves lone internal underscore in snake_case untouched", () => {
    expect(stripEmphasis("snake_case stays")).toBe("snake_case stays");
  });
  it("preserves a literal `***` run (does NOT collapse it to `*`)", () => {
    // UNKNOWN_DAY_RESTRICTION tells Doug the role cell contains `***`. The lazy
    // `.+?` form matched `*`...`*` inside the triple and collapsed it to `*` on
    // every surface routed through stripEmphasis (AlertBanner collapsed line,
    // plainCatalogText). `[^*]+` content classes preserve it (Codex R3).
    expect(stripEmphasis("day-restricted (`***` in the role)")).toBe(
      "day-restricted (`***` in the role)",
    );
  });
  it("handles empty string", () => {
    expect(stripEmphasis("")).toBe("");
  });
});

describe("combined (real use)", () => {
  it("strips emphasis then returns first sentence", () => {
    const input = "_<sheet>_ isn't in your folder anymore. Either you moved it.";
    const result = stripEmphasis(firstSentence(input));
    expect(result).toBe("<sheet> isn't in your folder anymore.");
  });
});
