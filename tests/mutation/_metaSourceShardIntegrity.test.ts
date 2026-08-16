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
  with?: { script?: string };
};
type Job = {
  strategy?: { matrix?: Record<string, unknown>; "fail-fast"?: boolean };
  needs?: string[];
  steps?: Step[];
};
const WORKFLOW = join(ROOT, ".github/workflows/mutation-harness.yml");
const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as { jobs: Record<string, Job> };

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
        const realized = run.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i));
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
          targetsIn(vitestRun(f.job).replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i))),
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
          uploaded.add(name.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i)));
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

  it("the tracking issue reports each job's RESULT, in the BODY (AC-6)", () => {
    // Scoped to the github-script BODY, not the serialized step object. A step
    // NAME like `Report needs.parser-shards.result`, or the same expression in
    // an `if:` condition, satisfies a whole-object substring search while the
    // body itself reports nothing -- the sibling-contamination shape the
    // anti-tautology rule exists to stop.
    // Selected by DECLARED ID, not by matching text in the body. `notify` has
    // two github-script steps, and `issues.createComment` -- which BOTH bodies
    // call -- contains the substring `issues.create`, so a body-text selector
    // matches the auto-close step too and lets its text satisfy a claim about
    // the issue body. An `id` is exact, unique per job, and workflow-controlled.
    const filing = (wf.jobs["notify"]?.steps ?? []).filter((x) => x.id === "file-issue");
    expect(filing, "notify declares no step with id file-issue").toHaveLength(1);
    const body = filing[0]!.with!.script!;
    for (const job of [...FAMILIES.map((f) => f.job), ...GATES.map((g) => g.job), "budget"]) {
      expect(body, `the issue body never reports ${job}'s result`).toContain(`needs.${job}.result`);
    }
  });
});
