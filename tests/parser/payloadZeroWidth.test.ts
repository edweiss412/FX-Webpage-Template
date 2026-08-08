// Spec §3.4 (docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md):
// after the parseSheet-entry strip, no zero-width codepoint reaches payload.
// Failure mode caught: a cell-read path that bypasses the strip (or a future revert)
// silently re-admits invisible characters that defeat string equality — a name
// carrying a ZWNJ does not match the same name without one, so identity linking and
// crew matching miss while the rendered page still looks correct.
//
// THE DISCRIMINATING ARM IS THE SEEDED ONE. The un-mutated corpus does NOT leak
// zero-width text into payload even without the strip: every payload path already
// routes through clean() (blocks/_helpers.ts:50), so fintech's 18 native ZWNJ are
// removed at the cell boundary. An assertion over the clean corpus alone would
// therefore pass with the fix reverted — vacuous. What the entry strip actually
// buys is coverage of the cells clean() never sees, and only a SEEDED corpus
// reaches those. The premise below pins that reachability executably.
//
// Fixtures come from the mutation harness's own registry rather than a readdir of
// the corpus directory. Two reasons, both load-bearing: a directory listing in the
// parallel project would race a serial test's synthetic `_temp-*` fixture
// (tests/cross-cutting/corpus-temp-prefix.test.ts), and a listing also sweeps up
// non-fixture markdown such as exporter-xlsx/README.md.
import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";
import { payloadOf } from "@/tests/parser/mutation/oracle";

/** ZWSP U+200B - ZWJ U+200D, plus BOM U+FEFF — the class `clean()` strips (_helpers.ts:50). */
const ZW = /[\u200B-\u200D\uFEFF]/;
const ZWNJ = "\u200C";

const fixtures = FIXTURES.map((f) => ({ name: f.path, md: readFixture(f) }));

/** Every payload string carrying a zero-width codepoint, as `<fixture> <path.to.field>`. */
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

/** Every payload string equal to `needle`, so "does this cell reach payload" is answerable. */
function payloadCarries(md: string, name: string, needle: string): boolean {
  let found = false;
  const walk = (v: unknown): void => {
    if (found) return;
    if (typeof v === "string") {
      if (v.includes(needle)) found = true;
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(payloadOf(parseSheet(md, name)));
  return found;
}

type Seed = { mutated: string; cell: string };

/** Inject U+200C into the middle of the first data cell with >= 2 chars (operator shape, operators.ts:85). */
function seedZwnj(md: string): Seed {
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
        return { mutated: lines.join("\n"), cell: t };
      }
    }
  }
  throw new Error("no eligible cell found - premise violated");
}

describe("payload zero-width freedom (spec §3.4)", () => {
  it("premise: the corpus is real, the seed genuinely mutates, and the seeded cell reaches payload", () => {
    // Premise 1: the registry actually yielded the corpus. An empty list would make
    // every assertion below vacuously true.
    premise("corpus fixtures discovered", fixtures.length, 16);

    // Premise 2: the corpus carries native zero-width input at all (probe §13.D).
    const fintech = fixtures.find((f) => f.name.endsWith("exporter-xlsx/fintech.md"));
    premiseHolds("fintech fixture carries raw ZWNJ", fintech !== undefined && ZW.test(fintech.md));

    // Premise 3: the seed genuinely injects a zero-width character on EVERY fixture.
    for (const f of fixtures) {
      premiseHolds(`seeded mutant carries ZWNJ (${f.name})`, ZW.test(seedZwnj(f.md).mutated));
    }

    // Premise 4 — THE REACHABILITY PREMISE, and the reason the seeded arm below is
    // not vacuous. The cell the seed targets must actually surface in payload, or a
    // retained zero-width character would be unobservable there and the assertion
    // would pass no matter what the parser did. Measured: 7 of 17 fixtures carry
    // their seeded cell into payload; anything above zero makes the arm bite, and
    // the floor is set below the measurement so ordinary fixture edits do not red it.
    const reaching = fixtures.filter((f) =>
      payloadCarries(f.md, f.name, seedZwnj(f.md).cell),
    ).length;
    premise("fixtures whose seeded cell reaches payload", reaching, 4);
  });

  it("no corpus fixture leaks a zero-width codepoint into payload", () => {
    // Regression pin, NOT the discriminating arm — see the header note. This is
    // already true without the entry strip, and exists so a future cell-read path
    // that bypasses clean() cannot land silently.
    const hits = fixtures.flatMap((f) => zwInPayload(f.md, f.name));
    expect(hits).toEqual([]);
  });

  it("no SEEDED fixture leaks a zero-width codepoint into payload", () => {
    // The discriminating arm: without the parseSheet-entry strip this fails, because
    // the seeded cell reaches payload through a path clean() does not cover.
    const hits = fixtures.flatMap((f) => zwInPayload(seedZwnj(f.md).mutated, f.name));
    expect(hits).toEqual([]);
  });

  it("a seeded ZWNJ mid-cell is absorbed: payload equals the un-mutated baseline", () => {
    for (const f of fixtures) {
      expect(payloadOf(parseSheet(seedZwnj(f.md).mutated, f.name)), f.name).toEqual(
        payloadOf(parseSheet(f.md, f.name)),
      );
    }
  });
});
