# spec:lint — plan fixture satisfiability (a constructed fixture is executed, not asserted about)

**Date:** 2026-08-18 · **Backlog:** `BL-PLANLINT-CONSTRUCTED-FIXTURE-SATISFIABILITY` (in `BACKLOG.md`) · **Kind:** tooling (no UI, no DB, no runtime surface)

A plan embeds a test block, constructs a fixture inside it, names a live production function, and asserts what that function emits for that fixture. Nothing executes the block, so the assertion is a claim about the parser rather than an observation of it — and twice on one arc the claim was false in the same direction: the constructed input never reached the assertion at all. Plan round 4's constructed markdown document had a header shape the named parser does not open a block on; spec round 6's `FOO BAR` snippet was the same defect one stage earlier (`docs/review-rounds/feat/mutation-section-order/40a7adfa5f29.md`, plan § and spec §).

This contract makes such a block **declare** itself and then **runs** it against the live tree at plan-authoring time. It answers exactly one question — did a stated premise fail? — and says so honestly when it cannot answer.

Extends `pnpm spec:lint` (`scripts/spec-lint.ts`, core under `lib/specLint/`; governing spec `docs/superpowers/specs/2026-07-19-spec-lint.md`; red-contract arm `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md`, hereafter "the arms spec"; verdict-capability arm `docs/superpowers/specs/2026-08-17-spec-lint-red-verdict-capability.md`, hereafter "the verdict spec", whose landed code this arm reuses seam-for-seam).

## 1. Scope

### 1.1 Explicitly resolved scope decisions (do not relitigate)

1. **One question, one hard verdict — and this is a NARROWING taken at the round cap, not an omission.** The arm reports `FIXTURE_UNSATISFIABLE` when a block's failure carries the premise sentinel, reports `FIXTURE_PROBE_UNVERIFIED` when the report shows the block produced no test case at all, and says NOTHING otherwise. It makes no claim about whether a block "passed", is "already green", is clean, or matches an author-declared outcome. Four consecutive spec review rounds landed on one axis — the verdict semantics of an earlier `expect=green|red` field — and each repair was a bigger target for the next: skipped assertions read as observed (§2.5), a file failing while every assertion passed (§2.6), a belt-and-braces conjunct that made the clean predicate unsatisfiable, and per-test hook failures that land on the assertion looking exactly like ordinary ones (§2.7). All four were defects in a general-purpose "did this block do what its author claimed" verifier, which is a far larger surface than the ledger row asks for. The row asks that an embedded snippet be executed through the parser the plan names and the actual emission pinned. The sentinel answers that; `expect=` answered a different, unbounded question. This is the AGENTS.md repair-direction rule — prefer deleting or deriving the mechanism over widening it, the `2d9d0ba11`-style kill — applied at and past the cap. A fifth round then measured that a passing test proves nothing either (§2.8: an empty test body passes), which retired the last remnant of the verifier.

**The claim set is now closed, and it is exactly three statements.** The arm says `FIXTURE_UNSATISFIABLE` when it observes a premise failure; it says `FIXTURE_PROBE_UNVERIFIED` when the report shows NO TEST CASE for the block at all — an absent or unreadable report, a splice collision, or an empty `assertionResults` array; and it says NOTHING otherwise. "No test case at all" is the precise and only meaning of the advisory: a block whose report carries test cases has run in the only sense this arm can observe, even where an individual body was skipped or a hook prevented one from executing (§8 items 6 and 7). Silence is not a certificate — it means no stated premise failed, which includes the case where no premise was stated. **Re-proposing `expect=`, a pass/fail verdict, a clean-observation certificate, or a per-shape hard code for hook failures, skipped tests, or no-op bodies is out of scope.** Each was tried and each was measured unsound, in rounds 1, 2, 4 and 5 respectively.
2. **The ledger row's sketched mechanism is deliberately NOT what ships, and the substitution is probe-backed.** The row proposed that a snippet declare its parser in a fenced-block info string. Measured against the originating defect, that shape does not fit it: the r4 fixture is a string constructed **inside a `ts` test block** that already imports the live parser and already calls it (`docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:119` constructs `v2md`, `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:121` calls `parseTransportation`, and `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:122` asserts on the result). The block is a complete, self-contained vitest file; it was never executed. Executing it IS the satisfiability check, and it needs no parser-naming grammar because the block names its own parser in its own imports. The row assigns this call to the implementing arc. The info-string route is additionally unavailable without a parser change: `parseDoc` keeps only the FIRST whitespace-delimited info-string token, lowercased (`lib/specLint/parse.ts:107`), and the corpus carries **zero** multi-token info strings (§2.1).
3. **Declared, never inferred — no recognizer over block bodies ships, at any severity.** A block is enrolled by an adjacent `<!-- fixture: -->` marker and by nothing else. No heuristic for "this looks like a constructed fixture", no scan for string literals fed to imported functions, no inference from `describe`/`it` text. Same posture, same reason, as the declared task-marker grain (`docs/agents/spec-self-review.md:36`). The consequence is stated rather than hidden: an unenrolled block is checked by nothing, and today that is every block in the corpus (§2.2).
4. **The premise sentinel is the discriminator, and it already exists.** `tests/_shared/premise.ts` throws `premise not met: <description>. <NOT_ABOUT_THE_CODE>` (`tests/_shared/premise.ts:29` and `tests/_shared/premise.ts:38`), and its own header states the contract this arm mechanizes: "a premise failure and an ordinary assertion failure call for opposite responses". Vitest's JSON reporter carries that message verbatim in `failureMessages` (§2.4). No new helper, no new assertion vocabulary, no parsing of test bodies.
5. **Blocks run under the REPO's vitest configuration, spliced into `tests/`, not under a synthesized config.** Both seams were measured (§2.3): a synthesized config is faster and writes nothing into `tests/`, but inherits none of the repo's setup files, environment matchers, or project partition, so a block can pass under it and fail in the suite it is destined for. Fidelity is the purpose of executing, so the spliced file lands where the repo's own `BASE_INCLUDE` collects it (`vitest.projects.ts:34`). The write hazard is answered by the lifecycle in §4.2.
6. **One vitest boot per DOC, not per block** (§2.3, measured: three files, five tests, 0.94 s, per-file results keyed by filename).
7. **Execution rides `--exec-red`; no new flag.** The arms spec §1.1 item 4 ratified "execution mode is opt-in per invocation" and the verdict spec §1.1 item 4 extended that flag to derived collection probes on the same reasoning. Renaming it is a separate change and is out of scope.
8. **This arm executes first-party TypeScript that a plan author wrote, unsandboxed, deliberately.** `spec:lint` is a local pre-dispatch tool; the corpus is tracked, review-gated, first-party plan text; the author running `--exec-red` is the author of the block. `--exec-red` already runs arbitrary shell through `sh -c` (arms spec §1.1 item 5), which is strictly more. Sandboxing is out of scope and files to documented limits (§8).
9. **Static arm checks the MARKER only.** Marker well-formedness, attachment to an opening fence, and a non-empty `why=` are checked on the default invocation. Whether the block imports vitest, declares tests, compiles, or resolves its imports is settled by EXECUTION or not at all: a static "does this look like a vitest file" check is a body recognizer that grows one grammar corner per round, and execution answers the same question with an observation.
10. **Decline-to-classify beats grammar growth, and declining now mostly means SAYING NOTHING.** The arm never invents a per-shape hard code for a shape it cannot classify; that is what rounds 1 through 4 kept relitigating (item 1). Since round 5 the decline is silence for everything except one case: `FIXTURE_PROBE_UNVERIFIED` is reserved for a block whose report carries no test case at all and no sentinel. A non-sentinel failure, a skipped assertion, a failed file, and a no-op body all draw NOTHING — they are limits (§8), not declines to be reported.
11. **Threat model: accidental authoring mistakes by an ordinary contributor.** A block engineered to emit the premise sentinel from an ordinary assertion, a block with deliberate side effects, a block whose behavior depends on invocation order — adversarial obfuscation, out of scope, filing to documented limits (§8).
12. **Probe domain (finite, enumerable).** The live tracked plan corpus: `git ls-files 'docs/superpowers/plans'`, `.md` only — **659** files (§2.1). An admissible probe input is drawn from that corpus or is one ordinary edit away from an input in it.
13. **Consequence bound (convergence criterion).** Every ENROLLED block draws exactly one outcome from §4.3's closed claim set, and every claim the arm makes is true: an observed premise failure is reported, a block whose report carries no test case at all is surfaced, and no block is ever certified. Handled correctly OR signaled, never silently wrong — where "wrong" means an assertion the arm makes that the report does not support, since the arm asserting nothing about a block cannot be wrong about it. A surfaced advisory, or silence where the arm has no claim, is a DOCUMENTED LIMIT (§8), not a finding. Mechanical convergence for the changed module is the mutation score plus an empty unaccepted-survivor set (§7).
14. **No whole-corpus false-fire rate is claimed, because none can exist yet.** The grammar is new, so the corpus contains **zero** enrolled blocks (§2.2) and a whole-corpus run is vacuously clean. Behavior is calibrated instead by the historical defect re-enacted end to end against the live tree (§2.4) and by per-branch fixtures (§6).
15. **No CI gate, no legacy relint** (governing spec §1.1 items 2, 10). Point-in-time pre-dispatch tool. Legacy impact is exactly zero: no existing block carries a marker.

### 1.2 Out of scope

- Any author-declared expected outcome, and any verdict about whether a block passed (§1.1 item 1).
- Typechecking a block. Spliced blocks are transpiled, not typechecked (§2.4). The separate, already-mandated pre-dispatch typecheck pass (`docs/agents/writing-plans.md:25`) is neither replaced nor subsumed.
- Any inference about unenrolled blocks (§1.1 item 3).
- Snippets in non-vitest languages — the fence's info string must be one of the accepted set (§3.1).
- Running committed probe FILES — that is `BL-SPEC-PROBE-RUNNABILITY`, a sibling row whose subject is files on disk.
- Sandboxing (§1.1 item 8); renaming `--exec-red` (item 7); auto-fixing; CI wiring; relinting the legacy corpus.

## 2. Measured calibration (probes are the design inputs)

All numbers measured 2026-08-18 on this branch's worktree at base `7d09a1f0b` (arc B's merge, PR #847), vitest 4.1.5.

### 2.1 Corpus shape

`git ls-files 'docs/superpowers/plans'` `.md` files: **659**, of which **449** contain at least one fenced block; **5918** fenced blocks across **19** distinct info strings. Census (top): `ts` 2777, `bash` 1590, `tsx` 858, empty 268, `typescript` 136, `sql` 116, `js` 42, `markdown` 34, `yaml` 31, `json` 23, `text` 16, `sh` 7, `css` 7, `mdx` 6, `md` 3.

**Multi-token info strings: 0**, which is what makes §1.1 item 2's route both a parser change and a grammar with no users.

### 2.2 Candidate population

Of the 3771 `ts` / `tsx` / `typescript` blocks, **627** are self-contained vitest files (they import from `"vitest"`), and **17** of those use the premise helper. Enrolled blocks under this grammar today: **0**.

The 627 is the population this contract is available to, not one it fires on. No shipped code infers anything from block bodies (§1.1 item 3), so no structural estimate of how many construct fixtures inline is load-bearing anywhere in this design.

### 2.3 Execution seam

| seam | outcome | wall |
| --- | --- | --- |
| spliced file OUTSIDE the include globs, passed explicitly by path | **collects 0 tests, exits 0** — silent | 1.75 s |
| spliced file under `tests/**` (repo config, full inheritance) | 3 tests collected, exit 1 | 0.99 s |
| synthesized config (`--config`, repo alias only) | 3 tests collected, exit 1 — **no setup/environment/project inheritance** | 0.56 s |
| CLI `--include` against the repo config, with and without `--project serial` | no report written, exit 1 — does not work with this repo's `projects` config | — |
| three spliced files in ONE run, per-file results keyed by filename | 5 tests, exit 1 | 0.94 s |

The first row is why an empty collection can never read as clean: a file the runner never collects exits **0**. It is the same shape the verdict spec closed for `red=` commands (its §2.3), one layer up. It is equally not proof of the opposite — §2.9 measures an empty collection that DID run — so emptiness alone settles nothing in either direction.

### 2.4 The discrimination, re-enacted against the live tree

The historical defect, both shapes, run as spliced blocks (fixture text from `docs/superpowers/plans/2026-08-15-field-near-miss-detector.md:119`, parser `parseTransportation` from `lib/parser/blocks/transport.ts`):

```
- passed | three-column v2 header IS opened by the live matcher
- failed | TWO-column v2 header is NOT opened (the r4 defect shape)
     Error: premise not met: live v2 matcher opened a block on the constructed header. The
     assertion below this line proves nothing in this environment; ...
- failed | ordinary assertion failure, premise fine
     AssertionError: expected 1 to be 2 // Object.is equality
```

The merged three-column header satisfies the premise; the r4 header fails it with the sentinel; an ordinary wrong-value assertion fails without it.

**Three non-observation shapes, one signature — which §2.9 later shows is NOT sufficient on its own.** An unresolvable import, a transform (syntax) error, and a file declaring no tests each report `status: "failed"` with an **empty `assertionResults`** array and a file-level `message`:

```
FILE (unresolvable import) status failed assertions 0 | msg: Cannot find package '@/lib/does/not/exist' ...
FILE (syntax error)        status failed assertions 0 | msg: Transform failed with 1 error: ...
FILE (no tests declared)   status failed assertions 0 | msg: No test suite found in file ...
```

**Transpile-only, confirmed:** importing a nonexistent NAMED export from a real module is not an error — it resolves to `undefined` and surfaces as an ordinary assertion failure. Hence §1.2's typecheck bullet.

**The signature is shared, so it does not decide anything by itself.** §2.9 measures a FOURTH shape with the same fingerprint — empty `assertionResults`, `failed` file status, a file-level message — that is a genuine observation rather than a non-observation: a premise that failed during collection. The three shapes above and that one are told apart by the message CONTENT, not by the empty array, which is why §4.3 reads the sentinel first and over both channels. Any reasoning that treats an empty entry list as proof of non-execution is stale by exactly this measurement.

### 2.5 A reported assertion is not an executed one

A skipped test occupies an `assertionResults` entry with `status: "skipped"` while its body never runs:

```
vitest EXIT=0
numTotal 4 passed 1 failed 0 pending 3
FILE (all-skipped block)    | file status: passed | assertionResults: 2
    status=skipped | would assert something real     <- body is expect(1).toBe(2)
    status=skipped | and another                     <- body is expect(true).toBe(false)
FILE (partly-skipped block) | file status: passed | assertionResults: 2
    status=passed  | runs and passes
    status=skipped | never runs
```

Both bodies in the all-skipped block would FAIL if executed; the run reports zero failures, a `passed` file status, and **exit 0**. So "entries present, no failures" is not evidence that anything was observed.

`.only` produces the same shape — the non-focused sibling reports `status: "skipped"` while the run exits 0 — so the ladder keys on the STATUS, never on the spelling that produced it, and no enumeration of skip syntaxes ships.

### 2.6 A file can fail while every assertion passes

A throwing `afterAll` fails the FILE without failing any test:

```
vitest EXIT=1
numTotal 1 passed 1 failed 0
FILE status: failed | assertions: 1 | file message: ""
    status=passed | failures: 0 | the assertion itself passes
```

Note the file-level `message` is **empty** for this shape, though it carries text for the §2.4 collection failures. The corpus makes this ordinary: **27** `ts`/`tsx`/`typescript` vitest blocks across the 659-file plan corpus contain `afterAll`.

### 2.7 A per-test hook failure is indistinguishable from an assertion failure

`beforeEach` and `afterEach` failures are recorded on the TEST result, so the reporter emits a failed assertion with an ordinary-looking message:

```
vitest EXIT=1   total 2 passed 0 failed 2
FILE (afterEach throws)  | file: failed
    status=failed | failures: [ 'Error: AFTER_EACH_EXPLODED' ]
FILE (beforeEach throws) | file: failed
    status=failed | failures: [ 'Error: BEFORE_EACH_EXPLODED' ]
```

In the `beforeEach` case the body never executed at all, and nothing in the report distinguishes that from a genuine assertion failure. This measurement is why §4.3 declines on any non-sentinel failure instead of interpreting it: the channel does not carry what an interpretation would need, and four review rounds were spent discovering that one shape at a time.

### 2.8 A passing test is not an observation

`assertionResults` entries are TEST CASES, not evaluated assertions. A test whose body is empty or comment-only passes:

```
EXIT=0   total 2 passed 2 failed 0
FILE | file: passed
    status=passed | asserts nothing at all
    status=passed | comment only
```

So "at least one entry passed" is not evidence that any parser was called, any fixture was constructed, or any premise was evaluated. An AST census of the plan corpus found two live self-contained blocks whose test callbacks are entirely empty or comment-only (`docs/superpowers/plans/admin/2026-07-15-extend-role-scope-vocab/tasks-01-04.md:227`, two tests; `docs/superpowers/plans/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention.md:60`, seven), so enrolling one is an ordinary edit away.

This measurement retired the last version of the clean reading and produced the claim set in §4.3. Nothing the JSON report carries can establish that a premise was evaluated — `premiseHolds` throws on failure and is silent on success — so the arm stops claiming it.

### 2.9 A premise can fail before any test is registered

`premise` / `premiseHolds` at MODULE scope run during collection, so a failure throws before the file registers a test. Vitest then reports the file with zero test cases and puts the thrown message at FILE level:

```
EXIT=1   total 0 passed 0 failed 0
FILE | file status: failed | assertionResults: 0
  file message head: "premise not met: the producer yielded cases. Got 0, which does not exceed 0. ..."
  sentinel in file message? true
```

This is the non-vacuity pattern the premise rules themselves prescribe — assert the producer yielded cases BEFORE registering cases over it — and the corpus carries a live instance at `docs/superpowers/plans/2026-08-04-guard-premise-reachability.md:1174`. It has two consequences the ladder must honor, and both are load-bearing:

- **The sentinel is searched in BOTH channels**, assertion `failureMessages` and the file-level `message`. A module-scope failure appears only in the second.
- **The sentinel is tested BEFORE the no-test-case branch.** An empty `assertionResults` array is the signature of a block that never ran (§2.3, §2.4) AND of one that ran far enough to fail a premise. Testing emptiness first would report the block as having produced no test case and suppress the true verdict on exactly the input this arm exists to catch.

## 3. Static arm — the marker (default invocation)

### 3.1 Grammar

A fixture marker is a line matching, exactly:

```
<!-- fixture: why=`<one line>` -->
```

Backtick-delimited value, in the shape of the shipped gate marker (`lib/specLint/redContract.ts:37`). A marker is **attached** when the immediately following line opens a fence whose info string is `ts`, `tsx`, or `typescript` — the measured accepted set (§2.1 shows those three carry every self-contained vitest block).

Fixture markers are legal anywhere in a plan-kind doc and are owned by no task extent, the same posture as gate markers (arms spec §4.6): a fixture block demonstrates a property of the live tree rather than participating in a task's red-then-green cycle. Marker-shaped lines inside a fence are inert; in a spec-kind doc they are prose (arms spec §8 items 12-13).

### 3.2 Static codes

All `check: "taskContract"`, anchored at the marker line, column 1, plan-kind docs only:

- **`FIXTURE_MALFORMED`** (fail) — a `<!-- fixture:`-shaped line that does not match the grammar exactly. One code for a missing field, a mangled delimiter, or trailing text: the author's repair is the same in every case.
- **`FIXTURE_WHY_EMPTY`** (fail) — the `why=` capture is empty or whitespace. Same rationale as `RED_WHY_MISSING` (arms spec §4.2).
- **`FIXTURE_UNATTACHED`** (fail) — a well-formed marker whose next line does not open a `ts` / `tsx` / `typescript` fence. Detail names what the next line was.

Cost is zero spawns: all three are pure text checks on the parsed model.

## 4. Executable arm — splice and run (`--exec-red`)

### 4.1 Population

Every attached, well-formed fixture marker's block, in doc order, in a plan-kind doc, under `--exec-red` and only then. Blocks whose marker drew a static finding are excluded: splicing a block whose declaration is malformed runs code for no verdict.

### 4.2 Splice lifecycle

The adapter, once per doc:

1. Chooses `tests/.spec-lint-fixtures-<pid>-<counter>/` under the repo root. If that directory already exists, the arm runs NO blocks and every enrolled block draws `FIXTURE_PROBE_UNVERIFIED` naming the collision — a stale directory is a loud non-observation, never a silent overwrite of another session's live splice.
2. Writes each enrolled block into that directory verbatim, one vitest test file per block, each filename carrying its marker line and the suffix the include glob requires. That is how per-file results map back (§2.3 measured per-file keying as exact).
3. Runs ONE `vitest run <dir> --reporter=json --outputFile=<dir>/report.json` through the existing spawn seam (`deps.spawn`, repo-root cwd, the same `SPEC_LINT_EXEC_TIMEOUT_SECS` ceiling as red commands), reads the report, and hands the core a pure outcome map.
4. Removes the directory in a `finally`, so an exception, a timeout, or a signal cannot leave a file under `tests/`.

The directory is gitignored (§9) so a crash between steps 2 and 4 cannot dirty the tree, and step 1 makes any survivor loud on the next invocation rather than silently reused.

### 4.3 Classification, in precedence order

Three branches, drawing from a closed claim set (§1.1 item 1). For each enrolled block, the core evaluates these in order and emits **exactly one** outcome:

1. **A premise failed.** Any failure text the report carries for the file — an assertion's `failureMessages` OR the file-level `message` — contains the sentinel `premise not met:` → **`FIXTURE_UNSATISFIABLE`** (fail), detail naming each premise description found. This is the arm's only hard verdict and the defect it exists to catch: a stated premise about the constructed fixture did not hold against the live tree. It is tested FIRST, and over BOTH channels, because a module-scope premise fails during collection and surfaces with zero test cases and a file-level message (§2.9); any other order reports that block as never having run.
2. **The report carries no test case for the block.** No sentinel anywhere, AND: its file is absent from the report; or no report was produced (the runner did not complete, timed out, was signalled, or wrote unreadable JSON); or the splice directory collided (§4.2 step 1); or the file is present with an EMPTY `assertionResults` array → **`FIXTURE_PROBE_UNVERIFIED`** (advisory), detail naming which of those it was. The empty-array case is the measured collection family — unresolvable import, transform error, no test suite, and the outside-the-globs trap (§2.3, §2.4) — read as the report's own statement that no test case existed, never as an interpretation of one.
3. **Otherwise → no finding.** The report carries at least one test case and no premise failure appears in either channel. Note what this does NOT say: it does not say the bodies ran. An all-skipped block reaches this branch with nothing executed (§2.5), and so does one whose `beforeEach` threw (§2.7). The arm asserts nothing further about any of them — that is limit §8 item 4, and it is why the branch is worded as an observation about the report rather than about the block.

**Why there is no clean-observation branch.** Four versions of one existed and each was measured unsound: absence of failures does not mean anything executed (§2.3, §2.5), a non-failed file does not mean the file succeeded (§2.6), a failed assertion does not mean an assertion failed (§2.7), and a passing test does not mean anything was asserted (§2.8). Nothing the JSON report carries establishes that a premise was EVALUATED, because `premiseHolds` throws on failure and is silent on success. An arm that certified blocks on any of those proxies would be making a claim its evidence does not support, which is the corruption this contract exists to prevent — so it makes no such claim. Silence from this arm means "no premise failure observed", never "this block is good".

**Fenced in both directions.** The arm does NOT decline on a zero-test report, and that is deliberate: declining there would be quieter but would silently drop the genuine module-scope premise failures of §2.9, including the live corpus instance, trading a real capability for a smaller diff. Equally, the sentinel branch does not attempt to establish that a premise was evaluated when it does NOT fire — that is limit §8 item 4, and re-adding a certificate on any proxy is out of scope (§1.1 item 1).

### 4.4 Finding shapes

| code | severity | fires when |
| --- | --- | --- |
| `FIXTURE_MALFORMED` | fail | §3.2, static |
| `FIXTURE_WHY_EMPTY` | fail | §3.2, static |
| `FIXTURE_UNATTACHED` | fail | §3.2, static |
| `FIXTURE_UNSATISFIABLE` | fail | §4.3 — assertion or file-level failure text carries the premise sentinel |
| `FIXTURE_PROBE_UNVERIFIED` | advisory | §4.3 — the report carries no test case for the block, with which case named |

Five codes: three static, one verdict, one advisory. No code certifies a block (§4.3). **Positions are named in §4.3 and nowhere else:** the ladder's order is one fact, and a second copy of it in a table, an AC, or a test title goes stale the next time a branch moves — which it did, twice, in consecutive review rounds. Every reference outside §4.3 names the CODE or the CONDITION. The check is mechanical: `rg -n 'branch [0-9]|condition [0-9]'` over this spec and its plan must return only lines inside §4.3, and the plan runs it as a closeout sweep (plan §3.3).

## 5. Architecture & purity

```
scripts/spec-lint.ts            # adapter: splice dir lifecycle, one vitest run, JSON read, outcome injection
lib/specLint/fixtureContract.ts # NEW, pure: marker grammar, attachment, splice plan, classification
lib/specLint/run.ts             # carries the new outcome map core-ward, same pattern as ExecResults/ProbeResults
lib/specLint/types.ts           # FixtureOutcome / FixtureResults (no runner or fs type crosses the boundary)
```

- **Purity holds** (`tests/specLint/_metaPureCore.test.ts` walks the core tree recursively, so a new file is covered by default): every new core function is a pure map from `(model, outcome map)` to plans or findings. The adapter alone writes files, spawns, and reads JSON. Outcome injection mirrors `ExecResults` and `ProbeResults`.
- **No new fence parsing.** Enrolment reads `model.lines` and `model.fencedInfo` from the existing `parseDoc`. `parse.ts` is NOT modified — §1.1 item 2's rejected route was the only thing that needed it, and a second fence recognizer would be two chances to disagree about what a block IS.
- **New module, not an extension of `redContract.ts`.** The subjects are disjoint, and that module is already 934 lines carrying three arms.
- **Finding plumbing:** all findings report `check: "taskContract"`; `CHECK_ORDER` (`lib/specLint/run.ts:30`) unchanged.

## 6. Testing

All under `tests/specLint/`, TDD per task, anti-tautology rules of `docs/agents/writing-plans.md` in force.

- **Marker grammar suite (pure):** the exact shape parses; each malformation draws `FIXTURE_MALFORMED` (missing `why=`, mangled delimiter, trailing text); empty and whitespace `why=` draw `FIXTURE_WHY_EMPTY`; attachment holds for `ts` / `tsx` / `typescript` and fails for `bash` / `md` / a blank line / prose / EOF; a marker inside a fence is inert; a marker in a spec-kind doc draws nothing.
- **Splice-plan suite (pure):** one entry per attached well-formed marker, block text byte-identical (blank lines and trailing whitespace preserved), doc order, statically-flagged markers excluded (asserted directly, the same exclusion shape as `planExecutions`).
- **Classification suite (pure, fake outcome maps):** the fake outcome carries the reporter's FILE status, each assertion's own status, and the failure messages, so an implementation that reads any of them as a certificate can be caught. Every §4.3 branch in order, plus the shapes that must draw NO finding and the shapes that must draw the advisory: the sentinel fires whether it arrives alone, beside an ordinary failure, or beside a skipped sibling; an absent file, an unreadable report, a directory collision and an EMPTY entry list each draw the advisory naming their own case; and the §2.5 all-skipped, §2.6 `afterAll`, §2.7 `beforeEach` and §2.8 no-op shapes each draw NOTHING, asserted explicitly, because the arm makes no claim about them — a test asserting `toEqual([])` for each of those four, with its own comment citing the measurement, is what stops a future round from reintroducing a certificate. The §2.9 module-scope shape — empty entry list, sentinel in the FILE-level message — draws `FIXTURE_UNSATISFIABLE` and never the advisory, which is the case that pins both the channel and the ordering. A null map (static invocation) draws zero §4 findings.
<!-- spec-lint: ignore — a file the implementing plan creates; the path is a forward declaration, not a citation of existing code -->
- **CLI adapter suite** (a NEW `tests/specLint/fixtureCli.test.ts`, not an extension of the tracked `tests/specLint/cli.test.ts`, whose subject is the pre-existing CLI surface; real subprocesses, trivial blocks only — no heavy phases): a fixture plan whose enrolled block fails a premise → exit 1 with `FIXTURE_UNSATISFIABLE`; the same plan with the repaired fixture → exit 0; an unresolvable-import block → the advisory; a block whose `describe` is skipped → exit 0 with NO `FIXTURE_` code (the report carries test cases, so the advisory must not fire — matching the pure suite, AC-4, and §8 item 6), observed through the REAL reporter since §2.5's shape exits 0 and only a real run proves the adapter surfaces per-assertion statuses; a pre-existing splice directory → the advisory with **no vitest spawn at all** (asserted with a spy recording zero calls — a fence proved before any observation); the splice directory absent after every case including the failing ones.
- **Historical re-enactment (the calibration case, executable):** the §2.4 pair shipped as two fixture plans — the r4 two-column header drawing `FIXTURE_UNSATISFIABLE`, the merged three-column header clean — so the defect this spec exists to catch is pinned by the defect itself rather than by a synthetic analogue.
- **Corpus regression:** the tracked plan corpus relints byte-identical (zero enrolled blocks, §2.2), asserted rather than assumed.
- **Dogfood:** this spec and its plan exit 0 hard under `pnpm spec:lint`, attached to every review dispatch (`docs/agents/spec-self-review.md:25`).

## 7. Mutation enrolment (before the first review dispatch)

<!-- spec-lint: ignore — the module this spec creates is untracked until the implementing PR lands; the path is a forward declaration, not a citation of existing code -->

`lib/specLint/fixtureContract.ts` is a guard surface whose defect class is exactly "reports OK while the output moved", so enrolment precedes review (AGENTS.md convergence-criterion bullet 4). It ships as an importable module with referring suites from the start — never a terminal CLI script — and gets a `tests/mutation/source/registry.ts` row (`id: "fixtureContract"`, `sourcePath`, `suitePaths` naming the §6 suites whose assertions decide it, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, a `control` mutant, `accepted: []`), following the `redContract` row (`tests/mutation/source/registry.ts:525`) verbatim in shape.

`pnpm mutation:guards` runs BEFORE the round-1 diff dispatch, and that brief states the score plus an empty unaccepted-survivor set. Deciding assertions live inside the surface's registered `suitePaths` — placement outside them buys zero score (the #831 lesson).

## 8. Documented limits (round 0)

1. **An unenrolled block is checked by nothing** (§1.1 item 3), and today that is all 627 self-contained blocks. Adoption is an authoring decision, not a lint outcome.
2. **A block is transpiled, not typechecked** (§2.4). The separate pre-dispatch typecheck pass still applies.
3. **A premise-free constructed fixture is invisible to this arm.** The discrimination rests on the author having stated the premise executably; a block that constructs an unsatisfiable fixture and asserts on it without a premise draws the decline, not the verdict. This arm mechanizes the CHECK, not the authoring discipline `docs/agents/writing-plans.md` already mandates.
4. **Silence is not a certificate, and this is the single most important limit to read.** The arm reports an observed premise failure, and reports a block whose report carries no test case at all. It says nothing about a block that ran without a premise failure — including one with no premise at all, one whose premise sat in a skipped test, one whose `beforeEach` exploded before the premise ran, and one whose test body is empty. Four review rounds each tried to make silence mean more (§2.5, §2.6, §2.7, §2.8) and each proxy was measured unsound. An author who wants a fixture checked states its premise executably; that is the authoring discipline `docs/agents/writing-plans.md` already mandates, and this arm mechanizes only the failure signal.
5. **A premise that fails before any test registers IS detected** (§2.9), because the sentinel is searched at file level too and is tested before the did-not-run branch. The arm deliberately does not take the quieter option of declining on zero-test reports; the live corpus instance at `docs/superpowers/plans/2026-08-04-guard-premise-reachability.md:1174` is what that option would drop.
6. **A masked premise is not detected.** A premise inside a skipped test, or one behind a hook that threw first, never runs and never emits the sentinel, so the arm is silent (limit 4). Whether such a block ran is often a property of the machine — an environment-gated `describe.skip` is the ordinary case — which is exactly why the arm does not try to rule on it.
7. **Hook failures are not diagnosed** (§2.6, §2.7). A throwing `afterAll` and a throwing `beforeEach` draw nothing; the report does not carry what telling either apart from an ordinary assertion failure would need, and guessing is the class rounds 1 through 5 closed.
8. **Ambient environment is trusted.** A block runs with whatever env vars, gated projects, and local DB state the invoking shell carries — the same posture as `--exec-red` itself (arms spec §1.1 item 5).
9. **Cost is the block's.** A block that boots a heavy phase makes the lint a heavy phase; the flag is opt-in precisely so the cost is chosen.
10. **No sandboxing** (§1.1 item 8). An adversarially constructed block — including one emitting the sentinel string from an ordinary assertion — is outside the threat fence (§1.1 item 11).
11. **Concurrent invocations in one worktree.** Two `--exec-red` runs get distinct splice directories (pid plus counter), but a full-suite run started concurrently in that worktree can observe a live splice directory during its roughly one-second window. Bounded and accepted.
12. **Only vitest.** A block in another runner's dialect is not executed; the accepted info strings are the measured three (§3.1). A new runner is an accept-set change with its own corpus numbers, not a review round.

## 9. Wiring & docs (same PR)

- `package.json`: no new script (everything rides `spec:lint` and its existing flag).
- `.gitignore`: one entry for `tests/.spec-lint-fixtures-*/`, added with `printf` and verified with `git check-ignore -v` (the append discipline in `docs/agents/writing-plans.md:31`).
- `docs/agents/writing-plans.md`: one sentence on the fixture marker, under the anti-tautology rule's premise bullet where the authoring discipline it mechanizes already lives.
- `BACKLOG.md`: the row archived per house convention (marker off in the PR's last commit, invariant 12).
- `docs/superpowers/specs/README.md`: one row for this spec.
- codex-guard `--lint-doc`: no change needed — it inherits the §3 static checks automatically, since those run on the default invocation.

## 10. Acceptance criteria

- AC-1: the marker grammar parses the exact declared shape; every malformation draws `FIXTURE_MALFORMED`; an empty `why=` draws `FIXTURE_WHY_EMPTY`; a marker not followed by a `ts` / `tsx` / `typescript` fence opener draws `FIXTURE_UNATTACHED`; markers inside fences and in spec-kind docs draw nothing.
- AC-2: no shipped code inspects an unenrolled block's content, at any severity (asserted structurally, not by sampling).
- AC-3: under `--exec-red`, §4.3 assigns exactly one outcome to every combination of (report present or absent, entries none or some, per-assertion statuses, failure text sentinel or non-sentinel in either channel, file status), and no input produces a certificate: the only hard code requires the sentinel, and the only advisory requires both the absence of a sentinel and the block not having run.
- AC-4: the §2.4 historical pair reproduces — the r4 two-column header draws `FIXTURE_UNSATISFIABLE`, the merged three-column header draws nothing. The §2.9 module-scope shape draws `FIXTURE_UNSATISFIABLE` and NOT the advisory, asserted with the sentinel in the file-level message and an empty entry list. The §2.5, §2.6, §2.7 and §2.8 shapes each draw NO finding; the §2.3 and §2.4 collection shapes draw the advisory.
- AC-5: a pre-existing splice directory spawns nothing (spy asserts zero calls) and draws the advisory; the splice directory is absent after every run, including runs whose vitest invocation fails or times out.
- AC-6: statically-flagged markers are excluded from the splice plan; a static invocation draws zero §4 findings; the tracked plan corpus relints byte-identical.
- AC-7: purity meta-test passes; `parse.ts` is unmodified; `fixtureContract` scores at or above 0.95 with an empty unaccepted-survivor set; no ordinal appears outside §4.3 in either document, proved by the sweep in plan §3.3.
- AC-8: this spec and the implementation plan lint clean (`0 hard`) through the shipped `spec:lint` at dispatch time.
