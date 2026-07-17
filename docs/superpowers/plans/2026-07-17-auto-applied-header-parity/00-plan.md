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

Ordering rationale: the affordance matrix row and the `<HoverHelp>` call site MUST land in the SAME commit. `_metaAffordanceMatrixParity.test.ts:100-114` requires every live concrete testid to occur EXACTLY ONCE across `components/`+`app/` (the matrix file itself is excluded from that scan). Adding the row alone → testid occurs zero times → fail; adding the call site alone → references a non-live testid → fail. So the matrix row + `StripHeader` (with the HoverHelp) are one task/commit (Task 2), with the parity meta-test expected RED until both sides land together.

### Task 1 — Gap fix (`fix(admin): …`)

- **Test first (real-browser, Playwright — jsdom cannot compute layout):** at desktop 1280×800 (two-col split active ≥1240), render `/admin` with a POPULATED inbox AND a rendered strip. Assert `getBoundingClientRect()`: the strip section (`[data-testid=recent-auto-applied-strip]`) `.top` is within 14px of the inbox (`[data-testid=needs-attention-inbox]`) `.bottom` (the container's `gap-3` = 12px + tolerance). **Concrete failure mode caught:** reintroducing `h-full`/`flex-1` on the inbox re-opens the detached band (the strip's top would jump hundreds of px below the inbox bottom in a stretched column). Prefer extending the existing admin layout-dimensions spec `tests/e2e/admin-nav-layout-dimensions.spec.ts` if it already seeds a populated inbox; else a new spec seeding one strip row + one inbox item.
- **Implementation:** `components/admin/NeedsAttentionInbox.tsx:182` — remove `h-full` from the populated-branch root (`flex h-full flex-col gap-2` → `flex flex-col gap-2`). Empty-state branch (:170) untouched.
- **Verify:** the new Playwright assertion green; `Dashboard.test.tsx` still green.

### Task 2 — Strip header parity + affordance row (ONE commit) (`feat(admin): …`)

The matrix row and the HoverHelp call site land together (parity occurrence-uniqueness rule above). Shape-test edit + strip-component test are the red phase; matrix row + `StripHeader` are the green.

- **Test first (RED — all four features absent):**
  - `tests/help/_affordance-matrix-shape.test.ts` — add `"help-affordance--dashboard-recently-auto-applied--tooltip"` to the sorted expected array (:42-72) and bump `toHaveLength(18)` → `19` (:102), comment extended (`+1 recently-auto-applied strip header help`).
  - `tests/components/admin/RecentAutoAppliedStrip.test.tsx` — add cases per spec §8:
    (a) `headingLevel={4}` + `ok` fixture (`renderedCount:4, overflowCount:3`) → `recent-auto-applied-count-chip` text `7` (**derived** `4+3` from the summed fixture fields, not a bare literal);
    (b) `headingLevel={4}` → HoverHelp root `help-affordance--dashboard-recently-auto-applied--tooltip` present, its "Learn more" link href = `/help/admin/review-queues#re-stage`;
    (c) `headingLevel={4}` + `infra_error` → help present, `recent-auto-applied-count-chip` null;
    (d) `headingLevel={2}` + `ok` → BOTH `recent-auto-applied-count-chip` AND the help root null (queryByTestId);
    (e) existing per-group `auto-applied-count-${showId}` badge assertions unchanged (regression).
- **Implementation (GREEN — both sides together):**
  - `app/help/_affordanceMatrix.ts` — add the concrete row per spec §4.3 (`sourceRoute:"/admin"`, `target:"/help/admin/review-queues#re-stage"`, `visibleAt:"desktop"`).
  - `components/admin/RecentAutoAppliedStrip.tsx` — add `StripHeader` (spec §4.2), render it in both `ok` and `infra_error` returns replacing the bare `<SectionHeading>`, passing `showAffordances={headingLevel === 4}` + `count`. Import `HoverHelp`.
- **Verify:** `pnpm test tests/help/_affordance-matrix-shape.test.ts tests/help/_metaAffordanceMatrixParity.test.ts tests/components/admin/RecentAutoAppliedStrip.test.tsx` all green (parity occurrence-uniqueness satisfied only because both sides landed in this commit).
- **Impeccable note:** the primary UI surface — the invariant-8 dual-gate (Task 6) reviews this diff.

### Task 4 — Walker seed + capture-isolation cleanup (`test(infra): …` then `feat(infra): …`)

The deep-link walker (`deep-link-walker.spec.ts`) IS the behavioral test; it auto-registered the new row in Task 2. TDD red→green is made explicit here:

- **RED (prove the gap first, BEFORE any seed edit):** with Tasks 1-2 landed and the DB seeded base-only (`pnpm db:seed` + `pnpm dlx tsx supabase/seedWalkerFixtures.ts` WITHOUT the new `autoAppliedSeedSql`), run the help-docs-desktop walker filtered to the new row:
  `pnpm exec playwright test tests/e2e/deep-link-walker.spec.ts --project=help-docs-desktop -g "recently-auto-applied"`.
  It MUST FAIL with the strip/tooltip absent (`help-affordance--dashboard-recently-auto-applied--tooltip should be visible on /admin`) — no `auto_apply` `show_change_log` row exists, so the strip returns `null`. Record the red output. (This is the failing test that pins the seed's necessity — the walker row alone is red until the fixture exists.)
- **GREEN (implement the seed):**
  - `supabase/seedWalkerFixtures.ts` — add `AUTO_APPLIED_SENTINEL = "seed-fixture:walker-auto-applied"` + `autoAppliedSeedSql()` (spec §4.4, `field_changed`, non-undoable), composed into the seeder SQL as a sibling top-level statement next to `alertSeedSql()` (outside the advisory-lock block).
  - `supabase/seed.ts` — add `delete from public.show_change_log where created_by like 'seed-fixture:%';` to the base-seed cleanup block (near the existing seed-prefix deletes ~:559-565) for screenshot capture isolation.
  - Re-seed (`pnpm db:seed` + `pnpm dlx tsx supabase/seedWalkerFixtures.ts`) and rerun the SAME filtered walker command → now GREEN (tooltip visible on `/admin`, "Learn more" → `#re-stage`). Record the green output.
- **Verify (isolation + regression):** `pnpm db:seed` ALONE (no walker fixtures) leaves NO strip row (`select count(*) from public.show_change_log where created_by like 'seed-fixture:%'` = 0 → capture isolation). `seed-restage-fixture.test.ts` still green.

### Task 5 — Full local gates

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full Vitest) all green. Grep any removed/renamed testids across `tests/` (none expected — all additions). Run the deep-link walker (help-docs-desktop) green end-to-end.

### Task 6 — Impeccable dual-gate (invariant 8)

`/impeccable critique` AND `/impeccable audit` on the FULL affected UI diff. Per the project rule, UI surface = any file under `app/` (except `app/api/**`) or `components/`, so the gate scope is ALL THREE changed such files:
- `components/admin/RecentAutoAppliedStrip.tsx` — primary visual surface (new header row, chip, help).
- `components/admin/NeedsAttentionInbox.tsx` — the gap fix.
- `app/help/_affordanceMatrix.ts` — under `app/`, so in scope by the letter of the rule; it is a NON-VISUAL data registry (no rendered output — it wires an already-designed `HoverHelp`), so its disposition is "no visual finding possible; reviewed for correctness of the row's route/target/testid only." Recorded explicitly rather than silently excluded.

Canonical v3 setup gates (context.mjs → register read). P0/P1 findings fixed or `DEFERRED.md`'d BEFORE cross-model close-out. Findings + dispositions recorded for the handoff.

### Task 7 — Screenshot drift check (screenshots-drift NOT required)

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
