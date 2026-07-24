/**
 * tests/ci/_workflowCoverageScan.ts
 *
 * Pure scanner for the e2e workflow-coverage meta-test (spec
 * 2026-07-24-archive-row-menu-idiom §6 item 6). Answers: which
 * tests/e2e/*.spec.ts paths are invoked by an AUTOMATIC, PR-BLOCKING-CAPABLE
 * workflow run?
 *
 * An invocation COUNTS only when ALL hold:
 *   - the workflow declares a `pull_request` trigger (workflow_dispatch-only
 *     and push-only are post-merge/manual discovery, not a PR gate);
 *   - the workflow has NO `pull_request.paths` filter (an enumerated filter
 *     that fires on the spec file but not on production dependencies is the
 *     documented dark-path hole — spec R12-R16);
 *   - neither the job head nor the RUN STEP itself carries `if:` or
 *     `continue-on-error` — a diagnostic SIBLING step (`if: failure()` trace
 *     upload, present in every real e2e workflow here) must NOT disqualify;
 *   - the run command does not suppress the exit code (`|| true`, `; exit 0`,
 *     a trailing status-swallowing pipe).
 * Commands are resolved transitively through package.json scripts (`pnpm
 * test:e2e:*`-style aliases carry the real spec list).
 *
 * Regex-on-YAML is deliberate and TESTED in the meta-test's self-suite (the
 * _rowWrapperScan lesson: a scanner that silently matches nothing is worse
 * than none).
 */

const SPEC_RE = /tests\/e2e\/[\w.-]+\.spec\.ts/g;
const SUPPRESS_RE = /(\|\|\s*true)|(;\s*exit\s+0)|(\|\s*(tee|cat|grep)[^|]*$)/;

type Opts = {
  /** workflow file basename -> raw YAML text */
  workflows: Record<string, string>;
  /** package.json "scripts" map, for alias resolution */
  packageScripts: Record<string, string>;
};

/** The `on:` block (from the `on:` line to the next top-level key). */
function onBlock(yaml: string): string {
  const m = yaml.match(/(^|\n)on\s*:\s*\n([\s\S]*?)(?=\n\S|$)/);
  return m ? m[2]! : "";
}

/** The pull_request SUB-block inside `on:` - its own indented lines only, so a
 *  `paths:` under `push:` (or anywhere else) cannot false-positive (plan R1
 *  medium finding: an unbounded regex crossed block boundaries). */
function pullRequestBlock(on: string): string | null {
  const m = on.match(/(^|\n)(\s*)pull_request\s*:([^\n]*)\n?((?:\2\s+[^\n]*\n?)*)/);
  if (!m) return null;
  return (m[3] ?? "") + "\n" + (m[4] ?? "");
}

/** Split the `jobs:` body into per-job chunks (2-space-indent job keys), and
 *  each job into its pre-steps HEAD and its individual STEP blocks. `if:` and
 *  `continue-on-error` are scoped to the JOB head and the RUN STEP itself
 *  (plan R1 blocking finding: a file-level check could never count any real
 *  workflow — they all carry an `if: failure()` upload step). */
function jobs(yaml: string): Array<{ head: string; steps: string[] }> {
  const m = yaml.match(/(^|\n)jobs\s*:\s*\n([\s\S]*)$/);
  if (!m) return [];
  return m[2]!.split(/\n(?=  [\w-]+\s*:)/).map((job) => {
    const idx = job.search(/(^|\n)\s*steps\s*:/);
    if (idx === -1) return { head: job, steps: [] };
    const head = job.slice(0, idx);
    const steps = job
      .slice(idx)
      .split(/\n(?=\s*-\s)/)
      .slice(1)
      // Normalize the list marker so `- run:` / `- if:` inline forms match the
      // same line-anchored regexes as the two-line `- name:` + `run:` form
      // (plan R2 blocking finding: without this, inline `- run:` steps were
      // INVISIBLE - the exact silently-matches-nothing class this guard cites
      // _rowWrapperScan to prevent).
      .map((st) => st.replace(/^(\s*)-\s*/, "$1"));
    return { head, steps };
  });
}

export function scanWorkflowCoverage({ workflows, packageScripts }: Opts): {
  covered: Set<string>;
  rejected: Array<{ file: string; spec: string; reason: string }>;
} {
  const covered = new Set<string>();
  const rejected: Array<{ file: string; spec: string; reason: string }> = [];

  const resolveSpecs = (cmd: string): string[] => {
    const direct = cmd.match(SPEC_RE) ?? [];
    // pnpm alias resolution: `pnpm foo` / `pnpm run foo` -> scripts.foo
    const aliases = [...cmd.matchAll(/pnpm(?:\s+run)?\s+([\w:.-]+)/g)]
      .map((mm) => mm[1]!)
      .filter((name) => name in packageScripts)
      .flatMap((name) => resolveSpecs(packageScripts[name]!));
    return [...direct, ...aliases];
  };

  for (const [file, yaml] of Object.entries(workflows)) {
    const on = onBlock(yaml);
    const pr = pullRequestBlock(on);
    const hasPr = pr !== null || /(^|\n)on\s*:\s*\[[^\]\n]*pull_request/.test(yaml);
    const hasPathsFilter = pr !== null && /(^|\n)\s*paths\s*:/.test(pr);

    for (const job of jobs(yaml)) {
      const jobIf = /(^|\n)\s*if\s*:/.test(job.head);
      const jobCoe = /(^|\n)\s*continue-on-error\s*:\s*true/.test(job.head);
      for (const step of job.steps) {
        const runMatch = step.match(/(^|\n)\s*run\s*:([\s\S]*)$/);
        if (!runMatch) continue;
        const cmd = runMatch[2]!;
        const stepIf = /(^|\n)\s*if\s*:/.test(step);
        const stepCoe = /(^|\n)\s*continue-on-error\s*:\s*true/.test(step);
        for (const spec of resolveSpecs(cmd)) {
          if (!hasPr) rejected.push({ file, spec, reason: "no pull_request trigger" });
          else if (hasPathsFilter)
            rejected.push({ file, spec, reason: "pull_request.paths filter" });
          else if (jobIf || stepIf) rejected.push({ file, spec, reason: "if: condition present" });
          else if (jobCoe || stepCoe) rejected.push({ file, spec, reason: "continue-on-error" });
          else if (SUPPRESS_RE.test(cmd))
            rejected.push({ file, spec, reason: "exit-code suppression" });
          else covered.add(spec);
        }
      }
    }
  }
  return { covered, rejected };
}
