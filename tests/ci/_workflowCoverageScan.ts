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
 *   - the workflow has NO `pull_request.paths` or `paths-ignore` filter (either form
 *     is a filter: the job does not run on every PR. An enumerated filter
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
/**
 * Whether the line that invokes a spec can swallow a non-zero exit.
 *
 * ALLOWLIST, not a leak hunt. The previous version enumerated three leak
 * forms (`|| true`, `; exit 0`, a trailing `tee|cat|grep` pipe) and an
 * adversarial round walked straight past all three with `|| :`, `; true`, and
 * `| sed -n 1p`. Enumerating bad shapes loses to whoever writes the next one,
 * so this asks the opposite question: is anything AT ALL chained after the
 * invocation that could replace its status?
 *
 * `;`, `|`, and `||` are all status-replacing (`a; b` and `a | b` both report
 * b's status absent `pipefail`, and `a || b` runs b precisely when a failed).
 * `&&` is NOT: `setup && playwright test …` still fails the step when either
 * side fails, and real workflows here use it, so it stays allowed.
 *
 * Scoped to the lines that actually carry an invocation, so an unrelated
 * `echo … | tee` elsewhere in a multi-line run block does not disqualify a
 * step. Where it is ambiguous this errs toward REJECTING — a false "dark"
 * reading costs an allowlist row with a reason, while a false "covered" one
 * silently deletes real coverage.
 */
function suppressesExit(cmd: string): boolean {
  return cmd
    .split("\n")
    .filter((line) => /\bplaywright\b|\bpnpm\b/.test(line))
    .some((line) => /[;|]/.test(line));
}

/**
 * The ONE command form that covers a whole config rather than a named spec.
 *
 * A whole-config command names no spec, so spec-path extraction finds nothing
 * and the job would claim nothing at all — not "rejected", but invisible. That
 * gap is closed by recognizing a single exact literal and nothing else.
 *
 * Deliberately not a grammar. Four adversarial rounds failed to make general
 * narrowing semantics (`--grep`, `--shard`, positional filters, arguments
 * forwarded from a call site) sound, and each repair introduced the next
 * contradiction; those ambitions are filed as backlog items instead. Anything
 * that is not this exact string yields no whole-config claim, which cannot be
 * attacked on grammar because there is none.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.1.
 */
const WHOLE_CONFIG_RE = /^pnpm exec playwright test --config (\S+)$/;

type Opts = {
  /** workflow file basename -> raw YAML text */
  workflows: Record<string, string>;
  /** package.json "scripts" map, for alias resolution */
  packageScripts: Record<string, string>;
  /**
   * config path -> the spec paths its `testMatch` resolves to. Supplied by the
   * caller (the meta-test resolves it from the live config) so this module
   * stays pure and hardcodes no membership. A config absent from this map
   * yields no whole-config claim.
   */
  configSpecs?: Record<string, string[]>;
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

/**
 * Whether a block declares `continue-on-error` in any status-swallowing form.
 *
 * ALLOWLIST again: only a literal `false` is safe. Matching literal `true`
 * missed `${{ true }}` — an expression GitHub evaluates to true — and would
 * equally miss `${{ github.event_name == 'push' }}` or a `yes`/`on` YAML
 * boolean. Anything that is not exactly `false` is treated as swallowing,
 * because the scanner cannot evaluate an expression and must not guess in the
 * permissive direction.
 */
function hasContinueOnError(block: string): boolean {
  const m = block.match(/(^|\n)\s*continue-on-error\s*:\s*([^\n]*)/);
  if (!m) return false;
  return (
    m[2]!
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase() !== "false"
  );
}

export function scanWorkflowCoverage({ workflows, packageScripts, configSpecs = {} }: Opts): {
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
    // Whole-config recognition. Applied to `cmd` only: `resolveSpecs` already
    // recurses into each alias body, so a command moved into package.json
    // arrives here AS `cmd` on the recursive call and is recognized there.
    // An explicit alias-body pass was written first and PROVEN DEAD by
    // mutation — deleting it left the alias test green.
    const wholeConfig = cmd.trim().match(WHOLE_CONFIG_RE);
    const fromConfig = wholeConfig ? (configSpecs[wholeConfig[1]!] ?? []) : [];
    return [...direct, ...aliases, ...fromConfig];
  };

  for (const [file, yaml] of Object.entries(workflows)) {
    const on = onBlock(yaml);
    const pr = pullRequestBlock(on);
    const hasPr = pr !== null || /(^|\n)on\s*:\s*\[[^\]\n]*pull_request/.test(yaml);
    // `paths-ignore` is a path filter too. Matching only `paths:` mis-classified an
    // exclusion-filtered workflow as PR-blocking-capable, which would silently mark
    // its specs "covered" even though the job does not run on every PR (found while
    // reviewing fix/picker-flow-app-bugs, where crew-e2e.yml moved to paths-ignore).
    const hasPathsFilter = pr !== null && /(^|\n)\s*paths(-ignore)?\s*:/.test(pr);

    for (const job of jobs(yaml)) {
      const jobIf = /(^|\n)\s*if\s*:/.test(job.head);
      const jobCoe = hasContinueOnError(job.head);
      for (const step of job.steps) {
        const runMatch = step.match(/(^|\n)\s*run\s*:([\s\S]*)$/);
        if (!runMatch) continue;
        const cmd = runMatch[2]!;
        const stepIf = /(^|\n)\s*if\s*:/.test(step);
        const stepCoe = hasContinueOnError(step);
        for (const spec of resolveSpecs(cmd)) {
          if (!hasPr) rejected.push({ file, spec, reason: "no pull_request trigger" });
          else if (hasPathsFilter)
            rejected.push({ file, spec, reason: "pull_request.paths/paths-ignore filter" });
          else if (jobIf || stepIf) rejected.push({ file, spec, reason: "if: condition present" });
          else if (jobCoe || stepCoe) rejected.push({ file, spec, reason: "continue-on-error" });
          else if (suppressesExit(cmd))
            rejected.push({ file, spec, reason: "exit-code suppression" });
          else covered.add(spec);
        }
      }
    }
  }
  return { covered, rejected };
}
