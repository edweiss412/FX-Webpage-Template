# `spec:lint` red-reason verification — a red that executed no case is not a red

**Row:** `BL-SPECLINT-RED-REASON-VERIFICATION` · **Branch:** `feat/speclint-red-reason-verification` ·
**Surface:** `lib/specLint/redContract.ts` (enrolled as `redContract`)

The `--exec-red` arm accepts **any** non-zero exit as redness observed. The line is explicit about
it: `continue; // any other non-zero exit is red observed` (`lib/specLint/redContract.ts:460`). A
command that runs, executes nothing, and exits 1 is therefore recorded as an observed red, and the
task ships a RED that no later edit can make fail.

This spec ships **one closed observable** for that, plus the repair of two silent drops that make
the arm blind on 25 measured markers. It does **not** attempt to match an observed failure against
the `why=` prose: that is the unbounded form, and §6 records what it costs to try.

---

## 0. Resolved scope — do not relitigate

Each of these was settled by a measurement recorded in this document, and each cites where.

- **Prose matching is out of scope.** Comparing an observed failure against the `why=` text is the
  unbounded form. The row states the narrower claim itself, and this spec ships only that.
- **Verdict-line classification is dead as a discriminator**, and it is not an oversight. §6.2 shows
  the incident and the repo's own ratified repair render byte-identically, so any classifier keying
  on the failure text convicts ratified behaviour.
- **The static import-form recognizer is DECLINED**, with a stated re-file trigger (§6.3). Its live
  population is provably ~0 and it is a new recognizer on the surface that has already paid 20 diff
  rounds for one.
- **The exec-side observable's two-marker population is known and priced** (§4), not overlooked.
- **The row's premise is refuted by measurement** (§6.1). That refutation is a recorded falsification
  to stop re-derivation, not a defect awaiting repair.

A finding that the §2 observable **misses a shape inside the `PROBE DOMAIN`** is welcome. A
restatement of any bullet above is not.

---

## 1. Measured evidence

Everything below was produced by the command printed beside it, in this session, at `e5d1d723d`.

### 1.1 The red-marker population — this is the `PROBE DOMAIN`

Derived through the **shipped parser** (`parseDoc` + `parseMarker` + `deriveCollectionProbe`), not a
grep, over `git ls-files docs/superpowers/specs docs/superpowers/plans`, `.md` only:

| quantity                                       | value    |
| ---------------------------------------------- | -------- |
| tracked `.md` files scanned                    | **1153** |
| `red=` markers                                 | **479**  |
| `red-state=authored`                           | 160      |
| `red-state=live`                               | **2**    |
| v1 markers (no `red-state=` field)             | 317      |
| collection derivation `probe`                  | 147      |
| collection derivation `none` (v2, silent)      | **15**   |
| markers wrapped in `pnpm heavy`                | **25**   |
| …of those, v2 markers hitting the `none` drop  | **10**   |

Reproduced by `pnpm tsx probe/population.mts` (committed with this arc).

**The exec arm's entire live population is two markers**, and §4 prices that honestly rather than
leaving a reviewer to discover the ratio.

### 1.2 The eight-shape failure table

Every shape was built as a real vitest fixture, run, and read. Exit code is **1 in all eight**, which
is precisely why exit code cannot discriminate.

| # | shape                                          | cases executed | rendered verdict line                          |
| - | ---------------------------------------------- | -------------- | ---------------------------------------------- |
| A | missing named **export**, read as a value      | 1 failed       | `AssertionError: expected undefined to be N`   |
| B | missing/private **symbol**, called             | 1 failed       | `TypeError: privateFn is not a function`       |
| C | missing **module**                             | **no tests**   | `Error: Cannot find module './…' imported from`|
| D | genuine assertion failure (**control**)        | 1 failed       | `AssertionError: expected 1 to be N`           |
| E | test file does not exist                       | **no tests**   | `No test files found, exiting with code 1`     |
| F | namespace-import form (**the ratified repair**)| 1 failed       | `AssertionError: expected undefined to be N`   |
| G | syntax / transform error                       | **no tests**   | `Error: Transform failed … [PARSE_ERROR]`      |
| H | file with zero `it()` cases                    | **no tests**   | `Error: No test found in suite <path>`         |

**C, E, G and H executed no case at all.** A, B, D and F each executed one.

---

## 2. The closed observable, and it is the whole design

> **A `red=` command that ran and executed ZERO test cases is not a red.**

The brief named four non-reasons to recognise — module resolution, missing export, config error, zero
tests collected. Three of the four collapse onto **one** observable, and the fourth is refuted in §6.
This is the chokepoint move: one closed observable in place of four recognizers over an open message
grammar.

It has **zero false positives by construction**, and the argument is one sentence: if no case ran,
no assertion was observed, so nothing can have failed for the reason the task named. No error text is
parsed, so no grammar can grow.

**Stated as an ACCEPT rather than a denylist**, because a denylist accepts whatever it did not model:
the arm accepts a red as genuinely observed **only** when the command is vitest-shaped **and** its run
executed at least one case. Every other input is reported by name — hard when the run executed zero
cases, `RED_PROBE_UNVERIFIED` when the arm cannot see the command at all (§3) — and nothing is
silently accepted. The accept is keyed on an executed-case **count**, never on a spelling.

**Where the observable comes from.** The arm already runs the red and **discards its stdout** —
deliberately, and pinned by a shipped test (`lib/specLint/types.ts:198`; fixture
`tests/specLint/fixtures/redVerdict/docs/superpowers/plans/exec-red-stdout.md`). Vitest's own summary
line is in that discarded stream. The adapter therefore **reads** the red's stdout for the summary
line and **still never reports it** — the existing sentinel assertion stays green, and §7 makes that
an acceptance criterion rather than an intention.

**Scope of the claim.** Only for commands the arm already recognises as vitest-shaped (`VITEST_SHAPE`,
`lib/specLint/redContract.ts:580`). For every other command the arm makes **no claim** — declared, not
silent, per §3.

**Why this beats the shipped probe rather than duplicating it.** Today the arm runs the red, throws
away the answer, spawns a **second** process (`vitest list`) to ask a weaker version of the same
question, and when that second process cannot complete `synthesizeCollectionFindings` emits
`RED_PROBE_UNVERIFIED` for "collection probe did not complete" and `continue`s. Shapes C, E and G
break the probe exactly as they break the red, so all three currently land as **advisory**. Reading
the red's own summary is more direct, spawns nothing, and converts them to a hard finding.

---

## 3. The two silent drops

Both were cited in the row, both verified at source, and each gets a decision rather than an empty
column.

**3.1 `collectionProbePlan`'s `none` drop — CLOSED.** `if (derived.kind === "none") continue;`
(`lib/specLint/redContract.ts:721`). A non-vitest-shaped command draws **no entry**, so neither a
FAIL nor the `RED_PROBE_UNVERIFIED` advisory. AGENTS.md mandates `pnpm heavy` for every heavy phase
and `VITEST_SHAPE` cannot match a `pnpm heavy`-prefixed command, so the arm is structurally blind to
the class the repo requires wrapping. **Measured at 25 markers, 10 of them v2** (§1.1). The drop
becomes a `RED_PROBE_UNVERIFIED` advisory naming the reason, which is the same channel the `skipped`
branch already uses one line below.

**3.2 `synthesizeCollectionFindings`'s no-probe return — CLOSED.** `if (probes === null) return [];`
(`lib/specLint/redContract.ts:752`; the row cites line 754, which is two lines off, corrected here
per the verify-every-citation rule). An invocation that planned probes and ran none returns silence
indistinguishable from a clean run. It becomes one advisory per planned entry.

Neither repair invents a code: both reuse `RED_PROBE_UNVERIFIED`, which already means exactly
"collection capability unverified".

---

## 4. Severity, decided by measurement

`citationIntent` is the precedent on this same surface: its strictest content condition still fired
on **15 of 135** correct citations, so the arm shipped ADVISORY, because a hard code with an 11%
false-positive floor gets waived reflexively
(`docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md:14`).

That spec also ratifies a standing fence: `do not re-propose a hard tier without a discriminator
measured to do better on this corpus`. **This arm is not that arm** — it is a different code over a
different observable, and it does not re-propose a hard tier for citation intent. The ratified fence
stands untouched.

**This arm ships HARD**, and the measured basis is different in kind:

- The observable's false-positive rate is **structurally zero**, not empirically small (§2). There is
  no input on which "executed zero cases" is true and "an assertion was observed" is also true.
- Its live population today is **two markers** (§1.1), so a wrong hard finding cannot be waived at
  scale — there is nothing to waive.

**The two-marker population is the argument against building this, and it is answered rather than
ignored.** Three reasons it still ships:

1. It is **subtractive**. Line 460 accepts every non-zero exit unconditionally; this removes that
   unconditional accept. It adds no recognizer and no grammar.
2. The cost when the population is empty is **zero** — no extra spawn, one string read from a stream
   the adapter already receives.
3. The population is small **because `red-state` is a v2 field** (317 of 479 markers predate it) and
   because a red is live only between authoring and implementation. It grows as v1 markers retire.

The §3 repairs are the volume half of this arc: 25 markers, measured, silently unverified today.

---

## 5. Convergence criterion

**Consequence bound.** Every `red=` the arm examines is **classified correctly or signaled, never
silently wrong**, and on the LIVE tracked spec+plan corpus the arm draws **ZERO false hard findings**.
A `red=` the arm cannot classify is reported as unverified or passes clean **by declared choice,
never hard-failed on a guess** — non-vitest-shaped commands pass clean with a stated no-claim (§2),
and `pnpm heavy`-wrapped commands report `RED_PROBE_UNVERIFIED` (§3.1). A conservative non-report
plus a surfaced advisory is a DOCUMENTED LIMIT, not a finding.

The two forbidden directions, named so neither is traded for the other: **false certification** (a
red accepted as observed when no assertion ran) and **wrong attribution** (a hard finding on a red
that did execute its case). A conservative over-report is permitted only through the advisory
channel, never as a hard code.

**`PROBE DOMAIN:`** `git ls-files 'docs/superpowers/specs' 'docs/superpowers/plans'`, `.md` only —
the 1153 files and 479 markers of §1.1 — plus the two `fix/mutation-browser-child-lifetime` plan-round
incidents. A probe outside that domain, or more than one ordinary edit from an input in it, files to
§6 rather than to a finding.

**Threat fence.** Ordinary authoring mistakes by a contributor writing a task's red. Adversarial
obfuscation is out of scope and files to §6.

**Score.** `redContract` is already enrolled. `pnpm mutation:guards` runs before the first
`--stage diff` dispatch, and its `equivalent` / `accepted-gap` rows are **re-derived** against this
arc's source change rather than inherited.

---

## 6. Documented limits, carrying two recorded falsifications

**6.1 The row's premise is measured FALSE, and it is recorded rather than quietly corrected.** The
row and the round-1 finding both state that an unresolved import "fails before any assertion runs".
Under this repo's Vite SSR transform a missing **named export** does not fail at the loader: it binds
`undefined`, the case **runs**, and the assertion fails on a wrong value (shape A, §1.2). Only a
missing **module** dies at the loader (shape C). Anyone re-deriving loader-death will get this result.

**6.2 An absent binding is NOT separable from the ratified repair.** Round 1's finding was repaired
by importing the module and asserting on the missing export — a namespace import. Both forms were run:
the verdict-bearing line is **byte-identical** (`AssertionError: expected undefined to be 660000`,
same Expected, same Received); only the echoed source frame differs. **A classifier that rejects the
incident rejects the repo's own ratified repair**, so verdict-line classification is dead as a
discriminator here. Rule 217: a bound that condemns ratified behaviour convicts you by your own
standard.

A corollary worth recording, because it is cheap to re-derive and expensive to re-argue: since both
forms render identically, **that repair was right for the wrong reason** — it changed nothing
observable.

**6.3 The real hazard of an absent binding is vacuous PASSING, and it is out of scope here.**
Measured on the incident's own AC-2: three assertions against an absent binding gave **2 failed, 1
passed**. The passing one was the negative assertion (`undefined !== 180000` is trivially true). That
is rule 34's shape. Detecting it needs the test file's import form — a static recognizer whose live
population is provably ~0, because an absent-binding red exists only between the red commit and the
green commit, and any committed instance would red its own suite in `unit-suite`, which is green on
main. **Declined as speculative design; re-file trigger: a committed instance observed on main.**

**6.4 Non-vitest commands.** The arm makes no execution claim for them. Closing that needs a
per-runner summary grammar — the ratchet this surface has already paid 20 diff rounds for.

---

## 7. Acceptance criteria

Every row names the executable step that proves it and the channel the proof arrives on.

| AC   | claim                                                                                     | proved by                                                                                              |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AC-1 | a live vitest red that runs and executes **zero** cases draws a **hard** finding            | fixture plan + `--exec-red` CLI run in `tests/specLint/fixtures/redVerdict/`, one fixture per shape C/E/G/H |
| AC-2 | a live vitest red that executes a case and fails does **not** draw it (shapes A, B, D, F)   | the same CLI run; shapes A and F are the must-stay-CLEAN control pair                                    |
| AC-3 | red-command stdout is **read but never reported**                                           | the shipped `exec-red-stdout.md` sentinel assertion stays green, re-run unchanged                        |
| AC-4 | a `pnpm heavy`-wrapped v2 marker draws `RED_PROBE_UNVERIFIED` instead of silence            | fixture plan whose `red=` is heavy-wrapped; asserts the code by name                                     |
| AC-5 | a planned-probe invocation that ran no probes draws one advisory per entry, not `[]`        | unit test over `synthesizeCollectionFindings` with `probes === null` and a non-empty plan                |
| AC-6 | the §1.1 population table is reproducible                                                   | `pnpm tsx probe/population.mts`, committed, with a floor that aborts on a short read                     |
| AC-7 | the arm draws **zero hard findings** across the whole PROBE DOMAIN                          | `pnpm spec:lint` over all 1153 tracked docs, count asserted                                              |

**AC-2 is the load-bearing one.** Shape F is the ratified repair and shape A is the incident; they are
byte-identical (§6.2), so any implementation that hard-fails A also hard-fails F. A fixture set
lacking the A/F pair is satisfiable by a strictly weaker implementation that keys on
`expected undefined`.

---

## 8. Self-application

This arm runs on this arc's own plan. `pnpm spec:lint` is run against the plan before every dispatch
and the result reported. A plan of this arc's whose reds fail this arm is the mechanism working: the
reds get fixed, the arm does not get weakened.

It already fired on this spec, and every repair was to the spec. Three hard findings were drawn and
fixed: a malformed citation written as a bare line number in backticks — committed twice, the second
time in the sentence describing the first, which is a disposition becoming an instance of what it
describes; a missing "Resolved scope" section, now §0; and a `CITATION_SYMBOL_UNMATCHED` on a
line-number citation, re-pointed to name `synthesizeCollectionFindings` and quote its content.

The current standing is **produced by the command, not typed here**:

```
pnpm exec tsx scripts/spec-lint.ts --json docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md
```

The surviving findings are all `NUMERIC_NOUN_MISMATCH` over nouns this document uses for genuinely
different quantities — `"failed"` across the §1.2 shape table and the §6.3 vacuity measurement,
`"markers"` across the red-marker total and the heavy-wrapped subset. They are left standing rather
than reworded: usefulness is not the criterion, correct attribution is, and rewording out of a
matcher is silencing rather than answering.
