/**
 * scripts/plan-fences.ts — `pnpm plan:fences`, the CLI frontend.
 *
 * ONE core, two frontends: this and the meta-test at
 * `tests/docs/_metaPlanSnippetFences.test.ts` both call `analyzePlan` and must
 * report the same findings over the same tree — a test asserts exactly that.
 * Two recognizers would disagree eventually, and the disagreement would show up
 * as a developer whose local run is clean while CI is red.
 *
 * This adapter owns the I/O; the read-core owns the rules and stays pure.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzePlan, type Finding, type PlanFenceReport } from "../lib/planFences";
import { PLAN_FENCE_BASELINE } from "../tests/docs/planFencesBaseline";

const DEFAULT_ROOT = "docs/superpowers/plans";

/**
 * The SAME baseline the gate applies, imported rather than re-derived. If the
 * CLI reported raw findings it would exit 1 forever on a corpus whose 4044
 * legacy rows are deliberately frozen, and a developer would learn to ignore
 * it — which is the same as not having it. `--all` shows the unfiltered set.
 */
const baseline = new Map(
  PLAN_FENCE_BASELINE.map((row) => [
    row.slice(0, row.lastIndexOf("|")),
    Number(row.slice(row.lastIndexOf("|") + 1)),
  ]),
);

export const identityOf = (f: Finding): string =>
  `${f.path}|${f.fenceLine}|${f.rule}|${f.instance}`;

/** Exactly the gate's predicate: baselined within count passes, anything else fails. */
export function nonBaselined(findings: Finding[]): Finding[] {
  return findings.filter((f) => {
    const allowed = baseline.get(identityOf(f));
    return allowed === undefined || f.count > allowed;
  });
}

export function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...markdownFiles(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

export function scanTree(root: string): PlanFenceReport[] {
  return markdownFiles(root).map((f) => analyzePlan(f, readFileSync(f, "utf8")));
}

function main(): void {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith("-")) ?? DEFAULT_ROOT;
  const reports = scanTree(root);

  const all = reports.flatMap((r) => r.findings);
  const showAll = args.includes("--all");
  const findings = showAll ? all : nonBaselined(all);
  const waived = reports.flatMap((r) => r.waived);
  const waiverErrors = reports.flatMap((r) => r.waiverErrors);
  const unplaced = reports.flatMap((r) => r.unplaced);

  for (const f of findings) {
    console.log(`${f.path}:${f.fenceLine}  ${f.rule}  ${f.instance}  (x${f.count})`);
  }
  for (const e of waiverErrors) {
    console.log(`${e.path}:${e.line}  WAIVER_${e.code}  ${e.message}`);
  }
  // Waived and unplaced are PRINTED, not hidden. A suppression nobody can see is
  // indistinguishable from a rule that stopped working.
  for (const u of unplaced) {
    console.log(`${u.path}:${u.line}  UNPLACED_FENCE  ${u.reason}`);
  }

  const fences = reports.reduce((n, r) => n + r.fences, 0);
  const eligible = reports.reduce((n, r) => n + r.eligibleFences, 0);
  const attributed = reports.reduce((n, r) => n + r.attributedFences, 0);
  console.log(
    `\nplan:fences  ${reports.length} files  ${fences} fences  ${eligible} eligible  ` +
      `${attributed} attributed  ${findings.length} findings` +
      (showAll ? "" : ` (${all.length - findings.length} baselined)`) +
      `  ${waived.length} waived  ` +
      `${unplaced.length} unplaced  ${waiverErrors.length} waiver errors`,
  );

  process.exitCode = findings.length > 0 || waiverErrors.length > 0 ? 1 : 0;
}

// Only when invoked directly, so the exported helpers stay importable by tests.
if (process.argv[1] && process.argv[1].endsWith("plan-fences.ts")) main();
