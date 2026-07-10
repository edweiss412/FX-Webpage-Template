# Remove Admin Field-Override Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully remove the admin field-override feature (shipped PR #376) — DB objects, sync overlay, UI, admin-alert/needs-attention integration, §12.4 codes, and tests — restoring the pre-feature parse-apply behavior with the sheet as the single source of truth.

**Architecture:** Teardown in **leaf→root order so the build never breaks mid-way**: remove consumers before (or in the same task as) the symbol they consume. UI first (no importers left), then admin-alert/needs-attention integration, then the sync-path overlay, then the crew name-alias collapse, then delete `lib/overrides/`, then the §12.4 code lockstep, then the DB drop migration, then meta-test deregistration + test cleanup, then docs. Each task ends `pnpm typecheck` + relevant tests green; the whole build is green at every task boundary.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres + RPC), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` (APPROVED, 3 Codex rounds). All `file:line` refs below are at base `origin/main` @ `37f90e82f`.

## Global Constraints

- **TDD per task, commit per task.** For a teardown, the "failing test" is the assertion of the POST-removal state (a behavioral test asserting the raw-parse/collapsed-alias/absent-UI behavior, or a structural/meta-test asserting the symbol is gone) that fails against current code, passes after removal. Where a task is pure deletion with no behavioral surface, the test cycle is: adjust the structural/meta-test (or the existing behavioral test) to expect absence → confirm it fails → delete → confirm green + `pnpm typecheck`.
- **Build green at every boundary.** After each task: `pnpm typecheck` passes and no dangling reference to a removed symbol remains (§7.5 sweep).
- **§7.5 removed-symbol sweep (per-symbol gate).** After removing any exported symbol/type/field/DB object, `grep -rn "<symbol>" app components lib supabase tests` returns only intended edits/deletions (zero dangling).
- **Conventional commits:** `refactor(<scope>): …` or `chore(<scope>): …` or `test(<scope>): …`. Scope one of `overrides`, `sync`, `admin`, `db`, `messages`, `crew-page`, `plan`, `docs`.
- **No raw error codes in UI** (invariant 5), **advisory-lock single-holder** (invariant 2 — this plan only *removes* the in-RPC holder `set_field_override`), **Supabase call-boundary discipline** (invariant 9), **mutation-surface instrumentation** (invariant 10 — this plan *deregisters* surfaces). **Impeccable v3 dual-gate** (invariant 8) for the UI-removal tasks.
- **`pull_sheet_override` is a SEPARATE feature — KEEP.** Never touch `pull_sheet_override` / `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` / `shows.pull_sheet_override` / `set_pull_sheet_override`.
- **`admin_alerts.context.sheet_name` (JSONB alert key) ≠ `crew_members.sheet_name` (column).** Only the column is dropped.

## Meta-test inventory (declared per project rule)

This plan EXTENDS/EDITS these structural meta-tests (deregistration, not creation):

| Meta-test | File | Change |
|---|---|---|
| Advisory-lock topology | `tests/auth/advisoryLockRpcDeadlock.test.ts:138` | remove `set_field_override` from `lockTakingNames` (Task 8) |
| Admin infra-contract | `tests/admin/_metaInfraContract.test.ts:228,252,692,746` | remove `admin_overrides` 4th paused-override stream (Task 3) |
| Admin-alert catalog completeness | `tests/messages/_metaAdminAlertCatalog.test.ts:258-264,458-472` | remove both OVERRIDE codes from the completeness list + the OVERRIDE `auto` CLASSIFICATION block (resolveSites → deleted resolver) (Task 7) |
| AUDITABLE_MUTATIONS registry | `tests/log/_auditableMutations.ts:315-332,427-430` + `tests/log/adminOutcomeBehavior.test.ts:271-273,1565-1618` | remove FIELD_OVERRIDE_* rows + the setFieldOverrideAction block (Task 2) |
| PostgREST DML lockdown | `tests/db/postgrest-dml-lockdown.test.ts:475` | remove `admin_overrides` registry row (Task 8) |
| Emphasis-render contract | `tests/messages/_metaEmphasisRenderContract.test.ts:49-53` | remove the `SAFE_PLAINTEXT_REGISTRY` row for deleted `OverrideableField.tsx` (stale-entry guard) (Task 2) |

No NEW meta-test is created (a teardown removes surfaces). `tests/log/_metaMutationSurfaceObservability.test.ts` + `tests/auth/_metaInfraContract.test.ts` are confirmed override-free — untouched.

**Layout-dimensions / transition-audit tasks: N/A — declared.** This is a UI *removal*; it introduces no new fixed-dimension parent and no new component with a Transition Inventory, so neither mandatory task applies. The removed conditional-render sites live in `step3ReviewSections.tsx` (not `Step3ReviewModal.tsx`, whose §11 conditional-count audit is therefore unaffected — Task 1 confirms by running the modal transition suite). Post-removal render sanity is verified by the invariant-8 impeccable dual-gate + a real-browser Playwright smoke (Task 11), not jsdom.

## Advisory-lock holder topology (declared per project rule)

Hashkey `hashtext('show:' || drive_file_id)`. The removed RPC `set_field_override` was the **sole in-RPC holder** for its call path (its 4 helpers self-take no lock — they run under the RPC's held lock, per `advisoryLockRpcDeadlock.test.ts:136-138`). Removal deletes one holder and its pin; **no new holder is introduced, no nesting created** — zero deadlock risk. The surviving sync/admin lock holders (cron path `pg_try_advisory_xact_lock`, admin path `pg_advisory_xact_lock`) are unchanged.

## Task order (build-safe)

1. UI removal — wizard override rows + threading (Opus + impeccable)
2. UI removal — live-show override blocks + onboarding + action (Opus + impeccable) + AUDITABLE_MUTATIONS deregistration
3. Admin-alert + needs-attention integration removal (+ admin `_metaInfraContract`)
4. Sync-path overlay removal (applyParseResult, phase2, runScheduledCronSync admin_overrides bits, delete 4 sync files)
5. Crew name-alias collapse (`sheet_name` readers → `[name]`) + alias test surfaces
6. Delete `lib/overrides/` dir
7. §12.4 code lockstep removal (2 codes × all surfaces) + `AdminAlertCode` union
8. DB drop migration + manifest regen + validation apply + advisory-lock/DML-lockdown meta-test edits
9. Delete override test files + full-suite green
10. Docs — audit 3.2 reversal + BACKLOG follow-ups
11. Close-out — impeccable dual-gate, full gates, whole-diff review

Detailed tasks in `01-tasks.md`.
