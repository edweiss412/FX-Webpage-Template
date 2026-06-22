# Tile → Source-Sheet Deep Links — Design Spec

- **Date:** 2026-06-21
- **Status:** Draft (self-review + adversarial R1–R4 applied; pending adversarial re-review)
- **Branch / worktree:** `worktree-tile-source-deeplinks`
- **Author:** Opus 4.8 (Claude Code), orchestrated session

---

## 1. Summary

Every crew-page **source-backed card** gains a subtle "In sheet ↗" link that opens the show's Google Sheet at the region the card's data was parsed from (its **primary** region for the few multi-source cards — §8.2.1). The crew member taps it to **verify a value against the source** in one motion (e.g. "the app says my call time is 8:15 — is that really what the sheet says?").

The link lands as precisely as the underlying sheet layout *honestly* allows — a tab + A1 **region range** for most data, a near-cell anchor for the genuinely tabular AGENDA grid — and **degrades gracefully** (range → tab → whole-spreadsheet) so it is never broken or disabled.

---

## 2. Background & motivation

This spec is grounded in two live-code + live-sheet explorations performed 2026-06-21 (worktree `tile-source-deeplinks`):

1. **Provenance-chain exploration** — confirmed source-cell coordinates are discarded across `Sheet → export → parse → DB → projection → tile`. The parser input is a flat markdown string (`lib/parser/index.ts:317` `parseSheet(markdown: string)`); every parsed type is value-only (`lib/parser/types.ts`); the DB stores only values; the projection surfaces only `drive_file_id`-class identifiers. `docs/superpowers/plans/BACKLOG.md` records "No source-cell provenance" as an intentional, deferred decision.

2. **Full-corpus sheet sweep** — profiled all live "raw" sheets (per D11). Verdict: **Tier 3 (tab + A1 region range) is the right universal precision target, confirmed high-confidence.** Cell-exact (one source cell per rendered field) is rejected because it is, corpus-wide, **semantically wrong** (one packed multi-value cell backs many fields) and **brittle** (anchors drift several rows between sheets and the two format eras). See §10 and §15.

### 2.1 Why the value is real (and why coarse links are not enough)

For the legacy single-`INFO` sheets (per D11), **all** sections are parsed from one `INFO` tab. A whole-spreadsheet or even tab-level link drops the crew member at the top of a long `INFO` tab — useless for verifying a specific value. Only an **A1 region range** lands them on the right rows. This is why a "tab-level first" phase was rejected in favor of building region-range capture directly (within a graceful-fallback architecture).

---

## 3. Resolved decisions (single source of truth)

Every later section references these; do not restate literals elsewhere.

| # | Decision | Value |
|---|---|---|
| D1 | Audience | **Crew-facing**, link **always shown to all crew** (no role gate on the link itself). The link still renders only where its card renders — so the Budget link appears only in the already-lead-gated `BudgetSection` (an existing gate, not new work). |
| D2 | Why always-shown is safe | Doug already shares the raw sheet link with all crew, ungated by role. App role-gating is **additive UI**, not a boundary on the sheet. The deep link exposes nothing crew can't already open, and crew have view access (no "request access" wall). |
| D3 | Scope | **All seven sections**; **every source-backed card** that renders parsed sheet text gets a link (§8). Composite/dashboard cards and Drive-asset embeds are explicitly out of scope (§8.3). |
| D4 | Job | **Verify / trust** a rendered value against the source |
| D5 | Affordance unit | **One subtle link per source-backed card**, anchored to the card's **primary** parser source-region (§8.1.1) — not per row, not per field. The header link is **card-level**: it lands at the card's primary region. The few cards that render fields from >1 region (§8.2.1) link to their primary region; their secondary fields are **documented as not precisely anchored** (the link is scoped to the primary data). Cards that share a source-region share its anchor. |
| D6 | Precision target | **Tier 3**: tab + A1 region range, with opportunistic near-cell anchoring only for the AGENDA grid |
| D7 | Capture architecture | **Region-anchor pipeline**: capture `{title, gid, A1}` at the export seam, thread one anchor per parser source-region, persist in a single JSONB column, build the URL at read time |
| D8 | Fallback ladder | resolved range → tab (`#gid=`) → whole-spreadsheet (`/edit`); link is always live |
| D9 | Link target allowlist | `INFO, AGENDA, GEAR, TRAVEL, PULL SHEET` only — matched by stored tab **title**, enforced at **both** write and read time (§9) |
| D10 | Review process | spec + plan each go to cross-model (Codex) adversarial **APPROVE**, **unlimited rounds**; **user review waived**; then drive implementation → PR → CI → merge (§13) |
| D11 | Corpus composition | 10 live raw sheets (`fixtures/shows/README.md`): **7 legacy** (2024–25 single-`INFO` format) + **3 standardized** (2026 multitab format) |

---

## 4. Non-goals (explicit YAGNI)

- **No per-row or per-field links.** Rejected: a per-row glyph steals width from dense rows (Crew's role line truncates). Verified visually in brainstorming.
- **No cell-exact linking** except the opportunistic AGENDA grid. Rejected corpus-wide (§10/§15).
- **No write-back / "edit in sheet."** Job is verify (D4), not edit. The BACKLOG reverse field→cell mapping is out of scope.
- **No new access control / no link gating.** Per D1/D2. Link rendering follows the existing card gate — if a card does not render (e.g. non-lead viewer on Budget; transport not assigned to viewer), neither does its link. `admin_preview` derives role flags freshly in `getShowForViewer`, so the gate evaluates correctly; no new gating is added.
- **No deep links for composite/derived cards or Drive-asset embeds** (§8.3).
- **No change to what the tiles render.** Only an additive link affordance.

---

## 5. UX contract

### 5.1 The affordance

- A small spreadsheet glyph + short label ("In sheet"), **low-contrast**, placed at each **source-backed card's header** — the `SectionCard` action slot.
- Opens `https://docs.google.com/spreadsheets/d/<drive_file_id>/edit#gid=<gid>&range=<a1>` in a **new tab** with `rel="noopener noreferrer"`. The `a1` value is stored range-only (no sheet-name prefix) and **URL-encoded** (see §5.2 / §6 Hop 5).
- **Card-level scope.** The link lands at the card's **primary** region (§8.1.1). For the two mixed-source cards (§8.2.1) it does not precisely anchor the secondary fields (parking, internet/power, COI) — those live elsewhere in the same workbook, one scroll away. This is acceptable because the entire sheet is one click away regardless (D2); the link's value is getting the viewer to the right area, not a per-field cursor.
- **No per-row glyphs anywhere** (D5).

### 5.2 Fallback ladder (per card) — see D8

`range` is URL-encoded via `encodeURIComponent`, so `A1:C1` → `range=A1%3AC1`.

| Anchor state | URL form | Lands at |
|---|---|---|
| `{title∈allowlist, gid, a1}` | `…/edit#gid=<gid>&range=<encoded a1>` | the region's rows |
| `{title∈allowlist, gid}` (or empty `a1`) | `…/edit#gid=<gid>` | the correct tab (top) |
| anchor missing, or `title∉allowlist`, or no resolvable `gid` | `…/edit` | the workbook (top) |
| no `drive_file_id` | — | **link omitted** (not a dead link) |

### 5.3 Guard conditions (per input)

`buildSheetDeepLink(driveFileId: string | null, anchor?: { title: string; gid: number; a1?: string })`:

- **`drive_file_id` null OR empty string** → **omit** the link (never render `…/edit` against an empty id).
- **`anchor` missing/null** → render at whole-spreadsheet (`…/edit`).
- **`anchor.title` not in the §9 allowlist** (case-sensitive exact match) → **drop to whole-spreadsheet**. This is the read-time enforcement that makes the allowlist real even for stale/corrupted/manually-edited `source_anchors` JSON — `buildSheetDeepLink` never emits a `gid`/`range` for a disallowed tab. (Write-time also drops disallowed titles — §9 — so this should never fire in practice; it is defense-in-depth.)
- **`anchor.gid === 0` is VALID** — the `INFO` tab is `gid 0` (so most legacy blocks are `gid:0`). gid presence is tested with `gid != null` / `typeof gid === "number"`, **never a truthiness check**. A truthy `if (gid)` is a CRITICAL bug that would break every INFO-tab card (the legacy-corpus majority). Only a **null/undefined** gid (not `0`) drops to whole-spreadsheet.
- **`anchor.a1` present but empty string `''`** → treat as `a1` absent; render at the gid-only (tab) rung.
- **`anchor.a1` present but `anchor.gid` null/undefined** → **drop to whole-spreadsheet** (an A1 `range` without a `gid` resolves against the wrong/active tab, so emitting `range` alone is unsafe). Invariant.
- **Card has no data** (card not rendered, e.g. East Coast's empty `TRAVEL` tab, or a sentinel-hidden optional) → the card isn't rendered, so no link.

### 5.4 Dimensional invariant (UI)

The source link lives in a **card header**, never inside a data row. Adding it MUST NOT change the height of any `PersonRow`, `FactRows` row, `KeyValueRows` row, or `KeyTimesStrip` cell. Default implementation: the link sits in the `SectionCard` header action slot using a self-contained `flex shrink-0 items-center` + `h-fit` layout that never sets or stretches row height; **exact Tailwind classes are pinned in the plan's layout-dimensions task** per AGENTS.md. Tailwind v4 here does **not** default `.flex` to `align-items: stretch`, so the header link must not rely on implicit stretch. The real-browser layout test (§12) asserts the dimensional invariant.

---

## 6. Architecture — the region-anchor pipeline

Five hops; **hops 1–3 are the new plumbing**, hops 4–5 are thin.

### Hop 1 — capture the gid + title (sync layer)

The XLSX export carries tab **names**, not Google **gids**. Both are fetched from the Sheets API.

- Widen the fields mask `sheets(properties(title))` → `sheets(properties(sheetId,title))` at `lib/sync/runScheduledCronSync.ts:1549`, and update its pin at `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:51`. (`tests/sync/embeddedImages.test.ts:103` references the mask in a comment — update for consistency.)
- Extend `listSpreadsheetSheets` (`runScheduledCronSync.ts:1540`) to return `{ title, sheetId }[]`, building a `Map<title, gid>`.
- **Contract direction:** Hop 2 does **NOT** call the Sheets API; it receives the `{title→gid}` map as a parameter threaded from a **single** Hop-1 fetch (reusing the existing `listSpreadsheetSheets` call used for DIAGRAMS enrichment in `lib/sync/enrichWithDrivePins.ts` where possible). The plan pins the exact call site to avoid a redundant round-trip (§14 Risk 3).

### Hop 2 — capture the A1 range (export seam — load-bearing)

`lib/drive/exportSheetToMarkdown.ts` already transiently holds everything needed and throws it away:

- `sheetGrid(sheet)` (`:67`) decodes `sheet["!ref"]` (`:68`) via `decode_range` (`:70`) into the tab's A1 bounds, then builds a positionless `CellGrid` (`type CellGrid = string[][]`, `:3`).
- `expandMerges` (`:53`) copies a merged cell's text across its whole span — so the *true* anchor of a merged value is the merge's **top-left** cell (record that, not every covered cell).
- `splitBlocks` (`:89`) cuts blocks at blank rows; `trimBlock` (`:153`) shaves blank edges — both **shift the block's origin** relative to the tab.
- `synthesizeMarkdownFromXlsx(buffer): string` (`:186`) iterates `workbook.SheetNames` (`:194`) and returns `tables.join("\n\n")` (`:209`) — a flat string with no coordinates.

**Change:** thread the (row, col) **origin offset** through `sheetGrid → splitBlocks → trimBlock` so each emitted block knows its top-left and bottom-right cell in the original tab. Change the export's contract from `string` to an **ordered list of anchored blocks**: `{ title, gid, a1Range, kind, markdown }[]` (title = `sheetName`; gid via the Hop-1 map). `a1Range` is the block's `topLeft:bottomRight` in A1 notation, **range-only, WITHOUT a sheet-name prefix** (the tab is identified by `gid`; `title` is carried separately for the allowlist guard); for merge-origin cells the anchor is the merge top-left.

### Hop 3 — associate anchor → parsed source-region (parser seam)

The parser already carries a coarse block identity: `ParseWarning.blockRef { kind: string; index?: number }` (`lib/parser/types.ts:5`), and parses by region in `lib/parser/blocks/*` (crew, venue, dates, hotels, transport, …).

- **Design intent:** the export (Hop 2) becomes the single source of block boundaries; the parser **consumes the pre-split anchored blocks** rather than re-splitting a flat string, so each parser **source-region** (§8.1) records the `{title, gid, a1}` of the block(s) it consumed. The parser records only the `{title, gid, a1}` triple (`a1Range → a1`), discarding `kind` and `markdown` — those are not persisted.
- **This is the principal implementation risk** (§14): keeping the export's block boundaries aligned with the parser's region detection. The plan must pin this alignment with tests and decide the exact mechanism. The spec fixes the *contract* — "every source-region in §8.1 resolves to exactly one `{title, gid, a1}` anchor, or none."

### Hop 4 — persist (write path)

- New column **`shows.source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb`**, keyed by **source-region id** (§8.1), each value `{ title: string, gid: number, a1?: string }`.
- **Write-time allowlist enforcement (§9):** the writer drops any region whose `title` is not in the allowlist before persisting — `source_anchors` can never contain a disallowed tab by construction.
- Populated in the sync write path alongside the existing replace/upsert calls (`lib/sync/applyParseResult.ts:120–125`; `PostgresPipelineTx` upsert/replace at `runScheduledCronSync.ts:1208/1252/1278/1313/1339`), in the **same transaction**, under the existing per-show advisory lock. Every sync writes a map (`{}` when no anchors — **never NULL**). Full-replace semantics recompute anchors every sync (self-healing).
- **Atomicity:** on export failure the whole sync aborts (no partial `source_anchors`). Per-region alignment failures degrade only those regions to a lower rung (§5.3); they never write a partial map.
- **No new lock surface** is introduced (Hop 4 rides the existing sync lock — single-holder rule preserved, §13).

### Hop 5 — project & build the URL (read path + UI)

- `getShowForViewer` (`lib/data/getShowForViewer.ts:227`) adds two fields to the `ShowForViewer` type (`:97`): **`drive_file_id`** (NOT currently projected — only `opening_reel_drive_file_id` at `:632` is) and **`source_anchors`**. Both are projected from the **already-fetched `shows` row** (no new sub-query). If absent/unparseable, `getShowForViewer` degrades to empty `{}` / `null` `drive_file_id` (links fall back per §5.2) — it never throws or page-errors on anchor data, consistent with the existing per-domain `tileErrors` pattern (`getShowForViewer.ts:171`). If a **new** Supabase call is ever introduced to fetch them, it follows AGENTS.md invariant-9 boundary discipline and is registered in `tests/auth/_metaInfraContract.test.ts` or carries an inline `// not-subject-to-meta:` comment — the plan confirms which path applies.
- A pure helper `buildSheetDeepLink(driveFileId, anchor?)` applies §5.2 / §5.3 (including the read-time `title ∈ allowlist` check) and returns the URL or `null`. Contract: `gid` is always a number; emit `#gid=0` literally when `gid === 0`; `range` is URL-encoded via `encodeURIComponent`. Pure, no I/O, exhaustively unit-tested.
- Each source-backed card resolves its **region id** (§8.2), calls `buildSheetDeepLink(driveFileId, source_anchors[regionId])`, and renders the §5.1 affordance when non-null.

---

## 7. Data model & flag lifecycle

### 7.1 `shows.source_anchors`

Keyed by source-region id (§8.1). `a1` is range-only A1 notation with no sheet-name prefix; `title` is the Sheets-API tab title (for the allowlist guard); `gid` builds the URL (`INFO` is `gid 0`).

```json
{
  "crew":           { "title": "INFO",       "gid": 0,          "a1": "A18:E21" },
  "contacts":       { "title": "INFO",       "gid": 0,          "a1": "A34:B36" },
  "venue":          { "title": "INFO",       "gid": 0,          "a1": "A7:C9"  },
  "financials":     { "title": "INFO",       "gid": 0,          "a1": "A30:B32" },
  "hotels":         { "title": "INFO",       "gid": 0,          "a1": "A28:B28" },
  "transportation": { "title": "INFO",       "gid": 0,          "a1": "A24:C26" },
  "flights":        { "title": "INFO",       "gid": 0,          "a1": "D18:E21" },
  "rooms":          { "title": "INFO",       "gid": 0,          "a1": "A57:B68" },
  "details":        { "title": "INFO",       "gid": 0,          "a1": "A39:B52" },
  "gear_packlist":  { "title": "PULL SHEET", "gid": 1740152570, "a1": "A1:AY783" },
  "schedule":       { "title": "AGENDA",     "gid": 1490737099, "a1": "A5:Y200" }
}
```

(Values illustrative, from the East Coast sheet. Real values computed per-sync. Canonical region-id set = these 11 — §8.1.)

### 7.2 Flag-lifecycle table for `source_anchors`

| Aspect | Value |
|---|---|
| **Storage** | `shows.source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb` |
| **Write path** | sync pipeline (`applyParseResult` → `PostgresPipelineTx`), every sync, full-replace, same txn under the per-show advisory lock; allowlist-filtered; writes `{}` when no anchors (never NULL) |
| **Read path** | `getShowForViewer` → `ShowForViewer.source_anchors` (degrades to `{}` if absent) → cards via `buildSheetDeepLink` (read-time allowlist re-check) |
| **Effect on output** | selects the precision rung of each card's "In sheet" link; absence/disallowed-title degrades gracefully (§5.2). Never gates whether a card renders. |

No zombie flag: every region id written maps to ≥1 rendered card; the §12 parity check enforces region-id set ↔ card-coverage.

---

## 8. Source-region map & card coverage

### 8.1 Canonical source-region set (11)

The anchor map is keyed by **parser source-region**, not by card — cards that render the same parsed data share one region anchor. The 11 regions mirror the parser's block modules / entities. **Tab(s)** below are the real source tabs the parser reads from (all members of the §9 allowlist — there are no dedicated `CREW`/`ROOMS` tabs in the corpus; crew lives in the CREW block / legacy TECH grid *within INFO*, rooms in the GS/BO scope blocks *within INFO*):

| Region id | Parser source | Tab(s) | Precision ceiling |
|---|---|---|---|
| `crew` | `crewMembers[]` | INFO | block |
| `contacts` | `contacts[]` | INFO | block |
| `hotels` | `hotelReservations[]` | INFO / TRAVEL | block |
| `transportation` | `transportation` | INFO / TRAVEL | block |
| `flights` | viewer `crewMembers[].flight_info` | INFO / TRAVEL | block |
| `rooms` | `rooms[]` (AVL scope + set/show/strike times) | INFO | block |
| `venue` | `show.venue` (name/address/dock/link/notes) | INFO | block (cell for scalar rows) |
| `financials` | `coi_status` + `po/proposal/invoice` | INFO | block (cell for clean rows) |
| `details` | `event_details` (keynote, opening-reel text, dress, internet, power) | INFO | block |
| `gear_packlist` | `pullSheet[]` | PULL SHEET / GEAR | block / item-row |
| `schedule` | `runOfShow` + `dates` (agenda grid) | AGENDA | day-band (near-cell on the grid) |

### 8.1.1 Region reduction rule (multi-block & cross-tab regions)

Several regions are **composite** — the parser reads them from more than one block: `hotels` (multiple reservations), `rooms` (AVL scope + set/show/strike times), `financials` (COI + PO/proposal/invoice), `details` (multiple event-detail rows), and `schedule` (`runOfShow` on AGENDA **+** `dates` on INFO — *cross-tab*). Because `source_anchors[regionId]` holds exactly one `{title, gid, a1}`, the writer reduces a region's blocks to one anchor **deterministically**:

1. **Each region designates a single PRIMARY block** (the headline data its cards verify): `hotels`→first reservation; `rooms`→the General-Session room block; `financials`→the COI/proposal/PO block; `details`→the DETAILS block; `schedule`→the AGENDA `runOfShow` grid. Single-block regions (`crew`, `contacts`, `transportation`, `flights`, `venue`, `gear_packlist`) are their own primary.
2. **Same-tab blocks → union bounding range.** When a region's blocks all sit on the primary block's tab, `a1` = the A1 bounding rectangle from the top-left of the first to the bottom-right of the last. **Overreach is accepted** — intervening unrelated rows may fall inside the box; landing the viewer on a span that *contains* all the region's data is the honest Tier-3 outcome (cell-exact is rejected, §15).
3. **Cross-tab regions → primary tab only.** `schedule`'s anchor is the AGENDA `runOfShow` grid; the secondary `dates` rows on INFO are **not** separately anchored (one anchor cannot span two gids). Documented, not silent.
4. **Unlocatable primary → degrade.** If the primary block can't be located, the region degrades to gid-only (tab) then whole-spreadsheet (§5.2).

**Primary-block selection (deterministic).** A region maps to its parser block(s) by the parser's semantic block **kind** (e.g. the `rooms`/`venue`/`dates` block parsers in `lib/parser/blocks/*`), **not** by tab title — so legacy-`INFO` and standardized layouts resolve to the same region id. The exact block-kind→region predicate table is pinned in the plan's first task against this contract. Within a region: (a) **ordering** — blocks are ordered by their exported `(gid, top-left-row, top-left-col)`; the union range spans the min top-left to the max bottom-right **on the primary block's tab**. (b) **Multiple matches** — the first block in that order is the primary; the union covers all same-region blocks on the primary tab. (c) **Zero matches** — the region is **omitted** from `source_anchors` (its card link degrades to whole-spreadsheet, §5.2). (d) **Cross-tab beyond `schedule`** — no other corpus region spans tabs; if one ever arises, the anchor uses the primary block's tab only (same rule as `schedule`) and the §12 region-reduction test flags the uncovered cross-tab portion.

§12 requires fixtures for each shape: single-block, same-tab union-with-overreach (incl. a multi-block region), zero-match degrade, and the cross-tab `schedule` case.

### 8.2 Card → region coverage (all source-backed cards)

Every source-backed card links to exactly one region — the region of its **primary (headline) data** (§8.1.1). Cards in **Today** reuse other sections' anchors (introduce no new region). Cards that render fields from more than one region are tracked in the **mixed-source registry** (§8.2.1) so their secondary fields are documented, never silently mis-covered.

| Section · Card | Region id |
|---|---|
| Crew · Show crew | `crew` |
| Crew · Key contacts | `contacts` |
| Travel · Your flight | `flights` |
| Travel · Getting there | `transportation` |
| Travel · Hotels | `hotels` |
| Venue · Where | `venue` |
| Venue · Facilities | `venue` |
| Venue · Venue status (COI + venue notes) | `venue` |
| Gear · Audio/Video/Lighting scope (3 cards) | `rooms` |
| Gear · Pack list | `gear_packlist` |
| Gear · Keynote requirements | `details` |
| Gear · Opening reel (text portion) | `details` |
| Schedule · Day cards | `schedule` |
| Schedule · Daily call times | `rooms` |
| Budget · Budget | `financials` |
| Today · Tonight | `hotels` (reuse) |
| Today · Where | `venue` (reuse) |
| Today · Need something | `contacts` (reuse) |
| Today · Key times | `rooms` (reuse) |
| Today · Dress code | `details` (reuse) |
| Today · Run of show | `schedule` (reuse) |

### 8.2.1 Mixed-source card registry

A few cards render fields from MORE THAN ONE region. Per D5 they still carry exactly ONE link — to their **primary** region (precise for the headline fields) — and this registry documents the **secondary** fields the link does NOT precisely anchor (those fields live elsewhere in the same workbook; the link lands at the primary region). The §12 field-aware parity test asserts every such card is in this registry **and** that its rendered field set matches the registry — so a newly-mixed card cannot ship with an undocumented wrong-region link.

| Card | Primary region (linked) | Secondary fields (NOT precisely anchored — verify at primary region) |
|---|---|---|
| Venue · Facilities | `venue` (loading dock) | `transportation.parking`, `event_details.internet`, `event_details.power` |
| Venue · Venue status | `venue` (venue notes) | `coi_status` |

All other §8.2 cards render a single region's data, so their one link is precise. **Gear scope (3 discipline cards)** and **Key times** both read `rooms[]` — same region, not mixed.

### 8.3 Out-of-scope cards (no link) — explicit

| Section · Card | Reason |
|---|---|
| Today · RightNowHero | composite/derived live state (synthesizes hotel + room + tz) — no single source region |
| Today · Show notes | aggregates 5 independent sources (venue/hotel/room/transport/contact notes) — no single source region |
| Venue · Diagrams | Drive image embeds + PDF agenda links — non-sheet artifacts, not parseable cell regions |
| Gear · Opening reel — **video** | the proxied Drive video asset (`/api/asset/reel/{showId}`) is not sheet data; the card's **text** portion still links via `details` |

The §12 parity test asserts: **every source-backed card either maps to a region (§8.2) or appears on this out-of-scope list** — nothing visible is silently link-less.

---

## 9. Link-target allowlist & invariant

Anchors may target **only**: `INFO, AGENDA, GEAR, TRAVEL, PULL SHEET`.

**Excluded** (linking here points a crew member at *another show* or at `#REF!` noise):
- `#REF!` / derived banner cells (e.g. East Coast `INFO` row 3 `#NUM!`/`#REF!`).
- The standardized format's **company-wide master-library tabs**: `CLIENT, VENUE, TECH, ROLE, VEHICLE, CLIENTUNIQUE, CONTACTUNIQUE, FORM`. (These are *not* per-show `#REF!` tabs — they are cross-show libraries; seen on the 2026 standardized sheets, e.g. RPAS / FinTech.)
- `OLD PULL SHEET`, stale `FORM`, DCI/RPAS `Sheet18`.

**Matching semantics:** tab names match the Sheets API `sheet.properties.title` **exactly** — case-sensitive, no whitespace normalization. The stored anchor carries `title` (Hop 4), so the allowlist is checkable at **both** layers:
- **Write-time (primary):** the sync drops any region whose `title ∉ allowlist` before persisting (§6 Hop 4) — `source_anchors` never contains a disallowed tab.
- **Read-time (defense-in-depth):** `buildSheetDeepLink` re-checks `anchor.title ∈ allowlist` and drops to whole-spreadsheet otherwise (§5.3) — so even stale/corrupted/manually-edited JSON cannot deep-link into a forbidden tab.

Enforced by a structural meta-test (§12) that (a) walks corpus fixtures and asserts no **persisted** anchor's `title` is excluded, (b) asserts `buildSheetDeepLink` drops a hand-crafted disallowed-`title` anchor to whole-spreadsheet, and (c) positively asserts real master-library titles (`CLIENT`, `VENUE`, `ROLE`, …) are absent from the allowlist.

---

## 10. Outlier handling (all "by construction")

Because the anchor follows *where the parser actually read*, the known outliers resolve correctly:

| Sheet / case | Behavior |
|---|---|
| East Coast empty `TRAVEL` tab | `flights` anchors `INFO!D18:E21` (where flights really live), not the empty tab. |
| 2026 `INFO`-as-formula-sink (FinTech) | anchor the `INFO` cell where the value renders — that is the parser's source. We deliberately do **not** chase the `=INDEX/MATCH` into a master DB tab (also why §9 excludes those tabs). |
| Side-by-side RES#1/RES#2, MAIN/SECONDARY contact columns | the A1 range captures the **column span**, so it never wrongly assumes column B. |
| DCI/RPAS two-program sheet | the two programs are co-mingled in one AGENDA tab, disambiguated by the in-band column span; the `schedule` anchor's A1 column span lands the AGENDA grid with program tags preserved. `Sheet18` (derived mirror) is excluded by §9. Explicit fixture test. |

---

## 11. Migration & schema discipline

Per AGENTS.md "Every migration must reach the validation project":

1. New migration `supabase/migrations/2026XXXXXXXXXX_add_source_anchors.sql` — `ALTER TABLE shows ADD COLUMN IF NOT EXISTS source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb;` (idempotent; no CHECK — shape is app-enforced).
2. Apply locally + TDD.
3. `pnpm gen:schema-manifest` and commit the regenerated `supabase/__generated__/schema-manifest.json`.
4. Apply surgically to the validation project (`supabase db query --linked` or `psql "$TEST_DATABASE_URL" -f …`), then `notify pgrst, 'reload schema';`.
5. The `validation-schema-parity` CI gate then asserts validation ⊇ manifest.

**PostgREST DML lockdown (already enforced — no new row needed).** `shows` write access is whole-table REVOKEd from `anon, authenticated` — `revoke insert, update, delete on table public.shows from anon, authenticated;` at `supabase/migrations/20260523000001_picker_epoch_columns.sql:45`. The new `source_anchors` column therefore inherits the lockdown: no PostgREST caller can `update public.shows set source_anchors = …`, so a crew/anon user cannot inject arbitrary (even allowed-title) anchors to mislead the link. `shows` is already a registered row in the lockdown meta-test (`tests/db/postgrest-dml-lockdown.test.ts:138`), whose UPDATE probe asserts the whole-table REVOKE and thus covers the new column — **no new registry row is required.** `source_anchors` is written only inside the existing SECURITY-DEFINER sync path. The plan re-runs `tests/db/postgrest-dml-lockdown.test.ts` after the migration to confirm the lockdown still holds for the altered table.

---

## 12. Testing strategy

- **Unit — `buildSheetDeepLink`:** every fallback rung (range / gid-only / none / null id → null); the **`gid === 0` case** — `buildSheetDeepLink(driveFileId, { title:"INFO", gid:0, a1:"A1:B2" })` MUST emit `…/edit#gid=0&range=A1%3AB2` (not degrade); the **URL-encoding** assertion (`a1="A1:C1"` → `…&range=A1%3AC1`); empty-string inputs (`driveFileId=''` → null; `a1=''` → gid-only rung); the `a1`-without-`gid` → whole-spreadsheet invariant; the **disallowed-`title`** anchor → whole-spreadsheet. **Negative-regression:** a truthy `if (gid)` impl must fail the gid-0 test; a no-op allowlist check must fail the disallowed-title test.
- **Export/parser — anchored-block emission:** against committed exporter fixtures (`tests/drive/exportSheetToMarkdown.test.ts`, `tests/parser/exporterFixtures.test.ts`), assert each emitted block's `{title, gid, a1}` matches expected, including a **merge-origin** case (anchor = merge top-left) and a **trimmed-block** case (origin shifted by `trimBlock`). Plus a **region-reduction** fixture set (§8.1.1): a single-block region, a same-tab **union-with-overreach** region (e.g. `rooms`/`details`/`financials` — assert `a1` is the bounding rectangle covering all the region's blocks), and the **cross-tab `schedule`** case (assert the anchor is the AGENDA `runOfShow` grid and that INFO `dates` is NOT separately anchored).
- **Allowlist meta-test (§9):** (a) walk corpus fixtures, assert no **persisted** anchor `title` is excluded; (b) `buildSheetDeepLink` drops a hand-crafted disallowed-`title` anchor (corrupted-JSON defense); (c) master-library titles absent from the allowlist constant; (d) **§8.1↔§9 consistency** — every tab title named in the §8.1 region-source map is a member of the §9 allowlist constant, so the canonical region map and the enforcement allowlist can never disagree (this would have caught the round-4 `CREW`/`ROOMS` drift).
- **Field-aware coverage parity (§8):** a walker over the rendered fixture suite that tags **every rendered source-backed datum** (not just every card) with the parser region that produces it. It asserts: (a) every rendered source-backed field maps to a known region; (b) each card's single link targets the region of its **primary** field (§8.2); (c) every card that renders fields from >1 region appears in the mixed-source registry (§8.2.1) with a **matching field set**; (d) a card with no link is on the §8.3 out-of-scope list with a composite/non-sheet rationale; (e) every region id in §8.1 is referenced by ≥1 card. Because it walks fields — not a hardcoded card list — a new SectionCard, a new rendered field, or a newly-mixed card fails the test until classified. The guarantee is **no _undocumented_ mis-coverage**: the test fails if a visible source-backed datum is **unclassified**, a card's rendered field set **drifts** from its §8.2.1 registry entry, or a card with source-backed fields has **neither** a link **nor** an §8.3 out-of-scope rationale. Registered secondary fields on the two mixed cards are **intentionally** not precisely link-covered (the link is scoped to the primary region per §5.1/§8.2.1) — that is the documented, accepted limitation, not a silent gap. This closes the round-2 card-vs-field gap by guaranteeing every visible datum is either precisely covered or explicitly documented.
- **Corpus regression:** for representative committed fixtures across both format eras (per D11), assert region anchors resolve to the right tab + region per §8.1.
- **Projection guard:** `getShowForViewer` projects `drive_file_id` + `source_anchors`; assert the empty-object (`{}`) and null-`drive_file_id` paths render no broken links.
- **Real-browser (Playwright + impeccable gate; jsdom insufficient):**
  - **Dimensional invariant (§5.4):** baseline = `main` branch HEAD as of 2026-06-21; viewport = crew viewer, desktop; method = `element.getBoundingClientRect().height`, 0.5px absolute tolerance; measured rows = `PersonRow`, `FactRows`, `KeyValueRows`, `KeyTimesStrip`. Anti-tautology: measure rows present in the baseline, not diff-introduced elements.
  - the `href` is correct at each fallback rung.
  - **Anti-tautology:** assert `href` against the projected `source_anchors` data source, NOT the rendered container (which also renders the value). When scanning DOM for the link, scope to the card header so a sibling can't satisfy the assertion.
- **Crew-wide sweep:** after the shared `SectionCard` change, run the sentinel meta-test + a broad crew render sweep (a shared-primitive change can break distant tiles).

### Meta-test inventory (per AGENTS.md)

- **CREATES:** the §9 allowlist meta-test (persisted-anchor + read-time `buildSheetDeepLink` title guard); the §8 **field-aware** coverage parity walker (incl. the §8.2.1 mixed-source registry check).
- **EXTENDS:** the fields-mask pin (`tests/sync/defaultDriveClientSheetsFieldsMask.test.ts`) for the widened `sheetId` mask.
- **Advisory-lock topology:** unchanged — no new `pg_advisory*` holder (Hop 4 rides the existing sync lock). Declared explicitly.
- **PostgREST DML lockdown:** `shows` is already whole-table REVOKEd (`picker_epoch_columns.sql:45`) and registered in the meta-test (`postgrest-dml-lockdown.test.ts:138`); the new column inherits both. Plan re-runs that test post-migration. No new registry row (§11).
- **Supabase call-boundary (invariant 9):** no new query expected (Hop 5 reuses the fetched `shows` row); if one is added, register in `tests/auth/_metaInfraContract.test.ts`.

---

## 13. Routing & UI quality gate

- **UI (Opus + impeccable):** crew section components, the link/affordance component, `buildSheetDeepLink` consumption, the `SectionCard` action-slot change, `app/show/[slug]/[shareToken]/**`, `components/crew/**`. Ships only after `/impeccable critique` AND `/impeccable audit` pass on the diff (invariant 8), HIGH/CRITICAL fixed or DEFERRED.
- **Backend (heavier lift; implementer per ROUTING):** export-seam change, gid+title capture, parser region association, migration, sync write path, `buildSheetDeepLink` helper + unit tests. If driven under Codex, UI tasks hand back to Opus (hard rule: UI is always Opus).
- **Process (per D10):** spec + plan to cross-model adversarial APPROVE (unlimited rounds), user review waived, then implement → PR → CI → merge.
- **TDD per task; conventional-commits; commit per task** (invariants 1 & 6).

---

## 14. Risks & open questions

1. **Export ↔ parser region alignment (principal risk).** The parser's region detection must line up with the export's block boundaries so each region gets exactly one anchor. Mitigation: make the export the single source of block boundaries; pin alignment with fixtures across both format eras. If alignment is intractable for a region, it degrades to **tab** precision (still a live link) rather than blocking the feature.
2. **Scalar-region precision (`venue`, `financials`, `details`).** These group several INFO label rows; their A1 range spans the region (block precision), not a per-field cell. That is the intended Tier-3 ceiling (cell-exact rejected, §15). v1 anchors the region; per-field refinement is out of scope.
3. **Extra Sheets API call.** Hop 1 may add one `listSpreadsheetSheets` call per sync to the parse path (or reuse the enrichment call). The plan enumerates the call site to avoid a redundant round-trip.
4. **gid stability.** Google gids are stable per tab; persisted values self-heal on every full-replace sync.
5. **Schedule day-band precision.** AGENDA is day-banded by non-uniform columns; the single `schedule` anchor spans the agenda grid in v1 (one region id); per-day refinement reuses the same id, does not expand the region set.

---

## 15. Disagreement-loop preempts (for the adversarial reviewer)

**EXPLICITLY DO NOT RELITIGATE** — each settled with evidence:

- **Cell-exact precision (Tier 4) is out of scope.** Corpus sweep of all live sheets (D11) showed one packed multi-value cell backs many parsed fields on *every* sheet (crew `name+duties+role` in one cell; a flight itinerary's origin/airline/time/conf# in one cell; *all* crew members' hotel confirmation numbers in one cell). Cell-exact is semantically wrong, not merely hard. The only clean cell-exact pocket (AGENDA grid) is included opportunistically. `docs/superpowers/plans/BACKLOG.md` documents the reverse-mapping as deferred + brittle.
- **Crew-facing, always-shown is intentional (D1/D2).** Not a privacy regression: Doug already shares the raw, role-ungated sheet with all crew; app gating is additive UI, not a sheet boundary. Crew have view access.
- **"Tab-level first" staging was considered and rejected.** For the legacy single-`INFO` sheets (majority, D11), tab-level ≈ whole-spreadsheet and does not serve the verify job. We build region-range directly behind a graceful fallback.
- **Per-row / per-field links were considered and rejected.** Verified in visual brainstorming: a per-row glyph truncates dense rows (Crew role line). Affordance is per-source-backed-card → region anchor (D5).
- **Region-keyed (not card-keyed) anchors are deliberate.** 23 source-backed cards collapse to 11 parser source-regions; cards sharing a source share its anchor (e.g. Today reuses; gear scope + key times → `rooms`). This is why the canonical set is 11, not 23 — see §8.
- **Mixed-source cards link to their PRIMARY region, by design (R2 resolution).** Per D5 (one subtle link per card), the 2 mixed cards (§8.2.1) link to their primary region and document the secondary fields rather than carrying multiple links (which D5 forbids as clutter) or splitting cards. Field-aware parity (§12) prevents silent mis-coverage. Do not relitigate toward multiple-links-per-card — that contradicts the ratified D5.
- **Composite/cross-tab regions reduce to one anchor by the §8.1.1 rule (R2 resolution).** Same-tab multi-block regions use a union bounding range with accepted overreach; the cross-tab `schedule` anchors AGENDA only. This is the deliberate Tier-3 outcome (cell-exact rejected); overreach is acceptable because landing on a span that contains the data still serves verification.
- **The allowlist exclusion of `CLIENT/VENUE/TECH/ROLE/VEHICLE/...` tabs is deliberate.** In the standardized format (2026 sheets) these are company-wide master libraries, not per-show data; linking there points at the wrong show (§9).

---

## 16. Out of scope

- Write-back to the sheet; reverse field→cell mapping (BACKLOG).
- Per-row / per-field deep links.
- Cell-exact precision outside the AGENDA grid.
- Deep links for composite/derived cards and Drive-asset embeds (§8.3).
- Any change to crew-page data rendering, auth, or the picker flow.
- Backfilling anchors for historical syncs beyond the next natural sync (full-replace populates them).
```
