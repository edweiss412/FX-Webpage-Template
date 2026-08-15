import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { stripCommentsSafely } from "../_shared/stripComments";
import { premiseHolds } from "../_shared/premise";
import { SUBTLE_INTERACTIVE_EXEMPTIONS } from "./subtleInteractiveExemptions";
import { scanSubtleInteractive } from "./subtleInteractiveScan";

const hits = scanSubtleInteractive(process.cwd());
const key = (x: { file: string; line: number; token: string }) => `${x.file}:${x.line}:${x.token}`;
const registry = new Map(SUBTLE_INTERACTIVE_EXEMPTIONS.map((r) => [key(r), r]));
const liveByKey = new Map(hits.map((h) => [key(h), h]));

// Strip comments so a cue surviving only in commentary cannot satisfy a pin
// (same false-green shape as plan R1 F6, applied to this suite's own source
// assertions). The stripping itself comes from the shared module — a local
// regex here is the duplicate-idiom class `_metaStripCommentsSingleSource`
// exists to prevent, and its own header explains why hand-rolled variants
// disagree at the edges.
const nonCommentSource = (file: string): string =>
  stripCommentsSafely(readFileSync(file, "utf8"), ts.ScriptKind.TSX);

describe("subtle-on-interactive policy (DESIGN §1.1/§1.1a, spec §4)", () => {
  it("premise: the scan sees the committed carve-out sites", () => {
    premiseHolds("scan finds >=1 hit", hits.length >= 1);
  });
  it("every hit is a registered carve-out (fail names site AND token)", () => {
    const unregistered = hits
      .filter((h) => !registry.has(key(h)))
      .map((h) => `${h.file}:${h.line} <${h.tag}> ${h.token}`);
    expect(unregistered).toEqual([]);
  });
  it("no stale registry row (every row still a live hit)", () => {
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.filter((r) => !liveByKey.has(key(r))).map(key)).toEqual(
      [],
    );
  });
  it("reasons are never blank", () => {
    for (const r of SUBTLE_INTERACTIVE_EXEMPTIONS)
      expect(r.reason.trim().length).toBeGreaterThan(0);
  });
  it("family shapes hold against the SCANNED hit, not the row's own claim", () => {
    for (const r of SUBTLE_INTERACTIVE_EXEMPTIONS) {
      const live = liveByKey.get(key(r));
      expect(live, `${key(r)} has no live hit`).toBeDefined();
      if (!live) continue;
      if (r.family === "summary-disclosure") expect(live.tag).toBe("summary");
      if (r.family === "dismissable-chip") expect(live.file).toContain("ActiveFilterChips");
      if (r.family === "state-dim") {
        const cue = r.siblingCue;
        if (!cue) throw new Error(`${key(r)} state-dim row without siblingCue`);
        expect(nonCommentSource(cue.file), `${key(r)} sibling cue ${cue.token}`).toContain(
          cue.token,
        );
      }
    }
  });
  it("registry cardinality matches the spec §4.3 tallies", () => {
    // 15 -> 14 (2026-08-15, whole-diff R1 F2): the second `ActiveFilterChips`
    // row was the "Clear filters" action, which has no filter caption and no
    // dismiss glyph and therefore never met Family C's definition. It was
    // swapped rather than re-carved-out; spec §4.3 carries the correction.
    expect(SUBTLE_INTERACTIVE_EXEMPTIONS.length).toBe(14);
  });
});
