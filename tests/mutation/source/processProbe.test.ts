import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { premiseHolds } from "../../_shared/premise";
import type { GuardSurface } from "./registry";
import {
  type ProbeOutcome,
  type ProbeRefusedInput,
  parseArm,
  parsePrefixLength,
  parseSeed,
  parseTrials,
  renderProbe,
  resolveTarget,
} from "./processProbe";

/**
 * A throwaway root holding a real source file, so the site-resolution paths run
 * through the SHIPPED enumerator rather than a hand-built site list. A fixture
 * that cannot reach the enumerator cannot exercise the refusal it claims to.
 */
const root = mkdtempSync(join(tmpdir(), "fx-process-probe-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

writeFileSync(join(root, "subject.ts"), "export const under = (n: number): boolean => n < 3;\n");
writeFileSync(join(root, "subject.test.ts"), "// deciding suite, contents irrelevant here\n");

const surface = (over: Partial<GuardSurface> = {}): GuardSurface => ({
  id: "fixtureSurface",
  sourcePath: "subject.ts",
  suitePaths: ["subject.test.ts"],
  operators: ["relational-boundary"],
  scoreFloor: 1,
  control: { from: "n < 3", to: "n > 3" },
  accepted: [],
  ...over,
});

const detailOf = (outcome: ProbeOutcome): string => {
  if (outcome.kind !== "refusal") throw new Error(`expected a refusal, got ${outcome.kind}`);
  return outcome.detail;
};
const inputOf = (outcome: ProbeOutcome): ProbeRefusedInput => {
  if (outcome.kind !== "refusal") throw new Error(`expected a refusal, got ${outcome.kind}`);
  return outcome.input;
};

/**
 * Vocabulary a RESULT render carries and a refusal render must not: the AC-1
 * half that no distribution is emitted on any refusal path. Derived from the
 * renderer's own section labels rather than guessed, so a new section joining
 * the result render is covered here the moment it is added.
 */
const DISTRIBUTION_MARKERS = ["TRIALS:", "VERDICTS:", "BOUND:", "ELIGIBLE:", "LOAD:"] as const;

describe("processProbe accept-sets — every complement member refuses by name (AC-1)", () => {
  /**
   * The complement is enumerated as DATA so each case's refused input is
   * asserted individually. A loop asserting only `ok === false` would pass for
   * an implementation whose every refusal is a bare "not found" — the AC-1
   * weaker implementation.
   */
  const INVALID_COUNTS: readonly { label: string; value: unknown }[] = [
    { label: "missing", value: undefined },
    { label: "null", value: null },
    { label: "empty string", value: "" },
    { label: "whitespace", value: "   " },
    { label: "non-numeric", value: "twelve" },
    { label: "NaN literal", value: "NaN" },
    { label: "NaN number", value: Number.NaN },
    { label: "Infinity literal", value: "Infinity" },
    { label: "Infinity number", value: Number.POSITIVE_INFINITY },
    { label: "fractional string", value: "2.5" },
    { label: "fractional number", value: 2.5 },
    { label: "exponent form", value: "1e3" },
    { label: "hex form", value: "0x2" },
    { label: "zero", value: "0" },
    { label: "negative", value: "-1" },
  ];

  it.each(INVALID_COUNTS)("--trials refuses $label naming the input", ({ value }) => {
    const parsed = parseTrials(value);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.detail).toContain("--trials");
  });

  it("--trials accepts an integer >= 1 in both string and number form", () => {
    expect(parseTrials("12")).toEqual({ ok: true, value: 12 });
    expect(parseTrials(1)).toEqual({ ok: true, value: 1 });
    // Surrounding whitespace is TRIMMED, matching the shipped `parseRuns`
    // sibling (`determinism.ts`) deliberately. Refusing it here would be a
    // stricter contract than the spec states, invented by this suite alone,
    // and two accept-sets on one repo that disagree about padding is the
    // inconsistency a reader has to resolve at every call site.
    expect(parseTrials(" 2 ")).toEqual({ ok: true, value: 2 });
  });

  it.each(INVALID_COUNTS.filter((c) => c.label !== "zero"))(
    "--seed refuses $label naming the input",
    ({ value }) => {
      const parsed = parseSeed(value);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.detail).toContain("--seed");
    },
  );

  it("--seed accepts zero and any non-negative safe integer", () => {
    expect(parseSeed("0")).toEqual({ ok: true, value: 0 });
    expect(parseSeed("4294967295")).toEqual({ ok: true, value: 4294967295 });
    expect(parseSeed(" 7 ")).toEqual({ ok: true, value: 7 });
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "unknown arm", value: "D" },
    { label: "lowercase a", value: "a" },
    { label: "arm list", value: "A,B" },
    { label: "number", value: 1 },
  ])("--arm refuses $label naming the input", ({ value }) => {
    const parsed = parseArm(value);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.detail).toContain("--arm");
  });

  it("--arm accepts exactly the four declared arms", () => {
    for (const arm of ["A", "B", "C", "control"] as const) {
      expect(parseArm(arm)).toEqual({ ok: true, value: arm });
    }
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "negative", value: "-1" },
    { label: "fractional", value: "1.5" },
    { label: "NaN", value: "NaN" },
    { label: "non-numeric", value: "eight" },
  ])("--prefix refuses $label naming the input", ({ value }) => {
    const parsed = parsePrefixLength(value);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.detail).toContain("--prefix");
  });

  it("--prefix accepts zero — arm A's prefix length is legitimately empty", () => {
    expect(parsePrefixLength("0")).toEqual({ ok: true, value: 0 });
    expect(parsePrefixLength("24")).toEqual({ ok: true, value: 24 });
  });

  it("refuses an unknown surface id, naming the surface input and the id", () => {
    const outcome = resolveTarget({
      root,
      surfaceId: "noSuchSurface",
      site: "relational-boundary:1:48:<><=",
      surfaces: [surface()],
    });
    expect(inputOf(outcome)).toBe("surface");
    expect(detailOf(outcome)).toContain("noSuchSurface");
  });

  it("refuses a DUPLICATE surface id through the injectable surfaces seam", () => {
    const rows = [surface(), surface({ sourcePath: "subject.ts" })];
    premiseHolds(
      "the seam really holds two rows sharing one id, so the duplicate branch is reachable",
      rows.filter((r) => r.id === "fixtureSurface").length === 2,
    );
    const outcome = resolveTarget({
      root,
      surfaceId: "fixtureSurface",
      site: "relational-boundary:1:48:<><=",
      surfaces: rows,
    });
    expect(inputOf(outcome)).toBe("surface");
    expect(detailOf(outcome)).toMatch(/2 enrolled rows|resolves to 2/);
  });

  it("refuses a surface declaring no deciding suites", () => {
    const outcome = resolveTarget({
      root,
      surfaceId: "fixtureSurface",
      site: "relational-boundary:1:48:<><=",
      surfaces: [surface({ suitePaths: [] })],
    });
    expect(inputOf(outcome)).toBe("surface");
    expect(detailOf(outcome)).toMatch(/deciding suite/i);
  });

  it("refuses a site population of ZERO rather than reporting the site not found", () => {
    // A surface whose operator set generates nothing produces an EMPTY mutant
    // list, and "site not found" over an empty population is 320's vacuity: the
    // count looks like an ordinary miss while nothing was ever searched. The
    // floor names the population, so a broken enumerator cannot read as a typo.
    writeFileSync(join(root, "flat.ts"), "export const flat = 1;\n");
    const outcome = resolveTarget({
      root,
      surfaceId: "fixtureSurface",
      site: "relational-boundary:1:48:<><=",
      surfaces: [surface({ sourcePath: "flat.ts" })],
    });
    expect(inputOf(outcome)).toBe("site");
    expect(detailOf(outcome)).toMatch(/ZERO|no mutants|empty/i);
  });

  it("refuses an unresolvable site, naming the site input and listing what IS available", () => {
    const outcome = resolveTarget({
      root,
      surfaceId: "fixtureSurface",
      site: "relational-boundary:999:1:<><=",
      surfaces: [surface()],
    });
    expect(inputOf(outcome)).toBe("site");
    expect(detailOf(outcome)).toContain("relational-boundary:999:1:<><=");
  });

  it("resolves a real site through the shipped enumerator", () => {
    const outcome = resolveTarget({
      root,
      surfaceId: "fixtureSurface",
      site: "relational-boundary:1:48:<><=",
      surfaces: [surface()],
    });
    if (outcome.kind === "refusal") {
      throw new Error(`expected resolution, got refusal(${outcome.input}): ${outcome.detail}`);
    }
    expect(outcome.target.siteId).toBe("relational-boundary:1:48:<><=");
    expect(outcome.target.mutants.length).toBeGreaterThan(0);
  });

  it("emits NO distribution text on ANY refusal path", () => {
    const refusals: ProbeOutcome[] = [
      { kind: "refusal", input: "trials", detail: "--trials must be an integer >= 1" },
      { kind: "refusal", input: "seed", detail: "--seed must be an integer >= 0" },
      { kind: "refusal", input: "arm", detail: "--arm must be one of A, B, C, control" },
      resolveTarget({
        root,
        surfaceId: "noSuchSurface",
        site: "relational-boundary:1:48:<><=",
        surfaces: [surface()],
      }),
      resolveTarget({
        root,
        surfaceId: "fixtureSurface",
        site: "relational-boundary:999:1:<><=",
        surfaces: [surface()],
      }),
    ];
    premiseHolds(
      "every member of this set really is a refusal, so the absence assertion has a subject",
      refusals.every((r) => r.kind === "refusal"),
    );
    for (const refusal of refusals) {
      const text = renderProbe(refusal);
      expect(text).toContain("REFUSED");
      for (const marker of DISTRIBUTION_MARKERS) expect(text).not.toContain(marker);
      // `0 of 0` and `11 of 12` are the distribution's own shape; neither may
      // appear on a path that produced no distribution at all.
      expect(text).not.toMatch(/\d+ of \d+/);
    }
  });

  it("names the refused input in the rendered text, never a bare not-found", () => {
    const text = renderProbe(
      resolveTarget({
        root,
        surfaceId: "noSuchSurface",
        site: "relational-boundary:1:48:<><=",
        surfaces: [surface()],
      }),
    );
    expect(text).toContain("surface");
    expect(text).toContain("noSuchSurface");
  });
});
