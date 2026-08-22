# Derived-number population census — and why the sketched gate does not ship

**Probe for:** `BL-DERIVED-NUMBERS-IN-DOCS-ROT`. Run 2026-08-22 on the origin machine by
`arc-derivednums`, branch `docs/derived-numbers-provenance`, base `b52481446`.

**Producing command**, for every figure in sections 1 through 4:

```
node docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs
```

**Question.** The ledger row's first scheduled step: "grep the probe records for stated figures and
classify each as derived or hand-carried. If the hand-carried set is small and shrinking, this closes
as a convention with no test at all."

**Answer.** The arc closes as a convention with no test, and both halves of the row's reasoning turn out
to be wrong on the way there.

The size of the hand-carried set is **not measurable**: three defensible readings of "derived" give
31.7%, 59.7% and 35.1% over the same 16 records, and inspection overturns the reading that scores each
record highest (section 2). So the row's stated condition — "small and shrinking" — cannot be evaluated.

It also does not need to be. **Every one of the 16 records binds its figures to a run context**, so the
population the row scopes contains no unbound figure to catch, and the gate it sketches fires 23 times
with a yield of zero (sections 3, 4). The rot the row was filed from lives in the documents that QUOTE
probe records — archives, ledger entries, audit transcripts — a population five times larger at a tenth
the provenance rate.

---

## 1. The population, and the three readings that disagree about it

Population: every numeric token in prose (outside fenced blocks) of every `*.md` under
`docs/superpowers/specs/ci/probes/`, files walked from disk. Structural exclusions remove dates, clock
times, URLs, shas, `file:line` citations, section refs, issue refs, list ordinals, heading ordinals and
version tags; each exclusion's removal count is printed by the command so the tokenizer's contribution
to the population size is visible rather than asserted. 1,709 raw tokens reduce to **1,214 figures**.

Three readings of "derived":

- **A** — the figure appears in a fenced block that prints its command as a transcript line.
- **B** — A, plus blocks whose producing command is named in the prose above them.
- **C** — B, restricted to figures >= 100, where token collision is negligible.

```
| record | figures | derived A | derived B | figures >=100 | derived C | blocks | commanded |
| `2026-08-04-finding-format-probe.md` | 16 | 2 | 2 | 3 | 0 | 2 | 1 |
| `2026-08-04-mergebase-stability-probe.md` | 1 | 0 | 0 | 0 | 0 | 2 | 1 |
| `2026-08-16-mutation-gate-weight-probe.md` | 127 | 60 | 60 | 49 | 10 | 6 | 6 |
| `2026-08-16-premisescan-import-edge-probe.md` | 145 | 80 | 97 | 26 | 6 | 14 | 9 |
| `2026-08-16-timing-scan-binding-probes.md` | 32 | 16 | 17 | 6 | 2 | 35 | 15 |
| `2026-08-17-shell-binding-mixed-quoted-probes.md` | 192 | 0 | 166 | 2 | 0 | 18 | 10 |
| `2026-08-19-premisescan-nested-hook-leak-probe.md` | 23 | 6 | 6 | 4 | 1 | 5 | 4 |
| `2026-08-20-browser-child-wallclock-probe.md` | 97 | 0 | 36 | 47 | 36 | 4 | 3 |
| `2026-08-20-claim-sweep-after-repair-probes.md` | 73 | 45 | 45 | 23 | 6 | 17 | 10 |
| `2026-08-21-abort-reachability-correction.md` | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-08-21-intraleg-killer-audit.md` | 121 | 87 | 97 | 6 | 0 | 4 | 3 |
| `2026-08-21-intraleg-process-probe.md` | 102 | 31 | 31 | 11 | 0 | 9 | 6 |
| `2026-08-21-mutation-outcome-attribution.md` | 119 | 0 | 56 | 9 | 1 | 7 | 4 |
| `2026-08-21-premisescan-hook-population.md` | 69 | 58 | 59 | 16 | 10 | 17 | 12 |
| `2026-08-21-shell-attached-redirection-target-probes.md` | 90 | 0 | 53 | 3 | 0 | 8 | 5 |
| `README.md` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **total** | **1214** | **385** | **725** | **205** | **72** | **148** | **89** |

derived rate, reading A: 385/1214 = 31.7%
derived rate, reading B: 725/1214 = 59.7%
derived rate, reading C: 72/205 = 35.1%

single-digit share of reading B's derived set: 653 of 725 are below 100
```

**The spread is the result.** A hand-carried set of 829, 489, or 133 depending on which reading you
take is not a measurement of anything — rule 358's "when two honest counters disagree, suspect the unit
before either counter," arrived at here by disagreeing with myself three times.

## 2. Four demonstrations that the per-figure classification is unsound

Each was found by building the classifier and then checking what it had decided. They are independent.

**(a) The command lives above the fence, not inside it.** Reading A scores
`2026-08-17-shell-binding-mixed-quoted-probes.md` at 0 derived out of 192. The record names its
producing command in prose at line 12 — `` `pnpm exec tsx probe-mixed-quoted.ts` `` — and prints its
output in the fence below. That is the convention this arc was sent to write down, already in use, and
the first classifier scored it zero. Moving to reading B swings the corpus total from 385 to 725.

**(b) Reading B's win is almost entirely token collision.** 653 of its 725 derived figures are below
100. In a 50 KB record full of numeric output, the token `2` appears in some fence with near-certainty,
so a prose `2` classifies as derived by coincidence. Restricting to figures >= 100 collapses
`2026-08-17-shell-binding-mixed-quoted-probes.md` from 166 derived to **0** — its entire score under
reading B was noise.

**(c) The row's own sketched gate has 22% precision.** Section 4.

**(d) The worst-scoring record in the corpus is one of the best-provenanced.**
`2026-08-21-abort-reachability-correction.md` scores 0 derived out of 7 under every reading, because it
has no fenced blocks at all. Read it: it names the blob it mutated and the blob it produced
(`82bdd092 -> 1d457dfb`), the exact condition it neutralised, the verbatim vitest line
(`Tests  1 failed | 41 passed (42)`), and the assertion message. It is more reproducible than most
records that score well. It uses indented blocks instead of fences, and every classifier here is
blind to the difference.

Demonstration (d) is the one that settles it. A classifier that inverts the ranking on its clearest
case is not measuring provenance; it is measuring a formatting habit.

## 3. There is no live rot in the probe records, and that is the real finding

Provenance is a proxy for rot, so the rot itself was checked directly rather than assumed.

The first candidate looked decisive and was wrong, which is worth recording because the mistake is the
one this row exists to prevent. `2026-08-20-claim-sweep-after-repair-probes.md:56` states, with no
revision on the line:

> Over the 1127 tracked `docs/superpowers` markdown files:

Two independent counts on this branch's base `b52481446`:

```
$ git ls-files 'docs/superpowers/**.md' | wc -l
1173
$ git ls-files docs/superpowers | grep -c '\.md$'
1173
```

Stale by 46 — until you read the record's own header, which says "each number here is dated to its
commit" and "Run 2026-08-20 on `feat/speclint-claim-sweep-after-repair` at `039533373`". The figure is
bound at the document level. It is a correct dated measurement whose subject has since grown, which is
the disposition rule 353 endorses, not rot. Checking the figure against the tree without checking it
against the record's own binding is half a check, and it produced a confident wrong answer first.

**Re-checked properly: 16 of 16 records declare their run context.** The census's `TREE_BINDING` regex
reports 12, because it only recognises a hex sha near a keyword. The four it misses bind by other
means, verified by reading:

| record | how it binds |
| --- | --- |
| `2026-08-04-finding-format-probe.md` | dated run; corpus declared machine-local and deliberately not committed; measurement declared a draft-time input that nothing re-runs |
| `2026-08-16-timing-scan-binding-probes.md` | pinned to `origin/fix/scanner-scope-totality` (PR #827, unmerged) with the `git show` command that materialises it |
| `2026-08-21-intraleg-killer-audit.md` | named driver script `scripts/intraleg-killer-audit.mjs` plus date |
| `README.md` | states no figures |

Zero probe records state a figure about the live tree with no run context. The convention the row asks
this arc to write down is **already universal in the population the row scopes it to**.

### Where the rot actually is

The row's four measured instances name their homes, and three of them are not probe records:

| instance | document |
| --- | --- |
| first campaign's arm-C durations quoted after the second superseded them | archive entry |
| producing command naming the superseded output directory | probe record — and the stale token is a PATH, not a figure |
| audit transcript said 7 live cases against a tier of 8 | audit transcript |
| case count stale at 151 against 169 | corrected separately in the arc |

Same census, same command, pointed at the three ledger files:

```
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs <dir holding BACKLOG.md, BACKLOG-archive.md, DEFERRED.md>

| record | figures | derived A | derived B | figures >=100 | derived C |
| `BACKLOG-archive.md` | 4075 | 1048 | 1688 | 800 | 34 |
| `BACKLOG.md` | 1014 | 302 | 389 | 235 | 1 |
| `DEFERRED.md` | 89 | 0 | 0 | 3 | 0 |
| **total** | **5178** | **1350** | **2077** | **1038** | **35** |

derived rate, reading C: 35/1038 = 3.4%
```

Under the collision-resistant reading, probe records sit at **35.1%** (72/205) and the ledger files at
**3.4%** (35/1038) — a tenth the provenance rate over five times the population. Reading C is not a
precision instrument for either corpus, per section 2; what it supports is the RATIO, since the same
instrument with the same biases ran over both.

**So the row is scoped at the one population that already does this, and away from the one that does
not.** That is not a criticism the row could have made of itself — it was filed from an arc whose own
rot happened to surface in a probe record. It is what counting first was for.

The ledger population is NOT repaired here. It is adjacent to `BL-CLOSEOUT-COUNT-PROSE-DRIFT`, in
flight on another branch, and deciding who owns it is a scope call above this arc — class-sweep
exception (a), a decision this PR cannot settle. Routed to the orchestrator with this measurement
attached.

## 4. The sketched gate, sized and declined

The row sketches: "a structural test can then require, for documents under
`docs/superpowers/specs/ci/probes/`, that any line asserting a bare count near a `campaign.json`-shaped
path also names the command that produced it."

Sized against the live corpus: **39 lines match, 16 name a command on the line, 23 would red.** The
command prints all 23 so precision can be judged by reading rather than by estimate.

Classifying them by hand, the first pass found five that looked like genuine unprovenanced figures:
`…shell-binding:189` (3425 files scanned), `…nested-hook:18` (11 literals, 16 sites) and `:20` (300
cases), `…intraleg-process:130` (4049 lines), `…hook-population:184` (399 to 400). Section 3 retires all
five — each record binds its figures in its own header, so none of the five is rot. The other 18 were
never candidates:

| verdict | count | shape |
| --- | ---: | --- |
| bound at document level by the record's header | 5 | the five above |
| ordinal, not a count | 4 | probe / task / PR ordinals |
| arithmetic shown inline, self-deriving | 3 | `1,847 − 57 − 40 = 1,750` and kin |
| scenario or control-outcome table cell | 7 | `exit 2`, `0/7 perturbations`, `5/18` |
| narrative about an earlier wrong figure | 4 | the probe reporting its own correction |

**23 reds, 0 of them rot.** Not a tiering question: advisory-first does not rescue a signal with no true
positives in its population, it just gives the noise a longer lifetime. The spec-lint citation arc
already measured where this threshold sits — a hard code with an 11% false-positive floor gets waived
reflexively (`BACKLOG.md`, 2026-08-15 reconciliation segment). This is 100%.

Widening the recognizer to fix the precision is the move this fleet has measured as losing: the
speclint arc grew a JavaScript lexer one grammar corner per round across 20 diff rounds with the
finding rate flat. Declined here before the first round rather than after the twentieth.

**Also declined: a record-level presence check** ("every probe record names at least one producing
command"). It has 100% precision on its own terms and reds on exactly one record of 16 —
`2026-08-21-abort-reachability-correction.md`, which demonstration (d) shows is a false red, being one
of the best-provenanced records in the corpus. A gate whose entire live yield is one false positive is
theater.

## 5. What ships

**The convention, written down** — in the probe-directory README, because it is currently transmitted
by imitation and a 16-for-16 practice with nothing stating it survives exactly as long as the people
who learned it by reading their neighbours. Sharpened past the row's sketch by section 3: a producing
command is necessary but not sufficient, because a commanded figure about the live tree rots the moment
the tree moves. A figure is safe when it is **bound** — to a revision, a branch, a dated run, or a
named script that re-derives it.

**No test**, for the reason section 2 gives rather than the one the row expected. The row's condition
for closing as a convention was a small and shrinking hand-carried set; the honest answer is that the
set's size is not measurable, and separately that the population has no unbound figures to catch.

**No repair to the corpus**, because there is nothing to repair. The 1127 in section 3 is correctly
bound and stays as written; updating it to 1173 would re-arm the rot that binding prevents.

**Re-open trigger for the ledger row**, stated so a future reader does not re-run this census to learn
what it already answered. Not "the hand-carried set grew" — that quantity is not measurable, which is
this record's finding. Two triggers, either sufficient:

1. **A probe record ships stating a figure with no run context.** The convention is written down now,
   so this is a convention violation with a named home, not a detection problem.
2. **The ledger population gets an owner.** 1,038 collision-resistant figures at 3.4% provenance is
   where the row's own incidents live, and it is five times the size of the population the row scopes.
   That is a real queue item; it is not this one.
