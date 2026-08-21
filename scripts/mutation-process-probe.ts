#!/usr/bin/env tsx
import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  type CampaignPlan,
  type PlanInput,
  type ProbeOutcome,
  type Refusal,
  parseArm,
  parseSeed,
  parseTrials,
  planCampaign,
  renderCampaignPlan,
  renderProbe,
  resolveTarget,
} from "../tests/mutation/source/processProbe";
import type { GuardSurface } from "../tests/mutation/source/registry";

/**
 * `pnpm mutation:process-probe --surface <id> --site <siteId> --arm <A|B|C|control>
 *  --trials <n> [--seed <s>]`
 *
 * A THIN adapter over `tests/mutation/source/processProbe`. Every decision lives
 * in the core, which is an importable module with in-process assertions (AC-9);
 * this file turns argv into core calls and core results into text. A branch that
 * lives here is a branch no in-process suite can reach.
 *
 * RENDERING FIDELITY AND WIRING ARE SEPARATE PROPERTIES, PROVED SEPARATELY. A
 * correct renderer in front of an entry that never invokes the core passes every
 * output assertion while the operator's command reports nothing the core
 * produced — so `main` takes `deps`, a spy proves it CALLS them with the
 * operator's arguments, and `CLI_DEFAULT_DEPS` is separately asserted bound to
 * the real core, with that assertion itself proven discriminating.
 */
export type CliDeps = {
  resolveTarget: (input: {
    root: string;
    surfaceId: string;
    site: string;
    surfaces?: readonly GuardSurface[];
  }) => ProbeOutcome;
  planCampaign: (input: PlanInput) => CampaignPlan | Refusal;
  renderPlan: (plan: CampaignPlan) => string;
  renderProbe: (outcome: ProbeOutcome) => string;
  write: (text: string) => void;
  /** The seed used when the operator supplies none. PRINTED, always. */
  generateSeed: () => number;
  surfaces?: readonly GuardSurface[];
  root: string;
};

export const CLI_EXIT_OK = 0;
/** Every refusal is a usage error and exits 2, emitting NO distribution. */
export const CLI_EXIT_REFUSED = 2;

export const CLI_DEFAULT_DEPS: CliDeps = {
  resolveTarget,
  planCampaign,
  renderPlan: renderCampaignPlan,
  renderProbe,
  write: (text) => process.stdout.write(text),
  // A uint32 from the platform CSPRNG, so two omitted-seed invocations differ
  // and the value is inside `parseSeed`'s accept-set.
  generateSeed: () => randomInt(0, 2 ** 32),
  root: process.cwd(),
};

export type ParsedArgv = {
  surface: string | undefined;
  site: string | undefined;
  arm: string | undefined;
  trials: string | undefined;
  seed: string | undefined;
};

/**
 * `--flag value` only.
 *
 * A missing value reads as `undefined` rather than as the next flag: `--surface
 * --site x` must refuse on `--surface`, not silently take the string `"--site"`.
 */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const read = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return undefined;
    return value;
  };
  return {
    surface: read("surface"),
    site: read("site"),
    arm: read("arm"),
    trials: read("trials"),
    seed: read("seed"),
  };
}

export function main(argv: readonly string[], deps: CliDeps = CLI_DEFAULT_DEPS): number {
  const parsed = parseArgv(argv);

  const refuse = (input: Refusal["input"], detail: string): number => {
    deps.write(deps.renderProbe({ kind: "refusal", input, detail }));
    return CLI_EXIT_REFUSED;
  };

  const arm = parseArm(parsed.arm);
  if (!arm.ok) return refuse("arm", arm.detail);
  const trials = parseTrials(parsed.trials);
  if (!trials.ok) return refuse("trials", trials.detail);

  // An OMITTED seed is generated and printed; a SUPPLIED one goes through the
  // same accept-set as every other input, so `--seed 1.5` refuses rather than
  // silently seeding a stream the report cannot name.
  let seed: number;
  if (parsed.seed === undefined) {
    seed = deps.generateSeed();
  } else {
    const supplied = parseSeed(parsed.seed);
    if (!supplied.ok) return refuse("seed", supplied.detail);
    seed = supplied.value;
  }

  const resolved = deps.resolveTarget({
    root: deps.root,
    surfaceId: parsed.surface ?? "",
    site: parsed.site ?? "",
    ...(deps.surfaces === undefined ? {} : { surfaces: deps.surfaces }),
  });
  if (resolved.kind === "refusal") {
    deps.write(deps.renderProbe(resolved));
    return CLI_EXIT_REFUSED;
  }

  const plan = deps.planCampaign({ target: resolved.target, seed, armATrials: trials.value });
  if ("kind" in plan && plan.kind === "refusal") {
    deps.write(deps.renderProbe(plan));
    return CLI_EXIT_REFUSED;
  }

  deps.write(deps.renderPlan(plan as CampaignPlan));
  return CLI_EXIT_OK;
}

/* c8 ignore start — the process entry, exercised by running the command itself */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) {
  // `process.exitCode`, never `process.exit`: on a pipe stdout is asynchronous,
  // and exiting drops queued bytes — a truncated report delivered as a whole one.
  process.exitCode = main(process.argv.slice(2));
}
/* c8 ignore stop */
