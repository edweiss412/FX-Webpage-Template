# Adversarial round economy — 2026-07-31 retrospective

Why recent features burned 3× the usual adversarial-review rounds despite the codified-lesson corpus, and the rules that close the burn without capping rounds. This document is the canonical write-up; the enforceable rules live in `docs/agents/spec-self-review.md` (probe-before-argue, documented-limits budget, citation anchors), `docs/agents/writing-plans.md` (mutation-family closure), and `AGENTS.md` (finding-admissibility contract for review briefs).

## Data

| Arc | Spec rounds | Plan rounds | Impl rounds |
| --- | --- | --- | --- |
| `inline-later-group-own-hotel` (#635) | **R57** | R11 | R1 |
| `ci-dark-descoped-guards` (#626) | R8 | R4 | **R13** |
| Baseline: `parser-property-fuzz` | R8 | — | — |
| Baseline: `ambiguity-warnings-v1` | R18 | — | — |

Classification of the 57 spec rounds (from commit subjects on `docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md`):

- ~4 rounds were process/citation compliance (the classes the existing lesson corpus targets). **The codified lessons are working** — old finding classes (invented APIs, missed registry fan-out, tautological tests) barely appear.
- The bulk was serial enumeration of edge-case families of a text heuristic: postal tails, ZIP+4 delimiters, dash classes, unit aliases, casing preconditions, zero-width members. One family per round.
- **Two reversals:** R27 reversed R21's street exemption; R55 reversed R53's no-word-char clause (R53–R56 = 4 rounds on a clause that ended reversed). Both reversed decisions were accepted WITHOUT a probe; both reversals were driven BY probes. Every probe-backed decision in the train survived.
- ~6 rounds (R24, R26, R30, R33, R52, R54) did nothing but ratify a "documented limit" — non-goal declarations negotiated retail, one per round.
- Corpus-calibrated bounds landed at **R47** — draft-time input arriving 47 rounds late.
- Line-number citation anchors rotted at every merge: a dedicated "post-merge citation refresh" commit exists solely to re-verify line numbers.

## Diagnosis

1. **Work type shifted; the convergence criterion broke.** Recent arcs are text heuristics over messy human data and guards-on-guards (mutation meta-tests). Both have unbounded attack surface, so "reviewer finds no defeating input" is not a fixed point — the reviewer can always invent one more postal-tail variant or mutation family (impl R13's own commit subject: "three more mutation families"). No amount of writer skill closes an unbounded space upfront; round count on these surfaces measures reviewer imagination, not initial code quality.
2. **Empirical questions were settled by argument.** Which strings occur in real sheets and what the live parser does on input X are probe/corpus facts. Litigating them analytically produced the two reversals and deferred corpus calibration to R47.
3. **The residual-risk budget was negotiated retail.** The spec ended at exactly the right posture — "demotes CONSERVATIVELY … never silence, never corruption", limits "fenced both directions" — but arrived there one ratification round per edge family instead of declaring the budget up front.
4. **The lesson corpus inflates review surface.** Mandatory matrices, inventories, byte-pins, and line-anchored citations make a spec a several-hundred-line pseudo-implementation, litigated three times (spec prose, plan, code). Each past round-burner that became mandatory artifact surface adds findable micro-defects per round.

## Reconciliation with the edge-case-preparedness audit

The audit (`docs/audits/edge-case-preparedness-audit-2026-07-04.md`) declares the fxav-test-shows corpus "a non-exhaustive, representative sample … not a spec." That does not conflict with probe-first review — the audit itself supplies the resolution at line 92: assert every mutation is "parsed correctly or *signaled*, never silently wrong. This is the structural answer to 'the corpus is non-exhaustive'; it manufactures the missing corpus."

Two lanes:

- **Lane 1 — behavior facts.** "What does the live parser do on input X" / "does shape Y occur in the corpus." Probes answer these exhaustively regardless of corpus coverage; corpus non-exhaustiveness is irrelevant. These claims are settled by running, never by prose rounds.
- **Lane 2 — future hypotheticals.** The corpus cannot close this space — and 57 rounds prove reviewer enumeration cannot either. Convergence comes from a **consequence bound**: "correct or signaled, never silently wrong" is closable (reviewable structurally, mutation-testable) where "no imaginable defeating input" is not. A hypothetical input needs no corpus instance to be admissible, but it is a finding only if a probe shows silent corruption or wrong auto-correct; when the worst case is a conservative demote plus a surfaced warning, it files to the spec's documented-limits section without a round.

## Rules codified from this retrospective

1. **Probe-before-argue** for detector/heuristic surfaces; no recognizer/guard tightening accepted without a probe demonstrating the corruption it prevents (`docs/agents/spec-self-review.md`).
2. **Documented-limits budget + consequence-bound convergence** for detector/heuristic specs (`docs/agents/spec-self-review.md`).
3. **Citation anchors are file + symbol/token; line numbers are volatile hints** — drift alone is not a finding and needs no refresh commits (`docs/agents/spec-self-review.md`).
4. **Mutation-family closure** for guard/meta-test plans — a new family requires a live escaping mutant (`docs/agents/writing-plans.md`).
5. **Finding-admissibility contract in review briefs** for these surfaces, including "a forced change later reversed is a review defect" (`AGENTS.md`, cross-CLI orchestrator discipline).
