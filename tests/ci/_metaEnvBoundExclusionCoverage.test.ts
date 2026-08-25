/**
 * tests/ci/_metaEnvBoundExclusionCoverage.test.ts
 *
 * Structural guard (spec 2026-07-26-ci-dark-descoped-closeout §6): every
 * `ENV_BOUND_EXCLUDES` entry — a file the unit-suite deliberately does not
 * run under `VITEST_EXCLUDE_ENV_BOUND=1` — must EXECUTE somewhere on every
 * PR, proven by the runner itself, or the build is red. Three prior attempts
 * PREDICTED execution by reading shell and each fell to an adversarial round;
 * this one verifies a registry against the parsed workflow: the covering step
 * must be EXACTLY `pnpm run-excluded <file>` (string equality after trim, the
 * WHOLE_CONFIG_RE exact-literal posture — any decoration makes it not the
 * literal), the oracle behind that alias is behaviorally pinned at
 * tests/scripts/runExcludedTest.test.ts, and the workflow/job/step carry none
 * of the execution-override classes the coverage scanner already refuses
 * (plus `environment:`, which its disqualifier set omits — adversarial R6
 * F2). Command text alone proves nothing about whether the job runs, or runs
 * where it claims (R1 F10 / R2 F3), so qualification is checked on the
 * PARSED YAML, never on shell semantics.
 *
 * Honest ceiling (spec §6.1): a green `pnpm run-excluded <file>` step proves
 * the file resolved, executed, and passed >=1 test under THAT job's
 * environment. x5's steps carry no TEST_DATABASE_URL, so the three
 * `livePsqlReachable`-guarded suites inside email-canonicalization SKIP
 * there — documented CI shape; the oracle still requires >=1 passed and the
 * remaining suites execute (19 passed locally, child exit 0).
 */
import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ENV_BOUND_COVERAGE_REGISTRY, ENV_BOUND_EXCLUDES } from "../../vitest.projects";

const ROOT = process.cwd();

type StepShape = Record<string, unknown> & { run?: unknown };
type JobShape = Record<string, unknown> & { steps?: StepShape[] };
type WorkflowShape = {
  on?: Record<string, unknown> | string | string[];
  defaults?: unknown;
  jobs?: Record<string, JobShape>;
};

/** The one job-level `if:` the spec permits: schedule exclusion, verbatim. */
const SCHEDULE_EXCLUSION = "github.event_name != 'schedule'";

/**
 * Registry workflow paths must be DISCOVERABLE workflows (R1-B F4): GitHub
 * runs only top-level .yml/.yaml files directly under .github/workflows —
 * a row pointing at nested/relocated/other-extension YAML could carry the
 * trigger, job, and literal while GitHub never executes it.
 */
const DISCOVERABLE_WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

/**
 * Everything that must hold on the PARSED workflow for one {workflow, job}
 * row, returned as problems (empty = verified). Pure so the adversarial
 * fixtures below can exercise every rejection class without touching real
 * workflow files — a verifier tested only against the clean corpus proves
 * nothing about its rejections (the mocked-only-APPROVE lesson).
 */
function coverageRowProblems(
  row: { workflow: string; job: string },
  file: string,
  rawYaml: string,
): string[] {
  const problems: string[] = [];
  const wf = parse(rawYaml) as WorkflowShape & {
    env?: unknown;
    concurrency?: { group?: unknown } | string;
  };

  // Bare pull_request KEY (types:/branches: filters never run on ordinary
  // PRs — R3 F4); other triggers may coexist.
  const on = wf.on;
  if (on === null || typeof on !== "object" || Array.isArray(on) || !("pull_request" in on)) {
    problems.push("on.pull_request key must exist (mapping form)");
  } else {
    const pr = (on as Record<string, unknown>).pull_request;
    if (pr !== null && pr !== undefined) {
      problems.push(`pull_request must be BARE — found filters: ${JSON.stringify(pr)}`);
    }
  }

  // Workflow-scope execution context. env: at ANY of the three scopes can
  // set BASH_ENV (a sourced file defining a no-op pnpm function) or PATH (a
  // checked-in fake pnpm) while the step literal survives verbatim (R1-B
  // F2) — distinct from the filed cross-step GITHUB_ENV vector.
  if (wf.defaults !== undefined) problems.push("workflow-level defaults:");
  if (wf.env !== undefined) problems.push("workflow-level env:");
  // concurrency: a shared group could queue/cancel the job on ordinary PRs
  // (R1-B F5). Groups are REPOSITORY-wide (R2-B F4): ref alone still
  // collides across workflows (`unit-suite-${{ github.ref }}` cancels
  // unit-suite), so the group must interpolate BOTH github.workflow and
  // github.ref — same-workflow, same-ref supersession only, where the
  // newest run re-proves execution. The workflow display name's uniqueness
  // is asserted separately against the real workflow corpus (a duplicate
  // name: makes github.workflow collide too).
  if (wf.concurrency !== undefined) {
    const group = typeof wf.concurrency === "object" ? wf.concurrency?.group : wf.concurrency;
    if (
      typeof group !== "string" ||
      !group.includes("${{ github.ref }}") ||
      !group.includes("${{ github.workflow }}")
    ) {
      problems.push(
        `workflow-level concurrency group must interpolate BOTH \${{ github.workflow }} and \${{ github.ref }} — found ${JSON.stringify(group)}`,
      );
    }
  }

  // R5-B F2: a SIBLING job inside this same workflow carrying the identical
  // ${{ github.workflow }}-scoped job-level group would share the covering
  // run's repository-wide group and could cancel it — job-level concurrency
  // is refused on EVERY job of the registry workflow, not just the covering
  // one. R7-B extends the same reasoning to reusable workflows: inside a
  // CALLED workflow, ${{ github.workflow }} resolves to the CALLER's display
  // name, so a callee (direct or nested, local or external) with a
  // workflow-scoped cancel-in-progress group can cancel this run while
  // every corpus scan stays green — the callee graph is unscannable by
  // construction, so `uses:` jobs are refused outright in the registry
  // workflow. (Other workflows' callees resolve under THEIR callers' names,
  // which display-name uniqueness keeps distinct from this workflow's.)
  for (const [jobName, j] of Object.entries(wf.jobs ?? {})) {
    if ((j as Record<string, unknown>).concurrency !== undefined) {
      problems.push(
        `job-level concurrency on job ${jobName} (any job shares the repo-wide group namespace)`,
      );
    }
    if ((j as Record<string, unknown>).uses !== undefined) {
      problems.push(
        `reusable-workflow job ${jobName} (a callee's \${{ github.workflow }} group resolves to THIS caller's name and can cancel the covering run)`,
      );
    }
  }

  const job = wf.jobs?.[row.job];
  if (job === undefined) {
    problems.push(`job ${row.job} must exist`);
    return problems;
  }
  const jobIf = job.if;
  if (jobIf !== undefined && String(jobIf).trim() !== SCHEDULE_EXCLUSION) {
    problems.push(
      `job if: must be absent or exactly \`${SCHEDULE_EXCLUSION}\` — found ${JSON.stringify(jobIf)}`,
    );
  }
  // container: (the scanner's own disqualifier class the first draft
  // omitted — R1-B F3) controls the executable named `pnpm`; env:/
  // concurrency: as above; the rest are the scanner's execution-override
  // classes plus environment: (R6 F2).
  for (const key of [
    "needs",
    "strategy",
    "continue-on-error",
    "environment",
    "defaults",
    "container",
    "env",
    "concurrency",
  ]) {
    if ((job as Record<string, unknown>)[key] !== undefined) {
      problems.push(`job-level ${key}:`);
    }
  }
  // A self-hosted or drifted runner label is the same executable-control
  // vector as container: — and a NONEXISTENT label (`ubuntu-99.99`) simply
  // never receives a runner (R2-B F5), so the accepted set is the finite
  // GitHub-hosted ubuntu x64 roster, not a version-shaped pattern.
  const HOSTED_UBUNTU = new Set(["ubuntu-latest", "ubuntu-24.04", "ubuntu-22.04"]);
  const runsOn = (job as Record<string, unknown>)["runs-on"];
  if (typeof runsOn !== "string" || !HOSTED_UBUNTU.has(runsOn)) {
    problems.push(
      `runs-on must be one of ${[...HOSTED_UBUNTU].join("/")} — found ${JSON.stringify(runsOn)}`,
    );
  }

  // The covering step: run EXACTLY the literal, and the STEP itself
  // undecorated (a step-level `shell: bash -c ":" {0}` consumes the literal
  // without executing it — plan R3 F1; step env: is scope three of F2).
  const literal = `pnpm run-excluded ${file}`;
  const matches = (job.steps ?? []).filter(
    (s) => typeof s.run === "string" && s.run.trim() === literal,
  );
  if (matches.length !== 1) {
    problems.push(
      `exactly one step whose run: is verbatim \`${literal}\` (found ${matches.length})`,
    );
    return problems;
  }
  const step = matches[0]!;
  for (const key of ["if", "continue-on-error", "working-directory", "shell", "env"]) {
    if (step[key] !== undefined) problems.push(`run-excluded step: ${key}:`);
  }
  if ((step.run as string).includes("|")) problems.push("run-excluded step: no pipes");
  return problems;
}

describe("env-bound exclusion coverage (spec §6)", () => {
  const files = ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, ""));

  it("each exclusion glob resolves to exactly ONE on-disk file, and tests/ holds no symlinks (R8-B)", () => {
    // The `**/` glob is SUFFIX matching: a directory symlink under tests/
    // pointing at a tracked tree would mint a second logical file with the
    // same suffix — excluded from unit-suite by the glob, invisible to the
    // readdirSync-based partition census (which does not traverse symlinks,
    // while vitest's tinyglobby does), and unproven by x5, which names only
    // the root file. Symlinks under tests/ are refused outright, and each
    // exclusion must resolve to exactly its one literal path.
    const symlinks: string[] = [];
    const walked: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (lstatSync(p).isSymbolicLink()) {
          // A DIRECTORY symlink aliases a whole tree of potential test
          // files; a FILE symlink is a threat only when its name is
          // test-shaped (vitest collects it). Non-test fixture symlinks
          // (tests/specLint/fixtures/cited/symlink.md exists deliberately)
          // stay legal.
          const dirLink = statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
          if (dirLink || /\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) symlinks.push(p);
          continue;
        }
        if (e.isDirectory()) walk(p);
        else walked.push(p.split(sep).join("/"));
      }
    };
    walk(join(ROOT, "tests"));
    expect(
      symlinks,
      "directory or test-shaped symlinks under tests/ — vitest traverses them, the census walk does not; a linked tree can shadow an exclusion suffix",
    ).toEqual([]);
    for (const f of files) {
      const matching = walked.filter((p) => p.endsWith(`/${f}`));
      expect(
        matching,
        `${f}: the exclusion suffix must match exactly its one literal file`,
      ).toEqual([join(ROOT, f).split(sep).join("/")]);
    }
  });

  it("no coverage/oracle guard test may exclude ITSELF via ENV_BOUND_EXCLUDES (R16-B)", () => {
    // This file is the sole verifier of exclusion totality, and it is a
    // vitest file — listing it (or the oracle/topology/partition guards) in
    // ENV_BOUND_EXCLUDES would silently stop it running while the partition
    // guard accepts zero membership for any array entry. The LOAD-BEARING
    // enforcement is the non-excludable bash composite guard
    // (scripts/ci/assert-pnpm-sources-clean.sh step 4); this is the readable
    // belt.
    const GUARDS = [
      "tests/ci/_metaEnvBoundExclusionCoverage.test.ts",
      "tests/scripts/runExcludedTest.test.ts",
      "tests/cross-cutting/unit-suite-shard-topology.test.ts",
      "tests/cross-cutting/vitest-projects-partition.test.ts",
    ];
    const excluded = GUARDS.filter((g) => files.some((f) => f === g || f.endsWith(`/${g}`)));
    expect(
      excluded,
      "a guard test is env-bound-excluded — it would disable the very check that enforces the contract",
    ).toEqual([]);
  });

  it("registry totality: every exclusion has exactly one row, every row names a live exclusion", () => {
    const uncovered = files.filter((f) => !(f in ENV_BOUND_COVERAGE_REGISTRY));
    expect(
      uncovered,
      "ENV_BOUND_EXCLUDES entries with no coverage row — a file the unit suite " +
        "skips and no workflow proves: add a verified {workflow, job} row " +
        "(or delete the exclusion so the file runs in unit-suite)",
    ).toEqual([]);
    const stale = Object.keys(ENV_BOUND_COVERAGE_REGISTRY).filter((f) => !files.includes(f));
    expect(stale, "registry rows whose file is no longer excluded — delete them").toEqual([]);
  });

  it("no dark rows: an acknowledged-unrun exclusion is a RED build, not a pass", () => {
    for (const [file, row] of Object.entries(ENV_BOUND_COVERAGE_REGISTRY)) {
      if ("dark" in row) {
        expect.fail(
          `${file} is excluded from unit-suite and RUNS NOWHERE (dark row, ${row.backlogRef}) — ` +
            "this row exists only to name the backlog entry; wire a workflow to clear it",
        );
      }
    }
  });

  it("every {workflow, job} row is a verbatim, unconditioned run-excluded step on a bare-PR workflow", () => {
    for (const [file, row] of Object.entries(ENV_BOUND_COVERAGE_REGISTRY)) {
      if ("dark" in row) continue;
      expect(
        DISCOVERABLE_WORKFLOW.test(row.workflow),
        `${row.workflow}: must be a top-level .github/workflows/*.yml|yaml file — GitHub ` +
          "discovers nothing else, so any other path could carry the literal while never running",
      ).toBe(true);
      const raw = readFileSync(join(ROOT, row.workflow), "utf8");
      expect(
        coverageRowProblems(row, file, raw),
        `${row.workflow}#${row.job} failed verification for ${file}`,
      ).toEqual([]);
      // R13-B/R15-B corpus pin: the covering job must invoke the
      // assert-pnpm-sources COMPOSITE guard BEFORE the run-excluded step.
      // The oracle's own node process is killable by an effective
      // nodeOptions preload (R13-B) and a `defaults.run.shell` no-op
      // silences every run: step (R15-B) — so the guard is a `uses:`
      // composite action (immune to both) that still reaches the script's
      // node-options / defaults refusals.
      {
        const wf = parse(raw) as WorkflowShape;
        const steps = wf.jobs?.[row.job]?.steps ?? [];
        const guardIdx = steps.findIndex(
          (s) => (s as { uses?: unknown }).uses === "./.github/actions/assert-pnpm-sources",
        );
        const coveringIdx = steps.findIndex(
          (s) => typeof s.run === "string" && s.run.trim() === `pnpm run-excluded ${file}`,
        );
        expect(
          guardIdx,
          `${row.job} must use the assert-pnpm-sources composite guard`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          guardIdx < coveringIdx,
          `${row.job}'s pnpm-sources guard must precede the run-excluded step`,
        ).toBe(true);
        expect(
          Object.keys(steps[guardIdx]! as object).sort(),
          `${row.job}'s guard step must carry ONLY name/uses`,
        ).toEqual(["name", "uses"]);
      }
      // github.workflow interpolates the DISPLAY name, and concurrency
      // groups are repository-wide AND case-insensitive (R2-B F4, tightened
      // R4-B F2): a case-only name duplicate collides the standard
      // ${{ github.workflow }} group, and any OTHER workflow's explicit
      // group (workflow- or job-level) that names this workflow resolves
      // into the same group. Both are swept over the real corpus,
      // case-insensitively.
      const name = String((parse(raw) as { name?: unknown }).name ?? "");
      const others = readdirSync(join(ROOT, ".github", "workflows"))
        .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
        .filter((f) => `.github/workflows/${f}` !== row.workflow)
        .map((f) => ({
          f,
          doc: parse(readFileSync(join(ROOT, ".github", "workflows", f), "utf8")) as {
            name?: unknown;
            concurrency?: { group?: unknown } | string;
            jobs?: Record<string, { concurrency?: { group?: unknown } | string; uses?: unknown }>;
          },
        }));
      const nameLc = name.toLowerCase();
      // R11-B: an EXTERNAL reusable-workflow callee participates in the
      // caller's run and can declare concurrency this corpus scan never
      // sees — hard-coded or inputs/vars-synthesized to this workflow's
      // group, it cancels the covering run while every in-repo file reads
      // clean. Job-level uses: in other workflows must be LOCAL (./…), so
      // the callee's own declarations are inside the swept corpus; the
      // registry workflow itself refuses uses: jobs entirely.
      const externalCallees = others.flatMap(({ f, doc }) =>
        Object.entries(doc.jobs ?? {})
          .filter(([, j]) => typeof j.uses === "string" && !String(j.uses).startsWith("./"))
          .map(([jn, j]) => `${f}#${jn}: ${String(j.uses)}`),
      );
      expect(
        externalCallees,
        "external reusable-workflow callees — their concurrency declarations are outside the swept corpus and can cancel the covering run",
      ).toEqual([]);
      const dupes = others.filter(({ doc }) => String(doc.name ?? "").toLowerCase() === nameLc);
      expect(
        dupes.map(({ f }) => f),
        `${row.workflow}: display name ${JSON.stringify(name)} reused (case-insensitively) by other workflows — github.workflow-scoped concurrency would collide`,
      ).toEqual([]);
      const groupOf = (c: { group?: unknown } | string | undefined): string =>
        typeof c === "string" ? c : String(c?.group ?? "");
      // Two refusals per other-workflow group (workflow- AND job-level;
      // R2-B F4, completed R5-B F2): (a) naming this workflow explicitly —
      // it resolves into the same repository-wide, case-insensitive group;
      // (b) interpolating ANYTHING beyond the static run-context set —
      // matrix/needs/inputs/vars/event data or expression functions can
      // SYNTHESIZE a colliding group at runtime without containing the name
      // literally, which no static scan can resolve, so dynamic group
      // construction is refused rather than modelled.
      // A group is safe only if its SHAPE makes collision impossible, not
      // merely if its interpolations look tame (R6-B F2: literal splicing
      // around ${{ github.workflow }}, and ${{ github.head_ref }} — an
      // ATTACKER-CONTROLLED branch name — both synthesized the exact
      // registry group from previously-allowed pieces). Allowed shapes:
      //   1. ${{ github.workflow }}-${{ github.ref }}[-${{ github.event_name }}]
      //      — resolves under the OTHER workflow's unique display name;
      //   2. LITERAL-${{ github.ref }}[-${{ github.event_name }}] where
      //      LITERAL is spaceless [A-Za-z0-9._-]+ and is not equal to or a
      //      prefix of this workflow's display name (case-insensitive) —
      //      such a literal can never spell the name's spaced prefix.
      // Anything else — head_ref, run-context splicing, matrix/vars/event
      // data, expression functions — is refused rather than modelled.
      const SAFE_GROUP =
        /^(\$\{\{ github\.workflow \}\}|[A-Za-z0-9._-]+)-\$\{\{ github\.ref \}\}(-\$\{\{ github\.event_name \}\})?$/;
      const offenders = others.flatMap(({ f, doc }) => {
        const groups = [
          groupOf(doc.concurrency),
          ...Object.values(doc.jobs ?? {}).map((j) => groupOf(j.concurrency)),
        ].filter((g) => g !== "");
        return groups
          .filter((g) => {
            if (g.toLowerCase().includes(nameLc)) return true;
            const m = SAFE_GROUP.exec(g);
            if (m === null) return true;
            const literal = m[1]!;
            return literal !== "${{ github.workflow }}" && nameLc.startsWith(literal.toLowerCase());
          })
          .map((g) => `${f}: ${g}`);
      });
      expect(
        offenders,
        `${row.workflow}: another workflow's concurrency group is not a collision-safe shape ` +
          `(names ${JSON.stringify(name)}, uses a non-allowlisted shape, or its literal prefixes the display name) — ` +
          "it could resolve into this workflow's repository-wide group and cancel the covering run",
      ).toEqual([]);
    }
  });

  it("x5 pins a verbatim, composite-guarded assert-guards-collected step (R18-B self-exclusion closer)", () => {
    // The positive collection closer (scripts/ci/assert-guards-collected.mjs)
    // is the AUTHORITATIVE defense against darkening a guard test via ANY
    // exclusion array or pattern shape — it observes vitest's resolved outcome,
    // not exclusion text, so the R16/R17/R18 array x shape whack-a-mole ends
    // here. Pin its CI step so accidental removal reds this guard (deliberate
    // removal is a glaring workflow diff — code review's jurisdiction, the
    // ratified ceiling). It must ride a merge-blocking job (x5, the env-bound
    // exclusion home), run the command VERBATIM, carry ONLY name/run (no
    // if:/shell:/env: escape hatch), and be preceded by the composite pre-node
    // guard so node starts unpoisoned before the checker spawns vitest.
    const LITERAL = "node scripts/ci/assert-guards-collected.mjs";
    const workflow = ".github/workflows/x-audits.yml";
    const job = "x5-email-canonicalization";
    const wf = parse(readFileSync(join(ROOT, workflow), "utf8")) as WorkflowShape;
    const steps = wf.jobs?.[job]?.steps ?? [];
    const stepIdx = steps.findIndex((s) => typeof s.run === "string" && s.run.trim() === LITERAL);
    expect(stepIdx, `${job} must run \`${LITERAL}\` verbatim`).toBeGreaterThanOrEqual(0);
    expect(
      Object.keys(steps[stepIdx]! as object).sort(),
      "the assert-guards-collected step must carry ONLY name/run (no if:/shell:/env:)",
    ).toEqual(["name", "run"]);
    const guardIdx = steps.findIndex(
      (s) => (s as { uses?: unknown }).uses === "./.github/actions/assert-pnpm-sources",
    );
    expect(
      guardIdx,
      `${job} must use the assert-pnpm-sources composite guard`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      guardIdx < stepIdx,
      "the composite pre-node guard must precede assert-guards-collected",
    ).toBe(true);
  });

  it("the verifier REJECTS every execution-override class (fixture negatives, not corpus luck)", () => {
    const row = { workflow: ".github/workflows/w.yml", job: "j" };
    const FILE = "tests/x/y.test.ts";
    const base = (jobExtra: string, stepExtra: string, wfExtra = "") =>
      `name: w\non:\n  pull_request:\n${wfExtra}jobs:\n  j:\n${jobExtra}    runs-on: ubuntu-latest\n    steps:\n      - name: prove\n${stepExtra}        run: pnpm run-excluded ${FILE}\n`;
    // Clean control: the fixture grammar itself verifies.
    expect(coverageRowProblems(row, FILE, base("", ""))).toEqual([]);
    // Each case must produce at least one problem.
    const cases: Array<[string, string]> = [
      [
        "filtered pull_request",
        base("", "").replace("  pull_request:\n", "  pull_request:\n    paths: [x]\n"),
      ],
      [
        "types-filtered pull_request",
        base("", "").replace("  pull_request:\n", "  pull_request:\n    types: [closed]\n"),
      ],
      ["workflow env (BASH_ENV/PATH poison — F2)", base("", "", "env:\n  BASH_ENV: ./x.sh\n")],
      ["workflow defaults", base("", "", "defaults:\n  run:\n    shell: bash -c ':' {0}\n")],
      ["shared concurrency group (F5)", base("", "", "concurrency:\n  group: shared\n")],
      [
        "ref-only concurrency group (R2-B F4: repo-wide collision, e.g. unit-suite-${{ github.ref }})",
        base("", "", "concurrency:\n  group: g-${{ github.ref }}\n"),
      ],
      [
        "SIBLING job with job-level concurrency (R5-B F2: shares the repo-wide group namespace)",
        base("", "") +
          "  sibling:\n    runs-on: ubuntu-latest\n    concurrency:\n      group: ${{ github.workflow }}-${{ github.ref }}\n    steps:\n      - run: echo hi\n",
      ],
      [
        "SIBLING reusable-workflow job (R7-B: callee group resolves under this caller's name)",
        base("", "") + "  caller:\n    uses: ./.github/workflows/other.yml\n",
      ],
      ["nonexistent hosted label (R2-B F5)", base("", "").replace("ubuntu-latest", "ubuntu-99.99")],
      ["job env (F2)", base("    env:\n      PATH: ./fake\n", "")],
      ["job container (F3)", base("    container: node:20\n", "")],
      ["job concurrency (F5)", base("    concurrency:\n      group: g\n", "")],
      ["job needs", base("    needs: gate\n", "")],
      ["job strategy", base("    strategy:\n      matrix:\n        a: [1]\n", "")],
      ["job environment (R6 F2)", base("    environment: prod\n", "")],
      ["job continue-on-error", base("    continue-on-error: true\n", "")],
      ["job arbitrary if", base("    if: false\n", "")],
      ["self-hosted runs-on (F3 class)", base("", "").replace("ubuntu-latest", "[self-hosted]")],
      ["step env (F2)", base("", "        env:\n          PATH: ./fake\n")],
      ["step if", base("", "        if: failure()\n")],
      ["step shell override", base("", '        shell: bash -c ":" {0}\n')],
      ["step working-directory", base("", "        working-directory: other\n")],
      ["step continue-on-error", base("", "        continue-on-error: true\n")],
      [
        "decorated literal",
        base("", "").replace(
          `pnpm run-excluded ${FILE}`,
          () => `pnpm run-excluded ${FILE} || true`,
        ),
      ],
      ["missing step", base("", "").replace(`pnpm run-excluded ${FILE}`, "echo hi")],
    ];
    for (const [label, yamlText] of cases) {
      expect(coverageRowProblems(row, FILE, yamlText), label).not.toEqual([]);
    }
    // …and the allowed forms stay allowed: schedule-exclusion if, ref-scoped
    // concurrency, versioned ubuntu.
    expect(
      coverageRowProblems(
        row,
        FILE,
        base(
          "    if: github.event_name != 'schedule'\n",
          "",
          "concurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n",
        ),
      ),
    ).toEqual([]);
    expect(
      coverageRowProblems(row, FILE, base("", "").replace("ubuntu-latest", "ubuntu-24.04")),
    ).toEqual([]);
    // Discoverability regex (F4): the four undiscoverable shapes.
    for (const bad of [
      "workflows/x.yml",
      ".github/workflows/nested/x.yml",
      ".github/workflows/x.yml.txt",
      "../.github/workflows/x.yml",
    ]) {
      expect(DISCOVERABLE_WORKFLOW.test(bad), bad).toBe(false);
    }
  });
});
