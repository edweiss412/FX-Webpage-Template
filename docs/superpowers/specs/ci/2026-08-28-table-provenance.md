# Table provenance: the marker the row asked for, and why no lint ships

**Row:** `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` (`BACKLOG.md`), archived by this arc.
**Branch:** `feat/speclint-table-provenance`. **Facing:** process. **Mint-exception:** recurrence.

The row asked for a `<!-- table: cmd=` `` ` ``…`` ` ``` -->` marker binding a stated table to a
producing command, checked the way `gate:` markers already are, and it scheduled the measurement
first: its done condition is a number outside the tooling, "rounds burned per arc on table-versus-tree
drift". That measurement ran before any of this was drafted. **It says neither arm should be built.**
What ships is a paragraph, two index rows, and a ledger move.

Three independent measurements and one structural argument all point the same way, and the structural
one is decisive on its own: the corpus has already ratified that naming a producing command is not a
binding, so a marker satisfying the existence check can leave a table exactly as drifted as it found
it.

## 1. Methodology

Run 2026-08-28 on `feat/speclint-table-provenance` at `8b4d521cac00`. Every figure below is printed by

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts --at 8b4d521cac00
```

and by nothing else. The census binds by command **and** revision, per the convention in
`docs/superpowers/specs/ci/probes/README.md` under `## Stating a figure`: a command run against a
moving tree answers differently tomorrow, so the sha is half the binding and not decoration. The
corpus grows, so an older commit reports smaller totals.

Tables come from the shipped parser, `remark` + `remark-gfm` + `blocksFrom`
(`scripts/spec-lint.ts:163`, `scripts/spec-lint.ts:757`; `scripts/lib/acCoverageBlocks.ts:124`), so the census and any arm
built later cannot disagree about what a table is. Fences come from the shipped `parseDoc`
(`lib/specLint/parse.ts:65`).

**Three corrections this arc made to its own numbers, all of them this row's own defect class arriving
in its own paperwork.**

1. **The census read the working tree while claiming a sha.** Its first version listed files with
   `git ls-files`, which reads the index, so the figures it printed included this arc's own
   uncommitted edits to `LIMITS.md` and two READMEs while the header line said `8b4d521cac00`. It
   reported 3429 tables; at that commit there are **3425**. Worse, `git ls-files` lists only TRACKED
   files, so the census silently excluded its own spec, and committing that spec would have moved the
   totals under any reader who re-ran the command printed above. The census now reads committed
   content at a rev (`--at <rev>`, default `HEAD`) and never the working tree. A stated table is
   reproducible only against an immutable anchor, which is the convention this arc is applying to
   itself.
2. **A hand-rolled table recognizer disagreed with the shipped one.** The first census used a pipe-table
   regex and reported 3397 where `remark` reports 3425, a 28-table gap. Stated rather than quietly
   replaced: a hand-rolled recognizer disagreeing with the shipped parser is the same class of defect
   this row is about, and it is why §1 uses the shipped parser.
3. **Two producer figures were wrong.** A purity screen matching `git` by binary counted two `git add`
   lines as producing commands, and two adjacency figures were reported against different denominators
   (command blocks near tables, then tables near command blocks) without saying so.

## 2. The four namings, verified at this head

All four records the row cites are present and readable at `8b4d521cac00`:

| naming | record | rounds |
| --- | --- | ---: |
| spec | `docs/review-rounds/fix/mutation-shard-budget-six/9a621a5792ea.md:32-35` | 1 |
| spec | `docs/review-rounds/feat/review-modal-strip-dock/ae8e9544b55a.md:38-39` | 3 |
| plan | `docs/review-rounds/feat/speclint-ac-unclaimed-arm/44b0d74b1107.md:32-33` | 1 |
| diff | `docs/review-rounds/fix/severityless-warning-filters/b608e71b32b5.md` | 1 |
| **total cost of the class** | | **6** |

The round counts are the row's own, from its admissibility paragraph (`BACKLOG.md:85`): "1 here, 3 on
review-modal-strip-dock, and 1 each on the other two."

The launch brief asserted further namings on 2026-08-28 (a fifth severityless round, redtruth's own
PR, a nearmiss `TABLE-N`). **Not reproducible at this head.** `LIM-NUMERIC-TABLE-PROVENANCE` is cited
by three files, and the two 08-28 filings named carry no table-provenance naming
(`docs/review-rounds/feat/nearmiss-surface/b30413cf5e51.md` names shell predicates and red
satisfiability). The recurrence count stands at 4, which is what admits the row; it is stated as 4
rather than raised on a claim this arc cannot check.

## 3. What the class costs, and what policing it would cost

`ac-coverage` is the nearest precedent available: a shipped, opt-in, HTML-comment marker that binds
one **table** to a command column, with declaration-governs-next-table pairing and fence immunity by
construction. Structurally the same object the row asks for, one payload field different.

| arc | spec rounds | plan rounds | diff rounds | total | declared findings |
| --- | ---: | ---: | ---: | ---: | ---: |
| `feat/planlint-ac-command-observability` | 4 | 5 | 5 | **14** | 37 |

**14 rounds and 37 findings to build it. The class it would police has cost 6 rounds in four months.**
In the unit the row's own done condition names, building the marker costs more than twice the defect
it prevents, before the marker has caught anything.

## 4. Adoption, measured on the two markers this corpus already shipped

An opt-in marker moves the done-condition number only if the arcs that write drifting tables adopt it.
Two opt-in doc markers are already shipped here, and their lifetime adoption is the best available
predictor of a third:

| marker | live uses | where |
| --- | ---: | --- |
| `ac-coverage`, opt-in table marker | 2 | its own arc's plan, and the plan immediately after it |
| `gate:`, opt-in command marker | 2 | both carrying `probed=` |

**Four real uses, across 3425 tables in 1493 documents.** Each marker is adopted by the arc that built
it and by essentially nobody else. A third marker inherits that adoption curve, and a marker with two
lifetime uses cannot move rounds-burned-per-arc, because the tables that burn rounds are written by
arcs that will not carry it.

## 5. The existence arm does not ship, and the reason is structural

The existence arm is cheap: a marked table has a command, the command parses, a table follows the
declaration. `acCoverage` and `redContract` between them already show every piece
(`lib/specLint/acCoverage.ts:19-20` for the two-regex any-shape-plus-exact grammar,
`lib/specLint/acCoverage.ts:151-158` for declaration-governs-next-table,
`lib/specLint/redContract.ts:36-37` and `lib/specLint/redContract.ts:297-320` for
the `gate:` malformed, empty and unattested findings). Nothing about building it is hard.

**It is the wrong rule, and the corpus ratified that six days ago.** From
`docs/superpowers/specs/ci/probes/README.md`, shipped by `BL-DERIVED-NUMBERS-IN-DOCS-ROT`:

> Naming the producing command is not by itself a binding. It says how the figure was derived, not
> what it was derived from, and a command run against a moving tree answers differently tomorrow.

And from the census behind it
(`docs/superpowers/specs/ci/probes/2026-08-22-derived-number-population-census.md` §4), on a gate
sketched for that sibling row: 39 lines match, 23 would red, **15 of the 23 are not artifact figures
at all**, one states a figure in order to retract it, and the gate **misses the one record the anchor
screen does flag**. Its ruling generalises without modification:

> A rule whose satisfaction does not imply the property it exists to protect cannot be repaired by
> tiering.

Applied here: a table can carry `<!-- table: cmd=` `` ` ``…`` ` ``` -->`, satisfy the existence arm on
every line, and have drifted from the tree in exactly the way all four namings describe. The marker
would record that the author had a command in mind. It cannot record that the numbers still match, and
the property the row wants protected is that the numbers still match.

**The narrowing that would fix that is already shipped as prose.** Command plus immutable anchor is
the convention's own form, adopted by roughly nineteen documents today by writing a header line. A
marker mechanizing it would be a second spelling of a live convention, and the sibling arc declined
even the record-level presence check for it: its producer red once, and that one red was wrong.

**Also weighed, and not the deciding factor.** Under opt-in the existence arm has zero false
advisories by construction, since it fires only on tables that opted in. That is a genuine difference
from the sibling's mandatory gate and it is why §4's adoption number matters rather than §5's
precision argument alone. It does not rescue the arm: an arm that is precise, cheap, and whose
satisfaction implies nothing is not worth 14 rounds.

**Mandatory is not on the table.** 3054 of 3425 tables carry a number. A mandatory rule opens with
roughly three thousand advisories against a corpus nobody will retrofit, and the row itself records
retrofitting as out of scope.

## 6. The truth arm does not ship, and the reason is population

The truth arm executes the command and compares. Its ceiling is the set of tables sitting near a
command that can actually be run.

| window (lines) | tables with a shell fence within it | share of 3425 |
| --- | ---: | ---: |
| 8 | 12 | 0.4% |
| 12 | 22 | 0.6% |
| 20 | 53 | 1.5% |
| 40 | 98 | 2.9% |

| at the most generous 40-line window | tables |
| --- | ---: |
| adjacent to a shell fence | 98 |
| ...whose command is pure, repo-local, read-only, deterministic | 11 |
| ...of those, reading a path outside the repo, so unreproducible in any CI checkout | 3 |

**Eight tables, corpus-wide, are reachable by an executing arm.** The census prints all eleven so the
classification can be checked by reading rather than trusted; three of them cite
`/Users/ericweiss/FX-worktrees/_briefs/*.md`, a machine-local path no checkout has.

The commands that do sit near tables and are excluded are excluded for cause, not by fastidiousness.
Classified by leading binary, the near-table blocks include `psql` and bare SQL (`create table`,
`alter`, `revoke`, `insert`, `update`), `gh`, `codex`, and `pnpm` phases that are heavy by the
semaphore's own classification. An arm executing those would run DDL, spend fleet-wide GitHub rate
limit, dispatch a paid LLM review, and take a machine-wide heavy slot, on every lint of a documentation
file.

**The existing executor's reach is the precedent.** `spec:lint --exec-red` already runs a plan's own
commands (`scripts/spec-lint.ts:562`, `scripts/spec-lint.ts:781`), and `BL-SPECLINT-RED-TRUTH-PROBE` measured six days ago
that it reaches 20 of the 329 markers declaring a state, 6.1%. That row was demoted on the measurement
rather than built. A table-executing arm reaches 8 of 3425, 0.2%.

## 7. What ships

1. This spec and the census beside it, with their index rows.
2. `LIM-NUMERIC-TABLE-PROVENANCE` in `docs/review-rounds/LIMITS.md` gains the measured refutation and a
   narrowed re-file trigger, so the next arc that hits the shape reads why it was declined instead of
   re-deriving it.
3. A cross-reference from the probes README's `## Stating a figure` convention to tables specifically,
   since a table is where this class keeps landing and the convention currently speaks of figures.
4. `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` moves to `BACKLOG-archive.md`, demoted on measurement.

No source file under `lib/` or `scripts/` changes. No `Check` is added to `lib/specLint/types.ts`.

## 8. Documented limits, each with a re-file trigger

- **A table that disagrees with its own published command is still not detected.** Incidents 3 and 4
  both published the command; the defect was that the numbers disagreed with it. Neither arm proposed
  here catches that, and §6 is why the executing one cannot. **Re-file trigger:** a single document
  accumulating four or more tables whose producing commands are pure, repo-local and inside the repo,
  which would take the executable population from 8 to a figure where a scoped arm has a subject.
- **Adoption is a prediction, not a measurement of this marker.** §4 measures two other markers. A
  future marker shipped with a mandatory-for-new-tables rule rather than pure opt-in would have a
  different curve. **Re-file trigger:** `ac-coverage` reaching 15 live uses without a lint requiring
  it, which would refute the adoption argument on this corpus's own evidence.
- **The 6-round class cost is a lower bound.** It counts rounds the four filings named. A round that
  found a table defect without the filing recording it as one is invisible here. **Re-file trigger:**
  a filing reporting three or more rounds burned on this shape in one arc, which alone would approach
  the precedent build cost.

## 9. Resolved scope — do not relitigate

- **Widening the recognizer to raise the truth arm's population** (parse `sql` and untagged fences,
  accept impure commands behind a sandbox). This is the fleet's measured losing move: the speclint arc
  grew a JavaScript lexer one grammar corner per round across 20 diff rounds with the finding rate
  flat. Declined before round 1 rather than after round 20.
- **Shipping the existence arm anyway as the enabling half.** Its value is conditional on the truth
  half, and §6 declines the truth half on population. An enabling half with nothing to enable is 14
  rounds for a comment.
- **Retrofitting historical tables.** The row records it as out of scope; §5 gives the number.
- **A mandatory binding check over `docs/**`.** Declined by the sibling arc on measurement
  (§5), and its ruling is cited rather than re-derived.

## 10. Convergence criteria for review of this spec

**Consequence bound.** Every claim here is either produced by the committed census at the stated sha,
or is a quotation from a merged in-corpus record with a `file:line`. A figure that cannot be
reproduced by the census command is a finding; a disagreement about what the corpus *should* do is
not.

**Probe domain.** `docs/**` at `8b4d521cac00`, plus `docs/review-rounds/**/*.jsonl` for the round
counts. A probe outside that, or a constructed document, files to §8 rather than to a round.

**Threat fence.** Ordinary authoring by a contributor of this repo. Adversarial or obfuscated markdown
is out of scope and files to §8.

**Narrowing.** This spec removes a proposed surface. A finding that the removal is insufficiently
narrow is admissible; a finding proposing a wider recognizer is §9.

impeccable-gate: N/A — no UI surface
