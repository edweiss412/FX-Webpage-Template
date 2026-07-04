# Phase 8 — Close-out (Task 22)

### Task 22: Full-suite green → impeccable UI dual-gate → whole-diff Codex review → CI → merge

This task has no product code; it is the milestone gate sequence. It is NOT a single commit — it is the Stage-3→Stage-4 handoff of the ship pipeline.

- [ ] **Step 1: Full local suite green.** `pnpm typecheck && pnpm format:check && pnpm vitest run` — all green. Fix any cross-file breakage (exactOptional/shape drift on `AdminEmailRow`; run the FULL suite, not just touched files, per the optional-field-shape-sweep rule). Confirm the SATISFIED meta-tests still pass: `validation-schema-parity`, `postgrest-dml-lockdown`, `advisoryLockRpcDeadlock`, `build-artifact-gate`.

- [ ] **Step 2: Migration→validation parity check.** Re-run `pnpm gen:schema-manifest` (no diff expected — already committed); confirm the migration is applied to the validation project (`vzakgrxqwcalbmagufjh`); `validation-schema-parity` Layer 1 + Layer 2 green.

- [ ] **Step 3: Impeccable v3 dual-gate on the UI diff (invariant 8).** UI surfaces touched: `components/admin/settings/DevToolsRow.tsx`, `components/admin/settings/AdministratorsSection.tsx`, `components/admin/settings/DeveloperToggleButton.tsx`, `components/admin/nav/navConfig.ts`, `components/admin/nav/AdminNav.tsx`, `app/admin/layout.tsx`, `app/admin/settings/page.tsx`, `app/admin/settings/admins/page.tsx`. Run `/impeccable critique` AND `/impeccable audit` on this diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). HIGH/CRITICAL findings fixed OR deferred via a `DEFERRED.md` entry. Record findings + dispositions in the milestone handoff.

- [ ] **Step 4: Whole-diff cross-model adversarial review (Codex, fresh-eyes, REVIEWER ONLY).** Run the codex-companion `adversarial-review` on the full branch diff; iterate to APPROVE (no round budget). Triage findings via deferral discipline (land-now / `DEFERRED.md` / `BACKLOG.md`).

- [ ] **Step 5: Push + open PR.** `git push -u origin feat/developer-tier`; `gh pr create` (body ends with the Claude Code generation footer). Confirm `mergeStateStatus` and wait for **real GitHub Actions green** (`gh pr checks <PR#> --watch`; pass the PR number, not a SHA; confirm all 12 required checks pass and `mergeStateStatus == CLEAN`). Local-green is necessary but NOT sufficient (local-passes-CI-fails is its own class).

- [ ] **Step 6: Merge + fast-forward main.** `gh pr merge --merge` (never squash/rebase). Then fast-forward local `main` to the merged remote and verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-review checklist (run before Task 22 / before the plan adversarial review)

- **Spec coverage:** every spec section maps to a task — §4→T1/T2/T2b, §5→T3/T4, §5.1→T4, §6 matrix→T10-T18, §6.1 postures+structural→T12/T13/T20, §7→T7/T9/T18, §8→T8, §9→T6, §10→T5/T19/T20/T21, §13→T18b/T18c, §14 (accepted risk, no code), §11 lifecycle (documented). Gaps: none.
- **Type consistency:** `SetDeveloperActionResult` (T9) ⊇ `SetDeveloperOutcome` (T7) kinds; `AdminEmailRow.is_developer` (T7) consumed by T18; `DeveloperInfraError.code="DEVELOPER_SESSION_LOOKUP_FAILED"` (T3) matched by the reap catch (T12) and `AuthFailureCode` (T3).
- **Anti-tautology:** the layout test (T18b) asserts against `getBoundingClientRect` on the toggle testid, not the container; the e2e (T21) derives visibility from fixture role, not hardcoded; the RPC guard (T20 enforcement 4) scans the migration source, not a restated literal.
- **Placeholder scan:** no TBD/TODO; every code step shows code.
