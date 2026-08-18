# spec:lint — plan fixture satisfiability (a constructed fixture is executed, not asserted about)

**Date:** 2026-08-18 · **Backlog:** `BL-PLANLINT-CONSTRUCTED-FIXTURE-SATISFIABILITY` (in `BACKLOG.md`) · **Kind:** tooling (no UI, no DB, no runtime surface)

A plan embeds a test block, constructs a fixture inside it, names a live production function, and asserts what that function emits for that fixture. Nothing executes the block, so the assertion is a claim about the parser rather than an observation of it — and twice on one arc the claim was false in the same direction: the constructed input never reached the assertion at all. Plan round 4's constructed markdown document had a header shape the named parser does not open a block on; spec round 6's `FOO BAR` snippet was the same defect one stage earlier (`docs/review-rounds/feat/mutation-section-order/40a7adfa5f29.md`, plan § and spec §).

This contract makes such a block **declare** itself and then **runs** it against the live tree at plan-authoring time, with one discrimination that is the whole point: a block that fails because its constructed fixture could not reach the assertion is reported differently from a block that fails because the feature is not implemented yet. The second is the ordinary planned red. The first is this defect.

Extends `pnpm spec:lint` (`scripts/spec-lint.ts`, core under `lib/specLint/`; governing spec `docs/superpowers/specs/2026-07-19-spec-lint.md`; red-contract arm `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md`, hereafter "the arms spec"; verdict-capability arm `docs/superpowers/specs/2026-08-17-spec-lint-red-verdict-capability.md`, hereafter "the verdict spec", whose landed code this arm reuses seam-for-seam).

## 1. Scope

### 1.1 Explicitly resolved scope decisions (do not relitigate)

1. **The ledger row's sketched mechanism is deliberately NOT what ships, and the substitution is probe-backed.** The row proposed that a snippet declare its parser in a fenced-block info string (` ```md parser=parseVenue `) so the linter could feed the snippet to that parser. Measured against the originating defect, that shape does not fit it: the r4 fixture is not a standalone markdown block, it is a string constructed **inside a `ts` test block** that already imports the live parser and already calls it (`docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:119` constructs `v2md`, `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:121` calls `parseTransportation`, and `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:122` asserts on the result). The block is a complete, self-contained vitest file; it was never executed. Executing the block IS the satisfiability check, and it needs no parser-naming grammar because the block names its own parser in its own imports. The row itself assigns this call to the implementing arc ("the implementing arc owns that call"), so this is the row's own delegation exercised, not a silent scope change. The info-string grammar is additionally unavailable without a parser change: `parseDoc` keeps only the FIRST whitespace-delimited info-string token, lowercased (`lib/specLint/parse.ts:107`), and the corpus carries **zero** multi-token info strings (§2.1) — so that route costs a change to the shared fence parser and buys a grammar nothing uses.
2. **Declared, never inferred — no recognizer over block bodies ships, at any severity.** A block is enrolled by an adjacent `<!-- fixture: -->` marker and by nothing else. There is no heuristic for "this block looks like it constructs a fixture", no scan for string literals fed to imported functions, no inference from `describe`/`it` text. This is the same posture, for the same reason, as the declared task-marker grain (`docs/agents/spec-self-review.md:36`: "The grain is **declared**, never inferred from heading text"). The consequence is stated plainly rather than hidden: an unenrolled block is checked by nothing, and today that is every block in the corpus (§2.2). An opt-in contract that costs nothing until it is used, and is self-enforcing once it is, beats a recognizer over 627 blocks of authored prose-adjacent TypeScript.
3. **The premise sentinel is the discriminator, and it already exists.** `tests/_shared/premise.ts` throws `premise not met: <description>. <NOT_ABOUT_THE_CODE>` (`tests/_shared/premise.ts:29` and `tests/_shared/premise.ts:38`) and its own header states the contract this arm mechanizes: "a premise failure and an ordinary assertion failure call for opposite responses". Vitest's JSON reporter carries that message verbatim in `failureMessages` (§2.4). So a failing block is classified by whether its failure is a premise failure — no new helper, no new assertion vocabulary, no parsing of test bodies. A plan author makes a constructed fixture checkable by stating its premise executably, which `docs/agents/writing-plans.md` already requires of every guard.
4. **Blocks run under the REPO's vitest configuration, spliced into `tests/`, not under a synthesized config.** Both seams were measured (§2.3): a synthesized config is 0.56 s and writes nothing into `tests/`, but it inherits none of the repo's setup files, environment matchers, or project partition, so a block can pass under it and fail in the suite it is destined for. Fidelity is the entire purpose of executing, so the spliced file lands under a path the repo's own `BASE_INCLUDE` collects (`vitest.projects.ts:34`, `tests/**/*.test.ts`) and the run costs 0.94 s for a whole doc. The write-into-`tests/` hazard is answered by the lifecycle in §4.2 (unique per-invocation directory, refuse-if-present, removal in a `finally`), not by wishing it away.
5. **One vitest boot per DOC, not per block.** Measured: three spliced files, five tests, 0.94 s in a single run, with per-file results keyed by filename so the mapping back to marker lines is exact (§2.3). Per-block invocation would multiply a fixed ~0.9 s boot by the block count for no gain.
6. **Execution rides `--exec-red`; no new flag.** The arms spec §1.1 item 4 ratified "execution mode is opt-in per invocation" and the verdict spec §1.1 item 4 extended that flag to derived collection probes on the same reasoning. Fixture execution is execution with the same opt-in rationale. The flag's name is now narrower than its meaning; renaming it (to `--exec` with an alias) is a separate change and is **out of scope** — do not propose it as a finding here.
7. **This arm executes first-party TypeScript that a plan author wrote, and that is a deliberate, bounded posture.** `spec:lint` is a local pre-dispatch tool; the corpus is tracked, review-gated, first-party plan text; the author running `--exec-red` is the author of the block. This is the same trust boundary `--exec-red` already crosses by running `red=` commands through `sh -c` (arms spec §1.1 item 5) — a `red=` is arbitrary shell, which is strictly more than arbitrary in-repo TypeScript. Sandboxing, capability restriction, or static analysis of block bodies before execution are out of scope and file to documented limits (§8 item 6).
8. **Static arm checks the MARKER only; nothing about a block's content is decided statically.** Marker well-formedness, attachment to an opening fence, and a non-empty `why=` are checked on the default invocation. Whether the block imports vitest, declares tests, compiles, or resolves its imports is settled by EXECUTION or not at all. This is the repair-direction rule (AGENTS.md: narrowing under recurrence) applied at design time rather than after the round that would have forced it: a static "does this look like a vitest file" check is a body recognizer that grows one grammar corner per review round, and the executable arm already answers the same question with an observation instead of a guess.
9. **Decline-to-classify beats grammar growth.** Wherever the arm cannot observe an outcome — the runner did not complete, the JSON report is unreadable, an enrolled block's spliced file is absent from the results — it surfaces `FIXTURE_PROBE_UNVERIFIED` (advisory) naming the reason, and never reads a non-observation as either verdict. Repair direction under any same-axis review recurrence is NARROWING (a smaller accept-set plus a surfaced signal), never a wider recognizer.
10. **Threat model: accidental authoring mistakes by an ordinary contributor.** A block engineered to emit the premise sentinel from an ordinary assertion, a block with deliberate side effects, a block whose behavior depends on invocation order — all adversarial obfuscation, out of scope, filing to documented limits (§8). Every admissibility clause in review briefs cites this fence and the probe domain in item 11.
11. **Probe domain (finite, enumerable).** The live tracked plan corpus: `git ls-files 'docs/superpowers/plans'`, `.md` only — **659** files today (§2.1). A probe input is drawn from that corpus or is one ordinary edit away from an input in it. A constructed fixture outside that domain files to documented limits, not to a round.
12. **Consequence bound (convergence criterion).** Every ENROLLED block is either (a) passed clean, (b) named by exactly one specific finding, or (c) declined with a surfaced `FIXTURE_PROBE_UNVERIFIED`; never silently misjudged. The per-block outcome is decided by the ordered precedence in §4.3, so two codes can never contest one block. A conservative decline plus a surfaced advisory is a DOCUMENTED LIMIT, not a finding. Mechanical convergence for the changed module is the mutation score plus an empty unaccepted-survivor set (§7).
13. **The zero-false-fire calibration arc B carried does NOT exist here, and is not claimed.** The verdict spec could measure its arm against 70 live markers (its §2.4). This grammar is new, so the corpus contains **zero** enrolled blocks (§2.2) and a whole-corpus run of this arm is vacuously clean — that is not evidence and is not offered as any. Behavior is calibrated instead by (i) the historical defect re-enacted end to end against the live tree, both the defective and the repaired header shape (§2.4), and (ii) constructed fixture distillations per branch (§6). Do not read §2's numbers as a false-fire rate.
14. **No CI gate, no legacy relint** (governing spec §1.1 items 2, 10, unchanged). Point-in-time pre-dispatch tool. Legacy impact is exactly zero by construction: no existing block carries a marker, so no existing plan changes its lint result.

### 1.2 Out of scope

- Typechecking a block. Spliced blocks are transpiled, not typechecked — measured: a nonexistent named import resolves to `undefined` at runtime rather than failing (§2.4). The separate, already-mandated pre-dispatch typecheck pass (`docs/agents/writing-plans.md:25`) is neither replaced nor subsumed.
- Any inference about unenrolled blocks (§1.1 item 2).
- Executing snippets in non-vitest languages (`bash`, `sql`, `md`) — the fence's info string must be one of the accepted set (§3.1) and everything else draws `FIXTURE_UNATTACHED`.
- Running committed probe FILES — that is `BL-SPEC-PROBE-RUNNABILITY`, a sibling row with a different subject (files on disk, not snippets embedded in prose).
- Sandboxing or restricting what an enrolled block may do (§1.1 item 7).
- Renaming `--exec-red` (§1.1 item 6).
- Auto-fixing; CI wiring; relinting the legacy corpus.

## 2. Measured calibration (probes are the design inputs)

All numbers measured 2026-08-18 on this branch's worktree at base `7d09a1f0b` (arc B's merge commit), vitest 4.1.5. Probe transcripts are reproduced inline below rather than referenced, since each is short.

### 2.1 Corpus shape

`git ls-files 'docs/superpowers/plans'` `.md` files: **659**, of which **449** contain at least one fenced block; **5918** fenced blocks total across **19** distinct info strings. Info-string census (top): `ts` 2777, `bash` 1590, `tsx` 858, empty 268, `typescript` 136, `sql` 116, `js` 42, `markdown` 34, `yaml` 31, `json` 23, `text` 16, `sh` 7, `css` 7, `mdx` 6, `md` 3.

**Multi-token info strings: 0.** No corpus block carries an attribute-bearing info string today, which is what makes §1.1 item 1's route both a parser change and a grammar with no users.

### 2.2 Candidate population

Of the 3771 `ts` / `tsx` / `typescript` blocks in that corpus, **627** are self-contained vitest files (they import from `"vitest"`), and **17** of those 627 use the premise helper. Enrolled blocks under this spec's grammar today: **0** (the grammar is new — §1.1 item 13).

The 627 is the population this contract is *available* to, not a population it fires on. A crude structural scan suggested on the order of 38 of them construct a fixture inline; that number is indicative only and is deliberately not load-bearing anywhere in this design, because no shipped code infers anything from block bodies (§1.1 item 2).

### 2.3 Execution seam

| seam | outcome | wall |
| --- | --- | --- |
| spliced file OUTSIDE the include globs, passed explicitly by path | **collects 0 tests, exits 0** — silent | 1.75 s |
| spliced file under `tests/**` (repo config, full inheritance) | 3 tests collected, exit 1 | 0.99 s |
| synthesized config (`--config`, repo alias only) | 3 tests collected, exit 1 — **no setup/environment/project inheritance** | 0.56 s |
| CLI `--include` against the repo config, with and without `--project serial` | no report written, exit 1 — does not work with this repo's `projects` config | — |
| three spliced files in ONE run, per-file results keyed by filename | 5 tests, exit 1 | 0.94 s |

The first row is the trap that dictates §4.3's `FIXTURE_UNCOLLECTABLE` branch: a file the runner never collects exits **0**, so an unguarded arm would read "no failures" as "clean". It is the same shape the verdict spec closed for `red=` commands (its §2.3), reappearing one layer up.

### 2.4 Discrimination, re-enacted against the live tree

The historical defect, both shapes, run as spliced blocks (fixture text from `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:119`, parser `parseTransportation` from `lib/parser/blocks/transport.ts`):

```
- passed | three-column v2 header IS opened by the live matcher
- failed | TWO-column v2 header is NOT opened (the r4 defect shape)
     Error: premise not met: live v2 matcher opened a block on the constructed header. The
     assertion below this line proves nothing in this environment; ...
- failed | ordinary assertion failure, premise fine
     AssertionError: expected 1 to be 2 // Object.is equality
```

The repaired header (three columns, as merged) satisfies the premise; the r4 header (two columns) fails it with the sentinel; an ordinary wrong-value assertion fails without it. That is the discrimination this arm rests on, observed rather than argued.

**Non-observation shapes, all one signature.** An unresolvable import, a transform (syntax) error, and a file declaring no tests each report `status: "failed"` with an **empty `assertionResults` array** and a file-level `message`:

```
FILE d.test.ts status failed assertions 0 | msg: Cannot find package '@/lib/does/not/exist' imported from ...
FILE e.test.ts status failed assertions 0 | msg: Transform failed with 1 error: ...
FILE f.test.ts status failed assertions 0 | msg: No test suite found in file ...
```

**Transpile-only, confirmed:** importing a nonexistent NAMED export from a real module is not an error — it resolves to `undefined` and surfaces as an ordinary assertion failure. Hence §1.2's first bullet.

## 3. Static arm — the marker (default invocation)

### 3.1 Grammar

A fixture marker is a line matching, exactly:

```
<!-- fixture: expect=`green|red` why=`<one line>` -->
```

Backtick-delimited values, in the shape of the shipped gate marker (`lib/specLint/redContract.ts:37`). `expect=` admits exactly `green` and `red`; any other value fails the match and is therefore malformed, so no separate value-validation code exists.

A marker is **attached** when the immediately following line opens a fence whose info string is `ts`, `tsx`, or `typescript` (the measured accepted set — §2.1 shows those three carry every self-contained vitest block). The enrolled block is that fence's content.

Fixture markers are legal anywhere in a plan-kind doc and are owned by no task extent — the same posture as gate markers (arms spec §4.6), because a fixture block demonstrates a property of the live tree rather than participating in a task's red-then-green cycle. Marker-shaped lines inside a fence are inert, and marker-shaped lines in a spec-kind doc are prose (arms spec §8 items 12-13).

### 3.2 Static codes

All `check: "taskContract"`, anchored at the marker line, column 1, plan-kind docs only:

- **`FIXTURE_MALFORMED`** (fail) — a `<!-- fixture:`-shaped line that does not match the grammar exactly. Covers a bad `expect=` value, a missing field, and a mangled delimiter, deliberately as one code: the author's repair is the same in every case, which is to write the declared shape.
- **`FIXTURE_WHY_EMPTY`** (fail) — the `why=` capture is empty or whitespace. A block that runs and whose purpose is unstated is a verdict nobody can act on; same rationale as `RED_WHY_MISSING` (arms spec §4.2).
- **`FIXTURE_UNATTACHED`** (fail) — a well-formed marker whose next line does not open a `ts` / `tsx` / `typescript` fence. Detail names what the next line was.

Cost is zero spawns: all three are pure text checks on the parsed model.

## 4. Executable arm — splice and run (`--exec-red`)

### 4.1 Population

Every attached, well-formed fixture marker's block, in doc order, in a plan-kind doc, under `--exec-red` and only then (§1.1 item 6). Blocks whose marker drew a static finding are excluded: splicing a block whose declaration is malformed would run code whose expected outcome is unknown.

### 4.2 Splice lifecycle

The adapter, once per doc:

1. Chooses `tests/.spec-lint-fixtures-<pid>-<counter>/` under the repo root. If that directory already exists, the arm runs NO blocks and every enrolled block draws `FIXTURE_PROBE_UNVERIFIED` naming the collision — a stale directory is a loud non-observation, never a silent overwrite of somebody else's live splice.
2. Writes each enrolled block into that directory verbatim, one vitest test file per block, each filename carrying its marker line and the suffix the include glob requires. That is how per-file results map back (§2.3 measured that per-file keying is exact).
3. Runs ONE `vitest run <dir> --reporter=json --outputFile=<dir>/report.json` through the existing spawn seam (`deps.spawn`, repo-root cwd, the same `SPEC_LINT_EXEC_TIMEOUT_SECS` ceiling as red commands), reads the report, and hands the core a pure outcome map.
4. Removes the directory in a `finally`, so an exception, a timeout, or a signal cannot leave a file under `tests/`.

The directory is gitignored (§9) so a crash between steps 2 and 4 cannot dirty the tree, and step 1 makes any survivor loud on the next invocation rather than silently reused.

### 4.3 Classification, in precedence order

For each enrolled block, the core evaluates these in order and emits **exactly one** outcome (§1.1 item 12):

1. The block's file is absent from the report, or no report was produced (runner did not complete, timed out, was signalled, or wrote unreadable JSON) → **`FIXTURE_PROBE_UNVERIFIED`** (advisory), detail naming the reason.
2. The file is present with an **empty `assertionResults`** array → **`FIXTURE_UNCOLLECTABLE`** (fail), detail carrying the file-level `message` head. This is the unresolvable-import / syntax-error / no-test-suite family (§2.4) and the outside-the-globs trap (§2.3). It is HARD, not advisory, because the run completed and reported a deterministic, author-fixable property of the block — an observation, unlike the non-observations in branch 1.
3. Any failure message on the file carries the premise sentinel `premise not met:` → **`FIXTURE_UNSATISFIABLE`** (fail), detail naming each such premise description. **This branch outranks both `expect=` branches below**, in both directions: a block declared `red` whose redness comes from an unsatisfiable premise has observed nothing, which is precisely the defect this spec exists to catch, and a block declared `green` gets the more specific diagnosis rather than the generic one.
4. `expect=green` and the file reports any failure → **`FIXTURE_NOT_GREEN`** (fail), detail naming the first failing test title and message head.
5. `expect=red` and the file reports zero failures → **`FIXTURE_ALREADY_GREEN`** (fail), detail naming the block's test count. Mirrors `RED_ALREADY_GREEN` (`lib/specLint/redContract.ts:439`): a block asserted to demonstrate an absent behavior, which the live tree already has, demonstrates nothing.
6. Otherwise → clean. That is `expect=green` with zero failures, or `expect=red` with at least one ordinary (non-premise) assertion failure.

### 4.4 Finding shapes

| code | severity | fires when |
| --- | --- | --- |
| `FIXTURE_MALFORMED` | fail | §3.2, static |
| `FIXTURE_WHY_EMPTY` | fail | §3.2, static |
| `FIXTURE_UNATTACHED` | fail | §3.2, static |
| `FIXTURE_UNSATISFIABLE` | fail | §4.3 branch 3 — the constructed fixture cannot reach the assertion |
| `FIXTURE_UNCOLLECTABLE` | fail | §4.3 branch 2 — the block collected no tests |
| `FIXTURE_NOT_GREEN` | fail | §4.3 branch 4 |
| `FIXTURE_ALREADY_GREEN` | fail | §4.3 branch 5 |
| `FIXTURE_PROBE_UNVERIFIED` | advisory | §4.2 step 1 collision, §4.3 branch 1 |

## 5. Architecture & purity

```
scripts/spec-lint.ts           # adapter: splice dir lifecycle, one vitest run, JSON read, outcome injection
lib/specLint/fixtureContract.ts # NEW, pure: marker grammar, attachment, splice plan, classification
lib/specLint/run.ts            # carries the new outcome map core-ward, same pattern as ExecResults/ProbeResults
lib/specLint/types.ts          # FixtureOutcome / FixtureResults (no runner or fs type crosses the boundary)
```

- **Purity holds** (`tests/specLint/_metaPureCore.test.ts` covers the tree by default): every new core function is a pure map from `(model, outcome map)` to plans or findings. The adapter alone writes files, spawns, and reads JSON. Outcome injection mirrors `ExecResults` and `ProbeResults` exactly.
- **No new fence parsing.** Enrolment reads `model.lines` and `model.fencedInfo` from the existing `parseDoc` (`lib/specLint/parse.ts`). `parse.ts` is NOT modified — §1.1 item 1's rejected route was the only thing that needed it, and a second fence recognizer would be two chances to disagree about what a block IS.
- **New module, not an extension of `redContract.ts`.** The subjects are disjoint (that module owns `red=` field semantics; this one owns embedded blocks), and `redContract.ts` is already 934 lines carrying three arms.
- **Finding plumbing:** all findings report `check: "taskContract"`; `CHECK_ORDER` (`lib/specLint/run.ts:30`) unchanged.

## 6. Testing

All under `tests/specLint/`, TDD per task, anti-tautology rules of `docs/agents/writing-plans.md` in force (fixtures plant specific defects; assertions name the exact code and a line derived from fixture construction; premises via `tests/_shared/premise.ts` where an assertion rests on a fixture property).

- **Marker grammar suite (pure):** the exact shape parses; each malformation draws `FIXTURE_MALFORMED` (bad `expect=` value, missing `why=`, missing delimiter, trailing text); empty and whitespace `why=` draw `FIXTURE_WHY_EMPTY`; attachment holds for `ts` / `tsx` / `typescript` and fails for `bash` / `md` / a blank line / prose / EOF, each drawing `FIXTURE_UNATTACHED`; a marker inside a fence is inert; a marker in a spec-kind doc draws nothing.
- **Splice-plan suite (pure):** plan entries carry line, block text verbatim (byte-identical, including blank lines and trailing whitespace), and declared `expect`; statically-flagged markers are excluded from the plan (asserted directly, the same exclusion shape as `planExecutions`); doc order preserved.
- **Classification suite (pure, fake outcome maps):** every §4.3 branch in order, plus the three precedence contests stated as their own cases — premise sentinel beats `expect=green`, premise sentinel beats `expect=red`, empty `assertionResults` beats everything below it; a block absent from the report draws the advisory and never a hard code; a null map (static invocation) draws zero §4 findings.
- **CLI adapter suite** (extends `tests/specLint/cli.test.ts`; real subprocesses, trivial blocks only — no heavy phases): a fixture plan whose enrolled block fails a premise → exit 1 with `FIXTURE_UNSATISFIABLE`; the same plan with the repaired fixture → exit 0; an `expect=red` block that passes → `FIXTURE_ALREADY_GREEN`; an unresolvable-import block → `FIXTURE_UNCOLLECTABLE`; a pre-existing splice directory → `FIXTURE_PROBE_UNVERIFIED` and **no vitest spawn at all** (asserted with a spy recording zero calls — a fence proved before any observation, per the #831 lesson); the splice directory is absent after every run including the failing ones (asserted by existence check in a `finally`-covering case).
- **Historical re-enactment (the calibration case, executable):** the §2.4 pair shipped as two fixture plans — the r4 two-column header drawing `FIXTURE_UNSATISFIABLE`, the merged three-column header clean — so the defect this spec exists to catch is pinned by the defect itself rather than by a synthetic analogue.
- **Corpus regression:** the tracked plan corpus relints byte-identical (zero enrolled blocks today, §2.2), asserted rather than assumed.
- **Dogfood:** this spec and its plan exit 0 hard under `pnpm spec:lint`, attached to every review dispatch (`docs/agents/spec-self-review.md:25`).

## 7. Mutation enrolment (before the first review dispatch)

<!-- spec-lint: ignore — the module this spec creates is untracked until the implementing PR lands; the path is a forward declaration, not a citation of existing code -->
`lib/specLint/fixtureContract.ts` is a guard surface whose defect class is exactly "reports OK while the output moved", so enrolment precedes review (AGENTS.md convergence-criterion bullet 4). It ships as an importable module with referring suites from the start — never a terminal CLI script — and gets a `tests/mutation/source/registry.ts` row (`id: "fixtureContract"`, `sourcePath`, `suitePaths` naming the suites in §6 whose assertions decide it, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, a `control` mutant, `accepted: []`), following the `redContract` row (`tests/mutation/source/registry.ts:525`) verbatim in shape.

`pnpm mutation:guards` runs BEFORE the round-1 diff dispatch, and that brief states the score plus an empty unaccepted-survivor set. Deciding assertions live inside the surface's registered `suitePaths` — test placement outside them buys zero score (the #831 lesson).

## 8. Documented limits (round 0)

1. **An unenrolled block is checked by nothing** (§1.1 item 2), and today that is all 627 self-contained blocks. The contract is opt-in by construction; adoption is an authoring decision, not a lint outcome.
2. **A block is transpiled, not typechecked** (§2.4): a nonexistent named import resolves to `undefined` rather than erroring. The separate pre-dispatch typecheck pass still applies (§1.2).
3. **A premise-free constructed fixture is invisible to this arm.** The discrimination rests on the author having stated the premise executably; a block that constructs an unsatisfiable fixture and asserts on it without a premise fails as an ordinary assertion and reads as a legitimate `expect=red`. This arm mechanizes the CHECK, not the authoring discipline that `docs/agents/writing-plans.md` already mandates.
4. **Ambient environment is trusted.** A block runs with whatever env vars, gated vitest projects, and local DB state the invoking shell carries — the same ambient-trust posture as `--exec-red` itself (arms spec §1.1 item 5). A block that passes locally may not pass in CI.
5. **Cost is the block's.** A block that boots a heavy phase makes the lint a heavy phase; the flag is opt-in precisely so the cost is chosen. The heavy-phase discipline (AGENTS.md) stays the caller's, exactly as ratified for `--exec-red`.
6. **No sandboxing** (§1.1 item 7). An enrolled block may do anything the invoking user can do. Adversarially constructed blocks — including one that emits the premise sentinel string from an ordinary assertion, which would be misreported as `FIXTURE_UNSATISFIABLE` — are out of the threat fence (§1.1 item 10).
7. **Concurrent invocations in one worktree.** Two `--exec-red` runs against the same worktree get distinct splice directories (pid + counter), but a full-suite run started concurrently in that worktree can observe a live splice directory during its ~1 s window. Bounded and accepted; the `finally` removal and the gitignore entry keep the window short and the tree clean.
8. **Only vitest.** A block in another runner's dialect is not executed; the accepted info strings are the measured three (§3.1). A new runner is an accept-set change with its own corpus numbers, not a review round.

## 9. Wiring & docs (same PR)

- `package.json`: no new script (everything rides `spec:lint` and its existing flag).
- `.gitignore`: one entry for `tests/.spec-lint-fixtures-*/`, added with `printf '\n%s\n'` and verified with `git check-ignore -v` (the `echo >>` discipline in `docs/agents/writing-plans.md:31`).
- `docs/agents/writing-plans.md`: one sentence on the fixture marker, under the anti-tautology rule's premise bullet where the authoring discipline it mechanizes already lives.
- `BACKLOG.md`: the row archived per house convention (marker off in the PR's last commit, invariant 12).
- `docs/superpowers/specs/README.md`: one row for this spec.
- codex-guard `--lint-doc`: no change needed — it inherits the §3 static checks automatically, since those run on the default invocation.

## 10. Acceptance criteria

- AC-1: the marker grammar parses the exact declared shape; every malformation draws `FIXTURE_MALFORMED`; an empty `why=` draws `FIXTURE_WHY_EMPTY`; a marker not followed by a `ts` / `tsx` / `typescript` fence opener draws `FIXTURE_UNATTACHED`; markers inside fences and in spec-kind docs draw nothing.
- AC-2: no shipped code inspects an unenrolled block's content, at any severity (asserted structurally, not by sampling).
- AC-3: under `--exec-red`, the §4.3 precedence holds branch by branch, including all three contests: premise sentinel over `expect=green`, premise sentinel over `expect=red`, empty `assertionResults` over both.
- AC-4: the §2.4 historical pair reproduces — the r4 two-column header draws `FIXTURE_UNSATISFIABLE`, the merged three-column header is clean.
- AC-5: a pre-existing splice directory spawns nothing (spy asserts zero calls) and draws `FIXTURE_PROBE_UNVERIFIED`; the splice directory is absent after every run, including runs whose vitest invocation fails or times out.
- AC-6: statically-flagged markers are excluded from the splice plan; a static invocation draws zero §4 findings; the tracked plan corpus relints byte-identical.
- AC-7: purity meta-test passes; `parse.ts` is unmodified; `fixtureContract` scores ≥ 0.95 with an empty unaccepted-survivor set, stated in the round-1 brief.
- AC-8: this spec and the implementation plan lint clean (`0 hard`) through the shipped `spec:lint` at dispatch time.
