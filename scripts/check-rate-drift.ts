// scripts/check-rate-drift.ts
// The command-line entry for the per-surface rate-drift report.
//
// THIS FILE DECIDES NOTHING, mirroring scripts/check-shard-budget.ts beside it.
// It reads environment, reads the downloaded records, calls driftReport and
// renderDrift, prints, and exits. Every decision lives in lib/mutationWeight/,
// because a guard whose decisions sit inline in a CLI main cannot be imported and
// therefore cannot be driven by a suite or enrolled in the mutation registry.
//
// ENVIRONMENT rather than argv, for the same class-level reason as its sibling: a
// step's `env:` is a YAML mapping with keys unique by construction, so the
// integrity meta-test reads it as structured data and the whole class of "a
// spelling the parser missed" stops existing.
//
// NO DEFAULTS. A missing or malformed variable exits 2.
//
// IT NEVER FAILS THE JOB. Drift is a REPORT: a rate that moved is information for
// whoever re-measures the surface, not a reason to red a run that is otherwise
// within budget. The exit status is identical with and without drift, and the only
// non-zero exit is a usage error — which is a fault in the STEP, not a finding
// about the corpus.
import { readRun } from "../lib/mutationWeight/records";
import { renderDrift, requiredCount, requiredEnv } from "../lib/mutationWeight/driftCli";
import { driftReport, recoverModelled } from "../lib/mutationWeight/weights";
import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { bootsOf } from "../tests/mutation/source/shardPartition";

const USAGE =
  "usage: RECORDS_DIR=<dir> DRIFT_ACTIONABLE_AT=<n> pnpm tsx scripts/check-rate-drift.ts";

function die(problem: string): never {
  process.stderr.write(`check-rate-drift: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

const dir = requiredEnv(process.env, "RECORDS_DIR");
if (!dir.ok) die(dir.problem);
const actionableAt = requiredCount(process.env, "DRIFT_ACTIONABLE_AT");
if (!actionableAt.ok) die(actionableAt.problem);

const { surfaces } = readRun(dir.value);
const declared = new Map(GUARD_SURFACES.map((s) => [s.id, s.millisPerBoot]));
const modelled = new Map(
  GUARD_SURFACES.map((s) => [
    s.id,
    recoverModelled(bootsOf(s), s.accepted.length, s.suitePaths.length, s.millisPerBoot),
  ]),
);

const { lines } = renderDrift(driftReport(declared, surfaces, modelled, actionableAt.value));
process.stdout.write(`${lines.join("\n")}\n`);

// Deliberately not conditional. See the header: drift is a report.
process.exit(0);
