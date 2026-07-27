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

function membership(json, { executedOnly = false } = {}) {
  const rootDir = json?.config?.rootDir;
  if (typeof rootDir !== "string") fail("report has no config.rootDir");
  const files = new Set();
  let total = 0;
  const walk = (suites) => {
    for (const s of suites ?? []) {
      walk(s.suites);
      for (const spec of s.specs ?? []) {
        // Run reports (executedOnly): a test whose outcome status is
        // "skipped" executed nothing — an environment-conditioned
        // test.skip/fixme keeps the file and the test entry while narrowing
        // to zero execution, so it must not count, and a file whose every
        // test skipped must drop from executed membership. --list output
        // marks EVERY test "skipped" (nothing runs), so list-side membership
        // counts all entries.
        const counted = executedOnly
          ? (spec.tests ?? []).filter((t) => t.status !== "skipped")
          : (spec.tests ?? []);
        if (executedOnly && counted.length === 0) continue;
        files.add(toRepoPosix(rootDir, spec.file));
        total += counted.length;
      }
    }
  };
  walk(json.suites);
  return { files: [...files].sort(), totalTests: total };
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
  if (!Array.isArray(parsed.files) || typeof parsed.totalTests !== "number") {
    fail(`malformed baseline ${BASELINE}`);
  }
  return { files: [...parsed.files].sort(), totalTests: parsed.totalTests };
}

function compare(actual, label) {
  const base = readBaseline();
  const missing = base.files.filter((f) => !actual.files.includes(f));
  const extra = actual.files.filter((f) => !base.files.includes(f));
  if (missing.length || extra.length) {
    fail(
      `${label} membership mismatch.\n` +
        `  missing from ${label}: ${missing.join(", ") || "-"}\n` +
        `  not in baseline: ${extra.join(", ") || "-"}\n` +
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
  console.log(`wrote ${BASELINE}: ${m.files.length} files, ${m.totalTests} tests`);
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
