# Tasks — Remove Admin Field-Override Feature

All paths relative to the worktree root. Run all commands from the worktree. `PW=` prefix means Playwright/browser task. Every task's final step is `pnpm typecheck` green + the §7.5 sweep for symbols it removed.

## Feature-test deletion schedule (CRITICAL — build-safety)

`tsconfig.json:31-32` includes `**/*.ts` + `**/*.tsx`, so `pnpm typecheck` compiles `tests/**` too. A feature-only test that imports a removed source file therefore **breaks typecheck at the boundary of the task that removes that source** — deletions cannot be deferred to a final task. **Rule:** each feature-only test file is `git rm`'d **in the same task that first removes a symbol/file it imports**, as part of that task's steps (before its `pnpm typecheck`). The assignment below is derived from the import map; the per-task typecheck is the enforcement (a dangling test import fails it).

| Deletion task | Feature-only test files (`git rm` in that task) |
|---|---|
| **Task 1** | `tests/overrides/wizardLiveSource.test.ts` (imports `_actions/overrides` + renders sections with the removed `liveOverrides` prop) |
| **Task 2** | `tests/admin/showOverrideBlocks.test.tsx`, `tests/components/overrides/OverrideableField.test.tsx`, `tests/components/overrides/OverrideableField.transitions.test.tsx`, `tests/e2e/_overrideableFieldHarness.tsx`, `tests/e2e/overrideableField.layout.spec.ts`, `tests/overrides/setFieldOverrideActionShapeGuard.test.ts`, `tests/overrides/adminOpAlertLifecycle.test.ts` (all import `components/admin/overrides/*` or `_actions/overrides`; `adminOpAlertLifecycle` imports `_actions/overrides` at its `:88` — earliest deleter is Task 2, so it is deleted here even though it also imports `lib/overrides/setFieldOverride` which Task 6 removes) |
| **Task 3** | `tests/admin/needsAttentionOverride.test.ts` (asserts the removed override needs-attention stream) |
| **Task 4** | `tests/sync/{overrideApply,overrideShowHotel,overrideShowHotelWiring,commitOverrideSideEffects,commitOverrideSideEffectsDb,reconcileCrewOverrides}.test.ts`, `tests/overrides/alertLifecycle.test.ts`, `tests/sync/applyParseResult.holdAware.undoOverride.test.ts` (override-specific). **EDIT (not delete):** `tests/sync/_holdAwareTestkit.ts` — it imports only `type { FullCrewRow }` from the deleted `reconcileCrewOverrides.ts` (`:21`) and is a SHARED testkit for ~14 surviving hold-aware tests; inline `FullCrewRow` locally (the full `crew_members` row shape) so those tests keep compiling. |
| **Task 5** | `tests/crew/nameOverrideVisibilityAlias.test.tsx` |
| **Task 6** | remaining `tests/overrides/*`: `setFieldOverrideCore`, `setFieldOverride.unit`, `setFieldOverride`, `validateOverrideValue`, `loadShowOverridesOrphans`, `loadShowOverridesHotelDisambiguation`, `hotelDisambiguator`, `matchOverrideTarget`, `_metaHotelMatchKeyParsedIdentity` (all import `lib/overrides/*`) |
| **Task 8** | `tests/db/setFieldOverrideGrants.test.ts` |

Tests that are **edited, not deleted** (remove override assertions, keep the file): the meta-tests in §3.6, the needs-attention count tests, the crew-alias test surfaces (§3.2b), `tests/db/{postgrest-dml-lockdown,showCacheRevalidateCoverage}.test.ts`, `tests/sync/_holdAwareTestkit.ts`. After removing the override branch from `applyParseResult`, the ~14 non-override hold-aware tests (`applyParseResult.holdAware.*` except `undoOverride`) exercise the surviving `else` path and must stay GREEN unchanged — Task 4 runs them to confirm.

---

### Task 1: Remove wizard override UI (rows + prop threading)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (remove `WizardOverrideRow` `:868`, 6 call sites `:966,1369,1380,1603,2404,2421`, `liveOverrides?` on 5 section prop types `:938,1289,1561,2355,3161` + spread `:3656-3745`, override imports `:117-133`, consts `:848-852`)
- Modify: `components/admin/wizard/Step3SheetCard.tsx:603-607` (drop `liveOverrides` threading)
- Modify: `components/admin/wizard/Step3Review.tsx` (drop `liveOverrides` from `Step3Row` type)
- Test: `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` (conditional-render count), `tests/overrides/wizardLiveSource.test.ts` (deleted in its task — see deletion schedule)

**Interfaces:**
- Produces: `CrewBreakdown`, `VenueBreakdown`, `HotelsBreakdown`, `ScheduleBreakdown` no longer accept a `liveOverrides` prop. `SectionData` (in `step3ReviewSections.tsx`) drops its `liveOverrides?` field.

- [ ] **Step 1: Failing test — the review sections render with no override rows and no `liveOverrides` prop.** In a new `tests/components/admin/wizard/noOverrideRows.test.tsx`, render `CrewBreakdown`/`VenueBreakdown`/`ScheduleBreakdown` with only parse data (no `liveOverrides`) and assert `queryByTestId(/^wizard-override-/)` is null and `queryByTestId(/^override-unavailable-/)` is null:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { CrewBreakdown, VenueBreakdown } from "@/components/admin/wizard/step3ReviewSections";

describe("wizard review sections — no override affordances after teardown", () => {
  it("CrewBreakdown renders identity + fields, no override rows", () => {
    render(h(CrewBreakdown, { dfid: "d1", members: [{ name: "A", email: null, phone: null, role: "A1", role_flags: [], date_restriction: { kind: "none" }, stage_restriction: { kind: "none" }, flight_info: null }] }));
    expect(screen.queryByTestId(/^wizard-override-/)).toBeNull();
    expect(screen.queryByTestId(/^override-unavailable-/)).toBeNull();
  });
  it("VenueBreakdown accepts no liveOverrides prop (type-level) and renders venue", () => {
    render(h(VenueBreakdown, { dfid: "d1", venue: { name: "Hall", address: null, city: null, loadingDock: null, googleLink: null } }));
    expect(screen.queryByTestId(/^wizard-override-/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`liveOverrides` prop still exists / rows still render): `pnpm vitest run tests/components/admin/wizard/noOverrideRows.test.tsx`
- [ ] **Step 3: Remove** `WizardOverrideRow`, its 6 call sites, the `liveOverrides?` prop from every section type + `SectionData`, the spread threading, override imports (`loadShowOverrides`, `makeRepointTargetIndex`, `OverrideFieldView`, etc.), and the `OVERRIDE_UNAVAILABLE_HINT`/related consts. In `Step3SheetCard.tsx` and `Step3Review.tsx` drop the `liveOverrides` plumbing.
- [ ] **Step 4: Update the transition-audit count.** In `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`, the conditional-render count assertion (currently `14`) is unaffected by *this* file (override rows live in `step3ReviewSections.tsx`, not the modal) — confirm by running it; adjust only if it references removed sites.
- [ ] **Step 5: Run — expect PASS** + `pnpm typecheck`: `pnpm vitest run tests/components/admin/wizard/noOverrideRows.test.tsx && pnpm typecheck 2>&1 | grep -E "step3Review|Step3SheetCard" || echo "no typecheck errors in touched files"`
- [ ] **Step 6: §7.5 sweep** — `grep -rn "WizardOverrideRow\|liveOverrides\|OVERRIDE_UNAVAILABLE_HINT" components/admin/wizard` returns zero.
- [ ] **Step 7: Commit** — `git add -A && git commit --no-verify -m "refactor(admin): remove wizard field-override rows + liveOverrides threading"`

---

### Task 2: Remove live-show override blocks + onboarding + server action (+ AUDITABLE_MUTATIONS deregistration)

**Files:**
- Delete: `components/admin/overrides/OverrideableField.tsx`, `components/admin/overrides/ShowOverrideBlocks.tsx`, `app/admin/show/[slug]/_actions/overrides.ts`
- Modify: `app/admin/show/[slug]/page.tsx:39-46,409-427,685-811` (drop `loadShowOverrides` call + override-blocks mount; keep the crew read but see Task 5 for the `sheet_name` select column)
- Modify: `components/admin/OnboardingWizard.tsx:38-41,520-578,706-731` (drop `liveOverridesByDfid` build + row attach)
- Modify: `tests/log/_auditableMutations.ts:315-332,427-430` (remove FIELD_OVERRIDE_SET/REVERTED/REPOINTED/DISCARDED rows), `tests/log/adminOutcomeBehavior.test.ts:271-273,1565-1618` (remove `setFieldOverrideAction` import + per-op block)
- Modify: `tests/messages/_metaEmphasisRenderContract.test.ts:49-53` (remove the `SAFE_PLAINTEXT_REGISTRY` row for the now-deleted `components/admin/overrides/OverrideableField.tsx` — the meta-test's stale-entry guard at its `:24` comment fails a registry row whose file no longer exists)
- Test: `tests/admin/showOverrideBlocks.test.tsx`, `tests/overrides/adminOpAlertLifecycle.test.ts` (deleted in this task — see deletion schedule); `tests/log/_metaMutationSurfaceObservability.test.ts` + `tests/messages/_metaEmphasisRenderContract.test.ts` (must stay green — the deleted action file drops out of discovery; the stale registry row is removed)

**Interfaces:**
- Consumes: nothing (leaf UI). Produces: `app/admin/show/[slug]/page.tsx` renders show/crew/hotel read-only; `_actions/overrides.ts` gone.

- [ ] **Step 1: Failing test — the mutation-surface + AUDITABLE_MUTATIONS meta-tests must be green with the override action GONE.** First delete `app/admin/show/[slug]/_actions/overrides.ts`, then run `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/adminOutcomeBehavior.test.ts` — expect FAIL (registry rows reference a now-missing action / discovered surface mismatch).
- [ ] **Step 2: Deregister** — remove the FIELD_OVERRIDE_* rows from `tests/log/_auditableMutations.ts` (both the definitions `:315-332` and the array membership `:427-430`) and the `setFieldOverrideAction`/`SetFieldOverrideParams` import + per-op outcome block in `adminOutcomeBehavior.test.ts:271-273,1565-1618`.
- [ ] **Step 3: Remove UI** — delete `components/admin/overrides/` (both files); in `page.tsx` remove the `loadShowOverrides` import/call (`:39-46`) and the override-blocks mount (`:409-427,685-811`); in `OnboardingWizard.tsx` remove `liveOverridesByDfid` (`:38-41,520-578,706-731`). (The `sheet_name` select columns in `page.tsx:260`/`OnboardingWizard.tsx:544` are handled in Task 5 — leave them for now; they still compile.)
- [ ] **Step 3b: Delete this task's feature-only tests + strip the stale emphasis-registry row (per the deletion schedule + build-safety Rule §5).** `git rm tests/admin/showOverrideBlocks.test.tsx tests/components/overrides/OverrideableField.test.tsx tests/components/overrides/OverrideableField.transitions.test.tsx tests/e2e/_overrideableFieldHarness.tsx tests/e2e/overrideableField.layout.spec.ts tests/overrides/setFieldOverrideActionShapeGuard.test.ts tests/overrides/adminOpAlertLifecycle.test.ts`. Then in `tests/messages/_metaEmphasisRenderContract.test.ts` delete the `SAFE_PLAINTEXT_REGISTRY` entry object for `components/admin/overrides/OverrideableField.tsx` (`:49-53`) — leaving it would trip the stale-entry guard now that the file is gone.
- [ ] **Step 4: Run — expect PASS** — `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/adminOutcomeBehavior.test.ts tests/log/_auditableMutations.ts tests/messages/_metaEmphasisRenderContract.test.ts 2>&1 | tail -6` (all green) + `pnpm typecheck` (only expected errors are Task-5 `sheet_name` consumers, which still compile since the column exists).
- [ ] **Step 5: §7.5 sweep** — `grep -rn "OverrideableField\|ShowOverrideBlocks\|setFieldOverrideAction\|loadShowOverrides\|liveOverridesByDfid" app components | grep -v "tests/"` returns zero (page.tsx/OnboardingWizard no longer import them).
- [ ] **Step 6: Commit** — `git commit --no-verify -am "refactor(admin): remove live-show override blocks + onboarding wiring + deregister FIELD_OVERRIDE mutations"`

---

### Task 3: Remove the needs-attention override stream (+ admin `_metaInfraContract`)

**Ordering note:** this task does NOT delete `resolveOverrideAlertsForShow.ts` (its second caller `runScheduledCronSync.ts:103,2812` is still live until Task 4 — deleting it here would dangle that import) and does NOT touch `alertIdentityMap.ts` / the `alertIdentityMatrix` fixtures (the code↔identity cross-check must stay consistent — those are removed atomically with the code definitions in Task 7). Task 3 removes only the needs-attention *reads/entries*.

**Files:**
- Modify: `lib/admin/loadNeedsAttention.ts:291-402` (remove 4th "paused overrides" stream — the `admin_overrides` query + count), `lib/admin/needsAttention.ts:64-106,164-456` (remove `resolveOverridePausedCopy` + override entries; `overrideTotal` folds out of `total`), `lib/admin/needsAttentionCount.ts:77-100` (remove `overrideCount` from `pendingTotal`)
- Modify: `tests/admin/_metaInfraContract.test.ts:228,252,692,746` (remove `admin_overrides` 4th paused-override stream registration)
- Test: `tests/admin/{loadNeedsAttention,needsAttentionCount,needsAttentionCount.parallel}.test.ts` (update — remove override-stream assertions, keep others), `tests/admin/needsAttentionOverride.test.ts` (deleted in its task — see deletion schedule)

**Interfaces:**
- Produces: `loadNeedsAttention` returns streams WITHOUT the paused-overrides group; `total`/`pendingTotal` exclude override contributions. (`resolveOverrideAlertsForShow` still exists — its callers are removed by Task 4; the file itself is deleted in Task 7, atomic with its two OVERRIDE catalog codes.)

- [ ] **Step 1: Failing test — needs-attention totals exclude overrides.** In `tests/admin/loadNeedsAttention.test.ts`, adjust (or add) an assertion that the returned streams do NOT include a paused-overrides group and that `total` equals the sum of the surviving streams (holds + pending syncs + …) derived from the fixture, NOT a hardcoded literal (anti-tautology: sum the fixture stream counts). Run — expect FAIL (override stream still present).
- [ ] **Step 2: Remove** the 4th stream in `loadNeedsAttention.ts:291-402`; `resolveOverridePausedCopy` + override entries + `overrideTotal` fold in `needsAttention.ts`; `overrideCount` in `needsAttentionCount.ts`. Deregister the `admin_overrides` stream in `tests/admin/_metaInfraContract.test.ts` (remove the 4 refs). **Guard (invariant 9):** the surviving `{ data, error }` destructures in `loadNeedsAttention` stay intact; run the admin `_metaInfraContract` after editing (comment-fragility — memory). **Do NOT** delete `resolveOverrideAlertsForShow.ts` or touch `alertIdentityMap.ts` here.
- [ ] **Step 3: Run — expect PASS** — `pnpm vitest run tests/admin/loadNeedsAttention.test.ts tests/admin/needsAttentionCount.test.ts tests/admin/_metaInfraContract.test.ts 2>&1 | tail -5` + `pnpm typecheck`.
- [ ] **Step 4: §7.5 sweep** — `grep -rn "resolveOverridePausedCopy\|overrideTotal\|overrideCount" lib | grep -v test` returns zero. (`resolveOverrideAlertsForShow` still has a live caller in `runScheduledCronSync` — expected until Task 4.)
- [ ] **Step 5: Commit** — `git commit --no-verify -am "refactor(admin): remove override needs-attention stream"`

---

### Task 4: Remove the sync-path override overlay

**Files:**
- Modify: `lib/sync/applyParseResult.ts` (remove crew-override branch `:97-117,157-201` + args `activeCrewOverrides`/`crewSideEffects` `:102,117,161-167,187-200` + tx-port methods `crewDeleteByIds/ParkAtSentinel/InsertFull/AssignFinals`; the surviving `else` — `deleteCrewMembersNotIn`/`upsertCrewMembers` — becomes the unconditional crew apply)
- Modify: `lib/sync/phase2.ts` (remove `overrideShowHotel` rebind `:314-327`; drop the entire `showHotelSideEffects` channel `:160,268,326,502,504`; override imports/wiring `:8-20,41-49,157-160,266-271,428-429`)
- Modify: `lib/sync/runScheduledCronSync.ts` (remove admin_overrides ONLY: `:101-103,399-403` incl. `showHotelSideEffects?` type field `:403`, `:1619-1750`, `:2808-2814`, and `:3572` `result.showHotelSideEffects` copy; remove `showHotelSideEffects?` from `ProcessOneFileResult` if present. KEEP all `pull_sheet_override` `:42-46,518-685,1019-1051,2857-3363`)
- Delete: `lib/sync/reconcileCrewOverrides.ts`, `lib/sync/commitOverrideSideEffects.ts`, `lib/sync/loadActiveOverrides.ts`, `lib/sync/overrideShowHotel.ts`
- Modify (NOT delete): **`lib/adminAlerts/resolveOverrideAlertsForShow.ts:17`** — its two callers are gone after this task (`_actions/overrides.ts` deleted Task 2, `runScheduledCronSync.ts:103,2812` removed here), so it becomes a dead orphan, BUT it is the declared `resolveSite` for the two still-cataloged `auto` codes `OVERRIDE_TARGET_MISSING`/`OVERRIDE_NAME_CONFLICT` in `tests/messages/_metaAdminAlertCatalog.test.ts:460-472`, which `readFileSync`s this path (`:723`). Deleting the file here while those codes remain in the runtime catalog (until Task 7's §12.4 lockstep) turns that meta-test RED (ENOENT). So the file's DELETION is deferred to Task 7 (atomic with the catalog-code removal); here we only sever its one dangling import — line 17 `import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel"` (deleted this task) — by inlining the type locally: `type OverrideSideEffect = { overrideId: string; sheetValue: unknown } | { overrideId: string; deactivate: "target_missing" | "name_conflict" };`
- Test: `tests/sync/{overrideApply,commitOverrideSideEffects,commitOverrideSideEffectsDb,overrideShowHotelWiring,reconcileCrewOverrides}.test.ts` + `tests/overrides/alertLifecycle.test.ts` (deleted in its task — see deletion schedule); a NEW behavioral test proving full-replace crew apply with no overlay.

**Interfaces:**
- Consumes: Task 3 done (no admin caller of override side-effects). Produces: `applyParseResult` signature drops `activeCrewOverrides`/`crewSideEffects`; `phase2` result drops `showHotelSideEffects`; `ProcessOneFileResult` drops `showHotelSideEffects`.

- [ ] **Step 1: Failing test — apply commits the raw parse (no overlay).** In a NEW `tests/sync/applyRawParseNoOverride.test.ts`, drive `applyParseResult` with a crew parse and assert it calls `deleteCrewMembersNotIn` + `upsertCrewMembers` with the parsed members verbatim (no override reconcile, no side-effects returned). Derive expected members from the fixture. Run — expect FAIL (signature still requires override args / branch still present).

```ts
// Assert the surviving full-replace path runs unconditionally, with parsed values verbatim.
// (Use the existing applyParseResult test harness/tx-port fake in tests/sync/overrideApply.test.ts as the shape reference — but assert the NO-overlay behavior.)
```

- [ ] **Step 2: Remove** the override branch + args in `applyParseResult.ts`; the `showHotelSideEffects` channel + `overrideShowHotel` rebind in `phase2.ts`; the admin_overrides pieces in `runScheduledCronSync.ts` (leave every `pull_sheet_override` line); delete the 4 sync override files (`reconcileCrewOverrides`, `commitOverrideSideEffects`, `loadActiveOverrides`, `overrideShowHotel`). Then **edit** `lib/adminAlerts/resolveOverrideAlertsForShow.ts:17` — replace the `import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel"` with the inline local type above (the file itself is deleted in Task 7, not here — see Files note).
- [ ] **Step 2b: Test deletions + shared-testkit edit (per the deletion schedule).** `git rm` this task's feature-only tests: `tests/sync/{overrideApply,overrideShowHotel,overrideShowHotelWiring,commitOverrideSideEffects,commitOverrideSideEffectsDb,reconcileCrewOverrides}.test.ts`, `tests/overrides/alertLifecycle.test.ts`, `tests/sync/applyParseResult.holdAware.undoOverride.test.ts`. **EDIT** `tests/sync/_holdAwareTestkit.ts:21` — it imports `type { FullCrewRow }` from the now-deleted `reconcileCrewOverrides.ts`; inline `FullCrewRow` locally in the testkit (the full `crew_members` row shape it described) so the ~14 surviving `applyParseResult.holdAware.*` tests + `phase2.integration.test.ts` + the other testkit consumers keep compiling.
- [ ] **Step 3: Run — expect PASS** — `pnpm vitest run tests/sync/applyRawParseNoOverride.test.ts` + the surviving hold-aware suite `pnpm vitest run tests/sync/applyParseResult.holdAware tests/sync/phase2.integration.test.ts 2>&1 | tail -5` (must be GREEN — they exercise the surviving `else` path) + `pnpm typecheck`.
- [ ] **Step 4: §7.5 sweep (the round-2 class)** — `grep -rn "showHotelSideEffects\|activeCrewOverrides\|crewSideEffects\|overrideShowHotel\|reconcileCrewOverrides\|loadActiveOverrides\|commitOverrideSideEffects" lib | grep -v test` returns zero. **Expected-remaining (deleted in Task 7, NOT this task):** `resolveOverrideAlertsForShow`/`emitOverrideDeactivationAlerts`/`OverrideAlertCode` still resolve inside the now-orphaned `lib/adminAlerts/resolveOverrideAlertsForShow.ts` (and its inlined `OverrideSideEffect`) — confirm they appear ONLY in that one file (`grep -rln "resolveOverrideAlertsForShow\|emitOverrideDeactivationAlerts\|OverrideAlertCode" lib | grep -v test` returns exactly `lib/adminAlerts/resolveOverrideAlertsForShow.ts`). Also confirm `grep -c "pull_sheet_override" lib/sync/runScheduledCronSync.ts` is unchanged from base (pull-sheet untouched).
- [ ] **Step 5: Commit** — `git commit --no-verify -am "refactor(sync): remove field-override overlay from parse-apply path + alert resolver"`

---

### Task 5: Crew name-alias collapse (`sheet_name` readers → `[name]`)

**Files:**
- Modify: `lib/data/getShowForViewer.ts:115-116,239-263,334-367,462-473` (drop `sheet_name` from both `.select(...)`; collapse viewer alias set `[name, sheet_name?]` → `[name]`; drop from owner-resolve roster shape)
- Modify: `lib/data/transportOwnerResolve.ts:28-61` (`ResolvableCrew` drops `sheet_name`; alias union → `[name]`)
- Modify: `lib/data/nameMatch.ts:70` (alias logic/comment → `[name]`)
- Modify: `lib/visibility/scopeTiles.ts:188-191` (viewer alias set → `[name]`)
- Modify: `app/admin/show/[slug]/page.tsx:109,260,419` (drop `sheet_name` from crew `.select` + row shape)
- Modify: `components/admin/OnboardingWizard.tsx:544` (drop `sheet_name` from crew `.select` — the select survived Task 2)
- Modify: `lib/sync/runScheduledCronSync.ts:1666,1680,1702` (crew upsert stops writing `sheet_name` — the surviving apply path)
- Delete: `tests/crew/nameOverrideVisibilityAlias.test.tsx`
- Modify: `tests/data/getShowForViewerFlight.test.ts:201,209` (drop `sheet_name` from asserted select literals), `tests/app/admin/perShowPage.test.tsx:1131` (`crew_members` select → `"id, name, role, email"`), `tests/visibility/{scopeTiles,transportTransitions}.test.ts` (collapse alias-set assertions)

**Interfaces:**
- Produces: the crew data layer keys transport/reservation/scope matching on `crew_members.name` only. `crew_members.sheet_name` has NO reader after this task (column drop happens in Task 8).

- [ ] **Step 1: Failing test — transport/scope matching resolves with a `[name]`-only alias.** In `tests/data/transportOwnerResolve.test.ts` (existing) assert `resolveTransportOwners` matches a member whose transport row is keyed on their `name` with the collapsed alias (no `sheet_name`). Update `getShowForViewerFlight.test.ts` source-scan expectations to the `sheet_name`-free selects. Run — expect FAIL (selects/aliases still carry `sheet_name`).
- [ ] **Step 2: Collapse** every consumer above from `[name, sheet_name?]` → `[name]`; drop `sheet_name` from all `.select(...)` and roster/row shapes; stop writing it in the surviving crew upsert. Delete `nameOverrideVisibilityAlias.test.tsx` (its premise — override-induced surname divergence — is unreachable).
- [ ] **Step 3: Run — expect PASS** — `pnpm vitest run tests/data/ tests/visibility/scopeTiles.test.ts tests/visibility/transportTransitions.test.ts tests/app/admin/perShowPage.test.tsx 2>&1 | tail -6` + `pnpm typecheck`.
- [ ] **Step 4: §7.5 sweep** — `grep -rn "sheet_name" lib/data lib/visibility app/admin/show components/admin/OnboardingWizard.tsx | grep -vi "hotel"` returns zero for the crew column (the remaining `sheet_name` hits are all `admin_alerts.context.sheet_name` in `lib/notify`/`lib/adminAlerts`/`lib/messages` — confirm each is the JSONB alert key, NOT the column). Document the confirmed alert-key hits inline in the commit body.
- [ ] **Step 5: Commit** — `git commit --no-verify -am "refactor(crew-page): collapse crew name-alias to [name] (drop sheet_name readers)"`

---

### Task 6: Delete `lib/overrides/` directory

**Files:**
- Delete: `lib/overrides/` (all 6 files: `loadShowOverrides.ts`, `setFieldOverride.ts`, `repointTargetIndex.ts`, `hotelDisambiguator.ts`, `matchOverrideTarget.ts`, `validateOverrideValue.ts`)

- [ ] **Step 1: Confirm no importer remains** — `grep -rn "from \"@/lib/overrides\|from \"\.\./overrides\|lib/overrides/" app components lib | grep -v "tests/"` returns zero (Tasks 1–5 removed every source importer). If any hit remains, it belongs to an earlier task — fix there.
- [ ] **Step 2: Delete the dir** — `git rm -r lib/overrides/`
- [ ] **Step 3: Run — expect PASS** — `pnpm typecheck` (zero errors) + `grep -rn "loadShowOverrides\|ShowOverridesView\|makeRepointTargetIndex\|RepointTargetIndex\|computeHotelDisambiguator\|matchOverrideTarget\|validateOverrideValue" app components lib | grep -v tests` returns zero (§7.5).
- [ ] **Step 4: Commit** — `git commit --no-verify -m "refactor(overrides): delete lib/overrides directory"`

---

### Task 7: §12.4 code lockstep removal (2 codes) + `AdminAlertCode` union

**Files:**
- Modify: `lib/adminAlerts/upsertAdminAlert.ts:40-41` (remove both from `AdminAlertCode` union)
- Modify: `lib/messages/catalog.ts:1099,1114` (remove both rows)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3089-3090,3356-3357` (remove §12.4 table rows + helpfulContext) — **NEVER run prettier on this file** (memory)
- Regenerate: `pnpm gen:spec-codes` (refreshes `lib/messages/__generated__/spec-codes.ts`), `pnpm gen:internal-code-enums` (refreshes `lib/messages/__generated__/internal-code-enums.ts`)
- Modify: `app/help/errors/_families.ts:114` (remove the "OVERRIDE" family; if it would be empty, drop the family entry entirely)
- Modify: `lib/adminAlerts/alertIdentityMap.ts:281-287` (remove both codes' identity entries — MOVED here from Task 3 so it lands atomically with the fixture rows below; the `alertIdentityMatrix` code↔identity cross-check must never be inconsistent at a boundary)
- Delete: **`lib/adminAlerts/resolveOverrideAlertsForShow.ts`** (deferred from Task 4 — it is the `resolveSite` `readFileSync`'d by `_metaAdminAlertCatalog.test.ts:723` for the two `auto` OVERRIDE codes; deleting it must land in the SAME commit that removes those codes from the runtime catalog + the CLASSIFICATION map below, or the meta-test goes RED. Task 4 already severed its one dangling import.)
- Modify: `tests/messages/adminAlertsRegistry.ts:54-55`, `tests/adminAlerts/adminAlertCodes.fixture.ts:58-59`, `tests/messages/_metaAlertAudienceContract.test.ts:26-27`, `tests/adminAlerts/alertIdentityMatrix.test.ts:371-372` (fixture rows for both codes), `tests/messages/_metaAdminAlertCatalog.test.ts:258-264,458-472` (remove both codes from the catalog-completeness list AND the `CLASSIFICATION` map's OVERRIDE `auto` block at `:458-472` — the comment + both `resolveSites` entries pointing at the deleted resolver — ALL in this one commit)
- Test: `tests/cross-cutting/codes.test.ts` (x1-catalog-parity — must stay green)

**Interfaces:**
- Produces: `AdminAlertCode` union without the 2 override members; catalog + generated + spec prose in lockstep.

- [ ] **Step 1: Failing test — the catalog no longer carries the 2 codes and parity holds.** Run `pnpm vitest run tests/cross-cutting/codes.test.ts tests/messages/_metaAdminAlertCatalog.test.ts` AFTER removing the catalog rows + spec prose but BEFORE regen — expect FAIL (generated files still list the codes; parity mismatch). This proves the lockstep gate is live.
- [ ] **Step 2: Remove + regen in lockstep** — edit `catalog.ts` (drop both rows), the master-spec §12.4 prose + helpfulContext (hand-edit, no prettier), the `AdminAlertCode` union, the help family, `alertIdentityMap.ts`; `git rm lib/adminAlerts/resolveOverrideAlertsForShow.ts` (the deferred orphan resolver); then `pnpm gen:spec-codes && pnpm gen:internal-code-enums`; then remove both codes from the 5 admin-alert test registries/fixtures/meta-tests INCLUDING the `_metaAdminAlertCatalog.test.ts:458-472` OVERRIDE `auto` CLASSIFICATION block (whose `resolveSites` reference the just-deleted resolver).
- [ ] **Step 3: Run — expect PASS** — `pnpm vitest run tests/messages/ tests/adminAlerts/ 2>&1 | tail -6` (x1-catalog-parity, x2-no-raw-codes surfaces, audience contract, identity matrix, admin-alert catalog all green) + `pnpm typecheck`.
- [ ] **Step 4: §7.5 sweep** — `grep -rn "OVERRIDE_TARGET_MISSING\|OVERRIDE_NAME_CONFLICT\|OverrideAlertCode" app components lib | grep -v tests` returns zero.
- [ ] **Step 5: Commit** — `git commit --no-verify -am "refactor(messages): remove OVERRIDE_TARGET_MISSING + OVERRIDE_NAME_CONFLICT (§12.4 lockstep)"`

---

### Task 8: DB drop migration + manifest + validation apply + DB meta-tests

**Files:**
- Create: `supabase/migrations/20260710000000_drop_admin_field_overrides.sql`
- Regenerate: `supabase/__generated__/schema-manifest.json` (`pnpm gen:schema-manifest`)
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts` — TWO edits (the scanner reads migration files textually, and the old create-migration is immutable, so both are required for a consistent topology): (a) remove the `20260707000000_admin_field_overrides.sql` entry + its comment from the `migrationFiles` list in `lockTakingRpcNames()` (`:73-78`) so the scanner no longer reports the dropped RPC; (b) remove the `expect(lockTakingNames).toContain("set_field_override")` assertion + its comment (`:135-138`). `tests/db/postgrest-dml-lockdown.test.ts:475` (remove `admin_overrides` registry row), `tests/db/setFieldOverrideGrants.test.ts` (deleted in its task — see deletion schedule), `tests/db/showCacheRevalidateCoverage.test.ts` (update if it lists admin_overrides)

**Migration body (idempotent, apply-twice safe):**

```sql
-- Drop the admin field-override feature (teardown of #376). See
-- docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md.
-- CASCADE on the table drops its RLS policy, CHECK constraints, unique, and index.
drop function if exists public.set_field_override(text,text,text,text,text,text,jsonb,text,int,jsonb,int,text);
drop function if exists public._validate_override_value(uuid,text,text,text,uuid,jsonb,uuid);
drop function if exists public._apply_override_live(uuid,text,text,uuid,jsonb,text);
drop function if exists public._current_field_value(uuid,text,text,text,text);
drop function if exists public._resolve_live_id(uuid,text,text,text,text);
drop table if exists public.admin_overrides cascade;
alter table public.crew_members drop column if exists sheet_name;
notify pgrst, 'reload schema';
```

- [ ] **Step 1: Structural-pin edit — advisory-lock topology no longer includes `set_field_override`.** (Not a red→green cycle: this is a topology-pin update for a removed holder; the whole `advisoryLockRpcDeadlock` suite must stay GREEN before and after.) `lockTakingRpcNames()` scans a hardcoded `migrationFiles` list textually — the old `20260707…` create-migration is immutable, so both edits are required: (a) remove the `20260707000000_admin_field_overrides.sql` list entry + comment (`:73-78`); (b) remove the `toContain("set_field_override")` assertion + comment (`:135-138`). Run `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` — expect GREEN (topology now consistent: scanner no longer sees the RPC, no assertion for it). If it fails, an exhaustive/reverse check exists — reconcile before proceeding.
- [ ] **Step 2: Write the drop migration** (above). Apply locally: `psql "$DATABASE_URL_LOCAL" -f supabase/migrations/20260710000000_drop_admin_field_overrides.sql` (or `supabase db query`), then verify `admin_overrides` + `crew_members.sheet_name` are gone locally.
- [ ] **Step 3: Regen manifest** — `pnpm gen:schema-manifest` (drops `admin_overrides` + `crew_members.sheet_name` from `schema-manifest.json`). Commit the regenerated manifest in this task.
- [ ] **Step 4: Update DB meta-tests** — remove the `admin_overrides` row from `postgrest-dml-lockdown.test.ts:475`; adjust `showCacheRevalidateCoverage.test.ts` if it enumerates `admin_overrides`.
- [ ] **Step 5: Apply to validation project (parity gate).** `supabase db query --linked "<the migration SQL>"` against project `vzakgrxqwcalbmagufjh` (or `psql "$TEST_DATABASE_URL" -f …`), then `notify pgrst, 'reload schema';`. The `validation-schema-parity` gate asserts validation ⊇ manifest — with both dropped, parity holds.
- [ ] **Step 6: Run — expect PASS** — `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/postgrest-dml-lockdown.test.ts 2>&1 | tail -5` + `pnpm typecheck`.
- [ ] **Step 7: §7.5 sweep** — `grep -rn "admin_overrides\|set_field_override" lib app components supabase | grep -v "20260710000000_drop\|tests/"` returns zero (only the drop migration names them).
- [ ] **Step 8: Commit** — `git commit --no-verify -am "refactor(db): drop admin_overrides table + set_field_override RPC + sheet_name column"`

---

### Task 9: Full-suite + all gates + global removed-symbol sweep

By this point every feature-only test has been deleted in its own task (per the deletion schedule) and each source removal is committed. This task is the whole-diff verification gate — no bulk deletion (if any straggler test remains, `pnpm test` surfaces it and it's deleted here as cleanup).

- [ ] **Step 1: Full suite** — `pnpm test 2>&1 | tail -25`. Expect all green. Any failure = an earlier task missed a consumer or a straggler feature test survived; fix in that task's spirit (delete the straggler / patch the missed consumer), then re-run.
- [ ] **Step 2: Full gates** — `pnpm typecheck && pnpm build && pnpm format:check && pnpm lint 2>&1 | tail -15`. All green. (`build` catches RSC/client-import boundary + Turbopack chunk errors that vitest/tsc miss — memory. `format:check` because `--no-verify` bypasses the prettier hook — memory.)
- [ ] **Step 3: §7.5 global sweep** — `grep -rn "admin_overrides\|set_field_override\|loadShowOverrides\|OverrideableField\|WizardOverrideRow\|reconcileCrewOverrides\|resolveOverrideAlertsForShow\|showHotelSideEffects\|OverrideSideEffect\|ShowOverridesView\|liveOverrides\|OVERRIDE_TARGET_MISSING\|OVERRIDE_NAME_CONFLICT" app components lib supabase tests | grep -v "20260710000000_drop\|2026-07-10-remove-admin-field-overrides\|2026-07-07-admin-field-overrides"` returns zero. (The two old spec/migration files retain the names in immutable history — that's the only allowed residue.) Confirm `pull_sheet_override` refs are UNCHANGED from base.
- [ ] **Step 4: Commit (if any cleanup)** — `git commit --no-verify -am "test(overrides): final teardown sweep"` (skip if Step 1 needed no changes).

---

### Task 10: Docs — audit 3.2 reversal + BACKLOG follow-ups

**Files:**
- Modify: `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` (item 3.2: shipped #376 → REMOVED 2026-07-10, with the §1 rationale; Flow-3 table row)
- Modify: `BACKLOG.md` (add `BL-EXTEND-ROLE-SCOPE-VOCAB` + `BL-STRUCTURAL-TRANSFORM-USE-RAW`)

- [ ] **Step 1: Audit 3.2 reversal** — update item 3.2's Status to `↩️ REMOVED 2026-07-10 (#<this PR>)` with a one-paragraph WHY (second source of truth vs sheet-canonical promise; verbatim fields sheet-editable; autocorrects sheet-editable typos; residual needs → BL follow-ups). Update the Flow-3 table row + the shipped-status block. Do NOT run prettier on unrelated doc lines.
- [ ] **Step 2: BACKLOG** — add the two follow-up entries with the §6 descriptions from the spec.
- [ ] **Step 3: Commit** — `git commit --no-verify -am "docs(overrides): record 3.2 override-layer removal + file residual follow-ups"`

---

### Task 11: Close-out — impeccable dual-gate + whole-diff review

- [ ] **Step 1: Impeccable v3 dual-gate (invariant 8).** The diff removes UI (`components/admin/overrides/`, wizard rows, live-show blocks). Run `/impeccable critique` AND `/impeccable audit` on the UI diff (removal-focused: confirm no orphaned affordance, no broken layout where blocks were, review pages still coherent read-only). HIGH/CRITICAL findings fixed or `DEFERRED.md`. Record dispositions in the plan's handoff notes.
- [ ] **Step 2: Real-browser smoke (Playwright).** Drive the admin wizard review modal + the live-show detail page for a seeded show; confirm they render with no override affordances and no console errors. (jsdom is insufficient for the render check.)
- [ ] **Step 3: Full gates once more** — `pnpm test && pnpm typecheck && pnpm build && pnpm format:check && pnpm lint`. All green.
- [ ] **Step 4: Whole-diff Codex adversarial review** (fresh-eyes, REVIEWER ONLY) → APPROVE. Triage via deferral discipline.
- [ ] **Step 5: Push + PR + real CI green + `gh pr merge --merge` + ff local main** (`rev-list --left-right --count main...origin/main` == `0 0`).
