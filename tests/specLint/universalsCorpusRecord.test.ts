import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { premise, premiseHolds } from "../_shared/premise";

/**
 * Layer 3 of the spec's three-layer calibration discipline (spec §3): the SHIPPED
 * recognizer's own corpus run, committed, plus the bounded hand-classification of §3.3.
 *
 * This suite is a FRESHNESS pin, not a re-measurement. It asserts the two committed
 * artifacts agree with each other and describe the shipped arm — so a later gate change
 * that silently moves the population cannot leave a stale record behind claiming
 * otherwise. Re-running the recognizer here would defeat the purpose: the record would
 * then agree with the code by construction, which is what "committed record" exists to
 * prevent.
 */

const ROOT = process.cwd();
const RECORD = "docs/superpowers/specs/probes/2026-08-17-prose-consistency-arms.survivors.txt";
const CLASSIFICATION =
  "docs/superpowers/specs/probes/2026-08-17-prose-consistency-arms.classification.md";

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** `path:line <snippet>` — the row form the record commits. */
const ROW = /^(\S+?):(\d+) (.+)$/;

function recordRows(): { path: string; line: number; snippet: string }[] {
  return read(RECORD)
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.startsWith("#"))
    .map((l) => {
      const m = ROW.exec(l);
      if (m === null) throw new Error(`record row is not \`path:line <snippet>\`: ${l}`);
      return { path: m[1]!, line: Number(m[2]), snippet: m[3]! };
    });
}

describe("layer-3 corpus record (spec §3, §3.3)", () => {
  it("every row parses as `path:line <snippet>` and names a tracked docs path", () => {
    const rows = recordRows();
    // Premise: a zero-row record would make every assertion below vacuous.
    premise("the committed record carries survivor rows", rows.length, 0);
    for (const r of rows) {
      expect(r.path.startsWith("docs/"), r.path).toBe(true);
      expect(r.path.endsWith(".md"), r.path).toBe(true);
      expect(r.line).toBeGreaterThan(0);
      expect(r.snippet.trim().length).toBeGreaterThan(0);
    }
  });

  it("the record names the SHIPPED arm, not the draft-time instrument", () => {
    const header = read(RECORD).split("\n").slice(0, 12).join("\n");
    expect(header).toContain("#");
    expect(header).toContain("ENUMERATED_UNIVERSAL_NO_PROBE");
    expect(header).toContain("lib/specLint/universals.ts");
  });

  it("the classification's per-class counts sum to the record's row count", () => {
    const rows = recordRows();
    premise("the committed record carries survivor rows", rows.length, 0);
    const text = read(CLASSIFICATION);
    // Each class line is `- **<class>:** <n> rows`, so the sum is derived from the
    // committed classification rather than restated here.
    const counts = [...text.matchAll(/^- \*\*[^*]+:\*\* (\d+) rows?\b/gm)].map((m) => Number(m[1]));
    premise("the classification declares per-class counts", counts.length, 1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it("the classification's total line agrees with the record", () => {
    const rows = recordRows();
    const m = /^\*\*Total:\*\* (\d+) rows?\b/m.exec(read(CLASSIFICATION));
    premiseHolds("the classification declares a Total line", m !== null);
    expect(Number(m![1])).toBe(rows.length);
  });
});
