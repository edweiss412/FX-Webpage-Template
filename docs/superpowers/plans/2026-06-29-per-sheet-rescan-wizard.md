# Per-sheet "Re-scan" in the setup wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual per-sheet "Re-scan this sheet" button in the onboarding wizard (Step-3 review card + the final-publish blocker row) that re-fetches one Drive file, re-parses, re-stages it, clears a `STAGED_PARSE_OUTDATED_AT_PHASE_D` block, and auto-keeps approval when the refresh is "clean" — else blocks the sheet for re-review.

**Architecture:** A purpose-built `rescanWizardSheet` lib function (orchestration under the finalize→app_settings→show lock order) + a thin `POST /api/admin/onboarding/rescan-sheet` route + a `RescanSheetButton` client component on both surfaces. Re-staging reuses the existing single-file scan building blocks (`prepareOnboardingFiles` → `scanOnboardingPreparedFiles` → `runPhase1`). The clean/dirty decision is a **direct `runInvariants(priorParse, refreshedParse)` diff** (the onboarding scan is blinded and never emits MI-11). Dirty rescans write a **demote-shaped block** (`last_finalize_failure_code='RESCAN_REVIEW_REQUIRED'` + manifest `'staged'` + the MI-11 items) so finalize cannot silently consume them.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Postgres (postgres.js), Vitest, Supabase. UI: React 19 + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-29-per-sheet-rescan-wizard.md` (APPROVED, Codex 4 rounds). The spec is the behavioral source of truth; this plan is the build sequence. Cite the spec section for exhaustive behavior; cite `file:line` for every live API.

## Global Constraints

- **TDD per task; commit per task** (conventional commits `<type>(<scope>): <summary>`); `--no-verify` on commits (shared lint-staged hook belongs to the main checkout). Run prettier+eslint+tsc manually before each commit.
- **Per-show advisory lock — single holder, order `finalize:<session>` (try) → `app_settings FOR UPDATE` → `show:<driveFileId>` (blocking).** Identical order to finalize ⇒ no AB-BA deadlock. `withShowLock` (`lib/sync/lockedShowTx.ts:88`) is the sole `show:` acquirer (held-lock passthrough inside the scan).
- **No raw error codes in UI** — route returns typed results; button renders via `lookupDougFacing`. **Email canonicalization** at the existing stage boundary. **PostgREST DML lockdown** — all mutations server-side under the lock.
- **UI is Opus-only; invariant 8** — `RescanSheetButton` + card changes get `/impeccable critique` + `/impeccable audit` before close-out.
- **No schema migration.** One new §12.4 code `RESCAN_REVIEW_REQUIRED` via the three-way lockstep (spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`); `x1-catalog-parity` confirms.
- **Local DB:** `*.db.test.ts` connect to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; stub `TEST_DATABASE_URL` + `DATABASE_URL` to loopback (plan R19-1); `skipIf(!dbUp)`.

## File structure

- **Create** `lib/onboarding/rescanDecision.ts` — the pure clean/dirty diff (`computeRescanDecision`).
- **Create** `lib/onboarding/rescanWizardSheet.ts` — the orchestration core + `RescanResult` type.
- **Create** `app/api/admin/onboarding/rescan-sheet/route.ts` — the POST handler + `handleRescanSheet` (exported for tests).
- **Create** `components/admin/RescanSheetButton.tsx` — the client button.
- **Modify** `lib/messages/catalog.ts` — add `RESCAN_REVIEW_REQUIRED`.
- **Modify** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 — add the `RESCAN_REVIEW_REQUIRED` row (then `pnpm gen:spec-codes`).
- **Modify** `components/admin/wizard/Step3SheetCard.tsx` — mount the button in both render paths.
- **Modify** `components/admin/RunFinalCASButton.tsx` + `components/admin/FinalizeButton.tsx` — mount the button in `cas_per_row` rows whose `code === 'STAGED_PARSE_OUTDATED_AT_PHASE_D'`.
- **Modify** `tests/auth/advisoryLockRpcDeadlock.test.ts` — pin the rescan lock topology.
- **Create** tests: `tests/onboarding/rescanDecision.test.ts`, `tests/onboarding/rescanWizardSheet.db.test.ts`, `tests/onboarding/rescanWizardSheetFlowB.db.test.ts`, `tests/api/rescanSheetRoute.test.ts`, `tests/components/admin/RescanSheetButton.test.tsx`, `tests/onboarding/_metaRescanDecisionInvariants.test.ts`.

## Meta-test inventory (declared)

- **CREATES** `tests/onboarding/_metaRescanDecisionInvariants.test.ts` — pins the decision-requiring-invariant set (currently `{MI-11}`) so a future gated invariant can't silently bypass the clean rule (spec §6 / §11 T-M).
- **EXTENDS** `tests/auth/advisoryLockRpcDeadlock.test.ts` — adds the rescan surface to the advisory-lock topology pin (lock order `finalize:→app_settings→show:`).
- **EXTENDS** `tests/cross-cutting/codes.test.ts` (x1-catalog-parity) — the new `RESCAN_REVIEW_REQUIRED` row participates automatically once added in lockstep.
- Supabase call-boundary meta-test: the new route's Supabase calls go through the locked `withTx` pipeline (no new PostgREST client surface); carry an inline `// not-subject-to-meta: server-locked tx path` note where applicable.

## Advisory-lock holder topology (mandatory — `pg_advisory*` is touched)

Hashkey `hashtext('show:'||driveFileId)`: sole acquirer is `withShowLock` (`lib/sync/lockedShowTx.ts:88`). `rescanWizardSheet` takes it once (blocking) and routes the scan's internal lock through the held-lock passthrough (`deps.withShowLock=(_id,fn)=>fn(scanTx)`) — no second acquire. Hashkey `hashtext('finalize:'||session)`: `tryFinalizeLock` (`finalize/route.ts:263`), taken TRY-only by rescan. Total order `finalize:→app_settings→show:` matches `/finalize` (`:932/:935/:987`) and `/finalize-cas` (`:668/:674/:713`) — pinned by `tests/auth/advisoryLockRpcDeadlock.test.ts` (extended in Task 7).

---

### Task 1: §12.4 code `RESCAN_REVIEW_REQUIRED` (three-way lockstep)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table + helpfulContext appendix)
- Modify: `lib/messages/catalog.ts`
- Modify: `app/api/admin/onboarding/finalize/route.ts` (extend `demotePending`'s code union, `:401-407`)
- Regen: `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)
- Test: `tests/cross-cutting/codes.test.ts` (x1, already exists)

**Interfaces:**
- Produces: the string literal `'RESCAN_REVIEW_REQUIRED'` available to `rescanWizardSheet` (Task 3) as a cataloged code, and as a member of the `demotePending` code union (the cataloged demotion-reason surface — spec §3/§6.1).

- [ ] **Step 1: Add the §12.4 spec row (by hand — the master spec is prettier-ignored).** In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, add a table row in §12.4 (alphabetical/sectional placement near other `RESCAN`/`R` codes) with `dougFacing` cell `"This sheet changed and needs your review before publishing."` and followUp `"Doug → re-review this sheet in setup, then publish"`. Add the matching helpfulContext appendix line: `RESCAN_REVIEW_REQUIRED: "A re-scan of this sheet surfaced a change that needs a decision (for example a crew email change), so setup is holding it out of the publish batch until you re-review and re-approve it."`
- [ ] **Step 2: Add the catalog entry** in `lib/messages/catalog.ts` (mirror an existing `STAGED_PARSE_*` entry's shape): `code`, `dougFacing` (byte-identical to the spec cell), `crewFacing: null`, `followUp` (byte-identical), `helpfulContext` (byte-identical to the appendix), `title: "This sheet changed during setup"`, `longExplanation` (plain English), `helpHref: "/help/errors#RESCAN_REVIEW_REQUIRED"`.
- [ ] **Step 2b: Extend `demotePending`'s code union** (`app/api/admin/onboarding/finalize/route.ts:401-407`) with the new code — add a top-level `const RESCAN_REVIEW_REQUIRED = "RESCAN_REVIEW_REQUIRED" as const;` (or import from a shared constant) and add `typeof RESCAN_REVIEW_REQUIRED` to the union — so the cataloged demotion-reason surface includes it. `npx tsc --noEmit` to confirm the union compiles.
- [ ] **Step 3: Regenerate + run the parity gate**

Run: `pnpm test:audit:x1-catalog-parity`
Expected: PASS (catalog ↔ §12.4 ↔ generated byte-aligned on dougFacing/crewFacing/followUp/helpfulContext).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts
git commit --no-verify -m "feat(messages): add RESCAN_REVIEW_REQUIRED §12.4 code (3-way lockstep)"
```

---

### Task 2: Clean/dirty decision (pure diff)

**Files:**
- Create: `lib/onboarding/rescanDecision.ts`
- Test: `tests/onboarding/rescanDecision.test.ts`

**Interfaces:**
- Consumes: `runInvariants` (`lib/parser/invariants.ts:98`, `(prior: ParseResult|null, next: ParseResult) => InvariantOutcome` where `{outcome:"stage", triggeredItems}` carries MI-11); `summarizeDataGaps` (`lib/parser/dataGaps.ts:53` → `{ total, classes: Record<GapClass, number> }`); `ParseResult`, `TriggeredReviewItem` (`lib/parser/types.ts`).
- Produces: `DECISION_REQUIRING_INVARIANTS: ReadonlySet<TriggeredReviewItem["invariant"]>` = `new Set(["MI-11","MI-12","MI-13","MI-14"])` (the existing-crew change family — email + rename + roster; MI-12/13/14 are multi-action gated per `allowedActions`, `applyStagedCore.ts:104-111`; MI-11 included per the brainstorming "email changes re-prompt" decision — see spec §6) and `computeRescanDecision(priorParse: ParseResult|null, refreshedParse: ParseResult, priorDataGaps: DataGapsSummary|null): { dirty: boolean; decisionItems: TriggeredReviewItem[] }`.

- [ ] **Step 1: Write the failing tests** (`tests/onboarding/rescanDecision.test.ts`). Cover (derive fixtures, never hardcode ids): (a) email change in `refreshedParse` vs `priorParse` → `dirty===true`, `decisionItems` length 1 (MI-11); (b) identical parse → `dirty===false`, `decisionItems===[]`; (c) refreshed adds a 2nd `FIELD_UNREADABLE` (count 1→2) vs prior → `dirty===true`; (d) refreshed *removes* a gap → `dirty===false`; (e) `priorParse===null` (first-seen) → `decisionItems===[]`, `dirty===false` (the `priorReady` clause lives in the caller, not here). Concrete failure mode caught: an email change being silently auto-approved (CRITICAL r1-2).
- [ ] **Step 2: Run → FAIL** (`module not found`). `npx vitest run tests/onboarding/rescanDecision.test.ts`
- [ ] **Step 3: Implement** `computeRescanDecision`: `const inv = runInvariants(priorParse, refreshedParse); const decisionItems = inv.outcome === "stage" ? inv.triggeredItems.filter(i => DECISION_REQUIRING_INVARIANTS.has(i.invariant)) : []; const newGaps = summarizeDataGaps(refreshedParse.warnings ?? []).classes; const gapRegressed = Object.entries(newGaps).some(([cls, n]) => n > (priorDataGaps?.classes[cls] ?? 0)); return { dirty: decisionItems.length > 0 || gapRegressed, decisionItems };`
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(onboarding): rescan clean/dirty decision via runInvariants diff`

---

### Task 3: `rescanWizardSheet` core — Flow A (review) + folder guard + lock

**Files:**
- Create: `lib/onboarding/rescanWizardSheet.ts`
- Test: `tests/onboarding/rescanWizardSheet.db.test.ts`

**Interfaces:**
- Consumes: `prepareOnboardingFiles` (`runOnboardingScan.ts:907`), `scanOnboardingPreparedFiles` (`:994`, returns `OnboardingScanResult` with `processed: Array<{driveFileId, outcome}>`), `PostgresOnboardingScanTx`, `withShowLock` (`lockedShowTx.ts:88`), `tryFinalizeLock`-equivalent SQL, `computeRescanDecision` (Task 2), `parseShadowPayloadForApply` (`lib/onboarding/shadowPayload.ts`), `summarizeDataGaps`, `runInvariants`, the `'RESCAN_REVIEW_REQUIRED'` + `'STAGED_PARSE_SOURCE_OUT_OF_SCOPE'` + `'CONCURRENT_FINALIZE_IN_FLIGHT'` codes.
- Produces: `type RescanResult` (spec §5.4) and `async function rescanWizardSheet(driveFileId: string, wizardSessionId: string, deps: RescanDeps = {}): Promise<RescanResult>`. `RescanDeps` injects `fetchDriveFileMetadata`, `prepareOnboardingFiles`, a `withTx` runtime, and a test seam to run code during the pre-lock Drive window (for TOCTOU test).

- [ ] **Step 1: Write the failing real-DB tests** (`tests/onboarding/rescanWizardSheet.db.test.ts`) — copy the harness shape from `tests/onboarding/finalizeCasReonboardBaseline.db.test.ts` (seed app_settings pending session+folder, stage via `runPhase1`+`PostgresOnboardingScanTx`). Cases (spec §11): **T-A1** clean+approved → refreshed parse, `wizard_approved=true`, `wizard_approved_by_email` non-null + `wizard_approved_at` refreshed (CHECK passes), `last_finalize_failure_code=null`, choices regenerated to NEW item ids (derive from row), `needsReview=false`. **T-A2** email change → `wizard_approved=false`, `last_finalize_failure_code='RESCAN_REVIEW_REQUIRED'`, `triggered_review_items` includes the MI-11 item, manifest `'staged'`; then `handleOnboardingFinalize` does NOT consume it + `unresolvedManifestCount` blocks. **T-A3** gap-count regress → blocked; remove-gap stays clean. **T-A4** hard-fail → `needs_attention` + concrete `pending_ingestions.last_error_code`, manifest `hard_failed`. **T-SCOPE2** metadata.parents lacks `pending_folder_id` → `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, no mutation. **T-LOCK(i)** hold `finalize:<session>` concurrently → `CONCURRENT_FINALIZE_IN_FLIGHT`, no mutation. **T-LOCK(iv)** run `unapprove` during the pre-lock Drive seam → under-lock re-read sees `priorReady=false` (no resurrected approval).
- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/onboarding/rescanWizardSheet.db.test.ts`
- [ ] **Step 3: Implement `rescanWizardSheet`** per spec §5:
  - **§5.2 pre-lock:** preliminary non-mutating `app_settings` read (`pending_folder_id`, `pending_wizard_session_id`); early-return `superseded`/`no_active_session` if mismatched/absent; fetch Drive metadata; **folder guard** — `if (!metadata.parents.includes(pendingFolderId)) return { status:"needs_attention", code:"STAGED_PARSE_SOURCE_OUT_OF_SCOPE" }`; `const preparedFiles = await prepareOnboardingFiles(folderId, { listFolder: async () => [metadata] }); const prepared = preparedFiles[0];` (returns `PreparedOnboardingFile[]` — destructure the single element, `runOnboardingScan.ts:907`); handle drive-fail / `non_sheet`.
  - **(test seam)** call `deps.afterDriveRead?.()` here so the TOCTOU test can mutate approval before the lock.
  - **§5.3 locked tx (`withTx`):** acquire `pg_try_advisory_xact_lock(hashtext('finalize:'||$1))` → false ⇒ `{status:"busy", code:"CONCURRENT_FINALIZE_IN_FLIGHT"}`; `select pending_wizard_session_id from app_settings where id='default' for update` → mismatch ⇒ `superseded`; `select pg_advisory_xact_lock(hashtext('show:'||$1))`.
  - **Step 2.0 capture prior state UNDER lock** (read `pending_syncs` OR shadow per spec §5.3; `priorReady`, `priorApprovedByEmail`, `priorParse` (shadow via `parseShadowPayloadForApply`, corrupt → null), `priorChoices`, `priorDataGaps`).
  - **(a) re-stage (held-tx adapter, per `retrySingleFile.ts:254-272`):** construct a `PostgresOnboardingScanTx` on the held transaction (`const scanTx = new PostgresOnboardingScanTx(heldTx, folderId, wizardSessionId)`), then `const res = await scanOnboardingPreparedFiles(folderId, wizardSessionId, [prepared], { tx: scanTx, withShowLock: async (_id, fn) => fn(scanTx) })` — both `tx:` AND the passthrough `withShowLock` so staging runs in the SAME locked tx (no second acquire, no scan work outside the tx). If `res.processed[0].outcome === "hard_failed"` → `DELETE` orphan shadow, read `pending_ingestions.last_error_code`, return `{status:"needs_attention", code:<that>}`.
  - **(b) heal:** `DELETE FROM shows_pending_changes WHERE wizard_session_id=$1 AND drive_file_id=$2`; manifest `status='staged'` (preserve `publish_intent`); if checkpoint status ∈ {`all_batches_complete`,`final_cas_done`} → set `'in_progress'`.
  - **(c) clean rule:** `const { dirty, decisionItems } = computeRescanDecision(priorParse, prepared.parseResult, priorDataGaps); const dirty2 = dirty || (priorReady && priorParse === null);` If `dirty2` → UPDATE `pending_syncs` set `wizard_approved=false, wizard_approved_by_email=null, wizard_approved_at=null, wizard_reviewer_choices=null, wizard_reviewer_choices_version=null, last_finalize_failure_code='RESCAN_REVIEW_REQUIRED', triggered_review_items = <sentinel ++ decisionItems>`; return `{status:"updated", needsReview:true, changed}`. Else if `priorReady` → UPDATE set `wizard_approved=true, wizard_approved_by_email=$priorApprovedByEmail, wizard_approved_at=now(), wizard_reviewer_choices=<one apply per new item>, wizard_reviewer_choices_version=1, last_finalize_failure_code=null`; return `{status:"updated", needsReview:false, changed}`. Else (`!priorReady`) leave as-staged; return `{status:"updated", needsReview:true, changed}`.
  - `changed` = `new staged_modified_time !== prior staged value`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(onboarding): rescanWizardSheet core — Flow A + folder guard + lock`

---

### Task 4: `rescanWizardSheet` — Flow B (blocker heal) integration

**Files:**
- Modify: `lib/onboarding/rescanWizardSheet.ts` (no new logic if Task 3 implemented the heal generically; this task PROVES Flow B end-to-end)
- Test: `tests/onboarding/rescanWizardSheetFlowB.db.test.ts`

**Interfaces:**
- Consumes: `handleOnboardingFinalize` (`finalize/route.ts:898`), `handleOnboardingFinalizeCas` (`finalize-cas/route.ts:741`).

- [ ] **Step 1: Write the failing test (T-B, headline)** — drive a sheet to a genuine `STAGED_PARSE_OUTDATED_AT_PHASE_D` (mirror the true-staleness path in `finalizeCasReonboardBaseline.db.test.ts`: stage, approve, Phase B, then advance the live watermark) with a **sibling** sheet also staged+approved. Rescan the blocked sheet → assert: orphan shadow deleted, fresh `pending_syncs` base==current live watermark, `wizard_approved_by_email` = the shadow's `applied_by_email` (CHECK passes), manifest `'staged'`+`publish_intent` preserved, checkpoint re-openable, **sibling shadow row untouched**. Then `handleOnboardingFinalize`+`handleOnboardingFinalizeCas` → per_row `OK`, batch publishes. Pre-heal control: a variant without the heal still 409s.
- [ ] **Step 2: Run → FAIL / iterate.** `npx vitest run tests/onboarding/rescanWizardSheetFlowB.db.test.ts`
- [ ] **Step 3: Fix any Flow-B gaps** in `rescanWizardSheet` surfaced by the test (capture-from-shadow, checkpoint reset value, sibling non-interference). Keep changes minimal.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `test(onboarding): Flow-B blocker heal end-to-end (rescan clears STAGED_PARSE_OUTDATED)`

---

### Task 5: `POST /api/admin/onboarding/rescan-sheet`

**Files:**
- Create: `app/api/admin/onboarding/rescan-sheet/route.ts`
- Test: `tests/api/rescanSheetRoute.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`lib/auth/requireAdmin.ts:263`), `rescanWizardSheet` (Task 3).
- Produces: `export async function handleRescanSheet(req: Request, deps?): Promise<Response>` + the default `POST`. Body `{ driveFileId: string, wizardSessionId: string }`. Maps `RescanResult` → JSON: `updated` → `{ ok:true, status, needsReview, changed }`; `needs_attention`/`busy` → `{ ok:false, status, code }` (HTTP 200 with body — the button reads `{ok}`); `superseded`/`no_active_session`/`not_found`/`not_a_sheet` → `{ ok:false, status }`.

- [ ] **Step 1: Write the failing route tests** — `requireAdmin` enforced (401 when not admin); 400 on missing `driveFileId`/`wizardSessionId`; a non-manifest `driveFileId` → `not_found`; result shapes mapped correctly (mock `rescanWizardSheet` via deps). Anti-tautology: assert the JSON body keys independently of the mocked result.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the route — `await requireAdmin()`; parse+validate body; `const result = await rescanWizardSheet(driveFileId, wizardSessionId, deps)`; map to `NextResponse.json`. Supabase/tx calls destructure `{data, error}` (invariant 9); inline `// not-subject-to-meta: server-locked tx path`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(onboarding): POST /api/admin/onboarding/rescan-sheet`

---

### Task 5b: Dirty-rescan recovery — `/approve` guard + Step-3 visibility (CRITICAL fix, UI — Opus)

> Plan-review CRITICAL: a dirty rescan leaves the row at manifest `'staged'`, which Step 3 renders as a normal publish card; the checkbox `/approve` clears `last_finalize_failure_code=null` and synthesizes `apply` for every item (`approve/route.ts:104/:139`) → silent re-approve (MI-11) or invalid apply-all (MI-12/13/14 → batch-500 at finalize). Close it.

**Files:**
- Modify: `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts` (guard)
- Modify: `components/admin/wizard/Step3Review.tsx` + `Step3SheetCard.tsx` (thread `last_finalize_failure_code` into the Step3Row; render dirty rows distinctly)
- Test: `tests/onboarding/rescanApproveGuard.db.test.ts`, component test in `tests/components/wizard/step3DirtyRescan.test.tsx`

**Interfaces:**
- Consumes: `RESCAN_REVIEW_REQUIRED` (Task 1), the reapply page route (`/admin/onboarding/staged/[session]/[driveFileId]`).

- [ ] **Step 1: Write the failing tests.** (a) DB: stage+dirty-rescan a row (`last_finalize_failure_code='RESCAN_REVIEW_REQUIRED'`); POST the Step-3 `/approve` → assert it is **refused** (returns `RESCAN_REVIEW_REQUIRED`, row stays `wizard_approved=false`, code NOT cleared) — concrete failure mode: silent re-approve of a crew change. (b) DB: drive the same row through the reapply page's `/apply` with explicit choices → asserts `last_finalize_failure_code` cleared + `wizard_approved=true`. (c) Component: a Step3Row with `last_finalize_failure_code==='RESCAN_REVIEW_REQUIRED'` renders the "changed — review" state with a link to `/admin/onboarding/staged/[session]/[driveFileId]` and NO bare publish checkbox.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement the `/approve` guard** — before synthesizing choices, read the row's `last_finalize_failure_code`; if `=== 'RESCAN_REVIEW_REQUIRED'`, return `{ ok:false, code:"RESCAN_REVIEW_REQUIRED" }` (HTTP 200) WITHOUT mutating. (Targeted: other demotion codes are unaffected — existing checkbox recovery preserved.) Verify the reapply `/apply` route already clears `last_finalize_failure_code` (it is the demoted-row recovery path); if not, this is where the clear lands.
- [ ] **Step 4: Thread + render** — add `last_finalize_failure_code` to the Step3Row shape + `fetchStep3Data` selection; in `Step3SheetCard` (both render paths) render a `RESCAN_REVIEW_REQUIRED` row as a distinct "This sheet changed since you reviewed it — review before publishing" state with a `Link` to the reapply page (testid `wizard-step3-rescan-review-${dfid}`) and suppress the publish checkbox for that row.
- [ ] **Step 5: Run → PASS;** `npx tsc --noEmit`; eslint.
- [ ] **Step 6: Impeccable** `/impeccable critique` + `/impeccable audit` on the Step-3 dirty-state render (fold into Task 6's UI gate run if executed together).
- [ ] **Step 7: Commit** `fix(onboarding): block silent re-approve of a dirty rescan; route to reapply page`

---

### Task 6: `RescanSheetButton` component (UI — Opus + impeccable)

**Files:**
- Create: `components/admin/RescanSheetButton.tsx`
- Modify: `components/admin/wizard/Step3SheetCard.tsx` (both render paths: null-parse `:777-794`, normal `:963-972`)
- Modify: `components/admin/RunFinalCASButton.tsx` (`:115`) + `components/admin/FinalizeButton.tsx` (`:295`) — render only for `row.code === 'STAGED_PARSE_OUTDATED_AT_PHASE_D'`
- Test: `tests/components/admin/RescanSheetButton.test.tsx`

**Interfaces:**
- Consumes: `lookupDougFacing` (messages), `useRouter().refresh()`. Props: `{ driveFileId: string; wizardSessionId: string }`.

- [ ] **Step 1: Write the failing component tests** — renders idle label "Re-scan this sheet"; on click POSTs `{driveFileId, wizardSessionId}` to `/api/admin/onboarding/rescan-sheet` (mock fetch); renders each result branch copy (spec §9): updated+!needsReview+changed, +!changed, +needsReview, needs_attention (dougFacing+HelpAffordance), busy, superseded; `router.refresh()` on `ok`. Anti-tautology: assert the posted body and the rendered branch independently; clone+strip sibling label nodes before scanning result copy. Verify it mounts in both `Step3SheetCard` render paths and only on OUTDATED `cas_per_row` rows.
- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/components/admin/RescanSheetButton.test.tsx`
- [ ] **Step 3: Implement** `RescanSheetButton` (mirror `ReSyncButton.tsx:59-104` + the `Step3Review` retry pattern: `fetch`→`{status}|{ok:false,code}`→`router.refresh()`); states idle/loading/result; `aria-live="polite"` result line; disabled while loading (no self-disabling form-action). Wire into the 4 host components per the spec §9 placement (both Step3SheetCard returns; OUTDATED-only `cas_per_row` `<li>`).
- [ ] **Step 4: Run → PASS;** `npx tsc --noEmit`; `npx eslint <changed>`.
- [ ] **Step 5: Commit** `feat(admin): RescanSheetButton on Step-3 cards + final-publish blocker`
- [ ] **Step 6: Impeccable dual-gate (invariant 8)** — run `/impeccable critique` AND `/impeccable audit` on the UI diff (`RescanSheetButton.tsx`, `Step3SheetCard.tsx`, `RunFinalCASButton.tsx`, `FinalizeButton.tsx`). Fix HIGH/CRITICAL or defer via `DEFERRED.md`. Record findings + dispositions for the close-out handoff. (Layout-dimensions: N/A — the button is intrinsic-sized inline content, no fixed-dimension parent. Transition-audit: the button's transitions are all instant per spec §9 inventory — assert no `AnimatePresence`/ternary needs `exit`/`initial`.)

---

### Task 7: Meta-tests + advisory-lock topology pin

**Files:**
- Create: `tests/onboarding/_metaRescanDecisionInvariants.test.ts`
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts`

- [ ] **Step 1: Decision-invariant meta-test** — assert `DECISION_REQUIRING_INVARIANTS` = `{MI-11, MI-12, MI-13, MI-14}` AND that it is a SUPERSET of every invariant whose `allowedActions().size > 1` (the multi-action gated set MI-12/13/14, `applyStagedCore.ts:104-111`) — so a future multi-action invariant added to `allowedActions` but not to the rescan decision set fails the test (CLEAN-bypass guard). Concrete failure mode: a roster/rename change silently auto-kept. Negative-regression: drop `MI-12` from the set → a fixture crew-rename rescan must flip to CLEAN (proving the test bites).
- [ ] **Step 2: Extend the advisory-lock topology test** — add the rescan surface (`rescanWizardSheet` acquires `finalize:` try → `app_settings` FOR UPDATE → `show:` blocking, single `show:` holder) to `tests/auth/advisoryLockRpcDeadlock.test.ts` following its existing structural-pin pattern.
- [ ] **Step 3: Run → PASS.** `npx vitest run tests/onboarding/_metaRescanDecisionInvariants.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts`
- [ ] **Step 4: Commit** `test(onboarding): rescan decision-invariant meta-test + lock topology pin`

---

### Task 8: Full-suite verification

- [ ] **Step 1:** `npx vitest run tests/onboarding/ tests/api/rescanSheetRoute.test.ts tests/components/admin/ tests/cross-cutting/codes.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` → all PASS.
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npx eslint <all changed>` clean; `npx prettier --check <all changed>` clean.
- [ ] **Step 3:** `pnpm test:audit:x1-catalog-parity` PASS.

---

### Task 9: Adversarial review (cross-model) — MANDATORY before execution handoff

- [ ] Invoke `adversarial-review` (Codex) on the whole implementation diff; iterate to APPROVE (no round budget); REVIEWER-ONLY; fresh-eyes; triage findings via deferral discipline (land-now / `DEFERRED.md` / `BACKLOG.md`).

### Task 10: Execution handoff

- [ ] Push; open PR; **real CI green** (not just local); `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-review (run after drafting — see below for results)

Spec-coverage, placeholder, and type-consistency checks recorded in the commit after this plan lands.
