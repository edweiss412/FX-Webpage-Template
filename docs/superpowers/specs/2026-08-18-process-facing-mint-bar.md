# Process-facing mint bar — incident-backed filing for process rows

**Status:** RATIFIED 2026-08-18 (user, direct review of the drafted policy text; the interactive
session that ran the same day's demotion sweep). Extends the 2026-08-04 backlog-convergence program
(`docs/superpowers/specs/2026-08-04-backlog-convergence-design.md`); nothing here relaxes that
spec's filing bar — this bar composes on top of it.

## §1 Why

The 2026-08-04 filing bar gates evidence **quality** (probe-or-reachability at filing). Nothing
gated what the evidence is **of**, and the composition drifted measurably.

Measured 2026-08-18, working tree at `origin/main` after PR #846 (the demotion sweep):

| Bucket | Rows | Mass | Share of mass |
| --- | --- | --- | --- |
| Product-facing | 56 | 199 | 47% |
| Process-facing | 51 | 228 | 53% |

Of the 2026-08-13..17 filing growth (+269 mass across 73 rows), roughly **200 mass (~74%) was
process-facing**: spec/plan lint arms, premisescan fidelity, mutation-harness mechanics, review
economy, guard infrastructure, CI wiring and flake. The product queue over the same window was a
finishing queue — two 16-mass parser/export design rows plus a 1-4-mass polish tail.

The same window's demotion sweep found the process rows almost all *admissible* — probe-backed,
honestly filed. Admissible is not the same as worth scheduling. A surviving mutant or a constructed
fixture proves a gap EXISTS; only an incident — a cost event that already happened — proves the gap
outranks the documented-limits record. The recognizer-ratchet retrospectives
(AGENTS.md "repair direction under same-axis recurrence"; the round-economy corpus) document where
the existing bar alone leads: guard surfaces that grow one speculative corner per round.

## §1.1 Resolved scope — do not relitigate

- **Incident-requirement over per-arc budget** is decided (rationale in §2's declined-alternative
  paragraph). Do not re-propose a budget without new measurement.
- **The two-value `Facing` taxonomy and the two-exception set** are decided at ratification;
  widening either (a third facing value, a new exception kind) is a spec change with its own
  measurement, not a review round on this unit.
- **The guard audits structure only** — taxonomy honesty and incident content stay review's class
  (§4 limits 2-3). A finding that the guard "does not pin what it claims" about either is a
  documented limit restated, not a finding.
- **Cutoff 2026-08-19** is decided (§3): the policy cannot bind a row filed before it ratified.

## §2 The bar

Policy text is the AGENTS.md bullet **"Process-facing mint bar (2026-08-18)"** (Cross-cutting
discipline, directly after the 2026-08-04 filing-bar bullet). Load-bearing elements:

1. **Every new `BL-`/`DEF-` row declares `**Facing:** product` or `**Facing:** process`** on its
   meta line, leading-token rule (trailing prose allowed).
2. **Product-facing** = the repair changes shipped behavior a crew member, admin, or operator
   observes: UI, parser, sync, auth, export, a11y, security posture, telemetry codes.
   **Process-facing** = everything else: spec/plan lint, review-economy tooling, mutation-harness
   mechanics, structural guards and guard-on-guard fidelity, CI wiring and flake, dev and
   orchestration tooling.
3. **A process-facing row additionally carries `**Incident:**`** citing a measured cost event that
   has ALREADY happened: a CI run that failed or passed falsely (run link), a review round
   demonstrably burned on the gap (corpus row), a defect that reached main which the absent guard
   would have caught (commit), wall-clock measured and lost. A surviving mutant, a constructed
   fixture, or "this could miss X" is probe evidence, **not** an incident — without an incident the
   finding files to the owning surface's documented-limits record with a re-file trigger, exactly
   as a §2 demotion would.
4. **Two recognized exceptions**, inline: `**Mint-exception:** invariant` (the row defends a
   plan-wide invariant) and `**Mint-exception:** ratified-scope` (a ratified spec § explicitly
   files it).
5. **Grandfather:** rows `Filed` before the enforcement cutoff are untouched.

**Declined alternative, fenced against relitigation:** a per-arc mint *budget*. A budget caps
volume but selects rows by arrival order rather than evidence quality — a speculative row filed
early would crowd out an incident-backed one filed late. Do not re-propose without new measurement.

## §2.1 Superseded for rows filed from 2026-08-25 — process mint freeze

The incident-admission clause (item 3) and the `ratified-scope` exception (item 4) no longer admit
a process-facing row `Filed` on or after 2026-08-25. Policy text is the AGENTS.md bullet
**"Process mint freeze (2026-08-25)"**, directly under the mint-bar bullet; it is the single copy
and this section only points at it. Items 1, 2 and 5, the `Facing` taxonomy, and the `invariant`
exception are unchanged. Rows filed 2026-08-19 through 2026-08-24 keep §2 as written.

## §3 Enforcement

`tests/docs/_metaLedgerMintBar.test.ts`. Shape mirrors the sizing guard
(backlog-convergence §3.3): `ledger-fields` walker-derived (new ledger files covered by default),
reject-by-name with file, id, and offending value, accept-set keyed on structure.

- **Cutoff `2026-08-19`**, not the ratification date: the policy ratified late 2026-08-18 and a row
  filed earlier that day (`BL-MODAL-WAIT-LOADED-CORE-CLASSIFY-TOTALITY`, PR #844's arc) cannot be
  bound by it. Lexicographic ISO-date compare.
- **Premise cases** (BL-GUARD-PREMISE-REACHABILITY): at landing the live corpus holds zero
  post-cutoff rows, so the corpus scan alone would pass unconditionally. Fixture entries run
  through the SAME walker and verdict function prove each reject branch fires.
- **Incident content is not judged.** The guard checks the author was forced to answer the
  question at the moment the answer is cheap; whether the cited run link is real is review's job
  (threat fence, §5).

## §4 Documented limits

1. **A row omitting `Filed` (or with an unparseable leading date) is grandfathered.** Omitting
   `Filed` therefore dodges the gate. Deliberate: `Filed` is corpus convention, its absence is
   visible in review, and hard-requiring it here would fail dozens of grandfathered rows or demand
   a second grandfather registry. Review owns the dodge class. Re-visit trigger: a post-cutoff row
   observed landing without `Filed`.
2. **`Facing` is self-declared and the guard does not audit the taxonomy.** An author calling a
   lint row `product` passes the guard; review owns it, with §2.2 as the citable line. Borderline
   calls made during the 2026-08-18 measurement, recorded so they are not re-derived: control-outline
   UI rows = product, the control-outline forward-guard = process; telemetry/observability of
   shipped behavior = product; dead-code cleanup = process; e2e flake hardening = process.
3. **Incident quality is unaudited** (§3). A fabricated citation passes the guard and is review's
   class, same fence as adversarial field spellings everywhere else in the ledger tooling.

## §5 Consequence bound + threat-model fence (for review of this unit)

- **Consequence bound:** worst case of any disagreement is a false FAILURE naming one entry,
  repaired by fixing a field or filing to a limits record; no silent pass on a post-cutoff
  process-facing row without incident/exception is reachable (absent keys are the reject branch).
  Nothing is deleted; a row the bar turns away is recorded in the owning surface's limits record.
- **Threat-model fence:** honest speculative filing by an ordinary contributor. Fabricated
  incidents, dodged fields, and taxonomy gaming are out of scope — review's class (§4).

## §6 Acceptance

- AGENTS.md carries the policy bullet; this spec and the bullet name each other.
- `pnpm vitest run tests/docs/_metaLedgerMintBar.test.ts` green: premise cases prove all reject
  branches; corpus scan green over the live queues.
- Existing ledger meta-tests unaffected.

impeccable-gate: N/A — no UI surface
