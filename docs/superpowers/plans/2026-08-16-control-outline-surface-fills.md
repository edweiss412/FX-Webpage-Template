# Control Outlines on Surface Fills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!--
The `impeccable-gate:` marker line is written by Task 6, in the SAME commit that runs the gate,
together with the verbatim names of both halves. It is deliberately absent here, and that is the
guard's intended lifecycle rather than a dodge: `tests/docs/_metaInvariant8Closeout.test.ts`
admits exactly three marker forms — RAN, `N/A — no UI surface`, and a template form — and at
plan-authoring time NONE of them is true. This diff has a UI surface, so N/A would be a lie, and
the gate has not run, so RAN would be a lie. A unit that names both halves must record their
OUTCOME; this plan has no outcome yet. Task 6.6 writes the marker and the names together.
-->

**Goal:** Ship the Option B ruling. DESIGN.md §1.2a's control-outline predicate becomes fill-equals-container; the 21 button/link controls standing on card and panel fills swap `border-border-strong` → `border-text-faint`; the three switch tracks keep their recipe unchanged in both states. A new structural guard makes the population self-maintaining rather than a list someone has to remember.

**Architecture:** **22 source occurrences across 21 elements in 16 files** — two elements need two edits each (both ternary arms) and two elements SHARE one edit (a file-local constant), so 21 + 2 − 1 = 22; see the swap-arity note below, plus one new test-side module and suite. No product logic changes, no new component, no new prop, no DB surface, no route, no migration. `lib/ui/actionClass.ts` already wears `border-text-faint` and is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing static scanner at `tests/styles/interactiveScanCore.ts`, the source-mutation harness at `tests/mutation/source/`.

**Spec:** `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` (Option B ratified by the user 2026-08-16; adversarially APPROVED at spec round 8, 0 findings).

## Global Constraints

- Invariant 1 (TDD): every task is failing test → minimal implementation → passing test → commit.
- Invariant 2 (advisory locks): **N/A** — this plan touches no `pg_advisory*` surface, no RPC, no DB. Holder topology unchanged; `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- Invariant 5 (no raw error codes in UI): N/A — no user-visible copy changes. Task 3 edits a source COMMENT only.
- Invariant 8 (impeccable dual-gate): **APPLIES** — the diff touches `app/**` (non-API), `components/**` and `DESIGN.md`. Task 6 runs BOTH halves of the gate and, in that same commit, writes the `impeccable-gate:` marker line together with the verbatim half names (see the comment at the top of this file for why neither is present yet).
- Invariant 9 (Supabase call boundary): N/A — no Supabase call is added or edited.
- Invariant 10 (mutation-surface observability): N/A — no mutating route, no `"use server"` action added or edited.
- Invariant 11: all work in this worktree (`/Users/ericweiss/FX-worktrees/control-outline-surface-fills`), never the main checkout.
- Invariant 12: the `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS` in-progress marker comes off in Task 7, the PR's LAST commit, before the merge — never in a post-merge turn.
- Conventional commits, one per task. Scope `design` for DESIGN.md/spec, `styles` for the guard, `admin`/`diagrams` for component swaps, `docs` for BACKLOG.
- No migration → `validation-schema-parity` checklist **N/A**. No §12.4 catalog row change → the three-lockstep-update rule is **N/A**.
- Heavy phases (`pnpm test`, `pnpm build`) run under `pnpm heavy`; the scoped vitest runs named per task stay unwrapped.

### Meta-test inventory (declared, per writing-plans rule)

- **CREATES** a new `_metaControlOutlineFill` suite plus its importable `controlOutlineScan` module, both under `tests/styles/` (new files; written without full-path citations because a citation to a file that does not yet exist is the invented-API shape the citation pass exists to catch). This is the plan's one structural guard.
- **EXTENDS** `tests/mutation/source/registry.ts` with one `GuardSurface` row for that module (Task 5).
- **EXTENDS nothing else.** Explicitly not applicable: `tests/auth/_metaInfraContract.test.ts` (no auth boundary), `tests/messages/_metaAdminAlertCatalog.test.ts` (no admin alert), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock), `tests/components/tiles/_metaSentinelHidingContract.test.ts` (no tile sentinel), `tests/styles/_metaSubtleOnInteractive.test.ts` (a different policed token — spec §1; its `token` field exists precisely so a second policed token cannot alias its rows).
- **Test wiring:** `BASE_INCLUDE` at `vitest.projects.ts:34` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the new suite is picked up with **no config edit and no new path filter**. Verified at plan time; stated because the writing-plans rule requires the wiring to be named either way.

### Mutation-family closure, and the honest-absence branch (declared up front — this is the review's convergence set)

Enrolment is **attempted** in Task 5, and the plan commits in advance to BOTH admissible outcomes, because the precedent says the likely one is the second.

`tests/mutation/source/registry.ts:1243-1255` carries a `NOT ENROLLED` note for **`tests/styles/subtleInteractiveScan.ts`** (NOT `tapTargetScan.ts`, which is the row immediately after and IS enrolled at `scoreFloor: 0.9` — spec §5.4 records that mis-citation). `subtleInteractiveScan` is a filter over `interactiveScanCore` plus two data declarations; enrolled on 2026-08-14 it produced **ZERO mutants** and the harness rejected the row by its own no-mutants condition, so it "asserted nothing while looking like coverage." The note's rule: *"Restructuring the module to grow mutation sites would be gaming the operator set, and a vacuous row is worse than an honest absence."**

After spec §5.2's classifier cut, this arc's census-reader module is that same shape and then some — a census array plus one function that resolves it through `interactiveScanCore`, with no predicate and no branching decision left in it. So:

- **Outcome A — the module yields mutants.** Convergence criterion for any review of Task 1/5 is the mutation score plus an empty unaccepted-survivor set, both machine-computed. A reviewer-proposed NEW operator family is admissible only with a live escaping mutant demonstrated against the shipped guard.
- **Outcome B — the harness reports no mutants.** This is NOT a failure to work around. Record the honest absence the way `tapTargetScan` did — the probe output showing zero mutants, and the structural reason — and do NOT enrol. Do NOT restructure the module to manufacture sites. In that case the guard's convergence criterion falls back to Task 1's five cases plus the four pre-dispatch mutants, and the plan says so rather than leaving a reviewer to infer it.

Outcome B is also the AGENTS.md posture for a surface the registry cannot express: re-disposition honestly with the probe that shows it, never enrol symbolically. Deciding this at plan time rather than at review time is the whole point — the step3-a11y arc spent six of nine diff rounds discovering it late.

**The real coverage for this guard is Task 1's negative and positive controls**, which are mutants in everything but name: they construct an input the predicate must classify each way, and they run on every CI invocation rather than only under the harness.

### Four pre-dispatch mutants for string-presence guards

Task 1's suite is a class-string-presence guard, so all four mutants are run and their results recorded in the Task 1 commit message before any review dispatch:

| Mutant | Applied to | Expected |
| --- | --- | --- |
| (a) value emptied | either token of `isSwitchTrackExempt`'s ON conjunct emptied | guard reds — every track becomes non-exempt |
| (b) expected content plus appended suffix | a swapped site set to `border-text-faint-x` | guard reds — the site is no longer covered NOR exempt, and the ratio pin's token list rejects it |
| (c) present but not live | `border border-border-strong` added inside a JSX **comment** in a swapped file | guard STAYS GREEN — recorded as the scanner's documented limit; `scanInteractiveElements` parses elements, not raw text, which is exactly why the spec forbids a grep cover |
| (d) discriminating parameter varied | `controlOutlineCover(rootDir)` pointed at an empty temp dir | the PREMISE reds (universe below floor), not the assertion — this is the case the premise exists for |
| (e) **registry row deleted** | remove a track file from `TRACK_REGISTRY` | guard reds — the cover's exempt set no longer equals the registry subset |
| (f) **registry row that stopped being a toggle** | a row's file loses its accent-edge branch | guard reds on the recipe-presence case |

### Acceptance criteria (spec traceability)

- **AC-1** (spec §4.2): all 21 census sites carry `border-text-faint` and none carries `border-border-strong`.
- **AC-2** (spec §2, §5.2): the three switch tracks are unchanged in BOTH branches — `border-accent-edge bg-accent` ON, `border-border-strong bg-surface-sunken` OFF.
- **AC-3** (spec §5.2): each of the 21 census rows RESOLVES through the scanner, carries `border-text-faint`, and does not carry `border-border-strong`. NO switch-track classifier ships — reintroducing one violates the ratified kill.
- **AC-4** (spec §5.3): the suite proves its own premise executably, flags a constructed non-exempt fixture, and exempts a constructed accent-edge fixture.
- **AC-5** (spec §4.1): DESIGN.md §1.2a states the fill-equals-container predicate and names both OUT families (weight-bearing fills, switch tracks) explicitly.
- **AC-6** (spec §6): DESIGN.md records the tracks' OFF ring at 1.43:1 light / 1.75:1 dark as a documented limit.
- **AC-7** (spec §4.3): the `GalleryLightbox` chip comment names the token actually present.
- **AC-8** (spec §5.4): the guard module is enrolled in `tests/mutation/source/registry.ts` and `pnpm mutation:guards` reports a score at or above its floor with an empty unaccepted-survivor set.
- **AC-11** (spec §5.2, §6): the forward-guard ambition is filed with §5.2's five-escape table as its evidence.
- **AC-10** (spec §3.2, §6): the residue the cover cannot see is filed as one `BL-` entry carrying its probe transcripts and its class-sweep exception, and is NOT silently dropped.
- **AC-9** (spec §5.1): NO new ratio assertion and NO new DESIGN.md §1.2 table row — `text-faint` against all four neutral grounds is already pinned. This AC is a NEGATIVE: a diff that adds one has over-reached the ruling.

### Plan-time probe record (run 2026-08-16, this session, on the live tree)

Authored AND run, per the reconciliation-sweep rule. These are the numbers the tasks below depend on:

```
scanInteractiveElements(process.cwd())          -> 362 elements
  ... hasClassName                              -> 357
  ... unresolved                                -> 13
filter border-border-strong                     -> 24   (21 controls + 3 switch tracks)
filter border-accent-edge                       -> 3    (EXACTLY the three switch tracks)
grep -rn "border border-border-strong" app components --include="*.tsx" | wc -l -> 73
```

The `border-accent-edge` line is the load-bearing one: it is 3, and it is the SAME three files as the tracks. So the exemption predicate in spec §5.2 is exact in both directions on the live tree — no non-track element would be wrongly exempted, and no track would be missed. The premise floor in Task 1 is set at `> 200` against a measured universe of 362, leaving headroom for ordinary deletions without making the premise a second assertion.

The 13 `unresolved` elements are the scanner's surfaced-signal half (spec §7 threat fence): they are reported, not silently dropped. This plan does not attempt to resolve them.

---

<!-- tasks: depth=3 red-contract -->

### Task 1: The structural guard (RED)

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/admin/UnignoreButton.tsx:57` why=`the cover returns 24 elements of which 21 are not accent-edge-exempt, so the "cover contains only exempt elements" assertion fails on 21 counts until Task 2 swaps them` ac=AC-3,AC-4 -->

Creates the module and suite. The suite is RED at this point because the swap has not happened.

- [ ] **1.1** Create the `controlOutlineScan` module under `tests/styles/`, exporting `swappedCensus(rootDir): ScanElement[]` — the enumerated §4.2 census resolved through `scanInteractiveElements` — and `CENSUS: readonly {file: string}[]`. **No classifier.** Spec §5.2 cut it after five rounds and five structural escapes; do not reintroduce a switch-track predicate, a `TRACK_REGISTRY`, or any element-classification helper.
- [ ] **1.2** Create the `_metaControlOutlineFill` suite under `tests/styles/` with the §5.3 cases:
  - *premise* — `premise("scanner reaches the component tree", scanInteractiveElements(cwd).length, 200)`, unconditional, never inside a `.each` callback. Measured universe 362.
  - *every census row resolves* — assert each of the 21 rows was FOUND before asserting anything about its classes. A renamed file or moved element must RED, not silently drop out of the iteration. This is the one thing an enumerated pin must get right.
  - *both directions per row* — carries `border-text-faint`, and does NOT carry `border-border-strong`. The second is not redundant: a two-arm ternary site can carry both if only one arm was edited (the 23-vs-21 trap).
  - *unresolved pin* — `scanInteractiveElements(cwd).filter(e => e.unresolved).length === 13`, an equality not a ceiling (spec §5.3). Sections 3.2(c) and 6 both rest on this obligation existing; a fourteenth unresolvable element must red here and be triaged rather than join a silent pool.
  - *negative control* — a temp-dir fixture carrying `border border-border-strong bg-surface` is found by the scan and FAILS the "does not carry" assertion, with its own `premise("fixture parsed and produced an element", cover.length, 0)`.
- [ ] **1.3** Run the RED: `pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts`. Observe the *main* case failing with 21 named sites; the other cases pass. Record the observed failure count in the commit.
- [ ] **1.4** Run all four pre-dispatch mutants from the table above; record each result in the commit message.
- [ ] **1.5** Commit: `test(styles): pin the control-outline cover to accent-edge exemptions only`.

### Task 2: The swap — 21 sites (GREEN)

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=live red-target=`components/admin/UnignoreButton.tsx:57` why=`Task 1 committed the suite observed-red on 21 sites; this task turns the SAME command green by swapping exactly those 21 tokens` ac=AC-1,AC-2,AC-9 -->

- [ ] **2.1** In each of the 21 elements in spec §4.2, replace **every** `border-border-strong` token with `border-text-faint`. Nothing else on the line changes — not the `border` utility, not padding, not hover, not disabled.
- [ ] **2.1a** **Swap arity — the source count is 22, neither 21 nor 23.** It differs from the element count in BOTH directions, measured at plan time. Two elements need TWO edits each (both ternary arms):
  - `components/admin/ArchiveShowButton.tsx:365` — `compact ? A : B`, both arms.
  - `components/admin/showpage/ShareHub.tsx:777` — the two-arm className at `components/admin/showpage/ShareHub.tsx:800` and `components/admin/showpage/ShareHub.tsx:801`.
  Editing one arm and not the other ships a control whose outline changes with a viewport or a prop.
  And two elements SHARE one edit: `app/admin/settings/roles/RoleMappingRow.tsx:211` and `app/admin/settings/roles/RoleMappingRow.tsx:343` both read the file-local constant `outlineBtn` at `app/admin/settings/roles/RoleMappingRow.tsx:47`, so one edit moves both. **21 + 2 − 1 = 22.** The §5.3 per-row assertions are what catch a missed arm, since both arms belong to one element.
- [ ] **2.1b** **Do not touch `border-border` tokens.** `ShareHub.tsx:800-801` also carries `max-sm:border-border` in both arms — a DIFFERENT token that stays. A regex on `border-border` rather than `border-border-strong` corrupts it. Match the whole token.

**Per-file occurrence checklist (derived at plan time; the implementer ticks these off).** The
count is `border-border-strong` OCCURRENCES per file among swap elements only — a file with 2
may be two separate elements (`RoleMappingRow`) or one element with two ternary arms
(`ArchiveShowButton`, `ShareHub`). The tracks' file is absent by construction.

| Occurrences | File |
| --- | --- |
| 2 | `app/admin/settings/roles/RoleMappingRow.tsx` |
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
| **23** | **16 files** |

- [ ] **2.2** Do NOT touch `components/admin/PublishedToggle.tsx:305`, `components/admin/settings/AutoPublishToggle.tsx:136`, or `components/admin/settings/NotifyToggle.tsx:144` — the three OFF-branch track rings are exempt by the ruling (spec §2).
- [ ] **2.3** Do NOT touch the non-control `border border-border-strong` lines in the same files (cards, chips, tiles, popovers, alert plates — e.g. `components/admin/PublishedToggle.tsx:202` and `components/admin/PublishedToggle.tsx:249`, which are a `role="group"` popover and a `role="alert"` card). The derived cover is the contract; a file-wide find-replace is a defect.
- [ ] **2.4** GREEN: the same command from 2's `red=` now passes, all five cases.
- [ ] **2.5** Re-run the cover by hand and confirm it returns exactly 3 elements, all tracks.
- [ ] **2.6** `pnpm exec eslint .` (canonical-Tailwind rule) and `pnpm format:check`.
- [ ] **2.7** Commit: `fix(admin): move control outlines on surface fills to the text ramp`.

### Task 3: GalleryLightbox comment correction

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:687` why=`no executable red exists for a comment; this task's check is the grep in 3.2, and it rides the same suite to prove the swap did not regress` ac=AC-7 -->

- [ ] **3.1** In `components/diagrams/GalleryLightbox.tsx`, the block comment above the reset chip says `` `border-border-strong` gives the chip slight visual primacy over the chevrons when active (critique MED-5) ``. After Task 2 that token is no longer on the element. Update the comment to name `border-text-faint` and record that the MED-5 intent is STRENGTHENED, not overturned (1.59/1.50 → 3.35/3.53 on `surface-raised`, spec §4.3).
- [ ] **3.2** Verify no stale reference survives: `grep -n "border-border-strong" components/diagrams/GalleryLightbox.tsx` returns nothing.
- [ ] **3.3** Commit: `docs(diagrams): correct the lightbox chip's outline-token comment`.

### Task 4: Mutation-registry enrolment — attempted, with a pre-committed honest-absence branch

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:1256` why=`the harness only mutates enrolled surfaces, so before the row exists the guard is unmeasured; the row plus its control edit make the run report either a real score or the harness's own no-mutants rejection, and both are recorded outcomes` ac=AC-8 -->

**Do 5.1-5.2 first and let the harness decide the branch. Do not pre-judge it.**

- [ ] **4.1** Draft one `GuardSurface` row for the new census-reader module, copying the shape of the `tapTargetScan` row at `tests/mutation/source/registry.ts:1256-1268`: `sourcePath`, `suitePaths` (the Task 1 suite), `operators`, `scoreFloor`, and a `control` edit the suite MUST notice (the control proves the overlay is live — a harness whose overlay silently failed reports a PERFECT score with every mutant run against clean source).
- [ ] **4.2** Run `pnpm heavy pnpm mutation:guards`. Record the full output.
- [ ] **4.3** **If the row yields mutants (Outcome A):** record score and the full survivor list; for every survivor either strengthen the suite or add an `accepted` row with its reason. The unaccepted-survivor set must be empty. Keep the row.
- [ ] **4.4** **If the harness reports the no-mutants condition (Outcome B — the outcome the `subtleInteractiveScan` precedent predicts, and the expected branch):** REMOVE the row. Do NOT restructure the census-reader module to manufacture mutation sites — the registry's own comment names that as gaming the operator set, and a vacuous row is worse than an honest absence. Instead add a registry COMMENT in the `subtleInteractiveScan` style recording: the attempt, the zero-mutant output, and the structural reason (a filter over an already-enrolled core plus one data declaration has no relational, equality, logical, integer-literal, regex-quantifier or removable-statement site; every decision it makes belongs to `interactiveScanCore`, which IS enrolled and IS mutated through a suite that also decides this module's verdicts).
- [ ] **4.5** Either way, paste the harness output into the commit message — the outcome is evidence, not a claim.
- [ ] **4.6** Commit: `test(styles): enrol the control-outline guard` (Outcome A) or `test(styles): record the control-outline guard as a no-mutants surface` (Outcome B).

<!-- tasks: end -->

---

<!-- tasks: depth=3 -->

> These four tasks are in a PLAIN region, deliberately. The `red-contract` fields are not
> declared for them because none has a production line whose absence makes a command fail:
> two edit root-level prose (`DESIGN.md`, `BACKLOG.md`), one is a skill-driven human gate, and
> the linter correctly refuses a root-level bare filename as a `red-target`. Declaring the
> fields anyway would be a marker that asserts a red it cannot point at.

### Task 5: DESIGN.md §1.2a predicate rewrite

<!-- task: red=`pnpm spec:lint DESIGN.md` ac=AC-5,AC-6,AC-9 -->

- [ ] **5.1** Rewrite the predicate per spec §4.1's quoted text: fill-equals-container, with both OUT families named (weight-bearing accent fills; the three switch tracks).
- [ ] **5.2** Replace the sentence at `DESIGN.md:236` that calls surface-filled controls the open question and gives a stale count of 23. The question is now closed. State the ruling and its date.
- [ ] **5.3** Add the switch-track OFF ring documented limit (1.43:1 light / 1.75:1 dark) per spec §6.
- [ ] **5.4** **Add NO new §1.2 ratio row** (AC-9). `text-faint` against all four neutral grounds is already there at `DESIGN.md:141-145`. Confirm by diff that §1.2's table is untouched.
- [ ] **5.5** `pnpm spec:lint DESIGN.md` clean of hard findings; `pnpm vitest run tests/styles/secondary-action-contrast.test.ts` still green (it asserts the DESIGN-pinned ratios).
- [ ] **5.6** Commit: `docs(design): ratify the fill-equals-container control-outline predicate`.

### Task 6: Invariant-8 impeccable dual-gate

<!-- task: red=`echo 'manual gate — see §12'` ac=AC-1,AC-5 -->

- [ ] **6.1** Canonical v3 setup gates: the skill's context load (PRODUCT.md + DESIGN.md), then the register reference read (the brand or product register, per the skill).
- [ ] **6.2** Run the FIRST half of the invariant-8 dual gate (the critique half) on the affected diff.
- [ ] **6.3** Run the SECOND half (the audit half) on the affected diff.
- [ ] **6.4** Record every finding and its disposition in §12 below. P0 and P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry.
- [ ] **6.5** Pre-code mechanical checklist, re-verified post-swap: em-dash ban in user-visible copy (no copy changed — confirm), apostrophe literals, 44px tap targets untouched, canonical type/token classes, no new colour token introduced.
- [ ] **6.6** In the SAME commit, write BOTH: (a) the `impeccable-gate:` marker line at the top of this file, in the RAN form `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>` — `dispositions=recorded` iff `p0 + p1 > 0`, which the guard cross-checks; and (b) the verbatim names of both gate halves in §12, which is what makes this unit "declare" the gate. Replace the explanatory comment at the top of this file with the marker. Then `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` must pass.
- [ ] **6.7** Commit: `docs(design): record the invariant-8 dual-gate findings for the outline swap`.

### Task 7: File the residue the cover cannot see

<!-- task: red=`pnpm vitest run tests/docs/` ac=AC-10 -->

- [ ] **7.1** Add a `BL-` entry covering both families from spec §3.2: form fields (`components/admin/BellPanel.tsx:836` and `components/admin/BellPanel.tsx:847`, `components/admin/wizard/step3ReviewSections.tsx:4171`) and nested painted children (`components/admin/OnboardingWizard.tsx:240`, `components/admin/ShowRowActions.tsx:650`, `components/admin/wizard/CrewRowActions.tsx:273`, `components/admin/wizard/VenueMapTile.tsx:123`).
- [ ] **7.2** The entry carries: **Reachability:** PROBED, with the §3.2 transcripts inline (the scanner returns no `input` rows for `BellPanel`; nested-child elements report `strong=false`); the **class-sweep exception (a)** with its reason stated per family; and `VenueMapTile.tsx:123` named FIRST as the closest to the 21.
- [ ] **7.3** State the first scheduled step: decide whether an `<input>` border is a control outline under §1.2a, and whether an open/active state treatment on a child (closed state `border-border`) is a resting outline or a state cue.
- [ ] **7.4** Add a SECOND `BL-` entry for the forward-guard ambition (spec §5.2, §6): a guard that keeps the control-outline population correct going forward. Its body carries spec §5.2's five-mechanism / five-escape table verbatim, so the next attempt starts from five closed escapes rather than from scratch. **Reachability:** PROBED — every escape in that table was demonstrated against a live mechanism during spec review.
- [ ] **7.5** Commit: `docs(backlog): file the control-outline residue and the forward-guard ambition`.


### Task 8: Ledger reconciliation and marker removal (LAST commit)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-1 -->

- [ ] **8.1** Archive `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`, removing its `**Status:** IN PROGRESS · **Branch:** …` marker in the SAME commit (invariant 12: an archive categorically rejects in-flight entries, so the marker cannot ride along).
- [ ] **8.2** Add the `StagedPreviewBanner` picker link to `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`'s site list at 2.79 dark (spec §4.4). Update that entry's count from eleven controls across ten sites to twelve across eleven — **derive the new counts from the edited list, do not retype them**.
- [ ] **8.3** `pnpm vitest run tests/docs/` — ledger and closeout meta-tests green.
- [ ] **8.4** Commit: `docs(backlog): archive BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`.

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

<!-- filled by Task 6 -->
