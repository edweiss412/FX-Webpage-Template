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

## 4. Parser mutation harness (AC-2)

_Filled at Step 7, on the pushed head._

## 5. Live check (AC-1, second half)

_Filled at Step 8, on the validation preview of the pushed head._

## 6. Suites, local

- **DB-free half** — `pnpm heavy pnpm vitest run --project parallel` (the CI-enforced
  no-database project, `unit-suite-nodb`): **1041 files passed, 16299 tests passed**,
  2 skipped files / 17 skipped tests. Two files red under load and **green standalone**
  (`pnpm vitest run tests/mutation/_metaScratchRootCleanup.test.ts
  tests/styles/_metaControlOutlineResidue.test.ts` → 115 passed), which is the fleet
  load-flake rule discharged rather than asserted: the residue suite's failure was
  `Test timed out in 120000ms` and the scratch-root suite's was a premise on its own
  child suites' exit code, both artifacts of ~9 concurrent arcs.
- **The four serial-project files this plan touches**, by explicit list (each
  client-free, none reads `TEST_DATABASE_URL`): `perShowActionableRenderControls`,
  `perShowActionableTransitions`, `sectionWarningModel.autocorrect`,
  `attachWarningAnchors` → **170 passed**.
- **Pre-push set, derived from `.github/workflows/quality.yml`** (its `quality` job runs
  exactly `pnpm lint`, `pnpm typecheck`, `pnpm format:check`): lint **0 errors**, 76
  warnings, all pre-existing and none in this diff; typecheck clean; format check clean.

No DB slot was taken: nothing in this arc's verification needs one.

## 7. Documented limits carried from the spec

Spec §8 records six. Two are the wave arc's premise defect and are **reported to bl-orch
in the handoff rather than filed** (process mint freeze; the disposition is a product
call outside this arc):

- **`ROW_CELLS_FUSED` is unreachable from this exporter.** Rectangular rows, padded to
  block width, so no rendered row is ever one cell short of its section's modal.
- **`LEADING_COLUMN_AUTOCORRECTED` is unreachable from this exporter.** Settled by probe
  during the plan's first review round (`docs/superpowers/specs/probes/2026-08-29-leading-column-reachability.*`,
  seven constructed shapes, zero warnings).

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
| 2 | audit P2 | P2 | `${title}!${a1}` is unquoted, so a space-bearing tab title renders `PULL SHEET!A1`, which fails if typed into the Sheets name box — the exact use the spec's no-quotes decision cites. Reachable: `PULL SHEET` is allowlisted and a scoped anchor is trusted on any tab. | **NOT FIXED — escalated, not silently changed.** Spec §3 pins the rendered text (`Sheet cell ` then `${title}!${a1}`, "No quotes"), and invariant 7 says the spec wins outside its three ratified amendments: open a question rather than quietly fix. Not a P0/P1, so it does not gate this arc. On the corpus every anchored tab is single-token (`VENUE`, `CLIENT`, `TECH`, `VEHICLE`, `ROLE`, `AGENDA`), so no shipped row is wrong today. Reported to bl-orch as a product question; the repair is one conditional (`/^[A-Za-z0-9_]+$/` → `'PULL SHEET'!A1`) applied in both files behind a shared helper. |
| 3 | critique P2, audit P3 | P2 | The eyebrow hardcodes `text-warning-text` while the component takes `tone` and swaps amber → `text-text-subtle` elsewhere, so on the IGNORED list (`tone="muted"`) a dismissed row shows live-warning amber on a sunken plate. Contrast measured fine (8.74:1 light, 14.18:1 dark); the break is hierarchy. | **NOT FIXED — pre-existing, out of scope.** The critique itself notes it is pre-existing on three sibling bands, so the class repair touches four eyebrows including shipped ones. That is class-sweep exception (c): a redesign of a surface this PR does not otherwise touch. Recorded here rather than filed, per the mint freeze. |
| 4 | critique P3 | P3 | The guard accepts any colon-free string as `a1`, so an unvalidated jsonb value could render as a coordinate. | **NOT FIXED.** Spec §3 ratified this guard exactly; tightening it to `/^\$?[A-Za-z]{1,3}\$?\d{1,7}$/` is a spec amendment, and the critique says so itself. Same escalation as #2. |
| 5 | audit P3 | P3 | `text-warning-text` on `bg-surface-sunken` has no DESIGN.md §1.2 contrast row; the audit measured it (8.74:1 / 14.18:1, AAA) and calls it the fourth unpinned instance. | **NOT FIXED — pre-existing class.** Same disposition as #3. |
| 6 | audit P3 | P3 | `items-center` on a 10px eyebrow beside a 12px mono value; `items-baseline` sets better. | **NOT FIXED.** The critique explicitly says "family-wide; don't change this band alone". |

Nothing was deferred to `DEFERRED.md`: no P0 or P1 exists to defer, and the P2/P3
dispositions above are either fixed in-branch or pre-existing class work the mint freeze
keeps out of the queue.

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=0 dispositions=none
