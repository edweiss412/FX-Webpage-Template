# Tile → Source-Sheet Deep Links — Design Spec

- **Date:** 2026-06-21
- **Status:** Draft (self-review applied; pending cross-model adversarial review)
- **Branch / worktree:** `worktree-tile-source-deeplinks`
- **Author:** Opus 4.8 (Claude Code), orchestrated session

---

## 1. Summary

Every crew-page **source-block** gains a subtle "In sheet ↗" link that opens the show's Google Sheet at the location the block's data was parsed from. The crew member taps it to **verify a value against the source** in one motion (e.g. "the app says my call time is 8:15 — is that really what the sheet says?").

The link lands as precisely as the underlying sheet layout *honestly* allows — a tab + A1 **block range** for most data, a near-cell anchor for the genuinely tabular AGENDA grid — and **degrades gracefully** (range → tab → whole-spreadsheet) so it is never broken or disabled.

---

## 2. Background & motivation

This spec is grounded in two live-code + live-sheet explorations performed 2026-06-21 (worktree `tile-source-deeplinks`):

1. **Provenance-chain exploration** — confirmed that source-cell coordinates are discarded across `Sheet → export → parse → DB → projection → tile`. The parser input is a flat markdown string (`lib/parser/index.ts:317` `parseSheet(markdown: string)`); every parsed type is value-only (`lib/parser/types.ts`); the DB stores only values; the projection surfaces only `drive_file_id`-class identifiers. `docs/superpowers/plans/BACKLOG.md` records "No source-cell provenance" as an intentional, deferred architectural decision.

2. **Full-corpus sheet sweep** — profiled all live "raw" sheets (per D11). Verdict: **Tier 3 (tab + A1 block/row range) is the right universal precision target, confirmed high-confidence.** Cell-exact (one source cell per rendered field) is rejected because it is, corpus-wide, **semantically wrong** (one packed multi-value cell backs many fields) and **brittle** (anchors drift several rows between sheets and the two format eras). See §10 and §15.

### 2.1 Why the value is real (and why coarse links are not enough)

For the legacy single-`INFO` sheets (per D11), **all** sections are parsed from one `INFO` tab. A whole-spreadsheet or even tab-level link therefore drops the crew member at the top of a long `INFO` tab — useless for verifying a specific value. Only an **A1 block range** lands them on the right rows. This is why a "tab-level first" phase was rejected in favor of building block-range capture directly (within a graceful-fallback architecture).

---

## 3. Resolved decisions (single source of truth)

Every later section references these; do not restate literals elsewhere.

| # | Decision | Value |
|---|---|---|
| D1 | Audience | **Crew-facing**, link **always shown to all crew** (no role gate on the link itself). The link still renders only where its block tile renders — so the Budget link appears only in the already-lead-gated `BudgetSection` (an existing gate, not new work). |
| D2 | Why always-shown is safe | Doug already shares the raw sheet link with all crew, ungated by role. App role-gating is **additive UI**, not a boundary on the sheet. The deep link exposes nothing crew can't already open, and crew have view access (so no "request access" wall). |
| D3 | Scope | **All seven sections** (Today, Schedule, Venue, Travel, Crew, Gear, Budget) |
| D4 | Job | **Verify / trust** a rendered value against the source |
| D5 | Affordance unit | **One subtle link per source-block** (not per row, not per field) |
| D6 | Precision target | **Tier 3**: tab + A1 block range, with opportunistic near-cell anchoring only for the AGENDA grid |
| D7 | Capture architecture | **Block-anchor pipeline**: capture `{gid, A1}` at the export seam, thread one anchor per source-block, persist in a single JSONB column, build the URL at read time |
| D8 | Fallback ladder | resolved range → tab (`#gid=`) → whole-spreadsheet (`/edit`); link is always live |
| D9 | Link target allowlist | `INFO, AGENDA, GEAR, TRAVEL, PULL SHEET` only (excludes derived/master tabs) |
| D10 | Review process | spec + plan each go to cross-model (Codex) adversarial **APPROVE**, **unlimited rounds**; **user review waived**; then drive implementation → PR → CI → merge (see §13) |
| D11 | Corpus composition | 10 live raw sheets (`fixtures/shows/README.md`): **7 legacy** (2024–25 single-`INFO` format) + **3 standardized** (2026 multitab format) |

---

## 4. Non-goals (explicit YAGNI)

- **No per-row or per-field links.** Rejected: a per-row glyph steals width from dense rows (Crew's role line truncates). Verified visually in brainstorming.
- **No cell-exact linking** except the opportunistic AGENDA grid. Rejected corpus-wide (§10/§15).
- **No write-back / "edit in sheet."** Job is verify (D4), not edit. The BACKLOG reverse field→cell mapping is out of scope.
- **No new access control / no link gating.** Per D1/D2. Link rendering follows the existing block tile gate — if a block tile does not render (e.g. non-lead viewer on Budget), neither does its link. `admin_preview` derives role flags freshly in `getShowForViewer`, so the gate evaluates correctly; no new gating is added.
- **No change to what the tiles render.** Only an additive link affordance.

---

## 5. UX contract

### 5.1 The affordance

- A small spreadsheet glyph + short label ("In sheet"), **low-contrast**, placed at each **source-block's header** — the `SectionCard` action slot for single-block cards, or a small inline header for sub-blocks (e.g. Travel's "Hotels" and "Your flight").
- Opens `https://docs.google.com/spreadsheets/d/<drive_file_id>/edit#gid=<gid>&range=<a1>` in a **new tab** with `rel="noopener noreferrer"`. The `a1` value is stored range-only (no sheet-name prefix) and **URL-encoded** (see §5.2 / §6 Hop 5).
- **No per-row glyphs anywhere** (D5).

### 5.2 Fallback ladder (per block) — see D8

`range` is URL-encoded via `encodeURIComponent`, so `A1:C1` → `range=A1%3AC1`.

| Anchor available | URL form | Lands at |
|---|---|---|
| `{gid, a1}` | `…/edit#gid=<gid>&range=<encoded a1>` | the block's rows |
| `{gid}` only (or empty `a1`) | `…/edit#gid=<gid>` | the correct tab (top) |
| none / no resolvable `gid` | `…/edit` | the workbook (top) |
| no `drive_file_id` | — | **link omitted** (not a dead link) |

### 5.3 Guard conditions (per input)

`buildSheetDeepLink(driveFileId: string | null, anchor?: { gid: number; a1?: string })`:

- **`drive_file_id` null OR empty string** → **omit** the link for that block (never render `…/edit` against an empty id).
- **`anchor` missing/null** → render at whole-spreadsheet (`…/edit`).
- **`anchor.gid === 0` is VALID** — the `INFO` tab is `gid 0` (so 7 of 9 illustrative blocks in §7.1 are `gid:0`). gid presence is tested with `gid != null` / `typeof gid === "number"`, **never a truthiness check**. A truthy `if (gid)` is a CRITICAL bug that would break every INFO-tab block (the legacy-corpus majority). Only a **null/undefined** gid (not `0`) drops to whole-spreadsheet.
- **`anchor.a1` present but empty string `''`** → treat as `a1` absent; render at the gid-only (tab) rung.
- **`anchor.a1` present but `anchor.gid` null/undefined** → **drop to whole-spreadsheet** (an A1 `range` without a `gid` resolves against the wrong/active tab in Google Sheets, so emitting `range` alone is unsafe). Invariant, not a preference.
- **`anchor.gid` not in the §9 allowlist** → **treat as missing** (drop to whole-spreadsheet) and the §9 meta-test fails CI. A crew member must never be linked into another show's master-library row.
- **Block has no data** (section/card not rendered, e.g. East Coast's empty `TRAVEL` tab) → the card isn't rendered, so no link; nothing special required.

### 5.4 Dimensional invariant (UI)

The source link lives in a **block header**, never inside a data row. Adding it MUST NOT change the height of any `PersonRow`, `FactRows` row, `KeyValueRows` row, or `KeyTimesStrip` cell. Default implementation: the link sits in the `SectionCard` header action slot using a self-contained `flex shrink-0 items-center` + `h-fit` layout that never sets or stretches row height; **exact Tailwind classes are pinned in the plan's layout-dimensions task** per AGENTS.md. Tailwind v4 here does **not** default `.flex` to `align-items: stretch`, so the header link must not rely on implicit stretch. The real-browser layout test (§12) asserts the dimensional invariant.

---

## 6. Architecture — the block-anchor pipeline

Five hops; **hops 1–3 are the new plumbing**, hops 4–5 are thin.

### Hop 1 — capture the gid (sync layer)

The XLSX export carries tab **names**, not Google **gids**. The gid is fetched from the Sheets API.

- Widen the fields mask `sheets(properties(title))` → `sheets(properties(sheetId,title))` at `lib/sync/runScheduledCronSync.ts:1549`, and update its pin at `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:51`. (`tests/sync/embeddedImages.test.ts:103` references the mask in a comment — update for consistency.)
- Extend `listSpreadsheetSheets` (`runScheduledCronSync.ts:1540`) to return `{ title, sheetId }[]`, building a `Map<title, gid>`.
- **Contract direction:** Hop 2 does **NOT** call the Sheets API; it receives the `{title→gid}` map as a parameter threaded from a **single** Hop-1 fetch (reusing the existing `listSpreadsheetSheets` call used for DIAGRAMS enrichment in `lib/sync/enrichWithDrivePins.ts` where possible). The plan pins the exact call site to avoid a redundant round-trip (§14 Risk 3).

### Hop 2 — capture the A1 range (export seam — load-bearing)

`lib/drive/exportSheetToMarkdown.ts` already transiently holds everything needed and throws it away:

- `sheetGrid(sheet)` (`:67`) decodes `sheet["!ref"]` (`:68`) via `decode_range` (`:70`) into the tab's A1 bounds, then builds a positionless `CellGrid` (`type CellGrid = string[][]`, `:3`).
- `expandMerges` (`:53`) copies a merged cell's text across its whole span — so the *true* anchor of a merged value is the merge's **top-left** cell (record that, not every covered cell).
- `splitBlocks` (`:89`) cuts blocks at blank rows; `trimBlock` (`:153`) shaves blank edges — both **shift the block's origin** relative to the tab.
- `synthesizeMarkdownFromXlsx(buffer): string` (`:186`) iterates `workbook.SheetNames` (`:194`) and returns `tables.join("\n\n")` (`:209`) — a flat string with no coordinates.

**Change:** thread the (row, col) **origin offset** through `sheetGrid → splitBlocks → trimBlock` so each emitted block knows its top-left and bottom-right cell in the original tab. Change the export's contract from `string` to an **ordered list of anchored blocks**: `{ gid, a1Range, kind, markdown }[]` (gid via the Hop-1 map keyed by `sheetName`). `a1Range` is the block's `topLeft:bottomRight` in A1 notation, **range-only, WITHOUT a sheet-name prefix** (the tab is identified solely by gid); for merge-origin cells the anchor is the merge top-left.

### Hop 3 — associate anchor → parsed section (parser seam)

The parser already carries a coarse block identity: `ParseWarning.blockRef { kind: string; index?: number }` (`lib/parser/types.ts:5`).

- **Design intent:** the export (Hop 2) becomes the single source of block boundaries; the parser **consumes the pre-split anchored blocks** rather than re-splitting a flat string, so each parsed section/sub-block records the `{gid, a1}` of the block(s) it consumed. The parser records only the `{gid, a1}` pair (`a1Range → a1`), discarding `kind` and `markdown` — those are not persisted to `source_anchors`.
- **This is the principal implementation risk** (§14): keeping the export's block boundaries aligned with the parser's section detection. The plan must pin this alignment with tests and decide the exact mechanism (consume-anchored-blocks vs. an origin sidecar map indexed by block). The spec fixes the *contract* — "every parsed source-block resolves to exactly one `{gid, a1}` anchor, or none" — not the mechanism.

### Hop 4 — persist (write path)

- New column **`shows.source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb`**, keyed by stable **block id** (§8), each value `{ gid: number, a1?: string }`.
- Populated in the sync write path alongside the existing replace/upsert calls (`lib/sync/applyParseResult.ts:120–125`; `PostgresPipelineTx` upsert/replace at `runScheduledCronSync.ts:1208/1252/1278/1313/1339`), in the **same transaction** as those calls, under the existing per-show advisory lock. Every sync writes a map (`{}` when no anchors are emitted — **never NULL**). Full-replace semantics mean anchors are recomputed every sync — acceptable and self-healing.
- **Atomicity:** on export failure the whole sync aborts (no partial `source_anchors`). Per-block alignment failures degrade only those blocks to a lower rung (§5.3); they never write a partial map.
- This path already runs under the per-show advisory lock; **no new lock surface** is introduced (single-holder rule preserved — §13).

### Hop 5 — project & build the URL (read path + UI)

- `getShowForViewer` (`lib/data/getShowForViewer.ts:227`) adds two fields to the `ShowForViewer` type (`:97`): **`drive_file_id`** (NOT currently projected — only `opening_reel_drive_file_id` at `:632` is) and **`source_anchors`**. Both are projected from the **already-fetched `shows` row** (no new sub-query). If absent/unparseable, `getShowForViewer` degrades to empty `{}` / `null` `drive_file_id` (links fall back per §5.2) — it never throws or page-errors on anchor data, consistent with the existing per-domain `tileErrors` pattern (`getShowForViewer.ts:171`). If a **new** Supabase call is ever introduced to fetch them, it follows AGENTS.md invariant-9 boundary discipline (destructure `{data,error}`, typed infra fault) and is registered in `tests/auth/_metaInfraContract.test.ts` or carries an inline `// not-subject-to-meta:` comment — the plan confirms which path applies.
- A pure helper `buildSheetDeepLink(driveFileId, anchor?)` applies §5.2 / §5.3 and returns the URL or `null` (→ omit). Contract: `gid` is always a number; emit `#gid=0` literally when `gid === 0`; `range` is URL-encoded via `encodeURIComponent`. Pure, no I/O, exhaustively unit-tested.
- Each block component calls `buildSheetDeepLink(driveFileId, source_anchors[blockId])` and renders the §5.1 affordance when non-null.

---

## 7. Data model & flag lifecycle

### 7.1 `shows.source_anchors`

`a1` is range-only A1 notation with no sheet-name prefix; the tab is identified solely by `gid` (note `INFO` is `gid 0`).

```json
{
  "crew":          { "gid": 0,          "a1": "A18:E21" },
  "venue":         { "gid": 0,          "a1": "A7:C9"  },
  "dates":         { "gid": 0,          "a1": "A11:C15" },
  "financials":    { "gid": 0,          "a1": "A30:B32" },
  "hotels":        { "gid": 0,          "a1": "A28:B28" },
  "flights":       { "gid": 0,          "a1": "D18:E21" },
  "gear_scope":    { "gid": 0,          "a1": "A63:B68" },
  "gear_packlist": { "gid": 1740152570, "a1": "A1:AY783" },
  "schedule":      { "gid": 1490737099, "a1": "A5:Y200" }
}
```

(Values illustrative, from the East Coast sheet. Real values computed per-sync. Canonical block-id set = these 9 — see §8/§12.)

### 7.2 Flag-lifecycle table for `source_anchors`

| Aspect | Value |
|---|---|
| **Storage** | `shows.source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb` |
| **Write path** | sync pipeline (`applyParseResult` → `PostgresPipelineTx`), every sync, full-replace, same txn under the per-show advisory lock; writes `{}` when no anchors (never NULL) |
| **Read path** | `getShowForViewer` → `ShowForViewer.source_anchors` (degrades to `{}` if absent) → block components via `buildSheetDeepLink` |
| **Effect on output** | selects the precision rung of each block's "In sheet" link; absence degrades gracefully (§5.2). Never gates whether a tile renders. |

No zombie flag: every block id written is consumed by a rendered block; the §12 parity check enforces writer-id set == renderer-id set.

---

## 8. Per-section block map

Block id → source tab(s) → precision ceiling → number of links. Precision ceilings are the corpus-robust common denominator from the sweep (§15). **Canonical block-id set (9):** `crew, venue, dates, financials, hotels, flights, gear_scope, gear_packlist, schedule`.

| Section | Block id(s) | Tab(s) | Precision | Links |
|---|---|---|---|---|
| **Crew** | `crew` | INFO | block | 1 |
| **Schedule** | `schedule` | AGENDA | day-band (near-cell on the grid) | 1 |
| **Venue** | `venue` | INFO | block (cell for scalar rows) | 1 |
| **Travel** | `hotels`, `flights` | INFO / TRAVEL | block | 2 |
| **Gear** | `gear_scope`, `gear_packlist` | INFO · PULL SHEET/GEAR | block / item-row | 2 |
| **Budget** | `financials` | INFO | block (cell for clean rows) | 1 *(renders only in lead-gated BudgetSection)* |
| **Today** | reuses `dates`, `venue`, `schedule` (NO new ids) | INFO + AGENDA | block | per sub-card |

- **Schedule:** v1 ships **one** `schedule` block id anchoring the full AGENDA range. Per-day refinement (§14 Risk 2) reuses the **same single `schedule` id and anchor** — it does NOT introduce per-day block ids into `source_anchors`.
- **Gear:** **two independent** block ids — `gear_scope` anchors `INFO`, `gear_packlist` anchors the `GEAR`/`PULL SHEET` tab; each block component calls `buildSheetDeepLink` independently with its own anchor (separate gid → separate tab).
- **Today:** a dashboard of other sections' data; its sub-cards **reuse** the canonical `venue` / `dates` / `schedule` anchors and introduce **no new block ids**. Exact placement is tuned in the impeccable pass so the glanceable view stays uncluttered.

---

## 9. Link-target allowlist & invariant

Anchors may target **only**: `INFO, AGENDA, GEAR, TRAVEL, PULL SHEET`.

**Excluded** (linking here points a crew member at *another show* or at `#REF!` noise):
- `#REF!` / derived banner cells (e.g. East Coast `INFO` row 3 `#NUM!`/`#REF!`).
- The standardized format's **company-wide master-library tabs**: `CLIENT, VENUE, TECH, ROLE, VEHICLE, CLIENTUNIQUE, CONTACTUNIQUE, FORM`. (These are *not* per-show `#REF!` tabs — they are populated cross-show libraries; seen on the 2026 standardized sheets such as RPAS / FinTech.)
- `OLD PULL SHEET`, stale `FORM`, DCI/RPAS `Sheet18`.

**Matching semantics:** tab names match the Sheets API `sheet.properties.title` **exactly** — case-sensitive, no whitespace normalization. The meta-test compares a produced anchor's `gid` to the title from the Hop-1 `listSpreadsheetSheets` result (NOT parsed markdown).

The export already only anchors tabs the parser reads, but the allowlist makes this a **guarded invariant**: a future parser/export change cannot silently emit an anchor into an excluded tab. Enforced by a structural meta-test (§12) that walks the corpus fixtures, asserts no produced anchor's `gid` maps to an excluded tab title, and includes a positive assertion that real master-library tabs (`CLIENT`, `VENUE`, `ROLE`, …) never match the allowlist.

---

## 10. Outlier handling (all "by construction")

Because the anchor follows *where the parser actually read*, the known outliers resolve correctly:

| Sheet / case | Behavior |
|---|---|
| East Coast empty `TRAVEL` tab | `flights` anchors `INFO!D18:E21` (where flights really live), not the empty tab. |
| 2026 `INFO`-as-formula-sink (FinTech) | anchor the `INFO` cell where the value renders — that is the parser's source. (We deliberately do **not** chase the `=INDEX/MATCH` into a master DB tab; that is also why the allowlist excludes those tabs.) |
| Side-by-side RES#1/RES#2, MAIN/SECONDARY contact columns | the A1 range captures the **column span**, so it never wrongly assumes column B. |
| DCI/RPAS two-program sheet | the two programs are co-mingled in one AGENDA tab, disambiguated by the in-band column span; the `schedule` anchor's A1 column span lands the AGENDA grid with the program tags preserved. `Sheet18` (derived mirror) is excluded by §9. Explicit fixture test case. |

---

## 11. Migration & schema discipline

Per AGENTS.md "Every migration must reach the validation project":

1. New migration `supabase/migrations/2026XXXXXXXXXX_add_source_anchors.sql` — `ALTER TABLE shows ADD COLUMN IF NOT EXISTS source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb;` (idempotent; no CHECK needed — shape is app-enforced).
2. Apply locally + TDD.
3. `pnpm gen:schema-manifest` and commit the regenerated `supabase/__generated__/schema-manifest.json`.
4. Apply surgically to the validation project (`supabase db query --linked` or `psql "$TEST_DATABASE_URL" -f …`), then `notify pgrst, 'reload schema';`.
5. The `validation-schema-parity` CI gate then asserts validation ⊇ manifest.

No PostgREST DML-lockdown row is required: `source_anchors` is written only by the existing SECURITY-DEFINER sync path; `shows` write access is already locked down. **The plan MUST confirm at implementation time** that no new direct-from-`authenticated` write path to `shows.source_anchors` is introduced, consistent with the existing `shows`-table DML lockdown.

---

## 12. Testing strategy

- **Unit — `buildSheetDeepLink`:** every fallback rung (range / gid-only / none / null id → null); the **`gid === 0` case** — `buildSheetDeepLink(driveFileId, { gid: 0, a1: "A1:B2" })` MUST emit `…/edit#gid=0&range=A1%3AB2` (not degrade); the **URL-encoding** assertion (`a1 = "A1:C1"` → `…&range=A1%3AC1`); empty-string inputs (`driveFileId=''` → null; `a1=''` → gid-only rung); the `a1`-without-`gid` → whole-spreadsheet invariant (§5.3). **Negative-regression:** a truthy `if (gid)` implementation must fail the gid-0 test; stash the fallback logic and confirm the rung tests fail.
- **Export/parser — anchored-block emission:** against committed exporter fixtures (`tests/drive/exportSheetToMarkdown.test.ts`, `tests/parser/exporterFixtures.test.ts`), assert each emitted block's `{gid, a1}` matches expected, including a **merge-origin** case (anchor = merge top-left) and a **trimmed-block** case (origin shifted by `trimBlock`).
- **Allowlist meta-test (§9):** walk the corpus fixtures; assert **no** produced anchor's gid resolves to an excluded tab title (matching the Sheets-API title exactly); plus a positive assertion that master-library tabs (`CLIENT`, `VENUE`, `ROLE`, …) never match the allowlist. Structural defense against the "wrong show" class.
- **Block-map parity:** the set of block ids the renderer reads == the writer-emittable set == the canonical 9 (`crew, venue, dates, financials, hotels, flights, gear_scope, gear_packlist, schedule`); assert each is rendered at least once across the fixture suite (Today reuses, introduces none).
- **Corpus regression:** for representative committed fixtures across both format eras (per D11), assert anchors resolve to the right tab + region per §8.
- **Projection guard:** `getShowForViewer` projects `drive_file_id` + `source_anchors`; assert the empty-object (`{}`) and null-`drive_file_id` paths render no broken links.
- **Real-browser (Playwright + impeccable gate; jsdom insufficient):**
  - **Dimensional invariant (§5.4):** baseline = `main` branch HEAD as of 2026-06-21; viewport = crew viewer, desktop; method = `element.getBoundingClientRect().height`, 0.5px absolute tolerance; measured rows = `PersonRow`, `FactRows`, `KeyValueRows`, `KeyTimesStrip`. Anti-tautology: measure rows present in the baseline, not diff-introduced elements.
  - the `href` is correct at each fallback rung.
  - **Anti-tautology:** assert `href` against the projected `source_anchors` data source, NOT against the rendered container (which also renders the value). When scanning DOM for the link, scope to the block header so a sibling can't satisfy the assertion.
- **Crew-wide sweep:** after any shared-primitive change (e.g. `SectionCard`), run the sentinel meta-test + a broad crew render sweep (a shared-primitive change can break distant tiles).

### Meta-test inventory (per AGENTS.md)

- **CREATES:** the §9 allowlist meta-test (new structural registry: produced-anchor → allowed-tab).
- **EXTENDS:** the fields-mask pin (`tests/sync/defaultDriveClientSheetsFieldsMask.test.ts`) for the widened `sheetId` mask.
- **Advisory-lock topology:** unchanged — no new `pg_advisory*` holder (Hop 4 rides the existing sync lock). Declared explicitly per the rule.
- **PostgREST DML lockdown:** no new RPC-gated table; `shows` already locked down. No new registry row required (confirm in plan).
- **Supabase call-boundary (invariant 9):** no new query expected (Hop 5 reuses the fetched `shows` row); if one is added, register in `tests/auth/_metaInfraContract.test.ts`.

---

## 13. Routing & UI quality gate

- **UI (Opus + impeccable):** crew section components, the link/affordance component, the `buildSheetDeepLink` consumption, any `SectionCard` action-slot change, `app/show/[slug]/[shareToken]/**`, `components/crew/**`. Ships only after `/impeccable critique` AND `/impeccable audit` pass on the diff (invariant 8), with HIGH/CRITICAL fixed or DEFERRED.
- **Backend (heavier lift; implementer per ROUTING):** the export-seam change, gid capture, parser association, migration, sync write path, `buildSheetDeepLink` helper + unit tests. If driven under Codex, the UI tasks hand back to Opus (hard rule: UI is always Opus).
- **Process (per D10):** spec + plan to cross-model adversarial APPROVE (unlimited rounds), user review waived, then implement → PR → CI → merge.
- **TDD per task; conventional-commits; commit per task** (invariants 1 & 6).

---

## 14. Risks & open questions

1. **Export ↔ parser block alignment (principal risk).** The parser's section detection must line up with the export's block boundaries so each section gets exactly one anchor. Mitigation: make the export the single source of block boundaries; pin alignment with fixtures across both format eras. If alignment proves intractable for a given block, that block degrades to **tab** precision (still useful) rather than blocking the feature.
2. **Schedule day-band precision.** AGENDA is day-banded by *column* with non-uniform band widths; the single `schedule` anchor's A1 range must capture the relevant column span. v1 ships one agenda-grid anchor (one `schedule` id); per-day refinement reuses the same id (§8) and does not expand the block-id set.
3. **Extra Sheets API call.** Hop 1 may add one `listSpreadsheetSheets` call per sync to the parse path (or reuse the enrichment call). Cheap, but the plan enumerates the call site to avoid a redundant round-trip.
4. **gid stability.** Google gids are stable per tab; persisted values self-heal on every full-replace sync.

---

## 15. Disagreement-loop preempts (for the adversarial reviewer)

**EXPLICITLY DO NOT RELITIGATE** — each settled with evidence:

- **Cell-exact precision (Tier 4) is out of scope.** Corpus sweep of all live sheets (D11) showed one packed multi-value cell backs many parsed fields on *every* sheet (e.g. crew `name+duties+role` in one cell; a flight itinerary's origin/airline/time/conf# in one cell; *all* crew members' hotel confirmation numbers in one cell). Cell-exact is therefore semantically wrong, not merely hard. The only clean cell-exact pocket (AGENDA grid) is included opportunistically. `docs/superpowers/plans/BACKLOG.md` ("No source-cell provenance") documents the reverse-mapping as a deferred, brittle change.
- **Crew-facing, always-shown is intentional (D1/D2).** Not a privacy regression: Doug already shares the raw, role-ungated sheet with all crew; app gating is additive UI, not a sheet boundary. Crew have view access (no request-access wall).
- **"Tab-level first" staging was considered and rejected.** For the legacy single-`INFO` sheets (majority of corpus per D11), tab-level ≈ whole-spreadsheet and does not serve the verify job. We build block-range directly behind a graceful fallback.
- **Per-row / per-field links were considered and rejected.** Verified in visual brainstorming: a per-row glyph truncates dense rows (Crew role line). Affordance is per-source-block (D5).
- **The allowlist exclusion of `CLIENT/VENUE/TECH/ROLE/VEHICLE/...` tabs is deliberate.** In the standardized format (2026 sheets, e.g. RPAS/FinTech) these are company-wide master libraries, not per-show data; linking there points at the wrong show (§9).

---

## 16. Out of scope

- Write-back to the sheet; reverse field→cell mapping (BACKLOG).
- Per-row / per-field deep links.
- Cell-exact precision outside the AGENDA grid.
- Any change to crew-page data rendering, auth, or the picker flow.
- Backfilling anchors for historical syncs beyond the next natural sync (full-replace makes the next sync populate them).
```
