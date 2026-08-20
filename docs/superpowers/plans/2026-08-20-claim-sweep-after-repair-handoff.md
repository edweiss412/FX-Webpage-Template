# Handoff — `spec:lint` claim sweep after a repair (`BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`)

**From:** the spec+plan session (arc-lint PR2), branch `feat/speclint-claim-sweep-after-repair`.
**To:** the implementer session. **You own implementation; this session owned spec and plan only.**

impeccable-gate: N/A — no UI surface

Nothing this arc touches is under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or
`DESIGN.md`.

## 1. What is ratified, and what is left to do

| Artifact | State |
| --- | --- |
| Spec `docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md` | **CLOSED by orchestrator ruling** after 7 dispatches / 24 findings. See §4 below and the plan's own §6. |
| Plan `docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md` | 5 dispatches / 25 findings, all repaired. Nine tasks. |
| Probe record + scripts `docs/superpowers/specs/ci/probes/**` | Every number in the spec is produced by a committed script. |
| Round-economy filing `docs/review-rounds/feat/speclint-claim-sweep-after-repair/4dfd784ed062.md` | Both stages filed: `## spec — 5 rounds`, `## plan — 5 rounds`. |
| Implementation | **NOT STARTED.** Tasks 1-9 of the plan, in order. |

## 2. Start here, in this order

1. Read the **spec** end to end. It is canonical; the plan implements it and never overrides it.
2. Read the plan's **§4** (the TDD cycle every task runs) and **§3** (citation lifetime) before Task 1.
   §3 is not background — **Task 1's commit invalidates seven `red-target=` citations by itself**, and
   Task 9 re-points them by READING each line rather than confirming it resolves.
3. Run the two committed covers before you start, so you know what green looks like:

```
python3 docs/superpowers/specs/ci/probes/scripts/2026-08-20-claimed-repair-sweep.py
python3 docs/superpowers/specs/ci/probes/scripts/2026-08-20-population-census.py
pnpm spec:lint docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md
pnpm spec:lint docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md --exec-red
```

At handoff: sweep `0 of 78` absent / `0 of 35` surviving over 4 documents; census `1131` measured,
`936 = 935 + 1`; both lints `0 hard`.

## 3. The five things most likely to cost you a review round

Each was paid for once already, in the round it is named for.

1. **A step whose red goes green by editing the ASSERTION is not a task.** This class cost three plan
   rounds and three folds — twelve tasks became eleven became nine. §4 carries the derived check: name the
   edit that turns each red green and confirm it is part of the DELIVERABLE. If you add or split a task,
   re-run that table.
2. **Confirm every red failed for the ASSERTED reason.** Read the output and match it to the `why=`. A
   command that fails because a file is missing, an import will not resolve, or a suite cannot collect has
   expressed no verdict — and goes green when the TEST changes. Task 1 carries this plan's only
   collection-shaped red and says so.
3. **The provenance stamp certifies, so a subset is worse than no stamp.** Task 8's command derives its
   file list and hashes WORKING-TREE bytes for a reason: an unexported variable, a directory argument, or
   an index-read each produce identical BEFORE and AFTER while the inputs move. Do not hand-maintain that
   list.
4. **A cover is clean about documents it never opens.** The claimed-repair sweep reads spec, probe record,
   plan and filing, with a control IN EACH. **Any document you add joins that list, and `ARC_DOCUMENTS`,
   in the same commit** — including this handoff, which is already in both.
5. **Do not reshape source so a mutant cannot be generated, and do not "totalise" a loop into a hang.**
   Task 8 states both, plus the audit BY PROPERTY: take the value the guard EXCLUDES, feed it to the
   advance expression, and ask whether the result is a position already visited. A timeout scores as a
   KILL, so a hang inflates the score and wall clock is its only symptom.

## 4. The spec stage closed by RULING, not by an APPROVE verdict

**This paragraph belongs in the PR body verbatim**, because a stage with no APPROVE and no explanation
reads to a later auditor as a skipped gate — absence of a verdict and absence of a process are the same
shape on disk.

The spec ran SEVEN adversarial dispatches (2 under base `03953337388b`, 5 under `4dfd784ed062`), 24
findings, every one confirmed by probe, none refuted. The final dispatch was a granted BOUNDED
CONFIRMATION round against a closed six-repair surface and returned BLOCKING with one finding. The
orchestrator (`bl-orch`) closed the stage by ruling on these grounds: design content had reached zero the
round before; round 7's finding was **REPAIR-INTRODUCED**, which is the specific risk a bounded
confirmation exists to catch, so catching it is convergence rather than evidence of more to find; the
repair closed the axis BY CONSTRUCTION, replacing a set closed by ENUMERATION with one DERIVED from §3's
normative outcomes; and the repair direction was SUBTRACTIVE in every round of the stage — the recognizer
never grew and the artifact is smaller than it was at round 1.

**The ruling carried ONE condition and it is met in Task 6**: the derived inventory is RECONCILED against
the module's own exported codes and against §5's item numbers in both directions, with a positive control
that proves the reconciliation fires; the half a checker cannot reach — reading §3's PROSE for a
requirement with no row — is §5 item 10, DECLARED, because a recognizer over English is exactly what
§1.1 item 3 forbids this arm.

## 5. Enrolment, and what the closeout owes

`lib/specLint/claimSweep.ts` is a guard surface, so **enrolment precedes the round-1 diff dispatch**
(Task 8) and the round-1 brief's `GUARD SURFACE:` line must carry `MUTATION SCORE: <k>/<t>` plus
"0 unaccepted survivors" or the wrapper exits 2 before dispatching.

**State both covers separately at closeout.** The mutation score covers what the declared operators can
EXPRESS; the Task 9 killer audit covers implementations a human would plausibly write that no operator
generates. A perfect score does not subsume the audit, and the audit's counts are ABSENT /
PRESENT-BUT-UNPROVEN / PROVEN with PROVEN meaning **observed red in that run**, not assigned by reading.

**The ledger change is ONE commit BEFORE whole-diff review** — peer rows filed, `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`
archived, its IN PROGRESS marker removed. Absence at commit N is absence at every commit after N. The
residual hazard is a LATER merge of `origin/main`, which re-conflicts both ledger files: after every such
merge, re-verify the set arithmetic (union of ids exact, `comm -12` archived-versus-open EMPTY, in-progress
marker count zero). Do not arm `--auto` until the closeout commit is pushed AND review has approved.

## 6. Where the review record lives

Corpus rows: `docs/review-rounds/feat/speclint-claim-sweep-after-repair/{03953337388b,4dfd784ed062}.jsonl`.
Filing: the sibling `.md`. Briefs and reviewer outputs: `/Users/ericweiss/FX-worktrees/_briefs/2026-08-20-arc-lint-pr2-*`
(untracked, per-machine). **Round numbers in the corpus are per `(branch, merge-base)` and restart when
the base moves** — that is why the spec's seven dispatches sit 2 + 5 across two files, and why the spec
document itself carries no round numbers.
