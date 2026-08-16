# Control Outlines on Surface Fills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!--
The `impeccable-gate:` marker line is written by Task 6, in the SAME commit that runs the gate,
together with the verbatim names of both halves. It is deliberately absent here, and that is the
guard's intended lifecycle rather than a dodge: `tests/docs/_metaInvariant8Closeout.test.ts`
admits exactly three marker forms — RAN, `N/A — no UI surface`, and a template form — and at
plan-authoring time NONE of them is true. This diff has a UI surface, so N/A would be a lie, and
the gate has not run, so RAN would be a lie. A unit that names both halves must record their
OUTCOME; this plan has no outcome yet. Task 6 writes the marker and the names together.
-->

**Goal:** Ship the Option B ruling. DESIGN.md §1.2a's control-outline predicate becomes fill-equals-container; the 21 button/link elements standing on card and panel fills swap `border-border-strong` → `border-text-faint`; the switch tracks — **five render paths, not three** (spec §3.1) — keep their recipe unchanged in both states.

**Architecture:** **22 source-token edits across 21 elements in 16 files.** The count differs from the element count in both directions: two elements need two edits each (both arms of a ternary), and two elements share one edit (a file-local constant). Plus a DESIGN.md predicate rewrite, one regression-pin suite, two ledger filings, and the invariant-8 dual gate. No product logic, no new component, no new prop, no DB surface, no route, no migration. `lib/ui/actionClass.ts` already wears `border-text-faint` and is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, the existing static scanner at `tests/styles/interactiveScanCore.ts`.

**Spec:** `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` — adversarially APPROVED at spec round 8, zero findings, after eight rounds and twenty findings.

## What this plan does NOT build

Spec §5.2 **cut the switch-track classifier** after five mechanisms and five structural escapes. This plan therefore ships **no predicate, no `TRACK_REGISTRY`, no exemption classification, and no forward guard.** What ships is a regression pin: *did the 21 elements this PR changed stay changed*. That question is about a closed set this PR itself defines, so it needs no notion of what a switch track is. An implementer who finds themselves writing a function that decides whether an arbitrary element is a toggle has left the plan.

## Global Constraints

- Invariant 1 (TDD): every task in the red-contract region is failing test → minimal implementation → passing test → commit.
- Invariant 2 (advisory locks): **N/A** — no `pg_advisory*` surface, no RPC, no DB. `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- Invariant 5: N/A — no user-visible copy changes. Task 3 edits a source COMMENT only.
- Invariant 8: **APPLIES** — the diff touches `app/**` (non-API), `components/**` and `DESIGN.md`. Task 6 runs both halves and writes the marker in that same commit.
- Invariant 9: N/A — no Supabase call added or edited.
- Invariant 10: N/A — no mutating route, no `"use server"` action.
- Invariant 11: all work in this worktree, never the main checkout.
- Invariant 12: the `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS` in-progress marker comes off in **Task 8**, which is the PR's LAST commit, before the merge — never in a post-merge turn.
- Conventional commits, one per task.
- No migration → `validation-schema-parity` checklist **N/A**. No §12.4 catalog change → the three-lockstep rule is **N/A**.
- Heavy phases (`pnpm test`, `pnpm build`, `pnpm mutation:guards`) run under `pnpm heavy`; the scoped vitest runs named per task stay unwrapped.

### Meta-test inventory (declared)

- **CREATES** a new `_metaControlOutlineFill` suite plus its importable `controlOutlineScan` module, both under `tests/styles/` (new files; written without full-path citations because a citation to a file that does not yet exist is the invented-API shape the citation pass exists to catch).
- **MAY EXTEND** `tests/mutation/source/registry.ts` — conditional on Task 4's outcome, which is why AC-8 is written as a disjunction. The expected branch adds no row.
- **EXTENDS nothing else.** Not applicable, each with its reason: `tests/auth/_metaInfraContract.test.ts` (no auth boundary), `tests/messages/_metaAdminAlertCatalog.test.ts` (no admin alert), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock), `tests/components/tiles/_metaSentinelHidingContract.test.ts` (no tile sentinel), `tests/styles/_metaSubtleOnInteractive.test.ts` (a different policed token; its `token` field exists precisely so a second policed token cannot alias its rows).
- **Test wiring:** `BASE_INCLUDE` at `vitest.projects.ts:34` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the new suite is picked up with no config edit and no new path filter. Verified at plan time; stated because the writing-plans rule requires the wiring named either way.

### Mutation-family closure, and why AC-8 is a disjunction

`tests/mutation/source/registry.ts:1243-1255` carries a `NOT ENROLLED` note for **`tests/styles/subtleInteractiveScan.ts`** — a filter over `interactiveScanCore` plus two data declarations. Enrolled on 2026-08-14, it produced **ZERO mutants**, and the harness rejected the row by its own no-mutants condition, so the row "asserted nothing while looking like coverage." Its rule: *"Restructuring the module to grow mutation sites would be gaming the operator set, and a vacuous row is worse than an honest absence."*

`tests/styles/tapTargetScan.ts` is the row immediately AFTER that note and **is enrolled**, at `scoreFloor: 0.9`. Do not cite it as the zero-mutant case.

After spec §5.2's cut, this arc's census-reader module is the `subtleInteractiveScan` shape and then some — a census array plus one function that resolves it, with no branching decision left in it. **Outcome B (no mutants) is the expected branch**, so:

- **Outcome A — mutants exist.** Keep the row. Convergence for any review of the pin is the score plus an empty unaccepted-survivor set, both machine-computed.
- **Outcome B — no mutants.** Remove the row, record the honest absence with the harness output, in the `subtleInteractiveScan` style. Do NOT restructure the module to manufacture sites.

AC-8 is satisfied by EITHER branch, and the meta-test inventory above says "may extend" for the same reason. A plan whose acceptance criteria can only be met by its unexpected branch is a plan that fails on success.

### Four pre-dispatch mutants for the string-presence pin

Task 1's suite asserts class-token presence, so all four are run and recorded in the Task 1 commit before any review dispatch. **Four, and the table has four rows.**

| Mutant | Applied to | Expected |
| --- | --- | --- |
| (a) value emptied | one census row's `border-text-faint` deleted from source | suite REDS on that row's "carries" assertion |
| (b) expected content plus appended suffix | one census row set to `border-text-faint-x` | suite REDS — the whole-token match does not accept the suffixed form |
| (c) present but not live | `border-text-faint` added inside a JSX **comment** in a census file whose element was reverted | suite REDS — the scanner reads elements, not raw text, so a comment cannot satisfy the assertion. This is the mutant that proves the pin is not a grep |
| (d) discriminating parameter varied | the census resolved against an empty temp dir | the PREMISE reds (universe below floor), not the assertion — the case the premise exists for |

### Acceptance criteria (spec traceability)

- **AC-1** (spec §4.2): all 21 census elements carry `border-text-faint` and none carries `border-border-strong`.
- **AC-2** (spec §2, §3.1): the **five** switch-track render paths are unchanged in BOTH branches.
- **AC-3** (spec §5.2): the suite is a regression pin over the enumerated census. NO classifier, predicate, or track registry ships.
- **AC-4** (spec §5.3): the suite proves its own premise, asserts its census cardinality independently, requires every row to resolve, and carries a negative control with its own premise.
- **AC-5** (spec §4.1): DESIGN.md §1.2a states the fill-equals-container predicate and names both OUT families, with the switch tracks at five paths.
- **AC-6** (spec §6): DESIGN.md records the tracks' OFF ring at 1.43:1 light / 1.75:1 dark.
- **AC-7** (spec §4.3): the `GalleryLightbox` chip comment names the token actually present.
- **AC-8** (spec §5.4): EITHER a registry row exists and `pnpm mutation:guards` reports a score at or above its floor with an empty unaccepted-survivor set, OR the harness reported the no-mutants condition and the honest absence is recorded with its output. Both are passes.
- **AC-9** (spec §5.1): NO new ratio assertion and NO new DESIGN.md §1.2 table row. A diff that adds one has over-reached the ruling.
- **AC-10** (spec §3.2, §6): the residue the cover cannot see is filed with its probe transcripts.
- **AC-11** (spec §5.2, §6): the forward-guard ambition is filed with §5.2's five-escape table as its evidence.
- **AC-12** (spec §4.2): nothing outside the census moves — the 29 non-target `border-border-strong` occurrences in the 16 touched files survive.

### Plan-time probe record (run 2026-08-16 on the live tree)

Authored AND run, per the reconciliation-sweep rule:

```
scanInteractiveElements(process.cwd())   -> 362 elements (357 hasClassName, 13 unresolved)
filter border-border-strong              -> 24   (21 swap elements + 3 cover-visible tracks)
filter border-accent-edge                -> 3    (the cover-visible tracks only)
swap source occurrences                  -> 22   across 21 elements in 16 files
textual border-border-strong, 16 files   -> 51   (22 target + 29 that MUST remain)
switch-track recipe, source-wide         -> 5 render paths (spec §3.1)
```

The 29-vs-22 gap is what Task 2's fence is for: the census pin alone checks its own 21 rows and would not notice an implementer swapping a card, a chip, or one of the deliberately filed form fields.

---

<!-- tasks: depth=3 red-contract -->

### Task 1: The regression pin (RED)

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` red-state=authored red-target=`components/admin/UnignoreButton.tsx:57` why=`the suite asserts each census element carries border-text-faint; on the live tree all 21 still carry border-border-strong, verified at UnignoreButton.tsx:57, so all 21 row assertions fail until Task 2 swaps them` ac=AC-3,AC-4 -->

- [ ] **1.1** Create the `controlOutlineScan` module under `tests/styles/`, exporting exactly two things: `CENSUS`, the 21 spec §4.2 rows as `readonly { file: string; line: number }[]`, each with its spec citation in a comment; and `resolveCensus(rootDir: string)`, which runs `scanInteractiveElements` and returns, per census row, the element found at that `file`+`line` or `null`. **No predicate, no registry, no classification helper** (AC-3). Identity is `file`+`line` because file alone is not unique — `RoleMappingRow`, `BellPanel`, `StagedReviewCard`, `Step3ReviewModal` and `step3ReviewSections` each contribute two census rows out of 6-21 interactive elements in the same file.
- [ ] **1.2** Create the `_metaControlOutlineFill` suite under `tests/styles/` with these cases:
  - *premise* — `premise("scanner reaches the component tree", scanInteractiveElements(cwd).length, 200)`, executed unconditionally, never inside a `.each` callback. Measured universe 362.
  - *census cardinality, asserted independently of the census* — `expect(CENSUS.length).toBe(21)` against the **literal 21**, not against anything derived from `CENSUS`. Without this, deleting a row deletes its test case and the suite still passes: the premise still sees 362, the unresolved pin still sees 13, and every surviving row still resolves. This is the vacuous-iteration failure and it is the single most important case in the suite.
  - *row identities are unique* — `new Set(CENSUS.map(r => `${r.file}:${r.line}`)).size === 21`, so a duplicated row cannot stand in for a deleted one and keep the count at 21.
  - *every row resolves* — for each census row, assert `resolveCensus` found an element. A renamed file or moved element must RED here rather than silently drop out of the iteration.
  - *both directions per row* — the resolved element carries `border-text-faint` and does NOT carry `border-border-strong`. The second is not redundant: a two-arm ternary element can carry both if only one arm was edited.
  - *unresolved pin* — `scanInteractiveElements(cwd).filter(e => e.unresolved).length === 13`, an equality not a ceiling (spec §5.3). Spec §§3.2(c) and 6 both rest on this obligation existing.
  - *negative control* — a temp-dir fixture carrying `border border-border-strong bg-surface` on a `<button>` is found by the scan and FAILS the "does not carry" assertion, with its own `premise("fixture parsed and produced an element", found.length, 0)`. A fixture that fails to parse returns `[]` and makes the assertion vacuously true; the repo-scan premise is adjacent to that, not a substitute for it.
  - *fixture mechanism* — `tests/styles/interactiveScanCore.test.ts:41` has a local `scanFixture` helper (`mkdtempSync` + `writeFileSync` + scan). It is NOT exported. Replicate the six-line helper here rather than exporting it from a module the mutation registry already enrols.
- [ ] **1.3** Run the RED: `pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts`. Observe the per-row "carries `border-text-faint`" case failing on all 21 rows; the premise, cardinality, uniqueness, resolution, unresolved-pin and negative-control cases all pass. Record the observed failure count in the commit.
- [ ] **1.4** Run all four pre-dispatch mutants from the table above; record each result in the commit message.
- [ ] **1.5** Commit: `test(styles): pin the 21 swapped control outlines against regression`.

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
- [ ] **2.5** **Fence, run explicitly (AC-12):** `grep -rc "border-border-strong" <the 16 files>` must total **29**, down from 51. A total below 29 means a non-target occurrence was swapped; above 29 means a target edit was missed. Record the command and its output in the commit.
- [ ] **2.6** `pnpm exec eslint .` (canonical-Tailwind rule) and `pnpm format:check`.
- [ ] **2.7** Commit: `fix(admin): move control outlines on surface fills to the text ramp`.

<!-- tasks: end -->

---

<!-- tasks: depth=3 -->

> These six tasks are in a PLAIN region, deliberately. The `red-contract` fields are not declared
> for them because none has a production line whose absence makes a command fail: two edit
> root-level prose (`DESIGN.md`, `BACKLOG.md`), one edits a source comment, one drives an external
> harness whose "unmeasured" state is not a red, and one is a skill-driven human gate. The linter
> also correctly refuses a root-level bare filename as a `red-target`. Declaring the fields anyway
> would be a marker asserting a red it cannot point at — which is exactly the defect the
> red-contract grammar exists to catch.

### Task 3: GalleryLightbox comment correction

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineFill.test.ts` ac=AC-7 -->

- [ ] **3.1** `components/diagrams/GalleryLightbox.tsx:686` carries a comment reading `` `border-border-strong` gives the chip slight visual primacy over the chevrons when active (critique MED-5) ``. After Task 2 that token is no longer on the chip. Update the comment to name `border-text-faint` and record that the MED-5 intent is STRENGTHENED, not overturned (1.59/1.50 → 3.35/3.53 on `surface-raised`, spec §4.3).
- [ ] **3.2** **Verify precisely — the file legitimately retains one occurrence.** After Tasks 2 and 3, `grep -n "border-border-strong" components/diagrams/GalleryLightbox.tsx` must return **exactly one line, `773`** — the non-interactive overlay chip, which is outside the census and keeps its token. Zero hits would mean line 773 was wrongly swapped; two or more means the comment or the chip was missed.
- [ ] **3.3** Commit: `docs(diagrams): correct the lightbox chip's outline-token comment`.

### Task 4: Mutation-registry enrolment — attempted, both outcomes pre-committed

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-8 -->

**Do 4.1-4.2 first and let the harness decide the branch. Do not pre-judge it.**

- [ ] **4.1** Draft one `GuardSurface` row for the new census-reader module, copying the shape of the `tapTargetScan` row at `tests/mutation/source/registry.ts:1256`: `sourcePath`, `suitePaths` (Task 1's suite), `operators`, `scoreFloor`, and a `control` edit the suite MUST notice (the control proves the overlay is live — a harness whose overlay silently failed reports a PERFECT score with every mutant run against clean source).
- [ ] **4.2** Run `pnpm heavy pnpm mutation:guards`. Record the full output.
- [ ] **4.3** **Outcome A — the row yields mutants.** Record score and the full survivor list; for every survivor either strengthen the suite or add an `accepted` row with its reason. The unaccepted-survivor set must be empty. Keep the row.
- [ ] **4.4** **Outcome B — the harness reports its no-mutants condition (the expected branch).** REMOVE the row. Do NOT restructure the census-reader module to manufacture mutation sites — the registry's own comment names that as gaming the operator set, and a vacuous row is worse than an honest absence. Add a registry COMMENT in the **`subtleInteractiveScan`** style (`tests/mutation/source/registry.ts:1243`) recording the attempt, the zero-mutant output, and the structural reason: a census array plus one resolver over an already-enrolled core has no relational, equality, logical, integer-literal, regex-quantifier or removable-statement site.
- [ ] **4.5** Either way, paste the harness output into the commit message — the outcome is evidence, not a claim. Both branches satisfy AC-8.
- [ ] **4.6** Commit: `test(styles): enrol the control-outline pin` (A) or `test(styles): record the control-outline pin as a no-mutants surface` (B).

### Task 5: DESIGN.md §1.2a predicate rewrite

<!-- task: red=`pnpm spec:lint DESIGN.md` ac=AC-5,AC-6,AC-9 -->

- [ ] **5.1** Rewrite the predicate at `DESIGN.md:181` per spec §4.1's quoted text: fill-equals-container, with both OUT families named — weight-bearing accent fills, and the switch tracks at **five** render paths (spec §3.1), never three.
- [ ] **5.2** Replace the sentence at `DESIGN.md:236` that calls surface-filled controls the open question and gives a stale count of 23. The question is closed. State the ruling and its date.
- [ ] **5.3** Add the switch-track OFF ring documented limit (1.43:1 light / 1.75:1 dark) per spec §6, naming all five paths.
- [ ] **5.4** **Add NO new §1.2 ratio row** (AC-9). `text-faint` against all four neutral grounds is already at `DESIGN.md:141`. Confirm by diff that §1.2's table is untouched.
- [ ] **5.5** `pnpm spec:lint DESIGN.md` clean of hard findings; `pnpm vitest run tests/styles/secondary-action-contrast.test.ts` still green.
- [ ] **5.6** Commit: `docs(design): ratify the fill-equals-container control-outline predicate`.

### Task 6: Invariant-8 impeccable dual-gate

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-1,AC-5 -->

- [ ] **6.1** Canonical v3 setup gates: the skill's context load (PRODUCT.md + DESIGN.md), then the register reference read (the brand or product register, per the skill).
- [ ] **6.2** Run the FIRST half of the invariant-8 dual gate (the critique half) on the affected diff.
- [ ] **6.3** Run the SECOND half (the audit half) on the affected diff.
- [ ] **6.4** Record every finding and its disposition in §12 below. P0 and P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry.
- [ ] **6.5** Pre-code mechanical checklist, re-verified post-swap: em-dash ban in user-visible copy (no copy changed — confirm), apostrophe literals, 44px tap targets untouched, canonical type/token classes, no new colour token introduced.
- [ ] **6.6** In the SAME commit, write BOTH: (a) the `impeccable-gate:` marker line at the top of this file in the RAN form `impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>` — `dispositions=recorded` iff `p0 + p1 > 0`, which the guard cross-checks; and (b) the verbatim names of both gate halves in §12, which is what makes this unit "declare" the gate. Replace the explanatory comment at the top of this file with the marker. Then the `red=` command above must pass.
- [ ] **6.7** Commit: `docs(design): record the invariant-8 dual-gate findings for the outline swap`.

### Task 7: File the residue and the forward-guard ambition

<!-- task: red=`pnpm vitest run tests/docs/` ac=AC-10,AC-11 -->

- [ ] **7.1** Add a `BL-` entry covering both families from spec §3.2: text-entry fields (`components/admin/BellPanel.tsx:836`, `components/admin/BellPanel.tsx:847`, `components/admin/wizard/step3ReviewSections.tsx:4171`) and outlines painted on a nested child (`components/admin/OnboardingWizard.tsx:240`, `components/admin/ShowRowActions.tsx:650`, `components/admin/wizard/CrewRowActions.tsx:273`, `components/admin/wizard/VenueMapTile.tsx:123`).
- [ ] **7.2** That entry carries **Reachability:** PROBED with spec §3.2's transcripts inline (the scanner admits `<input>` only at `type="checkbox"`/`"radio"` per `tests/styles/interactiveScanCore.ts:868`; nested-child elements report `strong=false`), the class-sweep exception **(a)** with its reason per family, and `components/admin/wizard/VenueMapTile.tsx:123` named FIRST as the closest to the 21.
- [ ] **7.3** Add a SECOND `BL-` entry for the forward-guard ambition (spec §5.2, §6), carrying §5.2's five-mechanism / five-escape table verbatim so the next attempt starts from five closed escapes. **Reachability:** PROBED — every escape was demonstrated against a live mechanism during spec review.
- [ ] **7.4** Commit: `docs(backlog): file the control-outline residue and the forward-guard ambition`.

### Task 8: Ledger archive and marker removal (LAST commit)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-1 -->

- [ ] **8.1** Archive `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`, removing its `**Status:** IN PROGRESS · **Branch:** …` marker in the SAME commit — archives categorically reject in-flight entries, so the marker cannot ride along (invariant 12).
- [ ] **8.2** The archived entry states the correction that `BACKLOG.md:243` has wrong: the tracks' OFF-state boundary is NOT "pinned in §1.2 against `--color-accent-edge`". §1.2 pins the ON half; the OFF half has no ratio row and no test pin (spec §3.1). Do not let a false claim outlive the arc that disproved it.
- [ ] **8.3** Add the `StagedPreviewBanner` picker link to `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`'s site list at 2.79 dark (spec §4.4), and **derive** that entry's new counts from the edited list rather than retyping them.
- [ ] **8.4** `pnpm vitest run tests/docs/` — ledger, closeout and review-round meta-tests green.
- [ ] **8.5** Commit: `docs(backlog): archive BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS`. **This is the PR's last commit before the merge.**

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

<!-- filled by Task 6, together with the marker line at the top of this file -->
