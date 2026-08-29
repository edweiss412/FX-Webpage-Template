# Table provenance: eleven arcs, three repair shapes, and why the marker is not one of them

**Row:** `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` (`BACKLOG.md`), archived by this arc.
**Branch:** `feat/speclint-table-provenance`. **Facing:** process. **Mint-exception:** recurrence.

The row asked for a `<!-- table: cmd=` `` ` ``…`` ` ``` -->` marker binding a stated table to a
producing command, checked the way `gate:` markers already are, and it scheduled the measurement
first: its done condition is a number outside the tooling, "rounds burned per arc on table-versus-tree
drift". That measurement ran before any of this was drafted. **It says neither arm should be built.**
What ships is a paragraph, two index rows, and a ledger move.

**One argument carries this, and it is not economic.** The corpus has already ratified that naming a
producing command is not a binding, so a marker satisfying the existence check can leave a table
exactly as drifted as it found it (§5).

One observation supports it, and is stated at the strength the records actually reach: §5's live
instance is an arc that placed its producing command beside its table and drifted anyway, stating 53
where its own command's comment says 56 and where the command returns 55 today. That demonstrates the
practice a marker would formalize does not hold the property. It is one instance, not a survey — the
census measures adjacency and purity, not how many authors follow the practice — and an earlier draft
called the practice "already widespread", which the records do not support and which is withdrawn.

**The economic argument does NOT support this disposition, and §3 says so.** An earlier draft leaned on
it and was wrong: correcting the naming count from four arcs to eleven takes the class cost from 6
rounds to about 20, which favours building. That leg is reported as it came out rather than as it was
hoped.

**Four arguments were drafted and three of them moved under measurement.** A reader who checks the
weak three and stops will misjudge how this case is built, so the ledger is stated up front:

| argument | drafted as | after measurement |
| --- | --- | --- |
| cost (§3) | decisive | **inverted** — the economics favour building |
| population (§6) | 8 tables reachable | **an upper bound**, at most 6 producing — and the screen itself under-reported by two (§6) |
| adoption (§4) | a demonstration | **thin** — the marker it leads with is 3 days old |
| structural (§5) | decisive | **holds**, and gained a live in-domain instance |
| repair shape (§5) | 3 arcs converging on a non-pointer repair | **cut to one instance.** R4 withdrew it as tautological; R5 withdrew the prevalence claim that replaced it. What is left is a single arc that placed its producing command beside its table and drifted anyway, which supports and does not carry |

The disposition rests on §5's structural argument alone, which has not moved in five rounds. §5's
second argument was rewritten three times and then cut back twice more; what is left of it is a single
demonstrated instance, which supports and does not carry. Round 5 confirmed the conclusion survives
that subtraction, and subtraction is the right terminating move on a document whose purpose is to
decline to build something: the finishing repair is fewer claims, not better ones.

## 1. Methodology

Run 2026-08-28 on `feat/speclint-table-provenance` at `8b4d521cac00`. Every POPULATION figure below is
printed by

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts --at 8b4d521cac00
```

and by nothing else. **Figures quoted FROM another record are not printed by it** and carry a
`file:line` instead: the sibling census's 39/23/15, the 53/56/55 live instance in §5, the 20/329 reach
of `--exec-red` in §6, and each arc's round count in §2. An earlier draft claimed every figure was
printed by the census, which was false and is diff review round 1 finding 1; the same finding caught
the census still printing a retyped "6 rounds across four namings" sentence of its own, which is now
deleted in favour of §5 of its output, the produced candidate population that §2 classifies. The census binds by command **and** revision, per the convention in
`docs/superpowers/specs/ci/probes/README.md` under `## Stating a figure`: a command run against a
moving tree answers differently tomorrow, so the sha is half the binding and not decoration. The
corpus grows, so an older commit reports smaller totals.

Tables come from the shipped parser, `remark` + `remark-gfm` + `blocksFrom`
(`scripts/spec-lint.ts:163`, `scripts/spec-lint.ts:757`; `scripts/lib/acCoverageBlocks.ts:124`), so the census and any arm
built later cannot disagree about what a table is. Fences come from the shipped `parseDoc`
(`lib/specLint/parse.ts:65`).

**Five corrections this arc made to its own numbers, all of them this row's own defect class arriving
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
4. **The naming count was derived the wrong way, and it changed the argument.** Counting arcs that cite
   the slug gave 4; deriving by shape gives 7 (§2). That correction inverted §3's economic leg, and §3
   now reports the inversion instead of the original claim.
5. **The census silently defaulted `--at`.** A `--at` with no value fell through to `HEAD` and printed
   that sha as though it had been requested. It now exits 2. A bad rev already failed loud; a MISSING
   one did not, which is the worse of the two failures and the one this document is about.

**Five corrections is a lot for one document, and the reason is worth stating.** Four of the five are
this row's own defect class: a figure whose binding was wrong, a recognizer disagreeing with the shipped
one, a population counted by enumeration instead of derivation, and an instrument that answered about a
tree nobody named. The class is not rare and it is not other people's; it caught the spec written to
analyse it, five times.

## 2. The namings, produced and then classified

**Eleven arcs, about 20 rounds.** The row names four. Getting from four to eleven took three
corrections to the METHOD, and the method is now the part worth reading, because two of those three
were caught by review rather than by me.

1. The first derivation grepped for citations of the slug `LIM-NUMERIC-TABLE-PROVENANCE`. That counts
   arcs which knew the slug existed, not arcs which paid, and it gave 4.
2. The second grepped for the SHAPE and gave 7. Better, but still an enumeration I wrote down, and
   diff review round 1 finding 2 showed it had missed at least one arc outright while offering no
   boundary explaining the omissions.
3. The population is now PRODUCED by the census (§5 of its output) and classified here, one row per
   candidate with a reason. That is the split the sibling arc ratified for the same problem: "the
   script produces the population, a person produces the verdict, and all 23 are printed so the
   verdict can be checked by reading"
   (`docs/superpowers/specs/ci/probes/2026-08-22-derived-number-population-census.md` §4).

**Inclusion boundary, stated so the exclusions are checkable.** An arc is INCLUDED when a review
round found a stated TABLE that its producing command did not produce, or that had no producing
command at all. A retyped scalar, a coverage table missing a case, and a claim written ahead of its
execution are adjacent shapes and are EXCLUDED, because the row's shape is a table against a command.

| arc | verdict | rounds | why |
| --- | --- | ---: | --- |
| `fix/mutation-shard-budget-six` | include | 1 | §1.3's table came from a scratch instrument while the header claimed every figure was printed by a command |
| `feat/review-modal-strip-dock` | include | 3 | three rounds, three defects, in one hand-maintained transcript |
| `feat/speclint-ac-unclaimed-arm` | include | 1 | claimed 106 enrolled plans where the quoted command returns 108 (`docs/review-rounds/feat/speclint-ac-unclaimed-arm/44b0d74b1107.md:32-33`) |
| `fix/severityless-warning-filters` | include | 1 | the published SQL could not produce the published table |
| `fix/sync-log-show-id-duration` | include | 3 | "pasted a command that could not have produced it"; R9, R10, R11 |
| `fix/shell-brace-cross-construct` | include | 4 | "ONE SCRIPT away from being reproducible for four rounds" |
| `docs/quick-wins-2-specs` | include | 1 | sweep table built from truncated (`head -10`) command output |
| `feat/speclint-red-reason-verification` | include | 1 | R5: a fenced movement table claiming HEAD while carrying a number the repair had moved |
| `docs/sync-log-emit-guard-spec` | include | 2 | the committed sweep command was unreproducible, and the disposition table omitted nine awaited hits |
| `fix/supabase-upstream-fault-class` | include | 2 | an invented extraction rule "produced a table that omitted four of the seven consumers" |
| `fix/mutation-shard-weight-seconds` | include | 1 | R4: a GREEN requiring eleven plants against a table of ten |
| **total** | | **20** | |
| `docs/review-rounds/LIMITS.md` | exclude | | the index's own description of the shape, not an arc's filing |
| `fix/screenshots-drift-instrument` | exclude | | a coverage table omitting a case, not a table disagreeing with a command |
| `perf/anchoredportal-measure-convergence` | exclude | | "a claim of execution written ahead of the execution" — authored-not-run, no table |
| `feat/fitwithinclip-measure-class` | exclude | | modelling a state machine instead of probing it, no table-versus-command defect |

The last two are outside the produced population and were named by diff review round 1; they are
listed so the boundary is applied to them in public rather than by silence.

**Round counts come from each filing's own words, never from its arc's total.** Attributing a whole
arc's rounds to one class would be the inflated figure this document exists to criticise:
`sync-log-show-id-duration` burned 44 rounds in total and 3 on this shape;
`shell-brace-cross-construct` burned 14 and 4. Those two totals are derived, not asserted — counting
distinct `(stage, baseSha, round)` triples with `status: "verdict"` across each arc's
`docs/review-rounds/<arc>/*.jsonl`, which returns 44 and 14 respectively. Where a filing is ambiguous the smaller reading is
taken, which biases the total DOWN — and down is the direction that flatters this spec, since a
larger class cost argues for building. §8 records that.

**On the launch brief's claim of further 08-28 namings** (a fifth severityless round, redtruth's own
PR, a nearmiss `TABLE-N`): the brief was right that the count was low and wrong about two of three
locations. Redtruth's arc IS a naming and is included above. `nearmiss-surface` is not: its filing
names shell predicates and red satisfiability
(`docs/review-rounds/feat/nearmiss-surface/b30413cf5e51.md`).

## 3. The economic argument, which does not support the disposition

`ac-coverage` is the nearest precedent available: a shipped, opt-in, HTML-comment marker that binds
one **table** to a command column, with declaration-governs-next-table pairing and fence immunity by
construction. Structurally the same object the row asks for, one payload field different.

| arc | spec rounds | plan rounds | diff rounds | total | declared findings |
| --- | ---: | ---: | ---: | ---: | ---: |
| `feat/planlint-ac-command-observability` | 4 | 5 | 5 | **14** | 37 |

**14 rounds and 37 findings to build it, against a class that has cost about 20 rounds. That favours
building, and it is reported because it came out that way.**

An earlier draft of this section compared the precedent's 14 rounds to the row's stated 6 and concluded
that building costs "more than twice the defect it prevents". Both halves of that comparison were
wrong, in opposite directions:

- **The class cost is ~20, not 6.** §2 produces and classifies eleven arcs where the row counted four.
- **The build cost is not all transferable.** The precedent's own filings decompose it, and its two
  largest classes are ones this arc would not pay. Three spec rounds went to a hand-rolled markdown
  reader, one defect per round (optional trailing pipe, optional leading pipe, backslash parity), which
  its filing calls "the single largest source" and notes was already ratified three weeks earlier
  (`docs/review-rounds/feat/planlint-ac-command-observability/9b1bd6715029.md`); this arc's census uses
  the shipped `remark` parser from the start. Three consecutive diff rounds went to the mdast cell view
  (dropped link destinations, then duplicate-definition precedence and `imageReference` alt, then
  titles: "one class produced a finding in THREE consecutive rounds",
  `docs/review-rounds/feat/planlint-ac-command-observability/dce1e5e2ff9b.md`), and an existence check
  on an HTML-comment payload reads no cell text at all. Strip those and roughly **7 rounds** transfer.

So the honest comparison is about 7 transferable rounds against a ~20-round class cost, and **on the
economics alone the marker would be worth building.** This section is kept, inverted, rather than
deleted, because a spec that quietly drops the leg that turned against it is doing the thing this whole
document is about. The disposition rests on §5, which the corrected numbers do not touch.

## 4. Adoption, measured on the two markers this corpus already shipped

An opt-in marker moves the done-condition number only if the arcs that write drifting tables adopt it.
Two opt-in doc markers are already shipped here, and their lifetime adoption is the best available
predictor of a third:

| marker | live uses | where |
| --- | ---: | --- |
| `ac-coverage`, opt-in table marker | 2 | its own arc's plan, and the plan immediately after it |
| `gate:`, opt-in command marker | 2 | both carrying `probed=` |

**Four real uses across 3425 tables — but the ages make this the weakest section here, and it is
reported as such.**

| marker | shipped | age at this head | live uses | when the uses landed |
| --- | --- | ---: | ---: | --- |
| `ac-coverage` | 2026-08-25 (`44c8d5510`) | **3 days** | 2 | both on its ship date |
| `gate:` | 2026-08-15 (`d9e6ef793`) | 13 days | 2 | 2026-08-17 and 2026-08-28 |

**`ac-coverage` cannot carry an adoption claim at all.** Three days old, both uses landed the day it
shipped: that is not a low adoption rate, it is no measurement of one. An earlier draft led with it,
which was the same error this document criticises elsewhere — reading a standing count as a rate.

An earlier draft gave three landing dates for two uses (diff review round 2 finding 4). Corrected by
probing the live declarations rather than the file history: the two are
`docs/superpowers/plans/2026-08-17-red-verdict-capability.md:129` and
`docs/superpowers/plans/2026-08-28-speclint-expect-n-exit-status.md:163`, whose files landed 2026-08-17
and 2026-08-28. The second landed the day this spec was written, which makes `gate:` thinner still: one
use in its first twelve days.

What survives is thin and worth stating at its true strength: no opt-in doc marker in this corpus has
yet been adopted outside its own arc's neighbourhood, and the older of the two has 2 uses in 13 days,
one of them same-day as this document.
That is weak evidence for the prediction that a third would fare the same, not a demonstration of it.
§8 carries the re-file trigger that would settle it.

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
every line, and have drifted from the tree in exactly the way the eleven namings describe. The marker
would record that the author had a command in mind. It cannot record that the numbers still match, and
the property the row wants protected is that the numbers still match.

**A live instance, from inside the probe domain.**
`docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:394` states a per-file call-site
table and prints the command producing it, one of the eleven pure commands §6 found and one of the
eight of those a CI checkout could run:

```
grep -rn "deriveAlertMessageParams(" tests/ | wc -l          # expect 56
```

The table names four files summing to **53**, and its step header says "53 of them". The command's own
comment says **56**. Run at `8b4d521cac00` the command returns **55**, across **five** files: a file the
table does not name, `tests/messages/showScopedCopy.test.ts`, now carries two sites. Three numbers for
one claim, on a table that would pass the existence arm on every line.

**This is not an authoring error, which is the point.** The table was true when it was written; the tree
moved under it. That is the convention's own sentence happening in this corpus, to a table already doing
everything the row's marker would ask for. It is also why the repair is an anchor rather than a command:
a reader told the figure was measured at a sha six weeks old learns something true and immediately
useful, and one header line already delivers it.

**And one instance shows the practice the row would formalize failing on its own terms.** This is the
supporting observation. It is deliberately small, because five rounds of review shrank it: three drafts
claimed the eleven arcs converged on a repair that was not a pointer (round 4 finding 2 showed each was
some mix of false and tautological — eight of the eleven DO relate their table to a named script, query,
command, extraction rule or committed output, so "nobody reached for a pointer" was true only if
"pointer" meant the exact unshipped HTML syntax), and a fourth called the practice "already widespread",
which round 5 finding 1 showed the records do not support either. Only ONE cited repair explicitly
places a producer beside its table, and the census measures adjacency and purity, not prevalence.

**What survives is one instance, and it is enough for what it is asked to do.**
`docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:394` prints its producing command
directly above the table, and states 53 where that command's own comment says 56 and where the command
returns 55 today. The practice was followed and the drift happened regardless, because a command names
how a figure was derived and not what it was derived from. That is a demonstration that the practice
does not hold the property, which is all this observation claims. **It is not evidence about how many
authors follow it**, and the disposition does not rest on it: §5's ratified structural argument above
is what carries the conclusion, and round 5 confirmed the conclusion survives subtracting this
paragraph entirely.

A `<!-- table: cmd=` `` ` ``…`` ` ``` -->` marker is that same practice with an HTML comment around it
and a linter able to see it. What the linter would then check is that the comment is present and
parses. It cannot check that the numbers still match, which §6 shows it could only do for at most eight
tables corpus-wide, and it is the numbers that drifted in every one of the eleven arcs. **Formalizing a
practice does not repair it when the practice itself does not hold the property.** That is the same
conclusion as the ratified ruling above, reached from the arcs' own behaviour rather than from the
ruling, and it is the only form of this argument that survives four rounds of review.

**How the eleven repairs partition, in prose because the table that held it was subtracted in round
5 and this document should not claim rows it no longer ships** (whole-diff review round 1 finding 3
caught the dangling claim). Seven made the table an OUTPUT: `fix/shell-brace-cross-construct`
(`docs/superpowers/specs/ci/2026-08-22-shell-brace-cross-construct-design.md:288`),
`fix/severityless-warning-filters` (`BACKLOG-archive.md`, its own entry),
`fix/mutation-shard-budget-six` (`docs/superpowers/specs/ci/2026-08-26-mutation-shard-budget-fit.md:4`),
`fix/mutation-shard-weight-seconds`
(`docs/review-rounds/fix/mutation-shard-weight-seconds/300a9f937b8a.md:125`),
`feat/speclint-ac-unclaimed-arm`
(`docs/superpowers/plans/ci/2026-08-26-speclint-ac-unclaimed-arm.md:38`), `docs/quick-wins-2-specs`
(`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md:103`), and
`fix/supabase-upstream-fault-class`
(`docs/review-rounds/fix/supabase-upstream-fault-class/d04d6370985f.md:15`). Two DELETED it:
`feat/review-modal-strip-dock` (`docs/superpowers/specs/2026-08-25-review-modal-strip-dock.md:1210`)
and `feat/speclint-red-reason-verification`
(`docs/review-rounds/feat/speclint-red-reason-verification/c9c71b947a85.md:21`). Two kept the table and
COMMITTED the command's raw output beside it: `fix/sync-log-show-id-duration`
(`docs/review-rounds/fix/sync-log-show-id-duration/d2a31e4aa021.md:159`) and
`docs/sync-log-emit-guard-spec` (`docs/superpowers/plans/2026-08-15-sync-log-emit-guard/plan.md:25`).

The exercise is what surfaced the fact above: the arcs that repaired by naming a command are the same
arcs whose tables had drifted while naming one.

**The narrowing that would fix that is already shipped as prose.** Command plus immutable anchor is
the convention's own form, adopted by documents today today by writing a header line. A
marker mechanizing it would be a second spelling of a live convention, and the sibling arc declined
even the record-level presence check for it: its producer red once, and that one red was wrong.

**Also weighed, and not the deciding factor.** Under opt-in the existence arm has zero false
advisories by construction, since it fires only on tables that opted in. That is a genuine difference
from the sibling's mandatory gate and it is why §4's adoption number matters rather than §5's
precision argument alone. It does not rescue the arm: an arm that is precise, cheap, and whose
satisfaction implies nothing is not worth the roughly 7 transferable rounds §3 prices it at.

**Mandatory is not on the table.** 3054 of 3425 tables carry a number. A mandatory rule opens with
roughly three thousand advisories against a corpus nobody will retrofit, and the row itself records
retrofitting as out of scope.

## 6. The truth arm does not ship, and the reason is population

The truth arm executes the command and compares. Its ceiling is the set of tables sitting near a
command that can actually be run.

| window (lines) | tables with a shell fence within it | share of 3425 |
| --- | ---: | ---: |
| 8 | 10 | 0.3% |
| 12 | 23 | 0.7% |
| 20 | 55 | 1.6% |
| 40 | 99 | 2.9% |

| at the most generous 40-line window | tables |
| --- | ---: |
| adjacent to a shell fence | 99 |
| ...whose command is pure, read-only, deterministic | 11 as the screen reports it, **13 corrected** |
| ...of those, reading a path outside the repo, so unreproducible in any CI checkout | 3 |

**At most eight tables, corpus-wide, are reachable by an executing arm, and the true figure is
smaller.** Eight is an UPPER BOUND, not a count: three of the eleven cite
`/Users/ericweiss/FX-worktrees/_briefs/*.md`, a machine-local path no checkout has, and the census
prints all eleven so the rest can be checked by reading rather than trusted. Checking them lowers it
again. Two are adjacent to a table they do not produce:
`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/README.md:13`, where the `grep -r` is prose
advice beside a file-map table, and
`docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:11`,
where the command sits inside a task instruction beside a stale-claim comparison table. The producing
population is at most six.

**The screen under-reports by two, and the correction runs against this document's own conclusion.**
The impurity regex reads a command's SEARCH TEXT as if it were shell, so
`rg -ln -e "insert into public\.(…)"` at
`docs/superpowers/plans/nav-perf/2026-06-23-nav-perf-tag-caching/01-write-site-registry.md:44` and at
`docs/superpowers/plans/nav-perf/2026-06-23-nav-perf-tag-caching/01-write-site-registry.md:63` is a pure repo read excluded for carrying `insert into` in its PATTERN. Whole-diff review round 2
finding 1 found both, and found them excluded SILENTLY, which the stated acceptance posture forbids:
correctly classified, or excluded and printed. The census now prints all nine exclusions so the
classification is checkable by reading, and two of the nine are wrong. **Corrected: 13 pure, 3 outside
the repo, 10 that a CI checkout could run.**

Three things follow, all stated rather than buried. The error ran in the direction that flatters this
document, because a smaller reachable population argues harder for declining the truth arm; at 10 of
3425 the figure is still 0.3% and the conclusion does not turn on it, but it would not have been found
without review. The repair is a PRINT rather than a wider regex, since teaching the screen shell
quoting is the recognizer growth this arc's own subject argues against. And §8's candidate population
is computed by a separate screen that already counted the `01-write-site-registry.md:44` table, which is exactly why that
section and this one disagreed until now.

**The screen cannot do better than that, and it is part of the finding.** Whether a command PRODUCES a
table is not decidable from adjacency and purity, and neither is whether its output is even the same
KIND of quantity as the table's column:
`docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md:137` states "target edits" beside a
`git grep -c` counting matching LINES, and that plan's own task 2.1a explains why the two differ by
design. Deciding either question means running the command and reading the column header, which is the
truth arm itself. The direction of the error is safe: an over-count makes the executable population
look LARGER, which argues for building the arm rather than against it.

The commands that do sit near tables and are excluded are excluded for cause, not by fastidiousness.
Classified by leading binary, the near-table blocks include `psql` and bare SQL (`create table`,
`alter`, `revoke`, `insert`, `update`), `gh`, `codex`, and `pnpm` phases that are heavy by the
semaphore's own classification. An arm executing those would run DDL, spend fleet-wide GitHub rate
limit, dispatch a paid LLM review, and take a machine-wide heavy slot, on every lint of a documentation
file.

**The existing executor's reach is the precedent.** `spec:lint --exec-red` already runs a plan's own
commands (`scripts/spec-lint.ts:562`, `scripts/spec-lint.ts:781`), and `BL-SPECLINT-RED-TRUTH-PROBE` measured six days ago
that it reaches 20 of the 329 markers declaring a state, 6.1% (`BACKLOG-archive.md:18`, that row's
archived census table; quoted here, not printed by this arc's census). That row was demoted on the measurement
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
- **A narrower arm exists, and its population is one.** `docs/review-rounds/docs/quick-wins-2-specs/97e179d831aa.md:9`
  proposes something this spec's two arguments do not reach: "a spec-lint advisory that flags a
  disposition table whose stated command's live hit count differs from the table's ROW COUNT". One
  integer against one integer. It reproduces no values, so §6's execution cost does not apply, and it
  does compare the table to the tree, so §5's structural objection does not either. **Produced** by §6 of the census (an earlier draft measured this with a scratch script and stated the
  result with nothing producing it — the same defect this document is about, in its own paperwork, for
  the third time; diff review round 2 finding 2). At `8b4d521cac00` four tables sit within 20 lines of a
  LIST-producing sweep command, and the census prints all four with their header rows so the
  classification below is checkable by reading. **Three are excluded and the population is one.**

  | table | rows | why it is or is not comparable |
  | --- | ---: | --- |
  | `docs/superpowers/plans/nav-perf/2026-06-23-nav-perf-tag-caching/01-write-site-registry.md:44` | 10 | **COMPARABLE.** One row per file, beside an `rg -ln` that lists files. |
  | `docs/superpowers/plans/2026-08-22-mutation-score-jurisdiction-gap.md:85` | 12 | **NOT.** Its rows are per-COPY dispositions, and one row stands for 35 files; the plan's own text records the command returning `files=45 lines=119` (`docs/superpowers/plans/2026-08-22-mutation-score-jurisdiction-gap.md:83`). Twelve grouped rows match neither count. Diff review round 3 finding 3; an earlier draft counted this one in. |
  | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/02-phase0-validation-state.md:11` | 7 | **NOT.** `Stale claim \| Live corrected value`, not the command's output. |
  | `docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md:676` | 3 | **NOT.** `Test \| Failure mode it catches`, beside a grep for API call sites. |

  **One instance, corpus-wide.** The sibling arc reached the same disposition for its record-level
  presence check on a producer that red once and was wrong; this one has a single comparable table.
  **Re-file trigger:** the disposition-table-over-a-sweep shape reaching six live instances, or one
  arc burning two or more rounds on it after this date.
- **The class cost is a lower bound, and the bias runs toward this spec's own conclusion.** It counts
  rounds the eleven filings named, and takes the smaller reading where a filing is ambiguous. A round
  that found a table defect without its filing recording it as one is invisible here. Worth naming
  explicitly: a HIGHER class cost argues FOR building the marker, so under-counting flatters the
  disposition. §3 already concedes the economics, so a larger true figure deepens a concession rather
  than changing the outcome. **Re-file trigger:** an arc burning three or more rounds on this shape
  AFTER 2026-08-28. Stated forward because the backward form was already true when it was written —
  `shell-brace-cross-construct` at 4 rounds and `sync-log-show-id-duration` at 3 are both cited in §2
  of this document, so a trigger phrased over history fires the instant it is authored. All four
  triggers in this section were swept for that defect; this was the only one.

## 9. Resolved scope — do not relitigate

- **Widening the recognizer to raise the truth arm's population** (parse `sql` and untagged fences,
  accept impure commands behind a sandbox). This is the fleet's measured losing move: the speclint arc
  grew a JavaScript lexer one grammar corner per round across 20 diff rounds with the finding rate
  flat. Declined before round 1 rather than after round 20.
- **Shipping the existence arm anyway as the enabling half.** Its value is conditional on the truth
  half, and §6 declines the truth half on population. An enabling half with nothing to enable is the
  roughly 7 transferable rounds of §3, spent on a comment.
- **Retrofitting historical tables.** The row records it as out of scope; §5 gives the number.
- **A mandatory binding check over `docs/**`.** Declined by the sibling arc on measurement
  (§5), and its ruling is cited rather than re-derived.
- **An ANCHOR-carrying marker (`<!-- table: cmd=`…`` at=<sha> -->`) is a different proposal and is not
  on this arc's docket.** Stated explicitly because §5 leans on the sibling arc's measurement, and read
  precisely that measurement sized a gate demanding a producing COMMAND on the line
  (`docs/superpowers/specs/ci/probes/2026-08-22-derived-number-population-census.md` §4), which is
  exactly the row's form and not the anchor form. What is already known without a new measurement:
  the convention an anchor marker would mechanize is shipped prose, the sibling's README states the
  disposition for the whole class rather than only the command variant ("There is no lint for this...
  The convention is the mechanism"), a MANDATORY anchor rule inherits §5's retrofit problem since 3054
  of 3425 tables carry a number and most documents state no sha, and an OPT-IN one inherits §4's
  adoption question, which §4 now concedes is thin in either direction. **Re-file trigger:** someone
  proposing the anchor form with its own measured population.

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
