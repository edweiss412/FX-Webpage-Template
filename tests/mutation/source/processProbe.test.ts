import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../../_shared/premise";
import { CONTROL_SURFACE } from "./fixtures/processProbe/surface";
import type { InputStamp } from "./determinism";
import type { Verdict } from "./oracle";

import {
  FLIP_AT_RUN,
  RUNS_PER_TRIAL,
  STATE_DIR_ENV,
  boundaryCheckActive,
  observeRun,
} from "./fixtures/processProbe/state";
import { generateMutants } from "./generate";
import { campaignVerdict } from "../../../scripts/intraleg-campaign";
import {
  CLI_DEFAULT_DEPS,
  CLI_EXIT_OK,
  CLI_EXIT_REFUSED,
  type CliDeps,
  main as cliMain,
} from "../../../scripts/mutation-process-probe";
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
  ARM_B_PREFIX_LENGTHS,
  ARMS,
  type Arm,
  BASELINE_STEP,
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
  digestedFieldsOfReport,
  makeParentDeps,
  observeTrial,
  oneSidedBound,
  planCampaign,
  renderCampaign,
  renderProbe,
  reportDigest,
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
    // The seams RECORD what they were handed. A seam that ignores its arguments
    // cannot see a caller passing the wrong ones, and that is precisely how a
    // doubled path — the source's own directory used as the repo root — reached
    // the live tier untouched by 136 in-process cases.
    const handedRoots: string[] = [];
    const handedMutantPaths: string[] = [];
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
        handedRoots.push(args.root);
        handedMutantPaths.push(args.mutantFile);
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
      stamp: (rootArg, surface) => {
        sequence.push("stamp:");
        handedRoots.push(rootArg);
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
    return { deps, sequence, disk, exitCodes, handedRoots, handedMutantPaths };
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

  it("trial hands its collaborators the REPO ROOT, never the source's own directory", () => {
    const plan = shortPlan();
    const { deps, handedRoots } = makeDeps();
    const target = wideTargetOf();
    mustRun(plan, deps);
    premise(
      "the seams were handed a root at all, so the assertion has a subject",
      handedRoots.length,
      0,
    );
    // Every root handed to `stampInputs` and to `runMutantRecorded` must be the
    // repo root: the first resolves `surface.sourcePath` against it and the
    // second uses it as the child's cwd. Handing either the source's directory
    // produces `<dir>/<repo-relative-path>` — a path that exists nowhere.
    for (const handed of handedRoots) expect(handed).toBe(target.root);
    expect(target.root).not.toContain(target.surface.sourcePath);
  });

  it("trial writes its mutant overlay into a SCRATCH dir, never the process cwd", () => {
    const plan = shortPlan();
    const { deps, handedMutantPaths } = makeDeps();
    mustRun(plan, deps);
    premise("a mutant path was handed over", handedMutantPaths.length, 0);
    for (const p of handedMutantPaths) {
      // Absolute, and outside the repository. A bare filename is written
      // relative to the child's cwd — the repo root — and the trial would
      // litter the very tree `psqlStartupScan`'s suite walks.
      expect(p.startsWith("/")).toBe(true);
      expect(p.startsWith(`${process.cwd()}/`)).toBe(false);
    }
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
    // that the elided writer then never replaced. The scratch dir is named
    // explicitly so the fixture can seed the exact path the trial reads back —
    // the overlay is an absolute path in a scratch dir, never a bare filename.
    const target = wideTargetOf();
    const scratchDir = join(root, "elided-writer");
    disk.set(join(scratchDir, MUTANT_FILE_NAME), target.sourceText);
    const out = runTrial(plan, target, { ...deps, writeMutant: () => {} }, { scratchDir });
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
      // The child ECHOES the plan it was given. Without this the `plan` case
      // trips the trial-binding check first — correctly, since the parent's plan
      // and the child's would genuinely describe different trials — and the case
      // would then assert a refusal it was not written to test. Echoing is also
      // the honest shape of the attack: a parent that mints the nonce into the
      // plan hands the child a plan carrying it.
      const echoed = channel === "plan" ? { ...report, plan } : report;
      const out = observeTrial(plan, wideTargetOf(), parentDepsFor(echoed), request);
      expect(inputOf(out)).toBe("provenance");
      expect(detailOf(out)).toContain(channel);
    },
  );

  it("trial refuses a nonce the parent minted as the SCRATCH DIRECTORY basename", () => {
    // The channel the request object cannot see. `cwd` is the repo root at every
    // real call site and the scratch path is appended to argv INSIDE spawnChild,
    // after the swept argv exists — so this attack walked through a sweep whose
    // own comment claimed to stop it. `reportPath` is what actually carries the
    // scratch directory back to the parent, so that is what is swept.
    const report = realReport();
    const out = observeTrial(
      report.plan,
      wideTargetOf(),
      {
        spawnChild: () => ({
          pid: report.childPid,
          reportPath: `/tmp/fx-probe-${report.nonce}/report.json`,
        }),
        readReportBytes: () => Buffer.from(JSON.stringify(report), "utf8"),
      },
      REQUEST,
    );
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toContain("reportPath");
  });

  it.each([
    ["fractional trials", { armATrials: 1.5 }, /non-negative safe integer/],
    ["negative trials", { armATrials: -1 }, /non-negative safe integer/],
    ["zero trials", { armATrials: 0 }, /at least 1/],
    ["fractional seed", { seed: 1.5 }, /non-negative safe integer/],
    ["negative prefix length", { prefixLengths: [-1] }, /EMPTY prefix/],
  ])("planCampaign REFUSES %s rather than coercing it", (_label, override, pattern) => {
    // The core is reachable directly, so the CLI's accept-sets protect nothing
    // here. 1.5 produced two A trials, a fractional seed printed unchanged while
    // the PRNG coerced it, and -1 sliced to an empty prefix — a condition nobody
    // declared, reported as if it had been.
    const out = planCampaign({
      target: wideTargetOf(),
      seed: 20260821,
      armATrials: 12,
      ...override,
    });
    expect("kind" in out && out.kind === "refusal").toBe(true);
    expect((out as Refusal).detail).toMatch(pattern);
  });

  it("a zero timeout does NOT disable the child ceiling", () => {
    // `?? 600_000` accepted 0, and spawnSync reads `timeout: 0` as NO TIMEOUT —
    // an unbounded child wearing a ceiling's name. The meta-guard pins that the
    // NAME appears at the call site; only this pins what the name denotes.
    const seen: { timeout?: number }[] = [];
    const deps = makeParentDeps({
      scratchDir: mkdtempSync(join(tmpdir(), "fx-probe-ceiling-")),
      root: join(__dirname, "..", "..", ".."),
      surfaceId: "spawnBounded",
      siteId: "x",
      timeoutMs: 0,
      spawn: ((_cmd: string, _args: string[], opts: { timeout?: number }) => {
        seen.push(opts);
        return { pid: 1, stdout: "", stderr: "", status: 0 };
      }) as unknown as NonNullable<Parameters<typeof makeParentDeps>[0]["spawn"]>,
    });
    deps.spawnChild({ plan: realReport().plan, ...REQUEST });
    expect(seen[0]?.timeout).toBe(600_000);
    expect(seen[0]?.timeout).not.toBe(0);
  });

  it("a report for another SURFACE is refused, even at the same arm#index and site", () => {
    // Site ids are not globally unique. Nothing compared surfaces, so a trial
    // that executed and stamped surface B while reporting surface A produced a
    // sealed, internally consistent verdict about the wrong program.
    const report = realReport();
    const asked = { ...report.plan, surfaceId: "premiseScan" };
    const out = observeTrial(asked, wideTargetOf(), parentDepsFor(report), REQUEST);
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toContain("premiseScan");
  });

  it("a report for ANOTHER trial is refused, however perfect it is in itself", () => {
    // Everything else verifies the report is internally consistent and freshly
    // produced. None of it notices that a flawless report describes a different
    // trial: the digest binds the report's fields TO EACH OTHER, so a producer
    // that sealed the wrong binding seals a consistent one. Probed at diff
    // review round 1 — a child report for A#0 came back as the parent's B#5.
    const report = realReport();
    const asked = { ...report.plan, arm: "B" as const, index: 5 };
    const out = observeTrial(asked, wideTargetOf(), parentDepsFor(report), REQUEST);
    expect(inputOf(out)).toBe("provenance");
    expect(detailOf(out)).toContain("A#0");
    expect(detailOf(out)).toContain("B#5");
  });

  it("a report whose ROLES are re-ordered is refused, even with perfect site order", () => {
    // Sites and roles are separate fields. A report resealed so the second step
    // carries role "target" and the third "prefix" passes every site check,
    // and `conditionOf` then reads the PREFIX's verdict as the trial's answer.
    const report = realReport();
    const steps = report.steps.map((st) => ({ ...st }));
    premise("the trial has a prefix step to swap roles with", steps.length, 2);
    const targetIdx = steps.findIndex((st) => st.role === "target");
    const prefixIdx = steps.findIndex((st) => st.role === "prefix");
    expect(targetIdx).toBeGreaterThan(-1);
    expect(prefixIdx).toBeGreaterThan(-1);
    (steps[targetIdx] as { role: string }).role = "prefix";
    (steps[prefixIdx] as { role: string }).role = "target";

    const verdict = verifyTrialReport({ ...report, steps }, wideTargetOf());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.detail).toMatch(/role/i);
  });

  it.each([
    [
      "a child that never wrote its report",
      () => {
        throw Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
      },
      /NO readable report/,
    ],
    [
      "valid JSON that is not a trial report",
      () => Buffer.from(JSON.stringify({ hello: "world" }), "utf8"),
      /not a trial report/,
    ],
  ])("REFUSES BY NAME on %s", (_label, readReportBytes, pattern) => {
    // Both paths threw out of the parent instead of refusing: the read was
    // outside any try, and the cast was unchecked so `report.plan.arm` threw a
    // TypeError. An exception names neither the trial nor the cause, which is
    // the one thing an operator needs.
    const report = realReport();
    const out = observeTrial(
      report.plan,
      wideTargetOf(),
      {
        spawnChild: () => ({ pid: report.childPid, reportPath: "/tmp/gone.json" }),
        readReportBytes: readReportBytes as () => Buffer,
      },
      REQUEST,
    );
    expect(inputOf(out)).toBe("record");
    expect(detailOf(out)).toMatch(pattern);
  });

  it("a CHILD refusal arrives as itself, naming its own cause", () => {
    // The parent cast every parsed object to TrialReport and read childPid, so
    // "the baseline is RED" surfaced as "pid disagreement, child reports
    // undefined". The campaign stopped either way; only one of those tells the
    // operator what to fix.
    const report = realReport();
    const out = observeTrial(
      report.plan,
      wideTargetOf(),
      {
        spawnChild: () => ({ pid: report.childPid, reportPath: "/tmp/report.json" }),
        readReportBytes: () =>
          Buffer.from(
            JSON.stringify({ kind: "refusal", input: "baseline", detail: "the baseline is RED" }),
            "utf8",
          ),
      },
      REQUEST,
    );
    expect(inputOf(out)).toBe("baseline");
    expect(detailOf(out)).toContain("the baseline is RED");
    expect(detailOf(out)).not.toMatch(/pid/i);
  });

  it("an --arm plan is a SUBSET of the full plan, not a different draw", () => {
    const target = wideTargetOf();
    const full = planCampaign({ target, seed: 20260821, armATrials: 12 }) as CampaignPlan;
    const onlyB = planCampaign({
      target,
      seed: 20260821,
      armATrials: 12,
      arm: "B",
    }) as CampaignPlan;

    // The property that matters is not "only B trials came back" — filtering
    // DURING planning would satisfy that while consuming the PRNG differently
    // and handing the re-run a different arm B than the one being repaired.
    expect(onlyB.trials.map((t) => t.arm)).toEqual(onlyB.trials.map(() => "B"));
    expect(onlyB.trials).toEqual(full.trials.filter((t) => t.arm === "B"));
    expect(onlyB.trials.length).toBeGreaterThan(0);
  });

  it("an --arm that selects no trial REFUSES rather than planning an empty campaign", () => {
    // `control` is a legal --arm value and the planner emits no control trials,
    // so this is reachable from the shipped accept-set rather than constructed.
    const out = planCampaign({
      target: wideTargetOf(),
      seed: 20260821,
      armATrials: 12,
      arm: "control",
    });
    expect("kind" in out && out.kind === "refusal").toBe(true);
    expect((out as Refusal).detail).toMatch(/selects NO trial/);
  });

  it("the nonce sweep's channel list is DERIVED from the spawn request's own keys", () => {
    const report = realReport();
    const request = { plan: report.plan, ...REQUEST };
    const swept = spawnChannels(request).map((c) => c.channel);
    expect(swept).toEqual(Object.keys(request).sort());
    premise("the request really carries more than one channel", swept.length, 1);

    // The assertion above compares the sweep to the very object it swept, so a
    // hand-typed list of today's four keys would satisfy it. The claim is that a
    // channel added LATER joins by existing, and only a channel that does not
    // exist yet can test it.
    const widened = { ...request, scratchDir: "/tmp/fx-probe-later" };
    const sweptWider = spawnChannels(widened as never).map((c) => c.channel);
    expect(sweptWider).toContain("scratchDir");
    expect(sweptWider.length).toBe(swept.length + 1);
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
    const unsealed: TrialReport = {
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
      digest: "",
    };
    const report: TrialReport = { ...unsealed, digest: reportDigest(unsealed) };
    return {
      observation: {
        plan,
        parentPid: 1000 + nonceCounter + (over.pidSkew ?? 0),
        report,
      },
      ...(over.samples === undefined ? {} : { loadSamples: over.samples }),
    };
  };

  // The anomaly direction is REQUIRED by the production signature — a default
  // there would be a claim about a site the aggregator has never seen. This
  // helper supplies the fixture site's direction so the eligibility and render
  // cases stay about what they are about; the direction itself has its own case.
  const mustAggregate = (
    input: Omit<Parameters<typeof aggregateCampaign>[0], "anomalousVerdict"> & {
      anomalousVerdict?: Verdict;
    },
  ): CampaignAggregate => {
    const out = aggregateCampaign({ anomalousVerdict: "KILLED", ...input });
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
    // The kill this refusal exists for: an implementation that evaluates the
    // formula for every N returns 1 at N=0 and renders `p > 1.0` with full
    // confidence. Asserting `1 - 0.05 ** (1/0) === 1` here would be asserting
    // JavaScript's arithmetic rather than `oneSidedBound`, so the kill is named
    // and the assertions above are what carry it.
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
      anomalousVerdict: "KILLED",
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
      anomalousVerdict: "KILLED",
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
      anomalousVerdict: "KILLED",
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

  it("eligibility RE-DERIVES the child's two booleans and reports a disagreement", () => {
    // A sealed report claiming attributable:true while its own evidence says
    // otherwise — stamps that differ and a non-empty inputsMoved — counted as
    // eligible, because eligibility read the boolean. The digest cannot catch it:
    // it binds these fields to each other, so a producer that computes the
    // boolean wrongly seals a consistent lie.
    const lying = fakeTrial({ index: 0 });
    const r = lying.observation.report as unknown as Record<string, unknown>;
    r.inputsMoved = ["tests/x.ts"];
    r.stampAfter = { ...(r.stampBefore as InputStamp), digest: "deadbeefcafe" };
    r.attributable = true;
    // RE-SEALED. Mutating without re-sealing trips the whole-report digest,
    // which is that guard working — and it is not the defect under test. The
    // reachable shape is a producer that computes the boolean wrongly and then
    // seals the result, so the seal agrees with the lie.
    r.digest = reportDigest(lying.observation.report);

    const agg = mustAggregate({ plannedPerArm: { A: 1 }, trials: [lying] });
    const armA = agg.arms.find((a) => a.arm === "A") as ArmSummary;
    expect(armA.eligible).toBe(0);
    expect(armA.excluded[0]?.reason).toMatch(/SELF-REPORT DISAGREES/);
  });

  it("the right NUMBER of trials can still be the wrong ones", () => {
    // Counts are not identity. Six fresh reports containing B#0 twice and
    // omitting B#1 produced "6 of 6 produced", stayed fully eligible and passed
    // the exit verdict — every per-trial check green, the campaign not the one
    // planned. The per-trial binding repair cannot see this: each report matches
    // whichever plan the CALLER handed it.
    // The membership check reads only each planned trial's (arm, index), so the
    // plan is stated directly rather than generated — the case is about identity,
    // not about planning.
    const plan = {
      seed: 20260821,
      surfaceId: "spawnBounded",
      targetSiteId: "x",
      trials: [
        { arm: "A" as const, index: 0 },
        { arm: "A" as const, index: 1 },
      ],
    } as unknown as CampaignPlan;
    // A#0 twice, A#1 never: the right COUNT, the wrong members.
    const trials = [fakeTrial({ index: 0 }), fakeTrial({ index: 0, verdict: "KILLED" })];
    const out = aggregateCampaign({
      anomalousVerdict: "KILLED",
      plannedPerArm: { A: 2 },
      plan,
      trials,
    });
    expect("kind" in out && out.kind === "refusal").toBe(true);
    expect((out as Refusal).detail).toMatch(/REPEAT|never run|NEVER RAN/i);
  });

  it("a PESSIMISTIC self-report disagreement is disqualified everywhere, not just in its arm", () => {
    // The first repair excluded a disagreeing trial from the per-arm count and
    // nowhere else. This is the direction that case missed: a report claiming
    // `completed: false` with no infra faults at all. It was excluded from arm A
    // and could still become the campaign ANCHOR, supply a flip, and enter the
    // conditions — one trial counted as absent and consulted as present.
    const lying = fakeTrial({ index: 0, verdict: "KILLED" });
    const r = lying.observation.report as unknown as Record<string, unknown>;
    r.completed = false;
    r.digest = reportDigest(lying.observation.report);

    const agg = mustAggregate({ plannedPerArm: { A: 1 }, trials: [lying] });
    const armA = agg.arms.find((a) => a.arm === "A") as ArmSummary;
    expect(armA.eligible).toBe(0);
    expect(armA.excluded[0]?.reason).toMatch(/SELF-REPORT DISAGREES/);
    // The three places the first repair left open:
    expect(agg.anchorDigest).toBeNull();
    expect(agg.flips).toEqual([]);
    expect(agg.conditions).toEqual([]);
  });

  it("a flip is measured against the DECLARED anomaly, not a hardcoded KILLED", () => {
    // The accepted domain is every enrolled site. On a normally-KILLED site the
    // old predicate called each ordinary trial a reproduction and stayed silent
    // on the anomalous survival — a false positive and a false negative from one
    // line. Same trials, both directions, opposite answers.
    const trials = [fakeTrial({ index: 0 }), fakeTrial({ index: 1, verdict: "KILLED" })];
    const killedIsAnomaly = mustAggregate({
      anomalousVerdict: "KILLED",
      plannedPerArm: { A: 2 },
      trials,
    });
    const survivedIsAnomaly = mustAggregate({
      anomalousVerdict: "SURVIVED",
      plannedPerArm: { A: 2 },
      trials,
    });
    expect(killedIsAnomaly.flips).toEqual(["A#1"]);
    expect(survivedIsAnomaly.flips).toEqual(["A#0"]);
  });

  it("the ZERO-EVENT bound is REFUSED once arm A contains a flip", () => {
    // Printing `p > x` beside BRANCH POSITIVE states a bound and its own
    // counterexample in one report. `1 - alpha^(1/n)` answers "what rate would
    // have produced NO event in n trials"; an arm that observed one is not
    // evidence against that rate.
    const rendered = renderCampaign(
      mustAggregate({
        plannedPerArm: { A: 2 },
        trials: [fakeTrial({ index: 0 }), fakeTrial({ index: 1, verdict: "KILLED" })],
      }),
    );
    expect(rendered).toContain("BOUND: REFUSED");
    expect(rendered).toContain("ZERO-EVENT bound");
    expect(rendered).not.toMatch(/BOUND: p > /);
    expect(rendered).toContain("BRANCH POSITIVE");
  });

  it("an arm that produced NOTHING is still reported starved, not dropped", () => {
    // The universe was derived from observed trials plus whatever keys the
    // caller put in plannedPerArm, so an arm with zero trials was not in the
    // list to be found starved — and a campaign holding one eligible A trial
    // rendered BRANCH NULL while B and C never appeared. The single-arm plan
    // mode this branch adds makes that state ordinary rather than exotic.
    const rendered = renderCampaign(
      mustAggregate({
        plannedPerArm: { A: 1 },
        declaredArms: ["A", "B", "C"],
        trials: [fakeTrial({ index: 0 })],
      }),
    );
    expect(rendered).toContain("GRADUATION: REFUSED");
    expect(rendered).toMatch(/arm B at 0 eligible/);
    expect(rendered).toMatch(/arm C at 0 eligible/);
    expect(rendered).not.toContain("BRANCH NULL");
  });

  it("aggregator condition validation TOLERATES a field it does not know", () => {
    // NOT re-asserted here: `REQUIRED_CONDITION_FIELDS` IS `Object.keys` of this
    // same builder (processProbe.ts:1192), so comparing the two compares an
    // expression to itself and passes identically if someone replaced the
    // constant with a hand-typed list of today's fields. Derivation is a
    // structural property of the definition site; what IS testable is the
    // behaviour, and the loop above tests it by dropping each field in turn.
    // An UNKNOWN extra field must not break validation, or a condition tuple
    // gaining a field would refuse every trial that carries it.
    const tuple = conditionOf(fakeTrial()) as unknown as Record<string, unknown>;
    expect(validateCondition({ ...tuple, addedLater: 1 })).toEqual({ ok: true });
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

  it("aggregator arm-B prefix lengths are the pre-registered set of spec 5.2", () => {
    // Three at 8 and two at 24, fixed before any trial ran, exactly as the load
    // margins are. A pre-registered quantity with nothing pinning it is a
    // quantity that can move between the design and the run without anyone
    // noticing — the same hole the margins would have had.
    expect([...ARM_B_PREFIX_LENGTHS]).toEqual([8, 8, 8, 24, 24]);
    expect(ARM_B_PREFIX_LENGTHS.filter((n) => n === 8)).toHaveLength(3);
    expect(ARM_B_PREFIX_LENGTHS.filter((n) => n === 24)).toHaveLength(2);
  });

  it("aggregator arm set is exactly the four the design declares", () => {
    expect([...ARMS]).toEqual(["A", "B", "C", "control"]);
    expect(BASELINE_STEP).toBe("<baseline>");
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
      anomalousVerdict: "KILLED",
      plannedPerArm: { C: 2 },
      trials: [mk("quiet", 1.0, "anchor-digest", 0), mk("loaded", 9.0, "other-digest", 1)],
    });
    if (agg.kind !== "aggregate") throw new Error(`unexpected refusal: ${agg.detail}`);
    expect(agg.load.kind).toBe("refused");
    if (agg.load.kind !== "refused") return;
    expect(agg.load.detail).toContain("anchor-digest");
    expect(agg.load.detail).toContain("other-digest");
    // AC-16's half of the same defect, asserted where a reader would see it: the
    // load column must stay at one. Refusing the pair internally while the
    // render still advances the column would report an observation the campaign
    // never made.
    const text = renderCampaign(agg);
    expect(text).toContain("load column unchanged at one");
    expect(text).not.toMatch(/advances to two/);
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
          anomalousVerdict: "KILLED",
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

describe("processProbe cli adapter — wiring proven separately from rendering (AC-9)", () => {
  const MIDDLE_SITE = "relational-boundary:15:46:<><=";

  const spyDeps = (over: Partial<CliDeps> = {}) => {
    const calls: { fn: string; args: unknown[] }[] = [];
    const out: string[] = [];
    const target = (() => {
      const o = resolveTarget({
        root,
        surfaceId: "wideSurface",
        site: MIDDLE_SITE,
        surfaces: [wideSurface()],
      });
      if (o.kind === "refusal") throw new Error(`fixture: ${o.detail}`);
      return o.target;
    })();
    const deps: CliDeps = {
      resolveTarget: (input) => {
        calls.push({ fn: "resolveTarget", args: [input] });
        return { kind: "target", target };
      },
      planCampaign: (input) => {
        calls.push({ fn: "planCampaign", args: [input] });
        return {
          seed: input.seed,
          surfaceId: target.surface.id,
          targetSiteId: target.siteId,
          trials: [],
        };
      },
      renderPlan: (plan) => {
        calls.push({ fn: "renderPlan", args: [plan] });
        return `PLAN seed ${plan.seed}\n`;
      },
      renderProbe: (outcome) => {
        calls.push({ fn: "renderProbe", args: [outcome] });
        return renderProbe(outcome);
      },
      write: (text) => {
        out.push(text);
      },
      generateSeed: () => 987654,
      surfaces: [wideSurface()],
      root,
      ...over,
    };
    return { deps, calls, out };
  };

  const ARGS = ["--surface", "wideSurface", "--site", MIDDLE_SITE, "--arm", "A", "--trials", "12"];

  it("cli forwards the operator's arguments to the core collaborators", () => {
    const { deps, calls } = spyDeps();
    expect(cliMain([...ARGS, "--seed", "4242"], deps)).toBe(CLI_EXIT_OK);
    const resolve = calls.find((c) => c.fn === "resolveTarget");
    expect(resolve?.args[0]).toMatchObject({ surfaceId: "wideSurface", site: MIDDLE_SITE });
    const plan = calls.find((c) => c.fn === "planCampaign");
    expect(plan?.args[0]).toMatchObject({ seed: 4242, armATrials: 12 });
  });

  it("cli echoes a supplied seed and forwards it UNCHANGED", () => {
    const { deps, calls, out } = spyDeps();
    cliMain([...ARGS, "--seed", "4242"], deps);
    expect(out.join("")).toContain("4242");
    const plan = calls.find((c) => c.fn === "planCampaign");
    expect((plan?.args[0] as { seed: number }).seed).toBe(4242);
  });

  it("cli GENERATES a seed when none is supplied, PRINTS it, and forwards the printed one", () => {
    const { deps, calls, out } = spyDeps();
    expect(cliMain(ARGS, deps)).toBe(CLI_EXIT_OK);
    const plan = calls.find((c) => c.fn === "planCampaign");
    const forwarded = (plan?.args[0] as { seed: number }).seed;
    expect(forwarded).toBe(987654);
    // The printed seed and the forwarded seed are the SAME value: a tool that
    // prints one seed and plans with another produces a campaign nobody can
    // reproduce from its own output.
    expect(out.join("")).toContain(String(forwarded));
  });

  it("cli generates a DIFFERENT seed on two omitted-seed invocations", () => {
    let n = 0;
    const seeds: number[] = [];
    const { deps } = spyDeps({
      generateSeed: () => {
        n += 1;
        return 1000 + n;
      },
      planCampaign: (input) => {
        seeds.push(input.seed);
        return {
          seed: input.seed,
          surfaceId: "wideSurface",
          targetSiteId: MIDDLE_SITE,
          trials: [],
        };
      },
    });
    cliMain(ARGS, deps);
    cliMain(ARGS, deps);
    expect(seeds).toHaveLength(2);
    // Kills a constant default AND a requires-seed adapter in one case: a
    // constant gives two equal seeds, a requires-seed adapter never plans.
    expect(seeds[0]).not.toBe(seeds[1]);
  });

  it.each([
    { label: "unknown arm", args: ["--arm", "Z"] },
    { label: "fractional trials", args: ["--trials", "2.5"] },
    { label: "negative trials", args: ["--trials", "-3"] },
    { label: "missing surface", args: ["--surface"] },
    { label: "fractional seed", args: ["--seed", "1.5"] },
  ])("cli refuses $label with exit 2 and no distribution", ({ args }) => {
    const base = [
      "--surface",
      "wideSurface",
      "--site",
      MIDDLE_SITE,
      "--arm",
      "A",
      "--trials",
      "12",
    ];
    // The invalid flag REPLACES its valid counterpart rather than being appended
    // after it: `--arm A --arm Z` would take the first and test nothing.
    const merged: string[] = [];
    for (let i = 0; i < base.length; i += 2) {
      const flag = base[i] as string;
      const override = args[0] === flag ? args : null;
      if (override === null) merged.push(flag, base[i + 1] as string);
      else if (override.length === 1) merged.push(flag);
      else merged.push(flag, override[1] as string);
    }
    if (args[0] === "--seed") merged.push("--seed", args[1] as string);
    // The REAL resolver, not the spy: a spy that returns a target regardless of
    // its input cannot refuse a missing surface, and the case would assert exit
    // 2 against a fixture structurally unable to produce it.
    const { deps, out } = spyDeps({ resolveTarget });
    expect(cliMain(merged, deps)).toBe(CLI_EXIT_REFUSED);
    expect(out.join("")).toContain("REFUSED");
    expect(out.join("")).not.toMatch(/\d+ of \d+/);
  });

  it("cli DEFAULT_DEPS are bound to the REAL core, and the check is discriminating", () => {
    expect(CLI_DEFAULT_DEPS.resolveTarget).toBe(resolveTarget);
    expect(CLI_DEFAULT_DEPS.planCampaign).toBe(planCampaign);
    expect(CLI_DEFAULT_DEPS.renderProbe).toBe(renderProbe);
    // Proven discriminating against an impostor — but by BEHAVIOR, not identity:
    // `impostor.resolveTarget !== resolveTarget` compares a freshly allocated
    // arrow to a module binding and is true by construction, so it establishes
    // nothing about the three assertions above. What discriminates is that the
    // same identity check, run against the impostor, FAILS.
    const impostor = { ...CLI_DEFAULT_DEPS, resolveTarget: () => renderProbe as never };
    expect(() => expect(impostor.resolveTarget).toBe(resolveTarget)).toThrow();
  });

  it("cli generateSeed default produces a value the seed accept-set admits", () => {
    const seed = CLI_DEFAULT_DEPS.generateSeed();
    expect(parseSeed(String(seed))).toEqual({ ok: true, value: seed });
  });

  it("cli generateSeed DEFAULT actually varies — a constant would satisfy every other case", () => {
    // The different-seeds case above injects its own generator, so it proves
    // `main` forwards distinct values and says nothing about the SHIPPED
    // default. A constant default passes it, passes the accept-set case, and
    // ships a campaign nobody can tell apart from its predecessor. My own killer
    // audit found this gap: the constant-seed mutant survived every case.
    const draws = Array.from({ length: 8 }, () => CLI_DEFAULT_DEPS.generateSeed());
    premise("the probe drew more than one value, so variation is observable", draws.length, 1);
    expect(new Set(draws).size).toBeGreaterThan(1);
  });
});

describe("processProbe aggregator trial-level binding — rotation among REPORTS (AC-14)", () => {
  const MIDDLE_SITE = "relational-boundary:15:46:<><=";

  let seq = 0;
  const sealedTrial = (over: {
    arm?: Arm;
    index?: number;
    half?: "quiet" | "loaded";
    window?: { spawnedAt: number; exitedAt: number };
  }): CampaignTrial => {
    seq += 1;
    const arm = over.arm ?? "C";
    const plan: TrialPlan = {
      arm,
      kind: "isolated",
      seed: 7,
      index: over.index ?? 0,
      surfaceId: "wideSurface",
      targetSiteId: MIDDLE_SITE,
      prefix: [],
      position: 1,
      ...(over.half === undefined ? {} : { half: over.half }),
    };
    const stamp = { digest: "anchor", files: { "wide.ts": "aaa" }, operators: "o", count: 1 };
    const unsealed: TrialReport = {
      plan,
      childPid: 2000 + seq,
      nonce: `sealed-nonce-${seq}`,
      steps: [],
      stampBefore: stamp,
      stampAfter: stamp,
      inputsMoved: [],
      attributable: true,
      completed: true,
      infraFaults: [],
      // DISTINGUISHABLE per trial, so a rotation moves something observable.
      window: over.window ?? { spawnedAt: 1000 * seq, exitedAt: 1000 * seq + 500 },
      digest: "",
    };
    const report = { ...unsealed, digest: reportDigest(unsealed) };
    return { observation: { plan, parentPid: report.childPid, report } };
  };

  it("aggregator accepts intact sealed reports — the rotation refusal is not vacuous", () => {
    const trials = [
      sealedTrial({ index: 0, half: "quiet" }),
      sealedTrial({ index: 1, half: "loaded" }),
    ];
    const out = aggregateCampaign({ anomalousVerdict: "KILLED", plannedPerArm: { C: 2 }, trials });
    expect(out.kind).toBe("aggregate");
  });

  it("aggregator REFUSES a TRIAL-LEVEL rotation of windows among reports, naming the first", () => {
    const trials = [
      sealedTrial({ index: 0, half: "quiet" }),
      sealedTrial({ index: 1, half: "loaded" }),
      sealedTrial({ index: 2, half: "quiet" }),
    ];
    const windows = trials.map((t) => t.observation.report.window);
    premise(
      "the windows are DISTINGUISHABLE, so rotating them moves something",
      new Set(windows.map((w) => w.spawnedAt)).size,
      1,
    );
    // Rotate the windows one step among the reports. Every per-trial direct
    // check still passes: each report is well-formed, each pid pair agrees, each
    // nonce is distinct, and the receipt sequence is untouched. Only the
    // whole-report seal can see that evidence moved between trials.
    const rotated = trials.map((t, i) => ({
      ...t,
      observation: {
        ...t.observation,
        report: {
          ...t.observation.report,
          window: windows[(i + 1) % windows.length] as (typeof windows)[number],
        },
      },
    }));
    const out = aggregateCampaign({
      anomalousVerdict: "KILLED",
      plannedPerArm: { C: 3 },
      trials: rotated,
    });
    expect(inputOf(out)).toBe("record");
    expect(detailOf(out)).toContain("C#0");
  });

  it("aggregator REFUSES a rotation of arm-C HALF identities among reports", () => {
    const trials = [
      sealedTrial({ index: 0, half: "quiet" }),
      sealedTrial({ index: 1, half: "loaded" }),
    ];
    // The half lives on the plan inside the report; swapping it between reports
    // is the arm-C form of the same wrong-attribution move.
    const swapped = trials.map((t, i) => ({
      ...t,
      observation: {
        ...t.observation,
        report: {
          ...t.observation.report,
          plan: {
            ...t.observation.report.plan,
            half: (trials[(i + 1) % trials.length] as CampaignTrial).observation.report.plan
              .half as "quiet" | "loaded",
          },
        },
      },
    }));
    const out = aggregateCampaign({
      anomalousVerdict: "KILLED",
      plannedPerArm: { C: 2 },
      trials: swapped,
    });
    expect(inputOf(out)).toBe("record");
  });

  it("aggregator report digest moves when ANY field of the report moves", () => {
    const report = sealedTrial({ index: 0 }).observation.report;
    const fields = digestedFieldsOfReport(report);
    premise("the report digest reads more than one field", fields.length, 1);
    const record = report as unknown as Record<string, unknown>;
    for (const field of fields) {
      const value = record[field];
      const moved =
        typeof value === "string"
          ? `${value}-moved`
          : typeof value === "number"
            ? value + 1
            : typeof value === "boolean"
              ? !value
              : Array.isArray(value)
                ? [...value, "extra"]
                : { ...(value as object), moved: true };
      expect(reportDigest({ ...report, [field]: moved } as TrialReport)).not.toBe(report.digest);
    }
  });
});

describe("campaign driver verdict — every gate probed against a constructed failing input", () => {
  const clean = {
    aggregateKind: "aggregate" as const,
    starvedArms: [] as string[],
    refusedTrials: 0,
    defaultChannelIdentical: true,
    campaignRecordCount: 20,
    treeUnchanged: true,
    plannedTrialCount: 20,
  };

  it("campaign verdict is 0 only on a complete run — the green control", () => {
    expect(campaignVerdict(clean)).toEqual({ code: 0, detail: "CAMPAIGN COMPLETE" });
  });

  it.each([
    {
      label: "the aggregate refused",
      over: { aggregateKind: "refusal" as const },
      names: "REFUSED",
    },
    { label: "a trial was refused", over: { refusedTrials: 2 }, names: "2 refused" },
    { label: "an arm is starved", over: { starvedArms: ["B"] }, names: "ZERO eligible" },
    {
      label: "the default channel moved",
      over: { defaultChannelIdentical: false },
      names: "DEFAULT record channel",
    },
    { label: "the campaign channel is empty", over: { campaignRecordCount: 0 }, names: "EMPTY" },
  ])("campaign verdict is 1 when $label, naming it", ({ over, names }) => {
    const verdict = campaignVerdict({ ...clean, ...over });
    expect(verdict.code).toBe(1);
    expect(verdict.detail).toContain(names);
  });

  it("campaign verdict FAILS on a SHORT durable record count", () => {
    // A nonempty directory passed with 19 records for 20 planned trials, and a
    // reused directory's stale records satisfied the same check. Presence is not
    // completeness.
    const verdict = campaignVerdict({ ...clean, campaignRecordCount: 19 });
    expect(verdict.code).toBe(1);
    expect(verdict.detail).toMatch(/19 record\(s\) for 20 planned/);
  });

  it("campaign verdict FAILS when the tree moved mid-campaign", () => {
    // The attestation printed CHANGED MID-CAMPAIGN and exited zero: a signal
    // produced, observed by nobody, green on top of it. The deciding suite walks
    // the whole repository, so a tree that moved means the trials measured
    // different programs.
    const verdict = campaignVerdict({ ...clean, treeUnchanged: false });
    expect(verdict.code).toBe(1);
    expect(verdict.detail).toMatch(/WORKING TREE moved/);
  });

  it("campaign verdict reports EVERY failing condition, not just the first", () => {
    const verdict = campaignVerdict({
      ...clean,
      refusedTrials: 1,
      starvedArms: ["A", "C"],
      defaultChannelIdentical: false,
    });
    expect(verdict.detail).toContain("1 refused");
    expect(verdict.detail).toContain("A, C");
    expect(verdict.detail).toContain("DEFAULT record channel");
  });

  it("campaign verdict does not let an empty channel mask a REAL failure", () => {
    // The empty-channel branch is checked last and only when nothing else
    // failed: reporting "the directory is empty" for a run whose arm was starved
    // would name the symptom and hide the cause.
    const verdict = campaignVerdict({ ...clean, campaignRecordCount: 0, starvedArms: ["B"] });
    expect(verdict.code).toBe(1);
    expect(verdict.detail).toContain("ZERO eligible");
  });
});
