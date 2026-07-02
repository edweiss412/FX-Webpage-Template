# Spec — Row-precise anchoring + label surfacing for `UNKNOWN_FIELD` warnings

**Date:** 2026-07-01
**Slug:** `unknownfield-row-anchor`
**Status:** Draft (autonomous-ship pipeline; user spec/plan review gates waived)
**Implementer:** Opus / Claude Code (UI touched → Opus mandatory)
**Reviewer:** Codex (cross-model adversarial)

---

## 1. Problem

Two user-visible defects, one shared root cause, observed on the live validation deploy for show **"AII/III - Consultants Roundtable 2025"** (`/admin/show/2025-10-aii-iii-consultants-roundtable-2025`; INFO tab spreadsheet id `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`, gid `0`):

1. **Count discrepancy.** The Step-3 onboarding review modal shows **WARNINGS (2)** — two "Unrecognized row in sheet" entries — but the published admin show page's **Data quality** section shows only **1**.
2. **Useless deep link + indistinguishable entries.** The "Open in Sheet" link for every unrecognized-row warning scrolls to the **DETAILS block header cell (A55)**, not the offending row; and both Step-3 entries render the identical generic title, so the operator cannot tell **which** row is unrecognized.

Both stem from `UNKNOWN_FIELD` warnings being anchored at **block** granularity rather than **row** granularity, and from the UI dropping the per-row label the parser already captured.

## 2. Root cause (verified; adversarially confirmed, high confidence)

- `emitUnknownField` (`lib/parser/warnings.ts:120-135`) pushes **one** warning per unrecognized row: `code="UNKNOWN_FIELD"`, `message="Unrecognized <block> row label: '<key>'"`, `rawSnippet="<key> | <value>"`, and `blockRef: { kind: opts.kind }` — **no per-row location**.
- `attachSourceCellAnchors` (`lib/drive/showDayTimeAnchors.ts:114-152`) resolves `UNKNOWN_FIELD` in its region-fallback branch (`:136-148`) to the whole-block region rect `sources.region[kind]` — the **same** `{gid, a1}` for every row in the block. The region rect's `a1` is a range whose top-left is the block header row (`lib/drive/sourceAnchors.ts:149-183`, `:236-241`), so the deep link scrolls to the header (A55).
- `operatorActionableWarnings` (`lib/parser/dataGaps.ts:152-170`) dedups on the key `` `${w.code}\0${w.sourceCell.gid}\0${a1}` `` (`:163`), but **only when `a1` is present** (`:162`). Two `UNKNOWN_FIELD` rows in one block share one region `a1` → they collapse to one on the admin surface. The admin page renders the deduped list (`app/admin/show/[slug]/page.tsx:325` → `components/admin/PerShowActionableWarnings.tsx`); Step-3 renders the raw array (`components/admin/wizard/Step3SheetCard.tsx:1493,808,817` → `WarningsBreakdown`) → 2 vs 1.
- Both UI surfaces render the generic catalog title "Unrecognized row in sheet" (`lib/messages/catalog.ts:1021`, which has no `<key>` placeholder) and ignore `w.rawSnippet` / `w.message`, dropping the only per-row discriminator.

## 3. Key feasibility constraint (drives the approach)

The originally-imagined "pass the row's cell/index into `emitUnknownField`" is **impossible**. The parser runs on synthesized markdown (`synthesizeMarkdownFromXlsx`, `lib/drive/exportSheetToMarkdown.ts:186`; invoked `lib/parser/index.ts:488,501`) that has already destroyed all A1/grid coordinates: `splitBlocks` drops blank separator rows, `trimBlock` column-slices so even "column A" identity is lost, blocks are concatenated across sheets, and a synthetic separator row is injected. At the emit point the **only** durable datum is the **label string** (`col0`). Confirmed the **only two** callers of `emitUnknownField`:
- `lib/parser/blocks/venue.ts:300` — `{ block: "venue", kind: "venue", key: col0.trim(), value: rawVal }`
- `lib/parser/blocks/event.ts:211-216` — `{ block: "event_details", kind: "details", key: col0, value: val }`

Therefore the blast radius is exactly the **venue** and **event-details** blocks. Dress, transportation, rooms, etc. do **not** emit `UNKNOWN_FIELD`.

## 4. Approach — mirror the existing crew-role cell-anchor precedent

The codebase already solves "anchor a warning to a cell when the parser lost coordinates" for crew-role deep links: it **re-scans the raw workbook** in the anchoring layer and matches each warning to its cell by a **semantic key** (the crew member's name), with an **exactly-one-match-else-null** guard.

- `lib/drive/crewRoleAnchors.ts` — `extractCrewRoleAnchors(buffer, titleToGid)` re-scans the INFO tab and builds per-row `CrewRoleAnchor { name, anchor }`; `resolveCrewRoleCell(anchors, name)` returns the anchor iff exactly one name matches, else `null`.
- Wired as a `safe()`-guarded source family in `lib/sync/attachWarningAnchors.ts:48`.
- Dispatched in `attachSourceCellAnchors` (`lib/drive/showDayTimeAnchors.ts:123-129`) for `UNKNOWN_ROLE_TOKEN` / `UNKNOWN_DAY_RESTRICTION` / `STAGE_WORD_AUTOCORRECTED` / `ROLE_TOKEN_AUTOCORRECTED`.

We mirror this exactly, keyed on the row **label** (scoped by block `kind`) instead of a name.

## 5. Design

### 5.1 Part C — row-precise anchor (new module + wiring; makes Part B automatic)

**New module `lib/drive/unknownFieldAnchors.ts`** (mirrors `crewRoleAnchors.ts`):

- `export type UnknownFieldAnchor = { kind: string; label: string; value: string; anchor: SourceAnchor }` — the `value` field carries the row's normalized value text so resolution matches on **(kind, label, value)**, giving **provenance** (which specific row), not just label uniqueness (see §5.1.1).
- `export function normalizeLabelKey(s: string): string` — `clean(s)` (from `lib/parser/blocks/_helpers`), collapse whitespace, `toLowerCase()`. Applied identically to the grid cell text and to `blockRef.name` so the two sides compare for equality. Comment: `canonicalize-exempt: sheet label, not an email` (mirrors the convention in `crewRoleAnchors.ts:39-46`). `export function normalizeValueKey(s: string): string` — same normalization, applied to the row's value cell and to the value parsed from the warning's `rawSnippet`.
- `export function extractUnknownFieldAnchors(buffer: ArrayBuffer, titleToGid: Map<string, number>): UnknownFieldAnchor[]`
  - `XLSX.read(buffer, { type: "array", cellText: true, cellDates: false })`.
  - Select the INFO sheet exactly as `crewRoleAnchors.ts:137-139`: `SheetNames.find(n => n.toUpperCase() === "INFO" && !/\bOLD\b/i.test(n))`. Missing sheet / `!ref` / missing gid → return `[]`.
  - `buildAbsGrid(sheet)` (exported from `lib/drive/sourceAnchors.ts`).
  - For each `(kind, headerRegex)` in the fixed pair — `("venue", /^VENUE$/i)` and `("details", /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i)` (the exact `REGION_ANCHOR_SPEC` headers, `lib/sheet-links/buildSheetDeepLink.ts:107-123`): locate the **first** header row whose first non-blank cell matches, then scan `headerRow+1 .. maxRow`. For each scanned row, take the first non-blank cell as the **label** (its column is the anchor column) and the next non-blank cell to its right as the **value**; push `{ kind, label: normalizeLabelKey(labelText), value: normalizeValueKey(valueText), anchor: { title, gid, a1: XLSX.utils.encode_cell({ r, c: labelCol }) } }`.
  - **Over-inclusive bounding (provenance safety):** the scan MUST cover **at least** every row the parser could `emitUnknownField` from within this block — under-inclusion is the only way a wrong cell arises (§5.1.1), over-inclusion is harmless (an extra row either has a distinct label→value or collides→`null`). Concretely: do **not** stop at the first internal blank row; scan to the next `BLOCK_TERMINATORS` full-cell match or sheet end (a strict superset of `headerBlock`, which stops at the first blank). During implementation, verify against `parseVenue` / `parseEventDetails` that the parser's emitting rows ⊆ this scan.
  - Degrade to `[]` (or fewer anchors) on any workbook edge — **never** a wrong anchor.
- `export function resolveUnknownFieldCell(anchors: UnknownFieldAnchor[], kind: string | undefined | null, label: string | undefined | null, value: string | undefined | null): SourceAnchor | null`
  - If `kind` or `label` is missing → `null`.
  - Filter to anchors whose `kind === kind` **and** `label === normalizeLabelKey(label)` **and** `value === normalizeValueKey(value)`. Return the anchor iff **exactly one** matches; zero or ≥2 → `null` (mirror `resolveCrewRoleCell:177-185`). Kind-scoping prevents a shared label (e.g. "Notes") in both the venue and details blocks from colliding; value-matching prevents a same-label row *elsewhere in the scanned block* from being mis-anchored.
  - **Dispatch computes `value` from the warning:** `w.rawSnippet` is `"<key> | <value>"`; split on the **first** `" | "` and pass the remainder as `value`. Both the parser (rawSnippet) and the extractor (value cell) read the same source cell, so after `normalizeValueKey` they compare equal for the correct row; a normalization mismatch degrades to `null` (labelled-but-linkless), never a wrong link.

#### 5.1.1 Provenance guarantee (why no wrong-cell link)

The exactly-one guard alone protects against **duplicate labels**, not **provenance** (that the single match is the row the parser actually flagged). Two independent properties close the wrong-cell risk:

1. **Over-inclusive extractor bound** (above): the parser's emitting row is always *within* the extractor's scan. So for a label the parser flagged, its own cell is a candidate. If the label is unique in the scan → the single match **is** that cell. If duplicated → ≥2 → `null`.
2. **(label, value) match**: even under a hypothetical bound divergence, a same-label row *elsewhere* has a different value → it fails the value filter → it cannot become the "exactly-one" wrong match. A wrong-cell link would require another row with the **same kind, same label, and same value** — indistinguishable from the true row — in which case `null` (≥2) is returned anyway.

Net: the resolver returns the **correct** cell or **`null`**, never a wrong cell — matching the `resolveCrewRoleCell` safety posture, now proven rather than asserted.

**Emit change — `emitUnknownField` (`lib/parser/warnings.ts:120-135`):** set `blockRef: { kind: opts.kind, name: opts.key }`. `blockRef.name` already exists on `ParseWarning` (`lib/parser/types.ts:12`) — **no type change, no migration**. `rawSnippet` unchanged. No call-site change needed (both callers already pass `key`).

**Wiring — `lib/sync/attachWarningAnchors.ts`:** add a 4th `safe()`-wrapped family `unknownField: safe(() => extractUnknownFieldAnchors(bytes, gids), [])`. Extend `WarningAnchorSources` (`lib/drive/showDayTimeAnchors.ts:98-102`) with `unknownField: UnknownFieldAnchor[]`.

**Dispatch — `attachSourceCellAnchors` (`lib/drive/showDayTimeAnchors.ts:114-152`):** add a branch (placed with the other semantic-key resolvers, before the region-fallback branch):
```
} else if (w.code === "UNKNOWN_FIELD") {
  const valueFromSnippet = w.rawSnippet?.split(" | ").slice(1).join(" | ") ?? null;
  cell = resolveUnknownFieldCell(
    sources.unknownField, w.blockRef?.kind, w.blockRef?.name, valueFromSnippet,
  );
}
```
(`split(" | ").slice(1).join(" | ")` recovers the full value even when the value itself contains `" | "`.)
and **remove** `w.code === "UNKNOWN_FIELD" ||` from the region-fallback branch (`:136-148`) so a no/ambiguous match resolves to `null` (**not** the block region). `FIELD_UNREADABLE`, the `*_AUTOCORRECTED` family, and `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` **stay** in the region-fallback branch (out of scope).

### 5.2 Part B — under-count fix (falls out of Part C; no dedup change)

**No dedup-key change** in `operatorActionableWarnings`. (Part D adds a sibling helper to the same file, but the dedup key itself is untouched.) After Part C:
- **Unique label** → distinct label-cell `a1` per row → the dedup key differs → all rows survive.
- **Ambiguous / no match** → `sourceCell` is `null` → no `a1` → dedup skips it (`dataGaps.ts:162 if (a1)`) → all such rows survive.

Either way the admin count equals the Step-3 count for freshly-parsed shows; Part D extends the same outcome to already-persisted (legacy) shows. We deliberately **do not** widen the dedup key with `rawSnippet`, so genuine same-cell cascades for the sibling region-anchored codes still collapse as intended. The dedup's documented invariant "no actionable row is ever hidden" (`dataGaps.ts:147-150`) becomes **true** for `UNKNOWN_FIELD`.

### 5.3 Part D — legacy read-time compatibility shim (fixes already-persisted shows)

**Why:** Parts C/B only take effect when a show is (re-)parsed. The reported repro is an **already-published** show whose `shows_internal.parse_warnings` already stores two `UNKNOWN_FIELD` warnings carrying the **stale block-region anchor** (`sourceCell = { gid, a1: <A55 range> }`) and **no** `blockRef.name`. Because the admin page reads and dedups the persisted warnings as-is (`app/admin/show/[slug]/page.tsx:291,325`), the count would stay `1` and the A55 link would keep rendering until a re-parse rewrites the JSONB — which never happens for an unchanged sheet (`last_seen_modified_time` gating; no global cursor). A code-only fix therefore would **not** fix the live defect. This shim makes stale rows self-heal at read time, on deploy, with no migration and no forced re-sync.

**Shim:** `export function stripLegacyUnknownFieldAnchors(warnings: ParseWarning[]): ParseWarning[]` (co-located with `operatorActionableWarnings` in `lib/parser/dataGaps.ts`). For each warning where `w.code === "UNKNOWN_FIELD"` **and** its persisted `sourceCell.a1` is a **range** (contains `":"`), return a shallow copy with `sourceCell` cleared (`sourceCell: null`). All other warnings pass through untouched (identity-preserving where possible).

**Why the range-`a1` signature (not `!blockRef.name`):** only the old region-fallback path ever produced a `sourceCell` for `UNKNOWN_FIELD`, and it always used `XLSX.utils.encode_range` → a multi-cell range (`"A55:B74"`). Part C's per-row anchors use `encode_cell` → a single cell (`"A56"`, no `":"`), and ambiguous/no-match rows get no `sourceCell` at all. So "still carrying a range `a1`" is the exact, unambiguous fingerprint of a stale legacy anchor — it never misfires on a new-format warning (single-cell or null), including the empty-label edge where `blockRef.name` would be a falsy `""`.

**Apply at both persisted-warning read boundaries**, as early as possible so both the dedup and the link render see normalized warnings:
- Admin: immediately after `warnings = Array.isArray(...) ? ... : []` (`app/admin/show/[slug]/page.tsx:291`).
- Step-3: immediately after `const warnings = arr(pr.warnings)` (`components/admin/wizard/Step3SheetCard.tsx:1493`).

**Effect on a legacy row:** stale range `sourceCell` cleared → `operatorActionableWarnings` sees no `a1` → not deduped → **both rows show** (count = 2, matching Step-3); the component's `w.sourceCell ? buildSheetDeepLink(...)` → `null` → **no A55 link**; Part A still renders each row's label from `rawSnippet`. **Forward-safe:** after any re-parse, `UNKNOWN_FIELD` warnings carry a single-cell (or `null`) anchor — never a range — so the shim is a no-op and Part C provides precise per-row links. This shim is a compatibility bridge, not a permanent substitute for the parse-time anchor.

### 5.4 Part A — label surfacing (UI; both surfaces)

In `components/admin/wizard/Step3SheetCard.tsx` `WarningsBreakdown` (~`:805-873`) and `components/admin/PerShowActionableWarnings.tsx`: when the warning is a cataloged code that carries a `rawSnippet`, render the row **label** as a muted secondary line beneath the title. The label is `rawSnippet` up to the **first** `" | "` (the value may itself contain `" | "`), trimmed. Shared extraction helper `labelFromRawSnippet(rawSnippet?: string | null): string | null` (co-located, e.g. in a small `lib/messages` or component-local util) that returns `null` for absent/blank input. Plain display text routed the same way the components already render `w.message` (through `renderEmphasis`); the label is **sheet content, not an error code**, so invariant 5 is satisfied. No catalog / §12.4 change.

Placement/copy: below the existing title `<span>` (Step3 `:841`; PerShow `:44`), a `text-text-muted` line reading the bare label (e.g. `GS Podium Type`). When `labelFromRawSnippet` is `null`, render nothing extra (unchanged behavior).

## 6. Guard conditions (every input)

| Input / state | Behavior |
|---|---|
| Legacy warning persisted before this change (stale range `sourceCell`) | Part D's shim (`stripLegacyUnknownFieldAnchors`) clears the range `sourceCell` at read time → not deduped (both rows show) and no stale A55 link; Part A still shows each label from `rawSnippet`. On next parse Part C anchors it precisely (single-cell). |
| `blockRef.name` absent / empty on a NEW warning | `resolveUnknownFieldCell` → `null` (missing label) → no link; row still shows with whatever `rawSnippet` label exists. Part D does **not** strip it (its `sourceCell` is single-cell or null, not a range). |
| (label, value) matches **zero** rows in scan | `null` → no link; row shows with its label (Part A). |
| (label, value) matches **≥2** rows (true duplicate row) | `null` (exactly-one guard) → no link; both rows show. |
| Same label, **different** value elsewhere in block | value filter excludes the impostor → the true row is the exactly-one match → correct cell. |
| Value normalization mismatch (multiline/whitespace) between `rawSnippet` and grid cell | `(label,value)` filter fails → `null` → labelled-but-linkless (safe degradation), never a wrong link. |
| `kind` present but no such block on the sheet | header not found → no anchors for that kind → `null`. |
| INFO sheet missing / `!ref` empty / gid missing | `extractUnknownFieldAnchors` → `[]` → all `UNKNOWN_FIELD` → `null`. |
| `extractUnknownFieldAnchors` throws | `safe()` wrapper → `[]`; other anchor families unaffected (`attachWarningAnchors.ts:39-50`). |
| `rawSnippet` absent / empty / no `" | "` | `labelFromRawSnippet` → `null` → no secondary line. |
| `rawSnippet = "key | value | more"` | label = `"key"` (split on **first** `" | "` only). |
| `driveFileId` null (PerShow only) | `buildSheetDeepLink` already returns `null` → href guarded; label line unaffected. |

## 7. Persistence (no migration)

`blockRef.name` rides the existing jsonb columns unchanged: `shows_internal.parse_warnings` (published; written raw by postgres.js in `upsertShowsInternal`, read via `Array.isArray(...) as ParseWarning[]` cast in `app/admin/show/[slug]/page.tsx:281-291` and `lib/admin/loadHeldShows.ts:144-145`) and `pending_syncs.parse_result.warnings` (staged; `asParseResult` in `lib/db/coerceJsonbObject.ts` validates only that `warnings` is an array, no per-field check). No zod, no coercer edit, no `tests/db/coerceJsonbObject.test.ts` change (it mirrors top-level `ParseResult` fields only). This matches the existing `sourceCell` precedent (`types.ts:16-19`).

**Legacy rows (persisted before this change)** carry `blockRef: { kind }` without `name` and a stale block-region `sourceCell`. No migration rewrites them; instead Part D's read-time shim neutralizes the stale anchor on every render, and any subsequent re-parse (cron sync on sheet change, or manual "Re-sync from Drive") rewrites them to precise per-row anchors via the normal `attachWarningAnchors` path (no new write path).

## 8. Class-sweep result

`UNKNOWN_FIELD` is emitted only by `venue.ts` and `event.ts` → only the **venue** and **details** blocks. The other region-fallback codes (`FIELD_UNREADABLE`, `COLUMN_HEADER_AUTOCORRECTED`, `SECTION_HEADER_AUTOCORRECTED`, `FIELD_LABEL_AUTOCORRECTED`, `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE`) keep their region anchor and intended cascade-collapse — explicitly **out of scope**. No evidence they produce the confusing multi-distinct-row collapse for a header-block region in a way that harms the operator; changing them risks un-collapsing intended cascades.

## 9. Testing strategy

- **`lib/drive/unknownFieldAnchors.ts` unit tests (new):** exactly-one match → anchor; duplicate label → `null`; kind-scoping (same label in venue + details resolves per-kind, no cross-block collision); no-match → `null`; missing INFO / gid → `[]`; throw → degrade (via `safe()` at the wiring test); anchor points at the **label cell** (assert the exact `a1`, e.g. `A56`, derived from a fixture grid, not hardcoded to the repro sheet).
- **`attachSourceCellAnchors` dispatch test:** an `UNKNOWN_FIELD` warning with `blockRef.name` resolves to the per-label single-cell anchor and **not** the region rect; removing it from the region branch is pinned (a `UNKNOWN_FIELD` with no matching `unknownField` source → `sourceCell` stays undefined, i.e. no region fallback).
- **`tests/parser/operatorActionableWarnings.test.ts`:** update expected counts — two distinct-label `UNKNOWN_FIELD` warnings with distinct label-cell anchors now both survive (no longer collapse); membership pin unchanged (`UNKNOWN_FIELD` still in `OPERATOR_ACTIONABLE_ANCHORED`).
- **Provenance regression (new; covers R2 [high]):** in `unknownFieldAnchors` tests, construct a scan where the true emitting row and a **same-label, different-value** row both appear → assert `(kind,label,value)` resolves to the **true** row's cell. Then a **same-label, same-value** duplicate → assert `null` (never a wrong cell). Then a label present only *outside* the over-inclusive bound with a same-label impostor inside → assert the value filter still yields the correct row or `null`, never the impostor. Derive expected `a1` from the fixture grid, not hardcoded.
- **Part D legacy-shim regression (new; covers R1 [high] + R2 [medium]):** construct two **persisted-legacy** `UNKNOWN_FIELD` warnings sharing the SAME block-region range `sourceCell.a1` (e.g. `"A55:B74"`); assert `stripLegacyUnknownFieldAnchors` clears their `sourceCell`, that `operatorActionableWarnings` then returns **2** (not collapsed), and that the render produces **no** deep link while still showing each label. Assert the shim is a **no-op** for (a) a new-format `UNKNOWN_FIELD` with a single-cell `a1` (`"A56"`) and (b) a new-format `UNKNOWN_FIELD` with **empty** `blockRef.name` and a single-cell/null anchor (proves the range-`a1` discriminator does not misfire on the falsy-name edge R2 flagged).
- **Persistence round-trip:** if a warning-shape test exists, assert `blockRef.name` survives; otherwise a focused test that `emitUnknownField` sets `blockRef.name`.
- **UI (both surfaces), anti-tautology:** assert the **label text** renders per entry and that the two Step-3 entries are **distinguishable** (different label lines). Derive expected labels from the fixture warnings' `rawSnippet`, not from hardcoded strings. When scanning rendered DOM for a label, scope extraction so an unrelated sibling can't satisfy the assertion.
- **Live-sheet fidelity:** re-parse the real "AII/III - Consultants Roundtable 2025" INFO tab (via gsheets MCP) and confirm the two unrecognized DETAILS rows each resolve to their own label cell and produce distinct working deep links.

## 10. Invariants in scope

- **Inv 1 (TDD per task):** failing test → minimal impl → green → commit, one task per commit.
- **Inv 5 (no raw codes in UI):** the surfaced label is sheet content, rendered like existing `w.message`; codes still route through `lib/messages/lookup.ts`.
- **Inv 8 (impeccable dual-gate):** `/impeccable critique` + `/impeccable audit` on the UI diff (`Step3SheetCard.tsx`, `PerShowActionableWarnings.tsx`) before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Inv 9 (Supabase call-boundary):** N/A to new code — `attachWarningAnchors` / `extractUnknownFieldAnchors` are pure raw-workbook reads, no Supabase client call, no advisory lock (invariant-2-safe). Keep it that way.
- **Inv 2 (advisory lock):** not touched.

## 11. Out of scope / non-goals

- Sibling region-anchored codes (§8).
- Any dedup-key change in `dataGaps.ts`.
- Any §12.4 / catalog / message-copy change.
- Any DB migration or schema-manifest change.
- Multiple details/venue blocks on one sheet: only the first header-block is scanned (edge → some rows unanchored → shown link-less with label; acceptable, safe).

## 12. Watchpoints — do NOT relitigate (user-ratified / intentional)

- **No-match → `null` (no link), NOT block-header fallback.** User-approved 2026-07-01. The old block-header link is negative value (it always pointed at A55). Trading it for "no link + label shown (Part A)" is the intended UX. The count still corrects because null-anchored warnings are not deduped.
- **No dedup-key change in `dataGaps.ts`.** Intentional. Widening the key with `rawSnippet` would un-collapse genuine same-cell cascades for the sibling region codes. Part C makes distinct rows distinct at the anchor layer, which is the correct level to fix it.
- **`blockRef.name` reuse, not a new `ParseWarning` field.** `name?: string` already exists (`types.ts:12`) and is already the semantic-key channel for crew-role resolution (`showDayTimeAnchors.ts:129`). No type/migration/coercer change is by design, not an omission.
- **Sibling region-anchored codes out of scope (§8).** `FIELD_UNREADABLE` / `*_AUTOCORRECTED` / `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` intentionally keep region anchoring. `UNKNOWN_FIELD` is the only reported defect and the only code with a clean per-row label key.
- **Parser↔extractor block-boundary divergence — provenance proven, not asserted (R2 [high]).** The wrong-cell risk is closed by TWO properties (§5.1.1): (1) the extractor bounds each block **over-inclusively** (superset of the parser's emitting rows — under-inclusion is the only failure mode, over-inclusion is harmless), and (2) resolution matches on **(kind, label, value)**, so a same-label impostor with a different value can never become the exactly-one match. Result: correct cell or `null`, never a wrong cell. Do not re-raise "exactly-one doesn't prove provenance" — value-matching is the provenance guard.
- **Legacy discriminator is the range-`a1` fingerprint, not `!blockRef.name` (R2 [medium]).** Part D strips a `UNKNOWN_FIELD` warning iff its persisted `sourceCell.a1` is a **range** (`":"`). Only the old `encode_range` region path produced that; Part C's `encode_cell` anchors are single cells and ambiguous rows are null — so the discriminator never misfires on a new warning, including the empty-`blockRef.name` edge. Do not revert to the falsy-name check.
- **Part D shim is a compatibility bridge, deliberately at the read boundary (not a migration).** Round-1 [high] correctly flagged that a code-only fix leaves already-persisted shows broken. Part D resolves this at read time (`stripLegacyUnknownFieldAnchors`) so the live repro is fixed on deploy with no migration, no forced re-sync, and no new write path. The legacy discriminator is the range-`a1` fingerprint defined in §5.3 (`UNKNOWN_FIELD` whose `sourceCell.a1` contains `":"`), NOT `!blockRef.name`. Do not "promote" this to a DB backfill migration — the validation project's `supabase db push` is blocked (Phase-0 divergence) and a jsonb rewrite migration is higher-risk than a self-healing read shim that a future re-parse supersedes.
- **Reviewer is REVIEWER ONLY.** Surface findings; do not propose or apply fixes — repairs happen in a separate implementer dispatch.
