# Plan: inline text controls vs the 44px floor — 3 exemptions, 5 repairs

**Spec:** `docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md` (APPROVED, round 6, 0 findings) · **Branch:** `fix/tap-target-inline-controls` · **Implementer:** Opus / Claude Code (UI surfaces — routing hard rule)

**Meta-test inventory (declared):** CREATES the exemption source-scan meta-test (spec §2) and the lifecycle-workflow executed-count oracle (spec §6 — the workflow has none today); EXTENDS the mobile-safari `testMatch` (`playwright.config.ts:78`), the spec-registration detector (`tests/ci/_metaSpecRegistration.test.ts`), and SEVENTEEN `governs` pairs in `tests/ci/_workflowCoverageScan.ts` (including the step's own `PLAYWRIGHT_JSON_OUTPUT_NAME`). Advisory locks: the TEST SEEDING writes lock-governed tables and routes through the existing locked helper (single holder unchanged — no new lock surface; production code changes none). Supabase boundaries / admin alerts: none applies — class-string edits, comments, one e2e file, one workflow, meta-tests.

**Layout-dimensions task:** the browser assertions ARE the layout task (real-browser rects on production routes — Tasks 2-3); no fixed-dimension parent/child pair beyond the floors themselves.

**Transition-audit task:** N/A — the spec's Transition Inventory declares none (static class additions only).

**Plan-time red transcript (run 2026-08-10, this worktree):** Task 4's full-grammar marker grep → exit 1 (no filled marker line exists); Task 5's negated entry-heading grep → exit 1 (the entry is present); the new spec file and meta-test are absent (`ls` → No such file); none of the five class strings carries `min-h-tap-min` or the #5 recipe (grep per site → no matches).

**e2e harness readiness:** the new spec boots the standard port-3000 webServer (mobile-safari project); readiness per route = the render premise asserted before measuring (spec §6 table — the premise IS the gate: the control must exist before its rect is read, failing loudly if a seed stops producing it); detach-safety: no locators held across navigations.

<!-- tasks: depth=2 -->

## Task 1 — Exemption records + source-scan meta-test

<!-- task: red=`pnpm vitest run tests/a11y/tapTargetInlineExemptions.test.ts` ac=AC-1 -->

Red is written by this task (invariant-1 shape): the new source-scan suite fails against the live tree because the three exemption comments are absent — `app/admin/settings/admins/RevokeRowButton.tsx:283`, `components/admin/RoleRecognizeControl.tsx:273`, and `components/shared/ReportModal.tsx:598` carry no `tap-floor: inline-prose exemption` token (verified 2026-08-10).

1. Add the exemption comment at each of the three controls (spec §2 wording, PRODUCT.md:59 cited).
2. The meta-test asserts per site: comment token adjacent to the control AND className literal equal to its pinned current string (pinned strings copied from the live tree in this task, not invented).
3. Four pre-dispatch mutants for the string-presence guard (R1 F4), each run and reverted with results recorded in the commit: (a) token emptied; (b) token + appended suffix; (c) token present but commented-out/dead adjacent to the control (must NOT satisfy adjacency); (d) token adjacent to the WRONG control in the same file (must not satisfy the per-site assertion). Operator family closed at these four.
4. Green: suite passes; class strings byte-unchanged (the suite itself proves it).

## Task 2 — The five class repairs

<!-- task: red=`pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari` ac=AC-1,AC-2 -->

Red is written by this task (invariant-1 shape): the new layout spec's floor assertions fail against the live tree because all five controls measure under 44px on the vertical axis — the corpus baseline (step3-a11y §2.6 bucket A) records them under, and none of the five class strings carries `min-h-tap-min` or the #5 padding recipe (verified per site 2026-08-10). Ordering (R1 F1): THIS task creates the spec file AND its local resolution surface (the mobile-safari testMatch addition + the spec-registration detector row), observes red, applies the class edits, observes green. Task 3 owns ONLY the workflow/oracle/governance wiring.

1. Apply the spec §2 recipes verbatim per site: #4 `inline-flex w-fit min-h-tap-min items-center` (toggle at `components/admin/wizard/step3ReviewSections.tsx:2590`); #5 `inline-block -my-2.5 py-2.5 -mx-2 px-2` (`SheetTitleLink`'s `<a>`, `components/admin/wizard/Step3SheetCard.tsx:150`); #6/#7 `min-h-tap-min` added to the existing `flex` strings (`step3ReviewSections.tsx:1410`, `step3ReviewSections.tsx:1419`); #8 `inline-flex w-fit min-h-tap-min items-center` + `text-blue-700` → `text-accent-on-bg` (`app/admin/dev/page.tsx:334`).
2. Browser assertions per the spec's render-premise table, with the SEED SURFACES named (R1 F2): the wizard sites seed via `seedStagedRow` (`tests/e2e/helpers/devCaptureStaged.ts:271`, builder at `tests/e2e/helpers/devCaptureStaged.ts:470`) EXTENDED in this task with pack-items (>`PACK_LIST_ITEMS_CAP`) and contact phone/email fields — the helper seeds title/client only today; the extension routes through the SAME staged-row path the helper already uses (which holds the per-show advisory lock via its existing locked write helper — correcting the header's lock claim: seeding touches lock-governed tables and MUST go through the existing locked path, no new holder). The `/admin/dev` unrecognized-snippet premise seeds via the dev-capture spec's existing fixture path (the same seed `dev-capture.spec.ts` uses). Premises asserted before measuring (disclosure EXPANDED for #4; the finalize-demoted card variant for #5 with non-empty `dfid` and a one-line title). Floors derived from `--spacing-tap-min`; overlap assertions for #4, #5 (both axes, 390px AND ≥sm, vs every interactive element in the card), #6/#7; `w-fit` presence for #4/#8.
3. Green: the new spec passes locally on the production routes.

## Task 3 — CI wiring for the new spec

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/ci/_metaSpecRegistration.test.ts` ac=AC-5 -->

Red is written by this task (invariant-1 shape, rescoped R1 F1): naming the new file in `lifecycle-layout-e2e.yml` without the workflow-side registration fails the coverage meta-test — the file is absent from every workflow run command and the seventeen `governs` pairs are absent (verified 2026-08-10; the `testMatch` + detector rows landed in Task 2).

1. Add the run step to `.github/workflows/lifecycle-layout-e2e.yml` WITH the created oracle (R1 F3, concrete): a NEW checker script (basename check-lifecycle-layout-executed.mjs under scripts/, job-specific like its `app-e2e` sibling which is expressly non-reusable per `scripts/check-app-e2e-executed.mjs:9`) with its own `REQUIRED` map (floor from a real run), reading a step-scoped registered `PLAYWRIGHT_JSON_OUTPUT_NAME`; PLUS a companion wiring guard extending the three closures `tests/cross-cutting/app-e2e-ci-wiring.test.ts:6` documents (missing REQUIRED rows, stale floors, narrowing flags) for this workflow — a sibling test file, since the app guard is workflow-specific; the checker gets a constructed RED (doctored skipped-case report fails it).
2. The seventeen `governs` additions (testMatch + detector landed in Task 2); verify the exact pair set against the meta-tests' own failure output.
3. Green: both meta-tests pass; the workflow executes the spec on the PR (checked in Task 5).

## Task 4 — Impeccable dual gate (invariant 8)

<!-- task: red=`grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=[0-9]+ p1=[0-9]+ dispositions=(recorded|none)$" docs/superpowers/plans/2026-08-10-tap-target-inline-controls.md` ac=AC-4 -->

Red now (line-anchored FULL-grammar grep — R1 F5: a partial `critique=RAN` line cannot satisfy it; the marker comment is not at line start). Run both halves of the invariant-8 dual gate (`/impeccable`, critique mode then audit mode, canonical v3 setup). Expected visual deltas: taller in-flow rows at #4/#6/#7/#8, none at #5 (cancelled), token color change at #8. Fill §12 (marker + full P0-P3 findings table with per-finding dispositions), then RERUN the same command and observe exit 0.

## Task 5 — Graduation + merge sequence

<!-- task: red=`sh -c '! grep -q "^## BL-TAP-TARGET-INLINE-TEXT-CONTROLS" BACKLOG.md'` ac=AC-3 -->

Red now (entry heading present; negated grep exits 1; green at graduation — same command).

1. Graduate the entry (3/5 split + per-site dispositions recorded; marker off in the graduation commit); registry row per the graduation guard; `pnpm vitest run tests/docs` green as the belt.
2. Whole-diff cross-model review to APPROVE. If any post-gate repair touches a UI surface, RERUN both halves of the invariant-8 gate on the amended diff and refresh §12 before proceeding.
3. Real CI green including the lifecycle workflow executing the new spec through its oracle; `gh pr merge --merge`; fast-forward main; `0  0` check.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: five repaired sites ≥44px on their failing axes (production routes); three exempt sites pinned by the source-scan suite with comments.
- AC-2: no neighbour-overlap regressions (assertion set green).
- AC-3: entry graduates with the ratified split recorded.
- AC-4: the invariant-8 dual gate (both halves) run with P0-P3 dispositioned.
- AC-5: the new layout spec runs in `lifecycle-layout-e2e.yml` on the PR through a created executed-count oracle — never dark.

## §12 — impeccable gate record

The marker line lands here, filled, at Task 4 completion, followed by the full findings table.
