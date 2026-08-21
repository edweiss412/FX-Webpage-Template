#!/usr/bin/env tsx
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_RECORD_DIR } from "../tests/mutation/source/records";
import {
  type CampaignTrial,
  type LoadSample,
  type TrialPlan,
  aggregateCampaign,
  makeParentDeps,
  observeTrial,
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

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? fallback : v;
};

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

export function main(): number {
  const surfaceId = arg("surface", "psqlStartupScan");
  const site = arg("site", "relational-boundary:3578:35:<><=");
  const seed = Number(arg("seed", "20260821"));
  const armATrials = Number(arg("trials", "12"));
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
    plannedPerArm: { A: armATrials, B: 6, C: 2 },
    trials,
  });
  const report = renderCampaign(aggregate);
  process.stdout.write(`\n${report}`);

  const defaultAfter = existsSync(DEFAULT_RECORD_DIR) ? readdirSync(DEFAULT_RECORD_DIR).sort() : [];
  const campaignRecords = existsSync(recordDir) ? readdirSync(recordDir) : [];
  const identical = JSON.stringify(defaultBefore) === JSON.stringify(defaultAfter);
  process.stdout.write(
    `\nRECORD ISOLATION (AC-6, on the real run)\n` +
      `  campaign dir ${recordDir}: ${campaignRecords.length} record(s)\n` +
      `  default dir ${DEFAULT_RECORD_DIR}: ${defaultBefore.length} before, ${defaultAfter.length} after\n` +
      `  byte-identical listings: ${identical}\n`,
  );

  writeFileSync(
    join(outDir, "campaign.json"),
    `${JSON.stringify({ plan, trials, refusals, aggregate, defaultBefore, defaultAfter }, null, 2)}\n`,
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
    campaignRecordCount: campaignRecords.length,
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
}): { code: number; detail: string } {
  const reasons: string[] = [];
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
