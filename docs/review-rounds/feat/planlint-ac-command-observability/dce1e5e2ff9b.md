# feat/planlint-ac-command-observability — review-round filing

Base `dce1e5e2ff9b`. Diff-stage rounds for the AC-coverage plan-lint arm
(`docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`).

## diff — 2 rounds

**Examined:** whether an AC coverage arm keyed on an explicit declaration reports correctly on the
citation forms a plan actually uses, and whether this arc's own evidence records say what they claim.
This file holds the last two of the arc's **five** diff rounds. The branch directory has FOUR bases,
which is the figure the gate message and `pnpm review:economy` both report ("5 across 4 bases"); three
of the four hold diff rows, because rows key on `(branch, merge-base)` and main was absorbed three
times mid-arc:
`300a9f937b8a` holds arc rounds 1 and 2 (1 and 4 findings), `9f8da68b0919` holds arc round 3
(4 findings), and this base holds arc rounds 4 and 5, recorded as 1 and 2 (1 finding, then APPROVE
with 0). The counter restarts at 1 on each new side of a split by design, per the economy spec §8.2
item 3, so no single file's count is the arc's. Under the per-base rule none of the three reached the
threshold and this filing would have been voluntary; under the arc-sum rule that `feat/review-round-arc-sum`
landed in #887 the summed total of five is owed, which is exactly the gap that change exists to close.
The heading declares this file's own count, as clause A requires; the arc total is the number above.

**Mechanizable:** one class produced a finding in THREE consecutive rounds, and each time I repaired
the instances named rather than the class. Round 2 finding 1: the cell view dropped link destinations.
Round 3 findings 1 and 2: duplicate-definition precedence and `imageReference` alt, both in the code
round 2 had just repaired. Round 4: titles, on all four title-bearing forms. The shape is identical
every time, and I wrote it down after round 3 without acting on it. An enumeration of text-bearing
fields is always one field behind the format.

The closing form is an INVERSION, and it is shipped. The view now default-includes every string mdast
carries in the cell and denies a short structural list, so a field this module has never heard of is
included rather than dropped, and the failure degrades to harmless noise in a pin scan instead of a
silent wrong accept. It is pinned by a DERIVED test rather than another form list: the test walks the
row's own mdast, collects every non-structural string, and asserts none is missing from the view, so a
regression to enumeration fails as a class. Planted both ways. Dropping only `title` reds it, and
denying `url` reds three cases.

The general rule is worth more than this arm. When successive rounds each add one member to a
recognizer's accept-list, the repair direction is to invert the default, not to extend the list. An
accept-list fails closed on the unknown case; a deny-list fails open.

declined: no ledger row is minted for it. The rule is process-facing and its done condition is a
property of the guard, so under the 2026-08-25 process mint freeze it files to the owning surface's
documented limits instead. It lives in the spec's limits section and in the shipped view's own comment,
where the next author of that function reads it. Re-file trigger: a product-facing arc blocked by the
same class.

**Judgment:** three calls that were mine and are recorded so they are not relitigated. First, the
repair direction on round 2 finding 1 was not a recognizer. Every string now collected is one remark
already parsed, and raw inline HTML contributes its verbatim value rather than teaching the module to
parse an `<a href>`. Second, round 3 finding 4's duplicated hazards transcript was DELETED from the
spec rather than re-synchronised with the probe record. Two copies of one measurement drift until the
copy nobody re-runs is the one that lies, and this arc had already spent a round on that. Third, round
5 returned APPROVE with 0 findings and the diff stage closed there on the orchestrator's ruling, with
the brief stating the closed criterion only. The late-arc brief rule is explicit that naming a fresh
open axis past the cap mints the next rounds itself.

**Infra:** every round returned a verdict; no dispatch was reaped or wedged. Four of the five ran
against a tree that had just absorbed main, and the absorbs were forced rather than chosen. PR #884
went CONFLICTING twice, once after #885 landed and once after #887, and GitHub fires ZERO
`pull_request` runs on a conflicting PR, so CI was dark until each absorb. One inherited red was not
this arc's: #883's `String.replace` judge and #885's new help suite each merged green alone and the
pair was red, so `origin/main` itself was red on the required `unit-suite` and every absorber
inherited it. Recorded because a reviewer looking at a red branch would otherwise attribute it here.
