# Probe — why 17 mutation sites newly survive silently after the near-miss detector

**Date:** 2026-08-16 · **Branch:** `feat/mutation-section-order` · **Status:** settled by measurement

## Why this exists

The mutation harness classifies a red run into four buckets, and `newHoles` carries a hard
instruction in the assertion itself (`tests/parser/mutationHarness.shard*.test.ts:50`):

> NEW untested holes — REGRESSION (a parser change stopped catching these mutants) … do NOT
> re-bless, investigate the parser change that stopped catching these mutants.

The field near-miss detector's first full harness run returned 17 of them. Seventeen ledger rows
written on the strength of "the quieting probably explains it" would be exactly the re-blessing
that instruction forbids. This is the investigation.

## What the buckets actually said

One collected run (`COLLECT_MUTATION_ALARMS`, 8 shards, 1,019 alarms) reconciled against the
untouched `d3bbabeda` ledger of 1,088 rows:

| bucket | count | by operator |
|---|---|---|
| `newHoles` | 17 | blank-row 7, header-typo 9, section-reorder 1 |
| `fixedHoles` | 86 | blank-row 49, header-typo 10, merged-cell 3, section-reorder 24 |
| `driftedAlarms` | 1002 | every operator |
| `driftedStale` | 1002 | every operator |

Two things in that table are the arc's real result, and neither was predicted by the plan.

**The closure is 86, not 10.** The wave plan named ten `section-reorder` ids to delete. The
harness's own `fixedHoles` set holds 24 within that operator — the plan's ten are a strict
subset — plus 62 more across three operators the plan never mentioned. `knownHoles.ts` already
carried this rule from branch 4 ("the correct shrink is the harness's own `fixedHoles` set …
sizing a shrink by an operator's row count silently asserts the fix closes every row of that
operator"); this arc re-learned it by shipping an authored id-set and watching five shards go red.

**1,002 of 1,088 fingerprints moved.** The old positional sweep emitted inside `parseVenue`'s
scope window on nearly every document, so its warnings were part of nearly every mutant's redacted
signal. Removing them re-fingerprints almost the whole ledger. That is drift, which the harness
documents as "benign IFF the output change was intentional" — and it is the ratified quieting
(spec §1.1 item 2), so the ledger is REGENERATED from the alarms rather than edited.

## The `newHoles` investigation

### First hypothesis, and its refutation

The obvious guess: each of the 17 mutations used to be caught because it removed or added an
`UNKNOWN_FIELD` warning, and now nothing marks it.

Probe: `2026-08-16-newhole-mechanism-probe.ts`, run on the arc branch. For each site it applies
the mutation, parses baseline and mutant with the CURRENT parser, and diffs the warning-code
multisets.

**Result: 0/17 held.** Every site came back `SILENT_WRONG` with `removed: (none)` or with an
unrelated code removed (`SECTION_HEADER_NO_FIELDS`, `ROOM_HEADER_SPLIT_AMBIGUOUS`,
`HOTEL_GUEST_SPLIT_AMBIGUOUS`). That refutation is a probe defect, not a parser finding: the
probe compared baseline-vs-mutant on ONE side of the change, which measures what a hole IS, not
what made it new. Recorded because the corrected probe below is only trustworthy against the
wrong one it replaced.

### The measurement that settles it

The pre-arc side needs the pre-arc parser, so the second half runs on a detached worktree at
`origin/main` (`prearc-probe.ts`, reproduced in this directory's sibling probe file's header).
The ledger is the authoritative pre-arc record — a site absent from `RAW_HOLES` did not alarm
before, by construction — so the open question is only the mechanism.

**Result: all 17 were `SIGNALED` pre-arc**, meaning the mutation produced a signal the baseline
did not, which is why none of them was a hole. And in all 17, that signal was the positional
sweep:

- **14 sites** by a changed `UNKNOWN_FIELD` COUNT between baseline and mutant. Examples:
  `header-typo:2026-05-fintech-forum-cto-summit:B9:L81:X0` went 0 → 111;
  `blank-row:remove:2025-04-asset-mgmt-cfo-coo:B2:L36:Xgap` went 42 → 53;
  `header-typo:2024-05-east-coast-family-office:B3:L16:X0` went 4 → 9. A blank-row removal or a
  header typo shifts which rows fall inside the scope window, so the count moves.
- **3 sites** by a changed MESSAGE at an unchanged count of 119 — the three
  `2025-10-consultants-roundtable` header typos at B27, B38, B39. The typo replaced one already-
  flagged label with another, so the count held while the text moved:

  ```
  UNKNOWN_FIELD: Unrecognized venue row label: 'EGNERAL SESSION - GRAND BALLROOM A/B'
  UNKNOWN_FIELD: Unrecognized venue row label: 'dAditional Room Name(s)'
  UNKNOWN_FIELD: Unrecognized venue row label: 'dAditional Room Setup'
  ```

  The oracle's `newSignalFired` compares (code, message) pairs, not counts, which is why these
  three scored `SIGNALED` on an identical multiset. A count-only criterion would have missed
  them and left three sites unexplained.

## What this means, and what it does not

**It is the ratified quieting's measured cost, not a parser bug.** The old sweep flagged ANY
unrecognized venue row, so a header typo inside a venue block always produced a new message —
which made the mutant visible for free, as a side effect of a warning that fired on 394 corpus
rows and was retired precisely because most of them were noise. The content-keyed detector
deliberately does not flag `'EGNERAL SESSION - GRAND BALLROOM A/B'`: it is not a near-miss of a
field the sheet shows.

**The three transposition typos are the live instances spec §9 asked for.** `'dAditional Room
Name(s)'` IS one keystroke from `'Additional Room Name(s)'`, and the detector misses it because
spec §1.1 item 4 ratifies no edit-distance fuzzing in v1 — with edit distance named as a
documented extension in §9, "admissible later only with a live instance". These are those
instances, produced by the harness rather than imagined. They do not change v1's scope; they
change what a v2 proposal has to argue from.

**The 17 rows are ledgered with this mechanism**, under their existing operator findings (`#5`
for header-typo, `#10` for blank-row, `BL-MUTATION-SECTION-ORDER` for the one section-reorder
row), not under a new blanket. The ledger's contract is "known silent holes = current parser
reality"; these are now part of that reality, and the header comment above `RAW_HOLES` carries
the pointer back to this file.

## Reproducing

```
# post-arc half, on the branch
pnpm exec tsx docs/superpowers/specs/parser/probes/2026-08-16-newhole-mechanism-probe.ts

# pre-arc half
git worktree add --detach ../nearmiss-prearc-probe origin/main
ln -s "$PWD/node_modules" ../nearmiss-prearc-probe/node_modules
# copy the probe, swap NEW_HOLES' criterion to the pre-arc verdict + UNKNOWN_FIELD count
```

The collected-alarm reconciliation is pure set algebra over `(siteId, kind, fingerprint)` with a
`(siteId, kind)` partition key — the same eight lines as `reconcileLedger`
(`tests/parser/mutation/knownHoles.ts:52`) — so any ledger revision can be scored against a single
2-hour run without re-running it.
