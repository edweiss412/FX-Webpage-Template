# Warning shape vs. mutation stability — design amendment for `REF_ERROR_LITERAL`

**Status:** PROPOSED (2026-08-09, rewritten after cross-model review round 1 returned BLOCKING with 7 findings) · **Amends:** `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md` §4 · **Blocks:** branch 2 only
**Trigger:** branch 2 (`feat/mutation-ref-sub`) reached 7 rows in `newHoles`, the bucket §9 marks HARD and never deferrable.

## 1. Resolved scope — do not relitigate

1. **`REF_ERROR_LITERAL` exists, detects via post-`clean()` `includes`, and is warn-severity** — parent spec §4, ratified. Not reopened here.
2. **The 3,314-hole ledger shrink stands** — this amendment concerns only the 7 residual sites.
3. **The section anchor has real product value** — user-stated 2026-08-09: it gives the operator locating context in a several-hundred-row sheet even without a working deep-link. This is an INPUT to the decision, not a claim to re-derive.
4. **Consequence bound:** every input is handled correctly or signaled, never silently wrong. A conservative outcome plus a surfaced warning is a documented limit.
5. **Threat-model fence:** accidental authoring mistakes and export artifacts by ordinary sheet authors, plus maintainer regressions. Adversarial obfuscation is out of scope.
6. **This is a `REF_ERROR_LITERAL`-only problem** — see §3. Branches 3 and 4 provably cannot reach it. Do not re-propose a wave-wide contract on their behalf.

## 2. The mechanism

The harness scores a mutant from two functions:

- `signalEq` — full deep-equal over the signal channel (`tests/parser/mutation/oracle.ts:47`), so it compares every warning field including the anchor and the snippet.
- `newSignalFired` — **code-count only** (`oracle.ts:51-58`), so it cannot see an anchor that became more specific.

`verdict` (`oracle.ts:67`) reads `SILENT_SIGNAL_LOSS` from `payload equal && !signalEq && !stronger`. A mutation that leaves payload alone but perturbs a warning's *text* therefore scores as signal loss even though the warning still fires.

## 3. Scope is narrower than round 1 claimed

Round 1 of this document argued the wave should decide this once for three codes. **That is false, and the review proved it.** The parent spec calibrates `ROW_CELLS_FUSED` and `LEADING_COLUMN_AUTOCORRECTED` to **zero clean-corpus warnings** (§5, §6). A code with a zero baseline that fires on a mutant moves its count 0 → 1, which makes `newSignalFired` true and the verdict `SIGNALED`:

```
ROW_CELLS_FUSED               baseline=0 mutant=1 stronger=true verdict=SIGNALED
LEADING_COLUMN_AUTOCORRECTED  baseline=0 mutant=1 stronger=true verdict=SIGNALED
```

The problem is specific to a detector with a **non-zero clean-corpus baseline**, which in this wave is only `REF_ERROR_LITERAL` (24 warnings across 5 fixtures). If branch 3 or 4 later produces `newHoles`, that is evidence of a deviation from its own zero-baseline design — not a recurrence of this.

## 4. The seven sites: three mechanisms, not two

Round 1 named two mechanisms and would have mis-annotated the third.

| Sites | Operator | What moves | Count |
| --- | --- | --- | --- |
| 4 | `blank-row:remove` | `blockRef.kind` `"section"` → `"rooms"` (sections fuse) | 6 → 6 |
| 2 (`X0`, `X1`) | `merged-cell` | count drops; snippet becomes `\#REF\!  \#REF\!` | 6 → 5 |
| 1 (`X2`) | `merged-cell` | **snippet only** — `\#REF\!` → `\#REF\!  Tuesday` | 6 → 6 |

`X2` is the case that breaks a two-category vocabulary: its count never drops and its anchor never moves.

## 5. Measured shapes

Modelling the oracle exactly (`equal` = deep-equal of the warning objects; `stronger` = code count strictly up), replayed against all 7:

| Warning shape | Survives |
| --- | --- |
| `kind` + `snippet` (as implemented) | 0 / 7 |
| `kind` only | 1 / 7 |
| `kind` only, per occurrence | 3 / 7 |
| `snippet` only | 4 / 7 |
| **`snippet` only, per occurrence** | **4 / 7** |
| no anchor (code only) | 5 / 7 |
| **no anchor, per occurrence** | **7 / 7** |

Two corrections to round 1, both found by review rather than by me:

- Round 1 asserted that `snippet` only **+ per occurrence** would reach 7/7. It does not — it is **4/7**. Occurrence counting restores the count for `X0`/`X1` but cannot restore deep equality, because their snippets changed; `X2` was never a count problem at all. **That figure was inferred, not measured**, which is the same defect as the earlier raw-vs-cleaned occurrence-count bug recorded in §7.
- Only the fully bare warning reaches 7/7, and it is the one shape that carries no locating information at all.

## 6. Options, with corrected costs

**A. Bare warning (code only, per occurrence).** 7/7. Deletes both the anchor and the snippet — everything resolved-scope item 3 says the operator needs.

**B. Normalize the snippet to the matched literal, drop `kind`, count per occurrence.** Reaches 7/7 (every emitted field becomes constant), but the "snippet" is then always the string `#REF!`, which is not the cell's text and locates nothing. A rebranding of A.

**C. Keep the rich warning; ADD 7 annotated ledger rows.** Round 1 recommended this with a predicate that review showed to be **unsound and unenforceable**, and both objections stand:
  - The predicate's clause (a) — "the warning still fires" — is **existential**. A detector regression that skips one of six offending cells satisfies it: another warning still fires, payload is unchanged, only the warning channel differs. It admits exactly the class the ratchet exists to catch.
  - It is **not mechanically checkable**. `Alarm`/`KnownHole` (`tests/parser/mutation/knownHoles.ts:2-6`) record `siteId`, `kind`, `fingerprint`, `finding`, `note` — no detector code, no changed-field evidence, no payload-equality evidence, no multiplicity. `reconcileLedger` (`tests/parser/mutation/knownHoles.ts:43`) tests set membership only, and `note` is free-form and never validated. Clause (c) needs causal human judgement per row.
  - **Not viable as written.** It would need a real predicate with real evidence fields first.

**D. Make the oracle's equality tier anchor- and snippet-insensitive for warning TEXT, keeping code counts authoritative.** The principled version: the harness should measure *whether the parser noticed*, not *how it phrased it*. Code identity and multiplicity stay authoritative — so a genuine miss still drops a count and is still caught — while human-readable text stops being load-bearing for equality.
  - **Blast radius is ≤ 178 rows, not 3,701.** Review's probe: the ledger is 3,523 `wrong` + 178 `signal_loss`. `signalEq` is irrelevant to every `wrong` row, because when payload changes `verdict` consults only `stronger`. Round 1 quoted the whole-ledger figure and used it to reject D. That was wrong.
  - Text-insensitive equality alone closes the 4 `blank-row` and `X2` (text-only moves). `X0`/`X1` need per-occurrence counting as well, since their count genuinely drops.
  - **D + per-occurrence counting is the only option reaching 7/7 while keeping the operator's anchor and the cell's real text.**

## 7. Recommendation

**D + per-occurrence counting**, scoped and reviewed as its own change.

It is the only option that satisfies resolved-scope item 3 and empties the HARD bucket. Its cost was overstated by an order of magnitude in round 1, and correcting that removes the reason D was rejected. It also fixes the cause rather than annotating the symptom, so branch 5 and every future detector with a non-zero baseline inherit a harness that measures the right thing.

Two guardrails, because this edits the shared measuring instrument:
1. The change is **equality-tier only**. `newSignalFired` stays code-count-based and authoritative; nothing weakens the detection of a parser that stops noticing.
2. The ≤178 `signal_loss` rows it can affect are **re-verified explicitly** — each either stays a hole or becomes a documented closure with its mechanism, with the before/after counts stated in the PR body.

Rejected: A and B delete what item 3 says is needed. C is unsound as specified and would need a real evidence schema before it could even be evaluated.

## 8. Open questions for ratification

1. Is equality-tier text-insensitivity too broad? It makes the harness blind to a detector that keeps firing but starts emitting *wrong* text (a mis-anchored warning). Counter-argument: that is a copy/anchoring defect, which the clean-corpus calibration pins and the card-copy gates cover — not the silent-corruption class this harness exists for. A reviewer should attack this directly.
2. Should the equality tier be global, or opt-in per code? Global is simpler and treats all codes alike; opt-in confines the blast radius to `REF_ERROR_LITERAL` but adds a registry that will drift.
3. Does per-occurrence emission need its own product review? It changes what Doug sees when one cell holds two broken references (two cards, or one card naming both).

## 9. Process note

Round 1 of this document contained an unmeasured claim presented as measured (§5, the `snippet` only + per-occurrence figure) and rejected the best option using a cost figure that was wrong by ~20×. Both were caught by cross-model review, not by self-review. The measurement discipline this project applies to code — probe before asserting — applies to design documents that carry numbers, and did not get applied here.

## 10. Round 2 review — the recommendation in §7 is also holed

Cross-model review of the rewrite returned BLOCKING with 3 findings. All are accepted.

**BLOCKING — D hides a real regression, and both stated mitigations fail.** A detector regressed so a CREW warning is anchored to `rooms` keeps its count, keeps its gap class, keeps card-registry membership, and scores `ABSORBED` under D — while `sectionForWarning` (`lib/admin/step3SectionStatus.ts:75`) routes it to the wrong admin section. Probe:

```
REF count 1->1   REF gap class 1->1   card registry true->true
route crew->rooms   current SILENT_SIGNAL_LOSS   D projection equal true
```

§8 question 1 raised exactly this and then argued it away, claiming clean-corpus calibration and the card-copy gates cover it. They do not: calibration checks per-code COUNTS only (`tests/parser/cleanCorpusCalibration.test.ts:59`) and the card-copy gate checks catalog fields and code membership (`tests/messages/_metaWarningCardCopy.test.ts:138`). **Neither validates `blockRef` or `rawSnippet`.** Asking the question and then answering it with an unverified claim is the same failure mode as §9.

**NEEDS-ATTENTION — per-occurrence emission has a product cost that was presented as an open question but is in fact determined.** It produces duplicate cards and inflated gap counts today: `summarizeDataGaps` counts warning objects directly (`lib/parser/dataGaps.ts:270`) and linkless warnings are never deduplicated (`dataGaps.ts:445`). A cell holding six broken references yields six identical cards and can classify a one-cell change as a quality regression.

**NEEDS-ATTENTION — the scope narrowing in §3 is overstated.** Branches 3 and 4 are correctly excluded, but "in this wave only `REF_ERROR_LITERAL`" is false: branch 5 operates on `UNKNOWN_FIELD`, whose clean-corpus baseline is **394**, so it can exhibit the same count-stable equality problem. The defensible claim is limited to the two future codes.

### Where that leaves the four options

Every option now has a probed defect:

| Option | Defect |
| --- | --- |
| A / B (bare or normalized warning) | Deletes the locating context resolved-scope item 3 says the operator needs |
| C (general ledger-addition predicate) | Unsound (existential clause) and unenforceable (no evidence fields) |
| D (+ per-occurrence) | Hides mis-anchoring regressions; per-occurrence duplicates cards |

**The option not yet evaluated** is C-without-the-generalisation: a **one-time, enumerated, seven-row exception** ratified in this document, with no general predicate. Round 2's objections to C were specifically that the *general rule* is unsound and unenforceable — an enumerated exception needs neither, because the reviewing human sees all seven rows and their mechanisms in one diff. The ratchet would stay shrink-only by default, with additions requiring a spec amendment that names each row. That is a spec deviation and needs ratification, not an implementer's judgement.

## 11. Option E — split the verdict, do not blind the instrument

Proposed by a peer session 2026-08-09 and **replayed against the live harness here**; every number below is measured, not projected. E is not one of §6's four, and it dominates all of them.

### 11.1 The predicate

`signalKeys` (`tests/parser/mutation/oracle.ts:51`) is compared today only one-directionally, by `newSignalFired` ("did any code count go UP"). E adds the missing exact-equality tier:

```
signalKeysEq(b, m)  =  FULL multiset equality of signalKeys(b) and signalKeys(m)
                       — every W:/H:/R: key, both directions, exact counts

SILENT_SIGNAL_LOSS  =  payloadEq && !signalEq && !signalKeysEq      (unchanged, HARD, shrink-only)
SIGNAL_TEXT_DRIFT   =  payloadEq && !signalEq &&  signalKeysEq      (new bucket)
```

**Why this is sound where §6 C was not.** C's clause was EXISTENTIAL — "a warning still fires" — which a detector skipping one of six offending cells satisfies. `signalKeysEq` is UNIVERSAL: every code's count must be exactly preserved. There is no free-form predicate and no human judgement in the classifier.

### 11.2 The seven, measured

| Site | Today | E (plain) | E (occurrence-weighted) |
| --- | --- | --- | --- |
| `blank-row:remove` × 4 | SILENT_SIGNAL_LOSS | SIGNAL_TEXT_DRIFT | SIGNAL_TEXT_DRIFT |
| `merged-cell` `X0` | SILENT_SIGNAL_LOSS | SILENT_SIGNAL_LOSS | SIGNAL_TEXT_DRIFT |
| `merged-cell` `X1` | SILENT_SIGNAL_LOSS | SILENT_SIGNAL_LOSS | SIGNAL_TEXT_DRIFT |
| `merged-cell` `X2` | SILENT_SIGNAL_LOSS | SIGNAL_TEXT_DRIFT | SIGNAL_TEXT_DRIFT |

Plain E reaches 5/7; the occurrence tier is genuinely required for `X0`/`X1`, whose cell count really does drop 6 → 5. With it, **7/7** — and the HARD bucket empties with **no deviation from its never-deferrable bar**, which is what §10 escalated for.

### 11.3 Kill-cases — the classifier is not a blanket

| Injected regression | Classifies as |
| --- | --- |
| Detector skips 1 of 6 offending cells | **SILENT_SIGNAL_LOSS** (correctly HARD) |
| Cell keeps its warning but loses its literal | **SILENT_SIGNAL_LOSS** (correctly HARD — see 11.4) |
| Mis-anchor `crew` → `rooms`, counts stable (§10's BLOCKING mutant) | SIGNAL_TEXT_DRIFT — visible, unlisted, gate fails, human triages |
| Warning snippet gutted to `""` | SIGNAL_TEXT_DRIFT — same triage path |
| Warning reordering, multiset identical | SIGNAL_TEXT_DRIFT |
| One REF swapped to `UNKNOWN_FIELD` | SIGNALED — `newSignalFired` fires first and never reaches this tier |

The third row is the decisive one. §6 D **absorbed** that mutant silently, which is what made it BLOCKING. E *sees* it and files it distinctly.

The last row corrects the proposal's own rationale: a code swap does fail `signalKeysEq`, but the classifier never consults it, because `newSignalFired` is evaluated earlier. That is today's behaviour, unchanged by E — but it is not evidence for E and must not be cited as such.

### 11.4 The occurrence extractor must NOT have a zero-fallback

Two ways to weight occurrences were considered: (a) a new `occurrences: n` field on `ParseWarning`, or (b) an oracle-side extractor counting matched literals in `rawSnippet`. **(b) is preferred** — the parser stays untouched, so there is no new product-type field, no `exactOptionalPropertyTypes` fan-out, and no product surface enumerating warning fields. The cost is code-specific logic inside the instrument, which is the right place for a measurement concern.

The extractor is a **per-code registry with a default weight of 1 per warning**, so a code with no entry behaves exactly as today. Only `REF_ERROR_LITERAL` is registered now. **Branch 5 decides `UNKNOWN_FIELD`'s entry with its own probe** — needed only if its operators can fuse occurrences — and must not inherit an unprobed default; that code carries a 394-warning clean-corpus baseline (§10), so guessing there is not safe.

A naive implementation writes `(clean(snippet).match(/#REF!/g) ?? []).length || 1`. **That `|| 1` defeats the tier's soundness:**

```
literal dropped from a cell:
  with `|| 1` fallback : SIGNAL_TEXT_DRIFT     <- wrong; this is real loss
  without fallback     : SILENT_SIGNAL_LOSS    <- correct
```

Removing it costs nothing — all seven still classify as drift without it (`X0`/`X1`/`X2` and all four `blank-row` sites re-measured). A `REF_ERROR_LITERAL` warning whose cleaned snippet contains zero literals **is itself the anomaly** the softer bucket must never swallow.

### 11.5 Ratchet for the new bucket

An unlisted `SIGNAL_TEXT_DRIFT` row **fails hard**, exactly like `newHoles`. Only the triage differs: a drift row is admitted to the ledger by naming its mechanism, where a hole must be fixed or documented as a limit. Without this the new bucket becomes the dumping ground §10 warned about, and a mis-anchoring regression lands somewhere people learn to bless — reintroducing the failure both review rounds were spent eliminating.

`reconcileLedger` (`tests/parser/mutation/knownHoles.ts:43`) already partitions generically by `(siteId, kind)`, so extending `Alarm.kind` with `"text_drift"` gives drift rows the same new/fixed/drifted triage for free.

**Two bars, one classifier** — and this is what answers §10's dumping-ground objection. In §6 C the free-form `note` carried the SOUNDNESS burden, which is why review killed it. In E the machine classifier carries it, so the note is audit trail rather than predicate:

1. `signal_loss` additions stay **forbidden** — never deferrable, bar unchanged.
2. An unlisted `text_drift` row is a **hard CI failure**.
3. A drift row may be added **only in the same diff that triages it**, filling the existing `finding` and `note` fields with its mechanism. No schema growth — `KnownHole` (`tests/parser/mutation/knownHoles.ts:3-6`) already carries both.
4. **Eligibility for the softer bar is decided by the classifier, never by the author.** An author cannot move a row into the drift bucket by writing a better note.

Known drift shapes, with triage guidance:

| Shape | Triage |
| --- | --- |
| Mis-anchor (`kind` changes, counts stable) | **Investigate — likely a real regression.** This is §10's BLOCKING mutant. |
| Structure-following text move (the 7 in §11.2) | Expected under section/cell fusion; annotate and admit. |
| Reorder-only, multiset identical | Benign; annotate and admit. |
| Snippet gutted to empty | Investigate — a warning that says nothing locates nothing. |

### 11.6 Why E dominates §6

| | Keeps the anchor | HARD bucket empty | Catches mis-anchor | Sound predicate |
| --- | --- | --- | --- | --- |
| A / B | ✗ | ✓ | n/a | ✓ |
| C | ✓ | ✗ (deviation) | ✗ | ✗ |
| D | ✓ | ✓ | **✗** | ✓ |
| **E** | **✓** | **✓** | **✓** | **✓** |

E also inherits structurally: branch 5 operates on `UNKNOWN_FIELD` at a 394 clean-corpus baseline (§10), and any future non-zero-baseline code gets the same vocabulary. It fixes the instrument's missing distinction rather than annotating the symptom.

### 11.7 Blast radius — measured, and larger than the seven

Pin 1 (peer session): occurrence weighting must live ONLY in the new equality tier. `signalKeys` stays byte-for-byte unchanged and keeps feeding `newSignalFired`; a separate weighted multiset feeds `signalKeysEq` alone. If weighting leaked into `newSignalFired`, `stronger` semantics would shift and verdicts could flip across the 3,523 `wrong` rows as well, because `verdict` consults `stronger` on the payload-changed branch too.

Structurally this holds: E adds a branch only under `payloadEq && !signalEq && !stronger`, which is exactly today's `SILENT_SIGNAL_LOSS`. Every other branch of `verdict` (`oracle.ts:67-76`) is untouched. Replayed rather than argued:

```
signal_loss rows replayed      : 178   (the ENTIRE class, not a sample)
  -> reclassify to text_drift  : 143
  -> stay SILENT_SIGNAL_LOSS   :  35
wrong rows replayed (sample)   : 235
  -> verdict CHANGED           :   0
```

Two things follow, and the second was not anticipated by either session:

1. **The bound holds exactly.** Zero verdict changes outside the `signal_loss` class, confirming §6 D's corrected ≤178 figure and Pin 1's requirement.
2. **The migration is 143 rows, not 7.** 143 EXISTING ledger rows are text drift that the current vocabulary has been recording as signal loss. That is the honest reading — the instrument has been conflating these all along — but it means adopting E re-files 143 rows into the new bucket, each needing its mechanism per §11.5(iii), not merely the 7 sites this branch surfaced. The remaining **35 discriminate as genuine loss**, which is itself evidence the classifier separates the classes rather than blanket-reclassifying.

**Shape histogram of the 143, machine-derived from the warning objects (never authored):**

| Drift shape | Count | Disposition |
| --- | --- | --- |
| Snippet moved | 125 | Expected under text-mutating operators |
| Reorder-only, multiset identical | 14 | Benign |
| `blockRef.index` moved (`kind` unchanged) | 4 | Benign — positional ordinal, same class as §7's finding |
| **Mis-anchor (`blockRef.kind` changed)** | **0** | — |

**Zero mis-anchors is the safety result that makes the migration admissible.** §11.5's triage table marks mis-anchor-shaped drift as "investigate — likely a real regression", so a non-zero count here would have meant real regressions sitting mislabelled in the ledger today, to be pulled out and investigated BEFORE this classifier lands. There are none. The 4 `blockRef.index` rows were checked specifically: `kind` multisets are equal and only the positional ordinal moves.

### 11.7.1 The migration must ride WITH branch 2, not after it

Framing the 143 as a pure follow-up is **mechanically wrong**, and the seam is the reason. The moment E's classifier lands, the oracle emits `kind: "text_drift"` for those alarms while their ledger rows still read `signal_loss`. `ledgerKey` is `(siteId, kind, fingerprint)` (`tests/parser/mutation/knownHoles.ts:11`), so reconciliation sees 143 unlisted drift alarms — a hard failure under §11.5(2) — plus 143 stale rows. The first post-merge run goes red.

So branch 2 carries a **mechanical kind-flip** of the 143: `signal_loss` → `text_drift`, fingerprints untouched, `finding` set to a migration backlog ref, `note` marked as re-kinded pending mechanism triage.

**Migration is not addition, and §11.5(iii) governs additions.** The per-row-mechanism bar applies to NEW rows — the 7 this branch surfaced, each mechanism-named — and to the follow-up triage. It does not apply to the flip, because the flip is the classifier's own output applied to the ledger, with zero author judgement. This is not §11.8(1)'s shared-note defect: in §6 C the note carried the SOUNDNESS burden, which is why review killed it; here §11.5(iv) puts that burden on the classifier and the note is audit trail only.

### 11.8 Open before ratification

1. The 143-row migration (§11.7) is landed as its own change, not inside branch 2. Each row's mechanism must be named; a bulk reclassification with a shared note would recreate C's unvalidated-`note` defect at 143× the scale.
2. Whether drift rows should carry a structured mechanism field rather than free-form `note`; §10's objection to unvalidated `note` applies here too.
3. Whether reorder-with-equal-multiset (11.3 row 5) is acceptable as drift, or wants its own class.
