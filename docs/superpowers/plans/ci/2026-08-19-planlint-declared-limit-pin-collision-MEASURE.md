# Mutation measurement record — declaredLimitPins

DERIVED FROM THE RUN OUTPUT, not transcribed. This arc retired three scores before
this one; a figure typed by hand from memory is the next stale vector.

## Result

- Gate: **GREEN**
- Tests: `7 passed (7)`
- Duration: `216.94s`
- Run exit: `0`
- Unaccepted survivors: **0** (the gate reported none)

## Provenance (rule 30, amended)

A score is a pure function of SOURCE, DECLARED OPERATORS, DECIDING SUITES, and the
FIXTURES those suites read. An earlier stamp here covered source and suites only —
seven inputs that read convincingly as "the code" while omitting the registry row,
which declares the operators and the floor, and the fixtures. A stamp over a subset is
worse than no stamp, because it certifies.

The set below is DERIVED, not hand-maintained: suite paths are read out of the registry
row itself, and fixtures are expanded by the same command that stamps them.

**14 inputs stamped BEFORE and AFTER; drift: 0 (none)**

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

## What this record is for

A number that exists only in a session's context is a number somebody re-measures.
This one costs seven deciding suites per mutant, one of which walks every tracked plan
in the corpus, so it is written to the branch rather than carried in a head.
