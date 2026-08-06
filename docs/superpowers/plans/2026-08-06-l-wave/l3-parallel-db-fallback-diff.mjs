#!/usr/bin/env node
/**
 * L-wave Task L3 — BL-CI-PARALLEL-DB-FALLBACK-AUDIT probe differ.
 *
 * Compares two Vitest JSON reports of the SAME `--project=parallel` run: one
 * with every Supabase endpoint live, one with every endpoint pointed at a
 * CLOSED PORT (a refused connection, not an absent variable).
 *
 * Per-file metric = count of `assertionResults` entries with status "passed".
 * Vitest's JSON reporter exposes NO per-file `numPassingAsserts` (probed
 * against the installed Vitest, plan R1 F2), so the count is derived by
 * walking `assertionResults` — the same derivation `scripts/run-excluded-test.mjs`
 * already ships for its per-file attribution.
 *
 * VALIDITY GATE RUNS FIRST (spec §2.1.3, R1 F3). The decision rule is total
 * only over a VALID probe. An absent field is INVALID, never zero — defaulting
 * a missing field to 0 would manufacture a degradation, which is precisely the
 * silently-wrong outcome this probe exists to avoid.
 *
 * Usage: node l3-parallel-db-fallback-diff.mjs <db-present.json> <closed-port.json>
 * Exit 0 = valid probe, verdict printed. Exit 2 = INVALID probe (fix and re-run).
 */
import { readFileSync } from "node:fs";

const [, , dbPath, closedPath] = process.argv;
if (!dbPath || !closedPath) {
  console.error("usage: l3-parallel-db-fallback-diff.mjs <db-present.json> <closed-port.json>");
  process.exit(2);
}

const invalid = [];

function load(label, path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    invalid.push(`${label}: report unreadable (${e.message})`);
    return null;
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    invalid.push(`${label}: report is not parseable JSON (${e.message})`);
    return null;
  }
  if (!Array.isArray(json.testResults)) {
    invalid.push(`${label}: no testResults array — this is not a Vitest JSON report`);
    return null;
  }
  return json;
}

/** Per-file metrics, validated field by field. An absent field is INVALID. */
function metrics(label, json) {
  const byFile = new Map();
  for (const [i, fileResult] of json.testResults.entries()) {
    const name = fileResult?.name;
    if (typeof name !== "string" || name.length === 0) {
      invalid.push(`${label}: testResults[${i}] has no usable \`name\``);
      continue;
    }
    const rel = name.replace(`${process.cwd()}/`, "");
    if (!Array.isArray(fileResult.assertionResults)) {
      invalid.push(`${label}: ${rel} has no assertionResults array`);
      continue;
    }
    let passed = 0;
    let skipped = 0;
    let failed = 0;
    for (const [j, a] of fileResult.assertionResults.entries()) {
      const status = a?.status;
      if (typeof status !== "string") {
        invalid.push(`${label}: ${rel} assertionResults[${j}] has no \`status\``);
        continue;
      }
      if (status === "passed") passed += 1;
      else if (status === "pending" || status === "skipped" || status === "todo") skipped += 1;
      else if (status === "failed") failed += 1;
    }
    if (byFile.has(rel)) {
      invalid.push(`${label}: ${rel} appears twice in testResults — file attribution is ambiguous`);
      continue;
    }
    byFile.set(rel, { passed, skipped, failed, total: fileResult.assertionResults.length });
  }
  return byFile;
}

const dbJson = load("db-present", dbPath);
const closedJson = load("closed-port", closedPath);
if (!dbJson || !closedJson) {
  console.error("PROBE INVALID:\n  " + invalid.join("\n  "));
  process.exit(2);
}

const db = metrics("db-present", dbJson);
const closed = metrics("closed-port", closedJson);

// Validity gate: identical file sets.
const dbFiles = [...db.keys()].sort();
const closedFiles = [...closed.keys()].sort();
const onlyDb = dbFiles.filter((f) => !closed.has(f));
const onlyClosed = closedFiles.filter((f) => !db.has(f));
if (onlyDb.length) invalid.push(`file set differs: ${onlyDb.length} file(s) only in db-present run, e.g. ${onlyDb[0]}`);
if (onlyClosed.length)
  invalid.push(`file set differs: ${onlyClosed.length} file(s) only in closed-port run, e.g. ${onlyClosed[0]}`);

// Validity gate: the DB-present run is an executable premise — it must have
// actually asserted something. A zero-assertion baseline makes every
// comparison vacuous.
const dbTotalPassed = [...db.values()].reduce((n, m) => n + m.passed, 0);
if (dbTotalPassed === 0) invalid.push("db-present run reports ZERO passing assertions — baseline is vacuous");

if (invalid.length) {
  console.error("PROBE INVALID (never archive on an invalid probe):\n  " + invalid.join("\n  "));
  process.exit(2);
}

// Decision rule over a VALID probe (pre-ratified, total). A file DEGRADES when
// its passing count drops FOR ANY REASON, or when it newly reports skipped
// assertions, or when it reports only skipped results. A drop "explained" by a
// skip is exactly the fallback shape the entry describes, never a pardon.
const degrading = [];
for (const file of dbFiles) {
  const a = db.get(file);
  const b = closed.get(file);
  const reasons = [];
  if (b.passed < a.passed) reasons.push(`passing ${a.passed} -> ${b.passed}`);
  if (b.skipped > a.skipped) reasons.push(`newly skipped ${a.skipped} -> ${b.skipped}`);
  if (b.total > 0 && b.passed === 0 && b.skipped === b.total && a.passed > 0)
    reasons.push("all-skipped under closed port");
  if (reasons.length) degrading.push({ file, reasons, a, b });
}

const fileCount = dbFiles.length;
const closedTotalPassed = [...closed.values()].reduce((n, m) => n + m.passed, 0);
const dbFailed = [...db.values()].reduce((n, m) => n + m.failed, 0);
const closedFailed = [...closed.values()].reduce((n, m) => n + m.failed, 0);

console.log("PROBE VALID");
console.log(`  files compared:            ${fileCount}`);
console.log(`  passing assertions  db:    ${dbTotalPassed}`);
console.log(`  passing assertions  closed:${closedTotalPassed}`);
console.log(`  failed assertions   db:    ${dbFailed}`);
console.log(`  failed assertions   closed:${closedFailed}`);
console.log("");
if (degrading.length === 0) {
  console.log("DEGRADING FILES: 0");
  console.log("DISPOSITION: archive (answered-negative) per spec §2.1.3.");
} else {
  console.log(`DEGRADING FILES: ${degrading.length}`);
  console.log("DISPOSITION: entry STAYS OPEN, resized to exactly these instances.");
  console.log("");
  for (const d of degrading) console.log(`  ${d.file}\n      ${d.reasons.join("; ")}`);
}
