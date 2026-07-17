# Plan — Auto-applied header parity + strip gap fix

Spec: `docs/superpowers/specs/2026-07-17-auto-applied-header-parity.md` (Codex-APPROVED, 2 rounds).

Implementer: Opus / Claude Code (UI surface — invariant 8 impeccable dual-gate applies).

## Meta-test inventory (declared)

- **EXTENDED:** `tests/help/_affordance-matrix-shape.test.ts` — new concrete row added to the exact sorted testid list (:42-72) + count `18 → 19` (:102).
- **AUTO-COVERED (no edit):** `tests/help/_metaAffordanceMatrixParity.test.ts` — the new `<HoverHelp>` call site must reference the live matrix testid; passes once row + call site both land.
- **AUTO-COVERED (no edit):** `tests/e2e/deep-link-walker.spec.ts` — the new concrete row auto-registers via `allWalkableRows`; walks desktop, asserts tooltip + "Learn more →" → `#re-stage`. Requires the walker seed.
- **REGRESSION (must stay green, NOT edited):** `tests/db/seed-restage-fixture.test.ts` — no `WALKER_DRIVE_FILE_IDS` change; `tests/auth/advisoryLockRpcDeadlock.test.ts` — no new lock surface.

## Advisory-lock holder topology

No change. The new `show_change_log` seed insert + base-seed cleanup delete are on an UNLOCKED table (invariant-2 set = `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`). `WALKER_DRIVE_FILE_IDS` (4 ids) and its sorted lock sweep are untouched. `advisoryLockRpcDeadlock.test.ts` not extended.

## Task order (TDD, one commit each)

Ordering rationale — two hard constraints from the meta-tests:
1. **Row + call site + walker seed are ONE commit (Task 2).** `_metaAffordanceMatrixParity.test.ts:100-114` requires every live concrete testid to occur EXACTLY ONCE across `components/`+`app/` (matrix file excluded), so the matrix row and the `<HoverHelp>` call site must land together. AND the moment the concrete row lands it auto-registers in the deep-link walker (`allWalkableRows`), which then asserts the tooltip visible on `/admin` — so the walker seed (`autoAppliedSeedSql` + base-seed cleanup) MUST land in the SAME commit, or that commit leaves a red e2e surface (violating commit-per-task-green; Codex plan R3). Therefore Task 2 = matrix row + `StripHeader`/HoverHelp + walker seed + cleanup, and its verify runs the filtered walker GREEN.
2. **The gap test self-seeds (Task 1) so it is independent of Task 2's walker seed.** The real-browser adjacency assertion needs a populated inbox AND a rendered strip; rather than depend on Task 2's fixture, Task 1's test seeds its own `pending_syncs` inbox row + one `auto_apply` `show_change_log` strip row via service-role and cleans them up — mirroring the existing badge-height test in `admin-nav-layout-dimensions.spec.ts` (which already service-role-seeds a `pending_syncs` row). Task 1 is then green standalone.

### Task 1 — Gap fix (`fix(admin): …`)

- **Test first (real-browser, Playwright — jsdom cannot compute layout):** extend `tests/e2e/admin-nav-layout-dimensions.spec.ts`. Service-role-seed one `pending_syncs` inbox row (so the inbox uses its POPULATED branch, `needs-attention-inbox`) AND one `auto_apply`/`applied`/unacknowledged `show_change_log` row on a published seed show (so the strip renders); at desktop 1280×800 (two-col split ≥1240), navigate `/admin` and assert via `getBoundingClientRect()` that `[data-testid=recent-auto-applied-strip]` `.top` is within 14px of `[data-testid=needs-attention-inbox]` `.bottom` (container `gap-3` = 12px + tolerance). Clean up both seeded rows in a `finally`/`afterAll`. **Concrete failure mode caught:** reintroducing `h-full`/`flex-1` on the inbox re-opens the detached band (the strip's top jumps hundreds of px below the inbox bottom in the stretched column).
- **Implementation:** `components/admin/NeedsAttentionInbox.tsx:182` — remove `h-full` from the populated-branch root (`flex h-full flex-col gap-2` → `flex flex-col gap-2`). Empty-state branch (:170) untouched.
- **Verify:** the new Playwright assertion green (RED before the `h-full` removal — the strip sits far below the inbox); `Dashboard.test.tsx` still green.

### Task 2 — Header parity + affordance row + walker seed (ONE commit) (`feat(admin): …`)

Everything that touches the walker row lands together so the committed state is fully green (Vitest + filtered walker). The RED phase is demonstrated during development, not committed.

- **Test first (RED):**
  - `tests/help/_affordance-matrix-shape.test.ts` — add `"help-affordance--dashboard-recently-auto-applied--tooltip"` to the sorted expected array (:42-72); bump `toHaveLength(18)` → `19` (:102), comment extended (`+1 recently-auto-applied strip header help`).
  - `tests/components/admin/RecentAutoAppliedStrip.test.tsx` — add cases per spec §8:
    (a) `headingLevel={4}` + `ok` fixture (`renderedCount:4, overflowCount:3`) → `recent-auto-applied-count-chip` text `7` (**derived** `4+3` from the summed fixture fields, not a bare literal);
    (b) `headingLevel={4}` → HoverHelp root `help-affordance--dashboard-recently-auto-applied--tooltip` present, its "Learn more" link href = `/help/admin/review-queues#re-stage`;
    (c) `headingLevel={4}` + `infra_error` → help present, `recent-auto-applied-count-chip` null;
    (d) `headingLevel={2}` + `ok` → BOTH `recent-auto-applied-count-chip` AND the help root null (queryByTestId);
    (e) existing per-group `auto-applied-count-${showId}` badge assertions unchanged (regression).
  - Vitest for the above runs RED. Additionally, to demonstrate the walker's dependence on the seed: after the matrix row + call site are drafted BUT before adding the seed, run the filtered walker and observe it RED (`help-affordance--dashboard-recently-auto-applied--tooltip should be visible on /admin`). This is a development-time demonstration; it is NOT committed in a red state.
- **Implementation (GREEN — all together in this commit):**
  - `app/help/_affordanceMatrix.ts` — add the concrete row per spec §4.3 (`sourceRoute:"/admin"`, `target:"/help/admin/review-queues#re-stage"`, `visibleAt:"desktop"`).
  - `components/admin/RecentAutoAppliedStrip.tsx` — add `StripHeader` (spec §4.2), render in both `ok` and `infra_error` returns replacing the bare `<SectionHeading>`, passing `showAffordances={headingLevel === 4}` + `count`. Import `HoverHelp`.
  - `supabase/seedWalkerFixtures.ts` — add `AUTO_APPLIED_SENTINEL = "seed-fixture:walker-auto-applied"` + `autoAppliedSeedSql()` (spec §4.4, `field_changed`, non-undoable), composed into the seeder SQL as a sibling top-level statement next to `alertSeedSql()` (outside the advisory-lock block).
  - `supabase/seed.ts` — add `delete from public.show_change_log where created_by like 'seed-fixture:%';` to the base-seed cleanup block (~:559-565) for screenshot capture isolation.
- **Verify (ALL green in this commit):** `pnpm test tests/help/_affordance-matrix-shape.test.ts tests/help/_metaAffordanceMatrixParity.test.ts tests/components/admin/RecentAutoAppliedStrip.test.tsx`; re-seed (`pnpm db:seed` + `pnpm dlx tsx supabase/seedWalkerFixtures.ts`) then the filtered walker GREEN: `pnpm exec playwright test tests/e2e/deep-link-walker.spec.ts --project=help-docs-desktop -g "recently-auto-applied"` (tooltip visible on `/admin`, "Learn more" → `#re-stage`). Isolation: `pnpm db:seed` ALONE leaves `select count(*) from public.show_change_log where created_by like 'seed-fixture:%'` = 0. Regression: `seed-restage-fixture.test.ts` green.
- **Impeccable note:** the primary UI surface — the invariant-8 dual-gate (Task 4) reviews this diff.

### Task 3 — Full local gates

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full Vitest) all green. Grep any removed/renamed testids across `tests/` (none expected — all additions). Run the deep-link walker (help-docs-desktop) green end-to-end.

### Task 4 — Impeccable dual-gate (invariant 8)

`/impeccable critique` AND `/impeccable audit` on the FULL affected UI diff. Per the project rule, UI surface = any file under `app/` (except `app/api/**`) or `components/`, so the gate scope is ALL THREE changed such files:
- `components/admin/RecentAutoAppliedStrip.tsx` — primary visual surface (new header row, chip, help).
- `components/admin/NeedsAttentionInbox.tsx` — the gap fix.
- `app/help/_affordanceMatrix.ts` — under `app/`, so in scope by the letter of the rule; it is a NON-VISUAL data registry (no rendered output — it wires an already-designed `HoverHelp`), so its disposition is "no visual finding possible; reviewed for correctness of the row's route/target/testid only." Recorded explicitly rather than silently excluded.

Canonical v3 setup gates (context.mjs → register read). P0/P1 findings fixed or `DEFERRED.md`'d BEFORE cross-model close-out. Findings + dispositions recorded for the handoff.

### Task 5 — Screenshot drift check (screenshots-drift NOT required)

Verify the two `/admin` baselines are unchanged (spec argues they are: gap fix touches the populated branch; baselines use the 0-pending empty-state branch). If unexpected drift appears, regenerate FROM the pinned Playwright Docker image with `--platform linux/amd64` (arm64 host) in the same PR; otherwise no baseline change.

## Transition-audit — N/A (declared)

No new animated visual states. The count chip and `?` trigger are static inline elements; `HoverHelp`'s own open/close popover transitions are pre-existing and covered by `tests/components/admin/HoverHelp.test.tsx`. The gap fix removes a height constraint (no state machine). No `AnimatePresence`/ternary-render transition added → no transition-audit task required.

## Anti-tautology rules applied

- Chip test derives `7` from `renderedCount + overflowCount` fixture fields, never a hardcoded literal (a fixture change must move the assertion).
- Gap test asserts a real `getBoundingClientRect` geometric relationship (strip.top ≈ inbox.bottom + gap), not "the component rendered."
- Dashboard-only test (case d) proves the affordance is ABSENT at `headingLevel={2}` — catches accidental un-gating.

## Fix-round regression budget

Any repair to a UI file re-runs: the full `pnpm test`, the affordance parity + shape meta-tests, and the deep-link walker (help-docs-desktop). Any repair to the seed re-runs `seed-restage-fixture.test.ts` + a base-seed-only isolation check.

## Out of scope / do-not-relitigate

- Reusing `#re-stage` (not a new anchor) — ratified spec §3, §11.
- Seeding on RPAS via unlocked non-locked insert (not a new fixture show) — spec §7, §11.
- `/admin/needs-attention` header staying bare — spec §4.2 (Codex R1 finding 2 resolution).
- The unrelated `main`-branch CI failure (PR #440) is NOT part of this work.
