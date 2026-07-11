# Structural-transform "use the sheet's raw value" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a per-show "use the sheet's raw value" affordance on the three recoverable structural-transform ambiguity warnings (room header split, hotel guest split, inverted dates), with content-pinned, auto-invalidating, reload-safe decisions applied by a pure post-parse overlay.

**Architecture:** The parser precomputes a `resolution` payload (parsed + raw replacement + content-hash) onto each of the three recoverable warnings. A pure overlay `applyUseRawDecisions` runs inside `applyParseResult` (both at finalize and re-sync), substituting the raw value for `kept` decisions, dropping+surfacing `invalidated` ones, and GC-ing `reverted` ones. Two thin admin server actions (wizard-staged on `pending_syncs`, per-show on `shows_internal`) write decisions under the existing `show:<driveFileId>` advisory lock via a state-aware toggle rule. A shared presentational `<UseRawControl>` renders on both surfaces.

**Tech Stack:** Next.js 16, Supabase (Postgres + typed tx wrappers), TypeScript, Vitest, Playwright.

**Canonical spec:** `docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md` (Codex-APPROVED R11). The spec is authoritative; this plan sequences it into TDD tasks. Anywhere they conflict, the spec wins — open a question, do not silently diverge.

---

## Global Constraints (every task's requirements implicitly include this)

- **TDD per task.** Failing test → run-to-fail → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`). One task per commit; `--no-verify` (shared hooks live in the main checkout). Scope hints: `parser`, `sync`, `db`, `admin`, `messages`, `crew-page`/`admin`, `test`, `plan`.
- **Per-show advisory lock, single holder.** Every mutation of `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions` runs inside `withShowLock(...)` (`lib/sync/lockedShowTx.ts:88`, key `hashtext('show:'||driveFileId)` `:61`). The two actions each acquire the lock at exactly ONE layer (JS-side `withShowLock`); the per-show action then delegates to `runManualSyncForShow` which acquires its OWN lock — **sequential, not nested**. `applyParseResult(tx, …)` takes the tx and does NOT self-lock. No new hashkey, no new holder layer.
- **No raw error codes in UI.** `USE_RAW_DECISION_STALE` routes through `lib/messages/lookup.ts`; it never renders as a bare code. The control's static microcopy carries no code (not §12.4-routed).
- **Supabase call-boundary discipline.** Every client call destructures `{ data, error }`; infra faults surface as typed results; register new auth-adjacent call sites per `tests/auth/_metaInfraContract.test.ts`.
- **Mutation-surface instrumentation (invariant 10).** Both admin actions are admin mutations → each gets an `AUDITABLE_MUTATIONS` row (`tests/log/_auditableMutations.ts`) + executable success-branch behavioral proof (`tests/log/adminOutcomeBehavior.test.ts`) + a post-commit `logAdminOutcome` emit with a forensic code. `USE_RAW_DECISION_SET`/`USE_RAW_DECISION_CLEARED` register in `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts`).
- **§12.4 3-way+ lockstep.** New code `USE_RAW_DECISION_STALE` lands in the master spec §12.4 prose + `pnpm gen:spec-codes` (`lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts` in ONE commit; also `pnpm gen:internal-code-enums`; the `x1`/`codes` parity gate is `tests/cross-cutting/codes.test.ts`. NEVER prettier the master spec.
- **Migration → validation parity.** The one migration is applied locally + `pnpm gen:schema-manifest` (commit the manifest) + applied surgically to the validation project. `validation-schema-parity` (`tests/db/validation-schema-parity.test.ts`) enforces it.
- **impeccable v3 dual-gate (invariant 8).** UI files (`components/admin/UseRawControl.tsx`, edits to `PerShowActionableWarnings.tsx` / `step3ReviewSections.tsx` / `OnboardingWizard.tsx`) ship only after `/impeccable critique` AND `/impeccable audit` pass on the diff; HIGH/CRITICAL fixed or `DEFERRED.md`. UI is Opus-only.
- **Full gates before push:** `pnpm test` + `typecheck` + `build` + `format:check` + `lint`.

---

## Meta-test inventory (declared per AGENTS.md)

This milestone **CREATES no new** meta-test framework. It **EXTENDS**:

| Meta-test | Extension |
|---|---|
| `tests/log/_auditableMutations.ts` (`AUDITABLE_MUTATIONS`) | +2 rows (staged + per-show actions); +2 `NEW_FORENSIC_CODES` (`USE_RAW_DECISION_SET`/`_CLEARED`) |
| `tests/log/adminOutcomeBehavior.test.ts` | +2 executable success-branch behavioral proofs |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | static discovery auto-covers the 2 new action files (fails-by-default) — the AUDITABLE_MUTATIONS rows satisfy it |
| `tests/auth/_metaInfraContract.test.ts` | register the new Supabase call sites in both actions |
| `tests/cross-cutting/codes.test.ts` (`x1` catalog parity) | +1 code `USE_RAW_DECISION_STALE` (catalog ↔ §12.4 prose) |
| `tests/db/validation-schema-parity.test.ts` | +2 columns via regenerated `schema-manifest.json` |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | topology **UNCHANGED** — no new holder/pin; task 6 confirms it still passes |

## Advisory-lock holder topology (declared per AGENTS.md — plan touches `pg_advisory*` indirectly)

Hashkey `show:<driveFileId>`. Existing holders: `withShowLock` JS-wrapper (callers: applyStaged, unpublishShow, runScheduledCronSync, discardStaged, runManualSyncForShow) — single-layer. **New code's holder:** `withShowLock` (JS-side), for each action. The per-show action's sequence is (1) `withShowLock` write-decision commit, THEN (2) `runManualSyncForShow` acquires its own `withShowLock` — two SEQUENTIAL acquisitions, never nested/simultaneous (the M5 R20 deadlock shape). `applyParseResult` runs inside whichever lock its caller holds and never self-locks. No new hashkey, no nested double-hold.

---

## Ratified amendment 1 (implementation, Task 6) — overlay runs in `runPhase2`, not inside `applyParseResult`

The spec §7 / plan Task 6 wording places the overlay "inside `applyParseResult` before the full-replace writes." A live-code trace during implementation found that `runPhase2` (`phase2.ts:236`) persists `shows.dates` via `tx.applyShowSnapshot(...)` at `phase2.ts:288` — which runs BEFORE `applyParseResult` (`phase2.ts:369`). Because the DATES transform rewrites `show.dates.{travelIn,set,showDays,travelOut}`, an overlay confined to `applyParseResult` would write overlaid rooms/hotels but leave `shows.dates` at the un-overlaid (transform) value — the dates "use raw" affordance would silently no-op on the crew page.

**Resolution (single, correct integration point):** the pure overlay runs ONCE in `runPhase2` immediately after `parseResult` is finalized (right after `phase2.ts:244`), BEFORE `applyShowSnapshot`. The overlaid `parseResult` then flows into BOTH `applyShowSnapshot` (dates → `shows`) and `applyParseResult` (rooms/hotels → their tables), so every entity persists overlaid. `applyParseResult` still owns persistence of `shows_internal.use_raw_decisions = kept` (each `applied:true`) via the same `upsertShowsInternal` that writes `parse_warnings`. The single ungated `writeUseRawStaleChanges` branch for `invalidated` stays in `runPhase2` (guarded only by `invalidated.length > 0 && port`), covering finalize + re-sync identically — NOT nested in the `phase2.ts:383` crew-diff block a first-seen finalize skips. `applyParseResult` remains pure w.r.t. locking (takes `tx`, never self-locks). This is the spec's INTENT ("the overlaid parseResult is what gets persisted"); only the code LOCATION moves up one frame so the dates write is included. Codex whole-diff review (Stage 4) validates.

---

## Ratified amendment 2 (implementation, Task 7) — `applied` is derived from the current persisted row, per spec §3 (NOT an entity-row equivalence-class scan)

Plan Task 7 described computing the new `applied` flag by scanning the entity rows of the WHOLE `(code, contentHash)` equivalence class (all/none/MIXED → true/false/false). Spec §3 (lines 88-97, the "single toggle-write rule" table) is more precise and CONTRADICTS that: `applied` "MEANS 'the entity rows already reflect this preference,' … which is **fully determined by the CURRENT persisted row (no need to read the entity rows themselves)**," and gives the exact four-row transition table (absent→raw `{raw,false}`; `{raw,false}`→transform delete; `{raw,true}`→transform `{transform,false}`; `{transform,false}`→raw `{raw,true}`). Per invariant 7 (spec is canonical; the plan supersedes it only in ratified amendments) the SPEC governs. Equivalence-class governance is not lost — it lives in the OVERLAY (§7): a single content-scoped decision is applied by `applyUseRawDecisions` to EVERY current warning sharing that `(code, contentHash)`, and the per-show toggle ALWAYS delegates to `runManualSyncForShow` (which re-parses + re-runs the overlay) after the write, so any transiently-new duplicate-content cell is settled by that immediate re-sync. `computeUseRawToggle` (`lib/sync/useRawDecisionState.ts`) implements the spec §3 table verbatim; `findLiveResolvableWarning` re-reads live warnings in-lock. The plan's MIXED-case test is therefore N/A (that state cannot durably persist across an apply); the action tests cover the spec §3 table + the overlay's content-scoping (Task 3) instead.

---

## File structure

**Create:**
- `lib/sync/useRawOverlay.ts` — pure `applyUseRawDecisions` + `UseRawDecision`/`DateOrderFields` types.
- `app/admin/show/[slug]/_actions/useRaw.ts` — `setUseRawDecisionAction` (per-show).
- `app/admin/onboarding/_actions/useRawStaged.ts` — `setStagedUseRawDecisionAction` (wizard-staged) — a `"use server"` module (`app/admin/onboarding/` exists; `_actions` matches the `app/admin/show/[slug]/_actions` convention). This exact path is used consistently in Task 8, the UI wiring, `AUDITABLE_MUTATIONS`, and `_metaInfraContract`.
- `components/admin/UseRawControl.tsx` — shared presentational control.
- `supabase/migrations/<ts>_use_raw_decisions.sql` — 2 jsonb columns.
- Tests mirroring each under `tests/**`.

**Modify:**
- `lib/parser/types.ts` — add `resolution?` to `ParseWarning`; export `UseRawResolution`/`DateOrderFields`.
- `lib/parser/warnings.ts` — the three emit builders populate `resolution`.
- `lib/sync/applyParseResult.ts` — accept `useRawDecisions`, run overlay, persist `kept`(applied:true) / GC `reverted`, return `useRawInvalidated`.
- `lib/sync/phase2.ts` — thread `Phase2Args.useRawDecisions` into the single `applyParseResult` call (`:369`); ONE **ungated** `writeUseRawStaleChanges` branch (both paths flow through here; NOT inside the first-seen-skipped crew-diff guard).
- `lib/sync/applyStagedCore.ts` (finalize) + `lib/sync/runScheduledCronSync.ts` (re-sync `processOneFile`) — each reads the phase-appropriate decisions column into `Phase2Args.useRawDecisions`.
- `components/admin/PerShowActionableWarnings.tsx` + `app/admin/show/[slug]/page.tsx` wiring — render control (per-show).
- `components/admin/wizard/step3ReviewSections.tsx` + `OnboardingWizard.tsx` — render control (wizard).
- `lib/messages/catalog.ts` + master spec §12.4 + generated files — new code.
- Meta-test registries listed above.

---

## Task list

See `01-tasks.md` for the full TDD task breakdown. Task order is dependency-safe (parser types → overlay → apply integration → migration → actions → UI → messages/meta-tests) so the build never breaks mid-way (consumers land with or after the symbols they consume).

---

## Impeccable v3 dual-gate — dispositions (Task 9 UI, invariant 8)

Register = product. Ran on the affected diff (`components/admin/UseRawControl.tsx`, `UseRawControlBoundary.tsx`, `app/admin/show/[slug]/page.tsx`, `components/admin/wizard/step3ReviewSections.tsx` + threading). Two isolated assessments (design critique + technical audit) plus the deterministic detector (`npx impeccable --json` → `[]`, clean).

- **AUDIT: 19/20** (A11y 3, Perf 4, Theme 4, Resp 4, Anti-patterns 4). No P0/P1.
- **CRITIQUE: 30/40, AI-slop PASS.** Two P1s, both FIXED (no deferrals):
  - **P1 — accent CTA below AA-large + DESIGN §1.1 breach.** The "use the sheet's raw value" toggle was `bg-accent text-accent-text` at `text-xs` (12px). DESIGN.md:33 restricts accent-bg text to bold ≥14pt (white-on-orange is 4.07:1, AA-large only). **Fix:** both toggle directions demoted to the neutral outline treatment (`border-border-strong bg-surface text-sm font-medium text-text-strong`), matching `RecentAutoAppliedStrip`'s data-quality micro-actions.
  - **P1 — accent proliferation / hierarchy inversion.** A per-warning orange fill out-shouted Re-sync/Report and risked the ≤10%-viewport cap. Same fix reserves the accent.
- **P2s (both independently flagged, FIXED):** context-wrong `focus-visible:ring-offset-warning-bg` (control also mounts on `info-bg`) → dropped the offset colour; post-action error `role="status"` → `role="alert"` (assertive).

Detector re-run clean and 20/20 component tests green after the restyle. No `DEFERRED.md` entry required (all HIGH/CRITICAL fixed).
