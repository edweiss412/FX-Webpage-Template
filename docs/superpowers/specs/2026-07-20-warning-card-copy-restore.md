# Warning-card copy restore + trigger popover — design

**Date:** 2026-07-20
**Status:** draft
**Branch:** `feat/warning-card-copy-restore`
**Predecessor:** spec `2026-07-20-show-alert-compact.md` (#509). This spec amends ONE decision from it (G2) and leaves the rest of the compact-card system untouched.

---

## 1. Problem

The #509 compact-card redesign moved the warning card's inline guidance paragraph into the `?` popover (spec `2026-07-20-show-alert-compact.md` line 170: "the inline context line moves into the popover"). Shipped, the cards read as broken: a card shows only a generic catalog title ("Unrecognized row in sheet"), a blank band, and a footer. The user reported the alerts as "missing copy" and ratified in-session that G2 was a mistake:

- **Cards must carry concise helpful context inline** — visible at a glance, no interaction.
- **The `?` popover becomes a concise "what triggers this alert"** explanation.

A second, compounding defect: the `?` trigger renders as a real 44px box (`min-h-tap-min min-w-tap-min`, `components/admin/HoverHelp.tsx:197`) instead of the mock's 22px visual, inflating the message row and producing the blank band that reads as a failed render. The mock (`docs/superpowers/specs/2026-07-20-show-alert-compact-mock/guidance-placement.html`, G2 card at line 60) draws the trigger as `width:22px; height:22px` on the title line.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| G2 ("guidance behind `?` popover") is REVERSED for the guidance sentence; the popover survives but its content changes to trigger context. This spec supersedes `2026-07-20-show-alert-compact.md` §5 (PerShowActionableWarnings adapter) on popover content and message-row content only. All other #509 decisions (banded shell, controls band, no stripe on warning cards, bulk-ignore grouping) stand. | User, this session: "that was a mistake/misunderstanding. there needs to be concise helpful context in those cards, the popover is for a concise what triggers this alert" |
| Inline placement = mock G1 layout (guidance line in the message row, under the title). | User approved approach A, this session. |
| Inline copy = condensed `helpfulContext` (1–2 sentences), a copy sweep over the in-scope codes — not a new parallel field, not verbatim reuse. | User selected "Condense sweep", this session. |
| Popover copy = NEW catalog field `triggerContext`, authored for ALL in-scope codes in this sweep. No fallback-to-helpfulContext, no trigger-less cards for in-scope codes. | User selected "Author all in-scope codes", this session. |
| Copy principle: every authored sentence must be understandable at a glance by someone who knows ONLY that the sheet is input and the webpage is output. Banned vocabulary enforced mechanically (§4.1). | User, this session: "copy needs to be understandable at a glance by someone who does not know how the app/parser works, only that sheet is input, ui is output" |
| Boundary: ZERO `admin_alerts` codes, ZERO `dougFacing` edits, ZERO bell/AttentionBanner/HealthAlertsPanel changes. The concurrent `show-scoped-alert-copy` session owns admin-alert copy; its "spec B" (bulk admin-alert helpfulContext authoring) is NOT this spec. This spec's sweep touches only parse-warning codes (§3.1 list). | User, this session: "be sure we're not doubling up work in the active concurrent lead-alert claude session" |
| `triggerContext` is a catalog-internal field (like `severity` / `adminSurface` / `audience`, `lib/messages/catalog.ts:3-31`), NOT §12.4 prose. The x1 parity gate compares exactly four fields — `dougFacing`, `crewFacing`, `followUp`, `helpfulContext` (`tests/cross-cutting/codes.test.ts:78-90`) — and `title` / `longExplanation` / `helpHref` already live catalog-only. `triggerContext` follows that precedent; `scripts/extract-spec-codes.ts` is untouched. | This spec §5.1, design decision. |
| Condensed `helpfulContext` DOES require the §12.4 lockstep (master-spec prose edit + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`, same commit) because `helpfulContext` is parity-compared. | AGENTS.md "§12.4 catalog row edits require three lockstep updates"; `tests/cross-cutting/codes.test.ts:88-90`. |
| Autonomous ship approved end-to-end. | User: "yes" to the AGENTS.md autonomous-ship gate, this session. |

## 2. Current mechanism (verified against live code)

- Card adapter: `components/admin/PerShowActionableWarnings.tsx`. Title chain at line 71 (`entry?.title || humanMessage || "Data quality issue"`); popover content = `entry?.helpfulContext` at line 72, passed to `CompactAlertHelp` at line 131. No inline guidance renders anywhere on the card.
- Shell: `components/admin/CompactAlertCard.tsx` — four bands (message row line 100, detail band 115, footer 124, controls band 147). The `message` slot is a `ReactNode` (line 28); the adapter can compose a title + guidance stack without any shell change.
- Help affordance: `components/admin/compactAlertHelp.tsx` builds the popover body from `helpfulContext` (line 108: `buildHelpPopoverBody({ helpfulContext, helpHref, route })`) and passes a custom 22px trigger span (line 127-132) to `HoverHelp`.
- `HoverHelp` custom-trigger path wraps the span in a `<button>` with `min-h-tap-min min-w-tap-min` (`components/admin/HoverHelp.tsx:197`) — a REAL 44px layout box. The default (no `trigger` prop) path instead keeps a 20px visual and extends the hit area with a transparent `before:absolute before:-inset-3` overlay (`HoverHelp.tsx:204`) — 44px tap target with zero layout cost.
- Surfaces rendering the adapter: the published-show sections via `components/admin/showpage/sectionWarningExtras.tsx` (lines 101 and 146) and the staged-review card via `components/admin/wizard/step3ReviewSections.tsx`. Warnings are routed per section by `warningsBySection` (`lib/admin/step3SectionStatus.ts:84-98`), which admits EVERY `severity: "warn"` `ParseWarning` — not just the 20-code `OPERATOR_ACTIONABLE_ANCHORED` set (`lib/parser/dataGaps.ts:369-390`).
- Master-spec §12.4 carries `helpfulContext` as a quoted list entry per code (e.g. `AGENDA_PDF_UNREADABLE:` at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3238`); `pnpm gen:spec-codes` (`package.json:24`) regenerates `lib/messages/__generated__/spec-codes.ts`, and `tests/cross-cutting/codes.test.ts:68-92` deep-matches catalog ↔ generated rows.

## 3. Design

### 3.1 In-scope code registry (39 codes)

A new exported registry names every parse-warning code the cards can render, so copy completeness is enforceable.

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

New file `lib/messages/warningCardCopy.ts`:

```ts
export const WARNING_CARD_COPY_CODES: ReadonlySet<string> = new Set([...]) // the 39 below
```

Membership was hand-audited from every ParseWarning emission site in `lib/` (per-code emitter citations in §4.3). The drift tripwire (§3.5.4) does NOT attempt severity-aware regex matching — three review rounds established that no proximity/brace heuristic proves two fields share one object literal, so this spec drops that mechanism class entirely (three-round cap on design-correctness vectors). Instead the tripwire reuses the repo's existing, self-check-pinned discovery helper `codeProducerLiterals()` (`lib/messages/__internal__/codeProducers.ts`, already load-bearing for the §12.4 orphan-code gate at `tests/cross-cutting/codes.test.ts:125-129`): every code literal it discovers in files under `lib/parser/`, `lib/sync/`, or `lib/drive/` must be either in `WARNING_CARD_COPY_CODES` or in the meta-test's explicit exclusion table (each row: code + reason, e.g. "info-severity only", "log.warn telemetry, not a ParseWarning" — `PICKER_SELECTION_RESET_INFRA_FAILED` is out of scope by directory). This is deliberately severity-blind: a new code in those trees trips the test regardless of how its severity is spelled, and the author either registers copy or records a reviewed exclusion. Claim made precisely: the tripwire fails-by-default for any new string-literal-coded producer in the three scanned trees; non-literal codes and producers elsewhere remain the registry's responsibility, documented in the test header.

Parser emitters (27): AGENDA_BLOCK_UNRESOLVED, AGENDA_DAY_AMBIGUOUS, AGENDA_DAY_EMPTIED, AGENDA_DAY_TRUNCATED, AGENDA_GRID_MALFORMED, COLUMN_HEADER_AUTOCORRECTED, CREW_COLUMN_POSITIONAL_FALLBACK, DATE_ORDER_SUGGESTS_DMY, FIELD_LABEL_AUTOCORRECTED, FIELD_UNREADABLE, HOTEL_CARDINALITY_EXCEEDED, HOTEL_GUEST_SPLIT_AMBIGUOUS, PULL_SHEET_AMBIGUOUS_FORMAT, PULL_SHEET_PARSE_PARTIAL, PULL_SHEET_UNKNOWN_VARIANT, ROLE_TOKEN_AUTOCORRECTED, ROOM_HEADER_SPLIT_AMBIGUOUS, SCHEDULE_STRIKE_DATE_OFF_SCHEDULE, SCHEDULE_TIME_UNPARSED, SECTION_HEADER_AUTOCORRECTED, SECTION_HEADER_NO_FIELDS, STAGE_WORD_AUTOCORRECTED, UNKNOWN_DAY_RESTRICTION, UNKNOWN_FIELD, UNKNOWN_ROLE_TOKEN, UNKNOWN_SECTION_HEADER, UNKNOWN_STAGE_RESTRICTION.

Sync/enrichment emitters (12): AGENDA_LINK_NOT_CLICKABLE, AGENDA_PDF_UNREADABLE, AGENDA_SCHEDULE_LOW_CONFIDENCE, AGENDA_SCHEDULE_TIME_ADJUSTED, PULL_SHEET_ON_ARCHIVED_TAB, PULL_SHEET_OVERRIDE_CONTENT_CHANGED, TRAVEL_FLIGHT_AMBIGUOUS_TABLE, TRAVEL_FLIGHT_NAME_UNMATCHED, TRAVEL_FLIGHT_UNPARSEABLE, TRAVEL_TRANSPORT_NAME_UNMATCHED, VENUE_GEOCODE_UNRESOLVED, VENUE_TIMEZONE_UNRESOLVED.

All 39 verified present in `lib/messages/catalog.ts`. Three carry all-null copy today (FIELD_UNREADABLE, SECTION_HEADER_NO_FIELDS, UNKNOWN_SECTION_HEADER — registered as admin-log-only per `lib/parser/warnings.ts:30-33` and `lib/parser/warnings.ts:62-64`); this sweep gives them `title`, `helpfulContext`, and `triggerContext` so their cards stop rendering the raw parser `.message` fallback.

### 3.2 Catalog field

`MessageCatalogEntry` (`lib/messages/catalog.ts:1-40`) gains one optional catalog-internal field:

```ts
/**
 * Card-popover "what makes this appear" sentence (warning-card surfaces).
 * Catalog-internal like `severity`/`adminSurface`: NOT §12.4 prose; the x1
 * parity gate does not compare it. Authored for every WARNING_CARD_COPY_CODES
 * member (pinned by tests/messages/_metaWarningCardCopy.test.ts).
 */
triggerContext?: string | null;
```

### 3.3 Adapter change (`PerShowActionableWarnings.tsx`)

- **Inline guidance (mock G1).** The `message` slot becomes a stack: title line (unchanged chain, line 71) plus, when `entry?.helpfulContext` is non-empty after trim, a guidance line rendered via `renderEmphasis` in `text-xs/relaxed font-normal` with tone-appropriate color (`text-warning-text` on `warning` tone, `text-text-subtle` on `muted`). Empty/whitespace/absent `helpfulContext` ⇒ no guidance node at all (slot-presence rule, `CompactAlertCard.tsx:10-14`).
- **Popover content.** Line 72 changes from `entry?.helpfulContext` to `entry?.triggerContext`. `CompactAlertHelp`'s prop stays `helpfulContext: string | null | undefined` in TYPE but the adapter now feeds trigger copy; no trigger renders when the code has no `triggerContext` (existing `buildHelpPopoverBody` null path, `compactAlertHelp.tsx:74-80`). In-scope codes always have one (meta-test); out-of-catalog codes render no `?`, same as today.
- Title chain, detail band, footer, controls band, keys, dedup: untouched.

### 3.4 Trigger geometry (`HoverHelp.tsx` + `compactAlertHelp.tsx`)

`HoverHelp` gains an opt-in prop `compactTrigger?: boolean` (default false). When true, the custom-trigger button becomes `relative grid size-[22px] place-items-center` (the `grid place-items-center` pair is the named glyph-centering invariant, replacing the inner span's own grid box) plus a transparent `before:absolute before:-inset-[11px]` overlay — the same overlay pattern the default trigger already uses (`HoverHelp.tsx:204`), preserving the 44px tap-target floor (22 + 11 + 11 = 44) with zero layout inflation.

Caller inventory (exhaustive, grep-verified): `CompactAlertHelp` is consumed by exactly two adapters — `components/admin/PerShowActionableWarnings.tsx` (warning cards) and `components/admin/review/AttentionBanner.tsx` (admin-alert cards). BOTH are CompactAlertCard surfaces sharing the mock's G2 trigger geometry, so `CompactAlertHelp` passes `compactTrigger` unconditionally and both card families get the fix — a GEOMETRY-only change on AttentionBanner; its copy and content wiring are untouched (the §1.1 boundary is about admin-alert COPY, not shared chrome). The remaining custom-trigger `HoverHelp` callers — the Drive-health badge (`components/admin/settings/DriveConnectionPanel.tsx:210`) and the wizard scan summary (`components/admin/wizard/Step2Verify.tsx:639`) — do not pass the prop and keep the 44px box path; §7 adds a regression assertion for them.

Vertical placement contract: the shell's message row (`CompactAlertCard.tsx:100`) lays out `[glyph] [message stack] [helpTrigger]` as a flex row whose items start at the row top; the trigger button's 22px box top-aligns with the title's first line (both offset only by the row's `p-3`). Real-browser assertion (§7): the button's border box is 22×22 (±0.5px) AND the vertical distance between the button's top and the title line's top is ≤ 4px WITH the guidance line rendered (this fails if the button centers against the two-line stack).

### 3.5 Structural meta-test

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

New `tests/messages/_metaWarningCardCopy.test.ts`:

1. Every `WARNING_CARD_COPY_CODES` member has: non-empty `title`; non-empty `helpfulContext` with length ≤ 300; non-empty `triggerContext` with length ≤ 160.
2. Banned-vocabulary scan (§4.1 regex, plus the em-dash character) over `title` + `helpfulContext` + `triggerContext` of every member.
3. `OPERATOR_ACTIONABLE_ANCHORED ⊆ WARNING_CARD_COPY_CODES` (the anchored set can never outgrow the copy registry).
4. Drift tripwire (§3.1 design): `codeProducerLiterals()` filtered to `lib/parser/` + `lib/sync/` + `lib/drive/`; every discovered code ∈ `WARNING_CARD_COPY_CODES` ∪ exclusion table (code + reason rows). Self-checks pin discovery of four registry codes spanning the emission styles — `STAGE_WORD_AUTOCORRECTED`, `UNKNOWN_DAY_RESTRICTION` (the `as const` emission), `VENUE_GEOCODE_UNRESOLVED`, `AGENDA_PDF_UNREADABLE` (multiline `warn()` helper) — and one exclusion-table code, so both sides of the partition are exercised. The helper's own shape-discovery self-test (`tests/cross-cutting/codes.test.ts:131-135`) already guards its pattern rot. The test header documents the accepted blind spots from §3.1.

## 4. Copy

### 4.1 Copy principle (mechanically enforced)

Reader model: knows ONLY that the Google Sheet is the input and the crew webpage is the output. Every sentence answers "what's on/off my page" and "what do I change in my sheet". Voice: "we read / we couldn't read / we guessed / we kept / we left off". Trigger copy pattern: "Appears when [observable sheet condition]."

Banned vocabulary (case-insensitive, word-boundary, enforced by meta-test §3.5.2 on the three authored fields of in-scope codes): `parse`, `parser`, `parsed`, `parsing`, `token`, `extractor`, `positional`, `canonical`, `canonicalize`, `structured`, `ingest`, `ingestion`, `fallback`, `enum`, `RPC`, `payload`, `metadata`, `variant`, `null`, `parseable`, `unparseable`. The em-dash character (`—`) is also banned in these fields (project UI-copy rule, AGENTS.md pre-code mechanical UI gate). Sheet-world vocabulary stays legal: tab, cell, row, column, header, link, QTY, roster, sync.

### 4.2 Authored copy table (canonical — implementation copies verbatim)

Format per code: **inline** = condensed `helpfulContext` (replaces the current §12.4 + catalog value); **popover** = new `triggerContext`. Titles change only where noted.

| # | Code | Inline (`helpfulContext`) | Popover (`triggerContext`) |
|---|---|---|---|
| 1 | AGENDA_BLOCK_UNRESOLVED | One run-of-show day couldn't be matched to a calendar date, so that day shows the standard schedule. Check that day's date banner in the AGENDA tab; it's usually missing or showing an error like #REF!. | Appears when a day in the AGENDA tab has no readable date above it. |
| 2 | AGENDA_DAY_AMBIGUOUS | This run-of-show day names only a weekday that matches two show dates, so we didn't guess and it shows the standard schedule. Add the actual date to the AGENDA banner. | Appears when an AGENDA day banner gives only a weekday (like 'Wednesday') and the show has two of them. |
| 3 | AGENDA_DAY_EMPTIED | A run-of-show day you'd published before is now blank in the sheet, so it went back to the standard schedule. Put the rows back if that wasn't on purpose. | Appears when a previously published AGENDA day has been cleared out of the sheet. |
| 4 | AGENDA_DAY_TRUNCATED | This run-of-show day was too large, so crew see a trimmed list. It's almost always a stray cell; let us know if a real day genuinely needs more. | Appears when one AGENDA day holds far more entries, or far longer text, than a day normally does. |
| 5 | AGENDA_GRID_MALFORMED | We couldn't find the run-of-show grid in the AGENDA tab, so every day shows the standard schedule. Check the tab still has its header row and its usual name. | Appears when the AGENDA tab is missing, renamed, or missing its header row. |
| 6 | COLUMN_HEADER_AUTOCORRECTED | A crew-table column header looked misspelled, so we used the closest real one (like 'E-MAIL' as 'EMAIL'). Fix the header in the sheet if that guess is wrong. | Appears when a crew-table column header is a letter or two off a standard header. |
| 7 | CREW_COLUMN_POSITIONAL_FALLBACK | This crew table's headers were missing or unrecognized, so we read the columns by their position, and names and roles may have landed in the wrong fields. Check the crew section, and add a standard header row (Name / Role / Phone / Email). | Appears when a crew table has no header row we recognize. |
| 8 | DATE_ORDER_SUGGESTS_DMY | The show dates only make sense read day-first (10/3 as 3 October), but we read them month-first, so every date may be wrong. Rewrite the dates unambiguously, like 'June 24'. | Appears when the sheet's dates are only in order if read day-first. |
| 9 | FIELD_LABEL_AUTOCORRECTED | A row label looked misspelled, so we used the closest real one (like 'Venue Adress' as 'Venue Address'). Fix the label in the sheet if that guess is wrong. | Appears when a row label is a letter or two off a standard label. |
| 10 | FIELD_UNREADABLE — title: **"Phone or email we couldn't use"** | A crew phone or email in your sheet couldn't work as one (a phone with no digits, or an email without an @), so that link is left off the crew page. Fix the cell in the sheet. | Appears when a crew phone or email cell can't work as a real phone number or email address. |
| 11 | HOTEL_CARDINALITY_EXCEEDED | Your sheet lists more than four hotels; we kept the first four and dropped the rest. Remove old or duplicate hotel blocks so the four we keep are the right ones. | Appears when the sheet has more than four hotel blocks. |
| 12 | HOTEL_GUEST_SPLIT_AMBIGUOUS | A hotel guest cell looked like several people glued together, so we made a judgment call splitting them. Check the guest list in case two people were merged or one was split. | Appears when one guest cell seems to hold more than one name. |
| 13 | PULL_SHEET_AMBIGUOUS_FORMAT | This looks like a PULL SHEET, but its columns aren't laid out the way we expect, so crew see the original text instead of a clean packing list. Let us know if you'd like this layout supported. | Appears when a PULL SHEET tab's columns don't match any layout we know. |
| 14 | PULL_SHEET_PARSE_PARTIAL | Some pull-sheet rows have a QTY we couldn't read (a word, or a range like '1-2'), so those rows show their original text. The Report button on this card sends it to us if you'd like the format supported. | Appears when a pull-sheet QTY cell isn't a plain number. |
| 15 | PULL_SHEET_UNKNOWN_VARIANT | We could read this pull sheet's rows but not which column is which, so we used the standard column order. Check that quantities, item names, and categories landed right. | Appears when a pull-sheet's columns don't match any layout we know for certain. |
| 16 | ROLE_TOKEN_AUTOCORRECTED | A role looked misspelled, so we used the closest real one (like 'Content Cretion' as 'Content Creation'). Update the sheet if the spelling was intentional. | Appears when a role in a crew cell is a letter or two off a known role. |
| 17 | ROOM_HEADER_SPLIT_AMBIGUOUS | A room line could split into name and dimensions more than one way, so we picked the most likely reading. Check the rooms section; the name or dimensions might be slightly off. | Appears when a room line mixes its name and dimensions in an unusual order. |
| 18 | SCHEDULE_STRIKE_DATE_OFF_SCHEDULE | A room's Strike Time is dated on a day outside the show's schedule, so it won't appear on crew schedules. Fix that cell's date to a show day. | Appears when a Strike Time's date isn't one of the show's days. |
| 19 | SCHEDULE_TIME_UNPARSED | One show day's TIME cell wasn't readable as a start time, so that day shows the standard schedule. Give it a clear start like '7:15am - Registration'. | Appears when a TIME cell doesn't begin with a readable time. |
| 20 | SECTION_HEADER_AUTOCORRECTED | A section header looked misspelled, so we read it as the closest real one (like 'Transportaton' as 'Transportation'). Update the sheet if it was intentional. | Appears when a section header is a letter or two off a standard section name. |
| 21 | SECTION_HEADER_NO_FIELDS — title: **"Section with nothing under it"** | A section header in your sheet has no readable rows under it, so that section is missing from the crew page. Add the rows back, or delete the leftover header. | Appears when a section header has no usable rows beneath it. |
| 22 | STAGE_WORD_AUTOCORRECTED | A stage word in this crew member's role looked misspelled, so we used the closest real one (like 'Strke' as 'Strike'). Update the sheet if the spelling was intentional. | Appears when a work-phase word in a role cell is a letter or two off (Load In / Set / Show / Strike / Load Out). |
| 23 | UNKNOWN_DAY_RESTRICTION | This crew member is marked day-restricted ('***' in the sheet) but the sheet doesn't say which days, so their schedule shows 'days unconfirmed'. Add the days to the name cell, like '(6/24 and 6/26 ONLY)'. | Appears when a name carries the '***' marker but no days are listed. |
| 24 | UNKNOWN_FIELD | Your sheet has a row we didn't recognize; we kept it as-is and nothing on the crew page is affected. The Report button on this card flags it to us; Ignore hides this notice. | Appears when a row's label doesn't match anything we know how to show. |
| 25 | UNKNOWN_ROLE_TOKEN | One of this crew member's role labels isn't one we recognize, so we left it off their page instead of guessing. If the label is correct, this card's controls let you add it as a real role. | Appears when a role label in a crew cell isn't on the known-roles list. |
| 26 | UNKNOWN_SECTION_HEADER — title: **"Section we didn't recognize"** | A header in your sheet isn't a section we know, so the rows under it aren't shown on the crew page. Rename it to a standard section, or use the Report button on this card if it should be supported. | Appears when a header row doesn't match any section we know. |
| 27 | UNKNOWN_STAGE_RESTRICTION | This role cell mixes a known work-phase with something we couldn't read, so we show this crew member the whole show rather than hide a day. Use the standard phases: Load In / Set / Show / Strike / Load Out. | Appears when a role cell's phase restriction contains a word outside the standard phases. |
| 28 | AGENDA_LINK_NOT_CLICKABLE | The agenda cell holds text with nothing to open: a file name or a note instead of a working link. Replace it with a real web link or Drive file. | Appears when the agenda cell has no clickable link in it. |
| 29 | AGENDA_PDF_UNREADABLE | We couldn't read the linked agenda PDF, so crew see the agenda document but no day-by-day schedule. Check the link still opens; tell us if this keeps appearing. | Appears when the linked agenda PDF can't be opened or its pages can't be read. |
| 30 | AGENDA_SCHEDULE_LOW_CONFIDENCE | We read the agenda PDF but weren't sure enough about the session times to publish them, so crew see the document only. Nothing is broken; no action needed unless the agenda layout recently changed. | Appears when the agenda PDF's times are laid out too unusually to trust. |
| 31 | AGENDA_SCHEDULE_TIME_ADJUSTED | We corrected at least one agenda session time that looked like a typo, like a morning session marked PM. Open the agenda to confirm; if our correction is wrong, update the agenda document. | Appears when an agenda time only makes sense with its AM/PM flipped. |
| 32 | PULL_SHEET_ON_ARCHIVED_TAB | We found a PULL SHEET on a tab that looks like an older copy, so we left it out to avoid mixing old gear in. If it really is this show's gear, the Gear section on this page offers to include it. | Appears when a PULL SHEET is found on a tab that looks like an older copy of the sheet, not its main tab. |
| 33 | PULL_SHEET_OVERRIDE_CONTENT_CHANGED | A pull sheet you'd chosen to include has changed since you last looked at it, so we set it back to left-out rather than publish gear you haven't seen. Check the tab, then include it again from the Gear section on this page if it's still right. | Appears when the contents of an included archived-tab pull sheet change. |
| 34 | TRAVEL_FLIGHT_AMBIGUOUS_TABLE | The sheet has more than one TRAVEL flight table, so no flights were attached, since they could belong to different shows. Remove or rename the old table so only one remains. | Appears when the sheet holds two or more FLIGHT DETAILS tables. |
| 35 | TRAVEL_FLIGHT_NAME_UNMATCHED | A flight's crew name didn't match exactly one roster name, so the flight was skipped rather than mis-assigned. Fix the spelling so it matches the roster. | Appears when a FLIGHT DETAILS name matches zero or several crew names. |
| 36 | TRAVEL_FLIGHT_UNPARSEABLE — title: **"Flight we couldn't read"** (was "TRAVEL flight unparseable", which leaks reader jargon) | A flight row had no readable date, so it was skipped. Start each leg with an M/D date, like '3/22 AA123 JFK - LAX'. | Appears when a FLIGHT DETAILS cell has no date we can read. |
| 37 | TRAVEL_TRANSPORT_NAME_UNMATCHED | A transport assignee's name didn't clearly match one crew member, so that ride can't show on anyone's page. Fix the spelling, split merged names, or add the missing crew member. | Appears when a transport name matches zero or several crew names. |
| 38 | VENUE_GEOCODE_UNRESOLVED | We couldn't look up the venue's city from its address, so the page shows the raw address instead. Often temporary; if it keeps happening, check the address for typos. | Appears when the venue address doesn't resolve to a city. |
| 39 | VENUE_TIMEZONE_UNRESOLVED | We couldn't work out the venue's time zone, so times show in Eastern Time for now. It usually clears on the next sync; if not, check the venue address. | Appears when the venue's location doesn't resolve to a time zone. |

Existing `title` values stay for all codes except rows 10, 21, 26 (null today, newly authored) and row 36 (retitled away from jargon).

Semantic provenance: rows 1–39 condense the ALREADY-RATIFIED §12.4 `helpfulContext`/`dougFacing` prose for each code (authored and adversarially reviewed in the #472 alert-copy sweep and successor rounds) — no behavioral claim is invented here; each row's behavior claims trace to its ratified §12.4 row plus the emitter cited in §4.3. The three newly authored codes (rows 10, 21, 26) derive directly from their emitters' documented semantics (`lib/parser/warnings.ts:70-98` Class-A unusable phone/email; `lib/parser/warnings.ts:37-52` recognized-header-zero-fields; `lib/parser/warnings.ts:104-117` unrecognized-header-rows-dropped).

Control references, verified live (no plan-time conditionality): the Report button renders on EVERY card mode (`components/admin/DataQualityWarningControls.tsx:69-75`), covering rows 14, 24, 26; Ignore renders for ignorable (content-keyed) warnings (`DataQualityWarningControls.tsx:65`), and UNKNOWN_FIELD carries the `rawSnippet` that makes it ignorable (`lib/parser/warnings.ts:335`), covering row 24; the role-add control renders exactly for `UNKNOWN_ROLE_TOKEN` warnings carrying a `roleToken` (`components/admin/RoleRecognizeControlBoundary.tsx:51`, emission carries it at `lib/parser/personalization.ts:351`), covering row 25; the archived-tab include/re-include offers render in the show page's Gear section (PackListBreakdown) and the Step-3 Resolve box via `deriveArchivedOffers` (`components/admin/wizard/archivedTabOffer.tsx:10-23`), NOT on the warning card — rows 32–33 therefore point at the Gear section, not at card controls.

### 4.3 Per-code emitter citations

AGENDA_BLOCK_UNRESOLVED `lib/parser/blocks/agendaWarnings.ts:14` · AGENDA_DAY_AMBIGUOUS `lib/parser/blocks/agendaWarnings.ts:22` · AGENDA_DAY_EMPTIED `lib/parser/blocks/agendaWarnings.ts:39` · AGENDA_DAY_TRUNCATED `lib/parser/blocks/agendaWarnings.ts:30` · AGENDA_GRID_MALFORMED `lib/parser/blocks/agendaWarnings.ts:6` · COLUMN_HEADER_AUTOCORRECTED `lib/parser/blocks/transport.ts:596` (also `lib/parser/blocks/crew.ts`) · CREW_COLUMN_POSITIONAL_FALLBACK `lib/parser/ambiguityCodes.ts:20` · DATE_ORDER_SUGGESTS_DMY `lib/parser/warnings.ts:304` · FIELD_LABEL_AUTOCORRECTED `lib/parser/blocks/rooms.ts:870` (also client/event/ops/transport/venue blocks) · FIELD_UNREADABLE `lib/parser/warnings.ts:65` · HOTEL_CARDINALITY_EXCEEDED `lib/parser/warnings.ts:278` · HOTEL_GUEST_SPLIT_AMBIGUOUS `lib/parser/warnings.ts:211` · PULL_SHEET_AMBIGUOUS_FORMAT `lib/parser/pull-sheet.ts:252` · PULL_SHEET_PARSE_PARTIAL `lib/parser/pull-sheet.ts:343` · PULL_SHEET_UNKNOWN_VARIANT `lib/parser/pull-sheet.ts:293` · ROLE_TOKEN_AUTOCORRECTED `lib/parser/personalization.ts:340` · ROOM_HEADER_SPLIT_AMBIGUOUS `lib/parser/warnings.ts:140` · SCHEDULE_STRIKE_DATE_OFF_SCHEDULE `lib/parser/blocks/agendaWarnings.ts:63` · SCHEDULE_TIME_UNPARSED `lib/parser/blocks/agendaWarnings.ts:55` · SECTION_HEADER_AUTOCORRECTED `lib/parser/sectionHeaderNormalize.ts:128` · SECTION_HEADER_NO_FIELDS `lib/parser/warnings.ts:35` · STAGE_WORD_AUTOCORRECTED `lib/parser/blocks/crew.ts:345` · UNKNOWN_DAY_RESTRICTION `lib/parser/blocks/crew.ts:399` · UNKNOWN_FIELD `lib/parser/warnings.ts:332` · UNKNOWN_ROLE_TOKEN `lib/parser/personalization.ts:348` · UNKNOWN_SECTION_HEADER `lib/parser/warnings.ts:66` · UNKNOWN_STAGE_RESTRICTION `lib/parser/personalization.ts:152` · AGENDA_LINK_NOT_CLICKABLE `lib/sync/enrichAgenda.ts:170` · AGENDA_PDF_UNREADABLE `lib/sync/enrichAgenda.ts:217` · AGENDA_SCHEDULE_LOW_CONFIDENCE `lib/sync/enrichAgenda.ts:425` · AGENDA_SCHEDULE_TIME_ADJUSTED `lib/sync/enrichAgenda.ts:433` · PULL_SHEET_ON_ARCHIVED_TAB `lib/sync/pullSheetOverride.ts:123` · PULL_SHEET_OVERRIDE_CONTENT_CHANGED `lib/sync/runScheduledCronSync.ts:713` · TRAVEL_FLIGHT_AMBIGUOUS_TABLE `lib/parser/blocks/travelFlightWarnings.ts:28` · TRAVEL_FLIGHT_NAME_UNMATCHED `lib/parser/blocks/travelFlightWarnings.ts:8` · TRAVEL_FLIGHT_UNPARSEABLE `lib/parser/blocks/travelFlightWarnings.ts:18` · TRAVEL_TRANSPORT_NAME_UNMATCHED `lib/sync/enrichTransportAssignees.ts:85` · VENUE_GEOCODE_UNRESOLVED `lib/sync/enrichVenueGeocode.ts:138` · VENUE_TIMEZONE_UNRESOLVED `lib/sync/enrichVenueGeocode.ts:92`

## 5. Guard conditions

| Input | Empty/null/whitespace | Behavior |
| --- | --- | --- |
| `entry` (code not in catalog) | — | No guidance line, no popover trigger; title falls back to human `.message` then "Data quality issue" (unchanged, `PerShowActionableWarnings.tsx:70-71`). |
| `entry.helpfulContext` | null / "" / whitespace | Guidance node not rendered; message slot is title-only (today's rendering). |
| `entry.triggerContext` | null / "" / whitespace / field absent | `buildHelpPopoverBody` returns null → no `?` trigger (existing path, `compactAlertHelp.tsx:74-80`). |
| `tone="muted"` | — | Guidance line renders `text-text-subtle`; AA contrast on `surface-sunken` per the adapter's existing muted contract (`PerShowActionableWarnings.tsx:46-49`). |
| Emphasis markers in copy | — | Both fields render through `renderEmphasis`, which converts paired `**bold**`/`*em*`/word-boundary `_em_` markers to elements AND byte-preserves a literal `***` run (its content classes are `[^*]+`, documented for exactly the UNKNOWN_DAY_RESTRICTION marker at `components/messages/renderEmphasis.tsx:13-16`) — so row 23's '***' renders literally, as required. Backtick code spans are NOT supported by the renderer; the copy table therefore uses straight quotes, never backticks. Render sites pinned by `tests/messages/_metaEmphasisRenderContract.test.ts`. |

## 6. Dimensional invariants / transition inventory

- Dimensional invariants: no fixed-dimension parent is introduced or modified; the card is content-sized flex-column. No layout-dimensions task required. The compact trigger's invariants are named explicitly: glyph centering via `grid place-items-center` on the 22px button; title-line alignment per §3.4's vertical placement contract; 44px usable hit region via the `before:-inset-[11px]` overlay, asserted in a real browser with `document.elementFromPoint` probes at all four overlay corners (±21px from the button center) each resolving to the trigger button — which also catches ancestor clipping or overlap interception that a pure border-box measurement would miss.
- Transition inventory. The adapter now has four render variants from two independent conditions (guidance present?, trigger present?): A = title only, B = title+guidance, C = title+trigger, D = title+guidance+trigger. Variant changes only occur when the card's catalog entry changes across a server re-render/remount — within a mounted card the conditions are constant. All six pairs are **instant — no animation needed**: A↔B, A↔C, A↔D, B↔C, B↔D, C↔D (server-driven content swap; animating copy appearing would imply a live state change that does not exist). Compound: if the popover is OPEN when a re-render removes the trigger (D→B / C→A), the popover unmounts with its trigger instantly — acceptable, matches every existing catalog-driven content swap on these cards. The popover's own open/close fade (`transition-discrete` + `starting:opacity-0`, `HoverHelp.tsx` body classes) is untouched and orthogonal.

## 7. Test plan

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

- `tests/messages/_metaWarningCardCopy.test.ts` (NEW, §3.5): completeness, length caps (helpfulContext ≤ 300, triggerContext ≤ 160), banned vocabulary, anchored-set subset, fails-by-default producer scan with self-check.
- `tests/admin/perShowActionable*.test.tsx` + `tests/parser/parseWarningDeepLinkRender.test.tsx` (UPDATE): guidance line asserts textContent equals the catalog fixture's `helpfulContext` (derived from `MESSAGE_CATALOG`, never hardcoded — anti-tautology); popover body asserts `triggerContext`, scoped to the `<testId>-body` element so the inline guidance can't satisfy it. Guard matrix exhaustive per §5: unknown code (no `entry`) ⇒ no guidance node AND no trigger; `helpfulContext` null / `""` / whitespace-only ⇒ no guidance node (query `data-testid="per-show-actionable-guidance"`); `triggerContext` field-absent / null / `""` / whitespace-only ⇒ no trigger (all four spellings). Tone-class application: `tone="warning"` guidance node carries `text-warning-text`; `tone="muted"` carries `text-text-subtle` (class assertions bind the adapter to the contrast pairs pinned below).
- `x1-catalog-parity` (`pnpm test:audit:x1-catalog-parity`) green after the lockstep edit — this is the §12.4 drift gate, not a new test.
- Trigger geometry: real-browser assertions (existing step3/standalone Playwright harness family; jsdom insufficient): (a) trigger button border box 22×22 (±0.5px); (b) title-line alignment per §3.4 (button top within 4px of the title line's top, WITH guidance rendered); (c) `document.elementFromPoint` at all four overlay corners (±21px from button center) resolves to the trigger button (hit region + no clipping/interception).
- Unchanged-caller regression: the Drive-health badge (`DriveConnectionPanel.tsx:210`) and wizard scan-summary (`Step2Verify.tsx:639`) trigger buttons keep `min-h-tap-min min-w-tap-min` (assert class or ≥44px border box) — pins that `compactTrigger` did not leak.
- Changed-caller proof for AttentionBanner: the same real-browser harness renders one AttentionBanner card (admin-alert fixture with helpfulContext so the trigger exists) and asserts the 22×22 border box plus the four elementFromPoint corner probes — the guidance-line assertions cover only the PerShowActionableWarnings path, so this is the sole rendered proof for the second changed caller.
- Contrast: extend the existing token-pair contrast coverage (`tests/styles/` family, e.g. `status-token-contrast.test.ts` pattern) with two pairs for the new 12px guidance text at AA 4.5:1 in BOTH themes: `text-subtle` on `surface-sunken` (muted tone) and `warning-text` on `warning-bg` (warning tone). Current values pass (light #5a5b62/#f4f3f1 ≈ 6:1, dark #9c9a93/#0b0c10 ≈ 7:1, `app/globals.css:270-323`); the test pins them.
<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

- Meta-test registry declaration (writing-plans rule): this milestone CREATES `tests/messages/_metaWarningCardCopy.test.ts`; EXTENDS none. The emphasis-render contract test (`tests/messages/_metaEmphasisRenderContract.test.ts`) already walks render sites; the new guidance line renders through `renderEmphasis`, keeping it in-contract.

## 8. Mechanics / sequencing

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->

1. Copy commit (test-first): write `lib/messages/warningCardCopy.ts` (registry) and `tests/messages/_metaWarningCardCopy.test.ts` FIRST, run the meta-test against the untouched catalog and record its failure (missing `triggerContext` on all 39, three null titles, over-cap `helpfulContext` rows, banned-word hits); then, in the SAME commit, land the full copy lockstep — condensed `helpfulContext` × 39 into master spec §12.4 list + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` + `triggerContext` + the four title changes — turning the meta-test green. One commit so the suite (including the x1 parity gate) is never red at a commit boundary; the red run is executed and quoted in the task log before the copy lands (TDD invariant 1).
2. Adapter commit (test-first): failing adapter tests (guidance line, popover re-point, guard conditions) → implementation → green.
3. Geometry commit (test-first): failing real-browser trigger assertions → `compactTrigger` implementation → green, plus the unchanged-callers regression assertions (§7).
4. Impeccable critique + audit on the UI diff (invariant 8), then whole-diff Codex review.

Conflict note: the concurrent `show-scoped-alert-copy` branch edits `lib/messages/catalog.ts` (admin-alert rows) and possibly §12.4. Whichever merges second rebases; the row sets are disjoint (parse-warning codes vs admin-alert codes), so conflicts are mechanical.

## 9. Out of scope

- Any `admin_alerts` code, `dougFacing` copy, bell/HealthAlertsPanel surfaces, and ALL AttentionBanner copy/content wiring (concurrent session). Exception, geometry only: AttentionBanner's `?` trigger inherits the §3.4 compact geometry through the shared `CompactAlertHelp` leaf — no copy, prop, or content change on that surface.
- `longExplanation` and the help-pages copy it feeds (the helpHref error anchors) — unchanged this sweep.
- `HoverHelp` default-trigger callers and both non-card custom-trigger callers: the Drive-health badge (`DriveConnectionPanel.tsx:210`) and the wizard scan summary (`Step2Verify.tsx:639`).
- The wizard Step3 callouts and §E3 modal callouts (they render different components; only surfaces going through `PerShowActionableWarnings` change).
