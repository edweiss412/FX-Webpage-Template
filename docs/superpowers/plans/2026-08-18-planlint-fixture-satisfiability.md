# Plan — spec:lint plan fixture satisfiability

**Spec:** `docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md` (canonical; its §§ are cited throughout and win any disagreement with this plan).
**Backlog row:** `BL-PLANLINT-CONSTRUCTED-FIXTURE-SATISFIABILITY`.
**Base:** `7d09a1f0b` (arc B's merge, PR #847). **Branch:** `fix/planlint-fixture-satisfiability`.

impeccable-gate: N/A — no UI surface (no file under `app/` outside `app/api/**`, none under `components/`, no `@theme` token block, no `DESIGN.md` or Tailwind config change).

## 0. Pre-draft verification pass (run, not described)

Every symbol, path, and number this plan names was verified against the live tree at base `7d09a1f0b` before the task bodies were written. Transcript:

| claim | probe | result |
| --- | --- | --- |
| `parseDoc` keeps only the first info-string token, lowercased | `sed -n '107p' lib/specLint/parse.ts` | `const info = (rest.trim().toLowerCase().split(/\s+/)[0] ?? "").trim();` ✓ |
| premise sentinel text | `sed -n '29p;38p' tests/_shared/premise.ts` | both lines carry `premise not met: ` ✓ |
| repo include glob | `sed -n '34p' vitest.projects.ts` | `export const BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"];` ✓ |
| gate-marker grammar to mirror | `sed -n '37p' lib/specLint/redContract.ts` | the `GATE` regex ✓ |
| `RED_ALREADY_GREEN` precedent | `grep -n RED_ALREADY_GREEN lib/specLint/redContract.ts` | `439` ✓ |
| `CHECK_ORDER` location | `grep -n CHECK_ORDER lib/specLint/run.ts` | `30` ✓ |
| `redContract` registry row to copy | `sed -n '525p' tests/mutation/source/registry.ts` | `id: "redContract",` ✓ |
| corpus size | `git ls-files 'docs/superpowers/plans' \| grep -c '\.md$'` | `659` ✓ |
| enrolled fixture markers today | `git ls-files 'docs/superpowers/plans' \| grep '\.md$' \| xargs grep -l '<!-- fixture:' \| wc -l` | `0` ✓ |
| the module this plan creates is absent | `git ls-files lib/specLint/fixtureContract.ts` | empty — the module every task's `red-target=` names ✓ |

## 1. Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/specLint/_metaPureCore.test.ts` — no change to the test, but the new module falls under its tree walk by default, so purity is enforced from the first commit (Task 1 asserts it explicitly rather than assuming the walk covers a new file).
- **EXTENDS** `tests/mutation/source/registry.ts` — one new row, `id: "fixtureContract"` (Task 8). Registry reconciliation is in §2.
- **EXTENDS** `tests/specLint/cli.test.ts` — end-to-end adapter cases (Task 6).
- **CREATES** no new registry-style meta-test. The two candidate invariants ("every new finding code appears in the docs table", "every enrolled block draws exactly one outcome") are pinned by the classification suite's total-precedence cases (Task 4) rather than by a separate walker; a meta-test whose registry is a copy of one function's switch is a second copy of the same list.
- **N/A:** advisory-lock topology (no `pg_advisory*` in scope), Supabase call boundary (no Supabase client call), admin-alert catalog, sentinel hiding, email canonicalization.

## 2. Registry count reconciliation (run at plan time, pasted)

```
$ grep -c '^    id: "' tests/mutation/source/registry.ts
23
$ grep -n 'id: "' tests/mutation/source/registry.ts | tail -3
584:    id: "taskContract",
...
```

Rows before this plan: **23**. Rows this plan adds: **1** (`fixtureContract`, Task 8). Rows removed: **0**. Expected after: **24** — asserted in Task 8's GREEN step against the live file, not carried as a prose claim.

## 3. Execution record for this plan's fenced blocks (this arc's own discipline, applied to itself)

The spec's whole subject is that an unexecuted embedded block lies. This plan therefore does not ship a block it has not run. Two classes:

**(a) Calibration blocks — executed to their asserted outcome against the live tree.** The §2.4 historical pair in the spec was run as spliced files at base `7d09a1f0b`:

```
- passed | three-column v2 header IS opened by the live matcher
- failed | TWO-column v2 header is NOT opened (the r4 defect shape)
     Error: premise not met: live v2 matcher opened a block on the constructed header. ...
- failed | ordinary assertion failure, premise fine
     AssertionError: expected 1 to be 2 // Object.is equality
```

**(b) Authored-red task blocks — spliced and run, every one of them, to confirm the red is the NAMED absence and never a syntax error.** All five `ts` blocks in §4 were extracted verbatim, written into a collected path, and run in one invocation at base `7d09a1f0b`:

```
$ pnpm exec vitest run tests/.planExec --reporter=json
total 2 passed 1 failed 1
FILE block1-L110.test.ts  status failed assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' imported from ...
FILE block2-L179.test.ts status failed assertions 2
    - failed | a malformed marker surfaces through runLint with NO exec maps
      AssertionError: expected [] to deeply equal [ 'FIXTURE_MALFORMED' ]
FILE block3-L215.test.ts status failed assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' imported from ...
FILE block4-L255.test.ts status failed assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' imported from ...
FILE block5-L346.test.ts status failed assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' imported from ...
```

Read exactly: **four** blocks red at module resolution naming the absent module, and **one** — Task 2's, which imports only tracked modules — red at its assertion, `expected [] to deeply equal [ 'FIXTURE_MALFORMED' ]`, which is the stronger evidence of the two (it proves the five-argument `runLint` call compiles and that the orchestrator genuinely emits nothing today). No block failed at transform.

This run is the RE-execution after the spec round 5 repair, which removed the clean-observation branch and rewrote Task 4's block around the three-branch ladder; every earlier repair that touched a block was followed by the same re-run, and the line numbers here are the current ones. The record is re-measured on every edit rather than carried forward, which is the discipline the arm itself enforces. Two things the original execution corrected rather than confirmed, which is the argument for running it at all: an earlier draft of this section asserted three module-resolution reds where the measurement shows four, and Task 2's block turns out to carry **one case that passes at base vacuously** — "a clean marker adds no findings" holds today precisely because nothing fires at all. It is kept deliberately as the over-fire guard it becomes once Task 2 lands, and is named here so no reviewer has to discover that it proves nothing before the GREEN step. The splice directory was removed after the run and `git status` is clean.

### 3.1 Dogfood against the landed arms

`pnpm spec:lint --exec-red` on this plan at base `7d09a1f0b` reports `0 hard`, and arc B's shipped collection arm draws exactly seven advisories — one `RED_SUITE_UNVERIFIED` per authored marker naming a test file this plan creates (lines 84, 154, 190, 231, 316, 380, 390). That is the correct verdict for a future file (verdict spec §5.2: a future file and a typo are statically indistinguishable, so the token is surfaced by name and nothing hard fires), and it is also the evidence that this plan's markers compose with the arm it extends rather than contradicting it. Task 9's `red-state=live` command was OBSERVED failing at plan time (`git check-ignore -v … ; exit=1`), as the live branch of the red-contract rule requires.

### 3.2 Ordinal sweep (authored AND run)

Spec §4.4 states that the ladder's positions appear in §4.3 and nowhere else, because a second copy of the order went stale twice in consecutive review rounds. The check is mechanical, and this is its run at plan time:

```
$ rg -n 'branch [0-9]|branches [0-9]|condition [0-9]' \
    docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md \
    docs/superpowers/plans/2026-08-18-planlint-fixture-satisfiability.md
(no matches outside spec section 4.3)
```

Every reference that used to carry an ordinal now names the code or the condition, including the seven test titles in Task 4's block. Task 9 re-runs this sweep at closeout; a match outside §4.3 is a defect, not a style note.

## 4. Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — marker grammar, attachment, and the three static codes

<!-- task: red=`pnpm vitest run tests/specLint/fixtureContract.test.ts` red-state=authored red-target=`lib/specLint/fixtureContract.ts` why=`lib/specLint/fixtureContract.ts does not exist at base 7d09a1f0b (git ls-files returns empty), so checkFixtureContract is unimportable and every case in the new suite fails at module resolution. The RED derives from that absent production module, not from anything the test controls: §3(b) records the spliced run naming exactly this specifier. It greens when the module exports checkFixtureContract implementing the spec §3.1 grammar and the spec §3.2 codes` ac=AC-1,AC-2 -->

<!-- spec-lint: ignore — the module this task creates is untracked until this task lands; the path is a forward declaration, not a citation of existing code -->
Create `lib/specLint/fixtureContract.ts`, pure (no `node:` imports), exporting `checkFixtureContract(model, kind)`. Implement spec §3.1's grammar exactly — `<!-- fixture: why=\`…\` -->`, backtick-delimited, `expect=` admitting only the two literals — and spec §3.2's three codes: `FIXTURE_MALFORMED`, `FIXTURE_WHY_EMPTY`, `FIXTURE_UNATTACHED`. Plan-kind docs only; markers on fenced lines inert. Attachment = the immediately following line opens a fence whose info string is `ts`, `tsx`, or `typescript`.

**What is red and why:** the suite cannot import the module under test because that module does not exist.

**Failure modes the tests catch:** a grammar that tolerates an extra field (the retired `expect=` is the concrete case: it must fall to `FIXTURE_MALFORMED`, never be accepted and ignored); attachment that accepts a `bash` fence or a blank line between marker and fence; a marker inside a fence firing at all; a spec-kind doc drawing findings.

```ts
import { describe, it, expect } from "vitest";
import { parseDoc } from "@/lib/specLint/parse";
import { checkFixtureContract } from "@/lib/specLint/fixtureContract";

const codes = (md: string, kind: "spec" | "plan" = "plan") =>
  checkFixtureContract(parseDoc(md), kind).map((f) => `${f.code}@${f.docLine}`);

describe("fixture marker grammar (spec §3.1, §3.2)", () => {
  const block = "```ts\nimport { it } from \"vitest\";\n```";

  it("the declared shape parses clean", () => {
    const md = ["# P", "<!-- fixture: why=`the live matcher opens here` -->", block].join("\n");
    expect(codes(md)).toEqual([]);
  });

  it("every malformation draws FIXTURE_MALFORMED, including the retired expect= field", () => {
    for (const bad of [
      "<!-- fixture: -->",
      "<!-- fixture: why=x -->",
      "<!-- fixture: why=`x` extra=`y` -->",
      "<!-- fixture: why=`x` --> trailing",
      "<!-- fixture: expect=`green` why=`x` -->",
    ]) {
      expect(codes(["# P", bad, block].join("\n"))).toEqual([`FIXTURE_MALFORMED@2`]);
    }
  });

  it("an empty or whitespace why= draws FIXTURE_WHY_EMPTY, not MALFORMED", () => {
    for (const why of ["``", "`   `"]) {
      const md = ["# P", `<!-- fixture: why=${why} -->`, block].join("\n");
      expect(codes(md)).toEqual([`FIXTURE_WHY_EMPTY@2`]);
    }
  });

  it("attachment holds for the three accepted info strings and fails for everything else", () => {
    for (const info of ["ts", "tsx", "typescript"]) {
      const md = ["# P", "<!-- fixture: why=`w` -->", "```" + info, "x", "```"].join("\n");
      expect(codes(md)).toEqual([]);
    }
    for (const next of ["```bash", "```md", "", "ordinary prose"]) {
      const md = ["# P", "<!-- fixture: why=`w` -->", next].join("\n");
      expect(codes(md)).toEqual([`FIXTURE_UNATTACHED@2`]);
    }
    // marker as the final line: no next line at all
    expect(codes(["# P", "<!-- fixture: why=`w` -->"].join("\n"))).toEqual([
      "FIXTURE_UNATTACHED@2",
    ]);
  });

  it("a marker inside a fence is inert, and a spec-kind doc draws nothing", () => {
    const fenced = ["# P", "```md", "<!-- fixture: why=`` -->", "```"].join("\n");
    expect(codes(fenced)).toEqual([]);
    const inSpec = ["# S", "<!-- fixture: why=`` -->", "prose"].join("\n");
    expect(codes(inSpec, "spec")).toEqual([]);
  });
});
```

## Task 2 — wire the static arm through the orchestrator and the default CLI path

<!-- task: red=`pnpm vitest run tests/specLint/fixtureWiring.test.ts` red-state=authored red-target=`lib/specLint/run.ts:30` why=`lib/specLint/run.ts:30 is CHECK_ORDER, the finding-ordering table runLint sorts by, and runLint does not call checkFixtureContract at all at base — so a plan whose only defect is a malformed fixture marker lints clean through runLint today. The new suite asserts through runLint (not the module directly), so it reds until the orchestrator calls the Task 1 export and merges its findings under check taskContract` ac=AC-1,AC-6 -->

Call `checkFixtureContract` from `runLint` for plan-kind docs on EVERY invocation (spec §3 is static — no flag). Findings report `check: "taskContract"`; `CHECK_ORDER` is unchanged. The default CLI path therefore reports them, which is the point: `codex-guard --lint-doc` never passes `--exec-red`.

**What is red and why:** `runLint` has no call to the new module, so a fixture-marker defect produces zero findings through the orchestrator.

**Failure modes caught:** a module implemented in Task 1 but never called (the classic dead-guard shape); findings landing under the wrong `check` and so sorting into the wrong section; the static arm accidentally gated behind `--exec-red`.

```ts
import { describe, it, expect } from "vitest";
import { runLint } from "@/lib/specLint/run";

const resolver = { readFileLines: () => null, listTrackedFiles: () => [] as string[] };

describe("fixture static arm is wired into runLint (spec §3)", () => {
  const doc = (text: string) => ({ text, repoRelPath: "docs/superpowers/plans/x.md", kind: "plan" as const, kindSource: "explicit" as const });

  it("a malformed marker surfaces through runLint with NO exec maps", () => {
    const text = ["# P", "<!-- fixture: why=x -->", "```ts", "x", "```"].join("\n");
    const res = runLint(doc(text), resolver, null, null, null);
    const f = res.findings.filter((x) => x.code.startsWith("FIXTURE_"));
    expect(f.map((x) => x.code)).toEqual(["FIXTURE_MALFORMED"]);
    expect(f[0]!.check).toBe("taskContract");
    expect(f[0]!.severity).toBe("fail");
  });

  it("a clean marker adds no findings", () => {
    const text = ["# P", "<!-- fixture: why=`w` -->", "```ts", "x", "```"].join("\n");
    const res = runLint(doc(text), resolver, null, null, null);
    expect(res.findings.filter((x) => x.code.startsWith("FIXTURE_"))).toEqual([]);
  });
});
```

## Task 3 — splice-plan derivation (pure)

<!-- task: red=`pnpm vitest run tests/specLint/fixtureSplicePlan.test.ts` red-state=authored red-target=`lib/specLint/fixtureContract.ts` why=`spliceFixturePlan does not exist — lib/specLint/fixtureContract.ts is untracked at base and Task 1 adds only checkFixtureContract, so the import fails to resolve and every case reds. It greens when the module exports spliceFixturePlan returning one entry per attached well-formed marker, verbatim block text, in doc order, with statically-flagged markers excluded per spec §4.1` ac=AC-3,AC-6 -->

Export `spliceFixturePlan(model, kind)` returning `{ line, block: string }[]` — one entry per attached, well-formed marker, block text VERBATIM (blank lines and trailing whitespace preserved byte for byte), doc order, excluding any marker that drew a static finding (spec §4.1).

**What is red and why:** the named export does not exist.

**Failure modes caught:** a plan that silently normalizes block text (which would change what runs versus what the author reads); a statically-flagged marker reaching the splice set (spec §4.1 forbids running a block whose declared outcome is unknown); doc order lost when a doc mixes clean and flagged markers.

```ts
import { describe, it, expect } from "vitest";
import { parseDoc } from "@/lib/specLint/parse";
import { spliceFixturePlan } from "@/lib/specLint/fixtureContract";

describe("splice plan (spec §4.1)", () => {
  it("carries block text byte-identically, including blank and trailing-space lines", () => {
    const body = ["import { it } from \"vitest\";", "", "// trailing space next line", "const x = 1;  "];
    const md = ["# P", "<!-- fixture: why=`w` -->", "```ts", ...body, "```"].join("\n");
    const plan = spliceFixturePlan(parseDoc(md), "plan");
    expect(plan).toHaveLength(1);
    expect(plan[0]!.block).toBe(body.join("\n"));
    expect(plan[0]!.line).toBe(2);
  });

  it("excludes statically-flagged markers and preserves doc order among the rest", () => {
    const ok = (n: string) => ["<!-- fixture: why=`" + n + "` -->", "```ts", "// " + n, "```"];
    const md = ["# P", ...ok("first"), "<!-- fixture: why=x -->", "```ts", "// flagged", "```", ...ok("last")].join("\n");
    const plan = spliceFixturePlan(parseDoc(md), "plan");
    expect(plan.map((e) => e.block)).toEqual(["// first", "// last"]);
    expect(plan.map((e) => e.line)).toEqual([...plan.map((e) => e.line)].sort((a, b) => a - b));
  });

  it("a spec-kind doc yields an empty plan", () => {
    const md = ["# S", "<!-- fixture: why=`w` -->", "```ts", "x", "```"].join("\n");
    expect(spliceFixturePlan(parseDoc(md), "spec")).toEqual([]);
  });
});
```

## Task 4 — classification, total over the precedence ladder (pure)

<!-- task: red=`pnpm vitest run tests/specLint/fixtureClassify.test.ts` red-state=authored red-target=`lib/specLint/fixtureContract.ts` why=`synthesizeFixtureFindings does not exist at base and is not added by Tasks 1 or 3, so the import fails to resolve. It greens when the module implements spec §4.3's ladder IN ORDER, emitting exactly one outcome per enrolled block; the cases below are red against any implementation that certifies a block on a proxy — a passing entry, an absent failure, a non-failed file — or that reads a non-sentinel failure as a satisfiability signal` ac=AC-3,AC-4 -->

Export `synthesizeFixtureFindings(plan, results)` implementing spec §4.3's three branches: the advisory when the block did not run, the hard verdict when a failure carries the premise sentinel, and NO finding otherwise. The input carries file status, per-assertion status and failure messages so that an implementation reading any of them as a certificate is catchable — spec §§2.5-2.8 measured each one unsound as evidence. `results === null` (static invocation) yields zero findings. Exactly one outcome per enrolled block.

**What is red and why:** the named export does not exist.

**Failure modes caught.** Every case in the third test is a proxy that some earlier draft of this ladder treated as evidence, and each was measured unsound in a review round: a passing entry (spec §2.8 — an empty test body passes), an absent failure over skipped entries (§2.5 — the run exits 0), a non-failed file (§2.6 — `afterAll` fails the file while every assertion passes), and a failed assertion read as a real one (§2.7 — a `beforeEach` explosion arrives identically). The suite asserts `toEqual([])` for each, so reintroducing any certificate reds immediately rather than in a sixth review round.

```ts
import { describe, it, expect } from "vitest";
import { synthesizeFixtureFindings } from "@/lib/specLint/fixtureContract";

const PREMISE = "Error: premise not met: the live matcher opened a block. The assertion below this line proves nothing";
const ASSERT = "AssertionError: expected false to be true";
const HOOK = "Error: BEFORE_EACH_EXPLODED";

const entry = (line: number) => ({ line, block: "// b" });
const file = (o: { statuses?: string[]; failures?: string[]; fileStatus?: string }) => ({
  fileStatus: o.fileStatus ?? "passed",
  assertions: (o.statuses ?? ["passed"]).map((status, i) => ({ status, title: `t${i}` })),
  failureMessages: o.failures ?? [],
});
const only = (r: unknown) =>
  synthesizeFixtureFindings([entry(5)], r as never).map((f) => f.code);
const results = (r: unknown) => ({ files: new Map([[5, r]]) });

describe("classification ladder (spec section 4.3)", () => {
  it("UNSATISFIABLE is the one hard verdict, and it needs the sentinel", () => {
    expect(only(results(file({ fileStatus: "failed", statuses: ["failed"], failures: [PREMISE] })))).toEqual([
      "FIXTURE_UNSATISFIABLE",
    ]);
    expect(
      only(results(file({ fileStatus: "failed", statuses: ["failed", "failed"], failures: [ASSERT, PREMISE] }))),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(
      only(results(file({ fileStatus: "failed", statuses: ["failed", "skipped"], failures: [PREMISE] }))),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
  });

  it("the advisory means the block DID NOT RUN, and nothing else", () => {
    // empty entry list: the report's own statement that no test case existed
    // (unresolvable import, transform error, no suite, outside-the-globs trap)
    expect(only(results(file({ fileStatus: "failed", statuses: [] })))).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
    // absent from the report entirely
    const absent = synthesizeFixtureFindings([entry(5)], { files: new Map() } as never);
    expect(absent.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
    expect(absent[0]!.severity).toBe("advisory");
  });

  it("NO shape without the sentinel is ever certified, and none draws a hard code", () => {
    // Each of these was, in some review round, a branch that claimed more than
    // the report supports. Every one now draws NOTHING: the arm has no claim.
    // section 2.8 - an empty test body passes, so a passing entry proves nothing
    expect(only(results(file({ statuses: ["passed", "passed"] })))).toEqual([]);
    // section 2.5 - a skipped entry is present and unexecuted; the run exits 0
    expect(only(results(file({ statuses: ["skipped", "skipped"] })))).toEqual([]);
    expect(only(results(file({ statuses: ["passed", "skipped"] })))).toEqual([]);
    // section 2.6 - afterAll fails the FILE while every assertion passes
    expect(only(results(file({ fileStatus: "failed", statuses: ["passed"] })))).toEqual([]);
    // section 2.7 - a per-test hook failure arrives as an ordinary failure
    expect(only(results(file({ fileStatus: "failed", statuses: ["failed"], failures: [HOOK] })))).toEqual([]);
    // an ordinary assertion failure is equally not a satisfiability signal
    expect(only(results(file({ fileStatus: "failed", statuses: ["failed"], failures: [ASSERT] })))).toEqual([]);
  });

  it("every enrolled block draws at most one outcome, over the whole ladder", () => {
    const plan = [1, 2, 3, 4].map(entry);
    const map = new Map<number, unknown>([
      [1, file({ fileStatus: "failed", statuses: ["failed"], failures: [PREMISE] })],
      [2, file({ fileStatus: "failed", statuses: [] })],
      [3, file({ statuses: ["passed"] })],
      // line 4 deliberately absent from the report
    ]);
    const out = synthesizeFixtureFindings(plan, { files: map } as never);
    expect(out.map((f) => `${f.docLine}:${f.code}`)).toEqual([
      "1:FIXTURE_UNSATISFIABLE",
      "2:FIXTURE_PROBE_UNVERIFIED",
      "4:FIXTURE_PROBE_UNVERIFIED",
    ]);
    // line 3 ran without a premise failure, so the arm says nothing about it
    expect(out.some((f) => f.docLine === 3)).toBe(false);
  });

  it("a null results map (static invocation) draws nothing", () => {
    expect(synthesizeFixtureFindings([entry(5)], null)).toEqual([]);
  });
});
```

## Task 5 — adapter: splice lifecycle, one vitest run, JSON read

<!-- task: red=`pnpm vitest run tests/specLint/fixtureAdapter.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:290` why=`scripts/spec-lint.ts:290 is inside the --exec-red branch that today spawns red commands and collection probes only; there is no splice directory, no vitest invocation, and no JSON read anywhere in the adapter, so an injected-dependency test asserting the lifecycle has nothing to observe and reds. It greens when the adapter implements spec §4.2 steps 1-4 through the existing deps seam` ac=AC-5 -->

Implement spec §4.2 in `scripts/spec-lint.ts`, behind `--exec-red`, through the existing `deps` seam so the lifecycle is testable without real subprocesses: choose `tests/.spec-lint-fixtures-<pid>-<counter>/`; **if it exists, spawn nothing** and mark every enrolled block `FIXTURE_PROBE_UNVERIFIED`; else write one vitest test file per block; run ONE `vitest run <dir> --reporter=json --outputFile=<dir>/report.json`; remove the directory in a `finally`.

**What is red and why:** the adapter has no splice code at all.

**Failure modes caught:** a spawn happening despite a pre-existing directory (the fence must be proved by a spy recording ZERO calls, per the #831 lesson — a fence placed after observation can refuse while citing whatever state it found); a directory surviving a thrown exception, a timeout, or a non-zero exit; more than one vitest invocation per doc (spec §1.1 item 5).

```ts
import { describe, it, expect } from "vitest";
import { runFixtureSplice } from "@/lib/specLint/fixtureContract";

// The adapter's fs+spawn surface, injected. A real subprocess is Task 6's job.
const harness = (opts: { dirExists?: boolean; throwOnRun?: boolean } = {}) => {
  const calls: string[] = [];
  const dirs = new Set<string>(opts.dirExists ? ["PRESET"] : []);
  return {
    calls,
    dirs,
    deps: {
      exists: (d: string) => dirs.has(d) || dirs.has("PRESET"),
      mkdir: (d: string) => { dirs.add(d); calls.push(`mkdir:${d}`); },
      write: (p: string) => calls.push(`write:${p}`),
      rm: (d: string) => { dirs.delete(d); calls.push(`rm:${d}`); },
      run: (cmd: string) => {
        calls.push(`run:${cmd}`);
        if (opts.throwOnRun) throw new Error("boom");
        return { report: { files: new Map() } };
      },
    },
  };
};
const plan = [{ line: 3, expect: "red" as const, block: "// b" }];

describe("splice lifecycle (spec §4.2)", () => {
  it("a pre-existing directory spawns NOTHING and declines every block", () => {
    const h = harness({ dirExists: true });
    const out = runFixtureSplice(plan, h.deps as never);
    expect(h.calls.filter((c) => c.startsWith("run:"))).toEqual([]);
    expect(h.calls.filter((c) => c.startsWith("write:"))).toEqual([]);
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
  });

  it("exactly ONE vitest invocation per doc, whatever the block count", () => {
    const h = harness();
    runFixtureSplice(
      [1, 2, 3].map((line) => ({ line, expect: "red" as const, block: "// b" })),
      h.deps as never,
    );
    expect(h.calls.filter((c) => c.startsWith("run:"))).toHaveLength(1);
    expect(h.calls.filter((c) => c.startsWith("write:"))).toHaveLength(3);
  });

  it("the directory is removed even when the run throws", () => {
    const h = harness({ throwOnRun: true });
    runFixtureSplice(plan, h.deps as never);
    expect(h.calls.some((c) => c.startsWith("rm:"))).toBe(true);
    expect([...h.dirs]).toEqual([]);
  });
});
```

## Task 6 — end-to-end through the real CLI

<!-- task: red=`pnpm vitest run tests/specLint/fixtureCli.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:290` why=`the adapter at scripts/spec-lint.ts:290 runs no fixture blocks at base, so a real spec:lint --exec-red invocation over a fixture plan whose block fails a premise exits 0 with no FIXTURE_ code in its report. It greens once Tasks 1-5 land end to end; this suite is the only one that observes the real subprocess, real JSON reporter, and real filesystem together` ac=AC-4,AC-5 -->

Extend the CLI suite with real subprocess cases over trivial blocks (no heavy phases): a premise-failing block → exit 1 with `FIXTURE_UNSATISFIABLE`; the repaired block → exit 0 with no `FIXTURE_` code at all; an unresolvable-import block → the advisory; a block whose `describe` is skipped → exit 0 with no code, observed through the REAL reporter (spec §2.5's shape exits 0, so only a real run proves the adapter surfaces the statuses at all and that the arm still refuses to rule on them); a pre-existing splice directory → the advisory with a spy asserting ZERO vitest spawns; and an assertion, after every case, that no `tests/.spec-lint-fixtures-*` directory survives.

**What is red and why:** no fixture code path exists in the shipped CLI.

**Failure modes caught:** the pure ladder being right while the adapter hands it a differently-shaped report (the two can only be observed together here); the JSON reporter's field names drifting under a vitest upgrade; a surviving splice directory that the injected-dependency test in Task 5 cannot see because it never touches a real filesystem.

## Task 7 — the historical defect, re-enacted as a shipped fixture

<!-- task: red=`pnpm vitest run tests/specLint/fixtureHistorical.test.ts` red-state=authored red-target=`lib/specLint/fixtureContract.ts` why=`the module the suite imports is untracked at base, so both cases red at module resolution. It greens once Tasks 1-5 land; the case pins the ACTUAL r4 defect (a two-column TRANSPORTATION header that lib/parser/blocks/transport.ts does not open a block on) drawing FIXTURE_UNSATISFIABLE while the merged three-column repair is clean, so the arm is calibrated by the defect it exists to catch rather than by a synthetic analogue` ac=AC-4 -->

Ship the spec §2.4 pair as two fixture plans under `tests/specLint/fixtures/`: the r4 two-column header (draws `FIXTURE_UNSATISFIABLE`) and the merged three-column header (clean). Fixture text is the plan's own, from `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:119`.

**Failure modes caught:** an implementation that passes every constructed unit case but does not fire on the real defect — the exact gap the spec's §1.1 item 13 says fixtures alone cannot close.

## Task 8 — mutation enrolment and score

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:525` why=`tests/mutation/source/registry.ts:525 is the redContract row, the last specLint surface the registry declares, and no row after it names fixtureContract (grep 'id: "fixtureContract"' returns empty), so the guard gate scores nothing for the new module and cannot report a survivor against it. It greens when the row lands and the surface scores at or above its 0.95 floor with an empty unaccepted-survivor set` ac=AC-7 -->

Add the `fixtureContract` row (shape copied from the `redContract` row at `tests/mutation/source/registry.ts:525`), run `pnpm mutation:guards` in the FOREGROUND under the heavy-slot wrapper, and state the score plus an empty unaccepted-survivor set in the round-1 diff brief. Assert the row count moved 23 → 24 against the live file (§2).

**Failure modes caught:** deciding assertions placed outside the registered `suitePaths`, which buys zero score (the #831 lesson).

## Task 9 — wiring, docs, and ledger closeout

<!-- task: red=`git check-ignore -v tests/.spec-lint-fixtures-1-1/probe.test.ts` red-state=live why=`.gitignore carries no entry for the splice directory at base, so git check-ignore finds no matching pattern and exits 1 today (observed at plan time: exit=1). The SAME command exits 0 once this task adds the tests/.spec-lint-fixtures-* entry, which is the red-then-green cycle on one command. This replaced an earlier draft whose red was pnpm spec:lint on this plan: waiving the forward-declaration citation so the plan could lint clean for dispatch made that command exit 0, and a red that is already green asserts nothing` ac=AC-8 -->

Re-run the §3.2 ordinal sweep and confirm no match outside spec §4.3. `.gitignore` entry for `tests/.spec-lint-fixtures-*/` written with `printf '\n%s\n'` and verified by `git check-ignore -v`; one sentence in `docs/agents/writing-plans.md` under the premise bullet; a `docs/superpowers/specs/README.md` row; archive the ledger row and strip its IN PROGRESS marker in the PR's LAST commit (invariant 12).

<!-- tasks: end -->

## 5. Acceptance criteria (spec §10, mapped)

| AC | tasks |
| --- | --- |
| AC-1 marker grammar and three static codes | 1, 2 |
| AC-2 no shipped code inspects an unenrolled block | 1 |
| AC-3 §4.3 precedence total, every contest | 3, 4 |
| AC-4 historical pair reproduces | 4, 6, 7 |
| AC-5 pre-existing dir spawns nothing; dir never survives | 5, 6 |
| AC-6 static-flag exclusion; static invocation silent; corpus byte-identical | 2, 3 |
| AC-7 purity, `parse.ts` unmodified, score ≥ 0.95 | 1, 8 |
| AC-8 spec and plan lint clean | 9 |

## 6. Checklist

- [ ] Task 1-9 in order, TDD per task, one commit each
- [ ] Self-review (this document, against `docs/agents/writing-plans.md`)
- [ ] Adversarial review (cross-model) to APPROVE
- [ ] Execution handoff
