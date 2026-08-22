# Plan — the derived-number provenance convention

Spec: `docs/superpowers/specs/ci/2026-08-22-derived-number-provenance-convention.md` (canonical;
every § reference below is to it). Ledger row: `BL-DERIVED-NUMBERS-IN-DOCS-ROT`, archived by this
plan. Sibling filed: `BL-LEDGER-FIGURE-PROVENANCE`.

The count that decides this arc ran first, before any of it was written, because the ledger row
scheduled it that way. It came back saying the test the row sketched should not be built, so what is
left to implement is a paragraph, an index row, and a ledger move.

impeccable-gate: N/A — no UI surface

This plan touches `docs/superpowers/specs/ci/`, `docs/superpowers/plans/`, `BACKLOG.md` and
`BACKLOG-archive.md`; nothing under `app/`, `components/`, `lib/`, `app/globals.css`,
`tailwind.config.*`, or `DESIGN.md`. The marker sits on its own line because the gate reads the LINE.

---

## 0. Pre-draft code-verification pass — authored AND RUN

Docs-only arc, so the verification surface is the gates that walk this corpus rather than a citation
table over source. Every one below was RUN, not resolved by reading.

| gate | what it decides for this arc | observed |
| --- | --- | --- |
| `tests/docs/specsReadmeIndexParity.test.ts` | the new spec has an index row in `docs/superpowers/specs/ci/README.md` | **RED first**, then green — see §2 |
| `tests/docs/_metaLedgerMintBar.test.ts` | `BL-LEDGER-FIGURE-PROVENANCE` carries `**Facing:**` and, being process-facing, an `**Incident:**` | green |
| `tests/docs/_metaLedgerInProgress.test.ts` | the parent row's in-progress marker points at a live origin branch, and no archive holds in-flight work | green |
| `tests/docs/_metaLedgerReferentialIntegrity.test.ts` | every citation of the archived row still resolves | green |
| `tests/docs/_metaInvariant8Closeout.test.ts` | this plan carries the closeout marker | green |
| `pnpm spec:lint <spec>` | citations resolve, no hard findings | `summary: 0 hard, 0 advisory` |

**No gate walks the probes directory's own README index.** That is why §4 limit 4 of the spec is a
documented limit rather than a repair: the index-completeness class has no enforcement to extend, and
building one is a different arc.

## 1. What is already committed

Two commits precede this plan, in the order the ledger row dictated:

- `a7648f34b` — the census script and the probe record it produced. The count, run before anything
  was designed.
- `8d9462fa4` — the spec, the README convention, and `BL-LEDGER-FIGURE-PROVENANCE`.

The plan exists for the residue and for the acceptance run, not to re-derive either.

<!-- tasks: depth=2 -->

## Task 1 — index the spec, archive the parent row, run acceptance

<!-- task: red=`pnpm vitest run tests/docs/specsReadmeIndexParity.test.ts tests/docs/_metaLedgerMintBar.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7 -->

**The red is real and was observed before the fix.** `specsReadmeIndexParity` failed on the new spec
with `docs/superpowers/specs/ci/README.md is missing a row for: 2026-08-22-derived-number-provenance-convention.md`.
The index row closes it, and it still reproduces on demand: strip that row and the assertion reds with
that message, restore it and 21 pass.

**It was not the only red, and the first draft of this paragraph said it was.** Plan review round 1
found the second: `8d9462fa4` added six citations of `BL-CLOSEOUT-COUNT-PROSE-DRIFT` across three
files — one in `BACKLOG.md`, four in the spec, one in the probe record — and no `KNOWN_DANGLING` row,
so `_metaLedgerReferentialIntegrity` was red across that commit and was closed one commit later at
`573c72abc`. (Plan review round 2 caught this count too: a first draft said two in `BACKLOG.md`, from a grep
that counted diff LINES rather than added occurrences. Produced by
`git show 8d9462fa4 | grep '^+' | grep -o BL-CLOSEOUT-COUNT-PROSE-DRIFT | wc -l`.) That is a real gate red on this arc's own work, and the
"same change that broke them" claim below holds for the retired-identifier registry only.

Steps:

1. Add the spec's row to `docs/superpowers/specs/ci/README.md` in date order. Satisfies the red.
2. Move `BL-DERIVED-NUMBERS-IN-DOCS-ROT` from `BACKLOG.md` to `BACKLOG-archive.md` whole, with the
   count as its evidence and its one outstanding re-open trigger recorded (a probe record shipping
   an unbound figure). The second trigger is discharged, not recorded: the ledger population got an
   owner in this PR. **AC-5.**
3. Add a reconciliation-log segment naming what the count overturned, per the file's own convention.
4. **Two content-keyed registries own rows this arc's edits break.** The guard's own rule is
   `tests/docs/_retiredIdentifiers.ts:143` — `ANY task that edits, moves, or deletes an exempted line
   owns its row in the same commit`. **Only one of the two met it.** The retired-identifier exemption
   was re-keyed in `573c72abc`, the same commit whose reconciliation segment rewrote the line it keys
   on. The `KNOWN_DANGLING` row did NOT: its citations landed in `8d9462fa4` and the row followed in
   `573c72abc`, leaving one commit red. Recorded rather than smoothed over, because a plan that
   describes its own discipline more tidily than it practised it is the defect this arc is about.
   Prepending a reconciliation segment rewrites `BACKLOG.md`'s line 7, which carries a
   `RETIRED_IDENTIFIER_EXEMPTIONS` row keyed on its exact content; the row now carries the new line.
   And `BL-CLOSEOUT-COUNT-PROSE-DRIFT`, which the fence sentence must name, is filed on
   `ci/app-e2e-batch2` (PR #875) and is not on main yet, so it gets a `KNOWN_DANGLING` row in
   `tests/docs/_metaLedgerReferentialIntegrity.test.ts`. **That row is removed when #875 lands and
   this branch merges main** — and the guard's stale-row ratchet forces the removal rather than
   leaving it to memory, which is the whole reason it is safe to add one here.
5. Verify **AC-1** (the README carries `## Stating a figure` naming both binding forms and the
   header-line shortcut), **AC-2** (the census script runs with no arguments from a clean checkout
   and exits 0, printing all four sections), **AC-3** (the probe record states its base and command,
   and every figure in it reproduces at that base), **AC-4** (the probe record has its index row),
   and **AC-6** (`BL-LEDGER-FIGURE-PROVENANCE` carries `**Facing:** process`, an `**Incident:**`, a
   `**Reachability:** PROBED`, and the fence sentence against `BL-CLOSEOUT-COUNT-PROSE-DRIFT`).
   **AC-7** is discharged by the archive move in step 2 rather than by a later commit, per invariant
   12's graduating-entry clause; verify the archived entry carries `**Status:** RESOLVED` and that
   `BACKLOG.md` holds no in-progress marker for it.

**Anti-tautology.** The acceptance for AC-3 is not "the record contains numbers." It is a re-run of
the census against the corpus at the recorded base with the output compared to the record. **A bare
re-run at HEAD is the tautology to avoid here** — this arc's own commits added a record and a script
to the population, so HEAD gives different figures and matching them would prove nothing. The corpus
is materialised with `git archive b52481446 docs/superpowers/specs/ci/probes` and the instrument
pointed at it; the record carries that recipe because the script did not exist at the base it names.
Run 2026-08-22 after the round-1 repairs: both reproduction commands in the record's §0 were executed
verbatim and every figure matched — the three rates, the 653-of-725 split, 13 of 16 immutable, the one
mutable-only record, and 39/16/23 on the gate. Comparing that output to the record — the failure mode it catches
is the one this whole arc is about, an author who wrote figures that his own command does not
produce. Eating this row's cooking is the acceptance, so the check is executed, not described. The
distinction is rule 360's: naming an audit is not running it, and the arc that first named this rot
population was caught by three of its members one hour later.

<!-- tasks: end -->

## 1.5 Spec review round 1 — what it changed

Round 1 returned BLOCKING with 9 findings and every one was accepted; the repairs are in the commit
that follows this plan's revision. Four are worth carrying here because they changed the deliverable
rather than its prose:

- **The census printed wrong line numbers for 19 of the 23 gate reds.** `split()` stripped fences
  before numbering, so the reported line was an index into the stripped array. Fixed at the source;
  the hand classification in the record's §4 was then redone against correct locations and its
  partition changed.
- **A producing command is not a binding**, and the corpus had the counterexample all along. This is
  now the convention's central rule rather than one of two alternatives, and the census mechanizes
  the immutable-versus-mutable anchor distinction it turns on.
- **The probe-versus-ledger provenance ratio is withdrawn.** The instrument's bias is not constant
  across the two genres. `BL-LEDGER-FIGURE-PROVENANCE` now rests on its incidents alone.
- **The record claimed one command produced every figure in it.** It did not — `git` commands and a
  hand classification produce several. The record's §0 now names a producer per claim, which is the
  arc's own subject applied to the arc.

## 2. What is deliberately not in this plan

- **No test task**, because no test ships. §4 limit 1 of the spec carries the reasoning and the
  measurement that declined it.
- **No corpus repair task, and this is a decision rather than an absence.** Spec review round 1 found
  one record that IS unbound: `2026-08-16-timing-scan-binding-probes.md` anchors its probes to
  `origin/fix/scanner-scope-totality`, names no sha, and that branch has been deleted. It is
  unrepairable — no edit recovers the tree it measured, and writing a plausible sha into its header
  would be a guess wearing provenance's clothes. It ships as the README's worked counterexample
  instead, which is worth more than a fabricated anchor. Separately, the figure that LOOKED stale (a
  1127-vs-1173 file count) is correctly bound by its own record's header, which names `039533373`;
  the probe record keeps that as
  a recorded wrong first answer rather than quietly dropping it.
- **No layout-dimensions or transition-audit task.** No UI surface.
- **AC-7 is already discharged and is not a merge-time step**, which plan review round 1 corrected.
  Invariant 12's graduating-entry clause puts a graduating row's marker removal in the same commit
  that archives it, not in the PR's last commit — an archived entry cannot carry an in-progress
  marker, and the generic rule is unsatisfiable here because archiving moves the row the marker lives
  on. `573c72abc` did both together.
