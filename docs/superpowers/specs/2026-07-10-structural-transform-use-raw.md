# Spec — Structural-transform "use the sheet's raw value" (BL-STRUCTURAL-TRANSFORM-USE-RAW)

**Date:** 2026-07-10
**Slug:** structural-transform-use-raw
**Backlog source:** `BACKLOG.md` → `BL-STRUCTURAL-TRANSFORM-USE-RAW` (filed by PR #382, the admin field-override removal).
**Status:** Autonomous-ship (both spec + plan user-review gates waived per AGENTS.md autonomous-ship gate; user approved at design convergence 2026-07-10).

---

## 1. Why

Three parser transforms **structure** a sheet cell into sub-fields, and each can get the structuring wrong even when the sheet is correct:

- **Room header split** — `splitRoomHeader(raw, kind)` (`lib/parser/blocks/rooms.ts:1501-1509`) splits a header like `GENERAL SESSION / BALLROOM A / 40x60` into `{name, dimensions, floor}`. When the name↔dims boundary is uncertain it emits `ROOM_HEADER_SPLIT_AMBIGUOUS` (`lib/parser/warnings.ts:139-155`, from `rooms.ts:493`).
- **Hotel guest/address glue** — `parseGuestCell(cell)` (`lib/parser/blocks/hotels.ts:157-161`) splits a guest cell into `{names[], confs[]}`; an uncertain split emits `HOTEL_GUEST_SPLIT_AMBIGUOUS` (`warnings.ts:174-197`, from `hotels.ts:572`).
- **Inverted dates** — date parsing reads tokens as M/D/Y; when the ordering looks like D/M/Y it emits `DATE_ORDER_SUGGESTS_DMY` (`warnings.ts:234-246`, from `dates.ts:535`).

These are the **only** territory a sheet edit cannot fix: the sheet content is right, but no rewording changes how the parser *structures* it (unlike the verbatim identity fields that the shipped fix-in-sheet + Re-sync loop already covers — the reason the admin field-override feature was removed in PR #382). This feature gives the admin a **"use the sheet's raw value"** affordance on each of these three recoverable ambiguity warnings.

**Not a second source of truth.** This is the load-bearing distinction from the removed field-override feature (#376). No admin-typed value is ever stored. The corrected value is **always re-derived from the sheet's own raw content each sync**; the only thing persisted is a boolean *preference* ("prefer raw over the transform for this warning"), **content-pinned** to the exact raw it was made against. If the sheet cell changes, the preference **auto-invalidates** and the transform re-runs — so the app can never diverge from the sheet. This makes the #376 stale-second-source failure structurally impossible.

### 1.1 Relationship to the removed field-override feature (do NOT relitigate)

PR #382 removed `admin_overrides` + `set_field_override`. This feature is its **sheet-canonical-preserving successor, scoped to structural transforms only** (`BACKLOG.md` BL-STRUCTURAL-TRANSFORM-USE-RAW). It does NOT store a value, does NOT touch verbatim/sheet-editable fields, and does NOT reintroduce `admin_overrides`. The persistence is a preference re-derived from raw, content-pinned + auto-invalidating. This is explicitly in scope and ratified at design; see §11 Watchpoints.

---

## 2. Scope

**In scope (v1):** all three recoverable structural-transform warnings — `ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY`. A per-show persisted set of content-pinned "use raw" decisions; a pure post-parse overlay that applies them before the full-replace write; a shared admin control in the Step-3 review wizard AND the per-show admin detail page; new §12.4 message copy + admin-outcome telemetry.

**Out of scope:**
- `HOTEL_CARDINALITY_EXCEEDED` — a dropped-data problem, deliberately NOT in `AMBIGUITY_CODES` (`lib/parser/ambiguityCodes.ts:9,19-24`); it carries no `rawSnippet` and "use raw" cannot recover dropped rows.
- `CREW_COLUMN_POSITIONAL_FALLBACK` — in `AMBIGUITY_CODES` but not a structural transform of a single cell; column-mapping recovery is a different problem.
- Any free-form admin-typed value (that is the removed #376 feature).
- The role→scope-capability feature (`BL-EXTEND-ROLE-SCOPE-VOCAB`) — a separate later cycle.
- `pull_sheet_override` — a separate surviving feature, untouched.

---

## 3. Data model — two homes, staged → persisted

The two admin surfaces live in **different lifecycle phases** (verified against the onboarding flow), so the decision set has two storage homes and a one-way migration at finalize:

- **Wizard (Step-3 review) is PRE-CREATE.** No `shows`/`shows_internal` row exists yet; the parse result + warnings live in `pending_syncs.parse_result jsonb`, keyed by `wizard_session_id`/`drive_file_id` (there is **no `showId`**); the `shows` row is INSERTed only at finalize (`lib/sync/applyStagedCore.ts:434`, via `app/api/admin/onboarding/finalize/route.ts`). So a wizard decision cannot be written to `shows_internal`.
- **Per-show admin page is POST-PUBLISH.** `shows` + `shows_internal` exist; warnings are read from `shows_internal.parse_warnings` (`app/admin/show/[slug]/page.tsx:335-338`).

**Two new jsonb columns (one migration file), same `UseRawDecision[]` shape + default `'[]'::jsonb`:**
1. `pending_syncs.use_raw_decisions jsonb not null default '[]'` — the **staged** home; written by the wizard action, keyed by the pending-sync row (`wizard_session_id`/`drive_file_id`). `pending_syncs` is an invariant-2 advisory-lock table.
2. `shows_internal.use_raw_decisions jsonb not null default '[]'` — the **persisted** home; written by the per-show action + by finalize/apply. `shows_internal` (`supabase/migrations/20260501001000_internal_and_admin.sql:1-6`, PK `show_id → shows`) already carries `parse_warnings jsonb`.

**Staged → persisted migration at finalize.** When onboarding finalizes (`applyStagedCore` → `applyParseResult`), the staged `pending_syncs.use_raw_decisions` are read, passed to the overlay (§7), applied to the parse result, and the surviving (`kept`) set is persisted to `shows_internal.use_raw_decisions` — all inside the finalize's existing per-show advisory-lock tx. After finalize the persisted home is authoritative; the staged row is consumed with the rest of the pending-sync.

**Entry shape** (`UseRawDecision`):

```ts
type UseRawDecision = {
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS" | "HOTEL_GUEST_SPLIT_AMBIGUOUS" | "DATE_ORDER_SUGGESTS_DMY";
  contentHash: string; // SHA-256 (hex) of the canonical pinned raw (§5). WITH `code`, this is the
                       // storage-uniqueness AND match key — NOT the target (§5).
  target: { kind: string; name?: string; index?: number; field?: string }; // DISPLAY ONLY (change-log
                       // + UI label); content-derived, so never used to match (a content edit can change it).
  decidedAt: string;   // ISO timestamp
  decidedBy: string;   // admin identity (canonicalized email or admin id)
};
```

No stored corrected value. `(code, contentHash)` is the only thing binding the decision to sheet content; `target` is a human-readable label carried alongside.

**Guard conditions:** an empty array (default) means "no decisions — every transform applies normally." A malformed or non-array `use_raw_decisions` (should be impossible given the write path, but defensively) is treated as empty (`[]`) and logged, never throwing. A decision whose `code` is not one of the three in-scope codes is ignored (forward/backward-compat guard).

**PostgREST DML posture:** both `use_raw_decisions` columns are written ONLY through the SECURITY DEFINER admin path (the server actions under the per-show advisory lock, §9). The plan's pre-draft pass MUST confirm `authenticated`/`anon` `INSERT`/`UPDATE`/`DELETE` are REVOKEd on BOTH `shows_internal` AND `pending_syncs` (RPC-gated-table lockdown, AGENTS.md cross-cutting discipline); if either is missing, add the REVOKE. No new tables, so no new grant surface beyond confirming/extending the existing lockdown.

---

## 4. Per-transform "use raw" semantics (product-visible)

Each transform declines its structuring and substitutes a value **derived from the sheet's raw content**:

| Transform | Warning | Field(s) rewritten | "Use raw" value (derived, never typed) |
|---|---|---|---|
| Room header split | `ROOM_HEADER_SPLIT_AMBIGUOUS` | room `name`, `dimensions`, `floor` | `name` = the full raw header (`warning.rawSnippet` = `params.rawHeader`, `warnings.ts:154`); `dimensions` = `null`; `floor` = `null`. Honest: crew sees exactly the sheet cell as the room's identity; no untrusted split. |
| Hotel guest glue | `HOTEL_GUEST_SPLIT_AMBIGUOUS` | hotel reservation `guests` | the raw cell (`warning.rawSnippet` = `params.rawCell`, `warnings.ts`) rendered as a **single** guest entry; no per-guest split, no confirmation-number extraction. |
| Inverted dates | `DATE_ORDER_SUGGESTS_DMY` | the show's parsed dates (whole DATES block) | the **DMY reinterpretation**: each `DateToken` already carries `{raw, mdyIso, dmyIso}` (`dates.ts:391`); "use raw" applies `dmyIso` for every token in the block instead of `mdyIso`. Deterministic reinterpretation of the raw tokens, not a typed value. |

**Rooms/hotels are "use raw verbatim"; dates are "use the alternate deterministic interpretation of the raw."** Both are sheet-derived. The overlay (§7) and both UIs consume these values from `warning.resolution.replacement` (§6), which the parser precomputes and persists on the warning — no downstream recomputation. The date case is the reason the parser must populate `resolution` (the raw warning carries only a single token `violationRaw`, `dates.ts:535`, not the block-wide alternate).

**Guard conditions (partial/empty raw):**
- Room: if `rawSnippet` is empty/whitespace after cleaning, the control is **disabled** with copy "no raw text to fall back to" — never store a decision that would blank the room name. (Should not occur — the split only fires on non-empty headers — but guarded.)
- Hotel: same empty-`rawSnippet` guard.
- Date: if the DMY reinterpretation yields an invalid date for any token (e.g. day > 12 both ways is unambiguous and never warns; but a token that is invalid as DMY), the control is disabled with "these dates can't be read the other way" — never persist a decision that produces an invalid date.

---

## 5. Decision identity, content-pin, and auto-invalidate lifecycle

**`contentHash` is precomputed by the parser** into `warning.resolution.contentHash` (§6) — the admin write path (§9) does NOT recompute it; it copies `warning.resolution.contentHash` into the stored decision. This guarantees the pin the decision was made against is byte-identical to what the overlay later compares, with a single serialization owner (the parser). The serialization the parser uses, per transform:
- Room / Hotel: `sha256hex(collapse(rawSnippet))` where `collapse(s) = s.replace(/\s+/g, " ").trim()` (a single collapsed string — matches the already-collapsed `rawHeader`, `warnings.ts:145`).
- Date: a **length-prefixed, order-preserving** join (a plain concatenation is ambiguous: `["1","23"]` vs `["12","3"]`). For each token in `collectDateTokens` document/encounter order (`dates.ts:485`, pre-sort), emit `collapse(token.raw).length + ":" + collapse(token.raw)`, joined by `"\x1f"` (ASCII unit separator, cannot occur in a sheet cell); empty/omitted tokens serialize as `0:`. `sha256hex(thatString)`. Block-wide so any edit to any date in the block re-decides.

**Decision identity = `(code, contentHash)` — the MATCH KEY is the content-pin, NOT the content-derived target.** This is the crux of the model (comprehensive re-analysis, spec R5). The `target` (room `name`, hotel `name`+`field`, date `field:"order"`) is derived FROM the sheet content, so a content edit can change it — matching on `target` would let a target-changing edit silently orphan a decision. Instead:
- **Storage/uniqueness key = `(code, contentHash)`.** The write path (§9) upserts by `(code, contentHash)` — at most one decision per pinned content. `target` is stored for display/change-log only (never a match key).
- **Match on apply = `(code, contentHash)`.** A decision applies to EVERY current recoverable warning whose `(code, warning.resolution.contentHash)` equals the decision's — normally exactly one; two entities with byte-identical raw (e.g. two rooms with the same header) legitimately share the decision (same content → same choice).

**Two outcomes, both handled uniformly (no stale/moot distinction — collapsed in R5 so nothing is ever silent):**
1. **KEPT** — the decision's `(code, contentHash)` IS present among the current warnings → apply `warning.resolution.replacement` to that warning's CURRENT target field(s) (the field location comes from the live warning, not the stored decision).
2. **INVALIDATED** — the decision's `(code, contentHash)` is NOT present among the current warnings (the pinned cell was edited to different content — whether it now parses cleanly, parses ambiguously with a *different* hash, or the target moved) → drop the decision and **always surface** it. There is no silent path: any time a use-raw choice stops applying, the admin is told.

**Write-back + surfacing (the caller, not the pure overlay).** The pure overlay (§7) only classifies (returns `kept` / `invalidated`); it performs no I/O. Its **caller** — `applyParseResult`, inside the per-show advisory-lock tx — within that SAME transaction: (a) persists the pruned `use_raw_decisions` = only the `kept` set (dead entries removed, no accumulation); (b) for each `invalidated` decision, writes a `show_change_log` row carrying the doug-facing `USE_RAW_DECISION_STALE` code (§10) naming the stored `target` — the **never-silent** surfacing. This changes-feed write rides on `applyParseResult`'s existing sync-path instrumentation (part of the already-covered apply path — no new `AUDITABLE_MUTATIONS` row; §9 covers the admin-toggle actions, the only new admin-mutation surfaces).

**UI ↔ decision matching also uses `(code, contentHash)`** — a rendered warning shows the `raw-active` state iff a stored decision matches its `(code, warning.resolution.contentHash)`; so exactly one control per warning, and the control can never bind to a mismatched-content decision.

**Flag lifecycle table** (`use_raw_decisions`):

| Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|
| `pending_syncs.use_raw_decisions jsonb` (staged) | `setStagedUseRawDecisionAction` (wizard toggle, under per-show lock) | `applyParseResult` at **finalize** (via `applyStagedCore`); the wizard UI (render current state, preview from `warning.resolution`) | at finalize, live staged decisions apply to the overlaid parse result; the `kept` set migrates to `shows_internal.use_raw_decisions` |
| `shows_internal.use_raw_decisions jsonb` (persisted) | (a) `setUseRawDecisionAction` (per-show toggle, under lock); (b) finalize migration from the staged column; (c) overlay prune during apply (drop `invalidated`, write back only `kept`) | `applyParseResult` at **re-sync**; the per-show UI (render current state) | when a live decision matches a firing warning, the target field is set to `warning.resolution.replacement` in the parse result persisted by `applyParseResult` |

---

## 6. Parser changes — the `resolution` payload (single source for overlay + both UIs)

The overlay and BOTH admin surfaces need, per recoverable warning: (a) the raw-derived replacement value, and (b) the content-pin. These MUST travel with the persisted warning, because the surfaces read from **persisted** state, not a live parse: the wizard reads `pending_syncs.parse_result.warnings` (`OnboardingWizard.tsx:426-431,538-546`) and the per-show page reads `shows_internal.parse_warnings` (`app/admin/show/[slug]/page.tsx:335-338`) — both are the persisted `ParseWarning[]` (full objects incl. `rawSnippet`, persisted by `applyParseResult.ts:214`). Neither re-parses. So the parser attaches everything to the warning itself:

Extend `ParseWarning` (`lib/parser/types.ts:7-28`) with ONE optional field, populated ONLY for the three recoverable codes (absent on all other warnings, so no bloat to the common shape):

```ts
resolution?: {
  contentHash: string; // §5 canonical pin, precomputed by the parser
  replacement:
    | { kind: "rooms"; name: string; dimensions: null; floor: null }   // name = raw header
    | { kind: "hotels"; guests: string }                                // guests = raw cell verbatim
    | { kind: "dates"; dmyDates: <parsed-dates shape> };                // DMY reinterpretation of the block
};
```

- **Rooms/hotels:** `replacement` derived from the warning's own `rawSnippet` (collapsed `rawHeader` / `rawCell`); `contentHash = sha256hex(collapse(rawSnippet))` (§5).
- **Dates:** `replacement.dmyDates` computed from the block's `DateToken[]` (`dates.ts:391,485`) by preferring `dmyIso`; `contentHash` = the §5 length-prefixed token serialization. **Exactly one `DATE_ORDER_SUGGESTS_DMY` warning per DATES block** — the parser change MUST coalesce to a single block-scoped warning carrying the block resolution (the plan verifies the current emit cardinality at `dates.ts:535`/`checkDateOrder`; if it can currently emit more than one per block — e.g. per out-of-order token — the change collapses them to one so there is one control and one `(code, contentHash)` decision per block, never duplicated `kept`/`invalidated` handling or duplicate change-log rows). **Guard:** if any token has a null `dmyIso` (invalid as DMY), the parser OMITS `resolution` entirely → the UI renders the disabled-guard state (§8) and no decision can be stored (§4).

**Parser purity preserved** — `resolution` is computed purely from sheet data the parser already holds (`rawSnippet`, `DateToken`), with NO admin state entering `parseSheet`; the fuzz/mutation layer still sees a pure parser (it just emits a richer warning). The overlay (§7) and both surfaces read `warning.resolution`; nothing recomputes it downstream.

---

## 7. Apply-path overlay

A pure module `lib/sync/useRawOverlay.ts`:

```ts
applyUseRawDecisions(
  parseResult: ParseResult,
  decisions: UseRawDecision[],
): { result: ParseResult; kept: UseRawDecision[]; invalidated: UseRawDecision[] };
```

- Pure: input parse result (warnings carry `resolution`, §6) + decisions → new parse result + the two-way partition (kept / invalidated) for the caller to persist + surface. Matches each decision to current warnings by `(code, contentHash)` (§5, NOT by content-derived target); applies `warning.resolution.replacement` to the matched warning's CURRENT target field(s) for each `kept` decision. No I/O, no clock (timestamps passed in), deterministic — no re-parse, no recomputation of `resolution`.
- Runs in `applyParseResult` (`lib/sync/applyParseResult.ts:94-97`) BEFORE the full-replace writes (crew `:135-136`, rooms `:141`, hotels `replaceHotelReservations`, `parse_warnings` `:207-214`), on **both** apply paths: onboarding **finalize** (`applyStagedCore` → `applyParseResult`, decisions read from the STAGED `pending_syncs.use_raw_decisions`) and post-publish **re-sync** (decisions read from the PERSISTED `shows_internal.use_raw_decisions`). The overlaid `parseResult` is what gets persisted, so the stored `crew_members`/rooms/`hotel_reservations`/dates rows are canonical — every downstream reader (crew page, report, exports) sees the corrected value with no per-consumer overlay. `applyParseResult` gains one parameter: the decisions array (the caller supplies the phase-appropriate column).
- `applyParseResult` already runs inside the per-show advisory-lock tx (`lib/sync/lockedShowTx.ts:57-62`, single holder — takes `tx`, does not self-lock). The overlay itself is pure (no I/O); `applyParseResult` — as the caller, in that same tx — persists the pruned `kept` set to `shows_internal.use_raw_decisions` (the persisted home, even when the source was the staged column — this IS the §3 staged→persisted migration at finalize) and writes the `USE_RAW_DECISION_STALE` change-log rows for `invalidated` entries (§5 write-back — always surfaced, no silent path). Single-holder preserved, no new lock layer.

**Content-pin holds at finalize because the overlay always compares against the CURRENT warning's hash, never blindly applies.** The overlay runs against whatever `parse_result` is being applied — at finalize that is the **current staged `pending_syncs.parse_result`**, and its warnings carry `resolution.contentHash` from the parse that produced it. Two cases: (i) **no re-ingestion since the decision** — the staged decision was made against exactly this staged parse, so `decision.contentHash == warning.resolution.contentHash` → `kept` (trivially, by construction; the admin approves precisely what they reviewed — finalize does NOT re-fetch/re-parse a different sheet). (ii) **a re-ingestion regenerated the staged parse** (the admin re-synced during onboarding, replacing `pending_syncs.parse_result` with a fresh parse carrying new `resolution.contentHash`) — now the old staged decision's hash may mismatch the new staged warning → `invalidated`, handled identically to the re-sync case (dropped, surfaced). So there is exactly one comparison rule (`decision.contentHash` vs the current warning's `resolution.contentHash`) applied uniformly at finalize and at re-sync; no separate finalize freshness gate is needed, and an invalidated staged decision can never be silently applied.

---

## 8. UI (Opus + impeccable v3 dual-gate)

One shared **presentational** client component `<UseRawControl warning current decision state onToggle />`:
- `warning.resolution.replacement` (§6) supplies the **raw preview** (persisted on the warning in both phases, so neither surface re-parses).
- `current` supplies the **currently-parsed value** for the same target field(s) — the value the transform produced (room name/dims/floor, hotel guests, or the show dates). The control renders both (parsed vs raw) so the admin compares before toggling. `current` is sourced from the parse data the surface already has: in the wizard, from `pending_syncs.parse_result` (the rooms/hotels/dates the callout sits beside); on the per-show page, from the persisted rows already loaded for the page. The plan wires `current` from the surface's existing parse data by matching the warning's `blockRef` `target` to the corresponding parsed entity — no new fetch.

The two surfaces differ only in which server action `onToggle` binds to and which handle it carries:

- **Wizard judgment callout** — `components/admin/wizard/step3ReviewSections.tsx:494-547`. Today each entry renders `reviewWarningTitle(warning)` + `fieldLabelFor(warning.blockRef?.field)` + a `View details` jump button (`:513,517,525-531`); there is **no** per-entry action slot yet. Add the control inline per entry (only for the three in-scope codes). `onToggle` → `setStagedUseRawDecisionAction(wizardSessionId, warningRef, useRaw)` — the server derives `driveFileId`/lock key from the `pending_syncs` row (§9a, NO showId in this phase); the wizard re-reads the staged row after toggling.
- **Per-show admin page** — `components/admin/PerShowActionableWarnings.tsx`, via its existing `renderItemControls?: (w: ParseWarning, i: number) => ReactNode` prop (`:31`, rendered `:103`). Pass `<UseRawControl>` through that slot. `onToggle` → `setUseRawDecisionAction(showId, warningRef, useRaw)`; warnings come from `shows_internal.parse_warnings`.

**States** (a small state machine, enumerate every transition in the plan's transition-audit task):
- `transform-active` (default) — shows the transform's structured result + a "Use the sheet's raw value instead" affordance with an inline **preview** of what raw would render.
- `raw-active` — shows the raw-derived value + "Using the sheet's raw value" + a "Switch back to the parsed version" affordance.
- `disabled` — when the guard conditions in §4 hold (empty raw / invalid DMY); shows why, no toggle.
- `pending` — optimistic in-flight during the server action; the toggle disables to avoid double-submit (see the react-form-action self-disable gotcha).

Toggling calls the server action (§9), then the surface re-reads. **Copy scope (invariant 5 boundary):** invariant 5 governs *error/warning CODES* — no raw code string like `USE_RAW_DECISION_STALE` ever renders; such codes route through `lib/messages/lookup.ts` (the stale notification in the changes feed is the only message-code surface here, §10). The control's own **static UI microcopy** — button labels ("Use the sheet's raw value instead", "Switch back to the parsed version"), the state headings, and the disabled-guard reasons (§4) — are plain component copy, NOT catalog-routed message codes and NOT subject to §12.4 lockstep (they carry no code). This is the same posture as every other static admin-UI label. Both surfaces get `/impeccable critique` + `/impeccable audit` on the diff (invariant 8); HIGH/CRITICAL fixed or `DEFERRED.md`.

**Guard conditions (props):** `warning` with a `code` outside the three in-scope codes → the control renders nothing (the caller already filters, but the component guards too). `decision` null/absent → `transform-active`. **Missing `warning.resolution`** (the parser omitted it — empty raw, or invalid-DMY dates, §6) → `disabled` with the reason; no toggle. This single check covers all three transforms' guards (§4) since the parser is the sole owner of whether a warning is resolvable.

---

## 9. Server action + telemetry (invariants 2, 9, 10)

Two thin `"use server"` admin actions, one per phase (§3), sharing a decision-core helper that **upserts/removes strictly by `(code, warning.resolution.contentHash)`** — the §5 match key. `target` is copied from the live warning onto the stored decision for display/change-log text ONLY; it is NEVER part of storage uniqueness, matching, removal, or toggle-state binding (a content-derived target can change with a sheet edit, so keying any write path on it would reopen the R4/R5 orphan-decision class). Both admin-gated (`requireAdminIdentity`) → **admin mutations** → each gets its own `AUDITABLE_MUTATIONS` row + executable success-branch behavioral proof (`tests/log/adminOutcomeBehavior.test.ts`), invariant 10. Both destructure `{data,error}` with typed infra-fault results + meta-test registration (invariant 9). Both emit `logAdminOutcome` POST-COMMIT (outside the lock tx) with forensic codes `USE_RAW_DECISION_SET`/`USE_RAW_DECISION_CLEARED` (§10); never log raw sheet content beyond the already-persisted warnings.

**Lock-key + identity are ALWAYS server-derived, never trusted from the client** (invariant 2 integrity). Each action first loads the authoritative row by its primary handle, then derives the advisory-lock key from that row (and reads the decision `(code, contentHash)` from the validated `warningRef`'s live `resolution`) — a client cannot steer the mutation onto another show's lock/row:

**(a) `setStagedUseRawDecisionAction(wizardSessionId, warningRef, useRaw)` — wizard/pre-create.** The action loads the `pending_syncs` row **by `wizard_session_id`** (server-side; confirms the caller's admin identity owns/may act on that wizard session), reads `drive_file_id` **from that row** (NOT from a client arg), and locks `show:<driveFileId>` with that server-derived value. Under the lock, upsert/remove the decision in that row's `pending_syncs.use_raw_decisions` (an invariant-2 table). It does **NOT** re-apply — there is no show yet; the wizard re-reads `pending_syncs.parse_result` (warnings carry `resolution`, so the preview reflects the decision immediately) and the decision materializes at finalize (§7). One lock acquisition, single holder. (`warningRef` is validated to match a warning present in that row's `parse_result` before write.)

**(b) `setUseRawDecisionAction(showId, warningRef, useRaw)` — per-show/post-publish.** The action loads the `shows` row **by `showId`** (admin-gated), reads `drive_file_id` from that row server-side, and locks `show:<driveFileId>`. Because the immediate apply must re-parse the current sheet and re-run the full pipeline, this action **delegates to the existing re-sync/apply entry** (the same path `ReSyncButton` triggers) after writing the decision, rather than reimplementing apply. Sequence: (1) under `lockedShowTx` (server-derived key), upsert/remove the decision in `shows_internal.use_raw_decisions` (commit); (2) invoke the existing re-sync entry, which acquires the lock **once** on its own and runs `applyParseResult` (overlay reads the now-updated persisted decisions, §7). These are **two sequential** lock acquisitions (write, then re-sync), NOT nested — the single-holder rule forbids nested/simultaneous double-holding of one hashkey, which this does not do. **No new hashkey and no new holder layer**; `tests/auth/advisoryLockRpcDeadlock.test.ts` topology unchanged. The plan MUST add executable coverage that: each action derives its lock key from the server-loaded row (not client args) and keys the decision by `(code, contentHash)` read from the validated `warningRef`'s live `resolution`, writes its decision under `lockedShowTx`; the per-show action's re-sync delegation does not nest the lock (sequential, not nested); and the finalize path (§7) applies + migrates staged decisions. (Invariant 2's "tests assert the lock is held" is satisfied per-path; the re-apply that mutates `crew_members`/rooms/hotels happens inside the re-sync entry's own lock, which is already covered.)

---

## 10. Messages / §12.4 codes (3-way+ lockstep)

New codes (each lands in §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in one commit — AGENTS.md §12.4 lockstep; catalog row shape per `catalog.ts:1281-1293`):

- `USE_RAW_DECISION_STALE` — **doug-facing** (`dougFacing` copy; `crewFacing: null`): surfaced whenever a decision **invalidates** — its pinned content is no longer present among the current warnings (the cell was edited, §5 INVALIDATED). Appears in the changes feed, naming the stored `target`. Plain language: "You'd chosen to use the sheet's raw text for <target>; that cell changed, so we're reading it fresh again." (One code covers every invalidation; there is no separate silent path.)
- `USE_RAW_DECISION_SET` / `USE_RAW_DECISION_CLEARED` — **admin-outcome forensic** codes (not §12.4 catalog rows; registered as admin-outcome-exempt per `_metaAdminOutcomeContract`, mirroring existing admin-outcome codes). Namespaced so they do NOT collide with any `REPORT_*`/existing family (M8 report-code namespace lesson).

Full new-code CI touchpoints (per the "new §12.4 code = 4 more gates" lesson): x1-catalog-parity, x2 gen:internal-code-enums, help `_families` if a new error family is introduced (only `USE_RAW_DECISION_STALE` is doug-facing → confirm whether it needs a help family or attaches to an existing one), and the full suite run.

---

## 11. Tier × domain × layer matrix

| Layer | Rooms | Hotels | Dates |
|---|---|---|---|
| Warning emit (existing) | `warnings.ts:139-155` / `rooms.ts:493` | `warnings.ts:174-197` / `hotels.ts:572` | `warnings.ts:234-246` / `dates.ts:535` |
| Parser change | populate `warning.resolution` from `rawSnippet` | populate `warning.resolution` from `rawSnippet` | populate `warning.resolution.replacement.dmyDates` from `DateToken[]`; omit if invalid-DMY (§6) |
| `resolution.replacement` | name=rawHeader, dims/floor=null | guests=rawCell (single entry) | dmyIso for all tokens |
| Overlay field rewrite | room row | hotel_reservation row | show dates |
| contentHash input | collapse(rawSnippet) | collapse(rawSnippet) | length-prefixed \x1f-joined block tokens |
| UI control | wizard (staged) + per-show (persisted) | wizard + per-show | wizard + per-show |
| Tests | resolution+overlay+guard+pin | resolution+overlay+guard+pin | parser dmy-alt + overlay + guard + pin |

Cross-cutting layers (not per-transform): `ParseWarning.resolution` type (§6); overlay `applyUseRawDecisions` (§7); the two server actions + staged→persisted finalize migration (§9); two UI surfaces (§8); `USE_RAW_DECISION_STALE` §12.4 lockstep + forensic codes (§10).

DB: **one migration** adding TWO jsonb columns (`pending_syncs.use_raw_decisions`, `shows_internal.use_raw_decisions`), both `default '[]'` → local apply + `gen:schema-manifest` (validation-schema-parity Layer-1 tripwire now sees two add-column vectors) + surgical validation apply. No CHECK/enum change (jsonb, no constraint). No trigger/cleanup change. Confirm PostgREST DML REVOKE on both tables (§3).

---

## 12. Testing

TDD per task. Meta-test inventory this milestone touches: `AUDITABLE_MUTATIONS` (TWO new admin action rows + behavioral proofs — staged + persisted), `_metaInfraContract` (new Supabase call sites in the action paths), `_metaAdminOutcomeContract` (register the two forensic codes as exempt), §12.4 catalog parity (new `USE_RAW_DECISION_STALE`), validation-schema-parity (two new columns).

**Advisory-lock topology (invariant 2).** No NEW hashkey and no NEW holder LAYER — both actions (§9) reuse the existing single `show:<driveFileId>` holder (`lockedShowTx`), so `tests/auth/advisoryLockRpcDeadlock.test.ts` topology is **unchanged** (no new pin). Executable coverage the plan MUST add: (a) `setStagedUseRawDecisionAction` writes `pending_syncs.use_raw_decisions` inside `lockedShowTx`; (b) `setUseRawDecisionAction` writes `shows_internal.use_raw_decisions` inside `lockedShowTx` and its re-sync delegation is **sequential, not nested** (the lock is released between the decision write and the re-sync's own acquisition — no double-hold of one hashkey); (c) the invariant-2-table mutations (`crew_members`/rooms/hotels) happen inside the re-sync entry's already-covered lock. This is behavioral coverage of new *routes into* the existing holder, distinct from a topology-pin change.

Key tests (anti-tautology — assert the persisted overlaid value against the raw source, not the render container):
- Overlay unit: each transform's application from a fixture warning's `resolution.replacement`; `(code,contentHash)` present among current warnings → applied (`kept`) at the warning's CURRENT target; absent → `invalidated`. Derive expected values from fixture raw, never hardcode.
- **Match-by-content-hash, NOT target (R5 crux):** a decision whose pinned cell is edited so the parsed **target changes** (e.g. room name shifts) is `invalidated` and SURFACED — assert it is NOT silently dropped. A decision whose cell is unchanged stays `kept` even if a *different* room's name changed. Two rooms with byte-identical raw share one `(code,contentHash)` decision (both `kept`).
- Content-pin lifecycle: unchanged cell → `kept`; any edit that removes the exact pinned content (now clean, differently-ambiguous, or target moved) → `invalidated` + `USE_RAW_DECISION_STALE` change-log + pruned column. Assert there is NO silent path.
- Parser: `warning.resolution` carries the correct `replacement` + stable `contentHash` for each recoverable code; absent for non-recoverable codes; OMITTED for invalid-DMY dates (guard). **Exactly one `DATE_ORDER_SUGGESTS_DMY` warning per DATES block** (assert cardinality on a multi-violation fixture — one control, one decision). Fuzz/mutation layer still sees a pure parser.
- **Staged → persisted finalize migration:** a staged `pending_syncs.use_raw_decisions` decision made against the staged parse applies at finalize and lands in `shows_internal.use_raw_decisions` (`kept`). A staged decision that a **re-ingestion regenerated the staged parse** underneath (new `resolution.contentHash`) is `invalidated` at finalize (not migrated, surfaced) — same comparison rule as re-sync (§7 case ii). And the trivial case: with no re-ingestion, the staged decision is `kept` (hash matches by construction). Assert against the persisted `shows_internal.use_raw_decisions` row + the change-log, not the wizard render.
- Server actions (both): behavioral proof each emits its admin-outcome code on the committed-success branch (sink-spy), writes under `lockedShowTx`, destructures `{data,error}`.
- Real-browser (Playwright, not jsdom): `<UseRawControl>` renders in BOTH the wizard judgment callout (staged, preview from `warning.resolution`) and the per-show page (persisted); toggling flips `transform-active`↔`raw-active`; disabled-guard renders when `warning.resolution` is absent. Transition-audit task covers all state pairs incl. the compound optimistic-`pending` case.

---

## 13. Watchpoints (disagreement-loop preempts — cite before relitigating)

- **This is NOT the removed #376 feature.** No typed value is stored; the corrected value is re-derived from the sheet's raw every sync; the persisted preference is content-pinned + auto-invalidating. Ratified in `BACKLOG.md` BL-STRUCTURAL-TRANSFORM-USE-RAW and §1.1. Do not argue it reintroduces a second source of truth.
- **`shows_internal` is the correct storage home** (`:1-6`, already holds `parse_warnings`); `pull_sheet_override` living on `pending_syncs`/`shows` is a *different* jsonb precedent, not a contradiction. Do not argue for a new table.
- **Parser stays pure** — admin decisions never enter `parseSheet`; the overlay is a post-parse layer. `warning.resolution` (§6) is computed by the parser purely from sheet data it already holds (`rawSnippet`, `DateToken`), NOT from admin state.
- **`ParseWarning.resolution` is an intentional, bounded field** (§6) — optional, populated ONLY for the three recoverable codes, carrying the precomputed replacement + content-pin. It exists because both surfaces read from PERSISTED warnings (wizard: `pending_syncs.parse_result`; per-show: `shows_internal.parse_warnings`) and neither re-parses — so the value must travel on the persisted warning. Do not argue it bloats the common warning shape (it is absent on every other warning) or that the overlay/UI should recompute it (single-owner = the parser).
- **Two storage homes + finalize migration is required by the lifecycle, not gratuitous** (§3) — the Step-3 wizard is PRE-CREATE (no `shows`/`shows_internal`/`showId`; parse in `pending_syncs.parse_result`, `applyStagedCore.ts:434` creates the show only at finalize), so staged decisions MUST live on `pending_syncs` and migrate to `shows_internal` at finalize. Do not argue for a single `shows_internal`-only home (it cannot exist during onboarding review).
- **The per-show action delegates re-apply to the existing re-sync entry** (§9b) — two SEQUENTIAL lock acquisitions (write, then re-sync), which is NOT the nested double-holding the single-holder rule forbids. Do not conflate sequential re-acquisition with a nested deadlock (M5 R20 was nested/simultaneous).
- **Finalize does NOT re-fetch/re-parse a different sheet** (§7) — it applies the staged parse the admin reviewed. The content-pin holds by ONE uniform rule (`decision.contentHash` vs the current warning's `resolution.contentHash`) applied at finalize and re-sync alike; the only way a staged decision goes stale before finalize is a re-ingestion that regenerates `pending_syncs.parse_result`. No separate finalize freshness gate exists or is needed.
- **Both actions derive the advisory-lock key + target from the server-loaded authoritative row** (§9), never from client args — the wizard action reads `drive_file_id` from the `pending_syncs` row found by `wizard_session_id`; the per-show action reads it from the `shows` row found by `showId`. A client cannot steer the mutation onto another show's lock. Do not treat the `driveFileId`/`showId` handle as a trusted lock key.
- **Rooms "use raw" intentionally clears dimensions/floor** — that is the honest "we don't trust the split" behavior (§4), not data loss. The raw is fully visible in the name.
- **Dates use the alternate DMY interpretation, not a raw string** — because dates must stay structured; this is still sheet-derived (§4), not fabricated.
- **Auto-invalidate is NEVER silent (R5 collapse)** — there is one `invalidated` category (§5 case 2), and EVERY invalidation writes a `USE_RAW_DECISION_STALE` change-log row. R5 deliberately removed the old stale-vs-moot split (where a now-unambiguous parse was silently dropped): matching on content-derived `target` let a target-changing edit orphan a decision silently, so the model now matches on `(code, contentHash)` and surfaces every drop. Do not reintroduce a silent "moot" path.
- **`HOTEL_CARDINALITY_EXCEEDED` and `CREW_COLUMN_POSITIONAL_FALLBACK` are out of scope** (§2) — the former drops data (unrecoverable by raw), the latter is column-mapping not cell-structuring.

---

## 14. Out of scope (restated)

`HOTEL_CARDINALITY_EXCEEDED`; `CREW_COLUMN_POSITIONAL_FALLBACK`; any admin-typed value; `pull_sheet_override`; the role→scope-capability feature (`BL-EXTEND-ROLE-SCOPE-VOCAB`, separate cycle). No behavior change to any surface other than adding the use-raw control + overlay.
