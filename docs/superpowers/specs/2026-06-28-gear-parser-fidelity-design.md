# Gear Parser-Fidelity — Design Spec

**Date:** 2026-06-28
**Status:** Draft (autonomous-ship pipeline; user spec/plan review gates waived per AGENTS.md autonomous-ship gate)
**Author:** Claude Code (Opus) — orchestrator session
**Routing:** Opus / Claude Code (parser is the bulk, but `GearSection` + `emptyState.ts` are UI surfaces → UI-always-Opus hard rule).

---

## 1. Problem statement (verified diagnosis)

The crew "Gear" section (`components/crew/sections/GearSection.tsx`, `data-testid="section-gear"`) renders four data domains: per-room A/V/L scope, pack list, keynote requirements, opening reel. A user report ("gear is not reliably parsed and/or making it to the relevant surfaces") was investigated end-to-end and **confirmed**. Three distinct parsing bugs drop gear before it reaches the surface:

### Bug 1 (dominant) — the GEAR tab is exported but never parsed

Modern shows (the v4 "GEAR-tab" schema family — RPAS Central 2026, Fixed Income Trading Summit 2025, all 2025-10/2026 shows) put **all** per-room A/V/L equipment in a dedicated `GEAR` tab: an `Item | …rental-date columns…` date-grid. The INFO room blocks for these shows carry only Setup/Set/Show/Strike times, **no** A/V/L rows.

- The GEAR grid **reaches the parser's input.** Proof: `fixtures/shows/exporter-xlsx/rpas.md:147-148` (the production `synthesizeMarkdownFromXlsx` path) emits `| | | Rental Dates | … |` then `| Item | Item | 21-Mar | … | 27-Mar |`, followed by room sub-headers (`| GENERAL SESSION - GRAND BALLROOM A/B | … |`) and equipment rows (`DIGITAL AUDIO CONSOLE - QU32`, `(4) BLIZZARD LED BARS`, etc.). Same in `fixed-income.md:122-145`. The exporter (`lib/drive/exportSheetToMarkdown.ts:194-209`) emits every tab except `OLD`-named ones, but **discards tab names** (`:209` joins table markdown with no tab-name header).
- **No parser consumes it.** `parsePullSheet` accepts a table only when **all** header cells contain `"PULL SHEET"` (`lib/parser/pull-sheet.ts:60`); the GEAR header matches neither that nor the deliberate `PULLED`+`INITAL` rejection (`:52`), so the grid is silently skipped → `pullSheet = null`. `parseRooms` only reads `GENERAL SESSION` / `BREAKOUT N` / `ADDITIONAL ROOM` INFO blocks (`lib/parser/blocks/rooms.ts`), so room A/V/L scope is empty.

**Effect:** for the entire modern show family the Gear section is blank or near-blank. End-to-end render proof: the committed admin-preview screenshot `public/help/screenshots/crew-preview-gear-mobile-light.webp` (RPAS Central 2026, captured through the real `ln` projection + real `GearSection`) renders **only** "Opening reel: MAYBE" — no scope, no pack list, no keynote — despite the live GEAR tab listing a Barco projector, QU32 console, AB168, 17 mics, LED Lekos, and Blizzard uplights. (Full-corpus `parseSheet()` run over all 17 committed fixtures [10 raw + 7 exporter-xlsx]: 9 fixtures report `rooms > 0` but `scope 0/0/0`; 14/17 report `pullSheet = null`.)

### Bug 2 — EVENT DETAILS value block dropped on older "form-layout" sheets

Older 2025 shows (`2025-10-consultants-roundtable.md` [LIVE], `2025-03-dci-rpas-central.md` [fixture-only], `2025-04-asset-mgmt-cfo-coo.md` [fixture-only]) use a vertical "CLIENT INTAKE FORM" layout where EVENT-detail fields are a headerless `| field-label | value |` run (`2025-10-consultants-roundtable.md:261` = `| Keynote Requirements | TBD |`). `parseEventDetails` yields `event_details = {}` for all three — confirmed via `parseSheet()`: 0 event keys, while controls East Coast (13 keys, `keynote="NONE"`, `reel="YES - LOOP VIDEO"`) and RPAS (17 keys, `keynote="TBD"`, `reel="MAYBE"`) parse fully.

Two compounding causes (both verified in code):
1. **Header matches the wrong block, then breaks before the values.** `EVENT_DETAILS_HEADER_RE` (`lib/parser/blocks/event.ts:39`, matched at `:132`) matches the *label-only* `| DETAILS |` column (`2025-10-consultants-roundtable.md:17`). Its rows are all single-column, so every one is skipped (`event.ts:206`). The block-scan then **breaks at the first blank/non-pipe line** after that small table (`event.ts:142` — `if (inBlock) break`), so the real value block (`:235`+) is never reached. Net: zero keys harvested → `{}`. (Confirmed: `parseSheet` reports 0 event keys, so no value-block row is processed at all.)
2. **Terminator collision (secondary hazard for the fix).** The room-header terminators `/^GENERAL SESSION\b/` and `/^BREAKOUT \d/` (`lib/parser/blocks/event.ts:165`, alongside `TERMINATING_LABELS` at `:43`) match the *title-case form fields* `General Session Room Name` / `Breakout Room Name(s)` in the value block — so naive harvesting of that block would still cut off before `Keynote Requirements`.

**Effect:** keynote, opening reel, and ~13-15 other event fields drop for these shows (incl. live Consultants Roundtable 2025).

### Bug 3 — secondary, narrower drops

- **3a — East Coast lighting orphan row.** `2024-05-east-coast-family-office.md:57` holds `(2) Lekos for Stage Wash (6) Blizzard LED Uplights` in an **unlabeled continuation row** (col0 empty), between `GS Scenic` (`:56`) and `GS Other` (`:58`). `rooms.ts` keys A/V/L by the col0 label, so this lighting value is dropped (`parseSheet` reports East Coast `audio=3 video=3 lighting=0` in both fixture families).
- **3b — 8-column PULL SHEET degradation.** East Coast's real PULL SHEET rows are ~8 columns (`[FALSE,qty,item,subcat,CAT,'',0,seq]`), but `parseDataRows` requires exactly 5 (`lib/parser/pull-sheet.ts:176` → `cells.length !== 5` → `PULL_SHEET_AMBIGUOUS_FORMAT` raw-snippet fallback, qty/cat lost).
- **3c — dash sentinel.** `-` / `—` placeholders (RIA breakout `BO Audio='-'`, `BO Lighting='-'`) are not in `GENERIC_OPTIONAL_HIDE` (`lib/visibility/emptyState.ts:52`) → render as visible empty values.

---

## 2. Resolved decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **GEAR equipment surfaces on the A/V/L scope cards** (not pack list, not a new card) | GEAR tab is room-organized → maps 1:1 to the rooms model; directly fills the verified empty-scope gap; reuses existing render + "Your scope" emphasis. |
| D2 | **Preserve everything** — classify into `audio`/`video`/`lighting`/`scenic`/`other` (nothing dropped) | User decision. Reuses **existing** `rooms` columns — no DB migration. |
| D3 | **Classification = package-headers + closed allow-lists** | Honors the project closed-vocab rule (`feedback`-tier lesson: open-ended prose discrimination is "unwinnable"; closed allow-list is bypass-proof). A collision tripwire meta-test guards the registry. |
| D4 | **Quantity prefix kept** — column value built as `(N) ITEM` summary | Reproduces the legacy INFO scope-cell format; `N` from the item name's leading `(N)` if present, else the max non-empty per-date quantity. |
| D5 | **Scenic + Other = separate cards**, each auto-omitted when it has no non-sentinel content | Reuses the existing per-discipline card model exactly (no special-casing). |
| D6 | **No DB migration, no projection change** | `rooms` already has `audio/video/lighting/scenic/power/digital_signage/other/notes` (`lib/parser/types.ts:164-171`); `ln` already projects all of them (`lib/data/getShowForViewer.ts:468-486`). |
| D7 | **Lightweight internal parse warning** for unmatched GEAR rooms (`GEAR_TAB_ROOM_UNMATCHED`), mirroring `PULL_SHEET_AMBIGUOUS_FORMAT` | Surfaces silent classification/match misses in the admin parse-warnings list **without** the heavy §12.4 operator-actionable-code 6-surface lockstep. Promotion to operator-actionable + deep-link is an explicit DEFERRED follow-up. |
| D8 | **Pack-list date gate and the GEAR `PULLED`+`INITAL` rejection are CORRECT and UNTOUCHED** | The date gate (`isPackListVisibleToday`) was refuted as the user's complaint; the `PULLED`+`INITAL` rejection (`pull-sheet.ts:52`) deliberately excludes equipment-inventory tables and a half-filled RIA template stub. Neither changes. |

---

## 3. Architecture

### 3.1 New module: `lib/parser/blocks/gear.ts`

Exports `parseGearTab(markdown: string, agg?: ParseAggregator): GearRoom[]` where `GearRoom = { kind: RoomRow["kind"]; name: string; audio: string | null; video: string | null; lighting: string | null; scenic: string | null; other: string | null }`.

**Scope of supported shape (IMPORTANT — verified against committed fixtures).** The GEAR parser targets the **exporter-xlsx (prod `synthesizeMarkdownFromXlsx`) grid shape** — the production ingestion path. The **raw-family GEAR grid is explicitly out of scope**: the legacy MCP converter mangles it — item *names* are replaced by `NO_HEADER` headers and only bare quantity columns survive (`fixtures/shows/raw/2026-03-rpas-central-four-seasons.md:201-217`), so the data is unrecoverable. The parser must **gracefully no-op** on the raw shape (no corrupted scope), and GEAR-parser correctness is asserted against the exporter-xlsx fixtures (`consultants.md`, `rpas.md`, `fixed-income.md`). Tested explicitly (anti-corruption assertion on the raw shape).

**Detection (structural, separator-tolerant):** scan for the GEAR grid signature — a row whose cells are all (or majority) `Rental Dates`, followed (allowing intervening markdown alignment `:---:` rows and blanks — NOT requiring immediate adjacency; consultants interposes a `:---:` row, `exporter-xlsx/consultants.md:139-141`) by an `| Item | Item | <date> … |` header row (date tokens like `4-Oct`/`21-Mar`). If absent → return `[]`. There is no tab-name signal (exporter discards names), so content shape is the only key.

**Per-room segmentation (structural room-header detection, NOT a fixed name vocabulary).** Between the `Item` header and the `BACK TO INFO` sentinel, a **room sub-header** is a doubled-title row (col0 non-empty, col0===col1 or col1 empty, no quantity columns) immediately followed by a 2-column `:---:` alignment row — the exporter's per-room mini-table shape. This deliberately does NOT hard-code `GENERAL SESSION`/`BREAKOUT`/`ADDITIONAL`: real committed fixtures use bare/alternate room headers — `FOYER`, `LUNCH ROOM …`, and **unnumbered** `BREAKOUT SESSION 1 - LASALLE` (`exporter-xlsx/consultants.md` GEAR section). A row that exactly matches the closed **package-header set** (SOUND SYSTEM PACKAGE / STAGE LIGHTING PACKAGE / UPLIGHTING PACKAGE) is a bucket switch, checked BEFORE room-header detection so it is never mistaken for a room. All other non-empty col0 rows are equipment items in the active room+bucket. Markdown alignment rows (`| :---: | … |`) are skipped everywhere. The duplicated item column is handled: take col0 as the item; if col1 equals col0 (exporter doubling) skip it; treat remaining non-empty numeric cells as per-date quantities. The exact row-classification rules are **pinned by tests against the exporter-xlsx fixtures**, which exhibit the alignment-row, bare/unnumbered room-header, package-header, and doubled-column variants.

**Room matching (match on the room-NAME token, NOT the breakout index — verified hazard).** The breakout **numbers are scrambled** between the INFO and GEAR tabs: consultants GEAR has `BREAKOUT SESSION 1 - LASALLE` / `2 - DELAWARE` while INFO has `BREAKOUT 1 DELAWARE` / `2 LASALLE` (`exporter-xlsx/consultants.md`). Matching by `BREAKOUT N` index would attach LASALLE's gear to DELAWARE's room — silent corruption. Therefore matching strips the room-type prefix (`BREAKOUT[ SESSION] \d+`, `GENERAL SESSION`, `LUNCH (ROOM|SESSION)`, `ADDITIONAL ROOM`) and any trailing `Dimensions`/`Floor` suffix (mirroring `rooms.ts:342`'s strip), then matches on the **normalized remaining room-name token** (e.g. `LASALLE`, `GRAND BALLROOM A/B`). **Exact normalized name-token match only** — on any non-exact match the GEAR room is appended as a NEW room (kind inferred from the header word: `breakout`/`general`/`additional`; default `additional`) and emits `GEAR_TAB_ROOM_UNMATCHED` (D7). Never fuzzy-guess a match (a wrong match corrupts; an appended room is recoverable and warned). Consequence: `FOYER` (no INFO peer) and `LUNCH SESSION - GRAND BALLROOM C` (INFO `LUNCH ROOM BALLROOM C` — name token differs: `GRAND BALLROOM C` ≠ `BALLROOM C`) append as new rooms + warn; the four named breakouts and the GS room match by token. This is pinned by the consultants test.

### 3.2 Classification registry: `lib/parser/gearClassification.ts`

A closed registry mapping → discipline:

- **Package-header buckets** (Doug's own grouping, the primary signal): a row whose item text exactly matches a package header switches the active bucket for the items beneath it until the next package header or room boundary.
  - `SOUND SYSTEM PACKAGE` → `audio`
  - `STAGE LIGHTING PACKAGE`, `UPLIGHTING PACKAGE` → `lighting`
- **Ungrouped items** (no active package bucket): matched against tight closed keyword allow-lists.
  - `audio`: SPEAKER, CONSOLE, MICROPHONE, MIC, SNAKE, AUDIO, ANTENNA, QU32, QU24, AB168, KLA, K8, K10, GOOSNECK/GOOSENECK
  - `video`: PROJECTOR, SCREEN, MONITOR, SWITCHER, LAPTOP, CAMERA, EIKI, BARCO, POINTER, MATRIX, COUNTDOWN CLOCK, CONFIDENCE MONITOR
  - `lighting`: LEKO, UPLIGHT, LED BAR, LED BARS, DMX, LIGHTRONICS, LIGHTING, BLIZZARD
  - `scenic`: SPANDEX, LOGO, BRANDING, BACKDROP, SCENIC, TRUSS PODIUM, PODIUM
- **Unmatched** → `other` (truss, cabling, mounting hardware, ZOOM/PTZ backup, misc) — nothing dropped (D2).

Within a room+discipline the matched item summaries join into a single `(N) ITEM` string (D4), order-preserving.

**Collision tripwire** (`tests/parser/gearClassificationRegistry.test.ts`): asserts no keyword appears in more than one discipline allow-list and no allow-list keyword equals a package-header token. Same structural-defense shape as the typo-tolerance registry guard.

### 3.3 Integration point

In `parseSheet` (`lib/parser/index.ts`), after `const rooms = parseRooms(markdown, version, agg)` (`:389`):

```
const gearRooms = parseGearTab(markdown, agg);
const rooms = mergeGearIntoRooms(parsedRooms, gearRooms);  // fill-don't-clobber
```

`mergeGearIntoRooms`: for each GEAR room matched by `(kind,name)`, for each of `audio/video/lighting/scenic/other`, set the room column **only when the existing INFO-derived value is null** (fill-the-gap; never overwrite a non-null INFO value). Unmatched GEAR rooms append. In practice a show is INFO-inline *or* GEAR-tab (never both populated for the same discipline), so this is fill, not conflict resolution — but the rule is explicit and tested.

### 3.4 Bug 2 fix (`lib/parser/blocks/event.ts`)

Add a **form-layout fallback** to `parseEventDetails`: when the classic-header path harvests zero keys (the verified consultants case), run a document-wide scan for a contiguous run of `| label | value |` rows whose col0 normalizes to a known event-field key (via `CANONICAL_KEY_MAP` keys / `EVENT_LABEL_VOCAB`, `event.ts:60`/`:107`) and harvest those. The fallback must not inherit the blank-line break against the value block and must distinguish form fields from room headers: tighten the terminators (`event.ts:165`) so `/^GENERAL SESSION\b/` and `/^BREAKOUT \d/` fire only on an **ALL-CAPS** room-header shape (`GENERAL SESSION GRAND BALLROOM A/B`), not the title-case form field `General Session Room Name`. The classic-header path stays byte-for-byte unchanged when it already produces keys (negative-regression pinned: East Coast/RPAS).

**`Opening Sizzle Reel` alias (required for the target fixture).** The live form-layout opening-reel value is keyed on **`Opening Sizzle Reel`**, not `Opening Reel` (`fixtures/shows/raw/2025-10-consultants-roundtable.md:264` = the actual reel status; also present in `ria`, `fixed-income`, `redefining` raw fixtures). `CANONICAL_KEY_MAP` (`event.ts:64`) currently has only `"opening reel" → opening_reel`. **Add `"opening sizzle reel" → opening_reel`** so both the classic path and the form fallback recover it. This is a single CANONICAL_KEY_MAP addition (serves both paths) and flows into the derived `EVENT_LABEL_VOCAB` (`event.ts:107`) automatically. **Precedence when a sheet has BOTH labels** (e.g. `fixed-income` raw: `Opening Reel | TBD` and `Opening Sizzle Reel | No`): the existing sentinel-aware `writeField`/`exactReal` precedence (`event.ts:171-177`) governs — a real value displaces a sentinel, last-real-write-wins. Pin with a negative-regression test so the behavior on dual-label shows is explicit and stable.

### 3.5 Bug 3 fixes

- **3a** (`rooms.ts`, GS-block field parsing around `parseGsRoom`/`applyGsLabel` `:508-607`): when a row has an empty col0 (unlabeled continuation) and a non-empty value, append its value to the immediately-preceding labeled A/V/L/scenic field (space-joined). Guarded: only append to the directly-preceding labeled field within the same room block; never cross a room boundary or attach to a non-field row.
- **3b** (`pull-sheet.ts` variant detection `:137-202`): recognize the 8-column Variant-A shape `[FALSE,qty,item,subcat,CAT,'',0,seq]` and map qty/item/cat/subcat by position instead of collapsing at `cells.length !== 5`. The exact-5 path stays for the canonical shape; the 8-col path is additive.
- **3c** (`emptyState.ts:52`): add `"-"` and `"—"` to `GENERIC_OPTIONAL_HIDE`. (Leaves `OPENING_REEL_HIDE` untouched — `-` is not a reel status.)

### 3.6 Render (`components/crew/sections/GearSection.tsx`)

Extend the `DISCIPLINES` array (`:80-104`) with `scenic` (heading "Scenic", lucide `Frame` icon) and `other` (heading "Other gear", lucide `Boxes` icon) after `lighting`. Each new card reuses the exact existing machinery: `shouldHideGenericOptional` per-value filter, omit-when-zero-rows, `SourceLink`, `KeyValueRows`. **Emphasis stays A/V/L-only** — `viewerDisciplines` (`:113-119`) is unchanged, so Scenic/Other are always neutral (no `data-emphasis`). `CARD_REGION_MAP` (`lib/sheet-links/buildSheetDeepLink.ts`) gains `gear-scope-scenic` / `gear-scope-other` → `rooms` RegionId (mirroring the existing `gear-scope-audio/video/lighting` entries).

---

## 4. Data flow & dimensional invariants

**Flow:** sheet → `synthesizeMarkdownFromXlsx` (exporter) → `parseSheet` (`parseRooms` + `parseGearTab` + `mergeGearIntoRooms`; `parseEventDetails` form fallback) → `rooms` / `event_details` persisted (existing columns) → `ln` projection (`getShowForViewer.ts:468-486`, unchanged) → `GearSection` (new Scenic/Other cards).

**Dimensional invariants:** the new Scenic/Other cards live in the existing `gear-scopes-row` responsive grid (`GearSection.tsx:217-269`): `grid grid-cols-1 gap-3 min-[720px]:grid-cols-3`. CSS grid defaults to `align-items: stretch`, so same-row cards share height (the spec already relies on this and avoids the Tailwind-v4 `.flex`-no-stretch trap). **No new fixed-dimension parent is introduced** — the new cards are additional grid items of the same kind, so the existing layout assertion covers them. With 5 possible cards the grid wraps to a second row ≥720px (3 + 2); each card keeps `min-w-0`. Invariant to verify: every rendered `gear-scope-*` card's height equals its grid cell's height (existing `h-full`/`flex flex-col` item wrapper at `:228-244`).

**Transition inventory:** scope cards appear/disappear based on data presence only; there is no mode toggle or animated transition on this surface (cards are server-rendered, present-or-absent). All card appear/omit transitions are **instant — no animation needed** (consistent with the existing A/V/L cards, which have none). Compound transitions: none (no client-side state in GearSection scope rendering).

---

## 5. Guard conditions (every new input)

- `parseGearTab(markdown)`: empty/whitespace markdown → `[]`. No GEAR signature → `[]`. Grid present but zero room sub-headers → `[]` + (optionally) a warning. Room block with zero classifiable items → that room contributes no columns. A date-qty cell that is non-numeric/blank → ignored for qty (item still listed name-only). Item name empty after trim → row skipped.
- `mergeGearIntoRooms(rooms, gearRooms)`: `gearRooms` empty → returns `rooms` unchanged. GEAR room matches multiple INFO rooms by name token → match the first, warn. Existing column non-null → not overwritten. **Appended (unmatched) GEAR rooms carry ONLY gear columns** (`audio/video/lighting/scenic/other`); `setup`/`set_time`/`show_time`/`strike_time`/`dimensions`/`floor` are null, so they stay inert in non-gear surfaces — `deriveScheduleBookends` keys Strike on `strike_time` (`lib/parser/index.ts:463`), which is null → no spurious schedule entry. Pinned by a defensive test (appending `FOYER` adds no run-of-show bookend).
- Classification: item matching no allow-list and under no package header → `other` (never dropped, never throws). `(N)` parse: malformed leading paren → treat as no-embedded-qty, fall back to date-column max; no qty anywhere → name-only.
- `parseEventDetails` form fallback: classic path already produced keys → fallback does not run (no double-harvest). Form run with zero known-field rows → `{}` (unchanged from today). A label that is both a known event field and a room header (none currently) → known-field set wins.
- Render: a room whose `scenic`/`other` is `null` or a sentinel → that card omits that room's row; a discipline with zero rows across all rooms → card omitted entirely (existing `:144` behavior, extended). `data.rooms` empty → all scope cards omit (existing).

---

## 6. Testing strategy

TDD per task (failing test → minimal impl → passing → commit). Anti-tautology: expected values derived from fixture rows, never hardcoded; each test names the concrete failure mode it catches; assertions target `parseSheet` output (data source), not the rendered container.

- **`tests/parser/gear.test.ts`** — parse GEAR grid from `exporter-xlsx/{rpas,fixed-income,consultants}.md` (prod path): assert GS room gets non-empty `audio` (contains "QU32"), `video` (contains "BARCO"/"EIKI"), `lighting` (contains "LEKO"/"BLIZZARD"/"LIGHTRONICS"), `scenic` (contains "SPANDEX"), and `other` (non-empty); assert breakout rooms get their projector/screen/laptop into `video`. **Consultants variants (Codex R1):** assert detection tolerates the `:---:` row between `Rental Dates` and `Item` (`consultants.md:139-141`); assert the bare `FOYER` room header and the **unnumbered** `BREAKOUT SESSION 1 - LASALLE` open rooms (matched to INFO `BREAKOUT 1 LASALLE`, or appended + `GEAR_TAB_ROOM_UNMATCHED` for `FOYER`). Assert `(kind,name)` matching does not double the room count. Assert qty extraction (`WIRELESS TABLETOP MICROPHONE` → `(25)` for consultants / `(17)` for rpas from the date column). Failure mode: GEAR grid silently skipped (current bug) + room folding/skipping on variant headers.
- **`tests/parser/gear.test.ts` (raw anti-corruption)** — assert the **mangled raw-family GEAR grid** (`raw/2026-03-rpas-central-four-seasons.md`, `NO_HEADER` + names-stripped) produces NO populated A/V/L/scenic/other (graceful no-op), so the out-of-scope raw shape never corrupts room scope. Failure mode: parser mis-reading `NO_HEADER`/quantity-only rows as equipment.
- **`tests/parser/gearClassificationRegistry.test.ts`** — collision tripwire (D3).
- **`tests/parser/event.test.ts`** (or extend `unknownSection.test.ts`) — consultants form-layout → `event_details.keynote_requirements === "TBD"`, **`event_details.opening_reel` contains the `consultants:264` "Opening Sizzle Reel" value** (`Available if needed…`), ≥10 keys total; assert the terminator no longer cuts at `General Session Room Name`. **`Opening Sizzle Reel` alias + dual-label precedence (Codex R1):** assert a fixture with both `Opening Reel` (sentinel) and `Opening Sizzle Reel` (real) resolves `opening_reel` to the real value (sentinel-aware precedence, `event.ts:171-177`); add the alias to the registry/collision guard. **Negative-regression:** East Coast (13 keys, `keynote="NONE"`, `reel="YES - LOOP VIDEO"`) and RPAS (17 keys, `keynote="TBD"`, `reel="MAYBE"`) classic-header shows unchanged. Failure mode: whole EVENT block drop (current bug) + `Opening Sizzle Reel` miss + over-eager fallback clobbering classic shows.
- **Secondary:** East Coast `rooms[GS].lighting` contains "Lekos"/"Blizzard" (3a); East Coast pull sheet yields structured items with non-null qty/cat, not raw snippets (3b); a room with `audio='-'` hidden by `shouldHideGenericOptional` (3c).
- **Full-corpus audit regression** (`tests/parser/gearCorpusAudit.test.ts`): run `parseSheet` over all `fixtures/shows/{raw,exporter-xlsx}/*.md`; assert the confirmed GEAR-tab shows (`rpas`, `fixed-income` — grids verified at `exporter-xlsx/rpas.md:147`, `fixed-income.md:122`) now report `≥1` room with non-empty audio OR video OR lighting (other GEAR-grid shows like `fintech`/`consultants` improve as a bonus where a grid is present), and the form-layout shows (consultants) have non-empty `event_details`. Asserts against `parseSheet` output (anti-tautology).
- **Render** (`tests/components/crew/sections/GearSection.test.tsx`): Scenic/Other cards render when populated, omit when empty (derive a fixture room with scenic set); add the currently-missing keynote-card coverage. jsdom suffices (card presence/omission; no new fixed-dimension parent — existing layout harness covers the grid). Negative: a room with all-sentinel scenic → Scenic card omitted.

**Meta-test inventory:** CREATES `tests/parser/gearClassificationRegistry.test.ts` (allow-list collision tripwire). None of the auth / Supabase call-boundary / admin-alert (`_metaAdminAlertCatalog`) / advisory-lock (`advisoryLockRpcDeadlock`) / no-inline-email metas apply — this milestone touches parser + render only, no DB writes, no advisory locks, no email, no admin alerts.

---

## 7. Blast radius & cross-cutting

| Concern | Status |
|---|---|
| DB migration / `validation-schema-parity` | **None** — existing columns (`types.ts:164-171`) + existing `ln` projection (`getShowForViewer.ts:468-486`). |
| Advisory locks / Supabase boundaries / email canonicalization / admin alerts | **None touched.** |
| Parser change | Re-stages ingested shows once on next sync (MI-7b, by design — see `feedback_parser_rename_restages_via_mi7b`). |
| §12.4 catalog (operator-actionable codes) | **No new operator-actionable code.** `GEAR_TAB_ROOM_UNMATCHED` is an internal `ParseWarning` mirroring `PULL_SHEET_AMBIGUOUS_FORMAT` — no §12.4 / `gen:spec-codes` / `catalog.ts` lockstep. (Promotion to operator-actionable + deep-link → DEFERRED.) |
| UI surfaces | `GearSection.tsx` (Scenic/Other cards), `emptyState.ts` (dash sentinel), `buildSheetDeepLink.ts` (CARD_REGION_MAP entries) → **invariant-8 impeccable dual-gate** (critique + audit) on the diff; HIGH/CRITICAL fixed or DEFERRED. |
| Crew-preview screenshots | `crew-preview-gear-mobile-{light,dark}.webp` will drift (RPAS now shows real A/V/L) → **regen** via the screenshots workflow (bot-commit `action_required` re-author gotcha). |
| Routing | Opus / Claude Code owns the whole milestone (UI-always-Opus). |

---

## 8. Disagreement-loop preempts (EXPLICITLY DO NOT RELITIGATE)

- **The pack-list date gate (`isPackListVisibleToday`) is correct and untouched.** It was investigated and refuted as the user's complaint (14/17 fixtures parse `pullSheet=null`, so the gate rarely receives data). D8.
- **The GEAR-table `PULLED`+`INITAL` rejection (`pull-sheet.ts:52`) stays.** It deliberately excludes equipment-inventory tables and the half-filled RIA template stub. The GEAR-tab **date-grid** (a different shape) is handled by the new `parseGearTab`, not by relaxing this rejection. D8.
- **Closed-vocab classification is intentional, not laziness.** Per the project's hard-won lesson, open-ended audio/video/lighting prose discrimination is unwinnable; package-headers + closed allow-lists is the structural defense, guarded by the collision tripwire. D3.
- **No DB migration is intentional and verified** — the columns and projection already exist. D6.
- **`other`/`scenic` items are preserved by design** (user decision D2); not dropping them is the requirement, not over-scoping.
- **`GEAR_TAB_ROOM_UNMATCHED` is intentionally a lightweight internal warning, not a §12.4 operator-actionable code** — promotion is a deliberate DEFERRED follow-up to keep this milestone's surface bounded. D7.
- **The raw-family GEAR grid is intentionally out of scope.** The legacy MCP converter mangles it (`NO_HEADER`, item names stripped — `raw/2026-03-…:201-217`); the data is unrecoverable and the raw family is NOT the production ingestion path (`synthesizeMarkdownFromXlsx`/exporter-xlsx is). The parser no-ops on it (anti-corruption test), and GEAR correctness is asserted against exporter-xlsx fixtures. This is a scoping decision, not a gap. (Codex R1.)

---

## 9. Out of scope

- Promoting `GEAR_TAB_ROOM_UNMATCHED` to an operator-actionable §12.4 code with deep-link (DEFERRED).
- Surfacing rental-date schedule information (the per-date quantity columns are used only for the `(N)` summary; the dates themselves are not surfaced).
- A dedicated "Room gear" / pack-list rendering of GEAR data (D1 chose A/V/L scope cards).
- **Parsing the raw-family (legacy MCP) GEAR grid** — mangled beyond recovery (`NO_HEADER`, names stripped); exporter-xlsx is the prod path. Parser no-ops on it (tested).
- Opening-reel video-player latent failure modes (non-video Drive file → silent null; unguarded `getFile()` throw) — separate, pre-existing, file to BACKLOG.
- Any change to `getShowForViewer`/`ln` projection or DB schema.

---

## 10. Numeric sweep targets (self-review)

Values to keep single-sourced and cross-checked: 5 disciplines (audio/video/lighting/scenic/other); 4 discipline allow-lists in the registry (scenic uses package + allow-list; "other" is the catch-all, no allow-list); 3 bugs (1 dominant + 1 + 3 sub-fixes 3a/3b/3c); CASE_CAP 12 (pack list, unchanged); 17 fixtures (10 raw + 7 exporter-xlsx); 14/17 pullSheet=null; 9 rooms>0-but-0/0/0; event-key control counts (East Coast 13, RPAS 17); 3 package headers (SOUND SYSTEM / STAGE LIGHTING / UPLIGHTING); 2 new CANONICAL_KEY_MAP aliases referenced (existing `opening reel` + new `opening sizzle reel`); exporter-xlsx is the supported GEAR shape (raw out of scope).
