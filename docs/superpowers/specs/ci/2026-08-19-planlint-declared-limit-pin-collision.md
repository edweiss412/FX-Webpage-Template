# spec:lint — declared-limit pin collision (a plan that moves a recognizer names the zeroes it invalidates)

Ledger: `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` (`BACKLOG.md`). **Facing:** process.

A **declared-limit pin** is a test asserting a ZERO which the surface's own documentation calls a known miss. The zero is a RECORD of current behavior, not a guarantee about it. A plan that changes the recognizer under such a pin flips it from a record into a false assertion, and nothing checks: the plan reads complete, the pin reds at implementation time, and the repair arrives as an unplanned extra task.

This spec adds one `spec:lint` arm over plan-kind documents. For each enrolled guard surface a plan's Files list names, it reports — as an **advisory** — every declared-limit pin in that surface's deciding suites which the plan does not name.

## 1. Scope

### 1.1 Explicitly resolved scope decisions (do not relitigate)

1. **The arm is ADVISORY and stays advisory.** The ledger entry fences this verbatim: "reported as an advisory rather than a hard finding until the corpus rate is measured". §2.6 measures the rate; promoting the code to `fail` is a separate decision with its own evidence, not a review round on this one. Every finding this arm emits carries `severity: "advisory"` (`lib/specLint/types.ts:1`).
2. **The domain is CLOSED, and that is the whole reason this row is buildable** where the argument-shape lint declined beside it was not. `tests/mutation/source/registry.ts` already names each enrolled surface's `suitePaths`, so for a plan whose Files list touches an enrolled surface, the pins to check are enumerable from disk: 38 surfaces, 100 distinct paths, 62 distinct suite files (§2.1). An unenrolled surface is outside the domain by construction and draws nothing.
3. **Discovery is by PHRASE IN A TEST TITLE, not by reading assertions.** The arm never parses a test body, never looks for `toHaveLength(0)`, and owns no JavaScript grammar beyond a single-line call-opener match (§3.1). The rejected alternative — locate the zero assertion and prove the title governs it — needs block extents over TypeScript and is the recognizer-growth road `lib/specLint/` already measured at 20 diff rounds with a flat finding rate (`docs/review-rounds/feat/speclint-prose-count-parity/`).
4. **A title that narrates a CLOSED limit is dispositioned per instance, never pattern-matched.** Two live titles say a limit closed (§2.4). Recognizing them would need tense and polarity over English; instead each is one row in a disposition registry with a reason, asserted against the scanner by a meta-test (§5). This is the `accepted:` shape the mutation registry already uses for survivors it cannot kill (`tests/mutation/source/registry.ts:37`).
5. **The plan's obligation is to NAME the pin, not to resolve it.** The arm cannot tell "I retire this pin" from "I deliberately leave it alone"; both are compliance. Naming means the pin's title appears verbatim in the plan text. That is what the incident's own repair did (`docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md`, Step 3b, which quotes the title in full).
6. **The grain is the plan's Files declaration, not the whole document.** Measured at the §2 baseline: whole-document matching draws on 63 plans against the Files grain's 23, the difference naming an enrolled path only in prose (§2.5). A plan citing `tests/mutation/_metaPremiseContract.test.ts` because its tests must satisfy the premise contract is not editing that file, and advising it about pins there is exactly the false advisory the consequence bound forbids.
7. **No new `Check` union member and no `CHECK_ORDER` change.** Findings report `check: "taskContract"`, following the fixture arm (`docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md` §5).
8. **Threat fence.** The arm defends against ordinary authoring mistakes by a contributor writing a plan. Adversarial obfuscation — a title constructed to evade the phrase match, a Files block written to hide a path — is out of scope and files to §8, not to a review round.

### 1.2 Out of scope

- Spec-kind documents. A spec does not carry a Files list; the collision is a plan-time fact.
- Any judgement about whether a pin SHOULD be retired. That is the author's call, and the advisory says so.
- Surfaces outside `tests/mutation/source/registry.ts`. Enrolment is the enrolment; there is no second registry.
- Pins in files that are not a registered `suitePath`. Placement outside `suitePaths` buys zero mutation score (the #831 lesson) and buys zero coverage here for the same reason: the registry is the statement of which suites decide a surface.

## 2. Measured calibration (probes are the design inputs)

Every number below was produced by a probe run against the live tree, not estimated, and every probe over the plan corpus is FENCE-AWARE — §3.2 reads only non-fenced lines, and a measurement that counted fenced ones would be describing a different rule than the one that ships (two such lines exist today, one of them inside this arc's own plan transcript). The §2.1 shape table was re-measured against the shipped rule after round 3 changed it, since the earlier figures had been taken under a draft that skipped a blank line between header and list, and each is a MEASUREMENT AT ONE COMMIT rather than a normative claim. The baseline moved twice during review, which is ordinary and is why the provenance is stated rather than assumed: the §2.2-§2.4 populations were first measured at `4e074d3bc`; the §2.1 shape table and the §2.5-§2.6 results were re-measured after this arc merged `origin/main` and after rounds 1 and 3 narrowed the rules, so they stand at the current tree with the corpus at 666 tracked plans. A number here reproduces at the commit it was taken at, not at every commit. Probe scripts are reproduced in the plan and re-run at implementation time; §6 and §10 assert derived SETS precisely so that no test depends on any cardinality above.

### 2.1 Corpus shape

| Population | Count |
| --- | --- |
| Enrolled guard surfaces (`GUARD_SURFACES`) | 38 |
| Distinct enrolled paths (`sourcePath` ∪ `suitePaths`) | 100 |
| Distinct `suitePaths` | 62 |
| Tracked plan `.md` files (`git ls-files 'docs/superpowers/plans'`) | 666 |
| `**Files:**` headers across them, EXCLUDING fenced lines | 2567 |
| …whose header line itself carries a path (inline form) | 642 |
| …whose NEXT line opens an unordered list (list form) | 1666 |
| …whose next line opens an ordered list (declined, §8 item 11) | 19 |
| …neither, including a blank next line (declined, §8 item 14) | 882 |
| Plans naming an enrolled path in a Files declaration | 23 |

### 2.2 The phrase population, and why the title narrowing is load-bearing

Grepping the three phrases anywhere in the 62 suite files returns **30 lines**. Restricting to a single-line `test(` / `it(` / `describe(` title returns **12**. The 18 excluded lines are mostly comments — but not all: at least one is executable test-table DATA (`tests/auth/sameOriginServerAction.test.ts:132`, a case-table row whose label carries the phrase), which the title restriction excludes correctly and for the right reason, since a table row is not a test title. Among the excluded lines are the two shapes that would be outright wrong to report:

- `tests/cross-cutting/psqlStartupFileSuppression.test.ts:4172` — "The QUOTED form used to be a documented limit" (a closure, narrated in a comment).
- `tests/cross-cutting/psqlStartupFileSuppression.test.ts:4665` — a comment quoting the title of a DIFFERENT test in order to say it is being retired.

A line-grep arm would report both. The title restriction removes them for free, without any tense recognizer.

### 2.3 Dropping `describe(` — the second narrowing

Of the 12 title hits, 3 are `describe(` group headings. A describe title summarizes a group; the zero lives in its member tests, which carry their own phrase-bearing titles where they are pins. Including describes produced one advisory against the MERGED shell-binding plan for the group `R40 — hypothetical gaps closed cheaply; the rest are documented limits` — a plan that had already named the specific pin it invalidated. Dropping describes takes the population from 12 to 9 and removes that advisory. The plan re-runs this comparison as an executed probe.

### 2.4 The two dispositions

Of the 9 remaining titles, two narrate a limit that CLOSED:

| Path | Title | Why not a pin |
| --- | --- | --- |
| `tests/cross-cutting/psqlStartupFileSuppression.test.ts` | `a QUOTED Windows path is now read - the R40-era known miss closes` | Asserts `toHaveLength(1)`. It is the pin's retirement, shipped by the incident's own Step 3b. |
| `tests/help/_metaUiLabelCrosswalk.test.ts` | `CLOSED (was DOCUMENTED LIMIT): a type annotation no longer reaches the haystack` | Its own title says CLOSED. |

Both are dispositioned per instance (§5). That leaves **7 live pins across 5 suite files**:

```
tests/docs/_metaReviewRoundEconomy.test.ts:681   PASSES a stale none followed by candidate lines - documented limit §5.7
tests/docs/_metaReviewRoundEconomy.test.ts:1001  does NOT resolve an id defined only as a body sub-item - the documented limit
tests/docs/interactionTimingScan.test.ts:144     a COMPUTED key is a documented limit, not a site
tests/specLint/numerics.test.ts:489              an irregular plural is NOT singularized — documented limit, not a wrong flag
tests/specLint/numerics.test.ts:1927             the wedge-remeasure anchor pair stays SILENT — the arm's documented limit (spec §3.3)
tests/specLint/universals.test.ts:188            accept-set: a word-form cardinal draws nothing (documented limit)
tests/cross-cutting/psqlStartupFileSuppression.test.ts:5167  each quote-concatenated keyword/operand spelling is a declared miss
```

Line numbers here are drafting-time locators and rot at every merge; the pin's IDENTITY is (path, title), which no edit elsewhere in the file can invalidate.

### 2.5 Why the Files block, measured

| Grain | Plans drawing ≥1 hit |
| --- | --- |
| Enrolled path anywhere in the document | 63 |
| Enrolled path in a Files declaration (§3.2) | 23 |

The 40-plan difference is prose citation: plans naming `_metaPremiseContract.test.ts`, `_metaReviewRoundEconomy.test.ts` or `numerics.ts` as context, contracts to satisfy, or prior art. None of them edits the surface. The Files block is the plan's own declaration of what it touches, so it is the grain — declared, never inferred, the same principle the task-marker contract rests on (`docs/agents/spec-self-review.md`).

**Two shapes carry the declaration, and only two.** 642 of the 2567 headers put the paths on the header line itself (`**Files:** create \`a\`, \`b\`; modify \`c\``); 1666 are IMMEDIATELY followed by an unordered list. Both are read. An ORDERED list after the header — 19 headers — is DECLINED: sampling those runs shows the numbered items are as often TASK STEPS as files (`1. **RED first …**`, `1. Merge \`origin/main\` …`, `1. Move the full body to \`BACKLOG-archive.md\``), and admitting them would re-import exactly the prose citations this grain exists to exclude. The arm cannot classify an ordered run, so it declines and files the limit (§8 item 11) rather than guessing.

The Files declaration's INTERNAL grammar is deliberately not modeled. A probe over the corpus's bullet verbs returns `Modify` 2011, `Test` 960, `Create` 761, `Commit` 22, `AC` 22, `Delete` 21 and a long tail of one-off labels (`Modify or delete`, `Create or finalize`, `Regenerate`, `deliver row`, `Route precedence pin`, …). An accept-set over verbs is a denylist wearing an accept-set's clothes. The arm reads only whether an enrolled path — a member of a closed 100-element set — appears on a line inside the block.

### 2.6 The corpus rate, which is what the ledger asked to measure

Running the shipped rules (§3) over the plan corpus enumerated by `git ls-files 'docs/superpowers/plans' | grep '\.md$'` (§2.1 owns that count):

**3 plans draw an advisory; 5 advisories total**, at the §2 baseline.

```
docs/superpowers/plans/2026-07-19-spec-lint.md             2  (numerics.test.ts)
docs/superpowers/plans/2026-08-04-review-round-economy.md  2  (_metaReviewRoundEconomy.test.ts)
docs/superpowers/plans/2026-08-09-m-wave-2/plan.md         1  (interactionTimingScan.test.ts)
```

Round 3's narrowing removed two of the five plans measured before it. Both were BLANK-GAP absorptions —
an inline Files declaration followed by a blank and a task checklist — so each was a false advisory of
exactly the kind §2.5 says the grain prevents, and the corrected rule dropped them without touching any
advisory a Files declaration actually earns.

Every one is a MERGED plan that names an enrolled surface in its Files declaration and does not name that surface's pin. The arm reads the tree at lint time, so re-linting a historical plan can advise about a pin added after it merged — a documented limit (§8 item 1), not a defect, and one with no cost in the arm's actual payoff moment, which is a plan being written now.

The cardinality here is a MEASUREMENT at one commit, never a normative claim: the corpus grows, so §6 and §10 assert the derived SET the shipped scanner reports over the enumerated corpus, and no test hard-codes this count.

### 2.7 The incident, re-enacted from git (the acceptance criterion)

`fix/shell-binding-mixed-quoted-value` plan round 3, finding 1: the spec's §3.2 fix 3 inverted the verdict of a committed pin, and neither the spec nor the plan named it until a reviewer did. The plan then grew Step 3b to retire the pin, its `scan.ts` residual-limits item, and their DEFERRED pointer. The arc is merged, so the replay reads blobs:

| Input | Blob | Result |
| --- | --- | --- |
| Suite, pre-repair | `d4060b8b8^:tests/cross-cutting/psqlStartupFileSuppression.test.ts` | 1 pin discovered: `a QUOTED backslash path in shell text is a KNOWN miss` (line 4176) |
| Plan, pre-Step-3b | `32e3fcd60^:docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md` | names the surface in its Files block; **1 advisory**, naming that pin |
| Plan, post-Step-3b | `32e3fcd60:` same path | names the surface AND the pin; **0 advisories** |

Both directions, from committed history, with no constructed input. A mechanism that flags the pre-repair plan but stays silent on the repair is the mechanism the entry asked for; one that fires on both would be a nuisance, and one that fires on neither would be decoration.

## 3. The arm

### 3.1 Pin discovery (pure, over one suite file's PREPARED lines)

The core never decides what is code. Before any line is scanned, the ADAPTER prepares the suite text by
BLANKING every non-code span, position-for-position, so that scanning a prepared line cannot see text
that never executes:

1. **Comments** are blanked by `stripCommentsSafely` (`tests/_shared/stripComments.ts:68`) — THE
   comment-stripping module for structural guards, whose own meta-test forbids local copies. It
   replaces comment characters with spaces and preserves every line terminator, so line and column
   numbers survive exactly.
2. **Template-literal bodies** are blanked the same way, from `ts.isTemplateLiteral` ranges reported by
   the TypeScript parser. Ordinary string literals are LEFT INTACT — they carry the titles.

This is the round-3 repair and it is a NARROWING of the core, not a widening: a line-oriented matcher
cannot see block-comment or template state, so a live pin wrapped in `/* … */`, and a `test(`-shaped
line inside a template fixture, were both discovered as pins — one ordinary edit from a live suite, and
a false advisory in both cases. The core loses the concern entirely rather than growing a lexer to
answer it: **the TypeScript parser is the oracle for what is code, and the arm owns no grammar for it.**
`stripCommentsSafely`'s walker covers `tests/` only, so a hand-rolled copy inside `lib/` would be
invisible to that guard — which is the other reason the logic lives in the adapter and is the shared
module's, not ours.

A **pin** is a line of the PREPARED text that satisfies ALL of:

1. It opens a call to `test` or `it` — matched at the start of the line modulo leading whitespace. `describe` is excluded (§2.3). A `.each` form is excluded (§8 item 3).
2. Its first argument is a string literal delimited by a double or single quote, opening and closing on that same line, with standard backslash escapes.
   **The pin's title is the DECODED content of that literal**, not its source spelling: `\"` becomes `"`, `\\` becomes `\`, and the usual single-character escapes resolve. This is load-bearing rather than incidental — the runtime test name is the decoded string, so a plan author quoting the pin copies the DECODED form, and comparing the source spelling against the plan would draw a false advisory on a title the accept-set explicitly admits. A template literal is excluded (§8 item 4).
3. The literal's content matches one of exactly three phrases, case-insensitively: `known miss`, `documented limit`, `declared miss`. This accept-set is the ledger entry's, verbatim.
4. The (path, title) pair is not present in the disposition registry (§5).

The pin's identity is `(path, title)`. Its reported location is the matching line, resolved at lint time.

### 3.2 Surfaces a plan names (pure, over the parsed plan model)

A **Files declaration** opens on a non-fenced line matching `**Files:**` or `**Files**` (optionally as a list item). Its span is decided by the header line itself:

- **Inline form** — the header line's remainder names at least one path. The declaration is THAT LINE ALONE. Nothing below it is read, because an inline declaration is complete where it is written.
- **List form** — the header line names no path, and the line IMMEDIATELY BELOW it opens an unordered list item. The declaration is that run of unordered list items and their indented continuations, ending at the first blank line or the first line that is neither.
- **Anything else** — an ordered run (§8 item 11), a blank line between header and list, a table, a fence — is DECLINED. The declaration is the header remainder alone.

No blank line is ever skipped, and the two forms are exclusive. Round 3 measured why: a live plan carries `**Files:** \`BACKLOG.md\` **and \`BACKLOG-archive.md\`**` followed by a blank and then a TASK CHECKLIST, and skipping the blank absorbed that checklist — so adding one ordinary prior-art citation to a checklist step made an unrelated pin advise. That is exactly the prose-citation false advisory the Files grain exists to prevent, and the blank line is the signal that the list below belongs to something else.

Inside that span, a line **names** an enrolled path when the path occurs as a DELIMITED token: the characters immediately before and after the occurrence are not path characters (`[A-Za-z0-9._/-]`). A bare substring test is unsound — a sibling path formed by appending .bak to a live entry contains that entry as a substring while naming a different file, and that is one ordinary authoring edit from a live corpus entry. The candidate set is the closed set of every enrolled `sourcePath` and `suitePath`. A path naming several surfaces (`tests/docs/_metaReviewRoundEconomy.test.ts` is a `suitePath` of three) names all of them; pins are deduplicated by (path, title) afterwards, so the reader sees each pin once.

### 3.3 The obligation, and the finding

For every pin on every named surface, in doc order of first naming then pin order within a suite: if the plan's text — the whole document, fenced blocks included — does not contain the pin's DECODED title (§3.1 item 2) as a verbatim substring, emit

```
DECLARED_LIMIT_PIN_UNNAMED  advisory
  <suitePath>:<line> pins a declared limit that this plan does not name: "<title>"
  detail: surface <id>; name it in the plan (retire it, or say it is left alone), or waive this advisory.
```

anchored at the Files-block line that named the surface.

### 3.4 A suite the resolver cannot read is REPORTED, never skipped

A `suitePath` can fail to yield trustworthy pins in THREE different ways, and only one of them is visible through `readFileLines`. That method returns `null` for an unreadable path or a symlink (`lib/specLint/types.ts:42`), but it is **tracking-blind**: it resolves any file that exists on disk, so an UNTRACKED suite is read successfully and reports its pins — or reports none — with no signal that the tree and the index disagree. The third is that the suite does not PARSE, in which case preparation (§3.1) cannot tell code from comment and the raw text is not a safe substitute (§8 item 15). The arm therefore checks all three: a `suitePath` absent from `resolver.listTrackedFiles()` draws the advisory, so does one whose `readFileLines` returns `null`, and so does one whose preparation reports parse diagnostics. Neither is allowed to reach the reader as "no pins" — "no pins" and "could not look" must not be the same observation. That shape is the fail-open defect the guard-premise work measured repeatedly: a read that could not happen and a read that found nothing return the same value, and the check then passes by not seeing anything (`docs/agents/writing-plans.md`, "State every guard’s premise executably"; `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md`). So the arm emits

```
DECLARED_LIMIT_PIN_SUITE_UNREADABLE  advisory
  surface <id> names a deciding suite this lint could not read: <suitePath>
```

and reports zero pins for that suite, saying so rather than implying there are none.

## 4. Architecture & purity

```
scripts/spec-lint.ts                # adapter: GUARD_SURFACES -> injected table; PREPARES suite text
lib/specLint/declaredLimitPins.ts   # NEW, pure: pin grammar, Files-declaration span, obligation, findings
lib/specLint/run.ts                 # threads the injected table core-ward, plan-kind only
lib/specLint/types.ts               # EnrolledSurface (id, sourcePath, suitePaths) — no registry type crosses
tests/_shared/stripComments.ts      # REUSED, unmodified: the single-source comment stripper
```

- **The registry is injected as data, never imported by `lib/`.** The adapter reads `GUARD_SURFACES` and passes `readonly { id, sourcePath, suitePaths }[]`. `scripts/` importing `tests/mutation/source/**` is established (`scripts/print-mutation-sites.ts:24`). The core receives a plain array, so the mutation harness scores the LOGIC while the registry stays the registry.
- **Suite TEXT comes through the existing `FileResolver`**, which the core already takes. No new I/O boundary, and `readFileLines`'s `null` contract is honored explicitly (§3.4).
- **Preparation is the adapter's, and it is the only place TypeScript is parsed** (§3.1), in a FIXED ORDER: parse the RAW text for diagnostics first, then blank. The reverse order silently launders an unparseable file into a clean one (§3.1). The adapter calls `stripCommentsSafely` and blanks template ranges; the core receives lines and owns no notion of comment, template, or code. Two reasons, both structural rather than stylistic: the shared stripper is mandated for `tests/` and a private copy in `lib/` would sit outside its walker, and a core that cannot see comment state cannot grow a lexer to guess at it.
- **Purity holds.** `tests/specLint/_metaPureCore.test.ts` walks the core tree recursively, so the new file is covered by default.
- **No `parse.ts` change.** Fence awareness comes from `model.fencedInfo`, already computed.
- **A null injected table means the arm runs nothing** — the same static/injected split the exec, parse, probe and fixture arms use. This keeps `runLint`'s existing callers compiling and their behavior byte-identical.

## 5. The disposition registry and its derived cover

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
`tests/specLint/declaredLimitPinDispositions.ts` holds one row per phrase-bearing title that is NOT a live pin:

```ts
export const NOT_A_PIN: readonly { path: string; title: string; reason: string }[] = [ … ];
```

Two rows today, both from §2.4.

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
`tests/specLint/_metaDeclaredLimitPins.test.ts` is the cover, and it walks the enrolled suites from disk so a new suite file is covered by default:

1. **No stale row.** Every disposition's (path, title) still matches a title on disk. A row whose test was renamed or deleted fails, so the registry cannot silently accumulate.
2. **No empty reason.** A disposition with an empty or whitespace `reason` fails — a waiver that launders itself is the shape `WAIVER_MISSING_REASON` already refuses to allow (`lib/specLint/run.ts:47`).
3. **The census is DERIVED, not typed.** The expected pin set is recomputed by the shipped scanner over the enrolled suites and compared to raw-titles-minus-dispositions. A literal count in the test would let the drift relocate into the test — the defect the count-parity checker was built to avoid.
4. **Both directions.** The suite constructs a phrase-bearing title and asserts it becomes a pin; constructs a dispositioned one and asserts it does not; asserts a real run over the live tree reports the 7 pins of §2.4 by (path, title).

A new phrase-bearing title needs no registry row: it simply becomes a pin, which is the safe direction. A new CLOSURE narration draws an advisory until someone dispositions it — surfaced and conservative, never silent.

## 6. Testing

All under `tests/specLint/`, TDD per task, anti-tautology rules of `docs/agents/writing-plans.md` in force.

**Every rule below names the strictly WEAKER implementation its fixtures must kill.** This is a distinct
check from anti-tautology and both apply: anti-tautology asks whether a test can fail at all, this asks
whether it can fail for the RIGHT REASON. A fixture set satisfiable by something that is not the thing
specified is green about a property it never tested. The pass was run exhaustively over §3 and §5 rather
than one rule at a time, and it found two gaps, both closed below (the synthetic-surface case and the
healthy-suite silence case).

| Rule | Strictly weaker implementation that would pass | Fixture that kills it |
| --- | --- | --- |
| §3.1 pin discovery | the seven live pin titles, hardcoded | every accept case uses a SYNTHETIC title that appears nowhere in the live corpus — a hard requirement on the suite, not a preference |
| §3.1 title position | match the phrase anywhere on the line | the phrase in the SECOND argument, never the title |
| §3.1 decoding | return the raw capture | the decoded/source-spelling pair, both directions |
| §3.2 naming | match the whole document | an enrolled path in prose outside every declaration |
| §3.2 naming | bare substring | a `.bak` sibling of a live entry |
| §3.2 candidate set | the 100 live enrolled paths, hardcoded | a SYNTHETIC injected surface whose paths appear nowhere in the registry is named, and its pin advises |
| §3.2 span | read only the header, or only the list | the inline-form case and the list-form case, each failing the other implementation |
| §3.3 obligation | report every pin regardless of the plan | a plan naming the pin draws nothing |
| §3.3 grain | count per surface | one pin reachable through two surfaces draws ONE finding |
| §3.4 fail-open | fire the advisory for every suite | a healthy, tracked, parseable suite draws NO unreadable advisory |
| §3.4 channels | honor `readFileLines` only | an untracked suite whose read SUCCEEDS |
| §3.4 parse channel | strip first, then parse (a clean parse every time) | the UNTERMINATED `/*` fixture specifically — a generic syntax error passes under either order, this one passes only if diagnostics came from the raw text |
| §5 dispositions | the two known titles, hardcoded | a constructed disposition suppresses its own synthetic pin; removing a real row un-suppresses |
| §4 adapter | prepare nothing, or inject nothing | AC-10, through the shipped CLI, asserting both directions |

- **Pin grammar (pure).** Each phrase matches in a `test(` and an `it(` title, in double-quoted and single-quoted literals, case-insensitively, with an escaped quote inside the literal. Each excluded shape draws NOTHING and is asserted explicitly, with its §8 item cited in the test body: a `describe(` title; a `.each` form; a template literal; a title whose literal opens on one line and closes on another; a phrase in a comment; a phrase in the SECOND argument. A dispositioned (path, title) draws nothing; the same title at a DIFFERENT path still draws (the disposition is keyed on the pair, not the string). **Decoding is asserted end to end:** a title source-spelled with `\"` yields the DECODED title, a plan naming the decoded form draws nothing, and a plan naming the SOURCE spelling draws the advisory — the pair that fails any implementation carrying the raw capture through to the comparison. **A decoded NEWLINE title named across two plan lines draws nothing, and a decoded TAB title named within one line draws nothing** (§8 item 13): both fail a per-line obligation matcher, which is the implementation this pair exists to reject.
- **Files-declaration span (pure).** An INLINE declaration reads its own line and nothing below it, asserted with the live blank-then-checklist shape round 3 found — the discriminating case, which any blank-skipping implementation fails. A LIST declaration ends at the first blank line and at the first non-list line; a second `**Files:**` block in the same document is read too; a `**Files:**` line inside a fence is inert; an enrolled path in prose outside any block draws nothing (the §2.5 measurement, made executable); an enrolled path inside a block on a bullet with an unmodeled verb still draws (the §2.5 verb argument, made executable).
- **Obligation (pure).** Title present verbatim → nothing; absent → one advisory; present inside a fenced block → nothing (the plan named it); one pin reachable through two surfaces → ONE advisory, not two; a pin whose title is a substring of a longer title → the longer title's presence does not satisfy the shorter pin unless it literally contains it, asserted with a constructed pair.
- **Unreadable suite (§3.4), BOTH channels.** A resolver returning `null` for a `suitePath` draws `DECLARED_LIMIT_PIN_SUITE_UNREADABLE`; SEPARATELY, a `suitePath` absent from `listTrackedFiles()` draws it too, asserted with a fake resolver whose `readFileLines` SUCCEEDS for that path and returns real pin-bearing text. That second case is the one a tracking-blind implementation passes silently, and it is the reason the arm cannot rest on `readFileLines` alone. Both assert that the OTHER suite's pins still report, so an implementation abandoning the whole surface on one bad suite fails.
- **Historical re-enactment (§2.7), executable.** The pre-repair suite blob and both plan blobs are committed as fixtures; the pre-Step-3b plan draws exactly one advisory naming the pin, and the merged plan draws zero. This is the entry's acceptance criterion pinned by the incident itself rather than by a synthetic analogue.
- **Corpus regression.** The tracked plan corpus, ENUMERATED at run time rather than counted in the test, relints to exactly the §2.6 SET of `(plan, suitePath, title)` triples. A test asserting a COUNT would pass on a different set and would go stale the moment a plan is added — including this arc's own plan, which grew the corpus between drafting and review. The §2.6 cardinality is a dated measurement; the assertion is the set.
- **Injection, positively.** A null table draws zero findings of either code, and a table naming a surface with no pins draws nothing — but both are SILENCE cases and an implementation ignoring the table entirely passes them. The discriminating case is POSITIVE: a SYNTHETIC surface, whose `sourcePath` and `suitePaths` appear nowhere in `tests/mutation/source/registry.ts`, is named by a fixture plan and its pin advises. An implementation carrying a hardcoded copy of the live enrolled paths fails only this one.
- **Fail-open fires only when it should.** A healthy suite — tracked, readable, parseable — draws NO `DECLARED_LIMIT_PIN_SUITE_UNREADABLE`, asserted directly rather than inferred from other cases passing. An implementation that emits the advisory unconditionally satisfies all three channel cases and is caught only here.
- **CLI boundary proof (a real subprocess, and the ONLY proof that covers preparation).** Every other case in this section exercises the pure core with prepared lines supplied by the test, so a shipped adapter that passes RAW lines — or never injects the surface table at all — satisfies all of them and the whole round-3 false-advisory class survives where it actually lives. This case therefore runs the shipped `spec:lint` binary over a fixture plan and a fixture suite in which one pin is live and a second, **carrying a DIFFERENT title**, sits inside `/* … */`. The run must emit exactly one `DECLARED_LIMIT_PIN_UNNAMED`, naming the live pin and not the commented one.

**The two titles must differ, and round 5 is why.** An earlier draft made the commented pin IDENTICAL to the live one; both then share a `(path, title)` identity, the §3.3 deduplication collapses them, and an adapter that never prepares the text emits exactly one finding — the pass condition. The proof was satisfiable by the defect it existed to catch. Distinct titles make "two findings" reachable, so the assertion can fail in the direction it claims to test. A run emitting two proves the adapter never prepared; a run emitting none proves it never injected. Both failure directions are asserted, because either alone is satisfiable by the other defect.
- **Dogfood.** This spec and its plan exit 0 hard under `pnpm spec:lint`, attached to every review dispatch (`docs/agents/spec-self-review.md`). **This is not a boundary proof and must not be read as one:** the arm is advisory-only, so `0 hard` is green whether or not the arm ran at all.

## 7. Mutation enrolment (before the first review dispatch)

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
`lib/specLint/declaredLimitPins.ts` is a guard surface whose defect class is exactly "reports OK while the output moved" — every branch either emits a code or deliberately says nothing — so enrolment precedes review (AGENTS.md convergence-criterion bullet 4). It ships as an importable module with referring suites from the start, never a terminal CLI script.

Enrolment is TWO declarations: a `tests/mutation/source/registry.ts` row (`id: "declaredLimitPins"`, `sourcePath`, `suitePaths` naming the §6 pure suites, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, a `control` mutant, `accepted: []`), following the `redContract` row (`tests/mutation/source/registry.ts:525`) verbatim in shape, AND an `EXPECTED_LEDGER_KINDS` entry in `tests/mutation/source/expectedLedgerKinds.ts`, which `tests/mutation/guardSurfaces.gates.test.ts` reads as its expected key set — a registry row alone leaves the corpus gate red.

`pnpm mutation:guards` runs BEFORE the round-1 diff dispatch and the brief states `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on its `GUARD SURFACE:` line; the wrapper exits 2 without it. Scoping is by a temporary `guardSurfaces.shard*.test.ts` filtering `GUARD_SURFACES` before `registerSurfaceCases`, deleted after the run (`_metaSourceShardIntegrity` pins the shard set byte-for-byte); `-t` does not bound the gate. Deciding assertions live inside the registered `suitePaths` — placement outside them buys zero score.

## 8. Documented limits (round 0)

1. **The arm reads the tree at lint time.** Re-linting a plan merged before a pin existed can advise about that pin (§2.6, both live instances). Conservative and surfaced; the payoff moment is a plan being authored against today's tree.
2. **A pin outside a registered `suitePath` is invisible.** By §1.2, and for the same reason the mutation gate ignores it.
3. **`test.each` / `it.each` are not read.** The title follows the case table, and admitting it means reading across the array — the block-extent road §1.1 item 3 declines. No live pin uses the form; one live `test.each` title carries the word "limit" without any of the three phrases, so it is not in the population either way.
4. **A template-literal title is not read.** Substitution would make the title non-constant, and a constant one is an ordinary edit away from a quoted literal. No live pin uses one.
5. **A multi-line call is not read.** A title whose literal does not open and close on the opener's line draws nothing.
6. **The phrase accept-set is fixed at three.** A pin phrased another way ("stays a limit", "still missed") is invisible. Widening the set is an accept-set change with its own corpus numbers, not a review round — and each widening enlarges the target, which is the ratchet the narrowing rule exists to stop.
7. **Naming is a verbatim substring test.** A plan that paraphrases a pin instead of quoting it still draws the advisory. The advisory prints the exact string to include, so the repair is a copy-paste; the failure direction is a nuisance line, never a missed collision.
8. **The arm cannot tell retirement from deliberate retention** (§1.1 item 5). It reports that the plan is silent, which is the fact it can establish.
9. **A Files declaration written in an unmodeled shape is not read.** A plan that lists files in a table, a fenced block, or prose under a differently-worded heading draws nothing. Measured fence-aware, against the rule §3.2 actually states rather than an earlier draft of it: of 2567 `**Files:**` headers, 642 carry the paths inline and 1666 are immediately followed by an unordered run — the two modeled shapes — while 19 open an ordered run (declined, item 11) and 882 are followed by neither, a population that includes every blank-then-list header the no-blank-skip rule declines (item 14). Silence from this arm is not a certificate.
10. **Adversarial evasion is out of scope** (§1.1 item 8).
11. **An ordered list after a Files header is declined** (§2.5). 19 headers of 2567 are followed by one, and sampling shows those runs are as often task steps as file lists, so the arm reads the header remainder alone and reports nothing about the run. The failure direction is a missed advisory, never a false one — the conservative side, and the side the consequence bound requires.
12. **The pin GRAIN is the test, not the individual zero it tabulates.** A test whose body iterates a table of declared misses is ONE pin, however many rows the table holds. Measured on the live corpus: the `documented limits - quote-concatenated spellings outside the assignment family` group in `tests/cross-cutting/psqlStartupFileSuppression.test.ts` holds a six-row table under one title, and a concurrent arc enumerating that file's declared misses BY ZERO counted ten where this arm counts one. Both counts are right about different units, and the arm's unit is the one the obligation needs: a plan changing behavior under any row must name the enclosing test, so no collision is missed — only the arithmetic differs. A reviewer comparing a by-zero census against this arm's output is comparing units, not finding a recall gap.
13. **A decoded title containing a newline or tab IS nameable, and the obligation must be a whole-document search to keep it so.** An earlier draft claimed such a title could never be named; that was wrong in both cases. §3.3 searches the plan's whole text, so a decoded newline matches across two plan lines and a decoded tab matches within one. The limit that remains is a REQUIREMENT on the implementation rather than on the author: an obligation matcher written per-line would fail the newline case and emit a permanent advisory nobody could silence, so the whole-document search is load-bearing and is asserted directly (§6).
14. **A Files declaration separated from its list by a blank line reads as INLINE.** If the header names paths, the list below is not read; if it names none, the declaration is empty and the plan names nothing. The failure direction is a missed advisory, never a false one.
15. **Code-ness is the TypeScript parser's answer, and a suite the parser cannot read is DECLINED, never scanned raw.** If preparation reports parse diagnostics, the arm emits `DECLARED_LIMIT_PIN_SUITE_UNREADABLE` for that suite and reports no pins from it. An earlier draft called scanning the raw text "conservative over-reporting"; round 4 refuted that with one ordinary edit — inserting an unterminated `/*` above a live pin leaves two real pins textually visible while neither executes, so the raw scan produces WRONG ADVISORIES. Under this spec's own consequence bound a wrong advisory is the failure, so over-reporting is not the safe direction and never was. Declining is: it is the same decline-and-surface the bound explicitly permits, and it reuses the fail-open code rather than inventing a third one.
16. **A path that is a proper prefix of another path is distinguished by delimitation, not by tracking.** The arm does not ask git whether a named path exists; a .bak sibling of a live entry fails the delimiter test and names nothing, and an untracked path that IS delimited names its surface if it string-matches an enrolled entry. Checking trackedness would make the arm's verdict depend on index state a plan author cannot see.

## 9. Wiring & docs (same PR)

- `package.json`: no new script — the arm rides `spec:lint` and its default invocation.
- `docs/agents/writing-plans.md`: one sentence on the advisory, under the reconciliation/closeout-sweeps bullet where the authoring discipline it mechanizes already lives.
- `BACKLOG.md`: `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` archived per house convention, marker off, as ONE ledger commit before whole-diff review (invariant 12 as ruled 2026-08-18).
- `docs/superpowers/specs/README.md`: one row for this spec.
- codex-guard `--lint-doc`: no change — it inherits the arm automatically, since the arm runs on the default invocation.

## 10. Acceptance criteria

- **AC-1** — Pin grammar: each of the three phrases in a single-line `test(`/`it(` title in a double-quoted or single-quoted literal is a pin, case-insensitively; the pin's title is the DECODED literal content, proved by a source-spelled `\"` title whose decoded form a plan names (no advisory) and whose source spelling a plan names (advisory); each excluded shape of §8 items 3, 4 and 5, plus a `describe(` title, a phrase in a comment, and a phrase in a non-first argument, draws NOTHING, asserted per shape. Proved by the pin-grammar suite.
- **AC-2** — Files-block grain: an enrolled path inside a modeled Files block names its surface; the same path in prose outside every block names nothing; a `**Files:**` line inside a fence is inert. Proved by the extent suite, and by the corpus assertion of AC-6, whose corpus contains the prose-only plans §2.5 measures — that table is the single source for the population, and AC-2 deliberately quotes no cardinality of its own.
- **AC-3** — Obligation: a named pin draws nothing, an unnamed one draws exactly one `DECLARED_LIMIT_PIN_UNNAMED` at advisory severity, and a pin reachable through two surfaces draws one finding, not two. No input at any severity other than advisory is produced by this arm, asserted structurally over the emitted findings rather than by sampling.
- **AC-4** — The §2.7 replay reproduces from committed blobs: the pre-repair suite yields exactly the pin `a QUOTED backslash path in shell text is a KNOWN miss`; the pre-Step-3b plan draws exactly one advisory naming it; the merged plan draws zero. This is the ledger entry's own acceptance test.
- **AC-5** — Fail-open closed on BOTH channels: a `suitePath` whose `readFileLines` returns `null` AND a `suitePath` absent from `listTrackedFiles()` each draw `DECLARED_LIMIT_PIN_SUITE_UNREADABLE` and suppress no other finding. The untracked case is asserted with a resolver whose read SUCCEEDS, since a tracking-blind implementation passes the `null` case and fails only this one.
- **AC-6** — Corpus: the tracked plan corpus, enumerated at run time, draws exactly the §2.6 SET, each advisory identified by (plan, suitePath, title) — asserted as a set, never as a count, and never against a cardinality typed into the test.
- **AC-7a** — Every rule of §3 and §5 has a fixture that kills its named strictly-weaker implementation, per the §6 table. In particular: no accept-case title in the pin-grammar suite appears anywhere in the live corpus; a synthetic injected surface is named and advises; and a healthy suite draws no unreadable advisory.
- **AC-7** — Dispositions: every row resolves to a live title, every row carries a non-empty reason, and the pin census is derived by running the shipped scanner rather than by a literal in the test. A constructed disposition suppresses its own pin and no other.
- **AC-8** — Enrolment: `declaredLimitPins` carries both declarations (registry row AND `EXPECTED_LEDGER_KINDS`), scores at or above 0.95 with an empty unaccepted-survivor set, and the purity meta-test passes with `parse.ts` unmodified.
- **AC-9** — This spec and the implementation plan lint clean (`0 hard`) through the shipped `spec:lint` at dispatch time. Because this arm is advisory-only, AC-9 is explicitly NOT evidence that the arm ran; AC-10 is the proof that it did.
- **AC-10** — The shipped CLI, as a real subprocess, emits exactly one `DECLARED_LIMIT_PIN_UNNAMED` over a fixture pair holding one live pin and one DIFFERENTLY-TITLED pin inside a block comment (identical titles would share an identity and let §3.3 dedup collapse the two-finding failure into the pass). Two findings prove the adapter did not prepare the suite text; zero prove it did not inject the surface table. Both directions asserted. This is the only acceptance criterion that covers the adapter boundary, and every other §6 case is satisfiable without it.
