# Review-round filing — `fix/control-outline-border-token`, base `cbf4cecad433`

**A CONTINUATION, and the third base this arc has had.** `<baseSha12>` is the arc's identity, and it moves whenever the branch merges `origin/main`. This branch merged twice on purpose: once when arc C landed (#849) and once when arc D landed (#850, merge `cbf4cecad433`), both times because the ledger archive seam was hot and resolving it inside the reviewed diff is the option-A ordering this arc committed to.

The full history is in the two sibling filings — `2ddbf038bdf4.md` (5 spec rounds, 5 plan rounds) and `39f57661c873.md` (1 plan round, 1 diff round). Read those first; this file records only what happened after the second merge.

## diff — 1 round

**This base has seen ONE diff round; it is the arc's SECOND.** The `--round` value the wrapper records is the caller's label, and it was passed as 2 — correct for the arc, wrong for this base identity, under which it is round 1. Corrected, with the arc-level count in prose where it cannot be mistaken for a measurement.

**Examined:** one `--stage diff` dispatch, `NEEDS-ATTENTION`, **2 findings, both P2, no P0 and no P1.**

**Judgment: the round that mattered was the previous one, and this round's value is what it did NOT find.** Diff round 1 returned BLOCKING with a P0 — `components/shared/ReportButton.tsx`'s icon variant was a THIRD instance of presence-vs-adequacy, its surviving hover cues measuring 1.109 and 1.114. Round 2 was asked to look specifically for a fourth, and computed every delete-group cue per render path to say there is none. That negative is the round's product: `HoverHelp` moves faint→strong at 5.717/4.289; the four inbox links gain a geometric underline in an existing 5.57/8.84 accent; `SectionChipLink` and both `PersonRow` actions pair a 1.109 fill wash with an accent text change at **ΔE76 72.9 / 65.2**, against the rejected `ReportButton` change's **ΔE76 5.6 / 4.6**. That ΔE contrast is the sharpest statement of the criterion anyone on this arc produced: the fill wash is identical in all of them, and what separates adequate from inadequate is the hue change beside it.

Both remaining findings were **documentation drift introduced by the round-1 repair** — the guard's prose still describing a 12/9 partition its own executable assertions had moved to 8/10/3, and a ledger literal stale against the post-merge base. Neither touched behaviour.

**Mechanizable:** one, and it is a repeat — `declined: already filed as BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`. Both P2s are the same shape that row exists for: a repair updated the executable assertion and left the prose describing the prior state. This arc has now produced that shape at least four times across three artifacts, which is the argument for the filed row rather than for a fifth hand-sweep.

**Infra:** none in this round's dispatch. Noted for the record: the reviewer could not execute Vitest in its sandbox (`EPERM` on the temporary worker directory) and said so plainly rather than reporting the suite as unverified-clean — the correct disclosure, and the same class of honesty this arc's own `no_verdict` and detector-false-clean findings turn on.
