# Extend Role→Scope Vocabulary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin map a novel/unrecognized role token to a small closed set of scope capabilities (or "recognize only"), stored globally and applied as a pure post-parse overlay at sync time.

**Architecture:** New global table `role_token_mappings` (RLS no-policy, service-role only). A dependency-free parser leaf module (`roleVocabulary.ts`) single-sources the vocabulary + token canonicality. The parser additively stamps `roleToken` on `UNKNOWN_ROLE_TOKEN` warnings. A pure overlay (`roleMappingOverlay.ts`) unions granted flags onto crew rows and consumes matched warnings inside `phase2`, with a delta-gate producing per-token `ROLE_TOKEN_MAPPED` telemetry entries emitted post-commit by the three apply surfaces. Four admin server actions (2 warning-attached create paths, 2 settings mutations) + two UI surfaces (inline recognize control, settings list page).

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase Postgres (postgres.js tx + supabase-js), TypeScript `exactOptionalPropertyTypes`, Vitest, jsdom + @testing-library/react.

**Spec (canonical):** `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` — APPROVED after 15 Codex rounds. Where this plan and the spec disagree, the spec wins; open a question instead of silently fixing.
**Design mocks (visual source of truth):** `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/` (`Recognize Role Control.dc.html`, `Roles You've Added.dc.html`).

## Global Constraints

- Worktree `.claude/worktrees/role-vocab`, branch `feat/extend-role-scope-vocab` (off origin/main b54f2d0af). All commits `--no-verify`, conventional-commits style, one task per commit.
- Grantable flags, exactly four: `A1`, `V1`, `L1`, `FINANCIALS` (new `RoleFlag` member). Empty grants = recognize-only, valid.
- Doug-facing copy: exact strings pinned in spec §9. Banned standalone words in any Doug-facing copy: scope, flag, token, mapping, capability, sync, overlay, parse. "refresh" is allowed (UI state); sync→"checks its sheet"; mapped token→"a role you added"; grants→"what they see".
- Token canonicality: `trim().toUpperCase()`, internal whitespace preserved VERBATIM (spec §5.3). Never collapse.
- All decision/telemetry contracts (evaluation order, delta-gate inputs, per-token grouping, state unions) are pinned in spec §7/§8.3/§10 — do not improvise.
- No raw error codes in UI (invariant 5); every mutation surface instrumented (invariant 10); Supabase call-boundary `{data,error}` discipline (invariant 9); email canonicalization at every boundary (invariant 3).
- NEVER run prettier on `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (the master spec).
- Run `pnpm format:check` before every push (`--no-verify` bypasses the hook). Full `pnpm test` + `pnpm typecheck` + `pnpm build` + `pnpm lint` before push (Task 16).

## Advisory-lock topology declaration (invariant 2)

**NO new lock holder.** `role_token_mappings` is a global table outside the invariant-2 mutation list; its writes are lockless. Existing holders touched by this feature, unchanged: `setUseRawDecisionAction`-style pre-lock/`withShowLock` in the new live action wraps only the SHOW-side reads it needs (see Task 10 — it actually needs none; the mapping upsert is lockless and `runManualSyncForShow` acquires its own pipeline lock exactly as today, `lib/sync/runManualSyncForShow.ts:298`). The staged action follows `useRawStaged.ts`'s existing lock pattern for `pending_syncs` writes only if it writes staged state (it does not — it re-stages via the existing staging entry point). `tests/auth/advisoryLockRpcDeadlock.test.ts` is NOT extended — no new acquisition site exists; Task 15 re-runs it to confirm.

## Meta-test inventory (declared up front)

| Meta-test | Action |
|---|---|
| `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES` | ADD `role_token_mappings` row (Task 3) |
| `tests/log/_auditableMutations.ts` `AUDITABLE_MUTATIONS` | ADD 4 rows (Tasks 10–12) |
| `tests/log/adminOutcomeBehavior.test.ts` | ADD 4 behavioral proofs (Tasks 10–12) |
| `lib/audit/trustDomains.ts` `PROTECTED_ROUTES` | ADD `/admin/settings/roles` page row (Task 13) |
| `tests/auth/_metaInfraContract.test.ts` | New supabase-js call sites get registry rows or `// not-subject-to-meta:` (Tasks 10–13); the sync-path mappings loader uses postgres.js tx (not supabase-js) → outside that meta-test's scope, noted inline |
| `tests/messages/_metaCatalogCopyHygiene.test.ts` | EXTEND with D7 banned-vocabulary block (Task 9) |
| NEW: phase2-caller `priorParseWarnings` threading walker | CREATE (Task 8) |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | Auto-discovers the new actions/route — satisfied by the registry rows above; no edit expected |
| `tests/parser/_metaKnownSectionsWalker` / `_metaTransformSitesWalker` | `roleVocabulary.ts` is NOT under `lib/parser/blocks/` → no obligations; Task 15 re-runs both to confirm |
| no-inline-email-normalization guard | `.trim()`/`.toUpperCase()` in `lib/sync` need same-line `// canonicalize-exempt:` markers (Task 5) |

## Migration → validation parity (same PR)

Task 3 applies `supabase/migrations/20260716000000_role_token_mappings.sql` locally, regenerates + commits `supabase/__generated__/schema-manifest.json` (`pnpm gen:schema-manifest`), and applies the migration surgically to validation project `vzakgrxqwcalbmagufjh` from the MAIN checkout's env (`psql "$TEST_DATABASE_URL" -f …` + `notify pgrst, 'reload schema';`). The `validation-schema-parity` CI gate enforces all three.

## Mutation harness note (parser output changes)

`roleToken` on `UNKNOWN_ROLE_TOKEN` changes parse output for corpus fixtures containing unknown role tokens → possible fingerprint drift in `tests/parser/mutation/knownHoles.ts` (fixture-data-driven sites; a source edit cannot ADD sites — BACKLOG.md:39). Task 15 runs `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation` locally; benign drift (same siteIds, fingerprint-only) is deferrable per the established ledger discipline — file the BACKLOG follow-up rather than regenerating the 7912-row ledger in-PR.

## File map

| File | Role | Task |
|---|---|---|
| `lib/parser/roleVocabulary.ts` (new leaf) | ROLE_NORMALIZATIONS, MULTI_WORD_TOKENS, canonicalRoleToken, isBuiltInRoleToken | 1 |
| `lib/parser/personalization.ts` | re-import vocab from leaf; use canonicalRoleToken; stamp `roleToken` | 1–2 |
| `lib/parser/types.ts` | `roleToken?: string` on ParseWarning; `FINANCIALS` in RoleFlag | 2, 4 |
| `supabase/migrations/20260716000000_role_token_mappings.sql` | table + CHECKs + RLS + grants | 3 |
| `lib/sync/roleMappingOverlay.ts` (new) | types, normalizeRoleTokenMappings, applyRoleTokenMappings, gateAppliedRoleMappings | 5–7 |
| `lib/sync/phase2.ts` | Phase2Args fields, overlay call, gate, Phase2Result.appliedRoleMappings | 7 |
| cron/manual shared core (`lib/sync/runScheduledCronSync.ts`) + `lib/sync/applyStaged.ts`/`applyStagedCore.ts` | load + thread + post-commit emit | 8 |
| `lib/visibility/scopeTiles.ts`, `lib/data/getShowForViewer.ts`, `lib/visibility/capabilityTransitions.ts` | FINANCIALS read paths | 4 |
| `lib/parser/dataGaps.ts`, `lib/dataQuality/warningIdentity.ts` | roleToken dedup/key folds | 9b (Task 9 file) |
| `app/admin/show/[slug]/_actions/roleToken.ts`, `app/admin/onboarding/_actions/roleTokenStaged.ts`, `app/admin/settings/_actions/roleTokenMappings.ts` | 4 actions | 10–12 |
| `components/admin/RoleRecognizeControl.tsx` + `RoleRecognizeControlBoundary.tsx` | inline control | 13 |
| `app/admin/settings/roles/page.tsx` + row client component | settings list | 13 |
| master spec §12.4 + `lib/messages/catalog.ts` + generated enums | catalog lockstep | 9 |

## Task index

1. Vocabulary leaf module extraction (`roleVocabulary.ts`)
2. `roleToken` warning field
3. Migration + read-posture + DML lockdown row
4. `FINANCIALS` flag read paths (scopeTiles, getShowForViewer, capabilityTransitions)
5. `normalizeRoleTokenMappings` boundary
6. `applyRoleTokenMappings` overlay
7. `gateAppliedRoleMappings` + phase2 integration
8. Loader threading + post-commit emission + threading walker
9. Catalog lockstep (§12.4, ROLE_TOKEN_MAPPED, UNKNOWN_ROLE_TOKEN edit, jargon sweep) + dedup/key folds
10. Live action `mapRoleToken`
11. Staged action `mapRoleTokenStaged`
12. Settings actions `updateRoleTokenMapping`/`deleteRoleTokenMapping`
13. UI: recognize control + settings page + TRUST_DOMAINS (Opus-owned; impeccable dual-gate)
14. Financials projection + e2e-style integration test through phase2
15. Meta-test sweep + mutation-harness local run
16. Full gates + validation parity re-check + adversarial review (cross-model) + push

Tasks live in `tasks-01-04.md`, `tasks-05-08.md`, `tasks-09-12.md`, `tasks-13-16.md`.
