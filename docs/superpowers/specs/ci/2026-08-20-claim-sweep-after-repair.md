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

### 2.0 THE POPULATION IS DECLARED, AND EXCLUDES THIS ARC'S OWN DOCUMENTS

This arm scans documents. Its spec, its plan and its probe record ARE documents, and every example they
carry — `"grows from 21 rows to 57, not 58"`, the census tables, the probe transcripts — is a transition
sentence in the very corpus §2 measures. Each one MOVES a number this document pins.

**That is the cause of THREE separate number-drift repairs on this arc** — the historical sequence
936 → 943 → 947 → 953, each chased as ordinary corpus growth when the growth was mine. Review then found
the fourth instance INSIDE THE SECTION WRITTEN TO DECLARE THE HAZARD: this block stated an arc-inclusive
figure that was already stale when the reviewer read it, because writing the section changed the number
the section reported. **No arc-inclusive figure is stated anywhere in this document**, and that is a
design decision rather than an omission — the act of writing one moves it, so any value here would be a
fifth instance of the same defect. The sequence above is kept as HISTORY, describing past commits, which
is the one form such a number cannot go stale in.

The fix is not a fresher number. It is ONE POPULATION, DECLARED BY PATH, and ONE SCRIPT emitting every
row of §2 from it — `docs/superpowers/specs/ci/probes/scripts/2026-08-20-population-census.py`, whose
`ARC_DOCUMENTS` tuple names this spec, this arc's probe record AND its plan (listed before the plan
exists, so the plan cannot repeat the drift on arrival). Rows measured over two different populations is
the inconsistency the split scripts produced; one run of one script cannot produce it.

One run of that script over that population, at this arc's merge-base `4dfd784ed062` — the base is the
anchor rather than a HEAD sha, because this arc's own commits cannot move these rows and no other
`docs/superpowers` markdown file on this branch is touched:

```
tracked docs/superpowers markdown files:          1135
this arc's own documents, excluded by path:          4
population measured:                              1131
census shape hits over the population:             936   (935 excluded by the rule, 1 not — §5 item 1)
```

**The plan and the handoff arriving are the proof the exclusion works, twice.** `ARC_DOCUMENTS` named
each before it existed, so writing them moved the tracked count 1133 → 1134 → 1135 and the excluded count
2 → 3 → 4 while the POPULATION and every row of the table below stayed exactly where they were. Under the
old measure-everything approach each arrival would have been another number-drift repair. **The rule that
makes it hold: any document this arc adds joins `ARC_DOCUMENTS` in the SAME COMMIT that adds it** — the
declaration is what does the work, and a document declared late has already moved a number by the time
anyone notices.

Every row of the table below comes from that one run. The UNFILTERED corpus carries more, and the
difference is this arc's own writing — a quantity that changes with every sentence added to this
paragraph, which is precisely why nothing in §2, §6 or §9 is measured over the unfiltered corpus and why
no figure for it appears here.

**Every number in §2 is a MEASUREMENT AT ONE COMMIT, never a normative claim.** The population still
grows as OTHER arcs write documents. What it no longer does is move when THIS document is edited, which
is the only drift that produced a repair here. §6 and §9 assert SETS and RELATIONS and never a
cardinality typed into a test: AC-6 states the relation, and **no fixture pins 936, 1009, or any other
figure from the table below.**

**THE MOTIVATING INSTANCE IS THIS ARC'S OWN, AND IT LANDED ONE ARTIFACT FURTHER OUT THAN THE COVER
REACHED.** While building the arm, this arc ran a claimed-repair sweep over its spec and probe record and
read a clean `0 of 59 claimed-but-absent, 0 of 20 retired-but-surviving`. Its round-economy filing was at
that moment carrying SEVEN current-tense survivors of the model the arc had already retired — six review
rounds where there were seven, three finding codes where there were four, nine documented limits where
there were ten, and four more of the same shape. **The sweep was clean about a document it never opened.**

Two properties follow, and the arm inherits both. **The swept set must be every document the arc writes,
declared and not inferred (§3.3)** — the filing sat outside the pair the cover had been written against,
and no amount of care on the sweep itself reaches a document it does not read. **And ONE control proves
ONE read succeeded**: a single must-be-PRESENT witness anywhere in the population is satisfied by any one
member of it, which is precisely how the filing stayed invisible, so a control belongs in EACH document
and the population SIZE is printed beside every zero — `0 of 0` and `0 of 76` render identically and mean
opposite things.

**A SECOND MOTIVATING INSTANCE, in the same arc's plan, and it cost nothing to find because a sweep was
run.** The plan RETIRED a mutation-unsafe loop form — "a search loop that advances in its own header" —
and then, twelve lines lower in the same task, listed that exact form among the safe ones. The retirement
and the recommendation were both current, both true-looking, and contradictory; the arm's numeric half
would not have caught it, but its NAMED-CLAIM half is precisely this shape — a claim about a named thing
that a repair superseded and left standing elsewhere in the same document. **Both motivating instances
were committed by the author writing the arm that catches them**, which is the argument for the arm: this
is not an attention failure that more care would close.

**Synthetic fixture literals therefore live in ONE SHARED MODULE, and the no-collision cover is keyed on
THAT DATA.** The rejected alternative was a nonce token grepped across fixture titles: a nonce is a
CONVENTION, so the check would be blind to any fixture literal written without it — the same
convention-keyed blindness that made a prefix-keyed ledger extractor miss 21 custom-id rows. Keying on
the shared module's own exported data means a literal that forgets the convention is still in the
population. The cover asserts zero collisions with a POSITIVE CONTROL — a real transition sentence from
outside this arc's documents — so a zero is attributable rather than the shape of an empty read.


Full derivations are in the probe record, and every script that produced a number is committed beside it
at `docs/superpowers/specs/ci/probes/scripts/`. The rows below are one run of the population census,
over the population §2.0 declares.

| Measurement | Value |
| --- | --- |
| Tracked `docs/superpowers` markdown files | 1135, of which 4 are this arc's own and EXCLUDED — population 1131 |
| Sites the NAIVE form would wrongly flag, DEDUPLICATED by (path, value offset) | 1009 |
| …raw matches before dedup, since the six shapes overlap | 1032 |
| …of which plain `X → Y` transition sentences | 923 |
| Incident survivors reported by the shipped discriminator | 9 of 9 |
| Incident transition sentences correctly excluded | 3 |
| REAL corpus transition sentences excluded by the rule | 935 of 935 |
| …plus one census false hit that is not a transition (§5 item 1) | 1 |

The naive form — "after a repair changes N to M, report every surviving N" — scores roughly one false
advisory per document. **The before/after sentence is the corpus's dominant shape, not an edge case**,
so an arm that does not account for it is switched off on first contact. That is the number the
consequence bound ranges over.

## 3. The arm

### 3.0 The repair record is DECLARED, never inferred

The arm does not read a commit and guess what it superseded. The first review showed why: the incident commit
changes many numeric literals and `58` occurs on BOTH sides of its diff, so no rule over that diff
selects the semantic pair `58 → 57` deterministically. An implementation left to infer it may pick a
different pair, or none, while satisfying every other word of this spec.

So the AUTHOR declares the supersession, in the same shape the task-marker contract uses — the grain is
declared, never inferred from prose, which is the principle `docs/agents/spec-self-review.md` already
states for exactly this reason:

```
pnpm spec:lint <doc> --superseded 58 --replacement 57 --also <plan> --also <probe-record>
pnpm spec:lint <doc> --claim-about 'PublishedReviewModal.tsx:964' --repair <rev> --also <plan>
```

The swept document set is declared the same way and for the same reason (§3.3).

**A declaration where the superseded value EQUALS the replacement is REFUSED, by name.** Review found
that `--superseded 58 --replacement 58` — one ordinary typo — makes every sentence containing `58` also
"carry the replacement", so §3.1 suppresses all twelve occurrences and the run reports a silent clean.
The declaration is well-formed by every other test, so nothing else catches it. `N === M` is rejected
before any document is read, with a message naming both values.

**`--repair` is REQUIRED for the named half** and optional for the numeric one. The named half's whole
exclusion is "everywhere except where the repair restated the claim", so without the hunk spans it has
no way to omit the repair's own new claim and would report it as unswept — a wrong advisory. An invocation
of `--claim-about` without `--repair` is refused, by name, rather than running on an inferred exclusion.

`--repair <rev>` is accepted ALONGSIDE a declaration, never instead of one: it supplies the hunk spans
that scope §3.2's "outside the repair" test, and nothing else. It is REQUIRED whenever `--claim-about`
is given. Absent a declaration the arm runs
nothing and says so; silence from an undeclared invocation is not a certificate.

### 3.1 The numeric half

Given a DECLARED supersession of numeric literal N by M, the arm reports every occurrence of N in the
arc's documents **whose enclosing sentence does not also carry M**.

A transition sentence names both values by construction (`"grows from 21 rows to 57, not 58"`); a stale
claim names only the superseded one (`"every element in the 58-row census carries…"`). That single
co-occurrence test is the whole discriminator: no recognizer for transition prose, no tense model, no
parser. Measured recall and precision are in §2.

**A HALF-REPAIRED SENTENCE IS A DECLARED MISS, and this is the numeric half's sharpest limit.** If one
sentence carries two claims on the same value and the author repairs only the first, the sentence now
contains the replacement and §3.1 suppresses the surviving stale claim. Review found it; the obvious
refinement was tested and REJECTED on measurement rather than on taste:

```
sentence: "Update the census-length premise from 21 to 57, and the distinct-identity assertion to 58."
  occurrences of 58: 1     occurrences of 57: 1
```

A legitimate transition sentence has exactly the same shape — one of each — so counting cannot separate
them. Anything that could would have to understand which CLAIM each number belongs to, which is the
recognizer this design exists to avoid (§1.1 item 3). The arm therefore declines: the failure direction
is a MISSED advisory, never a false one, which is the conservative side of the consequence bound. It is
recorded as §5 item 7 and restated in the module header.

**The sentence is the scope, and the line is not.** The incident's sharpest survivor sits on a line the
repair itself rewrote for an unrelated reason, so any rule keyed on diff status misses it (§1.1 item 4).

### 3.2 The named-claim half

**The identifier is matched EXACTLY, never as a substring.** A declared `file:line` that occurs zero
times is reported as NOT FOUND — `CLAIM_IDENTIFIER_NOT_FOUND`, §3.4 — rather than silently matching its
own prefix: `…tsx:96` is one deleted character from `…tsx:964`, occurs nowhere exactly, and matches on
nine lines as a substring — nine wrong advisories from an ordinary typo. The not-found report is the
other half of that rule: exact matching without it converts the typo's nine wrong advisories into
SILENCE, which is the same defect wearing the conservative direction's clothes.

Given a DECLARED identifier — a `file:line`, a symbol — whose claim the author says the repair changed,
the arm reports every OTHER occurrence of that identifier in the arc's documents, outside the repair's
hunks, as a claim to re-read.

**THE ARM DOES NOT ESTABLISH THAT THE REPAIR CHANGED THE CLAIM, and its finding text must not say it
did.** An earlier draft described the identifier STRUCTURALLY — "a token the repair's own diff carries on
both a removed and an added line" — which reads as a criterion the arm could check. It is not one, and
the counterexample is in the incident's own repair. `c272ebed3` rewrites `**(a) 13 sites carry another
hover cue` to `**(a) 12 sites carry another hover cue ON THE SAME RENDER PATH`, so
`components/admin/HoverHelp.tsx:562` sits on BOTH the removed and the added line while its
classification is untouched — the site that repair actually reclassified is a different one on the same
line. `HoverHelp.tsx:562` occurs four times in that arc (three in the spec, one in the probe record);
declaring it draws the three outside the hunks, and wording that asserts the repair changed ITS claim is
a wrong advisory in the arm's own finding text.

WHICH identifier had its claim changed is therefore the AUTHOR's declaration (§3.0), on exactly the
grounds the numeric pair is: it is a semantic fact about the repair, and no rule over the diff recovers
it. The arm asserts that the occurrence EXISTS and that the identifier was DECLARED. §3.4's wording says
that and no more, and §5 item 8 records what the arm consequently cannot catch.

**Its volume is high by design, and that is stated so nobody reads it as noise.** A reclassified site is
claimed about wherever the arc discusses it — nine occurrences for the incident's one site — and the
advisory says "re-read these against the repair's new claim", which is exactly the sweep the ledger entry
asks for. The numeric half is the precise one; the named half is the thorough one.

This half does not inherit the before/after problem: an identifier does not appear in transition
sentences the way a number does, because a repair that re-classifies a site does not write "site X was
in (a), now in (b)" as a value pair. The incident is the demonstration — the repair named
`PublishedReviewModal.tsx:964` in its new claim while THAT SPEC's §6 kept the retired reasoning about the same site
two sections away (probes §1.2).

### 3.3 What counts as "the arc's documents" — DECLARED, like everything else the arm cannot infer

The unit is the artifact pair (§1.1 item 6): the spec, the plan, and any probe record of the same arc.
**Which FILES those are is DECLARED on the invocation and never inferred.** "Same arc" has no executable
identity in this repo, and all three inference rules were measured against the incident's own arc —
which is exactly one such arc — with each wrong in a different direction:

| Inference rule | What it does on the incident's arc (`c272ebed3`) |
| --- | --- |
| Follow the spec's citations | the spec links the probe record but NOT the plan (the plan links both), so citation-only resolution misses the plan — where 7 of the incident's 9 survivors were |
| Match the filename stem | the probe record is `2026-08-18-border-border-neutral-fill-census.md` against a stem of `control-outline-border-token`; stem-only resolution misses it |
| Match the date prefix | `2026-08-18-` also matches `docs/superpowers/specs/2026-08-18-process-facing-mint-bar.md`, an unrelated arc; date matching over-includes |

Nothing in the existing surface settles it either: the `FileResolver` interface in
`lib/specLint/types.ts` supplies file ACCESS — `readFileLines(path): string[] | null` and
`listTrackedFiles()` — and has no notion of arc membership. (Cited by NAME and by quoted content, not by
line: the implementation edits that file, and a line citation into an arm's own blast radius does not
break, it silently points somewhere else.) So the peers are named:

```
pnpm spec:lint <doc> --superseded 58 --replacement 57 \
  --also docs/superpowers/plans/<plan>.md \
  --also docs/superpowers/specs/probes/<probe>.md
```

`--also` is repeatable and takes a path; the swept set is `<doc>` plus every `--also`, and nothing else.
A peer the author does not name is NOT swept, and the run says nothing about it — a MISSED advisory,
never a false one, recorded as §5 item 9.

This is also what makes the §6 pure fixtures and the production invocation agree. A pure fixture INJECTS
its document set, so it can pass while a resolving production path silently omits a required peer; with
the set declared there is nothing left to resolve, and the two run the same contract.

A declared peer the resolver CANNOT READ is REPORTED, never silently skipped (§3.4, third code), on the
same grounds as every other fail-open closure in this repo. That branch is a LIVE corpus shape rather
than a hypothetical — `git ls-files -s docs/superpowers | awk '$1==120000'` finds
`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M11-user-facing-docs.md`, tracked as a
symlink.

### 3.4 The finding, and what it does NOT assert

**FOUR codes, and they are the whole FINDING accept-set: the arm emits no other finding.** One per
half, because the halves assert different facts and one wording cannot carry both; a third for a
document that was never read; and a fourth for a declared identifier that is not there, which is the one
outcome the other three cannot represent without lying about a location.

**The refusals are NOT findings, and saying so is what makes the accept-set closable.** §3.0's three
refusals — `N === M`, `--claim-about` without `--repair`, and `--repair` with no declaration — are
ADAPTER-level usage errors: the run does not happen, no document was swept, and there is nothing to
report ABOUT a document. Each prints its reason naming the offending values and exits 2, the code
`spec:lint` already uses for a usage error rather than a document defect (`pnpm spec:lint BACKLOG.md`
exits 2 with "cannot infer kind from path"). A refusal that emitted a finding would put a usage mistake
in the same channel as a claim about the corpus, and a reader could not tell a swept-and-clean run from
a run that never started.

```
VALUE_SUPERSEDED_ELSEWHERE  advisory        (numeric half)
  <doc>:<line> carries <N>, declared superseded by <M>, in a sentence that does not name <M>
  detail: re-read it -- it is stale, or it is deliberate and wants a word saying so.

CLAIM_SITE_UNSWEPT  advisory                (named-claim half)
  <doc>:<line> mentions <identifier>, DECLARED as a claim this repair changed
  detail: the identifier is not superseded, and this arm did not verify that the repair changed the
          claim -- the declaration did. Re-read this occurrence against the repair's new claim.

SWEEP_DOCUMENT_UNREADABLE  advisory         (either half)
  <doc> was declared in the swept set and could not be read; it was NOT swept
  detail: the sweep over this document did not happen. Silence about it is not a clean.

CLAIM_IDENTIFIER_NOT_FOUND  advisory        (named-claim half)
  <identifier> was DECLARED as a changed claim and occurs zero times EXACTLY in the swept set
  detail: nothing was swept for it. Check the declaration for a truncation or a typo -- an ordinary
          one-character slip matches as a SUBSTRING and would have reported everywhere.
```

**The FOURTH code exists because closing the accept-set exposed a signal §3.2 had required since the
identity rule landed and no code could carry.** Exact matching means a declared identifier can occur
zero times, and §3.2 requires that be reported as NOT FOUND rather than silently swept — the whole point
of the rule, since the one-character truncation `PublishedReviewModal.tsx:96` occurs ZERO times exactly
and on NINE lines as a substring across the incident's arc, measured at `c272ebed3`. `CLAIM_SITE_UNSWEPT`
asserts an occurrence AT A LOCATION, so emitting it here would invent one; the other two do not apply;
and silence is the fail-open this arm exists to prevent. The code carries the fact and no location,
because there is no location.

**The third code exists because neither occurrence code can truthfully describe a document that was
never read.** §3.3 requires an unreadable peer to be REPORTED, and review found that requirement had no
output contract and no killing fixture: an implementation that continues silently on
`readFileLines() === null` satisfies every occurrence assertion in §6 while AC-5's "never silently
skipped" is false of it. The code is the contract, and §6 carries the fixture that kills the silent form.

**SIGNAL INVENTORY — every normative outcome in §3, and the channel it leaves by.** Closing the
accept-set is only safe if the set is COMPLETE, and the way that goes wrong is a requirement written in
one section with no channel in another — which is exactly how the not-found signal came to be required
by §3.2 and unrepresentable by §3.4. So the inventory is stated as a table over §3's own requirements
rather than as a list of codes, and the rule is: **every outcome §3 requires leaves by exactly one of
three channels, and a requirement with no channel is a defect in this spec.**

| §3 requires | Channel |
| --- | --- |
| a surviving numeric occurrence in a sentence lacking the replacement | FINDING `VALUE_SUPERSEDED_ELSEWHERE` |
| an occurrence of a declared identifier outside the repair's spans | FINDING `CLAIM_SITE_UNSWEPT` |
| a declared identifier occurring zero times exactly | FINDING `CLAIM_IDENTIFIER_NOT_FOUND` |
| a declared peer the resolver cannot read | FINDING `SWEEP_DOCUMENT_UNREADABLE` |
| `--superseded N --replacement N` | REFUSAL, exit 2, both values named (§3.0) |
| `--claim-about` without `--repair` | REFUSAL, exit 2, naming the missing flag (§3.0) |
| `--repair` with no declaration | REFUSAL, exit 2, naming what was not declared (§3.0) |
| an undeclared peer | DECLARED SILENCE — §5 item 9 |
| a half-repaired sentence | DECLARED SILENCE — §5 item 7 |
| a reworded survivor | DECLARED SILENCE — §5 item 6 |
| a collateral identifier the author declared | reported as an occurrence; the mis-declaration is the author's, §5 item 8 |

Three channels, and the difference between them is load-bearing: a FINDING is a claim about a document,
a REFUSAL says the run never happened, and a DECLARED SILENCE is a documented limit the author already
dispositioned. Collapsing any two would make a swept-and-clean run indistinguishable from a run that
never started, or from one that declined.

**The table above is DERIVED where deriving it is possible, and the residue is declared rather than
asserted away.** A table that merely CLAIMS to be derived is enumeration in derivation's costume, and it
drifts the first time a requirement is added — which is exactly how the not-found signal came to be
required with no channel. So the cover runs in BOTH directions over the halves a checker can read:

- every FINDING row names a code that is in the module's exported `CLAIM_SWEEP_CODES`, and every exported
  code appears in exactly ONE row — so a fifth code, a missing one, or a row naming a code that does not
  exist fails without anyone re-reading this table;
- every DECLARED SILENCE row names a `§5 item N` that EXISTS, so a limit deleted from §5 cannot leave a
  row pointing at nothing;
- every REFUSAL row corresponds to a refusal §6 asserts exits 2 with no finding.

**What the cover CANNOT do is read §3's prose and discover a requirement with no row at all**, and that
is §5 item 10 rather than a claim quietly left standing. Extracting normative outcomes from English is
the recognizer §1.1 item 3 forbids this arm from building, and building one HERE — inside the guard's own
test — would be the same mistake at one remove. The cover carries a POSITIVE CONTROL so its clean verdict
is attributable rather than the shape of a check that never fired: a constructed row naming a code the
module does not export makes it report both names and exit non-zero.

**The named half deliberately does not say "superseded", and it does not say the REPAIR changed the
claim either — it says the DECLARATION did (§3.2).** The first review caught the earlier wording
asserting supersession: a repair that re-classifies a site changes the CLAIM about a stable identifier, and the identifier
itself has no replacement. Saying otherwise would be a wrong advisory in the arm's own finding text.
`RepairRecord` therefore carries a superseded/replacement PAIR for the numeric half and a changed-claim
identifier for the named half — different shapes, because they are different facts.

The arm asserts that the occurrence EXISTS and, for the numeric half, that the value was declared
superseded. It does not assert the claim is wrong. A deliberate historical reference — a dated record, a narration of what an earlier
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

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
**Every limit below is restated in `lib/specLint/claimSweep.ts`'s own module header.** A documented
limit belongs where the code is READ, not only where the spec is filed — a maintainer reaching for the
module does not necessarily reach for this document.

1. **A sentence is delimited lexically**, so a repair whose transition genuinely spans two sentences
   would draw a false advisory. **No such case exists in the corpus** — that is measured, not assumed.
   The single non-excluded row in §2 is not a transition at all: it is the mutation-operator NAME
   `0to1` inside a test title (`docs/superpowers/plans/2026-08-16-serialize-error-structure.md`, "kills
   <=to<, 0to1, and halved-decrement budget mutants"), which the CENSUS regex matches as an arrow shape
   while `0` and `1` never appear as standalone words. It is a false hit of the census instrument, not
   a miss of the discriminator. An earlier draft of this limit diagnosed it as a two-sentence
   transition on assumption; instrumenting the loop refuted that.
2. **A value that legitimately recurs** — a version number, an unrelated count that happens to equal the
   superseded one — is reported. The failure direction is a nuisance line, never a missed collision.
3. **The arm reports; it never rewrites.** Prose repairs are read, not swept: only a reader can tell a
   before/after sentence from a statement of current fact, and a blanket regex over the numbers is the
   instrument that CREATED the drift being cleaned.
4. **A repair that supersedes a claim without changing a token is invisible** — a rewording that changes
   meaning while keeping every number and identifier. This arm tracks tokens, and silence is not a
   certificate.
5. **Adversarial construction is out of scope** (§1.1 item 7).
6. **A REWORDED SURVIVOR IS MISSED BY THE NAMED HALF** (§3.2). Its exclusion is span-based, so an
   occurrence the repair TOUCHED for an unrelated reason — a wording change on a line that still carries
   the retired claim — is treated like the repair's own new claim and suppressed. Measured on the
   incident: one ordinary edit at spec line 268 moves it inside the repair's spans and the retired union
   reasoning is silently excluded. This is the named-half analogue of §3.1's same-hunk case, and it is
   declared rather than closed for the same reason: separating "reworded but still stale" from
   "restated correctly" requires reading the claim. Missed advisory, never a false one.
7. **A HALF-REPAIRED SENTENCE IS MISSED** (§3.1). One sentence carrying two claims on the same value,
   with only the first repaired, is suppressed because the sentence now names the replacement. The
   discriminating refinement was tested and rejected: a half-repaired sentence and a legitimate
   transition both carry exactly one of each value, so no sentence-local count separates them, and
   anything that could would need to know which claim each number belongs to. Missed advisory, never a
   false one.

8. **A COLLATERAL IDENTIFIER IS THE AUTHOR'S TO GET RIGHT** (§3.2). The arm cannot separate an
   identifier whose CLAIM the repair changed from one the repair's diff merely TOUCHED, because the
   difference is semantic and the diff does not carry it. Measured on `c272ebed3`:
   `components/admin/HoverHelp.tsx:562` occurs on both the removed and the added line of the repair's
   hunk while staying in exactly the classification it started in. Declaring it produces advisories that
   are TRUE about the occurrences and WRONG about the repair, which is why §3.4's wording attributes the
   changed claim to the DECLARATION and never to the arm's own analysis. A nuisance advisory on a
   mis-declaration, never a silent miss.
9. **A PEER THE AUTHOR DOES NOT DECLARE IS NOT SWEPT** (§3.3). The swept set is `<doc>` plus each
   `--also`, so an undeclared plan or probe record is simply absent and the run says nothing about it.
   Each of the three inference rules that would close this is wrong on the incident's own arc —
   citation-only misses the plan, stem-only misses the probe record, date matching pulls in an unrelated
   spec (§3.3 measures all three) — so the arm declines to guess. Missed advisory, never a false one.
10. **THE SIGNAL INVENTORY'S COMPLETENESS AGAINST PROSE IS NOT MECHANICALLY CHECKED** (§3.4). The
   cover reconciles the table against the module's exported codes and against §5's item numbers, in both
   directions, and it CANNOT read §3's prose to find a requirement that has no row. A requirement added
   to §3 without a row is therefore invisible to it — the same shape as the defect that produced the
   fourth code, surviving in the one place a checker cannot reach without becoming a recognizer over
   English (§1.1 item 3). Declared, with the positive control that proves the cover fires on the half it
   DOES check, rather than left as an unstated assumption. The mitigation is procedural and stated here
   so it is met at the point of temptation: **an edit adding a normative outcome to §3 adds its row in
   the same commit**, and the module header restates this limit.

## 6. Testing

All under `tests/specLint/`, TDD per task, anti-tautology rules of `docs/agents/writing-plans.md` in
force. Two covers are mandatory before any review dispatch, both learned on this arc's first PR.

**Every rule names the strictly WEAKER implementation its fixtures must kill.**

| Rule | Weaker implementation that would pass | Fixture that kills it |
| --- | --- | --- |
| §3.0 refusal, `N === M` | accept it and run | a declaration whose superseded value equals its replacement is REFUSED, naming both values; an implementation that runs reports zero on a corpus where the value occurs, which is the silent clean the refusal exists to prevent |
| §3.0 refusal, `--claim-about` without `--repair` | run anyway on an inferred exclusion | the incident's identifier, whose nine occurrences split five INSIDE the repair spans and four outside: without spans an implementation reports all nine, including the repair's own five new claims |
| §2.0 population | measure the corpus INCLUDING the arm's own documents | asserted as a SET RELATION and never a cardinality: the enumerated population contains NONE of `ARC_DOCUMENTS`, and the SAME enumeration without the exclusion contains ALL of the ones that exist. An implementation that forgets the exclusion fails the first half; one that enumerates nothing fails the second, so the pair cannot be satisfied by an empty read. **No fixture pins 936, 1009 or any other §2 figure** — AC-6 forbids it, and pinning one is how a corpus that grows turns a correct arm red |
| §3.2 attribution | word the advisory as "the repair changed this claim" | `components/admin/HoverHelp.tsx:562` declared against `c272ebed3`, where it occurs on BOTH sides of the repair's hunk with its classification unchanged: the advisory text is asserted to attribute the change to the DECLARATION, over EVERY emitted finding rather than sampled. The occurrences are right and the attribution is the only thing that can be wrong, so the occurrence assertions cannot kill this |
| §3.3 document set, resolution | INFER the peers from citations, stem, or date | the incident's own arc, where citation-only misses the plan (7 of the 9 survivors), stem-only misses `2026-08-18-border-border-neutral-fill-census.md`, and date matching pulls in the unrelated `2026-08-18-process-facing-mint-bar.md`. The fixture declares the peers, asserts the swept set is EXACTLY `<doc>` plus each `--also`, and keeps an undeclared sibling present in the tree and absent from the result |
| §3.4 unreadable peer | continue silently when `readFileLines()` returns null | a declared peer whose read returns null emits `SWEEP_DOCUMENT_UNREADABLE`; the silent implementation emits nothing for it while every occurrence-code assertion in this table still passes. Paired positive: the same peer READABLE, contributing its own occurrence findings — one variable, the readability |
| §2.0 fixture literals | key the no-collision check on a NONCE token | a synthetic literal written WITHOUT the nonce, which the nonce grep cannot see and the shared-module key still covers |
| §3.4 signal inventory | hand-maintain the table and assert it is derived | the reconciliation runs BOTH directions over the halves a checker can read — every FINDING row names an exported code and every exported code appears in exactly ONE row, every DECLARED SILENCE row names a `§5 item N` that exists, every REFUSAL row matches a refusal asserted to exit 2. POSITIVE CONTROL, so a clean verdict is attributable: a constructed row naming a code the module does not export makes it report both names and exit non-zero. The prose half it cannot reach is §5 item 10 |
| §3.4 accept-set | emit a fifth code, or drop one | the emitted code set over the whole fixture corpus, compared against the module's OWN exported code list rather than a list retyped into the test, so the drift cannot relocate into the checker. Paired with the three refusals asserted to emit no finding at all and exit 2, which is what keeps a refusal out of the finding channel |
| §3.4 not-found signal | match exactly and stay SILENT when nothing matches | the same truncated `…tsx:96` against `c272ebed3`: the run must emit exactly one `CLAIM_IDENTIFIER_NOT_FOUND` and ZERO `CLAIM_SITE_UNSWEPT`, asserted as both halves. A silent implementation emits nothing and passes every occurrence assertion in this table, because there are no occurrences to assert on. Paired positive, ONE variable — the identifier: the untruncated `…tsx:964`, same commit and same swept set, emits zero not-found and its occurrences instead |
| §3.2 identity | match the identifier as a SUBSTRING | a one-character truncation of the declared `file:line` (`…tsx:96` for `…tsx:964`) occurs ZERO times exactly and nine times as a substring — an ordinary CLI typo, so a substring implementation emits nine wrong advisories while the exact rule reports no occurrence and emits `CLAIM_IDENTIFIER_NOT_FOUND` |
| §3.0 declared input | INFER the pair from the repair's diff | the incident commit itself, whose diff carries `58` on BOTH sides and changes several literals: an inferring implementation picks a pair (any pair) and reports, while the shipped arm with `--repair` and NO declaration must report NOTHING and say why. Both halves asserted — the silence, and the reason line |
| §3.0 declared input | accept a declaration and ignore `--repair` | a declared pair whose surviving occurrence sits INSIDE the repair's hunks still reports for the numeric half, while the named half's own new claim (also inside them) does not — the spans are used by §3.2 and only there |
| §3.1 numeric half | report every surviving N (the naive form) | a transition sentence carrying BOTH values draws nothing — the 923-site corpus shape |
| §3.1 identity | key a finding `(code, doc, line, token)`, or dedup by line | a line carrying the superseded token TWICE in one sentence lacking the replacement reports TWICE, at two different columns — a line-keyed identity emits one and the loss is silent. Drawn from the live corpus, where the accepted `58 → 57` declaration has eight such lines and ten occurrences to lose. Paired positive, one variable: the SAME line with the second occurrence moved into a sentence that carries the replacement reports exactly ONCE, so the single finding is attributable to the sentence rule rather than to a dedup |
| §3.1 sentence scope | scope to the LINE instead | a line carrying BOTH a `57/58` transition sentence AND a separate stale `58` sentence — line scope excludes the whole line and misses the stale one, sentence scope reports it. Review caught the earlier fixture here: the consequence-bound line contains only `58`, so both scopes treat it identically and it discriminated nothing |
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
| a DECLARED pair whose superseded value appears nowhere in the documents draws nothing | the same declaration against documents where it DOES appear reports — one variable, the corpus, with the declaration held fixed. (An earlier draft paired "a repair changing no token" against "the same repair with one value changed", which moves BOTH the repair and the invocation and is not one variable.) |
| `--repair` with no declaration draws nothing | the same invocation plus `--superseded`/`--replacement` reports — one variable apart, so the silence is attributable to the missing declaration rather than to the arm failing to look |

**Second question, asked of every fixture: which rule DECIDES the observation, and is it the rule under
test?** Cross-finding machinery an implementer will invent — dedup by token, ordering, collapse by line
— can produce a pass value by another route.

**A finding's identity is `(code, doc, line, COLUMN, token)`, and the column is load-bearing rather than
decorative.** An earlier draft keyed it `(code, doc, line, token)` and said in the next clause that
several findings legitimately share a line — which the key it had just given cannot express. Measured at
the merge-base for the accepted `58 → 57` declaration: eight lines carry the superseded token two or
three times in a sentence that lacks the replacement, so 18 reportable occurrences collapse to 8
line-keyed identities and TEN vanish, silently, into what looks like a dedup. `Finding.column` already
exists for exactly this — `lib/specLint/types.ts` declares it a 1-based UTF-16 code-unit offset — and §2's
own naive census already dedups on `(path, value offset)`, so the offset was in the instrument and
missing only from the identity. Findings on one line have no natural order, so every multi-finding
assertion is order-independent: a sorted record or a set, never a positional array. **No dedup by
position, by line, or by token is permitted**, and there is no ordering guarantee to rely on.

The widening does NOT move AC-4's replay, which is measured rather than assumed: the nine `fede5f084`
survivors sit on nine DISTINCT lines (spec 220, 282; plan 7, 9, 18, 112, 119, 140, 188), so the same
nine identities appear under either key. The live corpus is where the two keys diverge, which is why the
fixture below is drawn from it.

**Every weaker implementation named above owes a SHIPPED killing check, and that is verified
mechanically at implementation time.** A table that names the case and a suite that omits it is the gap
between plan and implementation: no plan review catches it, because the plan is correct, and no fixture
audit catches it, because the fixture does not exist. So the implementer enumerates the killing checks
FROM THE TABLE ITSELF — never from recall — and classifies each into THREE states, not two:

- **ABSENT** — the table names the case and no test covers it.
- **PRESENT BUT UNPROVEN** — a test exists and has never been run against the mutant it targets. That
  is a CLAIM, not a proof, and it fails in the direction that looks green.
- **PROVEN** — the check exists AND was observed failing when its behaviour was broken.

Only PROVEN counts: presence is not adequacy, applied to this rule itself.

**Historical re-enactment, executable.** The probe record's two blobs ship as fixtures: `fede5f084`'s
tree draws exactly the 9 numeric survivors and excludes the 3 transition sentences; `c272ebed3` draws the MEASURED FOUR
sites — spec 268 and 327, plan 211, probe record 64 — being the nine occurrences minus the five inside
the repair's spans. An earlier draft said "the §6 identifier survivor" here, a singleton the second review's
repair had already refuted in AC-4 while this sentence kept it; a fixture asserting the singleton passes
while three required advisories vanish. These are the entry's own acceptance criterion, pinned by the incident
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

**A score is reported WITH WHERE IT WAS MEASURED, and a green local run is necessary rather than
sufficient.** State the local foreground run or the CI leg and its run id. If CI has run this surface,
read that result and reconcile it against the local number instead of assuming they agree; a
disagreement whose inputs are byte-identical by blob hash — source, declared operators, deciding suites
— is a finding about the harness and not about this diff, and the repair is a probe, never a code change
chasing it. **Triage at SURFACE grain, never at leg grain:** the annotation TITLE carries
`source-mutation gate — <id> > <case>` and so names the surface, while the assertion message does not,
and leg numbers move between runs as the partition re-packs. **Absence from a failure list is not
evidence of passing** — locate `claimSweep` by name and read its result.

**A PERFECT SCORE DOES NOT SUBSUME THE §6 KILLER AUDIT, and the closeout states both separately.** The
score covers what the DECLARED OPERATORS CAN EXPRESS. The audit covers implementations a human would
plausibly write that no operator generates — an unanchored substring matcher, a hardcoded id list, a
scanner that skips the DEFERRED half. Neither dominates: a sibling arc hand-built a weaker matcher that
passed its entire corpus and that its registry could not express, so no score however perfect would
have surfaced it. Both are required, and a reviewer treating the score as covering the audit is
mistaken.

**Survivor handling, in order of preference.** DELETE the site; else make the predicate TOTAL so the
differing case is unreachable by construction; else kill it with a test; and only then argue
equivalence, with a written premise re-checked against the diff before committing. An equivalence
argument and a deletion describe the same fact, and deletion is the honest form — it removes the site
rather than excusing it, and it cannot go stale when the surrounding code changes.

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
- **AC-2** — Named half: a DECLARED identifier reports at every OTHER occurrence; the repair's own new
  claim draws nothing; and a declared identifier occurring zero times EXACTLY emits
  `CLAIM_IDENTIFIER_NOT_FOUND` rather than silence, proved against the truncated identifier and paired
  with the untruncated one, one variable apart. The advisory attributes the changed claim to the DECLARATION and never to the
  arm's own analysis, asserted over every emitted finding — the arm cannot verify the repair changed the
  claim, and `HoverHelp.tsx:562` on `c272ebed3` is the live case where it did not (§3.2, §5 item 8).
- **AC-3** — Severity is advisory over EVERY emitted finding, asserted structurally rather than sampled;
  the arm never rewrites a document. The emitted CODE SET over the whole fixture corpus equals exactly
  the four of §3.4 — asserted against the module's own exported codes, never against a list retyped from
  prose — so a fifth code or a missing one fails without anyone re-reading the signal inventory. The
  signal inventory itself is RECONCILED in both directions against those exported codes and against §5's
  item numbers, with a positive control proving the reconciliation fires; the prose half it cannot reach
  is declared as §5 item 10 rather than claimed. The three §3.0 refusals are asserted to emit NO finding
  and exit 2.
- **AC-4** — The historical replay reproduces from committed blobs as a SET, never a count.
  `fede5f084` yields exactly the nine `(document, line, column, token)` numeric survivors and the three
  excluded occurrences. Those nine sit on nine distinct lines — spec 220 and 282, plan 7, 9, 18, 112,
  119, 140 and 188 — measured rather than assumed, so widening the identity to carry the column leaves
  this set unchanged while making the live-corpus collisions in §6 expressible. `c272ebed3` yields the MEASURED named-half set: the identifier occurs NINE times across
  that arc — spec lines 153, 155, 268, 327; plan lines 85, 148, 149, 211; probe record line 64 — and the
  arm reports those outside the repair's hunks. An earlier draft claimed it yields "the §6 survivor",
  which review refuted by counting; the criterion now states what the mechanism actually produces. **A count is defeated by substitution** — swapping one survivor
  for a different occurrence keeps the total at nine while changing what is asserted — so the assertion
  is the set. A count answers "did something new appear"; a set or digest answers "are these the same
  things", and this AC asks the second question.
- **AC-5** — Document set: the swept set is EXACTLY the declared documents — `<doc>` plus each `--also`
  — with no inference from citation, stem or date, and an undeclared sibling in the same tree is absent
  from the result. A survivor in the PLAN reports, not only one in the spec. A declared document the
  resolver cannot read emits `SWEEP_DOCUMENT_UNREADABLE`; silence about it fails this criterion, and the
  paired readable case proves the assertion is not satisfied by an empty run.
- **AC-6** — Corpus: the assertion is a RELATION, not §2's cardinality, because that number moves with
  the corpus — the historical sequence 936 → 943 → 947 → 953 across this arc's own rounds, §2.0. The POPULATION is a relation
  too: it contains none of `ARC_DOCUMENTS` and the unfiltered enumeration contains all of them, so no
  test pins a figure this arc's own writing can move. Enumerated at run time: EVERY sentence carrying a
  declared transition pair is excluded, and the count of those NOT excluded is reported rather than
  pinned — so a new document changes the total without failing the test, while a change that stops
  excluding transition sentences fails it immediately. The incident replay (AC-4) is where an exact SET
  is asserted, because its inputs are frozen blobs.
- **AC-7** — Every weaker implementation named in §6 has a killing check PRESENT IN THE SHIPPED TESTS,
  enumerated from the §6 table rather than from recall, and each is PROVEN — observed failing when its
  behaviour is broken — rather than merely present. Absent, present-but-unproven and proven are three
  distinct states and only the third satisfies this criterion. Every rule AND every fixture kills its named weaker implementation, and no fixture is
  neutralized by another rule; the pass is re-run to a FIXED POINT before each dispatch and its
  iteration counts recorded in the round filing.
- **AC-8** — Enrolment carries BOTH declarations, scores at or above 0.95 with an empty
  unaccepted-survivor set, and the purity meta-test passes.
- **AC-9** — This spec and the implementation plan lint clean (`0 hard`) through the shipped
  `spec:lint`, ONE document per invocation.
