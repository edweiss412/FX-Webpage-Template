// Spec §3.4 (docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md):
// after the parseSheet-entry strip, no zero-width codepoint reaches payload.
// Failure mode caught: a cell-read path that bypasses the strip (or a future revert)
// silently re-admits invisible characters that defeat string equality — a name
// carrying a ZWNJ does not match the same name without one, so identity linking and
// crew matching miss while the rendered page still looks correct.
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import { premiseHolds } from "@/tests/_shared/premise";
import { payloadOf } from "@/tests/parser/mutation/oracle";

/** ZWSP U+200B - ZWJ U+200D, plus BOM U+FEFF — the class `clean()` strips (_helpers.ts:49). */
const ZW = /[\u200B-\u200D\uFEFF]/;
const ZWNJ = "\u200C";
const FIXTURE_DIRS = ["fixtures/shows/exporter-xlsx", "fixtures/shows/raw"];

const fixtures: Array<{ name: string; md: string }> = FIXTURE_DIRS.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: `${d}/${f}`, md: readFileSync(`${d}/${f}`, "utf8") })),
);

function zwInPayload(md: string, name: string): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") {
      if (ZW.test(v)) hits.push(`${name} ${path}`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(payloadOf(parseSheet(md, name)), "payload");
  return hits;
}

/** Inject U+200C into the middle of the first data cell with >= 2 chars (operator shape, operators.ts:85). */
function seedZwnj(md: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("|") || /^\|\s*:?-+/.test(line)) continue;
    const cells = line.split("|");
    for (let c = 1; c < cells.length - 1; c++) {
      const t = cells[c]!.trim();
      if (t.length >= 2 && !ZW.test(t) && !t.includes(ZWNJ)) {
        const mid = Math.floor(t.length / 2);
        cells[c] = cells[c]!.replace(t, t.slice(0, mid) + ZWNJ + t.slice(mid));
        lines[i] = cells.join("|");
        return lines.join("\n");
      }
    }
  }
  throw new Error("no eligible cell found - premise violated");
}

describe("payload zero-width freedom (spec §3.4)", () => {
  it("premise: the corpus and the seeded mutant both carry zero-width input", () => {
    // Premise 0: the corpus was actually discovered — an empty list makes every
    // assertion below vacuously true.
    premiseHolds("corpus fixtures discovered", fixtures.length >= 18);
    // Premise 1: fintech.md carries 18 pre-existing ZWNJ (corpus probe §13.D).
    const fintech = fixtures.find((f) => f.name.endsWith("exporter-xlsx/fintech.md"));
    premiseHolds("fintech fixture carries raw ZWNJ", fintech !== undefined && ZW.test(fintech.md));
    // Premise 2: the seeded mutant used below is genuinely mutated.
    premiseHolds("seeded mutant carries ZWNJ", ZW.test(seedZwnj(fixtures[0]!.md)));
  });

  it("no corpus fixture leaks a zero-width codepoint into payload", () => {
    const hits = fixtures.flatMap((f) => zwInPayload(f.md, f.name));
    expect(hits).toEqual([]);
  });

  it("a seeded ZWNJ mid-cell is absorbed: payload equals the un-mutated baseline", () => {
    for (const f of fixtures) {
      const mutated = seedZwnj(f.md);
      expect(payloadOf(parseSheet(mutated, f.name))).toEqual(payloadOf(parseSheet(f.md, f.name)));
    }
  });
});
