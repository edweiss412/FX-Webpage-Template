# Blank-row block segmentation: header-aware splits + orphaned-crew-rows warning

**Backlog:** `BL-EXPORT-BLANK-ROW-SEGMENTATION` (BACKLOG.md:781, audit finding #10, 2026-07-04)
**Date:** 2026-07-27
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
rows starting at `tests/parser/mutation/knownHoles.ts:115`, mapped to audit finding `#10` via
`OPERATOR_FINDING_MAP`, `tests/parser/mutation/knownHoles.ts:85-86`), but detection-in-tests
is not detection-at-runtime.

### 1.0 Empirical probe (2026-07-27, this spec's design authority)

Before drafting, candidate rules were probed against the 7 committed exporter snapshots
(`fixtures/shows/exporter-xlsx/*.xlsx`, every tab) and all committed fixture markdown
(`fixtures/shows/{exporter-xlsx,raw,synthetic,email-embedded,pdf-only}/*.md`). Results that
shaped the design (probe scripts: session scratchpad `probe-segmentation.mts`…`probe4.mts`;
headline numbers reproduced in the test suite this spec mandates):

1. **Naive header-aware split (case-insensitive `isKnownSectionHeader` on any mid-block
   row) hits 85 corpus rows** — mixed-case FORM-tab question labels ("General Session Room
   Name" × 12 per show), INFO-tab "In House AV" and "Driver" rows sitting legitimately
   mid-block. A case-insensitive rule would shred live sheets.
2. **Uppercase-only + exact/family match leaves exactly 2 corpus hits, both `CLIENT`**
   (east-coast INFO block#1 row#1, fintech INFO block#1 row#1 — a `CLIENT` label row
   directly under a `#NUM!` error row / a notes row, fused in the live sheets today and
   parsed correctly). Excluding `CLIENT` from the mid-block split set yields **0 corpus
   hits** — i.e. byte-identical corpus output by construction.
3. **The backlog's adjacency orphan rule ("block with no recognizable header adjacent to a
   recognized section") fires 30 times on the live corpus** — GEAR-tab gear lists under
   room headers ("DLP DATA PROJECTOR" after "BREAKOUT SESSION 1 - LASALLE"), INFO-tab
   free-text blocks ("HOTELS FOR DOUG'S DRIVE BACK" after `TRANSPORTATION`/`HOTEL`,
   "Hotal Contact Info" after `COI`), PULL SHEET title rows. Blocks legitimately starting
   with non-header rows are NORMAL sheet layout; adjacency alone cannot be shipped.
4. **Crew-role-signature discriminator: 0 false positives, 29/29 recall.** Every crew/TECH
   roster row in all 7 shows carries the "Load In / Set / Strike / Load Out" role
   convention (including the "Strke" typo row — the regex keys on `LOAD IN|LOAD OUT|STRIKE`).
   Simulating a split at every internal crew-block row: the tail's first row matches in
   29/29 cases. Across every committed fixture markdown file, exactly one non-crew row
   matches the role regex — the legacy Drive-MCP fused header
   `TRANSPORTATION/Load In:` (`fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md:24`)
   — and it is suppressed by token-prefix matching against the section-header registry
   (`TRANSPORTATION` is a whole-token prefix of its first cell).

## 1.1 Resolved scope — do not relitigate

- **Fix (b) ships structurally; fix (c) ships crew-scoped only.** The backlog entry's
  generic orphan-block detection is empirically infeasible at zero corpus false positives
  (probe result 3 above: 30 legit corpus sites). Orphan detection in this spec is scoped to
  crew-role-signature rows (probe result 4: 0 FP / 29-29 recall). Hotel, transport, and
  other section splits remain undetected at runtime; the backlog entry is updated to
  PARTIALLY CLOSED with the residual documented (§8). Do not relitigate "why not generic
  orphan detection" — the corpus refutes it.
- **Fix (a) (near-blank-row heuristic) is not pursued.** It requires a new
  exporter-to-parser warning channel (the exporter returns only
  `{ markdown, archivedPullSheetTabs }`, `lib/drive/exportSheetToMarkdown.ts:320-323`) and
  its fuse coverage is subsumed by fix (b).
- **`CLIENT` is excluded from the mid-block split set** on direct corpus evidence (probe
  result 2). The zero-diff gate (§6 T2) enforces the exclusion; a future live show that
  fuses a different label section would surface as a round-trip fixture diff at
  re-snapshot time, not as silent breakage.
- **The uppercase gate is case-SENSITIVE by design** (probe result 1). Real section headers
  on Doug's sheets are uppercase; mixed-case matches are FORM/INFO data. This mirrors the
  precedent at `lib/drive/exportSheetToMarkdown.ts:72-75` (case-sensitive room-header match
  "matching rooms.ts boBlockRe").
- **The corpus zero-diff gate is the existing test** `tests/drive/round-trip-fixture.test.ts`
  (byte equality of `synthesizeMarkdownFromXlsx` output vs committed `.md` for all 7 shows,
  plus structural parse equality). It must stay green WITHOUT regenerating any fixture.
  No fixture bytes change in this feature.
- **ROLE_RE convention dependency is accepted.** Detection recall depends on Doug's roster
  role convention ("- Load In / Set / Strike / Load Out -", present in 100% of corpus crew
  rows). A crew row authored without any of the tokens LOAD IN / LOAD OUT / STRIKE in any
  cell is not detected when orphaned. Documented residual, not a defect.
- **No UI files change.** The new warning surfaces through the existing catalog-driven
  warning-card machinery (copy registry + catalog row); invariant-8 impeccable gates do not
  apply. No DB change; no advisory-lock surface; no mutation HTTP surface (invariants 2/10
  untouched).
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

/** True when a grid row's first non-blank cell BEGINS a new section mid-block:
 *  first LINE of the cell (fused multi-line headers keep line 1), case-SENSITIVE
 *  uppercase (any lowercase letter disqualifies), normalized token in
 *  KNOWN_SECTION_HEADERS exactly or a PREFIX_SECTION_FAMILIES token-prefix,
 *  and not in MID_BLOCK_SPLIT_EXCLUDED. */
export function isMidBlockSectionStart(rawCell: string): boolean;
```

Semantics (guard conditions):

- `rawCell` empty / whitespace-only / first line empty → `false`.
- Any lowercase letter in the first line → `false` (kills all 85 probe-1 hits).
- `normalizeHeader(line1)` (`lib/parser/knownSections.ts:25-27`) in
  `MID_BLOCK_SPLIT_EXCLUDED` → `false`.
- Otherwise: exact membership in `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts:35`)
  or whole-token prefix of a `PREFIX_SECTION_FAMILIES` entry (`lib/parser/knownSections.ts:82`,
  via the existing `matchesTokenPrefix` helper, `lib/parser/knownSections.ts:160-166`) →
  `true`.

The predicate lives beside the registries it reads so the existing registry meta-tests
(`tests/parser/_metaKnownSectionsRegistry.test.ts`) stay adjacent; the exporter imports it
(`lib/drive` already mirrors parser contracts, e.g. `isPullSheetHeaderCells` mirroring
`lib/parser/pull-sheet.ts:60` per `lib/drive/exportSheetToMarkdown.ts:236-242`).

### 2.2 `splitBlocks` change

In `splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`): when `current` is
non-empty and the incoming non-blank row's first non-blank cell satisfies
`isMidBlockSectionStart`, push `current` and start a new block with this row. Blank-row
handling, `trimBlock`, and the trailing `.map(trimBlock).filter(...)` are unchanged. The
first row of a block never triggers a split (the `current.length > 0` guard). Both call
sites — the OLD-tab archived-pull-sheet path (`lib/drive/exportSheetToMarkdown.ts:359`)
and the main path (`lib/drive/exportSheetToMarkdown.ts:386`) — get the new behavior; the zero-diff gate (§6 T2) plus the
archived-tab fingerprint assertions (§6 T3) prove neither changes on the corpus (probe
result 2: 0 hits including OLD tabs).

Effect on the fuse failure mode: a stray spacer-row value no longer merges section B into
section A — B's uppercase header starts a fresh block, so B parses normally and the stray
row stays in A's block (where the existing class-B / raw_unrecognized machinery already
covers oddball rows). Fuse cases whose following section header is NOT uppercase-known
remain unfixed (residual, §8).

## 3. Fix (c) — `ORPHANED_CREW_ROWS` parser warning

### 3.1 Detection rule

New scan in `parseSheet` (`lib/parser/index.ts`), directly after the class-B
unknown-section scan (`lib/parser/index.ts:700-718`), mirroring its structure. Operating on
markdown TABLE BLOCKS (split the markdown on runs of ≥2 newlines — same block shape
`collectPullSheetRegionsFromMarkdown` uses, `lib/drive/exportSheetToMarkdown.ts:261`):

For each block, take the first pipe row that is not a delimiter row (`| :---: |`-shaped);
let `firstCell` = its first non-empty cell, and `tok` = `firstCell` truncated at the first
`&#10;` or newline, trimmed. The block is an **orphaned crew tail** when ALL hold:

1. `tok` is NOT suppressed. Suppressed means: any `KNOWN_SECTION_HEADERS` entry is a
   whole-token prefix of `normalizeHeader(tok)` (deliberately BROADER than
   `isKnownSectionHeader`'s exact-only rule — over-suppression is the safe direction here,
   same bias as `isKnownSubLabel`, `lib/parser/knownSections.ts:199-201`; this is what
   suppresses the legacy `TRANSPORTATION/Load In:` fused-header row, probe result 4); OR
   `isKnownSubLabel(tok)`; OR `tok` upper-cased contains `PULL SHEET`.
2. Some cell of that first row matches `ROLE_RE` =
   `/\bLOAD\s*[- /]*\s*(IN|OUT)\b|\bSTRIKE\b/i` (new exported const in
   `lib/parser/knownSections.ts`, beside `SECTION_FIELD_HEADER_WORDS`).

De-dup: one emit per distinct `tok` per parse (a `Set`, mirroring
`emittedUnknownHeaders`, `lib/parser/index.ts:701`). No numeric cap — the de-dup set
bounds emission at one per distinct orphan first-row cell, and a sheet cannot contain
more orphan blocks than blocks.

Note the rule is deliberately adjacency-FREE (no "previous block recognized" condition):
probe result 3 shows adjacency adds only false positives, and the role-signature
discriminator alone is corpus-clean.

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
  StagedReviewCard, per `lib/parser/warnings.ts:39-43`)
- `code: "ORPHANED_CREW_ROWS"`
- `message`: `Crew rows starting at "<firstCellText>" aren't attached to a section header;
  a blank row may have split the crew section. Those rows were not parsed as crew. Check
  the sheet.` (`<firstCellText>` truncated to 60 chars; no em-dashes, no raw codes —
  invariant 5)
- `blockRef: { kind: "crew" }` (an existing RegionId the anchor/deep-link machinery
  already routes; the crew region anchor is the right operator jump target)
- `rawSnippet: firstCellText` (truncated to 60 chars, same value the message embeds)

### 3.3 Code registration lockstep (all in one commit, per AGENTS.md §12.4 rule)

| Layer | Action |
| --- | --- |
| Master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) | New row for `ORPHANED_CREW_ROWS` (admin/operator warning; style of the `ROOM_HEADER_SPLIT_AMBIGUOUS` row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2903`) + warning-card copy entry (style of `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3197`) |
| `pnpm gen:spec-codes` | Regenerate `lib/messages/__generated__/spec-codes.ts` |
| `lib/messages/catalog.ts` | New row (style of `ROOM_HEADER_SPLIT_AMBIGUOUS`, `lib/messages/catalog.ts:1354-1366`) |
| Warning-card copy | `WARNING_CARD_COPY_CODES` + copy string in `tests/messages/warningCardCopyRegistry.ts:4` AND the canonical §4.2 table in `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` (byte-identical, enforced by `tests/messages/_metaWarningCardCopy.test.ts`) |
| `lib/parser/dataGaps.ts` `GAP_CLASSES` | New entry `{ code: "ORPHANED_CREW_ROWS", label: "cut-off crew rows" }` (NOT `gateExempt`, §1.1) |
| `tests/parser/dataGapsClassCompleteness.test.ts` | Move the code into the persisted-warn partition it pins (count updates with it) |

Card copy (user-visible; no em-dash, plain language):
`Some rows that look like crew assignments aren't attached to a crew section header. A
blank row may have been added in the middle of the crew section, so those rows were not
parsed. Check the crew section in the sheet.`

The x1 catalog-parity gate (`tests/cross-cutting/codes.test.ts:69`) and the x2 no-raw-codes
scanner enforce the chain.

## 4. What this feature does NOT touch

No DB (no migrations, no schema manifest). No UI components or routes. No sync-layer code.
No advisory-lock surface. No new mutation surface (invariant 10 N/A — parser and exporter
are pure functions). Email canonicalization N/A (no emails handled). Flag lifecycle N/A
(no new flags).

## 5. Mutation-harness ratchet

Fix (b) resolves a subset of `blank-row:remove` (fuse) sites and fix (c) converts a subset
of `blank-row:inject` (split) sites from `wrong` to `detected`. Per the ledger ratchet
(`tests/parser/mutation/knownHoles.ts` reconciliation: `staleRows` / `fixedHoles`), the
harness run after implementation will flag graduated ledger rows as stale; delete exactly
those rows in the same PR. Remaining `blank-row:*` holes (non-crew splits, fuses whose
following header is not uppercase-known) stay in the ledger, still mapped to `#10` via
`OPERATOR_FINDING_MAP`. No hole may be silently re-added.

## 6. Tests (TDD; each lands red-first with its implementation task)

- **T1 — `isMidBlockSectionStart` unit** (`tests/parser` beside the registry tests):
  uppercase exact header → true; family prefix ("GENERAL SESSION - GRAND BALLROOM A/B",
  first line of a fused multi-line cell) → true; mixed-case ("General Session Room Name",
  "In House AV", "Driver") → false; `CLIENT` → false; empty/whitespace → false;
  "DATESOMETHING" (no token boundary) → false. Failure mode caught: a case-insensitive or
  prefix-happy regression re-introducing the 85 probe-1 corpus hits.
- **T2 — corpus zero-diff**: the EXISTING `tests/drive/round-trip-fixture.test.ts` must
  pass unmodified, with unmodified fixtures. This is the enforcement of probe result 2 and
  of the `CLIENT` exclusion. Failure mode caught: any splitBlocks change that alters live
  corpus bytes.
- **T3 — exporter fuse split** (`tests/drive/exportSheetToMarkdown.test.ts`): build an
  in-memory xlsx (existing test pattern in that file) with section A rows, a spacer row
  carrying one stray value, then an uppercase `HOTEL` header + rows; assert the synthesized
  markdown contains TWO tables with the `HOTEL` row opening the second (assert on the
  markdown table structure, not on parse output — the data source, per anti-tautology).
  Companion: same grid with the stray row REMOVED still yields two tables (blank-row path
  unchanged); same grid with `CLIENT` instead of `HOTEL` yields ONE table (exclusion
  pinned at exporter level). OLD-tab variant: the same fused grid on an "OLD PULL SHEET"
  tab leaves `archivedPullSheetTabs` fingerprints stable vs the pre-change fixture
  expectation for non-pull-sheet blocks (regions exclude non-pull-sheet blocks already,
  `lib/drive/exportSheetToMarkdown.ts:258-273`).
- **T4 — orphan warn positive** (`tests/parser`): markdown with a `CREW | NAME | ...`
  table, blank line, then a table whose first row is a crew row (both the east-coast shape
  — role text inside the name cell with phone — and the rpas shape — empty col0, name,
  role cell, empty phone/email, `TRUE`): each emits exactly one `ORPHANED_CREW_ROWS`
  warning with `severity:"warn"`, `blockRef.kind === "crew"`, `rawSnippet` = the first
  cell. Assert against `parseSheet(...).warnings` filtered by code (the data source).
  De-dup: the same orphan block twice → one warning per distinct first cell.
- **T5 — orphan warn negatives**: (i) the `TRANSPORTATION/Load In:` legacy fused-header
  row shape → no warning (prefix suppression); (ii) a `LOADING DOCK` sub-label row → no
  warning; (iii) a gear row "DLP DATA PROJECTOR" after a room header → no warning (no
  role token); (iv) an intact CREW block → no warning.
- **T6 — corpus zero-warning regression**: parse EVERY committed fixture markdown
  (`fixtures/shows/{exporter-xlsx,raw,synthetic,email-embedded,pdf-only}/*.md`) and assert
  zero `ORPHANED_CREW_ROWS` warnings. Failure mode caught: discriminator drift
  re-introducing probe-3-class false positives. (Derives the file list by directory walk,
  not a hand-named list — class-sweep discipline.)
- **T7 — lockstep gates**: existing `x1-catalog-parity` (`tests/cross-cutting/codes.test.ts:69`),
  `_metaWarningCardCopy`, `dataGapsClassCompleteness` all green after the registrations —
  no new test code, but their green state is part of this feature's definition of done.
- **T8 — mutation-ledger reconciliation**: run the blank-row mutation shards; delete
  exactly the `staleRows` the reconciliation reports; harness green.

## 7. Numeric / consistency notes

- Probe numbers (85, 2, 0, 30, 29/29, 1 suppressed FP) appear only in §1.0 and are
  referenced elsewhere as "probe result N" — single definition point.
- Truncation: 60 chars for both `message` interpolation and `rawSnippet` (§3.2) — one
  shared constant in the emitter.
- `ROLE_RE` and the suppression rule are defined once (§3.1) and referenced by T4/T5/T6.

## 8. Docs updates (same PR)

- `BACKLOG.md` `BL-EXPORT-BLANK-ROW-SEGMENTATION` → **PARTIALLY CLOSED (2026-07-27)**:
  fuse fixed structurally for uppercase-known headers; splits detected for crew-role rows;
  residuals enumerated (non-crew splits; fuses onto non-uppercase/unknown headers; crew
  rows without role tokens) with the probe evidence for why generic detection was refuted.
- Master spec §12.4 row + card-copy table rows (§3.3) — ratified here as a spec amendment
  in the sense of AGENTS.md invariant 7 (additive error-catalog row, standard §12.4
  process, not a contradiction of the master spec).
