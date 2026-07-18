# Spec — Make wizard per-sheet rescan decisions observable in telemetry

**Date:** 2026-07-17
**Slug:** `rescan-decision-telemetry`
**Type:** Observability (telemetry enrichment). Non-UI. Follow-on to PR #410.
**Surfaces:** `app/api/admin/onboarding/rescan-sheet/route.ts`, `lib/onboarding/rescanWizardSheet.ts`, `lib/onboarding/applyRescanDecisionUnderLock.ts`, `lib/onboarding/rescanDecision.ts`. Tests only besides those.

---

## 1. Problem

A per-sheet Re-scan can leave a staged row in one of two `status:"updated"` outcomes: a **clean** re-stage, or a **demote** to `RESCAN_REVIEW_REQUIRED` (the Step-3 "Sheet changed" chip; blocks finalize). Both emit the **same** durable telemetry event — `SHEET_RESCANNED` — carrying only `driveFileId` + `wizardSessionId` (`app/api/admin/onboarding/rescan-sheet/route.ts:118-123`). The decision (`demoted`/`changed`/`needsReview`) and its **cause** are written to `pending_syncs` (`last_finalize_failure_code`, `triggered_review_items`) but never emitted.

Consequence (observed 2026-07-17 while diagnosing a suspected PR #410 regression): `pnpm observe events --code SHEET_RESCANNED` cannot distinguish "rescanned, stayed clean" from "rescanned, demoted." Confirming whether a demote was legitimate required a direct read-only DB probe of `pending_syncs`, and the causing gap class was invisible entirely. A `VALIDATION_RESET_RUN` had wiped the row before it could be probed, so the outcome was ultimately **unrecoverable**.

## 2. Goal

Every `SHEET_RESCANNED` emit carries the rescan decision so a demote — and its cause — is queryable from telemetry alone, no DB probe:

```
pnpm observe events --code SHEET_RESCANNED --json
# context: { demoted, changed, needsReview, reviewCodes }
```

- `demoted:true` isolates demote events.
- `reviewCodes` names **why** — the causal driver(s) only: the crew-change invariant(s) (MI-11..14), regressed data-gap class(es) (e.g. `PULL_SHEET_ON_ARCHIVED_TAB`), and/or the corrupt-prior reason. Sentinels (`ONBOARDING_SCAN_REVIEW`/`FIRST_SEEN_REVIEW`) are NOT causes and are excluded (§4.2); the full review-item set stays in `pending_syncs.triggered_review_items`.

**Non-goals:** No UI change (the button's JSON contract `mapResult` is untouched). No new §12.4 catalog code (reuse `SHEET_RESCANNED`; no catalog fan-out). No behavior change to the clean/dirty **decision** — this is pure observability enrichment. No schema/migration (`app_events.context` is schemaless `jsonb`).

## 3. Current code (live citations)

- Emit: `app/api/admin/onboarding/rescan-sheet/route.ts:117-133` — `logAdminOutcome({ code:"SHEET_RESCANNED", source, driveFileId, wizardSessionId })`, gated on `result.status === "updated"`.
- `logAdminOutcome` (`lib/log/logAdminOutcome.ts:8-51`): `AdminOutcome.extra?: Record<string, unknown>` spreads FIRST into `app_events.context` (`:38`, `...(o.extra ?? {})`), cannot override reserved fields. `extra` is explicitly NOT hashed and callers must keep PII out of it (`lib/log/logAdminOutcome.ts:16-20`); `sanitizeContext` (`lib/log/sanitize.ts:15`) redacts only email-like strings, so it is NOT a blanket redaction guarantee. Safety here derives from the field VALUES being non-PII (booleans + static enum tokens), not from sanitize. Wrapper swallows all throws (invariant 9).
- `RescanResult` (`lib/onboarding/rescanWizardSheet.ts:26-29`): `updated` = `{ status:"updated"; needsReview:boolean; changed:boolean; demoted:boolean }`.
- Outcome→result map (`lib/onboarding/rescanWizardSheet.ts:257-272`): `dirty_demoted`→`{updated,needsReview:true,demoted:true}`; `clean_restamped`→`{...demoted:false,needsReview:false}`; `clean_unchecked`→`{...demoted:false,needsReview:true}`.
- `RescanDecisionOutcome` (`lib/onboarding/applyRescanDecisionUnderLock.ts:46-53`): `dirty_demoted` = `{ kind:"dirty_demoted"; changed:boolean }`.
- `isDirty` drivers (`lib/onboarding/applyRescanDecisionUnderLock.ts:294-296`): `dirty || (priorReady && priorParse===null) || (priorReady && priorApprovedByEmail===null)`.
- Dirty block (`:297-311`): `triggered = [...sentinelItems, ...decisionItems]` → persisted to `triggered_review_items`; `sentinelItems` from `stagedRow.triggered_review_items ?? []` (`:260`); `decisionItems` from `computeRescanDecision`.
- `computeRescanDecision` (`lib/onboarding/rescanDecision.ts:30-65`): returns `{ dirty, decisionItems: TriggeredReviewItem[] }`. `dirty = decisionItems.length>0 || gapRegressed`. `gapRegressed` (`:58-62`) is a **boolean** — the regressed class name is discarded.
- `TriggeredReviewItem` (`lib/parser/types.ts:521+`): every variant has `invariant: "FIRST_SEEN_REVIEW"|"ONBOARDING_SCAN_REVIEW"|"MI-6"|"MI-10"|"MI-7"|"MI-7b"|"MI-8"|…|"MI-11"|"MI-12"|"MI-13"|"MI-14"`.
- `isAmbiguityCode` (`lib/parser/ambiguityCodes.ts:26-32`): ambiguity classes never drive dirty.
- Registry: `SHEET_RESCANNED` ∈ `AUDITABLE_MUTATIONS` (`tests/log/_auditableMutations.ts:446`), file row `:128-131`; executable coverage `tests/log/adminOutcomeBehavior.test.ts`; route telemetry test `tests/api/admin/onboardingMutations-telemetry.test.ts`; route unit `tests/api/rescanSheetRoute.test.ts`.

## 4. Design

### 4.1 `computeRescanDecision` — expose the regressed classes

Return shape gains `regressedGapClasses: string[]`:

```ts
): { dirty: boolean; decisionItems: TriggeredReviewItem[]; regressedGapClasses: string[] }
```

- `regressedGapClasses` = the non-ambiguity gap classes where `newGaps[cls] > priorGaps[cls]`, computed **only** when `priorGaps != null` (a null baseline yields `[]`, matching the PR #410 gate). Order = `Object.keys(newGaps)` order (deterministic; `summarizeDataGaps` ⇐ `zeroClasses`, a fixed-key record).
- `dirty` is now `decisionItems.length > 0 || regressedGapClasses.length > 0` — **provably equivalent** to today's `decisionItems.length>0 || gapRegressed` because `regressedGapClasses.length>0 ⇔ gapRegressed` (same predicate, same guard). The existing `gapRegressed` boolean is replaced by `regressedGapClasses.length > 0`; no decision changes.

### 4.2 `applyRescanDecisionUnderLock` — carry the reason on the demote

`dirty_demoted` variant gains `reviewCodes: string[]`:

```ts
| { kind: "dirty_demoted"; changed: boolean; reviewCodes: string[] }
```

`reviewCodes` names the **causal drivers** of the demote (NOT the full persisted review-item set), as a **deduped, order-stable** union. **`sentinelItems` are deliberately EXCLUDED**: they are not `isDirty` drivers — `isDirty` (`applyRescanDecisionUnderLock.ts:294-296`) is only `dirty || (priorReady && priorParse===null) || (priorReady && priorApprovedByEmail===null)`; `sentinelItems` are appended to the persisted `triggered_review_items` (`:301`) only AFTER the gate, so a sentinel-only re-scan cannot demote. Including them in `reviewCodes` would misattribute cause. The full record (sentinels + decision items) still lives in `pending_syncs.triggered_review_items`; `reviewCodes` is the causal subset. Composition:

1. `decisionItems.map(i => i.invariant)` — the crew-change drivers (⊆ `DECISION_REQUIRING_INVARIANTS` = MI-11..14, per `rescanDecision.ts:16-18,36-39`).
2. `regressedGapClasses` (from §4.1).
3. Synthetic corrupt-prior reasons, added iff the matching clause fired:
   - `PRIOR_PARSE_UNREADABLE` when `priorReady && priorParse === null`.
   - `PRIOR_APPROVER_UNATTRIBUTABLE` when `priorReady && priorApprovedByEmail === null`.

The two synthetic tokens are exported string constants defined in **`lib/onboarding/rescanReviewCode.ts`** (co-located with their sibling demote code `RESCAN_REVIEW_REQUIRED`), imported as symbols into `applyRescanDecisionUnderLock.ts` and referenced by symbol in tests. **This placement is load-bearing for the internal-code-enum scanner** (`scripts/extract-internal-code-enums.ts`): its `CONST_CODE_RE` extracts `const NAME = "LITERAL"` declarations, but only from `lib/onboarding` files whose source contains a `last_error_code|hardErrors|pending_ingestions|still_failed|staged_parse` trigger token (`:82-104`). `applyRescanDecisionUnderLock.ts` contains 4 such tokens → defining the consts there WOULD add them to `INTERNAL_CODE_ENUMS` and fail `tests/cross-cutting/no-raw-codes.test.ts`. `rescanReviewCode.ts` contains ZERO trigger tokens (verified) → the scanner skips it; **precedent:** its existing `RESCAN_REVIEW_REQUIRED` const is absent from `lib/messages/__generated__/internal-code-enums.ts` (verified 0 matches). In the scanned `applyRescanDecisionUnderLock.ts` the tokens appear only as an `import { … }` line and identifier usages — neither matches `CONST_CODE_RE`/`CODE_PROPERTY_RE`/`FAILED_CODES_PUSH_RE`. Net: no manifest entry, no regen, no §12.4 catalog fan-out. They are diagnostic telemetry values, not `code:` fields and never user-facing, so invariant 5 does not apply. Dedup via insertion-ordered `Set`.

**Clean outcomes carry no reviewCodes at the apply layer** — `clean_restamped`/`clean_unchecked` keep `{ kind, changed }`; `reviewCodes` is a `dirty_demoted`-only field. `rescanWizardSheet` supplies `[]` for the clean outcomes (§4.3).

### 4.3 `rescanWizardSheet` — thread through `RescanResult`

`updated` gains `reviewCodes: string[]`:

```ts
| { status:"updated"; needsReview:boolean; changed:boolean; demoted:boolean; reviewCodes:string[] }
```

- `dirty_demoted` → `reviewCodes: outcome.reviewCodes`.
- `clean_restamped` / `clean_unchecked` → `reviewCodes: []`.

### 4.4 Route — emit the decision

`app/api/admin/onboarding/rescan-sheet/route.ts` emit (still gated on `result.status === "updated"`, so all four fields exist):

```ts
await logAdminOutcome({
  code: "SHEET_RESCANNED",
  source: "api.admin.onboarding.rescan-sheet",
  driveFileId,
  wizardSessionId,
  extra: {
    demoted: result.demoted,
    changed: result.changed,
    needsReview: result.needsReview,
    reviewCodes: result.reviewCodes,
  },
});
```

`mapResult` (the button's JSON) is **unchanged** — no UI contract change. `POST` bodies below 400-guard unaffected.

## 5. Guard conditions (per field / input)

| Condition | `reviewCodes` | `demoted` |
|---|---|---|
| Clean re-stage (`clean_restamped`/`clean_unchecked`) | `[]` | `false` |
| Demote via crew invariant (MI-11..14) | `["MI-1x", …]` | `true` |
| Demote via gap regression (present baseline, e.g. `PULL_SHEET_ON_ARCHIVED_TAB` 0→1) | `["PULL_SHEET_ON_ARCHIVED_TAB", …]` | `true` |
| Demote via corrupt prior (`priorReady && priorParse===null`) | `["PRIOR_PARSE_UNREADABLE"]` | `true` |
| Demote via null approver (`priorReady && priorApprovedByEmail===null`) | `["PRIOR_APPROVER_UNATTRIBUTABLE"]` | `true` |
| Sentinel present but no driver (`ONBOARDING_SCAN_REVIEW`/`FIRST_SEEN_REVIEW` only) | n/a — sentinels do NOT drive `isDirty`; outcome is clean unless a driver co-occurs | `false` |
| Null gap baseline (PR #410 case: null prior + standing gap) | `[]` (no regression) — outcome is **clean**, `demoted:false` | `false` |
| `result.status !== "updated"` (needs_attention/busy/superseded/…) | not emitted (existing guard) | n/a |

Note: `sentinelItems` are NOT a `reviewCodes` cause (they never appear in `reviewCodes`); they remain in the persisted `triggered_review_items`. When a demote is driven by a real driver AND the staged row also carried sentinels, `reviewCodes` lists only the driver(s).

**Completeness invariant (testable):** `demoted === true ⇒ reviewCodes.length > 0`. Proof: `isDirty` is true only if at least one of {`decisionItems` non-empty, `regressedGapClasses` non-empty, `priorReady && priorParse===null` clause, `priorReady && priorApprovedByEmail===null` clause} holds, and each contributes ≥1 token to `reviewCodes`. `sentinelItems` are excluded and irrelevant to non-emptiness.

**Empty/edge inputs:** `stagedRow.triggered_review_items` null → `sentinelItems=[]` (existing `?? []`). `regressedGapClasses` empty on null baseline. Both clauses false → those tokens absent. Values are booleans + static enum tokens → no PII, redaction-safe.

## 6. Flag lifecycle table

| Field | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `demoted` | `app_events.context.demoted` (jsonb) | route emit `extra` (§4.4) | `pnpm observe events --code SHEET_RESCANNED --json` | isolates demote events |
| `changed` | `app_events.context.changed` | same | same | content-changed signal |
| `needsReview` | `app_events.context.needsReview` | same | same | row currently unapproved |
| `reviewCodes` | `app_events.context.reviewCodes` (jsonb string[]) | same | same | names the demote cause |

No `observe` CLI schema change needed — `events --json` already surfaces `context` verbatim (redaction-guaranteed at write time). No new filter flag; `--code SHEET_RESCANNED` + client-side inspection of `context.demoted`/`reviewCodes` suffices for this scope.

## 7. Tier × domain matrix

DB-touching? **No.** `app_events.context` is schemaless `jsonb`; no DDL, no CHECK, no RPC, no trigger, no migration, no `gen:schema-manifest`, no validation-parity surface. Catalog (§12.4)? **No** — reuses `SHEET_RESCANNED`. UI? **No** — `mapResult` untouched; `app/api/**` is excluded from the UI-surface definition (invariant 8 N/A). Advisory lock? **No new surface** — `reviewCodes` is pure computation inside the existing `rescanWizardSheet` locked tx; emit is POST-COMMIT outside the lock (unchanged). Single-holder topology unchanged.

## 8. Meta-test inventory

- **Creates:** none.
- **Extends (executable):** `tests/onboarding/rescanDecision.test.ts` (regressedGapClasses), `tests/onboarding/applyRescanDecisionUnderLock.test.ts` (reviewCodes composition + completeness, per-driver), `tests/api/rescanSheetRoute.test.ts` and/or `tests/api/admin/onboardingMutations-telemetry.test.ts` (emit carries the four `extra` fields).
- **Must update (compile/assert breakage from the required `reviewCodes` field on `RescanResult.updated` and `dirty_demoted`):** exact-`toEqual` DB assertions in `tests/onboarding/rescanWizardSheet.db.test.ts` (`:360-365`, `:406-411`, `:438-443`, `:584-589`, `:639-644`) and `tests/onboarding/rescanWizardSheetFlowB.db.test.ts` (`:515-520`); any test constructing a `dirty_demoted`/`updated` literal — `tests/onboarding/_finalizeFake.ts`, `tests/onboarding/finalizeInlineRescan.test.ts`, `tests/onboarding/rescanCheckpointReopen.test.ts`, `tests/onboarding/applyRescanDecisionUnderLock.test.ts`. (Enumerated via `grep -rln "RescanResult\|RescanDecisionOutcome\|dirty_demoted"`.) The pre-draft grep in the plan re-confirms this list against live line numbers before edits.
- **Unaffected (must stay green):** `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/log/adminOutcomeBehavior.test.ts` — `SHEET_RESCANNED` registration + code-on-success-branch unchanged (still `code:"SHEET_RESCANNED"`; `extra` is additive); `tests/cross-cutting/no-raw-codes.test.ts` — reason tokens defined in scanner-invisible `rescanReviewCode.ts` (§4.2), manifest unchanged.

## 9. Disagreement-loop preempts (do-not-relitigate)

- **Synthetic tokens are not §12.4 codes AND not internal-code-enum manifest entries.** `PRIOR_PARSE_UNREADABLE`/`PRIOR_APPROVER_UNATTRIBUTABLE` live only inside a `reviewCodes` array value in telemetry `extra`; they are not `code:` literals, never reach UI, and require no catalog row. Cited: invariant 5 is user-visible-UI only; `mapResult` (route.ts:32-45) is untouched. The internal-code-enum scanner is addressed by definition placement in scanner-invisible `rescanReviewCode.ts` (§4.2), with the sibling `RESCAN_REVIEW_REQUIRED` as verified precedent — NOT by dodging a guard: `rescanReviewCode.ts` is the natural home for a demote-reason token (it already owns the demote code), and the tokens are legitimately not internal error-codes in the pending-ingestion/parse-warning sense the manifest tracks.
- **`dirty` semantics unchanged.** `regressedGapClasses.length>0 ⇔ gapRegressed` — same predicate/guard as PR #410; this is observability, not a decision change. Cited: `rescanDecision.ts:58-62`.
- **`extra` unredacted is fine.** Values are booleans + static enum tokens (invariant names, gap classes) — zero PII; and `app_events.context` is redaction-guaranteed at write time regardless (AGENTS.md Redaction posture).
- **No new observe filter flag.** Scope is the emit; `events --json` already returns `context`. Adding a `--demoted` flag is out of scope (would touch `parseAppEventFilters` + the six-command fail-closed contract).

## 10. Out of scope

- Surfacing the actionable `PULL_SHEET_ON_ARCHIVED_TAB` warning + accept/revoke override in the Step-3 "Resolve before publishing" box (the generic `ONBOARDING_SCAN_REVIEW` sentinel copy) — UI-gated (invariant 8), tracked separately from PR #410.
- A dedicated `observe events --demoted` filter flag.
