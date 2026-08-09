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
// reaches those.
//
// MUTANTS COME FROM THE REAL OPERATOR, not a hand-rolled seed. An earlier version of
// this guard rolled its own injector, which selected a DIFFERENT cell from
// `unicode-inject` on 7 of 17 fixtures (it treated recognized header rows as data) —
// so the guard and the harness it claims to backstop were testing different things.
// Sourcing from OPERATORS keeps them definitionally in step.
//
// Fixtures come from the harness registry rather than a readdir of the corpus
// directory: a directory listing in the parallel project would race a serial test's
// synthetic `_temp-*` fixture (tests/cross-cutting/corpus-temp-prefix.test.ts), and
// would also sweep up non-fixture markdown such as exporter-xlsx/README.md.
import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";
import { OPERATORS } from "@/tests/parser/mutation/operators";
import { payloadOf } from "@/tests/parser/mutation/oracle";

/** ZWSP U+200B - ZWJ U+200D, plus BOM U+FEFF — the class `clean()` strips (_helpers.ts:50). */
const ZW = /[\u200B-\u200D\uFEFF]/;
/** A marker no fixture contains, so "did THIS occurrence reach payload" is answerable. */
const MARKER = "ZWPROBEMARKER";

const fixtures = FIXTURES.map((f) => ({ name: f.path, md: readFixture(f) }));

/** The first `unicode-inject` mutant for a fixture — the exact mutant the harness scores. */
function firstUnicodeMutant(md: string): { md: string; siteId: string } {
  const m = OPERATORS["unicode-inject"]!(md)[0];
  if (m === undefined) throw new Error("no unicode-inject mutant - premise violated");
  return { md: m.md, siteId: m.siteId };
}

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

function payloadContains(md: string, name: string, needle: string): boolean {
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

/**
 * The operator's own mutant with a VISIBLE marker in place of the zero-width character.
 *
 * This is what makes the reachability premise honest. Asking "is the un-mutated cell's
 * text somewhere in payload" answers a different question — that text can appear via a
 * repeated or fallback-derived string while the mutated OCCURRENCE never reaches
 * payload at all. Measured: those two questions disagreed on 6 of 17 fixtures in both
 * directions. A marker at the exact injection site cannot be confused with anything.
 */
function markerAtInjectionSite(md: string): string | null {
  const mutated = firstUnicodeMutant(md).md;
  const before = md.split("\n");
  const after = mutated.split("\n");
  for (let i = 0; i < after.length; i++) {
    if (after[i] !== before[i]) {
      after[i] = after[i]!.replace(/[\u200B-\u200D\uFEFF]/, MARKER);
      return after.join("\n");
    }
  }
  return null;
}

describe("payload zero-width freedom (spec §3.4)", () => {
  it("premise: the corpus is real, the operator mutates it, and the injection site reaches payload", () => {
    // Premise 1: the registry actually yielded the corpus. An empty list would make
    // every assertion below vacuously true.
    premise("corpus fixtures discovered", fixtures.length, 16);

    // Premise 2: the corpus carries native zero-width input at all (probe §13.D).
    const fintech = fixtures.find((f) => f.name.endsWith("exporter-xlsx/fintech.md"));
    premiseHolds("fintech fixture carries raw ZWNJ", fintech !== undefined && ZW.test(fintech.md));

    // Premise 3: the operator genuinely injects a zero-width character on EVERY fixture.
    for (const f of fixtures) {
      premiseHolds(
        `operator mutant carries ZWNJ (${f.name})`,
        ZW.test(firstUnicodeMutant(f.md).md),
      );
      premiseHolds(
        `marker substitution located the injection (${f.name})`,
        markerAtInjectionSite(f.md) !== null,
      );
    }

    // Premise 4 — THE REACHABILITY PREMISE, and the reason the seeded arms below are
    // not vacuous. The mutated OCCURRENCE must actually surface in payload, or a
    // retained zero-width character would be unobservable there and the assertions
    // would pass no matter what the parser did. Measured 2026-08-08: 6 of 17 fixtures
    // carry the injection site into payload. The floor sits below the measurement so
    // ordinary fixture edits do not red it, and above zero so the arms always bite.
    const reaching = fixtures.filter((f) =>
      payloadContains(markerAtInjectionSite(f.md)!, f.name, MARKER),
    ).length;
    premise("fixtures whose injection site reaches payload", reaching, 3);
  });

  it("no corpus fixture leaks a zero-width codepoint into payload", () => {
    // Regression pin, NOT the discriminating arm — see the header note. This is
    // already true without the entry strip, and exists so a future cell-read path
    // that bypasses clean() cannot land silently.
    const hits = fixtures.flatMap((f) => zwInPayload(f.md, f.name));
    expect(hits).toEqual([]);
  });

  it("no operator-mutated fixture leaks a zero-width codepoint into payload", () => {
    // The discriminating arm: without the parseSheet-entry strip this fails, because
    // the injected cell reaches payload through a path clean() does not cover.
    const hits = fixtures.flatMap((f) => zwInPayload(firstUnicodeMutant(f.md).md, f.name));
    expect(hits).toEqual([]);
  });

  it("an injected ZWNJ is absorbed: payload equals the un-mutated baseline", () => {
    for (const f of fixtures) {
      expect(payloadOf(parseSheet(firstUnicodeMutant(f.md).md, f.name)), f.name).toEqual(
        payloadOf(parseSheet(f.md, f.name)),
      );
    }
  });

  it("a zero-width character in the FILENAME never reaches show.title", () => {
    // `filename` is the title's final fallback (lib/parser/index.ts:330-331) and is a
    // parseSheet input the mutation harness never mutates, so no ledger row covers it.
    // Found by probe in cross-model review: before the fix this returned "A<ZWNJ>B"
    // with an identical signal channel — SILENT_WRONG on the very field the strip
    // exists to protect.
    const md =
      "| CLIENT | CLIENT |\n| --- | --- |\n\n| Contact Office | HQ |\n| CONTACT CELL | 555 |";
    const clean = parseSheet(md, "2026-08-AB.md");
    const dirty = parseSheet(md, `2026-08-A${"\u200C"}B.md`);
    premiseHolds("the fixture actually falls back to the filename", clean.show.title === "AB");
    expect(dirty.show.title).toBe("AB");
    expect(payloadOf(dirty)).toEqual(payloadOf(clean));
  });
});
