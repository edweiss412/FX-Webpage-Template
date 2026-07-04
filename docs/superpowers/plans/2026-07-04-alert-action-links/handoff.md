# Alert Action Links — Implementation Handoff

Spec: `docs/superpowers/specs/2026-07-04-alert-action-links.md` (Codex-APPROVED, 10 rounds).
Plan: `docs/superpowers/plans/2026-07-04-alert-action-links/plan.md` (Codex-APPROVED, 6 rounds).
Branch: `feat/alert-action-links` off `origin/main` (rebased onto 8e82a297 after PRs #285/#286 merged mid-flight; original base 9fe749a7). Autonomous-ship pipeline (user gates waived 2026-07-04).

## Task → commit map

| Task | Commit | Scope |
| --- | --- | --- |
| 1 — registry + unit tests + structural meta-test | c5e4624c | `lib/adminAlerts/alertActions.ts`, `tests/adminAlerts/alertActions.test.ts`, `tests/messages/_metaAlertActionsContract.test.ts` |
| 2 — per-show row link | ceb094d2 | `components/admin/PerShowAlertSection.tsx`, `tests/components/admin/perShowAlertActionLink.test.tsx` |
| 3 — banner global link | 7e4ec956 | `components/admin/AlertBanner.tsx`, `tests/components/admin/alertBannerActionLink.test.tsx` |
| prettier normalization | (chore commit after Task 3) | 4 test files, whitespace only |

Each task ran red→green TDD with an independent reviewer pass (Spec ✅ / Quality Approved, zero findings, all three rounds). Reviewers independently re-ran the suites and typecheck.

## Test evidence

- Task suites: `tests/adminAlerts/alertActions.test.ts` + `tests/messages/_metaAlertActionsContract.test.ts` + `perShowAlertActionLink` + `alertBannerActionLink` = 4 files, 54 tests, green (re-verified after prettier).
- Companion suites green: `tests/messages/` whole directory (M8 namespace scanner + catalog gates, 25 files/360 tests at Task-1 review), 4 existing PerShowAlertSection suites, `_metaAlertBannerContract` + `alertBannerDetailFailVisible` + `AlertBannerRouteBoundary`.
- `pnpm typecheck` clean; `pnpm format:check` clean.
- Full `pnpm vitest run` sweep: recorded at close-out (below).

## Negative-verification (Task 1 step 6)

Mutating `drive_file_id` → `driveFileId` inside the `LIVE_ROW_CONFLICT` alert context in `lib/sync/runOnboardingScan.ts` (NOT the sibling `logSync` payload) made exactly that raise-site pin fail (13 passed / 1 failed); the reverse edit restored 14/14 green; `git status --porcelain` empty before and after. The pins bite.

## §12 Impeccable dual-gate dispositions (invariant 8)

Both gates ran on the diff to `components/admin/PerShowAlertSection.tsx` (ceb094d2) + `components/admin/AlertBanner.tsx` (7e4ec956), canonical v3 preflight (PRODUCT.md loaded, register=product, deterministic detector run).

**`/impeccable critique`** — two isolated assessments. Assessment B (deterministic `npx impeccable --json` on both components): zero findings. Assessment A (independent LLM design review): AI-slop verdict CLEAN (both anchors are near-verbatim copies of established affordances); heuristics 35/40; zero P0/P1. Dispositions of its P2/P3 items:

| Finding | Severity | Disposition |
| --- | --- | --- |
| "Go to Published toggle" label vs `#share-access` target mismatch | P2 | **Resolved factually — no change.** The PublishedToggle renders inside `<section id="share-access">` (`app/admin/show/[slug]/page.tsx:750` → toggle at `:765`); the label is accurate. |
| Two co-equal bordered buttons in the banner action slot (action link + Mark resolved) | P2 | **Accepted — spec-ratified.** Spec §7.2 (Codex-APPROVED, 10 rounds) mandates the "Check it" markup for the banner anchor. Revisit only if operators report confusion. |
| Per-show quiet link lacks `min-h-tap-min` (venue-floor thumb target) | P2 | **Deferred to BACKLOG (`BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y`).** Verbatim inheritance from the `PerShowActionableWarnings.tsx:98` precedent; the right fix is affordance-family-wide, not a one-off divergence in this diff. |
| External links lack an SR-visible "(opens in new tab)" name | P3 | **Deferred to the same BACKLOG entry** — identical gap exists in the precedent; fix both surfaces together. |

**`/impeccable audit`** — Audit Health Score **18/20 (Excellent)**: Accessibility 3 (SR new-tab name, above), Performance 4 (pure RSC, no client JS, no animation, O(1) registry lookup), Theming 4 (100% design tokens, zero hard-coded colors), Responsive 3 (banner anchor carries `min-h-tap-min min-w-tap-min` + `flex-wrap` slot; per-show quiet link inherits the precedent's small target, above), Anti-Patterns 4 (detector clean; no bans tripped). No P0/P1 findings. Gate: **PASS** — nothing blocks under invariant 8 (HIGH/CRITICAL = none).

## Watchpoints for whole-diff review

- Registry keyed by its own `ALERT_ACTION_CODES` union, deliberately NOT `AdminAlertCode` (3 of 9 codes are raw-SQL/script producers; see `NON_UPSERT_ADMIN_ALERTS_PRODUCERS`). Spec §2 decision 1 — do not relitigate.
- Rendering split (banner=global-only) and the `REPORT_ORPHANED_LOST_LEASE` data-dependent scope are spec §2 decision 3 / §4 #7 — do not relitigate.
- Labels are static UI chrome, not §12.4 copy (spec §10 watchpoint 1).
- The slot-integrity contract (`_metaAlertBannerContract`) stays green; the banner anchor is a sibling BEFORE the untouched resolve-form ternary.
