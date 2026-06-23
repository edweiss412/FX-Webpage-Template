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
| P3 | **Wizard onboarding step-3** | operator checkbox-approves a sheet | created **held** `shows` row (`published=false`) | **pre-publish**: `/admin/unpublished` (`app/admin/unpublished/page.tsx:30-89`, loader `loadHeldShows.ts:73`) + per-show Data-Quality panel |
| P4 | **Recurring edit (existing show)** | sheet edited after publish | auto-applies via cron; writes change-log rows (`lib/sync/changeLog/writeAutoApplyChanges.ts`); **no `SHOW_FIRST_PUBLISHED`** (tail called without `autoPublishFirstSeen`) | **post-apply**: per-show **Changes feed** (`ChangesFeed`, `readShowChangeFeed`) + Data-Quality panel |

**Correction vs the older analysis AND the first draft of this spec (caught in spec adversarial R1):** there are **two distinct pre-publish review surfaces**, not one. `/admin/unpublished` (loader `loadHeldShows`, selects `shows` where `published=false`) shows **held `shows` rows** — the wizard step-3 path (P3). The **cron flag-OFF first-seen path (P2) does NOT land there**; it stages in `pending_syncs` and is reviewed at `/admin/show/staged/[stagedId]` via `StagedReviewCard`, which **hardcodes `warningSummary: ""`** today. And class C (recurring, P4) has **no `SHOW_FIRST_PUBLISHED` alert to augment** — its surface is the per-show **Changes feed**. The surfacing design (§6) covers all four paths.

`shows_internal.parse_warnings` **is written** at apply time (`lib/sync/applyStagedCore.ts` — the core writes children + `shows_internal`; `coreResult.parseWarnings` sources `sync_log.parse_warnings`), so held shows already carry their warnings in the DB; the loader just needs to read them.

## 4. Resolved decisions

1. **Posture: advisory + visible, never blocking.** Warnings never gate publish or divert auto-apply. (User decision 2026-06-23.) Rationale: preserves the auto-publish-clean win (`getAutoPublishCleanFirstSeen`) and Doug's drop-and-trust flow; blocking would reverse a recently-shipped behavior and add review burden for benign/intentional edits (a deleted hotel block is indistinguishable from an accidental one by data alone). **Do-not-relitigate** (see §12).
2. **Scope: all three detector classes** ship in v1 (field-unreadable, unknown-section, block-disappeared).
3. **Surfacing is two-pronged** (refinement of "advisory + visible alert" discovered via the mandated pre-draft re-verification — see §3):
   - **Primary — `/admin/unpublished` + per-show admin page**: render a data-quality summary from `shows_internal.parse_warnings` at the publish-decision point. Covers held shows (wizard path always; cron-flag-OFF path). No catalog churn (parser warnings render `.message` directly).
   - **Secondary — the `SHOW_FIRST_PUBLISHED` admin_alert**: for the two surfaces that bypass `/admin/unpublished` (cron-flag-ON auto-publish, recurring auto-apply), carry a data-gaps digest in the alert context and render it conditionally in `PerShowAlertSection`. **No new admin_alert code** (see §9 rationale).

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

**Section-header-shape heuristic (conservative, to bound false positives):** col0 is ALL-CAPS (`/^[A-Z][A-Z\s/&]+$/` after trim), the row is otherwise a header (≥2 cols OR all-caps singletons typical of a `LABEL | NAME | PHONE` band), AND the row sits at a between-blocks position (not inside a recognized block's row span). A bare all-caps free-text *value* cell (e.g. a caps NOTES value) must NOT trip it — the heuristic requires header-band shape, not just caps.

**Emission:**
```
ParseWarning{ severity:"warn", code:"UNKNOWN_SECTION_HEADER",
  message:`Unrecognized section "${headerText}" — its rows were not parsed.`,
  blockRef:{kind:"unknown_section"}, rawSnippet:headerText }
```

**Registry meta-test (§9):** a structural test asserts every known header matcher used by a block parser is represented in `knownSections.ts`, so adding a future block parser without registering its header fails CI (prevents the registry drifting into false-positive UNKNOWN warnings).

**Guard conditions:** a recognized header that parses zero fields → already covered by `SECTION_HEADER_NO_FIELDS`; class B must **not** double-fire on it (registry membership check precedes the unknown-header emit). A blank/`""` col0 → not a header → skip. A known header with a typo (e.g. `TRANSPORTATON`) → fires `UNKNOWN_SECTION_HEADER` (correct — it genuinely won't parse).

### 5.3 Class C — `BLOCK_DISAPPEARED` (VB10, **stateful**, sync layer)

**Where:** NOT the parser (stateless — confirmed `lib/parser/index.ts`). The sync layer, alongside `runInvariants(show?.priorParseResult ?? null, args.parseResult)` (`lib/sync/phase1.ts:270`). `priorParseResult` is fully reconstructed at `lib/sync/runScheduledCronSync.ts:587-623` and **includes** `crewMembers`, `hotelReservations`, `rooms`, `transportation`, `contacts`.

**Mechanism:** a comparator (new) run in the sync layer after parse, for each stateful block: if `prior.<block>.length > 0 && next.<block>.length === 0` AND no `SECTION_HEADER_NO_FIELDS` warning already covers that block (header-present-but-empty is a different, already-signaled event), append a `BLOCK_DISAPPEARED` `ParseWarning` to `parseResult.warnings` **before** it is persisted (so it flows to `shows_internal.parse_warnings` + `sync_log.parse_warnings` like the others). **Advisory only** — it does NOT become a `TriggeredReviewItem` / does NOT block auto-apply (per §4 posture decision). Lives in the sync layer (e.g. `lib/sync/blockDisappearance.ts`), invoked from the phase-1 flow where `priorParseResult` is available — explicitly **not** in `lib/parser/warnings.ts` (which is stateless/parser-internal).

**Emission:**
```
ParseWarning{ severity:"warn", code:"BLOCK_DISAPPEARED",
  message:`The ${blockLabel} section was present last time but is now empty — ${priorCount} entr${...} dropped.`,
  blockRef:{kind:blockKey} }
```

**Guard conditions:** first-seen (`show == null` → `priorParseResult` null) → **cannot fire** (no prior). This is correct: VB10 is inherently a recurring-edit scenario. `prior` block empty AND `next` empty → no warning (nothing lost). `prior` non-empty AND `next` non-empty → no warning. Double-fire suppression vs `SECTION_HEADER_NO_FIELDS` is mandatory (a header kept with rows cleared yields the empty-section warning; class C suppresses to avoid two signals for one event).

## 6. Surfacing design (advisory, non-blocking)

Each of the four paths in §3 gets a surface. All warnings derive from the SAME `severity:"warn"` ParseWarning set; surfaces differ only by where the operator is at the decision point. A shared helper `summarizeDataGaps(warnings): { total, classes }` (counts the three new codes by class; excludes `info` severity) feeds every surface so the count logic is single-sourced (anti-tautology: tests assert against this helper's input, not the rendered output).

### 6.1 P2 — staged-review card (`pending_syncs` → `/admin/show/staged/[stagedId]`)

The cron-flag-OFF first-seen path stages in `pending_syncs` and is reviewed at `app/admin/show/staged/[stagedId]/page.tsx`, which builds a `StagedReviewCard` with `warningSummary: ""` (`:183`). `StagedReviewCard` **already renders** `warningSummary` when truthy (`components/admin/StagedReviewCard.tsx:531-533`). The staged row already carries warnings: `pending_syncs.parse_result` (jsonb `not null`, holds the full `ParseResult` incl. `.warnings`, `20260501001000_internal_and_admin.sql:144`) and `pending_syncs.warning_summary` (`text not null`, `:157`). Fix: the staged page loader populates `warningSummary` (and a structured `dataGaps` summary for a chip) from `parse_result.warnings` / `warning_summary` instead of the hardcoded `""`. Pre-publish, non-blocking.

### 6.2 P3 — held-show list (`/admin/unpublished`)

`lib/admin/loadHeldShows.ts` — extend the `shows` select (`loadHeldShows.ts:100-105`) to also read `shows_internal.parse_warnings` (separate keyed read or PostgREST embed; jsonb default `'[]'`, `20260501001000_internal_and_admin.sql:4`) and derive the per-show `summarizeDataGaps` summary. Extend `HeldShow`/`LoadHeldShowsResult` types. `app/admin/unpublished/page.tsx` / `ShowsTable` — render a compact **data-gaps chip** per row when `total > 0` (`⚠ N data gaps`, per-class breakdown on expand), shown **before** `PublishShowButton`. **Read-grant check (plan verify):** `20260619000001_lockdown_shows_internal.sql` locked `shows_internal` DML incl. `parse_warnings` — confirm the loader's admin/service read retains `SELECT` (lockdown targets DML; the plan must prove the read works).

### 6.3 P4 — recurring edits: the per-show Changes feed

Recurring existing-show applies write change-log rows via `lib/sync/changeLog/writeAutoApplyChanges.ts` (Task 2.9 — one row per auto-applied notable change), rendered by `components/admin/ChangesFeed.tsx` (data via `lib/sync/feed/readShowChangeFeed.ts`, mounted on the per-show page `app/admin/show/[slug]/page.tsx:51`). The `AutoApplyChangeKind` union (`writeAutoApplyChanges.ts:20-26`) already has `crew_added | crew_removed | crew_renamed | field_changed | section_shrunk | asset_drift`. Class C (`BLOCK_DISAPPEARED`) surfaces via this feed: the plan decides whether a fully-emptied block is the **existing `section_shrunk` kind extended to the →0 case** or a **new `section_emptied`/`data_gap` kind** (a new kind requires updating the union + any change-kind governance — §9). Either way a vanished hotel block appears in the Changes feed the operator already reads. This replaces the first draft's broken "augment `SHOW_FIRST_PUBLISHED`" plan for recurring (that alert is not emitted on recurring applies — spec adversarial R1 F2).

### 6.4 P1 — auto-publish (flag ON): `SHOW_FIRST_PUBLISHED` digest

ONLY the flag-ON first-seen path (P1) emits `SHOW_FIRST_PUBLISHED` (the tail carries `autoPublishFirstSeen`; `emitSuccessfulPhase2Tail` in `lib/sync/applyStaged.ts:902,1313`; code constant `UNDO_ALERT_CODE = "SHOW_FIRST_PUBLISHED"`, `PerShowAlertSection.tsx:71`). For P1, add an optional `data_gaps` digest to that alert's `context` jsonb; `PerShowAlertSection` renders a **bespoke sub-line** when `context.data_gaps` is present — **not** interpolated into the catalog `dougFacing` copy (`PerShowAlertSection.tsx:46,73-88`). **No new admin_alert code, no §12.4 prose change for the alert**; the `_metaAdminAlertCatalog` write-site regex for `SHOW_FIRST_PUBLISHED` must still match after the additive context field (verify).

### 6.5 All paths — per-show Data-Quality panel

The per-show admin page (`app/admin/show/[slug]/page.tsx`) renders the full warn-severity warning list (each `.message`) from `shows_internal.parse_warnings` in a "Data quality" panel — the durable, always-available record covering every path post-apply (P1/P3/P4; P2 before it becomes a show). Zero warnings → panel absent.

## 7. Data model / persistence

- **No schema change.** `shows_internal.parse_warnings` already exists and is written by `applyStagedCore`. The three new ParseWarning codes flow through the existing `agg.warnings → ParsedSheet.warnings → ParseResult.warnings → shows_internal.parse_warnings + sync_log.parse_warnings` pipeline (Class C injected in the sync layer before persistence).
- The `SHOW_FIRST_PUBLISHED` alert `context` jsonb gains an optional `data_gaps: { total, classes }` field (additive; no migration — `admin_alerts.context` is jsonb).

## 8. Dimensional invariants / UI

The only new rendered elements are (a) a data-gaps chip per held-show row in `ShowsTable`, (b) a "Data quality" list panel on the per-show page, (c) a sub-line in `PerShowAlertSection`. None introduce a fixed-dimension parent containing flex/grid children with a non-obvious dimensional relationship. **Dimensional invariants:** the chip is inline within the existing row cell (inherits row height; no `items-stretch` dependency). If the chip is placed in a flex container alongside the publish button, the container uses `items-center` (explicit) — to be verified with a real-browser Playwright assertion per the writing-plans layout-dimensions rule (the plan adds that task). **Transition inventory:** the chip has two states (present / absent) — instant, no animation needed (it reflects static parse state, not a live toggle).

This is a **UI surface** (`app/admin/unpublished/page.tsx`, `app/admin/show/[slug]/page.tsx`, `app/admin/show/staged/[stagedId]/page.tsx`, and `components/admin/{ShowsTable,StagedReviewCard,PerShowAlertSection,ChangesFeed}.tsx` + the new Data-Quality panel) → **invariant 8 applies**: `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`'d.

## 9. Catalog & meta-test inventory (mandatory pre-declaration)

| Item | Governance | Action |
|---|---|---|
| `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED` (ParseWarning codes) | `tests/cross-cutting/codes.test.ts` (active-code parity) + `extract-internal-code-enums` (x2) | emit as literals; **add admin-log-only §12.4 rows + `pnpm gen:spec-codes` + `catalog.ts` entries** (the `SECTION_HEADER_NO_FIELDS` precedent at `catalog.ts:1242` / spec `:2901`) — see §5 |
| `SHOW_FIRST_PUBLISHED` alert (P1 digest only) | `tests/messages/_metaAdminAlertCatalog.test.ts` (3-place lockstep) | **no new code**; `context` gains additive `data_gaps` jsonb; verify the write-site regex still matches after the upsert change |
| Change-feed "data gap" entry (P4) | the change-log change-kind set (verify whether a new kind needs registration in `writeAutoApplyChanges` / its type union + any change-kind catalog) | add a data-gap change kind via the existing `writeAutoApplyChanges` path; the plan confirms whether the change-kind enum is itself catalog-governed |
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
- **Four-path surface coverage (corrected in spec adversarial R1)** — P2 (cron flag-OFF) → `StagedReviewCard` (`pending_syncs`), P3 (wizard) → `/admin/unpublished` (held `shows`), P4 (recurring) → Changes feed, P1 (flag-ON) → `SHOW_FIRST_PUBLISHED` digest; all also land in the per-show Data-Quality panel. The earlier "single `/admin/unpublished` surface" framing was wrong (P2 stages in `pending_syncs`, not held shows) and is fixed in §6 — do not revert to it.
- **No new admin_alert code is by design** — reuse `SHOW_FIRST_PUBLISHED` (P1) + the change feed (P4), per anti-dilution guidance.
- **Parser warning codes DO get admin-log-only §12.4 rows** (corrected R1) — required by `codes.test.ts` active-code parity, per the `SECTION_HEADER_NO_FIELDS` precedent; they still render via `.message`, not `lookup.ts`.
- **Flag default is `true`** (`20260601000000:6`) — the auto-publish bypass path is the default for cron-discovered sheets, so the secondary alert surface is load-bearing, not an edge.
- **Class C lives in the sync layer, not the parser** — the parser is stateless; `priorParseResult` only exists at `phase1.ts:270` / `runScheduledCronSync.ts:587-623`.

## 13. Test plan (anti-tautology, derive-from-fixture)

Each test states the concrete failure mode it catches:

- **Class A** (`tests/parser/blocks/crew.test.ts` extension): fixture crew row phone `"call John"` → asserts a `FIELD_UNREADABLE` warning with `rawSnippet === "call John"` AND the member still parses (row not dropped). Negative: phone `"917-331-4885"` → no warning; empty phone → no warning. **Catches:** garbage phone swallowed silently (the VB08 regression).
- **Class B** (`tests/parser/` new): markdown with a `CATERING | NAME | PHONE` band after `TRANSPORTATION` → one `UNKNOWN_SECTION_HEADER` with `rawSnippet` containing `CATERING`. Negative: all-caps free-text value cell → no warning; a known header (`TRANSPORTATION`) → no warning; a recognized-but-empty section → `SECTION_HEADER_NO_FIELDS` only (no double-fire). **Catches:** unknown section vanishing (VB09) + false-positive noise.
- **Class C** (`tests/sync/` real-DB or unit on the comparator): prior parse with `hotelReservations.length === 2`, next parse with `0` and no hotel header → one `BLOCK_DISAPPEARED`. Negatives: first-seen (prior null) → no warning; header-present-empty → `SECTION_HEADER_NO_FIELDS` not `BLOCK_DISAPPEARED`; both empty → no warning. **Catches:** vanished hotel block (VB10) + double-fire.
- **P2 staged-review surfacing** (`tests/admin/` + component): a `pending_syncs` staged first-seen row with parse warnings → the staged page loader yields a non-empty `warningSummary`/`dataGaps` (NOT `""`), and `StagedReviewCard` renders it. **Catches:** the `warningSummary: ""` hardcode hiding first-seen warnings (R1 F1). Derive expected from the seeded warning array.
- **P3 held-show surfacing** (`tests/admin/`): `loadHeldShows` with seeded `shows_internal.parse_warnings` → summary counts derived **from the seeded warnings array** (the data source), NOT from the rendered chip (anti-tautology). `ShowsTable` chip when `total>0`, nothing when `0`.
- **P4 recurring surfacing** (`tests/sync/` + component): an existing-show re-sync whose parse drops a previously-present block → a change-feed "data gap" entry is written via `writeAutoApplyChanges` and rendered by `ChangesFeed`. **Catches:** recurring drops being invisible because `SHOW_FIRST_PUBLISHED` never fires recurring (R1 F2). Real-DB or comparator-level.
- **P1 auto-publish surfacing**: flag-ON first-seen with warnings → `SHOW_FIRST_PUBLISHED` `context.data_gaps` populated; `PerShowAlertSection` renders the digest sub-line only when present.
- **Catalog parity**: `tests/cross-cutting/codes.test.ts` green with the three new admin-log-only §12.4 rows + regenerated `spec-codes` + `catalog.ts` entries (negative-verify: removing one row fails the gate).
- **Registry meta-test**: every block parser header matcher ∈ `knownSections.ts`.
- **Layout-dimensions** (Playwright, per writing-plans rule): the `/admin/unpublished` data-gaps chip + `PublishShowButton` row — assert chip and button share the row's vertical center / the row renders without overflow at the documented viewport.
