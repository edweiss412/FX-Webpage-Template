/**
 * STRUCTURAL before/after check for any change to `premiseScan`.
 *
 * Compares the classification RECORDS emitted by the shipped baseline
 * (`origin/main`'s `premiseScan.ts`) and by the working tree's current
 * `premiseScan.ts`, over every enrolled suite, as SETS:
 *
 *     (suite, line, testName, verdict, detail)
 *
 * Two properties are the point, and both are deliberate:
 *
 * 1. **Detail strings are compared for EQUALITY BETWEEN THE TWO RUNS**, never
 *    against known reason strings. A checker keyed on the current output's
 *    WORDING is blind to exactly one run — the run where a repair changes the
 *    wording — which is the only run it is ever asked about. This one needs no
 *    knowledge of what any reason SAYS.
 *
 * 2. **It aborts rather than reporting clean when it has nothing to measure.**
 *    A verdict-count comparison cannot see a reason attached to an
 *    `environment-touching` test, because no count moves; and a run whose two
 *    modules are byte-identical reports a perfect zero while comparing the
 *    baseline against itself. Both render exactly like success.
 *
 * Run it from the repository root in a worktree that CARRIES the change under
 * test:
 *
 *     pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/record-diff.mts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";

const ROOT = process.cwd();
const LIVE = join(ROOT, "tests/mutation/source/premiseScan.ts");
const BASE_REF = process.env.PREMISE_BASE_REF ?? "origin/main";
const BASE_SIBLING = join(ROOT, "tests/mutation/source/premiseScanRecordDiffBaseline.ts");

const baseText = execFileSync("git", ["show", `${BASE_REF}:tests/mutation/source/premiseScan.ts`], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const liveText = readFileSync(LIVE, "utf8");

// The abort that makes a zero meaningful. Byte-identical modules produce a
// perfect diff by construction, which is indistinguishable from "the change is
// verdict-neutral" and is the answer the author is hoping for.
if (baseText === liveText) {
  console.error(
    `record-diff: the working tree's premiseScan.ts is byte-identical to ${BASE_REF}'s.\n` +
      `There is no change to measure, and reporting 0 moved here would compare the baseline\n` +
      `against itself. Run this in a worktree that carries the change under test.`,
  );
  process.exit(2);
}

writeFileSync(BASE_SIBLING, baseText);
try {
  const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();
  if (suites.length === 0) throw new Error("record-diff: the registry enrols no suites");

  const spec = `./${"premiseScanRecordDiffBaseline"}.ts`;
  const { classifyTests: base } = (await import(
    `../../../../../../tests/mutation/source/${"premiseScanRecordDiffBaseline"}.ts`
  )) as { classifyTests: (root: string, suite: string) => { line: number; testName: string; verdict: string; detail: string }[] };
  const { classifyTests: live } = await import("../../../../../../tests/mutation/source/premiseScan");
  void spec;

  type Row = { verdict: string; detail: string };
  const dump = (fn: typeof base): Map<string, Row> => {
    const m = new Map<string, Row>();
    for (const s of suites)
      for (const r of fn(ROOT, s)) m.set(`${s}:${r.line}:${r.testName}`, { verdict: r.verdict, detail: r.detail });
    return m;
  };

  const B = dump(base);
  const L = dump(live as unknown as typeof base);
  if (B.size === 0 || L.size === 0) throw new Error("record-diff: an empty record set is a broken read, not a clean result");

  const onlyBase = [...B.keys()].filter((k) => !L.has(k));
  const onlyLive = [...L.keys()].filter((k) => !B.has(k));
  const verdictMoved: string[] = [];
  const detailMoved: string[] = [];
  for (const [k, b] of B) {
    const l = L.get(k);
    if (!l) continue;
    if (l.verdict !== b.verdict) verdictMoved.push(`${k}  ${b.verdict} -> ${l.verdict}`);
    if (l.detail !== b.detail) detailMoved.push(`${k}\n        base : ${b.detail.slice(0, 100)}\n        live : ${l.detail.slice(0, 100)}`);
  }

  // POSITIVE CONTROL on the COMPARISON itself, not on the change under test.
  // Perturb one record of the baseline set and require the same diff logic to
  // report exactly one move. A change that happens not to touch the construct a
  // constructed fixture uses would make a fixture-based control silent, and a
  // silent control is indistinguishable from a working one.
  {
    const probe = new Map(B);
    const victim = [...probe.keys()][0];
    if (victim === undefined) throw new Error("record-diff: no records to perturb — the control cannot run");
    const was = probe.get(victim)!;
    probe.set(victim, { verdict: `${was.verdict}-PERTURBED`, detail: `${was.detail}-PERTURBED` });
    let moved = 0;
    for (const [k, x] of B) {
      const y = probe.get(k);
      if (y && (y.verdict !== x.verdict || y.detail !== x.detail)) moved += 1;
    }
    console.log(`POSITIVE CONTROL: perturbing one record moves ${moved} (expected 1)`);
    if (moved !== 1) throw new Error("record-diff: the comparison cannot see a known difference; its zeros mean nothing");
  }

  console.log(`baseline ref             : ${BASE_REF}`);
  console.log(`suites                   : ${suites.length}`);
  console.log(`records: baseline ${B.size}, live ${L.size}`);
  console.log(`records only in baseline : ${onlyBase.length}`);
  console.log(`records only in live     : ${onlyLive.length}`);
  console.log(`VERDICT moved            : ${verdictMoved.length}`);
  console.log(`DETAIL moved             : ${detailMoved.length}`);
  for (const r of [...verdictMoved, ...detailMoved].slice(0, 12)) console.log(`      ${r}`);

  // A movement is the thing this script exists to find, so finding one must FAIL
  // the command. Printing it under exit 0 puts a finding where nobody looks: the
  // exit code is the signal a task, a hook and CI all read, and the body of a
  // green command's output is read by none of them. An earlier version only
  // printed (plan review r4 finding 3), and it is the same defect already fixed in
  // limits-check one round earlier — found there and not swept to its peers, which
  // is the class-sweep rule failing on this arc's own instruments.
  const moved = onlyBase.length + onlyLive.length + verdictMoved.length + detailMoved.length;
  if (moved > 0) {
    console.error(`\nrecord-diff: ${moved} record(s) moved — the change is NOT verdict-neutral`);
    process.exitCode = 1;
  } else {
    console.log(`\nno record moved: the change is verdict-neutral over ${B.size} records`);
  }
} finally {
  unlinkSync(BASE_SIBLING);
}
