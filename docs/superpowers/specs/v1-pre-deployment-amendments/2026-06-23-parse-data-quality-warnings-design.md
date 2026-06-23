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

| Path | Trigger | Disposition | Passes a pre-publish review surface? |
|---|---|---|---|
| **Cron-discovered, flag ON** | new sheet in watched folder, `app_settings.auto_publish_clean_first_seen = true` (migration default `true`, `supabase/migrations/20260601000000_b2_show_lifecycle.sql:6`) | auto-publishes (`lib/sync/phase1.ts:339-349` — clean + flag on → no `FIRST_SEEN_REVIEW` sentinel → proceeds to publish) | **No** — bypasses review |
| **Cron-discovered, flag OFF** | same, flag off | injects `FIRST_SEEN_REVIEW` sentinel (`phase1.ts:346-348`) → staged → **held** (`published=false`) | **Yes** — lands in `/admin/unpublished` |
| **Wizard onboarding (step-3)** | operator runs onboarding, checkbox-approves a sheet | created **held** (`published=false`); explicit publish later | **Yes** — `/admin/unpublished` |
| **Recurring edit (existing show)** | sheet edited after publish | auto-applies via cron | **No** — bypasses review |

`/admin/unpublished` (`app/admin/unpublished/page.tsx:30-89`, loader `lib/admin/loadHeldShows.ts:73`) is the **new gated review surface** where held shows wait for an explicit `publish_show` RPC via `PublishShowButton`. It renders a `ShowsTable` — **with no warning indicators today**. That is the design opportunity: #103 created the surface; this feature wires data-quality visibility into it.

`shows_internal.parse_warnings` **is written** at apply time (`lib/sync/applyStagedCore.ts` — the core writes children + `shows_internal`; `coreResult.parseWarnings` sources `sync_log.parse_warnings`), so held shows already carry their warnings in the DB; the loader just needs to read them.

## 4. Resolved decisions

1. **Posture: advisory + visible, never blocking.** Warnings never gate publish or divert auto-apply. (User decision 2026-06-23.) Rationale: preserves the auto-publish-clean win (`getAutoPublishCleanFirstSeen`) and Doug's drop-and-trust flow; blocking would reverse a recently-shipped behavior and add review burden for benign/intentional edits (a deleted hotel block is indistinguishable from an accidental one by data alone). **Do-not-relitigate** (see §12).
2. **Scope: all three detector classes** ship in v1 (field-unreadable, unknown-section, block-disappeared).
3. **Surfacing is two-pronged** (refinement of "advisory + visible alert" discovered via the mandated pre-draft re-verification — see §3):
   - **Primary — `/admin/unpublished` + per-show admin page**: render a data-quality summary from `shows_internal.parse_warnings` at the publish-decision point. Covers held shows (wizard path always; cron-flag-OFF path). No catalog churn (parser warnings render `.message` directly).
   - **Secondary — the `SHOW_FIRST_PUBLISHED` admin_alert**: for the two surfaces that bypass `/admin/unpublished` (cron-flag-ON auto-publish, recurring auto-apply), carry a data-gaps digest in the alert context and render it conditionally in `PerShowAlertSection`. **No new admin_alert code** (see §9 rationale).

## 5. Detection design

All three produce a `ParseWarning` (`lib/parser/types.ts:1-7`): `{ severity: "info" | "warn"; code: string; message: string; blockRef?: { kind; index? }; rawSnippet? }`. All new codes are emitted as **string literals** (x2 no-raw-codes coverage, mirroring `lib/parser/warnings.ts:46`). **No `lib/messages/catalog.ts` / §12.4 / `lookup.ts` row is required for ParseWarning codes** — parser warnings render their `.message` directly (`app/admin/dev/page.tsx`, `StagedReviewCard.tsx:43-46`), never through `lib/messages/lookup.ts` (invariant 5 governs UI error *codes*, not parser warnings).

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

### 6.1 Primary — `/admin/unpublished` + per-show admin page

- `lib/admin/loadHeldShows.ts` — extend the `shows` select (`loadHeldShows.ts:100-105`) to also read `shows_internal.parse_warnings` (a separate keyed read or PostgREST embed; `shows_internal.parse_warnings` is jsonb default `'[]'`, `supabase/migrations/20260501001000_internal_and_admin.sql:4`), and derive a per-show **data-gaps summary**: count of `severity:"warn"` warnings, grouped by class, e.g. `{ total: 3, classes: { FIELD_UNREADABLE: 1, UNKNOWN_SECTION_HEADER: 1, BLOCK_DISAPPEARED: 1 } }`. Extend `HeldShow`/`LoadHeldShowsResult` types accordingly. **Read-grant check (plan verify):** `supabase/migrations/20260619000001_lockdown_shows_internal.sql` locked down `shows_internal` DML and notes `parse_warnings` is among the locked columns — confirm the admin/service read path `loadHeldShows` uses retains `SELECT` on `shows_internal.parse_warnings` (the lockdown targets DML, but the plan must prove the read works, e.g. via the service-role client or an RLS `crew_read`/admin grant).
- `app/admin/unpublished/page.tsx` / `ShowsTable` — render a compact **data-gaps chip** per held-show row when `summary.total > 0` (e.g. `⚠ 3 data gaps` with the per-class breakdown on hover/expand). The operator sees it **before** clicking `PublishShowButton`. Non-blocking: publish remains enabled.
- Per-show admin page (`app/admin/show/[slug]/page.tsx`) — render the full warning list (each `.message`) in a "Data quality" panel, so the durable record is browsable after publish too.

### 6.2 Secondary — `SHOW_FIRST_PUBLISHED` alert digest (bypass paths)

For cron-flag-ON auto-publish and recurring auto-apply, the `SHOW_FIRST_PUBLISHED` alert is emitted through the shared `emitSuccessfulPhase2Tail` chokepoint (`lib/sync/applyStaged.ts` — confirmed exports/uses `emitSuccessfulPhase2Tail`, e.g. `:902`, `:1313`; alert code constant `UNDO_ALERT_CODE = "SHOW_FIRST_PUBLISHED"` at `components/admin/PerShowAlertSection.tsx:71`): when `parseResult.warnings` contains `severity:"warn"` entries, include an optional `data_gaps` digest (counts per class) in the **existing** `SHOW_FIRST_PUBLISHED` alert's `context` jsonb. `PerShowAlertSection` (renders alert rows by interpolating `context` into the catalog `dougFacing` copy, `PerShowAlertSection.tsx:46,73-88`) gains a **bespoke sub-line** rendered directly by the component when `context.data_gaps` is present — **not** interpolated into the catalog message string. **Therefore: no new admin_alert code, and no §12.4 / `catalog.ts` / `lookup.ts` prose change** (the dougFacing copy is untouched; only the component adds a conditional sub-line and the upsert adds an optional context field). The `_metaAdminAlertCatalog` write-site regex for `SHOW_FIRST_PUBLISHED` must still match after the context addition (verify).

## 7. Data model / persistence

- **No schema change.** `shows_internal.parse_warnings` already exists and is written by `applyStagedCore`. The three new ParseWarning codes flow through the existing `agg.warnings → ParsedSheet.warnings → ParseResult.warnings → shows_internal.parse_warnings + sync_log.parse_warnings` pipeline (Class C injected in the sync layer before persistence).
- The `SHOW_FIRST_PUBLISHED` alert `context` jsonb gains an optional `data_gaps: { total, classes }` field (additive; no migration — `admin_alerts.context` is jsonb).

## 8. Dimensional invariants / UI

The only new rendered elements are (a) a data-gaps chip per held-show row in `ShowsTable`, (b) a "Data quality" list panel on the per-show page, (c) a sub-line in `PerShowAlertSection`. None introduce a fixed-dimension parent containing flex/grid children with a non-obvious dimensional relationship. **Dimensional invariants:** the chip is inline within the existing row cell (inherits row height; no `items-stretch` dependency). If the chip is placed in a flex container alongside the publish button, the container uses `items-center` (explicit) — to be verified with a real-browser Playwright assertion per the writing-plans layout-dimensions rule (the plan adds that task). **Transition inventory:** the chip has two states (present / absent) — instant, no animation needed (it reflects static parse state, not a live toggle).

This is a **UI surface** (`app/admin/**` pages, `components/admin/*`) → **invariant 8 applies**: `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`'d.

## 9. Catalog & meta-test inventory (mandatory pre-declaration)

| Item | Governance | Action |
|---|---|---|
| `FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED` (ParseWarning codes) | string literals; `extract-internal-code-enums` (x2 no-raw-codes) | emit as literals; **no §12.4 / catalog.ts / lookup.ts row** (parser warnings render `.message`, not via `lookup.ts`) |
| `SHOW_FIRST_PUBLISHED` alert (augmented) | `tests/messages/_metaAdminAlertCatalog.test.ts` (3-place lockstep) | **no new code**; context is additive jsonb; the existing write-site registry entry must still match (verify the pattern still passes after adding the `data_gaps` field to the upsert) |
| Known-section-header registry (`lib/parser/knownSections.ts`) | **new structural meta-test** | assert every block parser's header matcher is represented; prevents class-B false positives from registry drift |
| `shows_internal.parse_warnings` read path | none (read-only) | extend `loadHeldShows` select + per-show page read |

**No new admin_alert code is minted** (per the workflow's "don't mint per-class alert codes" + alert-dilution risk). **No new RPC-gated table** (no PostgREST DML lockdown needed). **No `pg_advisory*` change** (advisory-lock topology unchanged).

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
- **Two-pronged surface is intentional** — `/admin/unpublished` primary (held paths) + `SHOW_FIRST_PUBLISHED` digest secondary (bypass paths). Neither alone covers all four paths in §3.
- **No new admin_alert code is by design** — reuse + additive context, per anti-dilution guidance.
- **Flag default is `true`** (`20260601000000:6`) — the auto-publish bypass path is the default for cron-discovered sheets, so the secondary alert surface is load-bearing, not an edge.
- **Class C lives in the sync layer, not the parser** — the parser is stateless; `priorParseResult` only exists at `phase1.ts:270` / `runScheduledCronSync.ts:587-623`.

## 13. Test plan (anti-tautology, derive-from-fixture)

Each test states the concrete failure mode it catches:

- **Class A** (`tests/parser/blocks/crew.test.ts` extension): fixture crew row phone `"call John"` → asserts a `FIELD_UNREADABLE` warning with `rawSnippet === "call John"` AND the member still parses (row not dropped). Negative: phone `"917-331-4885"` → no warning; empty phone → no warning. **Catches:** garbage phone swallowed silently (the VB08 regression).
- **Class B** (`tests/parser/` new): markdown with a `CATERING | NAME | PHONE` band after `TRANSPORTATION` → one `UNKNOWN_SECTION_HEADER` with `rawSnippet` containing `CATERING`. Negative: all-caps free-text value cell → no warning; a known header (`TRANSPORTATION`) → no warning; a recognized-but-empty section → `SECTION_HEADER_NO_FIELDS` only (no double-fire). **Catches:** unknown section vanishing (VB09) + false-positive noise.
- **Class C** (`tests/sync/` real-DB or unit on the comparator): prior parse with `hotelReservations.length === 2`, next parse with `0` and no hotel header → one `BLOCK_DISAPPEARED`. Negatives: first-seen (prior null) → no warning; header-present-empty → `SECTION_HEADER_NO_FIELDS` not `BLOCK_DISAPPEARED`; both empty → no warning. **Catches:** vanished hotel block (VB10) + double-fire.
- **Surfacing** (`tests/admin/` + component): `loadHeldShows` with a seeded `shows_internal.parse_warnings` → summary counts derived **from the seeded warnings array** (the data source), NOT from the rendered chip (anti-tautology). `ShowsTable` renders the chip when `total>0`, nothing when `0`. `PerShowAlertSection` renders the digest sub-line only when `context.data_gaps` present. Expected counts derived from fixture warning arrays, never hardcoded.
- **Registry meta-test**: every block parser header matcher ∈ `knownSections.ts`.
- **Layout-dimensions** (Playwright, per writing-plans rule): the chip + publish button row — assert chip and button share the row's vertical center / the row renders without overflow at the documented viewport.
