# BL-DERIVED-NUMBERS-IN-DOCS-ROT — a figure about an artifact is bound to a tree, or it rots

**Row:** `BL-DERIVED-NUMBERS-IN-DOCS-ROT` (BACKLOG.md) · **Branch:** `docs/derived-numbers-provenance` · **Effort:** S (the row says M; the count retired the test that made it M) · **Probe record:** `docs/superpowers/specs/ci/probes/2026-08-22-derived-number-population-census.md`

## §0 The bound this arc is held to

A probe record states figures about artifacts. Each figure is either bound to what it was measured
against or it silently stops being true when its subject moves — and **the anchor has to be
immutable**, which is the round-1 correction this spec now carries: naming a producing command says
how a figure was derived, not what it was derived from, and a command run against a moving tree
answers differently tomorrow. This arc makes that a written convention. It ships no detector, so it
has no false positives to bound; the failure it can produce is a convention nobody follows, not a
wrong verdict.

## §1.1 Resolved scope — do not relitigate

1. **The two-set population finding is the row's, and it stands.** Renderer-derived numbers did not
   rot; human-carried ones did, and the sets do not overlap. Nothing here re-argues it.
2. **Closing as a convention with no test is a first-class outcome**, named by the row itself as its
   preferred one. It is not a descoping and does not need to be defended as one.
3. **The count is what decides the fork, and it was run before anything was built.** Its figures live
   in the probe record, dated to base `b52481446`, and are not restated here — §1.2 explains why.
4. **`BL-CLOSEOUT-COUNT-PROSE-DRIFT` and the count-drift repairs of PR #875 are not this arc's
   ground.** That arc owns closeout certification; this one owns the probe-record population. The
   ledger-file measurement in the probe record's §3 is FILED here as its own row and REPAIRED by
   nobody here — filing is the deliverable, the repair is a scheduled queue item.
5. **The row's two branches were both reached, and neither by the route the row expected.** The row's
   condition for closing as a convention was a hand-carried set that is small and shrinking. That
   condition cannot be evaluated: the classification it presumes is a per-figure judgment, and §2
   records why no mechanical reading of this corpus delivers one. **The size is unmeasured, which is
   not the same as undefined** — round 1 corrected the first draft on exactly that point, and a
   reviewer arguing the set is in fact large or in fact small is arguing about a quantity nothing in
   this arc measured.

   **This is rule 358's boundary-dependent-counts form, arriving in documents instead of code.** Two
   honest counters got different answers there because the UNIT was arbitrary; here three variants of
   one heuristic did. The repair is the same in both places: stop reporting the count, and shift to a
   predicate the instrument can actually carry. That predicate is narrow — **one record in the corpus
   names no immutable anchor at all** — and §2 is explicit about what it does not cover.

6. **The sibling row this arc files is `BL-LEDGER-FIGURE-PROVENANCE`**, on the orchestrator's
   ruling of 2026-08-22, and its boundary against `BL-CLOSEOUT-COUNT-PROSE-DRIFT` is written into
   the row itself. Neither relitigates the other.

## §1.2 Convergence criterion (stated in every review brief)

- **Consequence bound.** No document is silently corrupted by this arc, because this arc reads
  documents and writes one paragraph of convention plus one record. The bound it must meet is that
  **every claim it makes about the corpus names its own producer**, and the producer set is mixed by
  design: the census script produces the population, the rates, the binding census and the 23 reds;
  `git` commands produce the file counts and the dead-ref check; and a person produces the verdict on
  which reds are genuine. The probe record's §0 states this per claim in a table. Round 1 found the
  first draft claiming one command produced all of it — a claim wider than its evidence, which is the
  exact defect this row is about.
- **PROBE DOMAIN.** `docs/superpowers/specs/ci/probes/**` at base `b52481446`, files walked from
  disk. A probe outside that domain, or more than one ordinary edit from an input in it, files to
  documented limits rather than to a finding. The ledger files appear in the probe record's §3 as a
  COMPARISON GROUP under the same instrument; they are not in the domain and no finding about them
  is admissible here.

  **The corpus figures are never quoted in this spec.** They are dated observations in the probe
  record. A spec that restates a corpus count acquires the exact defect this row is about, and the
  nested-hook arc already paid for that lesson three times in one arc
  (`docs/superpowers/specs/ci/2026-08-19-premisescan-nested-hook-sibling-leak-design.md` §1.2).
- **Threat fence.** Ordinary authoring of probe records by someone who has read the directory's
  README. A record deliberately constructed to satisfy the convention's letter while defeating its
  purpose is out of scope — there is no detector to defeat, so the adversarial case is a person
  choosing not to follow a written rule, which no artifact in this repo addresses.
- **Score.** N/A — CANNOT-EXPRESS. No executable guard ships, so there is no surface for the
  source-mutation registry to overlay. This is stated rather than enrolled symbolically, per the
  step3 precedent.

## §2 What the count found

Summarised for a reader who will not open the record. **Every figure here is an observation of the
probe directory at `b52481446`**, and the probe record's §0 names the producer of each and gives the
commands that reproduce them — including the `git archive` step, since the census script did not exist
at the commit it measures.

1. **A token-matching classifier cannot decide provenance here.** Three variants of one heuristic
   disagree, and 653 of the best variant's 725 hits are below 100, the range where token collision is
   expected — that counts magnitude and does not prove coincidence, which is round 2's correction to
   an earlier draft's wording. The spread is not the argument either: three variants of one heuristic
   disagreeing shows the heuristic is unreliable, not that the quantity is undefined. The decisive
   demonstration is that the record scoring zero under every variant is on inspection one of the
   best-provenanced in the corpus, because it uses indented transcript and blob ids instead of fenced
   blocks. No adjustment to a token rule reaches that.
2. **The gate the row sketches enforces the wrong rule.** It demands a producing COMMAND on the line,
   and §3's counterexample shows a producing command is not a binding — that record prints its
   `git show` and is still unfetchable, so a figure can satisfy the gate on every line and be exactly
   as rotten. Of the 23 lines it would red at `b52481446`, **15 do not state artifact figures at all**
   (ordinals, in-place derivations, control-outcome cells, an environment note) and one more states a
   figure in order to retract it. The remaining seven are real figures; how many are adequately bound
   is a per-figure judgment this arc does not make, and does not need to, because compliance with the
   gate would not settle it either. An earlier draft claimed an exact "zero true positives"; round 3
   retired that as more than the evidence carries.

3. **One record is genuinely unbound, and the gate cannot see it.** The anchor screen has exactly one
   positive finding: `2026-08-16-timing-scan-binding-probes.md` names `origin/fix/scanner-scope-totality`,
   no sha, and that branch has been deleted. Its single gate red is a task ordinal, so the rule fires
   on the wrong lines of the right file. **The screen does not certify the other records as bound** —
   round 2 retired that reading, since one unrelated object id anywhere makes a whole document pass —
   and the convention does not depend on a count of them.

4. **The rot the row was filed from is in the documents that quote probe records** — three of its four
   measured instances. A first draft sized that population with the census and reported a tenfold
   ratio; round 1 refuted the inference and the comparison is **withdrawn**. The instrument's bias
   differs by genre (probe records structurally carry commanded fences, ledger prose does not) and its
   unit is a document while a ledger file holds hundreds of entries. What stands is the incident
   evidence, which is what `BL-LEDGER-FIGURE-PROVENANCE` rests on.

## §3 What ships

**The convention** in `docs/superpowers/specs/ci/probes/README.md`, under a `## Stating a figure`
heading: the anchor must be **immutable** (an object id, or an honest declaration that the measurement
is not reproducible and why); a branch or remote ref is not one; naming a producing command says how a
figure was derived, not what from, so the command and the revision are named together; one header line
does both for a whole record. `2026-08-16-timing-scan-binding-probes.md` is cited in the README as the
worked counterexample.

**The census script**, committed as probe apparatus at
`docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs`. It takes a root
argument, prints file-accurate line numbers for every gate red, and prints the mutable-only binding
list on every run. It is wired into no gate and nothing runs it automatically.

**The probe record**, with its index row in the directory README. Its §0 names the producer of every
claim in it and carries the exact reproduction commands, since the script postdates the corpus it
measures.

**The parent row archived** to `BACKLOG-archive.md` with the count as its evidence and one re-open
trigger: a probe record shipping a figure whose only anchor is mutable.

**A new ledger row, `BL-LEDGER-FIGURE-PROVENANCE`**, for the population the parent row's own incidents
actually came from. It rests on those incidents, not on the withdrawn ratio, and it allocates its
overlap with `BL-CLOSEOUT-COUNT-PROSE-DRIFT` explicitly rather than asserting there is none.

Nothing else. No lint, no meta-test, no CI wiring.

**And no corpus repair, which is a decision rather than an absence.**
`2026-08-16-timing-scan-binding-probes.md` is unbound and unrepairable: the branch it names is gone, so
no edit recovers the tree it measured, and writing a plausible sha into its header would be a guess
wearing provenance's clothes. It stands as the README's worked counterexample, which is worth more.

## §4 Documented limits

1. **The convention is unenforced, deliberately.** A record can violate it and merge. The alternative
   was measured and declined in the probe record's §4: at base `b52481446` the sketched gate reds 23
   times, at least 15 of them on lines that are not artifact figures at all, it enforces a rule whose
   satisfaction does not establish binding, and it is blind to the corpus's one screen-flagged record.
   A record-level presence check fares worse — one red, and it is a false one.
2. **The census script is not a guard and must not be promoted into one.** Its three readings exist
   to show that a token-matching classifier is unreliable here; an arc that picks one and gates on it
   ships that unreliability rather than removing it. The binding census it also prints is a different
   and sounder signal, but it answers a per-DOCUMENT question and would need a new unit before it
   could gate anything finer.
3. **The ledger comparison is withdrawn, not weakened.** Reading C measures whether a prose token
   reappears in a commanded block in the same file; probe records structurally carry such blocks and
   ledger prose does not, so the instrument's bias is not constant across the genres and no ratio
   between them is licensed. The binding census does not transfer either — its unit is a document,
   and a ledger file holds hundreds of entries. Sizing the ledger population needs an entry-grained
   instrument that does not exist, which is `BL-LEDGER-FIGURE-PROVENANCE`'s first scheduled step.
4. **`README.md`'s index table omits several records that predate this arc** (observed at base
   `b52481446`). An index-completeness defect, a different class from figure provenance, left alone
   rather than swept in — this arc adds only its own row. Named here so it is a decision rather than
   an oversight.
5. **The hand classification in the probe record's §4 is a judgment, and is checkable because the
   population is printed.** Twenty-three lines is the scale at which that is affordable. It does not
   generalise, and nothing here proposes it should.

## §5 Acceptance criteria

- **AC-1.** `docs/superpowers/specs/ci/probes/README.md` carries a `## Stating a figure` section
  requiring an IMMUTABLE anchor, stating that a branch or remote ref is not one, stating that a
  producing command alone is not a binding, and citing the corpus's worked counterexample.
- **AC-2.** The census script runs from a clean checkout with no arguments and exits 0, printing the
  three readings, the tokenizer sensitivity table, the tree-binding census, and every line the
  sketched gate would red on.
- **AC-3.** The probe record names the corpus it measured (`b52481446`), names a producer for every
  claim it makes, and carries commands that actually reproduce them — including the `git archive` step
  the script's own later arrival makes necessary. Verified by running them, not by reading them. This
  arc is subject to its own convention.
- **AC-4.** The probe record has an index row in the directory README.
- **AC-5.** `BL-DERIVED-NUMBERS-IN-DOCS-ROT` is absent from `BACKLOG.md` and present in
  `BACKLOG-archive.md`, carrying the count as evidence and both re-open triggers.
- **AC-6.** `BL-LEDGER-FIGURE-PROVENANCE` is present in `BACKLOG.md` with `**Facing:** process` and
  an `**Incident:**` field citing the parent row's measured findings; it does NOT cite the withdrawn
  ratio as evidence; and it ALLOCATES the overlap with `BL-CLOSEOUT-COUNT-PROSE-DRIFT` — a closeout
  count stated inside a ledger entry belongs to exactly one of them, and the row says which.
- **AC-7.** The ledger row's in-progress marker is removed in the PR's last commit before merge.

## §6 Lint disposition

`pnpm spec:lint` is expected clean on this document. It carries no task markers and no citation to a
plan, being a one-task arc whose plan is the acceptance criteria above.
