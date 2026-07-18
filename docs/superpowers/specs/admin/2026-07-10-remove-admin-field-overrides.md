# Spec — Remove the admin field-override feature (teardown of #376)

**Date:** 2026-07-10
**Status:** Draft → self-review → adversarial review → plan
**Type:** Feature teardown (removal). Supersedes `docs/superpowers/specs/2026-07-07-admin-field-overrides.md`.
**Base:** `origin/main` @ `37f90e82f` (feature live via merged PR #376).

---

## 1. Why remove it

The admin field-override feature (`admin_overrides` table + `set_field_override` RPC + wizard/live-show UI) lets an admin store an in-app value that overrides the parsed sheet value for a narrow field set (`dates|venue|name|role|hotel_name|hotel_address`) and survives full-replace re-syncs. On product review (2026-07-09→10, post-merge) it is being removed because it **works against the product's core promise**: FXAV Crew Pages turns Doug's existing Google Sheets into webpages with the sheet as the single source of truth (`PRODUCT.md`). An override creates a **second source of truth** — the app says "John," the sheet still says "Jon" forever — reintroducing exactly the two-places-to-reconcile cognitive load the product exists to remove.

The narrow field set the feature chose is almost entirely **verbatim identity fields** the parser stores unchanged (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md:140,151`): crew `name`/`role`, `venue`, `hotel_address`, and `hotel_name`. Verbatim fields are **directly editable in the sheet to elicit correct output** — so the shipped correction path already covers them: the "Fix in sheet" deep-link loop (audit item 3.1, PR #358, `CorrectionLoopCallout`) plus the report flow (`app/api/report`). No override layer is needed for values a sheet edit fixes.

The two autocorrect-driven cases (`STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`) were considered as a narrower "use the sheet's raw value" replacement and rejected for this cut: they fire on **typos / unrecognized tokens that are themselves sheet-editable**; `role_flags` are a closed vocabulary gating scope-tile visibility (`lib/visibility/*`) and stages are a closed 4-phase enum (`lib/parser/personalization.ts:199`), so declining a correction yields *unknown*, not a *correct* value. The genuinely-unmet needs are two **separate, heavier features**, filed as follow-ups (not built here):

1. **Extend the role→scope-capability vocabulary** so a legitimate novel role token grants the right scope tiles instead of failing closed.
2. **Structural-transform "use raw" reversal** for the transforms where the sheet is right but the parser mis-structures it and no reword fixes it (room name/dim split, hotel guest/address glue, inverted check-in/out dates).

Both are recorded in `BACKLOG.md`. They are explicitly **out of scope** here.

### 1.1 What survives (the post-removal correction story)

- **Fix in sheet + Re-sync** (`ReSyncButton`, `CorrectionLoopCallout`, per-section "In sheet ↗" deep-links) — the primary loop, unchanged.
- **Report flow** (`app/api/report`) — routes a parser deficiency to the developer.
- **Detection** (ambiguity-warnings-v1 #367, `CREW_COLUMN_POSITIONAL_FALLBACK` #361) and **monitoring** (digest #366/#370) — unchanged; still flag suspicious parses at review.
- **`pull_sheet_override`** (`shows.pull_sheet_override` column + `set_pull_sheet_override` RPC + `PULL_SHEET_OVERRIDE*` codes) — a **separate** feature. NOT touched.

---

## 2. Scope

**In scope:** complete removal of the admin field-override feature — DB objects, sync-path integration, UI, admin-alert/needs-attention integration, telemetry registry rows, `§12.4` codes, and all tests. Restore the pre-feature parse-apply behavior (full-replace crew/hotel/show, no override overlay).

**Out of scope (do NOT touch):** `pull_sheet_override` / `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`; the "Fix in sheet" loop; the report flow; the two follow-up features (§1). No behavior change to any surface other than removing the override overlay.

**Data:** the drop migration removes `admin_overrides` and `crew_members.sheet_name`. Any active override rows are discarded; on the next sync each affected field renders its **sheet-parsed value** (the override overlay is gone). This reversion to sheet truth is the intended end state (§1). No data-migration/backfill is required — overrides were a correction layer over sheet data, and removing them returns each field to the sheet. #376 merged 2026-07-10 (~hours before this teardown), so production override rows are expected to be zero or near-zero; correctness does not depend on that count.

---

## 3. Removal surface (completeness matrix)

Every affected layer × action. Citations are `file:line` at base `37f90e82f`.

### 3.1 Database (one migration owns it all)

`supabase/migrations/20260707000000_admin_field_overrides.sql` created the entire surface. A **new** forward migration drops it (never edit the old migration — history is immutable):

| Object | Base ref | Drop action |
|---|---|---|
| Table `public.admin_overrides` (+ 4 CHECK constraints, unique, partial index, RLS policy `admin_only`) | `:1-56` | `DROP TABLE IF EXISTS public.admin_overrides CASCADE;` (drops policy, constraints, index, grants) |
| `crew_members.sheet_name` column (feature sibling — pre-override rename-alias) | `:59-62` | `ALTER TABLE public.crew_members DROP COLUMN IF EXISTS sheet_name;` — **requires the crew name-alias collapse in §3.2b** (readers exist; a bare drop breaks `.select`) |
| RPC `set_field_override(text,text,text,text,text,text,jsonb,text,int,jsonb,int,text)` | `:240-493` (advisory lock `:265`) | `DROP FUNCTION IF EXISTS public.set_field_override(...12 args...);` |
| Helper fns `_resolve_live_id`, `_current_field_value`, `_apply_override_live`, `_validate_override_value` | `:75,:115,:146,:184` | `DROP FUNCTION IF EXISTS ...(exact sigs);` each |

Migration lifecycle: idempotent (`IF EXISTS`), apply-twice safe. Apply locally + to the validation project `vzakgrxqwcalbmagufjh` surgically; regen `pnpm gen:schema-manifest` (base manifest lists `admin_overrides` `schema-manifest.json:35-49` + `crew_members.sheet_name` `:113`) and commit. `validation-schema-parity` asserts validation ⊇ manifest (superset), so dropping in both keeps parity.

**Advisory-lock topology:** `set_field_override` was an **in-RPC** holder of `pg_advisory_xact_lock(hashtext('show:'||dfid))` (`:265`). Removing the RPC removes one holder — no deadlock (removing, not adding, a holder). `tests/auth/advisoryLockRpcDeadlock.test.ts:138` pins `set_field_override` in `lockTakingNames` → that assertion is removed with the RPC.

**PostgREST DML lockdown:** `admin_overrides` had INS/UPD/DEL revoked (`:48`) and was registered in `tests/db/postgrest-dml-lockdown.test.ts:475` — the registry row is removed with the table. `tests/db/setFieldOverrideGrants.test.ts` (whole file) is deleted.

### 3.2 Sync / parse-apply path

The override overlay layered on top of the base full-replace apply. Removal restores the base path.

- `lib/sync/applyParseResult.ts` — remove the crew-override branch (`:8-12,97-117,157-201`) and its args (`activeCrewOverrides`, `crewSideEffects`) + tx-port methods (`crewDeleteByIds`/`ParkAtSentinel`/`InsertFull`/`AssignFinals`). **Guard:** the surviving `else` path (`deleteCrewMembersNotIn`/`upsertCrewMembers`) becomes the unconditional crew apply — this is the pre-feature behavior. Every caller of the changed signature updates.
- `lib/sync/phase2.ts` — remove the Stage-A `overrideShowHotel` rebind of `parseResult` (`:314-327`) so the raw parse commits directly; drop the entire `showHotelSideEffects` channel: the local (`:268`), Stage-A assignment (`:326`), the Stage-B `overrideSideEffects` merge + `applied.showHotelSideEffects` (`:502,:504`), and the result-type field (`:160`); plus the override imports/wiring (`:8-20,41-49,157-160,266-271,428-429`).
- `lib/sync/runScheduledCronSync.ts` — **MIXED FILE.** Remove admin_overrides pieces ONLY: `:101-103` (loadActiveOverrides import), `:399-403` (incl. the `showHotelSideEffects?` field on the local result type `:403`), `:1619-1750` (loadActiveOverrides/refreshOverrideSheetValue/deactivateOverride tx-ports + `admin_overrides` SQL), `:2808-2814` (`emitOverrideDeactivationAlerts` + its `result.showHotelSideEffects` guard), and **`:3572`** (`if (phase2.showHotelSideEffects) result.showHotelSideEffects = …` — the copy of the now-removed Phase2 field; drop this line so nothing references the deleted field). **Guard:** grep `showHotelSideEffects` across `lib/sync/` returns zero after removal (the full thread: `phase2.ts` × `runScheduledCronSync.ts` × deleted `overrideShowHotel.ts`). Also remove the `showHotelSideEffects?` field from the `ProcessOneFileResult` type if present. **KEEP all `pull_sheet_override`** (`:42-46,518-685,1019-1051,2857-3363`).
- Delete whole files: `lib/sync/reconcileCrewOverrides.ts`, `commitOverrideSideEffects.ts`, `loadActiveOverrides.ts`, `overrideShowHotel.ts`.
- Delete whole dir `lib/overrides/` (`loadShowOverrides.ts`, `setFieldOverride.ts`, `repointTargetIndex.ts`, `hotelDisambiguator.ts`, `matchOverrideTarget.ts`, `validateOverrideValue.ts`).

### 3.2b Crew name-alias collapse (paired with the `sheet_name` column drop)

`crew_members.sheet_name` held the **pre-override parsed name** so a name-override rename still matched transport/reservation/scope rows keyed on the original sheet name (`getShowForViewer.ts:241` — "present only while a name override is active"). With overrides gone, `crew_members.name` **always** equals the parsed sheet name, so the two-element alias set `[live name, sheet_name?]` collapses to `[name]`. Every reader/writer of the column is updated in the same change as the DROP (a bare drop leaves `.select("...sheet_name")` referencing a missing column → runtime error):

| Consumer | Ref | Change |
|---|---|---|
| `lib/data/getShowForViewer.ts` | `:115-116,:239-263,:334-367,:462-473` | drop `sheet_name` from both `.select(...)`; collapse the viewer alias set `[name, sheet_name?]` → `[name]`; drop it from the owner-resolve roster shape |
| `lib/data/transportOwnerResolve.ts` | `:28-61` | `ResolvableCrew` shape loses `sheet_name`; alias union `[name, sheet_name?]` → `[name]` |
| `lib/data/nameMatch.ts` | `:70` | alias-set comment/logic → `[name]` only |
| `lib/visibility/scopeTiles.ts` | `:188-191` | viewer alias set → `[name]` (behavior identical when `sheet_name` was already null) |
| `app/admin/show/[slug]/page.tsx` | `:109,:260,:419` | drop `sheet_name` from the crew `.select` + the row shape |
| `components/admin/OnboardingWizard.tsx` | `:544,:554` | drop `sheet_name` from the crew `.select` + shape (also removed by the override-UI teardown §3.3) |
| Crew upsert writers | `runScheduledCronSync.ts:1666,:1680,:1702`, `reconcileCrewOverrides.ts` (deleted) | the surviving crew-apply path stops writing `sheet_name` |

**Do NOT touch `admin_alerts.context.sheet_name`** — a SEPARATE JSONB alert-title key (`lib/notify/detect/candidates.ts:115`, `lib/notify/templates/realtimeProblem.ts`, `lib/messages/lookup.ts:28`, `lib/adminAlerts/{alertIdentityMap,identityTypes,projectIdentityContext}.ts`, `runScheduledCronSync.ts:338,361,2436…`, `unpublishShow.ts:243`, `runManualSyncForShow.ts`, `WrappedSection.tsx`, `TileServerFallback.tsx`, `_CrewShell.tsx`, `ErrorExplainer.tsx`). These name the *show/sheet title* for alert display, unrelated to the crew column. Untouched.

**Guard (TDD, §4):** transport-owner resolution, reservation matching, and scope-tile visibility must remain correct with a `[name]`-only alias — a member whose transport row is keyed on their (sheet-equal) name still resolves; no member loses their ride/reservation/scope. The existing `transportOwnerResolve`/`getShowForViewer`/`scopeTiles` tests are updated to the collapsed alias and must stay green.

**Alias test surfaces (paired with §3.7):**
- `tests/crew/nameOverrideVisibilityAlias.test.tsx` — **DELETE.** This suite's premise ("a SURNAME-changing *override* breaks the scalar match; the alias set restores it", `namesReferAny(SHEET_NAME, ALIASES)`) is unreachable once overrides are gone — no rename can diverge `name` from the sheet name. Not a regression: the scenario it guards can no longer occur.
- `tests/data/getShowForViewerFlight.test.ts:201,:209` — **UPDATE.** Source-scan asserts the literal `.select("role_flags, name, flight_info, sheet_name")` and `"id, name, sheet_name, email, phone, role, role_flags, date_restriction, stage_restriction"`; drop `sheet_name` from both expected literals to match the collapsed selects.
- `tests/app/admin/perShowPage.test.tsx:1131` — **UPDATE.** Asserts `state.selectColsByTable.crew_members === "id, name, role, sheet_name, email"`; drop `sheet_name` (the override loader was its only consumer).
- `tests/visibility/{scopeTiles,transportTransitions}.test.ts` — **UPDATE** any assertion that threads a `[name, sheet_name]` alias set; collapse to `[name]`.

### 3.3 UI (Opus-only; invariant 8 impeccable dual-gate)

- Delete `components/admin/overrides/` (`OverrideableField.tsx`, `ShowOverrideBlocks.tsx`).
- Delete `app/admin/show/[slug]/_actions/overrides.ts` (`setFieldOverrideAction`).
- `components/admin/wizard/step3ReviewSections.tsx` — remove `WizardOverrideRow` (`:868`) + all 6 call sites (`:966,1369,1380,1603,2404,2421`), the `liveOverrides?` prop on 5 section types (`:938,1289,1561,2355,3161`) + its spread (`:3656-3745`), override imports (`:117-133`), consts (`:848-852`). Sections render parse data only.
- `components/admin/wizard/Step3SheetCard.tsx:603-607` — remove `liveOverrides` threading.
- `components/admin/wizard/Step3Review.tsx` — remove `liveOverrides` from the `Step3Row` type.
- `components/admin/OnboardingWizard.tsx` — remove `liveOverridesByDfid` build + row attach (`:38-41,520-578,706-731`).
- `app/admin/show/[slug]/page.tsx` — remove `loadShowOverrides` call + override-blocks mount (`:39-46,409-427,685-811`).

### 3.4 Admin alerts + needs-attention

- Delete `lib/adminAlerts/resolveOverrideAlertsForShow.ts` (`resolveOverrideAlertsForShow`, `emitOverrideDeactivationAlerts`, `OverrideAlertCode`).
- `lib/admin/loadNeedsAttention.ts:291-402` — remove the 4th "paused overrides" stream (query + count).
- `lib/admin/needsAttention.ts:64-106,164-456` — remove `resolveOverridePausedCopy` + override entries; **guard:** `overrideTotal` folds out of `total` cleanly.
- `lib/admin/needsAttentionCount.ts:77-100` — remove `overrideCount` from `pendingTotal`.
- `lib/adminAlerts/alertIdentityMap.ts:281-287` — remove both codes' identity entries.

### 3.5 §12.4 code removal (both codes, full lockstep)

`OVERRIDE_TARGET_MISSING` and `OVERRIDE_NAME_CONFLICT` are `audience:"doug"` admin_alert codes. Each removal touches every surface below, in one commit (else the parity/catalog gates fail):

| Surface | Ref |
|---|---|
| `AdminAlertCode` union (source type) | `lib/adminAlerts/upsertAdminAlert.ts:40-41` — remove both members from the exported union (else dead union members; TS narrowing on `code` breaks) |
| Runtime catalog | `lib/messages/catalog.ts:1099,:1114` |
| Master-spec §12.4 prose (table + helpfulContext) | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3089-3090,:3356-3357` |
| Regenerated spec-codes | `lib/messages/__generated__/spec-codes.ts:743,:749` → regen `pnpm gen:spec-codes` |
| Internal-code-enums | `lib/messages/__generated__/internal-code-enums.ts:164,:167` → regen `pnpm gen:internal-code-enums` |
| Help error families | `app/help/errors/_families.ts:114` ("OVERRIDE" family) |
| admin-alert registries/fixtures | `tests/messages/adminAlertsRegistry.ts:54-55`, `tests/adminAlerts/adminAlertCodes.fixture.ts:58-59`, `tests/messages/_metaAlertAudienceContract.test.ts:26-27`, `tests/adminAlerts/alertIdentityMatrix.test.ts:371-372` |

The `x1-catalog-parity` gate compares runtime catalog ↔ §12.4 prose; `x2-no-raw-codes` scans the internal manifest. Removing the "OVERRIDE" help family may empty it — if `_families.ts` requires ≥1 member, drop the family entry entirely.

### 3.6 Meta-tests (fail-by-default — deregister)

| Meta-test | Ref | Action |
|---|---|---|
| `AUDITABLE_MUTATIONS` registry | `tests/log/_auditableMutations.ts:315-332,:427-430` | remove FIELD_OVERRIDE_SET/REVERTED/REPOINTED/DISCARDED rows (action file deleted) |
| Admin-outcome behavioral | `tests/log/adminOutcomeBehavior.test.ts:271-273,:1565-1618` | remove the setFieldOverrideAction import + per-op outcome block |
| Advisory-lock topology | `tests/auth/advisoryLockRpcDeadlock.test.ts:138` | remove `set_field_override` from `lockTakingNames` |
| Admin `_metaInfraContract` | `tests/admin/_metaInfraContract.test.ts:228,252,692,746` | remove `admin_overrides` as the 4th paused-override stream |
| Admin-alert catalog completeness | `tests/messages/_metaAdminAlertCatalog.test.ts:258-264,:461-467` | remove both codes |

Clean (no change): `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/auth/_metaInfraContract.test.ts` — no override refs (confirmed).

### 3.7 Tests to delete / update

Delete (feature-only): `tests/overrides/*` (setFieldOverrideCore, setFieldOverride.unit, setFieldOverride, setFieldOverrideActionShapeGuard, loadShowOverridesOrphans, loadShowOverridesHotelDisambiguation, alertLifecycle, adminOpAlertLifecycle, wizardLiveSource, _metaHotelMatchKeyParsedIdentity, _holdAwareTestkit), `tests/sync/{reconcileCrewOverrides,overrideApply,commitOverrideSideEffects,commitOverrideSideEffectsDb,overrideShowHotelWiring}.test.ts`, `tests/admin/{showOverrideBlocks,needsAttentionOverride}.test.ts`, `tests/db/setFieldOverrideGrants.test.ts`, `tests/components/overrides/*`, `tests/e2e/{overrideableField.layout.spec.ts,_overrideableFieldHarness.tsx}`.

Update (mixed — remove override assertions, keep the rest): `tests/admin/{needsAttentionCount,needsAttentionCount.parallel,loadNeedsAttention}.test.ts`, `tests/db/{postgrest-dml-lockdown,showCacheRevalidateCoverage}.test.ts`, the meta-tests in §3.6, **plus the crew name-alias test surfaces in §3.2b** (`nameOverrideVisibilityAlias.test.tsx` DELETE; `getShowForViewerFlight`, `perShowPage`, `scopeTiles`, `transportTransitions` UPDATE — drop `sheet_name` from asserted selects/alias sets).

---

## 4. Guard conditions (post-removal render/behavior)

- **Wizard review sections** (`step3ReviewSections.tsx`): with no `liveOverrides` prop, each section renders **parse data only** — the identity row (avatar + name + role) and field lists, no `NAME:`/`ROLE:`/`Show dates`/venue/hotel override editors, no per-field hint. (This subsumes the earlier "hide pre-publish override rows" tweak.)
- **Live-show detail** (`app/admin/show/[slug]/page.tsx`): the override blocks (`ShowDetailsOverrideBlock`, `HotelsOverrideBlock`, `OrphanedOverridesBlock`, `CrewOverrideFields`) unmount entirely. The page renders show/crew/hotel data read-only; correction is via Fix-in-sheet.
- **Needs-attention** (admin dashboard): the "paused overrides" stream disappears; counts (`total`, `pendingTotal`) drop the override contribution and must remain correct for the surviving streams (holds, pending syncs, etc.). Empty-state and non-zero-count both verified.
- **Sync/apply:** a re-sync applies the raw parse with no override overlay; a field previously overridden now shows its sheet-parsed value. No crash, no orphaned side-effect, no dangling `admin_overrides` read.
- **Crew name-alias (§3.2b):** with the `[name]`-only alias, transport-owner resolution, hotel-reservation matching, and scope-tile visibility resolve every member correctly (their transport/reservation/scope rows are keyed on the sheet name, which now equals `crew_members.name`). No member loses their ride, reservation, or scope tiles. Verified against the fixture data, not restated literals.
- **Existing prod override rows:** discarded at drop (table gone). No code path reads them post-migration (confirmed: no non-feature reader, §3.2 agent finding + §7.1 guard).

---

## 5. Numeric / self-consistency notes

- Override field set = **6** fields (`dates,venue,name,role,hotel_name,hotel_address`) — all removed.
- §12.4 codes removed = **2** (`OVERRIDE_TARGET_MISSING`, `OVERRIDE_NAME_CONFLICT`). `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` is **not** counted (kept).
- Whole files deleted ≈ **20** (6 `lib/overrides/`, 4 `lib/sync/` override files, 2 `components/admin/overrides/`, 1 action, 1 adminAlerts, ~6+ test files' worth). Mixed-file edits ≈ **18** (sync-path 3, UI 6, admin 3, §12.4/registry surfaces, plus the 6 crew name-alias consumers in §3.2b). Exact count reconciled in the plan.
- DB objects dropped: 1 table + 1 column (`sheet_name`) + 5 functions (1 RPC + 4 helpers).
- Crew name-alias set: **2** elements (`[name, sheet_name?]`) → **1** (`[name]`) across 4 matching consumers + 2 `.select` sites (§3.2b).

---

## 6. Follow-ups (filed, NOT built here) → `BACKLOG.md`

- `BL-EXTEND-ROLE-SCOPE-VOCAB` — let an admin map a novel/unrecognized role token to scope-capability flags so it grants the correct scope tiles instead of failing closed (`UNKNOWN_ROLE_TOKEN` → no flag). Needs a visibility-mapping design.
- `BL-STRUCTURAL-TRANSFORM-USE-RAW` — "use the sheet's raw value" reversal on recoverable structural transforms (room name/dim split `rooms.ts`, hotel guest/address glue `hotels.ts`, inverted dates). The raw is already captured on the warnings; needs per-transform revert semantics. This is the *only* territory where a sheet edit can't elicit correct output.

---

## 7. Open verifications (resolve in plan self-review, not user-facing)

1. **`crew_members.sheet_name` readers.** ✅ RESOLVED (spec self-review): the column has readers in the crew data/visibility layer (§3.2b), but all use it purely as the *pre-override* name-alias, which is null without overrides → the column is override-only in purpose and is dropped WITH the alias collapse in §3.2b. The unrelated `admin_alerts.context.sheet_name` JSONB key is explicitly kept. Plan re-confirms the collapse compiles + the alias tests stay green.
2. **`applyParseResult` signature callers.** Enumerate every caller of the changed function and confirm the collapsed signature compiles + preserves crew-apply semantics (TDD: a sync test asserting full-replace crew apply with no override overlay).
3. **`needsAttention` total arithmetic.** Confirm removing `overrideTotal`/`overrideCount` leaves the surviving-stream totals exact (anti-tautology: assert against the stream data, not a recomputed literal).
4. **Help-family emptiness.** Confirm `app/help/errors/_families.ts` tolerates the "OVERRIDE" family removal (drop the family if it would be empty).
5. **Removed-symbol consumer sweep (structural guard — closes the "dangling reference" class).** For EVERY exported symbol, type, type-field, or DB object the teardown removes (`loadShowOverrides`, `ShowOverridesView`, `setFieldOverride`, `OverrideableField`, `WizardOverrideRow`, `liveOverrides`, `AdminAlertCode` members, `showHotelSideEffects`, `OverrideSideEffect`, `OverrideAlertCode`, `admin_overrides`, `set_field_override`, `crew_members.sheet_name`, the 4 helper fns, etc.), the plan runs `grep -rn "<symbol>" app components lib supabase tests` after removal and asserts **zero** dangling references (each hit is either edited or the file deleted). This is a per-symbol checklist item in the plan, not a one-time pass. Rationale: adversarial rounds 1–2 both found a single un-enumerated consumer of a removed symbol (`upsertAdminAlert.ts` union; `runScheduledCronSync.ts:3572`); the sweep converts "did we list every consumer?" from prose enumeration into a mechanical grep-clean gate.

---

## 8. Watchpoints (do NOT relitigate — decided, cited)

For the adversarial reviewer. Each is a ratified decision, not an oversight:

- **This is an intentional teardown of a shipped feature (#376), authorized by the product owner** (2026-07-09→10 review). "Why remove something that merged" is answered in §1 — do not argue to keep it.
- **`pull_sheet_override` / `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` are a SEPARATE feature and are KEPT.** `runScheduledCronSync.ts` is a mixed file; the spec enumerates exactly which line ranges are admin_overrides (remove) vs pull_sheet_override (keep) — §3.2. Do not flag kept pull-sheet code as "missed override removal."
- **`admin_alerts.context.sheet_name` (JSONB alert key) ≠ `crew_members.sheet_name` (column).** Only the column is dropped (§3.2b). Do not flag the retained alert-context key as a missed removal, nor vice-versa.
- **Existing prod override rows are discarded at drop, by design** (§2). No data migration — reversion to sheet value IS the intended end state. Do not request a backfill.
- **The two residual needs (extend-role-scope-vocab, structural-transform use-raw) are deferred to BACKLOG, not built here** (§1, §6). Do not argue they must ship with the removal.
- **`crew_members.sheet_name` alias collapse to `[name]` is correct, not a regression** (§3.2b) — the alias only ever diverged under a name override, which no longer exists. Transport/reservation/scope matching is preserved (§4 guard).
- **No raw-error-code, advisory-lock, or Supabase-boundary regressions are introduced** — the change only *removes* a holder/reader; surviving surfaces keep their contracts. Meta-tests (§3.6) are updated to match, not weakened.
