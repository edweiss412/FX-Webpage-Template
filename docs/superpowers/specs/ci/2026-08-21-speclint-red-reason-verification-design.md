# `spec:lint` red-reason verification — the heavy-wrapped silent drop, and four refutations of the row

**Row:** `BL-SPECLINT-RED-REASON-VERIFICATION` · **Branch:** `feat/speclint-red-reason-verification` ·
**Surface:** `lib/specLint/redContract.ts` (enrolled as `redContract`)

The row asks for an arm that checks whether a `red=` failed **for the reason the task named**, not
merely that it exited non-zero. This spec is the measured answer, and the answer is smaller than the
row expected in one direction and sharper in another.

**What ships:** the repair of one silent drop, measured at **9 markers** — `spec:lint` is structurally
blind to `pnpm heavy`-wrapped v2 markers, which AGENTS.md mandates for every heavy phase.

**What does NOT ship, and why that is the deliverable rather than a gap:** the reason-classifying
observable itself. Four measurements refuted it, three of them against the row's own text. They are
recorded in §5 so the next author does not re-derive them.

---

## 0. Resolved scope — do not relitigate

Each bullet was settled by a measurement in this document and cites where.

- **The reason-classifying arm is RETIRED by ratified scope decision** (§2, §6). It could only ever
  be advisory, over a live population of two markers, at the cost of owning a summary-line grammar on
  the file that has already burned twenty diff rounds. Retiring it makes two round-2 findings
  unrepresentable rather than answered.
- **Prose matching `why=` against the observed failure was never in scope.** The row states the
  narrower claim itself.
- **`probes === null` is NOT a live defect** (§5.3). Unreachable from the shipped CLI, proven at
  `lib/specLint/run.ts:151`.
- **The row's premise about loader death is false** (§5.1), and its zero-case corollary is false in
  both directions (§5.2).
- **The §1.1 file count is a dated record, deliberately not re-pinned** (§1.1).

A finding that **§3's repair misses a heavy-wrapped marker inside the nine** is welcome. A proposal to
revive the retired observable needs a probe defeating §5.2's measurements.

---

## 1. Measured evidence

### 1.1 The red-marker population — the `PROBE DOMAIN`

Derived through the **shipped parser** (`parseDoc` + `parseMarker` + `deriveCollectionProbe`), not a
grep, over `git ls-files docs/superpowers/specs docs/superpowers/plans`, `.md` only.

**Read the file count as a DATED RECORD.** It moves when this arc's own documents are tracked — 1153
before this spec, 1154 after — so no criterion depends on the literal. Measured at `0a70816d3`:

| quantity                                      | value    |
| --------------------------------------------- | -------- |
| tracked `.md` files scanned                   | **1153** |
| `red=` markers                                | **479**  |
| `red-state=authored`                          | 160      |
| `red-state=live`                              | **2**    |
| v1 markers (no `red-state=` field)            | 317      |
| markers wrapped in `pnpm heavy`               | **25**   |
| …of those, **v2 reaching the `none` drop**    | **9**    |
| …of those, v1 exiting earlier at line 717     | 16       |

Reproduced by `pnpm tsx probe/population.mts`, which aborts on a short read.

**Nine is the repair's reach, and 25 is not.** Round 2 caught the overclaim: the 16 v1 markers exit at
`lib/specLint/redContract.ts:717` (`if (state === null) continue; // v1: no declared state to probe
against`) — **before** the `none` drop at line 721 — so §3 can neither repair nor signal them. The 9 was
derived mechanically after 25 and then 10 were reported by eye.

### 1.2 The failure-shape table

Every shape built as a real vitest fixture, run, and read. **Exit code is 1 in all of them**, which is
why exit code discriminates nothing.

| # | shape                                          | cases | rendered                                          |
| - | ---------------------------------------------- | ----- | ------------------------------------------------- |
| A | missing named **export**, read as a value      | 1 failed | `AssertionError: expected undefined to be N`   |
| B | missing/private **symbol**, called             | 1 failed | `TypeError: privateFn is not a function`       |
| C | missing **module**                             | none  | `Error: Cannot find module` + `Tests  no tests`   |
| D | genuine assertion failure (**control**)        | 1 failed | `AssertionError: expected 1 to be N`           |
| E | test file does not exist                       | none  | `No test files found` — **and no summary line**   |
| F | namespace-import form (**the ratified repair**)| 1 failed | `AssertionError: expected undefined to be N`   |
| G | syntax / transform error                       | none  | `Error: Transform failed … [PARSE_ERROR]`         |
| H | file with zero `it()` cases                    | none  | `Error: No test found in suite <path>`            |
| P | **module-scope `premise()` failure**           | none  | `(0 test)` + `Error: premise not met: …`          |

**Shape P is the one that killed the design.** It is an HONEST red — an assertion ran and failed —
that executes zero cases. §5.2 has the consequence.

---

## 2. What ships: the heavy-wrapped silent drop

`deriveCollectionProbe` returns `{ kind: "none" }` for any command that is not vitest-shaped
(`VITEST_SHAPE`, `lib/specLint/redContract.ts:580`), and `collectionProbePlan` then drops the entry
entirely:

```
if (derived.kind === "none") continue;
```

No FAIL, no advisory, no plan entry. `VITEST_SHAPE` cannot match a `pnpm heavy`-prefixed command, and
**AGENTS.md mandates `pnpm heavy` for every heavy phase** — so the arm is structurally blind to
exactly the class the repo requires wrapping. A silent hole with a rule pointing into it.

**The repair:** the dropped entry becomes a `RED_PROBE_UNVERIFIED` advisory naming the reason, which
is the same channel the `skipped` branch already uses one line below. **No new code is minted** —
`RED_PROBE_UNVERIFIED` already carries exactly that meaning: `collection capability unverified`.

**Reachability, stated because round 2 killed a sibling repair for lacking it.** This path is reached
only under `--exec-red`: `lib/specLint/run.ts:151` calls `synthesizeCollectionFindings` only when
probes are non-null, and the adapter builds them only when the flag is active. Any acceptance
criterion here therefore runs the CLI **with the flag**, or it passes while proving nothing.

**Severity: ADVISORY, and not as a compromise.** The arm cannot know whether an unprobeable command
would have collected anything; the honest report is that its capability is unverified. A hard code
here would assert something unmeasured — the direction §3 forbids.

---

## 3. Consequence bound, domain, fence

**Consequence bound.** The acceptance posture, stated as one sentence:

**Every `red=` the arm examines is correct or signaled, never silently wrong.**

On the LIVE tracked spec+plan corpus the arm draws **ZERO false hard findings** — trivially, because
this change adds **no hard code at all**. The two forbidden directions, named so neither is traded
for the other: **false certification** (a red accepted as observed when nothing was) and **wrong
attribution** (a finding against a red that is honest). A conservative over-report is permitted only
through the advisory channel.

**`PROBE DOMAIN:`** `git ls-files 'docs/superpowers/specs' 'docs/superpowers/plans'`, `.md` only —
whatever that command returns at the time — narrowed for this change to the **nine** heavy-wrapped v2
markers §1.1 enumerates, plus the two `fix/mutation-browser-child-lifetime` plan-round incidents. A
probe outside the domain, or more than one ordinary edit from an input in it, files to §6.

**Threat fence.** Ordinary authoring mistakes by a contributor writing a task's red. Adversarial
obfuscation is out of scope and files to §6.

**Score.** `redContract` is already enrolled. `pnpm mutation:guards` runs before the first
`--stage diff` dispatch, and its seven `equivalent` rows are re-derived against this arc's source
change rather than inherited.

---

## 4. Acceptance criteria

| AC   | claim                                                                              | proved by |
| ---- | ---------------------------------------------------------------------------------- | --------- |
| AC-1 | a `pnpm heavy`-wrapped v2 marker draws `RED_PROBE_UNVERIFIED` instead of silence    | fixture plan whose `red=` is heavy-wrapped, run through the CLI **under `--exec-red`**; asserts the code by name |
| AC-2 | a marker the arm CAN probe is unaffected                                            | the existing `exec-genuine-red.md` and `exec-collects-nothing.md` fixtures re-run unchanged, verdicts identical |
| AC-3 | the change adds **no hard code**                                                    | the emitted-code set over the fixture corpus is asserted to gain exactly one ADVISORY code and no `fail`-severity code |
| AC-4 | the nine live markers each draw the advisory, and the sixteen v1 markers do not     | the §1.1 probe extended to assert the partition, since line 717 exits before line 721 |
| AC-5 | the §1.1 table is reproducible **as a dated record**                                | `pnpm tsx probe/population.mts`, committed, aborting on a short read |

**AC-4 is the load-bearing one.** It is the only criterion that would fail under an implementation
that repaired the drop by moving the v1 exit as well — a wider change that looks like a more thorough
fix and would emit advisories on 16 markers the design does not claim.

---

## 5. Documented limits — four measured refutations

**5.1 The row's premise about loader death is FALSE.** The row and the incident's round-1 finding both
state that an unresolved import fails before any assertion runs. Under this repo's Vite SSR
transform a missing **named export** binds `undefined`, the case **runs**, and the failure is an
ordinary `AssertionError` (shape A). Only a missing **module** dies at the loader (shape C).

**5.2 Zero executed cases does NOT imply that no assertion ran — in both directions, and this is what
retired the arm.** The repo had already measured both, one spec over
(`docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md` §2.7 and §2.9, executable at
`tests/specLint/fixtureCli.test.ts:127`):

- A module-scope `premise()` throws during collection, so vitest reports **zero cases while an
  assertion ran and failed** (shape P). Hard-failing that is a false finding against an honest red,
  and §2.9 names a LIVE corpus instance at
  `docs/superpowers/plans/2026-08-04-guard-premise-reachability.md:1174`.
- Conversely a `beforeEach` throw yields **failed test entries whose bodies never executed**, so "at
  least one case ran" does not imply an assertion was observed either.

Measured here as well: shape P renders `(0 test)` with its premise error, and shape C renders
`Tests  no tests` with a module error. **No separation was established between them**, and none is
claimed — the two shapes were not shown to be mechanically distinguishable, which is precisely why
the observable does not ship.

**5.3 The row's SECOND blind spot is not a live defect.** It names
`synthesizeCollectionFindings`'s `probes === null` early return as a silent drop; that is true of the
function in isolation and false of the pipeline. `lib/specLint/run.ts:151` gates the call, the adapter
always builds a non-null `ProbeResults` under `--exec-red` even with zero probes, and the only
production `runLint` caller is `scripts/spec-lint.ts:761`. The neighbouring per-entry silence is
deliberate: `probesToSpawn` (`redContract.ts:906`) skips a LIVE entry whose red did not authorize a
probe, because such a red already carries its own `synthesizeExecFindings` finding.

**5.4 The reach was 25, then 10, then 9.** Only the last was derived. §1.1 carries the correction and
the line-717-before-line-721 argument that ends it.

**5.5 Non-vitest commands still draw no execution claim.** Unchanged by this spec, and closing it
needs a per-runner summary grammar — the ratchet this surface has already paid twenty diff rounds
for.

---

## 6. The retirement, as a ratified scope decision

The reason-classifying observable is retired, and the reasoning is recorded because a later reader
will otherwise re-propose it:

- **It cannot be hard.** §5.2's shape P is an honest red with zero executed cases.
- **Advisory-only, its live population is TWO markers** (§1.1), which is speculative design by the
  round-economy definition.
- **Keeping it means owning a grammar.** `VITEST_SHAPE` admits `--reporter=json`, under which the
  default summary line is absent entirely, so the arm would owe a specified branch for "no readable
  summary" — a parsing surface on the file with the worst round history in the repo.
- **Retiring it makes those questions UNREPRESENTABLE rather than answered**, which is the narrowing
  direction this repo's repair rule prescribes.

Re-proposing it needs a probe that defeats §5.2 on the sibling spec's own executable cases.

---

## 7. Self-application

This arm runs on this arc's own plan, and `pnpm spec:lint` is run against the plan before every
dispatch with the result reported. A plan whose reds fail the arm being built is the mechanism
working: the reds get fixed, the arm does not get weakened.

It already fired on this spec repeatedly, and every repair went to the spec: a malformed citation
committed twice — the second time inside the sentence describing the first — a missing "Resolved
scope" section, a line-number citation re-pointed to a symbol, and two `COPY_UNPAIRED_QUOTE` defects
from quoted phrases split across a line break.

Current standing is **produced by the command, not typed here**:

```
pnpm exec tsx scripts/spec-lint.ts --json docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md
```

Surviving findings are `NUMERIC_NOUN_MISMATCH` over nouns this document uses for genuinely different
quantities, plus artifacts of section references, where the arm reads the digits of `§5.2` as a
number against the following noun. They stand rather than being reworded: usefulness is not the
criterion, correct attribution is, and rewording out of a matcher is silencing rather than answering.

---

## 8. Review record — what each round could and could not check

**Round 1 — NEEDS-ATTENTION, 3 findings, all real, all accepted.** Head `712f9d5678`. An AC that never
exercised the arm; a repair proved unreachable (now §5.3); a file count already stale.

**Round 2 — BLOCKING, 4 findings, all real, all accepted.** Head `30ecf0ead2`. The blocking one
refuted the observable's central premise from the repo's own prior measurements (§5.2) and retired
the arm. The others: an unspecified `--reporter=json` branch, an AC-3 whose sentinel fixture is a
`printf` command rather than a vitest-shaped one so it never exercised the path it claimed, and the
reach overclaim (§5.4). Three of the four are the same class — **a criterion that does not exercise
the thing it names** — and retiring the observable removes the class rather than repairing three
instances.

**Both rounds were bounded by sandbox capability and said so** rather than reporting clean runs: the
tsx IPC socket was denied and Vitest could not create its temp directory, so both verdicts are static
plus read-only probing, not executable verification. Recorded because a verdict token does not carry
its own scope.
