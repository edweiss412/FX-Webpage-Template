# Handoff — spec:lint declared-limit pin collision arm (PR 1)

Spec: `docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md` — CLOSED.
Plan: `docs/superpowers/plans/ci/2026-08-19-planlint-declared-limit-pin-collision.md` — ACCEPTED.
Ledger: `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION`, marked IN PROGRESS on this branch.

Authoring session: spec + plan only. **No implementation was written.** This document is the contract
for the implementer.

## Review record

| Stage | Rounds | Findings | Outcome |
| --- | --- | --- | --- |
| spec | 4 under `03953337388b`, 1 under `4e074d3bcbfa` | 21 | closed after a fixture pass run to a fixed point |
| plan | 5 | 35 | ACCEPTED by orchestrator fence after round 5 |

Every finding was accepted; none was refuted. The corpus is
`docs/review-rounds/feat/planlint-declared-limit-pin-collision/`, and the filing beside it carries the
per-stage analysis. One `no_verdict` row is labelled with its cause (a dispatching-session SIGTERM,
established from the session rollout rather than inferred from the status).

## Two classes closed BEFORE implementation, and how

Neither needs re-litigating; both have a mechanical cover, and an instance found later means the COVER
is incomplete rather than that the plan is wrong.

1. **Fixture adequacy** — closed by a pass run to a FIXED POINT over all 20 fixtures, asking two
   questions of each: what strictly weaker implementation would satisfy it, and WHICH RULE DECIDES the
   observation being asserted on (including cross-finding machinery the implementer will invent —
   dedup, ordering, collapse-by-position — not only what the spec contains). Iterations returned 1 then
   0. Across the arc that pass found six instances to the reviewers' zero on the same question. Both
   tables are spec §6.
2. **Red validity** — closed by a cover that regexes every `**What is red and why:**` out of the plan
   and reports each valid or invalid. Six statements, zero invalid. The enumeration comes from the
   DOCUMENT, which is the whole point: the r4 pass that enumerated from recall missed one of four.

## THE ONE CONDITION the implementer carries

**A red that cannot exist at its own sequence position is a PLAN DEFECT TO REPORT — never something to
quietly reorder.**

Task ordering is self-proving under TDD: a task whose red cannot exist fails the moment someone runs it,
and the failure is legible (a red that cannot collect, or one that fails on an unresolved import rather
than on its assertion). That is why the class is routed here rather than to another review round. But
silent reordering would let the vector survive into a shipped plan, so:

- If a `red=` command reports "no tests" or fails on a missing export, **that is not a red.** Stop.
- Report it against this plan. Do not resequence the task to make it pass.
- Confirm every red **failed for the ASSERTED reason** by reading the failure output, not the exit code.

## A SECOND CONDITION, added after handoff was written

**Every weaker implementation the plan names owes a killing check that EXISTS IN THE SHIPPED TESTS, and
you verify that mechanically — enumerating from the spec §6 tables, never from recall.**

The tables name each weaker implementation and the fixture that kills it. A table that names the case
while the suite omits it is the gap between plan and implementation: **no plan review catches it,
because the plan is correct, and no fixture audit catches it, because the fixture does not exist.** A
sibling arc shipped exactly this an hour after its plan correctly named the case — a default that
bounded nothing went invisible to every proof, because both production call sites omitted the argument
while every test supplied it.

Two mechanical steps, at the end of implementation:

1. Enumerate the killing checks FROM the §6 tables. Not from memory of which ones you wrote — this
   arc's own worst finding was a sweep enumerated from recall that missed one of four sites.
2. For each, confirm the check exists AND fails when you break the behaviour it covers. A check that
   cannot fail is not a check.

## Live facts the implementer should not re-derive

- **Preparation makes NO difference on the live corpus today.** Prepared and unprepared runs both yield
  the same 7 pins, because no enrolled suite currently holds a test-shaped line in a comment, template
  or multi-line string. Preparation is defensive — one ordinary edit away — which is why the only proof
  of it is Task 7b's in-process decoy case, and why Task 6 is characterization rather than a TDD cycle.
- **The shipped CLI never reads a fixture suite.** It resolves `suitePaths` from the real registry and
  the tracked-file index, so decoys planted under `__fixtures__/` are unreachable by subprocess. AC-10
  is two steps for that reason: preparation in process, wiring by subprocess over a real surface.
- **`spec:lint` takes exactly ONE document per invocation** and exits 2 on two.
- **`tests/mutation/guardSurfaces.gates.test.ts` and the shard files are in `NIGHTLY_ONLY_EXCLUDES`.**
  A bare `pnpm vitest run <that file>` collects nothing and exits 1 — a wrong-reason failure, not a red.
  Use `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation <file>`.
- **Run the FULL `tests/docs/` suite before opening the PR**, not a scoped subset. Two gates there walk
  the LIVE corpus (`_metaReviewRoundEconomy`, `specsReadmeIndexParity`) and a scoped run passes happily
  while the branch is red. Both reds were hit on this branch and fixed.
- **The round filing goes stale the moment a dispatch row lands.** a scratch, untracked helper (.probe/refresh-filing.py) syncs the headings and the arc total from the corpus; it selects the filing by merge-base,
  not by sort order.

## Closeout the implementer owes

- Enrolment is TWO declarations: the `tests/mutation/source/registry.ts` row AND the
  `EXPECTED_LEDGER_KINDS` entry in `tests/mutation/source/expectedLedgerKinds.ts`. A row alone leaves
  the corpus gate red. Run `pnpm heavy pnpm mutation:guards` — the canonical whole-registry command spec
  §7 requires — before the round-1 diff dispatch, and state `MUTATION SCORE: <k>/<t>` plus "0 unaccepted
  survivors" on the brief's `GUARD SURFACE:` line, or codex-guard exits 2.
- Remove each `<!-- spec-lint: ignore -->` waiver as its target file lands, and confirm both documents
  still lint `0 hard` WITHOUT it (Task 8 Step 4b).
- Prove `parse.ts` unmodified by DIFF, not by the purity meta-test, which only rejects three node
  imports (Task 8 Step 4a).
- Graduate `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` to `BACKLOG-archive.md` and strip its IN PROGRESS
  marker as ONE ledger commit BEFORE whole-diff review, per invariant 12 as ruled 2026-08-18.

`impeccable-gate: N/A — no UI surface`
