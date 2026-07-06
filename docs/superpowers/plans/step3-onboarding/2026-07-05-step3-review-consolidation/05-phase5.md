# Phase 5 — Registry + deletion-safety + test cleanup (spec §10, §11)

Make the structural guards pass and rewrite/delete tests broken by the deletions.

---

### Task 5.1: Register the unified read in `_metaInfraContract` + fold `_unresolvedSheets` (spec §9.9, §10)

**Files:**
- Modify: `tests/admin/_metaInfraContract.test.ts:13+` (add a registry row for the unified `public.shows`/`pending_syncs` read)
- Modify: `components/admin/OnboardingWizard.tsx` (fold the `_unresolvedSheets` blocking predicate into `fetchStep3Data` if not already)
- Delete: `app/admin/_unresolvedSheets.ts` (folded)
- Test: `tests/admin/_metaInfraContract.test.ts` (self-passing after the registry row lands)

- [ ] **Step 1: Write/adjust the failing assertion** — add the registry row `{ helper: "fetchStep3Data shows read", path: "components/admin/OnboardingWizard.tsx", contract: "destructures { data, error }; infra fault → { kind: 'infra_error' }" }`; run the meta-test — it fails if the read surface isn't correctly bounded (or if the folded read isn't registered).

- [ ] **Step 2: Run — verify fail** (`pnpm vitest run tests/admin/_metaInfraContract.test.ts`).

- [ ] **Step 3: Implement** — ensure `fetchStep3Data`'s shows read destructures `{ data, error }` and returns `{ kind:"infra_error" }` on fault; fold the `readUnresolvedSheets` predicate (`_unresolvedSheets.ts:141`, `BLOCKING_STATUSES.has(status) || (status==="staged" && failureCode!==null)`) into the row build / `finishable`; delete `_unresolvedSheets.ts`. Update the registry rows at `:188-190`/`:946-961` that referenced `readUnresolvedSheets`.

- [ ] **Step 4: Run — verify pass** + `pnpm vitest run tests/admin/` (the whole admin suite, to catch registry/format fragility per feedback_structural_metatest_comment_fragility).

- [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git rm app/admin/_unresolvedSheets.ts
git add tests/admin/_metaInfraContract.test.ts components/admin/OnboardingWizard.tsx
git commit --no-verify -m "feat(admin): fold _unresolvedSheets into unified read; register infra boundary (spec §9.9)"
```

---

### Task 5.2: Deletion-safety grep guard (AUTHORITATIVE, spec §11)

A structural test walking the tree, failing on any surviving import of a deleted symbol or any in-app link to the deleted route. Must NOT flag `CleanupAbandonedFinalizeButton` (re-homed).

**Files:**
- Create: `tests/admin/step3DeletionSafety.test.ts`

- [ ] **Step 1: Write the failing test** — walk `app/` + `components/` + `lib/` source files; assert none import `FinalizeInProgress`/`ReadyToPublish`/`StaleReadyToPublish`/`ResumeFinalizeButton`/`_unresolvedSheets`/the staged `page`; assert none contain an in-app `/admin/onboarding/staged/` `<Link>`/`href` literal; assert `CleanupAbandonedFinalizeButton` IS still imported (re-homed). (Walk the filesystem so a NEW surviving reference fails-by-default.)

- [ ] **Step 2: Run** — if any deletion from Phases 3-4 is incomplete, this FAILS; fix the surviving references, then it passes. (If everything is clean, it passes immediately — acceptable for a structural guard added after the deletions.)

- [ ] **Step 3: Commit**
```bash
git add tests/admin/step3DeletionSafety.test.ts
git commit --no-verify -m "test(admin): deletion-safety grep guard for consolidated surfaces (spec §11)"
```

---

### Task 5.3: Rewrite/delete tests broken by the consolidation (spec §11)

**Files (rewrite against the unified surface OR delete with their component):**
- `tests/components/wizardStagedPage.heading.test.tsx`, `tests/components/admin/WizardStagedReapplyResolved.test.tsx` — delete (page gone) or repurpose to the modal.
- `tests/admin/unresolvedSheets.test.ts` — delete/rewrite against the unified read.
- `tests/components/admin/FinalizeReentry.test.tsx`, `FinalizeInProgress.test.tsx`, `AdminPage.test.tsx`, `RunFinalCASButton.test.tsx`, `RescanSheetButton.test.tsx`, `tests/e2e/admin-phase2-surfaces.spec.ts` — rewrite against the unified Step-3 surface or delete with their component.

- [ ] **Step 1: Run the full suite** — `pnpm test` (or `pnpm vitest run`) → collect every failure caused by the deletions. Triage env/psql vs real (feedback_full_suite_before_push).

- [ ] **Step 2: For each broken test** — delete if it tested a deleted surface with no unified equivalent; rewrite if the behavior moved to the unified surface. Do NOT mask real regressions — verify each rewrite asserts the NEW contract.

- [ ] **Step 3: Run the full suite again** → green (except pre-existing/env failures verified at merge-base per feedback_verify_pre_existing_failures_at_merge_base).

- [ ] **Step 4: Typecheck** (`pnpm tsc --noEmit`) + **lint** (`pnpm lint`) + **format** (`pnpm format:check`) — CI runs all three; `--no-verify` bypassed the hooks.

- [ ] **Step 5: Commit**
```bash
git add -A tests/
git commit --no-verify -m "test(admin): rewrite/delete tests for consolidated Step-3 surface (spec §11)"
```
