# Plan — Rescan decision telemetry observability

Spec: `docs/superpowers/specs/2026-07-17-rescan-decision-telemetry.md` (Codex-APPROVED, 3 rounds).
Branch: `feat/rescan-decision-telemetry`. Non-UI (app/api + lib/onboarding + tests only).

## Meta-test inventory

- **Creates:** none.
- **Extends (executable):** `tests/onboarding/rescanDecision.test.ts`, `tests/onboarding/applyRescanDecisionUnderLock.test.ts`, `tests/api/rescanSheetRoute.test.ts` (+ `tests/api/admin/onboardingMutations-telemetry.test.ts`).
- **Unaffected, must stay green:** `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/log/adminOutcomeBehavior.test.ts` (SHEET_RESCANNED registration + code-on-success unchanged; `extra` additive), `tests/cross-cutting/no-raw-codes.test.ts` (reason tokens in scanner-invisible `rescanReviewCode.ts`, manifest unchanged), `tests/onboarding/_metaRescanDecisionInvariants.test.ts`.

## Advisory-lock topology

N/A — no `pg_advisory*` change. `reviewCodes` is pure computation inside `rescanWizardSheet`'s existing locked tx; the emit is POST-COMMIT outside the lock (unchanged). Single-holder topology untouched.

## Pre-draft code-verification (done in spec; re-confirm at edit time)

All shapes verified live in the spec's §3. **One re-grep before Task 3 edits** (line numbers drift): `grep -rn "toEqual" tests/onboarding/rescanWizardSheet.db.test.ts tests/onboarding/rescanWizardSheetFlowB.db.test.ts` and `grep -rn "dirty_demoted\|status: \"updated\"\|status:\"updated\"" tests/onboarding/` to pin every literal-construction / exact-assertion site that the new required `reviewCodes` field breaks.

## Anti-tautology test rules (this plan)

- `regressedGapClasses` assertions derive the expected class from the fixture's injected warning code (e.g. build a `PULL_SHEET_ON_ARCHIVED_TAB` warning, assert that exact string appears) — never hardcode a class the fixture didn't produce.
- Completeness test asserts `reviewCodes.length > 0` for EACH of the four drivers independently (crew-invariant, gap-regression, corrupt-prior, null-approver), and asserts the SPECIFIC token for each — not just "non-empty."
- Explicit negative: a sentinel-only staged row + no driver → CLEAN — the `SHEET_RESCANNED` emit STILL fires (every `status:"updated"` emits) with `demoted:false` and `reviewCodes: []` (empty, not absent; `[]` = "no demote cause"). Assert `reviewCodes === []`, NOT that the field is missing. And a gap-driven demote whose staged row ALSO carries a sentinel → `reviewCodes` contains the gap class but NOT the sentinel invariant (proves exclusion, not just presence).
- Route emit test spies the log sink and asserts `context.demoted/changed/needsReview/reviewCodes` are present with the exact decision values — asserts against the sink record, not the mapResult JSON (which is unchanged).

## Fix-round regression budget

After each task: re-run the task's test + `tests/log/adminOutcomeBehavior.test.ts` + `tests/cross-cutting/no-raw-codes.test.ts` (the two guards most at risk). Before push: full `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm format:check`.

---

## Task 1 — `computeRescanDecision` exposes `regressedGapClasses`

**RED** (`tests/onboarding/rescanDecision.test.ts`): add cases asserting the new field:
- present baseline, `PULL_SHEET_ON_ARCHIVED_TAB` 0→1 → `regressedGapClasses` contains `"PULL_SHEET_ON_ARCHIVED_TAB"`, `dirty=true`.
- null baseline + standing gap → `regressedGapClasses=[]`, `dirty=false` (PR #410 case; re-pins it).
- ambiguity-only increase → `regressedGapClasses=[]`, `dirty=false`.
- present baseline, no increase → `regressedGapClasses=[]`.
- deterministic order (two classes regress → order = `Object.keys(newGaps)`).

**GREEN** (`lib/onboarding/rescanDecision.ts`): return `{ dirty, decisionItems, regressedGapClasses }`. `regressedGapClasses = priorGaps == null ? [] : (Object.keys(newGaps) as …).filter(cls => !isAmbiguityCode(cls) && newGaps[cls] > priorGaps[cls])`. `dirty = decisionItems.length>0 || regressedGapClasses.length>0` (provably ≡ prior `gapRegressed`). Remove the standalone `gapRegressed` boolean.

**Failure mode caught:** a demote whose only driver is a gap regression would otherwise carry no machine-readable cause.

Commit: `feat(onboarding): computeRescanDecision returns regressedGapClasses`.

## Task 2 — apply layer: reason constants + `reviewCodes` on `dirty_demoted`

**Per-task-green rule (plan R1 finding 1):** `dirty_demoted` gains a REQUIRED `reviewCodes` field, so EVERY `RescanDecisionOutcome`-typed construction site must be fixed IN THIS COMMIT or typecheck breaks before Task 3. Complete site list (verified live):
- `tests/onboarding/_finalizeFake.ts:459` (return typed via `FinalizeRouteDeps["applyRescanDecisionUnderLock"]`).
- `tests/onboarding/finalizeInlineRescan.test.ts:106` (typed `Promise<RescanDecisionOutcome>`).
- `tests/onboarding/applyRescanDecisionUnderLock.test.ts:242,309` (exact `toEqual` on the `dirty_demoted` return — add expected `reviewCodes`).
- `tests/onboarding/rescanCheckpointReopen.test.ts:93` (verify at edit; add `reviewCodes` if the `outcome` literal is `RescanDecisionOutcome`-typed).
- NOT affected: `tests/admin/mapRoleTokenStagedAction.test.ts` (mock is `Promise<unknown>`), component/e2e `status:"updated"` (JSON mocks, not this union).

**RED** (`tests/onboarding/applyRescanDecisionUnderLock.test.ts`): per-driver `reviewCodes` assertions (gap → gap class; MI-11 → `"MI-11"`; corrupt prior → `"PRIOR_PARSE_UNREADABLE"`; null approver → `"PRIOR_APPROVER_UNATTRIBUTABLE"`); dedup; sentinel-excluded case (gap-driven demote whose staged row also carries a sentinel → `reviewCodes` has the gap class, NOT the sentinel invariant). Reference the two tokens by imported symbol.

**GREEN:**
- `lib/onboarding/rescanReviewCode.ts`: add `export const PRIOR_PARSE_UNREADABLE = "PRIOR_PARSE_UNREADABLE" as const;` and `export const PRIOR_APPROVER_UNATTRIBUTABLE = "PRIOR_APPROVER_UNATTRIBUTABLE" as const;` with a comment: telemetry-diagnostic reason tokens (scanner-invisible file by design; see spec §4.2).
- `lib/onboarding/applyRescanDecisionUnderLock.ts`: `RescanDecisionOutcome` `dirty_demoted` → `{ kind:"dirty_demoted"; changed:boolean; reviewCodes:string[] }`. At the `computeRescanDecision` call (`:279-283`) destructure `regressedGapClasses` too. In the dirty block (`:298-311`) build `reviewCodes` (deduped, order-stable `Set`) = `decisionItems.map(i=>i.invariant)` ++ `regressedGapClasses` ++ conditional `PRIOR_PARSE_UNREADABLE` (when `prior.priorReady && prior.priorParse===null`) / `PRIOR_APPROVER_UNATTRIBUTABLE` (when `prior.priorReady && prior.priorApprovedByEmail===null`). Return it on the variant. **Do NOT include `sentinelItems`.**

**Green gate before commit:** `pnpm typecheck` + `applyRescanDecisionUnderLock.test.ts` + `finalizeInlineRescan.test.ts` + `rescanCheckpointReopen.test.ts` + `no-raw-codes.test.ts` (scanner-invisibility) all green.

Commit: `feat(onboarding): dirty_demoted carries causal reviewCodes`.

## Task 3 — thread `reviewCodes` through `RescanResult`

**Per-task-green rule (plan R1 finding 2):** `RescanResult.updated` gains a REQUIRED `reviewCodes` field. Fix EVERY `RescanResult`-typed / exact-`toEqual` site IN THIS COMMIT. Complete site list (verified live):
- Source: `lib/onboarding/rescanWizardSheet.ts:27` (union) + mapping `:266` (dirty → `outcome.reviewCodes`), `:269`,`:272` (clean → `[]`).
- `tests/api/rescanSheetRoute.test.ts`: typed `rescanMock(result: RescanResult)` `:37`; INPUT `RescanResult` literals `:51,74,96,113`; `test.each<[RescanResult,…]>` inputs `:129,133`. **The EXPECTED mapResult JSON (`:130,134` and the per-case `toEqual` targets) stays WITHOUT `reviewCodes`** — mapResult is unchanged; this positively proves `reviewCodes` never leaks to the client JSON (anti-tautology bonus).
- `tests/onboarding/rescanWizardSheet.db.test.ts`: exact `toEqual` `:361,407,439,585,640` (add expected `reviewCodes`); `let result: RescanResult` `:536`.
- `tests/onboarding/rescanWizardSheetFlowB.db.test.ts:516` (exact `toEqual`).
- NOT affected: `rescanCheckpointReopen.test.ts:96,106` (`toMatchObject`, partial); component/e2e/JSON-mock `status:"updated"` sites (`RescanSheetButton.test.tsx`, `step3ReviewModal.transitions.test.tsx`, `Step3ReviewModal.test.tsx`, `_step3ReviewModalLiveEntry.tsx`, `adminOutcomeBehavior.test.ts:1599`, `pullSheetOverrideRoute.test.ts:63`, `mapRoleTokenStagedAction.test.ts`) — none typed as `RescanResult`.

**RED:** in the DB tests add a positive assertion — a demote path returns `reviewCodes` with the expected cause; a clean path returns `reviewCodes: []`.

**GREEN** (`lib/onboarding/rescanWizardSheet.ts`): union + mapping per the list above.

**Failure mode caught:** required-field addition silently missed at a construction site → typecheck/exact-assertion breakage.

**Green gate before commit:** `pnpm typecheck` + `rescanSheetRoute.test.ts` + `rescanWizardSheet.db.test.ts` + `rescanWizardSheetFlowB.db.test.ts` green.

Commit: `feat(onboarding): RescanResult.updated carries reviewCodes`.

## Task 4 — route emit enrichment

No type change (Task 3 already made `rescanSheetRoute.test.ts` compile). This task adds behavior + its assertion.

**RED** (`tests/api/admin/onboardingMutations-telemetry.test.ts` — update the `:41` mock to return `demoted` + `reviewCodes`; and/or `tests/api/rescanSheetRoute.test.ts`): sink-spy asserts the `SHEET_RESCANNED` emit's `context` carries `demoted`, `changed`, `needsReview`, `reviewCodes` with the exact values from a demote result (`reviewCodes` = the cause) and from a clean result (`reviewCodes:[]`). Assert against the sink record, NOT `mapResult`.

**GREEN** (`app/api/admin/onboarding/rescan-sheet/route.ts`): add `extra: { demoted: result.demoted, changed: result.changed, needsReview: result.needsReview, reviewCodes: result.reviewCodes }` to the existing `logAdminOutcome` call (`:118`). `mapResult` unchanged.

**Green gate before commit:** touched telemetry test + `adminOutcomeBehavior.test.ts` + `_metaMutationSurfaceObservability.test.ts` green.

Commit: `feat(admin): SHEET_RESCANNED emit carries the rescan decision`.

## Task 5 — full verification + docs

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, full `pnpm test`.
- Manual observe-shape sanity: confirm `pnpm observe events --code SHEET_RESCANNED --json` would surface `context.demoted/reviewCodes` (read-path is `context` verbatim; no CLI change).
- Update the memory contract note (post-merge).

Commit (if only docs/verification residue): `test(onboarding): rescan-decision telemetry verification` — else fold into Task 4.

## Out of scope

UI Resolve-box actionable warning + override; a dedicated `observe --demoted` flag. (Spec §10.)
