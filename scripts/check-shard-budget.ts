// scripts/check-shard-budget.ts
// The command-line entry for the mutation-harness per-shard budget check.
//
// THIS FILE DECIDES NOTHING. It reads four environment variables, reads the
// downloaded artifact directory into records, calls lib/ci/shardBudget.ts, prints,
// and exits. Every decision -- completeness, the boundary, the warn band -- lives
// in that module, because a guard with its CLI main inline cannot be imported and
// therefore cannot be enrolled in the source-mutation registry.
//
// ENVIRONMENT rather than argv, and that is the class-level repair for three
// rounds of the same defect: three successive argv guards each accepted a
// spelling they had not modelled (`36000` under a substring check, `3600.5` under
// a digit-boundary regex, a duplicate flag under first-match tokenising,
// `--flag=value` under exact-token counting). A step's `env:` is a YAML mapping --
// keys unique by construction, no `=` form, no duplicate form, no ordering -- so
// the integrity meta-test reads it with `toBe` on structured data and the whole
// class of "a spelling the parser missed" stops existing.
//
// NO DEFAULTS. A missing or malformed variable is a usage error and a non-zero
// exit, because a default is exactly how this script would become a second copy
// of a constant that lives in TypeScript it cannot import.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { checkBudget, expectedLegNames, type ElapsedRecord } from "../lib/ci/shardBudget";

const USAGE =
  "usage: ELAPSED_DIR=<dir> SHARD_BUDGET_SECONDS=<n> PARSER_SHARD_COUNT=<n> SOURCE_SHARD_COUNT=<n> pnpm tsx scripts/check-shard-budget.ts";

function die(message: string): never {
  process.stderr.write(`check-shard-budget: ${message}\n${USAGE}\n`);
  process.exit(2);
}

function requiredString(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") die(`${name} is not set`);
  return raw.trim();
}

function requiredCount(name: string): number {
  const raw = requiredString(name);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) die(`${name} must be a positive integer, got "${raw}"`);
  return n;
}

const elapsedDir = requiredString("ELAPSED_DIR");
const budgetSeconds = requiredCount("SHARD_BUDGET_SECONDS");
const parserShards = requiredCount("PARSER_SHARD_COUNT");
const sourceShards = requiredCount("SOURCE_SHARD_COUNT");

/**
 * `actions/download-artifact` with a `pattern:` lays each artifact down as its
 * own directory, so a leg's record is `<dir>/elapsed-<leg>/elapsed.txt`. The leg
 * name comes from the DIRECTORY, not from the file's contents -- a record cannot
 * claim to be a leg it is not.
 */
function readRecords(dir: string): ElapsedRecord[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    die(`ELAPSED_DIR "${dir}" is not readable`);
  }
  const records: ElapsedRecord[] = [];
  for (const entry of entries) {
    if (!entry.startsWith("elapsed-")) continue;
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    const leg = entry.slice("elapsed-".length);
    let text: string;
    try {
      text = readFileSync(join(path, "elapsed.txt"), "utf8");
    } catch {
      // A leg that uploaded an artifact with no record inside is NOT the same as
      // a leg that never ran, and neither may read as "that shard was fast".
      records.push({ leg, seconds: Number.NaN });
      continue;
    }
    records.push({ leg, seconds: Number(text.trim()) });
  }
  return records;
}

const verdict = checkBudget(
  readRecords(elapsedDir),
  expectedLegNames(parserShards, sourceShards),
  budgetSeconds,
);

for (const w of verdict.warnings) {
  // A GitHub Actions annotation, so the leading indicator is visible on the run
  // summary rather than buried in a log nobody opens.
  process.stdout.write(`::warning::${w}\n`);
}
for (const f of verdict.failures) {
  process.stdout.write(`::error::${f}\n`);
}
process.stdout.write(
  verdict.ok
    ? `check-shard-budget: every leg reported and is within the ${budgetSeconds}s budget\n`
    : `check-shard-budget: ${verdict.failures.length} failure(s)\n`,
);
process.exit(verdict.ok ? 0 : 1);
