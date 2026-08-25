# AC coverage arm — draft-time measurements

Every number in [`../2026-08-25-planlint-ac-command-observability-design.md`](../2026-08-25-planlint-ac-command-observability-design.md) comes from one tracked generator, [`scripts/2026-08-25-ac-coverage-prototype.py`](./scripts/2026-08-25-ac-coverage-prototype.py). Spec review round 2 finding 4 is why it is tracked: a measurement whose generator is untracked cannot be reproduced before implementation, and that round's marker-count drift is what an unreproducible transcript looks like.

The prototype is not the shipped arm. Its faithfulness and its own defect history are stated in its module docstring and in the spec's section 5.

Transcripts below are verbatim, run at commit `a511442ed` plus this arc's round-2 repair.

## Q1. Is the AC-table grammar stable enough to key an arm on?

No. Thirty-four AC coverage tables, thirty-four distinct header rows.

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.py census
total markdown tables in plan corpus: 933
AC coverage tables:                   34
distinct header rows among them:      34
distinct enclosing headings:          24
column counts observed:               2 to 6
tables in the PLAN CORPUS using the fixture's exact header: 1
```

## Q2. Does the arm reproduce the three review rounds it was filed for?

Yes: r2 F4's four cells at the authored blob, r3 F5's one remaining cell after the r2 repair, and clean at every point the arc was clean. r4 F2 is not reproduced, for the reason stated as the spec's L-2.

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.py blobs <dir of the five blobs>
173bfccfe: rows=16 4 hard, 0 advisory
    (191, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'task commits carry the outputs'")
    (193, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'both red commands above'")
    (202, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'adapter suite + meta-test'")
    (203, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'both red commands'")
b1db667e0: rows=16 1 hard, 0 advisory
    (307, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'both red commands above'")
f921a138b: rows=16 0 hard, 0 advisory
b3705cebd: rows=16 0 hard, 0 advisory
HEAD: rows=16 0 hard, 0 advisory
```

## Q3. Does every plant move the criterion, and does no correct form?

Yes. Four of the seven plants are review findings kept as regression cases.

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.py plants
unplanted: rows=16 0 hard, 0 advisory
a_prose_cell: rows=16 1 hard, 0 advisory
    (365, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'both red commands above'")
b_pin_dropped: rows=16 0 hard, 1 advisory
    (378, 'ADVISORY', 'AC_COMMAND_PIN_UNOBSERVED', 'tests/paneCompaction/driver.test.ts:72')
c_later_span_broken: rows=16 1 hard, 0 advisory
    (379, 'HARD', 'AC_COMMAND_UNPARSABLE', '"pnpm vitest run \'tests/paneCompaction/adapter.test.ts"')
c2_FIRST_span_broken: rows=16 1 hard, 0 advisory
    (379, 'HARD', 'AC_COMMAND_UNPARSABLE', '"pnpm vitest run \'tests/paneCompaction/authorization.test.ts"')
d_superstring_appended: rows=16 0 hard, 1 advisory
    (378, 'ADVISORY', 'AC_COMMAND_PIN_UNOBSERVED', 'tests/paneCompaction/driver.test.ts:72')
e_superstring_prepended: rows=16 0 hard, 1 advisory
    (378, 'ADVISORY', 'AC_COMMAND_PIN_UNOBSERVED', 'tests/paneCompaction/driver.test.ts:72')
f_row_without_leading_pipe: rows=16 1 hard, 0 advisory
    (368, 'HARD', 'AC_COMMAND_CELL_NOT_RUNNABLE', "'both red commands above'")
```

## Q4. What would the arm report if the convention spread across the corpus?

Eleven tables carry a code span in the last cell of at least 80 percent of their rows. Six are v1-era handoffs whose last column is a Notes column; declaring one is a mis-declaration under the spec's L-4, not a defect.

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.py audit
v1-era handoff tables: 6 tables, 42 hard
2026-08 plan tables:   5 tables, 6 hard
total:                 11 tables, 48 hard
2026-08 findings, itemised:
  docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md L21 HARD AC_COMMAND_CELL_NOT_RUNNABLE 'worktree-only; conventional commits; invariant-12 marker riding the b
  docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md L844 HARD AC_COMMAND_CELL_NOT_RUNNABLE "folded into the two halves' own suites as their RED cases rather than
  docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md L849 HARD AC_COMMAND_UNPARSABLE 'pnpm spec:lint <doc>'
  docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md L369 HARD AC_COMMAND_CELL_NOT_RUNNABLE 'suite summary line'
  docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md L378 HARD AC_COMMAND_CELL_NOT_RUNNABLE 'exit code'
  docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md L385 HARD AC_COMMAND_UNPARSABLE 'expect(major).toBe(4)'
```

## Q5. Which table-reader hazards actually occur in the corpus?

Each behaviour the spec's section 8.2.1 specifies has a count behind it.

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.py hazards
unfenced table-shaped rows in the plan corpus: 9493
  carrying an escaped pipe (\|):               75
  with leading whitespace before the pipe:     675
  with a code span containing an unescaped |:  17
```

## Q6. Does any live `red=` command begin with a dash?

No, so the `--` repair to `scripts/spec-lint.ts:864` fixes a latent defect rather than a firing one.

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.py markers
red= markers in tracked markdown: 574
  beginning with a dash:          0
```
