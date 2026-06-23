# Parse Data-Quality Warnings — Design Spec

**Status:** Draft (autonomous-ship pipeline, Stage 1)
**Date:** 2026-06-23
**Slug:** `parse-data-quality-warnings`
**Author:** Opus / Claude Code (orchestrator)
**Branch:** `feat/parse-data-quality-warnings` (worktree off `origin/main` @ `2d300c8a`, post-#103)

---

## 1. Goal

When a fresh sheet's data **silently fails to parse**, make that loss **visible to the operator at the moment they decide whether to publish** — without blocking the publish. Today the parser drops data with zero signal and the show still goes live; an operator (Doug) never learns a phone, a whole section, or a hotel block didn't make it.

One sentence: **detect three classes of silent parse drop, and surface them as advisory, non-blocking warnings on the surfaces an operator actually sees before/at publish.**

## 2. Grounding incident (why this exists)

A live variance battery (2026-06-23) ran 10 Doug-plausible sheet mutations through the validation deployment's real cron→parse→publish pipeline. Structure was robust (renamed tabs, deleted tabs, inserted rows, mixed date formats, curly quotes all parsed clean). **Three mutations dropped data with zero operator signal and the show still published** (`parse_warnings = []`, `last_sync_status = ok`):

- **VB08** — a crew phone cell containing `"call John"` (non-numeric): the row parsed, the phone produced no `tel:` link, the garbage was swallowed. No warning.
- **VB09** — an unknown section `CATERING | NAME | PHONE` appended after `TRANSPORTATION`: the entire section vanished. No warning, not captured anywhere (confirmed: `rawUnrecognized.push` exists only at `lib/parser/blocks/venue.ts:280`, venue-field-scoped — there is no section-level capture).
- **VB10** — the hotel/lodging block cleared entirely: hotels disappeared from the page. No warning (the block header is absent → `emitEmptySection` cannot fire; the parser is stateless so it has no "there used to be hotels" awareness).

The matrix verdict: the danger is **silent drops, not crashes**, and the warning machinery that exists (`SECTION_HEADER_NO_FIELDS`) is structurally blind to all three.

## 3. Critical design context — the #103 publish-model pivot

The original analysis (against pre-#103 main) concluded "first-seen shows auto-publish; warnings render on ZERO surfaces." **PR #103 (merged into current main) changed this** and the spec is designed against the *current* model. There are now **two first-seen entry points** plus a recurring path:

| # | Path | Trigger | Disposition | Operator surface (where warnings must appear) |
|---|---|---|---|---|
| P1 | **Cron first-seen, flag ON** | new sheet in watched folder, `auto_publish_clean_first_seen = true` (migration default `true`, `20260601000000_b2_show_lifecycle.sql:6`) | auto-publishes (`phase1.ts:339-349` — clean + flag on → no sentinel → publish); emits `SHOW_FIRST_PUBLISHED` (tail carries `autoPublishFirstSeen`) | **post-publish only**: `SHOW_FIRST_PUBLISHED` alert digest (`PerShowAlertSection`) + per-show Data-Quality panel |
| P2 | **Cron first-seen, flag OFF** | same, flag off | injects `FIRST_SEEN_REVIEW` sentinel (`phase1.ts:347`) → staged in **`pending_syncs`** via `upsertLivePendingSync` (`phase1.ts:361-362`) | **pre-publish**: `/admin/show/staged/[stagedId]` → `StagedReviewCard` (`warningSummary`, currently hardcoded `""` at `app/admin/show/staged/[stagedId]/page.tsx:183`) |
| P3 | **Wizard onboarding step-3** | operator checkbox-approves a sheet to publish now | checked clean rows publish via finalize/CAS **from Step 3**; unchecked → held `shows` row (`published=false`) | **pre-publish (decision point)**: wizard Step 3 (`Step3SheetCard`/`Step3Review`, `components/admin/wizard/`); **secondary**: `/admin/unpublished` for held rows + per-show Data-Quality panel |
| P4 | **Recurring edit (existing show)** | sheet edited after publish | auto-applies; a vanished block already fires **MI-7** → `section_shrunk` feed row; **no `SHOW_FIRST_PUBLISHED`** | **post-apply**: per-show **Changes feed** (existing MI-7 `section_shrunk`) + Data-Quality panel (new `BLOCK_DISAPPEARED` parse-warning derived from MI-7) |

**Correction vs the older analysis AND the first draft of this spec (caught in spec adversarial R1):** there are **two distinct pre-publish review surfaces**, not one. `/admin/unpublished` (loader `loadHeldShows`, selects `shows` where `published=false`) shows **held `shows` rows** — the wizard step-3 path (P3). The **cron flag-OFF first-seen path (P2) does NOT land there**; it stages in `pending_syncs` and is reviewed at `/admin/show/staged/[stagedId]` via `StagedReviewCard`, which **hardcodes `warningSummary: ""`** today. And class C (recurring, P4) has **no `SHOW_FIRST_PUBLISHED` alert to augment** — its surface is the per-show **Changes feed**. The surfacing design (§6) covers all four paths.

`shows_internal.parse_warnings` **is written** at apply time (`lib/sync/applyStagedCore.ts` — the core writes children + `shows_internal`; `coreResult.parseWarnings` sources `sync_log.parse_warnings`), so held shows already carry their warnings in the DB; the loader just needs to read them.

## 4. Resolved decisions

1. **Posture: advisory + visible, never blocking.** Warnings never gate publish or divert auto-apply. (User decision 2026-06-23.) Rationale: preserves the auto-publish-clean win (`getAutoPublishCleanFirstSeen`) and Doug's drop-and-trust flow; blocking would reverse a recently-shipped behavior and add review burden for benign/intentional edits (a deleted hotel block is indistinguishable from an accidental one by data alone). **Do-not-relitigate** (see §12).
2. **Scope: all three detector classes** ship in v1 (field-unreadable, unknown-section, block-disappeared).
3. **Surfacing is per-path** (one surface per §3 path; discovered via the mandated pre-draft re-verification + corrected in spec adversarial R1 — full detail §6):
   - **P2 — cron flag-OFF first-seen** (stages in `pending_syncs`): the staged-review card at `/admin/show/staged/[stagedId]` (`StagedReviewCard.warningSummary`, today hardcoded `""`).
   - **P3 — wizard step-3** (the onboarding publish-decision point): **primary** = wizard Step 3 (`Step3SheetCard`/`Step3Review`) per-class data-gap detail before the publish checkbox/finalize; **secondary** = `/admin/unpublished` data-gaps chip (`loadHeldShows`) for held *unchecked* rows.
   - **P4 — recurring existing-show edit** (no `SHOW_FIRST_PUBLISHED` fires): the per-show **Changes feed** (`writeAutoApplyChanges` → `ChangesFeed`).
   - **P1 — cron flag-ON first-seen** (auto-publishes): a `data_gaps` digest sub-line on the existing `SHOW_FIRST_PUBLISHED` alert (`PerShowAlertSection`).
   - **All paths** also land in a per-show **Data-Quality panel** (reads `shows_internal.parse_warnings`).
   - **No new admin_alert code** (reuse `SHOW_FIRST_PUBLISHED` + the Changes feed). **But the three new ParseWarning `code:` literals DO require admin-log-only §12.4 + `gen:spec-codes` + `catalog.ts` rows** (codes.test.ts active-code parity, `SECTION_HEADER_NO_FIELDS` precedent — §5/§9). They render via `.message`, not `lookup.ts`.

## 5. Detection design

All three produce a `ParseWarning` (`lib/parser/types.ts:1-7`): `{ severity: "info" | "warn"; code: string; message: string; blockRef?: { kind; index? }; rawSnippet? }`. All new codes are emitted as **string literals** (x2 no-raw-codes coverage, mirroring `lib/parser/warnings.ts:46`).

**Catalog requirement (corrected in spec adversarial R1):** because the codes appear as `code: "..."` literals in `lib/`, the active-code parity guard `tests/cross-cutting/codes.test.ts` requires each to have a generated §12.4 `SPEC_CODES` row — exactly as the existing `SECTION_HEADER_NO_FIELDS` does (it carries an **admin-log-only** §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2901` AND a `catalog.ts:1242` entry). The three new codes therefore follow that precedent's 3-place lockstep: (a) §12.4 prose row (admin-log-only, `—`/`—` crew-facing columns since these never reach crew copy), (b) `pnpm gen:spec-codes` regen of `lib/messages/__generated__/spec-codes.ts`, (c) matching `lib/messages/catalog.ts` rows. The codes still **render via `.message`** at the operator surfaces (not through `lib/messages/lookup.ts` crew copy) — the catalog row exists only to satisfy producer-code parity, not because the warning text is sourced from it.

### 5.1 Class A — `FIELD_UNREADABLE` (VB08, stateless, parser)

**Where:** `lib/parser/blocks/crew.ts` — `buildCrewMember` (phone parsed at `crew.ts:127-128` via `clean()`; helpers `presence()` `_helpers.ts:65-68`, `digitsOnly()` `lib/format/phone.ts:15-17`).

**Predicate:** phone field where `presence(phoneRaw) !== null` (a non-empty value was provided) AND `digitsOnly(phoneRaw).length === 0` (but it has no digits → unusable, no `tel:` link). Emit:
```
emitFieldUnreadable(agg, { code: "FIELD_UNREADABLE", section: "crew", field: "phone", rawSnippet: phoneRaw, index })
→ ParseWarning{ severity:"warn", code:"FIELD_UNREADABLE",
    message:`Crew phone for row ${index+1} could not be read ("${rawSnippet}") — no call link will appear.`,
    blockRef:{kind:"crew", index}, rawSnippet }
```
**v1 scope: phone only.** A general field-validation framework (times/dates/conf#s) is explicitly out of scope (§11) to bound false-positive surface and catalog churn.

**Guard conditions:** empty phone (`presence === null`) → no warning (absence is normal, not a drop). Phone with ≥1 digit → no warning (parseable). Whitespace-only → `presence === null` → no warning.

### 5.2 Class B — `UNKNOWN_SECTION_HEADER` (VB09, stateless, parser)

**Where:** `lib/parser/index.ts` post-block-parse scan, before `return` (aggregator `agg` in scope; `raw_unrecognized` assembled at `index.ts:449`).

**Mechanism:** a single canonical **known-section-header registry** (new, `lib/parser/knownSections.ts`) consolidating the currently-scattered header matchers (`crew.ts:25 CREW_HEADER_RE`, `crew.ts:26 TECH_HEADER_RE`, hotels/rooms/transport/dates/event/contacts/venue headers, plus `GENERAL SESSION`/`BREAKOUT`/`ADDITIONAL ROOM`/`EVENT DETAILS`/`DATES`/`VENUE`/`IN HOUSE AV`/`AGENDA`). After block parsers run, scan the markdown rows — using the same primitive `index.ts` already uses (`md.split("\n")` line iteration + `CELL_SPLIT_RE` cell split, `index.ts:110,118,134,167`; there is **no** `parseTableRows` function) — for **section-header-shaped** rows whose col0 matches none of the registry. Emit `UNKNOWN_SECTION_HEADER` per unmatched header.

**Detection contract — registry-miss + header-band shape, NOT span position (corrected in spec adversarial R3 F2):** the grounding incident is `CATERING | NAME | PHONE` appended **immediately after `TRANSPORTATION` with no blank separator**. Transport's sub-parser slices a contiguous pipe-table (`markdown.slice(hm.index)`, breaking only on the first non-`|` line, `transport.ts:158-162`) and *slices over* but never *maps* the CATERING rows — so a "between-blocks position / not inside a recognized block's slice" heuristic would wrongly classify CATERING as inside the TRANSPORTATION span and skip it, **recreating the silent drop**. Therefore class B must NOT be gated by physical block slices/adjacency. Contract:
- A row is an **unknown section header** when: col0 is an ALL-CAPS token (`/^[A-Z][A-Z\s/&]+$/` after trim) that (a) is **not** in the `knownSections` registry, (b) is **not** a recognized sub-field label (a curated exclusion set — transport `Driver`/`Vehicle`/`Parking`/`License Plate`, venue sub-labels, contact labels, etc.; these are lower/mixed-case or known metadata rows, but the exclusion set makes it explicit), AND (c) has **header-band shape** — either ≥2 all-caps column labels (`CATERING | NAME | PHONE`) or a lone all-caps section token on an otherwise-empty row. Adjacency to a prior block is irrelevant; a row immediately after `TRANSPORTATION` with no blank line still fires.
- A bare all-caps free-text *value* cell (e.g. a caps NOTES value, a single all-caps word inside a value column) must NOT trip it — requirement (c) (header-band shape, not a value position) bounds this.
- Implementation tracks **claimed rows** (rows a block parser actually mapped into output) only as a secondary de-dup guard so a recognized header is never double-flagged; the PRIMARY gate is the registry+shape test, which is span-independent.

**Emission:**
```
ParseWarning{ severity:"warn", code:"UNKNOWN_SECTION_HEADER",
  message:`Unrecognized section "${headerText}" — its rows were not parsed.`,
  blockRef:{kind:"unknown_section"}, rawSnippet:headerText }
```

**Registry meta-test (§9):** a structural test asserts every known header matcher used by a block parser is represented in `knownSections.ts`, so adding a future block parser without registering its header fails CI (prevents the registry drifting into false-positive UNKNOWN warnings).

**Guard conditions:** a recognized header that parses zero fields → already covered by `SECTION_HEADER_NO_FIELDS`; class B must **not** double-fire on it (registry membership check precedes the unknown-header emit). A blank/`""` col0 → not a header → skip. A known header with a typo (e.g. `TRANSPORTATON`) → fires `UNKNOWN_SECTION_HEADER` (correct — it genuinely won't parse).

### 5.3 Class C — `BLOCK_DISAPPEARED` (VB10, **stateful**, sync layer)

**Reuses the existing MI-7 detection — does NOT add a parallel comparator (comprehensive re-analysis, spec adversarial R7).** Block disappearance is ALREADY detected by the existing **MI-7 "section shrinkage guard"** (`lib/parser/invariants.ts:243-315`), which fires for every stateful block going `prior>0 → next 0`: hotels/rooms/contacts (`pc>0 && nc<pc` AND `pc<=2 || nc<pc/2` — always true at `nc=0`) and transportation (`prior!=null && next==null`). MI-7 is a non-blocking `TriggeredReviewItem` (PF34: non-MI-11 items do NOT stage), auto-applies, and **already writes a `section_shrunk` Changes-feed row** via `writeAutoApplyChanges` (`hasInvariant(... MI-7 / MI-7b)`). So the recurring **feed** surface (P4) for a vanished block **already exists** — a parallel `BLOCK_DISAPPEARED` comparator + `section_emptied` change_kind + `dataGapItems` threading would (a) double-log the feed (R7 finding) and (b) reinvent MI-7's detection.

**What class C actually adds:** the ONLY gap MI-7 leaves is the **persistent per-show Data-Quality panel** (§6.5), which reads `shows_internal.parse_warnings` — MI-7 produces a triggered-item + feed row but **no `parse_warning`**. Class C therefore reduces to: **derive a `BLOCK_DISAPPEARED` `ParseWarning` from the MI-7 items whose `new_count === 0`**, and append it to `parseResult.warnings` so the disappearance also appears in the parse-warning-based surfaces (Data-Quality panel; and the staged-card/Step-3 surfaces if a disappearance ever co-occurs with a first review — though disappearance is inherently recurring). **No new comparator, no `detectBlockDisappearance`, no `section_emptied` change_kind, no `dataGapItems` arg, no `WriteAutoApplyChangesArgs` change, no Phase2 threading.** This eliminates the double-log entirely (the feed keeps its single MI-7 `section_shrunk` row).

**Where:** wherever MI-7 `triggeredItems` are in scope alongside the next `parseResult` and before persistence — i.e. `processOneFile_unlocked` (`runScheduledCronSync.ts`, which runs `runInvariants` at `:2555` and owns the apply). A small pure helper **`blockDisappearanceWarnings(triggeredItems, existingWarnings): ParseWarning[]`** (R8 — takes `existingWarnings` so the suppression below is mechanically possible) maps each MI-7 item with `new_count === 0` to a `BLOCK_DISAPPEARED` warning, **skipping any block already represented by a `SECTION_HEADER_NO_FIELDS` warning in `existingWarnings`**. **Name-normalization is required (R9):** the parser emits `emitEmptySection` `blockRef.kind` as `event_details`/`contacts`/`dates`/`transportation`/`hotels`/`rooms` (the call args at `event.ts:173`, `contacts.ts:145`, `dates.ts:78`, `transport.ts:123`, `hotels.ts:69`, `rooms.ts:63`), while MI-7 uses `section` = `hotel_reservations`/`rooms`/`contacts`/`transportation` (`invariants.ts:258-308`). Among MI-7-covered blocks the ONLY divergence is **`hotels` (parser) ↔ `hotel_reservations` (MI-7)**; rooms/contacts/transportation match directly. The helper applies a canonical map (`hotels → hotel_reservations`) before comparing. (`event_details`/`dates` empty-section warnings have no MI-7 counterpart, so no suppression interaction.) `processOneFile_unlocked` calls it as `blockDisappearanceWarnings(triggeredItems, parseResult.warnings)` and appends the result to `parseResult.warnings` before the apply that persists `shows_internal.parse_warnings`. First-seen (no prior → MI-7 cannot fire) → no items → no warnings (correct: an absent block on a brand-new show is not a detectable "disappearance").

**Emission:**
```
ParseWarning{ severity:"warn", code:"BLOCK_DISAPPEARED",
  message:`The ${blockLabel} section was present last time but is now empty — ${priorCount} entr${...} dropped.`,
  blockRef:{kind: mi7.section} }   // mi7.section ∈ hotel_reservations|rooms|contacts|transportation
```

**De-dup guarantee:** because class C emits only a `parse_warning` (never a feed row) and reuses MI-7's items, there is exactly ONE Changes-feed row per disappearance (MI-7's `section_shrunk`) and ONE parse-warning (for the panel) — no `section_shrunk` + `section_emptied` duplication. The `SECTION_HEADER_NO_FIELDS` case (header present, rows cleared) is a *parser* warning that CAN co-occur with MI-7 on a recurring edit (header kept, rows emptied, prior>0). The helper's `existingWarnings` parameter (above) makes the suppression real, and the `hotels → hotel_reservations` normalization (above) makes it correct for the highest-frequency clear (hotels): it skips emitting `BLOCK_DISAPPEARED` for any block whose normalized `kind` already has a `SECTION_HEADER_NO_FIELDS` warning, so the persisted `shows_internal.parse_warnings` carries exactly one warning for that block (the more specific `SECTION_HEADER_NO_FIELDS`).

**Guard conditions:** first-seen (`show == null` → `priorParseResult` null) → **cannot fire** (no prior). This is correct: VB10 is inherently a recurring-edit scenario. `prior` block empty AND `next` empty → no warning (nothing lost). `prior` non-empty AND `next` non-empty → no warning. Double-fire suppression vs `SECTION_HEADER_NO_FIELDS` is mandatory (a header kept with rows cleared yields the empty-section warning; class C suppresses to avoid two signals for one event).

## 6. Surfacing design (advisory, non-blocking)

Each of the four paths in §3 gets a surface. All warnings derive from the SAME `severity:"warn"` ParseWarning set; surfaces differ only by where the operator is at the decision point. A shared helper `summarizeDataGaps(warnings): { total, classes }` (counts the three new codes by class; excludes `info` severity) feeds every surface so the count logic is single-sourced (anti-tautology: tests assert against this helper's input, not the rendered output).

### 6.1 P2 — staged-review card (`pending_syncs` → `/admin/show/staged/[stagedId]`)

The cron-flag-OFF first-seen path stages in `pending_syncs` and is reviewed at `app/admin/show/staged/[stagedId]/page.tsx`, which builds a `StagedReviewCard` with `warningSummary: ""` (`:183`). `StagedReviewCard` **already renders** `warningSummary` when truthy (`components/admin/StagedReviewCard.tsx:531-533`). The staged row already carries warnings: `pending_syncs.parse_result` (jsonb `not null`, holds the full `ParseResult` incl. `.warnings`, `20260501001000_internal_and_admin.sql:144`) and `pending_syncs.warning_summary` (`text not null`, `:157`). Fix: the staged page loader populates `warningSummary` (and a structured `dataGaps` summary for a chip) from `parse_result.warnings` / `warning_summary` instead of the hardcoded `""`. Pre-publish, non-blocking.

### 6.2a P3 primary — wizard Step 3 (the publish-decision point) (R5 F1)

The onboarding publish decision is made in **wizard Step 3**, before `/admin/unpublished`: `Step3Review` lists sheets and the operator ticks which to publish now; `Step3SheetCard` renders checked/applied clean rows inline with only a generic `N warnings` chip. Checked clean rows then publish via finalize/CAS **directly from Step 3** — so surfacing only on `/admin/unpublished` (held/unchecked drafts) misses the actual checked-to-publish path. Fix: derive `summarizeDataGaps(parseResult.warnings)` in `Step3SheetCard`/`Step3Review` and render data-gap detail (per-class breakdown, not just a count) for **both staged and applied-clean rows** before the checkbox/finalize decision. Pre-publish, non-blocking (the operator can still tick-and-publish; they just see what dropped first).

### 6.2b P3 secondary — held-show list (`/admin/unpublished`)

`lib/admin/loadHeldShows.ts` — extend the `shows` select (`loadHeldShows.ts:100-105`) to also read `shows_internal.parse_warnings` (separate keyed read or PostgREST embed; jsonb default `'[]'`, `20260501001000_internal_and_admin.sql:4`) and derive the per-show `summarizeDataGaps` summary. Extend `HeldShow`/`LoadHeldShowsResult` types. `app/admin/unpublished/page.tsx` / `ShowsTable` — render a compact **data-gaps chip** per row when `total > 0` (`⚠ N data gaps`, per-class breakdown on expand), shown **before** `PublishShowButton`. **Read-grant check (plan verify):** `20260619000001_lockdown_shows_internal.sql` locked `shows_internal` DML incl. `parse_warnings` — confirm the loader's admin/service read retains `SELECT` (lockdown targets DML; the plan must prove the read works).

### 6.3 P4 — recurring edits: already covered by MI-7 in the Changes feed

**The recurring feed surface for a vanished block already exists — this feature adds NO new feed mechanism (comprehensive re-analysis, R7).** A recurring `prior>0 → next 0` collapse fires the existing **MI-7** section-shrinkage guard (`invariants.ts:243-315`), which auto-applies (non-blocking) and writes a `section_shrunk` row via `writeAutoApplyChanges` (`hasInvariant(... MI-7/MI-7b)`), rendered by `ChangesFeed` (`readShowChangeFeed`, per-show `app/admin/show/[slug]/page.tsx:51`). So the operator already sees a vanished hotel/room/contact/transport block in the show's Changes feed.

**No `writeAutoApplyChanges` change, no `section_emptied` kind, no `dataGapItems` threading** (all removed vs the first draft — they reinvented MI-7 and double-logged the feed, R7). The single addition for P4 is the **`BLOCK_DISAPPEARED` parse-warning** derived from MI-7 items with `new_count === 0` (§5.3), which makes the disappearance also appear in the persistent per-show **Data-Quality panel** (§6.5) — the one surface MI-7 doesn't reach (it writes a feed row + triggered item, never a `parse_warning`). Exactly one feed row (MI-7 `section_shrunk`) + one parse-warning (panel) per disappearance; no duplication.

### 6.4 P1 — auto-publish (flag ON): `SHOW_FIRST_PUBLISHED` digest

ONLY the flag-ON first-seen path (P1) emits `SHOW_FIRST_PUBLISHED` (the tail carries `autoPublishFirstSeen`; `emitSuccessfulPhase2Tail` in `lib/sync/applyStaged.ts:902,1313`; code constant `UNDO_ALERT_CODE = "SHOW_FIRST_PUBLISHED"`, `PerShowAlertSection.tsx:71`). For P1, add an optional `data_gaps` digest to that alert's `context` jsonb; `PerShowAlertSection` renders a **bespoke sub-line** when `context.data_gaps` is present — **not** interpolated into the catalog `dougFacing` copy (`PerShowAlertSection.tsx:46,73-88`). **No new admin_alert code, no §12.4 prose change for the alert**; the `_metaAdminAlertCatalog` write-site regex for `SHOW_FIRST_PUBLISHED` must still match after the additive context field (verify).

### 6.5 All paths — per-show Data-Quality panel

The per-show admin page (`app/admin/show/[slug]/page.tsx`) renders the full warn-severity warning list (each `.message`) from `shows_internal.parse_warnings` in a "Data quality" panel — the durable, always-available record covering every path post-apply (P1/P3/P4; P2 before it becomes a show). Zero warnings → panel absent.

## 7. Data model / persistence

- **No schema change.** `shows_internal.parse_warnings` already exists and is written by `applyStagedCore`. The three new ParseWarning codes flow through the existing `agg.warnings → ParsedSheet.warnings → ParseResult.warnings → shows_internal.parse_warnings + sync_log.parse_warnings` pipeline (Class C injected in the sync layer before persistence).
- The `SHOW_FIRST_PUBLISHED` alert `context` jsonb gains an optional `data_gaps: { total, classes }` field (additive; no migration — `admin_alerts.context` is jsonb).

## 8. Dimensional invariants / UI

**Complete new-rendered-element inventory (expanded R6 F2)** — every surface that gains a data-gaps element:
1. **P2** — `StagedReviewCard` data-gaps chip/detail (the populated `warningSummary` + structured detail) on `/admin/show/staged/[stagedId]`, near the existing card controls.
2. **P3 primary** — wizard Step 3 per-class data-gap detail in `Step3SheetCard` (within `Step3Review`), adjacent to the publish **checkbox**.
3. **P3 secondary** — data-gaps chip per held-show row in `ShowsTable` on `/admin/unpublished`, near `PublishShowButton`.
4. **P4** — NO new feed element (the vanished-block feed row is the existing MI-7 `section_shrunk`, already rendered by `ChangeFeedEntry`); P4's only new element is the `BLOCK_DISAPPEARED` entry in the Data-Quality panel (item 6).
5. **P1** — the `data_gaps` sub-line in `PerShowAlertSection`.
6. **All** — the "Data quality" list panel on the per-show page (`app/admin/show/[slug]/page.tsx`).

**Dimensional invariants:** none introduces a fixed-dimension parent with a non-obvious flex/grid child relationship; each new element is inline text/chip within an existing row/card that sets its own height. The two adjacency risks are (a) the Step-3 detail next to the publish **checkbox** and (b) the held-row chip next to `PublishShowButton` — both use explicit `items-center` (this project's Tailwind v4 does not default `.flex` to `align-items:stretch`). **Transition inventory:** every new element has two states (present / absent) reflecting static parse state — instant, no animation. P4 adds no new feed element (MI-7 `section_shrunk` uses the feed's existing entry-render path — no new transition).

**Layout-dimensions verification (plan task):** real-browser Playwright assertion per writing-plans rule for the two adjacency cases — the Step-3 card row (checkbox + data-gap detail) and the `/admin/unpublished` row (chip + `PublishShowButton`): assert vertical-center alignment and no overflow at the documented viewport.

This is a **UI surface** (`app/admin/unpublished/page.tsx`, `app/admin/show/[slug]/page.tsx`, `app/admin/show/staged/[stagedId]/page.tsx`, and `components/admin/{ShowsTable,StagedReviewCard,PerShowAlertSection,ChangesFeed,ChangeFeedEntry}.tsx`, `components/admin/wizard/{Step3SheetCard,Step3Review}.tsx`, + the new Data-Quality panel) → **invariant 8 applies**: `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`'d.

## 9. Catalog & meta-test inventory (mandatory pre-declaration)

| Item | Governance | Action |
|---|---|---|
| `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED` (ParseWarning codes) | `tests/cross-cutting/codes.test.ts` (active-code parity) + `extract-internal-code-enums` (x2) | emit as literals; **add admin-log-only §12.4 rows + `pnpm gen:spec-codes` + `catalog.ts` entries** (the `SECTION_HEADER_NO_FIELDS` precedent at `catalog.ts:1242` / spec `:2901`) — see §5 |
| `SHOW_FIRST_PUBLISHED` alert (P1 digest only) | `tests/messages/_metaAdminAlertCatalog.test.ts` (3-place lockstep) | **no new code**; `context` gains additive `data_gaps` jsonb; verify the write-site regex still matches after the upsert change |
| P4 recurring feed | **none — reuses existing MI-7 → `section_shrunk`** (`writeAutoApplyChanges`) | no change; `BLOCK_DISAPPEARED` parse-warning is derived from MI-7 items (`new_count===0`) for the Data-Quality panel only — no new change_kind, no `dataGapItems`, no writer change (R7 simplification) |
| Known-section-header registry (`lib/parser/knownSections.ts`) | **new structural meta-test** | assert every block parser's header matcher is represented; prevents class-B false positives from registry drift |
| `shows_internal.parse_warnings` read path | read-only; `20260619000001` lockdown | extend `loadHeldShows` + per-show page read; prove SELECT survives the lockdown |
| `pending_syncs` warning read (P2) | none (read existing column) | populate `StagedReviewCard.warningSummary` from the staged row's parse warnings (currently `""`) |

**No new admin_alert code is minted** (reuse `SHOW_FIRST_PUBLISHED` + the change feed). **No new RPC-gated table.** **No `pg_advisory*` change.** **No schema migration** (all columns exist; `data_gaps` is additive jsonb in `admin_alerts.context`).

## 10. Guard conditions summary (every new input)

- `loadHeldShows` data-gaps summary: `shows_internal.parse_warnings` null/absent → `{ total: 0 }` → no chip. Empty array → `{ total: 0 }`. Non-warn severities (`info`) → excluded from the count.
- `ShowsTable` chip: `summary.total === 0` → render nothing (not an empty chip). `summary` undefined (older row) → treat as 0.
- `PerShowAlertSection` digest: `context.data_gaps` absent → render the alert as today (no sub-line). `data_gaps.total === 0` → no sub-line.
- Per-show "Data quality" panel: zero warnings → panel absent (no empty shell).

## 11. Out of scope / deferred

- General field-validation framework (times/dates/conf# unreadability) — class A is **phone only** in v1.
- Blocking/divert-to-review posture — explicitly rejected (§4).
- Class C as a `TriggeredReviewItem` (MI-style, blocks auto-apply) — rejected in favor of advisory.
- A re-parse action from the surfaces — read-only visibility in v1.
- Distinguishing intentional vs accidental block removal (impossible from data alone) — surfaced advisory, operator judges.

## 12. Watchpoints / do-not-relitigate (for the adversarial reviewer)

- **Advisory-not-blocking is a ratified user decision** (2026-06-23), not an oversight. Pre-cited: blocking reverses `getAutoPublishCleanFirstSeen` (the auto-publish-clean win) and the held-model publish flow.
- **Four-path surface coverage (corrected R1/R5/R6)** — P2 (cron flag-OFF) → `StagedReviewCard` (`pending_syncs`); P3 (wizard) → **primary** wizard Step 3 (`Step3SheetCard`/`Step3Review`, the publish-decision point), **secondary** `/admin/unpublished` (held unchecked); P4 (recurring) → existing MI-7 `section_shrunk` Changes-feed row (NOT a new kind) + `BLOCK_DISAPPEARED` parse-warning in the Data-Quality panel; P1 (flag-ON) → `SHOW_FIRST_PUBLISHED` digest; all also land in the per-show Data-Quality panel. Do NOT collapse P3 back to `/admin/unpublished`-only (checked Step-3 rows publish before that page — R5/R6), do NOT collapse P2 into the held path (it stages in `pending_syncs`), and do NOT re-add a parallel `section_emptied` feed row (reuse MI-7 — R7).
- **No new admin_alert code is by design** — reuse `SHOW_FIRST_PUBLISHED` (P1) + the change feed (P4), per anti-dilution guidance.
- **Parser warning codes DO get admin-log-only §12.4 rows** (corrected R1) — required by `codes.test.ts` active-code parity, per the `SECTION_HEADER_NO_FIELDS` precedent; they still render via `.message`, not `lookup.ts`.
- **Flag default is `true`** (`20260601000000:6`) — the auto-publish bypass path is the default for cron-discovered sheets, so the secondary alert surface is load-bearing, not an edge.
- **Class C lives in `processOneFile_unlocked`, not the parser or Phase 1** (R4 F1 + R5 F2) — the parser is stateless; `Phase1Result` carries no parse data out; `priorParseResult` + `runInvariants` + `Phase2Args` coexist in the shared per-file chokepoint `processOneFile_unlocked` (`runScheduledCronSync.ts:2416/2555`, used by cron/push/manual existing-show sync). Do NOT relocate it to Phase 1 or to the first-seen/retry stagers.
- **Class C reuses MI-7, not a new comparator** (R7) — MI-7 already handles per-block cardinality (incl. `transportation: object→null`, `invariants.ts:306-314`); class C only maps MI-7 `new_count===0` items to a `BLOCK_DISAPPEARED` parse-warning for the panel. Do NOT add a parallel comparator, `section_emptied` kind, or `dataGapItems` threading.

## 13. Test plan (anti-tautology, derive-from-fixture)

Each test states the concrete failure mode it catches:

- **Class A** (`tests/parser/blocks/crew.test.ts` extension): fixture crew row phone `"call John"` → asserts a `FIELD_UNREADABLE` warning with `rawSnippet === "call John"` AND the member still parses (row not dropped). Negative: phone `"917-331-4885"` → no warning; empty phone → no warning. **Catches:** garbage phone swallowed silently (the VB08 regression).
- **Class B** (`tests/parser/` new): markdown with a `CATERING | NAME | PHONE` band after `TRANSPORTATION` → one `UNKNOWN_SECTION_HEADER` with `rawSnippet` containing `CATERING`. **Mandatory adjacency fixture (R3 F2):** a variant where `CATERING` immediately follows the last `TRANSPORTATION` row with **no blank separator** (the literal VB09 shape) → must STILL fire (proves detection is registry+shape-gated, not span/adjacency-gated; guards against transport's contiguous-table slice swallowing it). Negatives: all-caps free-text value cell → no warning; a recognized sub-label (`Driver`/`Vehicle`) → no warning; a known header (`TRANSPORTATION`) → no warning; a recognized-but-empty section → `SECTION_HEADER_NO_FIELDS` only (no double-fire). **Catches:** unknown section vanishing (VB09) incl. the no-separator adjacency + false-positive noise.
- **Class C helper** (`tests/sync/` unit on `blockDisappearanceWarnings(triggeredItems, existingWarnings)`): MI-7 items with `new_count===0` for **every** stateful section (`hotel_reservations`/`rooms`/`contacts`/`transportation`) → one `BLOCK_DISAPPEARED` parse-warning each, `blockRef.kind` = the MI-7 `section`. Negatives: MI-7 with `new_count>0` (partial shrink) → no `BLOCK_DISAPPEARED` (the feed's `section_shrunk` already covers partial); no MI-7 items (first-seen) → empty; **`existingWarnings` already contains `SECTION_HEADER_NO_FIELDS` for that block → that block is skipped (R8/R9). Use the REAL parser-emitted `blockRef.kind` (R9): a hotel clear emits `SECTION_HEADER_NO_FIELDS` with `blockRef.kind = "hotels"` while MI-7 `section = "hotel_reservations"` — assert the helper's `hotels → hotel_reservations` normalization suppresses the duplicate so the returned array + persisted `shows_internal.parse_warnings` hold exactly ONE warning for the cleared hotel block (do NOT use a synthetic matching name in the test)**. **Catches:** vanished block not reaching the Data-Quality panel; partial-shrink false-positive; the double-warning the helper signature must be able to suppress.
- **Class C end-to-end** (`tests/sync/` real-DB, R4 F1 + R5 F2 + R7): a recurring existing-show re-sync (via `processOneFile_unlocked`, exercised by cron AND manual re-sync) where a block goes `prior>0 → next 0` → (a) **exactly one** Changes-feed row, `change_kind = 'section_shrunk'` (the existing MI-7 row — assert NO `section_emptied` / no duplicate), AND (b) `BLOCK_DISAPPEARED` appended to `shows_internal.parse_warnings`. **Catches:** double-logging the feed (R7), the parse-warning not reaching the panel, the manual path being missed (R5 F2). Include `transportation: object → null` as one block case (R4 F2).
- **P2 staged-review surfacing** (`tests/admin/` + component): a `pending_syncs` staged first-seen row with parse warnings → the staged page loader yields a non-empty `warningSummary`/`dataGaps` (NOT `""`), and `StagedReviewCard` renders it. **Catches:** the `warningSummary: ""` hardcode hiding first-seen warnings (R1 F1). Derive expected from the seeded warning array.
- **P3 wizard Step-3 surfacing** (`tests/components/` + admin, R5 F1): a Step 3 row that is **checked/applied-clean but carries data-gap warnings** → `Step3SheetCard` renders the per-class data-gap detail (not just a generic count) before the publish checkbox/finalize. **Catches:** silent drops being non-actionable at the actual onboarding publish-decision point. Derive expected from the row's warning array.
- **P3 held-show surfacing** (`tests/admin/`): `loadHeldShows` with seeded `shows_internal.parse_warnings` → summary counts derived **from the seeded warnings array** (the data source), NOT from the rendered chip (anti-tautology). `ShowsTable` chip when `total>0`, nothing when `0`.
- **P1 auto-publish surfacing**: flag-ON first-seen with warnings → `SHOW_FIRST_PUBLISHED` `context.data_gaps` populated; `PerShowAlertSection` renders the digest sub-line only when present.
- **Catalog parity**: `tests/cross-cutting/codes.test.ts` green with the three new admin-log-only §12.4 rows + regenerated `spec-codes` + `catalog.ts` entries (negative-verify: removing one row fails the gate).
- **Registry meta-test**: every block parser header matcher ∈ `knownSections.ts`.
- **Layout-dimensions** (Playwright, per writing-plans rule), both adjacency cases: (a) the `/admin/unpublished` data-gaps chip + `PublishShowButton` row, and (b) the wizard Step-3 card row (publish checkbox + data-gap detail) — assert the chip/detail and the control share the row's vertical center and the row renders without overflow at the documented viewport.
