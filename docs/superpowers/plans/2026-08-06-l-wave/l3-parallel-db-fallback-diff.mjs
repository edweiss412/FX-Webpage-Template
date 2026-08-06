#!/usr/bin/env node
/**
 * L-wave Task L3 — BL-CI-PARALLEL-DB-FALLBACK-AUDIT probe differ.
 *
 * Compares two Vitest JSON reports of the SAME `--project=parallel` run: one
 * with every Supabase endpoint live, one with every endpoint pointed at a
 * CLOSED PORT (a refused connection, not an absent variable).
 *
 * WHAT THE METRIC ACTUALLY IS, stated plainly because the entry asks for
 * something slightly different. Vitest's JSON reporter emits ONE
 * `assertionResults` entry per TEST CASE, not per `expect()`. So this compares
 * PER-TEST OUTCOMES, not assertion counts. The difference is load-bearing and
 * is recorded as a documented limit below, not papered over.
 *
 * The comparison is keyed on TEST IDENTITY (`fullName`), not on counts. A
 * count-only diff is defeated by a swap — one test starts skipping while
 * another starts passing — which preserves the totals and hides the fallback.
 * Identity keying makes that case a per-test transition, so it is caught.
 *
 * DOCUMENTED LIMIT (inherent to the reporter, not a gap this script can close):
 * assertions weakened INSIDE a test that still passes are invisible here,
 * because the reporter exposes no per-test assertion count. A test that stops
 * asserting but keeps passing therefore reads as unchanged. Closing that would
 * need an assertion-level reporter or an instrumented `expect`. The probe's
 * claim is bounded accordingly: it establishes that no test CHANGES OUTCOME
 * under a refused connection — never that no assertion weakened.
 *
 * VALIDITY GATE RUNS FIRST. The decision rule is total only over a VALID
 * probe. An absent field is INVALID, never zero — defaulting a missing field to
 * 0 would manufacture a degradation, the silently-wrong outcome this exists to
 * avoid.
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
  // Report-level outcome. A run that did not succeed can still carry unchanged
  // per-test rows (a failing setup hook, a suite-level error, an unhandled
  // rejection), so counting rows alone would route a broken run to "archive".
  if (typeof json.success !== "boolean") {
    invalid.push(`${label}: report has no boolean \`success\` field`);
  } else if (json.success !== true) {
    invalid.push(
      `${label}: report reports success=false — a non-succeeding run cannot settle this probe`,
    );
  }
  return json;
}

/** Per-file, per-test outcomes, validated field by field. Absent field = INVALID. */
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
    // File-level status: a file that errored outside its tests reports its
    // failure here while its test rows may be absent or unchanged.
    if (typeof fileResult.status !== "string") {
      invalid.push(`${label}: ${rel} has no \`status\``);
    } else if (fileResult.status !== "passed") {
      invalid.push(`${label}: ${rel} file status is "${fileResult.status}", not "passed"`);
    }
    const tests = new Map();
    let passed = 0;
    let skipped = 0;
    let failed = 0;
    for (const [j, a] of fileResult.assertionResults.entries()) {
      const status = a?.status;
      if (typeof status !== "string") {
        invalid.push(`${label}: ${rel} assertionResults[${j}] has no \`status\``);
        continue;
      }
      const id = typeof a.fullName === "string" && a.fullName.length ? a.fullName : a.title;
      if (typeof id !== "string" || id.length === 0) {
        invalid.push(`${label}: ${rel} assertionResults[${j}] has no \`fullName\`/\`title\``);
        continue;
      }
      const key = tests.has(id) ? `${id} #${j}` : id;
      tests.set(key, status);
      if (status === "passed") passed += 1;
      else if (status === "pending" || status === "skipped" || status === "todo") skipped += 1;
      else if (status === "failed") failed += 1;
    }
    if (byFile.has(rel)) {
      invalid.push(`${label}: ${rel} appears twice in testResults — file attribution is ambiguous`);
      continue;
    }
    byFile.set(rel, { tests, passed, skipped, failed, total: fileResult.assertionResults.length });
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
const onlyDb = dbFiles.filter((f) => !closed.has(f));
const onlyClosed = [...closed.keys()].filter((f) => !db.has(f));
if (onlyDb.length)
  invalid.push(`file set differs: ${onlyDb.length} file(s) only in db-present run, e.g. ${onlyDb[0]}`);
if (onlyClosed.length)
  invalid.push(
    `file set differs: ${onlyClosed.length} file(s) only in closed-port run, e.g. ${onlyClosed[0]}`,
  );

// Validity gate: the DB-present run is an executable premise — it must have
// actually run something. A zero-test baseline makes every comparison vacuous.
const dbTotalPassed = [...db.values()].reduce((n, m) => n + m.passed, 0);
if (dbTotalPassed === 0) invalid.push("db-present run reports ZERO passing tests — baseline is vacuous");

if (invalid.length) {
  console.error("PROBE INVALID (never archive on an invalid probe):\n  " + invalid.join("\n  "));
  process.exit(2);
}

// Decision rule over a VALID probe, keyed on test IDENTITY. A file DEGRADES
// when any named test that passed with the DB present stops passing under the
// closed port — whether it starts skipping, starts failing, or disappears. A
// drop "explained" by a skip is exactly the fallback shape, never a pardon.
const degrading = [];
for (const file of dbFiles) {
  const a = db.get(file);
  const b = closed.get(file);
  const reasons = [];
  for (const [id, status] of a.tests) {
    if (status !== "passed") continue;
    const now = b.tests.get(id);
    if (now === undefined) reasons.push(`test disappeared: ${id}`);
    else if (now !== "passed") reasons.push(`passed -> ${now}: ${id}`);
  }
  // Aggregate movements that identity keying alone would not phrase clearly.
  if (b.passed < a.passed) reasons.push(`passing total ${a.passed} -> ${b.passed}`);
  if (b.skipped > a.skipped) reasons.push(`skipped total ${a.skipped} -> ${b.skipped}`);
  if (reasons.length) degrading.push({ file, reasons });
}

const closedTotalPassed = [...closed.values()].reduce((n, m) => n + m.passed, 0);
const dbSkipped = [...db.values()].reduce((n, m) => n + m.skipped, 0);
const closedSkipped = [...closed.values()].reduce((n, m) => n + m.skipped, 0);

console.log("PROBE VALID");
console.log(`  files compared:          ${dbFiles.length}`);
console.log(`  tests passing   db:      ${dbTotalPassed}`);
console.log(`  tests passing   closed:  ${closedTotalPassed}`);
console.log(`  tests skipped   db:      ${dbSkipped}`);
console.log(`  tests skipped   closed:  ${closedSkipped}`);
console.log(`  metric: per-TEST outcomes keyed by fullName (not per-expect assertions)`);
console.log("");
if (degrading.length === 0) {
  console.log("DEGRADING FILES: 0");
  console.log("DISPOSITION: archive (answered-negative) per spec §2.1.3.");
} else {
  console.log(`DEGRADING FILES: ${degrading.length}`);
  console.log("DISPOSITION: entry STAYS OPEN, resized to exactly these instances.");
  console.log("");
  for (const d of degrading) console.log(`  ${d.file}\n      ${d.reasons.join("\n      ")}`);
}
