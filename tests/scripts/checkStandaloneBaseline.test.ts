/**
 * tests/scripts/checkStandaloneBaseline.test.ts
 *
 * Behavioral contract for scripts/check-standalone-baseline.mjs (spec
 * 2026-07-26-ci-dark-descoped-closeout §4.1, "the script itself is
 * behaviorally pinned"): a no-op script satisfies every structural workflow
 * assertion while destroying the proof, so the thing pinned HERE is the
 * script's rejection behavior — each mismatch class must exit non-zero.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "check-standalone-baseline.mjs");

/** Run the script; return its exit code (execFileSync throws on non-zero). */
function run(args: string[], cwd: string = ROOT): number {
  try {
    execFileSync("node", [SCRIPT, ...args], { cwd, stdio: "pipe" });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === "number" ? status : -1;
  }
}

/**
 * Playwright-JSON-shaped report. config.rootDir is ROOT/tests/e2e so the
 * script MUST resolve spec.file against it to produce repo-relative paths
 * (real Playwright output reports files relative to the config's rootDir).
 */
function report(files: string[], testsPerFile: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-report-"));
  const suites = files.map((file) => ({
    file,
    suites: [],
    specs: Array.from({ length: testsPerFile }, (_, i) => ({
      file,
      title: `t${i}`,
      tests: [{ status: "expected" }],
    })),
  }));
  const p = join(dir, "report.json");
  writeFileSync(p, JSON.stringify({ config: { rootDir: join(ROOT, "tests", "e2e") }, suites }));
  return p;
}

function baseline(repoRelativeFiles: string[], totalTests: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-file-"));
  const p = join(dir, "standalone-baseline.json");
  writeFileSync(p, JSON.stringify({ files: [...repoRelativeFiles].sort(), totalTests }));
  return p;
}

// Report-side names are rootDir-relative; baseline-side are repo-relative.
const A_REPORT = "a.spec.ts";
const B_REPORT = "b.spec.ts";
const A = "tests/e2e/a.spec.ts";
const B = "tests/e2e/b.spec.ts";

describe("check-standalone-baseline behavioral contract (spec §4.1)", () => {
  it("exits zero on a full match, resolving report paths against config.rootDir", () => {
    const bl = baseline([A, B], 4);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).toBe(0);
  });

  it("rejects a baseline spec the report lacks", () => {
    const bl = baseline([A, B], 4);
    expect(run(["--report", report([A_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report spec the baseline lacks", () => {
    const bl = baseline([A], 2);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects matching files with a mismatched total test count", () => {
    const bl = baseline([A, B], 5);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("counts a spec with an empty tests[] as zero executed tests (exact-sum contract)", () => {
    const dir = mkdtempSync(join(tmpdir(), "empty-tests-"));
    const p = join(dir, "report.json");
    writeFileSync(
      p,
      JSON.stringify({
        config: { rootDir: join(ROOT, "tests", "e2e") },
        suites: [
          { file: A_REPORT, suites: [], specs: [{ file: A_REPORT, title: "t", tests: [] }] },
          {
            file: B_REPORT,
            suites: [],
            specs: [{ file: B_REPORT, title: "t", tests: [{ status: "expected" }] }],
          },
        ],
      }),
    );
    expect(run(["--report", p, "--baseline", baseline([A, B], 1)])).toBe(0);
  });

  it("rejects a missing report file", () => {
    expect(run(["--report", "/nonexistent/report.json", "--baseline", baseline([A], 2)])).not.toBe(
      0,
    );
  });

  it("rejects a malformed report file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bad-report-"));
    const bad = join(dir, "report.json");
    writeFileSync(bad, "not json {");
    expect(run(["--report", bad, "--baseline", baseline([A], 2)])).not.toBe(0);
  });
});
