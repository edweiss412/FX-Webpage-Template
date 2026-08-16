# psql Scan Survivor Disposition + Mutation Enrolment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disposition all 31 unaccepted mutation survivors of `tests/cross-cutting/psqlStartupFiles/scan.ts` per the spec's §2 rules, then enrol the surface in the source-mutation registry at the achieved floor with an empty unaccepted-survivor set.

**Architecture:** Four disposition batches ordered by pipeline layer (tokenizer/comment infra → shell text scanner → prose-vs-command heuristic → JS/workflow scanners), each verdict proven per-mutant with a single-mutant runner before the batch commits; enrolment lands last, after every id-moving edit, and is accepted by the full machine-computed gate.

**Tech Stack:** vitest, TypeScript, the in-repo source-mutation harness (`tests/mutation/source/*`), tsx.

**Spec:** `docs/superpowers/specs/ci/2026-08-16-psql-scan-mutation-enrolment-design.md` — read it in full first; §2 (disposition rules), §3 (enrolment mechanics), §4 (verification) are the contract every task below argues from.

## Global Constraints

- Worktree-only work (AGENTS.md invariant 11); TDD per task (invariant 1); commit per task, conventional-commits (invariant 6).
- Spec §1.1 is binding: symbolic enrolment REJECTED; operator subset ratified as `relational-boundary` + `regex-quantifier-bound`; convergence criterion = mutation score + empty unaccepted-survivor set (machine-computed).
- Every full harness run is `pnpm heavy pnpm mutation:guards` — ALWAYS under `pnpm heavy` (AGENTS.md heavy-slot rule). Scoped vitest runs with an explicit file list stay unwrapped; the single-mutant checker (one scoped child suite) stays unwrapped.
- Canonical sequence (spec §3.4 + §4.3): **merge checkpoint → source fixes (none expected; §2.4 bar) → regenerate survivor ids → dispositions → enrolment → full-run acceptance.** Nothing that can move `scan.ts` line positions happens after ids are finalized.
- Kill-case shape (spec §2.1): exported-function verdict on constructed input, expected value derived from the real contract (psql option grammar / shell / YAML), case names its site id, single-mutant red proof recorded in the commit message.
- Equivalent-row reasons (spec §2.2): reachability/indistinguishability argument with citation; "hard to test" is banned. Accepted-gap (spec §2.3): expected count ZERO; each row needs a resolvable `BL-`/`DEF-` ref and a named class-sweep exception.
- Acceptance criteria are spec §8; task markers below cite them: AC-1 (every survivor gets exactly one disposition), AC-2 (every kill has a shaped case with a red proof), AC-3 (equivalent/accepted-gap rows meet the §2.2/§2.3 bars), AC-4 (registry row + both fail-by-default declarations land), AC-5 (full gate run passes), AC-6 (BACKLOG graduation).
- impeccable-gate: N/A — no UI surface.

**Meta-test inventory (writing-plans rule):** this plan EXTENDS `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` row) and `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` row), and enrols into the registry walked by `tests/mutation/_metaGuardSurfaceRegistry.test.ts` (static `validateSurface`; no per-surface declaration). No other registry applies: no Supabase call, no admin alert, no tile, no advisory lock.

**Survivor inventory (authored AND run — probe of 2026-08-16, tree `119895a7c`, spec §9 is the canonical copy):** 48 mutants, 17 killed, 31 survivors, 0 no-ops. The batches below partition the 31 exactly; the count reconciliation is 8 + 7 + 8 + 8 = 31.

**Mutation-family closure (writing-plans rule):** the operator families are fixed by the ratified registry row — `relational-boundary` and `regex-quantifier-bound` over `scan.ts`, 48 sites total. A reviewer-proposed NEW family is a registry change with its own numbers (spec §1.1), not a finding against this plan.

---

<!-- tasks: depth=3 red-contract -->

### Task 1: Merge checkpoint + survivor-id confirmation

**Files:**

- Modify: none tracked (merge commit only, if origin/main moved)
- Scratch (untracked, session scratchpad): the probe-survivors script from Task 1 Step 3

**Interfaces:**

- Produces: the FINAL 31-site id list all later tasks key on. If it differs from spec §9, the later tasks' site ids shift accordingly — the batch/function mapping stays, the line numbers move.

<!-- task: red=`git diff --quiet HEAD@{1} HEAD -- tests/cross-cutting/psqlStartupFiles/scan.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:528` why=`an upstream scan.ts edit invalidates positional site ids, so drift must be detected before any disposition work` ac=AC-1 -->

- [ ] **Step 1: Merge origin/main** (PR #807 lands `browserRegistry`/`browserMutate` rows in `tests/mutation/source/registry.ts`; a conflict there is mechanical — keep both sides' rows).

```bash
git fetch origin && git merge origin/main --no-edit
```

- [ ] **Step 2: Check whether `scan.ts` or the deciding suite moved** in the merge: `git diff --stat HEAD@{1} HEAD -- tests/cross-cutting/`. If neither changed, spec §9's ids stand — record that in the commit message and skip Step 3.
- [ ] **Step 3 (only if scan.ts changed): regenerate the survivor list** with the probe script below (exact content; absolute worktree path substituted), compare against spec §9, and use the NEW ids everywhere downstream. ~20 min under a heavy slot.

```ts
// <scratchpad>/probe-survivors.ts, regenerate scoped survivor list (untracked)
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

Run: `pnpm heavy pnpm exec tsx <scratchpad>/probe-survivors.ts`

- [ ] **Step 4: Commit** (merge commit and/or a `docs(plan):` note commit recording the id-list decision).

### Task 2: Single-mutant checker

**Files:**

- Scratch (untracked, session scratchpad): the single-mutant checker script, content in Step 1 (tooling, not diff surface)

**Interfaces:**

- Produces: `pnpm exec tsx <scratchpad>/single-mutant.ts <siteId>` → prints `{siteId, suiteExit, verdict}`; exit 0 iff the suite KILLED the mutant. Every kill proof in Tasks 3-6 uses this.
- Consumes: `enumerateSites`/`siteId` (`tests/mutation/source/operators.ts`), `applyMutant` (`tests/mutation/source/generate.ts`), `runControl` (`tests/mutation/source/runner.ts` — runs ONE hand-written mutant text against the surface's suites, returns the child exit code).

<!-- task: red=`pnpm exec tsx <scratchpad>/single-mutant.ts relational-boundary:528:47:>>>=` red-state=authored red-target=`tests/cross-cutting/psqlStartupFileSuppression.test.ts:104` why=`before any new suite case lands, every declared survivor must reproduce as SURVIVED (exit 1) through this checker — proving the checker discriminates before it is trusted for kill proofs` ac=AC-2 -->

- [ ] **Step 1: Write the checker** (exact content; substitute the absolute worktree path):

```ts
// <scratchpad>/single-mutant.ts, run ONE mutant by site id against the deciding suite
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

- [ ] **Step 2: Calibrate against a known KILLED site** — `relational-boundary:510:21:<><=` was KILLED in the §9 probe run. Run the checker; expect `verdict: "KILLED"`, exit 0. (~40 s per run.)
- [ ] **Step 3: Calibrate against a known survivor** — `relational-boundary:528:47:>>>=`. Expect `verdict: "SURVIVED"`, exit 1. A checker that cannot reproduce a declared survivor must not be trusted for kill proofs; stop and debug (most likely cause: wrong worktree path or a Task-1 id shift).
- [ ] **Step 4: Commit** a one-line `docs(plan):` note in the plan file's Task-2 checkbox (the script itself stays untracked).

### Task 3: Batch A — tokenizer + comment infrastructure (8 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts` (new cases)
- Possibly modify (ledger rows only, drafted for Task 7): none yet — equivalence/accepted-gap verdicts are RECORDED in a running disposition table kept in the commit message and land as registry ledger rows in Task 7.

**Interfaces:**

- Consumes: the Task-2 checker; spec §2 decision procedure.
- Produces: per-site verdicts for — `relational-boundary:528:47` (argv short-flag branch, `swallowIsUncertain` region), `586:35` / `586:50` / `587:17` (`jsCommentRangesPerLine` multiline record loop), `635:23` (`commentIndexPerLine`), `695:69` / `695:83` (`exemptionOnLines`), `761:25` (`matchBrace`).

<!-- task: red=`pnpm exec tsx <scratchpad>/single-mutant.ts relational-boundary:528:47:>>>=` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:528` why=`each batch-A kill case must flip this checker from SURVIVED to KILLED for its named site — the checker exits 1 today because the suite has no discriminating case` ac=AC-1,AC-2 -->

- [ ] **Step 1: Read each of the 8 sites in context** (the enclosing function, its callers, what the suite can observe through the exported API). Write the intended verdict + one-line argument per site into a scratch disposition table before touching the suite.
- [ ] **Step 2: KILL cases.** For every site where a discriminating input exists through an exported function, add a case in the suite's existing idiom. The 528:47 case is settled by spec §2.4 (probed at spec review): add to the `argvSuppressesStartupFiles` `test.each` table, next to the existing `[["dsn", "-X"], false]` row:

```ts
    // Bare `-` is positional (DBNAME), not a flag cluster: option parsing ends.
    // Kills relational-boundary:528:47:>>>= (token.length > 1 → >= 1).
    [["-", "-X"], false],
```

For the comment-range sites (`586`/`587`, `635`, `695`, `761`): the observable surface is the exemption marker mechanics — construct source-string fixtures (multi-line comments, comment-start columns at exact boundaries, brace matching at depth edges) and assert through `scanSource` / `collectPsqlUsage` verdicts (which exemption applies, which site is reported). Derive each expected value from the real comment/brace grammar, not from what `scan.ts` returns today. Each case's comment names the site id it kills.

- [ ] **Step 3: Prove each kill.** Case passes on the clean tree (`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`), THEN the checker reports KILLED for that site. Record each `{siteId → KILLED, case name}` pair.
- [ ] **Step 4: EQUIVALENT verdicts.** For any site where Step 1's reading shows no suite-visible input can distinguish (spec §2.2 bar — reachability/indistinguishability argument, citation to the guarded expression), draft the ledger row text NOW (goes into the registry in Task 7):

```ts
{
  siteId: "<operator:line:col:from>to>",
  kind: "equivalent",
  reason: "<domain restriction that makes the mutant invisible, with file+symbol citation>",
},
```

- [ ] **Step 5: Run the full deciding suite green; commit** with the batch's disposition table in the message: `test(cross-cutting): batch A survivor dispositions — <k> killed, <e> equivalent`.

### Task 4: Batch B — shell text scanner (7 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**

- Consumes: Task-2 checker.
- Produces: verdicts for `relational-boundary:1214:26`, `1223:22`, `1304:30`, `1314:19`, `1394:46` (`scanShellText` — tokenizer bounds, heredoc/quote state), `1568:22`, `1569:26` (`mapRawToLines` — raw/cooked line mapping).

<!-- task: red=`pnpm exec tsx <scratchpad>/single-mutant.ts relational-boundary:1214:26:>>>=` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1214` why=`the checker exits 1 (SURVIVED) for each batch-B site until a discriminating shell-fixture case lands; each kill flips it to exit 0` ac=AC-1,AC-2 -->

- [ ] **Step 1: Read the 7 sites** (same procedure as Task 3 Step 1). `scanShellText` verdicts are observable through `scanShellIndirection` / `collectPsqlUsage` on constructed shell strings; `mapRawToLines` through line numbers on reported sites in multi-line templates.
- [ ] **Step 2: KILL cases** — shell-string fixtures at the exact boundary each `<` vs `<=` / `>` vs `>=` guards (e.g. a token ending exactly at the buffer edge, a psql word at the first/last line of a template). Assert the reported site's line/verdict, deriving expected line numbers from the fixture's own layout. Name the site id per case.
- [ ] **Step 3: Prove each kill** (clean-tree pass + checker KILLED), record pairs.
- [ ] **Step 4: EQUIVALENT rows** for sites Step 1 shows are boundary-unreachable (e.g. a loop bound where the off-by-one index is always past the last token by construction) — spec §2.2 format.
- [ ] **Step 5: Suite green; commit** `test(cross-cutting): batch B survivor dispositions — <k> killed, <e> equivalent`.

### Task 5: Batch C — prose-vs-command heuristic (8 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**

- Consumes: Task-2 checker.
- Produces: verdicts for `relational-boundary:1754:12` / `1755:12` (`isStrongPrefixWord` index guards), `1771:16` / `1772:16` (same guards in `prefixIsCommandish`), `regex-quantifier-bound:1797:45` (backtick `commandShaped` flag regex `{1,2}`), `relational-boundary:1825:26` / `1827:49` (word-count / length bounds in the same region).

<!-- task: red=`pnpm exec tsx <scratchpad>/single-mutant.ts relational-boundary:1754:12:>>>=` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1754` why=`the four index-guard sites are the BACKLOG entry's plausibly-equivalent family — the checker documents SURVIVED today, and the task resolves each to a proven kill or a §2.2 equivalence row with the ?? "" argument` ac=AC-1,AC-3 -->

- [ ] **Step 1: The index-guard family (`1754`/`1755`/`1771`/`1772`).** Spec §2.2's worked example is the template: at the boundary index, `before[index - 1] ?? ""` yields `""`, `basename("")` is `""`, and `WRAPPERS.test("")` is `false` — the same result the short-circuit produced. Verify the argument PER SITE (the `index > 1` twins guard `before[index - 2]`; confirm the same collapse). If it holds, write four ledger rows sharing the argument shape, each citing its own guard (spec §2.4 family rule: shared argument, site-specific citation). If any site's collapse does NOT hold, construct the distinguishing prefix-word fixture and kill it instead.
- [ ] **Step 2: `1797:45` (`{1,2}` → `{1,3}`).** The mutant accepts `---x` as a flag-shaped word inside a backtick command-span head check. Determine whether any suite-visible verdict flips (a backtick span whose only flag-shaped word has three dashes, changing `commandShaped` and therefore the site's reported/suppressed status through `scanSource` on a constructed fixture). Kill if observable; else §2.2 row with the reachability argument (what feeds `before.slice(1)` and whether a `---` word can reach it).
- [ ] **Step 3: `1825:26` / `1827:49`** (`<=` → `<` on prose bounds — the 12-word cap and string-length bound named in the scanner's own comments). These are calibrated bounds with named counterexamples in the source comments; a fixture AT the boundary (exactly 12 words, exactly the length limit) flips the verdict under the mutant. Kill with boundary fixtures derived from the bound's stated value; the case comment cites the source comment's counterexample it re-pins.
- [ ] **Step 4: Prove kills; suite green; commit** `test(cross-cutting): batch C survivor dispositions — <k> killed, <e> equivalent`.

### Task 6: Batch D — JS / workflow / indirection scanners (8 survivors)

**Files:**

- Modify: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**

- Consumes: Task-2 checker.
- Produces: verdicts for `regex-quantifier-bound:2107:21` (`scanJsSource`), `relational-boundary:2155:54` / `2167:54`, `regex-quantifier-bound:2210:40` (`scanShellIndirection`), `relational-boundary:2455:31` (`resolveRunShells`), `2587:35`, `regex-quantifier-bound:2684:32`, `relational-boundary:2697:32` (`scanWorkflowSource`), `2788:48` (`bindsPsql`).

<!-- task: red=`pnpm exec tsx <scratchpad>/single-mutant.ts regex-quantifier-bound:2107:21:{1,2}>{1,3}` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2107` why=`each batch-D site survives today; the exported scanners (scanJsSource, scanShellIndirection, scanWorkflowSource) accept constructed source/YAML fixtures, so every kill is provable through a public verdict` ac=AC-1,AC-2 -->

- [ ] **Step 1: Read the 8 sites.** All four functions are exported and suite-imported already; fixtures are literal JS/shell/YAML strings.
- [ ] **Step 2: KILL cases** — per-site boundary fixtures: dash-count edges for the `{1,2}` quantifiers (a three-dash word where two is the grammar's max), scan-window edges for the `<` vs `<=` sites, and a `bindsPsql` fixture at the exact boundary its `>` guards. Expected values derive from the real grammar (YAML `run:` semantics, JS spawn-family argv shapes) — the suite's R3-R11 describe blocks are the idiom to extend.
- [ ] **Step 3: Prove kills; EQUIVALENT rows** where reading shows unreachability (spec §2.2).
- [ ] **Step 4: Suite green; commit** `test(cross-cutting): batch D survivor dispositions — <k> killed, <e> equivalent`.

### Task 7: Enrolment — registry row + both fail-by-default declarations

**Files:**

- Modify: `tests/mutation/source/registry.ts` (new `GuardSurface` row)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` row)
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` row)

**Interfaces:**

- Consumes: every ledger row drafted in Tasks 3-6; the final killed/equivalent counts.
- Produces: the enrolled surface the Task-8 gate run accepts.

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/_metaPremiseContract.test.ts:29` why=`adding the registry row WITHOUT the EXPECTED_ENV_TOUCHING declaration reds the premise-contract walk (fail-by-default on a newly enrolled suite) — observe that red after the registry edit, then green it with the declaration` ac=AC-4 -->

- [ ] **Step 1: Add the registry row** to `GUARD_SURFACES` (`tests/mutation/source/registry.ts`) — id `psqlStartupScan`; the first scoped-operator row:

```ts
  {
    // The psql startup-file scanner (2026-08-16 enrolment spec §3). SCOPED
    // operator subset, ratified in the 2026-08-15 local-harness spec §2.3:
    // the full six-operator set is 978 sites ≈ 11 h of per-mutant children
    // (statement-removal 324, integer-literal 258, equality-flip 196,
    // logical-connector 152, budget-excluded, with that probe as the reason);
    // this pair is 48 sites ≈ 20-30 min. A wider subset is a future registry
    // change carrying its own numbers.
    id: "psqlStartupScan",
    sourcePath: "tests/cross-cutting/psqlStartupFiles/scan.ts",
    suitePaths: ["tests/cross-cutting/psqlStartupFileSuppression.test.ts"],
    operators: ["relational-boundary", "regex-quantifier-bound"],
    scoreFloor: /* achieved score rounded DOWN to 2dp, set in Task 8 Step 3 */ 0.99,
    // `--no-psqlrc` recognition: the suite pins [["--no-psqlrc"], true]
    // directly, so a flipped verdict is unmissable. Anchor verified unique.
    control: {
      from: 'if (name === "--no-psqlrc") return true;',
      to: 'if (name === "--no-psqlrc") return false;',
    },
    accepted: [
      /* every equivalent/accepted-gap row drafted in Tasks 3-6, verbatim */
    ],
  },
```

Verify the control anchor is still unique before committing: `grep -c 'if (name === "--no-psqlrc") return true;' tests/cross-cutting/psqlStartupFiles/scan.ts` must print 1.

- [ ] **Step 2: Observe the authored red** — `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` now FAILS: the premise contract walks enrolled suites and the deciding suite has no `EXPECTED_ENV_TOUCHING` row.
- [ ] **Step 3: Add both declarations.** In `tests/mutation/_metaPremiseContract.test.ts`:

```ts
  // The psql startup-file scanner's deciding suite, enrolled 2026-08-16. It
  // declares 0 honestly: every case drives literal fixtures through the
  // exported scanners; the walk/execFileSync surfaces are reached only through
  // the module under test, not ENVIRONMENT_SOURCES directly (probed via
  // classifyTests at spec time: 306 declarations, all environment-free).
  "tests/cross-cutting/psqlStartupFileSuppression.test.ts": 0,
```

(If Tasks 3-6 added cases that the classifier counts as environment-touching, the probe number moved — re-run `classifyTests` and declare the TRUE count with the same honesty rule.)

In `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS`):

```ts
  // psqlStartupScan: <e> equivalence arguments from the 2026-08-16 disposition
  // arc (see the registry rows for the per-site reasons). <"accepted-gap: n" or
  // 'No accepted-gap'>, a new row here later is a coverage regression to
  // explain, not a number to bump.
  psqlStartupScan: { equivalent: <e> /* , "accepted-gap": <g> only if g > 0 */ },
```

(The reducer omits kinds with no rows — declare ONLY kinds that exist, matching the `ledgerGit` comment's convention.)

- [ ] **Step 4: Green the static suites** — the Step-2 command now passes. Also run the deciding suite once more, green.
- [ ] **Step 5: Commit** `test(mutation): enrol psqlStartupScan — scoped operator pair, <e> equivalents, both fail-by-default declarations`.

### Task 8: Full-run acceptance + scoreFloor finalization

**Files:**

- Modify: `tests/mutation/source/registry.ts` (scoreFloor literal only)

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:152` why=`the gate is the machine-computed acceptance — it reds on any unaccepted survivor, stale row, kind-count mismatch, unkilled control, or below-floor score; a first run may legitimately red on a verdict Tasks 3-6 got wrong, and that red routes back to the owning batch task` ac=AC-5 -->

- [ ] **Step 1: Full gate run** — `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards`. Runs EVERY enrolled surface (registry array count at execution time) plus `psqlStartupScan`; budget one full run plus one contingency re-run.
- [ ] **Step 2: If the psqlStartupScan block reds** — read the failing condition name (the gate names all nine: `no-op`, `baseline`, `unaccepted-survivor`, `stale-ledger-row`, `below-floor`, `no-mutants`, `non-finite-score`, `unaccounted-mutants`, `duplicate-survivor`): an `unaccepted-survivor` means a Task 3-6 verdict is missing or a kill case does not actually kill (re-prove with the checker); a `stale-ledger-row` means an id drifted (a post-finalization scan.ts edit happened — re-run the Task-1 probe and re-key). Fix in the owning task's terms, re-run.
- [ ] **Step 3: Set `scoreFloor` to the achieved score rounded DOWN to two decimals** (spec §3.3): with zero accepted-gap rows the achieved score is 1.0 and the floor is exactly `1`; each accepted-gap row lowers it per `score()` (`tests/mutation/source/ledger.ts`). Take the achieved value from the gate run's own reported score.
- [ ] **Step 4: Re-run the two static suites** (registry meta + premise contract) green after the floor edit.
- [ ] **Step 5: Commit** `test(mutation): psqlStartupScan floor at achieved <value> — gate green, empty unaccepted set`.

### Task 9: Graduation + closeout

**Files:**

- Modify: `BACKLOG.md` (remove entry), `BACKLOG-archive.md` (add archived entry + reconciliation-log segment)

<!-- task: red=`pnpm vitest run tests/docs/` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:1` why=`the docs meta-suites (ledger referential integrity, in-progress markers, review-round economy) red on a malformed graduation — an archive entry that drops the id, a stale in-progress marker, or a missing round filing — and pass only when the graduation is shaped right` ac=AC-6 -->

- [ ] **Step 1: Graduate the entry** — move `BL-PSQL-SCAN-MUTATION-ENROLMENT` from `BACKLOG.md` to `BACKLOG-archive.md` wholesale, appending the terminal state: achieved score, kill/equivalent/accepted-gap counts, the enrolled floor, and any corrections to the entry's own starters (528:47 was a coverage gap with the original CORRECT — spec review R2 probe — not a source defect; the 1754 family resolution). Add the reconciliation-log segment at the top of `BACKLOG.md` per the file's convention. **Keep the `IN PROGRESS` marker OFF the archived entry** (archives categorically reject in-flight entries — the marker comes off in this same commit, which must be the PR's LAST commit per invariant 12).
- [ ] **Step 2: Review-round economy check** — count this arc's counted rounds per stage in `docs/review-rounds/test/psql-scan-mutation-enrolment/`; at 4+ rounds on any stage a filing markdown is owed (spec stage closed at 3; diff-stage rounds are this session's to count). `pnpm vitest run tests/docs/` green.
- [ ] **Step 3: spec:lint the spec + this plan**, both clean of hard findings.
- [ ] **Step 4: Commit** `docs(backlog): graduate BL-PSQL-SCAN-MUTATION-ENROLMENT — scanner enrolled at <floor>, <k>/31 survivors killed`.

<!-- tasks: end -->

---

## Verification ladder (cheap → expensive)

1. Per-case: deciding suite scoped run (~40 s), unwrapped.
2. Per-verdict: single-mutant checker (~40 s), unwrapped.
3. Per-arc: `pnpm heavy pnpm mutation:guards` full gate (Task 8; one run + one contingency budgeted).
4. CI: the nightly `mutation-harness.yml` job picks the surface up automatically (`--project mutation`); its 300-min ceiling absorbs the ≈ 35-45 min addition (spec §5). No workflow edit needed — the gate file is already wired.

## What this plan does NOT do

- No `scan.ts` source changes (spec §2.4 bar: a source fix requires an original-misbehaves probe; the only candidate was refuted at spec review R2).
- No operator-subset widening, no harness edits, no wall-clock ceiling work (spec §7).
- No new tracked tooling: the probe and checker live in the session scratchpad.

impeccable-gate: N/A — no UI surface
