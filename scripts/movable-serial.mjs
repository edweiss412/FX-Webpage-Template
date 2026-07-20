#!/usr/bin/env node
// Of the SERIAL project's files, which are genuinely movable to the parallel
// (no-DB) project? A file qualifies only if, in a run with the database UP, it
// EXECUTED tests and opened NO database socket. That is the narrow criterion the
// previous spike could not measure: "neither needs nor writes to a DB".
import fs from "node:fs";
import path from "node:path";
import { PARALLEL_TEST_GLOBS, ENV_BOUND_EXCLUDES, MUTATION_TEST_GLOBS } from "../vitest.projects.ts";

const probeDir = process.argv[2] ?? ".db-touch-probe";
const classification = JSON.parse(
  fs.readFileSync(path.join(probeDir, "classification.json"), "utf8"),
);

// The partition is DIRECTORY-based: every parallel glob has the shape
// `tests/<dir>/**/*.test.{ts,tsx}`, so membership reduces to a directory-prefix
// test. (git ls-files pathspec does NOT expand `{ts,tsx}` or `**`, which
// silently returned an empty parallel set and counted every candidate as
// serial — caught because "movable" exceeded the whole serial project.)
const prefixOf = (glob) => glob.replace(/\*\*.*$/, "").replace(/\/$/, "/");
const parallelPrefixes = PARALLEL_TEST_GLOBS.map(prefixOf);
const mutationPrefixes = MUTATION_TEST_GLOBS.map((g) => g.replace(/\*.*$/, ""));
const envBound = new Set(ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, "")));

const hasPrefix = (file, prefixes) => prefixes.some((p) => file.startsWith(p));
const isSerial = (file) =>
  !hasPrefix(file, parallelPrefixes) && !hasPrefix(file, mutationPrefixes);

// Static subprocess-DB backstop. The runtime probe catches in-process DB access
// (postgres.js, the Supabase HTTP client) precisely, but it CANNOT catch a child
// `psql`/`supabase` process launched via a destructured `import { execFileSync }`
// — that binding is captured before any probe can patch child_process, proven
// empirically. So a candidate that statically imports child_process AND names a
// DB target is treated as DB-touching regardless of what the runtime saw.
const importsChildProcess = /from\s+["']node:child_process["']|require\(["']node:child_process["']\)/;
const dbToken = /\bpsql\b|databaseUrl|postgres(?:ql)?:\/\/|_validation-cleanup-helpers|supabase\s+db/;
function staticSubprocessDb(file) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return importsChildProcess.test(src) && dbToken.test(src);
}

const rawCandidates = classification.candidate.filter(
  (r) => isSerial(r.file) && !envBound.has(r.file),
);
const subprocessDb = rawCandidates.filter((r) => staticSubprocessDb(r.file));
const movable = rawCandidates.filter((r) => !staticSubprocessDb(r.file));
const stayDb = classification.dbTouching.filter((r) => isSerial(r.file));

console.log(
  `\nruntime said DB-free: ${rawCandidates.length}; of those, static caught ${subprocessDb.length} subprocess-DB files the socket hook could not see.`,
);

console.log("=== serial-project movability (DB up) ===");
console.log(`serial files that ran and touched NO DB (movable):  ${movable.length}`);
console.log(`serial files that touched a DB (must stay serial):  ${stayDb.length}`);
console.log(`env-bound serial files (excluded from move):        ${[...envBound].length}`);

fs.writeFileSync(
  path.join(probeDir, "movable-serial.json"),
  `${JSON.stringify(movable.map((r) => r.file).sort(), null, 2)}\n`,
);
console.log(`\nWrote ${path.join(probeDir, "movable-serial.json")}`);

// Top DB-touchers, as a sanity check that the DB set looks like real DB work.
console.log("\n=== sample of DB-touching serial files ===");
for (const r of stayDb.slice(0, 8)) {
  console.log(`  ${r.file}  (db:${r.db} ${r.targets.join(",")})`);
}
