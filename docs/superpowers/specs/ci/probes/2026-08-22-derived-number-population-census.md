# Derived-number population census — and what the sketched gate would and would not catch

**Probe for:** `BL-DERIVED-NUMBERS-IN-DOCS-ROT`. Run 2026-08-22 on the origin machine by
`arc-derivednums`, branch `docs/derived-numbers-provenance`. **The corpus measured is the probe
directory at `b52481446`**; the instrument is the script committed beside this record, which did not
exist at that commit.

## 0. How to reproduce, and what each figure's producer actually is

Spec review round 1 found this section's first draft claiming one command produced every figure below.
It did not, and the correction belongs at the top rather than in a limits list, because a claim wider
than its evidence is the defect this whole record is about.

**Reproduce the corpus measurement.** A bare re-run at HEAD does not match: this arc's own commits add
a record and a script to the population, so HEAD walks more records and prints different rates. The
measured corpus has to be materialised, into a directory the commands themselves clear — round 2
caught the first draft depending on `/tmp` being clean:

```
$ rm -rf /tmp/probes-at-base && mkdir -p /tmp/probes-at-base
$ git archive b52481446 docs/superpowers/specs/ci/probes | tar -x -C /tmp/probes-at-base
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs \
    /tmp/probes-at-base/docs/superpowers/specs/ci/probes
```

**Reproduce the ledger comparison** in §3. The script walks one directory, so the three ledger files
are materialised into one:

```
$ rm -rf /tmp/ledger-at-base && mkdir -p /tmp/ledger-at-base
$ for f in BACKLOG.md BACKLOG-archive.md DEFERRED.md; do \
    git show "b52481446:$f" > "/tmp/ledger-at-base/$f"; done
$ node docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs /tmp/ledger-at-base
```

**Producers, stated per claim rather than in one sweeping line:**

| claim | producer |
| --- | --- |
| every rate, count and per-record row in §1 | the census script, first command above |
| the anchor screen in §3 | the census script |
| the 23 gate reds and their line numbers in §4 | the census script |
| `docs/superpowers` file counts (1,127 / 1,173) | `git ls-tree` at two named commits, printed inline in §3. **Not `git ls-files`** — that reads the mutable working tree rather than a named commit, so it answers a different question and its value is deliberately not quoted here |
| whether `origin/fix/scanner-scope-totality` still exists | `git ls-remote`, printed inline in §3 |
| which of the 23 reds is a genuine figure about a live artifact | **hand classification**, §4 — the script produces the population, a person produces the verdict, and all 23 are printed so the verdict can be checked by reading |
| that three of the parent row's four incidents were in ledger-class documents | read off that row's `**Incident:**` field, quoted in §3 |

## 1. The population and the readings over it

Population: every numeric token in prose (outside fenced blocks) of every `*.md` under the probe
directory, files walked from disk. Structural exclusions remove dates, clock times, URLs, shas,
`file:line` citations, section refs, issue refs, list ordinals, heading ordinals and version tags;
each exclusion's removal count is printed so the tokenizer's contribution is visible, measured as the
DROP IN THE POPULATION after that exclusion is applied rather than as matches inside the excised span
(round 2 caught the first draft's column failing to reconcile). 1,709 raw tokens less 495 removed
leave **1,214 figures**.

```
derived rate, reading A: 385/1214 = 31.7%
derived rate, reading B: 725/1214 = 59.7%
derived rate, reading C:   72/205 = 35.1%

reading B's derived set below 100: 653 of 725 (the range where token collision is expected —
  this counts magnitude, it does not prove collision)

records naming at least one immutable anchor SOMEWHERE: 13 of 16
  (passes the screen; says nothing about which figure it binds)
records naming a mutable ref and NO immutable anchor — the screen's only positive finding:
  1 — 2026-08-16-timing-scan-binding-probes.md
```

- **A** — the figure appears in a fenced block that prints its command as a transcript line.
- **B** — A, plus blocks whose producing command is named in the prose above them.
- **C** — B, restricted to figures >= 100. Collision is EXPECTED below 100; nothing here measures
  how often it happens above, so C is a different population, not a cleaner reading of the same one.

**Two things this spread is NOT, both corrected from the first draft.** A and B and C are three
variants of ONE heuristic — does this numeric token also appear in a block over there — so their
disagreement shows that heuristic is unreliable, not that the quantity the ledger row asked for is
undefined. And C is not a third answer to the same question: it changes the denominator from 1,214 to
205, so it measures a subset. The honest reading of the block above is that a token-matching
classifier cannot be trusted here, which §2 demonstrates directly; the call in §5 does not rest on it.

## 2. Why a token-matching classifier cannot do this job

**(a) The command lives above the fence, not inside it.** Reading A scores
`2026-08-17-shell-binding-mixed-quoted-probes.md` at 0 derived out of 192. That record names its
producing command in prose at line 12 — `` `pnpm exec tsx probe-mixed-quoted.ts` `` — and prints its
output in the fence below, which is the convention this arc was sent to write down. Teaching the
classifier to read the preamble moves the corpus total from 385 to 725.

**(b) Most of what that buys sits where the instrument cannot be believed.** 653 of reading B's 725 derived figures are below 100 — two-digit values included, so "single-digit" would be the wrong word and an earlier draft used it.
In a long record full of numeric output the token `2` appears in some fence with near-certainty, so a
prose `2` classifies as derived by accident. Stated exactly for the clearest case: of
`2026-08-17-shell-binding-mixed-quoted-probes.md`'s 192 figures only **2** are >= 100, and **neither
is derived**. Its whole reading-B score of 166 sits in the range where the instrument is known to be
unreliable. That is not proof each of the 166 is a collision — no instrument here can establish that —
it is that the score lives entirely where the instrument cannot be believed.

**(c) The decisive one: the ranking inverts on the clearest case.**
`2026-08-21-abort-reachability-correction.md` scores 0 derived out of 7 under every reading, because it
has no fenced blocks at all. Read it: it names the blob it mutated and the blob it produced
(`82bdd092 -> 1d457dfb`), the exact condition it neutralised, the verbatim vitest line
(`Tests  1 failed | 41 passed (42)`), and the assertion message. It is more reproducible than most
records that score well. No adjustment to a token-matching rule reaches it, because the difference is
that it uses indented transcript instead of fenced transcript.

A reviewer proposed a fourth reading: classify by source context, with command output derived, locally
demonstrated arithmetic derived, and copied prose hand-carried. That is the right partition — §4 uses
it — and it is a **hand** classification. Separating "arithmetic demonstrated in place" from "figure
copied from elsewhere" is a judgment about what a sentence is doing, and building a recognizer for it
is the growth this fleet has measured as losing. The classification is done by reading, on a printed
population, at the one scale where that is affordable: 23 lines.

## 3. Binding, and the one record that is not bound

A figure that names the revision it was measured on is permanently true of that revision. **But the
anchor has to be immutable**, and that distinction is the round's most useful finding.

**The near-miss first, because it is the defect this row is about.**
`2026-08-20-claim-sweep-after-repair-probes.md:56` states, with no revision on the line, "Over the 1127
tracked `docs/superpowers` markdown files". The tree disagrees:

```
$ git ls-tree -r --name-only 039533373 docs/superpowers | grep -c '\.md$'   # the record's own base
1127
$ git ls-tree -r --name-only b52481446 docs/superpowers | grep -c '\.md$'   # this census's base
1173
```

Stale by 46 — until you read that record's header, which says "each number here is dated to its
commit" and names `039533373`. The figure is bound at document level and is correct about the tree it
names. Checking a figure against today's tree without checking it against its own record's binding is
half a check, and it produced a confident wrong answer first.

**Now the one that is genuinely unbound.** `2026-08-16-timing-scan-binding-probes.md` binds its probes
to `origin/fix/scanner-scope-totality` and prints the `git show` that materialises the scanner from it.
No sha anywhere in the record. That branch is gone:

```
$ git ls-remote origin 'refs/heads/fix/scanner-scope-totality' | wc -l
0
```

The record names nothing a reader can fetch. A first draft of this section called all 16 records bound
and described this one as "pinned"; it is not pinned, and the census now decides the question
mechanically rather than by a reader's charity — a hex object id is immutable, a branch or remote ref
moves and can be deleted.

**A note on the recognizer, found by attacking it rather than by waiting for review.** "Names an
immutable anchor" is decided by a regex, and the first version required only that a 7-to-40 character
run of `[0-9a-f]` contain a digit. That matches millisecond timestamps and CI run ids: 43 of the 87
anchors it reported in `2026-08-21-intraleg-process-probe.md` were all-digit values — 40 of them
13-digit epoch timestamps, the other three a seed and two numeric UUID prefixes. It now requires a
hex LETTER as well as a digit. Documented limit: a genuinely all-digit short sha is not recognized
(about 3.7% of ids at 7 characters, falling off fast with length), and the error it causes is calling a
bound record unbound, which is the safe direction. The companion `MUTABLE_REF` recognizes
remote-qualified refs only, so it under-counts; that matters only for a record naming no immutable
anchor, and the one such record names no ref-shaped token at all.

**The screen is a screen, and round 2 was right to press on this.** A first draft read the output as
"fourteen of fifteen records are bound." It does not support that. **One unrelated object id anywhere
in a document makes the whole document pass**, and the reviewer named two records where the anchor
present does not cover the measurement in question — `2026-08-16-mutation-gate-weight-probe.md`, whose
only sha dates a merge while two of its probes read an unnamed worktree revision, and
`2026-08-21-intraleg-killer-audit.md`, whose only sha is a merge base for a closeout diff rather than
the HEAD its audit ran on. Deciding whether a given anchor binds a given figure is a per-figure
judgment, which is exactly what §2 argues is not mechanizable here. The instrument is not going to be
widened until it can do that; that is the ratchet this fleet has measured as losing.

**So the claim is narrowed to what the screen can carry.** It has exactly one positive finding:
`2026-08-16-timing-scan-binding-probes.md` names a mutable ref and no immutable anchor at all — and
reading it confirms the screen, which is the point of a screen. It is the only record in the corpus
where a reader can say "this names nothing fetchable" without a per-figure judgment. How many of the
other fourteen are adequately bound is not a question this instrument answers, and this record no
longer claims a number for it.

### The ledger comparison, and why it is not a ratio

The first draft reported reading C over the three ledger files as 3.4% against the probe records'
35.1% and called it a tenfold provenance gap. **That comparison is withdrawn.** Reading C measures
whether a prose token reappears in a commanded block in the same file. Probe records structurally
contain commanded fences; ledger prose structurally does not. The instrument's bias is not constant
across the two genres, so "same instrument" does not license the ratio.

The binding census does not transfer either, and the reason is a unit mismatch worth stating: it asks
whether a DOCUMENT names an anchor, and a probe record is one measurement while `BACKLOG-archive.md`
is hundreds of entries carrying 123 distinct object ids between them. At file granularity every ledger
file passes trivially and the question is not being asked.

What survives is not a measurement at all, and it is enough: **three of the parent row's four measured
rot instances happened in ledger-class documents** — an archive entry quoting superseded durations, an
audit transcript saying 7 live cases against a tier of 8, and a case count stale at 151 against 169.
Sizing that population needs an entry-grained instrument that does not exist, which is why
`BL-LEDGER-FIGURE-PROVENANCE` schedules building one as its first step rather than proposing a repair.

## 4. The sketched gate, sized, and what it misses

The row sketches: "a structural test can then require, for documents under
`docs/superpowers/specs/ci/probes/`, that any line asserting a bare count near a `campaign.json`-shaped
path also names the command that produced it."

Sized against the corpus at `b52481446`: **39 lines match, 16 name a command on the line, 23 would
red.** The script prints all 23 with their file line numbers so the classification below can be
checked by reading rather than trusted.

| verdict | count | lines |
| --- | ---: | --- |
| a real figure about a real artifact | 7 | `shell-binding-mixed-quoted:364`, `nested-hook:18`, `nested-hook:20`, `intraleg-process:173`, `intraleg-process:177`, `hook-population:298`, `gate-weight:125` |
| a figure stated in order to RETRACT it | 1 | `finding-format:15` (states the superseded `n=45` while declaring it wrong) |
| probe or task ordinal, not a count | 5 | `import-edge:206`, `:300`, `:756`, `:899`, `timing-scan:1652` |
| arithmetic or derivation demonstrated in place | 3 | `gate-weight:134`, `:152`, `nested-hook:21` |
| control-outcome table cell or data tuple | 6 | `shell-attached:144`, `:145`, `:146`, `:148`, `:149`, `hook-population:143` |
| environment description, hedged | 1 | `browser-child:104` |

Round 2 corrected this partition twice: `gate-weight:125` and `finding-format:15` were filed as
narrative when both state figures about measured runs, and the intraleg lines are bound by a base in a
later section rather than by the record's header. The counts above are the corrected ones and they sum
to 23.

**What the gate's yield is, stated to the limit of the evidence.** Round 3 retired the phrase "zero
true positives", and was right to: an exact zero requires knowing that none of the seven artifact
figures is inadequately bound, and that is the per-figure judgment §3 has already said this arc does
not make. What the partition does establish, by reading lines anyone can re-read:

- **15 of the 23 are not artifact figures at all** — five ordinals, three in-place derivations, six
  control-outcome cells or data tuples, one hedged environment note. On these the gate is simply
  wrong, with no judgment required.
- **1 more states a figure in order to retract it**, which a provenance rule has no business demanding
  a command for.
- **7 are real figures about real artifacts.** How many are adequately bound is not decided here.

**And it does not need to be, because the gate is the wrong rule.** It demands a producing COMMAND on
the line. §3's counterexample shows a producing command is not a binding:
`2026-08-16-timing-scan-binding-probes.md` prints its `git show` and is still unfetchable. So a figure
can satisfy this gate on every line and remain exactly as rotten, and if any of the seven IS
inadequately bound, passing the gate would not fix it. A rule whose satisfaction does not imply the
property it exists to protect cannot be repaired by tiering — at best 15 of 23 reds are certainly
noise, and the remaining 8 would not be made safe by compliance.

**And the gate misses the one record the screen does flag.** Not one of the 23 reds comes from the
unbound content of `2026-08-16-timing-scan-binding-probes.md` — its single red, at line 1652, is a task
ordinal. The rot the screen can see is a deleted branch name in a header, and a rule about bare counts
near artifact paths cannot see it.

Widening the recognizer to fix the precision is this fleet's measured losing move: the speclint arc
grew a JavaScript lexer one grammar corner per round across 20 diff rounds with the finding rate flat.
Declined before round 1 rather than after round 20.

**Also declined: a record-level presence check** ("every probe record names at least one producing
command"). It reds on exactly one record, `2026-08-21-abort-reachability-correction.md`, which §2(c)
shows is a false red. One red, and it is wrong.

## 5. What ships

**The convention**, in the probe directory's README, with the round's correction folded in: naming a
producing command is not by itself a binding, because a command run against a moving tree answers
differently tomorrow. A figure is bound when the record names an **immutable** anchor — an object id,
or a declaration that the measurement is not reproducible and why. A branch name is not one, as
`2026-08-16-timing-scan-binding-probes.md` now demonstrates.

**No test**, for §4's measurement: the gate is the wrong rule (satisfying it does not establish
binding), at least 15 of its 23 reds are certainly noise, and it is blind to the corpus's one
screen-flagged instance.

**No corpus repair.** `2026-08-16-timing-scan-binding-probes.md` is a dated record of a measurement
taken against a branch that no longer exists, and no edit can recover the tree it named. Rewriting its
header now would be a guess dressed as provenance. It stands as the worked example the README's
convention points at, which is worth more than a fabricated sha.

**Re-open trigger:** a probe record ships stating a figure whose only anchor is mutable. The convention
is written down now, so that is a convention violation with a named home rather than a detection
problem. The census script prints the mutable-only list on every run for anyone who wants to check.
