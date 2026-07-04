# Spec — Data-quality badge: full warn-severity gap class

**Date:** 2026-07-04
**Slug:** data-quality-badge-full-warn-class
**Builds on:** PR #289 (`09aa942c`, `2026-07-04-data-quality-badge-shows-table.md`) — the shared `summarizeDataGaps` helper + `DataQualityBadge`.
**Status:** draft → self-review → Codex adversarial → APPROVE

---

## 1. Problem & intent

The admin data-quality badge (and the `summarizeDataGaps` helper it shares with the per-show Data-Quality panel, the Step-3 review card, the changes feed, and the `SHOW_FIRST_PUBLISHED` digest) counts **only 3 hardcoded parser codes**: `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`. The parser (and a few `lib/sync` producers) emit **19 more "data didn't land" codes** that never light the badge — bringing the counted set to **22** (§2.1). Empirically (validation DB, 2026-07-04): East Coast Family Office has 4× `UNKNOWN_FIELD` and RFI & PC Chicago has 1× `SCHEDULE_TIME_UNPARSED` — real gaps the operator can't see because the badge stays dark.

**Intent:** count the **genuine data-quality gap class** — every code that means "sheet data didn't land / couldn't be resolved" and reaches `shows_internal.parse_warnings` — single-sourced as a **curated allow-list** (`DATA_GAP_CODES.has(code)`), with plain-language labels (invariant 5 — never a raw code), and a drift-guard meta-test so a future warn code can't silently go uncounted.

> **CRITICAL taxonomy correction (live-code severity sweep, 2026-07-04).** The intuitive "count all `severity:"warn"`" rule is **WRONG** for this codebase. Five *autocorrect* codes (`STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`, `COLUMN_HEADER_AUTOCORRECTED`, `SECTION_HEADER_AUTOCORRECTED`, `FIELD_LABEL_AUTOCORRECTED`) and two sync-enrich notices (`AGENDA_SCHEDULE_TIME_ADJUSTED`, `AGENDA_SCHEDULE_LOW_CONFIDENCE`) are emitted at **`warn`** severity yet are semantically **benign** (parser fixed/adjusted; no data lost). Conversely `DAY_RESTRICTION_DOUBLE_LOCATION` is **`info`**. So the gap set is a **curated editorial allow-list**, and the "benign" set contains **warn-severity** codes — the filter is the allow-list, never the severity. (The existing `if (severity==="info") continue` guard is kept as defensive belt-and-suspenders but is NOT the discriminator.)

**Non-goals (explicitly excluded, pinned in the meta-test — §2.2/§2.3):**
- **Autocorrect/normalization notices** — the 5 warn-severity autocorrects above + `TYPO_NORMALIZED` (`info`) + `DAY_RESTRICTION_DOUBLE_LOCATION` (`info`). The parser already fixed these; no data lost.
- **Sync-enrich benign notices** — `AGENDA_SCHEDULE_TIME_ADJUSTED`, `AGENDA_SCHEDULE_LOW_CONFIDENCE` (best-effort adjustment / confidence note, data landed). NOTE: `AGENDA_LINK_NOT_CLICKABLE` is NOT here — it is a counted GAP (§2.1, Codex R1).
- **Non-sheet asset/diagram `warn`-severity producers** that persist onto `parse_warnings` (`lib/sync/phase2.ts`, `lib/sync/enrichWithDrivePins.ts`, `lib/sync/snapshotAssets.ts`) — reel + diagram + embedded-asset codes (full list in §2.3). Not *sheet* data quality; `dataGaps.ts:28-35` already documents `parse_warnings` is not code-limited.
- **Log-only codes** (`log.warn()`, never a persisted `ParseWarning`) — `HOTELS_PARSE_WARNING`, `AGENDA_LINK_UNRESOLVED`. They can never reach the badge; documented in the registry but not counted.
- No DB migration, no §12.4 catalog row edits, no advisory-lock surface, no new route. **No re-classification of any parser/sync severity** — we consume the existing severity contract as-is.
- Badge visual/interaction design is unchanged from #289 (glyph + hover breakdown). Only *what counts* and *the breakdown labels* change.

---

## 2. The gap class (SEVERITY-VERIFIED — live-code sweep 2026-07-04)

Every row below is verified at its emit `file:line`. **Counting is by allow-list membership, not severity** — the `sev` column is documentation + meta-test input. "Reaches PW" = emitted as a persisted `ParseWarning` (vs `log.warn`-only).

### 2.1 GAP codes (counted — 22) — `DATA_GAP_CODES`

| Code | Label (invariant 5) | sev | producer | emit `file:line` |
| --- | --- | --- | --- | --- |
| FIELD_UNREADABLE | unreadable field | warn | parser | warnings.ts:90 |
| UNKNOWN_SECTION_HEADER | unknown section | warn | parser | warnings.ts:110 |
| BLOCK_DISAPPEARED | removed section | warn | sync | blockDisappearance.ts:81 |
| UNKNOWN_FIELD | unrecognized field | warn | parser | warnings.ts:133 |
| SCHEDULE_TIME_UNPARSED | unreadable schedule time | warn | parser | scheduleTimes.ts (agendaWarnings.ts:55) |
| UNKNOWN_ROLE_TOKEN | unrecognized role | warn | parser | personalization.ts:353 |
| UNKNOWN_DAY_RESTRICTION | unrecognized day restriction | warn | parser | crew.ts:354 |
| SECTION_HEADER_NO_FIELDS | empty section | warn | parser | warnings.ts:46 |
| SCHEDULE_STRIKE_DATE_OFF_SCHEDULE | strike date off schedule | warn | parser | scheduleBookends.ts (agendaWarnings.ts:63) |
| TRAVEL_FLIGHT_UNPARSEABLE | unreadable flight | warn | parser | travelFlightWarnings.ts:18 |
| TRAVEL_FLIGHT_NAME_UNMATCHED | unmatched flight passenger | warn | parser | travelFlightWarnings.ts:8 |
| TRAVEL_FLIGHT_AMBIGUOUS_TABLE | ambiguous flight table | warn | parser | travelFlightWarnings.ts:28 |
| AGENDA_GRID_MALFORMED | malformed agenda grid | warn | parser | agenda.ts (agendaWarnings.ts:6) |
| AGENDA_BLOCK_UNRESOLVED | unresolved agenda block | warn | parser | agenda.ts (agendaWarnings.ts:14) |
| AGENDA_DAY_AMBIGUOUS | ambiguous agenda day | warn | parser | agenda.ts (agendaWarnings.ts:22) |
| AGENDA_DAY_TRUNCATED | truncated agenda day | warn | parser | agenda.ts (agendaWarnings.ts:30) |
| AGENDA_DAY_EMPTIED | empty agenda day | warn | sync (parser factory) | agendaWarnings.ts:39 ← applyParseResult.ts |
| AGENDA_PDF_UNREADABLE | unreadable agenda PDF | warn | sync | enrichAgenda.ts:217/254/327/417 |
| AGENDA_LINK_NOT_CLICKABLE | unreachable agenda link | warn | sync | enrichAgenda.ts:160/170 |
| PULL_SHEET_PARSE_PARTIAL | partial pull sheet | warn | parser | pull-sheet.ts:343 |
| PULL_SHEET_AMBIGUOUS_FORMAT | ambiguous pull sheet | warn | parser | pull-sheet.ts:252 |
| PULL_SHEET_UNKNOWN_VARIANT | unrecognized pull sheet | warn | parser | pull-sheet.ts:293 |

Net vs #289: **+19** codes. Editorial calls documented: `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` counts (operator-actionable data inconsistency — a strike date outside the schedule); `AGENDA_PDF_UNREADABLE`/`AGENDA_DAY_EMPTIED` count despite sync origin (genuine "agenda content missing"); `AGENDA_LINK_NOT_CLICKABLE` counts (Codex R1 HIGH — the live producer at `enrichAgenda.ts:160` labels it a "User-facing data-quality warning" meaning crew can't reach the agenda; a genuine access gap, NOT presentation degradation — distinct from its log-only forensic sibling `AGENDA_LINK_UNRESOLVED`).

### 2.2 BENIGN codes (NOT counted, pinned) — `BENIGN_WARN_CODES` (7) + `BENIGN_INFO_CODES` (2)

- **Warn-severity autocorrects (surprising — see §1 correction):** `STAGE_WORD_AUTOCORRECTED` (crew.ts:312), `ROLE_TOKEN_AUTOCORRECTED` (personalization.ts:345), `COLUMN_HEADER_AUTOCORRECTED` (crew.ts:126/transport.ts:578), `SECTION_HEADER_AUTOCORRECTED` (sectionHeaderNormalize.ts:87), `FIELD_LABEL_AUTOCORRECTED` (emitted from many blocks — venue.ts:155/event.ts:238/transport.ts:413/rooms.ts/client.ts/ops.ts; cites are representative, not exhaustive — the code is benign at every site).
- **Warn-severity sync-enrich notices:** `AGENDA_SCHEDULE_TIME_ADJUSTED` (enrichAgenda.ts:433 — best-effort time adjustment, data landed), `AGENDA_SCHEDULE_LOW_CONFIDENCE` (enrichAgenda.ts — parser's own confidence note, data landed). NOTE: `AGENDA_LINK_NOT_CLICKABLE` was reclassified to GAP (§2.1) per Codex R1 — it is NOT benign.
- **Info-severity:** `TYPO_NORMALIZED` (venue.ts:134), `DAY_RESTRICTION_DOUBLE_LOCATION` (personalization.ts:103 — contradicted my gap guess; it's `info`).

### 2.3 EXCLUDED — asset/diagram (non-sheet, persisted) — `ASSET_WARN_CODES` (11)

Persisted `warn` ParseWarnings, but **Drive-asset enrichment**, not *sheet-parse* data quality — the same scope line that excludes reel warnings. They have their own surfaces; counting them would conflate asset health with sheet data quality.

- **Diagram/embedded-asset (8):** `DIAGRAMS_TAB_MISSING`, `DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` (`lib/sync/enrichWithDrivePins.ts`), `LINKED_FOLDER_OVERFLOW_TRUNCATED` (`enrichWithDrivePins.ts:370`), `EMBEDDED_ASSET_DRIFTED` (`snapshotAssets.ts:151`), `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` (`applyStaged.ts:968` → `parseResult.warnings:1086`; Codex R3 HIGH).
- **Reel (3):** `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO` (`lib/sync/verifyReelOnApply.ts` → `phase2.ts:232`).

### 2.4 Log-only (never a persisted `ParseWarning`) → `NON_PARSE_WARNING_CODES_IN_SYNC` ignore-list

`HOTELS_PARSE_WARNING` (blocks/hotels.ts:35), `AGENDA_LINK_UNRESOLVED` (enrichAgenda.ts:150), and other `log.warn`/`log.info` calls in `enrichAgenda.ts` (`AGENDA_GETFILE_GONE`, `AGENDA_GETFILE_FAULT`, `AGENDA_PDF_DOWNLOADED`, `AGENDA_EXTRACTED`, `AGENDA_ENRICH_THREW`). These are `log.*` calls, NOT persisted `ParseWarning`s — they never reach `parse_warnings`, so they are NOT in the 42-partition (`ALL_PERSISTED_WARNING_CODES`) and `summarizeDataGaps` will never see them.

**BUT** — because §3.2's scan is now **mechanism-agnostic** (collects *every* code-shaped literal, catalog-filtered), these code-shaped literals that ARE catalog codes (e.g. `HOTELS_PARSE_WARNING`, `AGENDA_LINK_UNRESOLVED`) **do get collected** by the scan. They must therefore be placed in the explicit **`NON_PARSE_WARNING_CODES_IN_SYNC` ignore-list** (§3.2 layer 2), each with the reason "log-only, never persisted." This is exactly what the ignore-list is for; it keeps them out of the 42-partition while satisfying the scan's `⊆ (partition ∪ ignore-list)` assertion. (Codex R5 MEDIUM.)

### 2.5 Universe accounting (drift-guard invariant)

**42 distinct persisted `ParseWarning` codes** across `lib/parser` + `lib/sync` (verified sweep 2026-07-04, incl. Codex R3's `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`) = **22** GAP (§2.1) + **7** benign-warn (§2.2) + **2** benign-info (§2.2) + **11** asset/reel (§2.3). The §3.2 meta-test pins this partition: every persisted code is in exactly one bucket. (This literal count is a per-round drift check, but the AUTHORITATIVE gate is the registry's disjointness + the layer-2 scan's `⊆ registry` assertion — see §3.2; the raw number will move whenever the parser/sync adds a code, which is exactly what the guard should force a human to reconcile.)

---

## 3. Design

### 3.1 Single source of truth (`lib/parser/dataGaps.ts`)

Replace the three parallel 3-element structures (`DATA_GAP_CODES` set, `DataGapsSummary.classes` keys, `DATA_GAP_CLASS_LABELS`, the `dataGapClassDetails` order array) with **one ordered registry**:

```ts
// Ordered — drives set membership, the union type, labels, AND breakdown order.
const GAP_CLASSES = [
  { code: "FIELD_UNREADABLE", label: "unreadable field" },
  { code: "UNKNOWN_SECTION_HEADER", label: "unknown section" },
  { code: "BLOCK_DISAPPEARED", label: "removed section" },
  // …full §2.1 list, in display order…
] as const;

export type GapCode = (typeof GAP_CLASSES)[number]["code"];
export const DATA_GAP_CODES: ReadonlySet<string> = new Set(GAP_CLASSES.map((g) => g.code));
export const DATA_GAP_CLASS_LABELS: Record<GapCode, string> = Object.fromEntries(
  GAP_CLASSES.map((g) => [g.code, g.label]),
) as Record<GapCode, string>;
```

- **`DataGapsSummary.classes: Record<GapCode, number>`** — every gap key always present (init 0), built programmatically (`Object.fromEntries(GAP_CLASSES.map(g => [g.code, 0]))`), NOT a hand-written literal. Keeps the two shape-coupled consumers (§4) working by construction — `classes.FIELD_UNREADABLE` etc. still resolve.
- **`summarizeDataGaps`**: for each warning, `if (w.severity === "info") continue; if (DATA_GAP_CODES.has(w.code)) classes[w.code as GapCode] += 1;`. `total` = sum of `classes`. Unchanged semantics, generalized membership.
- **`dataGapClassDetails`**: iterate `GAP_CLASSES` in order, emit `{key, count, label}` for `count > 0`. Pluralization stays naive `${base}s` (labels chosen so `+s` reads correctly; see §7).
- **`isDataQualityWarning`**: unchanged body (`severity === "warn" && DATA_GAP_CODES.has(code)`) — auto-generalizes.

### 3.2 Meta-test drift guard (`tests/parser/dataGapsClassCompleteness.test.ts` — NEW)

Enforces: **every persisted `ParseWarning` code across `lib/parser` + `lib/sync` is classified** into exactly one of GAP (`DATA_GAP_CODES`), benign (`BENIGN_WARN_CODES` warn + `BENIGN_INFO_CODES` info), or asset/non-sheet (`ASSET_WARN_CODES`). Scope is the **whole `lib/parser` + `lib/sync` tree**, NOT a hand-listed file set — the sweep proved the naïve list drifts (`BLOCK_DISAPPEARED`, `AGENDA_DAY_EMPTIED`, `AGENDA_PDF_UNREADABLE` come from `lib/sync`; the diagram/reel family from `enrichWithDrivePins.ts`/`snapshotAssets.ts`/`verifyReelOnApply.ts` was missed in an earlier draft — Codex R2 HIGH). Two layers:

**Layer 1 — Registry ledger (DB-free, AUTHORITATIVE).** The maintained union `ALL_PERSISTED_WARNING_CODES = DATA_GAP_CODES ∪ BENIGN_WARN_CODES ∪ BENIGN_INFO_CODES ∪ ASSET_WARN_CODES` (the 42 of §2.5). Assert the four sets are pairwise disjoint and total exactly 42 with the documented per-bucket counts (22/7/2/11). Each set carries a one-line rationale comment. This is the editorial ledger — the human decision of record. It never drifts on its own; it moves only when a person edits it.

**Layer 2 — Structural drift detector (MECHANISM-AGNOSTIC, catalog-anchored).** Rounds 1-4 proved that tracing which literals *become* a persisted `code` is intractable — codes reach `ParseWarning.code` via inline literals, `code` parameters, secondary helpers (`drift(…, CODE)` → `reelWarning(reel.warningCode)`), un-pinnable factory names (`warning()` in `snapshotAssets.ts`), and file-local consts not in `warnings.ts` (Codex R2-R4). So the scan does NOT trace threading. Instead:
   1. AST/lexically collect **every code-shaped string literal** (`/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/`) appearing anywhere under `lib/parser/**` + `lib/sync/**` (excl. `*.test.ts`) — wherever it sits, however it's threaded.
   2. **Intersect with the canonical catalog** `MESSAGE_CATALOG` (`lib/messages/catalog.ts`, 228 codes, itself CI-completeness-gated by `x1-catalog-parity`). This drops non-code SCREAMING literals (enum values, config keys) and keeps only *real* codes — a code-shaped literal that is a catalog code IS a system code.
   3. Assert every surviving real code ∈ `ALL_PERSISTED_WARNING_CODES` (the 42-partition) **OR** `NON_PARSE_WARNING_CODES_IN_SYNC` — an explicit maintained ignore-list of real catalog codes that appear as literals in `lib/parser`/`lib/sync` but are NOT persisted `ParseWarning`s (log-only codes §2.4; sync-raised admin-alert / forensic codes). Each ignore entry carries a one-line reason.

   This is **complete against producer indirection by construction**: it collects the literal regardless of mechanism, so `drift()`, local consts, and unpinned factories can no longer hide a code. A new persisted parse-warning code → its literal is in the tree + in the catalog → collected → forces a classify-or-ignore decision. AST-preferred per `feedback_ast_guard_for_log_code_stamps`; the catalog∩ makes even a lexical pass robust to comments (`feedback_structural_metatest_comment_fragility`) because only catalog codes survive. **Plan bootstraps the ignore-list empirically:** run the collection, subtract the 42-partition, review the remainder, and seed `NON_PARSE_WARNING_CODES_IN_SYNC` with a reason per entry.

**Documented residual + fail-safe.** The one thing this cannot catch: a persisted code that is NEVER a literal anywhere in the tree (fully runtime-computed). The 2026-07-04 sweep confirms **no such code exists** (every persisted code appears as a literal ≥1×). If one were ever introduced, `summarizeDataGaps` **fails safe** — it gates on `DATA_GAP_CODES` membership, so an unknown code is simply *not counted* (badge under-reports; never over-reports, crashes, or leaks a raw code). **Layer 1 (the disjoint, human-maintained 42-partition) remains the authoritative gate of record; layer 2 is the drift alarm.** Per AGENTS.md structural-defense-calibration, THIS catalog-anchored, mechanism-agnostic design is the convergence for the "universe completeness" vector — any future "one more producer" is caught by the whole-tree∩catalog scan forcing a ledger/ignore-list edit, not by re-specifying the scan.

Why asset codes live in the union (not filtered by path): the drift guard's job is "a human decided each code's fate." A new diagram/reel code must still force a classification decision even though `summarizeDataGaps` will (correctly) never count it — the count logic filters on `DATA_GAP_CODES` membership, entirely independent of this completeness ledger.

### 3.3 Persistence & backward-compat

- **`shows_internal.parse_warnings`** (badge + staged page + per-show panel actionable list): stores the **raw `ParseWarning[]`**, re-summarized **fresh** on every read → the new scope applies immediately, no migration, no backfill. Old shows with a now-counted code light up on next dashboard load.
- **`admin_alerts.context.data_gaps`** (`SHOW_FIRST_PUBLISHED` per-show alert digest): a **point-in-time snapshot** written by `runScheduledCronSync.ts` (spreads the whole `summarizeDataGaps` result; gates on `.total`). New alerts carry the full-key `classes`; **old alerts carry the 3-key shape with an old-scope `total`**. These are historical snapshots — **NOT retroactively recounted** (correct: the digest records what was true at publish time). `readDataGapsDigest` (§4) reconstructs all keys with a `0` default, so old 3-key contexts render their 3 classes and the persisted total unchanged; new contexts render the full breakdown.

---

## 4. Consumer inventory (blast radius) & guard conditions

Verified 2026-07-04 against the worktree. `classes` generalization ripples only where a consumer reads a **specific class key** or reconstructs the **literal shape**.

| Consumer | Uses | Effect of generalization | Action |
| --- | --- | --- | --- |
| `lib/parser/dataGaps.ts` | source | — | **Change** (§3.1) |
| `components/admin/PerShowAlertSection.tsx` `readDataGapsDigest` + sub-line | reconstructs literal 3-key `classes` from persisted jsonb; renders `dataGapClassDetails` unbounded (line ~301) | would drop new classes from the alert sub-line AND render an unbounded breakdown | **Change** — reconstruct all `GAP_CLASSES` keys via `num(c[code])` (old 3-key contexts default missing keys to 0); render the breakdown through the shared §5 cap helper |
| `components/admin/DataQualityBadge.tsx` | joins ALL `dataGapClassDetails` entries into `aria-label`/`title` | **unbounded** aria-label at 22 possible classes | **Change** — build the accessible name via the shared §5 cap helper (≤4 classes + "+N more"). (Codex R1 MEDIUM: §4 previously said "none", contradicting §5.) |
| `lib/onboarding/rescanDecision.ts` | `.classes` via `Object.keys(newGaps).some(...)`, `priorGaps?.[cls] ?? 0` | **already generic** — regression check auto-covers every gap code | none (add a test asserting a newly-counted code triggers `gapRegressed`) |
| `lib/sync/runScheduledCronSync.ts` | spreads whole summary into `data_gaps`, gates `.total` | auto-persists full shape | none |
| `components/admin/ShowsTable.tsx` `DataGapsChip` (Held-row chip, `:241-254`) | joins ALL `dataGapClassDetails` into `title` | **unbounded** title at 22 possible classes | **Change** — build `title` via the shared §5 cap helper (Codex R2 MEDIUM; third cap surface alongside the badge + per-show sub-line) |
| `components/admin/ShowsTable.tsx`, `ArchivedShowRow.tsx` | render `DataQualityBadge` | auto | none |
| `components/admin/StagedReviewCard.tsx`, `wizard/Step3SheetCard.tsx` | `summarizeDataGaps` + `dataGapClassDetails` | auto | none |
| `components/admin/Dashboard.tsx` `readDataGaps` | re-summarizes fresh | auto | none |
| `app/admin/show/[slug]/page.tsx` | `code in DATA_GAP_CLASS_LABELS` generic lookup | auto — more codes now get a friendly label on the actionable list (consistent) | none |
| `app/admin/show/staged/[stagedId]/page.tsx` | `summarizeDataGaps().total`/details | auto | none |
| `lib/onboarding/rescanWizardSheet.ts`, `lib/admin/showDisplay.ts` | `DataGapsSummary` type only | auto | none |

**Guard conditions (helper inputs) — PRESERVE the #289 contract EXACTLY, do not change it:**
- `summarizeDataGaps(null | undefined | [])` → `{ total: 0, classes: { every GAP_CLASSES key → 0 } }`.
- A warning whose code ∉ `DATA_GAP_CODES` → not counted (this is the discriminator).
- A warning with `severity === "info"` → skipped by the existing `if (w.severity === "info") continue` guard, even if its code were in the set (defensive belt-and-suspenders).
- **A warning missing `severity` (or any value ≠ `"info"`) → COUNTED iff its code ∈ `DATA_GAP_CODES`.** This is the exact #289 behavior (`dataGaps.ts:63-68` gates only on `=== "info"`, never on `=== "warn"`). The spec does NOT change this; there is no "treat missing severity as non-warn" rule. (Codex R1 MEDIUM: an earlier draft contradicted itself here.)
- `dataGapClassDetails` on an all-zero summary → `[]`.

---

## 5. Cap / truncation behavior (badge & aria-label)

A single show can now surface up to 22 classes. The badge glyph is unchanged (one triangle). The breakdown copy is **single-sourced** in a new pure helper in `lib/parser/dataGaps.ts`:

```ts
// Bounded, human breakdown string for a summary. Ordering: count desc, then
// GAP_CLASSES registry order (stable tiebreak). Caps at `cap` classes; the
// remainder collapses to "+N more". Used by ALL THREE count-bearing surfaces
// (badge aria-label/title, per-show alert sub-line, held-row DataGapsChip title)
// so none is ever unbounded.
export function formatDataGapBreakdown(summary: DataGapsSummary, cap = 4): string
// e.g. → "2 unreadable fields, 1 unknown section"  (≤cap)
//      → "3 unreadable fields, 2 unknown sections, 1 removed section, 1 empty section, +2 more"  (>cap)
```

Three surfaces render the breakdown and ALL must route through this helper (no direct `dataGapClassDetails().map().join()`):
- **Badge** (`DataQualityBadge`): `aria-label`/`title` = `"${total} data gap(s): ${formatDataGapBreakdown(summary)}"` — bounded accessible name.
- **Per-show sub-line** (`PerShowAlertSection`, ~:301): same helper.
- **Held-row chip** (`ShowsTable` `DataGapsChip`, :244): `title` = `formatDataGapBreakdown(summary)`.
- Cap default **4**; count desc then registry order. Total-count phrasing unchanged.
- **Guard:** `cap ≤ 0` or a summary with `total === 0` → empty string (caller already gates on `total > 0`). Ties broken deterministically by registry order so the test is stable.

(Realistically ≤3–4 co-occur, but the cap is specified + tested so an adversarial fixture with all 22 classes can't produce an unbounded label.)

---

## 6. Testing (anti-tautology)

- **Data-source-anchored:** assert against `summarizeDataGaps(fixtureWarnings)` / the `warnings` fixture, never the rendered container.
- **Derive expectations from the registry**, not hardcoded counts — e.g. build a fixture with one warn warning per `GAP_CLASSES` entry and assert `total === GAP_CLASSES.length`; add one `info` autocorrect and one non-parser warn and assert neither increments.
- **Concrete failure modes each test catches:** (a) a gap code emitted at `info` wrongly counted; (b) a benign autocorrect wrongly counted; (c) `readDataGapsDigest` dropping a new class from a new-shape context; (d) `readDataGapsDigest` crashing/regressing on an old 3-key context; (e) `rescanDecision` failing to flag regression on a newly-counted code; (f) the drift-guard meta-test NOT failing when an unclassified parser warn code is introduced (mutate-a-fixture negative test); (g) an aria-label exceeding the §5 cap.
- **Invariant 5:** assert the badge `aria-label` and the per-show sub-line contain no raw `_`-delimited uppercase code token for any counted class.

---

## 7. Copy (labels) — invariant 5

Labels in §2.1 are plain-language, lowercase (they appear mid-sentence: `"4 unrecognized fields"`), and pluralize correctly under naive `+s`. Final wording is subject to `/impeccable` polish during implementation (UI surface). No raw code ever renders.

---

## 8. Out of scope / deferred

- Re-summarizing historical `admin_alerts.context.data_gaps` snapshots (they stay point-in-time).
- Operator-actionable "Open in Sheet" anchoring for the newly-counted codes (already governed by `OPERATOR_ACTIONABLE_ANCHORED`; unchanged).
- Any change to which codes are `warn` vs `info` in the parser (we consume the existing severity contract; we do not re-classify parser severities).

---

## 9. Watchpoints (disagreement-loop preempt for adversarial review)

Contracts a reviewer is likely to relitigate — pre-cited so the review can verify, not re-derive:

1. **"Just count all `severity:"warn"`" is WRONG and rejected.** Five autocorrect codes are warn-severity (§1 correction, §2.2 with emit lines). Counting by severity would surface autocorrects the user explicitly excluded. The discriminator is the curated `DATA_GAP_CODES` allow-list. Do not propose collapsing to a severity predicate.
2. **Sync-origin codes legitimately count.** `BLOCK_DISAPPEARED` (already counted pre-#289), `AGENDA_DAY_EMPTIED`, `AGENDA_PDF_UNREADABLE` are emitted from `lib/sync` yet are genuine sheet-data gaps that reach `parse_warnings`. The gap class is producer-agnostic; the meta-test scope (§3.2) spans the enumerated sync producers.
3. **jsdom structural test, not Playwright.** The badge is a content-height `flex items-center` child, not a fixed-dimension parent with stretch-dependent children — the AGENTS.md real-browser mandate is N/A, the exact determination ratified in #289 (`DEFERRED.md` DQ-1, `dataGapsChipRowLayout.test.tsx` header). No new layout surface is introduced. Do not demand a `getBoundingClientRect` assertion.
4. **Point-in-time snapshots are not retroactively recounted.** `admin_alerts.context.data_gaps` on OLD alerts keeps its 3-key/old-scope shape (§3.3). This is correct — the digest records publish-time truth. `readDataGapsDigest` back-fills missing keys to 0. Do not demand a backfill migration.
5. **Log-only codes (`HOTELS_PARSE_WARNING`, `AGENDA_LINK_UNRESOLVED`, etc.) are NOT ParseWarnings and NOT in the 42-partition — they belong in the `NON_PARSE_WARNING_CODES_IN_SYNC` ignore-list (§2.4/§3.2).** They are `log.*` calls, so `summarizeDataGaps` never counts them. But the mechanism-agnostic §3.2 scan collects their code-shaped literals, so they must be ignore-listed (reason: log-only). Do NOT add them to `ALL_PERSISTED_WARNING_CODES` — that would break the disjoint 42-code partition (Codex R3/R5 MEDIUM).
6. **Editorial borderline calls are deliberate, documented (§2.1/§2.2), and pinned by the meta-test:** `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` and `AGENDA_LINK_NOT_CLICKABLE` count (both operator-actionable data/access gaps); `AGENDA_SCHEDULE_TIME_ADJUSTED`/`_LOW_CONFIDENCE` do not (best-effort adjustment/confidence, data landed). These are judgment calls, not oversights — challenge on merit with a concrete "this misleads the operator" argument, not on "inconsistent with severity."
7. **No §12.4 / catalog / DB / advisory-lock surface.** The labels are UI copy in `DATA_GAP_CLASS_LABELS` (not §12.4 rows); this change ADDS no catalog rows (it only *reads* the existing catalog in the meta-test). No migration, no lock. Invariant-8 impeccable dual-gate DOES apply (UI copy + the badge surface).
8. **The meta-test scan-mechanism vector is STRUCTURALLY CONVERGED (§3.2), not per-instance.** Rounds 1-4 each found "one more producer / indirection" the scan missed; the §3.2 design was reworked to be **mechanism-agnostic** — collect ALL code-shaped literals in `lib/parser`+`lib/sync`, intersect with the catalog, assert ⊆ (42-partition ∪ ignore-list). It does not trace threading, so `drift()`/local-consts/unpinned-factories cannot hide a code. Do NOT file "you missed producer X" unless X introduces a persisted code that is **NEVER a literal anywhere in the tree** (the sole documented residual, with a fail-safe) — that is a different, real finding. Naming another literal the hand-list omits is the guard *working*: the scan collects it and forces classification; it is not a spec defect.
