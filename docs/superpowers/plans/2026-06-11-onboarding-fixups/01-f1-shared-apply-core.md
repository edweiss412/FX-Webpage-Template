# Phase 1 — F1: Shared apply core (wizard finalize runs the full Phase-2 apply)


## Plan-R10 disposition — D-2 parity target (read before T1.1/T1.5)

The parity contract is wizard-vs-LIVE-apply (cron auto-apply via the hold-aware `runPhase2` core: feed rows + MI-11 holds), NOT wizard-vs-legacy-dashboard-staged-Apply. The legacy whole-parse staged Apply path is RETIRED (P2-F7, `applyStaged.ts:1345-1353`), stays fail-closed, gets NO notableItems wiring, and writes no feed rows — extending it would resurrect a retired surface. Spec D-2 row updated to say this explicitly. The MI-11/feed parity regressions in T1.6 therefore compare wizard shadow applies to the cron decision-rule path; a wizard-vs-retired-dashboard parity test is intentionally absent.


> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Every task is strict TDD: write the failing test → run it red → minimal implementation → run it green → commit. Never write impl before the test. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md` §3 (F1) — §3.1 first-seen branch, §3.2 existing-show branch, §3.3 lock topology, §3.4 non-changes — plus the F1 rows of §9 (meta-tests) and §10 (testing spine items 1–3, 8-first-half, 9).

**Goal:** Extract the "apply a staged `parse_result` with reviewer choices under an already-held per-show advisory lock" core out of `lib/sync/applyStaged.ts` into one shared module, then route BOTH wizard finalize writers through it: Phase B first-seen (`applyFirstSeenDraft` → full Phase-2 apply, children + `shows_internal` + auth-contract calls, `published = false` preserved, provenance recorded) and Phase D existing-show (`applyShadow` → hold-aware core with `mi11Items`, feed rows, equality stale-baseline preflight, real audit provenance). The bespoke `INSERT INTO public.shows` / `UPDATE public.shows SET …` writers whose drift caused the origin incident are DELETED, and structural meta-tests make a second copy impossible to reintroduce silently.

**Depends on:** nothing in this milestone (F1 is the foundation phase). F2 (remediation) consumes the audit-summary `source`/`crewCount` shape this phase ships; F4 consumes the `created_show_id` provenance column.

**Scope boundary:** This phase does NOT touch the F2 remediation migration, the F3 re-apply page, the F4 reap, or F5. It does not change cron/push/manual sync semantics (§3.4). The only schema change is the `onboarding_scan_manifest.created_show_id` provenance column (Task 1.3).

---

## Grounding citations (verified against live code 2026-06-11, pre-draft verification pass)

**Apply engine + composition:**

- `ApplyParseResultTx` contract: `lib/sync/applyParseResult.ts:19-42` — `deleteCrewMembersNotIn` / `upsertCrewMembers` / `provisionAddedCrewAuth` / `revokeRemovedCrewAuth` / `replaceHotelReservations` / `replaceRooms` / `replaceTransportation` / `replaceContacts` / `upsertShowsInternal` / `deleteLivePendingIngestion`. Op sequence at `:113-131`; `tx.deleteLivePendingIngestion(args.driveFileId)` is called **unconditionally** at `:131`.
- `runPhase2` composition: `lib/sync/phase2.ts:201-398`. P2-F6 fail-closed guard (`mi11Items` present + no `holdPort` → throw `Phase2GateBypassError`) at `:205-207`; MI-11 hold write BEFORE the hold-aware apply at `:300-326` (`writeMi11Holds`); hold-aware `applyParseResult` call at `:328-335`; `writeAutoApplyChanges` feed write + `cleanup_superseded_before_images` at `:340-372` (NOTE: spec §3.2 cites `:337-350`; the block actually extends to `:372` — same surface, wider range). `Phase2Args.mi11Items` at `:85`, `notableItems` at `:88`. `Phase2Tx.applyShowSnapshot` signature at `:33-54` (carries `autoPublishFirstSeen`).
- Cron decision-rule wiring (the MI-11 parity reference): `lib/sync/runScheduledCronSync.ts:2361-2364` (`notableItems` for `pass`/`auto_apply_with_holds`) and `:2410-2414` (`mi11Items: phase1.mi11Items`). `phase1.ts:98-99` defines the `auto_apply_with_holds` outcome.
- `writeMi11Holds` + `Mi11Item`: `lib/sync/holds/writeMi11Holds.ts:21` (`Mi11Item = Extract<TriggeredReviewItem, { invariant: "MI-11" }>`), writer at `:46+` (`kind='mi11_pending'`, `domain='crew_email'`, ON CONFLICT in-place update).

**Choice-aware feed inputs (plan R24-2):** Phase D must NOT pass raw `parsed.triggeredReviewItems` as `notableItems` — the live feed writer derives `crew_renamed` rows from every MI-12/13/14 item, which mislabels an `independent` choice (independent = remove+add, not a rename; the matrix marks this distinction load-bearing). The choice-semantics dispatch (R11) ALSO filters/transforms the feed inputs: items resolved `reject` are excluded entirely; items resolved `independent` are passed in their remove+add form (or the feed writer API is extended to accept validated choices — pick whichever matches the live writer's contract after reading `lib/sync/changeLog/writeAutoApplyChanges.ts`). Required DB regression: MI-13 and MI-14 `independent` wizard shadows → `show_change_log` contains NO `crew_renamed` row for those names and the emitted rows match the applied remove+add semantics; concrete failure mode: the feed/undo surface displays a rename the operator explicitly declined to treat as one.


**applyStaged (extraction source):**

- Result-code consts `lib/sync/applyStaged.ts:40-54`; `ReviewerChoice` `:56-60`; `PendingSyncForApply` `:62-92`; `normalizeTimestamptz` `:407-411`; `validateReviewerChoices` `:440-473` (+ `allowedActions` `:424-431`, `expectedRenameValue` `:433-438`, `ASSET_REVIEW_INVARIANTS` `:417-422`); `deriveAuthSideEffects` `:475-503`; `parseResultSummary` `:505-512` (`{title, crewCount, roomCount, warningCount}` — **no `source` key today**); `mapPendingSyncRowForApply` `:541-579` (corrupt-flag posture); `defaultDeleteLivePendingSync` `:806-821` (live `pending_syncs` DELETE, `wizard_session_id is null` — spec step 6L); `defaultRestoreShowStatus` `:823-839`; `defaultUpsertLivePendingIngestion` `:841-872`; `defaultInsertSyncAudit` `:874-905` (does NOT set `applied_at` — DB default); `defaultBumpReviewerAuthFloors` `:907-915` (**deliberate no-op stub**); `restoreDeleteAndIngest` `:935-967`.
- `applyStaged_unlocked` `:1206-1458`. Live branch: baseline equality check + delete at `:1296-1300`; reject branch `:1327-1339`; **P2-F7 guard `:1345-1354`** (live MI-11 staged row → throw `Phase2GateBypassError`); `runPhase2` call `:1384-1397` (passes NO `mi11Items`, NO `notableItems`); stale handling `:1398-1401`; floors + audit + live delete `:1403-1416`; first-published tail `:1432-1456`. `Object.create(tx)` method-override precedent: `makeInlineOnboardingScanTx` `:1625-1682`.
- Wizard approve branch corrupt-items refusal (`reviewItemsCorrupt` → typed refusal BEFORE approval): `:1229-1231` — so a `wizard_approved = true` row has parseable `triggered_review_items` **by construction**.

**Pipeline tx (the only legitimate shows/children writer):**

- `PostgresPipelineTx` class (module-private): `lib/sync/runScheduledCronSync.ts:352`; `holdPort()` `:368-374`; `deleteLivePendingIngestion` `:649-658`; **`applyShowSnapshot` `:918-1119`** with the first-seen INSERT via `insertFirstSeenShowWithSlugRetry` at `:1074-1097` (omits `published` → DDL default `true`, `supabase/migrations/20260501000000_initial_public_schema.sql:26`; carries `unpublish_token` cols for B2 auto-publish); `upsertCrewMembers` `:1128-1160`; **`provisionAddedCrewAuth` `:1162-1165` and `revokeRemovedCrewAuth` `:1167-1170` are deliberate no-op stubs** (crew-auth pivot: auth is provisioned lazily at picker claim — the contract call is the parity surface, not `crew_member_auth` rows); `replaceHotelReservations` `:1172`; `replaceRooms` `:1198`; `replaceTransportation` `:1233`; `replaceContacts` `:1259`; `upsertShowsInternal` `:1272-1293`; `insertFirstSeenShowWithSlugRetry` export `:323-341`; `withPostgresSyncPipelineLock` `:1314-1341`; `resolveStaleSyncProblemAlerts_unlocked` `:139-157` (live alert resolution — cron-path call sites `:1885`, `:1961`, `:2319`, `:2443`; NOT called from `applyStaged`).
- Lock plumbing: `lib/sync/lockedShowTx.ts` — `withShowLock` `:88-112`, `assertShowLockHeld` `:114-146`, private `brand()` `:64-66`.

**Finalize routes (the broken writers):**

- `app/api/admin/onboarding/finalize/route.ts`: `FinalizeRouteTx` `:24-26`; `defaultWithRowTx` `:104-120` (per-row `pg_advisory_xact_lock(hashtext('show:'||$1))` at `:114` — the Phase B lock holder); `selectApprovedRows` `:234-253` (does NOT select `wizard_approved_at`, `triggered_review_items`, or `base_modified_time`); `demotePending` `:268-303`; `showExists` `:305-315`; **`applyFirstSeenDraft` `:324-373`** (bespoke shows-only INSERT, `published` hardcoded `false` at `:345`); **`insertFinalizeAudit` `:375-408`** (hardcodes `triggered_review_items='[]'::jsonb`, `derived_side_effects='{}'::jsonb`, omits `applied_at`); **`stageExistingShowShadow` `:410-450`** (payload = `parse_result`/`staged_modified_time`/`staged_id`/`reviewer_choices` ONLY; `applied_at_intent = now()` at `:428`); `deleteApprovedPending` `:452-468`; `processApprovedRow` `:514-607` (existing-show branch `:591-595`, first-seen branch `:597-606`).
- `app/api/admin/onboarding/finalize-cas/route.ts`: `ShadowRow` `:38-50`; `defaultWithRowTx` `:95-109` (per-row lock at `:103` — the Phase D lock holder); `readShadowRows` `:210-221`; `deleteAppliedShadowRow` `:230-239`; **`applyShadow` `:241-306`** (bespoke shows-only UPDATE; the `<=` CAS gate `last_seen_modified_time is null or last_seen_modified_time <= $15` at `:277`); **`insertShadowAudit` `:308-336`** (same `'[]'`/`'{}'` stubs; summary = `{title, source:'onboarding_finalize_cas'}` only); `publishAppliedWizardShows` `:338-356` (bulk flip keyed on manifest `status='applied'` — the over-broad flip §3.4 narrows); per-row loop + blocked→409 `:449-456`.

**Schema:**

- `sync_audit` DDL: `supabase/migrations/20260501001000_internal_and_admin.sql:205-218` (`applied_at timestamptz not null default now()` at `:208`; `base_modified_time` at `:216`).
- `onboarding_scan_manifest` DDL: same file `:336-358` (no provenance column today; `unique (wizard_session_id, drive_file_id)`).
- `shows_pending_changes` DDL: same file `:433-444` (`applied_at_intent timestamptz not null` `:440`).
- `pending_syncs.wizard_approved_at`: same file `:153`.
- Watermark gate the self-heal relies on: `lib/sync/perFileProcessor.ts:214-220` (`isAtOrBefore(fileMeta.modifiedTime, effectiveWatermark)` → skip).

**Messages catalog (no new codes needed in this phase):** `STAGED_REVIEW_ITEMS_CORRUPT` `lib/messages/catalog.ts:1252`; `STAGED_PARSE_RESULT_CORRUPT` `:1265`; `STAGED_PARSE_OUTDATED_AT_PHASE_D` `:1910`.

**Structural-test precedents:** `tests/auth/advisoryLockRpcDeadlock.test.ts:13-49` (strip-comments + regex over pinned file list); `tests/sync/_partitionScopeContract.test.ts` (source-grep contract style); `tests/sync/_advisoryLockSingleHolderContract.test.ts`; fake-tx harness `tests/sync/applyStaged.test.ts:32-120`; fake finalize-cas DB `tests/onboarding/finalize-cas.test.ts:50-200`; real-DB finalize harness `tests/onboarding/onboardingFinalizePublishDb.test.ts`.

### Spec-vs-code corrections found during the verification pass

1. **§9 allowlist symbol `upsertShow` does not exist.** The canonical first-seen insert lives inside `PostgresPipelineTx.applyShowSnapshot` (`lib/sync/runScheduledCronSync.ts:918`, first-seen arm `:1074-1097`). The second-copy tripwire's allowlist (Task 1.7) pins `applyShowSnapshot`, not `upsertShow`.
2. **`provisionAddedCrewAuth` is a no-op stub in production** (`runScheduledCronSync.ts:1162-1165`). §3.1's "and `provisionAddedCrewAuth` for added crew names" is satisfied as a *contract-call parity* requirement: the shared core invokes the tx method with the added names exactly as cron/dashboard do. Tests assert the call (spy tx), never `crew_member_auth` rows — no path writes them at apply time.
3. **`writeAutoApplyChanges` block is `phase2.ts:340-372`**, not `:337-350` (includes the `cleanup_superseded_before_images` invariant call). Behavior as spec describes.
4. **Phase D's per-row code surface** already has §12.4-cataloged codes for the fail-closed posture (`STAGED_REVIEW_ITEMS_CORRUPT`, `STAGED_PARSE_RESULT_CORRUPT`) — no new catalog row, no three-lockstep update needed in this phase.

---

## Design: the shared core (read before Task 1.1)

New module **`lib/sync/applyStagedCore.ts`**:

```ts
export type ApplyStagedCoreArgs = {
  sourceScope: "live" | "wizard";          // drives live-partition op classification (Task 1.2)
  driveFileId: string;
  show: ShowForApply | null;               // caller-read UNDER the held lock
  parseResult: ParseResult;
  triggeredReviewItems: TriggeredReviewItem[];
  reviewerChoices: ReviewerChoice[];
  stagedId: string;
  stagedModifiedTime: string;              // binding.modifiedTime for runPhase2 (= holds baseModifiedTime)
  baseModifiedTime: string | null;         // equality preflight target + sync_audit.base_modified_time
  appliedByEmail: string;
  appliedAt: string | null;                // null → DB default now(); wizard passes wizard_approved_at
  auditSource: "staged_apply" | "onboarding_finalize" | "onboarding_finalize_cas";
  fileMeta: DriveListedFile;
  mi11Items: Mi11Item[];                   // wizard Phase D extracts from payload items; live legacy passes []
  notableItems?: TriggeredReviewItem[];    // present → feed rows (phase2.ts:340); absent → no feed (Phase B)
  skipDiagramsWrite: boolean;
  snapshotAssetsForApply?: Phase2Args["snapshotAssetsForApply"];
  autoPublishFirstSeen?: Phase2Args["autoPublishFirstSeen"];
  firstSeenPublished?: false;              // wizard Phase B only: first-seen INSERT writes published=false
};

export type ApplyStagedCoreResult =
  | { outcome: "applied"; showId: string; syncAuditId: string | null;
      derivedSideEffects: { revokeFloorForNames: string[] };
      roleFlagsNotice?: RoleFlagsNotice; snapshotRevisionId?: string }
  | { outcome: "invalid_request"; code: typeof MISSING_REVIEWER_CHOICE | typeof EXTRA_REVIEWER_CHOICE
      | typeof DUPLICATE_REVIEWER_CHOICE | typeof INVALID_REVIEWER_ACTION }
  | { outcome: "discarded_by_choice" }     // ANY reject choice: NO Phase 2, NO audit, NO floors — the
                                           // core consumes nothing; each caller maps to its partition's
                                           // discard semantics (live contract applyStaged.ts:1327-1339;
                                           // pinned by tests/sync/applyStaged.test.ts:1118-1147)
  | { outcome: "stale_baseline" }          // live last_seen_modified_time ≠ args.baseModifiedTime
  | { outcome: "stale_write" };            // runPhase2's internal CAS guard fired post-preflight
```

`applyStagedCore(tx: LockedShowTx<SyncPipelineTx>, args, deps?)` behavior, in order:

1. `await assertShowLockHeld(tx, args.driveFileId)` — **adoption assertion only; the core NEVER acquires** (§3.3 single-holder rule; every caller's holder is enumerated in the spec's lock matrix).
2. `validateReviewerChoices(items, choices)` → `invalid_request` (moved function, identical logic).
3. **Choice-semantics dispatch (mirrors the live `:1325-1339` validation→reject sequence):** `validation.choices.some((c) => c.action === "reject")` → return `{ outcome: "discarded_by_choice" }` BEFORE any mutation — no Phase 2, no audit, no floors (live contract: `tests/sync/applyStaged.test.ts:1118-1147` asserts `runPhase2` and `insertSyncAudit` are never called on reject). Reject is only valid against an EXISTING show — the live first-seen reject is `INVALID_REVIEWER_ACTION` (`applyStaged.ts:1328-1330`, test `:1150-1186`); the core returns `invalid_request: INVALID_REVIEWER_ACTION` when `args.show === null` and a reject choice is present, preserving that contract. `rename` / `independent` / `apply` take NO dispatch branch: the live contract applies the staged parse WHOLESALE for all three — the per-action difference is ONLY in `deriveAuthSideEffects` floors + the audit record (MI-13 `independent` test `tests/sync/applyStaged.test.ts:1189-1217`: applied with `revokeFloorForNames: ["Old Person"]`).
4. Equality stale-baseline preflight: `!sameTimestamp(args.show?.lastSeenModifiedTime ?? null, args.baseModifiedTime)` → `stale_baseline`. (For the legacy live caller this is a redundant second defense behind `applyStaged.ts:1296-1300`, which is kept verbatim; for Phase D it IS the gate that replaces the `<=` CAS predicate — spec §3.2 R21.)
5. `deriveAuthSideEffects(items, choices)` (moved function, identical logic).
6. `const applyTx = args.sourceScope === "wizard" ? withWizardScopedLivePartitionOps(tx) : tx` — wizard wrapper overrides `deleteLivePendingIngestion` to a no-op via `Object.assign(Object.create(tx), …)` (the `makeInlineOnboardingScanTx` precedent, `applyStaged.ts:1628`). Classification registry in Task 1.2.
7. `runPhase2(applyTx, { driveFileId, mode: "manual", fileMeta, parseResult, skipDiagramsWrite, snapshotAssetsForApply?, autoPublishFirstSeen?, firstSeenPublished?, verifyReelOnApply: false, …(mi11Items.length > 0 ? { mi11Items } : {}), …(notableItems !== undefined ? { notableItems } : {}), binding: { bindingToken: stagedModifiedTime, modifiedTime: stagedModifiedTime } })`. P2-F6 (`phase2.ts:205`) remains the structural guard against an MI-11 apply with no hold port.
8. `stale` → `stale_write`.
9. `bumpReviewerAuthFloors(tx, showId, revokeFloorForNames)` (moved default no-op, injectable).
10. `insertSyncAudit` with `parseResultSummary: { ...parseResultSummary(parseResult), source: args.auditSource }` and `appliedAt: args.appliedAt` (SQL gains `applied_at = coalesce($11::timestamptz, now())`).
11. Live-partition staged-row delete: `sourceScope === "live"` → `defaultDeleteLivePendingSync(tx, driveFileId, stagedId)`; `"wizard"` → no-op (the wizard row was already consumed by Phase B's `deleteApprovedPending`, `finalize/route.ts:452-468`).
12. Return `applied` (+ `roleFlagsNotice`/`snapshotRevisionId` passthrough).

**What stays in `applyStaged.ts` (live-only caller-level semantics, classified in Task 1.2):** all preflights/reverifies, `restoreDeleteAndIngest` (`restoreShowStatus`/`upsertLivePendingIngestion`), the reject branch at `:1327-1339` **verbatim** (the core's step-3 dispatch is then unreachable on the live path — kept as the shared contract the wizard callers depend on, and as a second defense), the **P2-F7 guard verbatim**, `applyAssetReviewEffects`, the first-published tail + admin-alert emissions, and the early baseline check at `:1296-1300`. The live mapping for `discarded_by_choice` (defensive, normally unreachable): `restoreShowStatus` + `deleteLivePendingSync` + `{ outcome: "discarded", variant: "try_again" }` — byte-equal to `:1331-1338`.

**Choice-semantics matrix (per invariant × action — every cell cites its live contract):**

| Invariant | Allowed actions (`allowedActions`, `applyStaged.ts:424-431`; UI parity `components/admin/StagedReviewCard.tsx:113-115`) | Action | Live behavior (contract source) | Phase D behavior (mirror) |
|---|---|---|---|---|
| MI-11 | `apply` (default arm `:430`) | `apply` | never reaches the legacy apply (P2-F7 throw `:1345-1354`); the hold path applies it via `mi11Items` → `writeMi11Holds` (cron wiring `runScheduledCronSync.ts:2410-2414`); floors push `crew_name` (`deriveAuthSideEffects:484-486`) | identical: `parsed.mi11Items` → core → `runPhase2` holds composition; floors identical (T1.5 sketch; parity test T1.6) |
| MI-12 | `rename` \| `reject` (`:426`) | `rename` | wholesale Phase-2 apply of the staged parse; floors push `removed_name, added_name` (`:487-489`) | identical via core (no dispatch branch) |
| MI-12 | | `reject` | discard: `restoreShowStatus` + `deleteLivePendingSync`, NO `runPhase2`, NO `insertSyncAudit`, outcome `discarded/try_again` (`:1327-1339`; test `tests/sync/applyStaged.test.ts:1118-1147`) | core returns `discarded_by_choice`; Phase D deletes the SHADOW (its staged-row analogue), applies nothing, writes NO audit, live row untouched; next cron re-stages for re-review via the unchanged watermark (the live `try_again` analogue) |
| MI-13 / MI-14 | `rename` \| `independent` (`:427-429`) | `rename` | wholesale apply; floors `removed_name, added_name` (`:490-491`); `rename_value` must equal `added_name` (`expectedRenameValue:433-438`, stray-value test `:1090-1116`) | identical via core |
| MI-13 / MI-14 | | `independent` | wholesale apply — SAME parse application as rename; difference is floors = `removed_name` ONLY (`:492`; test `:1189-1217`) + the audit's `derived_side_effects` record | identical via core (the matrix's load-bearing cell: independent ≠ a parse mutation; it is a floors/audit distinction) |
| MI-13-orphan-remove / MI-14-orphan-remove | `apply` (default arm `:430`) | `apply` | wholesale apply; floors `removed_name` (`:494-499`) | identical via core |
| asset-review invariants (`ASSET_REVIEW_INVARIANTS:417-422`) | `apply` (`:425`) | `apply` | wholesale apply with asset-review effects (live caller level) | wizard payload diagrams are already canonical (spec §3.4); items pass through as notable feed items only |
| reject on a first-seen row | — | `reject` | `INVALID_REVIEWER_ACTION` (no show to restore, `:1328-1330`; test `:1150-1186`) | unreachable at Phase B by construction (MI-12 requires prior crew → cannot fire first-seen); the core's `show === null` + reject → `invalid_request` pins the same contract |

**Lock adoption helper:** new export in `lib/sync/lockedShowTx.ts`:

```ts
export async function adoptShowLockHeld<T extends LockableSyncTx>(
  tx: T, driveFileId: string,
): Promise<LockedShowTx<T>> {
  const locked = tx as LockedShowTx<T>;
  await assertShowLockHeld(locked, driveFileId); // throws LockOwnershipAssertionError if not held
  return locked;
}
```

**Pipeline-tx factory:** new export in `lib/sync/runScheduledCronSync.ts`:

```ts
export function makeSyncPipelineTx(tx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }): SyncPipelineTx {
  return new PostgresPipelineTx(tx);
}
```

Both finalize routes' `defaultWithRowTx` callbacks gain a second argument `pipelineTx: SyncPipelineTx` built from the SAME raw postgres.js transaction handle that already acquired the per-row advisory lock — so the core runs on the holder's transaction, acquire-free.

## Meta-test inventory (declared per AGENTS.md writing-plans rule)

| Registry | Action (task) |
|---|---|
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | EXTEND — pin that `lib/sync/applyStagedCore.ts` contains zero `pg_advisory` acquisitions and exactly one `assertShowLockHeld`/`adoptShowLockHeld` adoption (Task 1.7). |
| NEW `tests/sync/_secondCopyApplyTripwire.test.ts` | Second-copy tripwire: walks `app/api/**` + `lib/**`; `insert into public.shows` / `update public.shows` / child snapshot-replacement SQL allowed ONLY inside per-`(file, symbol)` body ranges — no file-wide exemptions (Task 1.7). |
| NEW `tests/sync/_livePartitionClassificationContract.test.ts` | Pins the §3.2 live-vs-wizard classification of every live-partition lifecycle op reachable from the core (Task 1.2 registry, Task 1.7 walker). |
| `tests/auth/_metaInfraContract.test.ts` | **None applies** — F1 adds no Supabase-js call boundaries; the finalize routes and core run on postgres.js transaction handles (no `{data,error}` clients). Declared explicitly per invariant 9. |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | **None applies** — F1 adds no admin-alert codes (per-row codes reuse cataloged `STAGED_*` rows). |

## Advisory-lock holder topology (restated from spec §3.3 — pinned by Task 1.7)

| Surface | Holder | Core posture |
|---|---|---|
| Dashboard staged Apply | JS-side `withPostgresSyncPipelineLock` (`runScheduledCronSync.ts:1314`) | core invoked lock-already-held |
| Wizard finalize Phase B per-row tx | `pg_advisory_xact_lock` in `defaultWithRowTx` (`finalize/route.ts:114`) | core invoked lock-already-held |
| Wizard finalize-cas Phase D per-row apply | `pg_advisory_xact_lock` in `defaultWithRowTx` (`finalize-cas/route.ts:103`) | core invoked lock-already-held |

The core acquires NOTHING; `adoptShowLockHeld` only asserts.

---

### Task 1.1 — Extract `lib/sync/applyStagedCore.ts`; dashboard becomes a thin caller

**Files:**
- Create: `lib/sync/applyStagedCore.ts`
- Create: `tests/sync/applyStagedCore.test.ts`
- Modify: `lib/sync/applyStaged.ts`, `lib/sync/lockedShowTx.ts` (`adoptShowLockHeld`), `lib/sync/runScheduledCronSync.ts` (`makeSyncPipelineTx` export)
- Test (regression): `tests/sync/applyStaged.test.ts`, `tests/sync/applyStaged.authFloors.test.ts` (must stay green unmodified)

**Concrete failure modes caught:** (a) extraction changes dashboard Apply behavior (audit row shape, floors, live `pending_syncs` delete, stale handling) — caught by the untouched existing `applyStaged` suite plus the new audit-shape assertion; (b) the core acquires a lock instead of adopting one — caught by the spy-tx assertion that the ONLY lock-related SQL the core issues is the `pg_locks` ownership probe; (c) the core silently skips the staged-row delete or audit on the live path — caught by op-order assertions against the spy tx, scoped to the core call (not the surrounding route, anti-tautology).

- [ ] **Write failing test** `tests/sync/applyStagedCore.test.ts` (fake-tx style per `tests/sync/applyStaged.test.ts:32-120`; reuse its `parseResult()` fixture shape):

```ts
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStagedCore,
  MISSING_REVIEWER_CHOICE,
  type ApplyStagedCoreArgs,
} from "@/lib/sync/applyStagedCore";

function parseResult(crewNames: string[] = ["Ada", "Bo"]): ParseResult {
  return {
    show: {
      title: "Show", client_label: "Client", client_contact: null, template_version: "v4",
      venue: null,
      dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: ["2026-05-09"], travelOut: "2026-05-10" },
      schedule_phases: {}, event_details: {}, agenda_links: [], coi_status: null,
      po: "PO-1", proposal: null, invoice: null, invoice_notes: null,
    },
    crewMembers: crewNames.map((name) => ({
      name, email: `${name.toLowerCase()}@example.com`, phone: null, role: "A1",
      role_flags: [], date_restriction: { kind: "none" }, stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [], rooms: [{ kind: "ballroom", name: "Main", dimensions: null, floor: null,
      setup: null, set_time: null, show_time: null, strike_time: null, audio: null, video: null,
      lighting: null, scenic: null, power: null, digital_signage: null, other: null, notes: null }],
    transportation: null, contacts: [], pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [],
  } as unknown as ParseResult;
}

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "drive-core-1", name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-06-10T12:00:00.000Z", parents: ["folder-1"], headRevisionId: "h1",
  } as DriveListedFile;
}

type SpyTx = LockedShowTx<SyncPipelineTx> & { ops: string[]; sql: string[] };

function spyTx(): SpyTx {
  const tx = {
    ops: [] as string[],
    sql: [] as string[],
    async queryOne<T>(sql: string, _params: unknown[]) {
      tx.sql.push(sql.replace(/\s+/g, " ").trim());
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      throw new Error(`unexpected queryOne SQL: ${sql}`);
    },
    holdPort() {
      return { unsafe: async (q: string) => { tx.sql.push(q); return []; } };
    },
    async applyShowSnapshot() {
      tx.ops.push("applyShowSnapshot");
      return { outcome: "updated" as const, showId: "show-1", previousCrewNames: ["Ada"], previousCrewMembers: [] };
    },
    async deleteCrewMembersNotIn() { tx.ops.push("deleteCrewMembersNotIn"); },
    async upsertCrewMembers() { tx.ops.push("upsertCrewMembers"); },
    async provisionAddedCrewAuth(_id: string, names: string[]) { tx.ops.push(`provisionAddedCrewAuth:${names.join(",")}`); },
    async revokeRemovedCrewAuth() { tx.ops.push("revokeRemovedCrewAuth"); },
    async replaceHotelReservations() { tx.ops.push("replaceHotelReservations"); },
    async replaceRooms() { tx.ops.push("replaceRooms"); },
    async replaceTransportation() { tx.ops.push("replaceTransportation"); },
    async replaceContacts() { tx.ops.push("replaceContacts"); },
    async upsertShowsInternal() { tx.ops.push("upsertShowsInternal"); },
    async deleteLivePendingIngestion() { tx.ops.push("deleteLivePendingIngestion"); },
  } as unknown as SpyTx;
  return tx;
}

function coreArgs(tx: SpyTx, overrides: Partial<ApplyStagedCoreArgs> = {}): ApplyStagedCoreArgs {
  return {
    sourceScope: "live",
    driveFileId: "drive-core-1",
    show: { showId: "show-1", lastSeenModifiedTime: "2026-06-09T00:00:00.000Z", diagrams: null },
    parseResult: parseResult(),
    triggeredReviewItems: [],
    reviewerChoices: [],
    stagedId: "33333333-3333-4333-8333-333333333333",
    stagedModifiedTime: "2026-06-10T12:00:00.000Z",
    baseModifiedTime: "2026-06-09T00:00:00.000Z",
    appliedByEmail: "doug@fxav.com",
    appliedAt: null,
    auditSource: "staged_apply",
    fileMeta: fileMeta(),
    mi11Items: [],
    skipDiagramsWrite: false,
    ...overrides,
  };
}

describe("applyStagedCore", () => {
  test("live apply runs the full Phase-2 child set, audits with source+crewCount, deletes the live staged row", async () => {
    const tx = spyTx();
    const insertSyncAudit = vi.fn(async () => "audit-1");
    const deleteLivePendingSync = vi.fn(async () => {});
    const result = await applyStagedCore(tx, coreArgs(tx), { insertSyncAudit, deleteLivePendingSync });
    expect(result).toMatchObject({ outcome: "applied", showId: "show-1", syncAuditId: "audit-1" });
    // Child set derived from the ApplyParseResultTx contract, not hardcoded ops:
    for (const op of ["upsertCrewMembers", "replaceHotelReservations", "replaceRooms",
      "replaceTransportation", "replaceContacts", "upsertShowsInternal"]) {
      expect(tx.ops.some((o) => o.startsWith(op))).toBe(true);
    }
    // provisionAddedCrewAuth called with the ADDED names derived from the fixture
    // (previous=["Ada"], next fixture crew minus Ada):
    expect(tx.ops).toContain("provisionAddedCrewAuth:Bo");
    const auditRow = insertSyncAudit.mock.calls[0]![1] as Record<string, unknown>;
    expect(auditRow.parseResultSummary).toMatchObject({
      source: "staged_apply",
      crewCount: parseResult().crewMembers.length,
      roomCount: parseResult().rooms.length,
    });
    expect(auditRow.appliedAt).toBeNull();
    expect(deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-core-1", "33333333-3333-4333-8333-333333333333");
  });

  test("core never acquires a lock — only the pg_locks ownership probe", async () => {
    const tx = spyTx();
    await applyStagedCore(tx, coreArgs(tx), { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() });
    const lockSql = tx.sql.filter((s) => /pg_(try_)?advisory/i.test(s));
    expect(lockSql).toEqual([]);
    expect(tx.sql.some((s) => /pg_locks/i.test(s))).toBe(true);
  });

  test("stale baseline (live watermark moved past the reviewer's base) refuses BEFORE any mutation", async () => {
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, { baseModifiedTime: "2026-06-08T00:00:00.000Z" }), // show says 06-09 → mismatch
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() },
    );
    expect(result).toEqual({ outcome: "stale_baseline" });
    expect(tx.ops).toEqual([]); // nothing mutated
  });

  test("missing reviewer choice is refused with the exact existing code", async () => {
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        triggeredReviewItems: [{ id: "i1", invariant: "MI-7", section: "rooms" } as never],
        reviewerChoices: [],
      }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() },
    );
    expect(result).toEqual({ outcome: "invalid_request", code: MISSING_REVIEWER_CHOICE });
    expect(tx.ops).toEqual([]);
  });

  test("reject choice dispatches to discarded_by_choice BEFORE any mutation — no Phase 2, no audit, no floors", async () => {
    // Mirrors the live contract (applyStaged.ts:1327-1339; tests/sync/applyStaged.test.ts:1118-1147).
    const tx = spyTx();
    const insertSyncAudit = vi.fn(async () => null);
    const deleteLivePendingSync = vi.fn();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        triggeredReviewItems: [{ id: "mi12", invariant: "MI-12", removed_name: "Bob",
          added_name: "Robert", email: "bob@test.test" } as never],
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
      }),
      { insertSyncAudit, deleteLivePendingSync },
    );
    expect(result).toEqual({ outcome: "discarded_by_choice" });
    expect(tx.ops).toEqual([]);                          // runPhase2 never reached
    expect(insertSyncAudit).not.toHaveBeenCalled();      // live contract: no audit on reject
    expect(deleteLivePendingSync).not.toHaveBeenCalled(); // staged-row consumption is the CALLER's mapping
  });

  test("reject with no existing show is INVALID_REVIEWER_ACTION (live first-seen contract :1150-1186)", async () => {
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        show: null,
        baseModifiedTime: null,
        triggeredReviewItems: [{ id: "mi12", invariant: "MI-12", removed_name: "Bob",
          added_name: "Robert", email: "bob@test.test" } as never],
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
      }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() },
    );
    expect(result).toEqual({ outcome: "invalid_request", code: "INVALID_REVIEWER_ACTION" });
    expect(tx.ops).toEqual([]);
  });
});
```

- [ ] **Run to verify failure:** `pnpm vitest run tests/sync/applyStagedCore.test.ts` — expected failure: `Cannot find module '@/lib/sync/applyStagedCore'` (module does not exist yet).
- [ ] **Implementation — exact refactoring procedure (no improvisation):**
  1. `lib/sync/lockedShowTx.ts`: add the `adoptShowLockHeld` export exactly as in the Design section (after `assertShowLockHeld`, `:146`).
  2. `lib/sync/runScheduledCronSync.ts`: add `export function makeSyncPipelineTx(tx: PostgresTransaction): SyncPipelineTx { return new PostgresPipelineTx(tx); }` immediately after the `PostgresPipelineTx` class close (`:1294`).
  3. Create `lib/sync/applyStagedCore.ts`. **MOVE** (cut from `applyStaged.ts`, paste unchanged unless noted): `MISSING_REVIEWER_CHOICE`/`EXTRA_REVIEWER_CHOICE`/`DUPLICATE_REVIEWER_CHOICE`/`INVALID_REVIEWER_ACTION` consts (`applyStaged.ts:45-48`), `ReviewerChoice` (`:56-60`), `ShowForApply` (`:94-98`, now exported), `timestampMs`/`sameTimestamp` (`:359-374` — `applyStaged.ts` keeps `revisionTimesMatch`/`isAfter`/`isValidTimestamp` and imports `sameTimestamp` back), `normalizeTimestamptz` (`:407-411`, now exported), `uniqueSorted` (`:413-415`), `ASSET_REVIEW_INVARIANTS` (`:417-422`), `allowedActions` (`:424-431`), `expectedRenameValue` (`:433-438`), `validateReviewerChoices` (`:440-473`, now exported; its non-ok return type narrows to the core's `invalid_request` member — structurally identical objects), `deriveAuthSideEffects` (`:475-503`, now exported), `parseResultSummary` (`:505-512`, now exported), `defaultInsertSyncAudit` (`:874-905`), `defaultBumpReviewerAuthFloors` (`:907-915`), `defaultDeleteLivePendingSync` (`:806-821`).
  4. In the moved `defaultInsertSyncAudit`: add `applied_at` to the column list and `coalesce($11::timestamptz, now())` to VALUES; row type gains `appliedAt: string | null`; param array gains `row.appliedAt`. (`sync_audit.applied_at` exists with default `now()` — `internal_and_admin.sql:208` — so `null` preserves today's behavior byte-for-byte.)
  5. Implement `withWizardScopedLivePartitionOps(tx)` in the new module: `Object.assign(Object.create(tx), { async deleteLivePendingIngestion() { /* wizard no-op — live partition untouched (spec §3.2) */ } })` (precedent `applyStaged.ts:1628`). Export the Task-1.2 classification registry stub `LIVE_PARTITION_CLASSIFICATION` (filled in Task 1.2).
  6. Implement `applyStagedCore` per the Design section (steps 1–11). `deps` (all optional): `runPhase2`, `insertSyncAudit`, `bumpReviewerAuthFloors`, `deleteLivePendingSync` — defaulting to the moved defaults / `runPhase2` import.
  7. `lib/sync/applyStaged.ts`: import + **re-export** every moved symbol (`export { MISSING_REVIEWER_CHOICE, … } from "@/lib/sync/applyStagedCore"`) so the route/test import sites (`tests/sync/applyStaged.test.ts:12-27`, the staged-apply routes) are untouched. Rewire `applyStaged_unlocked`'s live branch: keep `:1284-1339` (reads, corrupt guards, stagedId check, baseline check `:1296-1300`, reverify dispatch, reject branch) and the P2-F7 guard `:1345-1354` **verbatim**; keep `applyAssetReviewEffects` + `snapshotAssetsForApply` + `autoPublishFirstSeen` construction (`:1356-1382`); then REPLACE `:1384-1416` (the `runPhase2` call through `deleteLivePendingSync`) with one `applyStagedCore(tx, { sourceScope: "live", driveFileId: pending.driveFileId, show, parseResult: assetAdjusted.parseResult, triggeredReviewItems: pending.triggeredReviewItems, reviewerChoices: args.reviewerChoices, stagedId: pending.stagedId, stagedModifiedTime: pending.stagedModifiedTime, baseModifiedTime: pending.baseModifiedTime, appliedByEmail: args.appliedByEmail, appliedAt: null, auditSource: "staged_apply", fileMeta: metadata, mi11Items: [], skipDiagramsWrite: assetAdjusted.skipDiagramsWrite, …(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}), …(autoPublishFirstSeen ? { autoPublishFirstSeen } : {}) }, { …(injectedDeps.runPhase2 ? { runPhase2: deps.runPhase2 } : {}), …(injectedDeps.insertSyncAudit ? wrap-to-core-shape : {}), …same for bumpReviewerAuthFloors/deleteLivePendingSync })` and map: `invalid_request` → return as-is; `discarded_by_choice` → `restoreShowStatus` + `deleteLivePendingSync` + `{ outcome: "discarded", variant: "try_again" }` (byte-equal to `:1331-1338`; unreachable in practice because the verbatim `:1327-1339` reject branch fires first — defensive second mapping); `stale_baseline` → `deleteLivePendingSync` + `{ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED }` (unreachable in practice behind `:1296-1300`; kept for parity); `stale_write` → `restoreDeleteAndIngest(…, STAGED_PARSE_SUPERSEDED, …)` + superseded (exact `:1398-1401` semantics); `applied` → build the existing `ApplyStagedResult` + the unchanged tail block `:1429-1456`. NOTE the dashboard does NOT pass `notableItems` (today's `:1384-1397` call passes none → no feed write; parity preserved — D-2 feed semantics for the dashboard staged path are out of F1 scope).
  8. Bridge dep types: `ApplyStagedDeps.insertSyncAudit`'s row type (`applyStaged.ts:292-306`) gains the optional `appliedAt?: string | null` field so injected fakes keep compiling; the core's call always provides it.
- [ ] **Run to pass:** `pnpm vitest run tests/sync/applyStagedCore.test.ts`
- [ ] **Regression gate (extraction-parity):** `pnpm vitest run tests/sync/applyStaged.test.ts tests/sync/applyStaged.authFloors.test.ts tests/sync/applyStaged.wizardDriveReverify.test.ts tests/sync/applyStagedReadCoercion.test.ts tests/sync/mi11GateActions.test.ts` — all green WITHOUT editing those files (any edit beyond the additive `appliedAt` fake-field is a parity break — stop and re-derive).
- [ ] **Run full suite:** `pnpm test` (catches import-graph fallout; `tests/sync/_metaInfraContract.test.ts` and `_partitionScopeContract.test.ts` source-grep `applyStaged.ts` — if the moved `defaultDeleteLivePendingSync` breaks the `_partitionScopeContract` "delete from public.pending_syncs carries wizard_session_id IS NULL" window check, EXTEND that test's file list to include `lib/sync/applyStagedCore.ts` in the same commit; the SQL itself is unchanged).
- [ ] **Commit:** `refactor(sync): extract shared staged-apply core from applyStaged (dashboard thin caller)`

---

### Task 1.2 — Source-scoped live-partition cleanup: the WHOLE class, with registry + coexistence regressions

**Files:**
- Modify: `lib/sync/applyStagedCore.ts` (fill `LIVE_PARTITION_CLASSIFICATION`)
- Create: `tests/sync/applyStagedCore.livePartition.test.ts`
- Create: `tests/sync/_applyStagedCoreTestkit.ts` (shared spy helpers)

**Concrete failure modes caught:** (a) a wizard finalize deletes the LIVE `pending_ingestions` row for the same `drive_file_id` (the `ApplyParseResultTx.deleteLivePendingIngestion` unconditional call, `applyParseResult.ts:131` → `runScheduledCronSync.ts:649-658`) — silently erasing an operator-visible live failure record; (b) a wizard finalize deletes the LIVE `pending_syncs` staged row (step 6L, `defaultDeleteLivePendingSync`) — destroying a dashboard reviewer's staged parse from a wizard action; (c) a wizard apply resolves live sync-problem suppressors (`resolveStaleSyncProblemAlerts_unlocked`). Unit-level scoping is pinned HERE (passes with this task's implementation — TDD invariant 1: no intentionally-red commits); the END-TO-END coexistence DB regression through the real finalize writers lands in Task 1.5, where the writers it exercises exist.

**rg class enumeration (plan-time deliverable — executed 2026-06-11; re-run during the task and reconcile):**

```
rg -n "pending_syncs|pending_ingestions|deferred_ingestions|admin_alerts" \
  lib/sync/applyStagedCore.ts lib/sync/applyParseResult.ts lib/sync/applyStaged.ts \
  lib/sync/phase2.ts lib/sync/runScheduledCronSync.ts
```

Classification of every live-partition lifecycle op on the apply surface:

| # | Op | Site | Reachable from core? | Class | Wizard behavior |
|---|---|---|---|---|---|
| 1 | `deleteLivePendingIngestion` | `ApplyParseResultTx` contract `applyParseResult.ts:41`, called unconditionally `:131`; impl `runScheduledCronSync.ts:649-658` (`wizard_session_id is null`) | YES (via `runPhase2` → `applyParseResult`) | live-only | no-op via `withWizardScopedLivePartitionOps` |
| 2 | live `pending_syncs` DELETE (6L) | `defaultDeleteLivePendingSync` (moved to core in T1.1; `wizard_session_id is null`) | YES (core step 10) | live-only | skipped (`sourceScope === "wizard"`) |
| 3 | `resolveStaleSyncProblemAlerts_unlocked` | `runScheduledCronSync.ts:139-157`; call sites `:1885/:1961/:2319/:2443` (cron path only) | NO — not invoked by `applyStaged` or the core | live-only (cron caller level) | pinned: core must NOT call it (meta-test, T1.7) |
| 4 | `restoreShowStatus` / `upsertLivePendingIngestion` | `restoreDeleteAndIngest`, `applyStaged.ts:935-967` (live failure restoration) | NO — stays in the legacy live caller | live-only (caller level) | wizard failure paths use `recordWizardApplyHardFail` (`:969-991`) / Phase B `demotePending` |
| 5 | wizard `pending_syncs` DELETE | `deleteApprovedPending` `finalize/route.ts:452-468` (wizard-scoped predicate) | NO — Phase B route level | wizard-only | unchanged; this is WHY core step 10 is a wizard no-op |
| 6 | wizard `pending_ingestions` upsert | `defaultUpsertWizardPendingIngestion` `applyStaged.ts:693-735` | NO — wizard approve branch | wizard-only | unchanged (retry/defer routes own wizard rows; never the apply core) |
| 7 | `admin_alerts` writers on apply | `applyStaged()` outer live branch `:1835-1857`; first-published tail `:1432-1456` | NO — caller level | live-only (caller level) | wizard callers never invoke them |

`deferred_ingestions`: zero statements on the apply surface (the only wizard-side writer is the retry route; live reader is `readLiveDeferral`, `perFileProcessor.ts:103-114`) — classified N/A for the core, asserted by the registry walker (T1.7).

- [ ] **Write failing test** `tests/sync/applyStagedCore.livePartition.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import {
  applyStagedCore,
  LIVE_PARTITION_CLASSIFICATION,
} from "@/lib/sync/applyStagedCore";
// reuse spyTx/coreArgs/parseResult helpers — extract them to tests/sync/_applyStagedCoreTestkit.ts
import { spyTx, coreArgs } from "./_applyStagedCoreTestkit";

describe("applyStagedCore live-partition source scoping", () => {
  test("wizard sourceScope never touches the live partition: no deleteLivePendingIngestion, no live pending_syncs delete", async () => {
    const tx = spyTx();
    const deleteLivePendingSync = vi.fn();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, { sourceScope: "wizard", auditSource: "onboarding_finalize_cas" }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync },
    );
    expect(result.outcome).toBe("applied");
    expect(tx.ops).not.toContain("deleteLivePendingIngestion");      // class op #1
    expect(deleteLivePendingSync).not.toHaveBeenCalled();            // class op #2
  });

  test("live sourceScope keeps current behavior: both live ops fire", async () => {
    const tx = spyTx();
    const deleteLivePendingSync = vi.fn();
    await applyStagedCore(tx, coreArgs(tx, { sourceScope: "live" }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync });
    expect(tx.ops).toContain("deleteLivePendingIngestion");
    expect(deleteLivePendingSync).toHaveBeenCalledTimes(1);
  });

  test("classification registry covers exactly the enumerated class (no orphan ops)", () => {
    const keys = LIVE_PARTITION_CLASSIFICATION.map((row) => row.op).sort();
    expect(keys).toEqual([
      "adminAlertWriters", "deleteApprovedPending", "deleteLivePendingIngestion",
      "deleteLivePendingSync", "resolveStaleSyncProblemAlerts", "restoreDeleteAndIngest",
      "upsertWizardPendingIngestion",
    ]);
    for (const row of LIVE_PARTITION_CLASSIFICATION) {
      expect(["live-only", "wizard-only"]).toContain(row.class);
      expect(row.wizardBehavior.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Run to verify failure:** `pnpm vitest run tests/sync/applyStagedCore.livePartition.test.ts` — expected failure: wizard scope still calls `deleteLivePendingIngestion` (op recorded by spy) and `LIVE_PARTITION_CLASSIFICATION` is an empty stub.
- [ ] **Implementation:** in `applyStagedCore.ts` (a) wire `withWizardScopedLivePartitionOps` into core step 5 and gate core step 10 on `sourceScope === "live"` (if not already done structurally in T1.1, this is where it becomes test-pinned); (b) fill `LIVE_PARTITION_CLASSIFICATION` with the 7-row table above as `export const LIVE_PARTITION_CLASSIFICATION: ReadonlyArray<{ op: string; site: string; class: "live-only" | "wizard-only"; wizardBehavior: string }>` — the table IS the registry the T1.7 meta-test walks.
- [ ] **Run to pass:** `pnpm vitest run tests/sync/applyStagedCore.livePartition.test.ts` (and re-run `tests/sync/applyStagedCore.test.ts` — the testkit extraction must not break Task 1.1's suite)
- [ ] **Commit:** `feat(sync): source-scope live-partition ops in apply core (classification registry + unit pins)`

---

### Task 1.3 — Phase B first-seen branch → full apply (children + `shows_internal` + auth contract), `published=false`, `created_show_id` provenance, real audit provenance

**Phase B lock order (plan R25-1 — same inversion R16 fixed for Phase D, pre-existing in live code):** `handleOnboardingFinalize` currently calls `readActiveSession()` (app_settings `FOR UPDATE`, `finalize/route.ts:171-181`) BEFORE `tryFinalizeLock()` (`:626-633`), while `cleanupAbandonedFinalize` takes `finalize:` then `app_settings FOR UPDATE` (`sessionLifecycle.ts:328-339`) — an AB-BA deadlock under admin cleanup/finalize overlap. This task ALSO reorders Phase B to the global total order: discover the candidate session WITHOUT a row lock → acquire `finalize:<session>` → `SELECT … FOR UPDATE` re-check of the active session → per-row processing. Required regressions: (a) real-DB overlap `handleOnboardingFinalize` vs `cleanupAbandonedFinalize` for the same session → both settle, no SQLSTATE 40P01, one winner; (b) structural lock-order test pinning finalize-before-app_settings for BOTH finalize routes (extend the advisory-lock topology test to cover app_settings row-lock ordering, not just show-lock holders). Concrete failure mode: cleanup clicked while a finalize batch is mid-flight deadlocks both, stranding the wizard at the exact moment the operator is trying to recover it.


**Files:**
- Create: `supabase/migrations/20260611000000_onboarding_manifest_created_show_id.sql`
- Modify: `app/api/admin/onboarding/finalize/route.ts`
- Modify: `lib/sync/phase2.ts` + `lib/sync/runScheduledCronSync.ts` (`firstSeenPublished` threading)
- Create: `tests/onboarding/finalizeFirstSeenFullApply.db.test.ts`
- Modify: `tests/onboarding/finalize.test.ts` (fake-tx rows gain the new SELECT columns)
- Modify: `supabase/__generated__/schema-manifest.json` (regen)

**Concrete failure modes caught:** (a) THE origin incident — first-seen finalize persists only `shows` columns, 0 crew / 0 rooms / empty `shows_internal` with `last_sync_status='ok'`; (b) the wizard interim row becomes crew-visible early (`published` defaults `true` through the shared insert) — spec §3.1 flag lifecycle; (c) audit provenance stubs — `triggered_review_items='[]'`, `applied_at` = finalize-click time, actor ≠ approving admin (spec §3.1 R8-1); (d) F4's data-loss class — no `created_show_id` provenance means the reap must fall back to the `published=false` proxy; (e) **provenance-race orphan (defense-in-depth)** — if a wizard-session supersession ever committed between the core apply and the provenance UPDATE, the UPDATE's active-session EXISTS predicate would match 0 rows; without a row-count check the per-row transaction would still COMMIT an unpublished show with NO `created_show_id` recorded, and `deleteApprovedPending` would consume the staging row — a permanent invisible orphan: the F4 reap could never identify the show as session-created, Phase D's narrowed flip would never publish it, and the operator would have no pending row left to re-apply. TODAY this interleaving is unreachable: `readActiveSession` holds `SELECT … FOR UPDATE` on `app_settings` (`finalize/route.ts:171-181`) for the whole outer batch, so a concurrent flip blocks until finalize commits. The returning-check guards future lock refactors; the lock-topology DB test pins the serialization that currently makes the race moot.

- [ ] **Write failing test** `tests/onboarding/finalizeFirstSeenFullApply.db.test.ts` (real DB; harness per `onboardingFinalizePublishDb.test.ts` — real `handleOnboardingFinalize` with default `withTx`/`withRowTx`, injected `requireAdminIdentity` (finalizing admin `finalizer@fxav.com`) and `fetchDriveFileMetadata` pinned to the staged instant; seed via the REAL wizard-staging writer so the parse_result jsonb shape is production-true). **Phase-wide DB-connection convention (applies to EVERY `*.db.test.ts` in this phase):** connect via `LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"` — `TEST_DATABASE_URL` is the VALIDATION project in this repo and is reserved strictly for the labeled validation-apply close-out steps. Because the routes' `databaseUrl()` prefers `TEST_DATABASE_URL` (`finalize/route.ts:73-80`, `finalize-cas/route.ts:66-73`), each DB test's setup MUST pin the env for its process — `vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL)` AND `vi.stubEnv("DATABASE_URL", LOCAL_URL)` (plan R19-1: the openers fall back `TEST_DATABASE_URL ?? DATABASE_URL`, so deleting/stubbing only one leaves the other live) — so the real handlers under test connect to the LOCAL loopback, never validation; gate/skip on local reachability and assert the resolved opener host is `127.0.0.1`/`localhost` before seeding:

```ts
// Fixture: PARSE_RESULT with 2 crewMembers (Ada A1, Bo TD), 2 rooms, 1 hotelReservation,
// 1 transportation, 1 contact, po:"PO-77", warnings:[{severity:"warn",code:"W1",message:"w"}],
// raw_unrecognized:[{sheet:"Crew",row:9}]. ALL expectations below are derived from this
// object (crew/rooms/etc. counts + field values), never hardcoded numerals.
// Approval seeding: wizard_approved=true, wizard_approved_by_email='approver@fxav.com',
// wizard_approved_at = APPROVED_AT ('2026-06-10T09:15:00.000Z'), reviewer choices [],
// triggered_review_items = [] (clean first-seen).

test("Phase B first-seen finalize persists the FULL parse: children + shows_internal, published=false, provenance + audit", async () => {
  const response = await handleOnboardingFinalize(request(), deps);
  expect(((await response.json()) as { per_row: Array<{ code: string }> }).per_row[0]!.code).toBe("OK");

  const show = one(await sql`select id, published, last_seen_modified_time, last_sync_status
                              from public.shows where drive_file_id = ${DRIVE_FILE_ID}`);
  expect(show.published).toBe(false);                       // interim invisibility preserved
  expect(show.last_sync_status).toBe("ok");

  // Children equal the staged parse (derived from the fixture object):
  const crew = await sql`select name, email, role from public.crew_members where show_id = ${show.id} order by name`;
  expect(crew.map((c) => c.name)).toEqual(PARSE_RESULT.crewMembers.map((m) => m.name).sort());
  expect(crew.map((c) => c.email)).toEqual(
    PARSE_RESULT.crewMembers.map((m) => m.email!.toLowerCase()).sort()); // canonicalized boundary
  expect((await sql`select 1 from public.rooms where show_id = ${show.id}`).length)
    .toBe(PARSE_RESULT.rooms.length);
  expect((await sql`select 1 from public.hotel_reservations where show_id = ${show.id}`).length)
    .toBe(PARSE_RESULT.hotelReservations.length);
  expect((await sql`select 1 from public.transportation where show_id = ${show.id}`).length)
    .toBe(PARSE_RESULT.transportation ? 1 : 0);
  expect((await sql`select 1 from public.contacts where show_id = ${show.id}`).length)
    .toBe(PARSE_RESULT.contacts.length);
  const internal = one(await sql`select financials, parse_warnings, raw_unrecognized
                                  from public.shows_internal where show_id = ${show.id}`);
  expect(internal.financials).toMatchObject({ po: PARSE_RESULT.show.po });
  expect(internal.parse_warnings).toEqual(PARSE_RESULT.warnings);     // finally persisted (§3.1)
  expect(internal.raw_unrecognized).toEqual(PARSE_RESULT.raw_unrecognized);

  // created_show_id provenance recorded in the SAME per-row transaction:
  const manifest = one(await sql`select created_show_id from public.onboarding_scan_manifest
                                  where wizard_session_id = ${SESSION} and drive_file_id = ${DRIVE_FILE_ID}`);
  expect(manifest.created_show_id).toBe(show.id);

  // Audit provenance (R8-1): actor = APPROVING admin, applied_at = Apply-click instant,
  // real items/choices/derived, shared summary shape + source:
  const audit = one(await sql`select applied_by, applied_at, triggered_review_items,
                                     reviewer_choices, derived_side_effects, parse_result_summary,
                                     staged_modified_time
                                from public.sync_audit where drive_file_id = ${DRIVE_FILE_ID}`);
  expect(audit.applied_by).toBe("approver@fxav.com");                 // NOT finalizer@fxav.com
  expect(new Date(audit.applied_at).toISOString()).toBe(APPROVED_AT); // NOT now()
  expect(audit.triggered_review_items).toEqual([]);                   // real (empty) array, from the row
  expect(audit.derived_side_effects).toEqual({ revokeFloorForNames: [] });
  expect(audit.parse_result_summary).toMatchObject({
    source: "onboarding_finalize",
    crewCount: PARSE_RESULT.crewMembers.length,                       // F2 Arm B marker
    roomCount: PARSE_RESULT.rooms.length,
  });
});

test("pending_syncs row is consumed and the wizard row never touched the live partition", async () => {
  expect((await sql`select 1 from public.pending_syncs where drive_file_id = ${DRIVE_FILE_ID}`).length).toBe(0);
});

test("lock-topology proof: the app_settings FOR UPDATE serializes supersession against the Phase B loop", async () => {
  // The live topology makes the in-loop provenance race UNREACHABLE: handleOnboardingFinalize's
  // readActiveSession takes SELECT ... FOR UPDATE on app_settings (finalize/route.ts:171-181) and
  // the outer withTx holds that row lock for the WHOLE batch — so a concurrent supersession
  // (scan/cleanup flipping pending_wizard_session_id) BLOCKS until finalize commits. This test
  // proves the serialization rather than simulating an impossible interleaving:
  //   1. Start handleOnboardingFinalize with a withRowTx wrapper that delays 300ms inside the
  //      first per-row apply (the outer app_settings row lock is held throughout).
  //   2. While it is in flight, fire on a SIDE connection (no transaction reuse):
  //        sideFlip = sideSql`update public.app_settings
  //                              set pending_wizard_session_id = ${OTHER_SESSION}::uuid
  //                            where id = 'default'`;
  //   3. Record completion order with timestamps.
  const order: string[] = [];
  const finalize = handleOnboardingFinalize(request(), depsWithSlowFirstRow)
    .then((r) => { order.push("finalize"); return r; });
  await delay(50); // finalize is inside the batch, holding the app_settings row lock
  const flip = sideFlip().then(() => { order.push("flip"); });
  await Promise.all([finalize, flip]);
  expect(order).toEqual(["finalize", "flip"]);   // the flip BLOCKED until finalize committed
  // And the finalize batch completed normally — provenance recorded, nothing demoted:
  expect(one(await sql`select created_show_id from public.onboarding_scan_manifest
                        where drive_file_id = ${DRIVE_FILE_ID}`).created_show_id).not.toBeNull();
});
```

  Plus a **unit/fake-tx defense-in-depth test** appended to `tests/onboarding/finalize.test.ts` (fake harness, no real lock): seed the fake DB so the provenance UPDATE returns 0 rows (fake reports no `recorded` row — simulating a future refactor that drops the FOR UPDATE); assert `processApprovedRow` THROWS `FirstSeenProvenanceRaceError` BEFORE any `deleteApprovedPending` query is issued (spy op-order), and that the per-row loop's catch demotes the row (`demotePending` called with `WIZARD_SESSION_SUPERSEDED`) and returns the typed `PerRowResult`. **Documented contract:** the live `readActiveSession` FOR UPDATE makes this race unreachable TODAY; the returning-check + typed rollback error is defense-in-depth protecting against future lock refactors (e.g. weakening the outer FOR UPDATE for batch concurrency) — the unit test pins the guard, the DB test pins the lock topology that currently makes it moot.

- [ ] **Run to verify failure:** `pnpm vitest run tests/onboarding/finalizeFirstSeenFullApply.db.test.ts tests/onboarding/finalize.test.ts` — expected failure: crew/rooms/internal selects return 0 rows (negative regression against the live bespoke INSERT — testing-spine item 2), `created_show_id` column does not exist (SQL error), `applied_by` = finalizer; the lock-topology test fails on the `created_show_id` assertion (column/UPDATE absent); the fake-tx test fails because `FirstSeenProvenanceRaceError` does not exist yet.
- [ ] **Implementation:**
  1. **Migration** `supabase/migrations/20260611000000_onboarding_manifest_created_show_id.sql`:
     ```sql
     alter table public.onboarding_scan_manifest
       add column if not exists created_show_id uuid references public.shows(id) on delete set null;
     ```
     Apply locally — **NEVER via `TEST_DATABASE_URL`, which is the VALIDATION project in this repo** (validation receives this migration only at the labeled close-out step below): `psql "${LOCAL_TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" -v ON_ERROR_STOP=1 -f supabase/migrations/20260611000000_onboarding_manifest_created_show_id.sql` (the F2 local-loopback convention; guard: confirm the resolved host is `127.0.0.1`/`localhost` before running).
  2. **`firstSeenPublished` threading:** `Phase2Args` (`phase2.ts:58-89`) and `Phase2Tx.applyShowSnapshot` args (`:33-54`) gain `firstSeenPublished?: false`; `runPhase2` forwards it in the `applyShowSnapshot` call (`:253-263`). `PostgresPipelineTx.applyShowSnapshot` first-seen arm (`runScheduledCronSync.ts:1074-1097`): when `args.firstSeenPublished === false`, use an INSERT variant adding the `published` column with literal `false`; when absent, the existing SQL stays **byte-identical** (cron/dashboard untouched — flag lifecycle: storage `shows.published`; writers = wizard Phase B (`false`) + DDL default (`true`); readers = crew-page gating + Phase D flip; no zombie flag).
  3. **`selectApprovedRows`** (`finalize/route.ts:234-253`): add `wizard_approved_at, triggered_review_items, base_modified_time` to the SELECT; `PendingFinalizeRow` (`:46-54`) gains `wizard_approved_at: string | Date | null`, `triggered_review_items: unknown`, `base_modified_time: string | Date | null`.
  4. **`processApprovedRow` first-seen branch** (`:597-606`): parse items via `parseTriggeredReviewItems(row.triggered_review_items)` (`lib/staging/triggeredReviewItems.ts` — parseable by construction for approved rows per `applyStaged.ts:1229-1231`; on `!ok` THROW `new Error("approved row has corrupt triggered_review_items")` → the route's typed-500 wrapper). Then replace the `applyFirstSeenDraft` + `insertFinalizeAudit` pair with:
     ```ts
     const pipelineTx = input.pipelineTx;                       // new withRowTx 2nd arg (step 6)
     const lockedTx = await adoptShowLockHeld(pipelineTx, row.drive_file_id);
     const core = await applyStagedCore(lockedTx, {
       sourceScope: "wizard",
       driveFileId: row.drive_file_id,
       show: null,                                              // first-seen: gated by !showExists above
       parseResult: coercedRow.parse_result,
       triggeredReviewItems: items,
       reviewerChoices: coercedRow.wizard_reviewer_choices as ReviewerChoice[],
       stagedId: row.staged_id,
       stagedModifiedTime: stagedModifiedTimeIso,               // normalizeTimestamptz(row.staged_modified_time)
       baseModifiedTime: null,                                  // no live row → equality trivially holds
       appliedByEmail: requireApprovedByEmail(coercedRow),      // approving admin
       appliedAt: wizardApprovedAtIso,                          // normalizeTimestamptz(row.wizard_approved_at)
       auditSource: "onboarding_finalize",
       fileMeta: metadata,
       mi11Items: [],                                           // first-seen: no prior crew → MI-11 impossible
       // notableItems intentionally ABSENT: first-seen writes NO feed rows (spec §3.1 last bullet)
       skipDiagramsWrite: false,                                // payload diagrams already canonical (spec §3.4)
       firstSeenPublished: false,
     });
     ```
     Map `stale_write` → the existing demote machinery with code `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`; treat `invalid_request` and `stale_baseline` as corrupt-by-construction throws (approved rows passed `validateReviewerChoices` at approval time, `applyStaged.ts:1242-1243`; first-seen rows have no live baseline). On `applied`: record provenance in the SAME per-row tx, **`returning`-checked** —
     ```sql
     update public.onboarding_scan_manifest
        set created_show_id = $3::uuid
      where drive_file_id = $1 and wizard_session_id = $2::uuid
        and exists (select 1 from public.app_settings
                     where id = 'default' and pending_wizard_session_id = $2::uuid)
     returning true as recorded
     ```
     0 rows returned → `throw new FirstSeenProvenanceRaceError(row.drive_file_id, wizardSessionId)` (new typed error class in `finalize/route.ts`, exported) **BEFORE `deleteApprovedPending` runs** — the throw aborts the per-row transaction, so the just-applied show/children/audit roll back and the `pending_syncs` row survives untouched. Only after `recorded === true`: `deleteApprovedPending` (unchanged). **Per-row abort follow-up (the existing demote contract):** the per-row loop in `handleOnboardingFinalize` (`finalize/route.ts:679-689`) wraps the `withRowTx` call in try/catch for `FirstSeenProvenanceRaceError`; on catch it runs `demotePending(tx, wizardSessionId, driveFileId, WIZARD_SESSION_SUPERSEDED)` in a FRESH `withRowTx` (re-acquiring the per-show lock; `last_finalize_failure_code` is free-text — `internal_and_admin.sql` CHECKs constrain only the approval-payload shape, migration `20260518010444` — and `WIZARD_SESSION_SUPERSEDED` is already cataloged, `lib/messages/catalog.ts:133`) and pushes the typed `PerRowResult` `{ code: WIZARD_SESSION_SUPERSEDED, re_apply_url }` (widen the `PerRowResult` failure-code union + `demotePending`'s code parameter union by `typeof WIZARD_SESSION_SUPERSEDED`). The slug path is preserved automatically: `applyShowSnapshot`'s first-seen arm IS `insertFirstSeenShowWithSlugRetry` (`runScheduledCronSync.ts:1074`).
  5. **DELETE** `applyFirstSeenDraft` (`:324-373`) and `insertFinalizeAudit` (`:375-408`) — the core writes the audit. Remove the now-unused `insertFirstSeenShowWithSlugRetry`/`deriveSlug` imports.
  6. **`withRowTx` plumbing:** `FinalizeRouteDeps.withRowTx` callback signature becomes `(tx: FinalizeRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>`; `defaultWithRowTx` (`:104-120`) builds `makeSyncPipelineTx(rawTx)` from the SAME raw transaction after taking the lock. Update `tests/onboarding/finalize.test.ts` fakes: `withRowTx: async (_id, fn) => fn(db, fakePipelineTx)` where `fakePipelineTx` is a minimal spy implementing the methods the core touches (the existing fake-DB tests assert routing/demote behavior, not apply internals — the apply internals are covered by the DB test above).
  7. Regenerate the schema manifest: `pnpm gen:schema-manifest` and commit `supabase/__generated__/schema-manifest.json` in this commit (validation-schema-parity Layer 1).
- [ ] **Run to pass:** `pnpm vitest run tests/onboarding/finalizeFirstSeenFullApply.db.test.ts tests/onboarding/finalize.test.ts tests/onboarding/onboardingFinalizePublishDb.test.ts` — NOTE `onboardingFinalizePublishDb.test.ts` asserts publish-after-Phase-D for a first-seen flow; if it asserted `published=true` straight after Phase B it must NOT have (Phase B has always written `published=false`, `finalize/route.ts:345`); reconcile only the columns the new SELECT adds.
- [ ] **Validation project apply (post-migration checklist, same PR):** `supabase db query --linked "$(cat supabase/migrations/20260611000000_onboarding_manifest_created_show_id.sql)"` then `supabase db query --linked "notify pgrst, 'reload schema';"`.
- [ ] **Commit:** `feat(onboarding): Phase B first-seen finalize runs full Phase-2 apply with provenance + real audit`

---

### Task 1.4 — Phase B shadow payload extension + typed fail-closed payload parser for Phase D

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (`stageExistingShowShadow`)
- Create: `lib/onboarding/shadowPayload.ts`
- Create: `tests/onboarding/shadowPayload.test.ts`
- Modify: `tests/onboarding/finalize.test.ts` (payload-shape assertion)

**Concrete failure modes caught:** (a) Phase B deletes the `pending_syncs` row (`deleteApprovedPending`) so `triggered_review_items` and `base_modified_time` no longer exist at Phase D — choice validation, MI-11 detection, and `deriveAuthSideEffects` would run against nothing (spec §3.2 R1-1/R20-1); (b) fail-OPEN on a corrupt/missing items key: coercing to `[]` would let an MI-11 email change apply with no hold and no revocation floor (spec §3.2 R2-1); (c) `applied_at_intent` stamped at Phase-B staging time instead of the Apply click (R8-1).

- [ ] **Write failing test** `tests/onboarding/shadowPayload.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";

const BASE = "2026-06-09T00:00:00.000Z";
const STAGED = "2026-06-10T12:00:00.000Z";
const MI11_ITEM = { id: "i-mi11", invariant: "MI-11", crew_name: "Ada",
  prior_email: "ada@old.com", new_email: "ada@new.com" };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    parse_result: { show: { title: "T" } },     // shape-checked by asParseResult at the caller
    staged_modified_time: STAGED,
    staged_id: "44444444-4444-4444-8444-444444444444",
    reviewer_choices: [{ item_id: "i-mi11", action: "apply" }],
    triggered_review_items: [MI11_ITEM],
    base_modified_time: BASE,
    ...overrides,
  };
}

describe("parseShadowPayloadForApply (fail-closed identity gate)", () => {
  test("complete payload parses: items, base, mi11 extraction", () => {
    const parsed = parseShadowPayloadForApply(payload());
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.triggeredReviewItems).toHaveLength(1);
    expect(parsed.mi11Items.map((i) => i.crew_name)).toEqual(["Ada"]);
    expect(parsed.baseModifiedTime).toBe(BASE);
  });

  test("MISSING triggered_review_items key is REFUSED, never coerced to [] (an MI-11 would apply ungated)", () => {
    const { triggered_review_items: _omit, ...rest } = payload();
    const parsed = parseShadowPayloadForApply(rest);
    expect(parsed).toEqual({ ok: false, code: "STAGED_REVIEW_ITEMS_CORRUPT" });
  });

  test("corrupt items value (object, double-encoded garbage) is REFUSED via parseTriggeredReviewItems", () => {
    const parsed = parseShadowPayloadForApply(payload({ triggered_review_items: { not: "an array" } }));
    expect(parsed).toEqual({ ok: false, code: "STAGED_REVIEW_ITEMS_CORRUPT" });
  });

  test("missing base_modified_time is REFUSED as outdated (cannot prove baseline currency)", () => {
    const { base_modified_time: _omit, ...rest } = payload();
    const parsed = parseShadowPayloadForApply(rest);
    expect(parsed).toEqual({ ok: false, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" });
  });

  test("MISSING/corrupt parse_result is REFUSED, never consumed-as-OK (the legacy branch's silent-success bug)", () => {
    // Concrete failure mode: the legacy applyShadow consumed a parse_result-less shadow
    // (deleteAppliedShadowRow + OK) — the damaged shadow DISAPPEARS during finalize-cas,
    // leaving stale live data with no retry surface and a success report.
    const { parse_result: _omit, ...rest } = payload();
    expect(parseShadowPayloadForApply(rest)).toEqual({ ok: false, code: "STAGED_PARSE_RESULT_CORRUPT" });
    expect(parseShadowPayloadForApply(payload({ parse_result: "not-decodable-{{{" })))
      .toEqual({ ok: false, code: "STAGED_PARSE_RESULT_CORRUPT" });
  });

  test("missing staged_id or staged_modified_time is REFUSED (audit row + holds binding require both)", () => {
    const { staged_id: _a, ...noId } = payload();
    expect(parseShadowPayloadForApply(noId)).toEqual({ ok: false, code: "STAGED_PARSE_RESULT_CORRUPT" });
    const { staged_modified_time: _b, ...noStaged } = payload();
    expect(parseShadowPayloadForApply(noStaged)).toEqual({ ok: false, code: "STAGED_PARSE_RESULT_CORRUPT" });
  });
});
```

- [ ] **Run to verify failure:** `pnpm vitest run tests/onboarding/shadowPayload.test.ts` — expected: module not found.
- [ ] **Implementation:**
  1. `lib/onboarding/shadowPayload.ts`: `parseShadowPayloadForApply(payload: unknown) — `unknown`, NOT `Record<string, unknown>` (plan R22-2): `shows_pending_changes.payload` is unconstrained jsonb beyond NOT NULL, so top-level JSON null / arrays / scalars are representable; the parser starts with an explicit non-null plain-object guard and returns the typed corrupt-payload result (never throws while probing fields). Required unit cases: top-level `null`, string, number, boolean, and array payloads each yield the typed corrupt result (`STAGED_PARSE_RESULT_CORRUPT` posture), not an exception — concrete failure mode: one corrupt shadow turning the whole finalize into an uncaught 500 instead of retained-row per-row recovery` → `{ ok: true; parseResult: ParseResult; stagedId: string; stagedModifiedTime: string; triggeredReviewItems: TriggeredReviewItem[]; mi11Items: Mi11Item[]; reviewerChoices: ReviewerChoice[]; baseModifiedTime: string | null /* ISO or null only for explicit jsonb null */ } | { ok: false; code: "STAGED_REVIEW_ITEMS_CORRUPT" | "STAGED_PARSE_RESULT_CORRUPT" | "STAGED_PARSE_OUTDATED_AT_PHASE_D" }`. Rules: `parse_result` key ABSENT/null → refuse `STAGED_PARSE_RESULT_CORRUPT` (NEVER consume-and-OK); present → `asParseResult` in try/catch, `JsonbCoercionError` → refuse `STAGED_PARSE_RESULT_CORRUPT`; `staged_id` ABSENT/non-string or `staged_modified_time` ABSENT/unparseable → refuse `STAGED_PARSE_RESULT_CORRUPT` (the apply core requires both for the audit row and the holds binding); `triggered_review_items` key ABSENT → refuse `STAGED_REVIEW_ITEMS_CORRUPT`; present → `parseTriggeredReviewItems` (`lib/staging/triggeredReviewItems.ts`), `!ok` → refuse; `mi11Items = items.filter((i) => i.invariant === "MI-11")`; `base_modified_time` key ABSENT → refuse `STAGED_PARSE_OUTDATED_AT_PHASE_D` (a `null` value is legal — show had a null watermark at staging); `reviewer_choices` via `coerceJsonbArray`. All three refusal codes are already §12.4-cataloged (`catalog.ts:1252`, `:1265`, `:1910`) — no three-lockstep change.
  2. `stageExistingShowShadow` (`finalize/route.ts:410-450`): payload `jsonb_build_object` gains `'triggered_review_items', $8::jsonb` and `'base_modified_time', $9::timestamptz` (both copied from the pending row BEFORE `deleteApprovedPending` runs — they come from the Task-1.3-widened `selectApprovedRows`); `applied_at_intent` changes from `now()` to `$10::timestamptz` = `wizard_approved_at` (R8-1: `applied_at_intent` snapshots the Apply click).
  3. Extend the Phase-B fake-DB test in `tests/onboarding/finalize.test.ts`: the existing-show path now asserts the recorded shadow payload (spy capture) contains `triggered_review_items` (deep-equal to the seeded row's items) and `base_modified_time`, and that `applied_at_intent` equals the seeded `wizard_approved_at` — NOT a `now()`-window assertion (anti-tautology: compare to the fixture instant).
- [ ] **Run to pass:** `pnpm vitest run tests/onboarding/shadowPayload.test.ts tests/onboarding/finalize.test.ts`
- [ ] **Commit:** `feat(onboarding): shadow payload carries triggered_review_items + base_modified_time; typed fail-closed parser`

---

### Task 1.5 — Phase D `applyShadow` → shared core: mi11 boundary, equality preflight replaces `<=`, audit base/applied_at, narrowed publish flip

**Files:**
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts`
- Create: `tests/onboarding/finalizeCasFullApply.db.test.ts`
- Create: `tests/onboarding/wizardApplyLivePartitionCoexistence.db.test.ts` (real DB — moved here from Task 1.2 so it is written failing at this task's START and green by its END; no intentionally-red commit)
- Modify: `tests/onboarding/finalize-cas.test.ts` (fake rows/withRowTx plumbing)

**Concrete failure modes caught:** (a) the `<=` gate (`finalize-cas/route.ts:277`) applies from a baseline the reviewer never saw — live row advanced after staging but still `<= staged_modified_time` (spec §3.2 R21-1); (b) Phase D routes through the legacy whole-parse path and either throws P2-F7 (wedging finalize) or — worse — applies an MI-11 email ungated (spec §3.2 R4-2); (c) the bulk publish flip force-publishes a pre-existing `published=false` (archived/unpublished) show approved into a shadow — crew-visibility data exposure (spec §3.4 R18-1); (d) Phase D audit lacks `base_modified_time` / real provenance, breaking F2 Arm B's broken-writer-shape detection; (e) **mid-loop session-currency race** — Phase D today reads `app_settings` WITHOUT `FOR UPDATE` (`readSession`, `finalize-cas/route.ts:129-142`), applies each shadow in separately-COMMITTED row transactions (`:449-451`), and only detects supersession when `promoteSettings` returns null at the tail (`:460-461`): a scan/cleanup superseding the session mid-loop lets old-session shadow applies (children, feed, audit, shadow deletion, publish flip, deferral cleanup, `markFinalCasDone` is the only thing skipped) COMMIT before the 409 — durable old-session writes the operator believes were refused; (f) **damaged-shadow silent consumption** — the legacy `if (!row.payload.parse_result) { deleteAppliedShadowRow; return OK }` branch (`finalize-cas/route.ts:249-252`) CONSUMES a corrupt/incomplete shadow and reports it successful: no children applied, no audit, no operator-recovery state — the damaged shadow disappears during finalize-cas leaving stale live data with no retry surface, contradicting the fail-closed posture for corrupt Phase D payloads (spec §3.2 R2-1); (g) **reviewer-choice override** — without a choice-semantics dispatch before the core's Phase-2 call, a wizard shadow carrying an MI-12 `reject` choice (StagedReviewCard posts reject/rename/independent in wizard mode, `components/admin/StagedReviewCard.tsx:113-115`) would still WHOLESALE-apply the staged rename, write feed + audit, delete the shadow, and return OK — silently overriding the operator's identity-review decision; the live contract proves reject must discard and never reach Phase 2 (`applyStaged.ts:1327-1339`; `tests/sync/applyStaged.test.ts:1118-1147`).

- [ ] **Write failing test** `tests/onboarding/finalizeCasFullApply.db.test.ts` (real DB; drives `handleOnboardingFinalizeCas` with default `withTx`/`withRowTx`; seeds `shows_pending_changes` rows with the Task-1.4 payload shape; all expectations derived from the seeded payload fixtures):

```ts
test("(a) benign existing-show shadow applies the FULL parse via the core: children, feed row, audit", async () => {
  // Seed: live show drive-cas-1 at watermark BASE with crew [Ada(a@old)]; shadow payload staged at
  // STAGED with parse crew [Ada(a@old), Bo(bo@x)], a room change, items=[MI-6 add item], choices=[apply].
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(200);
  const show = one(await sql`select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-cas-1'`);
  // children replaced from the payload parse (derived from fixture):
  const crew = await sql`select name from public.crew_members where show_id = ${show.id} order by name`;
  expect(crew.map((c) => c.name)).toEqual(SHADOW_PARSE.crewMembers.map((m) => m.name).sort());
  // watermark advanced to the staged instant (self-heal anchor for T1.8):
  expect(new Date(show.last_seen_modified_time).toISOString()).toBe(STAGED);
  // feed row written for the notable item (D-2):
  const feed = await sql`select source from public.show_change_log where show_id = ${show.id}`;
  expect(feed.length).toBeGreaterThan(0);
  // audit: real provenance + base_modified_time persisted + summary shape:
  const audit = one(await sql`select applied_by, applied_at, base_modified_time, triggered_review_items,
                                     parse_result_summary from public.sync_audit
                               where drive_file_id = 'drive-cas-1'`);
  expect(new Date(audit.applied_at).toISOString()).toBe(APPLIED_AT_INTENT);     // = wizard_approved_at snapshot
  expect(new Date(audit.base_modified_time).toISOString()).toBe(BASE);
  expect(audit.triggered_review_items).toEqual(SHADOW_ITEMS);
  expect(audit.parse_result_summary).toMatchObject({
    source: "onboarding_finalize_cas",
    crewCount: SHADOW_PARSE.crewMembers.length,                                  // F2 Arm B healthy marker
  });
  // shadow consumed:
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-1'`).length).toBe(0);
});

test("(b) equality preflight REPLACES the <= gate: advanced-but-still-<= baseline is REFUSED", async () => {
  // Seed: live watermark moved AFTER staging to MID where BASE < MID < STAGED
  // (the old `<= $15` predicate at finalize-cas/route.ts:277 would have applied this).
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(409);
  const body = (await res.json()) as { per_row: Array<{ code: string }> };
  expect(body.per_row[0]!.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");        // code retained
  // per-row rollback: NO child writes, shadow RETAINED, watermark unchanged at MID:
  const show = one(await sql`select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-cas-2'`);
  expect(new Date(show.last_seen_modified_time).toISOString()).toBe(MID);
  expect((await sql`select 1 from public.crew_members where show_id = ${show.id}`).length)
    .toBe(SEEDED_LIVE_CREW.length);                                              // pre-apply crew intact
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-2'`).length).toBe(1);
});

test("(c) corrupt/missing items payload is REFUSED per-row, siblings continue (fail-closed integration)", async () => {
  // Seed two shadows: drive-cas-3 payload LACKS triggered_review_items (legacy shape) and carries an
  // MI-11-bearing parse (Ada email differs from live); drive-cas-4 is a complete benign payload.
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(409);
  const rows = ((await res.json()) as { per_row: Array<{ drive_file_id: string; code: string }> }).per_row;
  expect(rows.find((r) => r.drive_file_id === "drive-cas-3")!.code).toBe("STAGED_REVIEW_ITEMS_CORRUPT");
  expect(rows.find((r) => r.drive_file_id === "drive-cas-4")!.code).toBe("OK");
  // Ada's email did NOT change (the identity gate held), shadow retained for operator cleanup:
  const ada = one(await sql`select email from public.crew_members cm
                             join public.shows s on s.id = cm.show_id
                            where s.drive_file_id = 'drive-cas-3' and cm.name = 'Ada'`);
  expect(ada.email).toBe(LIVE_ADA_EMAIL);
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-3'`).length).toBe(1);
});

test("(c2) parse_result-less shadow is REFUSED per-row and RETAINED — never consumed-as-OK", async () => {
  // Concrete failure mode: the legacy branch (finalize-cas/route.ts:249-252) deleted the shadow
  // and reported OK — the damaged shadow disappears during finalize-cas, leaving stale live data
  // with NO retry surface and a green finalize. Seed: shadow for drive-cas-6 whose payload lacks
  // parse_result (items/base/staged_id present); a sibling complete benign shadow for drive-cas-7.
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(409);                                       // route's blocked contract
  const rows = ((await res.json()) as { per_row: Array<{ drive_file_id: string; code: string }> }).per_row;
  expect(rows.find((r) => r.drive_file_id === "drive-cas-6")!.code).toBe("STAGED_PARSE_RESULT_CORRUPT");
  expect(rows.find((r) => r.drive_file_id === "drive-cas-7")!.code).toBe("OK"); // sibling continued
  // Shadow RETAINED (the operator-recovery surface), and NOTHING persisted for that show:
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-6'`).length).toBe(1);
  const show6 = one(await sql`select id, published from public.shows where drive_file_id = 'drive-cas-6'`);
  expect((await sql`select name from public.crew_members where show_id = ${show6.id}`).map((r) => r.name).sort())
    .toEqual(SEEDED_CAS6_LIVE_CREW.map((m) => m.name).sort());        // children untouched
  expect((await sql`select 1 from public.sync_audit where drive_file_id = 'drive-cas-6'`).length).toBe(0);
  expect(show6.published).toBe(SEEDED_CAS6_PUBLISHED);                // no publish flip
  // Deferral cleanup did NOT run (blocked batch never reaches deleteWizardDeferrals, :459):
  expect((await sql`select 1 from public.deferred_ingestions where wizard_session_id = ${SESSION}`).length)
    .toBe(SEEDED_SESSION_DEFERRAL_COUNT);
});

test("(d) publish flip is narrowed to session-CREATED rows: pre-existing published=false show stays unpublished", async () => {
  // Seed: manifest row A applied with created_show_id = first-seen show (published=false from Phase B);
  // manifest row B applied with created_show_id NULL whose show is a pre-existing published=false
  // (B2-unpublished) show approved into a shadow.
  await handleOnboardingFinalizeCas(request(), deps);
  expect(one(await sql`select published from public.shows where id = ${CREATED_SHOW_ID}`).published).toBe(true);
  expect(one(await sql`select published from public.shows where id = ${PREEXISTING_UNPUBLISHED_ID}`).published).toBe(false);
});

test("(g1) MI-12 REJECT wizard shadow: staged rename NOT applied — discard mirror of the live contract", async () => {
  // Concrete failure mode: without the choice-semantics dispatch, Phase D runs the full Phase-2
  // apply on the staged parse — the REJECTED rename (Bob→Robert) lands in crew_members, feed +
  // audit rows are written, and the shadow returns OK: the operator's identity-review choice is
  // silently overridden. Live contract: reject → discard, NO Phase 2, NO audit
  // (applyStaged.ts:1327-1339; tests/sync/applyStaged.test.ts:1118-1147).
  // Seed: live show drive-cas-8, crew [Bob(b@x)]; shadow parse renames Bob→Robert (same email),
  // items=[MI-12 {removed_name:'Bob', added_name:'Robert'}], choices=[{action:'reject'}].
  const res = await handleOnboardingFinalizeCas(request(), deps);
  const rows = ((await res.json()) as { per_row: Array<Record<string, string>> }).per_row;
  const row8 = rows.find((r) => r.drive_file_id === "drive-cas-8")!;
  expect(row8.code).toBe("OK");
  expect(row8.disposition).toBe("discarded_by_reviewer_choice");
  const show = one(await sql`select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-cas-8'`);
  // Live row INTACT per the discard contract — Bob survives, Robert never lands:
  const crew = await sql`select name from public.crew_members where show_id = ${show.id}`;
  expect(crew.map((c) => c.name)).toEqual(["Bob"]);
  // NO audit (live contract: insertSyncAudit never called on reject) and NO feed row:
  expect((await sql`select 1 from public.sync_audit where drive_file_id = 'drive-cas-8'`).length).toBe(0);
  expect((await sql`select 1 from public.show_change_log where show_id = ${show.id}`).length).toBe(0);
  // Shadow CONSUMED-as-discarded (the deleteLivePendingSync analogue), watermark UNCHANGED
  // (the try_again analogue — next cron re-stages for dashboard re-review):
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-8'`).length).toBe(0);
  expect(new Date(show.last_seen_modified_time).toISOString()).toBe(CAS8_BASE);
});

test("(g2) MI-13 INDEPENDENT wizard shadow: wholesale apply + removed-name-only floor — not a plain rename", async () => {
  // Concrete failure mode: independent collapsing into rename semantics — wrong revocation floor
  // (added person's floor bumped too) and a wrong audit record — or, inversely, independent being
  // treated as a parse mutation. Live contract: independent applies the SAME wholesale parse;
  // floors = removed name ONLY (deriveAuthSideEffects applyStaged.ts:492;
  // tests/sync/applyStaged.test.ts:1189-1217).
  // Seed: live show drive-cas-9, crew [Old Person]; shadow parse has [New Person] (Old absent),
  // items=[MI-13 {removed_name:'Old Person', added_name:'New Person'}], choices=[{action:'independent'}].
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(200);
  const show = one(await sql`select id from public.shows where drive_file_id = 'drive-cas-9'`);
  // Wholesale apply landed: Old removed, New added (fixture-derived):
  const crew = await sql`select name from public.crew_members where show_id = ${show.id}`;
  expect(crew.map((c) => c.name)).toEqual(CAS9_SHADOW_PARSE.crewMembers.map((m) => m.name));
  // Audit derived_side_effects = removed name ONLY (the independent ≠ rename distinction):
  const audit = one(await sql`select derived_side_effects from public.sync_audit where drive_file_id = 'drive-cas-9'`);
  expect(audit.derived_side_effects).toEqual({ revokeFloorForNames: ["Old Person"] });
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-9'`).length).toBe(0);
});

test("(e1) PRE-superseded session: typed abort BEFORE any row transaction — zero shadow applies persisted", async () => {
  // Concrete failure mode: without the up-front FOR UPDATE session-currency check, Phase D reads
  // S1, a supersession lands, and S1's shadows still apply row-by-row in committed transactions
  // before the tail CAS 409s — durable old-session children/feed/audit/publish writes.
  // Seed: full S1 state (checkpoint all_batches_complete + one shadow for drive-cas-5), then flip:
  await sql`update public.app_settings set pending_wizard_session_id = ${OTHER_SESSION}::uuid where id = 'default'`;
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe("WIZARD_FINALIZE_CHECKPOINT_MISSING"); // existing typed abort (no checkpoint for OTHER_SESSION)
  // ZERO row transactions ran: live crew untouched, shadow retained, no audit:
  const show = one(await sql`select id from public.shows where drive_file_id = 'drive-cas-5'`);
  expect((await sql`select name from public.crew_members where show_id = ${show.id}`).map((r) => r.name).sort())
    .toEqual(SEEDED_CAS5_LIVE_CREW.map((m) => m.name).sort());
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-cas-5'`).length).toBe(1);
  expect((await sql`select 1 from public.sync_audit where drive_file_id = 'drive-cas-5'`).length).toBe(0);
});

test("(e2) lock-topology proof: the up-front app_settings FOR UPDATE serializes a MID-LOOP supersession attempt", async () => {
  // A concurrent flip can no longer interleave with the shadow loop — it BLOCKS on the
  // app_settings row lock (held from the up-front currency check through the promoteSettings
  // tail CAS) until Phase D commits. Mirrors the Task-1.3 lock-topology proof.
  const order: string[] = [];
  const finalize = handleOnboardingFinalizeCas(request(), depsWithSlowFirstShadow)
    .then((r) => { order.push("finalize"); return r; });
  await delay(50);                                       // Phase D is mid-loop, holding the row lock
  const flip = sideSql`update public.app_settings
                          set pending_wizard_session_id = ${OTHER_SESSION}::uuid
                        where id = 'default'`.then(() => { order.push("flip"); });
  const [res] = await Promise.all([finalize, flip]);
  expect(order).toEqual(["finalize", "flip"]);           // the flip waited for Phase D's commit
  expect(res.status).toBe(200);                          // S1 finalized consistently (flip applied after)
});
```

- [ ] **Write failing DB regression** `tests/onboarding/wizardApplyLivePartitionCoexistence.db.test.ts` (real LOCAL Supabase: connect via `LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"` — NOT `TEST_DATABASE_URL`, which is the validation project; gate on reachability of that local URL, adapting the `tests/onboarding/onboardingFinalizePublishDb.test.ts` harness to the local-loopback convention) — the end-to-end half of Task 1.2's class (unit pins landed there; this exercises the real finalize writers):
  - Seed: a live show `drive-coexist-1` (synced, watermark T0); a LIVE `pending_ingestions` row for `drive-coexist-1` (`wizard_session_id null`, `last_error_code 'PARSE_ERROR'`); a LIVE `pending_syncs` staged row for `drive-coexist-1` (`wizard_session_id null`, `base_modified_time` = T0); a wizard session with an approved existing-show row for the SAME `drive_file_id` (Phase B path) staged at T1.
  - Drive Phase B (`handleOnboardingFinalize` with injected `fetchDriveFileMetadata` returning T1) then Phase D (`handleOnboardingFinalizeCas`).
  - Assert AFTER Phase D: the live `pending_ingestions` row still exists (`select … where drive_file_id='drive-coexist-1' and wizard_session_id is null` → 1 row); the live `pending_syncs` row still exists (same predicate → 1 row); AND `crew_members` rows exist matching the shadow's parse (the apply actually ran — anti-tautology: without this, the pre-rewire bespoke UPDATE would pass the survival assertions trivially). **Concrete failure mode:** the unconditional `deleteLivePendingIngestion` / 6L delete reached the live partition from a wizard action.
- [ ] **Run to verify failure:** `pnpm vitest run tests/onboarding/finalizeCasFullApply.db.test.ts tests/onboarding/wizardApplyLivePartitionCoexistence.db.test.ts` — expected failures: (a) crew assertion 0 rows + no feed row + `base_modified_time` null in audit; (b) 200 instead of 409 (the `<=` gate applies it); (c) `OK` for the corrupt row and Ada's email CHANGED (fail-open reproduced); (c2) fails with `OK` for drive-cas-6 AND the shadow-retained assertion at 0 rows (the legacy branch consumed it — silent-success bug reproduced); (d) pre-existing show force-published; (g1) fails with Robert in `crew_members` + an audit row present (the rejected rename applied — choice-override bug reproduced); (g2) fails with no children/audit at all (bespoke writer) and, post-rewire-without-dispatch, would fail on the floors assertion if independent collapsed into rename; (e2) fails with order `["flip", "finalize"]` — against the current no-FOR-UPDATE `readSession`, the mid-loop flip does NOT block, S1's shadow applies commit, and the tail CAS 409s after the fact (the durable-old-session-writes bug demonstrated live; e1 alone is NOT a sufficient red signal — current code also refuses a pre-flip read at `readSession` time); coexistence test fails on its crew-count assertion (bespoke writers drop children — the origin incident reproduced).
- [ ] **Implementation:**
  0. **Session-currency lock UP FRONT — in the GLOBAL order `finalize:<session>` advisory → `app_settings` row → per-show advisory (plan-R16-1 supersedes the R7 sketch).** `readSession` stays a PLAIN (no-lock) read used only to discover the candidate session id. `runFinalizeCas` then acquires `tryFinalizeLock` (`finalize:<session>`) exactly as it does today, and ONLY AFTERWARD takes the authoritative `SELECT … FOR UPDATE` re-check on `app_settings` (session still current; mismatch → typed abort BEFORE any row transaction), holding that row lock through the tail `promoteSettings` CAS (`:367-393`). Ordering rationale: `cleanupAbandonedFinalize` takes `finalize:` THEN `app_settings FOR UPDATE` (`sessionLifecycle.ts:329-340`) — if Phase D took `app_settings` before `finalize:` (the R7 sketch's readSession-first shape), finalize-cas holding `app_settings` while waiting on `finalize:` against cleanup holding `finalize:` while waiting on `app_settings` is an AB-BA deadlock. With finalize-first, both paths share one total order: `finalize:` → `app_settings` → per-show. A pre-superseded re-check hits the EXISTING typed aborts (`WIZARD_FINALIZE_CHECKPOINT_MISSING` / `WIZARD_FINALIZE_BATCHES_PENDING`); a MID-flight supersession attempt BLOCKS on the row lock until Phase D commits/aborts — the detect-at-tail-only window (`:460-461`) is closed. Per-row `withRowTx` connections take per-show advisory locks while the outer connection holds `app_settings` (sanctioned order); no path takes `app_settings` while holding a per-show lock. Phase B's `readActiveSession` FOR UPDATE (`finalize/route.ts:171-181`) is consistent: Phase B's `pg_try_advisory_xact_lock('finalize:'…)` fires before it. **Additional regression:** real-DB race of `runFinalizeCas` vs `cleanupAbandonedFinalize` for the SAME session — both settle, neither rejects with SQLSTATE 40P01, and exactly one of them wins the session (the loser gets its typed abort).
  1. `FinalizeCasRouteDeps.withRowTx` gains the `pipelineTx` second argument exactly as Task 1.3 step 6 (factory `makeSyncPipelineTx` over the same raw tx that took the lock at `:103`).
  2. Rewrite `applyShadow` (`:241-306`):
     ```ts
     async function applyShadow(tx, pipelineTx, row): Promise<ShadowApplyResult> {
       // NO legacy `!parse_result → deleteAppliedShadowRow + OK` branch (R8 finding 1): a
       // parse_result-less shadow used to be CONSUMED and reported successful — the damaged
       // shadow disappeared during finalize-cas leaving stale live data with no retry surface.
       // The parser fails it closed instead (shadow RETAINED, typed per-row code, siblings continue):
       const parsed = parseShadowPayloadForApply(row.payload);
       if (!parsed.ok) return { drive_file_id: row.drive_file_id, code: parsed.code };       // shadow retained
       const parseResult = parsed.parseResult;
       const live = one(await tx.query(`select id, last_seen_modified_time, diagrams
                                          from public.shows where drive_file_id = $1`, [row.drive_file_id]));
       if (!live) return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };
       // EQUALITY preflight — replaces the `<=` CAS predicate (spec §3.2 R21-1). revisionTimesMatch
       // handles postgres.js Date vs ISO-string instants (applyStaged.ts:385-387).
       if (!revisionTimesMatch(live.last_seen_modified_time, parsed.baseModifiedTime)) {
         return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };
       }
       const lockedTx = await adoptShowLockHeld(pipelineTx, row.drive_file_id);
       const core = await applyStagedCore(lockedTx, {
         sourceScope: "wizard",
         driveFileId: row.drive_file_id,
         show: { showId: live.id, lastSeenModifiedTime: normalizeTimestamptz(live.last_seen_modified_time), diagrams: live.diagrams },
         parseResult,
         triggeredReviewItems: parsed.triggeredReviewItems,
         reviewerChoices: parsed.reviewerChoices,
         stagedId: parsed.stagedId,
         stagedModifiedTime: parsed.stagedModifiedTime,                               // holds baseModifiedTime analogue (spec §3.2)
         baseModifiedTime: parsed.baseModifiedTime,                                   // → sync_audit.base_modified_time
         appliedByEmail: row.applied_by_email,
         appliedAt: normalizeTimestamptz(row.applied_at_intent),                      // = wizard_approved_at snapshot (T1.4)
         auditSource: "onboarding_finalize_cas",
         fileMeta: syntheticFileMeta(row, parsed),                                    // Phase D is SQL-only (spec §3.4): name/modifiedTime from payload, no Drive I/O
         mi11Items: parsed.mi11Items,                                                 // → runPhase2 writes sync_holds BEFORE the hold-aware apply (phase2.ts:300-335)
         notableItems: parsed.triggeredReviewItems,                                   // → writeAutoApplyChanges feed rows (phase2.ts:340-372), D-2
         skipDiagramsWrite: false,                                                    // payload diagrams already canonical (spec §3.4)
       });
       if (core.outcome === "invalid_request") return { drive_file_id: row.drive_file_id, code: "STAGED_REVIEW_ITEMS_CORRUPT" };
       if (core.outcome === "discarded_by_choice") {
         // Mirror of the live MI-12 reject contract (applyStaged.ts:1327-1339, test
         // tests/sync/applyStaged.test.ts:1118-1147): nothing applied, NO Phase 2, NO audit
         // (the live contract writes no sync_audit row on reject — mirrored exactly), live row
         // untouched. The shadow is the wizard's staged-row analogue of deleteLivePendingSync's
         // target, so it is CONSUMED-as-discarded; the live watermark is unchanged, so the next
         // cron pass re-stages the change for dashboard re-review — the `try_again` analogue.
         // (restoreShowStatus is N/A: stageExistingShowShadow never altered the live row's status.)
         await deleteAppliedShadowRow(tx, row);
         return { drive_file_id: row.drive_file_id, code: OK_CODE, disposition: "discarded_by_reviewer_choice" };
       }
       if (core.outcome !== "applied") return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };
       await deleteAppliedShadowRow(tx, row);
       return { drive_file_id: row.drive_file_id, code: OK_CODE };
     }
     ```
     `ShadowApplyResult`'s OK member gains the optional `disposition?: "discarded_by_reviewer_choice"` field (response metadata, NOT an error code — no §12.4 row; invariant 5 unaffected since OK rows never render through the error catalog).
     `ShadowApplyResult` code union widens to include `"STAGED_REVIEW_ITEMS_CORRUPT"` and `"STAGED_PARSE_RESULT_CORRUPT"` (both §12.4-cataloged, `catalog.ts:1252`/`:1265`). The per-row loop (`:449-456`) and best-effort posture are UNCHANGED (ratified, spec §3.2 R6-1 — do not relitigate); the blocked→409 top-level code stays `STAGED_PARSE_OUTDATED_AT_PHASE_D` with the typed `per_row` array as the precise surface (no new §12.4 code).
  3. **DELETE** `insertShadowAudit` (`:308-336`) — the core writes the audit — and the bespoke UPDATE inside the old `applyShadow`.
  4. Narrow `publishAppliedWizardShows` (`:338-356`):
     ```sql
     update public.shows
        set published = true
      where id in (select created_show_id from public.onboarding_scan_manifest
                    where wizard_session_id = $1::uuid and status = 'applied'
                      and created_show_id is not null)
     ```
     Existing-show shadow applies PRESERVE the live `published` value automatically — the payload never carries `published` and `applyShowSnapshot`'s UPDATE arm (`runScheduledCronSync.ts:1018-1072`) never writes it.
  5. Update `tests/onboarding/finalize-cas.test.ts` fakes: shadow fixture payloads gain `triggered_review_items`/`base_modified_time`; `withRowTx` passes a spy `pipelineTx`; the fake-DB CAS-fail classifier keys on the equality predicate now.
- [ ] **Run to pass:** `pnpm vitest run tests/onboarding/finalizeCasFullApply.db.test.ts tests/onboarding/wizardApplyLivePartitionCoexistence.db.test.ts tests/onboarding/finalize-cas.test.ts`
- [ ] **Commit:** `feat(onboarding): Phase D applyShadow routes through shared apply core (equality preflight, mi11 holds, coexistence, narrowed publish flip)`

---### Task 1.6 — Behavior regressions: multi-shadow best-effort, MI-11 wizard/dashboard parity, legacy P2-F7 preserved

**Files:**
- Create: `tests/onboarding/finalizeCasMultiShadow.db.test.ts`
- Create: `tests/onboarding/finalizeCasMi11Parity.db.test.ts`
- Modify: `tests/sync/applyStaged.test.ts` (one added test) — the ONLY sanctioned edit to that file in this phase

**Concrete failure modes caught:** (a) a later sibling's CAS failure rolls back or corrupts an earlier committed row, or — the inverse bug — the failing row leaves PARTIAL child writes (violating the ratified per-row contract, spec §3.2 R6-1); (b) wizard MI-11 semantics drift from the cron decision-rule path — hold row shape, identity pin, or feed differ, making the wizard a second identity-gate variant (D-2 violation); (c) the extraction accidentally relaxed P2-F7 so a live MI-11 staged row applies ungated. Choice-semantics parity (reject discard / independent floors — the matrix in the Design section) is pinned by T1.5's (g1)/(g2) real-DB regressions plus T1.1's core dispatch unit tests; T1.6's parity oracle therefore covers the MI-11 hold cell, and a multi-shadow seed here includes one rejected-choice shadow alongside A/B to prove the discard row neither blocks nor corrupts siblings.

- [ ] **Write failing/green-verified test** `tests/onboarding/finalizeCasMultiShadow.db.test.ts` (real DB):

```ts
test("shadow A commits fully and PERSISTS while shadow B CAS-fails untouched (ratified best-effort)", async () => {
  // Seed shadows ordered by drive_file_id: A='drive-ms-a' (clean: live watermark == payload base),
  // B='drive-ms-b' (stale: live watermark advanced past payload base after staging).
  const res = await handleOnboardingFinalizeCas(request(), deps);
  expect(res.status).toBe(409);
  const rows = ((await res.json()) as { per_row: Array<{ drive_file_id: string; code: string }> }).per_row;
  expect(rows).toEqual([
    { drive_file_id: "drive-ms-a", code: "OK" },
    { drive_file_id: "drive-ms-b", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" },
  ]);
  // A persisted (children + holds + feed + audit committed) — derived from A's payload fixture:
  const showA = one(await sql`select id from public.shows where drive_file_id = 'drive-ms-a'`);
  expect((await sql`select name from public.crew_members where show_id = ${showA.id}`).length)
    .toBe(SHADOW_A_PARSE.crewMembers.length);
  expect((await sql`select 1 from public.sync_audit where drive_file_id = 'drive-ms-a'`).length).toBe(1);
  // B ENTIRELY untouched: live crew unchanged, no audit, no feed, shadow retained:
  const showB = one(await sql`select id from public.shows where drive_file_id = 'drive-ms-b'`);
  const bCrew = await sql`select name, email from public.crew_members where show_id = ${showB.id} order by name`;
  expect(bCrew).toEqual(SEEDED_B_LIVE_CREW);                       // fixture-derived, pre-apply state
  expect((await sql`select 1 from public.sync_audit where drive_file_id = 'drive-ms-b'`).length).toBe(0);
  expect((await sql`select 1 from public.show_change_log where show_id = ${showB.id}`).length).toBe(0);
  expect((await sql`select 1 from public.shows_pending_changes where drive_file_id = 'drive-ms-b'`).length).toBe(1);
  // Session unresolved: checkpoint NOT final_cas_done, settings NOT promoted:
  expect(one(await sql`select status from public.wizard_finalize_checkpoints
                        where wizard_session_id = ${SESSION}`).status).toBe("all_batches_complete");
  expect(one(await sql`select pending_wizard_session_id from public.app_settings where id='default'`)
    .pending_wizard_session_id).toBe(SESSION);
});
```

- [ ] **Write test** `tests/onboarding/finalizeCasMi11Parity.db.test.ts` (real DB):

```ts
test("wizard MI-11 apply writes the SAME hold + pin + feed + auth side effects as the cron decision-rule path", async () => {
  // Live show: crew [Ada a@old]. Shadow payload: parse [Ada a@new], items [MI-11 Ada a@old→a@new],
  // choices [{item_id, action:'apply'}], base == live watermark.
  await handleOnboardingFinalizeCas(request(), deps);
  const show = one(await sql`select id from public.shows where drive_file_id = 'drive-mi11-w'`);

  // 1. Hold row identical in shape to writeMi11Holds' contract (lib/sync/holds/writeMi11Holds.ts):
  const hold = one(await sql`select domain, kind, entity_key, held_value, proposed_value, created_by
                               from public.sync_holds where show_id = ${show.id}`);
  expect(hold).toMatchObject({ domain: "crew_email", kind: "mi11_pending", entity_key: "Ada", created_by: "system" });
  expect(hold.held_value).toMatchObject({ name: "Ada", email: "a@old.com" });
  expect(hold.proposed_value).toEqual({ disposition: "email_change", name: "Ada", email: "a@new.com" });

  // 2. Identity PINNED — assert the DB row, not the parse object (anti-tautology):
  expect(one(await sql`select email from public.crew_members where show_id = ${show.id} and name = 'Ada'`)
    .email).toBe("a@old.com");

  // 3. Audit derived side effects match deriveAuthSideEffects(items, choices) for the same inputs
  //    (the dashboard derivation, applyStaged core):
  const audit = one(await sql`select derived_side_effects from public.sync_audit where drive_file_id = 'drive-mi11-w'`);
  expect(audit.derived_side_effects).toEqual({ revokeFloorForNames: ["Ada"] });

  // 4. Parity oracle: run the CRON decision-rule path on an identical twin show (processOneFile with
  //    injected parse deps producing the same MI-11), then compare the two sync_holds rows field-by-field
  //    (held_value, proposed_value, domain, kind) — values must be EQUAL, derived from one shared fixture.
  const twinHold = await runCronMi11Twin();                         // helper in this test file
  for (const field of ["domain", "kind", "held_value", "proposed_value"] as const) {
    expect(hold[field]).toEqual(twinHold[field]);
  }
});
```

  **Why the twin oracle is not tautological:** the wizard row and the cron row are produced by two different entry paths (Phase D core call vs `processOneFile_unlocked` → `runPhase2` with `phase1.mi11Items`, `runScheduledCronSync.ts:2410-2414`) writing through `writeMi11Holds`; the assertion fails if Phase D bypasses the holds composition (e.g. routes MI-11 into a direct apply) or feeds different `liveCrewByName`/`baseModifiedTime` inputs.

- [ ] **Add legacy P2-F7 regression** to `tests/sync/applyStaged.test.ts` (append-only):

```ts
test("post-extraction: live whole-parse path STILL throws Phase2GateBypassError on MI-11 (P2-F7 untouched)", async () => {
  const tx = fakeTx();
  await expect(
    applyStaged_unlocked(tx, liveArgs(), liveDeps({
      readLivePendingSyncForApply: async () => pending({
        triggeredReviewItems: [{ id: "i1", invariant: "MI-11", crew_name: "Ada",
          prior_email: "a@old.com", new_email: "a@new.com" } as never],
      }),
      // choices valid for the item so the guard (post-validation, applyStaged.ts:1345-1354) is reached:
      // MI-11 allows only 'apply' (allowedActions default arm)
    })),
  ).rejects.toThrow(Phase2GateBypassError);
});
```

  (Adapt the existing file's `liveArgs`/`liveDeps` helper names to what is actually present; the assertion target — `rejects.toThrow(Phase2GateBypassError)` — is the contract.)

- [ ] **Run all three:** `pnpm vitest run tests/onboarding/finalizeCasMultiShadow.db.test.ts tests/onboarding/finalizeCasMi11Parity.db.test.ts tests/sync/applyStaged.test.ts` — the multi-shadow and parity tests must be run once against a deliberately broken variant to prove they bite (negative-regression discipline): temporarily stash the T1.5 equality preflight (restore the `<=` predicate) and confirm multi-shadow test (b)-row goes green-to-red; restore.
- [ ] **Commit:** `test(onboarding): multi-shadow best-effort + MI-11 wizard/cron parity + legacy P2-F7 regressions`

---

### Task 1.7 — Structural guards: acquire-free core, second-copy tripwire, live-partition classification walker

**Files:**
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts`
- Create: `tests/sync/_secondCopyApplyTripwire.test.ts`
- Create: `tests/sync/_livePartitionClassificationContract.test.ts`

**Concrete failure modes caught:** (a) a future edit adds `pg_advisory_xact_lock` inside the core — a second holder under the Phase B/D/dashboard holders → deadlock under burst (M5 R20 class, invariant 2); (b) a resurrected bespoke `insert into public.shows` / child snapshot SQL outside the pinned allowlist — the EXACT introduction vector of the origin incident; (c) a new live-partition statement appears on the core's reachable surface without a classification row (orphan), or a classified-live op stops being a wizard no-op.

- [ ] **Write failing tests:**

`tests/auth/advisoryLockRpcDeadlock.test.ts` — append a new `describe` (existing registry untouched; F1 adds NO lock-taking RPC):

```ts
describe("shared apply core is acquire-free (onboarding-fixups F1, spec §3.3)", () => {
  test("applyStagedCore.ts contains zero advisory-lock acquisitions and adopts via assertion only", () => {
    const core = stripComments(readFileSync(join(ROOT, "lib/sync/applyStagedCore.ts"), "utf8"));
    expect(core).not.toMatch(/pg_(?:try_)?advisory_xact_lock/i);
    expect(core).not.toMatch(/withPostgresSyncPipelineLock|withShowLock\s*\(/);
    expect(core).toMatch(/assertShowLockHeld|adoptShowLockHeld/);   // adoption, not acquisition
  });
  test("finalize routes remain the single per-row lock holders for the wizard surfaces", () => {
    for (const file of ["app/api/admin/onboarding/finalize/route.ts",
                        "app/api/admin/onboarding/finalize-cas/route.ts"]) {
      const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
      const acquisitions = src.match(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/g) ?? [];
      expect(acquisitions).toHaveLength(1);                          // exactly the withRowTx holder
    }
  });
});
```

`tests/sync/_secondCopyApplyTripwire.test.ts` — **no file-wide escape hatch**: EVERY pattern match in EVERY walked file (including `runScheduledCronSync.ts`) must fall inside an explicit allowed `(file, symbol)` range; a match outside every range fails with `file :: pattern :: line`. The allowed ranges were enumerated by grepping the live worktree (every match's owning function verified): snapshot writers — `applyShowSnapshot` (insert `:1079`, snapshot UPDATEs `:1022/:1047`), `deleteCrewMembersNotIn` `:1122`, `upsertCrewMembers` `:1132`, `replaceHotelReservations` `:1173/:1177`, `replaceRooms` `:1199/:1203`, `replaceTransportation` `:1234/:1238`, `replaceContacts` `:1260/:1264`, `upsertShowsInternal` `:1278`; legitimate non-snapshot `update public.shows` lifecycle sites — `runScheduledCronSync.ts` `applyDiagramSnapshot` `:400`, `updateShowParseError` `:703`, `updateShowPendingReview` `:716`, `markShowSheetUnavailable` `:736`, `markShowDriveError` `:761`; plus `defaultRestoreShowStatus` (`applyStaged.ts:823-839` AND its twin in `discardStaged.ts:233`), `runManualSyncForShow` (`runManualSyncForShow.ts:397`, `requires_resync` clear), `promoteSnapshotUpload` (`promoteSnapshot.ts:159/:271`) + `repairSnapshotRollback` (`:400`), `updateRecoveredDiagrams` (`assetRecovery.ts:522`), `clearUnpublishToken`/`archiveAndConsumeUnpublishToken` (`unpublishShow.ts:114/:130`), and the narrowed `publishAppliedWizardShows` (`finalize-cas/route.ts:344` — survives T1.5). The bespoke writers at `finalize/route.ts:324-373` and `finalize-cas/route.ts:241-306` are NOT listed — they are deleted by T1.3/T1.5, and their resurrection is exactly what this test fails on:

```ts
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
// Walks the REAL subtrees (class-sweep rule: never a lexical file list).
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const SNAPSHOT_SQL = [
  /insert\s+into\s+public\.shows\b/gi,
  // Plan-R1 finding 2: the ORIGIN bug was a bespoke `UPDATE public.shows SET ...` with no child
  // writes (finalize-cas applyShadow) — the tripwire must catch shows UPDATEs too, not just inserts.
  /update\s+public\.shows\b/gi,
  /delete\s+from\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts)\b/gi,
  /insert\s+into\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts|shows_internal)\b/gi,
];

// Path+symbol allowlist (spec §9, corrected: the canonical writer methods live on
// PostgresPipelineTx — NOT `upsertShow`, which does not exist). NO file-wide entries:
// every match must sit inside one of these symbol bodies. Lifecycle shows-UPDATE sites
// are enumerated individually; adding a new writer means adding a row HERE, in review.
const ALLOWED: ReadonlyArray<{ file: string; symbol: string }> = [
  // canonical snapshot writers (PostgresPipelineTx):
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async applyShowSnapshot(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async deleteCrewMembersNotIn(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async upsertCrewMembers(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceHotelReservations(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceRooms(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceTransportation(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceContacts(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async upsertShowsInternal(" },
  // legitimate non-snapshot shows-UPDATE lifecycle sites (enumerated from the live worktree):
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async applyDiagramSnapshot(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async updateShowParseError(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async updateShowPendingReview(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async markShowSheetUnavailable(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async markShowDriveError(" },
  { file: "lib/sync/applyStaged.ts", symbol: "async function defaultRestoreShowStatus(" },
  { file: "lib/sync/discardStaged.ts", symbol: "async function defaultRestoreShowStatus(" },
  { file: "lib/sync/runManualSyncForShow.ts", symbol: "export async function runManualSyncForShow(" },
  { file: "lib/sync/promoteSnapshot.ts", symbol: "export async function promoteSnapshotUpload(" },
  { file: "lib/sync/promoteSnapshot.ts", symbol: "export async function repairSnapshotRollback(" },
  { file: "lib/sync/assetRecovery.ts", symbol: "async updateRecoveredDiagrams(" },
  { file: "lib/sync/unpublishShow.ts", symbol: "async clearUnpublishToken(" },
  { file: "lib/sync/unpublishShow.ts", symbol: "async archiveAndConsumeUnpublishToken(" },
  { file: "app/api/admin/onboarding/finalize-cas/route.ts", symbol: "async function publishAppliedWizardShows(" },
];

// [start, end) source range of a symbol body: from the symbol marker to the next
// top-level function or class-method declaration (or end of file).
const NEXT_DECL = /\n(?:export\s+(?:async\s+)?function\s+\w|async\s+function\s+\w|function\s+\w|  (?:private\s+)?async\s+\w+\()/;
function allowedRanges(file: string, src: string): Array<[number, number]> {
  return ALLOWED.filter((a) => a.file === file).map((a) => {
    const start = src.indexOf(a.symbol);
    if (start === -1) throw new Error(`allowlist symbol not found: ${a.file} :: ${a.symbol}`);
    const tail = src.slice(start + a.symbol.length);
    const next = tail.search(NEXT_DECL);
    const end = next === -1 ? src.length : start + a.symbol.length + next;
    return [start, end] as [number, number];
  });
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

describe("second-copy apply tripwire (the meta-test that would have caught the origin incident)", () => {
  test("every shows/child snapshot or shows-UPDATE statement under app/api/** + lib/** sits inside an allowed (file, symbol) range", () => {
    const offenders: string[] = [];
    for (const file of [...walk("app/api"), ...walk("lib")]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const ranges = allowedRanges(file, src);
      for (const pattern of SNAPSHOT_SQL) {
        for (const match of src.matchAll(pattern)) {
          const idx = match.index ?? 0;
          const allowed = ranges.some(([start, end]) => idx >= start && idx < end);
          if (!allowed) offenders.push(`${file} :: ${pattern} :: line ${lineOf(src, idx)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the allowlist itself is live — every pinned symbol still contains at least one matched statement", () => {
    // Guards against entries rotting into dead exemptions that would mask a future writer
    // moving into a stale range.
    for (const entry of ALLOWED) {
      const src = readFileSync(join(ROOT, entry.file), "utf8");
      const start = src.indexOf(entry.symbol);
      const [range] = allowedRanges(entry.file, src).filter(([s]) => s === start);
      const body = src.slice(range![0], range![1]);
      expect(
        SNAPSHOT_SQL.some((p) => new RegExp(p.source, "i").test(body)),
        `${entry.file} :: ${entry.symbol} no longer contains matched SQL — prune or update the allowlist`,
      ).toBe(true);
    }
  });
});
```

  (During implementation, re-run the enumeration grep — `rg -nEi "insert\s+into\s+public\.shows|update\s+public\.shows|delete\s+from\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts)|insert\s+into\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts|shows_internal)" lib app/api` — and reconcile the allowlist against ACTUAL offenders at that commit; any site not in the table above is either a T1.3/T1.5 leftover (fix it) or a genuinely new lifecycle writer (add a reviewed row).)

`tests/sync/_livePartitionClassificationContract.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE_PARTITION_CLASSIFICATION } from "@/lib/sync/applyStagedCore";

const ROOT = process.cwd();
// The core's reachable apply surface — module + transitive tx/composition files INCLUDING the
// PostgresPipelineTx method bodies, where live-only mutations like deleteLivePendingIngestion
// actually live (plan R23-1: omitting the tx file left the exact class unguarded — a future tx
// method could add a live-partition mutation reachable from wizard applies without failing this test):
const SURFACE = [
  "lib/sync/applyStagedCore.ts",
  "lib/sync/applyParseResult.ts",
  "lib/sync/phase2.ts",
  "lib/sync/runScheduledCronSync.ts",
];

// Wizard-scope completeness (plan R23-1): the second test must NOT hard-code deleteLivePendingIngestion —
// iterate EVERY LIVE_PARTITION_CLASSIFICATION row classified "live-only" and prove each resolves to a
// no-op (or is structurally unreachable) when the core runs with sourceScope: "wizard".
describe("live-partition classification contract (spec §3.2 / §9 R17)", () => {
  test("every partition-discriminated statement on the core surface has a classification row", () => {
    const partitionTables = /(pending_syncs|pending_ingestions|deferred_ingestions|admin_alerts)/g;
    const classifiedSites = new Set(LIVE_PARTITION_CLASSIFICATION.map((r) => r.op));
    for (const file of SURFACE) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const match of src.matchAll(partitionTables)) {
        // Each match must be attributable: the surrounding 400 chars must name a classified op
        // or carry an explicit classification comment.
        const window = src.slice(Math.max(0, (match.index ?? 0) - 400), (match.index ?? 0) + 400);
        const attributed = [...classifiedSites].some((op) => window.includes(op))
          || /live-partition:(live-only|wizard-only|n\/a)/.test(window);
        expect(attributed, `${file} has an unclassified ${match[0]} statement`).toBe(true);
      }
    }
  });

  test("wizard scope resolves every classified-live op reachable from the core to a no-op", async () => {
    // Re-runs the Task-1.2 spy assertion as a structural pin (kept here so deleting the unit test
    // cannot silently drop the contract):
    const { applyStagedCore } = await import("@/lib/sync/applyStagedCore");
    const { spyTx, coreArgs } = await import("./_applyStagedCoreTestkit");
    const tx = spyTx();
    await applyStagedCore(tx, coreArgs(tx, { sourceScope: "wizard", auditSource: "onboarding_finalize" }),
      { insertSyncAudit: async () => null, deleteLivePendingSync: () => { throw new Error("live op reached from wizard scope"); } });
    expect(tx.ops).not.toContain("deleteLivePendingIngestion");
  });

  test("the core never invokes resolveStaleSyncProblemAlerts (classified live-only, cron caller level)", () => {
    const core = readFileSync(join(ROOT, "lib/sync/applyStagedCore.ts"), "utf8");
    expect(core).not.toContain("resolveStaleSyncProblemAlerts");
  });
});
```

- [ ] **Run to verify failure:** `pnpm vitest run tests/sync/_secondCopyApplyTripwire.test.ts tests/sync/_livePartitionClassificationContract.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` — expected: tripwire/classification fail only if Tasks 1.3/1.5 left bespoke SQL or unclassified statements behind (if they pass first-try, FORCE a red run by temporarily re-adding a one-line `insert into public.shows` stub to `finalize/route.ts` and confirming the tripwire catches it — a structural test that has never been red is unverified); the lock test must be red against a deliberately added `pg_advisory_xact_lock` line in the core, then restored.
- [ ] **Prove the UPDATE pattern red against the origin bug (Plan-R1 finding 2):** run the tripwire from a temporary checkout state where Task 1.5 has NOT yet removed the bespoke `applyShadow` UPDATE (e.g., `git stash` the Task-1.5 change or run the test against `git show main:app/api/admin/onboarding/finalize-cas/route.ts` content written to a temp file inside the walk root) and confirm the `update public.shows` pattern flags it. This proves the guard catches the EXACT incident writer, not just hypothetical inserts. Record the red output in the task commit message body.
- [ ] **Implementation:** none beyond annotations — add `// live-partition:live-only — <reason>` comments where the walker needs attribution; fix any genuine offender it finds (class-sweep before patching: if an offender appears, grep for the SHAPE repo-wide before fixing the instance).
- [ ] **Run to pass:** `pnpm vitest run tests/sync/_secondCopyApplyTripwire.test.ts tests/sync/_livePartitionClassificationContract.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts`
- [ ] **Commit:** `test(sync): structural guards — acquire-free apply core, second-copy tripwire, live-partition classification`

---

### Task 1.8 — B→D Doug-edit self-heal convergence regression

**Files:**
- Create: `tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts`

**Concrete failure mode caught:** the bounded-staleness contract (spec §3.4 R23-1) silently breaks — a Doug edit landing between Phase B and Phase D either (a) blocks Phase D (someone "fixed" the equality preflight to compare against live Drive time, reintroducing Drive I/O into the SQL-only Phase D), or (b) is never converged because Phase D stamps a watermark ≥ the edit's modifiedTime (e.g. stamping `now()` instead of the STAGED instant), so the next cron's watermark gate (`perFileProcessor.ts:214-220`) skips the file forever — the origin incident's permanent-until-edit damage shape, recreated through the new path.

- [ ] **Write failing test** `tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts` (real DB; instants `T0 < T1 < T2`, parses `PARSE_T1` (crew Ada+Bo) and `PARSE_T2` (crew Ada+Bo+Cy, a room renamed) derived from one fixture family):

```ts
test("stage → Doug edit → Phase D applies STAGED content → next cron pass converges to the newest revision", async () => {
  // 1. Live show 'drive-heal-1' synced at T0 (live crew = PARSE_T0.crewMembers).
  // 2. Wizard Phase B at T1: shadow staged with parse PARSE_T1, base_modified_time = T0,
  //    staged_modified_time = T1 (Drive head re-verify passed at T1 — B.2.pre lives in Phase B).
  // 3. DOUG EDIT: Drive modifiedTime becomes T2 (no DB effect yet — the edit is upstream).
  // 4. Phase D fires (SQL-only — no Drive dep injected at all; if Phase D tries Drive I/O the
  //    test's strict fetch stub throws, pinning the §3.4 contract):
  const casRes = await handleOnboardingFinalizeCas(request(), deps);
  expect(casRes.status).toBe(200);
  const show = one(await sql`select id, last_seen_modified_time from public.shows where drive_file_id = 'drive-heal-1'`);
  // Phase D applied the operator-REVIEWED staged parse (T1), not the unreviewed T2:
  const crewAfterD = await sql`select name from public.crew_members where show_id = ${show.id} order by name`;
  expect(crewAfterD.map((c) => c.name)).toEqual(PARSE_T1.crewMembers.map((m) => m.name).sort());
  // Watermark = STAGED instant T1 — strictly LESS than the edit's T2 (the self-heal anchor):
  expect(new Date(show.last_seen_modified_time).toISOString()).toBe(T1);

  // 5. Next cron pass: processOneFile for 'drive-heal-1' with injected deps — fileMeta.modifiedTime = T2,
  //    parse pipeline returning PARSE_T2 (harness per tests/sync DB-backed cron tests).
  const cronResult = await runCronPassForFile("drive-heal-1", { modifiedTime: T2, parseResult: PARSE_T2 });
  expect(cronResult.outcome).not.toBe("skipped");                    // watermark gate FIRED (T2 > T1)
  const crewAfterCron = await sql`select name from public.crew_members where show_id = ${show.id} order by name`;
  expect(crewAfterCron.map((c) => c.name)).toEqual(PARSE_T2.crewMembers.map((m) => m.name).sort());
  const finalShow = one(await sql`select last_seen_modified_time from public.shows where drive_file_id = 'drive-heal-1'`);
  expect(new Date(finalShow.last_seen_modified_time).toISOString()).toBe(T2);
  // Feed/hold state consistent: the cron pass produced feed rows for the T1→T2 delta (Cy added),
  // derived from the fixture diff, and no orphaned open hold exists:
  const feedKinds = await sql`select change_kind from public.show_change_log where show_id = ${show.id}`;
  expect(feedKinds.length).toBeGreaterThan(0);
  expect((await sql`select 1 from public.sync_holds where show_id = ${show.id} and released_at is null`).length).toBe(0);
});

test("negative control: a genuinely current show (no Doug edit) is SKIPPED by the next cron pass", async () => {
  const cronResult = await runCronPassForFile("drive-heal-1", { modifiedTime: T1, parseResult: PARSE_T1 });
  expect(cronResult).toMatchObject({ outcome: "skipped" });          // watermark gate holds — no churn loop
});
```

  (The `sync_holds.released_at` column name must be re-verified against `supabase/migrations/20260608000000_sync_holds.sql` when writing the test — adjust to the actual open-hold predicate `readOpenHolds` uses, `lib/sync/holds/holdPort.ts`.)
- [ ] **Run to verify failure:** `pnpm vitest run tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts` — before T1.5 this fails at step 4 (children don't match `PARSE_T1` — bespoke UPDATE wrote no children). If executed after T1.5 (the normal order), force the red run by temporarily stamping `now()` instead of the staged instant in the apply (the failure mode this test exists for) and confirm the cron-convergence assertion fails; restore.
- [ ] **Implementation:** none expected — this is a pure regression pin over T1.3/T1.5 behavior plus the untouched cron pipeline. Any failure here is a real bug in those tasks; apply `superpowers:systematic-debugging` rather than adjusting the assertions.
- [ ] **Run to pass:** `pnpm vitest run tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts`
- [ ] **Phase close-out:** `pnpm test` (full suite) + `pnpm vitest run tests/db/schema-manifest-lib.test.ts tests/db/validation-schema-parity.test.ts` (Layer-1/2 parity for the T1.3 migration).
- [ ] **Commit:** `test(sync): B→D Doug-edit self-heal convergence regression (bounded staleness, spec §3.4)`

---

## Phase exit criteria

1. All eight tasks committed (one commit per task, conventional-commit format).
2. `pnpm test` green; the pre-existing `applyStaged` suite green WITHOUT modification (except the sanctioned T1.6 append + T1.3 fake-row columns).
3. The origin incident is reproducible as a red test against `main` (T1.3's DB test cherry-picked) and green on this branch — the negative regression the spec's testing spine item 2 demands.
4. `created_show_id` migration applied locally AND to the validation project (surgical apply + `notify pgrst, 'reload schema'`), schema manifest regenerated and committed.
5. The three structural guards (T1.7) have each been observed RED against a deliberately broken variant before their green run.
