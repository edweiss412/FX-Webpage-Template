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
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type InputStamp, resolveSurface, stampInputs } from "./determinism";
import { type Mutant, generateMutants } from "./generate";
import { type Site, siteId } from "./operators";
import { type Verdict, classify } from "./oracle";
import { type RunRecord, recordDir, writeRunRecord } from "./records";
import type { GuardSurface } from "./registry";
import { type ChildRecord, MutantRunInfraError, runMutantRecorded } from "./runner";

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
  | "population"
  | "plan"
  | "receipt"
  | "order"
  | "provenance"
  | "record";

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

/* --------------------------------------------------------------------- trial */

/** The overlay file every step's bytes are written to, inside the trial's scratch dir. */
export const MUTANT_FILE_NAME = "mutant.ts";

/** The baseline step's site id. Not a real site — the baseline runs UNMUTATED source. */
export const BASELINE_STEP = "<baseline>";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export type RunMutantArgs = {
  root: string;
  target: string;
  mutantFile: string;
  suites: readonly string[];
  context: string;
};

/**
 * What the executor reports back.
 *
 * `executed` is the load-bearing field: a planner or executor that runs a
 * DIFFERENT order than planned is invisible in `code` and `children` alike, and
 * the seam's own report of WHAT IT RAN is the only place the divergence is
 * observable. `DEFAULT_TRIAL_DEPS` passes the requested context straight
 * through, so the check is silent on the production path and loud on a bug.
 */
export type RunMutantResult = {
  code: number;
  children: ChildRecord[];
  executed: string;
};

export type TrialDeps = {
  writeMutant: (path: string, text: string) => void;
  readBack: (path: string) => Buffer;
  runMutant: (args: RunMutantArgs) => RunMutantResult;
  stamp: (
    root: string,
    surface: GuardSurface,
    executed?: Readonly<Record<string, string>>,
  ) => InputStamp;
  now: () => number;
  pid: () => number;
  nonce: () => string;
  writeRecord?: (record: RunRecord, dir: string) => void;
};

export type StepReport = {
  siteId: string;
  role: "baseline" | "prefix" | "target";
  /** sha-256 of the bytes READ BACK FROM DISK immediately before this step's spawn. */
  receiptSha: string;
  exitCode: number;
  verdict: Verdict;
  children: readonly ChildRecord[];
  /**
   * Binds this entry's fields to EACH OTHER.
   *
   * A serializer that rotates child arrays among steps preserves the receipt
   * sequence, the report count and the child multiset — right evidence, wrong
   * mutant — and every per-field check still passes. The digest is over the
   * whole entry, so the rotation moves it.
   */
  digest: string;
};

export type TrialReport = {
  plan: TrialPlan;
  /** The child's OWN pid, read inside the child. The parent records its own separately. */
  childPid: number;
  /** Minted INSIDE the child. A parent that mints it and passes it in proves nothing. */
  nonce: string;
  steps: readonly StepReport[];
  stampBefore: InputStamp;
  stampAfter: InputStamp;
  /** Declared inputs whose bytes differ between the two stamps. */
  inputsMoved: string[];
  /** False iff `inputsMoved` is non-empty: the trial ran, its inputs are not the declared ones. */
  attributable: boolean;
  /** False iff any step infra-faulted. A partial trial is reported, never scored as whole. */
  completed: boolean;
  infraFaults: string[];
  /** The trial's own [spawn, exit] interval — arm C's in-window sample rule reads it. */
  window: { spawnedAt: number; exitedAt: number };
};

export type TrialOutcome = { kind: "report"; report: TrialReport } | Refusal;

/** Every field of a step entry the digest reads, DERIVED from the record itself. */
export function digestedFieldsOf(step: StepReport): string[] {
  return Object.keys(step)
    .filter((k) => k !== "digest")
    .sort();
}

/**
 * The whole-entry digest.
 *
 * Its field set is derived from the RECORD rather than enumerated, because a
 * digest is blind to every field it omits and a hand-written list goes stale the
 * moment the entry gains one. The suite proves discrimination PER FIELD.
 */
export function stepDigest(step: StepReport): string {
  const record = step as unknown as Record<string, unknown>;
  return createHash("sha256")
    .update(JSON.stringify(digestedFieldsOf(step).map((f) => [f, record[f]])))
    .digest("hex")
    .slice(0, 16);
}

const sealStep = (step: Omit<StepReport, "digest">): StepReport => {
  const withEmpty = { ...step, digest: "" } as StepReport;
  return { ...withEmpty, digest: stepDigest(withEmpty) };
};

/**
 * Run ONE trial. Executes INSIDE the child process.
 *
 * Order: the green-baseline check, then the prefix in plan order, then the
 * target — each through the SHIPPED `runMutantRecorded` behind the `runMutant`
 * seam. Every step writes its bytes, READS THEM BACK from disk, and receipts the
 * read-back: a receipt computed from PLANNED text attests the plan rather than
 * the disk, and an implementation that skips the write then produces a receipt
 * that still verifies.
 */
export type TrialOptions = {
  /**
   * Where this trial's records go.
   *
   * Defaults to the SHIPPED `recordDir` resolver, which reads
   * `MUTATION_RECORD_DIR` from the environment — so a campaign directory is
   * passed to the child through its env and a spawner that omits the override
   * writes production records into the gate's own channel.
   */
  recordDir?: string;
  runId?: string;
};

export function runTrial(
  plan: TrialPlan,
  target: Target,
  deps: TrialDeps,
  options: TrialOptions = {},
): TrialOutcome {
  const planVerdict = validatePlan(plan);
  if (!planVerdict.ok) return refuse("plan", planVerdict.detail);

  const byId = new Map(target.mutants.map((m) => [siteId(m.site), m.text] as const));
  for (const site of plan.prefix) {
    if (!byId.has(site)) {
      return refuse(
        "plan",
        `prefix names ${JSON.stringify(site)}, which is not a mutant of surface ` +
          `${JSON.stringify(target.surface.id)}. A prefix step that cannot be generated cannot ` +
          `be executed, and a trial that skips it silently reports a condition that never ran.`,
      );
    }
  }
  const targetText = byId.get(plan.targetSiteId);
  if (targetText === undefined) {
    return refuse(
      "plan",
      `target ${JSON.stringify(plan.targetSiteId)} is not a mutant of this surface`,
    );
  }

  const mutantFile = MUTANT_FILE_NAME;
  const suites = target.surface.suitePaths;
  const steps: StepReport[] = [];
  const infraFaults: string[] = [];

  // BEFORE the first spawn. `stampInputs` is a single instantaneous read, so
  // the timing is entirely this caller's obligation: an implementation taking
  // both stamps consecutively before execution reports the pair identical and
  // adjudicates a mid-trial edit it never saw.
  const stampBefore = deps.stamp(target.sourceAbs.replace(/[^/]*$/, ""), target.surface);
  const spawnedAt = deps.now();

  // The runner CONTEXT is what the shipped `runSurface` passes — `<id> baseline`
  // for the baseline, the site id otherwise — so an infra fault raised inside
  // `runMutantRecorded` names the same thing here as it does in a gate run. The
  // step's own `siteId` is separate, because the baseline is not a site.
  const sequence: {
    site: string;
    context: string;
    text: string;
    role: StepReport["role"];
  }[] = [
    {
      site: BASELINE_STEP,
      context: `${target.surface.id} baseline`,
      text: target.sourceText,
      role: "baseline",
    },
    ...plan.prefix.map((site) => ({
      site,
      context: site,
      text: byId.get(site) as string,
      role: "prefix" as const,
    })),
    {
      site: plan.targetSiteId,
      context: plan.targetSiteId,
      text: targetText,
      role: "target" as const,
    },
  ];

  for (const step of sequence) {
    deps.writeMutant(mutantFile, step.text);
    const readBack = deps.readBack(mutantFile);
    const receiptSha = sha256(readBack);
    if (receiptSha !== sha256(Buffer.from(step.text, "utf8"))) {
      const isOriginal = receiptSha === sha256(Buffer.from(target.sourceText, "utf8"));
      return refuse(
        "receipt",
        `read-back for ${JSON.stringify(step.site)} does not match the bytes this step was ` +
          `asked to run` +
          (isOriginal
            ? `: the file still holds the ORIGINAL source, so the write never landed and this ` +
              `step would have executed unmutated bytes under a receipt that verifies.`
            : `. The disk holds neither the planned mutant nor the original.`),
      );
    }

    let result: RunMutantResult;
    try {
      result = deps.runMutant({
        root: target.sourceAbs,
        target: target.sourceAbs,
        mutantFile,
        suites,
        context: step.context,
      });
    } catch (e) {
      if (e instanceof MutantRunInfraError) {
        // EXCLUDED from the step list and reported by name. Folding a fault into
        // KILLED inflates the score with a kill the suite never earned.
        infraFaults.push(step.site);
        continue;
      }
      throw e;
    }

    if (result.executed !== step.context) {
      return refuse(
        "order",
        `plan/executed mismatch: this step planned ${JSON.stringify(step.context)} and the ` +
          `executor reports it ran ${JSON.stringify(result.executed)}. A shuffled execution ` +
          `order is invisible in the exit code and the child records alike.`,
      );
    }

    steps.push(
      sealStep({
        siteId: step.site,
        role: step.role,
        receiptSha,
        exitCode: result.code,
        verdict: classify(result.code),
        children: result.children,
      }),
    );

    if (step.role === "baseline" && result.code !== 0) {
      return refuse(
        "baseline",
        `the baseline is RED (exit ${result.code}) on ${suites.join(", ")}. Against an already-red ` +
          `suite every mutant scores KILLED and the observation means nothing.`,
      );
    }
  }

  const exitedAt = deps.now();
  const stampAfter = deps.stamp(target.sourceAbs.replace(/[^/]*$/, ""), target.surface);
  const inputsMoved = Object.keys(stampBefore.files).filter(
    (path) => stampBefore.files[path] !== stampAfter.files[path],
  );

  const report: TrialReport = {
    plan,
    childPid: deps.pid(),
    nonce: deps.nonce(),
    steps,
    stampBefore,
    stampAfter,
    inputsMoved,
    attributable: inputsMoved.length === 0,
    completed: infraFaults.length === 0,
    infraFaults,
    window: { spawnedAt, exitedAt },
  };

  if (deps.writeRecord !== undefined) {
    const dir = options.recordDir ?? recordDir();
    const scored = report.steps.filter((s) => s.role !== "baseline");
    deps.writeRecord(
      {
        surfaceId: target.surface.id,
        runId: options.runId ?? `trial-${plan.arm}-${plan.index}-${spawnedAt}`,
        startedAt: new Date(spawnedAt).toISOString(),
        passed: report.completed && report.attributable,
        score:
          scored.length === 0
            ? 0
            : scored.filter((s) => s.verdict === "KILLED").length / scored.length,
        outcomes: scored.map((s) => ({
          siteId: s.siteId,
          verdict: s.verdict,
          children: s.children,
        })),
      },
      dir,
    );
  }

  return { kind: "report", report };
}

/**
 * The PARENT's independent cross-check of a child's report.
 *
 * Every receipt is verified against mutant bytes the parent recomputes from its
 * OWN generation run — not against anything the child sent — and every step's
 * whole-entry digest is recomputed. The two sides are independent by
 * construction: the child hashes what it read off disk, the parent hashes what
 * the shipped generator produces.
 */
export function verifyTrialReport(
  report: TrialReport,
  target: Target,
): { ok: true } | { ok: false; input: ProbeRefusedInput; detail: string } {
  const planVerdict = validatePlan(report.plan);
  if (!planVerdict.ok) return { ok: false, input: "plan", detail: planVerdict.detail };

  const expectedSha = new Map<string, string>([
    [BASELINE_STEP, sha256(Buffer.from(target.sourceText, "utf8"))],
    ...target.mutants.map(
      (m) => [siteId(m.site), sha256(Buffer.from(m.text, "utf8"))] as [string, string],
    ),
  ]);

  const planned = [BASELINE_STEP, ...report.plan.prefix, report.plan.targetSiteId].filter(
    (site) => !report.infraFaults.includes(site),
  );
  if (report.steps.length !== planned.length) {
    return {
      ok: false,
      input: "receipt",
      detail:
        `report carries ${report.steps.length} steps where the plan implies ${planned.length} ` +
        `(${planned.join(" -> ")}). A missing step shrinks the evidence without shrinking the claim.`,
    };
  }

  for (const [i, step] of report.steps.entries()) {
    const expectedSite = planned[i] as string;
    if (step.siteId !== expectedSite) {
      return {
        ok: false,
        input: "receipt",
        detail: `step ${i} reports ${JSON.stringify(step.siteId)} where the plan puts ${JSON.stringify(expectedSite)}`,
      };
    }
    if (stepDigest(step) !== step.digest) {
      return {
        ok: false,
        input: "receipt",
        detail:
          `step ${i} (${step.siteId}) does not match its own whole-entry digest: its fields have ` +
          `been re-bound since it was sealed. Right evidence attached to the wrong mutant is the ` +
          `wrong-attribution direction the bound forbids.`,
      };
    }
    const want = expectedSha.get(step.siteId);
    if (want === undefined) {
      return {
        ok: false,
        input: "receipt",
        detail: `step ${i} names ${JSON.stringify(step.siteId)}, which this surface does not generate`,
      };
    }
    if (step.receiptSha !== want) {
      return {
        ok: false,
        input: "receipt",
        detail:
          `step ${i} (${step.siteId}) receipts ${step.receiptSha.slice(0, 12)} where the parent's ` +
          `own generation produces ${want.slice(0, 12)}`,
      };
    }
    if (step.verdict !== classify(step.exitCode)) {
      return {
        ok: false,
        input: "receipt",
        detail: `step ${i} (${step.siteId}) reports verdict ${step.verdict} against exit ${step.exitCode}`,
      };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------- parent-side observation */

/**
 * Everything the PARENT controls about a child launch.
 *
 * The nonce-provenance sweep iterates THIS object's own keys, so a new channel
 * joins the sweep by existing rather than by being remembered — a parent minting
 * the nonce as the scratch-directory basename defeats a plan/argv/env-only
 * enumeration, and `cwd` is a parent input exactly as the others are.
 */
export type SpawnRequest = {
  plan: TrialPlan;
  argv: readonly string[];
  env: Readonly<Record<string, string>>;
  cwd: string;
};

export type SpawnResult = {
  /** Observed by the parent FROM ITS OWN SPAWN HANDLE — never copied from the child. */
  pid: number | undefined;
  reportPath: string;
};

export type ParentDeps = {
  spawnChild: (request: SpawnRequest) => SpawnResult;
  /** The child's report file, RAW, so the nonce can be sought in bytes the child wrote. */
  readReportBytes: (path: string) => Buffer;
};

export type TrialObservation = {
  plan: TrialPlan;
  /** The parent's own observation. Two independent sides, never one copied twice. */
  parentPid: number;
  report: TrialReport;
};

export type ObservationOutcome = { kind: "observation"; observation: TrialObservation } | Refusal;

/** Every parent-controlled channel, DERIVED from the spawn request's own keys. */
export function spawnChannels(request: SpawnRequest): { channel: string; text: string }[] {
  return Object.keys(request)
    .sort()
    .map((channel) => ({
      channel,
      text: JSON.stringify((request as unknown as Record<string, unknown>)[channel]),
    }));
}

/**
 * Spawn one trial and bind its report to the parent's OWN observation of it.
 *
 * A nonce-only freshness check is not sufficient: one process can mint a
 * distinct nonce per fabricated trial, and only the parent-side spawn
 * observation is something fabrication-without-spawning cannot produce. Equally,
 * a parent that MINTS the nonce and passes it in for the child to echo satisfies
 * every raw-file and equality check — so the nonce must also appear in NONE of
 * the parent's own inputs.
 */
export function observeTrial(
  plan: TrialPlan,
  target: Target,
  deps: ParentDeps,
  request: Omit<SpawnRequest, "plan">,
): ObservationOutcome {
  const full: SpawnRequest = { plan, ...request };
  const { pid, reportPath } = deps.spawnChild(full);
  if (pid === undefined) {
    return refuse(
      "provenance",
      `the spawn handle produced NO pid for trial ${plan.arm}#${plan.index}, so the parent has ` +
        `no observation of its own to bind the child's report to.`,
    );
  }

  const bytes = deps.readReportBytes(reportPath);
  let report: TrialReport;
  try {
    report = JSON.parse(bytes.toString("utf8")) as TrialReport;
  } catch (e) {
    return refuse(
      "provenance",
      `child report at ${reportPath} did not parse: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (report.childPid !== pid) {
    return refuse(
      "provenance",
      `pid DISAGREEMENT for trial ${plan.arm}#${plan.index}: the parent observed ${pid} from its ` +
        `own spawn handle and the child reports ${report.childPid}. An implementation that copies ` +
        `the child-reported pid into the parent-observed field can never see this.`,
    );
  }

  // The nonce is READ OUT OF the bytes the child wrote and is never accepted
  // from any other channel, so "it occurs in those bytes" holds by construction
  // and a runtime check for it would be a tautology — a case the shape cannot
  // express is not a case a check can catch. What the shape CAN express is a
  // child that reported no usable nonce at all, and that is checked.
  if (typeof report.nonce !== "string" || report.nonce.trim() === "") {
    return refuse(
      "provenance",
      `the child report carries no nonce (${JSON.stringify(report.nonce)}), so nothing in it ` +
        `distinguishes this process from a loop minting fabricated trials in one.`,
    );
  }

  for (const { channel, text } of spawnChannels(full)) {
    if (text.includes(report.nonce)) {
      return refuse(
        "provenance",
        `the nonce ${JSON.stringify(report.nonce)} occurs in the parent-controlled ${channel}, so ` +
          `the child may simply have echoed a value the parent minted. A pass-through necessarily ` +
          `places the value in one of these inputs; minting inside the child cannot.`,
      );
    }
  }

  const verified = verifyTrialReport(report, target);
  if (!verified.ok) return refuse(verified.input, verified.detail);

  return { kind: "observation", observation: { plan, parentPid: pid, report } };
}

/* ------------------------------------------------------------ production wiring */

/**
 * The REAL seams.
 *
 * Asserted separately from the injected ones: an injectable seam certifies a
 * production path only if the default is bound to the production collaborators,
 * and a seam wired to a stub passes every injection test while the operator's
 * command exercises nothing.
 */
export const DEFAULT_TRIAL_DEPS: TrialDeps = {
  writeMutant: (path, text) => writeFileSync(path, text, "utf8"),
  readBack: (path) => readFileSync(path),
  runMutant: (args) => {
    const { code, children } = runMutantRecorded(
      args.root,
      args.target,
      args.mutantFile,
      args.suites,
      args.context,
    );
    // The requested context IS what ran: this adapter neither reorders nor
    // relabels, so the order check is silent here and loud on a bug elsewhere.
    return { code, children, executed: args.context };
  },
  stamp: (root, surface, executed) => stampInputs(root, surface, executed),
  now: () => Date.now(),
  pid: () => process.pid,
  /** Minted INSIDE the child, from the child's own entropy. */
  nonce: () => randomUUID(),
  writeRecord: (record, dir) => {
    writeRunRecord(record, { dir });
  },
};
