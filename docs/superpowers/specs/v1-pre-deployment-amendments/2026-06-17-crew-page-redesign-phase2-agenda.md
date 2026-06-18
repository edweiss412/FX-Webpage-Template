# Crew Page Redesign — Phase 2: AGENDA run-of-show enrichment

**Status:** draft → adversarial review (cross-model, Codex). User reviews waived per owner mandate.
**Depends on:** Phase 1 spec (`2026-06-15-crew-page-redesign-phase1-design.md`, adversarial-APPROVED). Phase 2 ships **only after** Phase 1's Schedule section + `resolveKeyTimes` anchor strip exist.
**Scope:** one optional, fail-soft parser block + one JSONB column + one projection field + one **enrichment** of the Phase-1 Schedule section. No new route, no new auth surface, no UI-shell change.

---

## 1. Summary

The sheet's AGENDA run-of-show — a wide grid of per-day `START/FINISH/TRT/TITLE/ROOM/AV` blocks — is **filled with real session content in roughly half of real shows** (verified across the fixture corpus: filled in `2024-05-east-coast`, `2025-03-dci-rpas`, `2025-04-asset-mgmt`; auto-formula-only/empty in `2025-05-redefining`, `2026-03-rpas-central`, `2025-10-consultants`). _(Note: the 7 `fxav-test-shows` Drive sheets the original audit sampled were empty-template; the broader fixture corpus shows the run-of-show is in fact a frequently-populated source.)_ Phase 2 parses that grid into a structured per-day timeline and **enriches** the Phase-1 crew Schedule section: a day with parsed agenda entries renders a richer run-of-show list; a day without (empty grid, or a show that never filled it) falls back to the Phase-1 `resolveKeyTimes` anchor strip (Load-in / Program / Strike + per-room set/show/strike). The parser is **fail-soft** — a missing/empty/malformed AGENDA grid yields **no** `run_of_show` and the anchor strip is unaffected. Nothing about Phase 1 regresses; Phase 2 is purely additive.

---

## 2. Resolved decisions

- **D-1. New parser block `parseAgenda`** reads the AGENDA tab grid (when present in the source markdown) and emits `ShowRow.run_of_show: Record<ISODate, AgendaEntry[]> | null`. Added to `parseSheet`'s sequential block list (`lib/parser/index.ts:311`), alongside the existing `parseAgendaLinks` (which is unchanged — AGENDA **LINK** rows and the AGENDA **tab grid** are distinct surfaces).
- **D-2. Fail-soft, never a hard error.** A missing AGENDA tab, an all-empty grid, `#REF!` day banners, ragged per-block row counts, trailing-space headers, or any parse fault → `run_of_show = null` (or the offending day/block omitted), recorded as a **warning** (not a `hardError`). The show still ingests; the crew page still renders the anchor strip. The AGENDA tab is the **most fragile** sheet surface (formula-driven), so robustness is the primary contract.
- **D-3. Storage = new `shows.run_of_show jsonb` column** (nullable, default `null`). Keyed by ISO date → `AgendaEntry[]`. Not on `event_details` (which is a flat `Record<string,string>`); a dedicated typed column mirrors `agenda_links` / `schedule_phases`.
- **D-4. Projection field `ShowForViewer.runOfShow`** added to `getShowForViewer` read path, **gated by the same `DateRestriction`** as the Schedule section (Phase 1 §4.2 / wp-16): an `unknown_asterisk` viewer sees **no** run-of-show days (cannot infer show days); `explicit` sees only assigned days; `none` sees all. Same intersection logic the Schedule section already applies to dates.
- **D-5. UI = enrichment of the Phase-1 Schedule section, not a new component tree.** For each rendered Schedule day, **if** `runOfShow[isoDate]` is non-empty → render the run-of-show list; **else** render the Phase-1 anchor strip for that day. The two are mutually exclusive **per day** (a show can have agenda for some days, anchors for others). No change to the section nav, the shell, or any other section.
- **D-6. Caps.** Max **20** agenda entries rendered per day; beyond that, the inline cap + overflow disclosure (`+N more`) per the Phase-1 cap discipline (Phase 1 §4.15). Entry `title` truncates at **80** chars with a `<details>` expander (mirrors Notes truncation).
- **D-7. Admin-only observability reuse.** A `run_of_show` **parse** failure (sheet-side) surfaces as a parser **warning** in the ingestion path (existing `pending_ingestions` / sync surface), **not** a new admin-alert code. A **fetch** failure of the `shows.run_of_show` column at read time is covered by the existing Phase-1 `getShowForViewer` `tileErrors` + `CrewShell` projection alert (the new column is read in the same query). **No new `admin_alerts` code, no §12.4 catalog change.**
- **D-8. No Right-Now hero change.** `RightNowHero` / `buildRightNowContext` / `selectRightNowState` are **untouched** — the hero consumes `dates` + anchor times only (Phase 1 §4.3). The run-of-show enriches the **Schedule** section, not the hero.

---

## 3. Current state (existing code — cited; new Phase 2 artifacts are §4)

> This section cites **existing** code only. New Phase 2 artifacts — `parseAgenda`, `ShowRow.run_of_show`, the `shows.run_of_show` column + migration, `ShowForViewer.runOfShow`, and the Schedule-section enrichment — are design (§4), not current code.

- **Parser entry.** `parseSheet(markdown, filename?)` (`lib/parser/index.ts:311`) runs sequential block parsers and returns `ParsedSheet` (`lib/parser/index.ts:311-400`). The only AGENDA-related parsing today is **`parseAgendaLinks(markdown)`** (`lib/parser/index.ts:230-249`), which scans for `| AGENDA LINK <suffix> | <file/url> |` rows → `ShowRow.agenda_links` (`lib/parser/types.ts:107`). **There is no AGENDA-tab grid parser.**
- **Anchor times today.** Per-room `set_time`/`show_time`/`strike_time` parse from the ROOMS block (`lib/parser/blocks/rooms.ts:135-138` → `RoomRow` `lib/parser/types.ts:136-138`). `schedule_phases` is **derived from `dates`** via `deriveSchedulePhases(dates)` (`lib/parser/index.ts:272-307`), keyed by ISO date → `WorkPhase[]`; it is **not** sourced from AGENDA. `event_details` optionally carries `call_time`/`load_in_time`/`strike_time`/`first_show_room` when the sheet author wrote them (`buildRightNowContext.ts:72-82`).
- **Dates block.** `parseDates` emits `ShowRow["dates"]` = `{ travelIn, set, showDays[], travelOut }` (ISO `YYYY-MM-DD`) (`lib/parser/blocks/dates.ts:48-72`). The AGENDA day banners must reconcile against these ISO dates (§4.1).
- **Projection.** `getShowForViewer(showId, viewer)` (`lib/data/getShowForViewer.ts:199-200`) → `ShowForViewer` (`:94-197`): emits `schedule_phases` (`:267-273,281`), `event_details` (`:282`), `rooms` via `from("rooms").select("*")` (`:374-401`), `agenda_links` (`:283`), `dates`. **No `runOfShow` field yet.** The viewer's `DateRestriction` (`crew_members.date_restriction`) already gates the Schedule day set (Phase 1 §4.2).
- **DB schema.** `shows` (`supabase/migrations/20260501000000_initial_public_schema.sql:3-29`) has `dates jsonb` (`:13`), `event_details jsonb` (`:13`), `agenda_links jsonb` (`:14`). **No `run_of_show` column.** `rooms` (`:66-85`) holds the per-room times.
- **Tests.** Parser tests in `tests/parser/parseSheet.test.ts`; AGENDA-LINK extraction at `:59-73`; `schedule_phases` derivation at `:75-81`. Fixtures in `fixtures/shows/raw/*.md`. **The corpus already contains both filled and empty AGENDA grids** — Phase 2 tests use the **real fixtures** (filled: `2024-05-east-coast-family-office.md` header `:87`, data `:88-105`; `2025-03-dci-rpas-central.md` header `:338`, data `:342-347`; `2025-04-asset-mgmt-cfo-coo.md` header `:320`, data `:321-327`; empty: `2025-05-redefining-…:293-302`, `2026-03-rpas-central-…:223-230`; header-prefix-day variant: `2025-10-consultants-roundtable.md:210-224`) rather than only synthetic data. A small synthetic fixture is added only to pin edge cases not present in the corpus (e.g. > 20 entries, an 81-char title).

---

## 4. Design

### §4.1 — The AGENDA grid contract (real structure — verified across the fixture corpus)

The AGENDA run-of-show is a **single wide markdown table** preceded by 1–5 **banner rows** that label each day's date + day-name. Structure verified across six fixtures (citations in §3):

- **Columns 1–6 = the CREW arrival block** — `NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM` (per-crew flight/arrival). **`parseAgenda` ignores cols 1–6** (they are the crew block; flight/arrival is the existing crew parser's surface, not the run-of-show).
- **Columns 7+ = per-day run-of-show blocks**, each **exactly 6 columns**: `START | FINISH | TRT | TITLE | ROOM | AV`. Blocks repeat with stride 6 (cols 7–12 = day 1, 13–18 = day 2, …). The crew-block width (6) and day-block width (6) and start column (7) are **constant** across all fixtures.
- **Day delimiter (two variants, both handled):** **(primary, 5/6 fixtures)** a **banner row** above the header carries each day's `DATE` + day-name aligned to that day-block's column span (e.g. `| 5/13/24 | | | 5/14/24 | | | 5/15/24 |…` over `| Monday | | | Tuesday | | | Wednesday |…`); **(outlier, 1/6 — `2025-10-consultants-roundtable`)** the **header cells themselves carry a day-name prefix** (`Wednesday/START`, `Thursday/TITLE`, with `#REF!/` for broken cells). The parser derives each day-block's day-name from the header prefix when present, else from the aligned banner-row cell.
- **Day → ISO date** is reconciled via the **DATES table** (always present, ~200 lines above): its `DAY` column → `DATE` column (e.g. `Wednesday` → `10/8/25` → `2025-10-08`). `parseDates` already produces `dates.showDays[]`/`set`/`travelIn`/`travelOut` ISO dates (`lib/parser/blocks/dates.ts:48-72`); `parseAgenda` maps each day-block's day-name to the matching ISO date.
- **`#REF!`** appears in header/banner cells (`#REF!/NAME`, broken day banners), **never** observed in data cells. Tolerate it: a `#REF!`/unresolvable day-name → skip that block (warning), never invent a date.
- **"Filled"** = a day-block data row whose **TITLE** cell is non-empty. `START`/`FINISH`/`TRT` are auto-formula and present even on empty rows; `TITLE`/`ROOM`/`AV` are the human-authored run-of-show. **Real fixtures split ~evenly: filled** (`2024-05-east-coast-family-office.md:88-105` "Opening Keynote" / "Managing Risk and Liquidity"; `2025-03-dci-rpas-central.md:342-347` "Intro & Chair's Welcome"; `2025-04-asset-mgmt-cfo-coo.md:321-327`) **vs empty** (`2025-05-redefining-…:294-302`; `2026-03-rpas-central-…:224-230`; `2025-10-consultants-…:212-224`). So Phase 2 is a **real, frequently-populated feature** — not speculative.

**Parse algorithm (`parseAgenda`), fail-soft throughout:**
1. Locate the AGENDA table: the wide table whose header begins `NAME | ARRIVAL | FLIGHT#` (cols 1–6) followed by ≥1 repeating `START | FINISH | TRT | TITLE | ROOM | AV` block. **Absent → `null`** (warning-free).
2. Build the **day-name → ISO date** map from the DATES table (tolerate missing/`#REF!` rows — an unmapped day just means its block can't resolve).
3. For each 6-col block from col 7 (stride 6): derive its **day-name** from the header-cell prefix (`<Day>/START`, trimming `#REF!/`) if present, else from the aligned banner-row cell above the block. Map day-name → ISO date. **Unresolvable / `#REF!` / DATES-absent → skip the block** (warning); never invent a date. A block whose 6-col header doesn't match `START/FINISH/TRT/TITLE/ROOM/AV` (trailing spaces trimmed) → skip (warning).
4. Walk data rows below the header; **stop at the first all-blank row or sheet end** (ragged blocks). For each row, read the block's `[START, FINISH, TRT, TITLE, ROOM, AV]`; iff **TITLE** is non-empty, emit `AgendaEntry { start, finish?, trt?, title, room?, av? }` (all strings, kept as the sheet's display value — **never** re-parsed to `Date`).
5. Group entries by resolved ISO date → `Record<ISODate, AgendaEntry[]>` (in sheet row order). A day with zero filled TITLE rows contributes **no key** (absent, not `[]`). If **no** block yields any entry → the whole result is **`null`** (the column stores `null`, not `{}`).
6. **Cap at the parser level:** at most **20** entries per day stored (D-6); a block with more records a warning and truncates. Never store an unbounded array.

**`AgendaEntry` type (`lib/parser/types.ts`):** `{ start: string; finish?: string; trt?: string; title: string; room?: string; av?: string }`. `title` is the only required field (the "filled" signal). All fields are sheet-display strings; none are re-typed.

**Do-not-double-parse:** the crew block (cols 1–6: `NAME/ARRIVAL/FLIGHT#/TIME/TITLE/ROOM`) carries per-crew arrival/flight and is the existing crew parser's surface; `parseAgenda` reads **only** cols 7+ and never touches the crew block (no overlap with `crew_members.flight_info` parsing).

### §4.2 — Storage + projection

- **Migration** adds `shows.run_of_show jsonb` (nullable, default `null`). Idempotent (`add column if not exists`). Applied locally **and surgically to the validation project** + `pnpm gen:schema-manifest` regenerated and committed, per the migration-reaches-validation discipline (the `validation-schema-parity` gate then asserts the column live). Tier×domain + CHECK/enum matrices **N/A** (one nullable JSONB column, no CHECK/enum/FK).
- **Sync write path** persists `parsed.run_of_show` to the column on ingest (the existing `shows` upsert in the sync path; `run_of_show` joins `dates`/`event_details`/`agenda_links` in the same write). A `null` overwrites a prior value (a show whose AGENDA was emptied loses its run-of-show — correct).
- **Projection** `getShowForViewer` selects `run_of_show` in its existing `shows` read and emits `ShowForViewer.runOfShow: Record<ISODate, AgendaEntry[]> | null`, **after applying the viewer `DateRestriction` intersection** (D-4): the projection drops any ISO-date key the viewer is not entitled to see (same gate the Schedule day set uses). A malformed stored value (not an object / array shape) → `runOfShow = null` + a `tileErrors["run_of_show"]` entry (so the Phase-1 `CrewShell` projection alert observes it; §4.4).

### §4.3 — Schedule-section enrichment (UI)

The Phase-1 **Schedule** `*Section` (Server Component, `components/crew/sections/`) gains a per-day branch:

- For each rendered Schedule day (already gated + capped by Phase 1), **if `runOfShow[isoDate]` is present and non-empty** → render a **run-of-show list** (`data-testid="run-of-show-<isoDate>"`): each entry is a row `START–FINISH · TITLE` with `ROOM` and an `AV` badge when present, in sheet order. **Else** → render the Phase-1 `resolveKeyTimes` anchor strip for that day (unchanged).
- **Mutually exclusive per day:** a day renders **either** the run-of-show list **or** the anchor strip, **never both** (D-5). The decision is `runOfShow[isoDate]?.length > 0`.
- **Sentinel hiding:** each optional field (`room`, `av`, `finish`, `trt`) routes through `shouldHideGenericOptional` (Phase 1's sentinel contract) — a `""`/`TBD`/`N/A`/`TBA` value hides that field, not the whole entry (the entry shows iff `title` is real, which the parser already guarantees). The Schedule section is already in the `_metaSentinelHidingContract` walk (Phase 1 extended it to `components/crew/`), so the new field reads are covered.
- **Caps (D-6):** at most 20 entries; a 21st+ collapses into a `+N more` overflow stub with the correct `data-testid`/count (`= length − 20`). `title` > 80 chars → `data-testid="agenda-title-truncated"` + `<details>` body. Migrate/extend the Phase-1 `CardinalityCapBoundary` matrix to the run-of-show list.
- **No links rendered raw.** If a `title`/`room`/`av` string contains a URL, it renders **text-only** (no `https://`/`drive.google.com`/`docs.google.com` substring in the crew DOM), reusing the Phase-1 opening-reel URL-strip guard (§4.15) — agenda cells are free text and could paste a link.

### §4.4 — Error handling + observability

| Fault | Crew sees | Admin signal |
|---|---|---|
| AGENDA tab absent (most shows) | anchor strip (Phase 1) | none (not an error) |
| AGENDA grid malformed at **parse** (sheet) | anchor strip | parser **warning** in the ingestion surface (`pending_ingestions`); `run_of_show` stays `null` |
| `shows.run_of_show` **fetch** fails at read | anchor strip (runOfShow falls to `null`) | Phase-1 `tileErrors["run_of_show"]` → `CrewShell` `TILE_PROJECTION_FETCH_FAILED` (union-merged; the new key joins the existing set — **no new code**) |
| stored value malformed (shape) | anchor strip | `tileErrors["run_of_show"]` (same as fetch fail) — fail-soft, never a render throw |

**Invariant:** a run-of-show fault **never** removes or corrupts the anchor strip — the anchor strip is the Phase-1 floor and Phase 2 only ever **adds** on top of it. (Tested: §9.)

### §4.5 — Guard conditions (every input)

- `runOfShow = null` → every day renders the anchor strip (Phase-1 behavior, no Phase-2 element in the DOM).
- `runOfShow = {}` (empty object) → treated as `null` (no day has entries) → all anchor strips. (The parser stores `null` not `{}`, but the projection guards both.)
- `runOfShow[date] = []` → that day renders the anchor strip (empty array = no entries). (The parser omits empty-day keys, but the UI guards `?.length > 0`.)
- An entry with `title` present but every other field sentinel/blank → renders a title-only row (no time/room/av), never an empty row.
- `DateRestriction = unknown_asterisk` → projection drops all `runOfShow` keys → all visible days (none) render nothing extra; the Schedule unconfirmed-placeholder (Phase 1) is unchanged.

### §4.6 — Mode boundaries / dimensional invariants / transitions

- **Mode boundary:** the run-of-show list and the anchor strip are the two mutually-exclusive **per-day** modes of the Schedule day. No element is shared between them; the day container renders exactly one.
- **Dimensional invariants:** the run-of-show list is a flow list inside the existing Schedule day container (no fixed-height parent with flex/grid children → no Tailwind-v4 `items-stretch` concern); each entry row is `min-h-tap-min` (44px) if it carries a tap target, else natural height. (No `getBoundingClientRect` parent==child assertion is required because there is no fixed-dimension parent; the Phase-1 Schedule layout test already covers the day container.)
- **Transitions:** the per-day mode (run-of-show vs anchor strip) is **fixed at render** for a given day+viewer — it does not toggle client-side, so **no animation** (instant; nothing to inventory). Section-level crossfade is owned by Phase 1's `CrewSectionTransition`, unchanged.

---

## 5. Out of scope (Phase 2)

- Re-typing agenda times to `Date`/timezone math, or feeding the run-of-show into `selectRightNowState` (the hero stays `dates`-driven — D-8).
- A standardized downloadable sheet template (that is `BACKLOG.md` BL-CREW-SHEET-TEMPLATE-V2, a separate v2 effort).
- Editing/authoring agenda in-app (read-only projection only).
- TRAVEL/SET group columns (cols A–F) — Phase 2 reads only the per-day TITLE/ROOM/AV blocks; travel is already covered by the Travel section (Phase 1).
- Any change to the hero, the shell, routing, auth, or other sections.

---

## 6. Testing (TDD per task)

1. **`parseAgenda` — real filled fixtures (banner-row days).** Run `parseSheet` on `2024-05-east-coast-family-office.md` → `run_of_show` keys the show-days reconciled from its DATES table, and the first day's entries match the cells (`:88-90`: `{start:"8:15 AM", finish:"8:30 AM", trt:"0:15", title:"Welcome and Introductory Remarks", room:"Mabel 1", av:"POD"}`, then "Opening Keynote", "Managing Risk and Liquidity", … in sheet order). Derive expected counts/values **from the fixture rows**, not hardcoded. Repeat for `2025-03-dci-rpas-central.md` (`:342-347`) and `2025-04-asset-mgmt-cfo-coo.md` (`:321-327`). Assert times stay display-strings (not `Date`), crew block (cols 1–6) is **not** in any entry. _Catches: wrong block striding, mis-keyed days, `Date` coercion, the crew block bleeding into the run-of-show._
2. **`parseAgenda` — header-prefix-day variant + fail-soft (`2025-10-consultants-roundtable.md`).** This fixture's header carries day-name prefixes (`Wednesday/START`) AND `#REF!/NAME` cells AND empty TITLE cells (`:210-224`): assert (a) the day-name is read from the **header prefix** (not a banner), (b) `#REF!/`-prefixed cells are tolerated (block resolves by its day-name, broken crew-block cells ignored), (c) all-empty TITLE cells → that show's `run_of_show` is `null` (no entries). Plus, via small synthetic inputs: absent AGENDA table → `null` no warning; a `#REF!` **day** banner → that block skipped + warning; ragged rows → stop at first all-blank; trailing-space header → matched; non-matching 6-col header → skipped + warning; **> 20 filled rows** → truncated to 20 + warning. None is a `hardError`. _Catches: the prefix-day variant being unhandled; a fragile grid hard-failing ingest; unbounded storage._
3. **Empty-AGENDA fixtures → `run_of_show = null`; no false positives.** Run `parseSheet` on the auto-formula-only fixtures (`2025-05-redefining-fixed-income-private-credit.md`, `2026-03-rpas-central-four-seasons.md`) → `run_of_show` is `null` (START/FINISH/TRT present but every TITLE blank → no entry). _Catches: the parser inventing entries from auto-generated time cells when no human filled the run-of-show._
4. **Migration + projection.** The `shows.run_of_show` column exists live (validation-parity); `getShowForViewer` emits `runOfShow`; a `DateRestriction` `explicit` viewer sees only assigned-day keys, `unknown_asterisk` sees none, `none` sees all (assert the intersection drops keys, identical to the Schedule day gate). _Catches: leaking show-day schedule to unconfirmed crew; an ungated projection field._
5. **Schedule enrichment — per-day mode.** A fixture with agenda for day 1 and none for day 2 → day 1 renders `run-of-show-<d1>` (the entries), day 2 renders the anchor strip; **never both** in one day (clone the day subtree, assert exactly one mode present). A day whose entries are all title-only → rows render with title, no time/room/av. _Catches: double-rendering; the anchor strip disappearing when agenda exists for a different day._
6. **Anchor strip never regresses.** With `runOfShow = null` (every existing fixture), the Schedule section is byte-identical to Phase 1's anchor-strip output (assert the Phase-1 Schedule test still passes unchanged). With a `run_of_show` **fetch fault** injected (`tileErrors["run_of_show"]`), the anchor strip still renders AND the `CrewShell` projection alert's `failedKeys` union includes `run_of_show` (Phase-1 §4.13 union-merge — no new alert code). _Catches: Phase 2 cannibalizing the Phase-1 floor; a missing observability hook._
7. **Caps + truncation + URL-strip.** 21 entries → 20 shown + `+1 more` overflow stub (`data-testid` + count); an 81-char title → `agenda-title-truncated` + `<details>`; a `title`/`room`/`av` carrying a Drive URL → text-only, no `https://`/`drive.google.com`/`docs.google.com` substring in the crew DOM. Extend `CardinalityCapBoundary`. _Catches: unbounded mobile scroll; leaked Drive URLs in free-text agenda cells._
8. **Sentinel hiding.** An entry with `room = "TBD"` / `av = ""` → those fields hidden, the entry still shows (title real). The Schedule section's `components/crew/` files stay in the `_metaSentinelHidingContract` walk (Phase 1) — the new field reads import+call `shouldHideGenericOptional`. _Catches: a `TBD`/blank leaking into the run-of-show row._

---

## 7. Watchpoints / do-not-relitigate (review focus)

1. **Fail-soft is the contract (do-not-relitigate toward a hard error).** A malformed/`#REF!`/ragged AGENDA tab is the **norm** for this fragile surface — it MUST yield a warning + `null`/partial, never a `hardError` that blocks ingest. The anchor strip is the Phase-1 floor and is never removed by a Phase-2 fault (§4.4 invariant).
2. **No new admin-alert code / no §12.4 change.** Parse faults are parser **warnings** (existing ingestion surface); read faults reuse the Phase-1 `CrewShell` `TILE_PROJECTION_FETCH_FAILED` via the union-merged `tileErrors["run_of_show"]` key. Phase 2 adds **no** `admin_alerts` code, **no** catalog lockstep. (A reviewer asking for a new code is out of contract — the new column rides the existing projection read.)
3. **`run_of_show` is `DateRestriction`-gated exactly like the Schedule day set** — the projection drops keys the viewer can't see; `unknown_asterisk` sees none. Same trust boundary as Phase 1's Schedule (no new gate to design).
4. **Per-day mutual exclusivity** (run-of-show XOR anchor strip) — one day never renders both.
5. **Hero untouched** — `RightNowHero`/`buildRightNowContext`/`selectRightNowState` consume `dates` + anchors only; the run-of-show enriches Schedule, not the hero (D-8).
6. **Phase boundary** — Phase 2 ships only after Phase 1's Schedule section + `resolveKeyTimes` exist; the enrichment branch and its fallback both depend on the Phase-1 anchor strip being present.

---

## 8. Implementation shape (for writing-plans)

Continues on `feat/crew-page-redesign` (or a Phase-2 branch off it), ~3 small phases — **all after Phase 1 merges**:

1. **Parser + types** — `parseAgenda` block (TDD: filled grid, fail-soft matrix, every-existing-fixture-null) + `AgendaEntry`/`ShowRow.run_of_show` types + a synthetic filled-AGENDA fixture. No UI, no DB.
2. **Migration + projection** — `shows.run_of_show jsonb` migration (reaching validation + manifest regen) + sync write path + `getShowForViewer.runOfShow` with the `DateRestriction` intersection + the `tileErrors["run_of_show"]` fail-soft hook. TDD: migration/projection/gating tests.
3. **Schedule enrichment + close-out** — the per-day run-of-show branch in the Schedule `*Section` (sentinel hiding, caps, URL-strip, per-day mode test, anchor-strip-no-regression test); **impeccable dual-gate** (UI surface) + adversarial review + real CI; merge. UI throughout → Opus implements (UI-always-Opus).

**Meta-test inventory:** EXTENDS `_metaSentinelHidingContract` coverage (already walks `components/crew/` from Phase 1 — the new field reads must import `shouldHideGenericOptional`); EXTENDS `CardinalityCapBoundary` to the run-of-show list; the migration is covered by `validation-schema-parity`. **No** `_metaAdminAlertCatalog` change (no new code). No advisory-lock surface (read path + a single-column sync write inside the existing per-show lock).

---

## 9. Phase boundary

Phase 1 (the IA shell + Schedule anchor strip + projection-alert observability) is the foundation; Phase 2 is a **strictly additive** enrichment that degrades to the Phase-1 anchor strip wherever the AGENDA tab is empty or malformed (i.e. almost everywhere today). If Phase 2 is deferred, Phase 1 ships complete and correct on its own.
