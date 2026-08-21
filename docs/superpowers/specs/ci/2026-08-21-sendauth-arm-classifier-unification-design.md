# BL-SENDAUTH-ARM-CLASSIFIER-UNIFICATION — one receiver rule and one raw-binding predicate, consumed by every decision site

Ledger row: `BL-SENDAUTH-ARM-CLASSIFIER-UNIFICATION` (`BACKLOG.md`). Surface: `sendAuthScan`
(`tests/mutation/source/registry.ts`, `sourcePath: tests/paneCompaction/sendAuthScan.ts`,
`suitePaths: ["tests/paneCompaction/_metaSendAuthSingleRead.test.ts"]`, all operators,
`scoreFloor: 1`). Predecessor spec:
`docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md` (merged, PR #857).

**Anchor table.** Every `sendAuthScan.ts` line number in this document is stamped at BASE
`64c40a68e228d518befa6b5614859fc9ed80728b`, blob `412cadd3dd4c21513c5cbee6c514f033b7cdb859`. The
tasks of the companion plan edit that file, so **the SYMBOL is the durable identity and the line is
a drafting-time locator**. No HEAD column is carried: a HEAD column is itself a drift surface that
goes stale within the hour while every entry still resolves.

| symbol | BASE line | role |
| --- | --- | --- |
| `isFunctionLike` | 193 | hand-enumerated four-kind scope predicate |
| `isSurfaceRef` | 309 | is this type node the surface type |
| `surfaceBindings` | 316 | the binding set — a `Set<string>` of NAMES |
| `classifyUses` | 382 | rule 1, totality |
| `classifyMemberOn` | 405 | member classification through a receiver |
| `isDeclarationName` | 491 | hand-enumerated four-kind declaration-name test |
| `analyzePassReads` | 558 | rule 2, in-pass reads |
| `analyzeHandoffs` | 757 | rule 3, in-pass handoffs |
| `receiverRightmostName` | 818 | the rightmost-name rule |
| `receiverUnparen` | 824 | transparent-wrapper unwrap |
| `sendBearingFunctions` | 839 | primary discovery |
| `unreachedOccurrences` / `walkSinks` | 863 / 904 | the sink walk |
| `scanModule` | 955 | per-module composition |
| `shadowedBetween` | 991 | the shadow walk |
| `derivedAt` / `rawHere` | 1004 / 1022 | the raw-binding predicate, two spellings |

---

## §0 The bound this arc is held to

**Consequence bound.** On the live tracked pane-compaction source and send-path corpus, **zero
false advisories**, and every construct the shared rules cannot classify **REPORTS** rather than
falling silent. The forbidden directions are **silence** and **wrong attribution**. A conservative
over-report on a construct the scanner has declined to resolve is a **documented limit**, not a
finding — and it is the whole point of decline-means-report, so it is stated in §4 rather than
apologised for.

**Usefulness is not the criterion; correct attribution is.** An advisory that a human would
resolve by reading is still correct if the scanner cannot resolve it and says so.

**`PROBE DOMAIN:`** the live tracked pane-compaction source and suite tree
(`scripts/pane-compaction.ts`, `tests/paneCompaction/**`), the two instances named in the ledger
row, and the four fenced limits at predecessor spec §4 limit 8. A constructed input more than one
ordinary edit from that set files to documented limits.

**Threat fence.** Ordinary authoring mistakes by a contributor extending the send path.
Adversarial obfuscation is out of scope and files to documented limits, never to a finding.

**Score.** The surface is enrolled. `MUTATION SCORE: <k>/<t>` plus an empty unaccepted-survivor set
goes on the `GUARD SURFACE:` line of the round-1 `--stage diff` brief, measured before the first
dispatch. **Every repair in this arc edits `sendAuthScan.ts`, so every repair RETIRES the score and
owes the killer audit again with it** (rule 27, no test-side exception). The plan budgets for that
rather than discovering it at closeout.

---

## §1 The measured case

### §1.1 The headline: a NARROWED claim is only as precise as the name it is recorded against

`sendAuthScan` answers "is this a surface receiver" and "is this a raw binding" at five decision
sites, each with its own hand-written rule. The predecessor arc narrowed some of them across diff
rounds 3 and 4 and recorded which — **and the record cannot be resolved.**

The phrase "the read arm" occurs six times across four documents and resolves to **two different
functions**:

| site | resolves to | true? |
| --- | --- | --- |
| `BACKLOG.md` axis paragraph — "the read arm still takes a bare identifier" | `analyzePassReads` | **TRUE at BASE** |
| `BACKLOG.md` r4 bullet, the "NARROWED" bullet naming the read arm as having "dropped a property NAME" | `classifyUses` | true of `classifyUses` |
| round corpus `docs/review-rounds/feat/send-auth-single-read-lint/4dfd784ed062.md` — "the read arm and the handoff arm still take a bare identifier and a name" | `analyzePassReads` | true when written |
| predecessor spec §4 limit 8 preamble — "the read arm and the handoff arm now fail closed" | ambiguous | **FALSE under the `analyzePassReads` reading** |
| `sendAuthScan.ts:1029` — "Same predicate as the read arm, asked at the use" | `analyzePassReads` | true |
| fixture `shadowed-param-handoff.ts` header — "the same shadow-aware question the read arm asks" | `analyzePassReads` | true |

Three sites plus the round corpus mean `analyzePassReads`. Two sites mean `classifyUses`. **The
ledger row uses both readings fifteen lines apart, and it contradicts the round-economy filing it
was derived from.**

**This is not a bookkeeping defect; it is the reason the row exists.** Because the arms are not
individuated well enough for a claim to name one, "the read arm was narrowed at r4" reads as true
and licensed fencing only four residual shapes at predecessor spec §4 limit 8 — while
`analyzePassReads` was never narrowed at all and is measurably silent today (§3, S1). A merged spec
on `main` carries a current-fact claim that is false under one of its two available readings, in
the section whose job is to enumerate what remains silent.

**Consequence for this document, and for every artifact this arc writes:** record the FUNCTION,
never "the arm." The word "arm" appears in this spec only where a reader cannot resolve it two
ways, and every narrowing claim below names a symbol.

### §1.2 The drift is measured, not argued

Three of the four defect classes in §3 are one decision site doing what a sibling does not:

- `walkSinks` and `sendBearingFunctions` unwrap a parenthesized receiver through
  `receiverUnparen`; `analyzePassReads`, `analyzeHandoffs` and `classifyMemberOn` do not.
- `analyzeHandoffs` declines a member receiver, and `classifyMemberOn` skips the same construct —
  **so it is reported by neither.** That is diff r3 F6's exact shape ("suppressed by one arm,
  skipped by the other, reported by neither") recurring on a new pair, after the r3 repair closed
  it on the first pair.
- `shadowedBetween` enumerates four function-like kinds, and `isDeclarationName` independently
  enumerates four declaration kinds. Neither is derived; both fall silent outside their list, and
  **their two blind spots cancel** — the second is invisible until the first is repaired (§3.4).

**An agreeing control kills the stated CLAIM, never the AXIS.** The ledger row's first probe —
`this.ch.panes()` outside any declared pass — is still silent at BASE, and its bare control
`ch.panes()` is silent too. The pair AGREES, so by rule 113 that pair is not the defect, and the
row's WORDING is dead. The axis is not: the row's probe varied two things at once (receiver shape
AND pass membership), and varying only the receiver shape inside a pass produces a live silent miss
(§3.1). No reviewer may cite the agreeing control to close the axis; it closes one sentence.

### §1.3 Resolved scope — do not relitigate

Each with its ratification.

1. **The predecessor arc's decision NOT to attempt this unification at diff round 4 is RATIFIED and
   is not reopened here.** A redesign of the classification layer at round 4 is the recognizer
   ratchet the repair-direction rule refuses; the measured trajectory elsewhere is 20 and 41 rounds
   (`AGENTS.md`, "Repair direction under same-axis recurrence"). Predecessor spec §4 limit 8 files
   the unification here deliberately. **Arguing that it should have been done there is out of
   scope.**
2. **The three sending modes (`--checkpoint`, `--compact`, `--resume`) ship DISABLED** and name
   `BL-PANE-COMPACTION-SEND-AUTHORIZATION`. This arc hardens the guard over the send path. It does
   not enable a mode, move that fence, or touch the protocol.
3. **`paneCompactionCore` (`tests/mutation/source/registry.ts`) is a DIFFERENT enrolled surface**
   with its own accepted rows. This arc does not touch it and does not re-derive its rows.
4. **No control-flow analysis, no call graph, no dominance, no path counting.** Predecessor spec §4
   limit 1, fenced in both directions. A receiver that is a call result (`getChannel().send(...)`)
   stays DECLARED SILENCE under that fence — see §2.2, disposition `opaque`. Unification does not
   re-open it.
5. **The conservative over-report at §4.1 is intended behaviour, ratified by measurement**
   (§3.6): it is what "decline means report" buys, it is confined to a construct the scanner has
   declined to resolve, and the alternative designs that avoid it were measured and are worse
   (§3.5). It is not a false advisory and not a finding.
6. **Failing closed is not speculative risk.** The predecessor arc failed two decision sites closed
   and measured **zero** false advisories on the live corpus. Silence was not buying correctness; it
   was buying nothing. An argument that failing closed is risky is an argument against a
   measurement, and this spec repeats that measurement for its own design (§3.6).

### §1.4 Convergence criterion

Stated in every review brief, and every admissibility clause cites the fence and the probe domain.

1. **Consequence bound** — §0.
2. **`PROBE DOMAIN:`** — §0. Finite: the live tracked source and suite tree, the row's two
   instances, the four fenced limits.
3. **Threat fence** — §0.
4. **Score** — §0. `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on the `GUARD SURFACE:`
   line, measured before the round-1 diff dispatch, retired and re-measured after every repair.

**A "the guard does not pin what it claims" finding is admissible only with the surviving mutant
that demonstrates it** — a declared operator and a site. If no declared operator produces one, the
finding is refuted, or it is an operator proposal carrying its own before/after numbers, and
neither is a round on this diff.

---

## §2 The design

Two shared rules, consumed by every decision site. Not five rules that agree today.

### §2.1 What the five decision sites are

Named by symbol, because §1.1 is what happens when they are not.

| # | symbol | question it asks | rule at BASE |
| --- | --- | --- | --- |
| D1 | `sendBearingFunctions` | does this function call a sink on a surface? | `receiverRightmostName` + `bindings.has` |
| D2 | `walkSinks` (in `unreachedOccurrences`) | is this a sink call discovery did not classify? | `unparen` + `receiverRightmostName` + `bindings.has` |
| D3 | `classifyMemberOn` (in `classifyUses`) | is this member use classified? | receiver-hood decided at two call sites, no unwrap |
| D4 | `analyzePassReads` | is this an in-pass read of a raw binding? | `ts.isIdentifier(n.expression.expression)` — bare only |
| D5 | `analyzeHandoffs` | is this an in-pass handoff of a raw binding? | `ts.isIdentifier(argument)` — bare only |

D1 and D2 already share `receiverRightmostName` (the r3 repair). D3, D4 and D5 each answer for
themselves.

### §2.2 Rule A — the shared receiver rule

**One function. Total, three-way, and every consumer disposes of every case explicitly.**

```ts
type Receiver =
  | { kind: "surface"; name: string }   // rightmost name resolves to a surface binding
  | { kind: "foreign"; name: string }   // a rightmost name exists and is NOT a binding
  | { kind: "opaque" };                 // there is no rightmost name at all

const surfaceReceiverOf = (raw: ts.Expression, bindings: ReadonlySet<string>): Receiver
```

It unwraps parentheses (through the existing `receiverUnparen`) and takes the rightmost name
(through the existing `receiverRightmostName`). **Narrowing with parts that already ship, not with
new ones.**

**Disposition table — the whole point of the rule is that this table has no empty cells.**

| kind | D1 discovery | D2 sink walk | D3 totality | D4 reads | D5 handoffs |
| --- | --- | --- | --- | --- | --- |
| `surface` | send-bearing | proceed | classify the member | count the read | report the handoff |
| `foreign` | not a surface call — silent, and REQUIRED for zero false advisories | silent | silent | silent | silent |
| `opaque` | DECLARED SILENCE, §1.3 item 4 | DECLARED SILENCE | DECLARED SILENCE | DECLARED SILENCE | DECLARED SILENCE |

**The boundary that makes zero false advisories possible, stated explicitly because it is where a
reviewer will press.** DECLINE MEANING REPORT ranges over the **shape** dimension once surface
involvement is established — not over the involvement question itself. A `foreign` receiver is not
a surface at all; reporting it would fire on every member call in the repository. An `opaque`
receiver has no name to resolve, and reporting it re-opens the ratified no-call-graph fence. What
reports is a receiver that **IS** a surface binding in a shape a consumer previously declined:
`this.ch`, `(ch)`, `((this.ch))`. That is the entire class §3 measures.

### §2.3 Rule B — the shared raw-binding predicate

At BASE the predicate is spelled twice — `derivedAt` for `classifyUses`, `rawHere` per pass for
`analyzePassReads` and `analyzeHandoffs` — and both delegate the hard half to `shadowedBetween`,
which walks ancestors asking whether a **parameter** of an enclosing **`isFunctionLike`** node
re-declares the name.

**`shadowedBetween` is DELETED.** It is a predicate that must enumerate the scopes that can shadow,
and it falls silent — **fail-open, into the forbidden direction** — on every scope kind it does not
list. It has already been measured missing three (§3.3), and widening it one scope kind per round
is the ratchet signature this arc exists to avoid.

**What replaces it is a COUNT, which cannot be argued with** (rule 15: when the honest check would
require a recognizer, find the invariant you can hold without parsing).

> **The derivation exemption for a name is VOID inside a pass that declares that name more than
> once with a COMPETING declaration.** A declaration competes when it could be a surface binding:
> its type annotation is a surface reference (`isSurfaceRef`, already shared), or it has no
> annotation and so cannot be ruled out. A declaration annotated with any other type is provably
> not the surface and does not compete.

Three properties, all measured:

- **Total over every scope kind.** A constructor, a set accessor, a nested block, a form nobody has
  thought of — all are counted, because counting a declaration needs no notion of scope at all.
- **Fails closed.** An unresolvable double declaration makes every use of that name in the pass
  RAW, so the pass reports instead of falling silent.
- **The competing test is what keeps the live corpus at zero.** Counting every same-named
  declaration manufactured a `MULTI-READ` against correct code (§3.5); restricting the count to
  declarations that could be the surface removes that and removes a **pre-existing** false advisory
  besides (§3.6).

"Is this identifier a declaration name" is likewise **derived, not enumerated**: a name position is
a declaration name when it IS its parent's `name`, with the two expression forms that also carry a
`name` (`PropertyAccessExpression`, `QualifiedName`) excluded by name. The four-kind
`isDeclarationName` list at BASE misses accessor, method and property-assignment names — a second
enumeration of the same shape, invisible until the first is repaired (§3.4).

### §2.4 What the module loses

Deletions, not additions. The healthy direction under review pressure is a shrinking artifact.

- `shadowedBetween` — deleted whole.
- The bare-identifier receiver test in `analyzePassReads` — replaced by rule A.
- The bare-identifier argument test in `analyzeHandoffs` — replaced by rule A.
- The four-kind list in `isDeclarationName` — replaced by a derivation.
- The four-kind `isFunctionLike` survives **only** where the question is genuinely "is this a
  function-like declaration" (`passFunctionOf`, `blocksStraightLine`, `topLevelFunctions`). It is no
  longer load-bearing for shadowing, which is where its incompleteness was fail-open.

### §2.5 The corpus is DERIVED, and it is the same deliverable as the rules

**The deepest measurement in §3 is not any single silent miss. It is that the 81-fixture corpus
contains ZERO instances of all four shapes** — so the deciding suite was green throughout while
four consecutive review rounds each contributed one instance. **Review was acting as the
corpus-authoring mechanism, which is the most expensive authoring tool available.**

Adding seven fixtures for the seven instances of §3 repeats that mistake one notch further out: it
would make round 5's job to find shape eight. **The corpus is therefore ENUMERATED FROM THE AXES
THE SHARED RULES DECIDE ON, and the enumeration is only possible BECAUSE the rules are shared** —
five hand-written rules have no common axis set to enumerate over. The unified rules and the
derived corpus are ONE deliverable, and the plan ships them in one arc.

**The axes, which are exactly rule A's inputs and rule B's:**

| axis | members |
| --- | --- |
| receiver shape | bare `ch` · property `this.ch` · parenthesized `(ch)` · nested `((this.ch))` · destructured local · call result `getChannel()` |
| binding kind | `surface` · `foreign` · `opaque` (§2.2) |
| position | D1 discovery · D2 sink walk · D3 totality member · D4 in-pass read · D5 in-pass handoff |
| exemption state | no derivation · derivation, name declared once · derivation, name declared twice COMPETING · derivation, name declared twice NON-competing |

The corpus is the cross-product with impossible cells struck and a reason recorded per struck cell
— `opaque` never co-occurs with a resolvable receiver shape, a destructured local has no receiver
to parenthesize, and so on. **A struck cell carries its reason in the manifest, so a later reader
meets the argument rather than an absence.** The manifest is asserted against the fixture directory
by the suite, so a cell added without a fixture, or a fixture added outside the enumeration, fails
by default rather than being silently exempt.

**What this buys, stated as the convergence claim:** a reviewer proposing shape eight is proposing
either a cell the manifest already covers (refuted mechanically) or a NEW AXIS — which is a
registry-shaped change carrying its own before/after cross-product, not a round on this diff.

---

## §3 Probes

Every probe ran **in-process against the shipped scanner**, and every measurement in this section
is stamped with the blob it ran against, emitted from inside the measuring command.

**The probe inputs are SCRATCHPAD artifacts, not tracked fixtures, and are cited by probe id
rather than by path.** They were authored outside the repository so the spike could run without
mutating the tree, and a path-shaped citation to an untracked file is a false citation. **The plan
does not promote them one-for-one** — §2.5's derived cross-product supersedes them, and each probe
id below maps to the cell of that enumeration it exercises.

**Provenance.** Baseline blob `412cadd3dd4c21513c5cbee6c514f033b7cdb859` at BASE
`64c40a68e228d518befa6b5614859fc9ed80728b`. The design measurement ran against a COPY of the
scanner in a scratchpad outside the repository — the tracked tree was never mutated, verified by
`git status --porcelain` empty and the blob unchanged after every run.

**Two fixture counts appear in this document and they are DIFFERENT POPULATIONS**, stated here so
they do not read as a contradiction: **81** is `tests/paneCompaction/fixtures/sendAuth/`, the corpus
the comparison scans; **82** is every file under `tests/paneCompaction/fixtures/`, the digest scope
of §5.2, whose one extra member is
`tests/paneCompaction/fixtures/sendAuthLiveControl/unregistered-live-importer.ts`.

**The 81-fixture corpus contains ZERO instances of any shape in §3.1–§3.4.** That is why four
consecutive diff rounds found them one at a time with the deciding suite green throughout, and it
is the strongest single argument that the residual class is structural rather than a list of
missing node kinds.

### §3.1 The ledger row's read probe: the wording is dead, the axis is live

The row records `this.ch.panes()` outside any declared pass as silent at `5a11c30e0`. **Re-probed
at BASE: still 0 findings — and CORRECTLY so.** Its bare control `ch.panes()`, in the same file and
one variable away, is also 0. **The pair agrees**, because a read outside a declared pass is
unconstrained by rule 2. The row's probe varied receiver shape AND pass membership together.

Varying **only** the receiver shape, inside one declared pass, in one function:

```
p1-sharp-inside-pass        this.ch.panes() x2   and   local.gauge("p1") x2
  baseline: MISSING-DERIVATION@19  MULTI-READ@22:gauge  UNDECLARED-PASS@26:settle
```

`local.gauge` reports `MULTI-READ` — the positive control, proving the machinery ran on this input.
`this.ch.panes()` twice is **SILENT**. **S1: a live silent miss at `analyzePassReads`**, which
still requires `ts.isIdentifier(n.expression.expression)`.

### §3.2 The ledger row's handoff probe: it now REPORTS, and that changes nothing about the case

The row records a raw handoff of a name-shadowing parameter as silent at `5a11c30e0` — **before**
diff r4 narrowed `analyzeHandoffs`. Re-probed at BASE with a three-way control:

```
p2a-shadow-handoff          shadowing arrow parameter    RAW-HANDOFF@19:helper   REPORTS
p2b-derived-handoff         derived, no shadow           (silent)                exemption intact
p2c-ordinary-raw-handoff    ordinary raw handoff         RAW-HANDOFF@19:helper   arm runs
```

The r4 repair holds and the row's "probed silent" claim is **stale for this instance**. The
graduation corrects it. **This does not weaken the case**: the unification rests on there being
five hand-written rules that CAN drift apart, demonstrated in §3.1, §3.3 and §3.4, not on these two
still being silent.

Same file, same pass, only the argument's syntactic form varying:

```
m-handoff-shapes            helper(this.ch)  and  helper(local)
  baseline: RAW-HANDOFF@24:helper          <- helper(local) only
```

`helper(this.ch)` reports **NOTHING** — declined by `analyzeHandoffs` (not an identifier) and
skipped by `classifyMemberOn` (its parent is a call, not a property access). **S2: a live silent
miss, reported by neither**, which is diff r3 F6's shape on a new pair.

### §3.3 The shadow walk's scope enumeration is fail-open

Same shadow, three spellings of the shadowing scope:

```
p2a-shadow-handoff          arrow parameter        RAW-HANDOFF@19:helper   REPORTS
m-shadow-constructor        constructor parameter  (silent)                S3a
m-shadow-accessor           set-accessor parameter (silent)                S3b
m-shadow-const-block        const in a block       UNCLASSIFIED-USE@19:other — handoff silent
m-shadow-const-opaque       const in a block, opaque initializer  (silent) S3c
```

The `= other` spelling is surfaced only by an unrelated code on an adjacent line naming a different
thing. **The opaque spelling is FULLY silent** — probed rather than assumed, because the first
spelling would have supported a claim ("the construct is surfaced anyway") that the second refutes.

### §3.4 Two enumerations that cancel

Repairing `shadowedBetween`'s scope set alone made `m-shadow-accessor` report the shadow **and**
emit `UNCLASSIFIED-USE@19:snap` against the accessor's own NAME — a declaration, not a use. The
cause is `isDeclarationName`'s independent four-kind list, which misses accessor, method and
property-assignment names. **It was invisible while `shadowedBetween` was blind to accessor scopes,
because the first defect prevented the second from ever being reached.** Deriving the
declaration-name test removes the spurious record.

### §3.5 Three designs measured and rejected, each by a probe

| design | S1 | S2 | S3a/b | S3c | M1a/b | live | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 — `shadowedBetween` widened to `ts.isFunctionLike` | closed | closed | closed | **SILENT** | closed | 0 | rejected: leaves a measured silent miss |
| v2 — unrefined declaration count | closed | closed | closed | closed | closed | 0 | **rejected: manufactures `MULTI-READ` against correct code** |
| v3 — count restricted to COMPETING declarations | closed | closed | closed | closed | closed | 0 | **adopted** |

**Fenced in BOTH directions.** v1 and v2 are **not to be re-proposed**, and v3 is **not to be
re-litigated back toward them**. A forced change later reversed is a review defect chargeable to the
probe-less acceptance, so each rejection above carries the probe that produced it and each is
recorded here rather than in a commit message. A reviewer preferring v1 is preferring a measured
silent miss (S3c, fully silent); a reviewer preferring v2 is preferring a measured false advisory
against correct code.

**The claim I had to withdraw, recorded because the withdrawal is the evidence.** v2 appeared safe
under a confinement argument — "the over-report can only land on a pass that is already reporting,
because voiding the exemption requires a duplicate declaration whose own uses report under the same
rule." Probed at its boundary with an **unused** colliding declaration
(`m-unused-collision`): baseline silent, v2 emits `MULTI-READ@18:panes`, nothing else reports.
**The confinement claim is false and the argument was plausible.** It was killed by a probe, not by
re-reading.

### §3.6 The adopted design, measured

```
FIXTURE CORPUS: 81 scanned, 2 moved, 79 identical
LIVE CORPUS:    baseline 0 findings, spike 0 findings
```

| probe | baseline | v3 | |
| --- | --- | --- | --- |
| S1 `p1-sharp-inside-pass` | silent on `panes` | `MULTI-READ@20:panes` | closed |
| S2 `m-handoff-shapes` | `helper(this.ch)` silent | `RAW-HANDOFF@23:helper` | closed |
| S3a `m-shadow-constructor` | silent | `RAW-HANDOFF@20:helper` | closed |
| S3b `m-shadow-accessor` | silent | `RAW-HANDOFF@20:helper` | closed, no spurious record |
| S3c `m-shadow-const-opaque` | silent | `RAW-HANDOFF@21:helper` | closed |
| M1a `m-read-parens` | no `MULTI-READ` for `(ch).gauge` | `MULTI-READ@18:gauge` | closed |
| M1b `m-handoff-parens` | no report for `helper((ch))` | `RAW-HANDOFF@18:helper` | closed |
| CTL `p2a-shadow-handoff` | reports | reports, unchanged | no regression |
| NEG `p2b-derived-handoff` | silent | silent | exemption intact |
| NEG `p1-outside-pass` | silent | silent | correct silence preserved |
| NEG `m-unused-collision` | silent | silent | v2's false advisory absent |

**A pre-existing false advisory is REMOVED.** At BASE, `m-coincidental-same-read-twice` reports
`RAW-HANDOFF@19:label` against a parameter typed **`string`** that merely shares a name with a
surface binding, because `surfaceBindings` returns a `Set<string>` of NAMES. Under v3 that report
is gone. The name-keyed binding set is itself untouched by this arc and is dispositioned at §4.2.

**The two moved fixtures, per fixture, because any fixture movement reads as a regression until
someone says otherwise.** Both gains are **additive** — nothing is removed from either, so no
ratified expectation is lost — and **neither fixture goes from silent to noisy: both already
reported at BASE**, which is what they were authored to pin.

| fixture | added | why it is correct |
| --- | --- | --- |
| `shadowed-param-handoff.ts` | `RAW-HANDOFF@38:inner` at `return inner(snap);` | The pass declares `snap` twice — `const snap: Channel = { ...ch }` and the inner arrow's `(snap: Channel)` — both competing surface-typed declarations. Under §2.3 the exemption is void for `snap` throughout that pass, so handing it to `inner` is a handoff of a binding the scanner declines to resolve. The fixture's ORIGINAL finding (`leak(snap)` inside the shadow) is unchanged. |
| `same-pass-shadowed-derivation.ts` | `RAW-HANDOFF@35:inner` at `return inner(snap);` | Identical structure and identical reason. Its original finding (the doubled read inside the shadowing arrow) is unchanged. |

Their two suite expectations change, and the plan owns that as a task with its own red rather than
as an incidental edit — a silently updated expectation is indistinguishable from a regression
someone accommodated.

---

## §4 Documented limits

### §4.1 The intended conservative over-report

**A pass that declares one name twice with two competing possibly-surface declarations loses the
derivation exemption for that name throughout that pass**, so every use of it — including uses a
reader resolves to the derivation — is RAW.

This is **decline-means-report working as specified**, not a false advisory: the scanner has two
candidate declarations, no resolver, and the fail-closed answer is to report.

**Live-corpus occurrence count: 0**, over a stated population — 576 files walked under
`["scripts","lib"]`, 1 enrolled module, 1 declared pass. Measured through the SHIPPED marker
machinery (`markersIn`, `derivationsIn`, `surfaceBindings`, `isSurfaceRef`) rather than a
re-modelling of it.

**And the zero is mechanical, not lucky.** The live pass DOES contain two doubled declarations —
`gone` and `nonce`, each declared twice with no annotation, so each competes under the
cannot-be-ruled-out branch. **Both are INERT**: the exemption-void rule only reaches a name that is
a DERIVATION in that pass, and neither is. Reporting the unqualified count (2) rather than the
gating count (0) would have been alarming and wrong, which is why the number is qualified here.

**The honest boundary, with its probe:** with the competing declaration **unused**, the over-report
is not accompanied by any other finding (`m-unused-surface-collision`: baseline silent, v3
`MULTI-READ@18:panes`). It is not confined to already-failing modules — §3.5 records that
confinement claim being probed FALSE.

**Re-file when:** the live corpus acquires a pass in which a DERIVATION's name is declared twice by
competing declarations (count is 0 today, and the plan pins it), or a contributor reports this
advisory against code they consider correct.

### §4.2 The removed false advisory is IN SCOPE, and the residual resolver is not

Two different things live here and a reviewer will challenge the first as scope creep, so they are
separated explicitly.

**In scope, and a SECOND DELIVERABLE of this arc.** The ledger row is about silent misses; this arc
also removes a **false POSITIVE**. At BASE, a parameter typed **`string`** that merely shares a name
with a surface binding is reported as a raw surface handoff
(`m-coincidental-same-read-twice`: baseline `RAW-HANDOFF@19:label`, v3 silent — §3.6).

**Why it is in scope rather than creep, on the project's own rule:** it is the SAME ROOT CAUSE —
classification keyed on a NAME rather than on what the name resolves to — and the class-sweep
disposition default is that **every instance of one shape is repaired in the same PR**, with a
deferral owing exception (a), (b) or (c). "Same defect, opposite direction" is precisely the case
the default covers. It is also a fresh instance of the name-keyed-exemption rule: a decision keyed
on a name does not fail at the boundary it was written for, it fails **wherever the same name
reappears meaning something else** — here in the false-positive direction rather than the silent
one.

**Out of scope, filed as a peer under exception (c).** `surfaceBindings` returns a `Set<string>`, so
every consumer asks "is a binding called `X` in scope anywhere in this module" rather than "is this
identifier that binding". Resolving an identifier to its declaration is a redesign of the
binding-discovery layer this arc does not otherwise touch, and it needs the `ts.TypeChecker` that
predecessor limits 5 and 8(b) both decline. The peer row carries this measurement as its probe
evidence and its incident. **v3 makes the one measured instance strictly better rather than worse,
which is the direction the bound requires** — the arc does not leave the class untouched, it
narrows it and files the residue.

### §4.3 The four fenced limits — four rows, four answers

Predecessor spec §4 limit 8 fences four shapes, recorded there as probed at `f88690111` returning 0
findings with 0 live occurrences. **That is an INHERITED RECORD, quoted from the merged spec's
prose, not a measurement this arc took** — a figure carried in a document is provenance, not data.
Each disposition below rests on this arc's OWN reading of the code paths involved, and where a
disposition turns on current behaviour it cites a §3 probe run against blob `412cadd3`. **Unification must not silently re-open a fence, and must not silently
close one.** Each answer below is measured, not reasoned.

| limit | closed by unification? | disposition |
| --- | --- | --- |
| **(a) parenthesized TYPE annotation** — `settle(ch: (Channel))` | **NO** | STAYS FENCED, trigger intact and **unfired**. `isSurfaceRef` inspects a TYPE node; rule A ranges over EXPRESSION receivers. Different construct, different code path. This arc does not edit `isSurfaceRef`, so the trigger "or `isSurfaceRef` is edited for any other reason" does not fire. |
| **(b) sink or read through a member of an object TYPE** — `type Holder = { ch: Channel }` | **NO** | STAYS FENCED, trigger intact. Under rule A the receiver's rightmost name is `ch`, which is not in `bindings` (a `PropertySignature` is not a `PropertyDeclaration`), so it classifies `foreign` and is silent by the §2.2 table. Resolving it needs the checker limit 5 declines. |
| **(c) accessor-shaped function-like** — a getter or constructor holding a pass | **PARTIALLY — the fence NARROWS, explicitly** | The shadow half is CLOSED: §3.3 measures constructor and set-accessor scopes silently absorbing a shadow, and §2.3 removes the scope question entirely. The pass-attachment and straight-line halves STAY FENCED: `passFunctionOf` and `blocksStraightLine` still use the four-kind `isFunctionLike`, and a pass declared inside an accessor is still not attached. **Restated trigger:** re-file when any scanned module declares a pass inside an accessor or a constructor, or `passFunctionOf` / `blocksStraightLine` is edited. |
| **(d) type-position `import()` edge** — `type Local = import("./m").Channel` | **NO** | STAYS FENCED, trigger intact. `importEdgeFindings` visits `ImportDeclaration` only; this arc does not edit it. |

**A NEW class the fence does NOT cover, checked rather than assumed.** The parenthesized RECEIVER
(`(ch).gauge()`, `helper((ch))`, §3.6 M1a/M1b) is **not** limit 8(a), which fences a parenthesized
TYPE ANNOTATION. They are different constructs on different code paths, and the repository already
ratified parenthesized-receiver handling for `walkSinks` at diff r2 F2 — fixture
`parenthesized-receiver.ts` pins `(this.ch).dispatch(...)` as a repaired case. So parenthesized
receivers are IN SCOPE by precedent; `analyzePassReads`, `analyzeHandoffs` and `classifyMemberOn`
simply never received the repair. Unfenced, and closed here.

### §4.4 Inherited limits, unchanged

Predecessor limits 1–7 stand exactly as written: no control-flow analysis; a value captured outside
the pass is invisible; memoization is not verified; enrolment is an act; "feeds a classification" is
declined as the read boundary; cross-module passes are not followed; `drive()` is statically
analyzed. **This arc changes none of them and makes no claim that requires any of them.**

### Dimensional Invariants

N/A — no UI surface. No component, no fixed-dimension parent.

### Transition Inventory

N/A — no UI surface, no visual states.

---

## §5 Meta-test / registry inventory

**Creates:** nothing. No new meta-test; the deciding suite already exists and is already enrolled.

**Extends:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts` (new cases per §6) and
`tests/paneCompaction/fixtures/sendAuth/` (new fixtures). Two existing expectations change (§3.6).

**Does NOT extend:** `tests/mutation/source/registry.ts` gains no ROW — `sendAuthScan` is already
enrolled. Its row is EDITED for the control (below). `paneCompactionCore` is untouched.
`EXPECTED_LEDGER_KINDS` and `EXPECTED_ENV_TOUCHING` already carry `sendAuthScan`; they change only
if the accepted-survivor set does.

**Advisory-lock topology:** N/A — no `pg_advisory*` surface, and this arc touches no code path
that mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs` or `pending_ingestions`.
**Supabase call boundary:** N/A — no Supabase client call. **DB layers:** N/A — no migration, no
RPC, no CHECK, no enum, so the tier x domain and CHECK/enum matrices do not apply. **Flag lifecycle
table:** N/A — this arc introduces no boolean config field or toggle. **Mutation surface
observability (invariant 10):** N/A — no HTTP route handler and no `"use server"` action.

### §5.1 Rule 112 lands directly on this surface

The `sendAuthScan` registry row carries a text-keyed control with the comment **"Verified unique on
the current source (`grep -c -F` = 1)."** True when written. **This arc moves and consolidates the
code the control keys on**, and a uniqueness assertion is a claim with an expiry date and no
mechanism to notice the expiry — the identical shape cost seven undetected survivors on a sibling
arc this month when an arm repair copy-pasted a branch and reproduced the keyed line verbatim.

**Baseline recorded BEFORE any consolidation exists, because it becomes unrecoverable afterwards:**

```
grep -c -F 'if (ambient.has(member) && handedOn) return;' tests/paneCompaction/sendAuthScan.ts
1
```

at `7159c2a4e`, source blob `412cadd3dd4c21513c5cbee6c514f033b7cdb859`.

**Two obligations, both owned by plan tasks:** re-verify `grep -c -F` = 1 after every refactor
commit that touches the file; and **prefer a DERIVED control to a prose claim** — a control whose
uniqueness is asserted by the suite beats one asserted in a comment, because a comment cannot fail.

### §5.2 Score inputs, stamped as a set derived from the contract

The score is a pure function of **source, declared operators, deciding suites, and the fixtures
those suites read** — stated in words first, because the set that reads as obvious is the set that
omits, and three of three implementation arcs got this wrong by listing "the code."

Derived, never hand-maintained: source path and suite paths read OUT of the registry row; the
registry row and `expectedLedgerKinds.ts` stamped explicitly (they carry the operators and the
floor); fixtures expanded by the same command that stamps them. Stamped **before AND after** every
measured run — one stamp catches a stale read, only the pair catches an input moving during the
run. Baseline at BASE: fixture digest `baa28cb1d2000ddce5528258ae923a64a3cf7644` over **82** files —
every file under `tests/paneCompaction/fixtures/`, which is the 81-member `sendAuth/` corpus plus
`tests/paneCompaction/fixtures/sendAuthLiveControl/unregistered-live-importer.ts` (§3).

---

## §6 Acceptance criteria

Every row names the executable step that proves it and the channel the proof arrives on. **A green
suite is not proof for AC-U6** — see its row.

| id | claim | proved by |
| --- | --- | --- |
| **AC-U1** | `analyzePassReads` counts a read through a property receiver. `this.ch.panes()` twice in a pass reports `MULTI-READ` naming `panes`; the bare `local.gauge` pair in the SAME function still reports, so the case cannot pass by the machinery failing to run. | new fixture + suite case, findings compared as sorted records by equality |
| **AC-U2** | `analyzeHandoffs` reports a handoff through a property receiver. `helper(this.ch)` inside a pass reports `RAW-HANDOFF`; `helper(local)` in the same pass reports too. | new fixture + suite case |
| **AC-U3** | Parenthesized receivers are classified identically to bare ones by ALL of D3, D4, D5. `(ch).gauge()` twice reports `MULTI-READ`; `helper((ch))` reports `RAW-HANDOFF`. Fixture bytes carry `// prettier-ignore` immediately above the line and the directory is `.prettierignore`-fenced — a normaliser deleting the parentheses would silently convert the case into a duplicate of an existing fixture. | new fixtures + suite cases; plus a byte-identity assertion over the fixture manifest |
| **AC-U4** | The derivation exemption is void under a competing double declaration, in EVERY scope kind: constructor, set accessor, nested block with a surface-typed initializer, nested block with an opaque initializer. Four cases, one per spelling. | new fixtures + suite cases |
| **AC-U5** | A declaration that is provably NOT the surface does not compete. A parameter typed `string` sharing the name leaves the exemption intact and the pass silent. **Expect-a-REPORT pair:** the same fixture with the annotation changed to the surface type REPORTS, so the silent verdict is attributable to the annotation rather than to the scanner never looking. | new fixture PAIR + suite cases |
| **AC-U6** | The live corpus scans **0 findings** under the unified rules. | executable: `scanRepo(LIVE_ROOTS, SEND_AUTH_SURFACES)` asserted empty **with its premise stated executably** — the walk visited a non-zero file count and the enrolled module was among them. `0 of 0` and `0 of N` render identically, and a zero over an empty population is not a pass. |
| **AC-U7** | All 81 pre-existing fixture verdicts are preserved except the two named in §3.6, whose changes are additive only. | the deciding suite's existing cases, unmodified except the two, plus the plan's per-fixture before/after diff run at plan time and pasted |
| **AC-U8** | `shadowedBetween` no longer exists, and no loop in the module has its termination in a mutable predicate. | grep for the symbol returning 0, plus a module audit for the loop property — a totalisation that moves termination into a predicate turns an off-by-one mutant into a NON-TERMINATING one and takes the whole measurement down |
| **AC-U9** | The registry control still keys on a line that occurs **exactly once**, and its uniqueness is asserted BY THE SUITE rather than by a comment. | `grep -c -F` = 1 re-run after every refactor commit, plus a derived assertion so the claim can fail |
| **AC-U10** | The ledger row's three defects are corrected in the graduation: the stale summary sentence, the stale "probed silent" claim for the handoff instance, and the ambiguous "read arm". Every NARROWED claim in the graduated row resolves to exactly one FUNCTION. | the graduation commit, plus a sweep over the row, the predecessor spec and this arc's own documents |
| **AC-U11** | The predecessor spec's §4 limit 8 preamble no longer carries a claim that is false under either reading of "the read arm". | edit to the merged spec in the same commit as AC-U10 |

---

## §7 Lint disposition

`pnpm spec:lint` output for this document and its plan is attached to every review dispatch, with
the `summary:` line, every finding, and an explicit statement if anything is abridged.

**impeccable-gate: N/A — no UI surface.** No file under `app/`, `components/`, `app/globals.css`,
`DESIGN.md` or a Tailwind config is touched.
