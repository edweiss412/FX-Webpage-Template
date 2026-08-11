# Plan: /help/tour hydration fix + help-pages CI promotion

**Spec:** `docs/superpowers/specs/2026-08-10-help-tour-hydration-fix.md` (APPROVED, cross-model round 6/conversation R8, 0 findings) · **Branch:** `fix/help-tour-hydration` · **Implementer:** Opus / Claude Code (UI surface — AGENTS.md routing hard rule)

**Plan-time red, RUN 2026-08-10 (rule: a red asserting current-tree failure is run before review dispatch):** `BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/help-pages.spec.ts --project=mobile-safari` → **1 failed** (`/help/tour → … no console errors`, `pageErrors` non-empty at `tests/e2e/help-pages.spec.ts:152`), **14 passed**, 26.0 s. This also fixes the executed-count derivation: 15 cases × 1 project.

**Meta-test inventory (declared):** EXTENDS `scripts/check-app-e2e-executed.mjs` `REQUIRED` map (+1 row), the `ENV_KEY_ALLOWLIST` `governs` arrays in `tests/ci/_workflowCoverageScan.ts` (17 pairs), and DELETES one allowlist row in `tests/ci/_metaE2eWorkflowCoverage.test.ts`. Creates no new meta-test. Advisory locks, Supabase boundaries, admin alerts: none applies — the diff touches one MDX page and CI wiring only.

**Layout-dimensions / transition-audit tasks:** N/A per spec (no dimensional invariants, no transitions — both sections state None with reasons).

**e2e harness readiness:** boot is the playwright config's port-3000 webServer (`BASELINE_SERVER_ONLY=1` filter). Honest gate statement (plan R3 F1): the existing spec awaits only `networkidle` (`tests/e2e/help-pages.spec.ts:128`) with no hydration-specific gate — a late hydration error can post-date the assertion window. Task 1 therefore ADDS a hydration gate to the page-error case: after `networkidle`, drive a React-owned STATE TRANSITION and await its rendered effect — click the help sidebar's disclosure button and await its open-state DOM change (an onClick handler firing proves hydration completed; SSR-only DOM cannot respond — R4 F1), then restore the state, THEN read `pageErrors`. No fixed settle beat as the oracle; the interaction round-trip is the gate. Detach-safety: per-route fresh locators (existing pattern).

<!-- tasks: depth=2 -->

## Task 1 — Fix the three expanded cards (expression children)

<!-- task: red=`BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/help-pages.spec.ts --project=mobile-safari` ac=AC-1,AC-2 -->

Red (OBSERVED at plan time, above): the `/help/tour` page-errors case fails on the hydration mismatch; the production defect is the markdown-paragraph nesting emitted from `app/help/tour/page.mdx:18`, `app/help/tour/page.mdx:65`, and `app/help/tour/page.mdx:101`.

1. In `app/help/tour/page.mdx`, convert EVERY text child of the three expanded cards ("Review queues", "Preview as crew", "Onboarding wizard") to JSX expression children (`{"…"}`), collapsing each child's internal whitespace runs to single spaces. ALL text children — eyebrow, duration, `<h3>` text, body, CTA — per spec §4 (partial conversion lets Prettier re-expand headings; probe-proven). Hrefs, aria-labels, classNames, and every copy word byte-preserved. The four compact cards untouched.
2. Prettier stability proof (R7 F1, snapshot without a premature commit — R8 F1: invariant 1 commits only after green): STAGE the MDX edit (`git add app/help/tour/page.mdx`), THEN run the repo formatter and assert `git diff --exit-code app/help/tour/page.mdx` (working tree vs the staged snapshot — formatting changed nothing), and `pnpm format:check` green. The task COMMIT happens once, at the end, after step 5.
3. Compile probe (ad hoc, not committed): the §3 probe yields exactly ONE `_components.p` (the intro at `app/help/tour/page.mdx:3`), none nested — before AND after formatting.
4. Green: the red command passes (15/15). Run the full spec once more to confirm no sibling route regressed.
5. Copy-equality check (AC-2): extract text/href/aria/class values before and after; text compared whitespace-normalized, the rest byte-equal.

## Task 2 — CI promotion wiring

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` ac=AC-3 -->

Red is written by this task (invariant-1 shape): deleting the `"tests/e2e/help-pages.spec.ts": UNSEEN` row (`tests/ci/_metaE2eWorkflowCoverage.test.ts:148`) makes the meta-test red because the production line that satisfies it — a `tests/e2e/help-pages.spec.ts` entry in the run command at `.github/workflows/app-e2e.yml:143` — is absent on the live tree (verified absent 2026-08-10).

1. Delete the allowlist row; observe the meta-test red for the stated reason.
2. Add `tests/e2e/help-pages.spec.ts` to the `app-e2e.yml:143` run command (no `--project` changes — mobile-safari only, where the file resolves per `playwright.config.ts:78`).
3. `REQUIRED` oracle row: `"help-pages.spec.ts": 15` (`scripts/check-app-e2e-executed.mjs:30` map; 14 NAV routes + parity guard × 1 project, matching the plan-time run). Update the oracle's seven-spec/54-execution calibration comments (now eight-spec/69).
4. The 17 `governs` arrays (`tests/ci/_workflowCoverageScan.ts:703` region; the spec §5.4b list) each gain `tests/e2e/help-pages.spec.ts`. Verify the exact pair set against the meta-test's own failure output, not the spec list.
5. Header comments: rewrite `app-e2e.yml:7` and `app-e2e.yml:34` (blocker gone), and the `app-e2e.yml:2` seven-spec synopsis → eight. Numeric sweep of the whole workflow header in the same commit.
6. Green: the meta-test passes; `pnpm vitest run tests/cross-cutting/app-e2e-ci-wiring.test.ts` (key parity at :203) passes.

## Task 3 — Impeccable dual gate (invariant 8)

<!-- task: red=`grep -qE "^impeccable-gate: critique=RAN" docs/superpowers/plans/2026-08-10-help-tour-hydration-fix.md` ac=AC-5 -->

Red now (observed at plan time: the LINE-ANCHORED grep exits 1 — the only current occurrence of the pattern is inside this task's own marker comment, which is not at line start; the real §12 marker will be — R2 F1). After filling the §12 marker, RERUN the same command and observe exit 0 (the required green endpoint, R2 F2). Run BOTH halves of the invariant-8 dual gate (`/impeccable`, critique mode then audit mode) on the diff with the canonical v3 setup (context.mjs load then register read). Expected visual delta nil-to-minimal (spec §6); P0/P1 findings fixed or DEFERRED.md-logged. On completion, fill the §12 marker line with the real values (`critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>`) — the closeout guard accepts only the filled form, which is why this task precedes the docs-suite green in Task 4.

## Task 4 — Parent-entry reconciliation + graduation

<!-- task: red=`sh -c '! grep -q "^## BL-HELP-TOUR-HYDRATION-MISMATCH" BACKLOG.md'` ac=AC-6 -->

Red now (observed: the entry heading exists in BACKLOG.md, so the negated grep exits 1; it exits 0 once the entry graduates — same command, real production line). R1 F4 correction: `pnpm vitest run tests/docs` does NOT discriminate this state (the graduation guard is registry-driven with no inverse archive-completeness check), so it is a step-level green check, not the cycle. Census + registry bookkeeping get their own observable checks in the steps.

1. `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (`BACKLOG.md:686` region): heading population 25 → 24 (count the allowlist, per its own rule), rewrite the "Ninth member deferred, not wired" paragraph (`BACKLOG.md:731` region) to record the promotion. Dated historical records untouched.
2. Graduate `BL-HELP-TOUR-HYDRATION-MISMATCH` to `BACKLOG-archive.md` with the fix + promotion recorded; add any registry row the graduation guard requires (check `tests/docs/_metaDeferralLedgerGraduation.test.ts` registry).
3. Observable checks: the red command flips green; `grep -q "24 app-dependent" BACKLOG.md` (census restated); the graduation registry row present (grep the ID in `tests/docs/_metaDeferralLedgerGraduation.test.ts`); then `pnpm vitest run tests/docs` green as the suite-level belt.
4. Invariant-12 note (R1 F5): the IN PROGRESS marker comes off IN THE SAME COMMIT that archives the entry — the explicitly sanctioned graduation shape — so Task 5 owes NO end-of-PR marker removal; archives reject in-flight entries, so it cannot ride along.

## Task 5 — Five-green wiring bar + merge sequence

<!-- task: red=`sh -c 'SHA=$(git rev-parse HEAD); gh run list --workflow=app-e2e.yml --branch fix/help-tour-hydration --json conclusion,event,headSha --jq "[.[] | select(.event==\"pull_request\")] | .[0:5] | (length==5) and all(.conclusion==\"success\") and (.[0].headSha==\"$SHA\")" | grep -qx true'` ac=AC-6 -->

The `red=` above IS the acceptance command (R1 F1/F2; window semantics settled R5 F1 — five same-sha RUN rows are impossible: `gh run rerun` reuses the run id and only adds an attempt, per the live-tree evidence at `docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md:461`, while any commit changes the sha). The bar is therefore batch-1's ACTUAL shape: the FIVE most recent pull_request runs are ALL green (consecutive — a red anywhere in the window fails `all`) AND the newest run is on the FINAL content sha (`.[0].headSha == git rev-parse HEAD`), so the final content is covered and no red is skipped over. The five runs accrue from the PR's ordinary content pushes plus, if short, empty-commit re-triggers — each makes a NEW run row, and each becomes the newest, keeping the head-sha conjunct true. Red NOW (zero runs); constructed-failure probes: zero-run, four-run, mixed-conclusion, and newest-not-on-head JSON all emit `false` (exit 1); five greens with the newest on head emit `true` (exit 0).

1. Open the PR; let `pull_request` runs accumulate; re-trigger via EMPTY COMMITS when the PR's natural pushes leave the window short (each creates a new run row and a new head; the acceptance conjunct tracks the newest — R5 F1; `workflow_dispatch` runs are NOT evidence and `gh run rerun` adds attempts, not runs).
2. Five consecutive green `app-e2e` pull_request runs, zero retries, consecutive with the newest on the final head (R1 F6 + R5 F1): a content push after the window is accepted invalidates it (the newest run moves), so acceptance is re-checked as the LAST act before merge; empty commits are permitted window fillers since the conjunct follows the newest run. **Evidence recording (R6 F1): after the acceptance command emits true, run `gh run list --workflow=app-e2e.yml --branch fix/help-tour-hydration --json databaseId,url,conclusion,event --jq '[.[] | select(.event=="pull_request")] | .[0:5] | .[].url'` and paste the five URLs into the PR body (`gh pr comment`/`gh pr edit`) BEFORE merge — the spec's AC-6 requires the links, not only the Boolean.**
3. Fallback (spec §5, pre-ratified): a help-pages flake inside the window reverts the promotion as a unit (YAML entry, oracle row, 17 governs, allowlist row restored WITH flake reason, parent census restored, comments name the flake) while Tasks 1 + 3 + 4 still ship. **AC-1 stays bound on this path (R3 F2): before merge, run the spec once against a production build with the test-auth contract the suite needs (R7 F2): `pnpm build` then `ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=<the value playwright.config supplies> pnpm start`, then the Task 1 command against it (signInAs requires those vars or the auth route 404s), transcript pasted in the PR — the spec's both-postures requirement does not ride on the reverted CI wiring.** The ARCHIVE entry is written to match reality (R3 F5): Task 4's graduation text records the fix unconditionally and the promotion CONDITIONALLY — on fallback, the same reconciliation commit amends the archive entry AND rewrites the parent entry's ninth-member paragraph to record the ATTEMPTED promotion and the flake (R6 F2: the spec's §5 fallback bookkeeping covers that paragraph too, not only the census and comments), before merge.
4. Whole-diff cross-model review to APPROVE BEFORE the five-green window is accepted (review repairs are content pushes and reset it — R1 F6 ordering). **If any post-gate repair touches `app/help/tour/page.mdx` or any UI surface, RERUN both halves of the invariant-8 gate on the amended diff and refresh the §12 record + marker before the window restarts (R3 F3 — the gated diff must be the merged diff), then rerun `pnpm vitest run tests/docs`.** Real CI green (all workflows); `gh pr merge --merge`; fast-forward main; `git rev-list --left-right --count main...origin/main` == `0  0`. (No end-of-PR ledger-marker step — see Task 4's invariant-12 note.)

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: zero page errors on /help/tour, mobile-safari, both server postures.
- AC-2: hrefs/aria/classes byte-identical; copy whitespace-normalized-equal.
- AC-3: spec wired in app-e2e.yml, allowlist row gone, coverage meta-test green (fallback reading per spec §5).
- AC-4: no stale blocker comment or contradicting cardinality in the workflow header.
- AC-5: the invariant-8 dual gate (both halves) run with P0/P1 dispositioned.
- AC-6: five-green pull_request bar met with evidence, parent entry restated, graduation registered (fallback reading per spec §5).

## §12 — impeccable gate record

The marker line lands here, filled, at Task 3 completion (the guard accepts only the filled grammar), FOLLOWED by the full findings table (R3 F4): every critique and audit finding — P0 through P3 — one row each with severity, description, and disposition (fixed / DEFERRED.md ref / accepted-with-reason). Aggregate counts alone are not the record.
