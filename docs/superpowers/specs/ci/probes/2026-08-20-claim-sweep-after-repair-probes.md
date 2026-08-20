# Probe record — claim sweep after a repair (`BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`)

Scripts committed beside this record under `scripts/`: `2026-08-20-naive-false-positive-census.py` produced the 1030-site census, and `2026-08-20-discriminator-recall-precision.py` produced the incident recall and the corpus
exclusion. Both are re-runnable, and their CORPUS figures move as the corpus grows — which is why the
spec asserts relations rather than cardinalities, and why each number here is dated to its commit.

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
   1030  TOTAL
```

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
   advisories must be ~0 against a population where the naive form scores ~1030.
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
arm declines and the miss is declared (spec §5 item 6). The failure direction is a missed advisory, not
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
