# Step 3 tap-cluster implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/2026-08-15-step3-tap-cluster.md`; it is canonical (invariant 7) and this plan implements it without overriding it.

**Goal:** land the three ratified step-3 layout changes (title-link upward bleed; transport grid `items-start` + contact-cell compaction; contact chips + site-4 at-rest underline) on ONE branch, `fix/step3-tap-cluster`, TDD per task, dual-gated, CI-green merged; graduate the three BACKLOG entries.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/2026-08-15-step3-tap-cluster.md` · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants exercised here: 1 (TDD), 6 (conventional commits), 8 (impeccable dual gate — admin UI), 11 (worktree-only), 12 (claims: the branch already carries the three markers, declared by the authoring session; they come off in the archive commit, Task 4).
- UI hard rule: this is Opus-owned UI work; pre-code mechanical gate before Task 1's GREEN (44px floors via `min-h-tap-min`/derived padding, canonical tokens only, no new copy strings — the diff adds ZERO user-visible copy, so the em-dash/apostrophe rules are trivially met; no token is repurposed, so no new contrast pin).
- Heavy-slot discipline: every non-interactive Playwright run below goes through `pnpm heavy` (machine-wide semaphore; AGENTS.md heavy-phase rule).
- e2e harness readiness (writing-plans rule): (a) server boot = the repo Playwright config's port-3000 dev webServer, project `mobile-safari` (`playwright.config.ts:64`, viewport 390×844; the suite's own `WIDE_VIEWPORT` block covers the ≥sm case); (b) readiness gate = the suite's existing `gotoStep3Card` retry + per-premise `toBeVisible` assertions (`tests/e2e/tap-target-inline-controls.layout.spec.ts:161-177`) — never `networkidle`; (c) detach-safety = the suite's single-`evaluate` `rectsWithin` snapshot pattern (`tests/e2e/tap-target-inline-controls.layout.spec.ts:69-94`) — no per-locator `boundingBox()` reads, no sampler outliving its element.
- No pasted test snippets in this plan (assertions are specified as contracts against the suite's existing helpers `rectsWithin`/`only`/`assertFloor`/`assertDisjoint`/`tapFloorPx`, all already in the file) — nothing to typecheck at plan time; the implementation is typechecked by the pre-push gates (Task 5).

## Pre-draft verification pass (run 2026-08-15, worktree at `origin/main` = `33c70ba1f`)

Facts this plan relies on, each grep-verified; no task re-derives them:

- `SheetTitleLink` single class string `Step3SheetCard.tsx:168` carries `-my-2.5 -mx-2 px-2 py-2.5`; render sites `Step3SheetCard.tsx:434`/`Step3SheetCard.tsx:456`/`Step3SheetCard.tsx:665`; meta line `<p className="mt-0.5 …">` at `Step3SheetCard.tsx:539` with an EXISTING testid on its client segment (`wizard-step3-card-${dfid}-client`, `Step3SheetCard.tsx:520`); no-details warning line `mt-1` at `Step3SheetCard.tsx:457` inside the `data-no-details` article (`Step3SheetCard.tsx:451`). The suite's `-review-section-<id>` locators are rendered by the modal wrapper (`components/admin/review/ShowReviewSurface.tsx:1057`) — NOT stale (spec §6 records the round-1 refutation).
- Transport grid string `grid grid-cols-2 gap-2 min-[560px]:grid-cols-3` at `step3ReviewSections.tsx:1461`; `TransportCell` wrapper `gap-1.5 … px-3 py-2.5` at `step3ReviewSections.tsx:1380`, inner body `gap-1.5` at `step3ReviewSections.tsx:1382`; `TransportCell` call sites are exactly `step3ReviewSections.tsx:1402`/`step3ReviewSections.tsx:1479`/`step3ReviewSections.tsx:1496`.
- `tel:` link string at `step3ReviewSections.tsx:1415` and `mailto:` at `step3ReviewSections.tsx:1425` — both `flex min-h-tap-min items-center gap-1 text-[11px] … text-text-subtle hover:text-text`, no `w-full`, no background/border, no focus-visible treatment.
- Pack toggle string at `step3ReviewSections.tsx:2603` — `underline-offset-2 hover:text-text hover:underline` (no at-rest `underline`); sibling toggles at `step3ReviewSections.tsx:1946`/`step3ReviewSections.tsx:3093` and the warnings-callout jump links `step3ReviewSections.tsx:674`/`step3ReviewSections.tsx:691` all carry at-rest `underline`.
- e2e suite is wired: `playwright.config.ts:83` mobile-safari `testMatch` includes `tap-target-inline-controls.layout`; `.github/workflows/lifecycle-layout-e2e.yml:173` runs exactly this file with `--project=mobile-safari --retries=0 --reporter=list,json`. NO new wiring is needed and none is added.
- Seed helper: `SeedPreviewExtras` (`tests/e2e/helpers/devCaptureStaged.ts:386-396`) has `packCaseItems`/`driverPhone`/`driverEmail`; `transportationRow` (`tests/e2e/helpers/devCaptureStaged.ts:412`) hard-codes `vehicle: null`/`parking: null`; every extras field is omitted-when-absent by that type's own contract. The demoted_rescan seed emits `client_label: "Gallery Client"` (`tests/e2e/helpers/devCaptureStaged.ts:446`), so the site-5 meta line renders.
- No unit test pins any touched class string (`grep -rln` over `tests/` for the touched utilities → only the e2e suite itself; `tests/components/step3SheetCard.test.tsx:408` pins `truncate` on a different element). Task 2's GREEN re-runs the per-string grep for each edited string as a belt-and-braces check.
- No `public/help/screenshots/` capture renders the step-3 wizard cards or review modal (capture list enumerated in spec §5) — no baseline regen.
- `tests/a11y/tapTargetInlineExemptions.test.ts` pins sites 1-3 only — untouched by this diff.
- Tokens: `--spacing-tap-min: 44px` (`app/globals.css:203`), `--spacing-tile-pad: 20px` (`app/globals.css:219`), `--text-base: 1rem` / line-height 1.55 (`app/globals.css:151-152`).

## Meta-test / registry inventory (declared)

- **EXTENDS:** `tests/e2e/tap-target-inline-controls.layout.spec.ts` (new assertions inside the three existing tests) and `tests/e2e/helpers/devCaptureStaged.ts` (`SeedPreviewExtras.vehicle`). **CREATES:** nothing structural (spec §5: the extended e2e suite IS the guard; the source-mutation registry cannot express this Playwright surface — probed, `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4).
- **Invariant-9/10 registries, advisory locks, §12.4 catalog:** none touched — no Supabase call, no mutation surface, no error code, no copy string. If implementation discovers otherwise, the registry row lands in the same commit.
- **Layout-dimensions task:** Tasks 1-2 ARE it (real-browser `getBoundingClientRect` per spec §3, on production testids). **Transition-audit task:** N/A — spec §4: no new states, no animations, class-string-only diff.

<!-- tasks: depth=3 -->

### Task 1 — site 5: bleed the title-link hit box upward

<!-- task: red=`pnpm heavy pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari --grep "site 5"` ac=AC-1,AC-5 -->

RED (new assertions in the existing "site 5" test plus one new no-details case, ALL test-file-only — no production edit precedes the red; the command fails because the production string at `Step3SheetCard.tsx:168` still carries `-my-2.5 py-2.5`, whose 10px downward bleed overlaps the demoted card's meta line by ~8px and the no-details card's warning line by ~6px):

1. Demoted card (existing test): extend the `rectsWithin` selector map with the EXISTING client-segment testid (`[data-testid$="-client"]` scoped to the card; `Step3SheetCard.tsx:520`) and assert, at BOTH 390px and `WIDE_VIEWPORT`:
   - premise: exactly one client-segment rect (`only(...)`) — the demoted_rescan seed's `client_label` (`devCaptureStaged.ts:446`) guarantees it renders;
   - **disjoint:** the title-link rect does not overlap the client-segment rect (`assertDisjoint`) — fails today by ~8px;
   - **containment:** `target.y ≥ card.self.y − 0.5` (the bleed stays inside the card) — passes today AND after; it pins the amendment's containment claim (spec §3.3).
   - The floor and interactive-disjointness assertions already present stay untouched.
2. No-details card — a new case TITLED `site 5 (no-details) — the title link clears the floor without covering the warning line` so the marker command's `--grep "site 5"` matches it: seed `variant: "no_details"` (`devCaptureStaged.ts:351`), navigate via `gotoStep3Card`, premise the title link + warning line render (the warning `<p>` is the `text-warning-text` paragraph inside the `data-no-details` article, `Step3SheetCard.tsx:451`/`Step3SheetCard.tsx:457`), then run the SAME full assertion set as the demoted case, at BOTH 390px and `WIDE_VIEWPORT`: floor; disjointness of the title-link rect from the warning-line rect (fails today by ~6px); containment (`target.y ≥ card.self.y − 0.5`); and interactive-disjointness against every other interactive rect in the card (the Re-scan and Ignore controls, `Step3SheetCard.tsx:466-476` region, are real neighbours here). This makes Task 1 cover spec AC-1's "invariants 1-4 on BOTH seedable render sites" in full.

GREEN: apply spec §2.1 — the one class edit at `Step3SheetCard.tsx:168` (`-my-2.5 py-2.5` → `-mt-5 pt-5`, utility set per spec §2.1.1) + rewrite the comment at `Step3SheetCard.tsx:161-167` to argue the upward form citing the spec. Re-run the command: green. (The post-finalize summary card is NOT seeded — spec §7 limit 7 records the by-construction coverage argument.)

Commit: `fix(admin): bleed the sheet-title tap target upward, off the meta line`

### Task 2 — sites 6/7 + grid: items-start, compaction, contact chips

<!-- task: red=`pnpm heavy pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari --grep "sites 6/7"` ac=AC-2,AC-3 -->

RED (new assertions in the existing "sites 6/7" test; each names its failing production line):

1. Seed helper: add optional `vehicle?: string` to `SeedPreviewExtras` (`tests/e2e/helpers/devCaptureStaged.ts:386`), threaded to `transportationRow`'s `vehicle` field (`tests/e2e/helpers/devCaptureStaged.ts:419`), omitted-when-absent (callers passing nothing stay byte-identical). The test seeds `vehicle: "Sprinter ABC-1042"` beside the existing phone+email.
2. Measurement contract (concrete — nothing left to invent). Extend the suite's evaluate helper for this test only: a sibling helper (same shape as `rectsWithin`, same single-`evaluate` snapshot) that returns, per element, the `Rect` fields PLUS computed `backgroundColor` and `borderTopWidth` (read inside the same `evaluate` via `getComputedStyle`). Element identification, all structural and rooted at the section wrapper testid (`-review-section-transport`, rendered by `ShowReviewSurface.tsx:1057`), each behind an asserted premise:
   - the GRID = the nearest ancestor `div` of the seeded `a[href^="tel:"]` whose computed `display` is `grid`; CELLS = its direct children;
   - DRIVER CELL = the cell containing the seeded tel anchor; VEHICLE CELL = the cell containing the seeded vehicle text and no anchor (premise: both exist);
   - within the driver cell: EYEBROW = its first direct child (the `CELL_EYEBROW_CLASS` span, `step3ReviewSections.tsx:1381`); BODY = its second direct child (the inner flex column, `step3ReviewSections.tsx:1382`); NAME ROW = body's first direct child (the outer avatar+name row span, `step3ReviewSections.tsx:1404` — the OUTER row, never the inner text span); TEL/MAILTO = the seeded anchors.
   New assertions (one snapshot):
   - **short cell stays short:** `vehicleCell.height < driverCell.height` — fails today: the grid at `step3ReviewSections.tsx:1461` has no `items-start`, so default stretch equalizes them. Premise: both cells render (seeded).
   - **dead-space budget:** `driverCell.height ≤ eyebrow.height + nameRow.height + tel.height + mailto.height + 34 + 1` — fails today: shipped non-content space is 38px (`py-2.5` 20 + three `gap-1.5` 6s at `step3ReviewSections.tsx:1380`/`step3ReviewSections.tsx:1382`).
   - **clearance:** `mailto.y − (tel.y + tel.height) ≥ 9.5` — fails today: shipped separation is the 6px `gap-1.5`.
   - **full width:** each chip's width within 1px of BODY's rect width (the flex container has no horizontal padding) — fails today: the links at `step3ReviewSections.tsx:1415`/`step3ReviewSections.tsx:1425` shrink-wrap (no `w-full`).
   - **visible edge, PER CHIP:** EACH of the tel and mailto chips has computed `backgroundColor` ≠ the driver cell's and computed `borderTopWidth` = `1px` (from the style-carrying snapshot above) — fails today: no background/border utilities on either shipped string; an asymmetric regression fails by name (spec §3.8).
   - Existing floor + disjoint assertions stay untouched.

GREEN: apply spec §2.2 + §2.3 — `items-start` on `step3ReviewSections.tsx:1461`; `TransportCell` `py-2.5`→`py-2`, both `gap-1.5`→`gap-1` (`step3ReviewSections.tsx:1380`/`step3ReviewSections.tsx:1382`); the two normative chip strings (spec §2.3) on `step3ReviewSections.tsx:1415`/`step3ReviewSections.tsx:1425`. Then re-run the per-string pin grep for each replaced string (`grep -rn "<old string>" tests/` → expect only the e2e suite comment hits already updated). Green.

Commit: `fix(admin): transport cells stop stretching; contact links become visible chip rows`

### Task 3 — site 4: at-rest underline on the pack-list toggle

<!-- task: red=`pnpm heavy pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari --grep "site 4"` ac=AC-4 -->

RED: in the existing "site 4" test, assert the toggle's computed `text-decoration-line` contains `underline` at rest (no hover) — fails because `step3ReviewSections.tsx:2603` carries `hover:underline` only. Floor/shrink-wrap/disjoint assertions untouched.

GREEN: spec §2.4 — swap `hover:underline` → `underline` in the `step3ReviewSections.tsx:2603` string. Green.

Commit: `fix(admin): give the pack-list overflow toggle an at-rest underline`

### Task 4 — docs + ledger graduation

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-5,AC-6 -->

1. Amendment pointer: add the spec §2.1.3 dated line to `docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md` §2's site-5 row.
2. Archive all three entries to `BACKLOG-archive.md` with dated resolution paragraphs citing the spec. Executable RED per entry, the archive-RED pattern: move the body WITH its flight marker → `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` fails by name (archives categorically reject in-flight entries) → strip the marker in the same move → green. This is where the branch's three claim markers come off (invariant 12; graduating entries shed markers in the archive commit).
3. `pnpm vitest run tests/docs/` green; `pnpm spec:lint` on both touched specs: 0 hard.
4. Marker-removal form, stated so nobody relitigates ordering: all three entries GRADUATE, and invariant 12's own graduating-entry clause (AGENTS.md invariant 12's parenthetical: a graduating entry's marker comes off in the same commit that archives it, because archives categorically reject in-progress entries) sanctions the archive commit as the removal site regardless of the later Task-5 gate/closeout commits; the last-pre-merge-commit clause governs only markers that survive without graduating, of which this branch has none.

Commit: `docs(backlog): graduate the step3 tap-cluster entries; record the site-5 amendment`

<!-- tasks: end -->

### Task 5 — dual gate, pre-push gates, PR, merge (outside the enrolled task region: every command here is a gate expected GREEN, so no red-then-green marker can truthfully be declared — the red-executability rule rejects a marker that passes the moment it is authored)

1. `/impeccable critique` + `/impeccable audit` on the branch diff (canonical v3 setup gates: the context load of PRODUCT.md + DESIGN.md, then the register read). P0/P1 fixed or DEFERRED-entried; findings + dispositions recorded in this directory's `closeout.md` with the filled `impeccable-gate:` marker line — `closeout.md` is the directory-unit home invariant 8's style clause sanctions ("directory units put it in `closeout.md`/`CLOSEOUT.md` or the handoff §12"; M-wave and L-wave closeouts are the precedent).
2. Pre-push gates, all green: `pnpm heavy pnpm test` (full unit suite), `pnpm typecheck` (the canonical script — its `pretypecheck` generator then `tsc --noEmit` over the single root tsconfig, whose `**/*.ts(x)` include spans app, tests, and e2e), `pnpm exec eslint .`, `pnpm format:check`, plus one full `pnpm heavy pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari` (whole file, no grep filter).
3. Merge `origin/main` (BACKLOG/archive conflicts resolve per-entry, both sides preserved), push, open PR. Whole-diff codex-guard review `--stage diff` to APPROVE (brief per AGENTS.md contract; round cap 4).
4. Real CI green (including `lifecycle-layout-e2e.yml` — AC-7's proof) → `gh pr merge --merge` in the same turn → ff main → `git rev-list --left-right --count main...origin/main` = `0 0`.

## Acceptance criteria mapping

Spec §8: AC-1 (Task 1), AC-2/AC-3 (Task 2), AC-4 (Task 3), AC-5 (Tasks 1+4), AC-6 (Task 4), AC-7 (Task 5).

## Adversarial review (cross-model)

- This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff (briefs: REVIEWER ONLY, CONSEQUENCE BOUND / PROBE DOMAIN / THREAT-MODEL FENCE with the literal phrase "never silently wrong", VERDICT + FINDINGS lines, round cap 4).
- Implementation branch: whole-diff codex-guard `--stage diff` review to APPROVE before merge (Task 5.3).

## Execution handoff

A NEW Opus pane executes from `HANDOFF.md` in this directory after this authoring PR merges. The implementation worktree `../FX-worktrees/step3-tap-cluster` (branch `fix/step3-tap-cluster`, claims declared) is created by the authoring session per the G5 handoff protocol.

This authoring branch ships no UI surface (docs only); the implementation branch's filled RAN-form marker lands in this directory's `closeout.md` at arc close (Task 5.1), the L-wave pattern (`docs/superpowers/plans/2026-08-06-l-wave/plan.md:177` precedent).

impeccable-gate: N/A — no UI surface
