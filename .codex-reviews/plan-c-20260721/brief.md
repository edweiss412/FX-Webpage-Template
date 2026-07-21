# Plan review C - TASKS 14-17 (card, DB tests, browser proofs, close-out) + declarations

## Your role: REVIEWER ONLY

Do not fix, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## What this is

An implementation plan for a DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog of storable scenario rows feeds two consumers: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real).

The SPEC it implements is already APPROVED after five review rounds. Do NOT re-review the design. Review the PLAN: whether an engineer with no context could execute these tasks and land correct, tested code.

## Settled design decisions - do NOT relitigate

- Materialize accepts tier-3 scenarios only; tiers 1 and 2 are gallery-only.
- Apply replaces alerts and holds (tag-scoped) except collision skips, which leave the AUTHENTIC row untouched; warnings are declared-only and do not reconcile across scenarios.
- Warnings are never written on validation, because validation Clear cannot regenerate them.
- Environments gate on the URL the client actually uses: local must be loopback; validation must satisfy projectRefFromUrl(url) === VALIDATION_PROJECT_REF.
- Gallery action controls render but are neutralized by a capture-phase submit listener, NOT by `inert`.
- Bucketing runs on the server and returns pre-rendered ReactNode arrays, not items.
- Catalog COVERAGE is deliberately not gated; catalog VALIDITY is, via an executable validator.
- No migration, no new advisory-lock holder.

## Binding project rules for plans

- TDD per task: failing test, minimal implementation, passing test, commit.
- No placeholders. Every step that changes code shows the code. "Add appropriate error handling" is a plan failure.
- Every test task states the concrete failure mode it catches; a test that only proves "the function was called" is too weak.
- Anti-tautology: assert against the data source, not a container that renders it; derive expected values from fixtures rather than hardcoding; exercise null/zero/NaN/out-of-range.
- Snippets must typecheck under strict TS (noUncheckedIndexedAccess, exactOptionalPropertyTypes).
- Types, function names, and signatures used in later tasks must match what earlier tasks define.

## What I need

Judge executability and correctness. Highest value: a task whose steps cannot actually be followed; a test that would pass while the bug it names is present; a signature mismatch between tasks; a spec requirement with no task; a step that would not compile.

If a section is sound, say so and APPROVE. Do NOT manufacture findings.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <task/step> - <why it fails, concretely>`.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## CONTEXT: the plan's declarations

## Global Constraints

- **TDD per task.** Failing test → minimal implementation → passing test → commit. Never implement before the test.
- **Commit per task**, conventional-commits style: `<type>(<scope>): <summary>`. Scope is `admin` or `dev` for this work.
- **Worktree:** all work happens in `/Users/ericweiss/FX-worktrees/attention-scenario-gallery` on `feat/attention-scenario-gallery`. Never the main checkout.
- **No migration.** This plan changes no schema. If a task seems to need one, stop — the spec forbids it (§1.1).
- **No new advisory-lock holder.** `runManualSyncForShow` is the sole acquirer for `show:<drive_file_id>`; materialize calls it and never acquires (§7.2).
- **No raw error codes in operator-facing UI** except the ratified §1.1 scope: the gallery's routing readout, scenario ids, the `PICKER_EPOCH_RESET` non-render row, the unknown-scenario id list, the materialize selector, and §5.3 result codes.
- **Em-dash ban** in all user-visible copy. Apostrophes are literal `'`. Tap targets `min-h-tap-min`.
- **Every Supabase call** destructures `{ data, error }`, distinguishes returned from thrown, and maps infra faults to a typed result.
- **Before every push:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`. A scoped run is not sufficient.

## Meta-test inventory (declared per AGENTS.md)

- **Creates:** one — the `FILES`-membership walk (Task 10). It is the only CI-enforced protection against an unregistered dev route.
- **Extends:** `tests/log/_auditableMutations.ts` (4 rows, Task 13); `tests/log/adminOutcomeBehavior.test.ts` (4 behavioral proofs + `chainResult` mock extension, Task 13); `tests/admin/build-artifact-gate.test.ts` (enabled-flag case, Task 10).
- **Declined:** a catalog-_completeness_ meta-test (§1.1). Catalog _validity_ is tested (Task 3); coverage is not gated.
- **Not extended:** any invariant-9 registry — none has `app/admin/dev` in scope. The obligation is per-call-site inline annotations (Task 12).

## Advisory-lock topology (declared per AGENTS.md)

Hashkey `show:<drive_file_id>`. Complete holder list after this change: **(1) `runManualSyncForShow`** (`lib/sync/runManualSyncForShow.ts:297`), JS-side, pre-existing, unchanged. Materialize adds zero acquirers at any layer. `assertShowLockHeld` asserts a precondition and does **not** detect double-acquisition (§7.2).

## File structure

**Created:**

| Path                                             | Responsibility                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `lib/dev/attentionScenarios/types.ts (new)`      | Scenario row types only. No data, no logic.                         |
| `lib/dev/attentionScenarios/validate.ts (new)`   | `validateScenario` — the executable guard contract (§3.6).          |
| `lib/dev/attentionScenarios/tier1.ts (new)`      | Per-code alert and warning scenarios, runtime-derived.              |
| `lib/dev/attentionScenarios/tier2.ts (new)`      | The structural matrix (§4.2).                                       |
| `lib/dev/attentionScenarios/tier3.ts (new)`      | Composites, the only materializable tier.                           |
| `lib/dev/attentionScenarios/index.ts (new)`      | Assembles all tiers; exports `ALL_SCENARIOS`, `scenarioById`.       |
| `lib/dev/materialize/env.ts (new)`               | Target resolution and the loopback / project-ref gate (§5.5). Pure. |
| `lib/dev/materialize/plan.ts (new)`              | Guard evaluation and the Apply/Clear write plan. Pure, no I/O.      |
| `components/admin/dev/ScenarioBlock.tsx (new)`   | Client component: pill ref, menu open state, submit interception.   |
| `components/admin/dev/MaterializeCard.tsx (new)` | Client component: the dev-panel card.                               |
| `app/admin/dev/attention-gallery/page.tsx (new)` | Server route: derive, bucket, flatten, render blocks.               |
| `tests/admin/dev/filesMembership.test.ts (new)`  | The new meta-test (Task 10).                                        |

**Modified:**

| Path                                      | Change                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/adminAlerts/fetchPerShowAlerts.ts`   | Extract `deriveAlertRowFields` + move `crewNameFor`; call the extraction.                                 |
| `lib/sync/feed/readShowChangeFeed.ts`     | Extract `shapeHoldEntry`; call the extraction.                                                            |
| `scripts/with-admin-dev-flag.mjs`         | Add the gallery route to `FILES`.                                                                         |
| `app/admin/dev/actions.ts`                | Add `applyAttentionScenario` / `clearAttentionScenario` + form wrappers; amend the file-level annotation. |
| `app/admin/dev/page.tsx`                  | Mount `MaterializeCard`.                                                                                  |
| `tests/log/_auditableMutations.ts`        | 4 registry rows.                                                                                          |
| `tests/log/adminOutcomeBehavior.test.ts`  | Extend `chainResult`; 4 behavioral proofs.                                                                |
| `tests/admin/build-artifact-gate.test.ts` | Enabled-flag assertion.                                                                                   |

## ARTIFACT

### Task 14: The materialize dev-panel card

Spec §5.3, §9. Full mechanical UI checklist applies here — this surface has operator-facing copy.

**Files:**

- Create: `components/admin/dev/MaterializeCard.tsx (new)`
- Modify: `app/admin/dev/page.tsx`
- Test: `tests/components/admin/dev/materializeCard.test.tsx (new)`

- [ ] **Step 1: Write the failing test** — controls disable while a request is in flight (the double-submit guard); switching target resets confirmation to unconfirmed; a displayed result clears when any control changes; the confirmation control appears only for validation; and the destructive-scope copy states that Clear removes **all** synthetic rows for the show, not just the selected scenario.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** the card. Copy resolves through `lib/messages/lookup.ts` for operator-facing outcomes. `min-h-tap-min` on every control. No em-dashes.
- [ ] **Step 4: Run to verify it passes.** - [ ] **Step 5: Commit**

```bash
git add components/admin/dev/MaterializeCard.tsx app/admin/dev/page.tsx tests/components/admin/dev/materializeCard.test.tsx
git commit -m "feat(dev): materialize card on the dev panel"
```

---

### Task 15: Database behavioral tests

Spec §12. Every test here states the failure mode it catches; none passes merely because a function was called.

**Files:**

- Create: `tests/dev/materializeRoundTrip.realdb.test.ts (new)`

Requires a local Supabase (`pnpm preflight` green). Each test seeds, acts, and asserts against the database directly — never against the action's own report.

- [ ] **Step 1: Write the failing tests.** In order of value:
  1. **`LIKE` wildcard safety** — seed `created_by = 'xxdevScenario:real'` and `'a_bdevScenario:real'`; run Apply and Clear; assert both survive byte-identical. Catches the unescaped `_` deleting authentic rows, which every correctly-tagged fixture would miss.
  2. **Clear preserves authentic rows** — seed untagged alerts and holds; Clear; assert byte-identical, not merely counted.
  3. **Apply A then Apply B** leaves exactly B's synthetic alerts and holds, minus skips.
  4. **Collision skip** — seed a real unresolved alert of code C; apply a scenario with C and D; assert D inserted, C reported skipped, and the real C row byte-identical.
  5. **Authentic hold collision** on `(domain, entity_key)` — same shape.
  6. **Warnings tri-state** — absent leaves the column byte-identical; `[]` writes `[]`.
  7. **Guards commit no writes** — full before/after content snapshots, not row counts.
- [ ] **Step 2: Run to verify they fail** (or error) against the current implementation.
- [ ] **Step 3: Fix whatever they surface.** These tests are the acceptance gate for Tasks 11 and 12.
- [ ] **Step 4: Run to verify they pass.** - [ ] **Step 5: Commit**

```bash
git add tests/dev/materializeRoundTrip.realdb.test.ts
git commit -m "test(dev): materialize round-trip, collision, and wildcard-safety proofs"
```

---

### Task 16: Real-browser layout and transition audit

Spec §8, §9. jsdom cannot answer these — Tailwind v4 here does not default `.flex` to `align-items: stretch`, and jsdom computes no layout.

**Files:**

- Create: `tests/e2e/attention-gallery-layout.spec.ts (new)`

**e2e harness readiness (declared per AGENTS.md):**

- **Server boot:** `next dev` on a scratch port via a standalone Playwright config, with `ADMIN_DEV_PANEL_ENABLED=true` so the route exists. Do **not** reuse port 3000 — a sibling worktree's dev server there would serve the wrong code.
- **Readiness gate:** await a `data-testid="scenario-block"` element to be attached **and** its menu to have `aria-expanded="true"`, never `networkidle` alone.
- **Detach safety:** every `locator.evaluate` that samples geometry runs on a locator re-queried immediately before use; auto-wait hangs on an unmounted node.

- [ ] **Step 1: Write the failing spec.** Two assertions: adjacent open menus do **not** intersect at the narrowest (`?w=320`) and widest (`?w=1280`) widths, via `getBoundingClientRect()` on consecutive blocks' menus; and a `MENU_CAP`-item menu's list has `scrollHeight > clientHeight`, proving the cap actually crosses the scroll threshold rather than being assumed to.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** the reserved-space rule from §4.0 — the pill sits in a `relative` wrapper and the block reserves bottom space at least the menu's max height while open.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Transition audit.** Enumerate every conditional render in `ScenarioBlock` and `MaterializeCard`; assert each has an explicit animation or is deliberately instant per the §9 inventory; test the compound cases (toggle the help popover while the menu is mid-transition; change target while a result is displayed).
- [ ] **Step 6: Commit**

```bash
git add tests/e2e/attention-gallery-layout.spec.ts components/admin/dev/ScenarioBlock.tsx
git commit -m "test(dev): real-browser menu overlap and scroll-threshold proofs"
```

---

### Task 17: Close-out

- [ ] **Step 1: Full local gates.** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`. All must pass; a scoped run is not sufficient.
- [ ] **Step 2: impeccable dual-gate** on the diff, scoped per §7.4: full mechanical checklist on `MaterializeCard`; findings on gallery chrome triaged against the `source-link-dim` minimal-chrome precedent; findings about the production components the gallery renders unmodified are out of scope for this diff. Record findings and dispositions in the handoff.
- [ ] **Step 3: Manual artifact verification.** `RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts` at both flag states. Record both results — this check does not run in CI.
- [ ] **Step 4: Whole-diff Codex review** to APPROVE. Split briefs by surface, each under ~330 lines: catalog and validator; gallery route and `ScenarioBlock`; materialize actions and guards; tests and meta-tests. Verified at plan time: briefs above ~330 lines fail silently with empty transcripts.
- [ ] **Step 5: Push, real CI green, `gh pr merge --merge`, fast-forward local main.** Confirm `git rev-list --left-right --count main...origin/main` reports `0	0`.
