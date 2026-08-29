# The three wave codes get a cell link: `#REF!`, fused rows, and shifted sections point at the cell that raised them

**Status:** DRAFT 2026-08-29. Branch `feat/ref-error-cell-anchors`. Dispatched directly by Eric from a screenshot of the onboarding wizard (step 3, "Review before publishing", show `II - FinTech Forum CTO Summit 2026`, validation deploy); no ledger row dispatched it. Orchestrator: bl-orch (`w15:p2`). Roles: this session writes spec + plan; a separate Opus pane implements and closes out (bl-orch launches it on account3 at plan APPROVE); **bl-orch alone merges**.

## 1. The problem, as measured on the fixture

The screenshot shows the wizard's Sheet warnings panel listing eight rows, four of them visible: every visible row reads "A cell shows #REF! (broken formula reference)" with the same second line, and none carries an "Open in Sheet" link. Above them the panel says "Fixed it in the sheet? Edit the cell, save, then re-scan." Four identical rows, one instruction to edit "the cell", and nothing on any row says which cell or which tab.

The committed workbook of that show is `fixtures/shows/exporter-xlsx/fintech.xlsx` (README row "FinTech Forum CTO Summit 2026"). Synthesizing it (`synthesizeMarkdownFromXlsx`, `lib/drive/exportSheetToMarkdown.ts`), parsing (`parseSheet`, `lib/parser/index.ts`) and reading the raw grid back with `xlsx` (probe `docs/superpowers/specs/probes/2026-08-29-ref-anchors-replay.probe.ts.txt`, run from the worktree root with `pnpm exec tsx`; its output is `docs/superpowers/specs/probes/2026-08-29-ref-anchors-replay.report.txt`) gives, for every workbook in `fixtures/shows/exporter-xlsx/`:

| workbook | `REF_ERROR_LITERAL` warnings | raw cells containing `#REF!` | kind on every warning | `sourceCell` |
| --- | --- | --- | --- | --- |
| fintech | 5 | `VENUE!A1`, `CLIENT!A1`, `TECH!A1`, `VEHICLE!A1`, `ROLE!A1` | `section` | null |
| fixed-income | 5 | same five cells | `section` | null |
| rpas | 5 | same five cells | `section` | null |
| consultants | 6 | `AGENDA!A3`, `AGENDA!A4` (each merged three columns wide, so the exporter's `expandMerges` fans each into three cells) | `section` | null |
| east-coast, redefining-fi, ria | 0 | none | | |

`ROW_CELLS_FUSED` and `LEADING_COLUMN_AUTOCORRECTED` fire zero times on the corpus. Three facts drive the design:

1. **Every warning of the class is byte-identical to its siblings.** `blockRef` is `{ kind: "section" }` on all 21 corpus instances (the opener cell IS the `#REF!`, or is `BACK TO INFO`, neither a known section, so `canonicalSectionKind` returns null and the emitter falls back to `GENERIC_SECTION_KIND`, `lib/parser/sectionKind.ts`), and `rawSnippet` is `\#REF\!` on all 21. A key join on `(kind, snippet)` in the style of `resolveUnknownFieldCell` (`lib/drive/unknownFieldAnchors.ts`) finds five matches on five different tabs and returns null. The information that distinguishes the five is their POSITION in the document, and the detector deliberately does not emit it (`lib/parser/refErrorDetector.ts`, header comment "`blockRef` CARRIES `kind` BUT NO `index`, deliberately": a document ordinal in the signal channel scored 603 harness rows as `SILENT_SIGNAL_LOSS`).
2. **The router has no branch for the class.** `REF_ERROR_LITERAL`, `ROW_CELLS_FUSED` and `LEADING_COLUMN_AUTOCORRECTED` are members of `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts`), so `CELL_ANCHORED_CODES` admits them and `attachSourceCellAnchors` (`lib/drive/showDayTimeAnchors.ts`) tries to anchor them, but its chain of `w.code === ...` branches names none of the three, and the trailing region branch is a closed list of four other codes. Only the code-agnostic `KIND_TO_REGION` branch can reach them, and only when `kind` is `agenda` or `pull_sheet`; on the corpus the kind is always `section`. `tests/parser/waveCodesNoSourceCell.test.ts` pins that absence today and says in its own header where a per-code dispatch should come to be declared: here.
3. **Running the detectors per exporter block reproduces the whole-document run exactly.** For all seven workbooks, the concatenation over `synthesizeBlocksFromXlsx(bytes).blocks` of `detectRefErrorLiterals` and `detectFusedRows` applied to each block's own markdown equals, as a sequence of `(kind, rawSnippet)`, the same detectors applied to `synthesizeMarkdownFromXlsx(bytes).markdown` (probe column `per-block==whole-doc: true`, 7 of 7). That holds by construction: `synthesizeMarkdownFromXlsx` joins block tables with a blank line, and both detectors reset their section state at a blank line (`prevBlank`, `refErrorDetector.ts`; the run boundary in `rowWidthDiscriminator.ts`). A grid block knows the absolute row of every one of its rows (`GridBlockRow.absRow`) and the absolute column of its first cell (`GridBlock.absCol0`, `lib/drive/exportSheetToMarkdown.ts`).

So the cell CAN be recovered without putting an ordinal into the signal: run the same detector over the same blocks in the same order at anchor time, pair the i-th warning with the i-th replay hit, and refuse the pairing the moment count or content disagree.

## 1.1 Resolved scope, do not relitigate

- **Membership is unchanged.** `OPERATOR_ACTIONABLE_ANCHORED`, `CELL_ANCHORED_CODES`, `HOTEL_REGION_ANCHORED`, `WARNING_CODE_ANCHOR`, the §12.4 catalog rows and their copy: none change. The wave spec fixed membership and named a per-code dispatch as the future enhancement (`docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md` §11.9: "Wiring a genuine PER-CODE anchor dispatch ... files as a future enhancement row if wanted"). This arc is that enhancement, dispatched by the owner from a shipped surface, so no ledger row is minted for it.
- **No positional ordinal enters the warning.** The detectors keep emitting `blockRef: { kind }` and `rawSnippet` only (`refErrorDetector.ts` header; `leadingColumnNormalize.ts`, the "NO POSITIONAL ORDINAL" comment). The ordinal lives in the JOIN performed at anchor time, in `lib/drive/`, after `parseSheet` returns, where the harness's `signalEq` never looks (the parser mutation oracle digests `sourceCell` as PII and never sees it populated, `tests/parser/mutation/oracle.ts`, `PII_KEYS`).
- **The `KIND_TO_REGION` fallback stays, and stays second.** The per-code branch runs first; when it yields null the existing code-agnostic region fallback for `agenda` / `pull_sheet` kinds applies exactly as today (`showDayTimeAnchors.ts`, `KIND_TO_REGION`). A refusal never removes a link the surface has today.
- **The ignore fingerprint is content-only and stays so** (`lib/dataQuality/warningFingerprint.ts`, `warningFingerprint`: `code + " " + normalized snippet`, ratified on the identity comment in `lib/dataQuality/warningIdentity.ts`, "the IGNORE fingerprint stays content-only by design", and shipped by `feat/wizard-warning-ignore-controls`, PR #943). Ignoring one `#REF!` row hides every row with the same code and snippet, before and after this arc. The REPORT identity (`warningIdentityKey`) folds `sourceCell`, so the five rows gain five distinct report surface ids; that is the existing contract doing what it says, not a change.
- **The wizard's correction callout is not edited.** `CorrectionLoopCallout` renders unconditionally on the wizard under the staged contract of `docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md` §2.2 (the comment above `routedWarningsRenderElsewhere ? null : <CorrectionLoopCallout mode={mode} />` in `components/admin/wizard/step3ReviewSections.tsx`). This arc makes the affordance match the sentence; it does not touch the sentence.
- **Scoped anchors bypass the tab allowlist; the allowlist does not change.** `buildSheetDeepLink` trusts `scope: "cell"` on any tab with a numeric gid (`lib/sheet-links/buildSheetDeepLink.ts`, the `scoped` branch, ratified in the 2026-08-27 spec §2.5). `VENUE`, `CLIENT`, `TECH`, `VEHICLE`, `ROLE` are not in `SOURCE_LINK_ALLOWLIST` and do not join it.
- **Merged-cell fan-out is not collapsed.** The exporter copies a merged cell's value across the merge's columns (`expandMerges`, `exportSheetToMarkdown.ts`), so one merged `#REF!` raises one warning per column. Each warning links to its own column of the merge; opening any of them selects the same merged cell in Sheets. Collapsing to the merge origin would change warning counts on a surface this arc does not otherwise touch (§9).
- **No `Report` / `Ignore` control changes on either surface.** Controls, their copy and the 2026-08-27 `controlsNote` field are untouched.
- **Region anchors, hotel region links, `UNKNOWN_FIELD`, crew-role and show-day anchors** are untouched; the new branch is additive and precedes only the two generic fallbacks.

## 2. Change A: anchors from a replay of the detectors over the exporter's blocks

### 2.1 Design

A new module under `lib/drive/`, `waveCodeAnchors`, exports:

```ts
export type WaveCode = "REF_ERROR_LITERAL" | "ROW_CELLS_FUSED" | "LEADING_COLUMN_AUTOCORRECTED";
/** One replay hit, in document order. `anchor` is null when the hit has no source cell. */
export type WaveCodeSite = { code: WaveCode; kind: string; snippet: string | null; anchor: SourceAnchor | null };
export function extractWaveCodeSites(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
  synthOpts?: { includePullSheetFromTab?: string },
): WaveCodeSite[];
export function pairWaveCodeSites(
  warnings: readonly ParseWarning[],
  sites: readonly WaveCodeSite[],
  code: WaveCode,
): (SourceAnchor | null)[]; // one entry per warning of `code`, in array order
```

`extractWaveCodeSites` walks `synthesizeBlocksFromXlsx(buffer, synthOpts).blocks` in order. For each block it renders the block's markdown through the ONE renderer `synthesizeMarkdownFromXlsx` uses (§2.2), runs the three position-reporting scanners of §2.3 over that text, and converts each hit to a site:

- **Grid block, `REF_ERROR_LITERAL`.** Line index → row: line 0 is row 0, line 1 is the delimiter row (never a hit), line k ≥ 2 is row k-1. Cell index j → column `block.absCol0 + j`. Anchor `{ title: block.sheetName, gid, a1: encode_cell({ r: row.absRow, c: col }), scope: "cell" }`. Then the raw-cell check: the value the exporter read at that coordinate (the block row's own `cells[j]`, which is the expanded grid cell) must `clean()` to a string containing `#REF!`; otherwise the anchor is null. This is what catches a cell index shifted by a literal pipe inside an earlier cell of the row (`escapeCell` writes `\|`, `splitRow` splits on it regardless: the pipe limit of the 2026-08-27 spec §9).
- **Grid block, `ROW_CELLS_FUSED`.** Line index → row as above. Column: `block.absCol0 + (index of the row's first non-blank cell)`. The link lands on the row, at its first content cell, because the defect is the row's width, not one cell.
- **Grid block, `LEADING_COLUMN_AUTOCORRECTED`.** The scanner reports the line span of the shifted section; the anchor is the section's FIRST row at column `block.absCol0`, the uniformly empty cell the operator deletes. (A leading blank column that spans the whole block never survives export: `normalizeBlock` slices columns from the block's first non-blank column, `exportSheetToMarkdown.ts`. The shift this code detects is one that shares a block with an unshifted section, so `absCol0` is the shifted section's empty column, not a trimmed one.)
- **Any hit whose row has `absRow: null`** (a synthesized pull-sheet title row, `normalizePullSheetGrid`), **any hit on a tab with no gid** (`titleToGid.get(block.sheetName)` undefined), **and every hit inside an opaque block** (an included `OLD` pull-sheet region, `OpaqueBlock`, rendered as its own markdown so the scanners still run over it) produces a site with `anchor: null`. The site is KEPT: it holds its place in the sequence so later hits still pair.

`pairWaveCodeSites` takes the warnings of one code in array order (`P`) and the sites of that code in replay order (`R`) and returns `P.length` anchors:

- If `P.length !== R.length`: every entry is null.
- For `REF_ERROR_LITERAL` and `ROW_CELLS_FUSED`: if for any i `normalizeCellKey(P[i].rawSnippet ?? "") !== normalizeCellKey(R[i].snippet ?? "")` (`normalizeCellKey`, `lib/drive/unknownFieldAnchors.ts`, exported today): every entry is null.
- For `LEADING_COLUMN_AUTOCORRECTED` (no `rawSnippet`): if for any i `P[i].blockRef?.kind !== R[i].kind`: every entry is null.
- Otherwise entry i is `R[i].anchor`.

Refusal is per code and whole: one disagreement anywhere in the sequence means the sequence cannot be trusted, and a half-trusted sequence is exactly how a wrong-cell link gets made.

`attachSourceCellAnchors` gains, before the `KIND_TO_REGION` branch, a branch for the three codes that reads a precomputed map `sources.wave` (type `Partial<Record<WaveCode, (SourceAnchor | null)[]>>`, one array per code from `pairWaveCodeSites` over the SAME `warnings` array the loop walks), consuming the next entry for that code on each visit. A null entry falls through to the existing fallbacks unchanged. `attachWarningAnchors` (`lib/sync/attachWarningAnchors.ts`) computes the map inside its `safe(...)` wrapper like the other families, and gains an optional fifth parameter `synthOpts` that it forwards to `extractWaveCodeSites`.

### 2.2 One renderer for a block's markdown

`exportSheetToMarkdown.ts` exports `blockMarkdown(block: SynthesizedBlock): string`, which is `tableMarkdown(rows)` for a grid block and `block.markdown` for an opaque one. `synthesizeMarkdownFromXlsx` becomes `blocks.map(blockMarkdown).join("\n\n")`. The replay renders each block through `blockMarkdown`, so the text a scanner sees per block is byte for byte the text it sees inside the joined document; T2 pins the joined output byte-identical on every corpus workbook.

### 2.3 Position-reporting scanners, one walker per detector

Each of the three parser modules is split into a walker that reports positions and the existing emitter that maps the walker's hits to `ParseWarning`s, the `scanBlockCells` / `scanRowsWithOpener` shape of the 2026-08-27 spec §2.3:

- `lib/parser/refErrorDetector.ts`: `scanRefErrorLiterals(markdown): { line: number; cell: number; kind: string; snippet: string }[]`; `detectRefErrorLiterals(markdown)` is `scanRefErrorLiterals(markdown).map(toWarning)`.
- `lib/parser/rowWidthDiscriminator.ts`: `scanFusedRows(markdown): { line: number; kind: string; snippet: string }[]`; `detectFusedRows` maps it.
- `lib/parser/leadingColumnNormalize.ts`: `normalizeLeadingColumn` keeps its `{ corrected, warnings }` return and adds `shifted: { from: number; to: number; kind: string }[]` (the `correct(from, to)` spans, with the kind the emitter computed). Additive field; existing callers destructure what they use.

The emitters' output is unchanged: same objects, same order, same `message`, `blockRef`, `rawSnippet`, `autocorrect`. That is what keeps the parser mutation harness (`tests/parser/mutation/`) and the text-drift pin (`tests/parser/mutation/signalTextDrift.test.ts`) at their current values, and what T2 asserts.

### 2.4 Why ordinal pairing is safe, stated as the guards that make it so

`parseSheet` runs the detectors on markdown that three seams have already rewritten (`lib/parser/index.ts`: Step 0 `stripZeroWidth`, Step 2.5 section-header normalization `secNorm.corrected`, Step 2.55 `normalizeLeadingColumn`, then Step 2.6 `detectRefErrorLiterals` and `detectFusedRows`). The replay runs on the un-rewritten block text. Pairing by ordinal is correct when, and only when, the seams preserve the ORDER of hits and the guard catches every case where they change the COUNT or the CONTENT:

- **Order.** Every seam rewrites lines in place (`lines[i] = ...` in `leadingColumnNormalize.ts`; the header normalizer replaces a header cell's text on its own line; `stripZeroWidth` is a character filter). None inserts, deletes or reorders a line. A `#REF!` cell before another `#REF!` cell in the block is before it in the parsed document. T1 pins this over the corpus and over constructed variants that exercise each seam.
- **Count.** A seam that dropped or added a hit changes `P.length`; refused.
- **Content.** `stripZeroWidth` and `clean()` agree on what they strip, so `normalizeCellKey` matches across the seam. A header normalization that rewrites a FUSED row's header text, or a leading-column shift that shortens a FUSED row's line, changes that row's `rawSnippet` and refuses the whole `ROW_CELLS_FUSED` sequence (§9). A `#REF!` cell's own text is never rewritten by a seam, so `REF_ERROR_LITERAL` snippets match.
- **Kind (`LEADING_COLUMN_AUTOCORRECTED` only).** The parser computes the section's kind from the header the 2.5 seam may have just corrected; the replay sees the uncorrected header. A corrected header changes the kind and refuses the sequence (§9).
- **Same blocks.** The replay must walk the block list the parsed markdown came from: same bytes, same `includePullSheetFromTab`. Both parse sites pass that option to `synthesizeMarkdownFromXlsx` (`lib/drive/fetch.ts`, both `options.includePullSheetFromTab ? synthesizeMarkdownFromXlsx(bytes, {...}) : synthesizeMarkdownFromXlsx(bytes)` sites) and both anchor sites know it (the onboarding scan's active override, `runOnboardingScan.ts`; the cron's `includeOpts`, `runScheduledCronSync.ts`); they forward it as `synthOpts`. A mismatch (an `OLD` tab holding `#REF!` included on one side only) changes the count and refuses; it cannot mis-pair.

The failure mode of every guard is a link-less row, which is the row's state today. No guard can produce a link to the wrong cell without a seam that reorders lines, and none exists; T1's constructed variants are where a future one would be caught.

### 2.5 What this changes for rows already rendered

- Rows persisted before this arc carry no `sourceCell` and keep rendering link-less until their sheet is scanned again (the wizard's "Re-scan this sheet"; the cron on a `modifiedTime` change). No read-time shim: there is no stale anchor to neutralize, unlike the `stripLegacyUnknownFieldAnchors` case (`lib/parser/dataGaps.ts`).
- `operatorActionableWarnings` (`dataGaps.ts`) dedups by `(code, gid, a1)`. Five `#REF!` rows with five distinct `a1` stay five rows (T8). Rows the pairing refuses have no `a1` and are, as today, never deduped.
- `warningIdentityKey` folds `gid:a1`, so the five rows get five distinct React keys and report surface ids instead of one key with occurrence suffixes (`stableWarningKeys`). Key stability across an ignore refresh is preserved: an anchored row's key no longer depends on its neighbours at all.
- `tests/parser/waveCodesNoSourceCell.test.ts` is REPLACED by the positive pin of T5, in the same commit as the router branch. Its header asks for exactly this.

## 3. Change B: the card names the cell

On both surfaces that render these rows, a warning whose anchor is a scanner-located cell gets one line naming it, so four identical `#REF!` rows read `VENUE!A1`, `CLIENT!A1`, `TECH!A1`, `VEHICLE!A1` before anyone clicks.

**Guard condition (identical on both surfaces):** render iff `w.sourceCell?.scope === "cell"`, `typeof w.sourceCell.a1 === "string"` with non-empty trim, `typeof w.sourceCell.title === "string"` with non-empty trim, AND the row renders no "Sheet row" label (the `UNKNOWN_FIELD` label line, `rowLabel`). Null `sourceCell`, a `scope: "tab"` anchor, a legacy unscoped region anchor, a range `a1` (one holding a colon, the legacy block-range shape `stripLegacyUnknownFieldAnchors` neutralizes), or a numeric/absent `title`: no line. `a1` and `title` render trimmed; the identity and dedup keys keep the raw strings.

**Text:** `Sheet cell ` then the value `${title}!${a1}` in `font-mono text-text`. No quotes: unlike the `FIELD_UNREADABLE` band, this is not junk to reproduce, it is a coordinate to type into the name box.

- **Wizard** (`components/admin/wizard/step3ReviewSections.tsx`, the warnings list inside the sheet card): a `span` with `data-testid={`wizard-step3-card-${dfid}-warning-${i}-cell`}`, class `wrap-break-word text-xs text-text-subtle`, placed where the `Sheet row` label renders (the `rowLabel` IIFE), before the `Closest match` line. Same slot, same type ramp, same information grammar as the row label; the two are mutually exclusive by the guard.
- **Published card** (`components/admin/PerShowActionableWarnings.tsx`): a `span` with `data-testid="per-show-actionable-cell"` and value span `data-testid="per-show-actionable-cell-value"`, in the slot of `per-show-actionable-row-label`, with that element's classes. Renders in both full and condensed modes (the coordinate is the row's identity, which the condensed card under a crew row still needs when two `#REF!` cells sit in one member's row).

The `Open in Sheet` link on both surfaces is unchanged; it already renders for any non-null `sourceCell` and now has one to render for.

## 4. Where the anchors come from at runtime

| path | bytes | gids | `synthOpts` | site |
| --- | --- | --- | --- | --- |
| onboarding scan | the exported xlsx (`bytes`) | `resolveGids` (Drive fetch, gated by `hasCellAnchoredWarning`) | the active pull-sheet override's tab, or none | `runOnboardingScan.ts`, the `attachWarningAnchors(parseResult.warnings, bytes, resolveGids, sourceAnchors)` call |
| cron sync | `xlsxBytes` | `titleToGid` (already computed) | `includeOpts` | `runScheduledCronSync.ts`, the `attachWarningAnchors(enriched.warnings, xlsxBytes, async () => titleToGid, sourceAnchors ?? {})` call |

`hasCellAnchoredWarning` is unchanged and already true for these codes, so no sheet pays a gid fetch it does not pay today. The replay adds one `synthesizeBlocksFromXlsx` per anchor pass on a sheet that has at least one anchored warning, the same cost `extractUnknownFieldAnchors` already pays; both stay separate calls (§9).

## 5. Guards

Every test names the production line whose absence makes it fail.

- **T1, replay equals parse, over the corpus and over constructed variants (a NEW suite under `tests/drive/`, named waveCodeAnchors).** For each of the seven `fixtures/shows/exporter-xlsx/*.xlsx`: the sequence of `(code, kind, snippet)` from `extractWaveCodeSites(buffer, gids)` equals the sequence of `(code, blockRef.kind, rawSnippet)` of the three codes in `parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown).warnings`, and `pairWaveCodeSites` returns a non-null anchor for every REF warning on the five workbooks that have them. Then the constructed variants, each built from a corpus workbook with `xlsx` (one ordinary edit away from the probe domain): (a) a `#REF!` written into a data cell of a known section (`CREW`), asserting the anchor is that cell; (b) a row containing a literal `|` in a cell BEFORE a `#REF!` cell, asserting the raw-cell check nulls the anchor rather than pointing one column off; (c) a section whose rows all start with an empty cell but which shares a block with an unshifted section, asserting a `LEADING_COLUMN_AUTOCORRECTED` site at the section's first row and `absCol0`, and that a `#REF!` inside that shifted section still pairs (the seam preserves order); (d) a section whose header is a `TRANSPORTATION` misspelling inside the tolerance of the 2.5 seam (`lib/parser/sectionHeaderNormalize.ts`, `LONG_SECTION_VOCAB`), asserting `LEADING_COLUMN_AUTOCORRECTED` refuses (kind differs) while `REF_ERROR_LITERAL` in the same section still pairs; (e) a row one cell short of its section's modal width, asserting a `ROW_CELLS_FUSED` anchor at the row's first content cell; (f) a merged `#REF!` three columns wide, asserting three sites at three columns of one row; (g) a tab whose used range starts at `B2` (`sheet_add_aoa(ws, rows, { origin: "B2" })`) holding a `#REF!`, asserting the anchor reads the true coordinate, not `A1`-relative; (h) a workbook with an `OLD PULL SHEET` tab containing `#REF!`, parsed and replayed WITH `includePullSheetFromTab`, asserting the opaque hit is a null-anchor site that keeps the grid hits paired, and parsed with the option but replayed WITHOUT it, asserting refusal. Premises stated executably: the corpus yields more than zero REF sites and zero FUSED / LEADING sites (so the variants are what exercise those two codes, and a corpus change that starts emitting them is noticed); every variant yields at least one site of the code it targets. Red on the live tree: `extractWaveCodeSites` and `pairWaveCodeSites` do not exist. Catches: a replay that renders blocks differently from the document, a walker whose position is off by the delimiter row, a scanner refactor that changes emission order, a seam that reorders lines.
- **T2, exporter bytes and parser signals unchanged.** `tests/drive/round-trip-fixture.test.ts` unchanged and green (the byte pin for §2.2). `tests/parser/refErrorLiteral.test.ts`, `tests/parser/rowCellsFused.test.ts`, `tests/parser/leadingColumnAutocorrect.test.ts`, `tests/parser/mutation/signalTextDrift.test.ts`, `tests/parser/cleanCorpusCalibration.test.ts` unchanged and green (the per-fixture count pins and message pins for §2.3). The parser mutation harness job runs at closeout and its score does not move.
- **T3, the dispatching workbook resolves (same suite).** `fintech.xlsx`: synthesize, `parseSheet`, `attachWarningAnchors` with a gid map over the workbook's sheet names; assert the five `REF_ERROR_LITERAL` warnings carry, in array order, anchors whose `(title, a1)` equal the five `#REF!` cells found by an independent `xlsx` scan of the workbook (never a hardcoded list), each with `scope: "cell"`, and that `buildSheetDeepLink` renders each as `#gid=<gid>&range=<a1>` although none of the five tabs is in `SOURCE_LINK_ALLOWLIST`. `consultants.xlsx`: six anchors on `AGENDA`, rows 3 and 4, columns A through C. `east-coast.xlsx`: no wave warnings and `sources.wave` is empty. Red: the router has no branch.
- **T4, the guards refuse, never mis-pair (same suite, `pairWaveCodeSites` directly).** Sites for two `#REF!` hits against (i) three warnings, (ii) one warning, (iii) two warnings whose second snippet differs: all-null each time. A LEADING sequence whose kinds disagree at index 1: all-null. A site list where index 0 has `anchor: null` and index 1 a cell: warning 1 gets the cell (the null placeholder held the sequence). Red: the function does not exist.
- **T5, the router branch, replacing `tests/parser/waveCodesNoSourceCell.test.ts`.** A new file under `tests/parser/`, named waveCodesSourceCell, same fixture sources as the file it replaces plus `wave`: for each of the three codes, a warning with `kind: "crew"` and a paired cell gets that cell; with `sources.wave` absent it stays undefined (crew) or gets the region (agenda / pull_sheet, the ratified fallback, in its existing assertion); with a paired null and kind `agenda` it gets the region (fallthrough order). The control case (`UNKNOWN_ROLE_TOKEN` anchors) is kept. Red: the branch does not exist, and the old file's negative assertion fails the moment it does.
- **T6, the cell line (both surfaces).** `tests/components/step3SheetCard.test.tsx`: a `REF_ERROR_LITERAL` warning with `sourceCell: { title: "VENUE", gid: 5, a1: "A1", scope: "cell" }` renders `wizard-step3-card-<dfid>-warning-<i>-cell` with text `Sheet cell VENUE!A1`, read after cloning the row and removing the `-open` link (anti-tautology: the link's `href` also contains `A1`); with `scope: "tab"`, with `sourceCell: null`, with an unscoped `{ title: "INFO", gid: 0, a1: "A1:C3" }` region anchor, and for an `UNKNOWN_FIELD` warning that renders a `Sheet row` label, the element is absent. `tests/admin/perShowActionableRenderControls.test.tsx` (or a sibling in `tests/admin/`): the same five cases against `per-show-actionable-cell`, in full and condensed mode. Pre-dispatch mutants for both: guard inverted on `scope`; `title` rendered without `!a1`; line rendered alongside the row label. Red: neither element exists.
- **T7, `synthOpts` reaches the replay.** In `tests/sync/attachWarningAnchors*.test.ts` (existing file verified at plan time): `attachWarningAnchors(warnings, bytes, resolveGids, {}, { includePullSheetFromTab: "OLD PULL SHEET" })` on variant (h)'s workbook anchors the grid `#REF!`; the same call without the fifth argument leaves it link-less. Red: the parameter does not exist.
- **T8, five rows stay five (regression pin, green on arrival).** `tests/parser/operatorActionableWarnings.test.ts`: five `REF_ERROR_LITERAL` warnings with five distinct `a1` survive `operatorActionableWarnings` as five; `warningIdentityKey` gives five distinct keys. Both pass today; added as cover for the shape this arc produces.
- **Corpus baselines unchanged.** `tests/parser/warningScanScopeAnchor.test.ts` and `tests/parser/_warningCodeAnchor.ts` untouched (no new code); `tests/sheet-links/*.test.ts` untouched (no allowlist change); `tests/parser/parseWarningDeepLinkRender.test.tsx` untouched (no membership change).

## 6. The GUARD SURFACE question, answered before the diff brief asks it

The new `waveCodeAnchors` module under `lib/drive/` is a resolver: its defect class is "wrong or missing link", which T1, T3 and T4 decide directly, the same disposition the 2026-08-27 spec §6 recorded for `unknownFieldAnchors.ts` and `showDayTimeAnchors.ts`. None of `refErrorDetector.ts`, `rowWidthDiscriminator.ts` or `leadingColumnNormalize.ts` is enrolled in the source-mutation registry (`tests/mutation/source/registry.ts` has no row for any of them); they are scored by the parser mutation harness over markdown mutants, which T2 keeps unmoved. No new surface is enrolled. The round-1 diff brief states `GUARD SURFACE: none in this diff, CANNOT-EXPRESS: resolvers, decided by the T1 replay-equals-parse suite and the T3/T4 resolution cases`.

## 7. UI gate

UI surfaces touched: `components/admin/wizard/step3ReviewSections.tsx` (one new span in the warning row) and `components/admin/PerShowActionableWarnings.tsx` (one new span in the card). Opus-only work; both `/impeccable critique` and `/impeccable audit` run on the diff (invariant 8), P0/P1 fixed or deferred with a `DEFERRED.md` entry, dispositions in the closeout, `impeccable-gate:` marker line in the plan's closeout. Pre-code mechanical checklist for the new string and spans: no em dash in `Sheet cell`, straight apostrophes (none), canonical classes (`text-xs`, `text-text-subtle`, `text-text`, `font-mono`, `wrap-break-word`), no tap target (the span is not interactive; the link next to it keeps `min-h-tap-min`).

## 8. Documented limits

- **A `ROW_CELLS_FUSED` row inside a leading-column-shifted section, or whose header the 2.5 seam corrected,** refuses pairing (its `rawSnippet` is the rewritten line) and every `ROW_CELLS_FUSED` row on that sheet renders link-less, as today. Re-file trigger: a live sheet where a fused row and a shifted or typo'd section coincide.
- **A `LEADING_COLUMN_AUTOCORRECTED` section whose header the 2.5 seam corrected** refuses (kind differs). Re-file trigger: observed on a live sheet.
- **Merged-cell fan-out.** One merged `#REF!` spanning N columns renders N rows, each linking to its own column of the same merged cell. The count is the exporter's, pre-existing; the links are all correct. Re-file trigger: Doug reports N rows for one cell as confusing.
- **Ignoring one `#REF!` row ignores them all** (content-only fingerprint, §1.1). Re-file trigger: an owner decision to key ignore on the cell, which is a product change to #943's contract.
- **Rows persisted before this arc stay link-less until the next scan or sync of their sheet.** Re-file trigger: none; the next change to the sheet clears it.
- **Two synthesis passes per anchored sheet** (`extractUnknownFieldAnchors` and `extractWaveCodeSites` each call `synthesizeBlocksFromXlsx`). Sharing one pass is a refactor of `attachWarningAnchors`'s family list that this arc does not need. Re-file trigger: a measured anchor-pass duration that matters on the cron.
- **Opaque `OLD`-tab hits never anchor.** Archived content is not a place to send Doug to edit (2026-08-27 §9, unchanged).
- **A literal pipe before a `#REF!` cell in the same row** nulls that cell's anchor (the raw-cell check) rather than linking one column off. Re-file trigger: a live sheet where that row shape is common.

## 9. Dimensional invariants

None. The new span is a text node in an existing flex column (`flex min-w-0 flex-1 flex-col gap-0.5` on the wizard row; the card's existing column on the published surface). No fixed-dimension parent gains a child.

## 10. Transition inventory

The only element this arc adds is the cell line, on each surface. States: **C0** absent, **C1** present. One pair, both directions, **instant, no animation**: the span mounts or unmounts with the row on rerender; there is no `AnimatePresence`, no motion wrapper, no height transition on it. Compound: the row leaving the list on Ignore (wizard, #943) unmounts the whole row including C1, through that feature's existing exit, unchanged; a rescan that changes the anchor replaces the text synchronously. Executable coverage: `tests/components/step3SheetCard.transitions.test.tsx` gains one rerender step C0 → C1 → C0 asserting the element appears and disappears synchronously (no `waitFor`) and has no `data-motion` ancestor; the published surface's `tests/admin/perShowActionableTransitions.test.tsx` `VARIANTS` table gains one variant with a `scope: "cell"` anchor, so the existing every-ordered-pair loop covers the pair.

## 11. Acceptance criteria

- **AC-1** For `fixtures/shows/exporter-xlsx/fintech.xlsx` (the dispatching show), synthesized, parsed and anchored through `attachWarningAnchors` (T3): the five `REF_ERROR_LITERAL` warnings carry, in order, `scope: "cell"` anchors at the five `#REF!` cells an independent `xlsx` scan finds, and `buildSheetDeepLink` renders each as `#gid=<that tab's gid>&range=<a1>`. The wizard row and the published card render `Open in Sheet` and `Sheet cell <TAB>!<A1>` for each (T6). The plan's closeout repeats the check on the live validation deploy's sheet after a rescan.
- **AC-2** `synthesizeMarkdownFromXlsx` output is byte-identical to before for every corpus workbook, and the three detectors' warning arrays are deep-equal to before on every corpus fixture (T2); the parser mutation harness score is unchanged at closeout.
- **AC-3** T1 holds over the corpus and all eight constructed variants; T4's refusals are all-null; no test in the suite asserts a link to a cell that does not contain the warned content.
- **AC-4** `tests/parser/waveCodesNoSourceCell.test.ts` is deleted and its successor under `tests/parser/`, waveCodesSourceCell, pins the branch, the fallthrough order and the ratified region fallback (T5).
- **AC-5** `OPERATOR_ACTIONABLE_ANCHORED`, `CELL_ANCHORED_CODES`, `SOURCE_LINK_ALLOWLIST`, `WARNING_CODE_ANCHOR` and every §12.4 row are byte-unchanged; x1 and `_metaWarningCardCopy` green.
- **AC-6** impeccable critique + audit dispositions recorded in the closeout; `impeccable-gate:` marker line present.
- **AC-7** Pre-push set derived from `.github/workflows/quality.yml` at closeout time and green locally; the arc ends with a readiness line to bl-orch (PR number + 40-char head) and no merge action.
