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

## 3. Data model

New column: `shows_internal.use_raw_decisions jsonb not null default '[]'::jsonb`.

`shows_internal` (`supabase/migrations/20260501001000_internal_and_admin.sql:1-6`) has PK `show_id uuid references public.shows(id) on delete cascade` and already carries `parse_warnings jsonb` — it is the canonical per-show internal parse-metadata table and the correct home for this preference set. (The `pull_sheet_override` jsonb precedent lives on `pending_syncs`/`shows`, a different per-show jsonb-column precedent; both confirm jsonb-column-per-show is the established pattern — no new table needed.)

**Entry shape** (`UseRawDecision`):

```ts
type UseRawDecision = {
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS" | "HOTEL_GUEST_SPLIT_AMBIGUOUS" | "DATE_ORDER_SUGGESTS_DMY";
  target: { kind: string; name?: string; index?: number; field?: string }; // = the warning's blockRef identity
  contentHash: string; // SHA-256 (hex) of the canonical pinned raw (see §5); the content-pin
  decidedAt: string;   // ISO timestamp
  decidedBy: string;   // admin identity (canonicalized email or admin id)
};
```

No stored corrected value. `contentHash` is the only thing binding the decision to sheet content.

**Guard conditions:** an empty array (default) means "no decisions — every transform applies normally." A malformed or non-array `use_raw_decisions` (should be impossible given the write path, but defensively) is treated as empty (`[]`) and logged, never throwing. A decision whose `code` is not one of the three in-scope codes is ignored (forward/backward-compat guard).

**PostgREST DML posture:** `use_raw_decisions` is written ONLY through the SECURITY DEFINER admin path (the server action → RPC under the per-show advisory lock, §9). Direct `authenticated`/`anon` DML on `shows_internal` is already REVOKEd (verify in the plan's pre-draft pass; if not, add the REVOKE — RPC-gated-table lockdown, AGENTS.md cross-cutting discipline). No new table, so no new grant surface beyond confirming the existing lockdown.

---

## 4. Per-transform "use raw" semantics (product-visible)

Each transform declines its structuring and substitutes a value **derived from the sheet's raw content**:

| Transform | Warning | Field(s) rewritten | "Use raw" value (derived, never typed) |
|---|---|---|---|
| Room header split | `ROOM_HEADER_SPLIT_AMBIGUOUS` | room `name`, `dimensions`, `floor` | `name` = the full raw header (`warning.rawSnippet` = `params.rawHeader`, `warnings.ts:154`); `dimensions` = `null`; `floor` = `null`. Honest: crew sees exactly the sheet cell as the room's identity; no untrusted split. |
| Hotel guest glue | `HOTEL_GUEST_SPLIT_AMBIGUOUS` | hotel reservation `guests` | the raw cell (`warning.rawSnippet` = `params.rawCell`, `warnings.ts`) rendered as a **single** guest entry; no per-guest split, no confirmation-number extraction. |
| Inverted dates | `DATE_ORDER_SUGGESTS_DMY` | the show's parsed dates (whole DATES block) | the **DMY reinterpretation**: each `DateToken` already carries `{raw, mdyIso, dmyIso}` (`dates.ts:391`); "use raw" applies `dmyIso` for every token in the block instead of `mdyIso`. Deterministic reinterpretation of the raw tokens, not a typed value. |

**Rooms/hotels are "use raw verbatim"; dates are "use the alternate deterministic interpretation of the raw."** Both are sheet-derived. The date case is the only one needing a parser change (§6) because the warning currently carries a single token (`violationRaw`, `dates.ts:535`) rather than the block-wide alternate.

**Guard conditions (partial/empty raw):**
- Room: if `rawSnippet` is empty/whitespace after cleaning, the control is **disabled** with copy "no raw text to fall back to" — never store a decision that would blank the room name. (Should not occur — the split only fires on non-empty headers — but guarded.)
- Hotel: same empty-`rawSnippet` guard.
- Date: if the DMY reinterpretation yields an invalid date for any token (e.g. day > 12 both ways is unambiguous and never warns; but a token that is invalid as DMY), the control is disabled with "these dates can't be read the other way" — never persist a decision that produces an invalid date.

---

## 5. Decision identity, content-pin, and auto-invalidate lifecycle

**Canonical pinned raw** (input to `contentHash`), per transform:
- Room: `params.rawHeader` (the warning's `rawSnippet`).
- Hotel: `params.rawCell` (the warning's `rawSnippet`).
- Date: the canonical join of the DATES block's raw tokens (`DateToken.raw` for every token in `collectDateTokens`, `dates.ts:485`) — a block-wide pin so any edit to any date in the block re-decides. The parser exposes this (see §6).

`contentHash = sha256hex(canonicalPinnedRaw)`.

**Matching on re-parse.** On every parse-apply, the parser runs pure and emits warnings. For each still-firing in-scope ambiguity warning, the overlay looks for a stored decision with the same `(code, target)` where `target` = the warning's `blockRef` identity (room matched by `name`; hotel by `name`+`field`; date by `field:"order"` — there is one dates block per show). Then:

1. **Warning fires + decision found + `contentHash` matches** → apply the §4 raw-derived value to the target field(s). The decision is **live**.
2. **Warning fires + decision found + `contentHash` differs** (the pinned cell was edited) → the decision is **stale**: drop it from `use_raw_decisions`, do NOT apply, and surface it — a `show_change_log` entry + a doug-facing §12.4 code (`USE_RAW_DECISION_STALE`, §10) so the auto-invalidate is **never silent** (matches the codebase's anti-stale-override principle). The transform's normal (possibly-again-ambiguous) output stands.
3. **Warning does NOT fire** (a sheet edit resolved the ambiguity) → the decision is **moot**: garbage-collect it silently (no user-facing signal needed — the parse is now unambiguous).

Auto-invalidate (cases 2 + 3) is applied by the overlay writing back the pruned `use_raw_decisions` as part of the same locked apply transaction, so the persisted set never accumulates dead entries.

**Flag lifecycle table** (`use_raw_decisions`):

| Storage | Write path(s) | Read path(s) | Effect on output |
|---|---|---|---|
| `shows_internal.use_raw_decisions jsonb` | (a) server action → RPC (admin toggles a decision, under per-show advisory lock); (b) overlay prune during apply (auto-invalidate/GC) | the overlay `applyUseRawDecisions` at apply-time; the two admin UIs (to render current state) | when a live decision matches a firing warning, the target field is set to the raw-derived value in the parse result that gets persisted by `applyParseResult` |

---

## 6. Parser changes

Minimal, transform-local, and **preserve parser purity** (no admin state enters the parser — the fuzz/mutation layer assumes a pure `parseSheet`).

- **Rooms/hotels: none.** `rawSnippet` already carries the exact raw the overlay needs (`warnings.ts:154` room, hotel `rawCell`). Confirmed in the citation pass.
- **Dates: carry the block-wide alternate + pin.** When `DATE_ORDER_SUGGESTS_DMY` fires, expose on the parse result a single optional `datesDmyAlternative?: { contentHash: string; dmyDates: <parsed-dates shape> }` computed from the same `DateToken[]` (`dates.ts:391,485`) by preferring `dmyIso`. `contentHash` = the canonical block-raw pin (§5). This is one optional field on the result (there is at most one DATES block per show), not a per-warning payload, so no warning-shape bloat. The overlay consumes it when a live date decision exists.

The three warnings' shapes are otherwise unchanged; `ParseWarning` (`lib/parser/types.ts:7-28`) stays `{severity, code, message, blockRef?, rawSnippet?, sourceCell?}`.

---

## 7. Apply-path overlay

A pure module `lib/sync/useRawOverlay.ts`:

```ts
applyUseRawDecisions(
  parseResult: ParseResult,
  decisions: UseRawDecision[],
): { result: ParseResult; kept: UseRawDecision[]; stale: UseRawDecision[]; moot: UseRawDecision[] };
```

- Pure: input parse result + decisions → new parse result + the partition (kept/stale/moot) for the caller to persist + surface. No I/O, no clock (timestamps passed in), deterministic.
- Runs in `applyParseResult` (`lib/sync/applyParseResult.ts:94-97`) BEFORE the full-replace writes (crew `:135-136`, rooms `:141`, hotels `replaceHotelReservations`, `parse_warnings` `:207-214`). The overlaid `parseResult` is what gets persisted, so the stored `crew_members`/rooms/`hotel_reservations`/dates rows are canonical — every downstream reader (crew page, report, exports) sees the corrected value with no per-consumer overlay.
- `applyParseResult` already runs inside the per-show advisory-lock tx (`lib/sync/lockedShowTx.ts:57-62`, hashkey `hashtext('show:' || driveFileId)`, single holder — it takes `tx`, does not self-lock). The overlay's write-back of the pruned decision set is part of that same tx → invariant 2 single-holder preserved, no new lock layer.

---

## 8. UI (Opus + impeccable v3 dual-gate)

One shared client component `<UseRawControl warning decision onToggle state />` rendered in both surfaces:

- **Wizard judgment callout** — `components/admin/wizard/step3ReviewSections.tsx:494-547`. Today each entry renders `reviewWarningTitle(warning)` + `fieldLabelFor(warning.blockRef?.field)` + a `View details` jump button (`:513,517,525-531`); there is **no** per-entry action slot yet. Add the control inline per entry (only for the three in-scope codes).
- **Per-show admin page** — `components/admin/PerShowActionableWarnings.tsx`, via its existing `renderItemControls?: (w: ParseWarning, i: number) => ReactNode` prop (`:31`, rendered `:103`). Pass `<UseRawControl>` through that slot.

**States** (a small state machine, enumerate every transition in the plan's transition-audit task):
- `transform-active` (default) — shows the transform's structured result + a "Use the sheet's raw value instead" affordance with an inline **preview** of what raw would render.
- `raw-active` — shows the raw-derived value + "Using the sheet's raw value" + a "Switch back to the parsed version" affordance.
- `disabled` — when the guard conditions in §4 hold (empty raw / invalid DMY); shows why, no toggle.
- `pending` — optimistic in-flight during the server action; the toggle disables to avoid double-submit (see the react-form-action self-disable gotcha).

Toggling calls the server action (§9), then the surface re-reads. Copy is plain-language, no raw error codes (invariant 5) — routed through `lib/messages/lookup.ts`. Both surfaces get `/impeccable critique` + `/impeccable audit` on the diff (invariant 8); HIGH/CRITICAL fixed or `DEFERRED.md`.

**Guard conditions (props):** `warning` with a `code` outside the three in-scope codes → the control renders nothing (the caller already filters, but the component guards too). `decision` null/absent → `transform-active`. Missing `rawSnippet` → `disabled`.

---

## 9. Server action + telemetry (invariants 2, 9, 10)

`setUseRawDecisionAction(showId, warningRef, useRaw: boolean)` — a module-level `"use server"` admin action:

- Admin-gated (`requireAdminIdentity`), so it is an **admin mutation** → `AUDITABLE_MUTATIONS` registry row + executable success-branch behavioral proof (`tests/log/adminOutcomeBehavior.test.ts`), per invariant 10.
- Mutates `shows_internal` → runs under the per-show blocking advisory lock `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` via the existing locked-tx helper (`lib/sync/lockedShowTx.ts`), single holder (invariant 2). It upserts/removes the decision (computing `contentHash` from the current warning's canonical raw) then triggers a re-apply so the overlay takes effect immediately.
- Supabase call-boundary discipline (invariant 9): destructure `{ data, error }`, typed infra-fault result; register in the relevant meta-test.
- `logAdminOutcome` POST-COMMIT (outside the lock tx): forensic codes `USE_RAW_DECISION_SET` / `USE_RAW_DECISION_CLEARED` (admin-outcome codes, §12.4-exempt per `_metaAdminOutcomeContract`, like other admin-outcome forensics). Never logs raw sheet content beyond the already-persisted `parse_warnings`.

---

## 10. Messages / §12.4 codes (3-way+ lockstep)

New codes (each lands in §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` in one commit — AGENTS.md §12.4 lockstep; catalog row shape per `catalog.ts:1281-1293`):

- `USE_RAW_DECISION_STALE` — **doug-facing** (`dougFacing` copy; `crewFacing: null`): surfaced when a decision auto-invalidates because its pinned cell changed (§5 case 2). Appears in the changes feed. Plain language: "You'd chosen to use the sheet's raw text for <field>; that cell changed, so we're reading it fresh again."
- `USE_RAW_DECISION_SET` / `USE_RAW_DECISION_CLEARED` — **admin-outcome forensic** codes (not §12.4 catalog rows; registered as admin-outcome-exempt per `_metaAdminOutcomeContract`, mirroring existing admin-outcome codes). Namespaced so they do NOT collide with any `REPORT_*`/existing family (M8 report-code namespace lesson).

Full new-code CI touchpoints (per the "new §12.4 code = 4 more gates" lesson): x1-catalog-parity, x2 gen:internal-code-enums, help `_families` if a new error family is introduced (only `USE_RAW_DECISION_STALE` is doug-facing → confirm whether it needs a help family or attaches to an existing one), and the full suite run.

---

## 11. Tier × domain × layer matrix

| Layer | Rooms | Hotels | Dates |
|---|---|---|---|
| Warning emit (existing) | `warnings.ts:139-155` / `rooms.ts:493` | `warnings.ts:174-197` / `hotels.ts:572` | `warnings.ts:234-246` / `dates.ts:535` |
| Parser change | none (rawSnippet sufficient) | none (rawSnippet sufficient) | add `datesDmyAlternative` + block pin (§6) |
| Raw-derived value | name=rawHeader, dims/floor=null | guests=rawCell (single entry) | dmyIso for all tokens |
| Overlay field rewrite | room row | hotel_reservation row | show dates |
| contentHash input | rawHeader | rawCell | block-raw join |
| UI control | wizard + per-show | wizard + per-show | wizard + per-show |
| Tests | rooms overlay + guard + pin | hotels overlay + guard + pin | dates parser-alt + overlay + guard + pin |

DB: one migration (add jsonb column) → local apply + `gen:schema-manifest` + surgical validation apply (validation-schema-parity gate). No CHECK/enum change (jsonb column, no constraint). No trigger/cleanup function change.

---

## 12. Testing

TDD per task. Meta-test inventory this milestone touches: `AUDITABLE_MUTATIONS` (new admin action row + behavioral proof), `_metaInfraContract` (new Supabase call site if any in the action path), `_metaAdminOutcomeContract` (register the two forensic codes as exempt), §12.4 catalog parity (new `USE_RAW_DECISION_STALE`), validation-schema-parity (new column). Advisory-lock topology: no NEW holder (reuses the existing locked-tx single holder) — declare explicitly, no `advisoryLockRpcDeadlock` change.

Key tests (anti-tautology — assert the persisted overlaid value against the raw source, not the render container):
- Overlay unit: each transform's raw-derivation from a fixture warning; hash-match → applied; hash-mismatch → dropped + reported (stale partition); warning-absent → moot partition. Derive expected values from fixture raw, never hardcode.
- Content-pin: a decision made against raw R stays live when R is unchanged, auto-invalidates when the pinned cell changes (assert the `USE_RAW_DECISION_STALE` surfacing + the pruned column), GCs when the ambiguity resolves.
- Parser: `datesDmyAlternative` carries the correct DMY dates + a stable block hash; unchanged for shows with no date ambiguity.
- Server action: behavioral proof it emits the admin-outcome code on the committed-success branch (sink-spy), runs under the advisory lock, destructures `{data,error}`.
- Real-browser (Playwright, not jsdom): the `<UseRawControl>` renders in both the wizard judgment callout and the per-show page; toggling flips `transform-active`↔`raw-active`; disabled-guard state renders when raw is empty. Transition-audit task covers all state pairs incl. the compound optimistic-`pending` case.

---

## 13. Watchpoints (disagreement-loop preempts — cite before relitigating)

- **This is NOT the removed #376 feature.** No typed value is stored; the corrected value is re-derived from the sheet's raw every sync; the persisted preference is content-pinned + auto-invalidating. Ratified in `BACKLOG.md` BL-STRUCTURAL-TRANSFORM-USE-RAW and §1.1. Do not argue it reintroduces a second source of truth.
- **`shows_internal` is the correct storage home** (`:1-6`, already holds `parse_warnings`); `pull_sheet_override` living on `pending_syncs`/`shows` is a *different* jsonb precedent, not a contradiction. Do not argue for a new table.
- **Parser stays pure** — admin decisions never enter `parseSheet`; the overlay is a post-parse layer. The date `datesDmyAlternative` is computed by the parser from tokens it already has, not from admin state.
- **Rooms "use raw" intentionally clears dimensions/floor** — that is the honest "we don't trust the split" behavior (§4), not data loss. The raw is fully visible in the name.
- **Dates use the alternate DMY interpretation, not a raw string** — because dates must stay structured; this is still sheet-derived (§4), not fabricated.
- **Auto-invalidate is never silent** for the stale case (§5 case 2) — matches the codebase anti-stale principle; the moot case is silent by design (the parse is now unambiguous).
- **`HOTEL_CARDINALITY_EXCEEDED` and `CREW_COLUMN_POSITIONAL_FALLBACK` are out of scope** (§2) — the former drops data (unrecoverable by raw), the latter is column-mapping not cell-structuring.

---

## 14. Out of scope (restated)

`HOTEL_CARDINALITY_EXCEEDED`; `CREW_COLUMN_POSITIONAL_FALLBACK`; any admin-typed value; `pull_sheet_override`; the role→scope-capability feature (`BL-EXTEND-ROLE-SCOPE-VOCAB`, separate cycle). No behavior change to any surface other than adding the use-raw control + overlay.
