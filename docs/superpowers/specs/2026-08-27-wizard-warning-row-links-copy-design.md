# Sheet-warning rows: a link to the cell they name, and copy that names only the controls they carry

**Status:** APPROVED 2026-08-27 by bl-orch ruling at the four-round spec cap (round-economy filing `docs/review-rounds/fix/wizard-warning-row-links-copy/66c9857f56a5.md`), on the condition that T1's binding be derived from the join key's components rather than extended per round (§2.3, done). Branch `fix/wizard-warning-row-links-copy`. Dispatched directly by Eric from a screenshot of the onboarding wizard (step 3, "Review before publishing", show `II - RIA Investment Forum - Central 2025`); no ledger row dispatched it. Orchestrator: bl-orch (`w15:p2`). Roles: this session writes spec + plan; a separate Opus pane implements and closes out; **bl-orch alone merges**.

## 1. The problem, as measured on the fixture

The screenshot shows the wizard's Sheet warnings panel listing four warn rows. None carries an "Open in Sheet" link. The section header's corner link opens `INFO!A1`. Three of the four rows end with "Report flags it to us; Ignore hides this notice." and there is no Report and no Ignore anywhere on the row.

Running the parser on the committed fixture of that show (`fixtures/shows/raw/2025-06-ria-investment-forum.md`, `parseSheet` from `lib/parser/index.ts`) reproduces all four rows; the same show's workbook is committed as `fixtures/shows/exporter-xlsx/ria.xlsx` (README row "RIA Investment Forum Central 2025"), and synthesizing it reproduces the same four:

```
HOTEL_GUEST_SPLIT_AMBIGUOUS  blockRef {kind:"hotels", field:"guests", index:0, name:"Park Hyatt Chicago"}  sourceCell:null
UNKNOWN_FIELD  blockRef {kind:"timestamp", name:"Room Diagram"}  raw "Room Diagram | "   candidate "DETAILS/ROOM DIAGRAM"  sourceCell:null
UNKNOWN_FIELD  blockRef {kind:"timestamp", name:"Backdrop"}      raw "Backdrop | "       candidate "Backdrop / Scenic"     sourceCell:null
UNKNOWN_FIELD  blockRef {kind:"console",   name:"Speaker"}       raw "Speaker | QSC KLA" candidate "Virtual Speaker"       sourceCell:null
```

Why each is link-less:

- **The three `UNKNOWN_FIELD` rows.** The wizard renders the row link only when `warning.sourceCell` resolved (`components/admin/wizard/step3ReviewSections.tsx`, the `w.sourceCell ? buildSheetDeepLink(dfid, w.sourceCell) : null` site in the warnings list). `sourceCell` for `UNKNOWN_FIELD` is set by `attachSourceCellAnchors` (`lib/drive/showDayTimeAnchors.ts`, the `w.code === "UNKNOWN_FIELD"` arm) from the anchors `extractUnknownFieldAnchors` builds (`lib/drive/unknownFieldAnchors.ts`). That scanner walks ONE tab (`INFO`) and TWO header families (`BLOCKS`: `venue`, `details`) and keys every anchor on that family's kind. The detector that emits the warning (`detectFieldNearMisses`, `lib/parser/fieldNearMiss.ts`) keys `blockRef.kind` on `anchorNamespace(row.opener)`: `"venue"`, `"details"`, or the row's normalized physical block opener. `Room Diagram` and `Backdrop` sit in a Google-Form response block whose opener cell is `Timestamp`, on the workbook's `FORM` tab (`FORM!A1` is `Timestamp`, `FORM!A29` `Room Diagram`, `FORM!A30` `Backdrop`; the markdown fixture concatenates tabs, which is why the fixture line numbers 314 and 921 do not say which tab); `Speaker` sits in an inventory matrix whose opener is `Console` on the `3rd Level` tab (`3rd Level!A1` `Console`, `3rd Level!A2` `Speaker`). The RIA workbook has no `GEAR` tab at all (its tabs: INFO, AGENDA, DIAGRAMS, FORM, PULL SHEET, LIST, CONTACTS, DROP DOWN, ITEMS, 2nd Level, 3rd Level). Neither tab is in `SOURCE_LINK_ALLOWLIST` (`INFO`, `AGENDA`, `GEAR`, `TRAVEL`, `PULL SHEET`), and `FORM` is one of the eight names `tests/sheet-links/allowlistMeta.test.ts` pins OUT of that list. Neither kind is one the scanner ever emits, so `resolveUnknownFieldCell` returns `null`; and even a scanner that walked every tab would hit a second wall, because `buildSheetDeepLink` collapses any anchor whose title is outside the allowlist onto `#gid=0` (the "disallowed title → first tab (read-time allowlist guard)" case in `tests/sheet-links/buildSheetDeepLink.test.ts`). Two gates, both built for REGION anchors, both closing on a cell the scanner has just located by content. The field-near-miss spec records this outcome as "documented-safe" and names `Timestamp` as its example (`docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` §2.2, consequence (a)). Safe, and exactly the complaint: the card tells Doug to rename a row and gives him no way to reach it.
- **The hotel row.** `HOTEL_GUEST_SPLIT_AMBIGUOUS` is not in `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts`, the set literal), which is also `CELL_ANCHORED_CODES` (`lib/drive/showDayTimeAnchors.ts`, `export const CELL_ANCHORED_CODES = OPERATOR_ACTIONABLE_ANCHORED`), so `attachSourceCellAnchors` skips it before any arm runs. That absence is ratified twice: `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md` row **cc** ("do NOT add ... ambiguity codes are spot-check, not anchored-actionable") and `docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md` row **w** (R45 finding 3).
- **The header link.** `SECTION_REGION_MAP.warnings` is `null` (`lib/admin/step3SectionStatus.ts`), so the section's corner link takes `buildSheetDeepLink`'s `#gid=0` fallback (`lib/sheet-links/buildSheetDeepLink.ts`). Correct as designed; it was never meant to stand in for row links.

Why the copy is wrong on this surface: the wizard row renders the catalog's `helpfulContext` verbatim (`step3ReviewSections.tsx`, `const context = ... messageFor(w.code as MessageCode).helpfulContext`). The Report and Ignore buttons live in `DataQualityWarningControls` (`components/admin/DataQualityWarningControls.tsx`), mounted only by the published show page's `SectionWarningItemControls` (`components/admin/showpage/sectionWarningExtras.tsx`). The wizard row mounts `UseRawControlBoundary` and `RoleRecognizeControlBoundary` only. Ignore cannot exist before publish at all: its route is `app/api/admin/show/[slug]/data-quality/ignore`, keyed by a show slug, and a staged row has `driveFileId` and `wizardSessionId` only. Class sweep over `lib/messages/catalog.ts` for `helpfulContext` strings that name a card control the wizard does not render:

| code | sentence the wizard cannot honour |
| --- | --- |
| `UNKNOWN_FIELD` | "Report flags it to us; Ignore hides this notice." |
| `PULL_SHEET_PARSE_PARTIAL` | "The Report button on this card sends it to us if you'd like the format supported." |
| `UNKNOWN_SECTION_HEADER` | "or use the Report button on this card if it should be supported." |

`UNKNOWN_ROLE_TOKEN`'s "this card's controls let you add it as a real role" is NOT in the set: the wizard row mounts `RoleRecognizeControlBoundary`, so that sentence is true there.

A fourth observation, out of this arc's repair scope and filed instead (§8): two of the three near-miss rows are noise. A form-response dump and a gear inventory matrix are not "rows we show", so "rename this row so it matches the row we show" is wrong advice in those blocks whatever link it carries.

## 1.1 Resolved scope, do not relitigate

- **Four deliverables, ratified by Eric 2026-08-27 in the dispatching conversation:** (A) row deep links for `UNKNOWN_FIELD` in every block kind and every tab (his selected option reads "all block kinds and tabs"), with a tab-level fallback; (B) the three copy rows above stop naming Report/Ignore where they do not render; (C) a REGION link for the hotel ambiguity codes; (D) a product-facing ledger row for near-miss candidacy noise. Autonomous pipeline approved at the brainstorming gate.
- **(C) reopens rows cc and w above by owner decision, at REGION grain only.** The hotel codes do NOT join `OPERATOR_ACTIONABLE_ANCHORED`; that set's membership (and `tests/parser/operatorActionableWarnings.test.ts` "contains exactly the twenty-four codes") is unchanged. The reopened part is narrower than the ratified refusal: the refusal said "not anchored-actionable"; this arc gives the card a link to the HOTEL block, never a cell, and the card's actionability class is untouched. A reviewer who reads (C) as a membership change is reading a change this spec does not make.
- **The near-miss detector's emission set is unchanged.** Which rows become `UNKNOWN_FIELD` is `detectFieldNearMisses`' business and is pinned by `tests/parser/fieldNearMissBaseline.test.ts` (the 65-row measured baseline). This arc changes where a warning LINKS, never whether it fires. Candidacy noise files to the ledger (§8); it is not repaired here, because which blocks are legitimate near-miss homes is a product call (class-sweep exception (a)).
- **`anchorNamespace` stays the single kind definition.** It is exported from `lib/parser/fieldNearMiss.ts` and imported by the scanner. The 2026-08-15 near-miss spec's ratified amendment ("the two DETAILS families are deliberately NOT the same set", `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` §2.2) is RETIRED by construction, not contradicted: after this arc there is one family because there is one function. Two executable pins of that asymmetry in `tests/parser/fieldNearMissBaseline.test.ts` flip with it (§2.6); the AC-N9 rows themselves stay anchored (§5, AC-3). The amendment paragraph gets a dated note pointing here (§4.4 lockstep).
- **Never-wrong-cell (spec §5.1.1 of the source-link work, restated in `unknownFieldAnchors.ts`'s header) is kept, by the same mechanism:** the `(kind, label, value)` join returns a cell only on EXACTLY ONE match. Widening the input set of the join cannot produce a wrong cell; it can only turn a `null` into a cell that matched uniquely.
- **The wizard row does not gain Report or Ignore.** Ignore is structurally impossible pre-publish (no slug); Report on a staged row is a separate product surface with its own identity questions (`ReportButton` takes a `showId`) and is not in scope. Copy is repaired to match the controls that exist, not the other way round.
- **`helpfulContext` stays §12.4 prose and stays surface-neutral.** The control sentence moves to a NEW catalog-internal field (§4), on the model of `triggerContext` (catalog-internal, "not §12.4 prose", `lib/messages/catalog.ts` `MessageCatalogEntry` doc comment). §12.4 and the copy-restore §4.2 table change in lockstep (§4.3).
- **Row anchors reach every tab the exporter includes; the REGION allowlist is unchanged.** The dispatching rows live on `FORM` and `3rd Level`, so deliverable (A) is empty without this. `SOURCE_LINK_ALLOWLIST` keeps governing region anchors exactly as today (`extractSourceAnchors` chooses only allowlisted tabs; `allowlistMeta.test.ts` keeps `FORM` and the master-library tabs out of it), and the 2026-06-26 fence "adding new tabs to `SOURCE_LINK_ALLOWLIST` is a separate decision" (`docs/superpowers/specs/parser/2026-06-26-parse-warning-deeplinks-design.md` §12) is NOT crossed: no tab is added to that list. What changes is that an anchor the scanner produced, which carries a `scope` of `"cell"` or `"tab"` (§2.5), is trusted by `buildSheetDeepLink` on any tab with a numeric gid, because the scanner located that cell by content on that very tab and the wrong-tab hazard the read-time guard defends against (a region header regex matching inside a master-library tab) cannot arise for it. Unscoped anchors (every region anchor, every legacy persisted anchor, the crew-role and show-day anchors) keep the guard byte for byte.
- **The section header link is not changed.** `SECTION_REGION_MAP.warnings = null` stays. Row links are the repair.
- **Merge is bl-orch's.** The arc ends with a readiness line, never `gh pr merge`, never auto-merge.

## 2. Change A: anchors derived from the exporter's own block pipeline

### 2.1 The defect is structural, not a missing header regex

`extractUnknownFieldAnchors` today re-derives block structure from the raw grid with its own header regexes (`BLOCKS`), its own terminator set (`TERMINATORS`, `DETAILS_NON_TERMINATOR_FIELDS`), and its own label/value rule (`firstNonBlank` for the label, `nextNonBlankAfter` for the value). The detector derives block structure from the synthesized markdown: `scanRowsWithOpener` (`lib/parser/blocks/_rowScan.ts`) takes the first `|` line of each pipe run as the opener, and reads `cells[0]` as label and `cells[1]` as value (`detectFieldNearMisses`). Two implementations of "which block is this row in, and what is its label" that were written to agree on two header families and never agreed anywhere else. Adding `timestamp` and `console` to `BLOCKS` would be the per-instance patch: the next sheet has a block opening on `Client:` or `JOANN` (both already in the near-miss spec's examples) and the same defect returns.

### 2.2 Design: one block pipeline, two consumers

`synthesizeMarkdownFromXlsx` (`lib/drive/exportSheetToMarkdown.ts`) already computes the exact structure the detector reads: per non-`OLD` tab, `sheetGrid` → `normalizePullSheetGrid` → `splitBlocks` (blank-row split plus `isMidBlockSectionStart` mid-block split, then `trimBlock` column slicing) → `normalizeBlock` (identity today) → `tableMarkdown`. Row `i` of a block's markdown table IS row `i` of that block's grid; `trimBlock` removes columns, never rows, and blank rows are separators, never members. The pipeline is refactored so its structure is a first-class value:

```ts
// lib/drive/exportSheetToMarkdown.ts (new exports; existing exports unchanged)
export type GridBlock = {
  kind: "grid";
  sheetName: string;
  /** absolute sheet column of cells[0] (range.s.c + the block's trimmed first column) */
  absCol0: number;
  rows: { absRow: number | null; cells: string[] }[];
};
export type OpaqueBlock = { kind: "opaque"; markdown: string }; // included OLD-tab pull-sheet regions
export type SynthesizedBlock = GridBlock | OpaqueBlock;
export function synthesizeBlocksFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { blocks: SynthesizedBlock[]; archivedPullSheetTabs: ArchivedPullSheetTab[] };
/** One table row exactly as tableMarkdown emits it: padded to `width`, each cell through escapeCell. */
export function renderRow(cells: readonly string[], width: number): string;
export function escapeCell(value: string): string; // existing private helper, exported
```

`synthesizeMarkdownFromXlsx` becomes `synthesizeBlocksFromXlsx` followed by a renderer (`tableMarkdown` for grid blocks, verbatim for opaque blocks, joined with `\n\n`). The markdown is unchanged byte for byte; `tests/drive/round-trip-fixture.test.ts` (corpus byte-equality plus the archived-tab fingerprint golden) is the pin, and it is not edited.

Coordinates ride along where the pipeline has them and are `null` where it does not:

- `sheetGrid` rows map to `range.s.r + i`; blocks record each row's `absRow`.
- `normalizePullSheetGrid` on a `PULL SHEET` tab synthesizes a title row (every cell set to the joined title parts) and slices the grid from `firstDataRow`; the synthesized row gets `absRow: null`, the sliced rows keep theirs.
- `trimBlock` slices columns; the block records `absCol0`.
- Included `OLD`-tab regions are `opaque` (they are collected from rendered markdown, not from the grid).

The row conversion the scanner applies is one named, exported function so the equivalence test binds the scanner's own path rather than a re-derivation of it: `blockRowsForScan(block: GridBlock): string[][]` in `lib/drive/unknownFieldAnchors.ts` (pad to block width, `escapeCell`, join as `tableMarkdown` does, `splitRow`). `extractUnknownFieldAnchors` calls it and nothing else for cell text.

The anchor scanner is rewritten on top of it:

```ts
// lib/drive/unknownFieldAnchors.ts (same export names, same UnknownFieldAnchor shape)
export function extractUnknownFieldAnchors(buffer, titleToGid): UnknownFieldAnchor[]
```

For every `grid` block (every tab the exporter includes, §2.5) that has a gid in `titleToGid`: feed `blockRowsForScan(block)` to the shared opener/alignment core (§2.3), take `kind = anchorNamespace(opener)`, and for every non-alignment row with a non-blank `cells[0]` and a non-null `absRow`, push `{ kind, label: normalizeCellKey(cells[0]), value: normalizeCellKey(cells[1] ?? ""), anchor: { title: sheetName, gid, a1: encode_cell({ r: absRow, c: absCol0 }) } }`. `BLOCKS`, `TERMINATORS`, `DETAILS_NON_TERMINATOR_FIELDS`, `firstNonBlank`, `nextNonBlankAfter` are deleted; nothing else imports them (verify with `rg` at plan time).

`resolveUnknownFieldCell` keeps its signature and its exactly-one rule.

### 2.3 The shared core, so the two paths cannot drift

`scanRowsWithOpener(markdown)` is split into a line-grouping shell and a pure core:

```ts
// lib/parser/blocks/_rowScan.ts
export function scanBlockCells(rowsOfCells: string[][]): { cells: string[]; opener: string; index: number }[];
export function scanRowsWithOpener(markdown: string): ScannedRow[]; // unchanged contract; now = group pipe lines into runs, splitRow each, scanBlockCells per run
```

`scanBlockCells` owns the two rules the detector depends on: opener = `clean(rows[0][0] ?? "")`, and the alignment-row skip (`cells.every(seg => /^[\s:|*-]*$/.test(seg))`). `index` is the row's position in the INPUT array, so a caller that skipped rows can map back. The scanner feeds it, per grid row, `splitRow` of the row rendered exactly as `tableMarkdown` renders it: the row padded with empty cells to the block's width, each cell through `escapeCell`, joined with `" | "` between pipes. Same padding, same escape, same split as the markdown path, so the cell arrays the core sees on the two paths are byte-identical (a one-cell row on a three-column block yields `["x", "", ""]` on both). `escapeCell` is exported for this. The delimiter row `tableMarkdown` inserts is not fed on the coordinate path; the markdown path skips it by the alignment rule, so both paths see the same data rows.

This is the equivalence the whole design rests on, and it is pinned executably rather than trusted (§5, T1), in two halves. (a) For every `fixtures/shows/exporter-xlsx/*.xlsx`, the `(opener, cells)` sequence from `scanBlockCells(blockRowsForScan(block))` over all grid blocks, in order, equals the `(opener, cells)` sequence `scanRowsWithOpener` yields over `synthesizeMarkdownFromXlsx(buffer).markdown`; both come from the same buffer with default options, so `OLD` tabs are absent from both. (b) For the same workbooks, every anchor `extractUnknownFieldAnchors(buffer, gids)` returns has a `(kind, label, value)` triple that occurs in the multiset `scanRowsWithOpener(markdown)` yields after `anchorNamespace(opener)` / `normalizeCellKey(cells[0])` / `normalizeCellKey(cells[1])`, with the premise that the anchors span more than one kind and at least one label contains a character `escapeCell` rewrites (the corpus has `# of Technicians Needed`), so an extraction path that skipped escaping or padding is caught on the corpus, not only on a plain-cell fixture. (c) For every anchor, an independent `xlsx` read of the row `anchor.a1` sits on (the cells from `anchor.a1`'s column rightward on `anchor.title`), pushed through the SAME shipped conversion the scanner uses (`renderRow` padded to that row's width, then `splitRow`), yields a first cell whose `normalizeCellKey` equals `anchor.label` AND a second cell whose `normalizeCellKey` equals `anchor.value`, AND the exporter block that contains `a1`'s row has an opener whose `anchorNamespace` equals `anchor.kind`, AND `anchor.gid` equals `titleToGid.get(anchor.title)`.

**Derivation of that binding, so it is not extended one predicate per round.** `resolveUnknownFieldCell` joins on exactly three fields of `UnknownFieldAnchor` (`kind`, `label`, `value`) and returns `anchor` (`title`, `gid`, `a1`). Each join field is produced by the shipped conversion from exactly one source: `kind` from the BLOCK (`anchorNamespace(opener)`, opener = row 0 cell 0 of the block), `label` from the ROW's cell 0, `value` from the ROW's cell 1; and the anchor's three fields come from the block's tab (`title`, and `gid` through `titleToGid`) and the row's coordinate (`a1` = the row's `absRow` at the block's `absCol0`). So the whole key has FOUR components (tab, block kind, label, value) and the anchor names a tab and a cell; a correct anchor is one whose cell sits in a block of that kind on that tab and whose row produces that label and that value. (c) checks all four against an independent read: tab (gid ↔ title), block kind (the block containing `a1`'s row), label and value (the row through the conversion). Column is bound by the label check (a wrong column yields a different first cell, or a blank one the scanner never anchors); row is bound by the label + value pair within the block; two rows in one block with the same pair never reach a cell (the unique join returns the tab); the same pair in two blocks of the same kind on one tab is two matches (tab); the same pair in two blocks of different kinds is two different keys, and the block-kind check is what catches an anchor keyed on one and pointing into the other. There is no fifth component: nothing else the join reads exists. The count is stated so a reviewer who wants a further predicate must first name a fifth join input, and there is none. Corpus instances that motivated the last two predicates: `Room Diagram` on both `INFO` and `FORM` in `consultants.xlsx` and `redefining-fi.xlsx`, with different values (value check), and the same label under two different openers (kind check). Not the raw cell text: `escapeCell` writes a literal pipe as `\|` and `splitRow` splits on every pipe regardless, so a cell such as `ria.xlsx` `INFO!A47` (`Holiday Inn Express & Suites | Dubois, ...`) reaches the detector as two cells, the first ending in a stray backslash that `clean` strips, and the anchor's label is that first fragment. That is a pre-existing exporter/parser quirk this arc mirrors on purpose (the detector's view is the truth the anchor must match) and does not repair; recorded in §9. A wrong `absRow` or `absCol0` fails (c) on every corpus sheet; the `B2`-origin case in T3 covers the offset the corpus cannot (all seven corpus sheets start at `A1`, measured).

### 2.4 Tab-level fallback

When the join finds zero or several cells, the warning still knows its block kind, and the scanner knows which tab every block of that kind lives on. `resolveUnknownFieldCell` gains a second return path: if no unique cell matched and every anchor with this `kind` shares one `(title, gid)`, return `{ title, gid, scope: "tab" }` with NO `a1`. `buildSheetDeepLink` renders that as `#gid=<gid>` (the `if (anchor.a1)` branch is skipped), so the link opens the right tab. If the kind spans several tabs, or matches no anchor at all, return `null` as today.

Downstream reads of `sourceCell` were checked for an `a1`-less anchor:

- `operatorActionableWarnings` dedup (`lib/parser/dataGaps.ts`) keys on `w.sourceCell?.a1` and skips dedup when it is falsy: two tab-level `UNKNOWN_FIELD` rows on one tab stay two cards. Correct, and the reason the fallback carries no `a1` rather than a range.
- `stripLegacyUnknownFieldAnchors` (`dataGaps.ts`) strips only an `a1` that contains a colon (a range); an absent `a1` passes through.
- The autofix summary anchor (`dataGaps.ts`, the `const anchor =` site that requires `sc.a1` to be a non-empty string) renders no anchor for it. Fine: that summary is a per-cell affordance.
- The IGNORE fingerprint is content-only by design (`lib/dataQuality/warningFingerprint.ts` `warningFingerprint` reads `code` and `rawSnippet`; `lib/dataQuality/warningIdentity.ts` says so in its comment), so a warning Doug ignored while it was link-less stays ignored after it gains an anchor. The React key / report surface id (`warningIdentityKey`) DOES fold `sourceCell`; that identity is per render and per report and changes harmlessly.
- `correctionLoopCopy("resync")` ("Fixed it in the sheet? Edit the cell, save, then re-sync...") is gated on `sourceCell` non-null in `NoteWarningCard.tsx` (`notePopoverParts`, `w.sourceCell ? correctionLoopCopy("resync") : null`) and in `PerShowActionableWarnings.tsx` (the `followUp` const, `w.sourceCell && ...`). "Edit the cell" is wrong at tab grain, so both gates become `sourceCell?.a1` non-blank: a cell anchor and a region range keep the sentence exactly as today, a tab-level anchor drops it and keeps only the link. Pinned: `notePopoverParts` (pure, already unit-tested) with `{ title, gid, scope: "tab" }` returns `sentence: null` and with `{ title, gid, a1: "A2", scope: "cell" }` returns the sentence; the published card's `followUp` likewise, in `tests/components/admin/perShowActionableFollowUp.test.tsx`. Red: both gates read `sourceCell` alone today.
- `lib/reports/submit.ts` `sourceCellFrom` returns a location only when `a1` is a non-blank string, so a tab-level anchor yields no location line in the issue headline; the body still serializes the full `fieldRef` (tab and gid included). Acceptable: the headline's location is a per-cell affordance. `a1` is already optional in `SourceAnchor` (`buildSheetDeepLink.ts`, `a1?: string`).

### 2.5 Guards on the input

- Every `grid` block on every tab the exporter includes produces anchors (`OLD` tabs are already dropped by the exporter). The anchors carry `scope: "cell"`; the tab-level fallback of §2.4 carries `scope: "tab"`. `SourceAnchor` gains `scope?: "cell" | "tab"` (`lib/sheet-links/buildSheetDeepLink.ts`), optional so every persisted anchor and every other producer is unchanged. `buildSheetDeepLink` applies its title allowlist only when `scope` is absent; a scoped anchor with a numeric gid renders `#gid=<gid>` plus `&range=` when `a1` is present, on any tab. Pinned in `tests/sheet-links/buildSheetDeepLink.test.ts`: a `scope: "cell"` anchor on `FORM` renders its cell; a `scope: "tab"` anchor on `3rd Level` renders `#gid=<gid>` alone; the existing "disallowed title → first tab" case is kept verbatim for the unscoped shape. Consequence for the freshness projection (`docs/superpowers/specs/2026-08-03-modal-freshness-cue.md` mechanism 2, test N12): it hashes the resolved href through the shipped function, so a scanner anchor on a non-allowlisted tab now contributes a real href rather than `#gid=0`; that is a rendered change and correctly moves the signature.
- A tab with no gid in `titleToGid` produces no anchors (today's rule, kept).
- `absRow: null` rows (the synthesized pull-sheet title row) produce no anchors.
- `opaque` blocks produce no anchors.
- Blank `cells[0]` rows produce no anchors; the detector never flags them (`isCandidateLabel` rejects blank).
- A cell inside a merged region: `sheetGrid` expands merges so every covered cell carries the top-left value, and the anchor is the row's own coordinate. Google Sheets selects the merged range when given any covered cell. Same behaviour as `buildAbsGrid` today.

### 2.6 What this changes for rows already anchored

The venue and DETAILS-family rows anchor as before, through `anchorNamespace` returning `"venue"` / `"details"` for those openers. One behaviour differs and is a correction: today's scanner is over-inclusive across an internal blank row inside a DETAILS block (pinned by `tests/drive/unknownFieldAnchors.test.ts` "over-inclusive: does NOT stop at an internal blank row within the block"). The detector never saw the block that way: the exporter splits at the blank row, so the rows after it carry the SECOND block's opener as their kind, and today's `"details"`-keyed anchor for them could never match. Under this design those rows anchor under their real kind. That test is replaced by one asserting the new truth (resolution through `resolveUnknownFieldCell` from a warning produced by `parseSheet` on the same synthesized markdown, never by reading `kind`).

Two pins in `tests/parser/fieldNearMissBaseline.test.ts` state the retired asymmetry executably and flip in the same commit as the scanner: (i) "the anchor scanner's header set is narrower than the detector's DETAILS family" (the `withHeader` case: `DETAILS` → 1 `details` anchor, `DETAILS/Room Diagram` → 0, `GS DETAILS (FOR BOTH)` → 0) becomes "every DETAILS-family spelling anchors the Stage row": for all three headers, a `parseSheet`-emitted near-miss row under that header resolves through `resolveUnknownFieldCell` to the Stage row's own cell (the opener row now also yields an anchor under `details`, so the old count of 1 is wrong for the first case too, and the replacement asserts resolution rather than a count); (ii) the "Timestamp-block row resolves null" case above it stays green only because its anchor set is the east-coast Stage table (no `timestamp` block in it), and its comment is rewritten to say that rather than to claim the documented-safe outcome. AC-N9's four resolutions (the "Stage/Storage rows stay anchored (AC-N9)" describe) are unedited and green: `eastCoastAnchors()` builds from the table whose opener is `DETAILS`, and `anchorNamespace("DETAILS")` is `"details"`.

## 3. Change C: a region link for the hotel ambiguity codes

`attachSourceCellAnchors`' gate is widened from the actionable set to `CELL_ANCHORED_CODES = OPERATOR_ACTIONABLE_ANCHORED ∪ HOTEL_REGION_ANCHORED`, where

```ts
// lib/drive/showDayTimeAnchors.ts
export const HOTEL_REGION_ANCHORED: ReadonlySet<string> = new Set([
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_CARDINALITY_EXCEEDED",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
]);
```

(the five `HOTEL_*` entries of `lib/messages/catalog.ts`; every emit site in `lib/parser/warnings.ts` sets `blockRef.kind: "hotels"`). A new arm in `attachSourceCellAnchors`: `HOTEL_REGION_ANCHORED.has(w.code)` → `cell = sources.region["hotels"] ?? null`. `REGION_ANCHOR_SPEC.hotels` exists (`buildSheetDeepLink.ts`, header-block on `INFO`, header `/^(HOTEL|HOTELS|Hotel Stays|Hotel Reservations)$/i`), and both ingestion paths already pass `region` anchors (`lib/sync/attachWarningAnchors.ts`; `lib/sync/applyParseResult.ts` re-runs the region-only pass). `hasCellAnchoredWarning` reads `CELL_ANCHORED_CODES`, so a sheet whose only warning is a hotel ambiguity now pays the gid round-trip it used to skip; that is the cost of the link and is bounded to one Drive call per scan.

Where the link shows: the wizard row (`step3ReviewSections.tsx`, gated on `sourceCell`) and the published hotel-section card (`PerShowActionableWarnings`, `sheetLink` from `sourceCell`; rendered through `sectionWarningExtras.tsx` for every warn-severity warning the section model routes, which is not filtered by `OPERATOR_ACTIONABLE_ANCHORED`). The region anchor is a RANGE `a1` (`A10:D20` shape), like `ORPHANED_CREW_ROWS` and the `FIELD_UNREADABLE` fallback. `operatorActionableWarnings` never sees hotel codes (not in its set), so its range-collapse dedup does not apply; the section model does not dedup by anchor. `stripLegacyUnknownFieldAnchors` is code-gated to `UNKNOWN_FIELD` and does not touch it.

`tests/parser/waveCodesNoSourceCell.test.ts` asserts the ABSENCE of a per-code arm for the three wave codes only and is unaffected; the new arm is code-gated to the hotel set.

**A structural contract is retired here, on purpose and in the same commit.** `tests/parser/parseWarningDeepLinkRender.test.tsx` (the "population gate IS the render gate, same object reference" case) asserts `CELL_ANCHORED_CODES` is the SAME object as `OPERATOR_ACTIONABLE_ANCHORED`, and the doc comments at the top of `lib/drive/showDayTimeAnchors.ts` ("SAME OBJECT the render surfaces gate on") and above `OPERATOR_ACTIONABLE_ANCHORED` in `lib/parser/dataGaps.ts` ("uses this SAME object as the anchor-population gate") state the one-object contract in prose. The contract's purpose was that population and render cannot drift; the replacement keeps the purpose with a wider statement: the test flips to `CELL_ANCHORED_CODES ⊇ OPERATOR_ACTIONABLE_ANCHORED` AND `CELL_ANCHORED_CODES \ OPERATOR_ACTIONABLE_ANCHORED` equals `HOTEL_REGION_ANCHORED` exactly (so any third set has to be declared, not smuggled), and both comments are rewritten to say "the render gate plus the hotel region set, pinned by that test". The sibling case in the same file ("hasCellAnchoredWarning is true for every anchored code, false otherwise") is re-read at implementation time: if its false example is a hotel code, it becomes a true example and a non-anchored code (e.g. `DATE_ORDER_SUGGESTS_DMY`) takes its place. The hotel spec rows cc and w are amended in place with a dated note pointing here (they are records; the note says what changed and where the decision lives).

## 4. Change B: the control sentence moves to a field only the controls' surface renders

### 4.1 New catalog field

```ts
// lib/messages/catalog.ts, MessageCatalogEntry
/**
 * One sentence naming the mutate controls on the published per-show card
 * (Report / Ignore). Catalog-internal, not §12.4 prose. Rendered ONLY where
 * `DataQualityWarningControls` is mounted; every other surface that shows
 * `helpfulContext` (the wizard step-3 row, note cards, help popovers) omits it
 * because it has no such controls. Spec 2026-08-27-wizard-warning-row-links-copy §4.
 */
controlsNote?: string | null;
```

### 4.2 The strings

`helpfulContext` loses the sentence; `controlsNote` gains it, reworded to lead with the imperative (impeccable F5 disposition in the near-miss catalog comment: "every action string leads with the imperative rather than system state").

| code | `helpfulContext` (after) | `controlsNote` |
| --- | --- | --- |
| `UNKNOWN_FIELD` | Rename this row in your sheet so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read. | Use Report to flag it to us, or Ignore to hide this notice. |
| `PULL_SHEET_PARSE_PARTIAL` | Some pull-sheet rows have a QTY we couldn't read (a word, or a range like '1-2'), so those rows show their original text. | Use Report if you'd like the format supported. |
| `UNKNOWN_SECTION_HEADER` | A header in your sheet isn't a section we know, so the rows under it aren't shown on the crew page. Rename it to a standard section. | Use Report if this section should be supported. |

No em dashes, no banned vocabulary (`tests/messages/_metaWarningCardCopy.test.ts` "banned vocabulary + em-dash absent from the three authored fields" is extended to `controlsNote`, §5 T6). `helpfulContext` stays under the registry's cap (the strings only shrink). The three `controlsNote` strings are pinned independently of the catalog by a frozen literal map `EXPECTED_CONTROLS_NOTE` in `tests/messages/warningCardCopyRegistry.ts`, compared byte for byte and total (key sets equal) by `_metaWarningCardCopy.test.ts`, because x1 (`tests/cross-cutting/codes.test.ts`) compares only `dougFacing`, `crewFacing`, `followUp`, and `helpfulContext` and cannot see the new field.

### 4.3 Where it renders, and the guard condition

`PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx`) gains one optional prop, `showControlsNote?: boolean`. `sectionWarningExtras.tsx` has three `PerShowActionableWarnings` mounts: the crew under-row active mount in `renderCrewUnderRowCards` (its `renderItemControls` passes `mode="active"`), the grouped active mount in `buildSectionWarningExtras` (also `mode="active"`), and the ignored mount (`mode="ignored"`). The two active mounts pass `showControlsNote`; the ignored mount does not, because that card's controls read `Report` and `Un-ignore` (`DataQualityWarningControls.tsx`, the `mode === "active" ? ... "Ignore" : ... "Un-ignore"` branch) and a note saying "Ignore" beside `Un-ignore` is wrong. When `showControlsNote === true` AND the entry has a non-blank `controlsNote`, the note renders. (Amended 2026-08-27 at plan review R1: an earlier draft also required `renderItemControls` to have returned a non-null node; React renders `undefined`, `false` and `""` as nothing, so a render-prop return is not evidence that a control is on the card, and the gate is the explicit prop alone, which only the two active per-show mounts pass.) It renders as the last sentence of the inline guidance line, separated by one space, in the same `data-testid="per-show-actionable-guidance"` element. Rendered element, not a new band: the card's layout, bands, and controls are unchanged. When `controls` is null (the `StagedReviewCard` mount, the attention gallery, any future mount without controls) the note is omitted. Condensed mode: the note follows the same path as `movedGuidance` (it is appended to the catalog guidance markup before that string is routed), so wherever the guidance goes, the note goes with it, and only when `controls` is non-null.

Guard table:

| input | renders |
| --- | --- |
| `controlsNote` absent / null / blank | guidance alone (today's render) |
| `showControlsNote` absent or false (every mount but the active per-show list, including the ignored list) | guidance alone, note never appended |
| `renderItemControls` absent, or returning `undefined` / `false` / `""` | irrelevant to the gate: the prop decides; the mounts that pass it are the ones that render `DataQualityWarningControls` |
| ignored mount (`mode="ignored"`): `showControlsNote` absent | guidance alone; `Un-ignore` never sits beside a sentence saying `Ignore` |
| `resolveGuidance` returns `instance` (autocorrect composed line) | instance text alone; the note is a catalog-guidance affordance and instance lines belong to codes without controls notes |
| both present, `catalog` guidance null | note alone in the guidance element |

The wizard row (`step3ReviewSections.tsx`) is untouched by this section: it renders `helpfulContext`, which no longer names a control. Note cards (`NoteWarningCard.tsx`) read `warningCardCopyFields(entry).guidance`, unchanged.

### 4.4 The lockstep, derived from the gates that read each site

| site | gate that reads it |
| --- | --- |
| `lib/messages/catalog.ts` three `helpfulContext` values | `tests/cross-cutting/codes.test.ts` (x1 parity: `dougFacing`, `crewFacing`, `followUp`, `helpfulContext` vs `SPEC_CODES`; it never reads `controlsNote`) |
| `lib/messages/catalog.ts` three new `controlsNote` values + the `MessageCatalogEntry` field | `tests/messages/_metaCatalogCopyHygiene.test.ts` `FIELD_POLICY` (`Record<keyof MessageCatalogEntry, FieldPolicy>`: a new field without a row is a COMPILE error; `controlsNote` is classified `"rendered-prose"`), plus the `EXPECTED_CONTROLS_NOTE` row below |
| `tests/admin/perShowActionableTransitions.test.tsx` (its `vi.mock` of `@/lib/messages/lookup` builds synthetic entries by spreading the real `UNKNOWN_FIELD` entry) | copy-reading gate: once `controlsNote` exists on `UNKNOWN_FIELD`, every synthetic variant inherits it unless overridden; the §11 variants set `controlsNote` explicitly per variant (`null` on `SYN_A`..`SYN_D`), so the existing four keep today's render |
| `tests/admin/perShowActionableRenderControls.test.tsx` "renders condensed helpfulContext as the guidance line" (reads `MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext`) | stays green: it renders without `showControlsNote`, so the guidance is the (shorter) `helpfulContext` alone; inventoried so nobody reads its green as covering the note |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 `helpfulContext` appendix, the `UNKNOWN_FIELD:` / `PULL_SHEET_PARSE_PARTIAL:` / `UNKNOWN_SECTION_HEADER:` lines | `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`, then x1 |
| `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.2 rows 15, 27, 29 | `tests/messages/_metaWarningCardCopy.test.ts` "canonical §4.2 rows and the catalog agree, read from the DOCUMENT itself" |
| `tests/messages/warningCardCopyRegistry.ts` `EXPECTED_HELPFUL_CONTEXT` three rows | `_metaWarningCardCopy.test.ts` "frozen copy fixture: helpfulContext matches spec §4.2 byte-for-byte" |
| `tests/messages/warningCardCopyRegistry.ts` NEW `EXPECTED_CONTROLS_NOTE` (three rows, the §4.2 strings) | `_metaWarningCardCopy.test.ts` NEW "frozen copy fixture: controlsNote matches spec 2026-08-27 §4.2 byte-for-byte, total" (T6(d)) |
| `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` §2.2 ratified amendment paragraph | none; a dated note is appended saying the asymmetry is retired by this arc and where |
| the `UNKNOWN_FIELD` catalog comment block (the "Impeccable gate dispositions ... `helpfulContext` documents BOTH card controls (F4)" paragraph) | none; rewritten so it does not assert the old placement |

All in one commit with the catalog edit (AGENTS.md "§12.4 catalog row edits require three lockstep updates"; here five sites, the two extra being the frozen copy registry and its §4.2 document). `docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md` §6 quotes the old string as a dated diff and is not edited.

## 5. Guards

Every test names the production line whose absence makes it fail.

- **T1, equivalence of the two paths (a NEW suite under `tests/drive/`, named synthesizeBlocksEquivalence).** For each of the seven `fixtures/shows/exporter-xlsx/*.xlsx`: (a) `(opener, cells)` from `scanBlockCells(blockRowsForScan(block))` over every `grid` block of `synthesizeBlocksFromXlsx(buffer)` equals `(opener, cells)` from `scanRowsWithOpener(synthesizeMarkdownFromXlsx(buffer).markdown)`; (b) every `(kind, label, value)` of `extractUnknownFieldAnchors(buffer, gids)` occurs in the markdown path's triple multiset (§2.3); (c) every anchor's row on its `title`, read independently with `xlsx` from `a1`'s column rightward and pushed through `renderRow` + `splitRow`, has a first cell whose `normalizeCellKey` equals the anchor's `label` and a second whose `normalizeCellKey` equals its `value`, the block containing that row maps to the anchor's `kind`, and `gid` matches `title` (§2.3: the four-component derivation, the pipe quirk, the same-label-different-value corpus rows). Premises stated executably: each fixture yields more than one block and at least one block with more than two rows; the anchors span more than one kind; at least one anchored label contains an `escapeCell`-rewritten character. Red on the live tree: `synthesizeBlocksFromXlsx` and `blockRowsForScan` do not exist. Catches: a coordinate path that trims, skips, pads, or escapes differently from the markdown path, and an extraction path that bypasses the shared conversion.
- **T2, markdown unchanged.** `tests/drive/round-trip-fixture.test.ts` unchanged and green after the refactor. Not a new test; named because it is the byte pin for §2.2.
- **T3, the four fixture rows resolve (new cases in `tests/drive/unknownFieldAnchors.test.ts`).** Corpus case first: read `fixtures/shows/exporter-xlsx/ria.xlsx`, synthesize, `parseSheet`, `attachWarningAnchors` with a gid map over the workbook's sheet names; assert each of the three `UNKNOWN_FIELD` warnings resolves to the cell whose text equals its label, found by an independent read of the sheet (never a hardcoded `A1`), on `FORM` (two) and `3rd Level` (one), with `scope: "cell"`, and that `buildSheetDeepLink` renders each as `#gid=<gid>&range=<cell>`; and that the hotel warning's `sourceCell` equals the `hotels` region `extractSourceAnchors` returns for that workbook. Then the constructed cases: build a workbook fixture containing (i) a `Timestamp`-opened block on `INFO` with `Room Diagram` and `Backdrop` rows, (ii) a `Console`-opened block on `GEAR` with a `Speaker | QSC KLA` row, (iii) a `VENUE NAME` block and a `DETAILS/Room Diagram` block (the AC-N9 shapes), (iv) a tab whose used range starts at `B2` (built with `XLSX.utils.sheet_add_aoa(ws, rows, { origin: "B2" })`) holding a `Timestamp` block, so the anchor must read `B3`, not `A2`: a coordinate path that drops `range.s.r` / `range.s.c` fails here and nowhere on the corpus, where every sheet starts at `A1`. Run `synthesizeMarkdownFromXlsx` → `parseSheet` → `attachWarningAnchors` with a `titleToGid` for both tabs, and assert through `resolveUnknownFieldCell` (never by reading `kind`) that each `UNKNOWN_FIELD` warning resolves to the row's own label cell on the right tab. Red on the live tree: kinds `timestamp` and `console` match no `BLOCKS` entry. Catches: a scanner that anchors only its old two families.
- **T4, tab-level fallback and its refusals.** Same suite: a kind whose `(label, value)` appears twice on one tab resolves to `{ title, gid, scope: "tab" }` with no `a1`; a kind present on two tabs resolves `null`; a row with `absRow: null` (pull-sheet synthesized title) yields no anchor; a block on a tab outside `SOURCE_LINK_ALLOWLIST` (`FORM`, the RIA shape) resolves to its cell with `scope: "cell"` and `buildSheetDeepLink` renders it (the retired refusal, asserted in its new direction). Red: `resolveUnknownFieldCell` returns only cell-or-null today, and `buildSheetDeepLink` collapses the `FORM` anchor.
- **T5, hotel region link.** `tests/drive/showDayTimeAnchors*.test.ts` (existing file that covers `attachSourceCellAnchors`; exact file verified at plan time): a `HOTEL_GUEST_SPLIT_AMBIGUOUS` warning with `blockRef.kind: "hotels"` and a `region.hotels` source gets that region as `sourceCell`; with no hotels region it stays `null`; `hasCellAnchoredWarning([hotelWarning])` is `true`. Membership pin: `OPERATOR_ACTIONABLE_ANCHORED` does not contain any `HOTEL_*` code (extend the existing exact-list test with a negative assertion so a later "fix" cannot fold the sets). Red: `CELL_ANCHORED_CODES` is the actionable set today.
- **T6, copy placement.** (a) `tests/messages/_metaWarningCardCopy.test.ts`: the banned-vocabulary sweep covers `controlsNote`; every code with a `controlsNote` is in `WARNING_CARD_COPY_CODES`; no `helpfulContext` of any `WARNING_CARD_COPY_CODES` member contains `Report` or `Ignore` as a control name (`/\b(Report|Ignore)\b/`), asserted over the whole registry so the class cannot regrow on the card surface (derived cover, not a three-code list). Scoped to the registry on purpose: `TILE_SERVER_RENDER_FAILED` and `TILE_PROJECTION_FETCH_FAILED` (`lib/messages/catalog.ts`, their `helpfulContext` lines) also say "use Report", render on the alert surface where a Report control exists, and are outside deliverable B. (b) `tests/admin/perShowActionableRenderControls.test.tsx`: with `showControlsNote` and `renderItemControls` returning a node, the guidance element's text ends with the note; with `renderItemControls` absent, or with controls present but `showControlsNote` absent (the ignored-list shape), the text does not contain it and matches neither `Report` nor `Ignore`; the expected note is the `EXPECTED_CONTROLS_NOTE` registry literal, never the catalog entry the component renders (T6(d)); (e) mount binding, in the suites that already drive the two factories (`tests/admin/showpage/crewUnderRowCards.test.tsx` for `renderCrewUnderRowCards`, `tests/components/admin/showpage/publishedReviewModal.test.tsx` or the `buildPublishedSurfaceProps` helper in `tests/helpers/publishedSurfaceProps.tsx` for `buildSectionWarningExtras`): a model with one active `UNKNOWN_FIELD` under a crew row, one grouped active `UNKNOWN_FIELD`, and one ignored `UNKNOWN_FIELD` renders the note on both active cards and not on the ignored card, read through the same strip-the-controls-first helper. Red: no mount passes the prop. clone-and-strip the controls node before reading text (anti-tautology: the Report button's own label must not satisfy the assertion). (c) `tests/components/step3SheetCard.test.tsx`: the wizard row for an `UNKNOWN_FIELD` warning contains neither "Report" nor "Ignore" in its text. Red for (c) on the live tree: the row renders the old `helpfulContext`. (d) `_metaWarningCardCopy.test.ts`: `CATALOG[code].controlsNote === EXPECTED_CONTROLS_NOTE[code]` for every key, and the key sets are equal, so a string can neither drift nor appear unpinned. Red: the map and the field do not exist. The render assertion in (b) reads its expected text from this literal, so the "expected content plus a suffix" mutant (a suffix added to the catalog string) fails (b) instead of passing through it.
- **P1, wizard row link on a non-family kind: a REGRESSION PIN, green on arrival, not a RED.** `tests/components/step3SheetCard.test.tsx`: an `UNKNOWN_FIELD` warning with `sourceCell: { title: "GEAR", gid: 7, a1: "A12" }` renders `wizard-step3-card-<dfid>-warning-<i>-open` with `href` ending `#gid=7&range=A12`; one with `sourceCell: { title: "INFO", gid: 0 }` (tab-level) renders it ending `#gid=0` and nothing after. Both pass on the live tree: the wizard passes any non-null `sourceCell` to `buildSheetDeepLink` (`step3ReviewSections.tsx`, the row link site) and the builder omits `range` when `a1` is absent (`buildSheetDeepLink.ts`, the `if (anchor.a1)` branch). It is added as cover for the shape this arc now produces and is never a task's `red=`.
- **Pre-dispatch mutants for the string-presence guards in T6** (writing-plans rule): value emptied; expected content plus a suffix; content present but inside the Report button label only; `controls` toggled. Results recorded in the commit.
- **T8, the correction sentence follows the cell, not the anchor.** `tests/components/admin/NoteWarningCard*.test.tsx` (`notePopoverParts`) and `tests/components/admin/perShowActionableFollowUp.test.tsx`: a `scope: "tab"` anchor without `a1` yields no "Edit the cell" sentence; a cell anchor and a region range do. Red: both gates test `sourceCell` truthiness only (§2.4).
- **T7, the ledger row exists with its fields (deliverable D).** RED and GREEN on the same command, live: `rg -q "^## BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS" BACKLOG.md` exits 1 on the live tree and 0 once the row lands. Field shape is then held by the walkers that already read every ledger row from disk: `tests/docs/_metaLedgerSizing.test.ts` (`Effort`), `tests/docs/_metaLedgerMintBar.test.ts` (`Filed` date, leading `Facing` token), `tests/docs/_metaLedgerInProgress.test.ts` (no flight field without a status). `Reachability` and `Class-sweep exception` have no walker; they are review's class, and the plan's task body carries the row verbatim so the reviewer reads the promised body rather than a description of it.
- **Corpus baseline unchanged.** `tests/parser/fieldNearMissBaseline.test.ts` green, unedited: the detector is not touched.

## 6. The GUARD SURFACE question, answered before the diff brief asks it

`lib/parser/fieldNearMiss.ts` is enrolled in the source-mutation registry (`tests/mutation/source/registry.ts`, id `fieldNearMiss`). This arc's only edit there is `export` on `anchorNamespace`; the deciding suites are unchanged and the score is re-run at closeout to confirm it did not move. `lib/drive/unknownFieldAnchors.ts`, `lib/drive/showDayTimeAnchors.ts`, and the exporter are resolvers and a renderer, not guards: their defect class is "wrong or missing link", which T1, T3, T4 and T5 decide directly. No new surface is enrolled; the round-1 diff brief states `GUARD SURFACE: none in this diff, CANNOT-EXPRESS: resolvers, decided by the T1 equivalence suite and the unknownFieldAnchors suite (T3, T4)`.

## 7. UI gate

UI surfaces touched: `components/admin/PerShowActionableWarnings.tsx` (guidance line composition). The wizard row's rendered output changes through copy only; its component is not edited. Both `/impeccable critique` and `/impeccable audit` run on the diff (invariant 8), P0/P1 fixed or deferred with a `DEFERRED.md` entry, dispositions recorded in the closeout. The pre-code mechanical checklist applies to the three new strings: no em dash, straight apostrophes, imperative lead.

## 8. The ledger row this arc files (deliverable D)

`BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS` in `BACKLOG.md`, inserted as the first `##` row under the header. Meta line, every field on one line in this order: `**Status:** OPEN · **Filed:** 2026-08-27 (\`fix/wizard-warning-row-links-copy\`, owner-directed from the RIA wizard screenshot) · **Facing:** product · **Severity:** LOW-MEDIUM (a wrong instruction on a shipped admin card; nothing is corrupted) · **Class:** detector candidacy scope · **Effort:** M · **Class-sweep exception:** (a) — which block shapes are legitimate near-miss homes is a product decision the link arc could not settle. · **Reachability:** PROBED — the §1 parser run.` `Effort` is mandatory: `tests/docs/_metaLedgerSizing.test.ts` rejects a non-grandfathered open row whose `**Effort:**` does not lead with `XS|S|M|L`. Body: the detector treats every pipe-run block as a candidate home, including a Google-Form response dump (`Timestamp` opener) and the GEAR inventory matrix (`Console` opener), so `Room Diagram` in a form dump is reported as a near-miss of the `DETAILS/ROOM DIAGRAM` section header and `Speaker` in an inventory matrix as a near-miss of `Virtual Speaker`; the card's advice ("rename this row so it matches the row we show") is wrong there. Two candidate repairs to weigh, neither chosen here: exclude blocks whose opener is not a known section family, or exclude blocks whose row shape is a matrix (more than N value columns). Not in scope because the emission set is pinned by a 65-row measured baseline and moving it is its own calibrated arc.

## 9. Documented limits

- **Two rows with the same `(kind, label, value)` on one tab** resolve to the tab, not to either cell (never-wrong-cell). Doug gets the right tab and searches by label. Re-file trigger: a live sheet where the duplicate is the common case.
- **A kind that spans two tabs** (the same opener text opening blocks on `INFO` and `GEAR`) resolves `null` at tab grain. Re-file trigger: observed on a live sheet.
- **Region anchors keep the allowlist.** A region on a non-allowlisted tab is still refused at read time; only scanner-scoped anchors bypass it. Re-file trigger: a region strategy that needs a tab outside the list, which is the 2026-06-26 spec's separate decision, unchanged here.
- **Included `OLD`-tab regions** are opaque and never anchor. Archived content is not a place to send Doug to edit.
- **A literal pipe inside a cell fractures the row for the parser** (`escapeCell` emits `\|`, `splitRow` splits on it anyway), so a near-miss label ending at the pipe is the fragment, and its anchor is the whole cell. The link is right; the label text is the parser's, not the sheet's. Pre-existing, out of this arc's scope, mirrored by design so the two paths agree. Re-file trigger: a crew-facing surface renders the fragment.
- **The hotel link is a block range, not the cell.** The ambiguity codes describe how one cell was read, and `blockRef` carries a name but no coordinate; a per-cell hotel anchor would need a hotel-row scanner, which nobody has asked for. Re-file trigger: Doug reports the range link as not enough.
- **Near-miss candidacy noise** is filed, not fixed (§8).

## 10. Dimensional invariants

None. No fixed-dimension parent gains a child; the guidance line is a text node in an existing flex column.

## 11. Transition inventory

The only element whose rendered content this arc changes is the card's guidance line (`data-testid="per-show-actionable-guidance"`). Its states after §4.3:

| state | content |
| --- | --- |
| G0 | no guidance element (no catalog guidance, no note, no instance line) |
| G1 | catalog guidance alone |
| G2 | catalog guidance + note |
| G3 | note alone |
| G4 | instance (autocorrect) line, note suppressed |
| C | condensed: the catalog text (G1..G3's string) moves into the `?` popover body; G4 stays inline |

Ten pairs among G0..G4, each **instant, no animation**, both directions: the element is a text node inside the card's existing flex column; there is no `AnimatePresence`, no motion wrapper, and no height transition on it, so a state change is a synchronous text swap on rerender.

| pair | treatment |
| --- | --- |
| G0↔G1 | instant: span mounts/unmounts with catalog text |
| G0↔G2 | instant: span mounts/unmounts with guidance + note |
| G0↔G3 | instant: span mounts/unmounts with the note alone |
| G0↔G4 | instant: span mounts/unmounts with the instance line |
| G1↔G2 | instant: note appended / removed in the same span |
| G1↔G3 | instant: text replaced |
| G1↔G4 | instant: catalog span replaced by instance span (the two are sibling branches of one ternary) |
| G2↔G3 | instant: guidance text dropped / restored ahead of the note |
| G2↔G4 | instant: composed text replaced by instance line; note suppressed by the G4 rule |
| G3↔G4 | instant: note replaced by instance line |

Condensed (C) is a second axis, not a sixth state: for each of G1, G2, G3 the catalog string moves to the popover body (instant, string routed to a different slot); G0↔C is a no-op (nothing to move); G4↔C is a no-op (instance lines never move). Compound: `showControlsNote` or `renderItemControls` toggling while the condensed popover is open re-renders the popover body synchronously; toggling while guidance is `instance` is a no-op by the G4 rule.

Executable coverage in `tests/admin/perShowActionableTransitions.test.tsx`: its `VARIANTS` table (synthetic codes `SYN_A`..`SYN_D` through a mocked `messageFor`) gains three variants, `SYN_E` (guidance + `controlsNote`, rendered with `showControlsNote` and a controls node: G2), `SYN_F` (`helpfulContext` null + `controlsNote`: G3), `SYN_G` (an `autocorrect` payload so `resolveGuidance` returns `instance`, plus a `controlsNote` that must be suppressed: G4), and the existing every-ordered-pair rerender loop (the `VARIANTS[x]` → `VARIANTS[y]` matrix, both directions by construction) then covers all ten G pairs; the condensed axis is exercised by running the same matrix once more with `condensed`. Each step asserts the expected text synchronously (no `waitFor`) and that the guidance span has no motion/`data-motion` ancestor.

## 12. Acceptance criteria

- **AC-1** For the dispatching show's committed workbook `fixtures/shows/exporter-xlsx/ria.xlsx` (the RIA Investment Forum row of `fixtures/shows/exporter-xlsx/README.md`), synthesized, parsed, and anchored through `attachWarningAnchors` (T3 corpus case): the three `UNKNOWN_FIELD` warnings resolve to their own label cells (`Room Diagram` and `Backdrop` on `FORM`, `Speaker` on `3rd Level`, each with `scope: "cell"`), the hotel warning resolves to the `hotels` region, and `buildSheetDeepLink` renders each cell anchor as `#gid=<that tab's gid>&range=<cell>` (P1's wizard render covers the DOM). The plan's closeout repeats the check on the live sheet once the DB slot is granted.
- **AC-2** `synthesizeMarkdownFromXlsx` output is byte-identical to before for every corpus workbook (T2), and T1's equivalence holds for every corpus workbook.
- **AC-3** The four `fieldNearMissBaseline` AC-N9 rows still resolve non-null through `resolveUnknownFieldCell` (those cases unedited), and the two asymmetry pins named in §2.6 are flipped to resolution-based assertions in the same commit as the scanner.
- **AC-4** A non-unique `(kind, label, value)` on a single tab resolves to a tab-level anchor (`scope: "tab"`) rendering `#gid=<tab>`; on two tabs, `null`; a cell on a tab outside `SOURCE_LINK_ALLOWLIST` resolves to that cell (`scope: "cell"`) and renders `#gid=<tab>&range=<cell>`, while an UNSCOPED anchor on such a tab still collapses to `#gid=0`.
- **AC-5** Every `HOTEL_*` ambiguity warning with a `hotels` region source carries that region as `sourceCell` and renders `Open in Sheet` on the wizard row and the published hotel card; `OPERATOR_ACTIONABLE_ANCHORED` is unchanged (still exactly its current members, no `HOTEL_*`).
- **AC-6** No `helpfulContext` of a `WARNING_CARD_COPY_CODES` member names Report or Ignore (the two `TILE_*` alert codes are outside the registry and untouched); the three `controlsNote` strings render on the published card only when item controls render, and never on the wizard row; §12.4 appendix, `spec-codes.ts`, copy-restore §4.2, and the copy registry agree with the catalog (x1 and `_metaWarningCardCopy` green).
- **AC-7** `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS` is filed with the meta line in §8 (T7's `rg` exits 0) and `_metaLedgerSizing`, `_metaLedgerMintBar`, and `_metaLedgerInProgress` are green.
- **AC-8** impeccable critique + audit dispositions recorded in the closeout; `impeccable-gate:` marker line present.
- **AC-9** Pre-push set derived from `.github/workflows/quality.yml` at closeout time and green locally; the arc ends with a readiness line to bl-orch and no merge action.
