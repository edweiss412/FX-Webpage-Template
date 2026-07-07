# Spec — `CREW_COLUMN_POSITIONAL_FALLBACK` warning

**Date:** 2026-07-07
**Slug:** `crew-column-positional-fallback`
**Origin:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` Flow 2 item 2.1 (revised) + its "2.1 investigation findings (2026-07-07)" block.
**Type:** parser signal + new §12.4 catalog code. No UI component, no DB, no advisory lock.

---

## 1. Problem

`detectColumns` (`lib/parser/blocks/crew.ts:78-110`) maps a crew table's columns by reading the header line. When it recognizes `NAME` / `ROLE` / `PHONE` / `EMAIL` (exact match, or fuzzy-corrected like `E-MAIL`→`EMAIL` via `gatedVocabCorrect`, `crew.ts:102-106`) it assigns that column. When it does **not** recognize a header token, the column silently keeps its **positional default** — `name = 1`, `role = 2`, `phone = 3` (`crew.ts:81-84`). A crew table with a missing header row, or headers the vocab+fuzzer don't recognize (synonyms like `CREW` / `POSITION` / `CELL`), therefore parses every row into positionally-guessed fields **with no warning of any kind**.

The values land verbatim but possibly in the **wrong field** (a role string stored as a name). This is the one genuinely-silent, uncovered instance of the P0-2 class ("confident wrong values render as authoritative"): the parser stores identity fields verbatim and already warns on every transform it *knows* it made (`STAGE_WORD_AUTOCORRECTED`, `COLUMN_HEADER_AUTOCORRECTED`, …), but positional column fallback emits nothing. Low-frequency (the fxav sheets are standardized-template copies, so column order is stable) but zero-signal when it does bite.

## 2. Scope

**In scope:** emit exactly one new `warn`-severity `ParseWarning` per crew block when `detectColumns` guessed the **name or role** column by positional default (i.e. that column's header token was not positively recognized). Classify it as a data-quality gap. Full §12.4 catalog-code lockstep.

**Out of scope (BACKLOG follow-ons, explicitly deferred):**
- `parseTechBlock` (`crew.ts:186`) — the v1 TECH shape merges name+role in col 0 and has its own column handling; not this item.
- Positional-fallback warnings in other blocks (transport passenger columns, pull-sheet, etc.).
- Any UI component change, provenance pane, raw snapshot, or auto-diff (all retired per the 2.1 findings).
- `phone` / `email` fallback as a trigger — see §4 guard table (email absent is benign; phone alone does not corrupt identity).

## 3. Non-negotiable invariants touched

- **Invariant 5 (no raw error codes in UI).** The new code is rendered only through `lib/messages/lookup.ts` / the catalog. Producer sets `code`; never a raw code in `message` on a user surface. The `message` string is diagnostic-only (mirrors neighbors, whose `.message` may BE the code — gated by `DATA_GAP_CODES` before any render, `dataGaps.ts:71` def / `:79` `isDataGap` gate).
- **§12.4 three-way lockstep** (cross-cutting discipline): master-spec prose + `gen:spec-codes` + `catalog.ts` land in the same commit; the `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts` + `tests/cross-cutting/extract-spec-codes.test.ts`, consuming generated `lib/messages/__generated__/spec-codes.ts`) compares runtime catalog ↔ §12.4-derived codes.
- **Data-gap completeness partition** (`tests/parser/dataGapsClassCompleteness.test.ts`): every persisted-ParseWarning code that appears as a literal in `lib/parser`/`lib/sync` and intersects `MESSAGE_CATALOG` must be in exactly one disjoint bucket. New code → added to `GAP_CLASSES` (the `DATA_GAP_CODES` partition).
- **No advisory lock, no DB, no Supabase call boundary** touched — invariants 2 / 9 / 10 N/A (declared, not silently skipped). No `admin_alerts` (this is a ParseWarning, audience "Doug → optional fix", like its neighbors).

## 4. Behavior — trigger truth table

`detectColumns` gains a returned `recognized` set recording which of `name`/`role`/`phone`/`email` were **positively** assigned (exact match OR fuzzy-correction). Positional-default columns are absent from the set. `parseCrewBlock` emits the warning **iff `name` or `role` is not in `recognized`**.

| Header line | name recog? | role recog? | Warn? | Rationale |
|---|---|---|---|---|
| `\| NAME \| ROLE \| PHONE \| EMAIL \|` | ✅ | ✅ | **No** | all recognized |
| `\| NAME \| ROLE \| PHONE \|` (no EMAIL) | ✅ | ✅ | **No** | email absent is benign (`email=-1`, already handled) |
| `\| E-MAIL \| NAME \| ROLE \| PHONE \|` (fuzzy email) | ✅ | ✅ | **No** | fuzzy-correction counts as recognized |
| `\| CREW \| POSITION \| CELL \| E-MAIL \|` | ❌ | ❌ | **Yes** | name+role guessed positionally; email fuzzy-recognized but identity cols are guesses |
| no header row / garbage first line | ❌ | ❌ | **Yes** | everything defaulted |
| `\| NAME \| POSITION \| PHONE \|` | ✅ | ❌ | **Yes** | role guessed positionally |

**Guard conditions (per global spec-review checklist):**
- Empty/blank header line → all tokens unrecognized → **Yes** (name+role guessed). Correct: this is precisely the missing-header case.
- Header with only `FLIGHT` recognized → name/role unrecognized → **Yes**.
- A block with zero data rows but an unrecognized header still emits the warning once (the mis-map risk is about column *identity*, independent of row count) — acceptable; the review panel shows it against an empty/near-empty crew section, which is itself worth Doug's glance.
- `recognized` is computed inside `detectColumns` from the same assignment logic; no second parse of the header (single source of truth — avoids drift between "what we assigned" and "what we report as recognized").

**One warning per crew block**, not per row (mirrors the `COLUMN_HEADER_AUTOCORRECTED` emission granularity, `crew.ts:127-132`). `blockRef = { kind: "crew" }` so it routes to the crew section + inherits the section's existing "In sheet ↗" deep link (`step3ReviewSections.tsx:547-599`). `rawSnippet` = the header line we could not read (operator sees what confused us). No `sourceCell` (region-level; not cell-anchored — deliberately NOT added to `OPERATOR_ACTIONABLE_ANCHORED`, whose membership drives the date-keyed `showDayTimeAnchors` population gate that has no key for a header row).

## 5. Copy (Doug-facing, invariant 5)

Modeled on `COLUMN_HEADER_AUTOCORRECTED` (`catalog.ts:1229-1241`) but stating a *guess*, not a *fix*:

- **dougFacing:** "We couldn't recognize the column headers on _<sheet-name>_'s crew table, so we read the columns by position (1st = name, 2nd = role, 3rd = phone). Check that each crew member's name and role landed in the right place, and add a header row (Name / Role / Phone / Email) if they didn't."
- **crewFacing:** `null`
- **followUp:** "Doug → verify crew columns"
- **helpfulContext:** "This crew table's header row was missing or used labels we don't recognize (e.g. 'Position' instead of 'Role'), so we couldn't confirm which column is which and read them by position — 1st column as name, 2nd as role, 3rd as phone. The rows still parsed, but they may be in the wrong fields. Check the crew section against the sheet; adding a standard header row (Name / Role / Phone / Email) removes the guesswork."
- **title:** "Guessed crew table columns by position"
- **longExplanation:** "A crew table's header row was missing or used unrecognized labels, so instead of dropping the rows we read the columns by position — 1st as name, 2nd as role, 3rd as phone. The rows parsed but may have landed in the wrong fields. Add a standard header row (Name / Role / Phone / Email) so the columns are read by label."
- **helpHref:** `/help/errors#CREW_COLUMN_POSITIONAL_FALLBACK`

Data-gap label (`GAP_CLASSES`, plain-language, invariant 5): **"guessed crew columns"**.

## 6. Surface map (code-lockstep completeness matrix)

Every cell gets an action or an explicit N/A. This is the tier×domain equivalent for a catalog-code change.

| # | Surface | Action |
|---|---|---|
| 1 | `lib/parser/blocks/crew.ts` `detectColumns` | Return `recognized: Set<"name"\|"role"\|"phone"\|"email">` alongside `{colMap, corrections}`. |
| 2 | `lib/parser/blocks/crew.ts` `parseCrewBlock` | After `detectColumns`, if `!recognized.has("name") \|\| !recognized.has("role")`, push `CREW_COLUMN_POSITIONAL_FALLBACK` warning (severity warn, blockRef crew, rawSnippet = headerLine) to `warnings` + `agg`. |
| 3 | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 table (~line 2892) | New row: `\| \`CREW_COLUMN_POSITIONAL_FALLBACK\` \| … \| dougFacing \| — \| Doug → verify crew columns \|`. |
| 4 | §12.4 helpfulContext appendix (~line 3191) | New line: `CREW_COLUMN_POSITIONAL_FALLBACK: "<helpfulContext>"`. |
| 5 | `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` | Regenerate + commit. Consumed by `tests/cross-cutting/codes.test.ts` (x1 parity). |
| 6 | `lib/messages/catalog.ts` | New `MESSAGE_CATALOG` entry (all fields per §5), placed next to `COLUMN_HEADER_AUTOCORRECTED`. |
| 7 | `pnpm gen:internal-code-enums` → `lib/messages/__generated__/internal-code-enums.ts` | Regenerate + commit. |
| 8 | `lib/parser/dataGaps.ts` `GAP_CLASSES` | Append `{ code: "CREW_COLUMN_POSITIONAL_FALLBACK", label: "guessed crew columns" }`. Auto-extends `DATA_GAP_CODES`, `GapCode`, labels, display order. |
| 9 | `app/help/errors/_families.ts` | Add `"CREW"` to the `crew-schedule` family `prefixes` (so `familyFor("CREW_COLUMN_POSITIONAL_FALLBACK")` → `crew-schedule`; `COLUMN`-prefixed neighbor already lands there). |
| 10 | `tests/parser/dataGapsClassCompleteness.test.ts` | Bump the gap-count (24→25) and universe-count (44→45) constants/comments; the new code enters via `DATA_GAP_CODES`. |
| 11 | `tests/parser/blocks/crew.test.ts` | New producer tests (see §7). |
| 12 | `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts:192`) | **N/A** — deliberately NOT added (no cell anchor for a header row; region link already present). |
| 13 | `admin_alerts` registry / `_metaAdminAlertCatalog` | **N/A** — ParseWarning, not an admin alert. |
| 14 | DB migration / schema-manifest / validation parity | **N/A** — no schema change (`parse_warnings` is existing jsonb). |
| 15 | `lib/messages/catalogDocsValidator.ts` + help/errors page/tests | Verify the new code passes existing catalog↔docs validation (help anchor derives from `helpHref`); no bespoke mdx edit expected — confirm in plan's pre-draft pass. |

## 7. Tests (anti-tautology)

Producer tests in `tests/parser/blocks/crew.test.ts`, each stating the failure mode it catches:

1. **Fires on unrecognized header** — crew block with header `| CREW | POSITION | CELL |` and ≥1 data row → warnings include exactly one `CREW_COLUMN_POSITIONAL_FALLBACK`. *Catches:* the silent-fallback bug regressing to no-warning. Assert on the emitted warning's `code` + that rows still parse (values present), NOT merely "a warning exists".
2. **Fires on missing header** — block whose first line is a data row (no header) → warning present. *Catches:* empty/absent header path.
3. **Silent on clean header** — header `| NAME | ROLE | PHONE | EMAIL |` → **no** `CREW_COLUMN_POSITIONAL_FALLBACK` (other warnings unaffected). *Catches:* false-positive firing on the common case (would spam every standard sheet).
4. **Silent on fuzzy-recognized header** — `| NAME | ROLE | PHONE | E-MAIL |` → no fallback warning (fuzzy email = recognized; name/role exact). *Catches:* treating fuzzy-correction as a fallback.
5. **Fires when only role guessed** — `| NAME | POSITION | PHONE |` → warning present. *Catches:* the `name OR role` trigger collapsing to `name AND role`.
6. **One per block** — a single crew block with an unrecognized header emits the code exactly once regardless of row count. *Catches:* per-row emission spam.
7. **Classification** — `dataGapsClassCompleteness` stays green with updated counts; the code is in `DATA_GAP_CODES`. *Catches:* an unclassified new code (the meta-test failing-by-default is the guard working).

Derive header/row fixtures inline from the real crew-block markdown shape (pipe-delimited rows, `crew.ts:79` split logic); do not hardcode expected column indices — assert field *contents* landed.

## 8. Resolved decisions

- **Name:** `CREW_COLUMN_POSITIONAL_FALLBACK` (per brief + audit). Requires adding `"CREW"` to the crew-schedule family prefixes (§6 #9) — one line, semantically correct, benefits future crew codes. Rejected alternative: renaming to a `COLUMN`-prefixed code to avoid the `_families` edit — worse, obscures that it's crew-specific.
- **Classification: data gap, not benign-warn.** The 5 autocorrect codes are `BENIGN_WARN_CODES` because the parser *fixed* the data and it landed correctly. Positional fallback did **not** fix anything — it guessed, and may be wrong. It belongs in the counted `GAP_CLASSES` so it contributes to the data-quality badge, matching its actual risk.
- **Trigger on name-or-role, not all-four.** Name and role are the identity/display fields that corrupt a crew page. Email absent is benign (`email=-1`); phone mis-map alone does not misrepresent identity. Keeping the trigger to name/role avoids firing on legitimately email-less tables.
- **No cell anchor.** Region-level deep link (existing section "In sheet ↗") is sufficient; adding to the anchored set would touch the date-keyed anchor-population gate for no benefit.

## 9. Numeric sweep (single-source values)

- Gap count `24 → 25`, persisted-warning universe `44 → 45` — both live in `tests/parser/dataGapsClassCompleteness.test.ts` comments/constants; update both in the same commit as the `GAP_CLASSES` append. No other file hardcodes these counts (verified via grep in plan pre-draft).
- Positional defaults cited as `name=1, role=2, phone=3` throughout — sourced from `crew.ts:81-83`; the copy in §5 must match these exact positions.
- **`dougFacing` byte-parity:** the `x1-catalog-parity` gate compares runtime `catalog.ts` `dougFacing` ↔ §12.4 table cell character-for-character. The §5 dougFacing string MUST be identical in the master-spec §12.4 row (surface #3) and `catalog.ts` (surface #6) — no prettier reflow of the master spec (it mangles §12.4 cells → x1 divergence).

## 10. Reviewer preempts (EXPLICITLY DO NOT RELITIGATE)

Contracts already decided with rationale — cite `file:line` if challenging, do not reopen without one:
- **`parseTechBlock` deferral** (§2). The v1 TECH shape is a distinct column model (name+role merged in col 0, `crew.ts:186-249`); instrumenting it is a separate BACKLOG item, not incompleteness of this spec.
- **Data-gap classification, not benign-warn** (§8). Deliberate — positional fallback guessed, did not fix. Do not argue it should sit with the 5 autocorrect `BENIGN_WARN_CODES`.
- **name-or-role trigger, not all-four** (§4/§8). Email-absent and phone-only-mismap are intentionally non-triggering.
- **No `sourceCell` / no `OPERATOR_ACTIONABLE_ANCHORED` membership** (§4/§6 #12). Region-level link suffices; the anchored set is a date-keyed population gate with no header-row key.
- **One-per-block, header-row `rawSnippet`** — mirrors `COLUMN_HEADER_AUTOCORRECTED` emission (`crew.ts:127-132`), not a new pattern.
- **Fires even on a zero-data-row block with an unrecognized header** (§4 guard). Intended: the mis-map risk is about column identity, independent of row count.
