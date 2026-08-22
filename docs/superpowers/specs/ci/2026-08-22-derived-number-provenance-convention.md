# BL-DERIVED-NUMBERS-IN-DOCS-ROT — a figure about an artifact is bound to a tree, or it rots

**Row:** `BL-DERIVED-NUMBERS-IN-DOCS-ROT` (BACKLOG.md) · **Branch:** `docs/derived-numbers-provenance` · **Effort:** S (the row says M; the count retired the test that made it M) · **Probe record:** `docs/superpowers/specs/ci/probes/2026-08-22-derived-number-population-census.md`

## §0 The bound this arc is held to

A probe record states figures about artifacts. Each figure is either bound to what it was measured
against — a revision, a dated run, a named script — or it silently stops being true when its subject
moves. This arc makes the binding a written convention. It ships no detector, so it has no false
positives to bound; the failure it can produce is a convention nobody follows, not a wrong verdict.

## §1.1 Resolved scope — do not relitigate

1. **The two-set population finding is the row's, and it stands.** Renderer-derived numbers did not
   rot; human-carried ones did, and the sets do not overlap. Nothing here re-argues it.
2. **Closing as a convention with no test is a first-class outcome**, named by the row itself as its
   preferred one. It is not a descoping and does not need to be defended as one.
3. **The count is what decides the fork, and it was run before anything was built.** Its figures live
   in the probe record, dated to base `b52481446`, and are not restated here — §1.2 says why.
4. **`BL-CLOSEOUT-COUNT-PROSE-DRIFT` and the count-drift repairs of PR #875 are not this arc's
   ground.** That arc owns closeout certification; this one owns the probe-record population. The
   ledger-file measurement in the probe record's §3 is FILED here as its own row and REPAIRED by
   nobody here — filing is the deliverable, the repair is a scheduled queue item.
5. **The row's two branches were both reached, and neither by the route the row expected.** The
   hand-carried set's size is not measurable (probe record §2) and separately does not matter,
   because the population contains no unbound figure (probe record §3). A reviewer arguing the set
   is in fact small, or in fact large, is arguing about a quantity this arc measured as undefined.

   **This is rule 358's boundary-dependent-counts form, arriving in documents instead of code.** Two
   honest counters got different answers there because the UNIT was arbitrary; here three honest
   readings of one instrument did, for the same reason. The repair is the same in both places: stop
   reporting the count, and shift to the predicate that survives every reading. That predicate is
   **every record binds its figures to a run context** — true under all three readings, decided by
   reading sixteen headers, and not a number at all. A convergence criterion built on the count
   would have moved every time someone added a fenced block; built on the predicate it does not
   move.

6. **The sibling row this arc files is `BL-LEDGER-FIGURE-PROVENANCE`**, on the orchestrator's
   ruling of 2026-08-22, and its boundary against `BL-CLOSEOUT-COUNT-PROSE-DRIFT` is written into
   the row itself. Neither relitigates the other.

## §1.2 Convergence criterion (stated in every review brief)

- **Consequence bound.** No document is silently corrupted by this arc, because this arc reads
  documents and writes one paragraph of convention plus one record. The bound it must meet is that
  every claim it makes about the corpus is produced by the committed census script and dated to the
  base it ran on.
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

Summarised for a reader who will not open the record. **Every figure in this section is an observation
at base `b52481446`**, produced by
`docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs` and recorded with its
full method in the probe record. They are bound, not current: the corpus grows, and a later reader
re-runs the command rather than trusting these. That is this arc's own convention applied to this arc's
own spec, and it is the reason these figures may stand here at all.

1. **Per-figure classification is not stable.** Three defensible readings of "derived" disagree by
   roughly 2x over the same corpus, and inspection overturns the reading that scores each record
   highest. Four independent demonstrations, the decisive one being that the corpus's
   worst-scoring record is on reading one of its best-provenanced — it binds by blob hash and
   indented transcript instead of by fenced block, and every classifier built here is blind to the
   difference.
2. **The population has no unbound figures.** Every record in the domain declares its run context,
   four of them by means the census's own regex cannot see (branch pin, dated run with a declared
   no-re-run scope, named driver script).
3. **The gate the row sketches would fire and catch nothing.** Its reds are ordinals, inline
   arithmetic, control-outcome table cells, and figures already bound by their record's header.
4. **The rot is in the documents that quote probe records**, not in probe records. Three of the
   row's own four incidents live there, and the comparison group measures an order of magnitude
   worse provenance over several times the population.

## §3 What ships

**One paragraph of convention** in `docs/superpowers/specs/ci/probes/README.md`, under a
`## Stating a figure` heading: a figure about an artifact is bound to a revision, a dated run, or a
producing command or committed script; a header line binds a whole record in one sentence; the
narrow population it protects is a figure asserting a property of the live tree with nothing saying
which tree.

**The census script**, committed as probe apparatus at
`docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs`. It is re-runnable
and takes a root argument, which is how the comparison group was measured. It is not wired into any
gate and nothing runs it automatically.

**The probe record**, with its index row in the directory README.

**The ledger row archived** to `BACKLOG-archive.md` with the count as its evidence, and its re-open
trigger recorded: a probe record shipping an unbound figure. The row's second trigger is discharged
rather than recorded, because the ledger population gets an owner in this same PR.

**A new ledger row, `BL-LEDGER-FIGURE-PROVENANCE`**, filed in `BACKLOG.md` for the comparison group.
It carries the census as probe evidence and the parent row's incidents as its cost event — three of
those four happened in ledger files — and a boundary sentence fencing it against
`BL-CLOSEOUT-COUNT-PROSE-DRIFT`, which owns closeout certifications rather than ledger figures.

Nothing else. No lint, no meta-test, no CI wiring, no corpus repair — the corpus has nothing to
repair, which is §2.2.

## §4 Documented limits

1. **The convention is unenforced, deliberately.** A record can violate it and merge. The
   alternative was measured and declined in the probe record's §4: at base `b52481446` the sketched
   gate reds 23 times with a yield of zero, and a record-level presence check yields one false
   positive and nothing else. An unenforced convention that every existing record already follows is a weaker mechanism
   than a lint and a stronger one than a lint nobody trusts.
2. **The census script is not a guard and must not be promoted into one** without re-deriving §2.1.
   Its three readings exist to show they disagree. A future arc that picks one and gates on it will
   ship the instability, not remove it.
3. **The ledger-file comparison is a ratio, not a precision measurement.** Reading C is not accurate
   for either corpus; it supports the comparison because the same instrument with the same biases
   ran over both. A finding that quotes either rate as a corpus's true provenance rate has misread
   the instrument, and `BL-LEDGER-FIGURE-PROVENANCE` says so on the row.
4. **`README.md`'s index table omits several records that predate this arc** (observed at base
   `b52481446`). That is an index
   completeness defect, a different class from figure provenance, and it is left alone rather than
   swept in — this arc adds only its own row. Named here so it is a decision rather than an
   oversight.

## §5 Acceptance criteria

- **AC-1.** `docs/superpowers/specs/ci/probes/README.md` carries a `## Stating a figure` section
  naming both binding forms (revision and producing command/script) and stating that a header line
  binds a whole record.
- **AC-2.** The census script runs from a clean checkout with no arguments and exits 0, printing the
  three readings, the tokenizer sensitivity table, the tree-binding census, and every line the
  sketched gate would red on.
- **AC-3.** The probe record states its base sha and its producing command, and every figure in it
  is reproducible by running that command at that base. This arc is subject to its own convention.
- **AC-4.** The probe record has an index row in the directory README.
- **AC-5.** `BL-DERIVED-NUMBERS-IN-DOCS-ROT` is absent from `BACKLOG.md` and present in
  `BACKLOG-archive.md`, carrying the count as evidence and both re-open triggers.
- **AC-6.** `BL-LEDGER-FIGURE-PROVENANCE` is present in `BACKLOG.md` with `**Facing:** process`, an
  `**Incident:**` field citing the parent row's measured findings, a `**Reachability:** PROBED` field
  citing this arc's census, and one sentence fencing it against `BL-CLOSEOUT-COUNT-PROSE-DRIFT`.
- **AC-7.** The ledger row's in-progress marker is removed in the PR's last commit before merge.

## §6 Lint disposition

`pnpm spec:lint` is expected clean on this document. It carries no task markers and no citation to a
plan, being a one-task arc whose plan is the acceptance criteria above.
