// scripts/rebless-parser-ledger.ts
//
// Argv, IO and exit codes for the parser-ledger re-bless. Every decision lives in
// tests/parser/mutation/rebless.ts; this file reads flags, calls it, prints, and
// exits. See that module's header for why the split exists.
//
// EXIT CODES, because a caller reads them: 0 nothing to do (or the rewrite
// succeeded), 1 the ledger is stale (--check) or the reconciliation is refused,
// 2 a usage error, 3 the ledger text and the parsed ledger disagree.
import { readFileSync, writeFileSync } from "node:fs";

import { KNOWN_SILENT_HOLES } from "../tests/parser/mutation/knownHoles";
import { SHARD_COUNT } from "../tests/parser/mutation/shardPartition";
import {
  cardinalityProblems,
  classify,
  ledgerCardinalityProblems,
  findShardFiles,
  provenanceProblems,
  readShardFiles,
  rewriteLedgerText,
} from "../tests/parser/mutation/rebless";

const LEDGER = "tests/parser/mutation/knownHoles.ts";
const USAGE =
  "usage: node --import tsx scripts/rebless-parser-ledger.ts --alarms <dir> [--shards <n>] [--check]";

function die(message: string, code = 2): never {
  process.stderr.write(`rebless-parser-ledger: ${message}\n${USAGE}\n`);
  process.exit(code);
}

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const alarmsDir = flag("alarms") ?? die("--alarms <dir> is required");
// DERIVED, not defaulted. `check-shard-budget.ts` refuses defaults for exactly the
// right reason -- a default is how a script becomes a second copy of a constant it
// CANNOT IMPORT. This one can import it, so a literal here would be the second copy
// that rule exists to prevent, and it would go stale the next time the parser
// partition changes. `--shards` remains, for tests that need a smaller world.
const shardsRaw = flag("shards");
const shards = shardsRaw === undefined ? SHARD_COUNT : Number(shardsRaw);
if (!Number.isInteger(shards) || shards <= 0) {
  die(`--shards must be a positive integer, got "${String(shardsRaw)}"`);
}
const checkOnly = process.argv.includes("--check");

let files: string[];
let missing: number[];
let duplicated: string[];
try {
  ({ files, missing, duplicated } = findShardFiles(alarmsDir, shards));
} catch (e) {
  die((e as Error).message);
}
if (missing.length > 0) {
  die(
    `alarms for shard(s) ${missing.join(", ")} are missing under ${alarmsDir}; reconciling a ` +
      `partial run against the whole ledger would read every absent shard's rows as fixed holes`,
  );
}
if (duplicated.length > 0) {
  die(
    `more than one file claims the same shard under ${alarmsDir}, so which one was measured is ` +
      `unknowable:\n` +
      duplicated.map((m) => `    ${m}\n`).join(""),
  );
}

let shardFiles;
try {
  shardFiles = readShardFiles(files);
} catch (e) {
  die((e as Error).message);
}

// PROVENANCE AND CARDINALITY BEFORE RECONCILIATION, in that order. Both describe the
// INPUT rather than the diff, and reconciling an input you have already decided is
// untrustworthy only produces a trustworthy-looking answer.
const provenance = provenanceProblems(shardFiles);
if (provenance.length > 0) {
  die(
    "REFUSING -- the collected files are not one run's whole output:\n" +
      provenance.map((m) => `    ${m}\n`).join(""),
    1,
  );
}
const actual = shardFiles.flatMap((f) => f.alarms);
const cardinality = [
  ...ledgerCardinalityProblems(KNOWN_SILENT_HOLES),
  ...cardinalityProblems(actual),
];
if (cardinality.length > 0) {
  die(
    "REFUSING -- a (siteId, kind) carries more than one fingerprint, so the re-bless is not a " +
      "bijection onto the ledger's rows:\n" +
      cardinality.map((m) => `    ${m}\n`).join(""),
    1,
  );
}

const verdict = classify(actual, KNOWN_SILENT_HOLES);

if (verdict.kind === "refuse") {
  process.stderr.write(
    "rebless-parser-ledger: REFUSING -- this is not a fingerprint re-bless.\n" +
      `  ${verdict.newHoles.length} new hole(s): a site that never survived mutation now does.\n` +
      verdict.newHoles.map((k) => `    + ${k}\n`).join("") +
      `  ${verdict.fixedHoles.length} fixed hole(s): a ledgered site stopped surviving.\n` +
      verdict.fixedHoles.map((k) => `    - ${k}\n`).join("") +
      "A regression is investigated and a shrink is a deliberate commit. Neither is a side " +
      "effect of this tool.\n",
  );
  process.exit(1);
}

if (verdict.kind === "current") {
  process.stdout.write(
    `rebless-parser-ledger: ledger is current (${verdict.rows} rows, 0 drifted)\n`,
  );
  process.exit(0);
}

process.stdout.write(
  `rebless-parser-ledger: ${verdict.drifted} drifted fingerprint(s) at stable (siteId, kind) ` +
    `pairs; 0 new holes, 0 fixed holes; ${verdict.rows} rows total\n`,
);
if (checkOnly) process.exit(1);

const text = readFileSync(LEDGER, "utf8");
let result;
try {
  result = rewriteLedgerText(text, actual);
} catch (e) {
  die(`${LEDGER}: ${(e as Error).message}`, 3);
}
if (result.rewritten !== verdict.drifted) {
  die(
    `rewrote ${result.rewritten} row(s) but the reconciliation reported ${verdict.drifted} ` +
      "drifted; the ledger text and the parsed ledger disagree",
    3,
  );
}
writeFileSync(LEDGER, result.next);
process.stdout.write(
  `rebless-parser-ledger: rewrote ${result.rewritten} fingerprint(s) in ${LEDGER}\n`,
);
