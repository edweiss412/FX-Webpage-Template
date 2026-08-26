# Adversarial review — plan, round 3

**Your role: REVIEWER ONLY. Do not fix issues, propose patches as commits, or imply changes you will make.**
Challenge the plan and surface findings. Fixes are the implementer session's job in a separate dispatch.
Do NOT invoke any nested cross-model review from inside this session; your verdict comes from your own
direct output.

## Subject

`docs/superpowers/plans/2026-08-26-control-outline-cover-widening.md` on branch
`fix/control-outline-cover`, worktree root is the `--cwd` you were given. Base `b30413cf5`.

Its spec is `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md`, which reached
APPROVE at spec round 5 with zero findings after eight repaired findings across rounds 1 to 4. The spec
is canonical (invariant 7) and its decisions are NOT in scope for this review: challenge the PLAN's
execution of them.

## What rounds 1 and 2 found, and what changed

Two rounds, thirteen findings, all confirmed against the live tree and repaired in `8406b0f9a` and
`edede588f`. Do not re-raise them; verify the repairs.

Round 1 (7): four invalid task markers, closed structurally by shrinking the declared region to Tasks
1 to 6 and writing what the other four owe (an observed planted defect) into each; Task 7's missing
`testMatch` wiring and its wrong harness description; Task 6's red, which already held; Task 5's stop
condition, restated against the 29 keys the command prints rather than 35 elements; Task 5's missing
`EventFilters` step; and two arithmetic defects in §4.1 and §4.4.

Round 2 (6), and the first is the one that mattered:

- **AC-9b was tautological.** A fixture asserting a planted caller `className` cannot reach the element
  passes on the BROKEN shape too, since the scanner never follows prop flow and
  `tests/styles/interactiveScanCore.test.ts:85-87` pins exactly that. AC-9b is now
  `unresolved === false` on `components/admin/telemetry/EventFilters.tsx:40`, which reds on today's
  shape AND on the `cn(base, className)` form the spec rejected, and it is observed red BEFORE the
  production edit.
- **AC-1's control** compared two paths through one changed implementation. Now two halves: a one-time
  exact comparison against the base scanner materialised from `b30413cf5`, recorded in the commit; and
  a shipped structural assertion, because an exact 362 would red on every unrelated PR adding a control.
- **AC-15** had no executable form; it now carries the command that computes the before/after
  border-width multiset over all 23 swap targets.
- **Task 8's plant obligation** over-claimed (rows with no transition token to remove now get the
  opposite plant), **Task 9 had no plant** and now has the natural one, and **Task 8's walk** ranges
  over the whole inventory rather than the swapped elements.
- **Both mandated inventories are inlined verbatim** from the spec (plan §5 and §6), and §3's stale
  "35 keys" is corrected.

## What the plan must get right, in priority order## What the plan must get right, in priority order

1. **Every `red=` marker's cycle can actually complete.** Red-then-green on the SAME command inside one
   task. For each of the ten markers: does the named command go red for the stated reason, and does the
   SAME command go green by that task's end? §3 argues the sweep is one task precisely because splitting
   it leaves the same command red at a task's own end. Is that argument right, and does any OTHER task
   have the same defect unnoticed?
2. **The RED-validity rule.** Each `red-state=authored` marker must name the production line whose
   absence or defect makes the new case fail. A red that derives from test-local state (a helper the
   test has not written, an unresolvable import, a value the test controls end to end) is invalid by
   construction. Check each `why=` against the live tree.
3. **The authored-AND-RUN sweeps in §4.** Four of them, each with a command and its output pasted. Are
   any of the outputs wrong, and does any sweep's disposition column contradict the live tree? §4.1
   claims fifteen call sites with a disposition each; §4.4 derives the accepted-siteId shift by
   extractor rather than by hand, after two hand counts of that array disagreed during the spec stage.
4. **Task 5's step order.** It records the red BEFORE repairing, and its STEP 1 says to stop if the red
   names an element the spec's tables do not hold. Is any repair step in the wrong order, or capable of
   clearing the guard without repairing what renders (the defect spec §6.4 exists to prevent)?
5. **The counts that move.** §4.2 and §4.3. Does 5 + 5 + 2 + 10 = 22 hold against the spec's population,
   and is `neutralFaintCount` 4 to 9 right for the five occurrences the sweep adds to that file?

## Convergence criterion

**Consequence bound.** Every element the widened cover admits is either moved to an outline token
`DESIGN.md` §1.2 pins at >= 3:1 for that element's ground, or registered in `RESIDUE_CENSUS` with a
category and a reason whose form the suite checks. Never silently left at a weak outline, and never
silently dropped from the cover. An element that turns out to need a registered reason rather than a
swap, plus that registered reason, is a DOCUMENTED LIMIT and not a finding. So is a conservative
`unresolved` demotion on a className the resolver could not statically read.

**PROBE DOMAIN:** `app/**` and `components/**` as walked by `scanInteractiveElements`, plus
`app/globals.css`, `DESIGN.md`, `tests/styles/**`, `tests/mutation/source/registry.ts`,
`tests/docs/**` and `BACKLOG.md`. A probe outside that set, or more than one ordinary edit away from a
file in it, files to documented limits and not to a round. A constructed component exercising a JSX
shape the corpus does not contain is outside the domain.

**Threat fence.** Accidental authoring mistakes by an ordinary contributor adding or editing a control
in `app/**` or `components/**`, and ordinary implementer mistakes executing this plan. Adversarial
obfuscation of a className (computed strings, dynamic token construction, a class assembled across
module boundaries beyond the resolver's declared bounds at
`tests/styles/interactiveScanCore.ts:79-81`) is OUT OF SCOPE and files to documented limits.

Every admissibility clause cites this fence and this domain. A claim about current behaviour or corpus
content is settled by PROBE, and your finding includes the probe output.

## Exhaust the vector

Enumerate ALL instances of each finding class you identify in THIS round. A repeated vector dripped one
instance per round is a review defect, not thoroughness. If you find one invalid marker, check all ten
before writing the finding.

## EXPLICITLY DO NOT RELITIGATE

- **Everything the spec settled.** Eric's two rulings, the switch tracks staying out
  (`DESIGN.md:250-261`), the 2026-08-18 `border-border` ruling (`DESIGN.md:295-302`), the per-consumer
  widening, the three resolution edges, the `inner-chrome` category and its bar, the 35-element
  population, and the `EventFilters` repair shape. Spec round 5 APPROVE'd all of it with zero findings.
- **No structural predicate for trackness or chrome-ness.** Five mechanisms tried to recover structure
  from the scanner's projection and each escaped (`tests/styles/controlOutlineScan.ts:16-20`,
  `tests/styles/controlOutlineResidue.ts:9-13`).
- **The prose folded into Tasks 5 and 6 rather than a task of its own** (plan §3). A standalone prose
  task has no executable red, and a prose guard invented to give it one is the shape measured at 18
  rounds and 33 findings on PR #776.
- **The invariant-8 marker ordering** (plan §0). The guard treats the template line as malformed
  outside a template file, and a filled line before the gate runs is a fabricated claim.
- **`tests/styles/subtleInteractiveScan.ts` stays unenrolled** in the mutation registry
  (`tests/mutation/source/registry.ts:2657-2671`).
- **No new `BL-`/`DEF-` row of any facing** (Eric's directive, 2026-08-25). Do not propose one.

## Output

End with exactly two lines:

```
FINDINGS: <n>
VERDICT: <APPROVE | NEEDS-ATTENTION | BLOCKING>
```

`FINDINGS: 0` when you raise none.
