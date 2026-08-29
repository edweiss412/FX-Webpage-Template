# Closeout — the three wave codes get a cell link

Sibling of `docs/superpowers/plans/2026-08-29-ref-error-cell-anchors.md`. Spec:
`docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md`. Branch
`feat/ref-error-cell-anchors`, worktree `/Users/ericweiss/FX-worktrees/reflink`.
Implementer: the Opus pane (arc-reflink), account3, takeover of the spec+plan pane's
worktree. **bl-orch alone merges.**

## 1. What shipped

Six commits, one per plan task plus two closeout repairs:

| commit | task |
| --- | --- |
| `62a8f6771` | Task 1 — `blockMarkdown`, the one per-block renderer |
| `8868ce993` | Task 2 — position-reporting scanners under the three emitters |
| `d7ce254fd` | Task 3 — `waveCodeAnchors`, the replay and the ordinal pairing |
| `c0763f1ec` | Task 4 — the router branch, the grain rule, `synthOpts` at both call sites |
| `ab664186e` | Task 5 — the cell line on both surfaces |
| `5886d9c9c` | closeout — the impeccable wrap repair |
| `32cc1ad2f` | closeout — the line-keyed censuses the new lines moved |
| `70585f0b4` | closeout — this document |
| `651d2d324` | closeout — conditional quoting on the cell reference (bl-orch ruling) |
| `f0bf67c47` | closeout — census relocations after the quoting import, one fence waiver |
| `700f2ab87` | closeout — the outline-residue row the same import moved |

Every task was red-then-green on the SAME command, with the red run's decisive line in
the commit body (plan invariant 1).

## 2. Acceptance criteria

| AC | Discharged by | State |
| --- | --- | --- |
| AC-1 | T3 (fintech five cells, consultants six, east-coast none) + T6 (both surfaces) + the live check in §5 | see §5 |
| AC-2 | Task 1 byte pin, Task 2 emitter equivalence, the harness run in §4 | see §4 |
| AC-3 | Task 3: corpus, variants (a)-(f), refusals, positive hand-built arms | green |
| AC-4 | Task 4: `waveCodesNoSourceCell.test.ts` deleted, `waveCodesSourceCell.test.ts` pins the branch, the fallthrough order, the ratified fallback and the grain rule over all 29 members of `CELL_ANCHORED_CODES` | green |
| AC-5 | §3 below | green |
| AC-6 | §12 below | green |
| AC-7 | §6 below | see §6 |

## 3. Unchanged-set check (AC-5)

```
$ git diff origin/main...HEAD --stat -- lib/parser/dataGaps.ts \
    lib/sheet-links/buildSheetDeepLink.ts lib/messages \
    tests/parser/_warningCodeAnchor.ts \
    docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md
 lib/sheet-links/buildSheetDeepLink.ts | 8 +++++---
 1 file changed, 5 insertions(+), 3 deletions(-)
```

The one hunk is the `scope` doc comment naming the second raw-workbook scanner. No
membership set, no catalog row, no allowlist, no §12.4 prose changed.

## 4. Parser mutation harness (AC-2) — discharged as EQUALITY against main

The parser jobs do not run on pull requests (`.github/workflows/mutation-harness.yml`: the
parser and source shard jobs carry `if: github.event_name != 'pull_request'`, and the PR
path filter names no parser module), so the arc dispatches the workflow explicitly.

| | run | head | outcome |
| --- | --- | --- | --- |
| this branch | `33272516851` (`workflow_dispatch`) | `70585f0b4` | all 8 parser shards fail |
| main, control | `33253670579` (`schedule`) | `e7751f61d` | all 8 parser shards fail |

**The harness is already red on main, at this branch's exact merge-base.** `e7751f61d` is
`git merge-base origin/main HEAD`; main's own scheduled run on that commit fails the same
way, and the preceding scheduled run (`33202704320`, 2026-08-28) failed too. The failure is
`AssertionError: DRIFTED fingerprints`.

**So AC-2 is discharged as equality, not as green**, on bl-orch's ruling: an inherited red
is not this arc's regression, and what must be shown is that the diff moved nothing the
harness measures. That is settled by comparison, not by reading. The differential is
committed beside this plan so it can be re-run and checked:
`docs/superpowers/specs/probes/2026-08-29-harness-differential.{sh,awk}.txt` with its
`.report.txt`.

Per shard, three independent numbers agree — vitest's OWN declared `driftedAlarms` length
(`expected [ …(74) ] to deeply equal []`), the size of the extracted record set, and set
equality against main:

<!-- prettier-ignore -->
```
shard 0: vitest=74  extracted=74  drift=SAME
shard 1: vitest=77  extracted=77  drift=SAME
shard 2: vitest=162 extracted=162 drift=SAME
shard 3: vitest=80  extracted=80  drift=SAME
shard 4: vitest=105 extracted=105 drift=SAME
shard 5: vitest=70  extracted=70  drift=SAME
shard 6: vitest=80  extracted=80  drift=SAME
shard 7: vitest=143 extracted=143 drift=SAME
```

Pooled across the eight: **791 drifted records, and the branch set and the main set are
identical** — same records, same hashes, same per-operator breakdown
(`blank-row` 489, `header-typo` 121, `merged-cell` 116, `section-reorder` 54,
`column-shift` 11) and same kind breakdown (`wrong` 774, `text_drift` 13, `signal_loss` 4).
Shard summaries match on every field once the wall-clock duration is stripped, which is the
one field that legitimately differs between two runs of identical code: shard 0 reads
`DONE 12712 mutants — alarms=177 cosmeticViolations=0 noOps=0` on both sides.

`cosmeticViolations=0` and `noOps=0` on every shard, both sides, are the load-bearing
numbers beside the equality: no mutant became a no-op and none drifted cosmetically, so the
Task 2 scanner/emitter split changed neither what the detectors emit nor how the harness
classifies it. `parser-gates` and `source-gates` both concluded success on this branch's run.

**The drifted operators include the shapes these codes detect, and that strengthens the
control rather than weakening it.** `merged-cell` (116) is the fused-row shape and
`column-shift` (11) is the leading-column shape — the very families `ROW_CELLS_FUSED` and
`LEADING_COLUMN_AUTOCORRECTED` exist for. Had they been absent, the equality would only have
shown that unrelated operators were untouched. Because they are present in the drift AND
identical between the two runs, the comparison covers exactly the surface this arc edited.

**Correction, recorded because a review caught it.** Diff round 2 found this section's first
draft materially inaccurate: the extractor was a block parse that also swallowed vitest's
source excerpts (`63|     ).toEqual([]);`), which inflated the totals to 826 and truncated
the operator list to three, on the strength of which the draft asserted that no drifted
operator concerned fused rows or a leading column. That assertion was false. The repair is
in the committed `.awk`: match the record SHAPE anywhere in the log rather than parsing a
block — the log prints the list twice, once plainly and once inside vitest's diff, and the
runner wrap-truncates a few lines — then require a full-width hash and dedupe. The rebuilt
extractor reproduces vitest's own per-shard length on all eight shards, which is the check
the first draft never had. The equality conclusion was correct in the first draft and is
unchanged; the numbers and the operator account behind it were not.

If PR #945 merges before this branch does, its branch regenerated the ledger and has a green
harness run (`33274539375`); a ledger-seam merge of main would inherit that ledger, and a
re-dispatch on the merged head should then be GREEN, superseding this equality evidence.
Whichever actually fires is recorded here with its run id.

## 5. Live check (AC-1, second half) — AC-1-LOCAL, deploy half DEFERRED-BY-QUOTA

**The branch preview never built.** Vercel's status on head `70585f0b4`:

<!-- plan-fences: ignore FENCE_EM_DASH — verbatim Vercel status text; the em dash is inside the description string the API returned, so editing it would falsify a pasted record -->

```
context     : Vercel
state       : FAILURE
description : Deployment rate limited — retry in 24 hours.
targetUrl   : https://vercel.com/eric-weiss-projects?upgradeToPro=build-rate-limit
```

Vercel is not a required context and is the known account-quota red the fleet brief says
not to chase, but the plan's Step 8 rescan needed that preview. **bl-orch ruled** (option
(a), 2026-08-29): run the check LOCALLY on this branch against the REAL sheet and record
the coordinates here; the deploy half is **deferred by quota, not waived** — after merge
the validation deploy rebuilds from main, and the five coordinates are re-verified there
and reported to bl-orch for the handoff log. That is where the deploy proof actually
lives; the branch preview was only ever a proxy for it. `blockedOn` resolved on that
ruling.

**What ran.** `docs/superpowers/specs/probes/2026-08-29-ac1-live-check.probe.ts.txt`,
saved as `.ts` and run with `pnpm exec tsx`. It drives this branch's real ingestion path
end to end on live Drive bytes — `listFolder` → `fetchCurrentSheetXlsxBytes` →
`fetchSheetTitleToGid` → `synthesizeMarkdownFromXlsx` → `parseSheet` →
`attachWarningAnchors` — then prints each warning's resolved anchor, the `Sheet cell`
value the row renders, and the deep link its `Open in Sheet` carries. It opens no Supabase
client and writes nothing: the validation project is untouched, so no DB slot was taken.

**Sheet revision.** `II - FinTech Forum CTO Summit 2026`, driveFileId
`1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY`, `modifiedTime`
`2026-06-27T21:58:02.790Z` (Drive reports no `headRevisionId` for a Sheets file).

**The five live coordinates**, each `scope: "cell"`, each on its own tab and gid:

| # | Sheet cell | gid | Open in Sheet |
| --- | --- | --- | --- |
| 1 | `VENUE!A1` | 354548247 | `…/edit#gid=354548247&range=A1` |
| 2 | `CLIENT!A1` | 141155244 | `…/edit#gid=141155244&range=A1` |
| 3 | `TECH!A1` | 1871609441 | `…/edit#gid=1871609441&range=A1` |
| 4 | `VEHICLE!A1` | 1789571822 | `…/edit#gid=1789571822&range=A1` |
| 5 | `ROLE!A1` | 633442094 | `…/edit#gid=633442094&range=A1` |

`unanchored REF warnings: 0`. Five identical rows, five distinct cells, five distinct
gids, five distinct deep links — the screenshot that dispatched this arc showed five rows
with none of that. Full output in the sibling `.report.txt`.

Note that none of the five tabs is in `SOURCE_LINK_ALLOWLIST`; the links resolve because a
`scope: "cell"` anchor bypasses it, which is the 2026-08-27 ratification this arc relies on
and does not change.

## 6. Suites, local

- **DB-free half** — `pnpm heavy pnpm vitest run --project parallel` (the CI-enforced
  no-database project, `unit-suite-nodb`), on the final head: **1044 files passed, 16310
  tests passed**, 2 files / 17 tests skipped, **zero failures, exit 0**.
- **The four serial-project files this plan touches**, by explicit list (each client-free,
  none reads `TEST_DATABASE_URL`): `perShowActionableRenderControls`,
  `perShowActionableTransitions`, `sectionWarningModel.autocorrect`,
  `attachWarningAnchors` → **170 passed**.
- **Pre-push set, derived from `.github/workflows/quality.yml`** (its `quality` job runs
  exactly `pnpm lint`, `pnpm typecheck`, `pnpm format:check`): lint **0 errors**, 76
  warnings, all pre-existing and none in this diff; typecheck clean; format check clean.

No DB slot was taken: nothing in this arc's verification needs one, and the live check in
§5 opens no client either.

### The census tax, recorded because it cost two commits

Seven line-keyed structural registries record a `file:line` and are walked from disk, so
each one moves whenever anything is inserted above its row in the same file. This arc
inserted twice into `components/admin/wizard/step3ReviewSections.tsx` — the warning row's
cell line (+43) and later the `sheetCellReference` import (+1) — and once into
`lib/sync/runScheduledCronSync.ts` (+4), which moved rows in `controlOutlineScan`,
`subtleInteractiveExemptions`, `tapTargetCensus`, `_metaControlOutlineResidue`,
`_metaRenderFaultMarking`, `alertProducerScope` and the sheet-link consumer census.

Every relocation was made BY IDENTITY on the live tree — the scanner's own report of the
live site, or the element's unique testid or opener — never by adding a delta, which is the
convention each of those files states in its own comment trail. Three of them also carried
prose that had already drifted from their own row; that is recorded in the commits rather
than quietly overwritten.

Two adjacent guards fired for reasons that were not line drift: `_metaServerTimeGuard`'s
derived lib population gained exactly one module (`lib/sheet-links/sheetCellReference.ts`,
a pure formatter with no clock read), and the sheet-link destination census counted a
scratch `.claude/live-ac1.ts` as an uncensused consumer, because that census walks the
filesystem and `.claude/` is inside it. The probe now lives in the corpus with a `.ts.txt`
extension, which keeps it out of every source scan.

One reading correction worth keeping: `_metaScratchRootCleanup` and
`_metaControlOutlineResidue` were genuine load flakes on an earlier run (both green
standalone), and after the quoting fix the residue suite was really red while the
scratch-root suite was a cascade of it — its premise is that the subject suites it shells
out to pass. The load-flake rule (a red is a flake only after a standalone rerun passes)
is what separated the two cases, and it separated them correctly both times.

## 7. Documented limits carried from the spec

Spec §8 records six. Two are the wave arc's premise defect and are **reported to bl-orch
in the handoff rather than filed** (process mint freeze; the disposition is a product
call outside this arc):

- **`ROW_CELLS_FUSED` is unreachable from this exporter.** Rectangular rows, padded to
  block width, so no rendered row is ever one cell short of its section's modal.
- **`LEADING_COLUMN_AUTOCORRECTED` is unreachable from this exporter.** Settled by probe
  during the plan's first review round (`docs/superpowers/specs/probes/2026-08-29-leading-column-reachability.*`,
  seven constructed shapes, zero warnings).

**bl-orch ruled 2026-08-29:** this is a DOCUMENTED LIMIT and no ledger row is minted.
Spec §8 plus the committed probes IS the record, and the worst case is an inert capability
— the codes never fire from this exporter, so their anchors never render, and nothing a
user sees goes wrong. That is exactly the conservative-worst-case class the filing bar
demotes. bl-orch surfaces it to Eric as a passive product question.

Both codes keep their branch, scanner and pairing for shape parity with
`REF_ERROR_LITERAL`, at the cost of a branch line each. Neither is exercised by a
workbook: their scanners are covered by hand-built markdown (Task 2) and their pairing by
hand-built sites (Task 3's T4 positive arms). The corpus premise in T1 fails loudly if
either ever starts firing.

## 12. UI quality gate (invariant 8)

Both halves ran as isolated sub-agents with cwd pinned to the worktree, each with the
canonical v3 setup gates FIRST: the `impeccable:impeccable` skill, its `context.mjs`
context load (PRODUCT.md + DESIGN.md), then the register reference read. Both read
**`reference/product.md`** — this is internal admin tooling (the onboarding wizard's
step-3 card and the admin show page), not a brand surface. Scope for both:
`git diff origin/main...HEAD -- components/`, two files, one added element each.

The **impeccable critique** half reported `⚠️ DEGRADED: single-context` (a critic
subagent runs assessments inline; its `detect.mjs` pass did run), which is why the marker
below reads `critique=RAN-DEGRADED`. The **impeccable audit** half ran undegraded and
scored Audit Health 18/20 (a11y 4, perf 4, responsive 3, theming 4, anti-patterns 3).

**P0: none from either half. P1: none from either half.**

| # | half | tier | finding | disposition |
| --- | --- | --- | --- | --- |
| 1 | critique P2, audit P3 | P2 | The published band copied `detailBand`'s plain wrapper, so its mono value had no wrap affordance. `${title}!${a1}` has no break opportunity at its join and a tab title is unbounded sheet data, so a long coordinate overflowed a 390px condensed card. Both halves found it independently, and both cited the file's own comment saying `fieldBand` and `candidateBand` carry `min-w-0` + a break class for exactly this. | **FIXED** in `5886d9c9c`: `min-w-0 flex-wrap` on the wrapper, `shrink-0` on the eyebrow, `min-w-0 wrap-break-word` on the value. `wrap-break-word` rather than the critique's suggested `break-all`, so the value wraps the same way as its wizard twin. |
| 2 | audit P2 | P2 | `${title}!${a1}` is unquoted, so a space-bearing tab title renders `PULL SHEET!A1`, which fails if typed into the Sheets name box — the exact use the spec's no-quotes decision cites. Reachable: `PULL SHEET` is allowlisted and a scoped anchor is trusted on any tab. | **FIXED** in `651d2d324`, on bl-orch's ruling. I escalated rather than silently amending a ratified section (invariant 7); bl-orch ruled that §3's ratified OUTCOME is a paste-able reference, that unquoted defeats it, and that the mechanism serving a ratified outcome is the orchestrator's call. New `lib/sheet-links/sheetCellReference.ts` quotes only when A1 notation needs it, doubling an internal apostrophe; a bare tab stays bare, so no corpus row changes. Spec §3 amended in the same commit and marked bl-orch-ruled. Tests cover `PULL SHEET` and an apostrophe tab on both surfaces; three mutants (always-bare, always-quoted, apostrophe-not-doubled) all killed. |
| 3 | critique P2, audit P3 | P2 | The eyebrow hardcodes `text-warning-text` while the component takes `tone` and swaps amber → `text-text-subtle` elsewhere, so on the IGNORED list (`tone="muted"`) a dismissed row shows live-warning amber on a sunken plate. Contrast measured fine (8.74:1 light, 14.18:1 dark); the break is hierarchy. | **NOT FIXED — pre-existing, out of scope.** The critique itself notes it is pre-existing on three sibling bands, so the class repair touches four eyebrows including shipped ones. That is class-sweep exception (c): a redesign of a surface this PR does not otherwise touch. Recorded here rather than filed, per the mint freeze. |
| 4 | critique P3 | P3 | The guard accepts any colon-free string as `a1`, so an unvalidated jsonb value could render as a coordinate. | **NOT FIXED.** Spec §3 ratified this guard exactly and bl-orch's ruling on #2 was scoped to the TAB half of the reference, not the `a1` half. A P3 whose worst case is a malformed coordinate rendered beside a link that already carries the same value; recorded here as a documented limit rather than filed, per the mint freeze. |
| 5 | audit P3 | P3 | `text-warning-text` on `bg-surface-sunken` has no DESIGN.md §1.2 contrast row; the audit measured it (8.74:1 / 14.18:1, AAA) and calls it the fourth unpinned instance. | **NOT FIXED — pre-existing class.** Same disposition as #3. |
| 6 | audit P3 | P3 | `items-center` on a 10px eyebrow beside a 12px mono value; `items-baseline` sets better. | **NOT FIXED.** The critique explicitly says "family-wide; don't change this band alone". |

Nothing was deferred to `DEFERRED.md`: no P0 or P1 exists to defer, and the P2/P3
dispositions above are either fixed in-branch (two of them) or pre-existing class work the
mint freeze keeps out of the queue.

The gate ran on the diff BEFORE the two repairs. Both repairs are inside the elements the
gate examined and were made ON its findings, so neither opens a surface it did not see;
the whole-diff cross-model review then covers them, which is why they landed before the
first dispatch rather than after.

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=0 dispositions=none
