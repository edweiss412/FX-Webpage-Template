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

**Not a second source of truth.** This is the load-bearing distinction from the removed field-override feature (#376). No admin-typed value is ever stored. The corrected value is **always re-derived from the sheet's own raw content each sync**; the only thing persisted is a boolean *preference* ("prefer raw over the transform for this warning"), **content-pinned** to the canonical (whitespace-normalized) raw it was made against (§5 pinning contract). If the sheet cell's canonical content changes, the preference **auto-invalidates** and the transform re-runs — so the app can never diverge from the sheet. This makes the #376 stale-second-source failure structurally impossible.

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
  - **Actionable Step-3 warnings come ONLY from `pending_syncs.parse_result.warnings`** (a *successful* staged parse awaiting review). `pending_ingestions` (`20260501001000_internal_and_admin.sql:185-198`) is the *failed*-ingestion record — it carries `last_error_code`/`last_error_message` (a hard parse/ingest failure) and `last_warnings jsonb` (:194) from a parse that errored out; a show in that state has NO reviewable staged parse and renders the ingestion error, not recoverable-transform controls. The three in-scope codes are non-blocking `info`/`warn` severities that only appear on a *completed* parse, so they never surface from `pending_ingestions`. Staged decisions therefore live only on `pending_syncs`; the staged action (§9a) loads only that table.
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
  preference: "raw" | "transform"; // the admin's CURRENT choice for this content. "raw" = use the raw
                       // value; "transform" = a durable PENDING REVERT (a formerly-applied raw decision
                       // the admin turned off, kept only until the next apply restores the transform to
                       // the entity rows — see below). NOT part of the match key.
  applied: boolean;    // DURABLE apply-status (§8 state derivation): whether the entity rows currently
                       // reflect `preference`. false = the toggle wrote this, the overlay has not run yet;
                       // true = a successful apply has made rooms/hotels/dates match `preference`. NOT
                       // part of the (code, contentHash) match key.
  decidedAt: string;   // ISO timestamp
  decidedBy: string;   // admin identity (canonicalized email or admin id)
};
```

No stored corrected value. `(code, contentHash)` is the only thing binding the decision to sheet content; `target` is a human-readable label carried alongside; `preference` + `applied` together give a **symmetric, reload-safe state machine** for both directions of the toggle (§8):

| Persisted row | Meaning | UI state |
|---|---|---|
| _absent_ | default — transform applies; entity rows are transform | `transform-active` |
| `preference:"raw", applied:false` | admin chose raw, overlay not run yet | `apply-pending` |
| `preference:"raw", applied:true` | raw chosen AND overlaid onto entity rows | `raw-active` |
| `preference:"transform", applied:false` | admin turned OFF a previously-applied raw; entity rows are STILL raw until the next apply restores the transform | `clear-pending` |

`preference:"transform", applied:true` is never persisted — once an apply restores the transform value the row is garbage-collected (absent == transform default, §7).

**The single toggle-write rule (`applied` is state-aware, not direction-aware).** `applied` MEANS "the entity rows already reflect this `preference`." So a toggle computes the new row from what the entity rows currently hold, which is fully determined by the CURRENT persisted row (no need to read the entity rows themselves):

| Current persisted row | Entity rows hold | Toggle → `raw` writes | Toggle → `transform` writes |
|---|---|---|---|
| absent (`transform-active`) | transform | `{raw, applied:false}` (apply-pending) | — (no-op; already transform) |
| `{raw, false}` (`apply-pending`) | transform | — (no-op) | delete the row (entity already transform → GC) |
| `{raw, true}` (`raw-active`) | raw | — (no-op) | `{transform, applied:false}` (clear-pending) |
| `{transform, false}` (`clear-pending`) | raw | `{raw, applied:true}` (→ `raw-active` immediately; entity rows already raw, no re-sync needed) | — (no-op) |

The rule in one line: **new `applied` = (the entity rows, per the current row, already match the new `preference`); and any `{transform, applied:true}` result is written as row-deletion (GC).** This closes the `clear-pending → raw` hole (entity rows are already raw, so it goes straight to `raw-active`, never a lying `apply-pending`) and keeps every transition reload-safe. The toggle action derives the current row server-side (§9); it never trusts a client-supplied prior state.

**Guard conditions:** an empty array (default) means "no decisions — every transform applies normally." A malformed or non-array `use_raw_decisions` (should be impossible given the write path, but defensively) is treated as empty (`[]`) and logged, never throwing. A decision whose `code` is not one of the three in-scope codes is ignored (forward/backward-compat guard).

**PostgREST DML posture (distinguish client DML from privileged server writers).** The two legitimate writers of `use_raw_decisions` are BOTH server-side privileged paths, running under the service role inside the per-show advisory-lock tx: (1) the two admin server actions (§9, the toggle write), and (2) `applyParseResult`'s finalize/re-sync prune-and-write-back of the `kept` set (§5/§7/§11). Neither is a PostgREST client mutation. What the lockdown forbids is **direct client DML** — a `from('shows_internal'|'pending_syncs').insert/update/delete` bypassing the server paths. The plan's pre-draft pass MUST confirm `authenticated`/`anon` `INSERT`/`UPDATE`/`DELETE` are REVOKEd on BOTH `shows_internal` AND `pending_syncs` (RPC-gated-table lockdown, AGENTS.md cross-cutting discipline); if either is missing, add the REVOKE. The REVOKEs block client DML and do NOT constrain the privileged sync/apply writer — implementers MUST NOT drop the §7 prune/write-back to satisfy the lockdown. No new tables, so no new grant surface beyond confirming/extending the existing lockdown.

---

## 4. Per-transform "use raw" semantics (product-visible)

Each transform declines its structuring and substitutes a value **derived from the sheet's raw content**:

| Transform | Warning | Field(s) rewritten | "Use raw" value (derived, never typed) |
|---|---|---|---|
| Room header split | `ROOM_HEADER_SPLIT_AMBIGUOUS` | room `name`, `dimensions`, `floor` | `name` = the raw header as captured on the warning (`warning.rawSnippet` = `params.rawHeader`, `warnings.ts:154` — already whitespace-collapsed, NOT byte-exact); `dimensions` = `null`; `floor` = `null`. Honest: crew sees the sheet cell's text (whitespace-normalized) as the room's identity; no untrusted split. |
| Hotel guest glue | `HOTEL_GUEST_SPLIT_AMBIGUOUS` | hotel reservation `guests` | the raw cell as captured on the warning (`warning.rawSnippet` = `params.rawCell`, `warnings.ts`) rendered as a **single** guest entry; no per-guest split, no confirmation-number extraction. ("Raw as captured," not a typed value — whitespace normalization per the parser's capture.) |
| Inverted dates | `DATE_ORDER_SUGGESTS_DMY` | the show's parsed dates (whole DATES block) | the **DMY reinterpretation**: each `DateToken` already carries `{raw, mdyIso, dmyIso}` (`dates.ts:391`); "use raw" applies `dmyIso` for every token in the block instead of `mdyIso`. Deterministic reinterpretation of the raw tokens, not a typed value. |

**Rooms/hotels are "use the raw text as captured" (the `rawSnippet` the parser already holds — whitespace-normalized, not a byte-exact reconstruction, and never a typed value); dates are "use the alternate deterministic interpretation of the raw."** Both are sheet-derived. The overlay (§7) and both UIs consume these values from `warning.resolution.replacement` (§6), which the parser precomputes and persists on the warning — no downstream recomputation. The date case is the reason the parser must populate `resolution` (the raw warning carries only a single token `violationRaw`, `dates.ts:535`, not the block-wide alternate).

**Guard conditions (partial/empty raw):**
- Room: if `rawSnippet` is empty/whitespace after cleaning, the control is **disabled** with copy "no raw text to fall back to" — never store a decision that would blank the room name. (Should not occur — the split only fires on non-empty headers — but guarded.)
- Hotel: same empty-`rawSnippet` guard.
- Date: if the DMY reinterpretation yields an invalid date for any token (e.g. day > 12 both ways is unambiguous and never warns; but a token that is invalid as DMY), the control is disabled with "these dates can't be read the other way" — never persist a decision that produces an invalid date.

---

## 5. Decision identity, content-pin, and auto-invalidate lifecycle

**Pinning contract = CANONICAL-content, NOT byte-exact (chosen deliberately).** The pin is the hash of the *whitespace-canonicalized* raw, not the byte-exact cell. A whitespace-only edit (extra space, trailing tab) that does NOT change how the parser structures the cell leaves the ambiguity — and therefore the decision — intact; the decision is `kept`. An edit that changes the canonical content (any non-whitespace change) produces a different hash and invalidates (§5 INVALIDATED, always surfaced). This is the intended semantics: the decision is pinned to the *parse-relevant content*, so cosmetic whitespace churn does not spuriously drop a valid choice, and every content-meaningful edit is caught. All "content-pinned" / "the sheet cell changes" language in §1/§1.1 means this canonical-content contract.

**`contentHash` is precomputed by the parser** into `warning.resolution.contentHash` (§6) — the admin write path (§9) does NOT recompute it; it copies `warning.resolution.contentHash` into the stored decision. This guarantees the pin the decision was made against is identical to what the overlay later compares, with a single serialization owner (the parser). The serialization the parser uses, per transform:
- Room / Hotel: `sha256hex(collapse(rawSnippet))` where `collapse(s) = s.replace(/\s+/g, " ").trim()` (a single collapsed string — matches the already-collapsed `rawHeader`, `warnings.ts:145`).
- Date: a **length-prefixed, order-preserving** join (a plain concatenation is ambiguous: `["1","23"]` vs `["12","3"]`). For each token in `collectDateTokens` document/encounter order (`dates.ts:485`, pre-sort), emit `collapse(token.raw).length + ":" + collapse(token.raw)`, joined by `"\x1f"` (ASCII unit separator, cannot occur in a sheet cell); empty/omitted tokens serialize as `0:`. `sha256hex(thatString)`. Block-wide so any edit to any date in the block re-decides.

**Decision identity = `(code, contentHash)` — the MATCH KEY is the content-pin, NOT the content-derived target.** This is the crux of the model (comprehensive re-analysis, spec R5). The `target` (room `name`, hotel `name`+`field`, date `field:"order"`) is derived FROM the sheet content, so a content edit can change it — matching on `target` would let a target-changing edit silently orphan a decision. Instead:
- **Storage/uniqueness key = `(code, contentHash)`.** The write path (§9) upserts by `(code, contentHash)` — at most one decision per pinned content. `target` is stored for display/change-log only (never a match key).
- **Match on apply = `(code, contentHash)`.** A decision applies to EVERY current recoverable warning whose `(code, warning.resolution.contentHash)` equals the decision's — normally exactly one; two entities with the same *canonical* raw (e.g. two rooms with the same header up to whitespace) legitimately share the decision (same canonical content → same choice).

**A decision is CONTENT-scoped, not entity-scoped — this is intentional (R7).** It means "for any cell whose canonical content is THIS, use raw." Consequences, all deliberate:
- If several cells share the content, one decision covers all of them (one toggle, applied everywhere — the intended UX for duplicate headers).
- If ONE of several content-identical cells is edited so its content changes, that cell's warning now carries a *different* hash: the decision **no longer applies to that cell** (correct — it is no longer THIS content) but is still `kept` for the others. That cell does not produce a `USE_RAW_DECISION_STALE` row, and this is NOT a silent regression: the admin edited that cell, and its new state re-surfaces on its own — either it now parses cleanly (the ambiguity is gone) or it emits a fresh recoverable warning with the new hash (a new actionable control appears in the same list). The admin sees the change through the warning list, which is the natural surface for "this specific cell changed."

**Two overlay outcomes per decision (no stale/moot distinction — collapsed in R5):**
1. **KEPT** — the decision's `(code, contentHash)` IS present among ≥1 current warning → apply `warning.resolution.replacement` to each matching warning's CURRENT target field(s) (field location from the live warning, not the stored decision).
2. **INVALIDATED** — the decision's `(code, contentHash)` matches NO current warning (every cell that had this content was edited away or now parses cleanly) → drop the decision and **always surface** it via `USE_RAW_DECISION_STALE`.

**Surfacing guarantee (precise).** A *decision* that stops applying to ANY cell is always surfaced via the `USE_RAW_DECISION_STALE` change-log row (never silently dropped). A *single cell* that diverges from a decision still shared by other cells is surfaced via that cell's own re-emitted warning (or its now-clean parse), not via a STALE row — because the decision itself is still valid and applied. Both cases inform the admin; neither is silent. (There is exactly one row-count subtlety to test: partial divergence writes NO STALE row, which §12 asserts is correct, not a miss.)

**Write-back + surfacing (the caller, not the pure overlay).** The pure overlay (§7) only classifies (returns `kept` / `invalidated` / `reverted`); it performs no I/O. Its **caller** — `applyParseResult`, inside the per-show advisory-lock tx — within that SAME transaction: (a) persists the new `use_raw_decisions` = the `kept` set each marked `applied:true` (dead `invalidated`/`reverted` entries removed, no accumulation); (b) for each `invalidated` decision, writes a `show_change_log` row carrying the doug-facing `USE_RAW_DECISION_STALE` code (§10) naming the stored `target` — the **never-silent** surfacing. (`reverted` rows are dropped WITHOUT a change-log row — the admin initiated the revert, so there is nothing to notify; only content-invalidations surface.) This changes-feed write rides on `applyParseResult`'s existing sync-path instrumentation (part of the already-covered apply path — no new `AUDITABLE_MUTATIONS` row; §9 covers the admin-toggle actions, the only new admin-mutation surfaces).

**UI ↔ decision matching also uses `(code, contentHash)`** — a rendered warning shows the `raw-active` state iff a stored decision matches its `(code, warning.resolution.contentHash)`; so exactly one control per warning, and the control can never bind to a mismatched-content decision.

**Flag lifecycle table** (`use_raw_decisions`):

| Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|
| `pending_syncs.use_raw_decisions jsonb` (staged) | `setStagedUseRawDecisionAction` (wizard toggle, under per-show lock) | `applyParseResult` at **finalize** (via `applyStagedCore`); the wizard UI (render current state, preview from `warning.resolution`) | at finalize, live staged decisions apply to the overlaid parse result; the `kept` set migrates to `shows_internal.use_raw_decisions` |
| `shows_internal.use_raw_decisions jsonb` (persisted) | (a) `setUseRawDecisionAction` (per-show toggle, under lock); (b) finalize migration from the staged column; (c) overlay prune during apply (write back `kept` as `applied:true`; drop `invalidated` + `reverted`, §7) | `applyParseResult` at **re-sync**; the per-show UI (render current state) | when a live decision matches a firing warning, the target field is set to `warning.resolution.replacement` in the parse result persisted by `applyParseResult` |

---

## 6. Parser changes — the `resolution` payload (single source for overlay + both UIs)

The overlay and BOTH admin surfaces need, per recoverable warning: (a) the transform's structured value (the "parsed" side of the compare), (b) the raw-derived replacement value, and (c) the content-pin. All three MUST travel with the persisted warning, because the surfaces read from **persisted** state, not a live parse: the wizard reads `pending_syncs.parse_result.warnings` (`OnboardingWizard.tsx:426-431,538-546`) and the per-show page reads `shows_internal.parse_warnings` (`app/admin/show/[slug]/page.tsx:335-338`) — both are the persisted `ParseWarning[]` (full objects incl. `rawSnippet`, persisted by `applyParseResult.ts:214`). Neither re-parses. **Critically, `parsed` must live on the warning because the overlay (§7) overwrites the entity rows (rooms/hotels/dates) with the raw value once a decision is active — so after a successful raw apply the transform value is GONE from the persisted `rooms`/`hotel_reservations`/dates rows. The warning is the only durable carrier of the parsed value; the UI reads `current` from `warning.resolution.parsed`, never from the (possibly-overlaid) entity rows.** So the parser attaches everything to the warning itself:

Extend `ParseWarning` (`lib/parser/types.ts:7-28`) with ONE optional field. **For the three recoverable codes the parser ALWAYS sets it** (to a `resolvable:true` payload OR a `resolvable:false` guard variant); it is absent on all other codes. This "always-present-for-the-3-codes" rule is load-bearing: it lets the UI (§8) distinguish a fresh guard-disabled warning (`resolvable:false`) from a **legacy** warning persisted before this feature (`resolution` entirely absent on an in-scope code) — the two must render differently.

```ts
resolution?:
  | {
      resolvable: true;
      contentHash: string; // §5 canonical pin, precomputed by the parser
      // `parsed` = the transform's own structured output (the "parsed" side of the UI compare);
      // `replacement` = the raw-derived value the decision substitutes. Both are captured at parse
      // time and persist on the warning, so the UI shows parsed-vs-raw regardless of which is active
      // in the entity rows.
      parsed:
        | { kind: "rooms"; name: string; dimensions: string | null; floor: string | null }
        | { kind: "hotels"; names: string[]; confirmationNo: string | null } // the transform's split
        | { kind: "dates"; dates: DateOrderFields };                          // M/D/Y (mdyIso-derived)
      replacement:
        | { kind: "rooms"; name: string; dimensions: null; floor: null }      // name = raw header (rawSnippet)
        | { kind: "hotels"; names: [string]; confirmationNo: null }           // single raw entry, no conf
        | { kind: "dates"; dmyDates: DateOrderFields };                       // DMY (dmyIso-derived)
    }
  | { resolvable: false; reason: "empty-raw" | "invalid-dmy" }; // §4 guard → control disabled with reason

// The exact date-order-sensitive subset of ShowRow["dates"] (`lib/parser/types.ts:124-135`) that the
// DMY inversion can change. Clock/free-text fields (loadIn, setupTime, setAgendaRaw) are NOT date-order
// sensitive and are NEVER touched by the overlay.
type DateOrderFields = {
  travelIn: string | null; // ISO 'YYYY-MM-DD' or null
  set: string | null;
  showDays: string[]; // ISO dates, ORDER PRESERVED (index-aligned to the parsed block); may be empty
  travelOut: string | null;
};
```

- **Rooms:** `replacement` = `{name: rawSnippet, dimensions: null, floor: null}` (the already-collapsed `rawHeader`); `parsed` = the transform's split `{name, dimensions, floor}`. The overlay (§7) rewrites the room row's `name`/`dimensions`/`floor`. `contentHash = sha256hex(collapse(rawSnippet))` (§5 — the PIN is on the canonical/collapsed form for stability; the displayed `replacement` is the captured `rawSnippet` as-is, not a byte-exact reconstruction of the original cell). See §4 for the precise product meaning ("the sheet's raw text as captured," whitespace-normalized — NOT a typed value).
- **Hotels:** the guest split populates `HotelReservationRow.names: string[]` + `confirmation_no: string | null` (`lib/parser/types.ts:154-163` — there is NO `guests` scalar; the split lives in `names[]`/`confirmation_no`). So `replacement` = `{names: [rawSnippet], confirmationNo: null}` — the raw cell as a **single** `names[]` entry, confirmation number cleared (no extraction); `parsed` = the transform's `{names, confirmationNo}`. The overlay (§7) rewrites the reservation's `names` and `confirmation_no` for the matched `HOTEL_GUEST_SPLIT_AMBIGUOUS` warning (the reservation identified by `warning.blockRef.index`), touching no other reservation field (`hotel_name`/`address`/`check_in`/`check_out`/`notes` unchanged). `contentHash = sha256hex(collapse(rawSnippet))`.
- **Dates:** both `parsed.dates` (the M/D/Y interpretation, `mdyIso`) and `replacement.dmyDates` (the DMY reinterpretation, `dmyIso`) are the `DateOrderFields` subset above, computed from the block's `DateToken[]` (`dates.ts:391,485`) — each `travelIn`/`set`/`travelOut` maps its token's `mdyIso`/`dmyIso`, and `showDays` maps in parse order (index-aligned; a null-ISO token yields `null` in the scalar fields, and if any token is invalid-as-DMY the whole `resolution` becomes the `{resolvable:false, reason:"invalid-dmy"}` guard variant per the guard below — NOT absent). The overlay (§7) rewrites EXACTLY `result.dates.travelIn`, `result.dates.set`, `result.dates.showDays`, `result.dates.travelOut` — nothing else on `result.dates`. `contentHash` = the §5 length-prefixed token serialization. **Exactly one `DATE_ORDER_SUGGESTS_DMY` warning per DATES block** — the parser change MUST coalesce to a single block-scoped warning carrying the block resolution (the plan verifies the current emit cardinality at `dates.ts:535`/`checkDateOrder`; if it can currently emit more than one per block — e.g. per out-of-order token — the change collapses them to one so there is one control and one `(code, contentHash)` decision per block, never duplicated `kept`/`invalidated` handling or duplicate change-log rows). **Guard:** if any token has a null `dmyIso` (invalid as DMY), the parser sets `resolution = {resolvable:false, reason:"invalid-dmy"}` (NOT absent — absence is reserved for legacy warnings, §8) → the UI renders the disabled-guard state (§8) and no decision can be stored (§4). Rooms/hotels use `{resolvable:false, reason:"empty-raw"}` when `rawSnippet` is empty after cleaning.

**Parser purity preserved** — `resolution` is computed purely from sheet data the parser already holds (`rawSnippet`, `DateToken`), with NO admin state entering `parseSheet`; the fuzz/mutation layer still sees a pure parser (it just emits a richer warning). The overlay (§7) and both surfaces read `warning.resolution`; nothing recomputes it downstream.

---

## 7. Apply-path overlay

A pure module `lib/sync/useRawOverlay.ts`:

```ts
applyUseRawDecisions(
  parseResult: ParseResult,
  decisions: UseRawDecision[],
): {
  result: ParseResult;
  kept: UseRawDecision[]; // preference:"raw", matched → applied (write back with applied:true)
  invalidated: UseRawDecision[]; // preference:"raw", no match → drop + STALE change-log (§5)
  reverted: UseRawDecision[]; // preference:"transform" → transform restored → drop (garbage-collect)
};
```

- Pure: input parse result (warnings carry `resolution`, §6) + decisions → new parse result + the partition the caller persists/surfaces: `kept` (a `preference:"raw"` decision that still matches a current warning — its `replacement` was applied, mark `applied:true`), `invalidated` (a `preference:"raw"` decision matching NO current warning — dropped + STALE, §5), and `reverted` (a `preference:"transform"` pending-revert whose matching warning is present — the overlay applies NOTHING (leaves the transform value the parse already produced), which completes the revert, so the caller DROPS the row = garbage-collect; a `preference:"transform"` matching no warning is likewise dropped, silently, since the admin already reverted and there is nothing to surface). Matches each decision to current warnings by `(code, contentHash)` (§5, NOT by content-derived target). No I/O, no clock (timestamps passed in), deterministic — no re-parse, no recomputation of `resolution`.
- Runs in `applyParseResult` (`lib/sync/applyParseResult.ts:94-97`) BEFORE the full-replace writes (crew `:135-136`, rooms `:141`, hotels `replaceHotelReservations`, `parse_warnings` `:207-214`), on **both** apply paths: onboarding **finalize** (`applyStagedCore` → `applyParseResult`, decisions read from the STAGED `pending_syncs.use_raw_decisions`) and post-publish **re-sync** (decisions read from the PERSISTED `shows_internal.use_raw_decisions`). The overlaid `parseResult` is what gets persisted, so the stored `crew_members`/rooms/`hotel_reservations`/dates rows are canonical — every downstream reader (crew page, report, exports) sees the corrected value with no per-consumer overlay. `applyParseResult` gains one parameter: the decisions array (the caller supplies the phase-appropriate column).
- `applyParseResult` already runs inside the per-show advisory-lock tx (`lib/sync/lockedShowTx.ts:57-62`, single holder — takes `tx`, does not self-lock). The overlay itself is pure (no I/O); `applyParseResult` — as the caller, in that same tx — persists the new `use_raw_decisions` = the `kept` set **each marked `applied: true`** (they were just overlaid onto the entity rows in this same apply — this is what flips an `apply-pending` decision to durable `raw-active`, §8); the `invalidated` and `reverted` rows are DROPPED (not carried forward) — `reverted` because the transform value is now restored (garbage-collected, §3), `invalidated` because the pinned content is gone. For each `invalidated` decision it also writes a `USE_RAW_DECISION_STALE` change-log row (§5 write-back — always surfaced, no silent path); `reverted` drops are NOT surfaced (the admin chose the revert). This is the persisted home even when the source was the staged column — the §3 staged→persisted migration at finalize. Single-holder preserved, no new lock layer.

**Content-pin holds at finalize because the overlay always compares against the CURRENT warning's hash, never blindly applies.** The overlay runs against whatever `parse_result` is being applied — at finalize that is the **current staged `pending_syncs.parse_result`**, and its warnings carry `resolution.contentHash` from the parse that produced it. Two cases: (i) **no re-ingestion since the decision** — the staged decision was made against exactly this staged parse, so `decision.contentHash == warning.resolution.contentHash` → `kept` (trivially, by construction; the admin approves precisely what they reviewed — finalize does NOT re-fetch/re-parse a different sheet). (ii) **a re-ingestion regenerated the staged parse** (the admin re-synced during onboarding, replacing `pending_syncs.parse_result` with a fresh parse carrying new `resolution.contentHash`) — now the old staged decision's hash may mismatch the new staged warning → `invalidated`, handled identically to the re-sync case (dropped, surfaced). So there is exactly one comparison rule (`decision.contentHash` vs the current warning's `resolution.contentHash`) applied uniformly at finalize and at re-sync; no separate finalize freshness gate is needed, and an invalidated staged decision can never be silently applied.

---

## 8. UI (Opus + impeccable v3 dual-gate)

One shared **presentational** client component `<UseRawControl warning current decision state onToggle />`:
- `warning.resolution.replacement` (§6) supplies the **raw preview** (persisted on the warning in both phases, so neither surface re-parses).
- `current` supplies the **transform-produced (parsed) value** for the same target field(s) — room name/dims/floor, hotel guests, or the show dates. The control renders both (parsed vs raw) so the admin compares before toggling. **`current` is sourced from `warning.resolution.parsed` (§6), NOT from the entity rows.** This is deliberate: once a decision is `raw-active`, the overlay (§7) has overwritten the persisted `rooms`/`hotel_reservations`/dates rows with the raw value, so those rows no longer hold the transform value — only `warning.resolution.parsed` does, and it persists on the warning in both phases. Reading `current` from the warning (never the possibly-overlaid rows) makes the parsed-vs-raw compare correct in every state, on both surfaces, with no re-parse and no new fetch.

The two surfaces differ only in which server action `onToggle` binds to and which handle it carries:

- **Wizard judgment callout** — `components/admin/wizard/step3ReviewSections.tsx:494-547`. Today each entry renders `reviewWarningTitle(warning)` + `fieldLabelFor(warning.blockRef?.field)` + a `View details` jump button (`:513,517,525-531`); there is **no** per-entry action slot yet. Add the control inline per entry (only for the three in-scope codes). `onToggle` → `setStagedUseRawDecisionAction(wizardSessionId, warningRef, useRaw)` — the server derives `driveFileId`/lock key from the `pending_syncs` row (§9a, NO showId in this phase); the wizard re-reads the staged row after toggling.
- **Per-show admin page** — `components/admin/PerShowActionableWarnings.tsx`, via its existing `renderItemControls?: (w: ParseWarning, i: number) => ReactNode` prop (`:31`, rendered `:103`). Pass `<UseRawControl>` through that slot. `onToggle` → `setUseRawDecisionAction(showId, warningRef, useRaw)`; warnings come from `shows_internal.parse_warnings`.

**States** (a small state machine, enumerate every transition in the plan's transition-audit task):
- `transform-active` (default) — shows the transform's structured result + a "Use the sheet's raw value instead" affordance with an inline **preview** of what raw would render.
- `raw-active` — shows the raw-derived value + "Using the sheet's raw value" + a "Switch back to the parsed version" affordance.
- `disabled` — when `warning.resolution` is present but `resolvable:false` (§4/§6 guard: `reason:"empty-raw"` or `"invalid-dmy"`); shows the reason, no toggle.
- `legacy-unavailable` — when `warning.resolution` is **absent** on an in-scope code (a warning persisted before this feature; the parser now always sets `resolution` for the three codes, so absence means legacy). Shows a passive "Re-sync this show to enable the use-raw option" note, no toggle; the next re-sync re-parses and attaches `resolution`, upgrading the control. NOT the same copy as `disabled` (which means the raw is genuinely unusable) — this is "not yet available," a transient migration state.
- `pending` — optimistic in-flight during the server action; the toggle disables to avoid double-submit (see the react-form-action self-disable gotcha).
- `apply-pending` (per-show surface only) — a `preference:"raw"` decision exists but has NOT been overlaid onto the entity rows yet (§9b failure semantics: committed in step (1), but step (2)/a later re-sync has not yet succeeded). Shows the raw preview as the chosen value plus a non-error notice "Saved. The crew-visible values will update on the next successful sync." The wizard surface has no `apply-pending` state (its decision materializes at finalize, not via an immediate re-sync).
- `clear-pending` (per-show surface only) — a `preference:"transform", applied:false` pending-revert exists (the admin turned OFF a previously-applied raw decision, but the re-apply that would restore the transform has not succeeded yet). Shows the transform value as the chosen target plus "Reverting. The crew-visible values still show the raw text until the next successful sync." This is the toggle-OFF twin of `apply-pending`; it exists so a reload after a failed toggle-off re-sync does NOT silently show `transform-active` while the entity rows are still raw.

**Durable, reload-safe state derivation (per-show).** The render state is NOT an ephemeral action result — it is derived on every load from persisted data (`preference` + `applied`, §3), so a reload after any "saved, re-sync failed" still shows the correct pending state:
  - no decision matches the warning's `(code, contentHash)` → `transform-active` (or `disabled` if §4 guard).
  - matching decision `preference:"raw", applied:true` → `raw-active` (overlay ran; entity rows carry raw).
  - matching decision `preference:"raw", applied:false` → `apply-pending` (saved, overlay not yet run — entity rows still transform).
  - matching decision `preference:"transform", applied:false` → `clear-pending` (revert saved, overlay not yet run — entity rows still raw).
  (`preference:"transform", applied:true` never persists — it is garbage-collected once the transform is restored, §3/§7.) This avoids comparing entity rows against `resolution.*` and is correct after any reload in BOTH toggle directions. The transition-audit task MUST enumerate: `transform-active → apply-pending → raw-active` (toggle on, then successful sync), `raw-active → clear-pending → transform-active` (toggle off, then successful sync), `apply-pending → transform-active` (toggle-off before any apply = hard-delete), `clear-pending → raw-active` (toggle back on before the revert applies), and each pending state SURVIVING a reload after a failed re-sync — in addition to the base pairs and the optimistic-`pending` compound.

Toggling calls the server action (§9), then the surface re-reads. **Copy scope (invariant 5 boundary):** invariant 5 governs *error/warning CODES* — no raw code string like `USE_RAW_DECISION_STALE` ever renders; such codes route through `lib/messages/lookup.ts` (the stale notification in the changes feed is the only message-code surface here, §10). The control's own **static UI microcopy** — button labels ("Use the sheet's raw value instead", "Switch back to the parsed version"), the state headings, and the disabled-guard reasons (§4) — are plain component copy, NOT catalog-routed message codes and NOT subject to §12.4 lockstep (they carry no code). This is the same posture as every other static admin-UI label. Both surfaces get `/impeccable critique` + `/impeccable audit` on the diff (invariant 8); HIGH/CRITICAL fixed or `DEFERRED.md`.

**Guard conditions (props) — evaluated in this precedence, BEFORE decision-matching:** (1) `warning.code` outside the three in-scope codes → render nothing (the caller filters, the component guards too). (2) `warning.resolution` **absent** (on an in-scope code) → `legacy-unavailable` ("re-sync to enable", §8) — a pre-feature warning. (3) `warning.resolution.resolvable === false` → `disabled` with `reason` (`empty-raw`/`invalid-dmy`, §4/§6). (4) otherwise `resolvable:true` → proceed to the `preference`+`applied` state derivation above (`transform-active`/`apply-pending`/`raw-active`/`clear-pending`). The parser is the sole owner of whether a warning is resolvable; the UI never re-derives resolvability.

---

## 9. Server action + telemetry (invariants 2, 9, 10)

Two thin `"use server"` admin actions, one per phase (§3), sharing a decision-core helper that **writes strictly by `(code, warning.resolution.contentHash)`** — the §5 match key. `target` is copied from the live warning onto the stored decision for display/change-log text ONLY; it is NEVER part of storage uniqueness, matching, removal, or toggle-state binding (a content-derived target can change with a sheet edit, so keying any write path on it would reopen the R4/R5 orphan-decision class). The helper's write follows the **single state-aware toggle rule** (§3 state table): it derives the CURRENT persisted row for `(code, contentHash)` server-side, computes what the entity rows currently hold from it, and writes the new row with `applied = (entity rows already match the new preference)`; a `{transform, applied:true}` result is written as a row-deletion (GC). Concretely: from `transform-active` → `{raw, applied:false}`; from `clear-pending` → `{raw, applied:true}` (entity rows already raw, straight to `raw-active`); from `raw-active` toggling off → `{transform, applied:false}`; from `apply-pending` toggling off → delete. The overlay (§7) later garbage-collects any remaining `preference:"transform"` revert and flips a matched `preference:"raw"` to `applied:true`. Both admin-gated (`requireAdminIdentity`) → **admin mutations** → each gets its own `AUDITABLE_MUTATIONS` row + executable success-branch behavioral proof (`tests/log/adminOutcomeBehavior.test.ts`), invariant 10. Both destructure `{data,error}` with typed infra-fault results + meta-test registration (invariant 9). Both emit `logAdminOutcome` POST-COMMIT (outside the lock tx) with forensic codes `USE_RAW_DECISION_SET`/`USE_RAW_DECISION_CLEARED` (§10); never log raw sheet content beyond the already-persisted warnings.

**Lock-key + identity are ALWAYS server-derived, never trusted from the client** (invariant 2 integrity). Each action first loads the authoritative row by its primary handle, then derives the advisory-lock key from that row (and reads the decision `(code, contentHash)` from the validated `warningRef`'s live `resolution`) — a client cannot steer the mutation onto another show's lock/row:

**(a) `setStagedUseRawDecisionAction(wizardSessionId, warningRef, useRaw)` — wizard/pre-create.** The action loads the `pending_syncs` row **by `wizard_session_id`** (server-side; confirms the caller's admin identity owns/may act on that wizard session), reads `drive_file_id` **from that row** (NOT from a client arg), and locks `show:<driveFileId>` with that server-derived value. Under the lock, toggle-ON upserts `{preference:"raw", applied:false}` and toggle-OFF hard-deletes the row in that row's `pending_syncs.use_raw_decisions` (an invariant-2 table). Pre-create there is no `clear-pending`: staged decisions are never overlaid onto entity rows before finalize (no rows exist), so toggle-off is always a clean delete and no pending-revert can arise. It does **NOT** re-apply — there is no show yet; the wizard re-reads `pending_syncs.parse_result` (warnings carry `resolution`, so the preview reflects the decision immediately) and the decision materializes at finalize (§7). One lock acquisition, single holder. (`warningRef` is validated to match a warning present in that row's `parse_result` before write.)

**(b) `setUseRawDecisionAction(showId, warningRef, useRaw)` — per-show/post-publish.** The action loads the `shows` row **by `showId`** (admin-gated), reads `drive_file_id` from that row server-side, and locks `show:<driveFileId>`. Because the immediate apply must re-parse the current sheet and re-run the full pipeline, this action **delegates to the existing re-sync/apply entry** (the same path `ReSyncButton` triggers) after writing the decision, rather than reimplementing apply. Sequence: (1) under `lockedShowTx` (server-derived key), write the decision in `shows_internal.use_raw_decisions` per the single state-aware toggle rule (§3/§9 table — the new `applied` reflects whether the entity rows already match the new preference, computed from the server-loaded current row; `{transform, applied:true}` → row-deletion), then commit; (2) invoke the existing re-sync entry, which acquires the lock **once** on its own and runs `applyParseResult` (overlay reads the now-updated persisted decisions, applies raw for `preference:"raw"` and rewrites those `kept` with `applied: true`, restores the transform for `preference:"transform"` and drops that row, §7 — flipping the decision to its durable applied state). These are **two sequential** lock acquisitions (write, then re-sync), NOT nested — the single-holder rule forbids nested/simultaneous double-holding of one hashkey, which this does not do. **No new hashkey and no new holder layer**; `tests/auth/advisoryLockRpcDeadlock.test.ts` topology unchanged.

**Failure semantics of the decision-write → re-sync sequence (the two are NOT atomic across the boundary).** Step (1) commits the decision; step (2) re-sync may then fail (transient sheet-fetch error, parse failure, infra fault). The design is **decision-durable, apply-eventual** — consistent with the content-pin model where the corrected value is re-derived every sync, not stored:
- The committed write is **NOT rolled back** on a step-(2) failure — rolling it back would silently discard the admin's intent. It stays stored **exactly as the state-aware rule (§3) computed it** (the `applied` value is NOT forced to `false` — it is whatever the rule wrote), and reaches its settled state on the **next successful sync** (scheduled cron re-sync or a manual retry) if it is not already settled.
- **Whether step-(2) failure leaves a pending state depends on the `applied` the write computed** (§3 rule — `applied` = "entity rows already match the new preference"):
  - `transform-active → raw` writes `{raw, applied:false}` → step-(2) failure leaves durable `apply-pending` (entity rows still transform).
  - `raw-active → transform` writes `{transform, applied:false}` → step-(2) failure leaves durable `clear-pending` (entity rows still raw).
  - `clear-pending → raw` writes `{raw, applied:true}` → the entity rows are ALREADY raw, so this is **already settled `raw-active`** the instant step (1) commits; a step-(2) failure changes nothing (there is nothing to apply — the re-sync would only re-confirm). No pending state, no lie.
  - `apply-pending → transform` deletes the row (entity rows already transform) → already-settled `transform-active`; step-(2) failure changes nothing.
- The step-(2) re-sync failure surfaces through the **existing re-sync entry's outcome telemetry + error path** (unchanged by this feature); the toggle action returns a typed result distinguishing "already settled" from "saved, apply pending (re-sync failed: <reason>)".
- The UI (§8) derives its state durably from `preference`+`applied` (§3), so it never shows a settled state (`raw-active`/`transform-active`) while the entity rows disagree, and never shows a pending state (`apply-pending`/`clear-pending`) once `applied` is settled — in every case the render matches the actual entity-row content.

The plan MUST add executable coverage that: each action derives its lock key from the server-loaded row (not client args) and keys the decision by `(code, contentHash)` read from the validated `warningRef`'s live `resolution`, writes its decision under `lockedShowTx`; the per-show action's re-sync delegation does not nest the lock (sequential, not nested); a step-(2) re-sync failure after toggle-ON leaves `{preference:"raw", applied:false}` intact → durable `apply-pending` after reload; a step-(2) re-sync failure after toggle-OFF of an applied row leaves `{preference:"transform", applied:false}` intact → durable `clear-pending` after reload (NOT silently `transform-active`); and the finalize path (§7) applies + migrates staged decisions. (Invariant 2's "tests assert the lock is held" is satisfied per-path; the re-apply that mutates `crew_members`/rooms/hotels happens inside the re-sync entry's own lock, which is already covered.)

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
| Parser change | always set `warning.resolution` (resolvable payload or `{resolvable:false}` guard) | always set `warning.resolution` | always set `warning.resolution` (`parsed.dates` mdy + `replacement.dmyDates`); `{resolvable:false,reason:"invalid-dmy"}` on invalid (§6) |
| `resolution.parsed` (transform value) | name/dims/floor split | `{names, confirmationNo}` split | mdyIso for all tokens |
| `resolution.replacement` (raw) | name=rawHeader, dims/floor=null | `names=[rawSnippet]`, confirmationNo=null | dmyIso for all tokens |
| Overlay field rewrite | room row `name`/`dimensions`/`floor` | hotel_reservation `names`/`confirmation_no` (by `blockRef.index`) | `result.dates.{travelIn,set,showDays,travelOut}` ONLY (clock/free-text fields untouched, §6) |
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
- **Match-by-content-hash, NOT target (R5 crux):** a decision whose pinned cell is edited so the parsed **target changes** (e.g. room name shifts) is `invalidated` and SURFACED — assert it is NOT silently dropped. A decision whose cell is unchanged stays `kept` even if a *different* room's name changed. A whitespace-only edit to the pinned cell (same canonical content) stays `kept` (assert — canonical-content pinning, §5). Two rooms with the same canonical raw share one `(code,contentHash)` decision (both `kept`).
- Content-pin lifecycle: unchanged cell (or whitespace-only edit) → `kept`; any edit changing the canonical pinned content (now clean, differently-ambiguous, or target moved) → `invalidated` + `USE_RAW_DECISION_STALE` change-log + pruned column. Assert there is NO silent path.
- **Content-scoped partial divergence (R7):** two rooms with identical canonical raw share one decision; edit ONE so its content changes. Assert: the decision stays `kept` (still matches the other room), NO `USE_RAW_DECISION_STALE` row is written (the decision is still valid), the edited cell falls back to the transform, AND the edited cell re-surfaces on its own (fresh warning if still ambiguous, or clean parse). This asserts the absence of a STALE row is correct behavior, not a miss.
- **Parsed-vs-raw both durable on the warning (R7):** after a successful raw apply overwrites the entity rows, assert `warning.resolution.parsed` still holds the transform value and `warning.resolution.replacement` the raw value, so the UI's `current` (= `resolution.parsed`) is not lost. Assert the UI never sources `current` from the (overlaid) entity rows.
- **Durable `preference`+`applied` state machine, BOTH directions (R7/R8/R9):** toggle-ON from `transform-active` writes `{preference:"raw", applied:false}`; a successful overlay rewrites `applied:true`. Toggle-OFF of an `applied:true` row writes `{preference:"transform", applied:false}` (NOT a hard-delete); a successful overlay restores the transform and GARBAGE-COLLECTS the row. Toggle-OFF of an `applied:false` (apply-pending) row hard-deletes immediately. Toggle-ON from `clear-pending` writes `{preference:"raw", applied:true}` (see the state-aware-write test below). Assert reload-safe state derivation (§8) for all four persisted shapes → `transform-active`/`apply-pending`/`raw-active`/`clear-pending`. **Toggle-OFF failure symmetry (R8 crux):** a step-(2) re-sync failure after toggling OFF an applied row leaves `{preference:"transform", applied:false}` intact → asserts durable `clear-pending` after reload, NEVER silently `transform-active` while entity rows are still raw. Same for toggle-ON failure → durable `apply-pending`.
- **Overlay `reverted` partition:** a `preference:"transform"` decision whose warning is present → overlay applies nothing (transform value preserved on the entity row) and the row is dropped from the persisted set (assert GC); no `USE_RAW_DECISION_STALE` row for a revert (admin-initiated, not a content-invalidation).
- **State-aware toggle write / `clear-pending → raw-active` (R9 crux):** starting from `clear-pending` (`{preference:"transform", applied:false}`, entity rows already raw), a toggle-ON writes `{preference:"raw", applied:true}` and renders `raw-active` IMMEDIATELY (no re-sync needed) — assert it does NOT write `applied:false`/render `apply-pending` (which would lie about the already-raw rows). Cover every current-row × direction cell of the §3 toggle table, including the `{transform, applied:true}` → row-deletion GC path.
- **Hotel overlay shape (R9):** assert `resolution.replacement` for hotels is `{names:[rawSnippet], confirmationNo:null}` and the overlay rewrites the matched reservation's `names` (single-element) + `confirmation_no` (null), leaving `hotel_name`/`hotel_address`/`check_in`/`check_out`/`notes` untouched (assert equality). Reservation matched by `blockRef.index`.
- **Date `resolution` shape + overlay target fields:** assert `resolution.parsed.dates` and `resolution.replacement.dmyDates` are the `DateOrderFields` shape (`{travelIn,set,showDays[],travelOut}`), `showDays` order-preserved and index-aligned; the overlay rewrites EXACTLY those four fields on `result.dates` and leaves `loadIn`/`setupTime`/`setAgendaRaw` untouched (assert equality on the untouched fields). Derive expected ISO values from a fixture whose DMY reading differs from its MDY reading.
- **Legacy warning discrimination (R9):** a persisted in-scope warning WITHOUT `resolution` (pre-feature) renders `legacy-unavailable` ("re-sync to enable"), NOT `disabled`; a fresh warning with `{resolvable:false, reason}` renders `disabled` with the reason; a `{resolvable:true}` warning renders the control. Assert the three render distinctly and that the parser now always sets `resolution` (resolvable or guard) for the three codes.
- Parser: `warning.resolution` carries the correct `parsed` + `replacement` + stable `contentHash` for each resolvable recoverable code; the parser ALWAYS sets `resolution` for the three in-scope codes (resolvable payload OR `{resolvable:false, reason}`), never leaving it absent; absent for non-recoverable codes. **Exactly one `DATE_ORDER_SUGGESTS_DMY` warning per DATES block** (assert cardinality on a multi-violation fixture — one control, one decision). Fuzz/mutation layer still sees a pure parser.
- **Staged → persisted finalize migration:** a staged `pending_syncs.use_raw_decisions` decision made against the staged parse applies at finalize and lands in `shows_internal.use_raw_decisions` (`kept`). A staged decision that a **re-ingestion regenerated the staged parse** underneath (new `resolution.contentHash`) is `invalidated` at finalize (not migrated, surfaced) — same comparison rule as re-sync (§7 case ii). And the trivial case: with no re-ingestion, the staged decision is `kept` (hash matches by construction). Assert against the persisted `shows_internal.use_raw_decisions` row + the change-log, not the wizard render.
- Server actions (both): behavioral proof each emits its admin-outcome code on the committed-success branch (sink-spy), writes under `lockedShowTx`, destructures `{data,error}`.
- Real-browser (Playwright, not jsdom): `<UseRawControl>` renders in BOTH the wizard judgment callout (staged, preview from `warning.resolution`) and the per-show page (persisted); toggling flips `transform-active`↔`raw-active`; `apply-pending`/`clear-pending` render for the respective `applied:false` shapes (per-show only) and survive reload; `disabled` renders for `{resolvable:false}` and `legacy-unavailable` for absent `resolution` (distinct copy). Both parsed and raw values render from `warning.resolution` (never from overlaid entity rows). Transition-audit task covers all state pairs incl. the compound optimistic-`pending` case, the `apply-pending`/`clear-pending` transitions, and the immediate `clear-pending → raw-active`.

---

## 13. Watchpoints (disagreement-loop preempts — cite before relitigating)

- **This is NOT the removed #376 feature.** No typed value is stored; the corrected value is re-derived from the sheet's raw every sync; the persisted preference is content-pinned + auto-invalidating. Ratified in `BACKLOG.md` BL-STRUCTURAL-TRANSFORM-USE-RAW and §1.1. Do not argue it reintroduces a second source of truth.
- **`shows_internal` is the correct storage home** (`:1-6`, already holds `parse_warnings`); `pull_sheet_override` living on `pending_syncs`/`shows` is a *different* jsonb precedent, not a contradiction. Do not argue for a new table.
- **Parser stays pure** — admin decisions never enter `parseSheet`; the overlay is a post-parse layer. `warning.resolution` (§6) is computed by the parser purely from sheet data it already holds (`rawSnippet`, `DateToken`), NOT from admin state.
- **`ParseWarning.resolution` is an intentional, bounded field** (§6) — optional on the common shape, but ALWAYS set for the three recoverable codes (a `resolvable:true` payload with precomputed parsed+replacement+pin, OR a `{resolvable:false, reason}` guard); absent on every other code. The always-set rule for the three codes is what lets the UI tell a fresh guard-disabled warning from a legacy pre-feature warning (absent resolution → `legacy-unavailable`, §8). It exists because both surfaces read from PERSISTED warnings (wizard: `pending_syncs.parse_result`; per-show: `shows_internal.parse_warnings`) and neither re-parses — so the value must travel on the persisted warning. Do not argue it bloats the common warning shape (absent on every non-recoverable code) or that the overlay/UI should recompute it (single-owner = the parser).
- **Two storage homes + finalize migration is required by the lifecycle, not gratuitous** (§3) — the Step-3 wizard is PRE-CREATE (no `shows`/`shows_internal`/`showId`; parse in `pending_syncs.parse_result`, `applyStagedCore.ts:434` creates the show only at finalize), so staged decisions MUST live on `pending_syncs` and migrate to `shows_internal` at finalize. Do not argue for a single `shows_internal`-only home (it cannot exist during onboarding review).
- **The per-show action delegates re-apply to the existing re-sync entry** (§9b) — two SEQUENTIAL lock acquisitions (write, then re-sync), which is NOT the nested double-holding the single-holder rule forbids. Do not conflate sequential re-acquisition with a nested deadlock (M5 R20 was nested/simultaneous).
- **Finalize does NOT re-fetch/re-parse a different sheet** (§7) — it applies the staged parse the admin reviewed. The content-pin holds by ONE uniform rule (`decision.contentHash` vs the current warning's `resolution.contentHash`) applied at finalize and re-sync alike; the only way a staged decision goes stale before finalize is a re-ingestion that regenerates `pending_syncs.parse_result`. No separate finalize freshness gate exists or is needed.
- **Both actions derive the advisory-lock key + target from the server-loaded authoritative row** (§9), never from client args — the wizard action reads `drive_file_id` from the `pending_syncs` row found by `wizard_session_id`; the per-show action reads it from the `shows` row found by `showId`. A client cannot steer the mutation onto another show's lock. Do not treat the `driveFileId`/`showId` handle as a trusted lock key.
- **Rooms "use raw" intentionally clears dimensions/floor** — that is the honest "we don't trust the split" behavior (§4), not data loss. The raw is fully visible in the name.
- **Dates use the alternate DMY interpretation, not a raw string** — because dates must stay structured; this is still sheet-derived (§4), not fabricated.
- **Auto-invalidate is NEVER silent (R5 collapse); decisions are content-scoped (R7).** A *decision* that stops applying to ANY cell always writes a `USE_RAW_DECISION_STALE` row (§5 case 2 — one `invalidated` category; R5 removed the old silent "moot" path). Decisions match by `(code, contentHash)`, not content-derived `target`. R7 clarified the content-scoped consequence: a decision shared by content-identical cells is NOT invalidated when only one of those cells changes — that cell re-surfaces via its OWN re-emitted warning (or clean parse), not a STALE row, because the decision is still valid for the others. Do not treat the absent STALE row in the partial-divergence case as a silent miss (§5, §12 assert it is correct), and do not reintroduce a silent "moot" path.
- **`HOTEL_CARDINALITY_EXCEEDED` and `CREW_COLUMN_POSITIONAL_FALLBACK` are out of scope** (§2) — the former drops data (unrecoverable by raw), the latter is column-mapping not cell-structuring.

---

## 14. Out of scope (restated)

`HOTEL_CARDINALITY_EXCEEDED`; `CREW_COLUMN_POSITIONAL_FALLBACK`; any admin-typed value; `pull_sheet_override`; the role→scope-capability feature (`BL-EXTEND-ROLE-SCOPE-VOCAB`, separate cycle). No behavior change to any surface other than adding the use-raw control + overlay.
