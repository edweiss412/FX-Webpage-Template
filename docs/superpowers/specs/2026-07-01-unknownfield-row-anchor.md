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

- `export type UnknownFieldAnchor = { kind: string; label: string; anchor: SourceAnchor }`
- `export function normalizeLabelKey(s: string): string` — `clean(s)` (from `lib/parser/blocks/_helpers`), collapse whitespace, `toLowerCase()`. Applied identically to the grid cell text and to `blockRef.name` so the two sides compare for equality. Comment: `canonicalize-exempt: sheet label, not an email` (mirrors the convention in `crewRoleAnchors.ts:39-46`).
- `export function extractUnknownFieldAnchors(buffer: ArrayBuffer, titleToGid: Map<string, number>): UnknownFieldAnchor[]`
  - `XLSX.read(buffer, { type: "array", cellText: true, cellDates: false })`.
  - Select the INFO sheet exactly as `crewRoleAnchors.ts:137-139`: `SheetNames.find(n => n.toUpperCase() === "INFO" && !/\bOLD\b/i.test(n))`. Missing sheet / `!ref` / missing gid → return `[]`.
  - `buildAbsGrid(sheet)` (exported from `lib/drive/sourceAnchors.ts`).
  - For each `(kind, headerRegex)` in the fixed pair — `("venue", /^VENUE$/i)` and `("details", /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i)` (the exact `REGION_ANCHOR_SPEC` headers, `lib/sheet-links/buildSheetDeepLink.ts:107-123`): locate the **first** header row whose first non-blank cell matches, then scan `headerRow+1 .. maxRow`, stopping at the first blank row or a `BLOCK_TERMINATORS` full-cell match (mirror `headerBlock`, `sourceAnchors.ts:147-184`). For each scanned row, take the first non-blank cell as the label and its column as the anchor column; push `{ kind, label: normalizeLabelKey(labelText), anchor: { title, gid, a1: XLSX.utils.encode_cell({ r, c: labelCol }) } }`.
  - Degrade to `[]` (or fewer anchors) on any workbook edge — **never** a wrong anchor.
- `export function resolveUnknownFieldCell(anchors: UnknownFieldAnchor[], kind: string | undefined | null, label: string | undefined | null): SourceAnchor | null`
  - If `kind` or `label` is missing → `null`.
  - Filter to anchors whose `kind === kind` **and** `label === normalizeLabelKey(label)`. Return the anchor iff **exactly one** matches; zero or ≥2 → `null` (mirror `resolveCrewRoleCell:177-185`). Kind-scoping prevents a shared label (e.g. "Notes") in both the venue and details blocks from producing a cross-block collision.

**Emit change — `emitUnknownField` (`lib/parser/warnings.ts:120-135`):** set `blockRef: { kind: opts.kind, name: opts.key }`. `blockRef.name` already exists on `ParseWarning` (`lib/parser/types.ts:12`) — **no type change, no migration**. `rawSnippet` unchanged. No call-site change needed (both callers already pass `key`).

**Wiring — `lib/sync/attachWarningAnchors.ts`:** add a 4th `safe()`-wrapped family `unknownField: safe(() => extractUnknownFieldAnchors(bytes, gids), [])`. Extend `WarningAnchorSources` (`lib/drive/showDayTimeAnchors.ts:98-102`) with `unknownField: UnknownFieldAnchor[]`.

**Dispatch — `attachSourceCellAnchors` (`lib/drive/showDayTimeAnchors.ts:114-152`):** add a branch (placed with the other semantic-key resolvers, before the region-fallback branch):
```
} else if (w.code === "UNKNOWN_FIELD") {
  cell = resolveUnknownFieldCell(sources.unknownField, w.blockRef?.kind, w.blockRef?.name);
}
```
and **remove** `w.code === "UNKNOWN_FIELD" ||` from the region-fallback branch (`:136-148`) so a no/ambiguous match resolves to `null` (**not** the block region). `FIELD_UNREADABLE`, the `*_AUTOCORRECTED` family, and `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` **stay** in the region-fallback branch (out of scope).

### 5.2 Part B — under-count fix (falls out of Part C; no dedup change)

**No dedup-key change** in `operatorActionableWarnings`. (Part D adds a sibling helper to the same file, but the dedup key itself is untouched.) After Part C:
- **Unique label** → distinct label-cell `a1` per row → the dedup key differs → all rows survive.
- **Ambiguous / no match** → `sourceCell` is `null` → no `a1` → dedup skips it (`dataGaps.ts:162 if (a1)`) → all such rows survive.

Either way the admin count equals the Step-3 count for freshly-parsed shows; Part D extends the same outcome to already-persisted (legacy) shows. We deliberately **do not** widen the dedup key with `rawSnippet`, so genuine same-cell cascades for the sibling region-anchored codes still collapse as intended. The dedup's documented invariant "no actionable row is ever hidden" (`dataGaps.ts:147-150`) becomes **true** for `UNKNOWN_FIELD`.

### 5.3 Part D — legacy read-time compatibility shim (fixes already-persisted shows)

**Why:** Parts C/B only take effect when a show is (re-)parsed. The reported repro is an **already-published** show whose `shows_internal.parse_warnings` already stores two `UNKNOWN_FIELD` warnings carrying the **stale block-region anchor** (`sourceCell = { gid, a1: <A55 range> }`) and **no** `blockRef.name`. Because the admin page reads and dedups the persisted warnings as-is (`app/admin/show/[slug]/page.tsx:291,325`), the count would stay `1` and the A55 link would keep rendering until a re-parse rewrites the JSONB — which never happens for an unchanged sheet (`last_seen_modified_time` gating; no global cursor). A code-only fix therefore would **not** fix the live defect. This shim makes stale rows self-heal at read time, on deploy, with no migration and no forced re-sync.

**Shim:** `export function stripLegacyUnknownFieldAnchors(warnings: ParseWarning[]): ParseWarning[]` (co-located with `operatorActionableWarnings` in `lib/parser/dataGaps.ts`). For each warning where `w.code === "UNKNOWN_FIELD" && !w.blockRef?.name` (the unambiguous legacy signature — every **new** warning sets `blockRef.name` in Part C), return a shallow copy with `sourceCell` cleared (`sourceCell: null`). All other warnings pass through untouched (identity-preserving where possible).

**Apply at both persisted-warning read boundaries**, as early as possible so both the dedup and the link render see normalized warnings:
- Admin: immediately after `warnings = Array.isArray(...) ? ... : []` (`app/admin/show/[slug]/page.tsx:291`).
- Step-3: immediately after `const warnings = arr(pr.warnings)` (`components/admin/wizard/Step3SheetCard.tsx:1493`).

**Effect on a legacy row:** stale `sourceCell` cleared → `operatorActionableWarnings` sees no `a1` → not deduped → **both rows show** (count = 2, matching Step-3); the component's `w.sourceCell ? buildSheetDeepLink(...)` → `null` → **no A55 link**; Part A still renders each row's label from `rawSnippet`. **Forward-safe:** after any re-parse, warnings carry `blockRef.name`, the shim is a no-op, and Part C provides precise per-row links. This shim is a compatibility bridge, not a permanent substitute for the parse-time anchor.

### 5.4 Part A — label surfacing (UI; both surfaces)

In `components/admin/wizard/Step3SheetCard.tsx` `WarningsBreakdown` (~`:805-873`) and `components/admin/PerShowActionableWarnings.tsx`: when the warning is a cataloged code that carries a `rawSnippet`, render the row **label** as a muted secondary line beneath the title. The label is `rawSnippet` up to the **first** `" | "` (the value may itself contain `" | "`), trimmed. Shared extraction helper `labelFromRawSnippet(rawSnippet?: string | null): string | null` (co-located, e.g. in a small `lib/messages` or component-local util) that returns `null` for absent/blank input. Plain display text routed the same way the components already render `w.message` (through `renderEmphasis`); the label is **sheet content, not an error code**, so invariant 5 is satisfied. No catalog / §12.4 change.

Placement/copy: below the existing title `<span>` (Step3 `:841`; PerShow `:44`), a `text-text-muted` line reading the bare label (e.g. `GS Podium Type`). When `labelFromRawSnippet` is `null`, render nothing extra (unchanged behavior).

## 6. Guard conditions (every input)

| Input / state | Behavior |
|---|---|
| `blockRef.name` absent (legacy warning persisted before this change) | Part D's shim (`stripLegacyUnknownFieldAnchors`) clears the stale `sourceCell` at read time → not deduped (both rows show) and no stale A55 link; Part A still shows each label from `rawSnippet`. On next parse the warning gains `blockRef.name` and Part C anchors it precisely. |
| Label matches **zero** grid rows | `null` → no link; row shows with its label (Part A). |
| Label matches **≥2** grid rows (duplicate label in block) | `null` (exactly-one guard) → no link; both rows show with the same label. |
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
- **Part D legacy-shim regression (new):** construct two **persisted-legacy** `UNKNOWN_FIELD` warnings sharing the SAME block-region `sourceCell.a1` (the A55 range) and lacking `blockRef.name`; assert `stripLegacyUnknownFieldAnchors` clears their `sourceCell`, that `operatorActionableWarnings` then returns **2** (not collapsed), and that the render (or a component test) produces **no** deep link for them while still showing each label. This directly reproduces the live defect on stored data and proves the shim fixes it without a re-parse. Assert the shim is a **no-op** for a new-format `UNKNOWN_FIELD` warning that has `blockRef.name` + a valid single-cell anchor.
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
- **Parser↔extractor block-boundary divergence is safe by construction.** If the extractor's `headerBlock` bound differs from the parser's block bound for some row, resolution yields `null` (exactly-one-match guard) → link-less-but-labelled, never a wrong-cell link. This is the same safety posture as `resolveCrewRoleCell`.
- **Part D shim is a compatibility bridge, deliberately at the read boundary (not a migration).** Round-1 [high] correctly flagged that a code-only fix leaves already-persisted shows broken. Part D resolves this at read time (`stripLegacyUnknownFieldAnchors`) so the live repro is fixed on deploy with no migration, no forced re-sync, and no new write path. The legacy discriminator is `w.code === "UNKNOWN_FIELD" && !w.blockRef?.name` (absent **or** empty name — intentional: an empty-label warning can't be precisely anchored anyway, so treating it as unanchored is safe). Do not "promote" this to a DB backfill migration — the validation project's `supabase db push` is blocked (Phase-0 divergence) and a jsonb rewrite migration is higher-risk than a self-healing read shim that a future re-parse supersedes.
- **Reviewer is REVIEWER ONLY.** Surface findings; do not propose or apply fixes — repairs happen in a separate implementer dispatch.
