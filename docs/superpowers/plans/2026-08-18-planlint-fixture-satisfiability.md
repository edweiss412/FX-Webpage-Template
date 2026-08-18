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

- **EXTENDS** `tests/specLint/_metaPureCore.test.ts` — no change to the test; the new module falls under its recursive tree walk by default, and **Task 8** asserts that explicitly rather than assuming coverage.
- **EXTENDS** `tests/mutation/source/registry.ts` AND `tests/mutation/source/expectedLedgerKinds.ts` — one new row in EACH, `id: "fixtureContract"` (**Task 7**); `tests/mutation/guardSurfaces.gates.test.ts:21` compares the two key sets, so one without the other reds the corpus gate. Reconciliation is in §2.
<!-- spec-lint: ignore — a file Task 6 creates; the path is a forward declaration, not a citation of existing code -->
- **CREATES** `tests/specLint/fixtureCli.test.ts` — end-to-end adapter cases (**Task 6**). It does NOT extend the tracked `tests/specLint/cli.test.ts`, whose subject is the pre-existing CLI surface.
- **CREATES** no new registry-style meta-test. The two candidate invariants ("every new finding code appears in the docs table", "every enrolled block draws exactly one outcome") are pinned by the classification suite's total-precedence cases (Task 4) rather than by a separate walker; a meta-test whose registry is a copy of one function's switch is a second copy of the same list.
- **N/A:** advisory-lock topology (no `pg_advisory*` in scope), Supabase call boundary (no Supabase client call), admin-alert catalog, sentinel hiding, email canonicalization.

## 2. Registry count reconciliation (authored AND RUN — the first version of this section was not)

```
$ git show 7d09a1f0b:tests/mutation/source/registry.ts | grep -c '^    id: "'
36
$ grep -c ': {}' tests/mutation/source/expectedLedgerKinds.ts
18
```

Registry rows at base: **36**. Rows this plan adds: **1** (`fixtureContract`, Task 7). Expected after: **37**, asserted in Task 7's GREEN step against the live file.

**Enrolment is TWO declarations, not one.** `tests/mutation/guardSurfaces.gates.test.ts:21` compares the registry's id set against the independent key set of `EXPECTED_LEDGER_KINDS` (`tests/mutation/source/expectedLedgerKinds.ts`), which is declared separately on purpose — counting a list against itself proves nothing, so a new surface fails by default until it declares its own counts. Task 7 therefore adds a row in BOTH files; a registry row alone leaves `guardSurfaces.gates.test.ts` red.

**Recorded because the correction matters more than the number.** The first version of this section stated 23 rows and a 23→24 transition. That figure was never produced by running the command it was pasted under — it was authored, which is the exact defect `docs/agents/writing-plans.md` names ("Reconciliation/closeout sweeps are authored AND RUN at plan time; authoring the sweep without running it cost the financials plan 6 consecutive rounds"). Plan review round 1 caught it by running the command. Every count in this document has now been produced by the command printed beside it.

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
total 8 passed 1 failed 7
FILE block1-L119.test.ts | assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' ...
FILE block2-L197.test.ts | assertions 2
     - a malformed marker surfaces through runLint with NO exec maps
       AssertionError: expected [] to deeply equal [ 'FIXTURE_MALFORMED' ]
FILE block3-L233.test.ts | assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' ...
FILE block4-L281.test.ts | assertions 0 | Cannot find package '@/lib/specLint/fixtureContract' ...
FILE block5-L424.test.ts | assertions 6
     - failed (x6) | TypeError: runFixtureSplice is not a function
```

Read exactly, and note the three DIFFERENT red shapes, none of them a transform error:

- **Three blocks** (Tasks 1, 3, 4) red at module resolution, naming `@/lib/specLint/fixtureContract`, the module those tasks create.
- **Task 2's block** red at its assertion, `expected [] to deeply equal [ 'FIXTURE_MALFORMED' ]`. It imports only tracked modules, so this proves the five-argument `runLint` call compiles and that the orchestrator genuinely emits nothing today.
- **Task 5's block** red with `TypeError: runFixtureSplice is not a function`. That shape is the point: the module RESOLVES — it is `scripts/spec-lint.ts`, which exists — and simply lacks the export. Since plan review round 1, this block imports from the ADAPTER rather than from the pure core, because the spec's §5 boundary puts every filesystem, spawn and JSON-parse concern there; the earlier version imported a side-effecting `runFixtureSplice` from the pure core module and could not have satisfied the ratified architecture.

This run is the RE-execution after plan review round 2, which added the assertion-channel case to Task 5 and moved the two verification gates out of the enrolled region; every earlier repair that touched a block was followed by the same re-run, and the line numbers here are the current ones. The record is re-measured on every edit rather than carried forward, which is the discipline the arm itself enforces. Two things the original execution corrected rather than confirmed, which is the argument for running it at all: an earlier draft of this section asserted three module-resolution reds where the measurement shows four, and Task 2's block turns out to carry **one case that passes at base vacuously** — "a clean marker adds no findings" holds today precisely because nothing fires at all. It is kept deliberately as the over-fire guard it becomes once Task 2 lands, and is named here so no reviewer has to discover that it proves nothing before the GREEN step. The splice directory was removed after the run and `git status` is clean.

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
Create `lib/specLint/fixtureContract.ts`, pure (no `node:` imports), exporting `checkFixtureContract(model, kind)`. Implement spec §3.1's grammar exactly — `<!-- fixture: why=\`…\` -->`, backtick-delimited, `why=` the ONLY field — and spec §3.2's three codes: `FIXTURE_MALFORMED`, `FIXTURE_WHY_EMPTY`, `FIXTURE_UNATTACHED`. Plan-kind docs only; markers on fenced lines inert. Attachment = the immediately following line opens a fence whose info string is `ts`, `tsx`, or `typescript`.

**What is red and why:** the suite cannot import the module under test because that module does not exist.

**Failure modes the tests catch:** a grammar that tolerates an extra field. The retired `expect=` is the concrete case and appears in the suite ONLY as a rejection fixture: it must draw `FIXTURE_MALFORMED`, never be accepted and ignored; attachment that accepts a `bash` fence or a blank line between marker and fence; a marker inside a fence firing at all; a spec-kind doc drawing findings.

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
    expect(codes(["# P", "<!-- fixture: why=`w` -->"].join("\n"))).toEqual(["FIXTURE_UNATTACHED@2"]);
  });

  it("FIXTURE_UNATTACHED names the offending line in its detail", () => {
    // Without this the code is a dead end for the author: every non-attaching
    // shape reports identically and none of them says what was found instead.
    const findingFor = (next: string) =>
      checkFixtureContract(parseDoc(["# P", "<!-- fixture: why=`w` -->", next].join("\n")), "plan")[0]!;
    expect(findingFor("```bash").detail).toContain("```bash");
    expect(findingFor("ordinary prose").detail).toContain("ordinary prose");
    // and the two must not report the same detail
    expect(findingFor("```bash").detail).not.toBe(findingFor("ordinary prose").detail);
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

**Failure modes caught:** a plan that silently normalizes block text (which would change what runs versus what the author reads); a statically-flagged marker reaching the splice set (spec §4.1 forbids splicing a block whose declaration the linter has already rejected); doc order lost when a doc mixes clean and flagged markers.

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

  it("excludes EVERY statically-flagged marker, not only the malformed ones", () => {
    // An attached marker with an empty why= is well-formed enough to attach, so
    // an implementation excluding only FIXTURE_MALFORMED still splices it --
    // running a block whose declaration the linter has already rejected.
    const md = ["# P", "<!-- fixture: why=`` -->", "```ts", "// empty why", "```"].join("\n");
    expect(spliceFixturePlan(parseDoc(md), "plan")).toEqual([]);
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

Export `synthesizeFixtureFindings(plan, results)` implementing spec §4.3's three branches IN ORDER: the hard verdict when the sentinel appears in EITHER channel (assertion failures or the file-level message), then the advisory when no sentinel appears and the report carries NO TEST CASE for the block, then NO finding. The input carries file status, per-assertion status and failure messages so that an implementation reading any of them as a certificate is catchable — spec §§2.5-2.8 measured each one unsound as evidence. `results === null` (static invocation) yields zero findings. Exactly one outcome per enrolled block.

**What is red and why:** the named export does not exist.

**Failure modes caught.** An implementation that tests the empty entry list before the sentinel reports a module-scope premise failure as a block that produced no test case, and suppresses the verdict (spec §2.9, one live corpus instance), and one that reads only assertion `failureMessages` never sees that sentinel at all. Beyond that, every case in the third test is a proxy that some earlier draft of this ladder treated as evidence, and each was measured unsound in a review round: a passing entry (spec §2.8 — an empty test body passes), an absent failure over skipped entries (§2.5 — the run exits 0), a non-failed file (§2.6 — `afterAll` fails the file while every assertion passes), and a failed assertion read as a real one (§2.7 — a `beforeEach` explosion arrives identically). The suite asserts `toEqual([])` for each, so reintroducing any certificate reds immediately rather than in a sixth review round.

```ts
import { describe, it, expect } from "vitest";
import { synthesizeFixtureFindings } from "@/lib/specLint/fixtureContract";

const PREMISE = "Error: premise not met: the live matcher opened a block. The assertion below this line proves nothing";
const ASSERT = "AssertionError: expected false to be true";
const HOOK = "Error: BEFORE_EACH_EXPLODED";

const entry = (line: number) => ({ line, block: "// b" });
const file = (o: {
  statuses?: string[];
  failures?: string[];
  fileStatus?: string;
  fileMessage?: string;
}) => ({
  fileStatus: o.fileStatus ?? "passed",
  assertions: (o.statuses ?? ["passed"]).map((status, i) => ({ status, title: `t${i}` })),
  failureMessages: o.failures ?? [],
  // A module-scope premise throws during COLLECTION, so its message arrives
  // here and never in an assertion's failureMessages (spec section 2.9).
  fileMessage: o.fileMessage ?? "",
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

  it("a module-scope premise failure is the VERDICT, not the advisory", () => {
    // spec section 2.9: premise() before any registration throws during
    // collection, so the report carries ZERO test cases and the sentinel sits
    // at FILE level. Testing emptiness first would report this as a block
    // that produced no test case, and would
    // suppress the one verdict this arm exists to emit.
    expect(
      only(results(file({ fileStatus: "failed", statuses: [], fileMessage: PREMISE }))),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
  });

  it("the advisory means the report carries NO TEST CASE, and nothing else", () => {
    // empty entry list AND no sentinel anywhere: the report's own statement
    // that no test case existed (unresolvable import, transform error, no
    // suite, outside-the-globs trap)
    expect(
      only(results(file({ fileStatus: "failed", statuses: [], fileMessage: "Transform failed with 1 error" }))),
    ).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
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
    const plan = [1, 2, 3, 4, 5].map(entry);
    const map = new Map<number, unknown>([
      [1, file({ fileStatus: "failed", statuses: ["failed"], failures: [PREMISE] })],
      [2, file({ fileStatus: "failed", statuses: [] })],
      [3, file({ statuses: ["passed"] })],
      [5, file({ fileStatus: "failed", statuses: [], fileMessage: PREMISE })],
      // line 4 deliberately absent from the report
    ]);
    const out = synthesizeFixtureFindings(plan, { files: map } as never);
    expect(out.map((f) => `${f.docLine}:${f.code}`)).toEqual([
      "1:FIXTURE_UNSATISFIABLE",
      "2:FIXTURE_PROBE_UNVERIFIED",
      "4:FIXTURE_PROBE_UNVERIFIED",
      "5:FIXTURE_UNSATISFIABLE",
    ]);
    // line 3 ran without a premise failure, so the arm says nothing about it
    expect(out.some((f) => f.docLine === 3)).toBe(false);
  });

  it("the verdict names every premise description it observed", () => {
    // Projecting findings to codes lets a wrong or missing detail pass. The
    // detail IS the repair instruction here: which premise, on which fixture.
    const two = [
      "Error: premise not met: the live v2 matcher opened a block. ...",
      "Error: premise not met: the vocabulary contains RENTAL PICKUP. ...",
    ];
    const out = synthesizeFixtureFindings(
      [entry(5)],
      { files: new Map([[5, file({ fileStatus: "failed", statuses: ["failed", "failed"], failures: two })]]) } as never,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.detail).toContain("the live v2 matcher opened a block");
    expect(out[0]!.detail).toContain("the vocabulary contains RENTAL PICKUP");
  });

  it("the advisory names WHICH case it observed, so the reasons are distinguishable", () => {
    const reasonFor = (r: unknown) =>
      synthesizeFixtureFindings([entry(5)], r as never)[0]!.detail ?? "";
    const emptyEntries = reasonFor(results(file({ fileStatus: "failed", statuses: [] })));
    const absent = reasonFor({ files: new Map() });
    expect(emptyEntries).not.toBe("");
    expect(absent).not.toBe("");
    expect(emptyEntries).not.toBe(absent);
  });

  it("a null results map (static invocation) draws nothing", () => {
    expect(synthesizeFixtureFindings([entry(5)], null)).toEqual([]);
  });
});
```

## Task 5 — adapter: splice lifecycle, one vitest run, and the assertion-channel report map

<!-- task: red=`pnpm vitest run tests/specLint/fixtureAdapter.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:290` why=`scripts/spec-lint.ts:290 is inside the --exec-red branch, which today spawns red commands and collection probes only: there is no splice directory, no vitest invocation, no JSON read and no FixtureResults anywhere in the adapter, so a test injecting the adapter deps has nothing to observe and reds. It greens when the adapter implements spec 4.2 steps 1-4 and hands runLint a FixtureResults built from the report` ac=AC-5 -->

Implement spec §4.2 in `scripts/spec-lint.ts` — the ADAPTER, per the spec §5 boundary. The lifecycle, the spawn, the filesystem and the JSON parse all live there; `FixtureOutcome` / `FixtureResults` are declared in `lib/specLint/types.ts`; `lib/specLint/run.ts` carries the map core-ward exactly as it already does for `ExecResults`, `ParseResults` and `ProbeResults`; and `synthesizeFixtureFindings` (Task 4) stays pure. **No side-effecting function is exported from the fixture core module** — the core derives the splice plan and classifies outcomes, and nothing else.

This task forwards the ASSERTION channel only. The file-level message channel is Task 6, and that split is deliberate: it is the exact gap spec §2.9 measured, and an adapter carrying only assertion failures passes every pure test in Task 4 while losing the module-scope sentinel entirely.

**What is red and why:** the adapter has no fixture code path at all, so nothing constructs a `FixtureResults` for `runLint` to pass through.

**Failure modes caught:** a directory surviving a thrown exception, a timeout, or a signal; more than one vitest invocation per doc (spec §1.1 item 6); a spawn happening despite a pre-existing directory — proved by a spy recording ZERO calls, a fence stated before any observation; spliced filenames that do not carry the marker line or the collectable suffix, which would silently break the per-file mapping the whole arm rests on; and an unreadable report read as an empty one.

```ts
import { describe, it, expect } from "vitest";
import { runFixtureSplice } from "@/scripts/spec-lint";

const harness = (opts: { dirExists?: boolean; runOutcome?: "throw" | "timeout" | "signal" | "badjson" } = {}) => {
  const calls: string[] = [];
  const dirs = new Set<string>(opts.dirExists ? ["PRESET"] : []);
  return {
    calls,
    dirs,
    deps: {
      exists: (d: string) => dirs.has(d) || dirs.has("PRESET"),
      mkdir: (d: string) => { dirs.add(d); calls.push(`mkdir:${d}`); },
      write: (path: string) => calls.push(`write:${path}`),
      rm: (d: string) => { dirs.delete(d); calls.push(`rm:${d}`); },
      run: (cmd: string) => {
        calls.push(`run:${cmd}`);
        if (opts.runOutcome === "throw") throw new Error("boom");
        if (opts.runOutcome === "timeout") return { kind: "timeout" as const };
        if (opts.runOutcome === "signal") return { kind: "signal" as const, signal: "SIGKILL" };
        if (opts.runOutcome === "badjson") return { kind: "exit" as const, code: 1, report: "{not json" };
        // A report with a REAL assertion carrying a REAL failure message: the
        // channel this task exists to forward. An earlier version returned
        // testResults: [] everywhere, so a lifecycle-only implementation that
        // never read assertionResults or failureMessages passed every case
        // (plan review r2 probe).
        return {
          kind: "exit" as const,
          code: 1,
          report: JSON.stringify({
            testResults: [
              {
                name: "/abs/tests/.spec-lint-fixtures-1-1/fixture-3.test.ts",
                status: "failed",
                message: "",
                assertionResults: [
                  { status: "failed", title: "t0", failureMessages: ["Error: premise not met: the header opens a block. ..."] },
                ],
              },
            ],
          }),
        };
      },
    },
  };
};
const plan = [{ line: 3, block: "// b" }];

describe("splice lifecycle (spec section 4.2)", () => {
  it("a pre-existing directory spawns NOTHING and declines every block", () => {
    const h = harness({ dirExists: true });
    const out = runFixtureSplice(plan, h.deps as never);
    expect(h.calls.filter((c) => c.startsWith("run:"))).toEqual([]);
    expect(h.calls.filter((c) => c.startsWith("write:"))).toEqual([]);
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
  });

  it("exactly ONE vitest invocation per doc, whatever the block count", () => {
    const h = harness();
    runFixtureSplice([1, 2, 3].map((line) => ({ line, block: "// b" })), h.deps as never);
    expect(h.calls.filter((c) => c.startsWith("run:"))).toHaveLength(1);
    expect(h.calls.filter((c) => c.startsWith("write:"))).toHaveLength(3);
  });

  it("each spliced filename carries its marker line AND a collectable suffix", () => {
    const h = harness();
    runFixtureSplice([7, 42].map((line) => ({ line, block: "// b" })), h.deps as never);
    const written = h.calls.filter((c) => c.startsWith("write:")).map((c) => c.slice("write:".length));
    // The per-file mapping back to marker lines is the whole arm's spine
    // (spec section 2.3 measured per-file keying as exact), and the repo's
    // include glob is tests/**/*.test.ts (vitest.projects.ts:34) -- a name
    // missing either property silently unmaps or silently uncollects.
    expect(written).toHaveLength(2);
    expect(written[0]).toMatch(/(^|\D)7\D[^/]*\.test\.ts$/);
    expect(written[1]).toMatch(/(^|\D)42\D[^/]*\.test\.ts$/);
  });

  it("the directory is removed on EVERY failure path, not just a thrown call", () => {
    for (const runOutcome of ["throw", "timeout", "signal", "badjson"] as const) {
      const h = harness({ runOutcome });
      runFixtureSplice(plan, h.deps as never);
      expect(h.calls.some((c) => c.startsWith("rm:"))).toBe(true);
      expect([...h.dirs]).toEqual([]);
    }
  });

  it("the ASSERTION channel is forwarded: a failure message reaches the core verbatim", () => {
    // The named production behavior of THIS task. Without a case that supplies
    // assertionResults and failureMessages, a lifecycle-only implementation
    // greens here and Task 6 then reds on two missing channels instead of the
    // one it names.
    const h = harness();
    const out = runFixtureSplice([{ line: 3, block: "// b" }], h.deps as never);
    const forwarded = out.results.files.get(3);
    expect(forwarded).toBeDefined();
    expect(forwarded!.failureMessages.join(" ")).toContain("premise not met: the header opens a block");
    // and the classification the core reaches on it
    expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_UNSATISFIABLE"]);
  });

  it("a run that produced no usable report declines, and never certifies", () => {
    for (const runOutcome of ["throw", "timeout", "signal", "badjson"] as const) {
      const h = harness({ runOutcome });
      const out = runFixtureSplice(plan, h.deps as never);
      expect(out.findings.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
      expect(out.findings[0]!.severity).toBe("advisory");
    }
  });
});
```

## Task 6 — the file-level message channel, proved end to end through the real CLI

<!-- task: red=`pnpm vitest run tests/specLint/fixtureCli.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:290` why=`after Task 5 the adapter forwards each assertion's failureMessages and nothing else, so a block whose premise fails at MODULE scope -- zero test cases, sentinel in the file-level message (spec 2.9) -- arrives at the core with no failure text and classifies as the advisory instead of the verdict. The new suite's module-scope case reds on exactly that missing field and greens when the adapter also forwards the report's file-level message` ac=AC-4,AC-5 -->

<!-- spec-lint: ignore — a file this task creates; the path is a forward declaration, not a citation of existing code -->
Create `tests/specLint/fixtureCli.test.ts` (a NEW file — this task does not extend the tracked `tests/specLint/cli.test.ts`, whose subject is the pre-existing CLI surface). Real subprocesses over trivial blocks only, no heavy phases. Extend the adapter to forward the report's FILE-level message alongside each assertion's failures.

Cases: a block whose premise fails inside a test → exit 1 with `FIXTURE_UNSATISFIABLE`; **a block whose premise fails at MODULE scope, before any test registers → exit 1 with `FIXTURE_UNSATISFIABLE` and NOT the advisory** (the red for this task); the §2.4 historical pair, the r4 two-column header drawing the verdict and the merged three-column header drawing no code at all; an unresolvable-import block → the advisory; a block whose `describe` is skipped → exit 0 with no `FIXTURE_` code; a pre-existing splice directory → the advisory with a spy asserting ZERO vitest spawns; and, after every case, an assertion that no `tests/.spec-lint-fixtures-*` directory survives.

**What is red and why:** the adapter built in Task 5 carries only the assertion channel, so the module-scope case cannot reach `FIXTURE_UNSATISFIABLE` no matter how correct the pure ladder is.

**Failure modes caught:** the pure ladder being right while the adapter hands it a differently-shaped report — the module-scope case is the sharpest instance in the arc, and it is unreachable from any pure test; the JSON reporter's field names drifting under a vitest upgrade; a splice directory surviving a real failing run.

## Task 7 — mutation enrolment, in both declarations, and the score

<!-- task: red=`pnpm vitest run tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`tests/mutation/source/expectedLedgerKinds.ts:24 is the EXPECTED_LEDGER_KINDS declaration, which declares the ledger-kind expectations keyed by surface id, and guardSurfaces.gates.test.ts:21 asserts that key set equals the registry id set. This task RED step adds the fixtureContract registry row alone, which makes those two sets differ and reds the gate on a real key-set mismatch. It greens when the matching expectedLedgerKinds row lands. Both declarations are deliberate (section 2): counting a list against itself proves nothing` ac=AC-7 -->

RED step: add the `fixtureContract` row to `tests/mutation/source/registry.ts` (shape copied from the `redContract` row at `tests/mutation/source/registry.ts:525`) and observe `guardSurfaces.gates.test.ts` red on the key-set mismatch. GREEN step: add the matching `fixtureContract` row to `tests/mutation/source/expectedLedgerKinds.ts` and observe the SAME command pass. Assert the registry row count moved 36 → 37 against the live file (§2).

Then run `pnpm heavy pnpm mutation:guards` in the FOREGROUND and state the score plus an empty unaccepted-survivor set in the round-1 diff brief. That run is a gate, not this task's red: an absent registry row means no `fixtureContract` case exists to fail, so `mutation:guards` cannot express this task's red — which is why the red is the key-set gate above.

**Failure modes caught:** enrolling in one declaration and not the other, which leaves the corpus-wide gate red for a reason unrelated to the surface's quality; deciding assertions placed outside the registered `suitePaths`, which buys zero score (the #831 lesson).

<!-- tasks: end -->

The two steps below are VERIFICATION GATES, not red-then-green cycles, so they sit outside the enrolled region deliberately (multi-region enrolment, `docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md`). Neither can carry an honest `red-state`: at their sequence position the implementation is complete, so any test they author passes the moment it is written, and a marker claiming otherwise would be the invalid-RED shape plan review round 1 and round 2 both flagged. Declaring them as gates is the accurate description, not an exemption from proof — each names the command that runs it and the output that must be pasted.

## Gate A — acceptance proofs that no task performs

<!-- spec-lint: ignore — a file this gate creates; the path is a forward declaration, not a citation of existing code -->
Create `tests/specLint/fixtureAcceptance.test.ts` for the acceptance properties the per-unit tasks do not reach. Each is a DERIVED COVER over a set walked from disk, never a sample:

- **AC-2 — no shipped code inspects an unenrolled block.** Walk every tracked plan (`git ls-files 'docs/superpowers/plans'`, `.md`) and assert that `checkFixtureContract` returns zero findings and `spliceFixturePlan` zero entries for all of them, because zero blocks carry a marker (spec §2.2). **Paired with a POSITIVE CONTROL in the same test:** one generated document that DOES carry a marker must produce exactly one splice entry. Without it the corpus assertion is absence used as proof of carriage — an arm that never fires at all, or one wired to nothing, satisfies every zero in the walk. The control is what makes the zeros mean "silent on unenrolled blocks" rather than "silent". The corpus supplies **216** files containing `from "vitest"`-shaped text, so the cover is the corpus itself rather than a constructed fence. Then, ON TOP of that cover, one generated document whose UNENROLLED `ts` fence contains marker-shaped lines, `premise not met:` text and every code name, asserting the same two zeros — the adversarial-content case the corpus does not happen to contain. The failure mode: an implementation keying on fence CONTENT rather than on enrolment. Note what makes this structural rather than sampled — the file set is derived by walking the repo, so a plan added tomorrow is covered without editing this test.
- **AC-6 — corpus relints byte-identical.** The same walk asserts no `FIXTURE_` code appears in any tracked plan's report, and rests on the same positive control: the zeros are only evidence because the control proves the arm fires when a marker is present.
- **AC-7 — purity and the untouched parser.** The recursive purity meta-test passes for the new module, and `git diff --exit-code 7d09a1f0b -- lib/specLint/parse.ts` exits 0. It is diffed against the BASE SHA rather than the index or `HEAD~`, so it still catches a modification the implementing task has already committed — a plain working-tree diff would pass the moment the change is committed. The spec forbids modifying that file (§5) and nothing else in this plan checks it.

Command: `pnpm vitest run tests/specLint/fixtureAcceptance.test.ts`, output pasted into the PR body.

## Gate B — wiring, docs, and ledger closeout

**Remove the forward-declaration waivers whose reason has expired.** This document carries `<!-- spec-lint: ignore -->` waivers on the paths it CREATES, valid only while those files are untracked. Once Task 1, Task 6 and Gate A track them, each waiver stops suppressing a forward declaration and starts masking any real citation defect at that line — the denylist-that-outlives-its-override shape. Delete each waiver as its file lands, and confirm the lint still exits 0 hard WITHOUT it, which is the only proof the waiver was load-bearing for nothing.

**Re-point the four path-only `red-target=` values.** Tasks 1, 3, 4 and Gate A name the fixture core module as a bare path, which `targetProblem` accepts only while the file is UNTRACKED (`lib/specLint/redContract.ts`, the path-only branch). Task 1 tracks it, so from that moment those four markers draw `RED_TARGET_INVALID` and the `0 hard` promise below is unsatisfiable — plan review round 2 probed exactly this. Update each to cite the defective line in the now-tracked module, which is also the more useful citation. This step runs BEFORE the lint gate below, and `git check-ignore -v tests/.spec-lint-fixtures-1-1/probe.test.ts` (exit 1 at plan time, exit 0 once the ignore entry lands) is the observable red-then-green for the ignore work itself.

`.gitignore` entry for `tests/.spec-lint-fixtures-*/` written with `printf '\n%s\n'` and verified by `git check-ignore -v`; one sentence in `docs/agents/writing-plans.md` under the premise bullet; a `docs/superpowers/specs/README.md` row; archive the ledger row and strip its IN PROGRESS marker in the PR's LAST commit (invariant 12).

Closeout gates, each run and its output pasted into the PR body: `pnpm spec:lint` over BOTH this plan and its spec, each exiting 0 hard (AC-8); and the §3.2 ordinal sweep returning no match outside spec §4.3.


## 5. Acceptance criteria (spec §10, mapped to the task that PROVES it)

Every row names a task step that executes the proof. A row whose only home was this table was the round-1 finding this mapping exists to prevent.

| AC | proved by |
| --- | --- |
| AC-1 marker grammar and three static codes, detail included | 1 (grammar suite, incl. the `FIXTURE_UNATTACHED` detail case), 2 (wired through `runLint`) |
| AC-2 no shipped code inspects an unenrolled block | **Gate A** — a DERIVED COVER: the walked tracked-plan corpus (216 files carrying vitest-shaped text) yields zero findings and zero splice entries, plus a generated adversarial-content fence, plus a POSITIVE CONTROL proving the arm fires on an enrolled marker (without it the zeros prove only that the arm is silent) |
| AC-3 ladder total; no certificate on any proxy | 4 (every branch, the six retired-proxy `toEqual([])` cases, and the two detail cases) |
| AC-4 historical pair; §2.5-§2.9 shapes | 4 (pure), 6 (both historical headers end to end through the real CLI) |
| AC-5 pre-existing dir spawns nothing; dir never survives; filenames map back | 5 (spy asserts zero calls; removal on throw, timeout, signal and unreadable JSON; filename line + suffix), 6 (real filesystem) |
| AC-6 corpus relints byte-identical | **8** — walks `git ls-files 'docs/superpowers/plans'` and asserts no `FIXTURE_` code, derived from the corpus rather than a pinned list |
| AC-7 purity, `parse.ts` unmodified, mutation score | **Gate A** (purity meta-test + `git diff --exit-code` on `parse.ts`), **Task 7** (both enrolment declarations, then the score) |
| AC-8 spec and plan lint clean | **Gate B** — expired forward-declaration waivers deleted and the four path-only `red-target=` values re-pointed at their now-tracked lines FIRST, then `pnpm spec:lint` over BOTH documents, output pasted |

## 6. Checklist

- [ ] Task 1-9 in order, TDD per task, one commit each
- [ ] Self-review (this document, against `docs/agents/writing-plans.md`)
- [ ] Adversarial review (cross-model) to APPROVE
- [ ] Execution handoff
