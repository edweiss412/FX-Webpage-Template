# AC coverage arm — draft-time measurements

Every number in [`../2026-08-25-planlint-ac-command-observability-design.md`](../2026-08-25-planlint-ac-command-observability-design.md) comes from one tracked generator, [`scripts/2026-08-25-ac-coverage-prototype.mjs`](./scripts/2026-08-25-ac-coverage-prototype.mjs). Spec review round 2 finding 4 is why it is tracked: a measurement whose generator is untracked cannot be reproduced before implementation.

**The generator was rewritten onto remark/mdast at round 3.** Three consecutive rounds each found a defect in its hand-rolled markdown table reader, and a fourth was self-found; the repo's ratified answer to that class is that grammar questions go to the parser ([`../../2026-08-01-ledger-guard-mdast-rewrite-design.md`](../../2026-08-01-ledger-guard-mdast-rewrite-design.md) §1.1 item 2). The Python predecessor is deleted; its defect history is kept in the new file's module docstring, because each defect it carried is one the spec would otherwise have shipped.

The prototype is not the shipped arm. In the shipped design the ADAPTER parses and injects a small view, so `lib/specLint/` keeps its zero-third-party-import property.

**Run 2026-08-25 on `feat/planlint-ac-command-observability` at `69eab1e9ad9eee48c817fc9eaeec944b32bde236`.**
Every transcript below was produced at that commit, and the numbers describe THAT tree. The corpus this
generator measures is the live plan corpus, so it moves: an earlier draft of this record carried
`929/34/34/24/1`, `11 tables/48 hard`, `929/7551` and `572` with nothing immutable saying which tree
produced them, which is precisely the population the probes README protects — a figure asserting a
property of the live tree with no anchor. Whole-diff review round 1 caught it. The deltas below are
corpus growth, not generator regression, and pinning the rev is what makes those two distinguishable.

Transcripts below are verbatim.

## Q1. Is the AC-table grammar stable enough to key an arm on?

No. Thirty-six AC coverage tables, thirty-five distinct header rows. Two tables in the plan corpus use the fixture's header — this arc's own plan adopted it, which is why the design keys on a declaration and not on a header name.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs census
total markdown tables in plan corpus: 936
AC coverage tables:                   36
distinct header rows among them:      35
distinct enclosing headings:          26
column counts observed:               2 to 6
tables in the PLAN CORPUS using the fixture's exact header: 1
```

## Q2. Does the arm reproduce the three review rounds it was filed for?

Partly, and the spec's section 4 states which part. The four hard findings at `173bfccfe` are AC-3, AC-5, AC-14 and AC-15 — THREE of r2 F4's four, plus the instance r3 F5 raised a round later. r2 F4's fourth (AC-12) is documented limit L-1 and r4 F2 is L-2, so two of the six incidents are accepted misses. The counts are unchanged across every repair round, including the mdast rewrite. Every row is a BLOB id, including the last: it read `HEAD` until whole-diff review round 1, and `HEAD` names a different blob after every commit — `48926fa06` is that file at this record's pinned commit, re-verified at `rows=16 0 hard, 0 advisory` by the shipped arm rather than carried forward.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs blobs <dir of the five blobs>
173bfccfe: rows=16 4 hard, 0 advisory
    [191,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"task commits carry the outputs\""]
    [193,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"both red commands above\""]
    [202,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"adapter suite + meta-test\""]
    [203,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"both red commands\""]
b1db667e0: rows=16 1 hard, 0 advisory
    [307,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"both red commands above\""]
f921a138b: rows=16 0 hard, 0 advisory
b3705cebd: rows=16 0 hard, 0 advisory
48926fa06: rows=16 0 hard, 0 advisory
```

## Q3. Does every plant move the criterion, and does no correct form?

Yes. Seven of the nine plants are review findings kept as regression cases: (c) and (d) from round 1, (c2), (e) and (f) from round 2, (a2) and (g) from round 3.

`f_prose_in_a_row_without_leading_pipe` removes the leading pipe AND makes the command cell prose. Removing the pipe alone moves nothing, because the row still holds a valid command, so that plant would have been decoration.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs plants
unplanted: rows=16 0 hard, 0 advisory
a_prose_cell: rows=16 1 hard, 0 advisory
    [365,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"both red commands above\""]
a2_comment_only_span: rows=16 1 hard, 0 advisory
    [365,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"# both red commands above\""]
b_pin_dropped: rows=16 0 hard, 1 advisory
    [378,"ADVISORY","AC_COMMAND_PIN_UNOBSERVED","tests/paneCompaction/driver.test.ts:72"]
c_later_span_broken: rows=16 1 hard, 0 advisory
    [379,"HARD","AC_COMMAND_UNPARSABLE","\"pnpm vitest run 'tests/paneCompaction/adapter.test.ts\""]
c2_FIRST_span_broken: rows=16 1 hard, 0 advisory
    [379,"HARD","AC_COMMAND_UNPARSABLE","\"pnpm vitest run 'tests/paneCompaction/authorization.test.ts\""]
d_superstring_appended: rows=16 0 hard, 1 advisory
    [378,"ADVISORY","AC_COMMAND_PIN_UNOBSERVED","tests/paneCompaction/driver.test.ts:72"]
e_superstring_prepended: rows=16 0 hard, 1 advisory
    [378,"ADVISORY","AC_COMMAND_PIN_UNOBSERVED","tests/paneCompaction/driver.test.ts:72"]
f_prose_in_a_row_without_leading_pipe: rows=16 1 hard, 0 advisory
    [369,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"both red commands above\""]
g_backslash_parity: rows=16 1 hard, 0 advisory
    [368,"HARD","AC_COMMAND_CELL_NOT_RUNNABLE","\"`echo a\\\\\""]
```

## Q4. What would the arm report if the convention spread across the corpus?

Thirteen tables carry a command-shaped last cell in at least 80 percent of their rows. Six are v1-era handoffs whose last column is a Notes column; declaring one is a mis-declaration under the spec's L-4, not a defect.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs audit
v1-era handoff tables: 6 tables, 42 hard
2026-08 plan tables:   7 tables, 7 hard
total:                 13 tables, 49 hard
2026-08 findings, itemised:
  docs/superpowers/plans/2026-08-15-help-refanchor-a11y/closeout.md L21 HARD AC_COMMAND_CELL_NOT_RUNNABLE "worktree-only; conventional commits; invariant-12 marker riding the br"
  docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md L844 HARD AC_COMMAND_CELL_NOT_RUNNABLE "folded into the two halves' own suites as their RED cases rather than "
  docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md L849 HARD AC_COMMAND_UNPARSABLE "pnpm spec:lint <doc>"
  docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md L369 HARD AC_COMMAND_CELL_NOT_RUNNABLE "suite summary line"
  docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md L378 HARD AC_COMMAND_CELL_NOT_RUNNABLE "exit code"
  docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md L385 HARD AC_COMMAND_UNPARSABLE "expect(major).toBe(4)"
```

## Q5. What does the corpus look like to the parser?

Every pipe, whitespace and backslash question the earlier hand-rolled reader got wrong is remark's to answer. What remains worth counting is the population, and the one structural fact the design must handle: a document may declare more than one AC table.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs hazards
tables in the plan corpus, per remark:        936
data rows across them:                        7612
documents carrying MORE THAN ONE AC table:    1
   docs/superpowers/plans/ci/2026-08-20-browser-child-lifetime.md (2)
every pipe/whitespace/backslash question above is remark's, not this arm's
```

## Q6. Does any live `red=` command begin with a dash?

No, so the `--` repair to `scripts/spec-lint.ts:864` fixes a latent defect rather than a firing one. The rev is pinned to a SHA, not to `origin/main`. Two separate traps sit here. `git grep` with no rev at all reads the index and the worktree, so a staged-but-uncommitted file moves the answer — that is what produced round 3's stale 574 against the 572 measured at the time. But naming `origin/main` does not fix it either: a remote ref is not an anchor, it is repointed by every merge, and this record named one until whole-diff review round 1. The count below is at the commit in this record's header.

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs markers 69eab1e9ad9eee48c817fc9eaeec944b32bde236
rev: 69eab1e9ad9eee48c817fc9eaeec944b32bde236
red= markers in tracked markdown: 587
  beginning with a dash:          0
```
