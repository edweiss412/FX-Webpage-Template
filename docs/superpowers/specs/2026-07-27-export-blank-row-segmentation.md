# Blank-row block segmentation: header-aware splits + orphaned-crew-rows warning

**Backlog:** `BL-EXPORT-BLANK-ROW-SEGMENTATION` (BACKLOG.md:781, audit finding #10, 2026-07-04)
**Date:** 2026-07-27 (revised after adversarial R1 — six findings, all confirmed and folded in)
**Status:** ratified via /ship-feature (autonomous pipeline; spec/plan user gates waived)

## 1. Problem

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into
blocks using fully-blank rows (`rowIsBlank`, `lib/drive/exportSheetToMarkdown.ts:123-125`)
as the **only** delimiter. Two silent failure modes:

- **Fuse:** a stray value in a spacer row joins two adjacent sections into one block; the
  downstream parser attributes one section's rows to another.
- **Split:** a blank row inserted mid-section severs the tail rows from their header; the
  tail block's first data row is promoted to a markdown table-header position
  (`tableMarkdown`, `lib/drive/exportSheetToMarkdown.ts:215-227`) and the rows are dropped
  or misattributed.

The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` ledger
rows starting at `tests/parser/mutation/knownHoles.ts:115`, mapped to audit finding `#10`
via `OPERATOR_FINDING_MAP`, `tests/parser/mutation/knownHoles.ts:85-86`), but
detection-in-tests is not detection-at-runtime.

### 1.0 Empirical probes (2026-07-27, this spec's design authority)

Candidate rules were probed against the 7 committed exporter snapshots
(`fixtures/shows/exporter-xlsx/*.xlsx`, every tab) and all committed fixture markdown
(`fixtures/shows/{exporter-xlsx,raw,synthetic,email-embedded,pdf-only}/*.md`). Probe
scripts: session scratchpad `probe-segmentation.mts` … `probe6.mts`; the headline numbers
are reproduced as ratchets by the mandated test suite (§6 T2/T6/T9).

1. **Naive header-aware split (case-insensitive `isKnownSectionHeader` on any mid-block
   row) hits 85 corpus rows** — mixed-case FORM-tab question labels ("General Session Room
   Name" × 12 per show), INFO-tab "In House AV" and "Driver" rows sitting legitimately
   mid-block. A case-insensitive rule would shred live sheets.
2. **Uppercase-only + exact/family match leaves exactly 2 corpus hits, both `CLIENT`**
   (east-coast INFO block#1 row#1, fintech INFO block#1 row#1 — a `CLIENT` label row
   directly under a `#NUM!` error row / a notes row, fused in the live sheets today and
   parsed correctly). Excluding `CLIENT` from the mid-block split set yields **0 corpus
   hits, every tab of every show, OLD tabs included** — byte-identical corpus output by
   construction.
3. **The backlog's adjacency orphan rule ("block with no recognizable header adjacent to a
   recognized section") fires 30 times on the live corpus** — GEAR-tab gear lists under
   room headers ("DLP DATA PROJECTOR" after "BREAKOUT SESSION 1 - LASALLE"), INFO-tab
   free-text blocks ("HOTELS FOR DOUG'S DRIVE BACK" after `TRANSPORTATION`/`HOTEL`,
   "Hotal Contact Info" after `COI`), PULL SHEET title rows. Blocks legitimately starting
   with non-header rows are NORMAL sheet layout; adjacency cannot ship.
4. **A single-role-token discriminator is NOT crew-specific** (adversarial R1 finding 2,
   confirmed): rows like `GS Strike Time | 10/9 @ 4:30pm`, `Setup / Load In Date / Time |
   FALSE`, standalone ROLE-legend rows (`| - Load In / Set / Strike / Load Out - LEAD |`,
   e.g. `fixtures/shows/exporter-xlsx/ria.md:133`), and FORM labels
   (`fixtures/shows/exporter-xlsx/fintech.md:241`) all carry ONE of LOAD IN / LOAD OUT /
   STRIKE. Signal-corroboration (phone/email/TRUE) also fails BOTH ways: the fixed-income
   crew rows carry neither phone nor booleans (`|  | DJ Johnson | - Load In / Set / Strike
   / Load Out - V1 |  |  |`), while `Setup / Load In Date / Time | FALSE` carries one.
5. **The shipping discriminator (rule v2): a row with ≥2 non-empty cells where ONE cell
   contains ≥2 distinct role tokens of {LOAD IN, LOAD OUT, STRIKE, SET}.** Census over
   EVERY row of EVERY committed fixture markdown (any row can become a tail-first row
   under blank-row injection): **0 crew-row misses** (every crew/TECH roster row in every
   corpus shape — east-coast name-embedded, rpas boolean-column, fixed-income
   no-phone/no-boolean, raw-corpus wide format — has a single cell with ≥2 tokens, incl.
   partial-role rows `- Load In / Set ONLY` and `- Load Out / Strike ONLY`) and **exactly
   one non-crew matching shape**: the DRESS section row
   `| DRESS | Set/Strike: Black Pants, Black Polo Shirt, Black Footwear |` — suppressed
   because its first cell starts with the uppercase registry token `DRESS` (§3.1
   suppression). Single-token rows (probe 4's entire class) never fire; the ROLE-legend
   rows are single-cell rows, excluded by the ≥2-non-empty-cells arm.

## 1.1 Resolved scope — do not relitigate

- **Fix (b) ships structurally; fix (c) ships crew-scoped only.** Generic orphan-block
  detection is empirically infeasible at zero corpus false positives (probe 3). Orphan
  detection is scoped to crew-role-signature rows per probe 5. Splits of hotel, transport,
  and other sections remain undetected at runtime; the backlog entry is updated to
  PARTIALLY CLOSED with the residuals (§8).
- **Fix (a) (near-blank-row heuristic) is not pursued.** It requires a new
  exporter-to-parser warning channel (the exporter returns only
  `{ markdown, archivedPullSheetTabs }`, `lib/drive/exportSheetToMarkdown.ts:320-323`) and
  its fuse coverage is subsumed by fix (b).
- **`CLIENT` is excluded from the mid-block split set** on direct corpus evidence (probe
  2). The zero-diff gate (§6 T2) enforces the exclusion.
- **The uppercase gate is case-SENSITIVE by design** (probe 1). Precedent:
  `lib/drive/exportSheetToMarkdown.ts:72-75` (case-sensitive room-header match).
- **The corpus zero-diff gate is `tests/drive/round-trip-fixture.test.ts`** (byte equality
  of `synthesizeMarkdownFromXlsx` output vs committed `.md` for all 7 shows). Task 2
  EXTENDS it to also pin `archivedPullSheetTabs` (tab name + fingerprint) per show —
  adversarial R1 finding 4 established the current test compares only `markdown`
  (`tests/drive/round-trip-fixture.test.ts:43-56`). No fixture bytes change.
- **OLD-tab fingerprint semantic (chosen, R1 finding 4):** the header-aware split applies
  uniformly, including inside OLD tabs. Where a pull-sheet region on an archived tab is
  FUSED to a following uppercase-known section (e.g. a `HOTEL` block), the split moves
  that section OUT of the region markdown, so the region fingerprint hashes pull-sheet
  content only. This is the intended direction — the fingerprint exists to review
  PULL-SHEET content (D6/I1: regions must never leak unrelated blocks,
  `lib/drive/exportSheetToMarkdown.ts:253-257`) — and it changes NOTHING on the live
  corpus (probe 2: zero mid-block hits on OLD tabs; enforced by the extended T2 golden).
  A hypothetical future fused archived tab would surface once as
  `contentChangedSinceAccept` on the next accept cycle — the existing admin review flow,
  not silent breakage.
- **Crew-role token dependency is accepted.** Detection recall depends on Doug's roster
  role convention (a role cell listing ≥2 of Load In / Set / Strike / Load Out, present in
  100% of corpus crew rows across all shapes). A crew row authored with zero or one role
  token in every cell is not detected when orphaned. Documented residual, not a defect.
- **No UI component/route files change.** The new warning surfaces through the existing
  catalog-driven card machinery (`PerShowActionableWarnings` renders items already
  filtered by `operatorActionableWarnings`; `components/admin/PerShowActionableWarnings.tsx:34-38`)
  — the feature adds REGISTRY rows + one anchor branch in `lib/drive/showDayTimeAnchors.ts`
  (lib code), not component edits. Invariant-8 impeccable gates do not apply. No DB; no
  advisory locks; no mutation surfaces (invariants 2/10 untouched).
- **`severity: "warn"`, NOT `gateExempt`.** An orphaned crew tail means crew members can
  silently lose their pages — push-worthy, same default posture as
  `UNKNOWN_SECTION_HEADER` (`lib/parser/dataGaps.ts:32`).

## 2. Fix (b) — header-aware segmentation in the exporter

### 2.1 New predicate (single source of truth in the parser registry module)

Add to `lib/parser/knownSections.ts`:

```ts
/** Section labels that live mid-block in real sheets (corpus-verified) and must NOT
 *  start a new block when seen mid-block. CLIENT: east-coast INFO (a CLIENT label row
 *  directly under a #NUM! row) + fintech INFO; probe 2026-07-27. */
export const MID_BLOCK_SPLIT_EXCLUDED: ReadonlySet<string> = new Set(["CLIENT"]);

/** True when a grid row's first non-blank cell BEGINS a new section mid-block. */
export function isMidBlockSectionStart(rawCell: string): boolean;
```

Semantics (guard conditions):

- `rawCell` empty / whitespace-only / first line empty → `false` (fused multi-line
  headers evaluate line 1 only).
- Any lowercase letter in the first line → `false` (kills all 85 probe-1 hits).
- `normalizeHeader(line1)` (`lib/parser/knownSections.ts:25-27`) in
  `MID_BLOCK_SPLIT_EXCLUDED` → `false`.
- Otherwise: exact membership in `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts:35`)
  or whole-token prefix of a `PREFIX_SECTION_FAMILIES` entry (`lib/parser/knownSections.ts:82`,
  via the existing `matchesTokenPrefix`, `lib/parser/knownSections.ts:160-166`) → `true`.

The predicate lives beside the registries it reads; the exporter imports it (`lib/drive`
already mirrors parser contracts — `isPullSheetHeaderCells` mirrors
`lib/parser/pull-sheet.ts:60` per `lib/drive/exportSheetToMarkdown.ts:236-242`).

### 2.2 `splitBlocks` change

In `splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`): when `current` is
non-empty and the incoming non-blank row's first non-blank cell satisfies
`isMidBlockSectionStart`, push `current` and start a new block with this row. Blank-row
handling and `trimBlock` are unchanged. The first row of a block never triggers a split.
Both call sites — the OLD-tab path (`lib/drive/exportSheetToMarkdown.ts:359`) and the
main path (`lib/drive/exportSheetToMarkdown.ts:386`) — get the new behavior; §1.1's
OLD-tab semantic paragraph governs the fingerprint consequence, and the extended T2
golden proves the live corpus is untouched.

Effect on the fuse failure mode: a stray spacer-row value no longer merges section B into
section A when B's header is uppercase-known — B parses normally; the stray row stays in
A's block (existing class-B / raw_unrecognized machinery covers oddball rows). Fuses onto
non-uppercase or unknown headers remain unfixed (residual, §8). **Fix (b) is a
runtime-only fix with respect to the mutation harness** — see §5.

## 3. Fix (c) — `ORPHANED_CREW_ROWS` parser warning

### 3.1 Detection rule (v2 — probe 5)

New scan in `parseSheet` (`lib/parser/index.ts`), directly after the class-B
unknown-section scan (`lib/parser/index.ts:700-718`). Operating on markdown TABLE BLOCKS
(split the markdown on runs of ≥2 newlines — the block shape
`collectPullSheetRegionsFromMarkdown` uses, `lib/drive/exportSheetToMarkdown.ts:261`):

For each block, take the first pipe row that is not a delimiter row (`| :---: |`-shaped);
let `cells` = its cells, `firstCell` = first non-empty cell, `tok` = `firstCell` truncated
at the first `&#10;` or newline, trimmed. The block is an **orphaned crew tail** when ALL
hold, evaluated in this order:

1. **Not suppressed:** no `KNOWN_SECTION_HEADERS` entry is a whole-token prefix of `tok`
   compared CASE-SENSITIVELY against the RAW text (registry entries are uppercase, so the
   sheet text must carry the token in uppercase; boundary rule as `matchesTokenPrefix`).
   This suppresses genuine section-header rows (`CREW | NAME | ...`), the DRESS shape
   (probe 5), and the legacy fused header `TRANSPORTATION/Load In:`
   (`fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md:24`) — while a crew NAME in
   the first cell (mixed case: "Doug Larson", or adversarial R1's "Driver Jones") is
   never suppressed, closing R1 finding 3's false-negative class. No sub-label or
   pull-sheet clause: single-cell rows and header bands are excluded by arms 2-3.
2. **Row shape:** ≥2 non-empty cells (kills single-cell ROLE-legend rows, probe 5).
3. **Role cell:** some single cell matches ≥2 DISTINCT role tokens among
   `LOAD IN` (`/\bLOAD\s*[- /]*\s*IN\b/i`), `LOAD OUT` (`/\bLOAD\s*[- /]*\s*OUT\b/i`),
   `STRIKE` (`/\bSTRIKE\b/i`), `SET` (`/\bSET\b/i`) — exported as `CREW_ROLE_CELL_TOKENS`
   (name + regex pairs) with helper `isCrewRoleCell(cell): boolean` in
   `lib/parser/knownSections.ts` beside `SECTION_FIELD_HEADER_WORDS`. Single-token rows
   (`GS Strike Time`, `Setup / Load In Date / Time`, agenda `9:00PM - LOAD IN` cells —
   `SETUP` does not match `\bSET\b`) never fire; the token-per-CELL rule means two
   single-token cells in one row (the consultants agenda row) do not fire either.

De-dup: one emit per distinct `tok` per parse (a `Set`, mirroring
`emittedUnknownHeaders`, `lib/parser/index.ts:701`). No numeric cap — the de-dup set
bounds emission at one per distinct orphan first-row cell.

The rule is adjacency-FREE (no "previous block recognized" condition): probe 3 shows
adjacency adds only false positives; probe 5 shows the shape discriminator alone is
corpus-clean.

### 3.2 Emission

New emitter in `lib/parser/warnings.ts` beside `emitUnknownSection`
(`lib/parser/warnings.ts:108-118`), same no-op-on-undefined-aggregator contract:

```ts
export const ORPHANED_CREW_ROWS = "ORPHANED_CREW_ROWS";

export function emitOrphanedCrewRows(agg: ParseAggregator | undefined, firstCellText: string): void;
```

Warning shape (emit site uses the string literal, matching the x2 scanner contract
documented at `lib/parser/warnings.ts:57-64`):

- `severity: "warn"` (mandatory: `warningSummary()` filters to "warn" for the operator
  StagedReviewCard, per the contract comment at `lib/parser/warnings.ts:40`)
- `code: "ORPHANED_CREW_ROWS"`
- `message`: `Crew rows starting at "<firstCellText>" aren't attached to a section header;
  a blank row may have split the crew section. Those rows were not parsed as crew. Check
  the sheet.` (`<firstCellText>` truncated to 60 chars; no em-dashes, no raw codes —
  invariant 5)
- `blockRef: { kind: "crew" }` (`KIND_TO_SECTION` maps `crew` → the crew section,
  `lib/admin/step3SectionStatus.ts:22-24`)
- `rawSnippet: firstCellText` (same 60-char truncation, one shared constant)

### 3.3 Surfacing + code registration lockstep (all in one commit, per AGENTS.md §12.4 rule)

Adversarial R1 finding 1 (P0): card display flows through `selectActionableForDisplay` →
`operatorActionableWarnings`, which drops every code absent from
`OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:389-410`,
`lib/parser/dataGaps.ts:428-436`), and anchor
population (`CELL_ANCHORED_CODES === OPERATOR_ACTIONABLE_ANCHORED`,
`lib/drive/showDayTimeAnchors.ts:17`) has no arm for a bare `{ kind: "crew" }`. Both
registrations below are therefore mandatory, with behavioral tests (§6 T10).

| Layer | Action |
| --- | --- |
| `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:389`) | Add `ORPHANED_CREW_ROWS` — gates BOTH card display and anchor population |
| `lib/drive/showDayTimeAnchors.ts` anchor dispatch | New arm: for `ORPHANED_CREW_ROWS`, resolve the crew REGION anchor (`sources.region[w.blockRef.kind]`), the same region-fallback shape as `FIELD_UNREADABLE`'s fallback arm (`lib/drive/showDayTimeAnchors.ts:146-153`). A region link, never a wrong-cell link — the tail block's exact row cannot be uniquely located post-synthesis |
| Master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) | New row (style of the `ROOM_HEADER_SPLIT_AMBIGUOUS` row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2903`) + copy entry (style of `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3197`) |
| `pnpm gen:spec-codes` | Regenerate `lib/messages/__generated__/spec-codes.ts` |
| `lib/messages/catalog.ts` | Full row (all fields, §3.4 copy; style `ROOM_HEADER_SPLIT_AMBIGUOUS` at `lib/messages/catalog.ts:1354-1366`) |
| Warning-card copy | Code into `WARNING_CARD_COPY_CODES` AND popover copy into `EXPECTED_TRIGGER_CONTEXT` (`tests/messages/warningCardCopyRegistry.ts:4`, `tests/messages/warningCardCopyRegistry.ts:48`); inline + popover row appended to the canonical §4.2 table in `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:118` (the catalog carries the copy; the registry pins codes + trigger copy — R1 finding 6) |
| `lib/parser/dataGaps.ts` `GAP_CLASSES` | `{ code: "ORPHANED_CREW_ROWS", label: "cut-off crew rows" }` (not `gateExempt`, §1.1) |
| `tests/parser/dataGapsClassCompleteness.test.ts` | Add to `ALL_PERSISTED_WARNING_CODES`; bump the size pin at `tests/parser/dataGapsClassCompleteness.test.ts:209` (54 → 55) |
| `app/help/errors/_families.ts` | Prefix `ORPHANED` into the `crew-schedule` family (the "Other" fallback is pinned EMPTY, `tests/help/errors-grouping.test.tsx:36`) |

### 3.4 Authored copy (canonical here; implementation copies verbatim)

- **title:** `Some crew rows came loose from their section`
- **dougFacing:** `Some crew rows in _<sheet-name>_ look separated from the CREW section
  header, so they were not parsed as crew. A blank row may have been inserted in the
  middle of the section; check the crew block in your sheet.`
- **crewFacing:** `null`
- **followUp:** `Doug → remove the stray blank row in the crew section`
- **helpfulContext** (= §4.2 inline): `Rows that look like crew assignments are not
  attached to a crew section header, so they were not parsed. A blank row may have been
  added in the middle of the crew section. Check the crew section in the sheet and remove
  the stray blank row.`
- **triggerContext** (= §4.2 popover): `Appears when rows carrying crew role text (like
  'Load In / Set / Strike / Load Out') sit in a block with no section header above them.`
- **longExplanation:** `A blank row inside the crew section splits the roster into two
  pieces, and the piece below the blank row loses its connection to the CREW header. Those
  rows were not parsed, so the crew members on them may be missing from their pages.
  Remove the blank row in the sheet and the roster will read as one section again.`
- **helpHref:** `/help/errors#ORPHANED_CREW_ROWS`

No em-dashes; no raw codes in prose; apostrophes as straight quotes matching catalog
convention.

## 4. What this feature does NOT touch

No DB (no migrations, no schema manifest). No UI component/route files (§1.1). No
sync-layer code. No advisory-lock surface. No new mutation surface (invariant 10 N/A —
parser and exporter are pure functions). Email canonicalization N/A. Flag lifecycle N/A.

### Dimensional Invariants

N/A — no UI components or layout change in this feature (§1.1: registry rows + lib code
only; no fixed-dimension parents rendered).

### Transition Inventory

N/A — no component with visual states is created or modified.

## 5. Mutation-harness ratchet (corrected per adversarial R1 finding 5)

The harness mutates ALREADY-EXPORTED markdown and calls `parseSheet` directly
(`tests/parser/mutation/operators.ts:180-215`, `tests/parser/mutation/runShard.ts:97`);
it never invokes exporter `splitBlocks`. Therefore:

- **Fix (b) graduates ZERO ledger rows.** Its fuse fix is real at runtime (grid-level)
  but invisible to the markdown-level harness. `blank-row:remove` holes remain.
- **Fix (c) graduates only the `blank-row:inject` sites whose tail-first row satisfies
  §3.1** (crew-shaped tails). The oracle counts any NEW warning code as a signal
  (`newSignalFired`, `tests/parser/mutation/oracle.ts:52-59`), and rule v2 fires only on
  crew-shaped rows, so non-crew inject sites cannot falsely graduate (R1 finding 2's
  oracle concern).
- **Ledger action: delete exactly `fixedHoles`, never `staleRows` wholesale.**
  `staleRows = fixedHoles ∪ driftedStale` (`tests/parser/mutation/knownHoles.ts:13-35`);
  `driftedStale` rows still alarm with a changed fingerprint and are RE-BLESSED
  (fingerprint regenerated), not deleted — per the shard assertions'
  own instructions (`tests/parser/mutationHarness.shard0.test.ts:53-60`). Update the
  ledger header counts to the reconciliation's post-change numbers. Never add rows.

## 6. Tests (TDD; each lands red-first with its implementation task)

- **T1 — `isMidBlockSectionStart` + `isCrewRoleCell` unit** (`tests/parser`):
  uppercase exact (`"HOTEL"`, `"TRANSPORTATION"`) → true; family prefix first line
  (`"GENERAL SESSION - GRAND BALLROOM A/B"`, multiline `"GENERAL SESSION\nGRAND BALLROOM"`)
  → true; mixed case (`"General Session Room Name"`, `"In House AV"`, `"Driver"`) → false;
  `"CLIENT"` → false; empty/whitespace → false; `"DATESOMETHING"` → false (token boundary).
  `isCrewRoleCell`: `"- Load In / Set / Strike / Load Out - LEAD"` → true;
  `"Load In/Set/Strke/Load Out"` → true (live typo row; LOAD IN + LOAD OUT);
  `"- Load In / Set ONLY"` / `"- Load Out / Strike ONLY"` → true; `"GS Strike Time"` /
  `"Setup / Load In Date / Time"` / `"9:00PM - LOAD IN"` / `"LOADING DOCK"` (all
  single-token shapes) → false; `"Set/Strike: Black Pants"` → true
  (two tokens — suppression, not this predicate, is what excludes the DRESS row).
  Failure modes: case-insensitive/prefix regression re-admitting probe-1's 85 hits;
  single-token loosening re-admitting probe-4's classes.
- **T2 — corpus zero-diff + archived-tab golden**: `tests/drive/round-trip-fixture.test.ts`
  markdown byte-equality stays green with unmodified fixtures, AND the test is EXTENDED to
  assert `archivedPullSheetTabs` (tab name + fingerprint) equality against literals
  captured from the PRE-change code on the same fixtures (captured during the task's red
  phase; post-change values must be identical — probe 2 predicts zero drift). Failure
  modes: any segmentation change that alters live corpus bytes; silent archived-tab
  fingerprint churn (R1 finding 4).
- **T3 — exporter fuse split** (`tests/drive/exportSheetToMarkdown.test.ts`, in-memory
  `XLSX.utils.aoa_to_sheet` pattern at `tests/drive/exportSheetToMarkdown.test.ts:13-17`):
  fused grid (section A rows, stray-value spacer row, `HOTEL` header + rows) → TWO tables,
  second opening with the `HOTEL` row (assert on markdown table structure — the data
  source). Stray spacer removed (true blank) → still two tables. `CLIENT` in place of
  `HOTEL` → ONE table. OLD-tab semantic (per §1.1): an `"OLD PULL SHEET"` tab whose
  pull-sheet region is fused to a following `HOTEL` block → the collected region markdown
  EXCLUDES the HOTEL rows and the fingerprint equals the hash of the pull-sheet-only
  region bytes (assert by recomputing the expected hash from the emitted region markdown —
  derived, not hardcoded).
- **T4 — orphan warn positive** (`tests/parser`): east-coast shape (role text + phone in
  row), rpas shape (empty col0, name first non-empty, boolean column), fixed-income shape
  (name + role cell only, `|  | DJ Johnson | - Load In / Set / Strike / Load Out - V1 |  |  |`),
  and R1-finding-3 collision shape (name starting with a registry token in mixed case:
  `| Driver Jones | - Load In / Set / Strike / Load Out - V1 | 555-000-1111 |`) → each
  emits exactly one warning with `severity:"warn"`, `blockRef.kind === "crew"`,
  `rawSnippet` = first cell. Assert against
  `parseSheet(...).warnings.filter(w => w.code === "ORPHANED_CREW_ROWS")`. De-dup: same
  tail twice → one per distinct first cell.
- **T5 — orphan warn negatives** (each pins a probe-4/5 class): `| GS Strike Time | 10/9 @ 4:30pm |`;
  `| Setup / Load In Date / Time | FALSE |`; a standalone ROLE-legend table
  (`| ROLE |` header then single-cell `| - Load In / Set / Strike / Load Out - LEAD |`
  rows, blank-split so a legend row IS a tail-first row) → none; the DRESS row
  `| DRESS | Set/Strike: Black Pants, Black Polo Shirt, Black Footwear |` as a tail-first
  row → none (uppercase-raw suppression); the legacy fused header row
  (`fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md:24` shape) → none; the
  consultants agenda row (`TRAVEL / SET` cell + `9:00PM - LOAD IN` cell, two single-token
  cells) → none; intact `CREW` table → none.
- **T6 — corpus zero-warning walker**: directory-walk
  `fixtures/shows/{exporter-xlsx,raw,synthetic,email-embedded,pdf-only}` for `*.md`
  (exclude `README.md`; `readdirSync`, never a hand-named list), parse each, assert zero
  `ORPHANED_CREW_ROWS`. Failure mode: discriminator drift re-admitting probe-3/4 classes
  on intact sheets.
- **T9 — corpus split-recall ratchet** (R1 finding 7): for EVERY exporter fixture
  markdown, locate every crew/TECH table block, insert a blank line before each internal
  data row in turn, parse the mutated markdown, and assert ≥1 `ORPHANED_CREW_ROWS`. This
  reproduces probe 5's recall claim as a permanent ratchet (29 simulated splits today;
  the count derives from the corpus, not a hardcoded literal). Failure mode: a
  discriminator change that silently trades away recall.
- **T10 — surfacing behavioral** (R1 finding 1): `operatorActionableWarnings` passes an
  `ORPHANED_CREW_ROWS` warning through (and still drops a code not in the registry —
  negative control); the `showDayTimeAnchors` dispatch resolves it to the crew REGION
  anchor when a crew region source exists and to `null` (warning still displayed, no
  link) when not. Assert against the helpers' return values (the data source), in the
  existing test files for those helpers.
- **T7 — lockstep gates**: existing `x1-catalog-parity`
  (`tests/cross-cutting/codes.test.ts:69`), `_metaWarningCardCopy`,
  `dataGapsClassCompleteness`, `errors-grouping` all green after the registrations.
- **T8 — mutation-ledger reconciliation**: run the 8 shards + gates file with
  `VITEST_INCLUDE_MUTATION_HARNESS=1`; delete exactly the reported `fixedHoles` rows;
  re-bless any `driftedStale` fingerprints; update header counts; harness green (§5).

## 7. Numeric / consistency notes

- Probe numbers (85, 2, 0, 30) are defined once in §1.0 and referenced as "probe result
  N". The recall/miss numbers are corpus-derived at test time (T9), not spec literals.
- Truncation: 60 chars for both `message` interpolation and `rawSnippet` (§3.2), one
  shared constant.
- Copy strings are canonical in §3.4; §12.4 / catalog / §4.2 table copy them verbatim.

## 8. Docs updates (same PR)

- `BACKLOG.md` `BL-EXPORT-BLANK-ROW-SEGMENTATION` → **PARTIALLY CLOSED (2026-07-27)**:
  fuse fixed structurally at runtime for uppercase-known headers (not ledger-visible, §5);
  splits detected for crew-role-shaped tails; residuals enumerated (non-crew splits;
  fuses onto non-uppercase/unknown headers; crew rows without ≥2 role tokens; harness
  cannot observe exporter-level fixes) with the probe evidence for why generic orphan
  detection was refuted.
- Master spec §12.4 row + §4.2 card-copy rows (§3.3-3.4) — additive error-catalog rows via
  the standard process, not a contradiction of the master spec (invariant 7).
