// scripts/probes/2026-09-01-surface-control-verdict.ts
//
// Does a surface's DECLARED control mutant actually make its DECLARED suites fail?
//
// AC-3 in tests/mutation/source/surfaceCases.ts asks that question and reads the
// answer off the child's exit code, which cannot separate three outcomes: a suite
// that rejected the mutant, a suite that ran and did not notice, and a child that
// collected nothing. This probe reads the JSON report instead, so it stays a valid
// check across a change to what `runControl` returns.
//
// Usage:
//   node --import tsx scripts/probes/2026-09-01-surface-control-verdict.ts <surfaceId>...
//   node --import tsx scripts/probes/2026-09-01-surface-control-verdict.ts \
//     --mutant <surfaceId> '<siteId>' [--only-case '<name filter>']
//
// Exit 0 iff every named surface has some declared suite reporting >= 1 FAILED test.
//
// `--mutant` runs a NAMED site's mutant instead of the registry's `control`, which is what an
// accepted-gap row's falsifier needs: the row asserts that its site survives, and the question is
// whether a new case kills it. `--only-case` narrows the child with vitest's `-t`, and reading the
// report rather than the exit code is what makes that safe -- a `-t` matching nothing exits 0 and
// would otherwise read as a pass.
//
// DOCUMENTED LIMIT of `--only-case` on a MULTI-SUITE surface, measured 2026-09-01 rather than
// imagined. The filter names a case that lives in one declared suite, so every OTHER declared suite
// runs nothing and is dark by construction. The verdict is still correct in direction -- a run
// where the filtered case does not kill exits non-zero -- but its KIND reads `no-observations`
// naming the sibling suite, when the fact of interest is that the filtered case ran and did not
// fail. Use the unfiltered form to distinguish those two; the filtered form answers "did this
// named case kill this mutant" and nothing else.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { generateMutants } from "../../tests/mutation/source/generate";
import { enumerateSites, siteId } from "../../tests/mutation/source/operators";
import { GUARD_SURFACES } from "../../tests/mutation/source/registry";

const ROOT = process.cwd();
const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/**
 * `ran` is PASSED PLUS FAILED, never `numTotalTests`. Measured against vitest
 * 4.1.5 on 2026-09-01: a `-t` filter matching nothing reports every declared
 * test as PENDING and exits 0, so counting declared tests would read a filter
 * that matched nothing as a suite that ran and found nothing.
 */
type SuiteReport = { suite: string; ran: number; failed: number; reportRead: boolean };

function runSuite(target: string, mutantFile: string, suite: string, dir: string): SuiteReport {
  const out = join(dir, `report-${suite.replace(/[^a-zA-Z0-9]/g, "_")}.json`);
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "--config",
        CONFIG,
        "--reporter=json",
        `--outputFile=${out}`,
        ...(onlyCase === undefined ? [] : ["-t", onlyCase]),
      ],
      {
        cwd: ROOT,
        stdio: "ignore",
        env: {
          ...process.env,
          MUTATION_ROOT: ROOT,
          MUTATION_TARGET: target,
          MUTATION_MUTANT: mutantFile,
          MUTATION_SUITE: suite,
        },
      },
    );
  } catch {
    // A non-zero exit is the ORDINARY case here — it is what a noticed mutant
    // produces. The report below, not this exit, is the verdict.
  }
  try {
    const r = JSON.parse(readFileSync(out, "utf8")) as {
      numPassedTests?: number;
      numFailedTests?: number;
    };
    return {
      suite,
      ran: (r.numPassedTests ?? 0) + (r.numFailedTests ?? 0),
      failed: r.numFailedTests ?? 0,
      reportRead: true,
    };
  } catch {
    return { suite, ran: 0, failed: 0, reportRead: false };
  }
}

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const onlyCase = flag("--only-case");
const mutantSite = flag("--mutant") === undefined ? undefined : argv[argv.indexOf("--mutant") + 2];
const ids =
  flag("--mutant") !== undefined
    ? [flag("--mutant")!]
    : argv.filter((a) => !a.startsWith("--") && a !== onlyCase);
if (ids.length === 0) {
  console.error(
    "usage: <surfaceId>...  |  --mutant <surfaceId> <siteId> [--only-case <name>]\n" +
      "       (ids from tests/mutation/source/registry.ts)",
  );
  process.exit(2);
}
if (flag("--mutant") !== undefined && (mutantSite === undefined || mutantSite.startsWith("--"))) {
  console.error("--mutant requires a surfaceId AND a siteId");
  process.exit(2);
}

let bad = 0;
for (const id of ids) {
  const surface = GUARD_SURFACES.find((s) => s.id === id);
  if (surface === undefined) {
    console.error(`${id}: not an enrolled surface`);
    bad += 1;
    continue;
  }
  const target = resolve(ROOT, surface.sourcePath);
  const source = readFileSync(target, "utf8");
  let broken: string;
  if (mutantSite !== undefined) {
    // A NAMED site from the harness's own generator, so the text under test is the
    // one the gate would score rather than an edit written here by hand.
    const sites = enumerateSites(surface.sourcePath, source, surface.operators);
    const { mutants } = generateMutants(surface.sourcePath, source, surface.operators, sites);
    const m = mutants.find((x) => siteId(x.site) === mutantSite);
    if (m === undefined) {
      console.error(`${id}: no generated mutant with site id ${mutantSite}`);
      bad += 1;
      continue;
    }
    broken = m.text;
  } else {
    const occurrences = source.split(surface.control.from).length - 1;
    if (occurrences !== 1) {
      console.error(`${id}: control.from occurs ${occurrences} times in ${surface.sourcePath}`);
      bad += 1;
      continue;
    }
    // Replacer FUNCTION: `control.to` is registry-authored code text, and a `$`
    // sequence in it would apply as something other than its declared text.
    broken = source.replace(surface.control.from, () => surface.control.to);
  }
  const dir = mkdtempSync(join(tmpdir(), "fx-control-verdict-"));
  try {
    const mutantFile = join(dir, "control.ts");
    writeFileSync(mutantFile, broken, "utf8");
    const reports = surface.suitePaths.map((s) => runSuite(target, mutantFile, s, dir));
    const noticed = reports.some((r) => r.failed > 0);
    const dark = reports.filter((r) => !r.reportRead || r.ran === 0);
    for (const r of reports) {
      console.log(
        `  ${id} ${r.suite}: ${r.reportRead ? `${r.ran} ran, ${r.failed} failed` : "NO REPORT"}`,
      );
    }
    if (noticed) {
      console.log(`${id}: NOTICED`);
    } else if (dark.length > 0) {
      console.log(`${id}: NO OBSERVATIONS — ${dark.map((r) => r.suite).join(", ")} ran nothing`);
      bad += 1;
    } else {
      console.log(`${id}: NOT NOTICED — every declared suite ran and none failed`);
      bad += 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(bad === 0 ? 0 : 1);
