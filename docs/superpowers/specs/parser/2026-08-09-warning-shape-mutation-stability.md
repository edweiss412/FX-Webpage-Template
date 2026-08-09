# Warning shape vs. mutation stability — design amendment for the parser mutation wave

**Status:** PROPOSED (2026-08-09) · **Amends:** `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md` §4, §5, §6, §9 · **Blocks:** branches 2, 3, 4 of the wave
**Trigger:** branch 2 (`feat/mutation-ref-sub`) reached 7 rows in `newHoles`, the bucket §9 marks HARD and never deferrable, and no implementation choice removes them without also removing what makes the warning useful.

## 1. The problem, stated once

A warning this wave adds has three parts a reader can use: the **code**, an **anchor** (`blockRef.kind`, "which section"), and a **snippet** (`rawSnippet`, the offending cell's text). The harness scores a mutant by comparing baseline and mutant signal channels:

- `signalEq` — a **full deep-equal** over the whole signal channel (`tests/parser/mutation/oracle.ts:47`), so it compares the anchor and the snippet.
- `newSignalFired` — **code-count only** (`oracle.ts:51-58`), so it cannot see that an anchor became more specific.

A mutation that leaves payload identical but perturbs the anchor or the snippet therefore lands in `!signalEq && !stronger`, which the oracle names `SILENT_SIGNAL_LOSS`. **The warning still fires. Only its text moved.** The oracle has no vocabulary for that difference, and the ledger inherits the ambiguity.

This is not specific to `REF_ERROR_LITERAL`. Branch 3 (`ROW_CELLS_FUSED`) and branch 4 (`LEADING_COLUMN_AUTOCORRECTED`) both emit anchored warnings and will meet the same wall. Deciding it once, here, is cheaper than three times.

## 2. Measurement

Seven sites fail on branch 2: four `blank-row:remove` (one per `#REF!`-carrying fixture) and three `merged-cell:consultants:B37:L237:X{0,1,2}`. Each candidate warning shape was replayed against all seven, modelling the oracle exactly — `equal` = deep-equal of the warning objects, `stronger` = REF **code count** strictly up, `survives` = either.

| Warning shape | Survives |
| --- | --- |
| `kind` + `snippet` (as implemented) | **0 / 7** |
| `kind` + `snippet`, counted per occurrence | 0 / 7 |
| `kind` only | 1 / 7 |
| `kind` only, counted per occurrence | 3 / 7 |
| `snippet` only | 4 / 7 |
| no anchor (code only) | 5 / 7 |
| **no anchor, counted per occurrence** | **7 / 7** |

Two independent mechanisms, separable by the table:

1. **The anchor moves.** `blank-row:remove` fuses two sections, so a cell's section label changes (`"section"` → `"rooms"`). Dropping `kind` fixes exactly those four (`snippet only` = 4/7).
2. **The count drops.** `merged-cell` fuses two `#REF!` cells into one, and per-cell emission warns once where it warned twice. Counting per **occurrence of the literal** fixes those three — but only when occurrences are counted on the **cleaned** value, because the corpus stores the escaped form `\#REF\!` in which the substring `#REF!` does not literally appear. (A first pass at this measurement counted on the raw snippet, always matched zero, and silently reported "per-occurrence changes nothing." The corrected count is what the table shows.)

**Only the fully bare warning survives all seven.** Every shape that carries locating information fails at least one.

## 3. What is actually at stake

The seven sites are **not** cases where the parser went quiet about a corrupt sheet. In all seven the warning fires. What the oracle records is that its *text* differs from baseline — and in the `blank-row:remove` four, the mutant's anchor is arguably **better** than baseline's, naming `Rooms` where baseline named nothing.

So the ledger entry "silent signal loss" is, for these seven, a **modelling artifact**: the instrument cannot distinguish *moved* from *lost*. That does not make it harmless — a real regression would look the same — but it does mean "make the number zero" and "make the parser better" point in opposite directions here.

Against that: the anchor is what lets an operator find the offending cell in a sheet of several hundred rows. Spending it to satisfy an instrument that is measuring the wrong thing is the expensive half of the trade.

## 4. Options

**A. Bare warning (code only, per occurrence).** `newHoles` → 0. Both existing contracts survive untouched. The operator gets a warning that says a broken reference exists *somewhere in the sheet*, with no way to find it. Rejected below.

**B. Keep the anchor; record the seven as accepted ledger rows.** The warning keeps `kind` + `snippet`. Seven rows are ADDED to `RAW_HOLES`, each annotated as anchor-movement rather than signal loss. Requires amending §9's shrink-only ratchet to permit a **bounded, reviewed, annotated addition** when a new detector's informative fields move under a mutation the payload absorbs.

**C. Split the difference: drop `kind`, keep `snippet`, count per occurrence.** Measured 4/7 on `snippet only`; the remaining three are the `merged-cell` count-drop, which per-occurrence counting closes — so this lands at **7/7 while keeping the snippet**. The operator loses the section name but keeps the cell's own text, which is searchable in the sheet.

**D. Teach the oracle the difference.** Add an anchor-insensitive equality tier so "same codes, same counts, moved anchor" scores as `ABSORBED`. Correct in principle, and it is the only option that fixes the *cause*. But it edits the shared measuring instrument that every existing ledger row was scored against, which re-baselines the entire 3,701-row ledger and weakens a guard the whole wave leans on. Not on this branch.

## 5. Recommendation

**Option B**, with **D filed** for later consideration.

This reverses an earlier draft of this document, which recommended C. C is worth naming plainly: *it is the same trade as A*. Both spend `blockRef.kind` — the section name — and differ only in whether the snippet survives. The reviewer of this amendment should not read C as a middle path; on the axis that matters here, the operator's ability to locate the cell, C sits with A.

The anchor is being spent to satisfy an instrument that, at these seven sites, is measuring the wrong thing. In all seven the warning FIRES; only its text moved, and in four of them the mutant's anchor is strictly more informative than baseline's. Deleting real locating context to zero a number that is reporting an artifact is the wrong direction, and it would be repeated twice more in branches 3 and 4.

So: keep `kind` + `snippet`, and ADD the seven rows to `RAW_HOLES`, each annotated with its mechanism (anchor-moved, or count-dropped-under-fusion) and the mutant that produces it. §9's ratchet is amended to permit a **bounded, reviewed, annotated addition** under one narrow condition, spelled out so it cannot become a general escape hatch:

> A new detector may ADD ledger rows only when every added row is a site where (a) the detector's warning still fires on the mutant, (b) payload is unchanged, and (c) the only difference is in fields the detector derives from mutated text. Each row carries its mechanism and its reproducing mutant. Additions are reviewed as part of the branch's diff, and the count is stated in the PR body. Every other addition remains forbidden: a site where the warning stops firing is a regression, not an annotation.

That condition is checkable, and it does not admit the case the ratchet exists to catch — a parser change that stops catching mutants — because (a) requires the warning to still fire.

**Deferred: D.** Teaching the oracle an anchor-insensitive equality tier fixes the cause rather than the symptom, and would let these seven score as `ABSORBED` honestly. It is deferred only because it re-baselines a 3,701-row ledger mid-wave. If branches 3 and 4 each contribute their own annotated additions, that cost stops looking large by comparison, and D should be reconsidered before branch 5.

**Rejected: A and C.** Both delete locating context the operator needs, to correct a measurement error.

## 6. Consequences if adopted

- Branch 2: warning shape is UNCHANGED (`kind` + `snippet`, one per cell). Seven annotated rows are added to `RAW_HOLES`, and the branch's PR body states the count and mechanism.
- Wave spec §4: warning-shape contract stated explicitly, including that anchors are permitted to move under text-mutating operators.
- Wave spec §9: the ratchet gains the bounded-addition clause in §5 above.
- Plans 03 and 04: add a mutation-stability measurement step BEFORE the ledger shrink, so branches 3 and 4 discover this at design time rather than after a 50-minute harness run.
- §9 unchanged — the shrink-only ratchet holds, and `newHoles` stays HARD.

## 7. Open questions for ratification

1. Is the §9 amendment's condition tight enough? It is designed so a genuine regression (warning stops firing) cannot satisfy clause (a), but a reviewer should attack that directly.
2. Should the seven added rows carry a distinct `finding` value (e.g. an `ANCHOR-MOVED` marker) so a future reader can separate them from genuine holes by grep rather than by reading notes?
3. Does deferring D leave branches 3 and 4 accumulating annotated rows faster than expected? If either contributes more than a handful, D should be pulled forward.
