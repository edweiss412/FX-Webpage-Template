# psql Scan Survivor Disposition + Mutation Enrolment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disposition all 31 unaccepted mutation survivors of `tests/cross-cutting/psqlStartupFiles/scan.ts` per the spec's §2 rules, then enrol the surface in the source-mutation registry at the achieved floor with an empty unaccepted-survivor set.

**Architecture:** One baseline task (merge checkpoint + single-mutant checker + survivor-id confirmation), four disposition batches ordered by pipeline layer, one enrolment-and-acceptance task, one graduation task. Every kill is proven per-mutant with the single-mutant checker before its batch commits; the registry row lands with its FINAL floor (computed from the disposition table) and the full machine gate then verifies exactly the committed state.

**Tech Stack:** vitest, TypeScript, the in-repo source-mutation harness (`tests/mutation/source/*`), tsx.

**Spec:** `docs/superpowers/specs/ci/2026-08-16-psql-scan-mutation-enrolment-design.md` — read it in full first; §2 (disposition rules), §3 (enrolment mechanics), §4 (verification) are the contract every task below argues from.

## Global Constraints

- Worktree-only work (AGENTS.md invariant 11); TDD per task (invariant 1); commit per task, conventional-commits (invariant 6).
- Spec §1.1 is binding: symbolic enrolment REJECTED; operator subset ratified as `relational-boundary` + `regex-quantifier-bound`; convergence criterion = mutation score + empty unaccepted-survivor set (machine-computed).
- Every full harness run is `pnpm heavy pnpm mutation:guards` — ALWAYS under `pnpm heavy` (AGENTS.md heavy-slot rule). Scoped vitest runs with an explicit file list stay unwrapped; the single-mutant checker (one scoped child suite) stays unwrapped.
- **Shell quoting:** survivor site ids contain `<` and `>` (`relational-boundary:528:47:>>>=`), which zsh parses as redirections. EVERY command that passes a site id single-quotes it: `pnpm exec tsx single-mutant.ts 'relational-boundary:528:47:>>>='`. This applies to every checker invocation in every task.
- Canonical sequence (spec §3.4 + §4.3): **merge checkpoint → source fixes (none expected; §2.4 bar) → finalize survivor ids → dispositions → enrolment → full-run acceptance.** Nothing that can move `scan.ts` line positions happens after ids are finalized. **Mid-arc restart protocol (the §2.4 contingency):** if a batch task uncovers original-misbehaves scanner behavior (spec §2.4 bar: a probe showing the ORIGINAL returns a wrong verdict), STOP batch work; land the source fix with its test; re-run the survivor probe (Task 1 Step 4); re-key every already-drafted ledger row and re-prove every already-landed kill against the new ids (kill cases survive by content — only checker site ids change); then resume. The gate's `stale-ledger-row` + `unaccepted-survivor` conditions make skipping this loud, not silent.
- Kill-case shape (spec §2.1): exported-function verdict on constructed input, expected value derived from the real contract (psql option grammar / shell / YAML), case names its site id, single-mutant red proof recorded in the commit message.
- **Batch case placement:** each batch's new cases live in one `describe("enrolment survivors - batch <X>", ...)` block in the deciding suite. When a batch blesses an equivalence family, the block ALSO carries at least one boundary-pin case asserting the ORIGINAL behavior the equivalence argument rests on (e.g. the `""` collapse at index 0) — a real regression pin.
- **Batch marker anchoring (plan review R2):** each batch task's `red=` is the single-mutant checker on that batch's DESIGNATED kill site — a site the plan's analysis expects to kill. The red is the checker's observed `SURVIVED` (exit 1: the deciding suite does not discriminate the mutant — a real coverage defect of the production surface, not a task-local artifact); the same command greens (`KILLED`, exit 0) when the batch's case lands. Two documented contingencies: (a) if the batch's Step-1 analysis blesses the designated site as EQUIVALENT, re-anchor the marker to a site the batch DID kill — edit this plan file's marker in the batch's own commit, recording why in the commit message; (b) if a batch kills NOTHING (every site equivalent — expected for none of the four), delete that batch's ENTIRE task section from this plan (heading, marker, and steps together — a task without a marker reds `spec:lint`'s task contract, so the marker never outlives its task; plan review R3 F1) in that same commit, and record the batch's dispositions in the commit message and the Task-6 ledger, whose enrolment cycle proves them machine-wise (`stale-ledger-row`/`unaccepted-survivor`).
- Equivalent-row reasons (spec §2.2): reachability/indistinguishability argument with citation; "hard to test" is banned. Accepted-gap (spec §2.3): expected count ZERO; each row needs a resolvable `BL-`/`DEF-` ref and a named class-sweep exception.
- Acceptance criteria are spec §8; task markers below cite them: AC-1 (every survivor gets exactly one disposition), AC-2 (every kill has a shaped case with a red proof), AC-3 (equivalent/accepted-gap rows meet the §2.2/§2.3 bars), AC-4 (registry row + both fail-by-default declarations land), AC-5 (full gate run passes), AC-6 (BACKLOG graduation).
- impeccable-gate: N/A — no UI surface.

**Meta-test inventory (writing-plans rule):** this plan EXTENDS `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` row) and `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` row), and enrols into the registry walked by `tests/mutation/_metaGuardSurfaceRegistry.test.ts` (static `validateSurface`; no per-surface declaration). No other registry applies: no Supabase call, no admin alert, no tile, no advisory lock.

**Survivor inventory (authored AND run — probe of 2026-08-16, tree `119895a7c`, spec §9 is the canonical copy):** 48 mutants, 17 killed, 31 survivors, 0 no-ops. The batches below partition the 31 exactly once; the count reconciliation is 8 + 7 + 7 + 9 = 31.

**Mutation-family closure (writing-plans rule):** the operator families are fixed by the ratified registry row — `relational-boundary` and `regex-quantifier-bound` over `scan.ts`, 48 sites total. A reviewer-proposed NEW family is a registry change with its own numbers (spec §1.1), not a finding against this plan.

---

### Task 1 (setup, outside the checked task region): Baseline — merge checkpoint, single-mutant checker, survivor-id finalization

**Files:**

- Modify: none tracked (merge commit only, if origin/main moved)
- Scratch (untracked, session scratchpad): the single-mutant checker and the survivor-probe script, contents below

**Interfaces:**

- Produces: (a) `pnpm exec tsx single-mutant.ts '<siteId>'` — prints `{siteId, suiteExit, verdict}`; exit 0 iff the deciding suite KILLED the mutant; every kill proof in Tasks 2-5 uses this. (b) The FINAL 31-site id list all later tasks key on.
- Consumes: `enumerateSites`/`siteId` (`tests/mutation/source/operators.ts`), `applyMutant` (`tests/mutation/source/generate.ts`), `runControl` (`tests/mutation/source/runner.ts` — runs ONE hand-written mutant text against the surface's suites, returns the child exit code), `runSurface` (`tests/mutation/source/runner.ts`).

- [x] **Step 1: Merge origin/main** (PR #807 lands `browserRegistry`/`browserMutate` rows in `tests/mutation/source/registry.ts`; a conflict there is mechanical — keep both sides' rows).

```bash
git fetch origin && git merge origin/main --no-edit
```

- [x] **Step 2: Write the checker** (exact content; substitute the absolute worktree path for `<WORKTREE>`):

```ts
// single-mutant.ts, run ONE mutant by site id against the deciding suite
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enumerateSites, siteId } from "<WORKTREE>/tests/mutation/source/operators";
import { applyMutant } from "<WORKTREE>/tests/mutation/source/generate";
import { runControl } from "<WORKTREE>/tests/mutation/source/runner";

const root = "<WORKTREE>";
const sourcePath = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const id = process.argv[2];
if (!id) {
  console.error("usage: single-mutant.ts <siteId>");
  process.exit(2);
}
const abs = resolve(root, sourcePath);
const text = readFileSync(abs, "utf8");
const surface = {
  id: "psqlStartupScanCheck",
  sourcePath,
  suitePaths: ["tests/cross-cutting/psqlStartupFileSuppression.test.ts"],
  operators: ["relational-boundary", "regex-quantifier-bound"] as const,
  scoreFloor: 0.01,
  control: { from: "__unused__", to: "__unused2__" },
  accepted: [],
};
const site = enumerateSites(abs, text, [...surface.operators]).find((s) => siteId(s) === id);
if (!site) {
  console.error(`no such site: ${id}`);
  process.exit(2);
}
const code = runControl(root, surface as never, applyMutant(text, site));
const verdict = code === 0 ? "SURVIVED" : "KILLED";
console.log(JSON.stringify({ siteId: id, suiteExit: code, verdict }));
process.exit(code === 0 ? 1 : 0);
```

- [x] **Step 3: Decide whether ids must regenerate.** `git diff --stat HEAD@{1} HEAD -- tests/cross-cutting/`. Re-run the survivor probe if EITHER `scan.ts` (ids move) OR the deciding suite (the kill/survive verdicts themselves can change — an upstream case can kill a former survivor without moving one line of source) changed in the merge. Probe script (untracked; same shape as the spec §9 run):

```ts
// probe-survivors.ts, regenerate scoped survivor list
import { runSurface } from "<WORKTREE>/tests/mutation/source/runner";
const surface = {
  id: "psqlStartupScanProbe",
  sourcePath: "tests/cross-cutting/psqlStartupFiles/scan.ts",
  suitePaths: ["tests/cross-cutting/psqlStartupFileSuppression.test.ts"],
  operators: ["relational-boundary", "regex-quantifier-bound"] as const,
  scoreFloor: 0.01,
  control: { from: "__unused__", to: "__unused2__" },
  accepted: [],
};
const run = runSurface("<WORKTREE>", surface as never);
console.log(JSON.stringify({ killed: run.killed, survivors: run.survivors }, null, 2));
```

Run: `pnpm heavy pnpm exec tsx probe-survivors.ts` (~20 min under a heavy slot). If neither file changed, spec §9's ids stand — record that in the commit message. If the list changed, the NEW list is canonical downstream (batch membership follows the enclosing function, not the stale line number).

- [x] **Step 4: Calibrate the checker in BOTH directions** — `pnpm exec tsx single-mutant.ts 'relational-boundary:510:21:<><='` prints `verdict: "KILLED"`, exit 0 (probe-KILLED site); `pnpm exec tsx single-mutant.ts 'relational-boundary:528:47:>>>='` prints `verdict: "SURVIVED"`, exit 1 (declared survivor). A checker that cannot reproduce both directions must not be trusted for kill proofs; stop and debug (most likely: wrong worktree path, or a Step-3 id shift).
- [x] **Step 5: Commit** (merge commit and/or a `docs(plan):` note commit recording the id-list decision and both calibration outputs).

<!-- tasks: depth=3 red-contract -->

### Task 2: Batch A — tokenizer + comment infrastructure (8 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts` (new `describe("enrolment survivors - batch A")` block)

**Interfaces:**

- Consumes: the Task-1 checker; spec §2 decision procedure.
- Produces: verdicts for — `relational-boundary:528:47` (argv short-flag branch), `586:35` / `586:50` / `587:17` (`jsCommentRangesPerLine` multiline record loop), `635:23` (`commentIndexPerLine`), `695:69` / `695:83` (`exemptionOnLines`), `761:25` (`matchBrace`). Ledger-row drafts for any equivalents (land in Task 6).

<!-- task: red=`pnpm exec tsx single-mutant.ts 'relational-boundary:528:47:>>>='` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:528` why=`red observed as the checker's SURVIVED exit 1 - the deciding suite does not yet discriminate this mutant, the designated batch-A kill ratified at spec review R2; the same command exits 0 (KILLED) once the [["-", "-X"], false] case lands` ac=AC-1,AC-2 -->

- [x] **Step 1: Read each of the 8 sites in context** (the enclosing function, its callers, what the suite can observe through the exported API). Write the intended verdict + one-line argument per site into a scratch disposition table before touching the suite.
- [x] **Step 2: KILL cases** inside `describe("enrolment survivors - batch A", ...)`. The 528:47 case is settled by spec §2.4 (probed at spec review): a row in the `argvSuppressesStartupFiles` idiom:

```ts
    // Bare `-` is positional (DBNAME), not a flag cluster: option parsing ends.
    // Kills relational-boundary:528:47 (token.length > 1 mutated to >= 1).
    [["-", "-X"], false],
```

For the comment-range sites (`586`/`587`, `635`, `695`, `761`): the observable surface is the exemption-marker mechanics — construct source-string fixtures (multi-line comments, comment-start columns at exact boundaries, brace matching at depth edges) and assert through `scanSource` / `collectPsqlUsage` verdicts (which exemption applies, which site is reported). Derive each expected value from the real comment/brace grammar, not from what `scan.ts` returns today. Each case's comment names the site id it kills.

- [x] **Step 3: Prove each kill.** Case passes on the clean tree (`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`), THEN the checker reports KILLED for that site (site id single-quoted). Record each `{siteId → KILLED, case name}` pair.
- [x] **Step 4: EQUIVALENT verdicts** (spec §2.2 bar) — draft the ledger row text now; it lands in the registry in Task 6:

```ts
{
  siteId: "<the site id>",
  kind: "equivalent",
  reason: "<domain restriction that makes the mutant invisible, with file+symbol citation>",
},
```

Add the family's boundary-pin case to the batch block (Global Constraints, batch case placement).

If a site survives the §2.3 bar as an ACCEPTED-GAP (expected: zero): file its `BL-` follow-up entry in `BACKLOG.md` IN THIS SAME batch commit — the entry names the §2.3 class-sweep exception ((a) or (c)) and what would close it — and the drafted ledger row's `ref` names that entry (spec §2.3: "its ref names the follow-up entry filed in the same PR"; the registry's `validateSurface` + `tests/docs/_metaLedgerReferentialIntegrity.test.ts` enforce shape and resolution).

- [x] **Step 5: Full deciding suite green; observe the marker's green** (the designated site's checker now exits 0); **commit** with the batch's disposition table in the message: `test(cross-cutting): batch A survivor dispositions - <k> killed, <e> equivalent`.

### Task 3: Batch B — shell text scanner (7 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts` (batch B block)

**Interfaces:**

- Consumes: Task-1 checker.
- Produces: verdicts for `relational-boundary:1214:26` / `1223:22` (pipeline splitter's `command.length > 0` push guards in `scanShellText` — the mutants admit EMPTY pipeline stages, shifting `followedBy` indexing that the bare-shell stdin detection reads), `1304:30` / `1314:19` (joined-string raw-offset mapping in the same function), `1394:46` (the `env -S` attached-script slice guard), `1568:22` / `1569:26` (`mapRawToLines` delimiter skip: `raw.length > 0` and `raw.length > i` opening/closing quote bounds).

<!-- task: red=`pnpm exec tsx single-mutant.ts 'relational-boundary:1214:26:>>>='` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1214` why=`red observed as the checker's SURVIVED exit 1 for the designated batch-B kill (the empty-pipeline-stage push guard); greens when the batch's pipeline fixture lands - re-anchor per the batch marker anchoring contingency if analysis blesses this site instead` ac=AC-1,AC-2 -->

- [ ] **Step 1: Read the 7 sites** (same procedure as Task 2 Step 1). `scanShellText` is not exported, but its verdicts flow through suite-imported exports: `scanShellIndirection` (shell fixtures), `scanSource` / `collectPsqlUsage` (template literals), and `scanWorkflowIndirection` (YAML `run:` bodies). Pick per site the export whose fixture most directly reaches the guarded branch — e.g. a pipeline fixture (`printf 'x' | bash`) for the 1214/1223 stage-splitting pair; a multi-fragment template for 1304/1314; an `env -S'psql ...'` fixture for 1394; a quoted/backticked string at the exact delimiter boundary for the 1568/1569 pair.
- [ ] **Step 2: KILL cases** — boundary fixtures at the exact `<` vs `<=` / `>` vs `>=` edge each site guards; assert the reported site's line/verdict, deriving expected line numbers from the fixture's own layout. Name the site id per case.
- [ ] **Step 3: Prove each kill** (clean-tree pass + checker KILLED, ids single-quoted), record pairs.
- [ ] **Step 4: EQUIVALENT rows** for sites Step 1 shows are boundary-unreachable, with boundary-pin cases per the placement rule; any ACCEPTED-GAP follows the batch-A Step-4 same-commit filing mechanics (`BL-` entry + ledger `ref`).
- [ ] **Step 5: Suite green; marker green (designated site KILLED); commit** `test(cross-cutting): batch B survivor dispositions - <k> killed, <e> equivalent`.

### Task 4: Batch C — prose-vs-command heuristic (7 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts` (batch C block)

**Interfaces:**

- Consumes: Task-1 checker.
- Produces: verdicts for `relational-boundary:1754:12` / `1755:12` (`isStrongPrefixWord` index guards), `1771:16` / `1772:16` (the same guard shape in `prefixIsCommandish`), `regex-quantifier-bound:1797:45` (backtick `commandShaped` flag regex `{1,2}`), `relational-boundary:1825:26` (`site.tokens.length <= 3` terse-command token cap), `1827:49` (`words <= 8` no-prefix word cap).

<!-- task: red=`pnpm exec tsx single-mutant.ts 'relational-boundary:1825:26:<=><'` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1825` why=`red observed as the checker's SURVIVED exit 1 for the designated batch-C kill (the tokens.length <= 3 terse-command cap, boundary fixture at exactly 3 tokens); greens when that case lands - re-anchor per the contingency if analysis blesses it instead` ac=AC-1,AC-3 -->

- [ ] **Step 1: The index-guard family (`1754`/`1755`/`1771`/`1772`).** Spec §2.2's worked example is the template: at the boundary index, `before[index - 1] ?? ""` yields `""`, `basename("")` is `""`, and `WRAPPERS.test("")` is false — the same result the short-circuit produced. Verify the argument PER SITE (the `index > 1` twins guard `before[index - 2]`; confirm the same collapse). If it holds, write four ledger rows sharing the argument shape, each citing its own guard (spec §2.4 family rule), plus one boundary-pin case in the batch block. If any site's collapse does NOT hold, construct the distinguishing prefix-word fixture and kill it instead.
- [ ] **Step 2: `1797:45` (`{1,2}` mutated to `{1,3}`).** The mutant accepts a three-dash word (`---x`) as flag-shaped inside the backtick `commandShaped` head check. Determine whether a `scanSource` fixture (a backtick span whose ONLY flag-shaped word has three dashes) flips the span's command-shaped status and therefore a reported verdict. Kill if observable; else §2.2 row with the reachability argument.
- [ ] **Step 3: The terse-command bounds — actual code (plan review R1 F5 correction):** `1825:26` is `site.tokens.length <= 3 &&` and `1827:49` is `(site.precedingWords.length === 0 ? words <= 8 : hasStrongPrefix)` in the `isTerseCommand` clause. Boundary kills: a FLAGLESS literal-string command with exactly 3 tokens and no preceding words in an outer text of at most 8 words currently certifies as a terse command (`psql "$DSN" mydb` shapes); under the `< 3` mutant a 3-token command stops certifying — assert the verdict flip through `scanSource` on the literal. Same construction at exactly 8 outer words for `1827:49` (under `< 8`, the 8-word text stops certifying). Derive both fixtures from the bounds' stated values in the source (the 12-word cap prose elsewhere in the file describes a DIFFERENT bound — do not conflate).
- [ ] **Step 4: Prove kills; EQUIVALENT rows with boundary pins; any ACCEPTED-GAP follows the batch-A Step-4 same-commit filing mechanics (`BL-` entry + ledger `ref`). Suite green; marker green (designated site KILLED); commit** `test(cross-cutting): batch C survivor dispositions - <k> killed, <e> equivalent`.

### Task 5: Batch D — indirection + workflow scanners (9 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts` (batch D block; MAY add imports of currently-unimported exports if a kill routes most naturally through one)

**Interfaces:**

- Consumes: Task-1 checker.
- Produces: verdicts for `regex-quantifier-bound:2107:21` (the `INTERPRETER_POSITIONAL_BINDING` regex's `-{1,2}` — consumed by `scanShellIndirection`, plan review R1 F6 correction), `relational-boundary:2155:54` / `2167:54` (the backslash-continuation `logical`/`spliced` join bounds in `scanShellIndirection`), `regex-quantifier-bound:2210:40` (binding-value flag regex `{1,2}` in the same function), `relational-boundary:2455:31` (`resolveRunShells` alias-resolution depth guard — PRIVATE; observable only through `scanWorkflowIndirection` on YAML with shell aliases), `2587:35` (aliased-args resolution depth guard), `regex-quantifier-bound:2684:32` (block-scalar header regex `[0-9+-]{0,2}`), `relational-boundary:2697:32` (alias `range[0]` anchor comparison), `2788:48` (`bindsPsql` — a FUNCTION-LOCAL helper of `scanWorkflowIndirection`; observable only through workflow `env:` binding fixtures).

<!-- task: red=`pnpm exec tsx single-mutant.ts 'regex-quantifier-bound:2107:21:{1,2}>{1,3}'` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2107` why=`red observed as the checker's SURVIVED exit 1 for the designated batch-D kill (the INTERPRETER_POSITIONAL_BINDING dash bound: a three-dash word must NOT read as an interpreter flag); greens when that fixture lands - re-anchor per the contingency if analysis blesses it instead` ac=AC-1,AC-2 -->

- [ ] **Step 1: Read the 9 sites.** Suite-imported observable surfaces (plan review R1 F6 correction): `scanShellIndirection` and `scanWorkflowIndirection` are ALREADY imported; `scanJsSource` and `scanWorkflowSource` are exported but NOT currently imported — importing one is permitted when it is the natural verdict surface for a site. `resolveRunShells` and `bindsPsql` are private/function-local: their sites are reachable ONLY through `scanWorkflowIndirection` fixtures (YAML aliases for 2455/2587/2697; `env:` psql bindings for 2788; block-scalar headers for 2684).
- [ ] **Step 2: KILL cases** — per-site boundary fixtures: dash-count edges for the `{1,2}` quantifiers (a three-dash word where the grammar's max is two), continuation-join edges for 2155/2167 (a backslash-newline glued word at the exact bound), alias-depth and anchor-position edges for the workflow sites, and an `env:` value at the exact boundary `bindsPsql`'s `>` guards. Expected values derive from the real grammar (YAML block-scalar headers, shell backslash-newline removal, workflow `env:` semantics) — the suite's R3-R11 describe blocks are the idiom to extend.
- [ ] **Step 3: Prove kills; EQUIVALENT rows** where reading shows unreachability, with boundary pins; any ACCEPTED-GAP follows the batch-A Step-4 same-commit filing mechanics (`BL-` entry + ledger `ref`).
- [ ] **Step 4: Suite green; marker green (designated site KILLED); commit** `test(cross-cutting): batch D survivor dispositions - <k> killed, <e> equivalent`.

### Task 6: Enrolment — registry row, both declarations, floor, full-gate acceptance

**Files:**

- Modify: `tests/mutation/source/registry.ts` (new `GuardSurface` row, FINAL floor)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` row)
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` row)

**Interfaces:**

- Consumes: every ledger row drafted in Tasks 2-5; the final killed/equivalent/accepted-gap counts.
- Produces: the enrolled, gate-green surface.

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/_metaPremiseContract.test.ts:29` why=`adding the registry row WITHOUT the EXPECTED_ENV_TOUCHING declaration reds the premise-contract walk (fail-by-default on a newly enrolled suite) - the red is observed at Step 2, after the registry edit and before the declarations, and the same command greens at Step 4` ac=AC-4,AC-5 -->

- [ ] **Step 1: Compute the FINAL floor from the disposition table** — no run needed: `score = killed / (killed + acceptedGaps)` with equivalents excluded (`tests/mutation/source/ledger.ts`, `score()`); killed = 17 probe-killed + Tasks 2-5 kills; rounded DOWN to two decimals (spec §3.3). With zero accepted-gap rows the floor is exactly `1`. Add the registry row to `GUARD_SURFACES` with this FINAL floor — the committed row is never provisional (plan review R1 F7):

```ts
  {
    // The psql startup-file scanner (2026-08-16 enrolment spec §3). SCOPED
    // operator subset, ratified in the 2026-08-15 local-harness spec §2.3:
    // the full six-operator set is 978 sites, about 11 h of per-mutant
    // children (statement-removal 324, integer-literal 258, equality-flip 196,
    // logical-connector 152 - budget-excluded, with that probe as the reason);
    // this pair is 48 sites, 20-30 min. A wider subset is a future registry
    // change carrying its own numbers.
    id: "psqlStartupScan",
    sourcePath: "tests/cross-cutting/psqlStartupFiles/scan.ts",
    suitePaths: ["tests/cross-cutting/psqlStartupFileSuppression.test.ts"],
    operators: ["relational-boundary", "regex-quantifier-bound"],
    scoreFloor: 1, // the Step-1 computed value; 1 exactly iff zero accepted-gap rows
    // `--no-psqlrc` recognition: the suite pins [["--no-psqlrc"], true]
    // directly, so a flipped verdict is unmissable. Anchor verified unique.
    control: {
      from: 'if (name === "--no-psqlrc") return true;',
      to: 'if (name === "--no-psqlrc") return false;',
    },
    accepted: [
      /* every equivalent/accepted-gap row drafted in Tasks 2-5, verbatim */
    ],
  },
```

Verify the control anchor is still unique: `grep -c 'if (name === "--no-psqlrc") return true;' tests/cross-cutting/psqlStartupFiles/scan.ts` prints 1. (Probed at plan review: `controlOccurrences: 1`, `validateSurface: []`.)

- [ ] **Step 2: Observe the marker's red** — `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` FAILS: the premise contract walks enrolled suites and the deciding suite has no `EXPECTED_ENV_TOUCHING` row.
- [ ] **Step 3: Add both declarations.** In `tests/mutation/_metaPremiseContract.test.ts` — re-run `classifyTests` first (Tasks 2-5 added cases; the spec-time probe said 306 declarations, all environment-free) and declare the TRUE count with the file's honesty rule:

```ts
  // The psql startup-file scanner's deciding suite, enrolled 2026-08-16. It
  // declares 0 honestly: every case drives literal fixtures through the
  // exported scanners; the walk/execFileSync surfaces are reached only through
  // the module under test, not ENVIRONMENT_SOURCES directly.
  "tests/cross-cutting/psqlStartupFileSuppression.test.ts": 0,
```

In `tests/mutation/guardSurfaces.gate.test.ts`, the `EXPECTED_LEDGER_KINDS` row's value object holds the Task 2-5 totals, declaring ONLY kinds that exist (the reducer omits kinds with no rows, matching the `ledgerGit` comment's convention). Illustrative shape with a stand-in count of 12, replaced by the real total:

```ts
  // psqlStartupScan: 12 equivalence arguments from the 2026-08-16 disposition
  // arc (see the registry rows for the per-site reasons). No accepted-gap: a
  // new row here later is a coverage regression to explain, not a number to
  // bump.
  psqlStartupScan: { equivalent: 12 },
```

- [ ] **Step 4: Observe the marker's green** — the Step-2 command passes. Run the deciding suite once more, green.
- [ ] **Step 5: Full-gate acceptance of the COMMITTED state** — `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards` (runs every registry row; ~35-45 min of it is this surface). This run exercises the FINAL floor, the final ledger, the control — the exact state that ships (plan review R1 F7). All nine `GateCondition` members must pass for `psqlStartupScan`. If it reds: `unaccepted-survivor` means a Task 2-5 verdict is missing or a kill does not kill (re-prove with the checker); `stale-ledger-row` means an id drifted (a post-finalization `scan.ts` edit — run the mid-arc restart protocol); `below-floor` means the Step-1 arithmetic disagrees with the machine (trust the machine; recompute and recommit). Budget one contingency re-run.
- [ ] **Step 6: Commit** `test(mutation): enrol psqlStartupScan - floor <value>, <e> equivalents, gate green`.

### Task 7: Graduation + closeout

**Files:**

- Modify: `BACKLOG.md` (remove entry + reconciliation-log segment), `BACKLOG-archive.md` (add archived entry)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:1` why=`the archive categorically rejects in-flight entries: moving the entry to BACKLOG-archive.md WITH its IN PROGRESS marker still on (Step 1) reds this suite; stripping the marker in the same edit session (Step 2) greens the same command - the observed cycle proves the marker actually came off` ac=AC-6 -->

- [ ] **Step 1: Move the entry and observe the red** — relocate `BL-PSQL-SCAN-MUTATION-ENROLMENT` from `BACKLOG.md` to `BACKLOG-archive.md` wholesale (marker still on), appending the terminal state: achieved score, kill/equivalent/accepted-gap counts, the enrolled floor, and corrections to the entry's own starters (528:47 was a coverage gap with the original CORRECT — spec review R2 probe — not a source defect; the 1754-family resolution). Run the marker's command: RED (archive holds an in-flight entry).
- [ ] **Step 2: Strip the `IN PROGRESS · Branch:` marker from the archived entry; add the reconciliation-log segment** at the top of `BACKLOG.md` per the file's convention. Marker command now GREEN. (Invariant 12: this graduation commit is the PR's LAST commit, so the marker never reaches main.)
- [ ] **Step 3: Review-round economy check** — count this arc's counted rounds per stage in `docs/review-rounds/test/psql-scan-mutation-enrolment/`; at 4+ counted rounds on any stage a filing markdown is owed (spec stage closed at 3 rounds; plan and diff stages count their own). `pnpm vitest run tests/docs/` green.
- [ ] **Step 4: spec:lint the spec + this plan**, both clean of hard findings.
- [ ] **Step 5: Commit** `docs(backlog): graduate BL-PSQL-SCAN-MUTATION-ENROLMENT - scanner enrolled at <floor>, <k>/31 survivors killed`.

<!-- tasks: end -->

---

## Verification ladder (cheap → expensive)

1. Per-case: deciding suite scoped run (~40 s), unwrapped.
2. Per-verdict: single-mutant checker (~40 s), unwrapped, site ids single-quoted.
3. Per-arc: `pnpm heavy pnpm mutation:guards` full gate (Task 6 Step 5; one run + one contingency budgeted, against the FINAL committed state).
4. CI: the nightly `mutation-harness.yml` job picks the surface up automatically (`--project mutation`); its 300-min ceiling absorbs the ≈ 35-45 min addition (spec §5). No workflow edit needed — the gate file is already wired.

## What this plan does NOT do

- No `scan.ts` source changes on the expected path (spec §2.4 bar: a source fix requires an original-misbehaves probe; the only candidate was refuted at spec review R2). If a batch task DOES meet the bar, the mid-arc restart protocol in Global Constraints governs.
- No operator-subset widening, no harness edits, no wall-clock ceiling work (spec §7).
- No new tracked tooling: the probe and checker live in the session scratchpad.

impeccable-gate: N/A — no UI surface
