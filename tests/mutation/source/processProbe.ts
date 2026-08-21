/**
 * The across-process probe core.
 *
 * Composition only: every primitive that decides a verdict is the SHIPPED one
 * (`enumerateSites`, `generateMutants`, `runMutantRecorded`, `stampInputs`,
 * `resolveSurface`), so a disagreement between this instrument's observations
 * and the gate's cannot be an artifact of a reimplemented runner. This module
 * edits none of them.
 *
 * Design: `docs/superpowers/specs/ci/2026-08-21-intraleg-process-boundary-probe-design.md`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveSurface } from "./determinism";
import { type Mutant, generateMutants } from "./generate";
import { type Site, siteId } from "./operators";
import type { GuardSurface } from "./registry";

/** The declared arms. `control` drives the manufactured mechanism of spec §5.3. */
export const ARMS = ["A", "B", "C", "control"] as const;
export type Arm = (typeof ARMS)[number];

/**
 * WHICH input failed — never a bare "not found" (spec AC-1).
 *
 * A refusal that does not name its input forces the operator to re-derive the
 * cause from a command they already typed correctly, and it is indistinguishable
 * from a different input failing.
 */
export type ProbeRefusedInput =
  | "trials"
  | "seed"
  | "arm"
  | "surface"
  | "site"
  | "prefix"
  | "baseline"
  | "population";

export type Refusal = { kind: "refusal"; input: ProbeRefusedInput; detail: string };

export type Target = {
  surface: GuardSurface;
  /** The requested site id, as resolved — never the operator's raw string. */
  siteId: string;
  site: Site;
  /** Every mutant of this surface, in GENERATION order. Arm B's prefix slices it. */
  mutants: readonly Mutant[];
  /** One-based position of the target in generation order. */
  position: number;
  /** Absolute path of the mutated source, resolved against `root`. */
  sourceAbs: string;
  /** The source text the mutants were generated from. */
  sourceText: string;
};

export type ResolvedTarget = { kind: "target"; target: Target };

export type ProbeOutcome = Refusal | ResolvedTarget;

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string };

const refuse = (input: ProbeRefusedInput, detail: string): Refusal => ({
  kind: "refusal",
  input,
  detail,
});

/**
 * The shared integer accept-set, with the complement DEFAULT-DENIED.
 *
 * Anchored and digits-only BY CONSTRUCTION, mirroring the shipped `parseRuns`
 * (`determinism.ts`): `"2.5"`, `"1e3"`, `"Infinity"`, `"NaN"` and `"0x2"` never
 * reach `Number()`, so no fraction can be truncated into a count — the weaker
 * implementation AC-1 names first. Surrounding whitespace is trimmed, as the
 * sibling does; two accept-sets in one repo that disagree about padding is a
 * distinction the reader has to resolve at every call site.
 */
function parseInteger(flag: string, value: unknown, min: number): Parsed<number> {
  const bound = `${flag} must be an integer >= ${min}`;
  if (value === undefined || value === null) return { ok: false, detail: `${flag} is required` };
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= min
      ? { ok: true, value }
      : { ok: false, detail: `${bound}, got ${String(value)}` };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, detail: `${bound}, got ${JSON.stringify(value)}` };
  }
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) {
    return { ok: false, detail: `${bound}, got ${JSON.stringify(value)}` };
  }
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= min
    ? { ok: true, value: n }
    : { ok: false, detail: `${bound}, got ${JSON.stringify(value)}` };
}

/** Trials per arm. Zero trials is an arm that did not run, never a null result. */
export function parseTrials(value: unknown): Parsed<number> {
  return parseInteger("--trials", value, 1);
}

/**
 * The plan seed. Zero is a legitimate seed and is accepted; a negative one is
 * not, because the PRNG's state is a uint32 and a negative seed would be
 * silently coerced into a different stream than the one printed on the report.
 */
export function parseSeed(value: unknown): Parsed<number> {
  return parseInteger("--seed", value, 0);
}

/** Prefix burden. Zero is arm A's legitimate value — an isolated trial. */
export function parsePrefixLength(value: unknown): Parsed<number> {
  return parseInteger("--prefix", value, 0);
}

export function parseArm(value: unknown): Parsed<Arm> {
  if (typeof value === "string" && (ARMS as readonly string[]).includes(value)) {
    return { ok: true, value: value as Arm };
  }
  return {
    ok: false,
    detail: `--arm must be one of ${ARMS.join(", ")}, got ${JSON.stringify(value)}`,
  };
}

/** How many available site ids a refusal lists before summarising the rest. */
const SITE_SAMPLE = 5;

/**
 * Resolve the operator's `--surface`/`--site` pair to one target, through the
 * SHIPPED enumerator and generator.
 *
 * Surface resolution composes `resolveSurface`, which already refuses an unknown
 * id, a DUPLICATE id (`.find` would bind a real distribution to a source the
 * operator did not name) and a row with no deciding suites (every mutant would
 * score SURVIVED without being tested).
 */
export function resolveTarget(input: {
  root: string;
  surfaceId: string;
  site: string;
  surfaces?: readonly GuardSurface[];
}): ProbeOutcome {
  const resolved =
    input.surfaces === undefined
      ? resolveSurface(input.surfaceId)
      : resolveSurface(input.surfaceId, input.surfaces);
  if (!resolved.ok) return refuse("surface", resolved.detail);
  const surface = resolved.surface;

  const sourceAbs = resolve(input.root, surface.sourcePath);
  const sourceText = readFileSync(sourceAbs, "utf8");
  const { mutants } = generateMutants(sourceAbs, sourceText, surface.operators);

  // A FLOOR under the extractor. Over an empty population "site not found" is
  // true and useless: a generator that produced nothing and a mistyped site id
  // render identically, and the empty case is the one that means the instrument
  // is broken. Named separately so the two can never be confused.
  if (mutants.length === 0) {
    return refuse(
      "site",
      `surface ${JSON.stringify(surface.id)} generated ZERO mutants from ` +
        `${surface.sourcePath} with operators [${surface.operators.join(", ")}], so no site ` +
        `is resolvable at all. This is an empty population, not a missing site.`,
    );
  }

  const index = mutants.findIndex((m) => siteId(m.site) === input.site);
  if (index === -1) {
    const available = mutants.map((m) => siteId(m.site));
    const sample = available.slice(0, SITE_SAMPLE).join(", ");
    const rest =
      available.length > SITE_SAMPLE ? `, and ${available.length - SITE_SAMPLE} more` : "";
    return refuse(
      "site",
      `no site ${JSON.stringify(input.site)} on surface ${JSON.stringify(surface.id)}. ` +
        `That surface generates ${available.length} mutants: ${sample}${rest}.`,
    );
  }

  const mutant = mutants[index] as Mutant;
  return {
    kind: "target",
    target: {
      surface,
      siteId: input.site,
      site: mutant.site,
      mutants,
      position: index + 1,
      sourceAbs,
      sourceText,
    },
  };
}

/**
 * Render.
 *
 * A refusal emits NO distribution — not a partial one, not a zero one. `0 of 0`
 * printed beside a refusal is the weaker implementation AC-1 names third: it
 * reads as a run that happened and found nothing.
 */
export function renderProbe(outcome: ProbeOutcome): string {
  if (outcome.kind === "refusal") {
    return `REFUSED (${outcome.input}): ${outcome.detail}\n`;
  }
  const t = outcome.target;
  return (
    `TARGET: ${t.siteId} on ${t.surface.id}\n` +
    `POSITION: ${t.position} of ${t.mutants.length} in generation order\n`
  );
}

/* ------------------------------------------------------------------ planning */

/**
 * mulberry32 — a named, committed 32-bit PRNG.
 *
 * The algorithm is written out rather than pulled from `Math.random` because a
 * campaign nobody can re-run is not a campaign: every plan carries its seed, and
 * the seed plus this function is the whole reproduction recipe (AC-11).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, driven entirely by `next`. */
export function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * What produced this trial's prefix.
 *
 * `gate-order` is the replay of the target's generation-order predecessors — the
 * condition the real gate produces — and is distinct from a shuffle that merely
 * happens to be that long.
 */
export type TrialKind = "isolated" | "shuffled" | "gate-order";

export type TrialPlan = {
  arm: Arm;
  kind: TrialKind;
  /** The campaign seed, on EVERY plan: a plan that cannot name its seed cannot be re-run. */
  seed: number;
  /** Zero-based index within the arm. */
  index: number;
  surfaceId: string;
  targetSiteId: string;
  /** OTHER mutants of the same surface, in execution order (spec 5.1). */
  prefix: readonly string[];
  /**
   * One-based slot of the target in the EXECUTED sequence.
   *
   * DERIVED from the prefix, never carried as a free field: a planner returning
   * a constant here passes reproducibility and target-exclusion while binding
   * every verdict to the wrong condition. `validatePlan` re-derives it at
   * consumption so a tampered serialization cannot smuggle one past.
   */
  position: number;
  /** Arm C only: which half of the single pre-registered load pair this is. */
  half?: "quiet" | "loaded";
};

export type CampaignPlan = {
  seed: number;
  surfaceId: string;
  targetSiteId: string;
  trials: readonly TrialPlan[];
};

/** The pre-registered arm-B shuffled prefix lengths (spec 5.2): three at 8, two at 24. */
export const ARM_B_PREFIX_LENGTHS = [8, 8, 8, 24, 24] as const;

export type PlanInput = {
  target: Target;
  seed: number;
  /** Arm A's trial count. Spec 5.2 pre-registers 12; the campaign passes it explicitly. */
  armATrials: number;
  /** Arm B's shuffled prefix lengths. Defaults to the pre-registered set. */
  prefixLengths?: readonly number[];
};

/**
 * Build the campaign plan.
 *
 * Pure and total: same seed in, byte-identical plan out. The only failure is a
 * prefix the surface cannot supply, which REFUSES rather than truncating — a
 * silently shortened prefix reports a condition that never ran.
 */
export function planCampaign(input: PlanInput): CampaignPlan | Refusal {
  const { target, seed, armATrials } = input;
  const prefixLengths = input.prefixLengths ?? ARM_B_PREFIX_LENGTHS;
  const targetId = target.siteId;
  const available = target.mutants.map((m) => siteId(m.site)).filter((id) => id !== targetId);

  for (const length of prefixLengths) {
    if (length > available.length) {
      return refuse(
        "prefix",
        `--prefix ${length} exceeds what surface ${JSON.stringify(target.surface.id)} can ` +
          `supply: ${available.length} mutants are available once the target ` +
          `${JSON.stringify(targetId)} is excluded. Truncating would report a prefix ` +
          `condition that never ran.`,
      );
    }
  }

  const trials: TrialPlan[] = [];
  const base = {
    seed,
    surfaceId: target.surface.id,
    targetSiteId: targetId,
  } as const;

  for (let i = 0; i < armATrials; i += 1) {
    trials.push({ ...base, arm: "A", kind: "isolated", index: i, prefix: [], position: 1 });
  }

  prefixLengths.forEach((length, i) => {
    // A DISTINCT stream per trial, derived from the campaign seed, so the three
    // prefix-8 trials are three orderings rather than one ordering repeated —
    // and the whole set still reproduces from the single printed seed.
    const prefix = shuffle(available, mulberry32(seed + i + 1)).slice(0, length);
    trials.push({
      ...base,
      arm: "B",
      kind: "shuffled",
      index: i,
      prefix,
      position: prefix.length + 1,
    });
  });

  // The GATE-ORDER replay: the mutants that PRECEDE the target in generation
  // order, in generation order. The 4 the real gate runs AFTER the target are
  // deliberately absent — putting them before it binds the observation to a
  // condition the gate never produces, which is wrong attribution.
  const predecessors = target.mutants.slice(0, target.position - 1).map((m) => siteId(m.site));
  trials.push({
    ...base,
    arm: "B",
    kind: "gate-order",
    index: prefixLengths.length,
    prefix: predecessors,
    position: predecessors.length + 1,
  });

  (["quiet", "loaded"] as const).forEach((half, i) => {
    trials.push({ ...base, arm: "C", kind: "isolated", index: i, prefix: [], position: 1, half });
  });

  return { seed, surfaceId: target.surface.id, targetSiteId: targetId, trials };
}

/**
 * Canonical serialization, with an EXPLICIT key order.
 *
 * `JSON.stringify` over an object literal preserves insertion order, so two
 * structurally equal plans built by different code paths serialize to different
 * bytes and a byte comparison would report a difference that is not one. The
 * reproducibility claim is about what gets written down, so the bytes are what
 * the property compares.
 */
export function serializeTrial(plan: TrialPlan): string {
  return JSON.stringify([
    plan.arm,
    plan.kind,
    plan.seed,
    plan.index,
    plan.surfaceId,
    plan.targetSiteId,
    [...plan.prefix],
    plan.position,
    plan.half ?? null,
  ]);
}

export function serializeCampaign(plan: CampaignPlan): string {
  return JSON.stringify([
    plan.seed,
    plan.surfaceId,
    plan.targetSiteId,
    plan.trials.map(serializeTrial),
  ]);
}

/**
 * Validate a plan AT CONSUMPTION.
 *
 * Producer-side properties only ever see planner-generated plans; a plan reaches
 * `runTrial` through a serialization boundary, and a consumer that COPIES the
 * serialized `position` adjudicates a tampered one while a consumer that
 * RE-DERIVES it refuses. Both invariants are re-derived here, never trusted.
 */
export function validatePlan(plan: TrialPlan): { ok: true } | { ok: false; detail: string } {
  if (plan.prefix.includes(plan.targetSiteId)) {
    return {
      ok: false,
      detail:
        `plan prefix contains the TARGET ${JSON.stringify(plan.targetSiteId)}. A prefix is ` +
        `OTHER mutants (spec 5.1); running the target twice binds its verdict to a condition ` +
        `the design never defines.`,
    };
  }
  const derived = plan.prefix.length + 1;
  if (plan.position !== derived) {
    return {
      ok: false,
      detail:
        `plan position ${plan.position} disagrees with the derivation: a prefix of ` +
        `${plan.prefix.length} puts the target at ${derived}. Position is DERIVED, never ` +
        `trusted from the serialization.`,
    };
  }
  return { ok: true };
}
