/**
 * tests/scripts/checkStandaloneBaseline.test.ts
 *
 * Behavioral contract for scripts/check-standalone-baseline.mjs (spec
 * 2026-07-26-ci-dark-descoped-closeout §4.1, "the script itself is
 * behaviorally pinned"): a no-op script satisfies every structural workflow
 * assertion while destroying the proof, so the thing pinned HERE is the
 * script's rejection behavior — each mismatch class must exit non-zero.
 *
 * Baseline schema (v2 shape, R6 P1; tuples R7; specId R13): per-file sorted
 * MULTISETS of test identities (JSON tuples [projectId, projectName, specId,
 * [titles...]]), not just a file set and a global total. A file-set +
 * one-total comparison permits COMPENSATED
 * narrowing — an environment-conditioned grep that drops half the tests while
 * repeatEach duplicates the survivors preserves every filename and the total,
 * and equal-cardinality test/project substitutions do the same. Identity
 * multisets make every one of those a mismatch.
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

type FixtureTest = { status?: string; projectName?: string; projectId?: string };
type FixtureSpec = { title: string; tests: FixtureTest[]; suiteTitle?: string; id?: string };

/**
 * Playwright-JSON-shaped report. config.rootDir is ROOT/tests/e2e so the
 * script MUST resolve spec.file against it to produce repo-relative paths
 * (real Playwright output reports files relative to the config's rootDir).
 */
function reportFrom(specsByFile: Record<string, FixtureSpec[]>): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-report-"));
  const suites = Object.entries(specsByFile).map(([file, specs]) => ({
    file,
    suites: specs
      .filter((s) => s.suiteTitle !== undefined)
      .map((s) => ({
        title: s.suiteTitle,
        suites: [],
        specs: [{ file, title: s.title, tests: s.tests, id: s.id }],
      })),
    specs: specs
      .filter((s) => s.suiteTitle === undefined)
      .map((s) => ({ file, title: s.title, tests: s.tests, id: s.id })),
  }));
  const p = join(dir, "report.json");
  writeFileSync(p, JSON.stringify({ config: { rootDir: join(ROOT, "tests", "e2e") }, suites }));
  return p;
}

/** The common shape: `testsPerFile` specs t0..tn-1, one executed outcome each. */
function report(files: string[], testsPerFile: number): string {
  const byFile: Record<string, FixtureSpec[]> = {};
  for (const file of files) {
    byFile[file] = Array.from({ length: testsPerFile }, (_, i) => ({
      title: `t${i}`,
      tests: [{ status: "expected" }],
    }));
  }
  return reportFrom(byFile);
}

/**
 * v2 baseline: per-file identity arrays (JSON tuples — see `id` below).
 * totalTests defaults to the sum — pass an explicit value only to construct
 * a self-INCONSISTENT baseline.
 */
function baseline(perFile: Record<string, string[]>, totalTests?: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-file-"));
  const p = join(dir, "standalone-baseline.json");
  const files: Record<string, string[]> = {};
  for (const f of Object.keys(perFile).sort()) files[f] = [...(perFile[f] ?? [])].sort();
  const total = totalTests ?? Object.values(files).reduce((n, ids) => n + ids.length, 0);
  writeFileSync(p, JSON.stringify({ files, totalTests: total }));
  return p;
}

// Report-side names are rootDir-relative; baseline-side are repo-relative.
const A_REPORT = "a.spec.ts";
const B_REPORT = "b.spec.ts";
const A = "tests/e2e/a.spec.ts";
const B = "tests/e2e/b.spec.ts";
/**
 * Identity format mirrors the script: a JSON tuple, so no crafted title can
 * collide with a delimiter (R7: ` :: `/` > ` joins were not injective).
 * [projectId, projectName, specId, [suite titles..., test title]] — specId
 * replaced the R7 repeatEachIndex component (R13: the json reporter never
 * serializes repeatEachIndex; repeat identity rides spec.id).
 */
const id = (titles: string[], projectName = "", projectId = "", specId = "") =>
  JSON.stringify([projectId, projectName, specId, titles]);
const T0 = id(["t0"]);
const T1 = id(["t1"]);

describe("check-standalone-baseline behavioral contract (spec §4.1)", () => {
  it("exits zero on a full match, resolving report paths against config.rootDir", () => {
    const bl = baseline({ [A]: [T0, T1], [B]: [T0, T1] });
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).toBe(0);
  });

  it("rejects a baseline spec the report lacks", () => {
    const bl = baseline({ [A]: [T0, T1], [B]: [T0, T1] });
    expect(run(["--report", report([A_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report spec the baseline lacks", () => {
    const bl = baseline({ [A]: [T0, T1] });
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects a self-inconsistent baseline (totalTests != identity sum) as malformed", () => {
    const bl = baseline({ [A]: [T0, T1], [B]: [T0, T1] }, 5);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects COMPENSATED narrowing: half the tests dropped, survivors duplicated (R6 P1)", () => {
    // The exact hole the file-set + global-total comparison left open: an
    // environment-conditioned grep retains t0 while repeatEach: 2 runs it
    // twice per file. Every filename survives, the total stays 4 — and the
    // omitted t1 assertions are dark. Identity multisets red this.
    const bl = baseline({ [A]: [T0, T1], [B]: [T0, T1] });
    const rp = reportFrom({
      [A_REPORT]: [{ title: "t0", tests: [{ status: "expected" }, { status: "expected" }] }],
      [B_REPORT]: [{ title: "t0", tests: [{ status: "expected" }, { status: "expected" }] }],
    });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects an equal-cardinality TEST substitution within a file", () => {
    const bl = baseline({ [A]: [T0, T1] });
    const rp = reportFrom({
      [A_REPORT]: [
        { title: "t0", tests: [{ status: "expected" }] },
        { title: "tX", tests: [{ status: "expected" }] },
      ],
    });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects an equal-cardinality PROJECT substitution within a test", () => {
    // Two projects each running t0 narrows to one project running it twice:
    // same file, same count, half the coverage. Project identity reds it.
    const bl = baseline({ [A]: [id(["t0"], "p1"), id(["t0"], "p2")] });
    const rp = reportFrom({
      [A_REPORT]: [
        {
          title: "t0",
          tests: [
            { status: "expected", projectName: "p1" },
            { status: "expected", projectName: "p1" },
          ],
        },
      ],
    });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects a DUPLICATE-projectName substitution (projectId discriminates — R7 injectivity)", () => {
    // Two projects sharing a display name: identity keyed on projectName
    // alone collapses them, so dropping one and duplicating the other
    // preserves the multiset. projectId in the tuple reds it.
    const bl = baseline({
      [A]: [id(["t0"], "dup", "proj-1"), id(["t0"], "dup", "proj-2")],
    });
    const rp = reportFrom({
      [A_REPORT]: [
        {
          title: "t0",
          tests: [
            { status: "expected", projectName: "dup", projectId: "proj-1" },
            { status: "expected", projectName: "dup", projectId: "proj-1" },
          ],
        },
      ],
    });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects a REPEAT-INDEX substitution: same tests, same multiplicity, different repeat instances (R13 P1)", () => {
    // The json reporter emits NO repeatEachIndex — the old tuple normalized
    // it to 0 for every real outcome, so a local repeatEach:2 baseline
    // compared equal to a CI run executing repeat indices 2/3 under
    // repeatEach:4 + shard 2/2 (equal multiplicity either way). Repeat
    // identity lives in spec.id (suiteUtils testIdExpression "(repeat:N)");
    // the tuple now carries it and the substitution reds.
    const bl = baseline({ [A]: [id(["t0"], "", "", "f-r0"), id(["t0"], "", "", "f-r1")] });
    const rp = reportFrom({
      [A_REPORT]: [
        { title: "t0", id: "f-r2", tests: [{ status: "expected" }] },
        { title: "t0", id: "f-r3", tests: [{ status: "expected" }] },
      ],
    });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("matching spec ids compare equal (control: the repeat-identity axis is live, not decorative)", () => {
    const bl = baseline({ [A]: [id(["t0"], "", "", "f-r0"), id(["t0"], "", "", "f-r1")] });
    const rp = reportFrom({
      [A_REPORT]: [
        { title: "t0", id: "f-r0", tests: [{ status: "expected" }] },
        { title: "t0", id: "f-r1", tests: [{ status: "expected" }] },
      ],
    });
    expect(run(["--report", rp, "--baseline", bl])).toBe(0);
  });

  it("rejects a DELIMITER-collision substitution (JSON tuples, not joined strings — R7 injectivity)", () => {
    // Under a ' > '-joined identity, suite "a > b" + test "t" collides with
    // suite "a" + test "b > t" — dropping one while duplicating the other
    // preserves a joined-string multiset. JSON title ARRAYS stay distinct.
    const bl = baseline({
      [A]: [id(["a > b", "t"]), id(["a", "b > t"])],
    });
    const rp = reportFrom({
      [A_REPORT]: [
        { title: "t", suiteTitle: "a > b", tests: [{ status: "expected" }] },
        { title: "t", suiteTitle: "a > b", tests: [{ status: "expected" }] },
      ],
    });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("a spec with an empty tests[] executed nothing — its file drops from run membership (red)", () => {
    // Originally pinned as "file stays, contributes zero" (exact-sum). The
    // skipped-test repair tightened the run-report side: zero executed tests
    // IS the narrowing the guard exists to catch, whatever shape produced it,
    // so the file drops from executed membership and reds against a baseline
    // that lists it.
    const rp = reportFrom({
      [A_REPORT]: [{ title: "t", tests: [] }],
      [B_REPORT]: [{ title: "t", tests: [{ status: "expected" }] }],
    });
    const bl = baseline({ [A]: [id(["t"])], [B]: [id(["t"])] });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report where a test SKIPPED instead of executing (status: 'skipped' does not count)", () => {
    // The narrowing vector the count exists to catch, in its skip form: an
    // environment-conditioned test.skip/fixme keeps the file AND the test
    // entry in the report while executing nothing. Playwright's json reporter
    // marks the outcome status "skipped"; counting it as executed would let
    // zero execution match the baseline.
    const rp = reportFrom({
      [A_REPORT]: [{ title: "t", tests: [{ status: "expected" }, { status: "skipped" }] }],
    });
    const bl = baseline({ [A]: [id(["t"]), id(["t"])] });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report where a file's EVERY test skipped (file drops from executed membership)", () => {
    const rp = reportFrom({
      [A_REPORT]: [{ title: "t", tests: [{ status: "skipped" }] }],
      [B_REPORT]: [{ title: "t", tests: [{ status: "expected" }] }],
    });
    const bl = baseline({ [A]: [id(["t"])], [B]: [id(["t"])] });
    expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report outcome with a MISSING or unknown status (fail-closed, never executed)", () => {
    // A schema-malformed run report must not slip through as executed: under
    // the old `status !== "skipped"` predicate, both a missing status and a
    // novel one ("passed" is the classic wrong guess for Playwright's
    // "expected") counted as executed and MATCHED the baseline below — so
    // exit 0 here is exactly the fail-open this pin exists to catch.
    for (const tests of [[{}], [{ status: "passed" }]]) {
      const rp = reportFrom({ [A_REPORT]: [{ title: "t", tests }] });
      const bl = baseline({ [A]: [id(["t"])] });
      expect(run(["--report", rp, "--baseline", bl])).not.toBe(0);
    }
  });

  it("rejects a LEGACY v1 baseline (files array + total only) as malformed — no silent coarse fallback", () => {
    const dir = mkdtempSync(join(tmpdir(), "v1-baseline-"));
    const p = join(dir, "standalone-baseline.json");
    writeFileSync(p, JSON.stringify({ files: [A, B], totalTests: 4 }));
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", p])).not.toBe(0);
  });

  it("rejects a missing report file", () => {
    const bl = baseline({ [A]: [T0, T1] });
    expect(run(["--report", "/nonexistent/report.json", "--baseline", bl])).not.toBe(0);
  });

  it("rejects a malformed report file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bad-report-"));
    const bad = join(dir, "report.json");
    writeFileSync(bad, "not json {");
    expect(run(["--report", bad, "--baseline", baseline({ [A]: [T0, T1] })])).not.toBe(0);
  });

  it("zero args: reads test-results/standalone-report.json relative to cwd and compares (A3 amendment)", () => {
    // Self-contained: the fixture report's rootDir points INSIDE the temp cwd,
    // because the script computes repo-relativity against ITS process.cwd().
    const cwd = mkdtempSync(join(tmpdir(), "default-report-"));
    mkdirSync(join(cwd, "test-results"), { recursive: true });
    writeFileSync(
      join(cwd, "test-results", "standalone-report.json"),
      JSON.stringify({
        config: { rootDir: join(cwd, "tests", "e2e") },
        suites: [
          {
            file: "a.spec.ts",
            suites: [],
            specs: [
              { file: "a.spec.ts", title: "t0", tests: [{ status: "expected" }] },
              { file: "a.spec.ts", title: "t1", tests: [{ status: "expected" }] },
            ],
          },
        ],
      }),
    );
    expect(run(["--baseline", baseline({ "tests/e2e/a.spec.ts": [T0, T1] })], cwd)).toBe(0);
  });

  it("zero args with the default report absent exits non-zero", () => {
    const cwd = mkdtempSync(join(tmpdir(), "no-default-report-"));
    expect(run(["--baseline", baseline({ "tests/e2e/a.spec.ts": [T0, T1] })], cwd)).not.toBe(0);
  });
});
