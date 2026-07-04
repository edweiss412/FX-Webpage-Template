# Spec — Data-quality badge: full warn-severity gap class

**Date:** 2026-07-04
**Slug:** data-quality-badge-full-warn-class
**Builds on:** PR #289 (`09aa942c`, `2026-07-04-data-quality-badge-shows-table.md`) — the shared `summarizeDataGaps` helper + `DataQualityBadge`.
**Status:** draft → self-review → Codex adversarial → APPROVE

---

## 1. Problem & intent

The admin data-quality badge (and the `summarizeDataGaps` helper it shares with the per-show Data-Quality panel, the Step-3 review card, the changes feed, and the `SHOW_FIRST_PUBLISHED` digest) counts **only 3 hardcoded parser codes**: `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`. The parser (and a few `lib/sync` producers) emit **18 more "data didn't land" codes** that never light the badge — bringing the counted set to **21** (§2.1). Empirically (validation DB, 2026-07-04): East Coast Family Office has 4× `UNKNOWN_FIELD` and RFI & PC Chicago has 1× `SCHEDULE_TIME_UNPARSED` — real gaps the operator can't see because the badge stays dark.

**Intent:** count the **genuine data-quality gap class** — every code that means "sheet data didn't land / couldn't be resolved" and reaches `shows_internal.parse_warnings` — single-sourced as a **curated allow-list** (`DATA_GAP_CODES.has(code)`), with plain-language labels (invariant 5 — never a raw code), and a drift-guard meta-test so a future warn code can't silently go uncounted.

> **CRITICAL taxonomy correction (live-code severity sweep, 2026-07-04).** The intuitive "count all `severity:"warn"`" rule is **WRONG** for this codebase. Five *autocorrect* codes (`STAGE_WORD_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`, `COLUMN_HEADER_AUTOCORRECTED`, `SECTION_HEADER_AUTOCORRECTED`, `FIELD_LABEL_AUTOCORRECTED`) and three sync-enrich notices (`AGENDA_SCHEDULE_TIME_ADJUSTED`, `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_LINK_NOT_CLICKABLE`) are emitted at **`warn`** severity yet are semantically **benign** (parser fixed/adjusted; no data lost). Conversely `DAY_RESTRICTION_DOUBLE_LOCATION` is **`info`**. So the gap set is a **curated editorial allow-list**, and the "benign" set contains **warn-severity** codes — the filter is the allow-list, never the severity. (The existing `if (severity==="info") continue` guard is kept as defensive belt-and-suspenders but is NOT the discriminator.)

**Non-goals (explicitly excluded, pinned benign in the meta-test — §2.2):**
- **Autocorrect/normalization notices** — the 5 warn-severity autocorrects above + `TYPO_NORMALIZED` (`info`) + `DAY_RESTRICTION_DOUBLE_LOCATION` (`info`). The parser already fixed these; no data lost.
- **Sync-enrich benign notices** — `AGENDA_SCHEDULE_TIME_ADJUSTED`, `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_LINK_NOT_CLICKABLE` (best-effort adjustments / presentation degradations, not lost data).
- **Non-sheet `warn`-severity producers** that persist onto `parse_warnings` — asset `reelWarning()` codes `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO` (`lib/sync/phase2.ts`). Not *sheet* data quality; `dataGaps.ts:28-35` already documents `parse_warnings` is not code-limited.
- **Log-only codes** (`log.warn()`, never a persisted `ParseWarning`) — `HOTELS_PARSE_WARNING`, `AGENDA_LINK_UNRESOLVED`. They can never reach the badge; documented in the registry but not counted.
- No DB migration, no §12.4 catalog row edits, no advisory-lock surface, no new route. **No re-classification of any parser/sync severity** — we consume the existing severity contract as-is.
- Badge visual/interaction design is unchanged from #289 (glyph + hover breakdown). Only *what counts* and *the breakdown labels* change.

---

## 2. The gap class (SEVERITY-VERIFIED — live-code sweep 2026-07-04)

Every row below is verified at its emit `file:line`. **Counting is by allow-list membership, not severity** — the `sev` column is documentation + meta-test input. "Reaches PW" = emitted as a persisted `ParseWarning` (vs `log.warn`-only).

### 2.1 GAP codes (counted — 21) — `DATA_GAP_CODES`

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
| PULL_SHEET_PARSE_PARTIAL | partial pull sheet | warn | parser | pull-sheet.ts:343 |
| PULL_SHEET_AMBIGUOUS_FORMAT | ambiguous pull sheet | warn | parser | pull-sheet.ts:252 |
| PULL_SHEET_UNKNOWN_VARIANT | unrecognized pull sheet | warn | parser | pull-sheet.ts:293 |

Net vs #289: **+18** codes. Editorial calls documented: `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` counts (operator-actionable data inconsistency — a strike date outside the schedule); `AGENDA_PDF_UNREADABLE`/`AGENDA_DAY_EMPTIED` count despite sync origin (genuine "agenda content missing").

### 2.2 BENIGN codes (NOT counted, pinned) — `BENIGN_WARN_CODES` + info

- **Warn-severity autocorrects (surprising — see §1 correction):** `STAGE_WORD_AUTOCORRECTED` (crew.ts:312), `ROLE_TOKEN_AUTOCORRECTED` (personalization.ts:345), `COLUMN_HEADER_AUTOCORRECTED` (crew.ts:126/transport.ts:578), `SECTION_HEADER_AUTOCORRECTED` (sectionHeaderNormalize.ts:87), `FIELD_LABEL_AUTOCORRECTED` (venue.ts:155/event.ts:238/transport.ts:413).
- **Warn-severity sync-enrich notices:** `AGENDA_SCHEDULE_TIME_ADJUSTED` (enrichAgenda.ts:433), `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_LINK_NOT_CLICKABLE` (enrichAgenda.ts).
- **Info-severity:** `TYPO_NORMALIZED` (venue.ts:134), `DAY_RESTRICTION_DOUBLE_LOCATION` (personalization.ts:103 — contradicted my gap guess; it's `info`).

### 2.3 EXCLUDED — asset (non-sheet) + log-only

- **Asset `reelWarning` (`lib/sync/phase2.ts:233`, warn, persisted):** `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`. Excluded by producer path — not sheet data quality.
- **Log-only (`log.warn`, never a persisted `ParseWarning`):** `HOTELS_PARSE_WARNING` (blocks/hotels.ts:35), `AGENDA_LINK_UNRESOLVED` (enrichAgenda.ts:150). Can never reach the badge. Registry-documented, not counted.

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

Enforces: **every `warn`-severity warning code that can reach `shows_internal.parse_warnings` is classified** as GAP (`DATA_GAP_CODES`), BENIGN (`BENIGN_WARN_CODES`), or an explicitly-listed exclusion (asset / log-only). The scope is **producer-set**, NOT "lib/parser only" — the sweep proved gap codes come from `lib/sync` too (`BLOCK_DISAPPEARED`, `AGENDA_DAY_EMPTIED`, `AGENDA_PDF_UNREADABLE`). Two layers:

1. **Registry completeness (DB-free):** a single maintained union `ALL_KNOWN_WARNING_CODES = DATA_GAP_CODES ∪ BENIGN_WARN_CODES ∪ INFO_CODES ∪ ASSET_WARN_CODES ∪ LOG_ONLY_CODES` — assert the five sets are pairwise disjoint and every code appears exactly once (no unclassified, no double-classified). This is the editorial ledger; each set has a one-line rationale comment.
2. **Structural scan (source-of-truth):** AST-walk the **enumerated producer files** — `lib/parser/**` plus the specific `lib/sync` warn-emitters (`blockDisappearance.ts`, `applyParseResult.ts`, `enrichAgenda.ts`, `phase2.ts`) — collect every `code` literal in a `ParseWarning`/`warn()`-shaped object, and assert each is in `ALL_KNOWN_WARNING_CODES`. A brand-new warn code nobody classified fails here. AST-based (parse the `code:` property) per `feedback_ast_guard_for_log_code_stamps` — NOT a lexical grep a comment could fool (`feedback_structural_metatest_comment_fragility`). `phase2.ts` reel codes are IN the union (as `ASSET_WARN_CODES`), so the scan passes while the count logic still excludes them.

Rationale for including asset/log-only codes in the union (not just filtering by path): the drift guard's real job is "a human decided each code's fate." A new reel code or a new log-only code should still force a classification decision, even though neither can/should reach the badge.

### 3.3 Persistence & backward-compat

- **`shows_internal.parse_warnings`** (badge + staged page + per-show panel actionable list): stores the **raw `ParseWarning[]`**, re-summarized **fresh** on every read → the new scope applies immediately, no migration, no backfill. Old shows with a now-counted code light up on next dashboard load.
- **`admin_alerts.context.data_gaps`** (`SHOW_FIRST_PUBLISHED` per-show alert digest): a **point-in-time snapshot** written by `runScheduledCronSync.ts` (spreads the whole `summarizeDataGaps` result; gates on `.total`). New alerts carry the full-key `classes`; **old alerts carry the 3-key shape with an old-scope `total`**. These are historical snapshots — **NOT retroactively recounted** (correct: the digest records what was true at publish time). `readDataGapsDigest` (§4) reconstructs all keys with a `0` default, so old 3-key contexts render their 3 classes and the persisted total unchanged; new contexts render the full breakdown.

---

## 4. Consumer inventory (blast radius) & guard conditions

Verified 2026-07-04 against the worktree. `classes` generalization ripples only where a consumer reads a **specific class key** or reconstructs the **literal shape**.

| Consumer | Uses | Effect of generalization | Action |
| --- | --- | --- | --- |
| `lib/parser/dataGaps.ts` | source | — | **Change** (§3.1) |
| `components/admin/PerShowAlertSection.tsx` `readDataGapsDigest` | reconstructs literal 3-key `classes` from persisted jsonb | would drop new classes from the per-show alert sub-line | **Change** — reconstruct all `GAP_CLASSES` keys via `num(c[code])`; old 3-key contexts default missing keys to 0 |
| `lib/onboarding/rescanDecision.ts` | `.classes` via `Object.keys(newGaps).some(...)`, `priorGaps?.[cls] ?? 0` | **already generic** — regression check auto-covers every gap code | none (add a test asserting a newly-counted code triggers `gapRegressed`) |
| `lib/sync/runScheduledCronSync.ts` | spreads whole summary into `data_gaps`, gates `.total` | auto-persists full shape | none |
| `components/admin/DataQualityBadge.tsx` | `dataGapClassDetails` + `.total` | auto-generalizes | none |
| `components/admin/ShowsTable.tsx`, `ArchivedShowRow.tsx` | render `DataQualityBadge` | auto | none |
| `components/admin/StagedReviewCard.tsx`, `wizard/Step3SheetCard.tsx` | `summarizeDataGaps` + `dataGapClassDetails` | auto | none |
| `components/admin/Dashboard.tsx` `readDataGaps` | re-summarizes fresh | auto | none |
| `app/admin/show/[slug]/page.tsx` | `code in DATA_GAP_CLASS_LABELS` generic lookup | auto — more codes now get a friendly label on the actionable list (consistent) | none |
| `app/admin/show/staged/[stagedId]/page.tsx` | `summarizeDataGaps().total`/details | auto | none |
| `lib/onboarding/rescanWizardSheet.ts`, `lib/admin/showDisplay.ts` | `DataGapsSummary` type only | auto | none |

**Guard conditions (helper inputs):** `summarizeDataGaps(null|undefined|[])` → `{total:0, classes:{all keys→0}}`; a warning with an unknown code or `severity:"info"` → not counted; a warning object missing `severity` → treated as non-`warn` → not counted (defensive: only `severity === "warn"` … actually count when NOT info; confirm the existing contract — #289 uses `if (severity==="info") continue`, so a missing severity counts. Preserve the existing contract exactly; changing it is out of scope). `dataGapClassDetails` on all-zero → `[]`.

---

## 5. Cap / truncation behavior (badge & aria-label)

A single show can now surface many classes. The badge glyph is unchanged (one triangle). The **hover title + `aria-label`** enumerate present classes via `dataGapClassDetails`. Cap: list up to **4** classes by count desc then registry order; if more, append `"+N more"`. Total count phrasing unchanged (`"7 data gaps: …"`). This keeps the accessible name bounded regardless of how many classes co-occur. (Realistically ≤3–4 co-occur, but the cap is specified so an adversarial fixture can't produce an unbounded label.)

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
5. **Log-only codes (`HOTELS_PARSE_WARNING`, `AGENDA_LINK_UNRESOLVED`) are excluded from counting but present in the meta-test union.** They can never reach `parse_warnings`; the union entry forces a classification decision, it is not a claim they render.
6. **Editorial borderline calls are deliberate, documented (§2.1/§2.2), and pinned by the meta-test:** `SCHEDULE_STRIKE_DATE_OFF_SCHEDULE` counts; `AGENDA_SCHEDULE_TIME_ADJUSTED`/`_LOW_CONFIDENCE`/`AGENDA_LINK_NOT_CLICKABLE` do not (best-effort/presentation, not lost data). These are judgment calls, not oversights — challenge on merit with a concrete "this misleads the operator" argument, not on "inconsistent with severity."
7. **No §12.4 / catalog / DB / advisory-lock surface.** The labels are UI copy in `DATA_GAP_CLASS_LABELS` (not §12.4 rows); nothing here touches the message catalog, a migration, or a lock. Invariant-8 impeccable dual-gate DOES apply (UI copy + the badge surface).
