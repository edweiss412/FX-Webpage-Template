# Plan: inline text controls vs the 44px floor — 3 exemptions, 5 repairs

**Spec:** `docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md` (APPROVED, round 6, 0 findings) · **Branch:** `fix/tap-target-inline-controls` · **Implementer:** Opus / Claude Code (UI surfaces — routing hard rule)

**Meta-test inventory (declared):** CREATES the exemption source-scan meta-test (spec §2) and the lifecycle-workflow executed-count oracle (spec §6 — the workflow has none today); EXTENDS the mobile-safari `testMatch` (`playwright.config.ts:78`) and SEVENTEEN `governs` pairs (the spec-registration detector observes resolved files DYNAMICALLY through its CONFIGS walk, `tests/ci/_metaSpecRegistration.test.ts:946` — no per-spec row exists or is added; R2 F1) in `tests/ci/_workflowCoverageScan.ts` (including the step's own `PLAYWRIGHT_JSON_OUTPUT_NAME`). Advisory locks: the TEST SEEDING writes lock-governed tables and routes through the existing locked helper (single holder unchanged — no new lock surface; production code changes none). Supabase boundaries / admin alerts: none applies — class-string edits, comments, one e2e file, one workflow, meta-tests.

**Layout-dimensions task:** the browser assertions ARE the layout task (real-browser rects on production routes — Tasks 2-3); no fixed-dimension parent/child pair beyond the floors themselves.

**Transition-audit task:** N/A — the spec's Transition Inventory declares none (static class additions only).

**Plan-time red transcript (run 2026-08-10, this worktree):** Task 4's full-grammar marker grep → exit 1 (no filled marker line exists); Task 5's negated entry-heading grep → exit 1 (the entry is present); the new spec file and meta-test are absent (`ls` → No such file); none of the five class strings carries `min-h-tap-min` or the #5 recipe (grep per site → no matches).

**e2e harness readiness:** the new spec boots the standard port-3000 webServer (mobile-safari project); readiness per route = the render premise asserted before measuring (spec §6 table — the premise IS the gate: the control must exist before its rect is read, failing loudly if a seed stops producing it); detach-safety: no locators held across navigations.

<!-- tasks: depth=2 -->

## Task 1 — Exemption records + source-scan meta-test

<!-- task: red=`pnpm vitest run tests/a11y/tapTargetInlineExemptions.test.ts` ac=AC-1 -->

Red is written by this task (invariant-1 shape): the new source-scan suite fails against the live tree because the three exemption comments are absent — `app/admin/settings/admins/RevokeRowButton.tsx:283`, `components/admin/RoleRecognizeControl.tsx:273`, and `components/shared/ReportModal.tsx:598` carry no `tap-floor: inline-prose exemption` token (verified 2026-08-10).

1. WRITE THE SUITE FIRST (R3 F1 — invariant-1 order): create the source-scan test asserting per-site comment token + pinned className; run it and OBSERVE the red (comments absent).
2. THEN add the exemption comment at each of the three controls (spec §2 wording, PRODUCT.md:59 cited). The meta-test asserts per site: comment token adjacent to the control AND className literal equal to its pinned current string (pinned strings copied from the live tree in this task, not invented).
3. Four pre-dispatch mutants for the string-presence guard (R1 F4), each run and reverted with results recorded in the commit: (a) token emptied; (b) token + appended suffix; (c) token present but commented-out/dead adjacent to the control (must NOT satisfy adjacency); (d) token adjacent to the WRONG control in the same file (must not satisfy the per-site assertion). Operator family closed at these four.
4. Green: suite passes; class strings byte-unchanged (the suite itself proves it).

## Task 2 — The five class repairs

<!-- task: red=`pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari` ac=AC-1,AC-2 -->

Red is written by this task (invariant-1 shape): the new layout spec's floor assertions fail against the live tree because all five controls measure under 44px on the vertical axis — the corpus baseline (step3-a11y §2.6 bucket A) records them under, and none of the five class strings carries `min-h-tap-min` or the #5 padding recipe (verified per site 2026-08-10). Ordering (R1 F1): THIS task creates the spec file AND its local resolution surface (the mobile-safari testMatch addition — the registration detector picks the resolved file up dynamically, no row; R2 F1), observes red, applies the class edits, observes green. Task 3 owns ONLY the workflow/oracle/governance wiring.

1. Apply the spec §2 recipes verbatim per site: #4 `inline-flex w-fit min-h-tap-min items-center` (toggle at `components/admin/wizard/step3ReviewSections.tsx:2590`); #5 `inline-block -my-2.5 py-2.5 -mx-2 px-2` (`SheetTitleLink`'s `<a>`, `components/admin/wizard/Step3SheetCard.tsx:150`); #6/#7 `min-h-tap-min` added to the existing `flex` strings (`step3ReviewSections.tsx:1410`, `step3ReviewSections.tsx:1419`); #8 `inline-flex w-fit min-h-tap-min items-center` + `text-blue-700` → `text-accent-on-bg` (`app/admin/dev/page.tsx:334`).
2. Browser assertions per the spec's render-premise table, with the SEED SURFACES named (R1 F2): the wizard sites seed via `seedStagedRow` (`tests/e2e/helpers/devCaptureStaged.ts:271`, builder at `tests/e2e/helpers/devCaptureStaged.ts:470`) EXTENDED in this task with pack-items (>`PACK_LIST_ITEMS_CAP`) and contact phone/email fields — the helper seeds title/client only today; the extension routes through the SAME staged-row path the helper already uses (which holds the per-show advisory lock via its existing locked write helper — correcting the header's lock claim: seeding touches lock-governed tables and MUST go through the existing locked path, no new holder). The `/admin/dev` unrecognized-snippet premise has NO existing e2e precedent (R2 F2) and is DEFINED here from the page's own contract (`app/admin/dev/page.tsx:49`): the test drives the page's POST action to stage a fixture carrying a `raw_unrecognized` snippet into the `dev.*` shadow tables, then navigates `/admin/dev?fixture=<staged>` so the unrecognized list and its Report-this form render; the premise asserts the list item exists before measuring. Premises asserted before measuring (disclosure EXPANDED for #4; the finalize-demoted card variant for #5 with non-empty `dfid` and a one-line title). Floors derived from `--spacing-tap-min`; overlap assertions for #4, #5 (both axes, 390px AND ≥sm, vs every interactive element in the card), #6/#7; `w-fit` presence for #4/#8.
3. Green: the new spec passes locally on the production routes.

## Task 3 — CI wiring for the new spec

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/ci/_metaSpecRegistration.test.ts` ac=AC-5 -->

Red is written by this task (invariant-1 shape, rescoped R1 F1): naming the new file in `lifecycle-layout-e2e.yml` without the workflow-side registration fails the coverage meta-test — the file is absent from every workflow run command and the seventeen `governs` pairs are absent (verified 2026-08-10; the `testMatch` addition landed in Task 2; the detector needs no row).

1. Add the run step to `.github/workflows/lifecycle-layout-e2e.yml` WITH the created oracle (R1 F3, concrete): a NEW checker script (basename check-lifecycle-layout-executed.mjs under scripts/, job-specific like its `app-e2e` sibling which is expressly non-reusable per `scripts/check-app-e2e-executed.mjs:9`) with its own `REQUIRED` map (floor from a real run), reading a step-scoped registered `PLAYWRIGHT_JSON_OUTPUT_NAME`; PLUS a companion wiring guard extending the three closures `tests/cross-cutting/app-e2e-ci-wiring.test.ts:6` documents (missing REQUIRED rows, stale floors, narrowing flags) for this workflow — a sibling test file, since the app guard is workflow-specific; the checker gets a constructed RED (doctored skipped-case report fails it).
2. The seventeen `governs` additions (testMatch landed in Task 2); verify the exact pair set against the meta-tests' own failure output.
3. Green (R2 F3, covers the created artifacts): both meta-tests pass; the NEW sibling wiring guard runs green (`pnpm vitest run` on its file); the checker passes against a real run's report AND fails against the doctored skipped-case report (both invocations recorded); the workflow executes the spec on the PR (checked in Task 5).

## Task 4 — Impeccable dual gate (invariant 8)

<!-- task: red=`grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-10-tap-target-inline-controls.md` ac=AC-4 -->

Red now (line-anchored FULL-grammar grep — R1 F5: a partial `critique=RAN` line cannot satisfy it; the marker comment is not at line start). Run both halves of the invariant-8 dual gate (`/impeccable`, critique mode then audit mode, canonical v3 setup). Expected visual deltas: taller in-flow rows at #4/#6/#7/#8, none at #5 (cancelled), token color change at #8. Fill §12 (marker + full P0-P3 findings table with per-finding dispositions), then RERUN the same command and observe exit 0.

## Task 5 — Graduation + merge sequence

<!-- task: red=`sh -c '! grep -q "^## BL-TAP-TARGET-INLINE-TEXT-CONTROLS" BACKLOG.md'` ac=AC-3 -->

Red now (entry heading present; negated grep exits 1; green at graduation — same command).

1. PREPARE the graduation content UNCOMMITTED (archive move + registry row + marker removal; 3/5 split + per-site dispositions recorded) and include the staged diff in the whole-diff review's scope (R2 F4 — review covers what merges, and the branch stays claim-visible until the reviewed graduation commit lands last).
2. Whole-diff cross-model review to APPROVE. If any post-gate repair touches a UI surface, RERUN both halves of the invariant-8 gate on the amended diff and refresh §12 before proceeding. THEN commit the already-reviewed graduation content as the PR's final commit; `pnpm vitest run tests/docs` green as the belt.
3. Real CI green including the lifecycle workflow executing the new spec through its oracle; `gh pr merge --merge`; fast-forward main; `0  0` check.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: five repaired sites ≥44px on their failing axes (production routes); three exempt sites pinned by the source-scan suite with comments.
- AC-2: no neighbour-overlap regressions (assertion set green).
- AC-3: entry graduates with the ratified split recorded.
- AC-4: the invariant-8 dual gate (both halves) run with P0-P3 dispositioned.
- AC-5: the new layout spec runs in `lifecycle-layout-e2e.yml` on the PR through a created executed-count oracle — never dark.

## §12 — impeccable gate record

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

`dispositions=none` is what the §3.3 grammar REQUIRES at `p0=0 p1=0` — the field is coupled to those two counts (`tests/docs/_invariant8Closeout.ts:141`), so it reads "no P0/P1 findings to disposition", not "nothing was recorded". The P2/P3 findings this gate did raise are dispositioned in the table below.

Both halves of the invariant-8 dual gate ran on this diff (2026-08-11, impeccable v3.9.1, canonical setup: the skill's context loader → its critique and audit command references → project files → its product register).

**Critique — dual-agent, not degraded** (A: design review `afbe8d76de80a62a3`, B: detector + browser evidence `a3a02b2b55e6ca4bb`, isolated and parallel). Design Health **31/40**. Snapshot persisted under the gitignored `.impeccable/critique/` directory as `2026-08-11T10-28-38Z__components-admin-wizard-step3reviewsections-tsx.md`.

**Audit — technical.** Health **18/20** (Excellent): Accessibility 3, Performance 4, Responsive 3, Theming 4, Anti-Patterns 4.

Browser visualization was NOT available for either half: no dev server was running and the two wizard surfaces render only behind a seeded onboarding-wizard DB session. Static evidence was used instead — full className strings, token resolution, and computed contrast — plus the real-browser rects this arc's own e2e suite already measures at 390px and 800px. Recorded rather than glossed.

### Findings and dispositions (P0-P3)

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | ~~P1~~ | **REFUTED.** `text-accent-on-bg` claimed to be a documented AA failure (4.11:1), citing `app/globals.css:1206-1209`. That comment is STALE — `BL-ACCENT-ON-BG-AA-CONTRAST` (`BACKLOG-archive.md:4983`) shipped 2026-07-16 and moved light `--color-accent-on-bg-runtime` to `#a65000`. | Refuted by independent measurement: light `#a65000` on `#fafaf9` = **5.34:1**, dark `#ffa047` on `#0f1014` = **9.39:1**, both over the 4.5:1 floor for 12px text. The replaced `text-blue-700` was 6.42:1 on the same bg — also passing, so the swap is a hue decision (PRODUCT.md bans a competing accent), not a contrast regression. No change. |
| 2 | P2 | Site 5's hit box covers ~8px of the non-interactive meta line (`Step3SheetCard.tsx:167`, `Step3SheetCard.tsx:664`): `-my-2.5` (10px) less the meta line's `mt-0.5` (2px). A tap on the date line can open Google Sheets in a new tab. | **DEFERRED — filed `BL-TAP-TITLE-LINK-META-LINE-BLEED`.** Spec §2 ratifies this recipe verbatim ("**Exactly** `inline-block -my-2.5 py-2.5 -mx-2 px-2`… one recipe, no delegated choice"), and the ratified overlap contract covers interactive neighbours only. The proposed one-directional bleed is a different recipe, i.e. a spec amendment, not an implementation call. |
| 3 | P2 | Contact cells gain ~54px (Driver ~106px → ~160px) and their grid row-mates stretch to match — at ≥560px, Vehicle stretches to 160px around ~34px of content (`step3ReviewSections.tsx:1461` grid, `step3ReviewSections.tsx:1380` cell). | **DEFERRED — filed `BL-TRANSPORT-CELL-STRETCH-AFTER-TAP-FLOOR`.** A container re-balance beyond the ratified per-control recipes; same category as the tail-`<li>` container change this arc reverted. |
| 4 | P2 | Sites 6/7 are two 44px targets 6px apart (`gap-1.5`), and `items-center` inside a 44px box inverts the grouping — name+phone read as one group, email as an orphan. Larger targets also make the WRONG one easier to hit, and the wrong one dials. | **DEFERRED — filed `BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING`.** Spacing and resting-container work on the cell, not the ratified control recipes. |
| 5 | P3 | 44px of air with no rest-state affordance at sites 4/6/7 — all rely on `hover:` treatments, which PRODUCT.md bans as sole affordances for the venue floor. | **Pre-existing, not introduced.** The diff enlarged the boxes; it removed no rest state. Folded into the `BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING` filing. |
| 6 | P3 | Focus-ring vocabulary is inconsistent across the five repaired controls: sites 4 and 5 suppress the UA outline and supply `focus-visible:ring-focus-ring`; sites 6, 7 and 8 carry no focus classes at all (they fall back to the UA default, so nothing is unfocusable). | **Pre-existing, not introduced** — none of the three ever had focus classes, and this diff added only sizing. Recorded, not filed: the accessible-fallback case is not a defect on its own. |
| 7 | P3 | `app/globals.css:1206-1209` carries a stale 4.11:1 contrast figure for a token that has measured 5.34:1 since 2026-07-16. | **DEFERRED — filed `BL-GLOBALS-STALE-ACCENT-CONTRAST-COMMENT`.** Real doc-rot, outside this diff (help-prose layer). Finding 1 above is the measured cost of leaving it: it produced a false P1 in this very gate. |

**Refuted claims recorded so a later round does not re-derive them** (AGENTS.md cross-CLI discipline): finding 1 above; and Assessment A's report that `BL-ACCENT-ON-BG-AA-CONTRAST` is a dangling reference — it is not, it is at `BACKLOG-archive.md:4983`, which A did not check.

**Detector.** The skill's bundled detector exited 2, four findings, **all PRE-EXISTING and none inside this diff**: `broken-image` at `step3ReviewSections.tsx:3687` and `step3ReviewSections.tsx:3718` (both false positives — the matched `<img>` is prose inside a `/** */` comment, not a live tag) and `side-tab` (`border-l-4`) at `app/admin/dev/page.tsx:215` and `app/admin/dev/page.tsx:266`. Left untouched: out of this arc's scope, and the dev page is deliberately unstyled per its own header comment.

**Token sanity.** `--spacing-tap-min` = `44px` (`app/globals.css:179`); `w-fit` and `text-accent-on-bg` both resolve (Tailwind v4 `@theme`, no `tailwind.config.*`). No silent no-op class shipped — which would have been the most serious possible finding, since every floor assertion would then pass against nothing.
