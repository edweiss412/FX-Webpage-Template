# M-onboarding-fixups Implementation Plan — Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the onboarding wizard's finalize paths persist the full parse result (crew, rooms, hotels, contacts, transportation, shows_internal) per master spec §6.8.1 4L, remediate the six damaged validation shows, and fix the wizard-lifecycle warts (stale re-apply 404, stuck checkpoints, session-CAS race).

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md` — adversarially converged (25 rounds, Codex APPROVE). The spec is the contract; every phase file cites its sections. Where a phase file documents a spec-vs-code mismatch, the phase file's verified citation wins and the spec gets a correction commit.

**Architecture:** One shared apply core (`lib/sync/applyStagedCore.ts`, extracted from `applyStaged`) consumed by the dashboard Apply, wizard finalize Phase B (first-seen), and wizard finalize-cas Phase D (existing-show shadows). Live-partition cleanup operations become injected + source-scoped. Remediation is a windowed, marker-guarded, advisory-locked data migration. F4 adds a strictly session-scoped stale-debris reap; F5 closes the wizard-session CAS race with per-statement currency predicates and a typed rollback error.

**Tech stack:** Next.js 16 App Router, Supabase/Postgres (postgres.js for pipeline tx), vitest/jest + LOCAL_TEST_DATABASE_URL (loopback-guarded local Supabase) real-DB regressions — TEST_DATABASE_URL is the VALIDATION project and appears ONLY in labeled validation close-out steps, conventional commits.

---

## Phase order & dependencies

| Phase | File | Depends on |
|---|---|---|
| F1 shared apply core + finalize full apply | `01-f1-shared-apply-core.md` | — |
| F2 remediation migration (+ F4 one-time purge rider) | `02-f2-remediation.md` | F1 (post-F1 audit shape: `parseResultSummary` gains `source` + is written by wizard paths; `created_show_id` column) |
| F3 re-apply already-resolved page | `03-f3-reapply-page.md` | — (independent; **UI = Opus + impeccable dual-gate**) |
| F4 stale-session reap | `04-f4-stale-reap.md` | F1 (`created_show_id` provenance) |
| F5 wizard-session CAS race | `05-f5-cas-race.md` | — (independent; F4's reap sweeps its residue — coordinate the two-half guarantee test after F4) |

Execution order: F1 → F2 → F5 → F4 → F3 (F3 anytime; F4 after F1; the F5 two-half test's reap assertion lands with F4).

## Plan-wide invariants (from AGENTS.md — apply to every task)

1. TDD per task: failing test → minimal implementation → pass → commit (conventional-commit scopes: `sync`, `onboarding`, `admin`, `db`, `infra`, `test`).
2. Advisory-lock single-holder rule per the spec §3.3 lock-posture matrix. The shared core NEVER acquires locks.
3. Supabase call-boundary discipline (invariant 9): every new call site destructures `{ data, error }`, registers in `tests/auth/_metaInfraContract.test.ts` or carries `// not-subject-to-meta: <reason>`.
4. Anti-tautology: every test states its concrete failure mode; expectations derive from fixtures; negative-regression verification (stash the fix, confirm the test fails) for each headline regression.
5. No raw error codes in UI (invariant 5); §12.4 lockstep for new codes (F5) — note the live x1 gate is `tests/cross-cutting/codes.test.ts:79` (`pnpm test:audit:x1-catalog-parity`).

## Meta-test inventory (spec §9, restated)

- EXTEND `tests/auth/advisoryLockRpcDeadlock.test.ts` — core acquire-free; F4 reap surface.
- EXTEND `tests/auth/_metaInfraContract.test.ts` — new Supabase call boundaries.
- EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts` — `WIZARD_SESSION_SUPERSEDED_RACE`.
- `tests/db/postgrest-dml-lockdown.test.ts` — F2 marker table REVOKE; F5 evaluation (already covered, see 05 file).
- NEW second-copy tripwire — allowlist: shared core module + `PostgresPipelineTx.applyShowSnapshot` first-seen call site (`lib/sync/runScheduledCronSync.ts`; the spec's `upsertShow` symbol name was stale).
- NEW live-partition classification walker (F1 T1.2 registry).

## Milestone close-out gates (run AFTER all phases, before merge)

1. Full local suite green (`pnpm test`, plus the repo's audit/gate scripts).
2. F2 surgical validation apply + `notify pgrst, 'reload schema'` + schema-manifest parity.
3. Impeccable dual-gate (critique + audit, EXTERNAL sessions) on F3/F4 UI diffs.
4. Whole-milestone fresh-eyes adversarial review (Codex) — separate from per-phase reviews.
5. Real CI green on the PR (workflow_dispatch where needed), then merge to main.
6. Post-merge: re-run the six-show backfill verification against validation (crew/rooms populated; agenda viewer loads after picker).

## Routing

Backend phases (F1, F2, F4 backend, F5): Opus subagent-driven in this worktree (Codex sandbox blocks DB access — precedent: sync-changes-feed milestone). UI tasks (F3 page, F4 admin affordance): Opus per the hard routing rule, impeccable v3 gates apply.
