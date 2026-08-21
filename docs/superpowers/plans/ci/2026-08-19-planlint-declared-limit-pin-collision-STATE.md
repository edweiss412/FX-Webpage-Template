# Arc state — declared-limit pin collision (PR 1)

Durable because a number living only in a session head is a number somebody re-measures.

- HEAD: `8e7158024 docs(ledger): graduate BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION and strip its marker`
- commits ahead of origin/main: 49
- ALL EIGHT TASKS COMMITTED. Ledger graduated, marker stripped, one commit before review.

## Gate result

The confirming run under the DERIVED FOURTEEN was still in flight when this was written.
The PRIOR gate run (six deciding suites) was GREEN: 7/7, exit 0, 179.61s, floor met, five
survivors all dispositioned, pair stamp reconciled 7/7 zero drift. That figure is RETIRED
for certification purposes: adding `declaredLimitPinsCli.test.ts` to `suitePaths` changed
the DECIDING SUITE SET, which retires a score exactly as a source edit does.

## Provenance stamp actually written by the run in flight (14 inputs)

| kind | blob | path |
| --- | --- | --- |
| source | `90dc65070a05` | `lib/specLint/declaredLimitPins.ts` |
| registry | `0dbe8cee5c82` | `tests/mutation/source/registry.ts` |
| ledger | `ad43d69abc69` | `tests/mutation/source/expectedLedgerKinds.ts` |
| suite | `6946923b6137` | `tests/specLint/declaredLimitPins.test.ts` |
| suite | `c91d28c101c5` | `tests/specLint/declaredLimitPinsFiles.test.ts` |
| suite | `d2e35a43182d` | `tests/specLint/declaredLimitPinsObligation.test.ts` |
| suite | `6a5991df2bda` | `tests/specLint/declaredLimitPinsWiring.test.ts` |
| suite | `fa28eccd7d5b` | `tests/specLint/declaredLimitPinsCorpus.test.ts` |
| suite | `b244adebed0d` | `tests/specLint/declaredLimitPinsCli.test.ts` |
| suite | `62a28164d74a` | `tests/specLint/_metaDeclaredLimitPins.test.ts` |
| fixture | `addfb8795142` | `tests/specLint/__fixtures__/declaredLimitPins/plan-post-step3b.md` |
| fixture | `3830d24e843c` | `tests/specLint/__fixtures__/declaredLimitPins/plan-pre-step3b.md` |
| fixture | `c144a53db913` | `tests/specLint/__fixtures__/declaredLimitPins/suite-pre-repair.txt` |
| fixture | `eeb7606426fa` | `tests/specLint/__fixtures__/declaredLimitPins/syntheticTitles.ts` |

Derived, not hand-maintained: suites read from the registry row, fixtures expanded by
the same command that stamps them, registry and ledger-kinds stamped for operators+floor.

## Five accepted survivors

THREE share ONE invariant (a LIST-form header carries no enrolled path, so a mutant that
wrongly enters the list branch records only the header line, which names nothing) — the
same invariant that made the declined-branch push deletable. TWO are namesPath sites my
own rewrite created, each with a structural proof AND an attributable probe (51,061
corpus lines with zero enrolled-path-at-index-0; 107/107 enrolled paths non-empty).
Falsifier is EXECUTABLE: `gate.ts`'s `stale-ledger-row` reds if a site stops surviving.

## Exact next step

1. `tail` the detached log (pid 45750, ppid=1); on completion run
   `scratchpad/writeMeasureRecord.py <log>` and COMMIT the MEASURE record.
2. Whole-diff review with the staged brief (`scratchpad/diff-brief-r1.md`), whose
   `GUARD SURFACE:` line needs the score filled from the MEASURE record.
3. Push, real CI green (read the twelve required contexts BY NAME off branch protection,
   not off the rollup), `gh pr merge --merge`, then `0  0`.
4. After ANY later origin/main merge: re-run set arithmetic, `0 hard` on both docs, and
   `_metaLedgerInProgress` — a merge can resurrect a row, a marker, or a waiver.

## Unexplained, deliberately

Three measurement runs died at exit 143/144. Mechanism UNKNOWN; detaching is a symptom
fix, not a proven remedy. A duration-threshold theory was refuted by this arc's own data
(`b99ao3v9o` completed at 1004.31s, exit 0). Re-diagnose from scratch if it returns.
