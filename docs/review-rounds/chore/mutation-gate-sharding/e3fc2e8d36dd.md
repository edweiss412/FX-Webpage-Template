# chore/mutation-gate-sharding — review round economy

Base: `e3fc2e8d3` (merge-base with `origin/main`). Spec converged at 3. The plan ran **10** rounds and APPROVED at round 10 with 0 findings; this filing was opened when it crossed the 4-round threshold and is updated here with the full picture.

## plan — 10 rounds

**Examined:** every finding across plan R1 (8), R2 (5), R3 (8), R4 (3), R5 (3), R6 (3), R7 (3), R8 (1), R9 (1), R10 (0) — **35 total, all accepted, none argued away, none reversed on a later round.** One commit per round.

**Finding rate: 8, 5, 8, 3, 3, 3, 3, 1, 1, 0.** It decayed, which is the thing the 2026-08-04 measurement found absent in the 474-round corpus — there BLOCKING findings per round were flat (0.32 early, 0.38 at round 11+). So this arc's length was not a non-terminating recognizer chase, but it was still roughly twice what it should have been, and §"What actually drove the round count" says why.

**Mechanizable:** the dominant class is **a guard assertion that passes by construction**, and it accounts for 12 of the 24. It arrived in five distinguishable shapes, and every one of them was already named somewhere in this repo's own rules before I wrote it:

| shape | instances | already covered by |
|---|---|---|
| expected value derived from the thing under test (`weightOf(s) - extra`, then asserting the sum) | 2 | anti-tautology rule, "derive expected values from fixture dimensions" |
| a comparison any input satisfies (`>=` a maximum; `weightOf < suites * weightOf`) | 2 | anti-tautology rule |
| substring where a token was meant (`toContain("3600")` accepting `36000`; then `(?![0-9])` accepting `3600.5`) | 2 | `BL-TRANSITION-AUDIT-COUNTS-A-MENTION-AS-A-CONSUMER` — the same use-vs-mention defect |
| scanning a container that includes siblings (whole `notify.steps` object rather than the issue body) | 2 | anti-tautology rule, "clone the tree and remove siblings that independently render that label" |
| a length or set assertion whose loop always pushes the expected count | 4 | anti-tautology rule |

The substring/container pair is the sharpest lesson: **both were repaired once and came back**. R3 replaced `toContain` with a digit-boundary regex, and R4 showed `3600.5` walks through it; R3 scoped the notify check to job names, and R4 showed a step *name* satisfies it. In both cases the first repair narrowed the recognizer instead of changing what was compared. The repair that held was the same both times — **stop pattern-matching and compare the actual value**: take the token after the flag and compare it exactly; take `step.with.script` and search only that. A guard that needs a cleverer pattern is usually a guard looking in the wrong place.

Mechanical arm that would have caught most of this at authoring time: none exists today, and I am not proposing one. `spec:lint` already runs on every plan and found 0 hard here from R2 onward; these are semantic, and the cheap detector for "this assertion cannot fail" is running the mutant, which the plan now schedules per guard (six for the integrity meta-test, three for the weight formula, eight CLI probes). **The economical move was available and I did not take it until R3: write the mutant WITH the assertion, in the same step, rather than adding a mutant table after a reviewer proves the assertion vacuous.**

declined: no schedulable mechanization is proposed for this class. Every one of the five shapes above is ALREADY written down — the anti-tautology rule in `docs/agents/writing-plans.md` covers four of them and `BL-TRANSITION-AUDIT-COUNTS-A-MENTION-AS-A-CONSUMER` covers the fifth — so a new ledger row would restate a rule that exists rather than add enforcement. The gap is not a missing rule and not a missing detector; the cheap detector for "this assertion cannot fail" is running the mutant, which this plan already schedules per guard (eleven for the integrity meta-test, three for the weight formula, ten CLI probes). Filing a row for "write a lint that finds vacuous assertions" would be an entry no one can act on, which the 2026-08-04 filing bar screens out.

(Structural disposition added 2026-08-16 during implementation. The prose above already declined, in the sentence "none exists today, and I am not proposing one"; the enforcement-pair arc's `declined:` grammar landed on `origin/main` between this filing being authored and this branch merging, and `tests/docs/_metaReviewRoundEconomy.test.ts` correctly reported the filing as untracked. Nothing in the analysis changed — only its form.)

**Judgment:** three findings were genuine design calls that no lint could reach, and all three came from reading the repo rather than the diff.

- R1 #7 and R3 #1 are the same judgment twice: **reuse the existing implementation, and shape a guard so it can be enrolled.** I re-implemented `lptAssign` where the spec said to reuse it, and I gave the budget checker a combined logic-plus-CLI shape that `tests/mutation/source/registry.ts:993-1008` already records as unenrollable (`phantomGapExecuted` scored 0.27 for exactly that). Both were avoidable by reading a file the plan already cited.
- R3 #4 — the plan demanded `PASS` from two full-gate checkpoints while `mutation:guards` is red at the merge base on work the arc explicitly does not own. A task that cannot complete without fixing out-of-scope work is a plan defect, and the honest form is to expect the known signature and nothing else.
- R4 #3 — the elapsed stamp sat inside the vitest step, so it measured test time while §4 targets job wall clock. Complete, finite, plausible, and wrong by the whole setup phase; no completeness or parse guard can see it.

**Infra:** none. All ten rounds returned a verdict on the first attempt — no `no_verdict`, no reap, no wrapper retry, no fallback. That is the cleanest infra record of any arc in this corpus and is worth noting precisely because the round count was high: none of it was infrastructure.

**The tail, R5-R10, is one story and it is the expensive one.** Eleven findings across six rounds, and nine of them were the SAME defect class in successive disguises: **a guard that pins a declaration rather than the behaviour the declaration implies.**

| round | the guard said | what it missed |
|---|---|---|
| R4 | `toContain("3600")` | `36000` |
| R5 | `(?![0-9])` | `3600.5`, and a duplicate flag |
| R6 | exact-token count | `--flag=value`; `issues.create` matching `issues.createComment`; `SHARD_START=` matching an empty assignment |
| R7 | `env:` mapping equality | a shell assignment prefix shadowing it; a `printf` overwrite |
| R8 | command + env pinned | the job could not RUN the command (no setup action) |
| R9 | setup present | setup before checkout |

R4-R6 I repaired by widening the recogniser each time, which is precisely the ratchet `AGENTS.md` documents, and each widening was a bigger target. R6's repair finally deleted the recognisers — constants into a YAML `env:` mapping, step selection by declared `id` — and the finding rate dropped to 1 immediately after. **The narrowing repair was available at R4 and I took it at R6; those two rounds are the measurable cost of widening instead of narrowing.**

R8 and R9 are a different and subtler shape worth separating: not a loose pattern, but a guard asserting the right thing about the wrong layer. Membership is not order; a declared command is not an executable one. No amount of pattern-tightening reaches those — only asking "what would have to be true for this step to actually work?"

**Mechanizable, tail:** nothing new. The rule that would have prevented nine of eleven already exists in `docs/agents/writing-plans.md` as the anti-tautology rule, and the practice that operationalises it is the one this filing already names — write the failing input WITH the assertion. Every one of these eleven was found by the reviewer constructing exactly that input, in seconds, after I had not.

### What actually drove the round count

Not reviewer imagination and not scope ratchet — the finding rate fell 8 → 5 → 8 → 3 and every finding was accepted, so the criteria held. What drove it is that **three of the four rounds were spent on the guards, not on the change.** The product change here is small (five files split from one, a workflow matrix, one script); the plan's guard surface is much larger, and a guard's defect mode — passing when it should fail — is invisible to every check except an executed mutant.

The concrete lesson for the next arc of this shape, stated so it is actionable rather than a resolution: **for any assertion in a plan, write down the input that makes it fail before writing the assertion.** Where that input cannot be named, the assertion is decorative and should be deleted rather than reviewed. Rounds 3 and 4 would have been substantially shorter under that rule; rounds 1 and 2 contained design findings that no such rule reaches.
