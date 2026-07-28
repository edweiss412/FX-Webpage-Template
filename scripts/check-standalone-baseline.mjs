// scripts/check-standalone-baseline.mjs
//
// Compares standalone Playwright config membership against the committed
// baseline (spec docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md §4).
//
//   --report <path>    compare a Playwright JSON reporter file (CI post-run step)
//   --list-check       compare a fresh local `--list` resolution (meta-test tripwire)
//   --write            regenerate the baseline from a local `--list` resolution
//   --baseline <path>  override baseline location (test fixtures only)
//   (zero args)        compare the CI default report, test-results/standalone-report.json
//
// The zero-args form exists so the workflow step literal stays exactly
// `node scripts/check-standalone-baseline.mjs` (spec §4.1 structural pinning).
//
// Baseline schema (v2, R6 P1): per-file sorted MULTISETS of test identities
// ("<projectName> :: <suite titles > test title>"), plus a totalTests field
// that must equal the identity sum (self-consistency, human readability). A
// file set + one global total permits COMPENSATED narrowing: a grep that
// drops half the tests while repeatEach duplicates the survivors preserves
// every filename and the total; equal-cardinality test/project substitutions
// do the same. Identity multisets make each of those a mismatch.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// realpath: on macOS, tmpdir-based cwds arrive as /var/... while process.cwd()
// resolves the symlink to /private/var/..., which breaks path relativization.
const ROOT = realpathSync(process.cwd());
const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const BASELINE = flagValue("--baseline") ?? join(ROOT, "tests/e2e/standalone-baseline.json");
const DEFAULT_REPORT = join(ROOT, "test-results", "standalone-report.json");

function fail(msg) {
  console.error(`check-standalone-baseline: ${msg}`);
  process.exit(1);
}

const toRepoPosix = (rootDir, file) => {
  const abs = isAbsolute(file) ? file : resolve(rootDir, file);
  // Realpath the deepest EXISTING ancestor so symlinked prefixes (macOS
  // /var -> /private/var) compare equal, while a report file that does not
  // exist on disk still relativizes cleanly.
  let probe = abs;
  while (probe !== dirname(probe) && !existsSync(probe)) probe = dirname(probe);
  const real = join(realpathSync(probe), relative(probe, abs));
  return relative(ROOT, real).split(sep).join("/");
};

// Playwright's json reporter emits exactly these outcome statuses. An outcome
// with a MISSING or unknown status must fail closed rather than count as
// executed — a schema-malformed report could otherwise match the baseline.
const KNOWN_OUTCOME_STATUSES = new Set(["expected", "unexpected", "flaky", "skipped"]);

// One identity per test OUTCOME entry, so repeatEach duplication and project
// membership both surface in the multiset. "(none)" keeps fixture reports
// (and any reporter variant omitting projectName) comparable rather than
// collapsing to undefined.
const identity = (test, titlePath) => `${test?.projectName ?? "(none)"} :: ${titlePath}`;

function membership(json, { executedOnly = false } = {}) {
  const rootDir = json?.config?.rootDir;
  if (typeof rootDir !== "string") fail("report has no config.rootDir");
  const perFile = new Map();
  let total = 0;
  const walk = (suites, titles) => {
    for (const s of suites ?? []) {
      const next = typeof s.title === "string" && s.title !== "" ? [...titles, s.title] : titles;
      walk(s.suites, next);
      for (const spec of s.specs ?? []) {
        // Run reports (executedOnly): a test whose outcome status is
        // "skipped" executed nothing — an environment-conditioned
        // test.skip/fixme keeps the file and the test entry while narrowing
        // to zero execution, so it must not count, and a file whose every
        // test skipped must drop from executed membership. --list output
        // marks EVERY test "skipped" (nothing runs), so list-side membership
        // counts all entries.
        const counted = executedOnly
          ? (spec.tests ?? []).filter((t) => {
              if (!KNOWN_OUTCOME_STATUSES.has(t?.status)) {
                fail(
                  `run report outcome with unknown status ${JSON.stringify(t?.status)} ` +
                    `in ${spec.file} — refusing to classify (fail-closed)`,
                );
              }
              return t.status !== "skipped";
            })
          : (spec.tests ?? []);
        if (executedOnly && counted.length === 0) continue;
        const file = toRepoPosix(rootDir, spec.file);
        const titlePath = [...next, spec.title]
          .filter((t) => typeof t === "string" && t !== "")
          .join(" > ");
        const ids = perFile.get(file) ?? [];
        for (const t of counted) ids.push(identity(t, titlePath));
        perFile.set(file, ids);
        total += counted.length;
      }
    }
  };
  walk(json.suites, []);
  const files = {};
  for (const f of [...perFile.keys()].sort()) files[f] = perFile.get(f).sort();
  return { files, totalTests: total };
}

function listResolution() {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "tests/e2e/standalone.config.ts",
      "--list",
      "--reporter=json",
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 },
  );
  return membership(JSON.parse(out.toString()));
}

function readBaseline() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch (e) {
    fail(`cannot read baseline ${BASELINE}: ${e}`);
  }
  // v2 only: files is a plain object of per-file identity arrays. A legacy v1
  // array (or any other shape) is malformed — never silently fall back to the
  // coarse file-set + total comparison this schema exists to replace.
  const f = parsed?.files;
  if (
    f === null ||
    typeof f !== "object" ||
    Array.isArray(f) ||
    typeof parsed.totalTests !== "number" ||
    Object.values(f).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
  ) {
    fail(`malformed baseline ${BASELINE} (expected v2 per-file identity arrays)`);
  }
  const files = {};
  let sum = 0;
  for (const file of Object.keys(f).sort()) {
    files[file] = [...f[file]].sort();
    sum += files[file].length;
  }
  if (sum !== parsed.totalTests) {
    fail(
      `self-inconsistent baseline ${BASELINE}: totalTests ${parsed.totalTests} != identity sum ${sum}`,
    );
  }
  return { files, totalTests: parsed.totalTests };
}

function compare(actual, label) {
  const base = readBaseline();
  const actualFiles = Object.keys(actual.files);
  const baseFiles = Object.keys(base.files);
  const missing = baseFiles.filter((f) => !actualFiles.includes(f));
  const extra = actualFiles.filter((f) => !baseFiles.includes(f));
  if (missing.length || extra.length) {
    fail(
      `${label} membership mismatch.\n` +
        `  missing from ${label}: ${missing.join(", ") || "-"}\n` +
        `  not in baseline: ${extra.join(", ") || "-"}\n` +
        `  regenerate: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
  const drifted = [];
  for (const f of baseFiles) {
    const a = actual.files[f];
    const b = base.files[f];
    if (a.length !== b.length || a.some((id, i) => id !== b[i])) {
      const missingIds = b.filter((id) => !a.includes(id));
      const extraIds = a.filter((id) => !b.includes(id));
      drifted.push(
        `  ${f}: ${b.length} baseline / ${a.length} ${label} identities` +
          (missingIds.length ? `\n    missing: ${missingIds.slice(0, 5).join(" | ")}` : "") +
          (extraIds.length ? `\n    unexpected: ${extraIds.slice(0, 5).join(" | ")}` : ""),
      );
    }
  }
  if (drifted.length) {
    fail(
      `${label} test-identity mismatch (per-file multisets must match exactly —\n` +
        `duplicated, substituted, or re-projected tests are narrowing even when\n` +
        `file names and totals survive):\n${drifted.join("\n")}\n` +
        `  regenerate: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
  if (actual.totalTests !== base.totalTests) {
    fail(
      `${label} total test count ${actual.totalTests} != baseline ${base.totalTests}. ` +
        `regenerate: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
}

function compareReport(path) {
  let json;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`cannot read report ${path}: ${e}`);
  }
  compare(membership(json, { executedOnly: true }), "run report");
}

const knownFlags = new Set(["--report", "--list-check", "--write", "--baseline"]);
for (const a of args) {
  if (a.startsWith("--") && !knownFlags.has(a)) fail(`unknown flag ${a}`);
}

if (args.includes("--write")) {
  const m = listResolution();
  writeFileSync(BASELINE, `${JSON.stringify(m, null, 2)}\n`);
  console.log(`wrote ${BASELINE}: ${Object.keys(m.files).length} files, ${m.totalTests} tests`);
} else if (flagValue("--report") !== undefined) {
  compareReport(flagValue("--report"));
} else if (args.includes("--list-check")) {
  compare(listResolution(), "local --list resolution");
} else {
  // Zero args = the CI post-run step. The workflow literal must stay exactly
  // `node scripts/check-standalone-baseline.mjs` (spec §4.1 pinning), so the
  // default report path lives here rather than in the workflow.
  compareReport(DEFAULT_REPORT);
}
