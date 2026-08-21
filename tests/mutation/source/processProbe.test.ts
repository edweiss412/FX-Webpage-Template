import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../../_shared/premise";
import { CONTROL_SURFACE } from "./fixtures/processProbe/surface";
import {
  FLIP_AT_RUN,
  RUNS_PER_TRIAL,
  STATE_DIR_ENV,
  boundaryCheckActive,
  observeRun,
} from "./fixtures/processProbe/state";
import { generateMutants } from "./generate";
import { siteId as siteIdOf } from "./operators";
import { DEFAULT_RECORD_DIR } from "./records";
import type { GuardSurface } from "./registry";
import { MutantRunInfraError } from "./runner";
import {
  type ProbeOutcome,
  type ProbeRefusedInput,
  type Refusal,
  parseArm,
  parsePrefixLength,
  parseSeed,
  parseTrials,
  ALPHA,
  type Arm,
  type ArmSummary,
  type CampaignAggregate,
  type CampaignPlan,
  type CampaignTrial,
  LOAD_ABSOLUTE_MIN,
  LOAD_RATIO_MIN,
  MIN_IN_WINDOW_SAMPLES,
  MUTANT_FILE_NAME,
  REQUIRED_CONDITION_FIELDS,
  type StepReport,
  type Target,
  type TrialDeps,
  type AggregateOutcome,
  type ObservationOutcome,
  type TrialOutcome,
  type TrialPlan,
  type TrialReport,
  aggregateCampaign,
  conditionOf,
  digestedFieldsOf,
  observeTrial,
  oneSidedBound,
  planCampaign,
  renderCampaign,
  renderProbe,
  resolveTarget,
  runTrial,
  serializeCampaign,
  spawnChannels,
  stepDigest,
  stripRenderComments,
  validateCondition,
  validatePlan,
  verifyTrialReport,
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

type Refusable = ProbeOutcome | CampaignPlan | TrialOutcome | ObservationOutcome | AggregateOutcome;

const asRefusal = (outcome: Refusable): Refusal => {
  if (!("kind" in outcome) || outcome.kind !== "refusal") {
    throw new Error(
      `expected a refusal, got ${"kind" in outcome ? outcome.kind : "a campaign plan"}`,
    );
  }
  return outcome;
};
const detailOf = (outcome: Refusable): string => asRefusal(outcome).detail;
const inputOf = (outcome: Refusable): ProbeRefusedInput => asRefusal(outcome).input;

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

/**
 * A wider fixture surface: enough relational sites that a shuffle has a domain
 * to move in. The planner properties below are vacuous on a one-mutant surface
 * — every ordering is the same ordering — so the domain is stated executably
 * rather than assumed.
 */
const WIDE_REL = "wide.ts";
writeFileSync(
  join(root, WIDE_REL),
  Array.from(
    { length: 30 },
    (_, i) => `export const c${i} = (n: number): boolean => n < ${i};`,
  ).join("\n") + "\n",
);
const wideSurface = (over: Partial<GuardSurface> = {}): GuardSurface =>
  surface({ id: "wideSurface", sourcePath: WIDE_REL, ...over });

describe("processProbe planner — seeded, reproducible, position derived (AC-11)", () => {
  const targetOf = (surfaces: readonly GuardSurface[], siteIdWanted: string) => {
    const outcome = resolveTarget({
      root,
      surfaceId: "wideSurface",
      site: siteIdWanted,
      surfaces,
    });
    if (outcome.kind === "refusal") {
      throw new Error(`fixture target did not resolve: ${outcome.input} — ${outcome.detail}`);
    }
    return outcome.target;
  };

  /** The middle site, so both a non-empty predecessor set and successors exist. */
  const MIDDLE_SITE = "relational-boundary:15:46:<><=";

  /** `planCampaign` returns a refusal in one case; every property below needs a plan. */
  const mustPlan = (input: Parameters<typeof planCampaign>[0]): CampaignPlan => {
    const planned = planCampaign(input);
    if ("kind" in planned) throw new Error(`planner refused: ${planned.input} — ${planned.detail}`);
    return planned;
  };

  it("planner produces byte-identical plans for the same seed", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const a = mustPlan({ target, seed: 4242, armATrials: 12 });
    const b = mustPlan({ target, seed: 4242, armATrials: 12 });
    // BYTE comparison, not deepStrictEqual: two objects with the same entries in
    // different key-insertion order are deep-equal and serialize to different
    // bytes, and the reproducibility claim is about what gets written down.
    expect(serializeCampaign(a)).toBe(serializeCampaign(b));
  });

  it("planner produces different shuffles for different seeds", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    premise(
      "the prefix domain admits more than one ordering, so a differing shuffle is a real signal",
      target.mutants.length - 1,
      1,
    );
    const a = mustPlan({ target, seed: 1, armATrials: 12 });
    const b = mustPlan({ target, seed: 2, armATrials: 12 });
    expect(serializeCampaign(a)).not.toBe(serializeCampaign(b));
  });

  it("planner carries the seed in EVERY trial plan, across every arm", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const campaign = mustPlan({ target, seed: 99, armATrials: 12 });
    premiseHolds(
      "the campaign really spans every arm",
      new Set(campaign.trials.map((t) => t.arm)).size === 3,
    );
    for (const trial of campaign.trials) expect(trial.seed).toBe(99);
    expect(campaign.seed).toBe(99);
  });

  it("planner derives POSITION as prefix length + 1 across a seed sweep and every arm", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    let checked = 0;
    const prefixLengths = new Set<number>();
    for (const seed of [0, 1, 7, 4242, 65535]) {
      for (const trial of mustPlan({ target, seed, armATrials: 12 }).trials) {
        expect(trial.position).toBe(trial.prefix.length + 1);
        prefixLengths.add(trial.prefix.length);
        checked += 1;
      }
    }
    // A constant-position planner passes reproducibility and target-exclusion
    // while binding every verdict to the wrong condition. It is only killed if
    // the sweep actually spans MORE THAN ONE prefix length — otherwise the
    // constant is the correct answer everywhere the assertion looks.
    premise("the sweep spans more than one distinct prefix length", prefixLengths.size, 1);
    premise("the sweep checked a non-empty population of trials", checked, 0);
  });

  it("planner never places the TARGET in its own prefix, across the same sweep", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    let withPrefix = 0;
    for (const seed of [0, 1, 7, 4242, 65535]) {
      for (const trial of mustPlan({ target, seed, armATrials: 12 }).trials) {
        expect(trial.prefix).not.toContain(trial.targetSiteId);
        if (trial.prefix.length > 0) withPrefix += 1;
      }
    }
    // `shuffle(allMutants).slice(0, n)` passes reproducibility while running the
    // target twice; it is only killed where a prefix is actually drawn.
    premise("the sweep produced trials carrying a non-empty prefix", withPrefix, 0);
  });

  it("the gate-order-prefix trial replays the target's generation-order predecessors", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const campaign = mustPlan({ target, seed: 5, armATrials: 12 });
    const gateOrder = campaign.trials.find((t) => t.kind === "gate-order");
    if (gateOrder === undefined) throw new Error("no gate-order trial in the campaign");
    const predecessors = target.mutants.slice(0, target.position - 1).map((m) => siteIdOf(m.site));
    expect(gateOrder.prefix).toEqual(predecessors);
    expect(gateOrder.position).toBe(target.position);
    // The mutants the real gate runs AFTER the target are deliberately absent:
    // putting them before it binds the observation to a condition the gate never
    // produces, which is the wrong-attribution direction the bound forbids.
    const successors = target.mutants.slice(target.position).map((m) => siteIdOf(m.site));
    premise("the target really has successors that must NOT appear", successors.length, 0);
    for (const s of successors) expect(gateOrder.prefix).not.toContain(s);
  });

  it("planner arms match the pre-registered campaign shape of spec 5.2", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const campaign = mustPlan({ target, seed: 5, armATrials: 12 });
    const byArm = (arm: string) => campaign.trials.filter((t) => t.arm === arm);
    expect(byArm("A")).toHaveLength(12);
    expect(byArm("A").every((t) => t.prefix.length === 0)).toBe(true);
    expect(byArm("B")).toHaveLength(6);
    expect(byArm("B").filter((t) => t.prefix.length === 8)).toHaveLength(3);
    expect(byArm("B").filter((t) => t.prefix.length === 24)).toHaveLength(2);
    expect(byArm("B").filter((t) => t.kind === "gate-order")).toHaveLength(1);
    expect(byArm("C")).toHaveLength(2);
    expect(
      byArm("C")
        .map((t) => t.half)
        .sort(),
    ).toEqual(["loaded", "quiet"]);
    expect(byArm("C").every((t) => t.prefix.length === 0)).toBe(true);
  });

  it("the three prefix-8 shuffles are DISTINCT orderings, not one ordering repeated", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const eights = mustPlan({ target, seed: 5, armATrials: 12 }).trials.filter(
      (t) => t.arm === "B" && t.prefix.length === 8,
    );
    premiseHolds("there really are three prefix-8 trials to compare", eights.length === 3);
    const serialized = new Set(eights.map((t) => t.prefix.join(",")));
    expect(serialized.size).toBe(3);
  });

  it("planner REFUSES a prefix length the surface cannot supply", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    // 30 mutants means 29 available once the target is excluded; a prefix of 24
    // fits and a prefix of 40 does not. Silently truncating would report a
    // condition that never ran.
    premiseHolds(
      "the fixture population is genuinely smaller than the requested prefix",
      target.mutants.length - 1 < 40,
    );
    const refusal = planCampaign({ target, seed: 5, armATrials: 12, prefixLengths: [40] });
    expect(inputOf(refusal)).toBe("prefix");
    expect(detailOf(refusal)).toContain("40");
    expect(detailOf(refusal)).toContain(String(target.mutants.length - 1));
  });

  it("validatePlan REFUSES a plan whose prefix contains the target, by name", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const good = mustPlan({ target, seed: 5, armATrials: 12 }).trials.find(
      (t) => t.prefix.length === 8,
    );
    if (good === undefined) throw new Error("no prefix-bearing trial to tamper with");
    const tampered = { ...good, prefix: [...good.prefix.slice(0, 7), good.targetSiteId] };
    const verdict = validatePlan(tampered);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toContain(good.targetSiteId);
    expect(verdict.detail).toMatch(/prefix/i);
  });

  it("validatePlan REFUSES a plan whose POSITION disagrees with the derivation", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    const good = mustPlan({ target, seed: 5, armATrials: 12 }).trials.find(
      (t) => t.prefix.length === 8,
    );
    if (good === undefined) throw new Error("no prefix-bearing trial to tamper with");
    // A VALID plan with position tampered after serialization: a consumer that
    // copies the serialized field adjudicates it, a consumer that derives from
    // the prefix refuses. Producer-side properties cannot reach this — they only
    // ever see planner-generated plans.
    const tampered = { ...good, position: good.position + 1 };
    premiseHolds("the tampered plan is otherwise valid", validatePlan(good).ok);
    const verdict = validatePlan(tampered);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toMatch(/position/i);
    expect(verdict.detail).toContain(String(good.prefix.length + 1));
  });

  it("validatePlan accepts every plan the planner produces, in every arm", () => {
    const target = targetOf([wideSurface()], MIDDLE_SITE);
    let checked = 0;
    for (const seed of [0, 3, 4242]) {
      for (const trial of mustPlan({ target, seed, armATrials: 12 }).trials) {
        const verdict = validatePlan(trial);
        if (!verdict.ok)
          throw new Error(`planner produced a plan its own validator refuses: ${verdict.detail}`);
        checked += 1;
      }
    }
    premise("the acceptance sweep saw a non-empty population", checked, 0);
  });
});

describe("processProbe trial — composition, receipts, stamps, binding (AC-3, AC-8, AC-12, AC-14)", () => {
  const MIDDLE_SITE = "relational-boundary:15:46:<><=";

  const wideTargetOf = (): Target => {
    const outcome = resolveTarget({
      root,
      surfaceId: "wideSurface",
      site: MIDDLE_SITE,
      surfaces: [wideSurface()],
    });
    if (outcome.kind === "refusal") throw new Error(`fixture: ${outcome.detail}`);
    return outcome.target;
  };

  const shortPlan = (over: Partial<TrialPlan> = {}): TrialPlan => {
    const target = wideTargetOf();
    const prefix = target.mutants
      .map((m) => siteIdOf(m.site))
      .filter((id) => id !== MIDDLE_SITE)
      .slice(0, 2);
    return {
      arm: "A",
      kind: "shuffled",
      seed: 11,
      index: 0,
      surfaceId: "wideSurface",
      targetSiteId: MIDDLE_SITE,
      prefix,
      position: prefix.length + 1,
      ...over,
    };
  };

  /**
   * Recording seams. The mutant file is modelled as real bytes so the READ-BACK
   * receipt reads what the writer actually left, which is the whole point of the
   * read-back: a receipt computed from PLANNED text verifies against the parent
   * with no write at all.
   */
  const makeDeps = (over: Partial<TrialDeps> = {}) => {
    const sequence: string[] = [];
    const disk = new Map<string, string>();
    const exitCodes = new Map<string, number>();
    const deps: TrialDeps = {
      writeMutant: (path, text) => {
        sequence.push(`write:${text.length}`);
        disk.set(path, text);
      },
      readBack: (path) => {
        sequence.push("read");
        return Buffer.from(disk.get(path) ?? "", "utf8");
      },
      runMutant: (args) => {
        sequence.push(`run:${args.context}`);
        const code = exitCodes.get(args.context) ?? 0;
        return {
          code,
          executed: args.context,
          children: args.suites.map((suite, i) => ({
            suite,
            kind: "exit" as const,
            exitCode: code,
            // DISTINGUISHABLE per step: a rotation among steps is invisible when
            // every child renders identically.
            durationMs: 100 + sequence.length * 10 + i,
          })),
        };
      },
      stamp: (_root, surface) => {
        sequence.push("stamp:");
        return {
          digest: `stamp-${sequence.length}`,
          files: { [surface.sourcePath]: "aaa" },
          operators: "ops",
          count: 1,
        };
      },
      now: () => 1_700_000_000_000 + sequence.length,
      pid: () => 4242,
      nonce: () => "nonce-from-inside-the-child",
      ...over,
    };
    return { deps, sequence, disk, exitCodes };
  };

  /** Flip one field to a value of the same shape, so the digest probe moves exactly one axis. */
  const perturbField = (step: StepReport, field: string): unknown => {
    const value = (step as unknown as Record<string, unknown>)[field];
    if (typeof value === "string") return `${value}-moved`;
    if (typeof value === "number") return value + 1;
    if (Array.isArray(value)) return value.slice(0, Math.max(0, value.length - 1));
    return value === null ? "moved" : null;
  };

  const mustRunWithRecords = (plan: TrialPlan, deps: TrialDeps, dir: string): TrialReport => {
    const out = runTrial(plan, wideTargetOf(), deps, { recordDir: dir });
    if (out.kind === "refusal") throw new Error(`trial refused: ${out.input} — ${out.detail}`);
    return out.report;
  };

  const mustRun = (plan: TrialPlan, deps: TrialDeps): TrialReport => {
    const out = runTrial(plan, wideTargetOf(), deps);
    if (out.kind === "refusal") throw new Error(`trial refused: ${out.input} — ${out.detail}`);
    return out.report;
  };

  it("trial executes baseline, then the prefix IN PLAN ORDER, then the target", () => {
    const plan = shortPlan();
    const { deps, sequence } = makeDeps();
    const report = mustRun(plan, deps);
    const executed = sequence.filter((s) => s.startsWith("run:")).map((s) => s.slice(4));
    expect(executed).toEqual([`${plan.surfaceId} baseline`, ...plan.prefix, plan.targetSiteId]);
    expect(report.steps.map((s) => s.siteId)).toEqual([
      "<baseline>",
      ...plan.prefix,
      plan.targetSiteId,
    ]);
  });

  it("trial REFUSES a red baseline instead of scoring every mutant against it", () => {
    const plan = shortPlan();
    const { deps, exitCodes } = makeDeps();
    exitCodes.set(`${plan.surfaceId} baseline`, 1);
    const out = runTrial(plan, wideTargetOf(), deps);
    expect(inputOf(out)).toBe("baseline");
    expect(detailOf(out)).toMatch(/baseline/i);
  });

  it("trial REFUSES a plan whose prefix contains the target, at consumption", () => {
    const plan = shortPlan();
    const tampered = { ...plan, prefix: [...plan.prefix, plan.targetSiteId], position: 4 };
    const { deps } = makeDeps();
    const out = runTrial(tampered, wideTargetOf(), deps);
    expect(inputOf(out)).toBe("plan");
    expect(detailOf(out)).toContain(plan.targetSiteId);
  });

  it("trial REFUSES a plan whose POSITION was tampered after serialization", () => {
    const plan = shortPlan();
    // A VALID plan, position incremented. A consumer that copies the serialized
    // field adjudicates it; one that re-derives refuses. This is the plan's r5
    // residual, and the fixture is the one it names.
    const tampered = { ...plan, position: plan.position + 1 };
    const { deps } = makeDeps();
    premiseHolds("the untampered plan really is accepted", validatePlan(plan).ok);
    const out = runTrial(tampered, wideTargetOf(), deps);
    expect(inputOf(out)).toBe("plan");
    expect(detailOf(out)).toMatch(/position/i);
    expect(detailOf(out)).toContain(String(plan.prefix.length + 1));
  });

  it("trial stamps BEFORE the first spawn and AFTER the last exit, proven by call order", () => {
    const plan = shortPlan();
    const { deps, sequence } = makeDeps();
    mustRun(plan, deps);
    const stampIndices = sequence.flatMap((s, i) => (s.startsWith("stamp:") ? [i] : []));
    const runIndices = sequence.flatMap((s, i) => (s.startsWith("run:") ? [i] : []));
    premiseHolds(
      "both stamps and at least one run were observed",
      stampIndices.length === 2 && runIndices.length > 0,
    );
    expect(Math.min(...stampIndices)).toBeLessThan(Math.min(...runIndices));
    expect(Math.max(...stampIndices)).toBeGreaterThan(Math.max(...runIndices));
  });

  it("trial surfaces a MID-TRIAL edit to a declared input as inputsMoved", () => {
    const plan = shortPlan();
    let stampCall = 0;
    const { deps } = makeDeps({
      stamp: (_root, surface) => {
        stampCall += 1;
        void 0;
        // The declared input moves BETWEEN the two stamps. An implementation
        // taking both consecutively before execution reports them identical
        // here and adjudicates — that is the kill.
        return {
          digest: stampCall === 1 ? "before-digest" : "after-digest",
          files: { [surface.sourcePath]: stampCall === 1 ? "aaa" : "bbb" },
          operators: "ops",
          count: 1,
        };
      },
    });
    const report = mustRun(plan, deps);
    expect(report.inputsMoved).toContain(wideSurface().sourcePath);
    expect(report.attributable).toBe(false);
  });

  it("trial with the WRITER elided is REFUSED, naming the site whose read-back is the ORIGINAL", () => {
    const plan = shortPlan();
    const { deps, disk } = makeDeps({ writeMutant: () => {} });
    // The file holds the ORIGINAL source, as it would after a baseline write
    // that the elided writer then never replaced.
    const target = wideTargetOf();
    disk.set(MUTANT_FILE_NAME, target.sourceText);
    const out = runTrial(plan, target, { ...deps, writeMutant: () => {} });
    expect(inputOf(out)).toBe("receipt");
    expect(detailOf(out)).toContain(plan.prefix[0] as string);
    expect(detailOf(out)).toMatch(/original/i);
  });

  it("trial EXCLUDES an infra-faulted step and reports it by name", () => {
    const plan = shortPlan();
    const faultingSite = plan.prefix[1] as string;
    const { deps } = makeDeps();
    const out = runTrial(plan, wideTargetOf(), {
      ...deps,
      runMutant: (args) => {
        if (args.context === faultingSite) {
          throw new MutantRunInfraError(args.context, "SIGTERM", undefined);
        }
        return deps.runMutant(args);
      },
    });
    if (out.kind === "refusal") throw new Error(`unexpected refusal: ${out.detail}`);
    expect(out.report.infraFaults).toContain(faultingSite);
    expect(out.report.steps.map((s) => s.siteId)).not.toContain(faultingSite);
    expect(out.report.completed).toBe(false);
  });

  it("trial whole-entry round-trip binds siteId, receipt, verdict and children per step", () => {
    const plan = shortPlan();
    const { deps } = makeDeps();
    const report = mustRun(plan, deps);
    const durations = report.steps.flatMap((s) => s.children.map((c) => c.durationMs));
    premise(
      "the fixture's children are DISTINGUISHABLE, so a rotation is observable",
      new Set(durations).size,
      1,
    );
    const roundTripped = JSON.parse(JSON.stringify(report)) as TrialReport;
    expect(roundTripped.steps).toEqual(report.steps);
    expect(verifyTrialReport(roundTripped, wideTargetOf()).ok).toBe(true);
  });

  it("trial ROTATION of child arrays among steps is REFUSED, naming the first mis-bound step", () => {
    const plan = shortPlan();
    const { deps } = makeDeps();
    const report = mustRun(plan, deps);
    const steps = report.steps.map((s) => ({ ...s }));
    premise("there are enough steps for a rotation to move anything", steps.length, 2);
    const rotated = steps.map((s, i) => ({
      ...s,
      children: (steps[(i + 1) % steps.length] as StepReport).children,
    }));
    const verdict = verifyTrialReport({ ...report, steps: rotated }, wideTargetOf());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toContain(steps[0]!.siteId);
  });

  it("trial step digest moves when ANY field of the step entry moves", () => {
    const plan = shortPlan();
    const { deps } = makeDeps();
    const report = mustRun(plan, deps);
    const step = report.steps.at(-1) as StepReport;
    const fields = digestedFieldsOf(step);
    premise("the digest reads more than one field", fields.length, 1);
    for (const field of fields) {
      const moved = { ...step, [field]: perturbField(step, field) };
      expect(stepDigest(moved)).not.toBe(stepDigest(step));
    }
  });

  it("trial detects an EXECUTOR that runs a different order than planned", () => {
    const plan = shortPlan();
    const { deps } = makeDeps();
    const reversed = [...plan.prefix].reverse();
    let i = -1;
    const out = runTrial(plan, wideTargetOf(), {
      ...deps,
      runMutant: (args) => {
        // The seam deliberately re-labels execution: an ordinary planner or
        // executor bug shuffles the receipts WITH the execution, and the seam is
        // the only place a shuffle invisible in the output can be observed.
        i += 1;
        const relabelled = i === 0 ? args.context : (reversed[i - 1] ?? args.context);
        return deps.runMutant({ ...args, context: relabelled });
      },
    });
    expect(inputOf(out)).toBe("order");
    expect(detailOf(out)).toMatch(/plan|executed/i);
  });

  it("trial records land ONLY in the redirected record directory (AC-6, in-process)", () => {
    const plan = shortPlan();
    const written: { dir: string }[] = [];
    const { deps } = makeDeps();
    const redirect = join(root, "campaign-records");
    mustRunWithRecords(
      plan,
      { ...deps, writeRecord: (_r, dir) => written.push({ dir }) },
      redirect,
    );
    premiseHolds(
      "at least one record was written, so the isolation claim has a subject",
      written.length > 0,
    );
    for (const w of written) expect(w.dir).toBe(redirect);
    expect(written.some((w) => w.dir === DEFAULT_RECORD_DIR)).toBe(false);
  });
});

describe("processProbe trial provenance — two independent sides (AC-2, AC-3)", () => {
  const MIDDLE_SITE = "relational-boundary:15:46:<><=";
  const wideTargetOf = (): Target => {
    const outcome = resolveTarget({
      root,
      surfaceId: "wideSurface",
      site: MIDDLE_SITE,
      surfaces: [wideSurface()],
    });
    if (outcome.kind === "refusal") throw new Error(`fixture: ${outcome.detail}`);
    return outcome.target;
  };

  /** A real report, produced by the real `runTrial` against seams. */
  const realReport = (): TrialReport => {
    const target = wideTargetOf();
    const prefix = target.mutants
      .map((m) => siteIdOf(m.site))
      .filter((id) => id !== MIDDLE_SITE)
      .slice(0, 2);
    const plan: TrialPlan = {
      arm: "A",
      kind: "shuffled",
      seed: 11,
      index: 0,
      surfaceId: "wideSurface",
      targetSiteId: MIDDLE_SITE,
      prefix,
      position: prefix.length + 1,
    };
    const disk = new Map<string, string>();
    const out = runTrial(plan, target, {
      writeMutant: (path, text) => disk.set(path, text),
      readBack: (path) => Buffer.from(disk.get(path) ?? "", "utf8"),
      runMutant: (args) => ({
        code: 0,
        executed: args.context,
        children: args.suites.map((suite, i) => ({
          suite,
          kind: "exit" as const,
          exitCode: 0,
          durationMs: 100 + disk.size * 10 + i,
        })),
      }),
      stamp: (_r, surface) => ({
        digest: "d",
        files: { [surface.sourcePath]: "aaa" },
        operators: "ops",
        count: 1,
      }),
      now: () => 1_700_000_000_000,
      pid: () => 5150,
      nonce: () => "child-minted-3f8a91",
    });
    if (out.kind === "refusal") throw new Error(`fixture trial refused: ${out.detail}`);
    return out.report;
  };

  /**
   * `pid` is a REQUIRED positional here rather than a defaulted one: an explicit
   * `undefined` selects a default parameter, so the no-pid fixture would have
   * silently tested the honest path.
   */
  const parentDepsWithPid = (report: TrialReport, pid: number | undefined) => ({
    spawnChild: () => ({ pid, reportPath: "/tmp/report.json" }),
    readReportBytes: () => Buffer.from(JSON.stringify(report), "utf8"),
  });
  const parentDepsFor = (report: TrialReport) => parentDepsWithPid(report, report.childPid);

  const REQUEST = {
    argv: ["--plan", "/tmp/plan.json"],
    env: { MUTATION_RECORD_DIR: "/tmp/campaign" },
    cwd: "/tmp/trial-scratch-0001",
  };

  it("trial observation binds the parent-observed pid to the child-reported one", () => {
    const report = realReport();
    const out = observeTrial(report.plan, wideTargetOf(), parentDepsFor(report), REQUEST);
    if (out.kind === "refusal") throw new Error(`unexpected refusal: ${out.detail}`);
    expect(out.observation.parentPid).toBe(report.childPid);
  });

  it("trial with a LYING child pid produces the pid-DISAGREEMENT refusal", () => {
    const report = realReport();
    premiseHolds(
      "the honest pair really is accepted",
      observeTrial(report.plan, wideTargetOf(), parentDepsFor(report), REQUEST).kind ===
        "observation",
    );
    // The parent's spawn handle says one thing, the child's report another. An
    // implementation that copies the child-reported pid into the parent-observed
    // field can never see a disagreement — that is the kill.
    const out = observeTrial(report.plan, wideTargetOf(), parentDepsWithPid(report, 9999), REQUEST);
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toContain("9999");
    expect(detailOf(out)).toContain(String(report.childPid));
  });

  it("trial refuses a spawn that produced NO pid at all", () => {
    const report = realReport();
    const out = observeTrial(
      report.plan,
      wideTargetOf(),
      parentDepsWithPid(report, undefined),
      REQUEST,
    );
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toMatch(/no pid/i);
  });

  it("trial nonce is READ OUT OF the bytes the child wrote, not from any other channel", () => {
    const report = realReport();
    // The bytes on disk carry a DIFFERENT nonce than the in-memory report the
    // caller happens to hold. Whatever the observation reports is the value it
    // actually sourced. "The nonce occurs in the child's bytes" cannot be
    // checked at runtime here — it holds by construction — so this asserts the
    // sourcing itself, which is the property that check was standing in for.
    const onDisk = { ...report, nonce: "written-by-the-child-a91f" };
    const deps = {
      spawnChild: () => ({ pid: report.childPid, reportPath: "/tmp/report.json" }),
      readReportBytes: () => Buffer.from(JSON.stringify(onDisk), "utf8"),
    };
    premiseHolds(
      "the two nonces really differ, so the sourcing is observable",
      onDisk.nonce !== report.nonce,
    );
    const out = observeTrial(report.plan, wideTargetOf(), deps, REQUEST);
    if (out.kind === "refusal") throw new Error(`unexpected refusal: ${out.detail}`);
    expect(out.observation.report.nonce).toBe(onDisk.nonce);
    expect(out.observation.report.nonce).not.toBe(report.nonce);
  });

  it("trial with a child reporting NO nonce is refused", () => {
    const report = realReport();
    const deps = {
      spawnChild: () => ({ pid: report.childPid, reportPath: "/tmp/report.json" }),
      readReportBytes: () => Buffer.from(JSON.stringify({ ...report, nonce: "  " }), "utf8"),
    };
    const out = observeTrial(report.plan, wideTargetOf(), deps, REQUEST);
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toMatch(/no nonce/i);
  });

  it.each(["plan", "argv", "env", "cwd"])(
    "trial refuses a nonce the parent could have passed through the %s channel",
    (channel) => {
      const report = realReport();
      const nonce = report.nonce;
      // Each channel is polluted in turn. The sweep is DERIVED from the request's
      // own keys, so this table and the implementation cannot drift apart — the
      // case below asserts exactly that.
      const request = {
        argv: channel === "argv" ? ["--plan", nonce] : REQUEST.argv,
        env: channel === "env" ? { SCRATCH: nonce } : REQUEST.env,
        cwd: channel === "cwd" ? `/tmp/${nonce}` : REQUEST.cwd,
      };
      const plan = channel === "plan" ? { ...report.plan, targetSiteId: nonce } : report.plan;
      const out = observeTrial(plan, wideTargetOf(), parentDepsFor(report), request);
      expect(inputOf(out)).toBe("provenance");
      expect(detailOf(out)).toContain(channel);
    },
  );

  it("the nonce sweep's channel list is DERIVED from the spawn request's own keys", () => {
    const report = realReport();
    const request = { plan: report.plan, ...REQUEST };
    const swept = spawnChannels(request).map((c) => c.channel);
    // Not an enumeration: whatever keys the request carries are what gets swept,
    // so a channel added later joins by existing.
    expect(swept).toEqual(Object.keys(request).sort());
    premise("the request really carries more than one channel", swept.length, 1);
  });

  it("trial report with a WRONG receipt sha is refused, naming the step", () => {
    const report = realReport();
    const steps = report.steps.map((s) => ({ ...s }));
    const tamperedStep = { ...(steps[1] as StepReport), receiptSha: "00".repeat(32) };
    steps[1] = { ...tamperedStep, digest: stepDigest(tamperedStep) };
    const verdict = verifyTrialReport({ ...report, steps }, wideTargetOf());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toContain(steps[1]!.siteId);
    expect(verdict.input).toBe("receipt");
  });

  it("trial report naming the WRONG site at a step is refused", () => {
    const report = realReport();
    const steps = report.steps.map((s) => ({ ...s }));
    const other = wideTargetOf()
      .mutants.map((m) => siteIdOf(m.site))
      .find((id) => !report.steps.some((s) => s.siteId === id)) as string;
    premiseHolds("a site outside this trial's own steps exists to substitute", other !== undefined);
    const tamperedStep = { ...(steps[1] as StepReport), siteId: other };
    steps[1] = { ...tamperedStep, digest: stepDigest(tamperedStep) };
    const verdict = verifyTrialReport({ ...report, steps }, wideTargetOf());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toContain(other);
  });

  it("trial report MISSING a receipt step is refused, naming the shortfall", () => {
    const report = realReport();
    const steps = report.steps.slice(0, -1);
    premise("dropping a step really shortened the report", report.steps.length, steps.length);
    const verdict = verifyTrialReport({ ...report, steps }, wideTargetOf());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toMatch(/steps where the plan implies/);
  });

  it("trial report that is INTACT verifies — the refusals above are not vacuous", () => {
    const report = realReport();
    expect(verifyTrialReport(report, wideTargetOf())).toEqual({ ok: true });
  });
});

describe("processProbe aggregator — eligibility, derived claims, render (AC-7, AC-8, AC-10, AC-12, AC-16)", () => {
  const MIDDLE_SITE = "relational-boundary:15:46:<><=";
  let nonceCounter = 0;
  const fakeTrial = (
    over: {
      arm?: Arm;
      index?: number;
      verdict?: "KILLED" | "SURVIVED";
      stamp?: string;
      stampAfter?: string;
      completed?: boolean;
      half?: "quiet" | "loaded";
      window?: { spawnedAt: number; exitedAt: number };
      samples?: { at: number; loadAvg1: number }[];
      pidSkew?: number;
      nonce?: string;
    } = {},
  ): CampaignTrial => {
    nonceCounter += 1;
    const arm = over.arm ?? "A";
    const index = over.index ?? 0;
    const stamp = over.stamp ?? "anchor-digest";
    const window = over.window ?? { spawnedAt: 1_000, exitedAt: 2_000 };
    const plan: TrialPlan = {
      arm,
      kind: "isolated",
      seed: 7,
      index,
      surfaceId: "wideSurface",
      targetSiteId: MIDDLE_SITE,
      prefix: [],
      position: 1,
      ...(over.half === undefined ? {} : { half: over.half }),
    };
    const stampOf = (digest: string) => ({
      digest,
      files: { "wide.ts": digest },
      operators: "ops",
      count: 1,
    });
    const completed = over.completed ?? true;
    const step: StepReport = {
      siteId: MIDDLE_SITE,
      role: "target",
      receiptSha: "sha",
      exitCode: over.verdict === "KILLED" ? 1 : 0,
      verdict: over.verdict ?? "SURVIVED",
      children: [{ suite: "s", kind: "exit", exitCode: 0, durationMs: 10 }],
      digest: "d",
    };
    const report: TrialReport = {
      plan,
      childPid: 1000 + nonceCounter,
      nonce: over.nonce ?? `nonce-${nonceCounter}`,
      steps: completed ? [step] : [],
      stampBefore: stampOf(stamp),
      stampAfter: stampOf(over.stampAfter ?? stamp),
      inputsMoved: over.stampAfter !== undefined && over.stampAfter !== stamp ? ["wide.ts"] : [],
      attributable: over.stampAfter === undefined || over.stampAfter === stamp,
      completed,
      infraFaults: completed ? [] : ["some-site"],
      window,
    };
    return {
      observation: {
        plan,
        parentPid: 1000 + nonceCounter + (over.pidSkew ?? 0),
        report,
      },
      ...(over.samples === undefined ? {} : { loadSamples: over.samples }),
    };
  };

  const mustAggregate = (input: Parameters<typeof aggregateCampaign>[0]): CampaignAggregate => {
    const out = aggregateCampaign(input);
    if (out.kind !== "aggregate")
      throw new Error(`aggregate refused: ${out.input} — ${out.detail}`);
    return out;
  };

  it("aggregator bound is recomputed over the ELIGIBLE N, not the planned one", () => {
    // 11 of 12 completed: the ACs expressly permit this state, and the claimed
    // bound must follow the eligible population rather than the plan.
    expect(oneSidedBound(12)).toEqual({ ok: true, bound: expect.closeTo(0.2209, 4) });
    expect(oneSidedBound(11)).toEqual({ ok: true, bound: expect.closeTo(0.2384, 4) });
    expect(oneSidedBound(6)).toEqual({ ok: true, bound: expect.closeTo(0.393, 4) });
  });

  it("aggregator REFUSES a bound over ZERO eligible rather than evaluating the formula", () => {
    const zero = oneSidedBound(0);
    expect(zero.ok).toBe(false);
    if (zero.ok) return;
    expect(zero.detail).toMatch(/p > 1\.0|impossible/i);
    // The kill: an implementation evaluating the formula for every N returns 1
    // here and renders `p > 1.0` with full confidence.
    expect(1 - Math.pow(0.05, 1 / 0)).toBe(1);
  });

  it("aggregator excludes an INTERNALLY mismatched stamp pair as unattributable", () => {
    const trials = [
      fakeTrial({ index: 0 }),
      fakeTrial({ index: 1, stampAfter: "moved-digest" }),
      fakeTrial({ index: 2 }),
    ];
    const agg = mustAggregate({ plannedPerArm: { A: 3 }, trials });
    const armA = agg.arms.find((a) => a.arm === "A") as ArmSummary;
    expect(armA.eligible).toBe(2);
    expect(armA.excluded.map((e) => e.trial)).toEqual(["A#1"]);
    expect(armA.excluded[0]!.reason).toMatch(/UNATTRIBUTABLE/);
  });

  it("aggregator excludes an internally-STABLE trial whose stamp differs from the anchor", () => {
    // Both pairs are internally identical; the two trials measured DIFFERENT
    // programs. Per-trial stability is not cross-trial identity.
    const trials = [
      fakeTrial({ index: 0, stamp: "anchor-digest" }),
      fakeTrial({ index: 1, stamp: "other-digest" }),
    ];
    const agg = mustAggregate({ plannedPerArm: { A: 2 }, trials });
    const armA = agg.arms.find((a) => a.arm === "A") as ArmSummary;
    expect(armA.eligible).toBe(1);
    expect(armA.excluded[0]!.reason).toContain("other-digest");
    expect(armA.excluded[0]!.reason).toContain("anchor-digest");
  });

  it("aggregator REFUSES an ALL-faulting population instead of printing a distribution", () => {
    const out = aggregateCampaign({
      plannedPerArm: { A: 2 },
      trials: [
        fakeTrial({ index: 0, completed: false }),
        fakeTrial({ index: 1, completed: false }),
      ],
    });
    expect(inputOf(out)).toBe("population");
    expect(renderCampaign(out)).not.toMatch(/\d+ of \d+/);
  });

  it("aggregator REFUSES duplicate nonces across trials", () => {
    const out = aggregateCampaign({
      plannedPerArm: { A: 2 },
      trials: [
        fakeTrial({ index: 0, nonce: "same-nonce" }),
        fakeTrial({ index: 1, nonce: "same-nonce" }),
      ],
    });
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toContain("same-nonce");
  });

  it("aggregator REFUSES a trial whose two pid observations disagree", () => {
    const out = aggregateCampaign({
      plannedPerArm: { A: 1 },
      trials: [fakeTrial({ index: 0, pidSkew: 5 })],
    });
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toMatch(/pid/i);
  });

  it("aggregator REFUSES a condition serialization missing ANY field it reads", () => {
    const full = conditionOf(fakeTrial()) as unknown as Record<string, unknown>;
    premise("the condition tuple carries more than one field", REQUIRED_CONDITION_FIELDS.length, 1);
    for (const field of REQUIRED_CONDITION_FIELDS) {
      const dropped = { ...full };
      delete dropped[field];
      const verdict = validateCondition(dropped);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.detail).toContain(field);
    }
    expect(validateCondition(full)).toEqual({ ok: true });
  });

  it("aggregator condition field list is DERIVED from the builder, not enumerated", () => {
    expect(REQUIRED_CONDITION_FIELDS).toEqual(Object.keys(conditionOf(fakeTrial())).sort());
  });

  it("aggregator load pair adjudicates only on IN-WINDOW samples", () => {
    const window = { spawnedAt: 1_000, exitedAt: 2_000 };
    const quiet = fakeTrial({
      arm: "C",
      index: 0,
      half: "quiet",
      window,
      samples: [
        { at: 1_100, loadAvg1: 1.0 },
        { at: 1_500, loadAvg1: 1.2 },
      ],
    });
    const loaded = fakeTrial({
      arm: "C",
      index: 1,
      half: "loaded",
      window,
      samples: [
        { at: 1_100, loadAvg1: 9.0 },
        { at: 1_500, loadAvg1: 9.4 },
      ],
    });
    const agg = mustAggregate({ plannedPerArm: { C: 2 }, trials: [quiet, loaded] });
    expect(agg.load.kind).toBe("adjudicated");
  });

  it("aggregator REFUSES a loaded half whose samples all fall OUTSIDE its window", () => {
    const window = { spawnedAt: 1_000, exitedAt: 2_000 };
    const quiet = fakeTrial({
      arm: "C",
      index: 0,
      half: "quiet",
      window,
      samples: [
        { at: 1_100, loadAvg1: 1.0 },
        { at: 1_500, loadAvg1: 1.2 },
      ],
    });
    // Both margins would PASS on these numbers; every sample is out of window.
    const loaded = fakeTrial({
      arm: "C",
      index: 1,
      half: "loaded",
      window,
      samples: [
        { at: 9_000, loadAvg1: 9.0 },
        { at: 9_500, loadAvg1: 9.4 },
      ],
    });
    const agg = mustAggregate({ plannedPerArm: { C: 2 }, trials: [quiet, loaded] });
    expect(agg.load.kind).toBe("refused");
    if (agg.load.kind !== "refused") return;
    expect(agg.load.detail).toMatch(/in-window/i);
    expect(agg.load.detail).toContain("loaded 0");
  });

  it.each([
    { label: "ratio fails, absolute holds", quiet: 5.0, loaded: 8.0 },
    { label: "absolute fails, ratio holds", quiet: 0.5, loaded: 1.4 },
  ])("aggregator REFUSES the load pair when $label", ({ quiet: q, loaded: l }) => {
    const window = { spawnedAt: 1_000, exitedAt: 2_000 };
    const mk = (half: "quiet" | "loaded", v: number, index: number) =>
      fakeTrial({
        arm: "C",
        index,
        half,
        window,
        samples: [
          { at: 1_100, loadAvg1: v },
          { at: 1_500, loadAvg1: v },
        ],
      });
    const agg = mustAggregate({
      plannedPerArm: { C: 2 },
      trials: [mk("quiet", q, 0), mk("loaded", l, 1)],
    });
    expect(agg.load.kind).toBe("refused");
    if (agg.load.kind !== "refused") return;
    expect(agg.load.detail).toMatch(/ratio .* is (true|false)/);
    expect(agg.load.detail).toMatch(/absolute .* is (true|false)/);
  });

  it("aggregator load margins are the pre-registered literals of spec 5.2", () => {
    expect(LOAD_RATIO_MIN).toBe(2);
    expect(LOAD_ABSOLUTE_MIN).toBe(2.0);
    expect(MIN_IN_WINDOW_SAMPLES).toBe(2);
    expect(ALPHA).toBe(0.05);
  });

  it("aggregator REFUSES a cross-stamp load pair, naming BOTH digests", () => {
    const window = { spawnedAt: 1_000, exitedAt: 2_000 };
    const mk = (half: "quiet" | "loaded", v: number, stamp: string, index: number) =>
      fakeTrial({
        arm: "C",
        index,
        half,
        window,
        stamp,
        samples: [
          { at: 1_100, loadAvg1: v },
          { at: 1_500, loadAvg1: v },
        ],
      });
    // Margins pass comfortably; the halves measured different programs.
    const agg = aggregateCampaign({
      plannedPerArm: { C: 2 },
      trials: [mk("quiet", 1.0, "anchor-digest", 0), mk("loaded", 9.0, "other-digest", 1)],
    });
    if (agg.kind !== "aggregate") throw new Error(`unexpected refusal: ${agg.detail}`);
    expect(agg.load.kind).toBe("refused");
    if (agg.load.kind !== "refused") return;
    expect(agg.load.detail).toContain("anchor-digest");
    expect(agg.load.detail).toContain("other-digest");
  });

  it("render carries a POPULATION SIZE beside every aggregate and names its statistic", () => {
    const trials = Array.from({ length: 11 }, (_, i) => fakeTrial({ index: i }));
    const agg = mustAggregate({ plannedPerArm: { A: 12 }, trials });
    const text = renderCampaign(agg);
    expect(text).toContain("11 of 12");
    expect(text).toMatch(/one-sided/i);
    expect(text).toContain("0.2384");
    // The planned bound must NOT appear: quoting it over a permitted partial
    // state is the literal-closeout weaker implementation.
    expect(text).not.toContain("0.2209");
  });

  it("render REFUSES exclusion vocabulary on every path", () => {
    const trials = Array.from({ length: 11 }, (_, i) => fakeTrial({ index: i }));
    const rendered = [
      renderCampaign(mustAggregate({ plannedPerArm: { A: 12 }, trials })),
      renderCampaign(
        aggregateCampaign({
          plannedPerArm: { A: 1 },
          trials: [fakeTrial({ completed: false })],
        }),
      ),
    ];
    for (const text of rendered) {
      const prose = stripRenderComments(text);
      for (const banned of ["closed", "ruled out", "eliminated"]) {
        expect(prose.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it("render emits NO graduation text while ANY arm is at zero eligible, naming the arm", () => {
    // Arm A is healthy; arm B produced trials that were all excluded. An arm at
    // zero eligible DID NOT RUN — classifying the campaign NULL on the other
    // arms' quiet certifies a bound with nothing behind it.
    const trials = [
      ...Array.from({ length: 12 }, (_, i) => fakeTrial({ index: i })),
      fakeTrial({ arm: "B", index: 0, stamp: "other-digest" }),
    ];
    const agg = mustAggregate({ plannedPerArm: { A: 12, B: 6 }, trials });
    const armB = agg.arms.find((a) => a.arm === "B") as ArmSummary;
    premiseHolds(
      "arm B really is at zero eligible, so the refusal has a subject",
      armB.eligible === 0,
    );
    const text = renderCampaign(agg);
    expect(text).toContain("0 eligible of 6 planned");
    expect(text).toMatch(/GRADUATION: REFUSED/);
    expect(text).toContain("B");
    // Both directions: the refusal is PRESENT and the graduation text ABSENT. A
    // renderer that refuses the arm's NUMBER while still emitting the NULL
    // graduation certifies a bound that does not exist.
    expect(text).not.toMatch(/local branch bounded/i);
    expect(text).not.toMatch(/BRANCH NULL/);
  });

  it("render emits the graduation reading once every arm has a nonzero eligible population", () => {
    const trials = [
      ...Array.from({ length: 12 }, (_, i) => fakeTrial({ index: i })),
      ...Array.from({ length: 6 }, (_, i) => fakeTrial({ arm: "B", index: i })),
      fakeTrial({ arm: "C", index: 0, half: "quiet" }),
      fakeTrial({ arm: "C", index: 1, half: "loaded" }),
    ];
    const agg = mustAggregate({ plannedPerArm: { A: 12, B: 6, C: 2 }, trials });
    premiseHolds(
      "every arm really is nonzero-eligible",
      agg.arms.every((a) => a.eligible > 0),
    );
    const text = renderCampaign(agg);
    expect(text).toMatch(/BRANCH NULL/);
    expect(text).not.toMatch(/GRADUATION: REFUSED/);
  });

  it("render reports the load column as unchanged at one when the pair is refused", () => {
    const trials = [
      ...Array.from({ length: 12 }, (_, i) => fakeTrial({ index: i })),
      ...Array.from({ length: 6 }, (_, i) => fakeTrial({ arm: "B", index: i })),
      fakeTrial({ arm: "C", index: 0, half: "quiet" }),
      fakeTrial({ arm: "C", index: 1, half: "loaded" }),
    ];
    const agg = mustAggregate({ plannedPerArm: { A: 12, B: 6, C: 2 }, trials });
    premiseHolds("the pair really is refused (no samples supplied)", agg.load.kind === "refused");
    const text = renderCampaign(agg);
    expect(text).toContain("load column unchanged at one");
    expect(text).not.toMatch(/load column .* two/i);
  });

  it("render carries the SEED and the condition of every trial", () => {
    const trials = [fakeTrial({ index: 0 }), fakeTrial({ arm: "B", index: 0 })];
    const agg = mustAggregate({ plannedPerArm: { A: 1, B: 1 }, trials });
    const text = renderCampaign(agg);
    expect(text).toContain("seed 7");
  });

  it("aggregator reconciles produced against planned and reports the shortfall", () => {
    const trials = Array.from({ length: 9 }, (_, i) => fakeTrial({ index: i }));
    const agg = mustAggregate({ plannedPerArm: { A: 12 }, trials });
    const armA = agg.arms.find((a) => a.arm === "A") as ArmSummary;
    expect(armA.produced).toBe(9);
    expect(armA.planned).toBe(12);
    expect(renderCampaign(agg)).toContain("9 of 12");
  });
});

describe("processProbe control surface — the manufactured correlated mechanism (AC-4)", () => {
  const scopeDir = (name: string): string => join(root, `state-${name}`);

  /** One trial's observation sequence: the green-baseline run, then the mutant run. */
  const runTrialInScope = (scope: string): { index: number; active: boolean }[] =>
    Array.from({ length: RUNS_PER_TRIAL }, () => {
      const { index } = observeRun({ [STATE_DIR_ENV]: scope });
      return { index, active: boundaryCheckActive(index) };
    });

  it("control mechanism REFUSES to run with no scope, rather than behaving like a fresh one", () => {
    expect(() => observeRun({})).toThrow(new RegExp(STATE_DIR_ENV));
  });

  it("control flips at the AUTHORED index, and the rule that decides is the run index", () => {
    const scope = scopeDir("authored");
    const observed = Array.from({ length: 6 }, () => {
      const { index } = observeRun({ [STATE_DIR_ENV]: scope });
      return { index, active: boundaryCheckActive(index) };
    });
    expect(observed.map((o) => o.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(observed.filter((o) => o.active).map((o) => o.index)).toEqual([FLIP_AT_RUN, 6]);
  });

  it("control in a SHARED scope reaches the flip on trial 3, baseline consumption included", () => {
    const scope = scopeDir("shared");
    const trials = [runTrialInScope(scope), runTrialInScope(scope), runTrialInScope(scope)];
    // The rule deciding each observation is named: trials 1 and 2 are decided by
    // an index BELOW the flip; trial 3's target is decided by the index reaching
    // it. The baseline at index 5 is also past the flip and stays GREEN, because
    // the boundary holds on unmutated source — a flip caused by baseline
    // consumption would prove the wrong thing while rendering the same verdicts.
    expect(trials[0]!.map((o) => o.active)).toEqual([false, false]);
    expect(trials[1]!.map((o) => o.active)).toEqual([false, false]);
    expect(trials[2]!.map((o) => o.index)).toEqual([5, 6]);
    expect(trials[2]!.map((o) => o.active)).toEqual([true, true]);
    premiseHolds(
      "the flip lands on a TARGET run, not only on a baseline run",
      trials[2]![1]!.active,
    );
  });

  it("control in a FRESH scope per trial never reaches the flip index", () => {
    const observed = [1, 2, 3, 4, 5].map((i) => runTrialInScope(scopeDir(`fresh-${i}`)));
    for (const trial of observed) {
      expect(trial.map((o) => o.index)).toEqual([1, 2]);
      expect(trial.map((o) => o.active)).toEqual([false, false]);
    }
    premise(
      "more trials were run fresh than the flip index needs in one scope",
      observed.length,
      FLIP_AT_RUN - 1,
    );
  });

  it("control surface generates exactly the two authored sites, one per deciding suite", () => {
    const outcome = resolveTarget({
      root: process.cwd(),
      surfaceId: CONTROL_SURFACE.id,
      site: "no-such-site",
      surfaces: [CONTROL_SURFACE],
    });
    expect(inputOf(outcome)).toBe("site");
    // The refusal lists what IS available; two sites, and the detail names them.
    expect(detailOf(outcome)).toContain("generates 2 mutants");
  });

  it("control's deterministic mutant is the one suite 1 decides, by bytes alone", () => {
    const surfaceSource = readFileSync(CONTROL_SURFACE.sourcePath, "utf8");
    const gen = generateMutants(
      CONTROL_SURFACE.sourcePath,
      surfaceSource,
      CONTROL_SURFACE.operators,
    );
    const always = gen.mutants.find((m) => m.text.includes("n <= 100"));
    if (always === undefined) throw new Error("no `always` mutant generated");
    expect(always.text).toContain("n <= 100");
    // Suite 1 pins `always(100) === false`, which the mutant makes true — killed
    // by suite bytes alone, with no state dependence on that path.
    const suite1 = readFileSync(CONTROL_SURFACE.suitePaths[0] as string, "utf8");
    expect(suite1).toContain("always(100)");
    expect(suite1).not.toContain("gate(");
  });

  it("control's state mechanism lives in suite 2 ONLY", () => {
    const suite1 = readFileSync(CONTROL_SURFACE.suitePaths[0] as string, "utf8");
    const suite2 = readFileSync(CONTROL_SURFACE.suitePaths[1] as string, "utf8");
    expect(suite1).not.toContain("observeRun");
    expect(suite2).toContain("observeRun");
    // A first-suite-only reimplementation runs suite 1 and reports this control
    // STABLE in both configurations, because the mechanism lives in the suite it
    // never runs.
    expect(suite2).toContain("gate(3)");
  });
});
