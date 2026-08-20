<!-- spec-lint: not-ui — a lint arm over documents; no layout, component or token surface. The only UI-path citation is the historical incident site this spec re-enacts, which is evidence rather than a subject. -->
# spec:lint — claim sweep after a repair (a repair fixes the site the finding named and leaves the document unswept)

Ledger: `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING` (`BACKLOG.md`). **Facing:** process.
Probe record: `docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md` — every
number below is measured there, and the sections cite it rather than restating its derivations.

`AGENTS.md` says to class-sweep a finding's SHAPE across the CODE before patching the named instance. It
does not say the same about the DOCUMENT. This spec adds one `spec:lint` arm that, given a repair,
reports the claims elsewhere in the same arc's documents that the repair superseded and left standing.

## 1. Scope

### 1.1 Resolved scope — do not relitigate

1. **Form 2, and BOTH of its halves.** The ledger entry offers two forms; the orchestrator ruled form 2
   and required the numeric-literal half AND the named-claim half, because the entry's own acceptance
   criterion demands the mechanism flag both R4 F3 and R5 F1. **Form 1 (a derived per-path helper) is
   fenced out by that ruling** — it flags the union error only and is specific to one scanner's data
   model. A finding proposing form 1 is relitigation.
2. **The entry's acceptance criterion is already CONFIRMED**, both halves, replayed from committed blobs
   before this spec was drafted (probes §1). It is not an open question and not a risk to be managed;
   it is the reason the arm is worth building.
3. **The discriminator is sentence-scoped co-occurrence** (§3.1), chosen over the alternatives with
   measurements (§2) rather than by argument. It owns no recognizer for transition prose and no model of
   tense.
4. **"Report occurrences outside the repair's own diff hunks" is REFUTED**, with a live counterexample
   (probes §3.1): the incident's sharpest survivor is an ADDED line inside the repair's own hunk. Do not
   re-derive it.
5. **The arm is ADVISORY.** It reports claims to RE-READ. It cannot know whether a surviving occurrence
   is stale or deliberate, and §3.4 says so; the author dispositions each one.
6. **The unit is the ARTIFACT PAIR, not the artifact** — spec AND plan AND any probe record of the same
   arc. A class retired in one is not retired until the sweep covers all of them, which is the rule this
   arm mechanizes (`_briefs`-recorded lesson, and the incident's own nine survivors were 2 in the spec
   and 7 in the plan).
7. **Threat fence.** Ordinary authoring mistakes by a contributor repairing a review finding.
   Adversarial construction is out of scope and files to §5.

### 1.2 Out of scope

- Deciding whether a surviving claim is WRONG. The arm establishes that a claim the repair superseded
  still stands elsewhere; correctness is the author's call.
- Code. `AGENTS.md`'s class-sweep rule already covers the code side; this is its document-side twin.
- Repairs that change no value and no named claim — a pure rewording supersedes nothing and draws
  nothing.

## 2. Measured calibration

Full derivations in the probe record; these are the results the design rests on.

| Measurement | Value |
| --- | --- |
| Tracked `docs/superpowers` markdown files | 1127 |
| Sites the NAIVE form would wrongly flag | 1030 |
| …of which plain `X → Y` transition sentences | 923 |
| Incident survivors reported by the shipped discriminator | 9 of 9 |
| Incident transition sentences correctly excluded | 3 |
| Corpus transition sentences excluded by the same rule | 935 of 936 |

The naive form — "after a repair changes N to M, report every surviving N" — scores roughly one false
advisory per document. **The before/after sentence is the corpus's dominant shape, not an edge case**,
so an arm that does not account for it is switched off on first contact. That is the number the
consequence bound ranges over.

## 3. The arm

### 3.1 The numeric half

Given a repair that changes a numeric literal N to M, the arm reports every occurrence of N in the
arc's documents **whose enclosing sentence does not also carry M**.

A transition sentence names both values by construction (`"grows from 21 rows to 57, not 58"`); a stale
claim names only the superseded one (`"every element in the 58-row census carries…"`). That single
co-occurrence test is the whole discriminator: no recognizer for transition prose, no tense model, no
parser. Measured recall and precision are in §2.

**The sentence is the scope, and the line is not.** The incident's sharpest survivor sits on a line the
repair itself rewrote for an unrelated reason, so any rule keyed on diff status misses it (§1.1 item 4).

### 3.2 The named-claim half

Given a repair that changes a claim about a named IDENTIFIER — a `file:line`, a symbol, a token the
repair's own diff carries on both a removed and an added line — the arm reports every OTHER occurrence
of that identifier in the arc's documents, outside the repair's hunks, as a claim to re-read.

This half does not inherit the before/after problem: an identifier does not appear in transition
sentences the way a number does, because a repair that re-classifies a site does not write "site X was
in (a), now in (b)" as a value pair. The incident is the demonstration — the repair named
`PublishedReviewModal.tsx:964` in its new claim while THAT SPEC's §6 kept the retired reasoning about the same site
two sections away (probes §1.2).

### 3.3 What counts as "the arc's documents"

The spec, the plan, and any probe record under the same arc — §1.1 item 6. Resolved through the existing
`FileResolver`; a document the resolver cannot read is REPORTED, never silently skipped, on the same
grounds as every other fail-open closure in this repo.

### 3.4 The finding, and what it does NOT assert

```
CLAIM_SUPERSEDED_ELSEWHERE  advisory
  <doc>:<line> still claims <token>, which <repair> superseded
  detail: the repair changed <token> to <replacement>; this occurrence is outside that change.
          Re-read it: it is stale, or it is deliberate and wants a word saying so.
```

The arm asserts that the occurrence EXISTS and that the repair superseded the token. It does not assert
the claim is wrong. A deliberate historical reference — a dated record, a narration of what an earlier
draft said — is a legitimate survivor, and the author dispositions it.

## 4. Architecture

```
scripts/spec-lint.ts              # adapter: resolves the repair's diff, hands the core plain data
lib/specLint/claimSweep.ts        # NEW, pure: sentence scoping, co-occurrence, identifier tracking
lib/specLint/run.ts               # threads the injected repair record core-ward, plan+spec kinds
lib/specLint/types.ts             # RepairRecord (superseded tokens, replacements, touched spans)
```

The adapter alone reads git. The core receives a `RepairRecord` and document text and is a pure map to
findings — the same injection shape as `ExecResults`, `ParseResults` and `FixtureResults`. A null record
means no repair was named and the arm runs nothing.

## 5. Documented limits (round 0)

1. **A sentence is delimited lexically**, and a repair whose transition spans two sentences draws a
   false advisory. Measured: 1 of 936 corpus transition sentences (§2).
2. **A value that legitimately recurs** — a version number, an unrelated count that happens to equal the
   superseded one — is reported. The failure direction is a nuisance line, never a missed collision.
3. **The arm reports; it never rewrites.** Prose repairs are read, not swept: only a reader can tell a
   before/after sentence from a statement of current fact, and a blanket regex over the numbers is the
   instrument that CREATED the drift being cleaned.
4. **A repair that supersedes a claim without changing a token is invisible** — a rewording that changes
   meaning while keeping every number and identifier. This arm tracks tokens, and silence is not a
   certificate.
5. **Adversarial construction is out of scope** (§1.1 item 7).

## 6. Testing

All under `tests/specLint/`, TDD per task, anti-tautology rules of `docs/agents/writing-plans.md` in
force. Two covers are mandatory before any review dispatch, both learned on this arc's first PR.

**Every rule names the strictly WEAKER implementation its fixtures must kill.**

| Rule | Weaker implementation that would pass | Fixture that kills it |
| --- | --- | --- |
| §3.1 numeric half | report every surviving N (the naive form) | a transition sentence carrying BOTH values draws nothing — the 923-site corpus shape |
| §3.1 sentence scope | scope to the LINE instead | the incident's consequence bound, which shares a line with nothing and sits inside the repair's own hunk |
| §3.1 discriminator | exclude anything inside the repair's diff | that same survivor, an ADDED line in that hunk, must still report |
| §3.2 named half | report every occurrence of the identifier | the repair's OWN new claim, inside its hunk, draws nothing |
| §3.3 document set | sweep the spec only | a survivor in the PLAN reports — the incident had 7 of its 9 there |
| §3.4 severity | emit `fail` | every finding is advisory, asserted over the emitted set, not sampled |

**An expect-CLEAN fixture is WEAK BY DEFAULT and every one here is PAIRED, differing by ONE VARIABLE.**
A fixture expecting nothing is satisfied by any implementation that fails to look — an empty walk, a
crashed read, a scanner returning the empty set. So:

| Negative case | Paired positive, one variable apart |
| --- | --- |
| a transition sentence draws nothing | the SAME sentence with the replacement value deleted reports |
| the repair's own new claim draws nothing | the same identifier in another section reports |
| a repair changing no token draws nothing | the same repair with one value changed reports |

**Second question, asked of every fixture: which rule DECIDES the observation, and is it the rule under
test?** Cross-finding machinery an implementer will invent — dedup by token, ordering, collapse by line
— can produce a pass value by another route. A finding's identity is `(code, doc, line, token)`;
several findings legitimately share a line when one sentence carries two superseded tokens, and no
dedup by position is permitted.

**Historical re-enactment, executable.** The probe record's two blobs ship as fixtures: `fede5f084`'s
tree draws exactly the 9 numeric survivors and excludes the 3 transition sentences; `c272ebed3`'s draws
the §6 identifier survivor. These are the entry's own acceptance criterion, pinned by the incident
rather than by a synthetic analogue.

**Corpus regression.** The tracked corpus, ENUMERATED at run time rather than counted in the test,
yields the §2 exclusion set. Asserted as a SET, never a cardinality typed into the test.

## 7. Mutation enrolment (before the first review dispatch)

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
`lib/specLint/claimSweep.ts` is a guard surface whose defect class is exactly "reports OK while the
output moved", so enrolment precedes review. It ships as an importable module with referring suites from
the start, never a terminal CLI script.

Enrolment is TWO declarations: a `tests/mutation/source/registry.ts` row (`id: "claimSweep"`,
`sourcePath`, `suitePaths` naming the §6 pure suites, `operators: [...OPERATOR_NAMES]`,
`scoreFloor: 0.95`, a `control` mutant, `accepted: []`) AND an `EXPECTED_LEDGER_KINDS` entry in
`tests/mutation/source/expectedLedgerKinds.ts`, which `tests/mutation/guardSurfaces.gates.test.ts` reads
as its expected key set. A registry row alone leaves the corpus gate red.

`pnpm heavy pnpm mutation:guards` — the canonical whole-registry command — runs BEFORE the round-1 diff
dispatch, and that brief states `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on its
`GUARD SURFACE:` line, or the wrapper exits 2.

## 8. Wiring & docs (same PR)

- `package.json`: no new script — the arm rides `spec:lint`.
- `docs/agents/writing-plans.md`: one sentence under the reconciliation/closeout-sweeps bullet, where
  the authoring discipline this mechanizes already lives.
- `docs/superpowers/specs/ci/README.md`: one row for this spec (the PER-DIRECTORY index is the one
  `tests/docs/specsReadmeIndexParity.test.ts` enforces, not the root).
- `BACKLOG.md`: the row archived and its IN PROGRESS marker stripped as ONE ledger commit BEFORE
  whole-diff review, per invariant 12 as ruled 2026-08-18.

## 9. Acceptance criteria

- **AC-1** — Numeric half: a surviving occurrence whose sentence lacks the replacement reports; one
  whose sentence carries it draws nothing; the scope is the SENTENCE, proved by a survivor sharing a
  line with a transition and by one inside the repair's own hunk.
- **AC-2** — Named half: an identifier whose claim the repair changed reports at every OTHER occurrence;
  the repair's own new claim draws nothing.
- **AC-3** — Severity is advisory over EVERY emitted finding, asserted structurally rather than sampled;
  the arm never rewrites a document.
- **AC-4** — The historical replay reproduces from committed blobs: `fede5f084` yields exactly the
  9 numeric survivors and the 3 exclusions, `c272ebed3` the identifier survivor.
- **AC-5** — Document set: a survivor in the PLAN reports, not only one in the spec; an unreadable
  document is REPORTED, never silently skipped.
- **AC-6** — Corpus: the enumerated corpus yields the §2 SET, asserted as a set with no cardinality
  typed into the test.
- **AC-7** — Every rule AND every fixture kills its named weaker implementation, and no fixture is
  neutralized by another rule; the pass is re-run to a FIXED POINT before each dispatch and its
  iteration counts recorded in the round filing.
- **AC-8** — Enrolment carries BOTH declarations, scores at or above 0.95 with an empty
  unaccepted-survivor set, and the purity meta-test passes.
- **AC-9** — This spec and the implementation plan lint clean (`0 hard`) through the shipped
  `spec:lint`, ONE document per invocation.
