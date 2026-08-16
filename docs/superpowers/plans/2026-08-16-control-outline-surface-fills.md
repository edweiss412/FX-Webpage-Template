# Control Outlines on Surface Fills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

**Goal:** Ship the Option B ruling. DESIGN.md §1.2a's control-outline predicate becomes fill-equals-container; the 21 button/link elements standing on card and panel fills swap `border-border-strong` → `border-text-faint`; the switch tracks — **five render paths, not three** (spec §3.1) — keep their recipe unchanged in both states.

**Architecture:** **22 source-token edits across 21 elements in 16 files.** The count differs from the element count in both directions: two elements need two edits each (both arms of a ternary), and two elements share one edit (a file-local constant). Plus a DESIGN.md predicate rewrite, one regression-pin suite, and the invariant-8 dual gate. Ledger filings: the plan budgeted TWO (Task 6's residue and forward-guard rows) and the arc filed FIVE — the invariant-8 gate added `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` and `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` for its two P1s and its P2, each with a `DEFERRED.md` entry carrying an un-defer trigger, and the origin/main merge's Mechanizable-parity gate required `BL-SPECLINT-ENUMERATED-UNIVERSAL-PARITY`. Recorded here rather than left as a stale budget. No product logic, no new component, no new prop, no DB surface, no route, no migration. `lib/ui/actionClass.ts` already wears `border-text-faint` and is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing static scanner at `tests/styles/interactiveScanCore.ts`.

**Spec:** `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` — adversarially APPROVED at spec round 8, zero findings, after eight rounds and twenty findings.

## What this plan does NOT build

Spec §5.2 **cut the switch-track classifier** after five mechanisms and five structural escapes. This plan therefore ships **no predicate, no `TRACK_REGISTRY`, no exemption classification, and no forward guard.** What ships is a regression pin: *did the 21 elements this PR changed stay changed*. That question is about a closed set this PR itself defines, so it needs no notion of what a switch track is. An implementer who finds themselves writing a function that decides whether an arbitrary element is a toggle has left the plan.

## Global Constraints

- Invariant 1 (TDD): every task in the red-contract region is failing test → minimal implementation → passing test → commit.
- Invariant 2 (advisory locks): **N/A** — no `pg_advisory*` surface, no RPC, no DB. `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- Invariant 5: N/A — no user-visible copy changes. Task 2 edits a source COMMENT only (step 2.4a).
- Invariant 8: **APPLIES** — the diff touches `app/**` (non-API), `components/**` and `DESIGN.md`. Task 5 runs both halves and writes the marker in that same commit.
- Invariant 9: N/A — no Supabase call added or edited.
- Invariant 10: N/A — no mutating route, no `"use server"` action.
- Invariant 11: all work in this worktree, never the main checkout.
- Invariant 12: the `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS` in-progress marker comes off in **Task 7**, which is the PR's LAST commit, before the merge — never in a post-merge turn.
- Conventional commits, one per task.
- No migration → `validation-schema-parity` checklist **N/A**. No §12.4 catalog change → the three-lockstep rule is **N/A**.
- Heavy phases (`pnpm test`, `pnpm build`, `pnpm mutation:guards`) run under `pnpm heavy`; the scoped vitest runs named per task stay unwrapped.

### Meta-test inventory (declared)

- **CREATES** a new `_metaControlOutlineFill` suite plus its importable `controlOutlineScan` module, both under `tests/styles/` (new files; written without full-path citations because a citation to a file that does not yet exist is the invented-API shape the citation pass exists to catch).
- **EXTENDS** `tests/mutation/source/registry.ts` with one `GuardSurface` row for the census-reader module (Task 3). The EXPECTED branch keeps that row: plan review R2 ran the live enumerator against a conforming one-row implementation and got four mutants (one integer-literal, one logical-connector, two equality-flips). AC-8 is still written as a disjunction so the plan does not fail if the harness disagrees, but the expected outcome is a real score.
- **EXTENDS nothing else.** Not applicable, each with its reason: `tests/auth/_metaInfraContract.test.ts` (no auth boundary), `tests/messages/_metaAdminAlertCatalog.test.ts` (no admin alert), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock), `tests/components/tiles/_metaSentinelHidingContract.test.ts` (no tile sentinel), `tests/styles/_metaSubtleOnInteractive.test.ts` (a different policed token; its `token` field exists precisely so a second policed token cannot alias its rows).
- **Test wiring:** `BASE_INCLUDE` at `vitest.projects.ts:34` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the new suite is picked up with no config edit and no new path filter. Verified at plan time; stated because the writing-plans rule requires the wiring named either way.

### Mutation-family closure, and why AC-8 is a disjunction

`tests/mutation/source/registry.ts:1243-1255` carries a `NOT ENROLLED` note for **`tests/styles/subtleInteractiveScan.ts`** — enrolled on 2026-08-14, it produced **ZERO mutants**, and the harness rejected the row by its own no-mutants condition, so the row "asserted nothing while looking like coverage." Its rule: *"Restructuring the module to grow mutation sites would be gaming the operator set, and a vacuous row is worse than an honest absence."* `tests/styles/tapTargetScan.ts` is the row immediately AFTER that note and **is enrolled**, at `scoreFloor: 0.9` — do not cite it as the zero-mutant case.

**Outcome A (mutants exist) is the EXPECTED branch, and this was measured rather than reasoned.** An earlier draft predicted the no-mutants branch by analogy to `subtleInteractiveScan`, and plan review R2 refuted it by running the live enumerator against a minimal conforming one-row implementation of Task 1.1:

```
integer-literal:2:47:1>2
logical-connector:5:72:&&>||
equality-flip:5:59:===>!==
equality-flip:5:83:===>!==
COUNT=4
```

The analogy failed because the shapes differ where it counts. `subtleInteractiveScan` is a pure filter over a predicate; **this module carries 21 numeric `line` literals and a `file === r.file && line === r.line` comparison**, which is an integer-literal site per row plus an equality-flip and a logical-connector site in the resolver. The full census necessarily adds many more integer-literal sites than the one-row probe shows.

So the plan expects a real score, and **any prose claiming this module has "no equality, logical, or integer-literal site" is false and must not be written.**

- **Outcome A — mutants exist (expected).** Keep the row. Convergence for any review of the pin is the score plus an empty unaccepted-survivor set, both machine-computed. Survivors are either killed by strengthening the suite or accepted with a stated reason.
- **Outcome B — the harness reports its no-mutants condition (not expected; handle it if it happens).** Remove the row and record the honest absence with the harness output, in the `subtleInteractiveScan` style. Do NOT restructure the module to manufacture sites.

AC-8 is satisfied by EITHER branch, and the inventory says "may extend", because a plan whose acceptance criteria can only be met by one branch fails the moment the harness disagrees — which is exactly what R2 demonstrated about the earlier draft.

### Four pre-dispatch mutants for the string-presence pin

Task 1's suite asserts class-token presence, so all four are run and recorded before any review dispatch. **They run in TASK 2, from the post-swap GREEN baseline — not in Task 1.** Plan review R3 caught why: at Task 1's red tree the live probe reads `rows=21 resolved=21 strong=21 faint=0`, so there is no `border-text-faint` for mutant (a) to delete, and (b) and (c) cannot demonstrate a red-from-green transition because their rows are already red. A mutant that cannot go from green to red proves nothing. Only (d) is independent of the swap. **Four, and the table has four rows.**

| Mutant | Applied to | Expected |
| --- | --- | --- |
| (a) value emptied | one census row's `border-text-faint` deleted from source | suite REDS on that row's "carries" assertion |
| (b) expected content plus appended suffix | one census row set to `border-text-faint-x` | suite REDS — the whole-token match does not accept the suffixed form |
| (c) present but not live | `border-text-faint` added inside a JSX **comment** in a census file whose element was reverted | suite REDS — the scanner reads elements, not raw text, so a comment cannot satisfy the assertion. This is the mutant that proves the pin is not a grep |
| (d) discriminating parameter varied | the suite's `rootDir` pointed at an empty temp dir | the PREMISE reds (universe 0, below the floor of 200) BEFORE any row assertion runs. This only holds because the premise reads the same `rootDir` the resolver does — R2 F1 caught an earlier draft where the premise read `cwd` while the mutant varied the resolver's argument, so the premise passed at 362 and the row assertions failed instead. The mutant is the check that premise and case share an input |

### Acceptance criteria (spec traceability)

- **AC-1** (spec §4.2): all 21 census elements carry `border-text-faint` and none carries `border-border-strong`.
- **AC-2** (spec §2, §3.1): the **five** switch-track render paths are unchanged in BOTH branches.
- **AC-3** (spec §5.2): the suite is a regression pin over the enumerated census. NO classifier, predicate, or track registry ships.
- **AC-4** (spec §5.3): the suite proves its own premise, asserts its census cardinality independently, requires every row to resolve, and carries a negative control with its own premise.
- **AC-5** (spec §4.1): DESIGN.md §1.2a states the fill-equals-container predicate and names both OUT families, with the switch tracks at five paths.
- **AC-6** (spec §6): DESIGN.md records the tracks' OFF ring at 1.43:1 light / 1.75:1 dark.
- **AC-7** (spec §4.3): the `GalleryLightbox` chip comment names the token actually present, updated in the SAME commit as the swap.
- **AC-8** (spec §5.4): EITHER a registry row exists and `pnpm mutation:guards` reports a score at or above its floor with an empty unaccepted-survivor set, OR the harness reported the no-mutants condition and the honest absence is recorded with its output. Both are passes.
- **AC-9** (spec §5.1): NO new ratio assertion and NO new DESIGN.md §1.2 table row. A diff that adds one has over-reached the ruling.
- **AC-10** (spec §3.2, §6): the residue the cover cannot see is filed with its probe transcripts.
- **AC-11** (spec §5.2, §6): the forward-guard ambition is filed with §5.2's five-escape table as its evidence.
- **AC-12** (spec §4.2, §4.3): nothing outside the census moves. The 16 touched files hold 51 textual `border-border-strong` occurrences; Task 2 removes 22 targets AND the now-false `GalleryLightbox` comment mention, so **28** survive — including `components/diagrams/GalleryLightbox.tsx:773`, which keeps its token.

### Plan-time probe record (run 2026-08-16 on the live tree)

Authored AND run, per the reconciliation-sweep rule:

```
scanInteractiveElements(process.cwd())   -> 362 elements (357 hasClassName, 13 unresolved)
filter border-border-strong              -> 24   (21 swap elements + 3 cover-visible tracks)
filter border-accent-edge                -> 3    (the cover-visible tracks only)
swap source occurrences                  -> 22   across 21 elements in 16 files
textual border-border-strong, 16 files   -> 51   (22 target + 1 stale comment + 28 that MUST remain)
switch-track recipe, source-wide         -> 5 render paths (spec §3.1)
```

The gap between the 22 target edits and the 51 textual occurrences is what Task 2's fence is for: the census pin alone checks its own 21 rows and would not notice an implementer swapping a card, a chip, or one of the deliberately filed form fields.

---

<!-- tasks: depth=3 red-contract -->

### Task 1: The regression pin (RED)

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/admin/UnignoreButton.tsx:57` why=`the suite asserts each census element carries border-text-faint; on the live tree all 21 still carry border-border-strong, verified at UnignoreButton.tsx:57, so all 21 row assertions fail until Task 2 swaps them` ac=AC-3,AC-4 -->

- [ ] **1.1** Create the `controlOutlineScan` module under `tests/styles/`, exporting exactly two things: `CENSUS`, the 21 spec §4.2 rows as `readonly { file: string; line: number }[]`, each with its spec citation in a comment; and `resolveCensus(rootDir: string)`, which runs `scanInteractiveElements` and returns, per census row, the element found at that `file`+`line` or `null`. **No predicate, no registry, no classification helper** (AC-3). Identity is `file`+`line` because file alone is not unique — `RoleMappingRow`, `BellPanel`, `StagedReviewCard`, `Step3ReviewModal` and `step3ReviewSections` each contribute two census rows out of 6-21 interactive elements in the same file.
- [ ] **1.2** Create the `_metaControlOutlineFill` suite under `tests/styles/` with these cases:
  - *premise, on the SAME input the rows are resolved from* — the suite resolves against one `rootDir`, and the premise asserts `premise("scanner reaches the component tree", scanInteractiveElements(rootDir).length, 200)` for that same `rootDir`, executed unconditionally and never inside a `.each` callback. Measured universe 362. Taking the premise from `cwd` while resolving rows from `rootDir` would make it a premise about an ADJACENT input, which the premise rule forbids and which mutant (d) below is designed to catch.
  - *census cardinality, asserted independently of the census* — `expect(CENSUS.length).toBe(21)` against the **literal 21**, not against anything derived from `CENSUS`. Without this, deleting a row deletes its test case and the suite still passes: the premise still sees 362, the unresolved pin still sees 13, and every surviving row still resolves. This is the vacuous-iteration failure and it is the single most important case in the suite.
  - *row identities are unique* — `new Set(CENSUS.map(r => `${r.file}:${r.line}`)).size === 21`, so a duplicated row cannot stand in for a deleted one and keep the count at 21.
  - *every row resolves* — for each census row, assert `resolveCensus` found an element. A renamed file or moved element must RED here rather than silently drop out of the iteration.
  - *both directions per row* — the resolved element carries `border-text-faint` and does NOT carry `border-border-strong`. The second is not redundant: a two-arm ternary element can carry both if only one arm was edited.
  - *unresolved pin* — `scanInteractiveElements(cwd).filter(e => e.unresolved).length === 13`, an equality not a ceiling (spec §5.3). Spec §§3.2(c) and 6 both rest on this obligation existing.
  - *negative control* — a temp-dir fixture carrying `border border-border-strong bg-surface` on a `<button>` is found by the scan and FAILS the "does not carry" assertion, with its own `premise("fixture parsed and produced an element", found.length, 0)`. A fixture that fails to parse returns `[]` and makes the assertion vacuously true; the repo-scan premise is adjacent to that, not a substitute for it.
  - *adjacent-token survival* — assert both `ShareHub` ternary arms still carry `max-sm:border-border`. R3 probed this: corrupting both adjacent tokens after an otherwise-correct swap leaves the census rows reading `faint=true strong=false`, so every other case in this suite stays green while the responsive treatment is silently gone. The census pin checks the token that MOVED; this checks the token that must NOT.
  - *switch-track recipes unchanged* — for each of the FIVE named paths in spec §3.1, assert the file still contains both `border-accent-edge bg-accent` and `border-border-strong bg-surface-sunken`. R3 probed that none of the five files appears in the census or the Task 2 fence, so AC-2 was otherwise unverified by any command in this plan and the swap could have altered an OFF recipe undetected. **This is a source-presence check over a fixed list of five named files — it classifies nothing** and must not grow into one (spec §5.2).
  - *fixture mechanism* — `tests/styles/interactiveScanCore.test.ts:41` has a local `scanFixture` helper (`mkdtempSync` + `writeFileSync` + scan). It is NOT exported. Replicate the six-line helper here rather than exporting it from a module the mutation registry already enrols.
- [ ] **1.3** Run the RED: `pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts`. Observe the per-row "carries `border-text-faint`" case failing on all 21 rows; the premise, cardinality, uniqueness, resolution, unresolved-pin and negative-control cases all pass. Record the observed failure count in the commit.
- [ ] **1.4** Commit: `test(styles): pin the 21 swapped control outlines against regression`.

### Task 2: The swap — 22 source edits (GREEN)

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=live red-target=`components/admin/UnignoreButton.tsx:57` why=`Task 1 committed the suite observed-red on 21 rows; this task turns the SAME command green by making exactly the 22 token edits` ac=AC-1,AC-2,AC-9,AC-12 -->

- [ ] **2.1** In each of the 21 elements in spec §4.2, replace **every** `border-border-strong` token with `border-text-faint`. Nothing else on the line changes — not the `border` utility, not padding, not hover, not disabled.
- [ ] **2.1a** **Arity: 22 source edits, 21 elements, 16 files.** Two elements need TWO edits each (both ternary arms): `components/admin/ArchiveShowButton.tsx:365` (`compact ? A : B`, arms at `components/admin/ArchiveShowButton.tsx:371` and `components/admin/ArchiveShowButton.tsx:372`) and `components/admin/showpage/ShareHub.tsx:777` (arms at `components/admin/showpage/ShareHub.tsx:800` and `components/admin/showpage/ShareHub.tsx:801`). Editing one arm and not the other ships a control whose outline changes with a viewport or a prop. Two elements SHARE one edit: `app/admin/settings/roles/RoleMappingRow.tsx:211` and `app/admin/settings/roles/RoleMappingRow.tsx:343` both read the file-local constant `outlineBtn` at `app/admin/settings/roles/RoleMappingRow.tsx:47`, so one edit moves both. **21 + 2 − 1 = 22.**
- [ ] **2.1b** **Match the whole token, never the prefix.** `components/admin/showpage/ShareHub.tsx:800` and `components/admin/showpage/ShareHub.tsx:801` also carry `max-sm:border-border` — a DIFFERENT token that must survive. A regex on `border-border` corrupts it.

**Per-file target-edit checklist (derived at plan time; total 22).**

| Target edits | File |
| --- | --- |
| 1 | `app/admin/settings/roles/RoleMappingRow.tsx` (one shared constant, two elements) |
| 1 | `app/admin/show/[slug]/ResetPickerEpochButton.tsx` |
| 2 | `components/admin/ArchiveShowButton.tsx` (one element, both ternary arms) |
| 2 | `components/admin/BellPanel.tsx` |
| 1 | `components/admin/Mi11GateActions.tsx` |
| 1 | `components/admin/RoleRecognizeControl.tsx` |
| 1 | `components/admin/StagedPreviewBanner.tsx` |
| 2 | `components/admin/StagedReviewCard.tsx` |
| 1 | `components/admin/UnignoreButton.tsx` |
| 2 | `components/admin/showpage/ShareHub.tsx` (one element, both ternary arms) |
| 1 | `components/admin/telemetry/HealthAlertResolveButton.tsx` |
| 1 | `components/admin/telemetry/HealthAlertsPanel.tsx` |
| 2 | `components/admin/wizard/Step3ReviewModal.tsx` |
| 2 | `components/admin/wizard/step3ReviewSections.tsx` |
| 1 | `components/diagrams/GalleryLightbox.tsx` |
| 1 | `components/shared/ReportModal.tsx` |
| **22** | **16 files** |

- [ ] **2.2** Do NOT touch any of the FIVE switch-track render paths (spec §3.1) — `components/admin/PublishedToggle.tsx:305`, `components/admin/settings/AutoPublishToggle.tsx:136`, `components/admin/settings/NotifyToggle.tsx:144`, `components/admin/telemetry/AutoRefreshControl.tsx:106`, `components/admin/settings/DeveloperToggleButton.tsx:97`. None of their files is in the 16 above, so this is a "stay out" instruction, not an in-file exclusion.
- [ ] **2.3** **The 16 touched files hold 51 textual `border-border-strong` occurrences; you are editing 22 of them, and 29 must survive.** They are cards, chips, tiles, popovers, alert plates and the deliberately filed form fields (spec §3.2a) — including `components/admin/BellPanel.tsx:836` and `components/admin/BellPanel.tsx:847`, `components/admin/wizard/step3ReviewSections.tsx:4171`, and `components/diagrams/GalleryLightbox.tsx:773`. A file-wide find-replace is a defect. The census pin checks only its own 21 rows and will NOT notice an extra swap; step 2.5 is what does.
- [ ] **2.4** GREEN: `pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` passes every case.
- [ ] **2.4a** **Fix the `GalleryLightbox` comment in THIS commit** (spec §4.3 says the comment moves with the swap, and a separate commit would leave a false citation in the tree between them). `components/diagrams/GalleryLightbox.tsx:686` says `` `border-border-strong` gives the chip slight visual primacy over the chevrons when active (critique MED-5) ``; after 2.1 that token is not on the chip. Name `border-text-faint` and record that MED-5's intent is STRENGTHENED, not overturned (1.59/1.50 → 3.35/3.53 on `surface-raised`). Then `grep -n "border-border-strong" components/diagrams/GalleryLightbox.tsx` must return **exactly one line, `773`** — the non-interactive overlay chip, outside the census, which keeps its token. Zero hits means 773 was wrongly swapped; two or more means the comment or the chip was missed.
- [ ] **2.5** **Fence, authored as one executable command (AC-12).** Run it and paste the output into the commit:

  ```sh
  git grep -c 'border-border-strong' -- \
    'app/admin/settings/roles/RoleMappingRow.tsx' \
    'app/admin/show/[slug]/ResetPickerEpochButton.tsx' \
    'components/admin/ArchiveShowButton.tsx' \
    'components/admin/BellPanel.tsx' \
    'components/admin/Mi11GateActions.tsx' \
    'components/admin/RoleRecognizeControl.tsx' \
    'components/admin/StagedPreviewBanner.tsx' \
    'components/admin/StagedReviewCard.tsx' \
    'components/admin/UnignoreButton.tsx' \
    'components/admin/showpage/ShareHub.tsx' \
    'components/admin/telemetry/HealthAlertResolveButton.tsx' \
    'components/admin/telemetry/HealthAlertsPanel.tsx' \
    'components/admin/wizard/Step3ReviewModal.tsx' \
    'components/admin/wizard/step3ReviewSections.tsx' \
    'components/diagrams/GalleryLightbox.tsx' \
    'components/shared/ReportModal.tsx' \
    | awk -F: '{s+=$2} END {print s}'
  ```

  It must print **28**, down from 51 before this task (measured at plan time). Below 28 means a non-target occurrence was swapped; above 28 means a target edit or the comment was missed. `git grep -c` emits `path:count` per file and the `awk` sums them, so this is one command with one number — not a placeholder and not a per-file listing a reader has to add up.
- [ ] **2.6** Run all four pre-dispatch mutants from the table above, **from this green baseline**, and record each result in this commit's message. Restore the tree to green after each.
- [ ] **2.7** `pnpm exec eslint .` (canonical-Tailwind rule) and `pnpm format:check`.
- [ ] **2.8** Commit: `fix(admin): move control outlines on surface fills to the text ramp`.

<!-- tasks: end -->

---

<!-- tasks: depth=3 -->

> These five tasks are in a PLAIN region, deliberately. The `red-contract` fields are not declared
> for them because none has a production line whose absence makes a command fail, and the reason
> is stated per task: **Task 3** drives an external harness whose "unmeasured" state is not a red
> (it is an absence of measurement, not a defect); **Task 4** edits root-level prose (`DESIGN.md`);
> **Task 5** is a skill-driven human gate whose evidence is a findings table; **Task 6** and
> **Task 7** both edit root-level prose (`BACKLOG.md`). That is five reasons for five tasks. The
> linter
> also correctly refuses a root-level bare filename as a `red-target`. Declaring the fields anyway
> would be a marker asserting a red it cannot point at — which is exactly the defect the
> red-contract grammar exists to catch.

### Task 3: Mutation-registry enrolment — attempted, both outcomes pre-committed

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-8 -->

**Do 3.1-3.2 first and let the harness decide the branch. Outcome A is expected (R2 measured four mutants on a conforming one-row shape), but the harness decides, not this plan.**

- [ ] **3.1** Draft one `GuardSurface` row for the new census-reader module, copying the shape of the `tapTargetScan` row at `tests/mutation/source/registry.ts:1256`: `sourcePath`, `suitePaths` (Task 1's suite), `operators`, `scoreFloor`, and a `control` edit the suite MUST notice (the control proves the overlay is live — a harness whose overlay silently failed reports a PERFECT score with every mutant run against clean source).
- [ ] **3.2** Run `pnpm heavy pnpm mutation:guards`. Record the full output.
- [ ] **3.3** **Outcome A — the row yields mutants.** Record score and the full survivor list; for every survivor either strengthen the suite or add an `accepted` row with its reason. The unaccepted-survivor set must be empty. Keep the row.
- [ ] **3.4** **Outcome B — the harness reports its no-mutants condition (NOT expected; R2's enumerator run predicts mutants).** REMOVE the row. Do NOT restructure the census-reader module to manufacture mutation sites — the registry's own comment names that as gaming the operator set, and a vacuous row is worse than an honest absence. Add a registry COMMENT in the **`subtleInteractiveScan`** style (`tests/mutation/source/registry.ts:1243`) recording the attempt and the zero-mutant output. **Do NOT write the structural rationale that `subtleInteractiveScan`'s note uses** — "no equality, logical or integer-literal site" is FALSE for this module (21 numeric `line` literals plus a `file === … && line === …` comparison), and if the harness nonetheless reports no mutants, the honest note says the outcome was observed and the reason is not yet understood.
- [ ] **3.5** Either way, paste the harness output into the commit message — the outcome is evidence, not a claim. Both branches satisfy AC-8.
- [ ] **3.6** Commit: `test(styles): enrol the control-outline pin` (A) or `test(styles): record the control-outline pin as a no-mutants surface` (B).

### Task 4: DESIGN.md §1.2a predicate rewrite

<!-- task: red=`pnpm spec:lint DESIGN.md` ac=AC-5,AC-6,AC-9 -->

- [ ] **4.1** Rewrite the predicate at `DESIGN.md:181` per spec §4.1's quoted text: fill-equals-container, with both OUT families named — weight-bearing accent fills, and the switch tracks at **five** render paths (spec §3.1), never three.
- [ ] **4.2** Replace the sentence at `DESIGN.md:236` that calls surface-filled controls the open question and gives a stale count of 23. The question is closed. State the ruling and its date.
- [ ] **4.3** Add the switch-track OFF ring documented limit (1.43:1 light / 1.75:1 dark) per spec §6, naming all five paths.
- [ ] **4.4** **Add NO new §1.2 ratio row** (AC-9). `text-faint` against all four neutral grounds is already at `DESIGN.md:141`. Confirm by diff that §1.2's table is untouched.
- [ ] **4.5** `pnpm spec:lint DESIGN.md` clean of hard findings; `pnpm vitest run tests/styles/secondary-action-contrast.test.ts` still green.
- [ ] **4.6** Commit: `docs(design): ratify the fill-equals-container control-outline predicate`.

### Task 5: Invariant-8 impeccable dual-gate

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-1,AC-5 -->

- [ ] **5.1** Canonical v3 setup gates: the skill's context load (PRODUCT.md + DESIGN.md), then the register reference read (the brand or product register, per the skill).
- [ ] **5.2** Run the FIRST half of the invariant-8 dual gate (the critique half) on the affected diff.
- [ ] **5.3** Run the SECOND half (the audit half) on the affected diff.
- [ ] **5.4** Record every finding and its disposition in §12 below. P0 and P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry.
- [ ] **5.5** Pre-code mechanical checklist, re-verified post-swap: em-dash ban in user-visible copy (no copy changed — confirm), apostrophe literals, 44px tap targets untouched, canonical type/token classes, no new colour token introduced.
- [ ] **5.6** In the SAME commit, write BOTH: (a) the `impeccable-gate:` marker line at the top of this file in the RAN form `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>` — `dispositions=recorded` iff `p0 + p1 > 0`, which the guard cross-checks; and (b) the verbatim names of both gate halves in §12, which is what makes this unit "declare" the gate. Replace the explanatory comment at the top of this file with the marker. Then the `red=` command above must pass.
- [ ] **5.7** Commit: `docs(design): record the invariant-8 dual-gate findings for the outline swap`.

### Task 6: File the residue and the forward-guard ambition

<!-- task: red=`pnpm vitest run tests/docs/` ac=AC-10,AC-11 -->

- [ ] **6.1** Add a `BL-` entry covering both families from spec §3.2: text-entry fields (`components/admin/BellPanel.tsx:836`, `components/admin/BellPanel.tsx:847`, `components/admin/wizard/step3ReviewSections.tsx:4171`) and outlines painted on a nested child (`components/admin/OnboardingWizard.tsx:240`, `components/admin/ShowRowActions.tsx:650`, `components/admin/wizard/CrewRowActions.tsx:273`, `components/admin/wizard/VenueMapTile.tsx:123`).
- [ ] **6.2** That entry carries **Reachability:** PROBED with spec §3.2's transcripts inline (the scanner admits `<input>` only at `type="checkbox"`/`"radio"` per `tests/styles/interactiveScanCore.ts:868`; nested-child elements report `strong=false`), the class-sweep exception **(a)** with its reason per family, and `components/admin/wizard/VenueMapTile.tsx:123` named FIRST as the closest to the 21.
- [ ] **6.3** Add a SECOND `BL-` entry for the forward-guard ambition (spec §5.2, §6), carrying §5.2's five-mechanism / five-escape table verbatim so the next attempt starts from five closed escapes. **Reachability:** PROBED — every escape was demonstrated against a live mechanism during spec review.
- [ ] **6.4** Commit: `docs(backlog): file the control-outline residue and the forward-guard ambition`.

### Task 7: Ledger archive and marker removal (LAST commit)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-1 -->

- [ ] **7.1** Archive `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`, removing its `**Status:** IN PROGRESS · **Branch:** …` marker in the SAME commit — archives categorically reject in-flight entries, so the marker cannot ride along (invariant 12).
- [ ] **7.2** The archived entry states the correction that `BACKLOG.md:243` has wrong: the tracks' OFF-state boundary is NOT "pinned in §1.2 against `--color-accent-edge`". §1.2 pins the ON half; the OFF half has no ratio row and no test pin (spec §3.1). Do not let a false claim outlive the arc that disproved it.
- [ ] **7.3** Add the `StagedPreviewBanner` picker link to `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`'s site list at 2.79 dark (spec §4.4), and **derive** that entry's new counts from the edited list rather than retyping them.
- [ ] **7.4** `pnpm vitest run tests/docs/` — ledger, closeout and review-round meta-tests green.
- [ ] **7.5** Commit: `docs(backlog): archive BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`. **This is the PR's last commit before the merge.**

<!-- tasks: end -->

---

## Pre-push gates (all of them, in order)

1. `pnpm typecheck` — vitest AND playwright tsconfigs.
2. `pnpm exec eslint .`
3. `pnpm format:check`
4. `pnpm heavy pnpm test` — full suite, not a scoped subset.
5. `pnpm heavy pnpm mutation:guards`
6. Real CI green — a local pass is necessary, not sufficient.

## 12. Invariant-8 gate findings and dispositions

**Both halves of the dual gate were run on the affected diff on 2026-08-16: `/impeccable critique` and `/impeccable audit`.** Naming them verbatim is what makes this unit declare the gate; the marker line at the top of this file records their outcome.

**Setup gates (impeccable v3, canonical):** `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read. Register is **product** (`reference/product.md`) by first match on the surface in focus: every touched file is app UI in a task, where design SERVES the product and the bar is earned familiarity. NOT all of it is admin-only, and the difference matters for the browser note below: `components/diagrams/GalleryLightbox.tsx` renders on crew pages through `components/crew/DiagramsBlock.tsx` → `Gallery`, and `components/shared/ReportModal.tsx` through the crew footer's `ReportButton`. Both are still product register. `reference/critique.md` and `reference/audit.md` were each read before their half ran. Platform is `web`, so no native variant applies.

**Method.** `critique` ran **dual-agent**: Assessment A (design review) and Assessment B (detector + mechanical evidence) as two isolated sub-agents that never saw each other's output, synthesized here. `audit` ran as its own isolated agent. Not degraded — no half ran inline in the parent context. One harness note recorded because it would otherwise look like a silent skip: all three agents completed their reports but their return path went idle without delivering (the known shape recorded for PR #809), so each report was recovered verbatim from its own transcript. The assessments themselves are unaffected — they ran isolated, as the command requires.

**Browser pass: SKIPPED, with its reason.** Every surface in the diff is behind a seeded local DB plus a session: the admin surfaces need an authenticated admin session, and the two that also render on crew pages (`GalleryLightbox` via `components/crew/DiagramsBlock.tsx`, `ReportModal` via the crew footer's `ReportButton`) need a seeded show, a valid share token and a picked crew identity. Different gates, same conclusion — no live server was started and no overlay was injected. No claim of a user-visible overlay is made anywhere in this section.

### 12.1 Scores

| Half | Score | Band |
| --- | --- | --- |
| critique — Nielsen 10 | **35/40** | strong; weakest axis is #4 Consistency at 2/4, which is what the two P1s below are |
| audit — 5 dimensions | **19/20** | Excellent. A11y 3, Performance 4, Theming 4, Responsive 4, Anti-patterns 4 |

Anti-patterns verdict from both halves: **PASS, no tells.** Every swap is a 1px all-side `border` with widths untouched; no side stripe, no gradient text, no glassmorphism, no hero metric, no card grid, no eyebrow, no numbered scaffolding, no nested card, no bounce easing, and no card introduced.

### 12.2 Findings and dispositions

Severity is the HIGHER of the two halves where they overlap, deliberately: F1 and F2 are one shape that critique rated P1 and audit rated P2, and taking the reviewer's higher call rather than my own lower one is the honest default.

| # | Finding | Severity | Disposition |
| --- | --- | --- | --- |
| F1 | `components/diagrams/GalleryLightbox.tsx:773` — the `aria-hidden` demote chip keeps `border-border-strong` while the Reset chip it matches (`:708`, census row 20) moved. Same pill, same `bg-surface-raised`, same shadow; both can be up in one frame at opposite ends of the image | **P1** | **DEFERRED — `DEFERRED.md` entry `CONTROLOUTLINE-PAIRED-CHROME-WEIGHT-1` with its un-defer trigger, plus queue row `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`**, class-sweep exception (b)+(a). Non-interactive chrome keeping the border token IS §1.2a's scope paragraph, so moving it would be moving an element the ruling did not cover. Also recorded as a DESIGN.md §1.2a documented limit in the same commit |
| F2 | `components/admin/StagedPreviewBanner.tsx:65` — the `aria-current` chip keeps `border-border-strong` while its picker-link siblings at `:75` moved, so the entry marked current has the weakest boundary in its own row | **P1** | **DEFERRED — same `DEFERRED.md` entry, same queue row.** Spec §4.4 ratifies this site verbatim ("non-interactive chrome: outside the census, keeps its token"), so it is exception (b) outright. Recorded rather than dismissed: the 2026-08-14 rationale for moving six controls now points the other way, at chrome, and no rule covers that |
| F3 | Confirm-row Cancels are now a full step lighter than the trigger that summoned them — `components/admin/ArchiveShowButton.tsx:344` and `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266`, `border-border` at 1.15:1, are the in-place morph targets of controls this arc took to 3.35:1 | **P2** | **DEFERRED — ledger `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL`**, exception (b)+(a)+(c). Spec §2.1/§6 fence widening to `border-border` in both directions. The derived cover was run rather than the two named sites patched: **30** controls repo-wide carry `border-border` on a neutral fill, NINE of them on CREW surfaces the admin-scoped mockup never showed the user. Also filed to `DEFERRED.md` as `CONTROLOUTLINE-BORDER-TOKEN-NEUTRAL-FILL-1` with its un-defer trigger |
| F4 | `components/admin/showpage/ShareHub.tsx:800-801` — `max-sm:border-border` overrides the swap below 640px, so the venue-floor phone case does not get the stronger boundary | **P2** | **NO ACTION — already a ratified documented limit** (spec §6, 1.27:1 both themes, both ternary arms). Recorded here because the critique's twist is fair: the delta the comment describes grew from 1.59→1.15 to 3.35→1.15. That is a bigger step, not a new defect, and the limit already states the number |
| F5 | `DESIGN.md` — "Every neutral fill/container pairing in the app measures ≤1.13:1" is a false universal. The unenumerated `surface-raised`/`surface-sunken` pair measures **1.163:1** dark | **P3** | **FIXED in this commit.** Recomputed all six pairings from `app/globals.css`; the sentence now states the true bound (≤1.17:1, widest is 1.163:1 dark) AND keeps ≤1.13:1 scoped to the five pairings the app renders. This is exactly the false-universal class this arc filed as `BL-SPECLINT-ENUMERATED-UNIVERSAL-PARITY`, caught inside the arc that filed it |
| F6 | `components/diagrams/GalleryLightbox.tsx` chip comment still said the outline gives "slight" primacy over the chevrons — calibrated to 1.59:1, and the chevrons carry no border at all | **P3** | **FIXED in this commit.** Now reads "clear primacy over the borderless chevrons", with MED-5's intent recorded as strengthened rather than overturned. Edited at constant line count so census row 20 stays at `:693` |
| F7 | detector `broken-image` ×7 — `step3ReviewSections.tsx:3733`, `:3764`; `GalleryLightbox.tsx:14`, `:271`, `:1039`, `:1086`, `:1090` | — | **FALSE POSITIVE ×7, refuted by probe, not by argument.** Every hit is the literal text `<img>` inside a source comment. `grep -nE '<img[[:space:]]'` over both files returns nothing — there is not one `<img` opening tag with attributes in either file, so the rule cannot be describing a real element. None of the seven lines falls inside a changed hunk either. Not suppressed with an ignore rule, because the finding is the detector's to fix, not this diff's to hide |
| F8 | critique minor: `components/admin/wizard/step3ReviewSections.tsx:1415-1425` may argue from the superseded page-ground-only rule | — | **REFUTED against the live tree.** That comment argues FOR `border-text-faint` over `border-border` on a `bg-surface-sunken` ground and cites §1.2a — it is consistent with the WIDENED predicate, not with the superseded one. Recorded so a later round does not re-derive it |

**P0 = 0. P1 = 2, both deferred with a ledger entry each and a DESIGN.md documented limit.** That is what `dispositions=recorded` in the marker asserts, and the guard cross-checks the pair.

### 12.3 Pre-code mechanical checklist (step 5.5), re-verified post-swap

Run over ADDED lines in `app/**` and `components/**` only:

| Check | Result |
| --- | --- |
| em-dash in user-visible copy | **none.** (7 hits in added `DESIGN.md` prose — a design doc, not user-visible copy, and exempt) |
| straight-apostrophe literals | **none** |
| 44px tap targets untouched | `min-h-tap-min` −20/+20, `min-w-tap-min` −3/+3, `min-h-confirm-box` −1/+1 — every multiset equal |
| canonical type/token classes | **none** of `text-[`, `shadow-[`, `border-(--`, or a raw hex. The one bracket value, `min-w-[18rem]`, is present identically on both sides |
| no new colour token | `git diff origin/main...HEAD -- app/globals.css` is EMPTY |
| added `border-text-faint` | **23** = 22 class-attribute edits + 1 prose mention in the `GalleryLightbox` comment, which is the comment repair itself |

**Copy: no user-visible string changed anywhere in the diff**, so invariant 5 is N/A rather than passed. The only prose edited is a source comment.

### 12.4 What the gate confirmed rather than found

Recorded because a gate that only lists problems reads as if nothing was verified:

- All 21 swapped controls keep `focus-visible:ring-2 focus-visible:ring-focus-ring`, and the new border does not collide with it — the ring is orange (`#e06000` light / `rgba(255,160,71,.65)` dark) against a gray stroke.
- `hover:border-status-warn` on `components/admin/ArchiveShowButton.tsx:371-372` does not collide either: `#b26a16` / `#e9a23a` are separated from `text-faint` in both hue and value, so the one control whose hover moves the OUTLINE still lands somewhere unambiguous.
- `max-sm:border-border` survives on both `ShareHub` ternary arms — and the file carries a third occurrence at `:825` that the diff never touched, so adjacent-token survival holds one site wider than the plan's check assumed.
- Every contrast figure quoted in the brief and in the `GalleryLightbox` comment reproduces exactly from `app/globals.css`.
- Tokenising every changed line and normalising the swap yields an IDENTICAL multiset on both sides — the only deltas are prose words in the one comment. That single check proves at once that no focus ring, `dark:` variant, width, breakpoint or tap-target utility moved.
