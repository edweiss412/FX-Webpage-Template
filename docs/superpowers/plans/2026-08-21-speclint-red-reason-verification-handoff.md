# Handoff — the unprobeable-command silent drop (`BL-SPECLINT-RED-REASON-VERIFICATION`)

**From:** the spec+plan session (arc-redreason), branch `feat/speclint-red-reason-verification`.
**To:** the implementer session. **You own implementation; this session owned spec and plan only.**

impeccable-gate: N/A — no UI surface

Nothing this arc touches is under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or
`DESIGN.md`.

## 1. What is ratified, and what is left to do

| Artifact | State |
| --- | --- |
| Spec `docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md` | **CLOSED by orchestrator ruling** at the round cap: 4 rounds, 12 findings, none refuted, no round returning APPROVE. See spec §8. |
| Plan `docs/superpowers/plans/2026-08-21-speclint-red-reason-verification.md` | **CLOSED by orchestrator ruling** at the round cap: 4 rounds, 9 findings, none refuted. DISPOSITIONED, not CONVERGED. See plan §8. ONE task in the red-contract region and one score task outside it: round 1 collapsed the partition assertion into Task 1, because a task authored afterwards would be green the moment it was written. |
| Probes `probe/population.mts`, `probe/reach.mts`, `probe/citations.mts` | Committed. Every number in the spec is produced by one of them, and the third derives the citation set rather than trusting a list. |
| Round-economy filing `docs/review-rounds/feat/speclint-red-reason-verification/e5d1d723d69c.md` | `## spec — 4 rounds` filed. `## plan — 4 rounds` filed alongside it. |
| Implementation | **LANDED at `e4de29d3d`** (PR #871). Task 1 and Task 2 are the whole set; there is no Task 3, and the earlier "Tasks 1-3" was stale from round 1's collapse. This row read **NOT STARTED** at handoff, which was true then. |

## 2. Start here, in this order

1. Read the **spec** end to end. It is canonical; the plan implements it and never overrides it. Read
   §5 (five measured refutations) and §6 (the retirement) before forming any opinion about what the
   row asked for. Three of the row's own claims are measured FALSE and the row is corrected in place.
2. Read the plan's **§4** (the TDD cycle) and **§3** (citation lifetime) before Task 1. §3 is not
   background: Task 1's own commit invalidates its own `red-target=`, and `RED_TARGET_INVALID` cannot
   see content drift.
3. Run the committed covers first, so you know what green looks like:

```
node --import tsx probe/population.mts
node --import tsx probe/reach.mts
EXPECT_ADVISORY=1 node --import tsx probe/reach.mts
node --import tsx probe/citations.mts
node --import tsx scripts/spec-lint.ts --json docs/superpowers/plans/2026-08-21-speclint-red-reason-verification.md
```

At handoff: `population` reports `none: 15`; `reach` PASSES in default mode and **must FAIL** in
`EXPECT_ADVISORY=1` mode, on all fifteen v2 lines. That failure is the acceptance criterion, not a
problem. When your implementation is correct, the second invocation passes and the first fails, and
both of those are the same fact.

`citations` passes today and MUST keep passing: it asserts that every line the documents cite still
holds what they say it holds, and this arc's own edit moves most of them. It is the closeout's
mechanism, not a courtesy check.

**`node --import tsx`, not `pnpm tsx`.** The latter needs an IPC socket a sandbox may deny, and
`reach.mts` uses the same invocation for its own child process for exactly that reason.

## 3. The things most likely to cost you a review round

**The reach is fifteen and the branch is not keyed on the wrapper.** Nine markers are
`pnpm heavy`-wrapped, which is what made the hole rule-mandated, but `collectionProbePlan` drops on
`derived.kind === "none"`, so every unprobeable v2 command lands there. Narrowing the advisory back to
the nine requires a `pnpm heavy` recognizer and is DECLINED in spec §2, on the surface whose entire
defect history is recognizer growth. Narrower in reach, wider in mechanism, is the wrong trade here.

**Do not touch the v1 exit.** The sixteen v1 heavy-wrapped markers are out of reach — though
measurement at implementation showed the reason is OWNERSHIP, not that exit: all sixteen are unowned
and never reach it. What the exit does drop is the owned v1 FIXTURE, which is what makes the
over-broad implementation fail. An implementation that "also fixes" them emits
sixteen advisories the design does not claim. What fails that is Task 1's fourth assertion row and
`probe/reach.mts`'s sixteen named v1 rows, NOT Task 2 — Task 2 is the score.

**The live marker gains the advisory.** `2026-08-17-red-verdict-capability.md:135` is `red-state=live`
and already draws `RED_ALREADY_GREEN`. It still gains `RED_PROBE_UNVERIFIED`, because the live gate in
`synthesizeCollectionFindings` guards against reading a probe RESULT and a declined derivation
produces none. Filing `none` behind the live gate is wrong and Task 1's fourth fixture catches it.

**Assert a GAIN, never an equality.** Three of the fifteen lines already carry a hard finding from an
unrelated arm (spec §1.2). A test written as "this line now holds exactly one advisory" is false at
three live markers and pushes you toward suppressing findings this change has nothing to do with.

**The closing checks run AFTER the commit, not before it.** `lint-staged` rewrites staged files on
every commit, so no pre-commit check describes the committed tree. Plan §8 orders it as a fixpoint:
format first, commit, then run `EXPECT_ADVISORY=1 pnpm probe:reach` and `pnpm probe:citations` and
re-read the prose sites on the COMMITTED tree, amending and repeating on any failure.

**Every citation into `redContract.ts` below line 605 goes stale when you implement.** The edit begins
at the type declarations, not at the drop. Measured shift: 610 to 614, 637 to 644, 717 to 721, 721 to
725. `RED_TARGET_INVALID` sees none of it, because it checks range and tracking, never content.

**Quote the instrument, do not retype it.** This arc reported the reach as 25, then 10, then 9, and it
is 15. After the first, the instrument was correct every time and the READ was wrong. A number that
has been retyped has left the instrument's custody.

## 4. NAMED RESIDUE - the one thing no review round read

**A fifth plan round was authorized and never ran.** The Codex API hit its weekly limit (through
2026-08-25) before it could be dispatched. The plan therefore closes DISPOSITIONED rather than
CONVERGED, and its closed set is handed to you rather than quietly dropped. **Attack these two in the
implementation's whole-diff review when the wall lifts:**

1. **Is the plan's §3 site list complete for the PROSE citation form?** The structured form is derived
   and checked: `pnpm probe:citations` scans the plan, the spec, and `probe/*.mts` and fails on any
   path-and-line citation into `redContract.ts` that is not a row in the plan's §0 table. Bare
   references like "line 717" carry no file and cannot be resolved mechanically, so those sites are
   listed by hand, and a hand list is exactly what was wrong before.
2. **Is the plan's §8 closing fixpoint actually closed?** Is there an ordering in which the tree that
   lands is not the tree that passed?

**Why this residue exists at all** is worth one line, because it is the arc's sharpest lesson. The
citation probe verifies that LISTED citations hold. Whether the LIST IS COMPLETE is a different claim
that the probe structurally cannot make, so it stayed judgment residue and judgment residue gets a
read. It did not get one.

Answering half of it pre-emptively found the gap anyway: the hand-written site list covered the plan
and `probe/reach.mts` and omitted the SPEC entirely, including the only citation of
`lib/specLint/redContract.ts:906`.

## 5. The spec stage closed by RULING, not by an APPROVE verdict

Four counted rounds, twelve findings, none refuted, no APPROVE. The reasoning of record is a
classification rather than a rate: the count never decayed (3, 4, 2, 3), but the last three rounds
found defects in the spec's DESCRIPTION of a repair whose MECHANISM had been stable since round 2, and
round 4 explicitly confirmed all four design claims it was pointed at.

**Three repairs ship without a review round having read them.** Spec §8 has the table. The one that
matters: `probe/reach.mts` was converted from a printer to an asserter after round 4 found it proved
nothing. Its terminal verifier is mutation, not review — three mutations kill it, and the mutation is
the repo's own convergence criterion for a guard surface. If you change that probe, re-run all three.

## 6. Enrolment, and what the closeout owes

`redContract` is already enrolled in the source-mutation registry with `scoreFloor: 0.95` and seven
`equivalent` rows, keyed at lines 37, 110, 127, 190, 191, and 257 — SEVEN keys over six lines, since
257 carries two. **Every one sits ABOVE this arc's
edit point, so none shifts** — which is why the plan's Task 2 carries no `red=` and says so
with the numbers. Editing `redContract.ts` still RETIRES the current score, so measure ONCE after the
last source-or-suite edit, re-VALIDATE all seven rows even though they are unshifted, and run
`pnpm mutation:sites` LAST before any push touching the enrolled source. `pnpm mutation:guards` is a
heavy phase and runs under `pnpm heavy`.

## 7. Where the review record lives

- Round corpus: `docs/review-rounds/feat/speclint-red-reason-verification/e5d1d723d69c.jsonl`
- Filing: the sibling `.md`, with the subject-classification signal that ended the spec stage
- Briefs: `/Users/ericweiss/FX-worktrees/_briefs/2026-08-21-redreason-*.md` (per-machine, not tracked)
- The ledger row carries all five refutations and is corrected in place, so a future reader does not
  re-derive what this arc measured.
