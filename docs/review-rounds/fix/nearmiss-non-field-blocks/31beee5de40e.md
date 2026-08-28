# Review rounds — `fix/nearmiss-non-field-blocks` @ `31beee5de40e`

## spec — 5 rounds

**Examined:** `docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md` and its probe
`docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-candidacy-probe.ts`, across 4 rounds at one base.
Findings: 2, 2, 1, 1, 1. All seven were accepted; none was disputed or relitigated. Round 5 was a
VERIFY-ONLY round authorized past the cap, in advance, for the closed question "do the R1-R4 repairs
stand at head". It paid for itself: it found a regression in the round-4 repair, which was the one
repair no round had reviewed.

**Mechanizable:** One class, and it is the whole story of this arc's rounds.

**A guard's EVIDENCE is a guard, and nothing was checking it.** All six findings were defects in the
probe or the criteria, not in the rule. The rule itself, exclude form dumps and inventory matrices, was
right at round 1 and never moved except for a threshold I corrected myself. What kept failing was the
apparatus that was supposed to prove the rule:

| round | finding | shape |
| --- | --- | --- |
| 1 | the probe read the LIVE baseline, which AC-2 regenerates | evidence that dies when the change it justifies lands |
| 1 | criteria could not distinguish block classification from three-key suppression | a criterion satisfiable by an implementation that does not implement the rule |
| 2 | the census aggregated by namespace | an artifact that does not move when the thing it pins moves |
| 2 | AC-9 proved a predicate exists, not that the detector uses it | a guard that pins a component rather than the path |
| 3 | the injection changed the block's minimum before measuring it | a probe whose construction changes the property under test |
| 4 | no criterion separated `normalizeV3(opener) === "timestamp"` from `opener === "Timestamp"` | a criterion the corpus cannot distinguish from an impostor, because every instance spells it one way |
| 5 | the round-4 repair's own table compared two local expressions over hardcoded strings, never touching the block, the predicate or the detector | a table that would print the same number whatever the implementation did |

Round 4's is worth stating separately, because it is the one shape the other five do not cover. The rule
was RIGHT and the evidence was right; what was missing was an input that could tell the rule apart from a
simpler thing that agrees with it everywhere in the corpus. Of five one-edit spellings of a form-dump
opener, four separate them; zero appear in the corpus. That is not a probe defect, it is a corpus that
cannot express the distinction the rule makes.

Plus three the arc caught itself, all the same family: an emission check reading a field that does not
exist (so every block read "not emitted"); an injected label that was itself a corpus label (ambiguous in 9
blocks); and premise counts stated in the spec that no committed table could produce.

Round 5's is the class's purest instance, and the reason the verify-only round was worth its cost: a
repair for a tautology was itself a tautology. The fix for "no criterion separates the rule from an
impostor" was a table that never ran either. Rebuilding it to touch a real block corrected the count
from 4 to 3 and revealed a second error nobody had raised — whitespace padding is not discriminating,
because the scanner cleans the opener before either comparison sees it, so only a raw-string
comparison ever thought it was.

**The mechanizable core: a probe should assert its own preconditions.** Every one of these is a probe
reporting a result it had not established. The repairs converged on three assertions that generalise beyond
this arc, and they are cheap. The first two are `LIM-NONDISCRIMINATING-FIXTURE`'s prescribed repair applied
to a probe rather than a test; the third is the new class:

1. **Positive control.** The probe must observe the phenomenon at least once. A negative result that is
   structurally unconditional proves nothing. Caught the dead `detail` field.
2. **Ambiguity control.** The observed signal must be attributable to the probe's own input, not to
   something already present. Caught the `Address:` collision.
3. **Invariance control.** The probe's construction must not change the property being measured, asserted
   by re-deriving that property FROM the constructed input. Caught the round-3 defect and makes it
   unreintroducible.

Nothing in the repo enforces this trio today. `tests/_shared/premise.ts` is the nearest thing and covers
(1) only, and only for suites enrolled in the mutation registry.

**Parked, not filed as rows.** Under the 2026-08-25 process freeze all of this is process-facing with no
product-facing arc blocked, so it goes to documented limits. Recurrence check run first
(`rg "LIM-" docs/review-rounds/LIMITS.md`), and the classes split across an existing slug and one new one
rather than minting a single broad one:

**Existing: `LIM-NONDISCRIMINATING-FIXTURE`.** Its shape is "an assertion whose extraction is narrower than
the property in its own test name, so it passes for a reason unrelated to the behaviour", and its prescribed
repair is "a negative control, a premise on the fixture". That is exactly the emission check reading a
non-existent `detail` field (every block read "not emitted", so the verdict was unconditional) and the
injected label that was itself a corpus label (nine blocks agreed because a pre-existing row emitted). **This
arc is its 2nd namer.** Its stated re-file trigger is "a product-facing arc that stalls on a
non-discriminating fixture IT DID NOT AUTHOR"; this arc authored both, so the trigger is NOT met and nothing
is filed.

**New: `LIM-PROBE-PERTURBS-SUBJECT`.** The round-3 defect is a different mechanism and needs its own name.
The fixture discriminated perfectly; the problem was that CONSTRUCTING it changed the property being
measured. Appending a one-value-cell row to establish "does this block emit" dropped the block's minimum
value-cell count below the rule's threshold, so the probe measured a block the rule would classify
differently from the one it computed its expectation against. Distinct from
`LIM-NONDISCRIMINATING-FIXTURE`, where the assertion is too narrow: here the assertion is right and the
SUBJECT moved under it. The repair is also distinct — not a negative control but an invariance assertion,
re-deriving the classification inputs FROM the constructed input and requiring them to match the originals.
Measured blast radius when unasserted: 151 of 514 blocks perturbed, 18 across the decision boundary.

Re-file trigger for the new slug: a 3rd distinct arc naming it, or a product-facing arc blocked by a probe
that moved its own subject. `rg "LIM-PROBE-PERTURBS-SUBJECT" docs/review-rounds` is the recurrence check.

declined: no `BL-`/`DEF-` row is minted. Both classes are process-facing, and under the 2026-08-25 process
freeze an incident alone no longer admits a process row: neither `invariant` nor `product-blocked` applies,
because no product-facing arc was slowed by either gap and every instance this arc produced is repaired
in-branch. Both would also fail the freeze's admission test, since each done condition is a property of the
tooling (a probe asserting its own preconditions) rather than a number a product arc or a human would notice
moving. They are parked as documented limits with stable slugs instead: the existing
`LIM-NONDISCRIMINATING-FIXTURE`, which this arc is the 2nd to name and whose stated re-file trigger requires
a fixture the arc did not author, and the new `LIM-PROBE-PERTURBS-SUBJECT` for the round-3 shape, whose
trigger is a 3rd distinct arc or a product-facing arc blocked by a probe that moved its own subject.

**Judgment:** Two things were genuinely the owner's and neither was mechanizable.

- **Which block shapes are legitimate near-miss homes** is a product decision. The ledger row parked it
  under class-sweep exception (a) for exactly that reason, and it was ratified before this arc opened. That
  ratification is what let round 1 start from a rule rather than from a debate.
- **The matrix threshold** looked like a free parameter and was not. Row-count tables showed the corpus
  outcome identical for every value from 2 through 6, so nothing in emission space could choose it. The
  choice was settled by a question the tables did not answer, which families lose candidacy, and 3 silently
  swallowed four `venue` blocks. Judgment was needed to notice that the measurement being consulted was the
  wrong one.

**Infra:** The reviewer's sandbox blocks `tsx`'s IPC pipe (`EPERM` on `listen`, `/var/folders/.../tsx-501/*.pipe`),
so `pnpm exec tsx <probe>` cannot run there; `node --import tsx <probe>` works. Round 1 was dispatched with a
verification command the reviewer could not execute. Fixed for this arc by committing the probe's full output
so every number is checkable by reading, which is the durable answer rather than a per-brief workaround.

The convergence gate also blocked round 1's first dispatch: the brief stated a consequence bound in
paraphrase rather than in the canonical "never silently wrong" form the gate matches. Restated, not
overridden. Worth knowing that the gate matches on literal phrasing, so a correct bound in the wrong words
reads as an absent bound.
