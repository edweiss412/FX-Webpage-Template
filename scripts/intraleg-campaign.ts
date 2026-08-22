#!/usr/bin/env tsx
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Verdict } from "../tests/mutation/source/oracle";
import { DEFAULT_RECORD_DIR } from "../tests/mutation/source/records";
import {
  type CampaignTrial,
  type LoadSample,
  type TrialPlan,
  aggregateCampaign,
  makeParentDeps,
  observeTrial,
  parseSeed,
  parseTrials,
  planCampaign,
  renderCampaign,
  renderCampaignPlan,
  resolveTarget,
} from "../tests/mutation/source/processProbe";

/**
 * The pre-registered campaign for the intra-leg process-boundary probe.
 *
 * Spec §5.2 is the three arms; spec §3 is the graduation posture, written before
 * any trial ran. This driver EXECUTES and does not adjudicate: every reading
 * comes from the core's `aggregateCampaign`/`renderCampaign`, and §3 is quoted
 * VERBATIM at adjudication rather than paraphrased here — a campaign whose
 * reading is composed after the results land is not a pre-registered one.
 *
 * HEAVY: one child per trial, each spawning a vitest per declared suite. Its
 * outermost entry is wrapped — `pnpm heavy pnpm exec tsx scripts/intraleg-campaign.ts`
 * — and launched with run_in_background, since a foreground call dies at the
 * documented 600 s cap.
 *
 * The worktree is FROZEN for the whole run: `psqlStartupScan`'s deciding suite
 * walks the repository, so the freeze is NO tree edits at all, and the per-trial
 * stamps are the detector if it slips.
 */
const ROOT = process.cwd();
// `node --import tsx`, never `pnpm exec tsx`: the wrapper's pid is not the
// trial's, and the parent's independent observation must be of the process that
// actually ran the trial (measured — see the live suite's note).
const CHILD_ARGV = [
  process.execPath,
  "--import",
  "tsx",
  "scripts/mutation-process-probe-child.ts",
  "--invocation",
];

/** Arm C's sampler cadence: 15 s, so a ~40-45 s window holds at least two samples. */
export const SAMPLE_INTERVAL_MS = 15_000;
/** How long a burner runs before self-terminating, if the driver dies first. */
const BURNER_TTL_MS = 900_000;
/** Operator error: a flag the accept-sets reject. Distinct from a campaign that RAN and refused. */
const CAMPAIGN_EXIT_USAGE = 2;
/** The site design §2 records an anomaly for. Any other site must declare its own. */
const DEFAULT_SITE = "relational-boundary:3578:35:<><=";

/**
 * Read one flag, and DO NOT SUBSTITUTE A DEFAULT FOR A MALFORMED VALUE.
 *
 * A named flag with a missing or flag-shaped value silently fell back, so
 * `--out --seed 1` ran the campaign into `.mutation-campaign` — the one location
 * the record says must not be used, because unlike `.mutation-records` it is not
 * gitignored and dirties the tree the trials are measuring. An omitted flag
 * takes the default; a MALFORMED one is an operator error and exits.
 */
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    process.stderr.write(
      `--${name} was given with no value (next token: ${JSON.stringify(v ?? "end of argv")}). ` +
        `Refusing rather than falling back to ${JSON.stringify(fallback)}: a silent default ` +
        `here runs a different campaign than the one asked for, and for --out it writes into a ` +
        `directory that is not gitignored.\n`,
    );
    process.exit(2);
  }
  return v;
};

/**
 * ATTEST the tree the campaign ran against, rather than commenting that it was
 * frozen.
 *
 * `stampInputs` covers the surface's declared inputs only, and the deciding
 * suite walks the whole repository — so a file added mid-campaign can move a
 * verdict while every stamp holds. The freeze was a procedure; this makes it
 * evidence. Recorded at both ends and compared, so the record says whether the
 * tree moved instead of asserting that it did not.
 */
function attestTree(): { head: string; dirty: string[] } {
  const at = (args: string[]): string =>
    (spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout ?? "").trim();
  return {
    head: at(["rev-parse", "HEAD"]),
    dirty: at(["status", "--porcelain"]).split("\n").filter(Boolean),
  };
}

/** One timestamped load-average sample. The timestamp is what the in-window rule reads. */
export function sampleLoad(now: number = Date.now()): LoadSample | null {
  const r = spawnSync("sysctl", ["-n", "vm.loadavg"], { encoding: "utf8" });
  // `{ 1.23 4.56 7.89 }` — the FIRST figure is the 1-minute average.
  const m = /([0-9]+\.[0-9]+)/.exec(r.stdout ?? "");
  return m === null ? null : { at: now, loadAvg1: Number(m[1]) };
}

/**
 * One CPU burner per REPORTED core (`sysctl -n hw.ncpu`), for arm C's loaded
 * half. Each self-terminates on a TTL so a driver death cannot leave the machine
 * pinned — the orphan class this repo's reaper exists for.
 */
function startBurners(): { count: number; kill: () => void } {
  const reported = (
    spawnSync("sysctl", ["-n", "hw.ncpu"], { encoding: "utf8" }).stdout ?? ""
  ).trim();
  const count = Number(reported) || cpus().length;
  const kids = Array.from({ length: count }, () =>
    spawn(
      process.execPath,
      ["-e", `const end = Date.now() + ${BURNER_TTL_MS}; while (Date.now() < end) {}`],
      {
        stdio: "ignore",
      },
    ),
  );
  return { count, kill: () => kids.forEach((k) => k.kill("SIGKILL")) };
}

type RefusedTrial = { plan: TrialPlan; input: string; detail: string };

/** Flags this driver understands. Anything else `--`-shaped is an operator error. */
const KNOWN_FLAGS = new Set(["surface", "site", "anomaly", "seed", "trials", "out"]);

export function main(): number {
  // DEFAULT-DENY on the flag names. The reader takes the FIRST occurrence of a
  // recognized flag and ignores every other token, so `--trail 13` silently ran
  // the default 12-trial campaign and `--trials 5 --trials 9` silently took 5
  // (round 4). A typo that changes what runs while reporting success is the
  // worst shape available to a measuring instrument.
  const flagTokens = process.argv.filter((a) => a.startsWith("--"));
  const unknown = flagTokens.filter((a) => !KNOWN_FLAGS.has(a.slice(2)));
  if (unknown.length > 0) {
    process.stderr.write(
      `unknown flag(s): ${unknown.join(", ")}. Known: ${[...KNOWN_FLAGS].map((f) => `--${f}`).join(", ")}. ` +
        `Refusing rather than running a default campaign the operator did not ask for.\n`,
    );
    return CAMPAIGN_EXIT_USAGE;
  }
  const repeated = flagTokens.filter((a, i) => flagTokens.indexOf(a) !== i);
  if (repeated.length > 0) {
    process.stderr.write(
      `flag(s) given more than once: ${[...new Set(repeated)].join(", ")}. The reader takes the ` +
        `first occurrence, so the later value would be silently discarded.\n`,
    );
    return CAMPAIGN_EXIT_USAGE;
  }

  const surfaceId = arg("surface", "psqlStartupScan");
  const site = arg("site", "relational-boundary:3578:35:<><=");
  // THE ANOMALY IS A PROPERTY OF THE SITE, and this driver accepts any surface
  // and site the operator names. Making `anomalousVerdict` required in the core
  // closed the type hole and left THIS path — the only one a real campaign takes
  // — still hardcoding KILLED, so on a normally-killed site every ordinary trial
  // would be reported as a reproduction. The default matches the default site
  // (design §2: it survives 9 of 10 observations); ANY other site must say so.
  const anomalyRaw = arg("anomaly", site === DEFAULT_SITE ? "KILLED" : "");
  if (anomalyRaw !== "KILLED" && anomalyRaw !== "SURVIVED") {
    process.stderr.write(
      `--anomaly must be KILLED or SURVIVED, got ${JSON.stringify(anomalyRaw)}. It has no ` +
        `default away from ${JSON.stringify(DEFAULT_SITE)}, whose anomalous outcome is recorded ` +
        `as KILLED (design §2). A default here would be a claim about a site nobody measured: ` +
        `on a normally-killed site, KILLED calls every ordinary trial a reproduction and misses ` +
        `the anomalous survival.\n`,
    );
    return CAMPAIGN_EXIT_USAGE;
  }
  const anomalousVerdict: Verdict = anomalyRaw;
  const seedParsed = parseSeed(arg("seed", "20260821"));
  if (!seedParsed.ok) {
    process.stderr.write(`${seedParsed.detail}\n`);
    return CAMPAIGN_EXIT_USAGE;
  }
  const seed = seedParsed.value;
  const trialsParsed = parseTrials(arg("trials", "12"));
  if (!trialsParsed.ok) {
    process.stderr.write(`${trialsParsed.detail}\n`);
    return CAMPAIGN_EXIT_USAGE;
  }
  const armATrials = trialsParsed.value;
  const outDir = resolve(arg("out", ".mutation-campaign"));
  const recordDir = join(outDir, "records");

  const resolved = resolveTarget({ root: ROOT, surfaceId, site });
  if (resolved.kind === "refusal") {
    process.stderr.write(`REFUSED (${resolved.input}): ${resolved.detail}\n`);
    return 2;
  }
  const target = resolved.target;

  const plan = planCampaign({ target, seed, armATrials });
  if ("kind" in plan) {
    process.stderr.write(`REFUSED (${plan.input}): ${plan.detail}\n`);
    return 2;
  }

  // ATTEST BEFORE CREATING ANYTHING. `mkdirSync` ran first, so the campaign's own
  // output directory appeared in BOTH snapshots as the same `??` line and the
  // comparison passed over it — a differential guard cannot see what preceded
  // both of its ends (probed at diff review round 3).
  const treeBefore = attestTree();
  // The extension set is the SCAN'S, not a hand-typed subset: the first version
  // omitted `.jsx` and `.bash`, both of which the deciding suite scans (round 4).
  // Porcelain has two more shapes it missed — a path containing spaces arrives
  // QUOTED, so the extension is not at the end of the line, and an untracked
  // directory collapses to `?? scratch/`, hiding every file beneath it. Both are
  // treated as dirty rather than parsed: a refusal that is occasionally too
  // strict costs one commit, and the alternative costs a whole campaign.
  const SCANNED_DIRTY = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sh|bash|ya?ml)"?$/;
  const dirtyScannable = treeBefore.dirty.filter((l) => {
    const path = l.slice(3).trim();
    return path.endsWith("/") || SCANNED_DIRTY.test(path);
  });
  if (dirtyScannable.length > 0) {
    // A CLEAN START IS A SEPARATE ASSERTION from "nothing changed". An already-
    // modified file can change bytes again and keep the same porcelain line, so
    // the diff of two snapshots is blind to it. The deciding suite walks the
    // repository, so any dirty scannable file can move a verdict.
    process.stderr.write(
      `REFUSING: the working tree is dirty over ${dirtyScannable.length} file(s) the deciding ` +
        `suite scans:\n${dirtyScannable.join("\n")}\n` +
        `A campaign attests that the tree did not MOVE; it cannot attest that an already-\n` +
        `modified file kept its bytes, because the porcelain line is identical either way.\n`,
    );
    return CAMPAIGN_EXIT_USAGE;
  }

  mkdirSync(recordDir, { recursive: true });
  // AC-6's production-isolation evidence on the REAL run. A spawner that omits
  // the override from the CHILD env writes production records into the gate's
  // own channel while every in-process pair stays green, so the default
  // channel's listing is captured before and compared after.
  const defaultBefore = existsSync(DEFAULT_RECORD_DIR)
    ? readdirSync(DEFAULT_RECORD_DIR).sort()
    : [];

  process.stdout.write(renderCampaignPlan(plan));
  process.stdout.write(
    `TARGET POSITION: ${target.position} of ${target.mutants.length} in generation order\n\n`,
  );

  const trials: CampaignTrial[] = [];
  const refusals: RefusedTrial[] = [];

  for (const trialPlan of plan.trials) {
    const deps = makeParentDeps({
      root: ROOT,
      scratchDir: join(outDir, `trial-${trialPlan.arm}-${trialPlan.index}`),
      surfaceId,
      siteId: site,
      timeoutMs: 1_800_000,
    });

    let burners: { count: number; kill: () => void } | null = null;
    let sampler: NodeJS.Timeout | null = null;
    const samples: LoadSample[] = [];
    if (trialPlan.arm === "C") {
      if (trialPlan.half === "loaded") burners = startBurners();
      const first = sampleLoad();
      if (first !== null) samples.push(first);
      sampler = setInterval(() => {
        const s = sampleLoad();
        if (s !== null) samples.push(s);
      }, SAMPLE_INTERVAL_MS);
    }

    // try/finally, because the release path was STRAIGHT-LINE and the observe
    // call can throw: `observeTrial` reads the child's report file, which is
    // absent whenever the child was killed by its spawn timeout or by the
    // machine's reaper. On that path one burner per core survived to its
    // 900 s TTL — on a host whose whole slot semaphore exists because nine
    // unbounded arcs hard-reset it once.
    const started = Date.now();
    let outcome: ReturnType<typeof observeTrial>;
    try {
      outcome = observeTrial(trialPlan, target, deps, {
        argv: CHILD_ARGV,
        env: { MUTATION_RECORD_DIR: recordDir },
        cwd: ROOT,
      });
    } finally {
      if (sampler !== null) clearInterval(sampler);
      if (burners !== null) burners.kill();
    }
    const elapsed = Date.now() - started;

    const label =
      `TRIAL ${trialPlan.arm}#${trialPlan.index} (${trialPlan.kind}, prefix ` +
      `${trialPlan.prefix.length}${trialPlan.half === undefined ? "" : `, ${trialPlan.half}`})`;

    if (outcome.kind === "refusal") {
      // Reported, never silently dropped: a refused trial did not run, and the
      // arm's eligible count has to show it.
      process.stdout.write(`${label}: REFUSED (${outcome.input}) ${outcome.detail}\n`);
      refusals.push({ plan: trialPlan, input: outcome.input, detail: outcome.detail });
      continue;
    }

    const verdict = outcome.observation.report.steps.find((s) => s.role === "target")?.verdict;
    process.stdout.write(
      `${label}: ${verdict ?? "no target step"} in ${Math.round(elapsed / 1000)} s` +
        `${samples.length === 0 ? "" : `, ${samples.length} load sample(s)`}` +
        `${burners === null ? "" : ` under ${burners.count} burner(s)`}\n`,
    );
    trials.push({
      observation: outcome.observation,
      ...(samples.length === 0 ? {} : { loadSamples: samples }),
    });
  }

  const aggregate = aggregateCampaign({
    // DECLARED, both of them. The anomaly for this site is KILLED — it survives
    // 9 of 10 recorded observations (design §2) — and the arm universe is what
    // the campaign SET OUT to run, so an arm that produced nothing is still
    // present to be reported starved.
    anomalousVerdict,
    plan,
    declaredArms: ["A", "B", "C"],
    plannedPerArm: { A: armATrials, B: 6, C: 2 },
    trials,
  });
  const report = renderCampaign(aggregate);
  process.stdout.write(`\n${report}`);

  const treeAfter = attestTree();
  const defaultAfter = existsSync(DEFAULT_RECORD_DIR) ? readdirSync(DEFAULT_RECORD_DIR).sort() : [];
  // MATCHED TO THE PLAN'S TRIALS, not counted. A raw directory listing let 20
  // stale, malformed, unrelated or directory entries satisfy a 20-trial campaign
  // — and it composes with a child whose record write failed, since 20 stale
  // files plus 20 failed writes still counts 20 (round 4). Each planned trial's
  // record is identified by the runId this driver gives it.
  const recordFiles = existsSync(recordDir)
    ? readdirSync(recordDir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
    : [];
  const campaignRecords = plan.trials.filter((t) =>
    recordFiles.some((f) => f.includes(`trial-${t.arm}-${t.index}-`)),
  );
  const unmatchedFiles = recordFiles.filter(
    (f) => !plan.trials.some((t) => f.includes(`trial-${t.arm}-${t.index}-`)),
  );
  const identical = JSON.stringify(defaultBefore) === JSON.stringify(defaultAfter);
  process.stdout.write(
    `\nRECORD ISOLATION (AC-6, on the real run)\n` +
      `  campaign dir ${recordDir}: ${campaignRecords.length} of ${plan.trials.length} ` +
      `planned trials matched a record; ${unmatchedFiles.length} file(s) matched no ` +
      `planned trial\n` +
      `  default dir ${DEFAULT_RECORD_DIR}: ${defaultBefore.length} before, ${defaultAfter.length} after\n` +
      `  byte-identical listings: ${identical}\n` +
      `TREE ATTESTATION (the freeze, observed rather than asserted)\n` +
      `  HEAD ${treeBefore.head} -> ${treeAfter.head}` +
      `${treeBefore.head === treeAfter.head ? " (unchanged)" : " CHANGED MID-CAMPAIGN"}\n` +
      `  uncommitted files ${treeBefore.dirty.length} -> ${treeAfter.dirty.length}` +
      `${JSON.stringify(treeBefore.dirty) === JSON.stringify(treeAfter.dirty) ? " (unchanged)" : " CHANGED MID-CAMPAIGN"}\n` +
      `  NOTE: stampInputs covers the declared inputs only; the deciding suite walks the\n` +
      `  whole repository, so this attestation is what speaks for everything else.\n`,
  );

  writeFileSync(
    join(outDir, "campaign.json"),
    `${JSON.stringify(
      { plan, trials, refusals, aggregate, defaultBefore, defaultAfter, treeBefore, treeAfter },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(join(outDir, "report.txt"), report, "utf8");

  const verdict = campaignVerdict({
    aggregateKind: aggregate.kind,
    starvedArms:
      aggregate.kind === "aggregate"
        ? aggregate.arms.filter((a) => a.eligible === 0).map((a) => a.arm)
        : [],
    refusedTrials: refusals.length,
    defaultChannelIdentical: identical,
    treeUnchanged:
      treeBefore.head === treeAfter.head &&
      JSON.stringify(treeBefore.dirty) === JSON.stringify(treeAfter.dirty),
    campaignRecordCount: campaignRecords.length,
    // The DURABLE evidence has to be complete, not merely present. A nonempty
    // directory passed with 19 records for 20 planned trials, and a reused
    // directory's stale records satisfied the same check.
    plannedTrialCount: plan.trials.length,
  });
  if (verdict.code !== 0) process.stderr.write(`${verdict.detail}\n`);
  return verdict.code;
}

/**
 * The campaign's own exit decision, PURE so each gate can be probed against a
 * constructed failing input without spending an hour of a heavy slot.
 *
 * A gate nobody has watched fail is a gate nobody has verified, and the
 * composition of these conditions into one exit code is the part no other suite
 * covers — each condition on its own is exercised by the core's cases.
 */
export function campaignVerdict(state: {
  aggregateKind: "aggregate" | "refusal";
  starvedArms: readonly string[];
  refusedTrials: number;
  defaultChannelIdentical: boolean;
  campaignRecordCount: number;
  /** How many trials the plan holds. The durable records must cover every one. */
  plannedTrialCount: number;
  /** False when HEAD or the uncommitted file list moved between the two attestations. */
  treeUnchanged: boolean;
}): { code: number; detail: string } {
  const reasons: string[] = [];
  // THE ATTESTATION HAS TO GATE. Printing "CHANGED MID-CAMPAIGN" and then exiting
  // zero is the exact shape this arc keeps finding elsewhere: a signal produced,
  // observed by nobody, and a green result on top of it. The deciding suite walks
  // the whole repository, so a tree that moved mid-run is a campaign whose trials
  // measured different programs.
  // Zero keeps its OWN named refusal below — an empty channel makes the isolation
  // comparison vacuous rather than failed, which is a different thing to tell an
  // operator than "short by one".
  if (state.campaignRecordCount > 0 && state.campaignRecordCount !== state.plannedTrialCount) {
    reasons.push(
      `the durable record channel holds ${state.campaignRecordCount} record(s) for ` +
        `${state.plannedTrialCount} planned trial(s)`,
    );
  }
  if (!state.treeUnchanged) {
    reasons.push("the WORKING TREE moved mid-campaign (HEAD or the uncommitted file list)");
  }
  if (state.aggregateKind === "refusal") reasons.push("the aggregate REFUSED");
  if (state.refusedTrials > 0) reasons.push(`${state.refusedTrials} refused trial(s)`);
  if (state.starvedArms.length > 0) {
    reasons.push(`arm(s) at ZERO eligible: ${state.starvedArms.join(", ")}`);
  }
  if (!state.defaultChannelIdentical) {
    reasons.push("the DEFAULT record channel changed during the run");
  }
  // Checked LAST and separately, because an empty campaign channel makes the
  // isolation comparison vacuous rather than failed: a clean diff against a
  // channel nothing was written to proves nothing at all.
  if (reasons.length === 0 && state.campaignRecordCount === 0) {
    return {
      code: 1,
      detail:
        "CAMPAIGN INCOMPLETE: the campaign record directory is EMPTY, so the isolation " +
        "evidence has no subject — a clean comparison against an empty channel proves nothing.",
    };
  }
  if (reasons.length === 0) return { code: 0, detail: "CAMPAIGN COMPLETE" };
  return {
    code: 1,
    detail:
      `CAMPAIGN INCOMPLETE: ${reasons.join("; ")}. No graduation reading is available until ` +
      `the affected arm is re-run.`,
  };
}

/* c8 ignore start — the process entry */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) process.exitCode = main();
/* c8 ignore stop */
