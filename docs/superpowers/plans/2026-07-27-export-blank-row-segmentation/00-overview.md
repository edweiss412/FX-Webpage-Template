# Plan — blank-row segmentation: header-aware splits + ORPHANED_CREW_ROWS

**Spec:** `docs/superpowers/specs/2026-07-27-export-blank-row-segmentation.md` (canonical,
post-R1 revision; this plan implements it verbatim — on any conflict the spec wins).
**Branch:** `fix/export-blank-row-segmentation` (worktree `/Users/ericweiss/FX-worktrees/export-blank-row-segmentation`).
**Routing:** Opus / Claude Code (parser+exporter lib work). The one-line
`app/help/errors/_families.ts` edit is a non-API `app/` file, so the invariant-8
`/impeccable critique` + `/impeccable audit` dual-gate RUNS at close-out on the affected
diff (spec §1.1, R3 finding 1).

Every task is TDD (invariant 1): failing test → minimal implementation → green → commit
(`<type>(<scope>): <summary>`). No DB, no advisory locks, no mutation surfaces, no UI
components.

## Meta-test inventory (writing-plans rule)

- **EXTENDS** `tests/parser/dataGapsClassCompleteness.test.ts` — `ORPHANED_CREW_ROWS`
  into `ALL_PERSISTED_WARNING_CODES` (size pins: `tests/parser/dataGapsClassCompleteness.test.ts:205`
  34 → 35, `tests/parser/dataGapsClassCompleteness.test.ts:209` 54 → 55) and `GAP_CLASSES`
  (`lib/parser/dataGaps.ts`).
- **EXTENDS** `tests/parser/operatorActionableWarnings.test.ts` — exact-set pin
  ("contains exactly the twenty codes", `tests/parser/operatorActionableWarnings.test.ts:8`)
  gains `ORPHANED_CREW_ROWS` (20 → 21, title reworded) + the T10 behavioral cases.
- **EXTENDS** `tests/messages/_metaWarningCardCopy.test.ts` enforcement data —
  `WARNING_CARD_COPY_CODES` + `EXPECTED_TRIGGER_CONTEXT` rows
  (`tests/messages/warningCardCopyRegistry.ts:4`, `tests/messages/warningCardCopyRegistry.ts:48`), byte-identical to the §4.2 table
  in `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md:118`.
- **EXTENDS** `tests/help/errors-grouping.test.tsx`'s pinned taxonomy — prefix `ORPHANED`
  into the `crew-schedule` family (`app/help/errors/_families.ts`; "Other" fallback pinned
  EMPTY at `tests/help/errors-grouping.test.tsx:40`).
- **EXTENDS** `tests/drive/round-trip-fixture.test.ts` — adds the `archivedPullSheetTabs`
  golden (spec §6 T2).
- **EXTENDS** `tests/parser/dataGaps.test.ts` — registry pins at
  `tests/parser/dataGaps.test.ts:44-45` (34 → 35 both) plus the stale `// 34` comment at
  `tests/parser/dataGaps.test.ts:157`.
- **EXTENDS** `tests/cross-cutting/codes.test.ts` (x1) and
  `tests/cross-cutting/no-raw-codes.test.ts` (x2) — their enforcement universes grow via
  the regenerated `spec-codes.ts` and `internal-code-enums.ts` manifests (no test-code
  edits; the committed fixtures are the extension).
- **CREATES none.** Advisory-lock topology: N/A — no `pg_advisory*`. Supabase
  call-boundary registry: N/A — no Supabase calls. Mutation-surface observability: N/A —
  no routes/actions.

## Plan-time sweeps (run 2026-07-27, outputs inline)

Hardcoded-count pins touching the new code. Comprehensive command (run 2026-07-27,
scoped to the registry-adjacent test trees):
`grep -rnE 'toBe\(34\)|toHaveLength\(34\)|toBe\(54\)|"contains exactly' tests/parser tests/messages tests/cross-cutting tests/help --include="*.ts*"`

```
tests/parser/dataGaps.test.ts:44:    expect(GAP_CLASSES).toHaveLength(34);
tests/parser/dataGaps.test.ts:45:    expect(DATA_GAP_CODES.size).toBe(34);
tests/parser/operatorActionableWarnings.test.ts:8:  it("contains exactly the twenty codes", () => {
tests/parser/dataGapsClassCompleteness.test.ts:205:    expect(DATA_GAP_CODES.size).toBe(34);
tests/parser/dataGapsClassCompleteness.test.ts:209:    expect(ALL_PERSISTED_WARNING_CODES.size).toBe(54); // Set dedups → proves pairwise-disjoint
```

Per-hit disposition (all Task 4): `tests/parser/dataGaps.test.ts:44-45` → 35/35;
`tests/parser/operatorActionableWarnings.test.ts:8` → add the code to the exact list and
reword "twenty" → "twenty-one"; `tests/parser/dataGapsClassCompleteness.test.ts:205` → 35;
`tests/parser/dataGapsClassCompleteness.test.ts:209` → 55. Derived (self-adjusting, comment
refresh only): `tests/parser/dataGaps.test.ts:157` (`toBe(GAP_CLASSES.length)` with a stale
`// 34`). Prose/comment refreshes (no executable pins): the it-title bucket prose
"(34/7/2/11)" → "(35/7/2/11)" at `tests/parser/dataGapsClassCompleteness.test.ts:204`;
stale universe comments at `tests/parser/dataGapsClassCompleteness.test.ts:17`
("42-partition"), `tests/parser/dataGapsClassCompleteness.test.ts:36` and
`tests/parser/dataGapsClassCompleteness.test.ts:68` ("51"); `lib/parser/dataGaps.ts:28`
("49-code" → 55); the legacy "three DQ codes" comments at `lib/parser/dataGaps.ts:5`,
`lib/parser/dataGaps.ts:111`, `lib/parser/dataGaps.ts:245` (reworded per spec §3.3);
warning-card-copy-restore.md counts/lists per spec §3.3 R4 row.

Vitest wiring: new test files land under `tests/parser/**` and `tests/drive/**`, covered
by `BASE_INCLUDE` (`vitest.projects.ts:34`) and the parallel globs
(`vitest.projects.ts:95-96`). No wiring changes. The mutation-harness PR workflow fires
automatically because the diff touches `tests/parser/mutation/knownHoles.ts` (path filter
`.github/workflows/mutation-harness.yml:27`) — real CI includes the ~70-min harness run.

## Tasks

### Task 1 — `feat(parser)`: `isMidBlockSectionStart`, `MID_BLOCK_SPLIT_EXCLUDED`, `isCrewRoleCell`, `CREW_ROLE_CELL_TOKENS`

Red-first NEW FILE tests/parser/knownSectionsMidBlock.test.ts (spec §6 T1, cases verbatim from
the spec):

- `isMidBlockSectionStart`: uppercase exact (`"HOTEL"`, `"TRANSPORTATION"`) true; family
  prefix (`"GENERAL SESSION - GRAND BALLROOM A/B"`; multiline `"GENERAL SESSION\nGRAND BALLROOM"`)
  true; mixed case (`"General Session Room Name"`, `"In House AV"`, `"Driver"`,
  `"Hotal Contact Info"`) false; `"CLIENT"` false; `""`/`"   "` false; `"DATESOMETHING"`
  false; `"general session"` false.
- `isCrewRoleCell`: full/partial role phrases true (`"- Load In / Set / Strike / Load Out - LEAD"`,
  `"Load In/Set/Strke/Load Out"`, `"- Load In / Set ONLY"`, `"- Load Out / Strike ONLY"`);
  single-token shapes false (`"GS Strike Time"`, `"Setup / Load In Date / Time"`,
  `"9:00PM - LOAD IN"`, `"LOADING DOCK"`); `"Set/Strike: Black Pants"` true (suppression,
  not this predicate, excludes the DRESS row).

Failure modes: case-insensitive/prefix regression re-admitting probe-1's 85 hits;
single-token loosening re-admitting probe-4's classes.

Implementation per spec §2.1 + §3.1(3) in `lib/parser/knownSections.ts` (reuse
`normalizeHeader`, `matchesTokenPrefix`).

### Task 2 — `fix(sync)`: header-aware `splitBlocks` + archived-tab golden

Red-first, two test surfaces:

1. `tests/drive/exportSheetToMarkdown.test.ts` additions (spec §6 T3), in-memory
   `XLSX.utils.aoa_to_sheet` pattern (`tests/drive/exportSheetToMarkdown.test.ts:13-17`):
   fused grid (A rows, stray-value spacer, `HOTEL` header + rows) → TWO tables, second
   opens with the HOTEL row (assert markdown structure); true-blank variant → two tables;
   `CLIENT` variant → ONE table; OLD-tab fused variant → region markdown EXCLUDES the
   HOTEL rows and the fingerprint equals `sha256(stripBlankLines(regionMarkdown))` per
   the emit path (`lib/drive/exportSheetToMarkdown.ts:363-368`) — expected hash DERIVED
   by recomputing from the emitted region text, never hardcoded.
2. `tests/drive/round-trip-fixture.test.ts` EXTENSION (spec §6 T2): BEFORE the
   implementation lands (red-phase step), run the CURRENT exporter over the 7 fixtures and
   capture `archivedPullSheetTabs` (tabName + fingerprint) literals into the test; the
   extended assertion then must hold unchanged after the splitBlocks change (probe 2
   predicts zero drift). Existing markdown byte-equality assertion untouched, fixtures
   untouched.

Implementation per spec §2.2. Commit body records the green run of
`pnpm vitest run tests/drive/round-trip-fixture.test.ts tests/drive/exportSheetToMarkdown.test.ts`.

### Task 3 — `feat(parser)`: orphan scan + `ORPHANED_CREW_ROWS` emitter

Red-first NEW FILE tests/parser/orphanedCrewRows.test.ts (spec §6 T4+T5, shapes verbatim from
spec — positives: east-coast, rpas, fixed-income (`|  | DJ Johnson | - Load In / Set / Strike / Load Out - V1 |  |  |`),
collisions (mixed-case `| Driver Jones | - Load In / Set / Strike / Load Out - V1 | 555-000-1111 |`
AND all-caps `| DRIVER JONES | - Load In / Set / Strike / Load Out - V1 |`); de-dup pairs
(identical tails → one; same-first-line `&#10;`-suffix pair → one, key = truncated first
line); negatives:
`GS Strike Time`, `Setup / Load In Date / Time | FALSE`, ROLE-legend tail, DRESS tail
(exact raw-uppercase suppression), legacy `TRANSPORTATION/Load In:` row (role-cell arm),
consultants agenda row, multiline agenda cell (`8:00AM - LOAD IN&#10;5:00PM - LOAD OUT`),
escaped-pipe role cell (`Load In \| Set \| Strike`), intact CREW table). Assert on
`parseSheet(...).warnings.filter(w => w.code === "ORPHANED_CREW_ROWS")` — severity,
blockRef.kind, rawSnippet.

Implementation per spec §3.1-3.2: scan in `lib/parser/index.ts` after the class-B scan
(`lib/parser/index.ts:700-719`); `emitOrphanedCrewRows` in `lib/parser/warnings.ts`
(string-literal `code:` for the x2 scanner; shared 60-char truncation constant). The
catalog-literal pins (§3.4 title/longExplanation/helpHref) do NOT land here — they land
with the catalog row in Task 4, so Task 3's commit is green (plan-R1 finding 1). Because
the new `code:` literal enters the x2 manifest scan, Task 3's commit ALSO runs
`pnpm gen:internal-code-enums` and commits the regenerated
`lib/messages/__generated__/internal-code-enums.ts` (x2 parity is per-commit,
`.github/workflows/x-audits.yml:121-125`).

### Task 4 — `feat(parser)`: corpus walker + recall ratchet + surfacing + lockstep

Red-first tests (spec §6 T6, T9, T10):

- NEW FILE tests/parser/orphanedCrewRowsCorpus.test.ts: (a) T6 walker — `readdirSync` over
  `fixtures/shows/{exporter-xlsx,raw,synthetic,email-embedded,pdf-only}`, parse every
  `*.md` (exclude README), assert zero `ORPHANED_CREW_ROWS`; (b) T9 recall ratchet with
  frozen universe (spec §6 T9): 7 fixture slugs found, every fixture ≥1 crew/TECH block,
  total simulated splits === 29 (frozen literal, regen note), each split asserts ≥1
  `ORPHANED_CREW_ROWS`.
- Catalog-literal pins (spec §3.4: `title` / `longExplanation` / `helpHref` byte-equal),
  appended to the Task-3 file tests/parser/orphanedCrewRows.test.ts in THIS task alongside the catalog
  row (moved out of Task 3 — plan-R1 finding 1).
- T10 surfacing behavioral, in the existing helper test files
  (`tests/parser/operatorActionableWarnings.test.ts`, `tests/drive/showDayTimeAnchors.test.ts`):
  `operatorActionableWarnings` passes `ORPHANED_CREW_ROWS` through + drops an
  unregistered code (negative control); anchor dispatch resolves crew REGION anchor when
  the region source exists, `null` otherwise.

Lockstep registrations in the SAME commit (spec §3.3 table + §3.4 copy verbatim):
`OPERATOR_ACTIONABLE_ANCHORED` row; `showDayTimeAnchors` arm (region fallback, mirroring
`lib/drive/showDayTimeAnchors.ts:146-154`); master spec §12.4 row + copy entry;
`pnpm gen:spec-codes` regen; `pnpm gen:internal-code-enums` re-run (first committed in
Task 3; re-run here in case the catalog row adds literals — x2 CI regenerates and rejects
an uncommitted diff, `.github/workflows/x-audits.yml:121-125`);
`lib/messages/catalog.ts` full row (§3.4 copy: "read as crew" phrasing — the
`_metaWarningCardCopy` banned-vocabulary gate rejects parse-family words); warning-card
registry (`WARNING_CARD_COPY_CODES` + `EXPECTED_TRIGGER_CONTEXT`) + §4.2 table row;
`GAP_CLASSES` entry; all count pins from the sweep above; `_families.ts` `ORPHANED`
prefix; warning-card-copy-restore.md reconciliation per spec §3.3 R4 row (back-fill the two
missing §4.2 rows — AGENDA_FILE_INACCESSIBLE, HOTEL_ADDRESS_SPLIT_AMBIGUOUS — from the
live frozen copy; counts/lists → 42 total, 29 parser / 13 sync, "20-code" → 21; emitter
inventory rows for all three codes; `lib/parser/dataGaps.ts:28` "49-code" → 55; the
legacy "three DQ codes" comments at `lib/parser/dataGaps.ts:5`,
`lib/parser/dataGaps.ts:111`, `lib/parser/dataGaps.ts:245` reworded;
`tests/parser/dataGapsClassCompleteness.test.ts:17` "42-partition" refreshed).

Verification (recorded in commit body): `pnpm vitest run tests/cross-cutting/codes.test.ts
tests/cross-cutting/no-raw-codes.test.ts tests/messages/_metaWarningCardCopy.test.ts
tests/parser/dataGapsClassCompleteness.test.ts tests/help/errors-grouping.test.tsx
tests/parser/orphanedCrewRowsCorpus.test.ts tests/parser/orphanedCrewRows.test.ts
tests/parser/dataGaps.test.ts tests/parser/operatorActionableWarnings.test.ts
tests/drive/showDayTimeAnchors.test.ts` plus the GAP_CLASSES consumer files
(`tests/admin/step3Buckets.test.ts`, `tests/notify/monitorNewShowGaps.test.ts`,
`tests/notify/renderDigest.monitor.test.ts`, `tests/parser/qualityRegressionComparator.test.ts`).

### Task 5 — `test(parser)`: mutation-ledger reconciliation (spec §5, §6 T8)

`VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<scratch>/alarms pnpm vitest run
tests/parser/mutationHarness.shard{0..7}.test.ts tests/parser/mutationHarness.gates.test.ts`
(~60-75 min; alarm dumps via `tests/parser/mutation/runShard.ts:118-121`). Per spec §5:
delete EXACTLY the reported `fixedHoles` rows (expected: crew-shaped `blank-row:inject`
sites only; fix (b) graduates nothing); re-bless `driftedStale` fingerprints if any;
update the ledger header counts; re-run affected shards green before committing.

### Task 6 — `docs`: BACKLOG.md closure update (spec §8)

`BL-EXPORT-BLANK-ROW-SEGMENTATION` → PARTIALLY CLOSED (2026-07-27), residuals + probe
refutation note verbatim from spec §8. Docs-only task — declared TDD exception (no
executable behavior to test); verification recorded in the commit body:
`grep -n "PARTIALLY CLOSED (2026-07-27)" BACKLOG.md` returns the updated status line, and
`grep -c "BL-EXPORT-BLANK-ROW-SEGMENTATION" BACKLOG.md` is unchanged (entry updated in
place, not duplicated).

### Task 7 — close-out (pipeline Stage 4)

Invariant-8 dual-gate first: `/impeccable critique` AND `/impeccable audit` on the
affected diff (trigger: the `_families.ts` edit), P0/P1 fixed or DEFERRED.md-logged.
Then full local suite (`pnpm test`), typecheck, whole-diff Codex adversarial review
(fresh-eyes, REVIEWER ONLY) to APPROVE, push, PR, real CI green (including the
mutation-harness PR run), `gh pr merge --merge`, fast-forward main to `0  0`.

## Anti-tautology audit (writing-plans rule)

Task 2 asserts markdown structure and DERIVES the OLD-tab fingerprint by recomputing the
hash from emitted region bytes; the T2 golden is captured from the PRE-change exporter
(different code than the assertion target). Task 3/4 assert on
`parseSheet().warnings` filtered by code — the data source, not rendered output. T9
derives split sites from the corpus, not a hardcoded count. T10 asserts helper return
values with a negative control. Task 5 deletes only reconciliation-reported rows. No
snippet bodies are embedded (signatures + exact assertions in prose), so the
snippet-typecheck rule is satisfied vacuously; test files typecheck at their red-first
commits.
