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
6. **The grain is the plan's Files declaration, not the whole document.** Measured at the §2 baseline: whole-document matching draws on 63 plans against the Files grain's 25, the difference naming an enrolled path only in prose (§2.5). A plan citing `tests/mutation/_metaPremiseContract.test.ts` because its tests must satisfy the premise contract is not editing that file, and advising it about pins there is exactly the false advisory the consequence bound forbids.
7. **No new `Check` union member and no `CHECK_ORDER` change.** Findings report `check: "taskContract"`, following the fixture arm (`docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md` §5).
8. **Threat fence.** The arm defends against ordinary authoring mistakes by a contributor writing a plan. Adversarial obfuscation — a title constructed to evade the phrase match, a Files block written to hide a path — is out of scope and files to §8, not to a review round.

### 1.2 Out of scope

- Spec-kind documents. A spec does not carry a Files list; the collision is a plan-time fact.
- Any judgement about whether a pin SHOULD be retired. That is the author's call, and the advisory says so.
- Surfaces outside `tests/mutation/source/registry.ts`. Enrolment is the enrolment; there is no second registry.
- Pins in files that are not a registered `suitePath`. Placement outside `suitePaths` buys zero mutation score (the #831 lesson) and buys zero coverage here for the same reason: the registry is the statement of which suites decide a surface.

## 2. Measured calibration (probes are the design inputs)

Every number below was produced by a probe run against the live tree at `4e074d3bc`, not estimated. Probe scripts are reproduced in the plan and re-run at implementation time.

### 2.1 Corpus shape

| Population | Count |
| --- | --- |
| Enrolled guard surfaces (`GUARD_SURFACES`) | 38 |
| Distinct enrolled paths (`sourcePath` ∪ `suitePaths`) | 100 |
| Distinct `suitePaths` | 62 |
| Tracked plan `.md` files (`git ls-files 'docs/superpowers/plans'`) | 665 |
| `**Files:**` headers across them | 2559 |
| …whose header line itself carries a path | 636 |
| …followed by an unordered list | 2136 |
| …followed by an ordered list | 25 |
| Plans naming an enrolled path in a Files declaration | 25 |

### 2.2 The phrase population, and why the title narrowing is load-bearing

Grepping the three phrases anywhere in the 62 suite files returns **30 lines**. Restricting to a single-line `test(` / `it(` / `describe(` title returns **12**. The 18 excluded lines are comments, and they include the two shapes that would be outright wrong to report:

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
| Enrolled path in a Files declaration (§3.2) | 25 |

The 38-plan difference is prose citation: plans naming `_metaPremiseContract.test.ts`, `_metaReviewRoundEconomy.test.ts` or `numerics.ts` as context, contracts to satisfy, or prior art. None of them edits the surface. The Files block is the plan's own declaration of what it touches, so it is the grain — declared, never inferred, the same principle the task-marker contract rests on (`docs/agents/spec-self-review.md`).

**Two shapes carry the declaration, and only two.** 636 of the 2559 headers put the paths on the header line itself (`**Files:** create \`a\`, \`b\`; modify \`c\``); 2136 are followed by an unordered list. Both are read. An ORDERED list after the header — 25 headers — is DECLINED: sampling those runs shows the numbered items are as often TASK STEPS as files (`1. **RED first …**`, `1. Merge \`origin/main\` …`, `1. Move the full body to \`BACKLOG-archive.md\``), and admitting them would re-import exactly the prose citations this grain exists to exclude. The arm cannot classify an ordered run, so it declines and files the limit (§8 item 11) rather than guessing.

The Files declaration's INTERNAL grammar is deliberately not modeled. A probe over the corpus's bullet verbs returns `Modify` 2011, `Test` 960, `Create` 761, `Commit` 22, `AC` 22, `Delete` 21 and a long tail of one-off labels (`Modify or delete`, `Create or finalize`, `Regenerate`, `deliver row`, `Route precedence pin`, …). An accept-set over verbs is a denylist wearing an accept-set's clothes. The arm reads only whether an enrolled path — a member of a closed 100-element set — appears on a line inside the block.

### 2.6 The corpus rate, which is what the ledger asked to measure

Running the shipped rules (§3) over the plan corpus enumerated by `git ls-files 'docs/superpowers/plans' | grep '\.md$'` (§2.1 owns that count):

**5 plans draw an advisory; 7 advisories total**, at the §2 baseline.

```
docs/superpowers/plans/2026-07-19-spec-lint.md                    2  (numerics.test.ts)
docs/superpowers/plans/2026-08-04-review-round-economy.md         2  (_metaReviewRoundEconomy.test.ts)
docs/superpowers/plans/2026-08-09-m-wave-2/plan.md                1  (interactionTimingScan.test.ts)
docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md 1  (psqlStartupFileSuppression.test.ts)
docs/superpowers/plans/2026-08-17-speclint-prose-consistency-arms.md 1 (universals.test.ts)
```

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

### 3.1 Pin discovery (pure, over one suite file's lines)

A **pin** is a line that satisfies ALL of:

1. It opens a call to `test` or `it` — matched at the start of the line modulo leading whitespace. `describe` is excluded (§2.3). A `.each` form is excluded (§8 item 3).
2. Its first argument is a string literal delimited by a double or single quote, opening and closing on that same line, with standard backslash escapes. A template literal is excluded (§8 item 4).
3. The literal's content matches one of exactly three phrases, case-insensitively: `known miss`, `documented limit`, `declared miss`. This accept-set is the ledger entry's, verbatim.
4. The (path, title) pair is not present in the disposition registry (§5).

The pin's identity is `(path, title)`. Its reported location is the matching line, resolved at lint time.

### 3.2 Surfaces a plan names (pure, over the parsed plan model)

A **Files declaration** opens on a non-fenced line matching `**Files:**` or `**Files**` (optionally as a list item). It spans that line's own remainder, plus — when the next non-blank line opens an UNORDERED list item — the following run of unordered list items and their indented continuations, ending at the first blank line or the first line that is neither. When the next non-blank line opens an ORDERED list, the declaration is the header remainder alone and the ordered run is declined (§2.5, §8 item 11).

Inside that span, a line **names** an enrolled path when the path occurs as a DELIMITED token: the characters immediately before and after the occurrence are not path characters (`[A-Za-z0-9._/-]`). A bare substring test is unsound — a sibling path formed by appending .bak to a live entry contains that entry as a substring while naming a different file, and that is one ordinary authoring edit from a live corpus entry. The candidate set is the closed set of every enrolled `sourcePath` and `suitePath`. A path naming several surfaces (`tests/docs/_metaReviewRoundEconomy.test.ts` is a `suitePath` of three) names all of them; pins are deduplicated by (path, title) afterwards, so the reader sees each pin once.

### 3.3 The obligation, and the finding

For every pin on every named surface, in doc order of first naming then pin order within a suite: if the plan's text — the whole document, fenced blocks included — does not contain the pin's title as a verbatim substring, emit

```
DECLARED_LIMIT_PIN_UNNAMED  advisory
  <suitePath>:<line> pins a declared limit that this plan does not name: "<title>"
  detail: surface <id>; name it in the plan (retire it, or say it is left alone), or waive this advisory.
```

anchored at the Files-block line that named the surface.

### 3.4 A suite the resolver cannot read is REPORTED, never skipped

`FileResolver.readFileLines` returns `null` for a tracked-but-unreadable path or a tracked symlink (`lib/specLint/types.ts:42`). A `suitePath` that is untracked, unreadable, or absent yields no pins — and "no pins" and "could not look" must not be the same observation. That shape is the fail-open defect the guard-premise work measured repeatedly: a read that could not happen and a read that found nothing return the same value, and the check then passes by not seeing anything (`docs/agents/writing-plans.md`, "State every guard’s premise executably"; `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md`). So the arm emits

```
DECLARED_LIMIT_PIN_SUITE_UNREADABLE  advisory
  surface <id> names a deciding suite this lint could not read: <suitePath>
```

and reports zero pins for that suite, saying so rather than implying there are none.

## 4. Architecture & purity

```
scripts/spec-lint.ts                # adapter: imports GUARD_SURFACES, projects it to the injected table
lib/specLint/declaredLimitPins.ts   # NEW, pure: pin grammar, Files-block extent, obligation, findings
lib/specLint/run.ts                 # threads the injected table core-ward, plan-kind only
lib/specLint/types.ts               # EnrolledSurface (id, sourcePath, suitePaths) — no registry type crosses
```

- **The registry is injected as data, never imported by `lib/`.** The adapter reads `GUARD_SURFACES` and passes `readonly { id, sourcePath, suitePaths }[]`. `scripts/` importing `tests/mutation/source/**` is established (`scripts/print-mutation-sites.ts:24`). The core receives a plain array, so the mutation harness scores the LOGIC while the registry stays the registry.
- **Suite TEXT comes through the existing `FileResolver`**, which the core already takes. No new I/O boundary, and `readFileLines`'s `null` contract is honored explicitly (§3.4).
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

- **Pin grammar (pure).** Each phrase matches in a `test(` and an `it(` title, in double-quoted and single-quoted literals, case-insensitively, with an escaped quote inside the literal. Each excluded shape draws NOTHING and is asserted explicitly, with its §8 item cited in the test body: a `describe(` title; a `.each` form; a template literal; a title whose literal opens on one line and closes on another; a phrase in a comment; a phrase in the SECOND argument. A dispositioned (path, title) draws nothing; the same title at a DIFFERENT path still draws (the disposition is keyed on the pair, not the string).
- **Files-block extent (pure).** The block ends at the first blank line and at the first non-list line; a second `**Files:**` block in the same document is read too; a `**Files:**` line inside a fence is inert; an enrolled path in prose outside any block draws nothing (the §2.5 measurement, made executable); an enrolled path inside a block on a bullet with an unmodeled verb still draws (the §2.5 verb argument, made executable).
- **Obligation (pure).** Title present verbatim → nothing; absent → one advisory; present inside a fenced block → nothing (the plan named it); one pin reachable through two surfaces → ONE advisory, not two; a pin whose title is a substring of a longer title → the longer title's presence does not satisfy the shorter pin unless it literally contains it, asserted with a constructed pair.
- **Unreadable suite (§3.4).** A resolver returning `null` for a `suitePath` draws `DECLARED_LIMIT_PIN_SUITE_UNREADABLE` and no pin findings for that suite — asserted with a fake resolver, because the failure mode is that this case is indistinguishable from "no pins".
- **Historical re-enactment (§2.7), executable.** The pre-repair suite blob and both plan blobs are committed as fixtures; the pre-Step-3b plan draws exactly one advisory naming the pin, and the merged plan draws zero. This is the entry's acceptance criterion pinned by the incident itself rather than by a synthetic analogue.
- **Corpus regression.** The tracked plan corpus, ENUMERATED at run time rather than counted in the test, relints to exactly the §2.6 SET of `(plan, suitePath, title)` triples. A test asserting a COUNT would pass on a different set and would go stale the moment a plan is added — including this arc's own plan, which grew the corpus between drafting and review. The §2.6 cardinality is a dated measurement; the assertion is the set.
- **Injection.** A null table draws zero findings of either code; a table naming a surface with no pins draws nothing.
- **Dogfood.** This spec and its plan exit 0 hard under `pnpm spec:lint`, attached to every review dispatch (`docs/agents/spec-self-review.md`).

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
9. **A Files declaration written in an unmodeled shape is not read.** A plan that lists files in a table, a fenced block, or prose under a differently-worded heading draws nothing. Measured: of 2559 `**Files:**` headers, 636 carry the paths inline and 2136 open an unordered run — the two modeled shapes — while 25 open an ordered run (declined, item 11) and 398 are followed by neither (§2.1). Silence from this arm is not a certificate.
10. **Adversarial evasion is out of scope** (§1.1 item 8).
11. **An ordered list after a Files header is declined** (§2.5). 25 headers of 2559 are followed by one, and sampling shows those runs are as often task steps as file lists, so the arm reads the header remainder alone and reports nothing about the run. The failure direction is a missed advisory, never a false one — the conservative side, and the side the consequence bound requires.
12. **A path that is a proper prefix of another path is distinguished by delimitation, not by tracking.** The arm does not ask git whether a named path exists; a .bak sibling of a live entry fails the delimiter test and names nothing, and an untracked path that IS delimited names its surface if it string-matches an enrolled entry. Checking trackedness would make the arm's verdict depend on index state a plan author cannot see.

## 9. Wiring & docs (same PR)

- `package.json`: no new script — the arm rides `spec:lint` and its default invocation.
- `docs/agents/writing-plans.md`: one sentence on the advisory, under the reconciliation/closeout-sweeps bullet where the authoring discipline it mechanizes already lives.
- `BACKLOG.md`: `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` archived per house convention, marker off, as ONE ledger commit before whole-diff review (invariant 12 as ruled 2026-08-18).
- `docs/superpowers/specs/README.md`: one row for this spec.
- codex-guard `--lint-doc`: no change — it inherits the arm automatically, since the arm runs on the default invocation.

## 10. Acceptance criteria

- **AC-1** — Pin grammar: each of the three phrases in a single-line `test(`/`it(` title in a double-quoted or single-quoted literal is a pin, case-insensitively; each excluded shape of §8 items 3, 4 and 5, plus a `describe(` title, a phrase in a comment, and a phrase in a non-first argument, draws NOTHING, asserted per shape. Proved by the pin-grammar suite.
- **AC-2** — Files-block grain: an enrolled path inside a modeled Files block names its surface; the same path in prose outside every block names nothing; a `**Files:**` line inside a fence is inert. Proved by the extent suite, and by the corpus assertion of AC-6 which contains the 48 prose-only plans.
- **AC-3** — Obligation: a named pin draws nothing, an unnamed one draws exactly one `DECLARED_LIMIT_PIN_UNNAMED` at advisory severity, and a pin reachable through two surfaces draws one finding, not two. No input at any severity other than advisory is produced by this arm, asserted structurally over the emitted findings rather than by sampling.
- **AC-4** — The §2.7 replay reproduces from committed blobs: the pre-repair suite yields exactly the pin `a QUOTED backslash path in shell text is a KNOWN miss`; the pre-Step-3b plan draws exactly one advisory naming it; the merged plan draws zero. This is the ledger entry's own acceptance test.
- **AC-5** — Fail-open closed: a `suitePath` the resolver cannot read draws `DECLARED_LIMIT_PIN_SUITE_UNREADABLE` and suppresses no other finding; "no pins" and "could not look" are distinguishable in the output, asserted with a fake resolver returning `null`.
- **AC-6** — Corpus: the tracked plan corpus, enumerated at run time, draws exactly the §2.6 SET, each advisory identified by (plan, suitePath, title) — asserted as a set, never as a count, and never against a cardinality typed into the test.
- **AC-7** — Dispositions: every row resolves to a live title, every row carries a non-empty reason, and the pin census is derived by running the shipped scanner rather than by a literal in the test. A constructed disposition suppresses its own pin and no other.
- **AC-8** — Enrolment: `declaredLimitPins` carries both declarations (registry row AND `EXPECTED_LEDGER_KINDS`), scores at or above 0.95 with an empty unaccepted-survivor set, and the purity meta-test passes with `parse.ts` unmodified.
- **AC-9** — This spec and the implementation plan lint clean (`0 hard`) through the shipped `spec:lint` at dispatch time.
