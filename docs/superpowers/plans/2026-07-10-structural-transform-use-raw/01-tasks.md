# Tasks — Structural-transform use-raw

Read `00-overview.md` first (goal, global constraints, meta-test inventory, advisory-lock topology, file structure). Every task is TDD (failing test → fail-run → minimal impl → green → commit). Spec section refs point to `docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md`.

---

## Task 1: Parser `resolution` types (spec §6)

**Files:**
- Modify: `lib/parser/types.ts` (`ParseWarning` at :7-28; `ShowRow["dates"]` :124-135; `HotelReservationRow` :154-163)
- Test: `tests/parser/useRawResolutionTypes.test.ts` (type-level + a builder round-trip)

**Interfaces — Produces (later tasks consume these exact names):**
```ts
export type DateOrderFields = {
  travelIn: string | null;
  set: string | null;
  showDays: string[]; // ISO, order-preserved, index-aligned to the parsed block
  travelOut: string | null;
};
export type UseRawResolution =
  | {
      resolvable: true;
      contentHash: string;
      parsed:
        | { kind: "rooms"; name: string; dimensions: string | null; floor: string | null }
        | { kind: "hotels"; names: string[]; confirmationNo: string | null }
        | { kind: "dates"; dates: DateOrderFields };
      replacement:
        | { kind: "rooms"; name: string; dimensions: null; floor: null }
        | { kind: "hotels"; names: [string]; confirmationNo: null }
        | { kind: "dates"; dmyDates: DateOrderFields };
    }
  | { resolvable: false; reason: "empty-raw" | "invalid-dmy" };
```
`ParseWarning` gains `resolution?: UseRawResolution;` (optional on the common shape; ALWAYS set for the three in-scope codes — enforced in Task 2).

- [ ] **Step 1: Failing test** — assert a `ParseWarning` object with a `resolvable:true` rooms resolution type-checks and that `resolution` is `undefined`-able on a non-recoverable warning; assert `DateOrderFields.showDays` is `string[]`. (A `expectTypeOf`/`tsd`-style compile assertion plus a trivial runtime `expect(w.resolution?.resolvable).toBe(true)`.)
- [ ] **Step 2: Run to fail** — `pnpm vitest run tests/parser/useRawResolutionTypes.test.ts` — FAIL (types not exported).
- [ ] **Step 3: Implement** — add the two exported types and the `resolution?` field to `ParseWarning`. No behavior.
- [ ] **Step 4: Green** — rerun; PASS. `pnpm typecheck` clean.
- [ ] **Step 5: Commit** — `feat(parser): add ParseWarning.resolution + UseRawResolution/DateOrderFields types`

---

## Task 2: Parser populates `resolution` for the three codes (spec §6, §4 guards)

**Files:**
- Modify: `lib/parser/warnings.ts` (`emitRoomSplitAmbiguity` :139, `emitHotelGuestSplitAmbiguity` :174, `emitDateOrderSuggestsDmy` :234) — and their call sites in `rooms.ts:490-494`, `hotels.ts:572`, `dates.ts:535` if the builders need the parsed value / token list passed in.
- Test: `tests/parser/useRawResolutionPopulate.test.ts`

**Interfaces — Consumes:** Task 1 types. **Produces:** every emitted warning of the three codes carries `resolution` (resolvable payload OR `{resolvable:false, reason}`). Content-hash serialization per spec §5: rooms/hotels `sha256hex(collapse(rawSnippet))` where `collapse(s)=s.replace(/\s+/g," ").trim()`; dates = length-prefixed `\x1f`-join of `collapse(token.raw)` in `collectDateTokens` order (`len + ":" + raw`, empty→`0:`), then `sha256hex`.

- [ ] **Step 1: Failing tests** (derive expected from fixture raw, never hardcode hashes — but compute the expected hash in **test-local code that implements the spec §5 serialization directly** (`collapse` + `sha256hex`, and the length-prefixed `\x1f`-join for dates), NOT by importing the production `contentHashForRawSnippet`/`contentHashForDateTokens` helper — importing the impl under test makes the assertion tautological):
  - Room warning: `resolution.resolvable===true`, `parsed={kind:"rooms",name,dimensions,floor}` = the split, `replacement={kind:"rooms",name:collapse(rawHeader),dimensions:null,floor:null}`, `contentHash===sha256hex(collapse(rawHeader))`.
  - Hotel warning: `parsed={kind:"hotels",names,confirmationNo}` = the split; `replacement={kind:"hotels",names:[collapse(rawCell)],confirmationNo:null}`.
  - Date warning: `parsed.dates` uses `mdyIso`, `replacement.dmyDates` uses `dmyIso`, both `DateOrderFields`; `contentHash` = the length-prefixed serialization (assert by recomputing).
  - **Guard:** a fixture whose date token has null `dmyIso` → `resolution={resolvable:false,reason:"invalid-dmy"}`. An empty/whitespace room `rawHeader` → `{resolvable:false,reason:"empty-raw"}`.
  - **Cardinality (already true — pin it):** a DATES block with multiple out-of-order tokens emits **exactly one** `DATE_ORDER_SUGGESTS_DMY` (assert `warnings.filter(w=>w.code===DATE_ORDER_SUGGESTS_DMY).length===1`). `checkDateOrder` (`dates.ts:511`) breaks on first violation (`:527`), so no coalesce change is needed — this test guards against regression.
  - **Purity:** run the existing parser fuzz/mutation smoke (or a targeted `parseSheet` determinism assert) to confirm no admin state entered.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — extend the three builders to compute+attach `resolution`. Extract a shared `contentHashForRawSnippet` / `contentHashForDateTokens` helper in `lib/parser/warnings.ts` (or a new `lib/parser/useRawContentHash.ts`); the guard variants are set when the raw is empty or a DMY reinterpretation is invalid. Rooms/hotels derive `replacement` from `rawSnippet`; dates need the block's `DateToken[]` — pass it from `dates.ts` to the builder.
- [ ] **Step 4: Green** + full `pnpm vitest run tests/parser` (no regression to existing warning tests — they may need `resolution` added to expected objects if they use exact `toEqual`; update those).
- [ ] **Step 5: Commit** — `feat(parser): populate warning.resolution (parsed+raw+hash) for the three recoverable codes`

---

## Task 3: Pure overlay `applyUseRawDecisions` (spec §5, §7)

**Files:**
- Create: `lib/sync/useRawOverlay.ts`
- Test: `tests/sync/useRawOverlay.test.ts`

**Interfaces — Produces:**
```ts
export type UseRawDecision = {
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS" | "HOTEL_GUEST_SPLIT_AMBIGUOUS" | "DATE_ORDER_SUGGESTS_DMY";
  contentHash: string;
  target: { kind: string; name?: string; index?: number; field?: string };
  preference: "raw" | "transform";
  applied: boolean;
  decidedAt: string;
  decidedBy: string;
};
export function applyUseRawDecisions(
  parseResult: ParseResult,
  decisions: UseRawDecision[],
): { result: ParseResult; kept: UseRawDecision[]; invalidated: UseRawDecision[]; reverted: UseRawDecision[] };
```
Pure: no I/O, no clock. Matches each decision to current warnings by `(code, warning.resolution.contentHash)` (NOT target). For `preference:"raw"` matched → apply `resolution.replacement` to the warning's CURRENT target field(s); classify `kept`. For `preference:"raw"` unmatched → `invalidated`. For `preference:"transform"` → apply nothing (leave transform), classify `reverted` (matched or not). Rooms: rewrite room `name`/`dimensions`/`floor`. Hotels: rewrite the reservation (by `blockRef.index`) `names`(single)/`confirmation_no`(null). Dates: rewrite `result.dates.{travelIn,set,showDays,travelOut}` ONLY.

- [ ] **Step 1: Failing tests** (anti-tautology — assert the mutated `result` fields against `resolution.replacement`, derive expected from fixture raw):
  - **Match-by-content-hash, NOT target (R5):** decision whose pinned cell edited so target changes → `invalidated`, NOT applied. Unchanged cell → `kept` even if a different room changed. Whitespace-only edit (same canonical hash) → `kept`.
  - **Content-scoped partial divergence (R7):** two warnings with identical `contentHash` share one decision; both `kept`; edit one → still `kept` (matches the other), NO invalidation of the decision.
  - **Rooms/hotels/dates apply:** each rewrites exactly the documented fields; assert untouched fields equal (hotels: `hotel_name/address/check_in/check_out/notes`; dates: `loadIn/setupTime/setAgendaRaw`).
  - **`reverted` partition (R8):** `preference:"transform"` matched → `result` keeps the transform value, decision in `reverted`, none in `kept`/`invalidated`.
  - **Date shape:** `showDays` order-preserved, index-aligned.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** the pure function.
- [ ] **Step 4: Green.**
- [ ] **Step 5: Commit** — `feat(sync): pure applyUseRawDecisions overlay (kept/invalidated/reverted)`

---

## Task 4: `USE_RAW_DECISION_STALE` §12.4 code + lockstep (spec §10)

**Files:**
- Modify: master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose — ADD row; **never prettier this file**)
- Regenerate: `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`; `pnpm gen:internal-code-enums`
- Modify: `lib/messages/catalog.ts` (add row — shape per `RESYNC_SHRINK_HELD` :155-170: `{code, resolution, audience:"doug", adminSurface, dougFacing, crewFacing:null, followUp, helpfulContext, title, longExplanation, helpHref}`)
- Test: `tests/cross-cutting/codes.test.ts` (`x1` parity, :68-69) must stay green after the three-way edit.

**Interfaces — Produces:** `USE_RAW_DECISION_STALE` retrievable via `lib/messages/lookup.ts`. Doug-facing copy per spec §10 ("You'd chosen to use the sheet's raw text for <target>; that cell changed, so we're reading it fresh again.").

- [ ] **Step 1: Failing test** — assert `lookup("USE_RAW_DECISION_STALE")` returns the doug-facing copy and that the catalog ↔ §12.4 parity test enumerates it.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — add the §12.4 prose row, `pnpm gen:spec-codes`, `pnpm gen:internal-code-enums`, add the catalog row. Confirm help `_families` (per "new §12.4 code = 4 gates"): a doug-facing code — attach to an existing family or add one; run the help-family test.
- [ ] **Step 4: Green** — `pnpm vitest run tests/cross-cutting/codes.test.ts` + the internal-code-enums + help-family tests.
- [ ] **Step 5: Commit** — `feat(messages): add USE_RAW_DECISION_STALE §12.4 code (3-way lockstep)` (all four files in ONE commit).

---

## Task 5: Migration — two `use_raw_decisions` jsonb columns (spec §3)

**Files:**
- Create: `supabase/migrations/<ts>_use_raw_decisions.sql`
- Regenerate: `pnpm gen:schema-manifest` → `supabase/__generated__/schema-manifest.json` (commit)
- Apply surgically to validation project (`supabase db query --linked "<SQL>"` or `psql "$TEST_DATABASE_URL" -f …` then `notify pgrst, 'reload schema';`)
- Test: `tests/db/validation-schema-parity.test.ts` (Layer-1 sees two add-column vectors)

**Migration body (idempotent):**
```sql
alter table public.pending_syncs   add column if not exists use_raw_decisions jsonb not null default '[]'::jsonb;
alter table public.shows_internal   add column if not exists use_raw_decisions jsonb not null default '[]'::jsonb;
```
REVOKEs already exist for both tables (`20260619000001_lockdown_shows_internal.sql:18`, `20260601000000_b2_show_lifecycle.sql:163-164`) — no new REVOKE needed; confirm they cover the new columns (column-level grants inherit table REVOKE).

- [ ] **Step 1: Failing test** — a DB test asserting both columns exist with default `'[]'` (queries `information_schema.columns`); FAIL pre-migration.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Apply** locally (`psql "$TEST_DATABASE_URL" -f …`), `pnpm gen:schema-manifest` + commit manifest, apply to validation.
- [ ] **Step 4: Green** — the column test + `validation-schema-parity` Layer-1 (DB-free tripwire) + Layer-2 (psql).
- [ ] **Step 5: Commit** — `feat(db): add use_raw_decisions jsonb to pending_syncs + shows_internal` (migration + regenerated manifest in ONE commit).

---

## Task 6: Wire overlay into `applyParseResult` + both apply paths (spec §5, §7)

**Files:**
- Modify: `lib/sync/applyParseResult.ts` (`applyParseResult(tx, args)` :94; writes crew :135, rooms :141, hotels :140, parse_warnings :207) — add `useRawDecisions` param, run overlay, persist `kept` to `shows_internal.use_raw_decisions`, return `useRawInvalidated`.
- Modify: `lib/sync/phase2.ts` (`applyParseResult` call :368; `writeAutoApplyChanges` :389) — write the `USE_RAW_DECISION_STALE` change-log rows for `useRawInvalidated`, same locked txn.
- Modify: `lib/sync/applyStagedCore.ts` (finalize path) and `lib/sync/runManualSyncForShow.ts` (:292, re-sync) — supply the phase-appropriate `use_raw_decisions` column (staged `pending_syncs` vs persisted `shows_internal`).
- Test: `tests/sync/applyParseResultUseRaw.test.ts` (+ integration through `runManualSyncForShow`)

**Interfaces — Consumes:** `applyUseRawDecisions` (T3), `USE_RAW_DECISION_STALE` (T4), the columns (T5). **Produces:** `applyParseResult` gains one param `useRawDecisions: UseRawDecision[]` and returns `useRawInvalidated: UseRawDecision[]` on its outcome. It runs the overlay BEFORE the full-replace writes, and persists the new `use_raw_decisions` = `kept` each `applied:true` (drop `invalidated`+`reverted`) via the SAME `tx.upsertShowsInternal(...)` that already writes `parse_warnings` (:207-214). It does NOT write change-log (keeping its current write-scope) — it RETURNS `useRawInvalidated` and EVERY caller that supplied decisions consumes it. **Create ONE shared helper `writeUseRawStaleChanges(port, showId, driveFileId, invalidated)`** (colocate with the sync change-log writers, e.g. next to `writeAutoApplyChanges`) that emits one doug-facing `USE_RAW_DECISION_STALE` `show_change_log` row per `invalidated` decision (naming `target`), inside the caller's locked txn. **Both `applyParseResult` call sites invoke it, so finalize is NOT skipped:**
- **Re-sync path:** `phase2.ts` — after the `applyParseResult` call (`:368`) and alongside `writeAutoApplyChanges` (`:389`), call `writeUseRawStaleChanges(...)` with `applyOutcome.useRawInvalidated`, same locked txn.
- **Finalize path:** `applyStagedCore.ts` — at its own `applyParseResult` call (`:131`), consume the returned `useRawInvalidated` and call the SAME `writeUseRawStaleChanges(...)` inside that locked txn (do NOT rely on phase2 covering finalize — if the two call sites are distinct, each must call the helper).

`reverted` rows drop with NO change-log row. The two apply paths differ only in which `use_raw_decisions` column supplies the decisions (staged `pending_syncs` at finalize, persisted `shows_internal` at re-sync); both write `kept`(applied:true) back and both emit STALE for `invalidated`.

- [ ] **Step 1: Failing tests:**
  - A `preference:"raw"` decision matching a warning → the persisted `crew_members`/rooms/hotels/dates rows carry the raw value AND `shows_internal.use_raw_decisions` holds it `applied:true`.
  - An `invalidated` decision → a `USE_RAW_DECISION_STALE` `show_change_log` row is written AND the decision is pruned from the column. (Assert against the change-log + column, not the render.)
  - A `reverted` decision → transform value persisted, row GC'd, NO change-log row.
  - **Staged→persisted finalize migration:** a staged `pending_syncs.use_raw_decisions` decision applies at finalize and lands in `shows_internal.use_raw_decisions`; a re-ingestion that regenerated the staged parse (new hash) → `invalidated` at finalize, and `writeUseRawStaleChanges` writes the `USE_RAW_DECISION_STALE` change-log row AT FINALIZE (not only at re-sync). Assert against persisted `shows_internal` + the change-log written on the finalize path.
  - **Lock held:** the mutation runs inside the caller's `withShowLock` (assert via the existing lock-held assertion pattern).
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — thread the param; `applyStagedCore` reads `pending_syncs.use_raw_decisions`, `runManualSyncForShow` reads `shows_internal.use_raw_decisions`; call the overlay; persist/change-log/GC.
- [ ] **Step 4: Green** + `pnpm vitest run tests/sync`.
- [ ] **Step 5: Commit** — `feat(sync): apply use-raw overlay in applyParseResult at finalize + re-sync`

---

## Task 7: Per-show server action `setUseRawDecisionAction` (spec §9b)

**Files:**
- Create: `app/admin/show/[slug]/_actions/useRaw.ts`
- Modify registries: `tests/log/_auditableMutations.ts` (+row +`NEW_FORENSIC_CODES` `USE_RAW_DECISION_SET`/`_CLEARED`), `tests/auth/_metaInfraContract.test.ts` (register call sites)
- Test: `tests/admin/setUseRawDecisionAction.test.ts` + behavioral proof in `tests/log/adminOutcomeBehavior.test.ts`

**Interfaces — Produces:** `setUseRawDecisionAction(showId, warningRef, useRaw): Promise<TypedResult>`. Admin-gated (`requireAdminIdentity`). Loads the `shows` row by `showId` server-side, reads `drive_file_id` from it, derives lock key. **`warningRef` is validated server-side against the SHOW's current warnings:** load `shows_internal.parse_warnings`, find the warning matching `warningRef` (by `code` + `blockRef`), and read `(code, contentHash)` from THAT live warning's `resolution` — reject (typed error, no write) if no matching in-scope warning exists or its `resolution` is absent/`resolvable:false`. A client cannot inject a forged/stale `code`/`contentHash`/`target`. **State-aware toggle write (spec §3 table):** load the current `shows_internal.use_raw_decisions` row for `(code, contentHash)`, compute what entity rows currently hold, write new `applied = (entity rows already match new preference)`; `{transform, applied:true}` → row-deletion. **Server-derived provenance:** `decidedBy` = the identity from `requireAdminIdentity` (NOT a client arg); `decidedAt` = the server clock. `target` copied from the live warning (display-only). Sequence: (1) `withShowLock` write+commit; (2) delegate to `runManualSyncForShow` (its OWN lock — sequential, not nested). Post-commit `logAdminOutcome({code: useRaw ? "USE_RAW_DECISION_SET" : "USE_RAW_DECISION_CLEARED", …})` OUTSIDE the lock tx. Every Supabase call destructures `{data,error}` with typed infra faults. Returns typed result distinguishing "already settled" vs "saved, apply pending (re-sync failed)".

- [ ] **Step 1: Failing tests:**
  - **State-aware write matrix (R9/R10):** from `transform-active`→`{raw,false}`; from `clear-pending`→`{raw,true}` (raw-active immediately — assert NOT `applied:false`); from `raw-active` off→`{transform,false}`; from `apply-pending` off→row deleted. Cover every §3 cell.
  - **Toggle-off failure symmetry (R8):** a step-(2) `runManualSyncForShow` failure after toggle-OFF of an applied row leaves `{transform,false}` intact (durable `clear-pending`) — NOT rolled back, NOT silently transform-active. Same for toggle-ON → durable `apply-pending`.
  - **`warningRef` validated against the show's live warnings:** a `warningRef` whose `code`/`contentHash` does NOT match any current `shows_internal.parse_warnings` in-scope warning (forged, or stale after a re-parse) → typed error, NO write. A warning whose `resolution` is absent/`resolvable:false` → rejected. The stored `contentHash` comes from the LIVE warning's `resolution`, never a client arg.
  - **Server-derived provenance:** `decidedBy` = `requireAdminIdentity` result (assert a client-supplied `decidedBy` is ignored); `decidedAt` = server clock (assert not client-controllable).
  - **Lock key server-derived:** a client-forged `showId`/handle cannot steer the lock; key comes from the loaded `shows` row.
  - **Sequential-not-nested:** the decision write's `withShowLock` releases before `runManualSyncForShow` acquires (assert no nested double-hold — extend/consult `advisoryLockRpcDeadlock.test.ts` topology if needed; it should remain UNCHANGED).
  - **Behavioral proof:** sink-spy records ONLY after observing the forensic code on the committed-success branch (`adminOutcomeBehavior.test.ts`).
  - **Infra fault:** a Supabase `{error}` returns a typed infra result, not a silent continue.
- [ ] **Step 2: Run to fail** (incl. `_metaMutationSurfaceObservability` failing-by-default until the AUDITABLE_MUTATIONS row lands).
- [ ] **Step 3: Implement** the action + register the AUDITABLE_MUTATIONS row + NEW_FORENSIC_CODES + infra-contract rows.
- [ ] **Step 4: Green** — action test + `tests/log/_metaMutationSurfaceObservability.test.ts` + `adminOutcomeBehavior.test.ts` + `_metaInfraContract.test.ts` + `advisoryLockRpcDeadlock.test.ts`.
- [ ] **Step 5: Commit** — `feat(admin): per-show setUseRawDecisionAction (state-aware toggle, delegated re-sync, admin-outcome)`

---

## Task 8: Wizard-staged server action `setStagedUseRawDecisionAction` (spec §9a)

**Files:**
- Create: `app/admin/onboarding/_actions/useRawStaged.ts` (the exact path from the overview File structure — used identically in the UI wiring, `AUDITABLE_MUTATIONS` row, and `_metaInfraContract` registration)
- Modify: same registries as Task 7 (+1 AUDITABLE_MUTATIONS row; the forensic codes are already in NEW_FORENSIC_CODES)
- Test: `tests/admin/setStagedUseRawDecisionAction.test.ts` + behavioral proof

**Interfaces — Produces:** `setStagedUseRawDecisionAction(wizardSessionId, warningRef, useRaw)`. Loads `pending_syncs` by `wizard_session_id` server-side, reads `drive_file_id`, locks `show:<driveFileId>`. Under the lock: toggle-ON upserts `{preference:"raw", applied:false}`, toggle-OFF hard-deletes (pre-create has no applied entity rows — no `clear-pending`). Does NOT re-apply (no show yet). Validates `warningRef` matches a warning present in that row's `parse_result` before write. Post-commit `logAdminOutcome`.

- [ ] **Step 1: Failing tests:** decision written to `pending_syncs.use_raw_decisions` under `withShowLock`; toggle-off deletes; `driveFileId`/lock key server-derived from the `pending_syncs` row (not client arg); `contentHash` read from the live `parse_result` warning's `resolution` (forged/stale `warningRef` → typed error, no write); `decidedBy` from `requireAdminIdentity` + `decidedAt` from server clock (client-supplied values ignored); NO re-apply; behavioral proof of the forensic emit; infra-fault typed result.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** + AUDITABLE_MUTATIONS row + infra-contract row.
- [ ] **Step 4: Green** (same meta-test set as Task 7).
- [ ] **Step 5: Commit** — `feat(admin): wizard-staged setStagedUseRawDecisionAction (pending_syncs, no re-apply)`

---

## Task 9: `<UseRawControl>` UI + both surfaces (spec §8) — Opus + impeccable dual-gate

**Files:**
- Create: `components/admin/UseRawControl.tsx`
- Modify: `components/admin/PerShowActionableWarnings.tsx` (pass via `renderItemControls` :31/:103) + `app/admin/show/[slug]/page.tsx` wiring; `components/admin/wizard/step3ReviewSections.tsx` (judgment callout :505-517) + `components/admin/OnboardingWizard.tsx`
- Test: `tests/components/UseRawControl.test.tsx` (jsdom for logic) + `tests/e2e/useRawControl.spec.ts` (Playwright real-browser for states/transitions/layout)

**Interfaces — Consumes:** both actions (T7/T8), `warning.resolution`. Props: `<UseRawControl warning current decision state onToggle />`. `current` sourced from `warning.resolution.parsed` (NEVER entity rows). Guard precedence (spec §8): not-in-scope → render nothing; `resolution` absent → `legacy-unavailable`; `resolvable:false` → `disabled` with reason; else derive `transform-active`/`apply-pending`/`raw-active`/`clear-pending` from `preference`+`applied`.

**Transition Inventory (from spec §8 — the seven render states are `transform-active`, `apply-pending`, `raw-active`, `clear-pending`, `disabled`, `legacy-unavailable`, and the optimistic in-flight `pending`).** The `<UseRawControl>` render state is a PURE FUNCTION of `(warning.resolution, decision.preference, decision.applied, inFlight)` — there is no free state machine, so the audit enumerates every reachable transition of that function. Steady-state transitions the transition-audit task MUST assert (each is an animation OR an explicit "instant — no animation needed"):

| From \ Trigger | toggle ON | toggle OFF | successful re-sync | failed re-sync (durable after reload) |
|---|---|---|---|---|
| `transform-active` | → `pending` → `apply-pending` | (no-op) | — | stays `apply-pending` |
| `apply-pending` | (no-op) | → `transform-active` (row delete) | → `raw-active` | stays `apply-pending` |
| `raw-active` | (no-op) | → `pending` → `clear-pending` | — | stays `clear-pending` |
| `clear-pending` | → `raw-active` (immediate, `applied:true`) | (no-op) | → `transform-active` (GC) | stays `clear-pending` |
| `disabled` / `legacy-unavailable` | (no toggle — inert) | (inert) | may upgrade after re-parse attaches `resolution` | inert |

Compound cases to enumerate: `pending` overlaying each steady state (optimistic in-flight); a reload landing on each of `apply-pending`/`clear-pending` (durability); `disabled` vs `legacy-unavailable` rendering DISTINCT copy (not interchangeable). Static audit obligation: enumerate every `AnimatePresence`, ternary render, and conditional block in `UseRawControl.tsx`; each either carries the appropriate `exit`/`initial`/`animate` (if animated) OR is explicitly declared instant. Because the control is small and mostly instant swaps, "instant — no animation needed" is the expected disposition for most cells; the audit must state that explicitly rather than leaving it implied.

- [ ] **Step 1: Failing tests (jsdom logic):** state derivation for all four persisted shapes + the three guard branches (the pure `stateOf(resolution, preference, applied, inFlight)` function); `current` reads `resolution.parsed` (assert it does NOT read entity rows — pass an overlaid entity row and a differing `resolution.parsed`, assert the parsed value renders). Anti-tautology: clone+strip sibling nodes before scanning for a label; `disabled` vs `legacy-unavailable` assert distinct copy strings.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** the presentational control + wire both surfaces (per-show `onToggle`→`setUseRawDecisionAction`; wizard→`setStagedUseRawDecisionAction`; the wizard re-reads `pending_syncs.parse_result`, per-show re-reads `shows_internal.parse_warnings`).
- [ ] **Step 3b: Transition-audit (executable test — REQUIRED, not a PR note).** Write `tests/components/UseRawControl.transitions.test.tsx` that: (a) drives the pure `stateOf(...)` through EVERY cell of the transition matrix above and asserts the resulting render state; (b) statically asserts each `AnimatePresence`/ternary/conditional in `UseRawControl.tsx` is either animated with the appropriate `exit`/`initial`/`animate` OR is deliberately instant — encode this as a test that renders each transition and asserts no unexpected animation wrapper (or the expected one), so a later edit that adds/removes an animation fails the test; (c) exercises the compound cases: `pending` overlaying each steady state, and toggling while a prior toggle is mid-`pending`. This is a committed, CI-run test — the audit is not satisfied by a prose note.
- [ ] **Step 4a: Real-browser (Playwright, NOT jsdom)** — render the control in both surfaces; assert `transform-active`↔`raw-active` toggle, `apply-pending`/`clear-pending` render + survive reload, `disabled` vs `legacy-unavailable` distinct copy, `clear-pending → raw-active` is immediate, both parsed+raw render from `resolution`. **Layout-dimensions assertion** if the control sits in a fixed-dimension parent: `getBoundingClientRect()` on each `data-testid` child == parent within 0.5px (Tailwind v4 does not default `.flex` to `align-items:stretch` — assert explicitly). If the control flows in normal document flow (no fixed-dimension parent), record "N/A — no fixed-dimension parent" in the PR.
- [ ] **Step 4b: impeccable v3 dual-gate** — `/impeccable critique` AND `/impeccable audit` on the diff (both surfaces); HIGH/CRITICAL fixed or `DEFERRED.md`. Record findings + dispositions.
- [ ] **Step 5: Commit** — `feat(admin): UseRawControl + wizard & per-show wiring` (after both gates pass).

---

## Task 10: Full-suite gate + meta-test sweep (close-out prep)

**Files:** none new — verification only.

- [ ] **Step 1:** Re-run every touched meta-test after the class edits (fix-round regression budget): `_auditableMutations`/`_metaMutationSurfaceObservability`, `adminOutcomeBehavior`, `_metaInfraContract`, `advisoryLockRpcDeadlock`, `_metaAdminOutcomeContract`, `tests/cross-cutting/codes.test.ts`, `validation-schema-parity`.
- [ ] **Step 2:** `pnpm test` (FULL suite — scoped gates miss cross-chokepoint regressions), `pnpm typecheck`, `pnpm build` (RSC server-action boundary + client/server import discipline only `next build` catches), `pnpm format:check`, `pnpm lint`.
- [ ] **Step 3:** Fix any failures (own commit each, TDD where behavioral).
- [ ] **Step 4:** No commit unless a fix was needed.

Stage 4 (whole-diff Codex review → push → real CI green → `gh pr merge --merge` → ff main) is driven by `/ship-feature`, not a plan task.

---

## Self-review checklist (run before adversarial review)

- **Spec coverage:** every spec §1-§14 requirement maps to a task above. Gaps: none known.
- **Anti-tautology:** overlay/action tests assert against `resolution.replacement`/persisted column/change-log, not a render container; UI test clones+strips siblings; expected values derived from fixture raw, never hardcoded hashes.
- **Type consistency:** `UseRawDecision`, `UseRawResolution`, `DateOrderFields`, `applyUseRawDecisions` signatures match across T1/T3/T6/T7/T8/T9.
- **Layout-dimensions task:** T9 §4a (only if a fixed-dimension parent hosts the control — verify during impl; if not, record "N/A — control flows in normal document flow").
- **Transition-audit task:** T9 covers the full spec §8 inventory incl. compound + reload-survival.
- **Fix-round regression budget:** T10 re-greps every class after each fix.
