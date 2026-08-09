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
import { boundedMutants } from "@/tests/parser/mutation/operators";
import { payloadOf } from "@/tests/parser/mutation/oracle";

/** ZWSP U+200B - ZWJ U+200D, plus BOM U+FEFF — the class `clean()` strips (_helpers.ts:50). */
const ZW = /[\u200B-\u200D\uFEFF]/;
/**
 * Each arm walks all 17 corpus fixtures through the real parser, so the default 30s
 * per-test budget is not enough on a loaded CI shard — that is what failed
 * `unit-suite-nodb (1)` before the memoization above landed.
 */
const CORPUS_WALK_TIMEOUT_MS = 120_000;
/** A marker no fixture contains, so "did THIS occurrence reach payload" is answerable. */
const MARKER = "ZWPROBEMARKER";

const fixtures = FIXTURES.map((f) => ({ name: f.path, md: readFixture(f) }));

/**
 * The first `unicode-inject` mutant for a fixture — the exact mutant the harness scores.
 *
 * STREAMS the generator and stops at the first yield. `OPERATORS[op](md)` would
 * materialize every mutant for the fixture (thousands), which its own docstring reserves
 * for BOUNDED synthetic inputs; spreading it over a real corpus fixture is the misuse it
 * warns about, and doing so here timed the premise out at CI's 30s limit.
 *
 * Memoized per fixture: the premise and three arms all need the same mutant, and
 * regenerating it per call was the other half of that timeout.
 */
const mutantCache = new Map<string, { md: string; siteId: string }>();
function firstUnicodeMutant(md: string): { md: string; siteId: string } {
  const hit = mutantCache.get(md);
  if (hit !== undefined) return hit;
  for (const m of boundedMutants("unicode-inject", md)) {
    const out = { md: m.md, siteId: m.siteId };
    mutantCache.set(md, out);
    return out;
  }
  throw new Error("no unicode-inject mutant - premise violated");
}

/**
 * Memoized `payloadOf(parseSheet(...))`.
 *
 * The arms below deliberately re-ask the same questions of the same documents (baseline
 * vs mutant vs marker), and parseSheet over a corpus fixture is ~150ms. Without this the
 * absorption arm alone ran 18s locally and blew CI's 30s per-test timeout.
 */
const payloadCache = new Map<string, unknown>();
function payloadFor(md: string, name: string): unknown {
  const key = `${name}\u0000${md.length}\u0000${md}`;
  if (!payloadCache.has(key)) payloadCache.set(key, payloadOf(parseSheet(md, name)));
  return payloadCache.get(key);
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
  walk(payloadFor(md, name), "payload");
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
  walk(payloadFor(md, name));
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
 *
 * The site is located by DIFFING the mutated line against its original and taking the
 * first divergent index, which is precisely where the operator inserted. An earlier
 * version replaced the first zero-width character ON that line instead — indistinguishable
 * on the 17 mutants actually selected, but wrong for 3 of the 24,441 mutants the operator
 * can produce (a line that already carried a native zero-width character before the
 * injection), and one of those three also flipped the reachability answer. Operator order
 * or a fixture edit could surface any of them, so the weaker rule is not kept.
 */
const markerCache = new Map<string, string | null>();
function markerAtInjectionSite(md: string): string | null {
  const hit = markerCache.get(md);
  if (hit !== undefined) return hit;
  const out = computeMarkerAtInjectionSite(md);
  markerCache.set(md, out);
  return out;
}

function computeMarkerAtInjectionSite(md: string): string | null {
  const mutated = firstUnicodeMutant(md).md;
  const before = md.split("\n");
  const after = mutated.split("\n");
  for (let i = 0; i < after.length; i++) {
    const orig = before[i];
    const mut = after[i]!;
    if (orig === mut) continue;
    if (orig === undefined) return null;
    // First index at which the mutated line diverges from its original IS the
    // insertion point, because the operator's only edit is a single inserted
    // character. Replacing "the first zero-width character on the line" would
    // instead hit a pre-existing one whenever the cell already had any.
    let k = 0;
    while (k < orig.length && orig[k] === mut[k]) k++;
    const injected = mut[k];
    if (injected === undefined || !ZW.test(injected)) return null;
    after[i] = mut.slice(0, k) + MARKER + mut.slice(k + 1);
    return after.join("\n");
  }
  return null;
}

describe("payload zero-width freedom (spec §3.4)", () => {
  it(
    "premise: the corpus is real, the operator mutates it, and the injection site reaches payload",
    () => {
      // Premise 1: the registry actually yielded the corpus. An empty list would make
      // every assertion below vacuously true.
      premise("corpus fixtures discovered", fixtures.length, 16);

      // Premise 2: the corpus carries native zero-width input at all (probe §13.D).
      const fintech = fixtures.find((f) => f.name.endsWith("exporter-xlsx/fintech.md"));
      premiseHolds(
        "fintech fixture carries raw ZWNJ",
        fintech !== undefined && ZW.test(fintech.md),
      );

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
      // would pass no matter what the parser did. Measured 2026-08-09: 5 of 17 fixtures
      // carry the injection site into payload. The floor sits below the measurement so
      // ordinary fixture edits do not red it, and above zero so the arms always bite.
      const reaching = fixtures.filter((f) =>
        payloadContains(markerAtInjectionSite(f.md)!, f.name, MARKER),
      ).length;
      premise("fixtures whose injection site reaches payload", reaching, 3);
    },
    CORPUS_WALK_TIMEOUT_MS,
  );

  it(
    "no corpus fixture leaks a zero-width codepoint into payload",
    () => {
      // Regression pin, NOT the discriminating arm — see the header note. This is
      // already true without the entry strip, and exists so a future cell-read path
      // that bypasses clean() cannot land silently.
      const hits = fixtures.flatMap((f) => zwInPayload(f.md, f.name));
      expect(hits).toEqual([]);
    },
    CORPUS_WALK_TIMEOUT_MS,
  );

  it(
    "no operator-mutated fixture leaks a zero-width codepoint into payload",
    () => {
      // The discriminating arm: without the parseSheet-entry strip this fails, because
      // the injected cell reaches payload through a path clean() does not cover.
      const hits = fixtures.flatMap((f) => zwInPayload(firstUnicodeMutant(f.md).md, f.name));
      expect(hits).toEqual([]);
    },
    CORPUS_WALK_TIMEOUT_MS,
  );

  it(
    "an injected ZWNJ is absorbed: payload equals the un-mutated baseline",
    () => {
      for (const f of fixtures) {
        expect(payloadFor(firstUnicodeMutant(f.md).md, f.name), f.name).toEqual(
          payloadFor(f.md, f.name),
        );
      }
    },
    CORPUS_WALK_TIMEOUT_MS,
  );

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
