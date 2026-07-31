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

/**
 * Constructs that change WHERE or WHETHER a `run:` command executes, and that
 * this scanner deliberately refuses to model.
 *
 * An adversarial round produced false coverage through six of them:
 * `shell: bash -c ":" {0}` at step, job-default, or workflow-default level
 * (the command never runs, the step succeeds); `working-directory:` at the
 * same three levels (a relative config path resolves to a DIFFERENT config);
 * and `needs: gate` where `gate` carries `if: false`, so Actions skips the
 * job even though its own head has no condition.
 *
 * Modelling these is a losing game — the previous two rounds died the same way
 * — so a workflow using ANY of them yields no coverage at all. That is
 * conservative in the correct direction: a spec reads as dark and keeps its
 * allowlist row, rather than reading as covered by a job that never ran it.
 * Nothing in this repo's e2e workflows uses any of them.
 */
const UNMODELLED_RE = /(^|\n)\s*-?\s*(shell|working-directory|defaults|container|needs)\s*:/;

/**
 * Shell constructs INSIDE a run block that make "this block executes this
 * spec" unprovable by a line scan (R12 finding — the census's sibling
 * refusal, mirrored here because the two layers fell to the same vector):
 *
 *   - shell-STATE mutation: variable assignment in every form (inline
 *     `PATH=fixtures/fake pnpm exec playwright test …` runs a fake pnpm that
 *     exits 0 — green step, no tests; standalone, `+=` append, `A[i]=`
 *     array), the assignment builtins (export/declare/typeset/readonly/
 *     local/let/read/mapfile/readarray/getopts), source/dot scripts,
 *     directory changes (cd/pushd/popd — a relative spec or config path now
 *     resolves elsewhere), builtin/command/enable wrappers, and the census's
 *     R11 blacklist (hash/alias/unalias/shopt/trap/unset/exec/set/eval/
 *     exit/return);
 *   - control FLOW: an invocation inside an if/case/loop branch or a
 *     function body may never execute (`if false; then … fi` is a green
 *     step that ran nothing).
 *
 * Matched at COMMAND POSITION only — start of a line or after `;`, `&`,
 * `|`, `(`, `{` — so `pnpm setup && playwright test` (the ratified
 * &&-chain allowance: a failing predecessor fails the step) and option
 * tokens like `--reporter=list` (not command position) stay clean. Whole
 * run block, not just invocation lines: state mutated on line 1 governs an
 * invocation on line 2. Refusal direction per the header contract: a false
 * "dark" costs a reasoned allowlist row; a false "covered" silently deletes
 * real coverage.
 */
const UNMODELLED_SHELL_RE =
  /(?:^|[\n;&|({])[ \t]*(?:(?:if|then|else|elif|fi|case|esac|while|until|for|do|done|function|exit|return|exec|set|eval|hash|alias|unalias|shopt|trap|unset|export|declare|typeset|readonly|local|source|cd|pushd|popd|builtin|command|enable|let|read|mapfile|readarray|getopts)\b|\.[ \t]|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=|[A-Za-z_][A-Za-z0-9_]*[ \t]*\(\))/;

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
    return [...direct, ...aliases];
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
    // Checked against the WHOLE file: `shell:`/`working-directory:`/`defaults:`
    // apply at workflow, job, or step level, and `needs:` can point at a job
    // that is skipped. Any of them anywhere means this scanner cannot say what
    // ran, so it says nothing.
    const unmodelled = UNMODELLED_RE.test(yaml);

    for (const job of jobs(yaml)) {
      const jobIf = /(^|\n)\s*if\s*:/.test(job.head);
      const jobCoe = hasContinueOnError(job.head);
      for (const step of job.steps) {
        const runMatch = step.match(/(^|\n)\s*run\s*:([\s\S]*)$/);
        if (!runMatch) continue;
        const cmd = runMatch[2]!;
        const stepIf = /(^|\n)\s*if\s*:/.test(step);
        const stepCoe = hasContinueOnError(step);
        // Whole-config claim. Evaluated against the ENTIRE run block, and
        // deliberately NOT through alias resolution: an adversarial round
        // claimed full coverage for `echo pnpm test:e2e:standalone`, for a
        // `set +e` block, and for a backgrounded `… &`, because alias
        // recursion applied the exact match to the package-script BODY while
        // qualification only ever saw the outer command. Requiring the whole
        // run block to BE the literal removes the shell reasoning entirely —
        // there is no surrounding context left to smuggle anything into.
        const wholeConfigMatch = cmd.trim().match(WHOLE_CONFIG_RE);
        const fromConfig = wholeConfigMatch ? (configSpecs[wholeConfigMatch[1]!] ?? []) : [];

        for (const spec of [...resolveSpecs(cmd), ...fromConfig]) {
          if (!hasPr) rejected.push({ file, spec, reason: "no pull_request trigger" });
          else if (unmodelled)
            rejected.push({ file, spec, reason: "unmodelled execution override" });
          else if (hasPathsFilter)
            rejected.push({ file, spec, reason: "pull_request.paths/paths-ignore filter" });
          else if (jobIf || stepIf) rejected.push({ file, spec, reason: "if: condition present" });
          else if (jobCoe || stepCoe) rejected.push({ file, spec, reason: "continue-on-error" });
          else if (suppressesExit(cmd))
            rejected.push({ file, spec, reason: "exit-code suppression" });
          else if (UNMODELLED_SHELL_RE.test(cmd))
            rejected.push({ file, spec, reason: "unmodelled shell construct" });
          else covered.add(spec);
        }
      }
    }
  }
  return { covered, rejected };
}
