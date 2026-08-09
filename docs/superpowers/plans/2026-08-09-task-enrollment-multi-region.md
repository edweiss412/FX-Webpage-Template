# Multi-Region Task Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ratified multi-region task-enrollment spec — a plan may declare any number of sequential `<!-- tasks: depth=N -->` regions, each with its own depth.

**Architecture:** `lib/specLint/taskContract.ts` pass 1 collects a `Region[]` list instead of a single region; an `OPEN` while a region is open is rejected loudly (retained code `TASK_ENROLL_DUPLICATE`, new message); pass 2 runs the existing task-selection/extent/marker rules per region over the combined extent list. No caller changes.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, existing spec-lint infrastructure.

**Spec (canonical):** `docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md` (RATIFIED at adversarial R4 APPROVE). Section references below (§2.2, §3, §5 AC-N, §6) are into that spec unless marked "origin" (`docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md`).

## Global Constraints

- Commit per task, conventional-commits: `feat(spec-lint):` / `test(spec-lint):` / `docs:` (established convention: `git log --oneline -- lib/specLint/`).
- TDD per task: failing test → minimal implementation → passing test → commit (AGENTS.md invariant 1).
- The surface is mutation-gated: `tests/mutation/source/registry.ts:153` (`id: "taskContract"`, suites `tests/specLint/taskContract.test.ts` + `tests/specLint/taskContractFindingOrder.test.ts`). AC-13: score must not regress, unaccepted-survivor set empty.
- The `codes()` suite helper returns codes **sorted alphabetically** (`tests/specLint/taskContract.test.ts:6-9`); the spec states arrays in **report order**. Translate when writing expectations — the two orders differ for `[TASK_MARKER_MISSING, TASK_ENROLL_DUPLICATE]` (report order) which `codes()` sees as `["TASK_ENROLL_DUPLICATE", "TASK_MARKER_MISSING"]`.
- No UI surface anywhere in this plan (invariant 8 marker in §12 below).
- Work happens in the existing worktree `/Users/ericweiss/FX-worktrees/task-enrollment-multi-region`, branch `feat/task-enrollment-multi-region` (invariant 11 already satisfied; ledger claim already pushed per invariant 12).

## Meta-test inventory (mandatory declaration)

This plan EXTENDS `tests/specLint/taskContract.test.ts` and rewrites one fixture in `tests/specLint/taskContractWiring.test.ts`. It creates no new meta-test. The registries named in `docs/agents/writing-plans.md` (Supabase call boundaries, sentinel hiding, admin-alert catalog, advisory locks, email normalization) do not apply: no auth, DB, admin, or tile surface is touched. The mutation registry (`tests/mutation/source/registry.ts`) already covers the surface; its `suitePaths` are unchanged because no new test file is created.

## File structure

- Modify: `lib/specLint/taskContract.ts` — pass 1 region collection, nested-open rejection, message change, header-comment rewrite; pass 2 per-region loop. Everything from marker cardinality down is untouched.
- Modify: `tests/specLint/taskContract.test.ts` — migrate the retired-semantics cases (derivation: every fixture holding more than one `OPEN` line — the sweep found M2, M27, M29-third-assertion; M36d is nested-shaped and stays), add the spec §5 cases.
- Modify: `tests/specLint/taskContractWiring.test.ts:76-90` — `TASK_ENROLL_DUPLICATE` catalog fixture becomes nested-open shaped.
- Untouched: `lib/specLint/run.ts`, `tests/specLint/taskContractFindingOrder.test.ts` (comparator unchanged), `tests/codexGuard/lintDoc.test.ts` (single-region fixture, probed unaffected — spec §6).
- Modify (docs): `docs/agents/spec-self-review.md`, `docs/superpowers/specs/README.md`, `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` (pointer lines), `BACKLOG.md` + `BACKLOG-archive.md`.

<!-- tasks: depth=2 -->

## Task 1: Region-model rewrite — checker + both suites

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/taskContractWiring.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11 -->

**Files:**

- Modify: `lib/specLint/taskContract.ts`
- Test: `tests/specLint/taskContract.test.ts`, `tests/specLint/taskContractWiring.test.ts`

**Interfaces:**

- Consumes: `DocModel` from `lib/specLint/parse.ts` (unchanged), `Finding` from `lib/specLint/types.ts` (unchanged).
- Produces: `checkTaskContract(model, kind)` — signature unchanged; behavior per spec §2.2/§2.3. `compareFindings` untouched.

- [ ] **Step 1: Migrate retired-semantics cases + add spec §5 cases (RED).**

In `tests/specLint/taskContract.test.ts`, rewrite these three existing cases in place (RED validity: each fails against the live checker because `lib/specLint/taskContract.ts:96-101` rejects every opening after the first and `lib/specLint/taskContract.ts:152` discards markers when `openCount !== 1`):

```ts
it("M2/AC-2: sequential reopen enrolls both regions and both are checked", () => {
  // Was: duplicate openings -> exactly [TASK_ENROLL_DUPLICATE]. Under the
  // multi-region spec (§2.2) this is two regions; both marker-less tasks
  // report. Marker-less tasks kept deliberately: with well-formed tasks both
  // the correct implementation and one that ignores region 2 report [].
  expect(codes(doc(OPEN, "## A", "prose, no marker", END, OPEN, "## B", END))).toEqual([
    "TASK_MARKER_MISSING",
    "TASK_MARKER_MISSING",
  ]);
});

it("M27/AC-10: a reopened-then-closed empty region is EMPTY, not a consumed close", () => {
  // Was: rejected duplicate's close consumed silently. The sequential shape
  // now enrolls region 2, which holds no task. The consumed-close behavior
  // itself is re-pinned by the nested-shape case below (M27b) and M36d.
  expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, END))).toEqual([
    "TASK_ENROLL_EMPTY",
  ]);
});

it("M29/AC-32: a failed enrollment keeps its line-pass finding and discards recorded markers unjudged", () => {
  const BAD = "<!-- task: red=x ac=AC-1 -->";
  expect(codes(doc("<!-- tasks: depth=x -->", "## A", BAD))).toEqual(["TASK_ENROLL_MALFORMED"]);
  expect(codes(doc(END, "## A", BAD))).toEqual(["TASK_ENROLL_MALFORMED"]);
  // Third assertion migrated (spec §6): both regions enroll; region 1's BAD
  // marker is judged, region 2 is empty. codes() sorts alphabetically.
  expect(codes(doc(OPEN, "## A", BAD, END, OPEN, END))).toEqual([
    "TASK_ENROLL_EMPTY",
    "TASK_MARKER_MALFORMED",
  ]);
});
```

`M36d` stays byte-identical (its fixture is nested-open shaped — the retained rejection path — and its expectations hold under §2.2; leave it and confirm in Step 4).

Add a new describe block. `OPEN3` is a new local const:

```ts
const OPEN3 = "<!-- tasks: depth=3 -->";

describe("checkTaskContract: sequential multi-region (2026-08-09 design §2.2-§2.3)", () => {
  it("AC-1: two depths, both checked", () => {
    // (a) Shape-A: d2 region, close, d3 region, close, d2 region; all marked.
    expect(
      codes(
        doc(
          OPEN, "## T6", WELL, "AC-1 here.", END,
          "## Tasks 7-16 group header",
          OPEN3, "### T7", WELL, "### T8", WELL, END,
          OPEN, "## T17", WELL, END,
        ),
      ),
    ).toEqual([]);
    // (b) one d3 child marker-less -> exactly [TASK_MARKER_MISSING] at it.
    expect(
      codes(
        doc(
          OPEN, "## T6", WELL, "AC-1 here.", END,
          "## Tasks 7-16 group header",
          OPEN3, "### T7", WELL, "### T8", "prose, no marker", END,
          OPEN, "## T17", WELL, END,
        ),
      ),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-2: reopen after close is not an error, and the second region is genuinely checked", () => {
    expect(
      codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, "## B", WELL, END)),
    ).toEqual([]);
    expect(
      codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, "## B", "prose, no marker", END)),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-3: a nested open is loud, inert, and non-disqualifying", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", OPEN3, END, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
    ]);
    // Outer task marker-less: outer region is checked, not skipped.
    // Report order [MISSING@2, DUPLICATE@4]; codes() sorts alphabetically.
    expect(codes(doc(OPEN, "## A", "prose, no marker", OPEN3, END, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
      "TASK_MARKER_MISSING",
    ]);
  });

  it("AC-4: a marker between regions is orphaned, not assigned", () => {
    expect(
      codes(
        doc(OPEN, "## A", WELL, "AC-1 here.", END, WELL, OPEN, "## B", WELL, END),
      ),
    ).toEqual(["TASK_MARKER_ORPHANED"]);
  });

  it("AC-5: per-region EMPTY independence", () => {
    expect(
      codes(doc(OPEN, "### deep only", END, OPEN, "## B", "prose, no marker", END, "AC-1 here.")),
    ).toEqual(["TASK_ENROLL_EMPTY", "TASK_MARKER_MISSING"]);
  });

  it("AC-6: EOF closes the last region in a multi-region document", () => {
    expect(
      codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, "## B", "prose, no marker")),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-7: same-depth split around an interloper", () => {
    expect(
      codes(
        doc(OPEN3, "### T1", WELL, "AC-1 here.", END, "### PROC interloper", OPEN3, "### T3", WELL, END),
      ),
    ).toEqual([]);
    expect(
      codes(
        doc(OPEN3, "### T1", WELL, "AC-1 here.", END, "### PROC interloper", OPEN3, "### T3", "prose, no marker", END),
      ),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-8: zero well-formed regions still discards; defective marker unjudged", () => {
    // The marker MUST be form-defective (empty red=): a wrong implementation
    // that judges markers after failed enrollment adds TASK_RED_EMPTY; a valid
    // marker produces the same list either way and proves nothing (spec §5).
    expect(
      codes(doc("<!-- tasks: depth=7 -->", "## A", "<!-- task: red=`` ac=AC-1 -->", "AC-1 here.")),
    ).toEqual(["TASK_ENROLL_MALFORMED"]);
  });

  it("AC-9: extents clip at the region close, even with a following region to leak into", () => {
    // Region 1's task is marker-less; the stray marker sits after its close.
    // A close-leaking implementation assigns it and reports []. AC-28 pattern
    // across a region boundary.
    expect(
      codes(doc(OPEN, "## A", "prose, no marker", END, WELL, OPEN, "## B", WELL, END, "AC-1 here.")),
    ).toEqual(["TASK_MARKER_MISSING", "TASK_MARKER_ORPHANED"]);
  });

  it("AC-10: close pairing unchanged; surplus close after a completed region", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, END))).toEqual([
      "TASK_ENROLL_MALFORMED",
    ]);
    // Nested variant (= AC-3 first fixture; kept adjacent for the pairing story):
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", OPEN3, END, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
    ]);
  });

  it("AC-11: every region is checked; first and third region defects both report", () => {
    expect(
      codes(
        doc(
          OPEN, "## A", "prose, no marker", END,
          OPEN, "## B", WELL, "AC-1 here.", END,
          OPEN, "## C", "prose, no marker", END,
        ),
      ),
    ).toEqual(["TASK_MARKER_MISSING", "TASK_MARKER_MISSING"]);
  });
});
```

Note `M37` (surplus close) and `M14/AC-16` (close with no open) stay unchanged — single-region fixtures, semantics identical.

In `tests/specLint/taskContractWiring.test.ts`, replace the `TASK_ENROLL_DUPLICATE` entry of `CODE_FIXTURES` (currently sequential-reopen shaped, lines 76-90) with the nested-open shape:

```ts
TASK_ENROLL_DUPLICATE: [
  "<!-- tasks: depth=2 -->",
  "",
  "## Task 1",
  "",
  "<!-- task: red=`x` ac=AC-1 -->",
  "",
  "AC-1 here.",
  "",
  "<!-- tasks: depth=2 -->",
  "",
  "<!-- tasks: end -->",
  "",
  "<!-- tasks: end -->",
  "",
].join("\n"),
```

(The nested opening at line 9 draws the code; the first `end` closes the region; the second is consumed against the rejected opening — sole finding, preserving the all-ten-codes severity proof.)

- [ ] **Step 2: Run both suites to verify the new/migrated cases fail.**

Run: `pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/taskContractWiring.test.ts`
Expected: FAIL — M2/M27/M29-third/AC-1..AC-11 fail against the single-region checker (`TASK_ENROLL_DUPLICATE` where two regions are expected; discarded markers where judgements are expected). The wiring `TASK_ENROLL_DUPLICATE` fixture still passes at this point (nested open is rejected today too) — that is expected; it is being changed for the *future* semantics, not to go red.

- [ ] **Step 3: Implement the region model.**

In `lib/specLint/taskContract.ts`:

(a) Replace the single-region pass-1 state (`open`, `openCount`, `depth`, `regionStart`, `regionEnd`) with a region list. The `OPEN` branch becomes:

```ts
type Region = { depth: number; start: number; end: number };
const regions: Region[] = [];
let open = false;
let rejectedOpens = 0;
let openDepth = 0;
let openStart = 0;
```

```ts
const om = OPEN.exec(line);
if (om) {
  sawTasksLine = true;
  if (!open) {
    open = true;
    openDepth = Number(om[1]);
    openStart = n;
  } else {
    findings.push(
      fail("TASK_ENROLL_DUPLICATE", n, "task-region opening inside an unclosed region"),
    );
    rejectedOpens++;
  }
  continue;
}

if (END.test(line)) {
  sawTasksLine = true;
  if (open) {
    regions.push({ depth: openDepth, start: openStart, end: n });
    open = false;
  } else if (rejectedOpens > 0) {
    rejectedOpens--;
  } else {
    findings.push(fail("TASK_ENROLL_MALFORMED", n, "task-region close with no matching opening"));
  }
  continue;
}
```

The `TASKS_ANY` and `MARKER_ANY` branches and the `markerShaped` set are unchanged. After the loop:

```ts
if (open) regions.push({ depth: openDepth, start: openStart, end: model.lines.length + 1 });
```

(b) Pass 2 — replace the `openCount !== 1` gate and the single-region task selection:

```ts
if (!sawTasksLine) return [];
if (regions.length === 0) return findings;

const extents: { start: number; end: number }[] = [];
for (const region of regions) {
  const regionTasks = model.headings.filter(
    (h) => h.depth === region.depth && h.line > region.start && h.line < region.end,
  );
  if (regionTasks.length === 0) {
    findings.push(
      fail("TASK_ENROLL_EMPTY", region.start, `task region selects no depth-${region.depth} heading`),
    );
  }
  for (const t of regionTasks) {
    let end = region.end;
    for (const h of model.headings) {
      if (h.line > t.line && h.depth <= region.depth) {
        end = Math.min(end, h.line);
        break;
      }
    }
    extents.push({ start: t.line, end });
  }
}
```

The marker ownership / cardinality / classification loop from `const owned = new Map(...)` down, and the final `findings.sort(compareFindings)`, are unchanged — they already operate on `extents` alone.

(c) Rewrite the file-header comment (spec §2.2 "Enrollment redefined"): the two-pass split is no longer a correctness requirement — a region is final at its close and no later line can invalidate it, because a nested `OPEN` is inert; the pass structure is retained as an implementation choice. Keep the "pure" note.

- [ ] **Step 4: Run the suites to verify green.**

Run: `pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/taskContractWiring.test.ts tests/specLint/taskContractFindingOrder.test.ts tests/codexGuard/lintDoc.test.ts`
Expected: PASS, all four files (FindingOrder and lintDoc prove the untouched-surface claims).

- [ ] **Step 5: Backward-compat corpus probe.**

Run and record output in the commit message body:

```bash
for f in $(rg -l "tasks: depth=" docs/superpowers/plans/); do pnpm spec:lint "$f" 2>&1 | grep "^summary"; done
```

Expected: identical summaries to a pre-change run of the same loop (capture the pre-change run BEFORE Step 3, while the tree is still green at Step 2's baseline — practical order: run the loop once before starting Step 3, save to `/tmp`-scratch, diff after). Every enrolled plan is single-region, so per spec §2.3 behavior must be byte-identical.

- [ ] **Step 6: Commit.**

```bash
git add lib/specLint/taskContract.ts tests/specLint/taskContract.test.ts tests/specLint/taskContractWiring.test.ts
git commit -m "feat(spec-lint): sequential multi-region task enrollment"
```

## Task 2: Mutation gate — score holds, no unaccepted survivors

<!-- task: red=`pnpm mutation:guards` ac=AC-13 -->

**Files:**

- Possibly modify: `tests/specLint/taskContract.test.ts` (survivor-killing tests), `tests/mutation/guardSurfaces.gate.test.ts:41` (the `taskContract: { equivalent: 22 }` expectation — only with per-row justification), the surface's mutation ledger (wherever `pnpm mutation:guards` reports drift).

**Interfaces:** consumes Task 1's checker; produces the AC-13 evidence for the review dispatch.

- [ ] **Step 1: Run the gate.**

Run: `pnpm mutation:guards`
Expected: either PASS (score holds, ledger reconciles) or a report of new surviving mutants / ledger drift — the rewrite moved lines, so drift is likely.

- [ ] **Step 2: Triage every survivor individually.**

For each surviving mutant: (a) if it demonstrates a real gap, add a killing test to `tests/specLint/taskContract.test.ts` (full-list assertion, per the §5 fixture disciplines); (b) if it is genuinely equivalent (e.g. sign-not-magnitude in a comparison that only feeds `Math.min`), record it in the surface's ledger with a one-line rationale and adjust the `equivalent` count at `tests/mutation/guardSurfaces.gate.test.ts:41` in the same commit. No `accepted-gap` rows without a written reason. The convergence criterion (spec §1.1 item 5) is exactly: gate green with zero unaccepted survivors.

- [ ] **Step 3: Re-run to green, commit.**

Run: `pnpm mutation:guards`
Expected: PASS.

```bash
git add -A tests/
git commit -m "test(spec-lint): mutation-gate triage for the multi-region rewrite"
```

## Task 3: Documentation — convention block, README row, origin pointers

<!-- task: red=`rg -q "sequential regions" docs/agents/spec-self-review.md` ac=AC-12 -->

**Files:**

- Modify: `docs/agents/spec-self-review.md` (convention block, after the fenced example around line 30) — spec AC-12
- Modify: `docs/superpowers/specs/README.md` (Cross-corpus amendments table)
- Modify: `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` (pointer lines at each superseded locus per spec §3)

- [ ] **Step 1: RED probe.** Run: `rg -q "sequential regions" docs/agents/spec-self-review.md; echo $?` — expected `1` (absent).

- [ ] **Step 2: Edit the three documents.**

`docs/agents/spec-self-review.md` — append to the paragraph following the fenced example (the one beginning "`spec:lint` then reports…"):

```
A plan may declare several sequential regions, each with its own depth — close one region and open the next; headings between regions are unchecked (multi-region design, docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md).
```

`docs/superpowers/specs/README.md` — add to the Cross-corpus amendments table:

```
| [`2026-08-09-task-enrollment-multi-region-design.md`](./2026-08-09-task-enrollment-multi-region-design.md) | 2026-08-09 | Task enrollment becomes sequential multi-region: supersedes the pre-review-gate-arms spec's §3.2 exactly-one-region rule, its §3.4/§3.4.1 catalog and table rows, and AC-26/29/30/32/45; closes its §6 items 6-7 (`BL-TASK-ENROLLMENT-SINGLE-DEPTH`). |
```

`docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` — one pointer line per superseded locus in the spec §3 map, placed directly under the affected bullet/table/AC, all with the same form:

```
> **Superseded (2026-08-09):** multi-region enrollment — see `2026-08-09-task-enrollment-multi-region-design.md` §3.
```

Loci (from the spec §3 map): §3.2's exactly-one bullet, every-opening-after-the-first bullet, unenrolled-skip bullet, close-pairing probe paragraph, attempted-vs-failed paragraph; §3.4 catalog `TASK_ENROLL_DUPLICATE` row (a pointer line after the table); §3.4's marker-codes-are-pass-2 paragraph; §3.4.1's line-pass table (pointer after it) and Pass-2 conclusion rows (pointer after that block); AC-26, AC-29, AC-30, AC-32, AC-45. One pointer per *block* is enough where loci are adjacent (e.g. one after the §3.2 bullet cluster) — the requirement is that a reader at any superseded rule finds the pointer on the same screen.

- [ ] **Step 3: Verify + lint.**

Run: `rg -q "sequential regions" docs/agents/spec-self-review.md && rg -c "Superseded (2026-08-09)" docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md && pnpm spec:lint docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md 2>&1 | grep "^summary"`
Expected: first probe exits 0; the count is ≥5; lint stays `0 hard`.

- [ ] **Step 4: Commit.**

```bash
git add docs/
git commit -m "docs: multi-region enrollment convention, README row, origin supersession pointers"
```

## Task 4: Ledger graduation

<!-- task: red=`sh -c "! rg -q BL-TASK-ENROLLMENT-SINGLE-DEPTH BACKLOG.md"` ac=AC-12 -->

**Files:**

- Modify: `BACKLOG.md` (remove the entry), `BACKLOG-archive.md` (add the closed entry) — completes the documentation half of spec AC-12

- [ ] **Step 1: Move the entry.**

Delete the `## BL-TASK-ENROLLMENT-SINGLE-DEPTH` section from `BACKLOG.md` (including its `**Status:** IN PROGRESS · **Branch:** …` meta line — archives categorically reject in-flight markers, and this removal is also invariant 12's marker-off-before-merge step). Add to `BACKLOG-archive.md`, following the existing closed-entry form (`## <ID> — <title> — CLOSED <date> (<branch>, <disposition>)`):

```markdown
## BL-TASK-ENROLLMENT-SINGLE-DEPTH — the declared task region cannot express hierarchical or interleaved plan shapes — CLOSED 2026-08-09 (feat/task-enrollment-multi-region, IMPLEMENTED)

**Resolution: IMPLEMENTED.** Sequential multi-region enrollment shipped per
`docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md` (RATIFIED, adversarial R4 APPROVE):
a plan may declare any number of sequential regions, each with its own depth. Both filed shapes are now
expressible — multi-depth plans via per-depth regions, interlopers and range headings via fence placement.
The deliberate residue (no marked parent tasks, no skip notes) is recorded as documented limits in that
spec's §7 with re-open triggers; the l-wave PREREQ stamp is discharged by this design session.
```

- [ ] **Step 2: Verify the ledger meta-tests.**

Run: `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaInvariant8Closeout.test.ts tests/docs/_metaReviewRoundEconomy.test.ts`
Expected: PASS (no in-flight marker left anywhere; the archive entry carries none; the 4-round filing at `docs/review-rounds/feat/task-enrollment-multi-region/d8cc5c96839b.md` satisfies the economy gate).

- [ ] **Step 3: Commit.**

```bash
git add BACKLOG.md BACKLOG-archive.md
git commit -m "docs: graduate BL-TASK-ENROLLMENT-SINGLE-DEPTH (multi-region enrollment shipped)"
```

## Task 5: Full-suite gates

<!-- task: red=`pnpm test` ac=AC-13 -->

**Files:** none new — this is the pre-push gate battery (full suite catches cross-surface regressions scoped runs miss).

- [ ] **Step 1: Run the battery.**

```bash
pnpm test
pnpm typecheck
npx tsc --noEmit -p tests/e2e 2>/dev/null || true   # playwright tsconfig, if present per repo convention
pnpm lint
pnpm format:check
```

Expected: all green. (`pnpm test` excludes env-bound/e2e suites by repo convention; that exclusion is fine here — no e2e surface is touched.)

- [ ] **Step 2: Fix anything red, commit residue if any.**

Any failure traces to this diff (the worktree started from green `origin/main`). Fix within the task's scope; if a fix changes checker behavior, re-run Task 2's gate.

```bash
git add -A && git commit -m "test(spec-lint): full-suite gate residue"   # only if changes exist
```

## Task 6: Whole-diff adversarial review (cross-model) to APPROVE

<!-- task: red=`sh -c "! test -f /tmp/diff-review-approve"` ac=AC-13 -->

- [ ] **Step 1: Freeze the tree** (no edits while a dispatch runs).

- [ ] **Step 2: Dispatch via codex-guard** — `--stage diff --round <n>`, fresh `--out` per round, brief includes: REVIEWER ONLY; fresh-eyes whole-diff posture; the spec §1.1 do-not-relitigate list verbatim; the convergence criterion stated as the machine-computed one (mutation score + empty unaccepted-survivor set, `tests/mutation/source/registry.ts:153`) plus the consequence bound; `FINDINGS:`/`VERDICT:` terminal lines; `--lint-doc` on both the spec and this plan.

- [ ] **Step 3: Iterate repair rounds** (class-sweep before patching; sweep to a derivation) until `VERDICT: APPROVE`. Commit each round's repairs; the round corpus rows land in `docs/review-rounds/feat/task-enrollment-multi-region/` and are committed with the arc.

<!-- tasks: end -->

## Execution handoff (Stage 4.4 duties — for the implementing session)

Per the pipeline owner's directive, implementation + closeout run in a NEW Opus pane session. That session, on pickup: run `date`; overwrite `sessionId` in the worktree's ship-state marker file (ship-state JSON under the worktree's dot-claude directory) with its own session UUID; register its own 10-minute cron nudge (full Stage-0 semantics incl. supersession check) and write the `cronJobId` into the marker; rename its herdr pane AND agent to `feat/task-enrollment-multi-region`; then execute Tasks 1-6 in order. After Task 6 APPROVE: push; open PR (merge commit; PR body ends with the standard generated-with footer); real CI green (all twelve branch-protection contexts); `gh pr merge --merge`; fast-forward the main checkout (`git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only`) and verify `git rev-list --left-right --count main...origin/main` reports `0  0`; then Stage 4.4 cleanup — `CronDelete` its nudge, `herdr pane rename "$HERDR_PANE_ID" --clear`, `herdr agent rename "$HERDR_PANE_ID" --clear`, set marker `stage` to `"done"`. Never end a turn mid-pipeline; report inline while continuing.

## 12. Closeout

impeccable-gate: N/A — no UI surface
