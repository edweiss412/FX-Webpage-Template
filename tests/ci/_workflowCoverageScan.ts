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

import { parse, stringify } from "yaml";

const SPEC_RE = /tests\/e2e\/[\w.-]+\.spec\.ts/g;

/**
 * Canonicalize YAML before any regex sees it (R6 structural defense): parse
 * with the same library the census trusts, re-stringify in plain block
 * style with folding OFF (lineWidth: 0 — folding a long run command would
 * split tokens across lines and silently un-cover live specs). Quoted keys,
 * tags, anchors/aliases, explicit keys, flow mappings, and comments all
 * collapse to the canonical spelling the line-anchored regexes actually
 * read — the whole spelling class dies at the door instead of being
 * enumerated (spec §7 R3–R6 chased five probe-backed instances; the
 * calibration rule says ship the structure, not round seven). Returns null
 * when the text does not parse — an unparseable workflow never runs on
 * GitHub either, so the caller treats it as claim-nothing (safe-dark) or
 * poison (manifests). stringify re-emits anchors only for genuinely shared
 * nodes, which the anchor belt then refuses — fail-closed both ways.
 */
function canonicalYaml(text: string): string | null {
  try {
    const doc: unknown = parse(text);
    if (doc === null || typeof doc !== "object") return null;
    return stringify(doc, { lineWidth: 0, singleQuote: false });
  } catch {
    return null;
  }
}
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
  /**
   * Local composite-action ref exactly as written in `uses:` (e.g.
   * "./.github/actions/setup") -> that action's raw YAML text. Composite
   * steps execute in the CALLER's job env, so a local action that writes
   * GITHUB_ENV/GITHUB_PATH poisons the caller's later steps (cross-step-env
   * spec §2.2). A `./` ref ABSENT from this map is an opaque same-env
   * executor and poisons fail-closed; non-`./` (marketplace) refs stay
   * trusted — setup-node writes GITHUB_PATH by design, and modeling remote
   * action internals is out of universe (spec §5 L1).
   */
  localActions?: Record<string, string>;
};

/**
 * Cross-step env-state predicate (cross-step-env-guard spec §2.0): after
 * dropping full-line `#` lines (they never execute, and the step-splitter
 * glues BETWEEN-step comment prose onto the preceding chunk), any mention of
 * GITHUB_ENV or GITHUB_PATH marks the environment of every LATER same-job
 * step untrusted — `echo "PATH=/fake:$PATH" >> "$GITHUB_PATH"` makes a
 * textually clean downstream `pnpm exec playwright test` run a fake pnpm
 * that exits 0. Deliberately NO write-shape grammar (>> vs > vs tee vs
 * heredoc) and no read/write distinction: that is shell modeling, the losing
 * game. Matched against the WHOLE step chunk (name:/with:/env: lines
 * included) — broader than the census's run-block match, in the safe
 * direction (spec §5 L5).
 */
function writesJobEnv(chunk: string): boolean {
  return /GITHUB_ENV|GITHUB_PATH/.test(
    chunk
      .split("\n")
      .filter((l) => !/^[ \t]*#/.test(l))
      .join("\n"),
  );
}

/**
 * Whether a step chunk's `uses:` refs make the job env untrusted. Local
 * (`./`) refs resolve through `localActions` and RECURSE — a composite may
 * `uses:` another local composite (spec R1's escaping mutant #2). Poison
 * fail-closed when the ref is unknown, cyclic (PATH-scoped guard;
 * sequential reuse is legit), NOT `using: composite` (a javascript/docker
 * action's entry code can call core.addPath / core.exportVariable with
 * nothing for a text scan to see — spec R1's escaping mutant #1), or when
 * any resolved manifest mentions GITHUB_ENV/GITHUB_PATH outside comments.
 * Quotes around the ref are stripped first — `uses: "./x"` must not dodge
 * the `./` test into the trusted-marketplace branch. Non-`./` refs stay
 * trusted (spec §5 L1: setup-node writes GITHUB_PATH by design).
 */
/** Comment-stripped text (full-line `#` lines never execute). */
function stripCommentLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^[ \t]*#/.test(l))
    .join("\n");
}

/**
 * The manifest's top-level `runs:` block — its own indented lines only, same
 * bounded-block shape as onBlock/pullRequestBlock. Scoping matters (spec R2
 * BLOCKING): `using: composite` matched ANYWHERE in the manifest let a
 * node20 action masquerade as composite via that line in a multiline
 * `description:` scalar. `runs.using` / child `uses:` live under `runs:`, so
 * both checks read this block and nothing else. An inline-flow `runs: {...}`
 * yields null, which callers treat as not-composite — fail-closed.
 */
function runsBlockOf(text: string): string | null {
  const m = stripCommentLines(text).match(/(^|\n)runs\s*:\s*\n([\s\S]*?)(?=\n\S|$)/);
  return m ? m[2]! : null;
}

/**
 * YAML spellings that re-key or re-shape a mapping so a line-anchored regex
 * scan reads a DIFFERENT document than the YAML parser does (R3: quoted keys
 * `"uses":`, flow-mapping steps `- {uses: x}`, anchored/aliased values
 * `uses: &a ./x` / `uses: *a` — all parse to the same `uses` the typed
 * census resolves, while a plain-spelling regex sees nothing). The doctrine
 * is refuse-what-you-cannot-model: any of these in step METADATA or a job
 * head rejects the step/job's claims and poisons the job env fail-closed.
 * Applied to metadata only — the run VALUE is stripped first, so JSON
 * payloads or prose inside run bodies (and the live single-line JSON `env:`
 * values, which sit mid-line after a plain key) cannot false-dark a step.
 * One mechanism closes the whole spelling class for every key the scanner
 * reads (`uses`, `if`, `continue-on-error`, `run`, …).
 */
const UNMODELLED_SPELLING_RE =
  /(^|\n)\s*(?:-\s*)?["'][\w-]+["']\s*:|(^|\n)\s*(?:-\s*)?\{|(^|\n)[^\n]*:\s*[&*][\w-]|(^|\n)\s*-?\s*[&*][\w-]|(^|\n)[ \t]*(?:-[ \t]+)?\?(?=[ \t]|\r?\n|$)|(^|\n)[ \t]*:(?=[ \t]|\r?\n|$)|(^|\n)[ \t]*(?:-[ \t]+)?!/;

/** A step chunk minus its run VALUE — the metadata the spelling refusal reads. */
function stepMetaOf(chunk: string): string {
  const runMatch = chunk.match(/(^|\n)\s*run\s*:([\s\S]*)$/);
  return runMatch ? chunk.replace(runMatch[2]!, "") : chunk;
}

/**
 * Strict `uses:` VALUE extraction (R3): the value must be a plain scalar —
 * optionally quoted — that is either a local `./` ref, a `docker://` image,
 * or a plain marketplace `owner/repo[@ref]` token. Anything else (empty →
 * block/folded scalar on the next line, `&`/`*` → anchor/alias, stray
 * tokens) is unprovable by a line scan and poisons fail-closed.
 */
function localActionPoisons(
  chunk: string,
  localActions: Record<string, string>,
  seen: ReadonlySet<string>,
): boolean {
  for (const m of stripCommentLines(chunk).matchAll(/(^|\n)\s*(?:-\s*)?uses\s*:([^\n]*)/g)) {
    const rawValue = (m[2] ?? "").trim();
    const unquoted = rawValue.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (unquoted.startsWith("./")) {
      const ref = unquoted;
      if (seen.has(ref)) return true;
      const raw = localActions[ref];
      if (raw === undefined) return true;
      // Manifests canonicalize like workflows (R6 structural defense):
      // unparseable => opaque, fail-closed.
      const text = canonicalYaml(raw);
      if (text === null) return true;
      const runs = runsBlockOf(text);
      if (runs === null) return true;
      // EXACT value (R7): GitHub requires runs.using === "composite"
      // verbatim — composite!, composite/x, composite extra are INVALID
      // manifests that fail the job at this step, so downstream steps never
      // run. \b matched before punctuation and covered them.
      if (!/(^|\n)[ \t]*using:[ \t]*(?:"composite"|composite)[ \t]*(?:\r?\n|$)/.test(runs))
        return true;
      // steps: is REQUIRED for composite actions (R7): a composite manifest
      // without it is equally invalid — same job-killing consequence.
      if (!/(^|\n)[ \t]*steps[ \t]*:/.test(runs)) return true;
      // A manifest using an unmodelled spelling inside runs: could hide a
      // child uses from the recursion below — refuse it whole.
      if (UNMODELLED_SPELLING_RE.test(stripCommentLines(runs))) return true;
      if (writesJobEnv(text)) return true;
      // Child uses: are steps under runs: — recurse on the runs block only,
      // so prose outside it can neither masquerade nor false-poison.
      if (localActionPoisons(runs, localActions, new Set(seen).add(ref))) return true;
      continue;
    }
    if (/^docker:\/\/\S+$/.test(unquoted)) continue; // remote image — trusted (spec §5 L1)
    if (/^[\w.-]+\/[\w./-]+(@[\w./-]+)?$/.test(unquoted)) continue; // marketplace — trusted
    return true; // anchored, aliased, folded/block, empty, or otherwise unmodelable
  }
  return false;
}

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
 *
 * R13 additions, mirroring the census: function NAMES are any
 * metacharacter-free word, not \w (`foo-bar ( ) {` is a valid definition
 * with padded parens); brace-group tokens at command position (`a && {
 * true`) are control flow; `printf` (-v writes a variable) and `(( ))`
 * arithmetic assignment join the state changers; and ANY `$` or backtick
 * anywhere in the block is refused outright — `${VAR:=default}` assigns
 * during expansion on any command's arguments, and $(…)/backticks splice
 * state no scan can model. The brace-token alternative deliberately
 * excludes `(`/`{` from its anchor so a GitHub `${{ … }}` expression is
 * caught by the `$` rule, not misparsed as a shell brace group. A false
 * real coverage.
 */
const UNMODELLED_SHELL_RE =
  /[$`]|(?:^|[\n;&|])[ \t]*[{}]|(?:^|[\n;&|({])[ \t]*(?:(?:if|then|else|elif|fi|case|esac|while|until|for|do|done|function|exit|return|exec|set|eval|hash|alias|unalias|shopt|trap|unset|export|declare|typeset|readonly|local|source|cd|pushd|popd|builtin|command|enable|let|read|mapfile|readarray|getopts|printf)\b|\.[ \t]|\(\(|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=|[^\s;&|(){}]+[ \t]*\([ \t]*\))/;

export function scanWorkflowCoverage({
  workflows,
  packageScripts,
  configSpecs = {},
  localActions = {},
}: Opts): {
  covered: Set<string>;
  rejected: Array<{ file: string; spec: string; reason: string }>;
} {
  const covered = new Set<string>();
  const rejected: Array<{ file: string; spec: string; reason: string }> = [];

  // R13: a claim requires COMMAND POSITION. SPEC_RE and the alias grammar
  // used to grep the whole run block, so `echo tests/e2e/foo.spec.ts` — or a
  // spec path inside a docker/bash -lc quoted string — counted as coverage
  // (the census refuses those same lines as outside command position; the
  // two layers now agree). Each ;/&&/||/|/&-split segment claims only when
  // it BEGINS with a recognized runner/invocation word.
  // Leading env-assignment prefixes stay CLAIMABLE on purpose: the claim
  // must survive to the qualification chain so UNMODELLED_SHELL_RE rejects
  // it WITH a reason ("REPORTED, not silently dropped").
  const INVOKER_SEG =
    /^[ \t]*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*[ \t]+)*(?:pnpm|npx|yarn|bun|playwright)\b/;
  const resolveSpecs = (cmd: string): string[] => {
    const out: string[] = [];
    for (const line of cmd.split("\n")) {
      for (const seg of line.split(/(?:&&|\|\||[;&|])/)) {
        if (!INVOKER_SEG.test(seg)) continue;
        out.push(...(seg.match(SPEC_RE) ?? []));
        // pnpm alias resolution: `pnpm foo` / `pnpm run foo` -> scripts.foo
        for (const mm of seg.matchAll(/pnpm(?:\s+run)?\s+([\w:.-]+)/g)) {
          const name = mm[1]!;
          if (name in packageScripts) out.push(...resolveSpecs(packageScripts[name]!));
        }
      }
    }
    return out;
  };

  for (const [file, rawYaml] of Object.entries(workflows)) {
    // Everything below reads the CANONICAL text; an unparseable workflow
    // never runs on GitHub, so it claims nothing (safe-dark).
    const yaml = canonicalYaml(rawYaml);
    if (yaml === null) continue;
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
    // R3 comprehensive-audit closure: document markers/directives make the
    // regex scan and the YAML parser read DIFFERENT documents (a second
    // `---` document is text this scanner would claim from while the runner
    // never executes it). Zero live workflows carry any; a run body printing
    // one costs a reasoned allowlist row — fail-closed.
    const docMarkers = /(^|\n)(---|\.\.\.|%YAML|%TAG)/.test(yaml);
    // R4: EXPLICIT-KEY syntax (`? key` / `: value` lines) resolves to
    // ordinary scanner-read keys in the parser while every line-anchored
    // regex here is blind to it — probe showed false coverage through
    // explicit-key paths filters, if:, needs:, container:, shell:,
    // working-directory:, continue-on-error:, and uses: at every level. The
    // check reads METADATA segments only (the pre-jobs head here; job heads
    // and step metas below) — run VALUES legitimately start lines with the
    // shell `:` builtin (the census R13 fixtures do), so a file-level test
    // would false-dark them.
    const jobsIdx = yaml.search(/(^|\n)jobs\s*:/);
    const wfSpelling = UNMODELLED_SPELLING_RE.test(
      stripCommentLines(jobsIdx === -1 ? yaml : yaml.slice(0, jobsIdx)),
    );

    for (const job of jobs(yaml)) {
      const jobIf = /(^|\n)\s*if\s*:/.test(job.head);
      const jobCoe = hasContinueOnError(job.head);
      // R3: a quoted-key/flow/anchor spelling in the job HEAD could hide an
      // `if:`/`continue-on-error:` this scanner reads by plain spelling only.
      const headSpelling = UNMODELLED_SPELLING_RE.test(stripCommentLines(job.head));
      // Cross-step env state, threaded across ALL step chunks of this job in
      // order (uses: and other run-less steps included — bookkeeping must not
      // sit behind the run:-presence early-continue). Qualification runs
      // BEFORE this step's own bookkeeping: a step that both invokes and
      // writes poisons only LATER steps — its own within-block write is the
      // R12 class ($GITHUB_ENV trips UNMODELLED_SHELL_RE if the block
      // claims). Per-job flag: env state does not cross jobs, and
      // over-poisoning would force reason-free allowlist rows.
      let envPoisoned = false;
      for (const step of job.steps) {
        const runMatch = step.match(/(^|\n)\s*run\s*:([\s\S]*)$/);
        // Canonical stringify double-quotes scalars that plain style cannot
        // carry (e.g. a shell command ending in a colon). Unquote the
        // single-line double-quoted form (JSON-compatible by construction —
        // singleQuote: false is pinned) so the command text is scanned and
        // its suppression/shell constructs stay REPORTED rather than the
        // claim silently vanishing behind a quote character.
        if (runMatch) {
          const q = runMatch[2]!.match(/^[ \t]*("(?:[^"\\\n]|\\.)*")\s*$/);
          if (q) {
            try {
              runMatch[2] = ` ${JSON.parse(q[1]!) as string}`;
            } catch {
              /* leave quoted — belt refusals see the quote characters */
            }
          }
        }
        // R3: spelling refusal reads step METADATA only (run value stripped),
        // so JSON/prose inside a run body cannot false-dark the step. A bad
        // spelling rejects this step's own claims AND poisons the job env —
        // the unreadable metadata may hide a `uses:`/`run:` that mutates it.
        const stepSpelling = UNMODELLED_SPELLING_RE.test(stripCommentLines(stepMetaOf(step)));
        if (runMatch) {
          // Full-line YAML/shell comments never execute, and the step-splitter
          // glues BETWEEN-step comment lines onto the preceding step's chunk —
          // prose there routinely carries backticks/$/braces that would trip
          // the shell-construct refusal on an innocent step. Inline comments
          // are NOT stripped (the pre-# part executes; conservative).
          const cmd = runMatch[2]!
            .split("\n")
            .filter((l) => !/^[ \t]*#/.test(l))
            .join("\n");
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
            else if (docMarkers || wfSpelling || headSpelling || stepSpelling)
              rejected.push({ file, spec, reason: "unmodelled YAML spelling" });
            else if (envPoisoned)
              rejected.push({
                file,
                spec,
                reason: "earlier same-job step writes GITHUB_ENV/GITHUB_PATH",
              });
            else if (hasPathsFilter)
              rejected.push({ file, spec, reason: "pull_request.paths/paths-ignore filter" });
            else if (jobIf || stepIf)
              rejected.push({ file, spec, reason: "if: condition present" });
            else if (jobCoe || stepCoe) rejected.push({ file, spec, reason: "continue-on-error" });
            else if (suppressesExit(cmd))
              rejected.push({ file, spec, reason: "exit-code suppression" });
            else if (UNMODELLED_SHELL_RE.test(cmd))
              rejected.push({ file, spec, reason: "unmodelled shell construct" });
            else covered.add(spec);
          }
        }
        if (stepSpelling) envPoisoned = true;
        if (writesJobEnv(step)) envPoisoned = true;
        if (localActionPoisons(step, localActions, new Set())) envPoisoned = true;
      }
    }
  }
  return { covered, rejected };
}
