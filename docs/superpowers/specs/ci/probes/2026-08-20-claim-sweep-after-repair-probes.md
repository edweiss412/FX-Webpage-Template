# Probe record — claim sweep after a repair (`BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`)

Scripts committed beside this record under `scripts/`: `2026-08-20-naive-false-positive-census.py` produced the naive-form census, and `2026-08-20-discriminator-recall-precision.py` produced the incident recall and the corpus
exclusion. Both are re-runnable, and their CORPUS figures move as the corpus grows — which is why the
spec asserts relations rather than cardinalities, and why each number here is dated to its commit.

**Supplement numbering below follows this arc's DISPATCH sequence, which is not the corpus round
number** — the review corpus is keyed by (branch, merge-base) and restarts at 1 whenever the base moves,
so this arc's five spec dispatches sit 2 + 3 across two `docs/review-rounds/` files. The spec itself
carries no round numbers for the same reason.

Run 2026-08-20 on `feat/speclint-claim-sweep-after-repair` at `039533373`. These are the spec's
round-0 design inputs: the entry's own acceptance criterion, the naive mechanism's false-positive rate,
and the discriminator that closes the gap. Every number below was produced by the command beside it.

## 1. The entry's acceptance criterion — CONFIRMED, both halves

The entry names its own test: replay the R2 and R4 repairs of `fix/control-outline-border-token` and
check the mechanism flags the claims R4 F3 and R5 F1 later found. *"A mechanism that does not flag those
two is not worth building."*

### 1.1 Numeric half — the R4 repair

`fede5f084` corrected a census count 58 → 57. Measured on that commit's own tree, AFTER the repair:

```
$ git show fede5f084:<spec> | grep -c '\b58\b'   ->  2
$ git show fede5f084:<plan> | grep -c '\b58\b'   ->  9
```

The spec's own CONSEQUENCE BOUND still read "every element in the 58-row census carries…", and the plan
carried nine more. That is R5 F1 ("four more built on the old number") plus the five further occurrences
the next brief's bound-diff caught.

### 1.2 Named-claim half — the R2 repair

`c272ebed3` established the named claim:

```
+ **`components/admin/showpage/PublishedReviewModal.tsx:964` is in (b) because the classification
+   must be PER RENDER PATH, not over the union**
```

In the SAME blob, §6 still said of the SAME site: *"carries `bg-warning-bg` on its OTHER branch, so
swapping its `border-border` branch puts one more element on that entry's surface"* — the retired union
reasoning, about the very site the repair had just re-classified, two sections away. R4 F3 later found
it and replaced it with "That was a cross-path union error and is withdrawn."

**A mechanism finding a contradiction WITHIN one commit.** The signature is occurrence-tracking of the
IDENTIFIERS whose claims a repair touched — not a semantic recognizer, which keeps it out of the
"counting is not recognizing" trap.

## 2. The naive mechanism is unusable, and by how much

Naive form: after a repair changes N → M, report every surviving N in the arc's documents. Over the
1127 tracked `docs/superpowers` markdown files:

```
before/after shapes in the live corpus
    923  X -> Y / X to Y          "reduces the FILE total from 17 to 16"
     60  'was N'                  "(was 92/167 at R6; the delta is …)"
     22  'from N to M'            "expanded from 11 to 12 predicates"
     16  'N, not M'               "a 404, not 403, to avoid leaking …"
      8  'rather than N'          "The band is 3x rather than 2x because …"
      1  'no longer N'
   ----
   1030  TOTAL (raw, at first measurement)
```

**Deduplicated, and re-measured at the current base:** the six shapes OVERLAP — `"from 17 to 16"` matches
both the arrow and the from-to shape and reports the same value occurrence twice — so the honest
population is keyed on `(path, superseded-value offset)`. That gives **1021 distinct sites against 1049
raw matches**, 2.7% double-counting. The magnitude of the argument is unchanged; the number is now the
one a test could reproduce.

Roughly one per document. The before/after sentence is not an edge case to be documented as a limit —
it is the corpus's dominant shape, and an arm that reports surviving occurrences without accounting for
it produces about a thousand false advisories and is switched off on first contact.

## 3. The discriminator — a sentence-scoped co-occurrence test

**An occurrence of the superseded value N is reported UNLESS the same sentence also carries the
replacement M.** A transition sentence names both by construction; a stale claim names only N.

### 3.1 It refutes the obvious alternative first

The tempting cheaper rule is "report occurrences OUTSIDE the repair's own diff hunks". **That rule
misses the incident's sharpest survivor.** The spec's consequence bound at `fede5f084` is an ADDED line
in the repair's own hunk — the repair rewrote that line for an unrelated reason (a `disabled:` clause)
and left the 58 standing:

```
$ git show fede5f084 -- <spec> | grep -n '^[+-].*\b58\b'
105:+- **CONSEQUENCE BOUND:** every element in the 58-row census carries `border-text-faint`, …
```

So the invariant must be about the TOKEN and its sentence, never about the line's diff status. A
survivor can sit on a line the repair itself touched.

### 3.2 Recall, against the incident

```
$ python3 scripts/2026-08-20-discriminator-recall-precision.py
THE INCIDENT: repair fede5f084 changed 58 -> 57
  spec: reported 2 | excluded as transition sentences 1
  plan: reported 7 | excluded as transition sentences 2
incident totals: REPORTED 9 | EXCLUDED 3
```

All nine survivors are reported, including the consequence bound inside the repair's own hunk. The three
exclusions are the repair's own before/after sentences, which must survive.

### 3.3 Precision, against the corpus

```
corpus transition sentences: carry BOTH values 942 | carry only one 1
=> the same-sentence-carries-the-replacement rule excludes 942 of 943
```

The naive form's ~1030 false positives collapse to ~1. The rule needs no recognizer for transition
prose, no parser, and no model of English tense — it is a co-occurrence test inside one sentence, which
is the cheaper invariant that holds without parsing.

## 4. What this settles for the spec

1. Form 2 is buildable as the entry states it, and BOTH halves confirm. Form 1 is fenced out by the
   orchestrator ruling and is not relitigated.
2. The consequence bound has a number to range over from round 0: on the live corpus the arm's false
   advisories must be ~0 against a population where the naive form scores ~1021 distinct sites.
3. The numeric half's discriminator is sentence-scoped co-occurrence, validated in both directions —
   9/9 recall on the incident, 942/943 exclusion on the corpus at this commit (936 when first
   measured; the corpus grew during round 1, which is the reason the spec pins relations, not counts).
4. The "outside the diff hunks" alternative is REFUTED with a live counterexample, so it does not need
   re-deriving in review.
5. The named-claim half tracks identifiers rather than values, which is why it does not inherit the
   before/after problem: an identifier does not appear in transition sentences the way a number does.


## 5. Round-2 supplement — the refinement that FAILED, and the named half's real volume

Run 2026-08-20 after the spec's second adversarial round, by
`scripts/2026-08-20-round2-refinement-and-named-half-census.py`.

### 5.1 A half-repaired sentence cannot be discriminated by counting

Round 2 found a silent miss: one sentence carrying two claims on the same value, with only the first
repaired, now contains the replacement — so §3.1 suppresses the surviving stale claim.

```
sentence: "Update the census-length premise from 21 to 57, and the distinct-identity assertion to 58."
  occurrences of 58: 1     occurrences of 57: 1
```

The obvious refinement — exclude only when the sentence reads as ONE transition, exactly one of each —
**fails**, because a legitimate transition has precisely that shape too. Separating them requires
knowing which CLAIM each number belongs to, which is the recognizer the design exists to avoid. So the
arm declines and the miss is declared (spec §5 item 7). The failure direction is a missed advisory, not
a false one.

### 5.2 The named half's measured volume on the incident

```
files the repair touched: 4
spec: 4 occurrences at lines [153, 155, 268, 327]
plan: 4 occurrences at lines [85, 148, 149, 211]
probe record: 1 occurrence at line [64]
TOTAL occurrences of the identifier across the arc: 9
```

The spec had claimed the replay yields "the §6 identifier survivor". It yields nine occurrences, of
which the arm reports those outside the repair's hunks. AC-4 now states the measured set. The volume is
the design: a reclassified site is claimed about wherever the arc discusses it, and the advisory asks
for exactly the re-read the ledger entry wants.


## 6. Round-3 supplement — the lone outlier, characterised rather than assumed

**The figures in this supplement were measured over the then-current UNFILTERED corpus and are kept as a
record of that run; §7 and spec §2.0 supersede the POPULATION they range over.** What survives unchanged
is the outlier's identity, which is what this supplement was written to establish — the live population
census reports the same single row today, at 935 excluded and 1 not.

The discriminator's precision was reported as "942 of 943" and its single non-excluded row was described
in the spec as a transition spanning two sentences. **Instrumenting the loop refuted that.**

```
carry BOTH 947 | carry only one 1

  file: docs/superpowers/plans/2026-08-16-serialize-error-structure.md
  pair: 0 -> 1
  sentence: 200 visits clean, 201 truncates (kills <=to<, 0to1, and halved-decrement budget mutants)
```

The row is the mutation-operator NAME `0to1` inside a test title. The census regex matches it as an
arrow shape, while `0` and `1` never appear as standalone words in that sentence — so it is a FALSE HIT
OF THE CENSUS INSTRUMENT, not a miss of the discriminator. The honest statement is that the rule
excludes **every real transition sentence in the corpus it was run over**, with one census artefact
alongside — 947 of 947 in that run, 935 of 935 in the declared-population run of §7, and the SET of
non-excluded rows identical in both. The relation is the claim; neither cardinality is.

The correction matters beyond the number: the earlier text named a failure mode (`a transition spanning
two sentences`) that the corpus does not contain, and a documented limit describing a case that does not
exist is as misleading as an undocumented one that does. Characterise the outlier; do not infer it from
the shape of the count.


## 7. Round-4 supplement — the arm's own documents were in its own corpus

The question "does my guard scan a tree that contains my tests or fixtures?" answered on this arm, which
scans DOCUMENTS and whose spec and probe record ARE documents:

```
$ python3 docs/superpowers/specs/ci/probes/scripts/2026-08-20-population-census.py
  tracked docs/superpowers markdown files:      1133
  this arc's own documents, excluded by path:      2
  population actually measured below:           1131
  transition-shape sentences carrying BOTH values (excluded by the rule): 935
  ...carrying only one (NOT excluded):                                      1
  census shape hits, total:                                               936
```

936 over the declared population is exactly what was measured before either arc document existed. The
UNFILTERED figure, and the arc's contribution to it, are deliberately NOT recorded here: writing either
one down changes it, so the number would be stale in the same commit that states it — which is the
defect this supplement exists to record. **The drift it caused is the historical sequence
936 → 943 → 947 → 953**, each step chased as ordinary corpus growth when the growth was the arc writing
examples about transitions into a corpus that counts transitions.

The consequence is asymmetric, which is why it matters: a polluting example INFLATES a count the spec
elsewhere pins, so the suite passes while the number it pins is wrong. The population now excludes the
arc's own documents (spec §2.0), synthetic literals live in one shared module, and the no-collision
cover keys on that module's data rather than on a nonce convention a fixture could forget.


## 8. Round-5 supplement — three facts the arm cannot infer, measured on the incident's own arc

Every command below was run in this session, on this worktree, and its output is pasted verbatim.

The repairs of THIS round and every later one are verified in both directions by
`scripts/2026-08-20-claimed-repair-sweep.py` — every claimed repair present NOW, and every model any
round retired absent NOW, since a repair that adds the replacement while leaving the superseded text
standing passes every positive check. Witnesses accumulate across rounds rather than being replaced, so
a repair cannot regress once a later round moves on. It prints raw counts rather than a verdict, and it asserts a
must-be-PRESENT control in EACH document plus a must-be-ABSENT control before reporting anything, so a
failed read cannot masquerade as a clean sweep. Current run: 0 claimed-but-absent of 44, 0
retired-but-surviving of 14. Its first run reported one survivor and the survivor was a defect in the
WITNESS, not in the document — the historical `947 of 947` figure in §6, which the repair deliberately
KEEPS beside the population it ranges over. That is the 9.1 shape: a witness that no longer matches the
repaired text is indistinguishable from an absent repair until someone reads the section.

### 8.1 A touched identifier is not a reclassified one

The repair commit `c272ebed3` rewrites one bullet:

```
$ git show --format= --unified=0 c272ebed3 -- <the three arc documents> |
    grep -E '^[-+].*HoverHelp\.tsx:562'
-**(a) 13 sites carry another hover cue → DELETE the `hover:border-border-strong`.** …
+**(a) 12 sites carry another hover cue ON THE SAME RENDER PATH → DELETE …
```

`components/admin/HoverHelp.tsx:562` sits on BOTH lines, and its classification is unchanged — the site
this repair actually reclassified is a different one on the same bullet. Occurrences at that commit:

```
$ for f in <spec> <plan> <probe>; do git show c272ebed3:$f | grep -c -F 'components/admin/HoverHelp.tsx:562'; done
3  docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md
0  docs/superpowers/plans/2026-08-18-control-outline-border-token.md
1  docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md
```

Four occurrences, one of them the repair's own added line, so declaring this identifier draws three.
**Every one of the three is a TRUE statement about an occurrence and a FALSE statement about the
repair**, if the finding text says the repair changed that identifier's claim. This is why §3.2 makes
the changed-claim identifier the author's DECLARATION and why §3.4's wording attributes it there — the
structural description the earlier draft used ("a token the repair's diff carries on both a removed and
an added line") is satisfied by exactly this case. Spec §5 item 8 records the residue.

### 8.2 All three "same arc" inference rules are wrong on the one arc we have

```
$ git ls-tree -r --name-only c272ebed3 docs/superpowers | grep '/2026-08-18-'
docs/superpowers/plans/2026-08-18-control-outline-border-token.md
docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md
docs/superpowers/specs/2026-08-18-process-facing-mint-bar.md
docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md

$ git show c272ebed3:<spec>  | grep -c -F '2026-08-18-control-outline-border-token.md'   # spec -> plan
0
$ git show c272ebed3:<spec>  | grep -c -F 'border-border-neutral-fill-census'            # spec -> probe
1
$ git show c272ebed3:<plan>  | grep -c -F 'control-outline-border-token-design'          # plan -> spec
1
$ git show c272ebed3:<plan>  | grep -c -F 'border-border-neutral-fill-census'            # plan -> probe
1
```

Citation-following from the spec reaches the probe record and NOT the plan — where 7 of the incident's 9
survivors were. Stem matching on `control-outline-border-token` misses the probe record, which is named
`2026-08-18-border-border-neutral-fill-census.md`. Date matching pulls in `2026-08-18-process-facing-mint-bar.md`,
an unrelated arc. Each rule fails in a different direction on the only arc available to calibrate
against, which is the whole argument for the declared `--also` set in spec §3.3.

### 8.3 The unreadable-document branch is a live corpus shape

```
$ git ls-files -s docs/superpowers | awk '$1==120000 {print $1, $4}'
120000 docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M11-user-facing-docs.md
```

One tracked symlink under the swept tree. `FileResolver`'s own contract already names this case —
`/** null = tracked but unreadable OR tracked symlink (spec §7) */` above `readFileLines` in
`lib/specLint/types.ts` — so `null` is reachable from the shipped resolver rather than hypothetical.
An implementation that continues silently on it satisfies every occurrence assertion while AC-5's
"never silently skipped" is false of it, which is why §3.4 carries a third code and §6 carries the
fixture that kills the silent form.


## 9. Round-6 supplement — a finding's identity needs the column, and the replay proves it does not move

### 9.1 The live corpus collides under a line-keyed identity

At this arc's merge-base `4dfd784ed062`, for the accepted declaration `58 → 57`, over the whole
`docs/superpowers` markdown corpus:

```
$ git grep -n -P '\b58\b.*\b58\b' 4dfd784ed062 -- 'docs/superpowers/*.md' 'docs/superpowers/**/*.md' |
    grep -v '\b57\b' |
    perl -ne '$n=()=/\b58\b/g; /^([^:]+:[^:]+:\d+):/; print "$1 occurrences=$n\n"'
…/handoffs/M12-solo-dev-ux-validation.md:863                       occurrences=2
…/plans/2026-07-27-inline-later-group-own-hotel/00-overview.md:54  occurrences=2
…/plans/2026-08-09-admin-nav-badge-suspense.md:13                  occurrences=2
…/specs/ci/2026-08-16-heavy-orphan-worker-lifetime-design.md:358   occurrences=2
…/specs/ci/probes/2026-08-16-mutation-gate-weight-probe.md:141     occurrences=2
…/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.md:59  occurrences=2
…/specs/probes/2026-08-11-speclint-arm-survivor-classification.md:176  occurrences=3
…/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md:144  occurrences=3
```

Eight lines, 18 reportable occurrences, EIGHT distinct `(code, doc, line, token)` identities. Ten
occurrences are lost, and lost SILENTLY — the arm would report a smaller set that looks like a
legitimate dedup. §6 forbids positional dedup in prose while the identity key it gave could not express
the case; the key now carries the column, which `Finding.column` in `lib/specLint/types.ts` has always
supplied.

### 9.2 The historical replay is unaffected, and that is measured rather than assumed

Widening an identity tuple invites the question of whether AC-4's set moved. It does not. Sentence-scoped
co-occurrence over `fede5f084`'s three arc documents, reproducing the acceptance criterion exactly:

```
survivors: 9
    spec:220 col 395      plan:9   col 521      plan:119 col 74
    spec:282 col 47       plan:18  col 139      plan:140 col 95
    plan:7   col 246      plan:112 col 122      plan:188 col 37
excluded occurrences: 3
    spec:220 col 83       plan:79  col 54       plan:102 col 290
distinct (doc, line, token) identities among survivors = 9 vs 9 occurrences
```

Nine survivors on nine distinct lines, so both keys yield the same nine. **Note `spec:220`, which carries
one EXCLUDED and one SURVIVING occurrence of `58` on the same line** — the sentence rule separates them,
and a LINE-scoped implementation gets this line wrong in both directions at once. A line-scoped run of
the same measurement returns 7 survivors and 5 excluded occurrences, which is neither the acceptance
criterion's 9 nor its 3.

### 9.3 The reviewer was right about the corpus and the replay was not the case in point

The round's finding was raised against AC-1/AC-7 and the §6 identity, and both halves needed separating
before repair: the collision is real on the LIVE corpus (9.1) and absent from the FROZEN replay (9.2).
Attribution owes a probe even when the probe confirms the reviewer, because the repair text would
otherwise have claimed the replay was at risk when it never was.
