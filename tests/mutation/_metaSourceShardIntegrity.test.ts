// tests/mutation/_metaSourceShardIntegrity.test.ts
// The workflow's matrices, the shard FILE sets, the shard file BODIES, and each
// leg's REALIZED TARGET, all pinned to their TypeScript constants (spec §3.4.1).
//
// WHY REALIZED TARGETS AND NOT JUST INDEX LISTS. A correct `[0,1,2,3]` says
// nothing about what each leg RUNS. Every leg could hard-code the shard-0 file
// with the index list, the file set, and the gates file's totality proof all
// still green, while three quarters of the surfaces never executed. Not
// abstract: interactionTimingScan lands in a single source shard and the drifted
// parser fingerprints in parser shard 4, so a run-shard-0-everywhere workflow
// would make BOTH failures currently live on `main` disappear and look greener
// than today.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { premiseHolds } from "../_shared/premise";
import { SHARD_COUNT } from "../parser/mutation/shardPartition";
import { SHARD_BUDGET_SECONDS, SOURCE_SHARD_COUNT } from "./source/shardPartition";

const ROOT = join(__dirname, "..", "..");
type Step = {
  id?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  // Widened from `{ script?: string }` when the rate-drift pins landed: those read
  // `pattern` and `path` off a download step, and the narrow shape made an ordinary
  // read an implicit-any error. Index signature rather than a fixed list, because
  // this models arbitrary action inputs and a fixed list is a second thing to
  // maintain every time a pin reads a new one.
  with?: Record<string, string | undefined>;
  /** A step's own condition. Pinned by the rate-drift case, which turns on it. */
  if?: string;
};
type Job = {
  "timeout-minutes"?: number;
  strategy?: { matrix?: Record<string, unknown>; "fail-fast"?: boolean };
  needs?: string[];
  steps?: Step[];
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
};
const WORKFLOW = join(ROOT, ".github/workflows/mutation-harness.yml");
const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as {
  jobs: Record<string, Job>;
  /** The trigger block, so the PR path filter can be asserted as data. */
  on?: { pull_request?: { paths?: string[] } };
};

const runsOf = (job: string): string[] =>
  (wf.jobs[job]?.steps ?? []).map((s) => s.run ?? "").filter((r) => r.length > 0);
const vitestRun = (job: string): string => runsOf(job).find((r) => r.includes("vitest")) ?? "";
/** EVERY test target in a run line, not just the first -- an extra target is
 *  exactly the fail-open case a first-match extraction cannot see. */
const targetsIn = (run: string): string[] => run.match(/tests\/\S+?\.test\.ts/g) ?? [];

const FAMILIES = [
  {
    job: "parser-shards",
    count: SHARD_COUNT,
    dir: "tests/parser",
    stem: "mutationHarness.shard",
    glob: /^mutationHarness\.shard.*\.test\.ts$/,
    // EVERY place the index legitimately appears in a body. A normalizer that
    // misses one rejects the live family: parser shards 0 and 1 are identical
    // except for the filename, `const SHARD`, AND `runShard(N)`, and omitting
    // the third makes this guard fail on correct files.
    indexSites: (i: number) => [`const SHARD = ${i};`, `runShard(${i})`],
  },
  {
    job: "source-shards",
    count: SOURCE_SHARD_COUNT,
    dir: "tests/mutation",
    stem: "guardSurfaces.shard",
    glob: /^guardSurfaces\.shard.*\.test\.ts$/,
    indexSites: (i: number) => [`const SOURCE_SHARD = ${i};`],
  },
] as const;
const GATES = [
  { job: "parser-gates", file: "tests/parser/mutationHarness.gates.test.ts" },
  { job: "source-gates", file: "tests/mutation/guardSurfaces.gates.test.ts" },
] as const;

const shardFile = (f: (typeof FAMILIES)[number], i: number) => `${f.dir}/${f.stem}${i}.test.ts`;

describe("mutation-harness matrices are pinned to their constants", () => {
  it("the workflow parses and declares every expected job", () => {
    premiseHolds("mutation-harness.yml defines jobs", Object.keys(wf.jobs ?? {}).length > 0);
    for (const f of FAMILIES) expect(Object.keys(wf.jobs)).toContain(f.job);
    for (const g of GATES) expect(Object.keys(wf.jobs)).toContain(g.job);
    expect(Object.keys(wf.jobs)).toContain("budget");
  });

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: matrix is exactly {shard: 0..COUNT-1} with no include/exclude (AC-6a)",
    (_job, f) => {
      const matrix = wf.jobs[f.job]?.strategy?.matrix as { shard?: number[] } | undefined;
      expect(matrix, `${f.job} declares no matrix`).toBeDefined();
      // `include`/`exclude` alter realized legs without changing the index list.
      expect(Object.keys(matrix!).sort()).toEqual(["shard"]);
      expect(matrix!.shard).toEqual(Array.from({ length: f.count }, (_, i) => i));
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: interpolates matrix.shard and each index resolves to exactly its own file (AC-6b)",
    (_job, f) => {
      const run = vitestRun(f.job);
      expect(run, `${f.job} has no vitest run step`).not.toBe("");
      expect(run, "a leg naming a fixed index runs the same shard on every leg").toMatch(
        /\$\{\{\s*matrix\.shard\s*\}\}/,
      );
      for (let i = 0; i < f.count; i++) {
        const realized = run.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, () => String(i));
        // EXACTLY its own file: an extra target here is the fail-open case.
        expect(targetsIn(realized)).toEqual([shardFile(f, i)]);
      }
    },
  );

  it.each(GATES.map((g) => [g.job, g] as const))(
    "%s: names exactly its own gates file (AC-6b)",
    (_job, g) => {
      expect(targetsIn(vitestRun(g.job))).toEqual([g.file]);
    },
  );

  it("the realized target union is exactly this workflow's files, each named once (AC-6b)", () => {
    const realized = [
      ...FAMILIES.flatMap((f) =>
        Array.from({ length: f.count }, (_, i) =>
          targetsIn(vitestRun(f.job).replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, () => String(i))),
        ).flat(),
      ),
      ...GATES.flatMap((g) => targetsIn(vitestRun(g.job))),
    ];
    const expected = [
      ...FAMILIES.flatMap((f) => Array.from({ length: f.count }, (_, i) => shardFile(f, i))),
      ...GATES.map((g) => g.file),
    ];
    // Sets compared both ways, and length compared separately, so a duplicate
    // cannot hide inside a set equality.
    expect([...realized].sort()).toEqual([...expected].sort());
    expect(realized).toHaveLength(SHARD_COUNT + SOURCE_SHARD_COUNT + GATES.length);
    // The browser gate belongs to mutation-browser.yml and appears in no leg.
    expect(realized.some((r) => r.includes("browser"))).toBe(false);
  });

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: the shard FILE set on disk matches the constant, under the PROJECT's glob (AC-6a)",
    (_job, f) => {
      // Scanned with the same `shard*` shape the vitest project include uses --
      // a `\\d+` scan would ignore a non-numeric shard file the project still runs.
      const found = readdirSync(join(ROOT, f.dir))
        .filter((n) => f.glob.test(n))
        .sort();
      expect(found).toEqual(
        Array.from({ length: f.count }, (_, i) => `${f.stem}${i}.test.ts`).sort(),
      );
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: every shard file is the same template modulo its index (AC-4)",
    (_job, f) => {
      // Byte equality after normalising the index everywhere it legitimately
      // appears. A divergent body -- a different filter, a skipped call -- is
      // what this catches, and nothing else in the suite would.
      const normalise = (src: string, i: number) => {
        let out = src.split(`${f.stem}${i}.test.ts`).join("<FILE>");
        for (const site of f.indexSites(i)) {
          const canonical = site.split(String(i)).join("<N>");
          out = out.split(site).join(canonical);
        }
        return out;
      };
      const base = normalise(readFileSync(join(ROOT, shardFile(f, 0)), "utf8"), 0);
      for (let i = 1; i < f.count; i++) {
        expect(
          normalise(readFileSync(join(ROOT, shardFile(f, i)), "utf8"), i),
          `${shardFile(f, i)} diverges from shard 0 beyond its index`,
        ).toBe(base);
      }
    },
  );

  it("every source shard file registers its slice exactly once (AC-4)", () => {
    for (let i = 0; i < SOURCE_SHARD_COUNT; i++) {
      const src = readFileSync(
        join(ROOT, `tests/mutation/guardSurfaces.shard${i}.test.ts`),
        "utf8",
      );
      expect(src.match(/registerSurfaceCases\(/g) ?? []).toHaveLength(1);
      expect(src.match(/surfacesForShard\(/g) ?? []).toHaveLength(1);
      expect(/const SOURCE_SHARD\s*=\s*(\d+)/.exec(src)?.[1]).toBe(String(i));
    }
  });

  it("the mutation:guards script names exactly the sharded gate files (AC-10)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts["mutation:guards"] ?? "";
    expect(targetsIn(script).sort()).toEqual(
      [
        ...Array.from(
          { length: SOURCE_SHARD_COUNT },
          (_, i) => `tests/mutation/guardSurfaces.shard${i}.test.ts`,
        ),
        "tests/mutation/guardSurfaces.gates.test.ts",
      ].sort(),
    );
  });

  it("every shard job stamps its start as its FIRST step (AC-7)", () => {
    // Prose said "first step" while an earlier snippet had checkout above it,
    // and the record then measured the vitest step rather than job wall clock:
    // 1,200 s of setup plus a 3,000 s test is a 3,000 s record on a 4,200 s job,
    // which passes a 3,600 s budget. Complete, finite, plausible, and wrong --
    // so the POSITION is asserted rather than described.
    // Substring `SHARD_START=` is not enough: a step 0 writing an EMPTY
    // `SHARD_START=` satisfies it while the real capture happens after setup,
    // and the record then excludes setup exactly as before. Pin the id AND the
    // whole command.
    const STAMP = 'echo "SHARD_START=$(date +%s)" >> "$GITHUB_ENV"';
    for (const f of [...FAMILIES.map((x) => x.job), ...GATES.map((g) => g.job)]) {
      const steps = wf.jobs[f]?.steps ?? [];
      expect(steps[0]?.id, `${f}'s first step is not the start stamp`).toBe("stamp-start");
      expect(steps[0]?.run?.trim(), `${f}'s stamp does not capture a timestamp`).toBe(STAMP);
      // And NO other step writes the job environment at all. Counting
      // occurrences of `SHARD_START=` is substring recognition again, and
      // `printf "%s=%s\n" SHARD_START "$(date +%s)" >> "$GITHUB_ENV"` overwrites
      // the stamp without containing that literal. The invariant that actually
      // holds -- and needs no grammar -- is that only the first step touches
      // $GITHUB_ENV.
      expect(
        steps.filter((x) => (x.run ?? "").includes("GITHUB_ENV")),
        `${f} writes the job environment outside its first step`,
      ).toHaveLength(1);
    }
  });

  it("every harness leg uploads an elapsed artifact the budget job expects (AC-7)", () => {
    // The leg NAMES are derived the same way lib/ci/shardBudget.ts derives them,
    // so an artifact named off-by-one is a failure here rather than a missing
    // record discovered only when a nightly goes red.
    const expected = new Set([
      ...FAMILIES.flatMap((f) =>
        Array.from({ length: f.count }, (_, i) => `elapsed-${f.job}-${i}`),
      ),
      ...GATES.map((g) => `elapsed-${g.job}`),
    ]);
    const uploaded = new Set<string>();
    for (const job of [...FAMILIES.map((f) => f.job), ...GATES.map((g) => g.job)]) {
      for (const step of wf.jobs[job]?.steps ?? []) {
        if (!(step.uses ?? "").startsWith("actions/upload-artifact")) continue;
        const name = (step as { with?: { name?: string } }).with?.name ?? "";
        for (let i = 0; i < 16; i++) {
          uploaded.add(name.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, () => String(i)));
        }
      }
    }
    for (const name of expected) {
      expect(uploaded, `no leg uploads the artifact ${name} the budget job expects`).toContain(
        name,
      );
    }
  });

  it("the budget job is invoked with the canonical constants (AC-7)", () => {
    // Selected by its declared `id`, an exact equality on a field the workflow
    // controls -- not by matching text in its command.
    const step = (wf.jobs["budget"]?.steps ?? []).find((x) => x.id === "budget-check");
    expect(step, "the budget job declares no step with id budget-check").toBeDefined();
    // Read from the step's `env:` MAPPING, not from its command text. YAML
    // mapping keys are unique by construction, so there is no duplicate form,
    // no `--flag=value` form and no ordering to model -- the three spellings
    // that defeated three successive argv guards. This is `toBe` on structured
    // data, and the recognizer is gone rather than widened.
    const env = step!.env ?? {};
    expect(env["SHARD_BUDGET_SECONDS"]).toBe(String(SHARD_BUDGET_SECONDS));
    expect(env["PARSER_SHARD_COUNT"]).toBe(String(SHARD_COUNT));
    expect(env["SOURCE_SHARD_COUNT"]).toBe(String(SOURCE_SHARD_COUNT));
    // The COMMAND too, by equality. A shell-level assignment prefix in `run:` --
    // `SHARD_BUDGET_SECONDS=3600.5 pnpm tsx …` -- shadows the step's `env:`, so
    // a guard reading only the mapping is fail-open against a step that
    // contradicts its own declaration. Pinning the whole command closes it
    // without reintroducing a pattern to match.
    expect(step!.run?.trim()).toBe("pnpm tsx scripts/check-shard-budget.ts");
    // ...and the job must actually be able to run it. `tsx` is a project
    // dependency, not a runner binary, so a budget job without the shared setup
    // action dies before the checker executes -- with the command and env
    // assertions above still green.
    // ORDER, not just membership. `./.github/actions/setup` is a LOCAL action:
    // it cannot run before checkout puts it on disk, and an adjacent-step swap
    // is an ordinary mistake that leaves a membership check green while the job
    // dies.
    const budgetSteps = wf.jobs["budget"]?.steps ?? [];
    const at = (needle: string) =>
      budgetSteps.findIndex((x) => (x.uses ?? "") === needle || x.id === needle);
    const checkout = at("actions/checkout@v4");
    const setup = at("./.github/actions/setup");
    const check = at("budget-check");
    expect(checkout, "the budget job never checks out").toBeGreaterThanOrEqual(0);
    expect(setup, "the budget job never installs project deps").toBeGreaterThanOrEqual(0);
    expect(check, "the budget job has no budget-check step").toBeGreaterThanOrEqual(0);
    expect(checkout, "checkout must precede the local setup action").toBeLessThan(setup);
    expect(setup, "setup must precede the step that runs pnpm tsx").toBeLessThan(check);
  });

  it("the rate-drift step is wired so it still speaks when the budget fails", () => {
    const steps = wf.jobs["budget"]?.steps ?? [];
    const step = steps.find((x) => x.id === "rate-drift");
    expect(step, "the budget job declares no step with id rate-drift").toBeDefined();

    // `if: always()`, by equality. The step FOLLOWS the budget check, so without
    // this it is skipped on exactly the runs where knowing which rate drifted
    // matters most: the step that explains a breach would be silent whenever
    // there is one. Nothing else in this file would notice, because the env and
    // command assertions below stay green on a step that never executes.
    expect(step!.if?.trim()).toBe("always()");

    // The env MAPPING and the WHOLE command, for the same reasons as the budget
    // check above: a shell assignment prefix in `run:` shadows the step's `env:`,
    // so a guard reading only the mapping is fail-open against a step that
    // contradicts its own declaration.
    const env = step!.env ?? {};
    expect(env["RECORDS_DIR"]).toBe("records");
    expect(env["DRIFT_ACTIONABLE_AT"]).toBe("2");
    expect(step!.run?.trim()).toBe("pnpm tsx scripts/check-rate-drift.ts");

    // The download that feeds it, PATTERN and DESTINATION both. A step that
    // downloads to the wrong path reports every surface unmeasured, which reads
    // as a clean run with nothing to say rather than as a broken one -- and the
    // pattern is per-SURFACE records, not the elapsed stamps the budget check
    // uses, because a rate is derived from child wall clock the stamps do not
    // carry.
    // Selected by what it USES as well as where it writes. Identifying it by `path`
    // alone let a one-edit swap of download-artifact for UPLOAD-artifact keep every
    // assertion green -- pattern, path, condition and order all still matched, while
    // the records the drift step reads were never fetched at all.
    const dl = steps.find((x) => (x.with ?? {})["path"] === "records");
    expect(dl, "nothing downloads into the records/ path the drift step reads").toBeDefined();
    expect(dl!.uses, "the records step must DOWNLOAD, not upload").toBe(
      "actions/download-artifact@v4",
    );
    expect((dl!.with ?? {})["pattern"]).toBe("mutation-records-source-shards-*");
    expect((dl!.with ?? {})["path"]).toBe("records");
    // The DOWNLOAD's condition, not only the consumer's. A step with no condition
    // carries an implicit success(), so an over-budget budget-check skips this
    // download and the drift step then runs -- its own always() intact -- against a
    // records/ directory that does not exist. Pinning the consumer alone left the
    // report defeated on precisely the runs it exists for.
    expect(dl!.if?.trim()).toBe("always()");

    // It must be able to RUN, in order, like its sibling.
    const at = (needle: string) =>
      steps.findIndex((x) => (x.uses ?? "") === needle || x.id === needle);
    expect(at("./.github/actions/setup")).toBeLessThan(at("rate-drift"));
    expect(steps.indexOf(dl!)).toBeLessThan(at("rate-drift"));
  });

  it("the PR path filter fires this workflow for the surfaces it now guards", () => {
    // THIS PR CANNOT DEMONSTRATE THIS FOR ITSELF: it edits the workflow, so the
    // harness fires regardless, and the filter's absence would be invisible on
    // exactly the PR that introduced the step. Without these entries a later change
    // under lib/mutationWeight, or to the drift script itself, merges without the
    // harness ever running.
    const paths = wf.on?.pull_request?.paths ?? [];
    expect(paths).toContain("scripts/check-rate-drift.ts");
    expect(paths).toContain("lib/mutationWeight/**");
    // The sibling it was modelled on, asserted alongside so a rewrite that drops
    // the whole list cannot leave this case green on an empty array.
    expect(paths).toContain("scripts/check-shard-budget.ts");
  });

  it("a red shard does not cancel its siblings, and budget gates notify (AC-6c)", () => {
    for (const f of FAMILIES) expect(wf.jobs[f.job]?.strategy?.["fail-fast"]).toBe(false);
    expect(wf.jobs["notify"]?.needs ?? []).toEqual(
      expect.arrayContaining([...FAMILIES.map((f) => f.job), ...GATES.map((g) => g.job), "budget"]),
    );
  });

  it("notify references no job that no longer exists (AC-6)", () => {
    // The rewrite DELETES the `mutation-harness` job, and the notify steps
    // branch on `needs.mutation-harness.result`. A dangling reference does not
    // error -- it evaluates to empty, so the failure branch never fires and the
    // success branch may auto-close a standing issue on a red run. That is the
    // tracking issue going silent, which is the one thing spec §3.5 exists to
    // prevent.
    const yaml = readFileSync(WORKFLOW, "utf8");
    expect(yaml).not.toContain("needs.mutation-harness.");
    for (const ref of yaml.match(/needs\.([A-Za-z0-9_-]+)\./g) ?? []) {
      const job = ref.slice("needs.".length, -1);
      expect(Object.keys(wf.jobs), `notify references a job that does not exist: ${job}`).toContain(
        job,
      );
    }
  });

  it("green is ONE predicate, used in both directions, and rejects every non-success state (AC-6)", () => {
    // Whole-diff review R1 #1: the two branches were `contains(..., 'failure')`
    // and its negation, which treats `cancelled` and `skipped` as GREEN -- so a
    // non-green run could AUTO-CLOSE the standing tracking issue, the exact
    // silence spec §3.5 exists to prevent.
    //
    // Two properties, both structural rather than pattern-matched. First, the
    // branches read ONE variable in OPPOSITE directions, so they cannot come to
    // disagree about what green means. Second, that variable's definition
    // mentions every non-success conclusion GitHub can report -- a CLOSED set,
    // so this is a derived cover rather than a list someone must remember to
    // extend.
    const notify = wf.jobs["notify"];
    const green = notify?.env?.["ALL_GREEN"] ?? "";
    expect(green, "notify declares no ALL_GREEN predicate").not.toBe("");
    for (const state of ["failure", "cancelled", "skipped", "timed_out"]) {
      expect(green, `ALL_GREEN treats ${state} as green`).toContain(state);
    }
    const steps = notify?.steps ?? [];
    const filing = steps.find((x) => x.id === "file-issue");
    const closing = steps.find((x) => x.id === "close-issue");
    const cond = (s: Step | undefined) =>
      ((s as { if?: string } | undefined)?.if ?? "").replace(/\s+/g, " ").trim();
    expect(cond(filing)).toBe("${{ env.ALL_GREEN != 'true' }}");
    expect(cond(closing)).toBe("${{ env.ALL_GREEN == 'true' }}");
  });

  it("the tracking issue names every LEG, not the family aggregate (AC-6)", () => {
    // Whole-diff review R1 #2. `needs.<job>.result` is only ever the family
    // aggregate, so an issue built from it says "parser-shards failed" and
    // leaves a triager to open the run and read fifteen job names -- which is
    // the cost that makes a non-required red job silent, i.e. the arc's whole
    // legibility objective. The body must therefore derive per-leg conclusions
    // from the run's own jobs, and the job must hold the permission that allows
    // it.
    const notify = wf.jobs["notify"] as
      | (Job & { permissions?: Record<string, string> })
      | undefined;
    expect(notify?.permissions?.["actions"], "notify cannot read its own run's jobs").toBe("read");
    const filing = (notify?.steps ?? []).filter((x) => x.id === "file-issue");
    expect(filing, "notify declares no step with id file-issue").toHaveLength(1);
    const body = filing[0]!.with!.script!;
    expect(body, "the issue body does not enumerate the run's jobs").toContain(
      "listJobsForWorkflowRun",
    );
    expect(body, "the issue body never reads a leg's conclusion").toContain("conclusion");
    // The budget verdict's DETAIL -- which leg, how many seconds -- reaches the
    // issue, and does so through the environment rather than `${{ }}` into the
    // script body: leg names are derived from artifact directory names, which
    // are not trusted input.
    expect(body, "the budget verdict never reaches the issue body").toContain(
      "process.env.BUDGET_REPORT",
    );
    expect((notify?.env ?? {})["BUDGET_REPORT"]).toBe("${{ needs.budget.outputs.report }}");
    expect(
      wf.jobs["budget"]?.outputs?.["report"],
      "the budget job does not republish its verdict",
    ).toBe("${{ steps.budget-check.outputs.report }}");
  });

  /**
   * The job ceiling and the shard budget are two constants that MUST RELATE, and
   * until this case they did not relate at all.
   *
   * They fail in opposite ways on purpose. A leg that exceeds SHARD_BUDGET_SECONDS
   * is supposed to FAIL the budget job -- loudly, having uploaded its elapsed.txt,
   * leaving a verdict a reader can act on. A leg that hits `timeout-minutes` is
   * CANCELLED, which uploads nothing and carries no verdict at all: it is not
   * "red", it is SILENT. So the ceiling sitting too close above the budget quietly
   * converts the diagnostic outcome into the undiagnosable one.
   *
   * Measured on main 2026-08-21, which is why this case exists: source legs ran
   * 3310 / 3812 / 4180 / 5172 s against a 3600 s budget under a 5400 s ceiling.
   * Three legs breached, and the worst consumed 87% of the gap to the ceiling --
   * roughly 228 s from converting a reported failure into a silent cancellation.
   * Cancelled legs were already routine, and they are why a stale ledger row went
   * unattributed for five days and a surface's failure was misdated by three
   * commits: every other defect on this harness is diagnosed THROUGH this
   * instrument.
   *
   * The margin is a DERIVATION, not a tuned literal. A leg must be able to overrun
   * its entire budget and still finish and report; anything less and the ceiling
   * decides which breaches are observable. Hence ceiling >= 2x budget PLUS a reserve
   * for the reporting steps -- at exactly 2x the reserve is zero and the leg is
   * cancelled before it can upload the record, which is the same silence in a new
   * place. Fitting the
   * constant to the worst leg observed today would instead re-break the moment a
   * surface is enrolled -- which is exactly how this arc's own defect surfaced.
   *
   * This does NOT fix the imbalance producing those times. `weightOf` prices child
   * boots at a flat rate while measured per-mutant rates span roughly 1.19 s to
   * 23.45 s, so the partition balances the wrong quantity by up to ~30x per
   * surface, which is how a 1.006x load spread yields a 1.56x wall-clock spread.
   * That is filed as BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY. Repairing it
   * repartitions every surface and invalidates every in-flight arc's assignment at
   * once, so it is deliberately NOT bundled here. This case guarantees the
   * imbalance stays DIAGNOSABLE; it does not claim to remove it.
   */
  it("gives every measured leg a ceiling that cannot silence a budget breach (AC-9)", () => {
    // A leg must survive overrunning its whole budget AND still have time to
    // report, so the requirement is a factor over the shared constant PLUS a
    // reserve -- never minutes, so changing the budget moves the requirement.
    const MIN_CEILING_FACTOR = 2;
    // The ceiling bounds the WHOLE JOB; `elapsed.txt` is written and uploaded by
    // two steps that run AFTER the work, under `if: always()`. At exactly 2x,
    // a leg whose work fills the overrun allowance has ZERO seconds left to
    // write and upload that record, so it is cancelled with no artifact and no
    // annotation -- the precise outcome this pin exists to prevent. The reserve
    // is what makes "still report" true rather than merely intended; it covers
    // the post-measurement steps only, since SHARD_START is stamped as the FIRST
    // step and the measured elapsed therefore already includes checkout+setup.
    const REPORTING_RESERVE_SECONDS = 5 * 60;
    const requiredSeconds = SHARD_BUDGET_SECONDS * MIN_CEILING_FACTOR + REPORTING_RESERVE_SECONDS;

    // DERIVED FROM THE WORKFLOW, not from a list of names typed here. A leg is
    // MEASURED iff it uploads an `elapsed-*` artifact -- that upload is what
    // puts it in front of the budget checker, so it is the property that makes
    // the ceiling relate to the budget at all. A hand-written set covers the
    // legs its author knew about and fails OPEN on the fifth one somebody adds,
    // which is the same defect class this file's own subject is about.
    const measured = Object.entries(wf.jobs)
      .filter(([, job]) =>
        (job.steps ?? []).some(
          (st) =>
            (st.uses ?? "").startsWith("actions/upload-artifact") &&
            ((st as { with?: { name?: string } }).with?.name ?? "").startsWith("elapsed-"),
        ),
      )
      .map(([name]) => name);

    // PREMISE, STATED EXECUTABLY: the derivation must actually find legs, or
    // every assertion below ranges over an empty set and passes vacuously.
    premiseHolds("the workflow declares at least one measured leg", measured.length > 0);
    // And it must agree with the leg families the budget checker is wired to.
    // Either side drifting is a failure: a job that uploads an elapsed artifact
    // nobody expects, or an expected family that uploads nothing.
    expect([...measured].sort(), "measured legs vs the budget checker's families").toEqual(
      [...FAMILIES.map((f) => f.job), ...GATES.map((g) => g.job)].sort(),
    );

    const offenders = measured
      .map((name) => ({ name, minutes: wf.jobs[name]?.["timeout-minutes"] }))
      // An ABSENT ceiling is an offender too, and the more dangerous one: it
      // reads as "no timeout" and defaults to the runner maximum, so a wedged
      // leg burns hours. `undefined` must never pass by falling through a
      // numeric compare.
      .filter((j) => typeof j.minutes !== "number" || j.minutes * 60 < requiredSeconds)
      .map((j) => `${j.name}: ${j.minutes ?? "(absent)"}min < ${requiredSeconds / 60}min required`);

    expect(offenders.join("\n"), "legs whose ceiling can cancel a budget breach").toBe("");
  });
});
