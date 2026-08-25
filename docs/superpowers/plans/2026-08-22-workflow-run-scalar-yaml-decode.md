# Plan — decode YAML quoting on workflow `run:` scalars before the shell lexer

**Spec:** `docs/superpowers/specs/ci/2026-08-22-workflow-run-scalar-yaml-decode-design.md`
**Ledger row:** `BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE` (BACKLOG.md:282)
**Branch:** `fix/yaml-run-scalar-quoting-decode`, base `origin/main` @ `50ca72a56`
**Files:** `tests/cross-cutting/psqlStartupFiles/scan.ts` (enrolled guard surface `psqlStartupScan`,
`tests/mutation/source/registry.ts:2420`), `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

---

## 1. Pre-draft verification pass

Every name this plan uses was resolved against the live tree before drafting. Commands and results:

| Claim | Verified |
| --- | --- |
| `scanWorkflowSource` raw pass is unconditional | `scan.ts:4076` — `const found = scanShellText(substituteScriptPath(raw), file, offset).map(...)` |
| the decoded pass already exists and pins to the key line | `scan.ts:4106-4114` |
| `verdictIdentity` dedupes raw against decoded | `scan.ts:4098-4105` |
| `scanShellIndirection` lexes the whole YAML file | `scan.ts:3416-3421` — `const lexedSource = YAML_EXTENSIONS.includes(extensionOf(file)) ? ... : source` |
| the advisory emission site | `scan.ts:3456` — `hits.push({ file, line: target.line + 1, text: target.unlexable.trim() })` |
| `usage.indirections` is a hard red on the live tree | `psqlStartupFileSuppression.test.ts:1609-1614` |
| the registry row names source + suite | `tests/mutation/source/registry.ts:2420-2422` |
| `yaml@2.9.0` emits five scalar `type` values | spec §2.5, measured |

## 2. Meta-test inventory

CREATES: none. EXTENDS: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`, the deciding suite
already named by the `psqlStartupScan` registry row. No new registry, so `suitePaths` is unchanged.
No advisory-lock surface, no DB surface, no UI surface.

## 3. Design prototype — run before this plan was written

The §3.2 accept-set gate was applied as a THROWAWAY prototype, measured, and reverted; the tree was
confirmed clean (`git status --porcelain` empty) before this plan was committed. It is recorded here
because it settles the plan's central risk mechanically rather than by argument.

Under the prototype, against the spec's canonical body `echo >$(psql -qAt mydb`:

```
plain   ADVISORY {"line":7,"text":"$(psql -qAt mydb"}     (unchanged)
single  (nothing)                                          (still silent - Task 2's job)
double  (nothing)                                          (fabricated site GONE)
```

And the AC-4 anti-tautology cases, all six passing — decoding is not silencing:

```
OK  benign quoted, protected    'psql -X mydb'        site, suppresses=true
OK  benign quoted, UNPROTECTED  'psql -qAt mydb'      site, suppresses=false
OK  dquoted, UNPROTECTED        "psql -qAt mydb"      site, suppresses=false
OK  dquoted escape spelling     "\x70sql -qAt mydb"   site, suppresses=false
OK  benign non-psql             "echo hello"          nothing
OK  plain, UNPROTECTED          psql -qAt mydb        site, suppresses=false
```

The fourth row is the one that matters most: the `\x70sql` spelling has no literal `psql` in its raw
slice, so it is found ONLY through the decoded pass. It survives the gate, which is the evidence
that suppressing the raw pass for quoted scalars does not blind the scanner.

## 4. Anti-tautology statement

Each task states the concrete failure mode its test catches, and every RED is authored against a
production line verified defective on the live tree.

The dominant tautology risk here is a test that passes because the scanner returns `[]` for the
wrong reason. AC-1 asserts an EMPTY result, which is exactly the assertion a broken scanner
satisfies for free. That is why AC-4 ships in the SAME task: a design that suppressed quoted
scalars entirely would satisfy the first two rows and fail the third. None is a valid test without the
others, so they are not separable into different tasks.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — accept-set gate on the site channel

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:4076` why=`the raw pass at scan.ts:4076 runs unconditionally, so for a QUOTE_DOUBLE scalar the YAML delimiters reach the shell lexer, the leading quote opens a double-quoted span, the $( inside it consumes the YAML closing quote, and a psql command word is recovered from a substitution body that exists only because two YAML delimiters were read as shell — the new AC-1 case requires zero sites there and the current tree returns one with nested true` ac=AC-1,AC-3,AC-4,AC-9 -->

**What is red and why:** the new case for AC-1 asserts `scanWorkflowSource` returns no site for a
double-quoted `run:` scalar carrying the spec's canonical body; the current tree returns one
fabricated site, because `scan.ts:4076` scans the raw slice regardless of the scalar's YAML style.

**RED.** Add to the deciding suite a `describe("YAML scalar style")` block:

- **AC-1** — the canonical body double-quoted yields `[]` from `scanWorkflowSource`.
- **AC-3** — the same body plain still yields `[]` sites and exactly one advisory at the `run:` key's
  line; a `BLOCK_LITERAL` body still yields its site at its physical line, not at the key's.
- **AC-4** — all six rows of §3's table, asserted on `suppressesStartupFiles` and not merely on
  presence. Two of them are QUOTE_DOUBLE POSITIVES (`"psql -qAt mydb"` and `"\x70sql -qAt mydb"`)
  and both are mandatory: without them an implementation that handles single quotes correctly and
  suppresses both passes for double quotes satisfies every other assertion in this plan, because
  every other double-quoted assertion expects nothing. `bash -n` accepts `psql -qAt mydb`, so losing
  its decoded pass would be silent corruption. The `\x70sql` row is decoded-only — its raw slice
  holds no literal `psql`.

**RED validity, measured rather than claimed.** The block above was spliced into a throwaway suite
beside the real one, run against the current tree, and removed. Result: **1 failed, 8 passed of 9.**

The one failure is AC-1 — `expected [ { …(11) } ] to deeply equal []`, the fabricated site. That is
the marker's red and it is caused by `scan.ts:4076`, the line the marker's `red-target=` names.

**The eight that pass are green at authoring BY DESIGN and that is not an invalid RED.** AC-3 and
AC-4 assert that behaviour which is already correct SURVIVES the change; they are regression guards
for the gate, not red-then-green cases. Splitting them into their own task to give them a red of
their own is the defect §4 warns about: AC-1 asserts an empty result, which a scanner broken in the
other direction satisfies for free, so the two must fail and pass as one unit. The marker's `red=`
runs the whole suite, the suite is red on AC-1 alone, and the same command passes after the gate
lands.

Pre-running it also confirmed the fixtures reach their assertions: the block-literal case really does
report line 8 and the plain advisory really does report line 7, so neither assertion is satisfied by
a degenerate zero.

**GREEN.** In `scanWorkflowSource`, read the scalar's style from the node the `yaml` parser already
produced and gate the raw pass on it:

```ts
const style = (value as { type?: string }).type;
const rawIsShellText =
  style === "PLAIN" || style === "BLOCK_LITERAL" || style === "BLOCK_FOLDED";
```

`found` is `[]` when `rawIsShellText` is false; the decoded pass below is unchanged and becomes the
only pass for a quoted scalar. `verdictIdentity` needs no change: with no raw findings its `seen`
set is empty and every decoded site is kept.

**Also in this task — AC-9, the accept-set pinned against the library.** The three styles go in a
NAMED exported constant rather than an inline disjunction, so the accept-set is one declaration a
reader and a mutant can both find:

```ts
export const RAW_IS_SHELL_TEXT_STYLES = new Set(["PLAIN", "BLOCK_LITERAL", "BLOCK_FOLDED"]);
```

and the pin asserts a PARTITION over the §2.5 spelling corpus: the constant is DISJOINT from the two
quoted styles, and their union EQUALS the set of `type` values the installed `yaml` emits.

**Equality, not coverage — plan review found the weaker form and it is worth stating why.** The
first draft asserted the union COVERS what the library emits, which together with disjointness still
admits an arbitrary extra member: a constant holding `NOT_A_YAML_STYLE` is disjoint from the quoted
styles and still covers everything emitted, so both assertions pass while default-deny has been
weakened. Under equality an added member breaks the union in one direction and a dropped one breaks
it in the other.

**This was a separate task and is not one any more, because its RED could not exist.** Drafted as
Task 3 with its own red-then-green marker, it was pre-run against the current tree and **passed on
the first authoring** — the installed library does emit exactly those five, so the assertion is true
before any of this arc's code exists. That is the marker shape the task contract rejects outright: a
guard test that passes the moment it is authored can never be observed failing for the reason its
`why=` names. A structural pin being green from birth is fine; dressing it in a red-then-green
marker is not. It ships here, in the commit that introduces the thing it pins.

**Then, in the same task:** `pnpm mutation:sites`. Every edit to `scan.ts` moves line-anchored
registry keys.

## Task 2 — blank-and-rescan on the advisory channel

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:3416` why=`scanShellIndirection lexes the whole YAML file as one shell text at scan.ts:3416-3421 and never parses YAML, so a single-quoted run scalar's YAML delimiters are read as shell single quotes and the entire body collapses to one literal word with no redirection target — the new AC-2 case requires one advisory for the single-quoted spelling of a body whose plain spelling already produces one, and the current tree returns none` ac=AC-2 -->

**What is red and why:** the new case for AC-2 asserts `scanShellIndirection` returns one hit for the
single-quoted spelling of the canonical body; the current tree returns none, because
`scan.ts:3416-3421` hands the raw YAML to the lexer and the YAML quotes are consumed as shell
quotes.

**RED.** Add a `describe("YAML quoted scalar advisory")` block. Plan review round 3 found the first
draft covered only `run`, which a `run`-only implementation passes while violating AC-2, so the
matrix is stated as a matrix:

- **AC-2, the full key x style matrix.** Every EXECUTABLE key under BOTH quoted styles: `run`,
  `shell`, `entrypoint`, `args`, each `QUOTE_SINGLE` and `QUOTE_DOUBLE`. Eight cells. Probed at
  base, all four keys behave identically — `plain=1 single=0 double=0` — so all eight are red now
  and none is redundant. Six of the eight were missing from the first draft.
- **The key line and the value line must DIFFER in at least one fixture.** YAML accepts

  ```yaml
        - run:
            "echo >$(psql -qAt mydb"
  ```

  with the key on line 7 and the scalar starting on line 8. Every fixture in the first draft put
  them on one line, so an implementation anchoring on `value.range[0]` instead of the key's range
  passed every line assertion. The spec's anchoring contract says the KEY's line, and this is the
  only fixture shape that can tell the two apart.
- **A multiline flow scalar followed by a plain scalar**, asserting the second one's advisory
  survives. This is the coordinate-space case measured above: get the ordering wrong and the blank
  overruns into the next step and erases it.
- A benign quoted scalar (`run: "echo hello"`) draws no advisory. The channel fires on CONTENT,
  never on quoting — this is what keeps the hard-red assertion at
  `psqlStartupFileSuppression.test.ts:1609` from breaking correct authoring.
- A `.sh` file is unaffected, pinning §4a's claim that the declared-limit pin at line 6173 is out of
  reach of this change.

**RED validity, measured.** The block was spliced into a throwaway suite, run against the current
tree, and removed: **2 failed, 4 passed of 6.** Both failures are the AC-2 cases — single-quoted and
double-quoted — each `expected [] to have a length of 1`, which is exactly the silence the marker's
`why=` names, caused by the whole-file lex at `scan.ts:3416-3421`.

The four passes are regression guards for behaviour that is already correct: the three
fire-on-content-not-on-quoting cases, and the `.sh` case that pins the declared-limit pin's input
family as untouched. That last one is load-bearing rather than decorative — it returns one hit on
the current tree, so §4a's "a `.sh` file never reaches the new code" is verified against the tree
BEFORE the change and re-verified after, instead of being argued from the gate's source.

**GREEN.** In `scanShellIndirection`, for a YAML file only:

1. Parse the document and collect the source ranges of every EXECUTABLE scalar whose `type` is
   `QUOTE_SINGLE` or `QUOTE_DOUBLE` — all four keys, `run` and `shell`
   (`EXECUTABLE_WORKFLOW_KEYS`, `scan.ts:3690`) plus `entrypoint` and `args`
   (`CONTAINER_ARGV_KEYS`). The container-argv pair is in scope for THIS channel because it lexes
   the whole file, so their YAML delimiters reach the shell lexer exactly as a `run:` scalar's do.
   Probed at base: `args:` PLAIN reports one advisory, `args:` DOUBLE and `args:` SINGLE report
   none. Their site channel is already correct (`scan.ts:3997` composes decoded values) and is not
   touched. The repair is a set union, so the class-sweep default applies — the marginal cost of the
   second key is one identifier while holding the context.
2. Blank each range **in SOURCE COORDINATES, before the continuation transform**: every non-newline
   character becomes a space, newlines are kept, so byte count and line count both survive.
3. Rescan each blanked scalar's decoded value through the same lexer-and-report path, pinning hits
   to the key's line — the contract `scan.ts:4109-4113` already states for decoded findings.

**Step 2's ordering is the finding plan review caught, and it is measured.** This channel already
rewrites its input once, at `scan.ts:3416-3418`, and that rewrite REMOVES BYTES. Parser ranges are
offsets into the original source. On a flow scalar carrying one physical continuation with a plain
binding on the next step, the transform removes 10 bytes, and blanking afterwards overruns by
exactly that much into the following line:

```
RIGHT (blank, then transform): "      - run: PG=psql; $PG -qAt mydb"
WRONG (transform, then blank):  "         un: PG=psql; $PG -qAt mydb"
```

The key itself is destroyed, so that step stops being a `run:` scalar and its binding is never read
— a silent erasure of a real finding, in the channel this task exists to un-silence. **That exact
shape is a required test case**: a multiline flow scalar, a following plain scalar, and an assertion
that the second one's advisory survives.

**Then, in the same task:** `pnpm mutation:sites`.

## Task 3 — retire the declared limit

<!-- task: red=`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-quoted-run-claim-sweep.mts` red-state=live why=`the sweep gates REPAIR rather than its own existence: every site in the scripts DECLARED list must carry a supersession marker within twelve lines. On the pre-implementation tree not one of them does, so it exits 1 naming every declared site across the two predecessor specs, the deciding suite and the scanner module header; the edits of this task are exactly what turns the same command green. The count lives in the script rather than being repeated here, so the two cannot drift` ac=AC-10 -->

**What is red and why:** the claim sweep exits 1 on the current tree naming all seven declared claim
sites as carrying no supersession marker. The six edits below are exactly what turns the same
command green.

**This work was in Task 2 and plan review round 4 was right to reject that.** Executed in order,
the sweep would have gone green inside Task 2's commit, before Task 3 began — the invalid RED shape
where an earlier task, not this one, changes the result. It also split one unit of work across two
commits, against the per-task commit rule. The work and its marker now live together.

**The limit this change retires.** Running the deciding suite under the
prototype flipped two declared-limit rows at
`tests/cross-cutting/psqlStartupFileSuppression.test.ts:5153-5157` from their pinned zero to one hit
each: `- run: "PG=psql; $PG -qAt mydb"` and its `PG=p'sql'` spelling. That is the improving
direction, and the predecessor arc predicted it: its own spec says recall there needs YAML-aware value extraction on a different surface
(the **Quoted YAML `run:` scalars, plain or mixed** documented-limit bullet in
`docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md`, lines 325-331
at time of writing -- the bold phrase identifies it, the range only locates it).

**The corpus was swept for every other place asserting that zero, and the first sweep was WRONG in
the way this arc keeps finding.** It was two greps. One required the fixture text and
`toHaveLength(0)` on the SAME LINE; in the known instance they are four lines apart, so it reported
"no other executable assertion" for the wrong reason. The other was case-sensitive and phrase-bound
and missed a hit in a document the disposition table claimed to have read. A sweep that reports
clean because it cannot match is the vacuity class, not a sweep.

The replacement is committed and runnable:
`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-quoted-run-claim-sweep.mts`. Two windowed
arms — PROSE (a claim about a quoted executable scalar near a not-read word) and EXECUTABLE (a
zero-assertion within eight lines of a quoted fixture) — over every tracked `.ts`, `.mts` and `.md`,
with dated execution records excluded by path.

**It self-tests against every site in its `DECLARED` list and exits 2 if the matcher misses one**,
because a discovery arm is only trustworthy where it has been shown to fire. Several of those sites
were found by plan review AFTER an earlier sweep reported clean, which is why they are listed.
Narrowing the matcher back to an earlier form makes the self-test abort naming the site it lost, so
the self-test is itself non-vacuous.

TWO declared sites are exempt from the self-test, each saying so in the script. The first is the
**Quoted YAML `run:` scalars** documented-limit bullet in the predecessor spec (lines 325-331 at
time of writing): it wraps its claim across three
lines and the matcher's window is two. The second is the executable pin at
`psqlStartupFileSuppression.test.ts:5156`, and its reason generalises rather than being an accident
of this matcher — the discovery arm finds an executable claim by its zero-assertion, and repairing
that site means replacing the zero with a hit, so the arm cannot see it afterwards and no widening
would change that. BOTH are still GATED — the gate reads each file directly and never consults the
matcher — so the exemptions cost coverage of the discovery arm only, and both are recorded rather
than silent. Widening the window to reach the first is the ratchet this sweep already stopped
climbing once.

Result: 50 hits over 4111 files. The ones that are claims about this scanner's current behaviour:

| Hit | Disposition |
| --- | --- |
| `tests/cross-cutting/psqlStartupFiles/scan.ts` line 232 — the module header's own limits list, "This covers a quoted YAML `run:` scalar read as one word" | SUPERSEDE. The guard's own header describing behaviour this task removes. |
| predecessor spec, line 292 — "the quoted workflow `run:` scalar ... stays ZERO" | SUPERSEDE. Present tense, falsified. |
| predecessor spec — the **Quoted YAML `run:` scalars** documented-limit bullet (lines 325-331 at time of writing) | SUPERSEDE by cross-reference. |
| predecessor spec, line 346 — §6 item 2 | SUPERSEDE. The canonical record; carries the note. |
| 2026-08-20 spec, lines 565-566, disposition rows 6-8, which leave the pin alone and give the flag criterion as the reason | SUPERSEDE the reason clause by cross-reference. The rows record that arc's action truthfully; the clause asserts current behaviour. |
| 2026-08-20 spec, lines 615-616 — "including a quoted YAML `run:` scalar ... Unchanged." | SUPERSEDE. A live limits list. |
| the pin at `psqlStartupFileSuppression.test.ts` | RE-PIN as hits. |
| predecessor PLAN line 666, `docs/review-rounds/**`, `tests/docs/_retiredIdentifiers.ts`, the `declaredLimitPins` spec-lint FIXTURES | LEAVE. Execution records and copied fixtures — the first are never corrected, the second pin a document's shape rather than the scanner's behaviour. |
| `tests/cross-cutting/workflowActivation.test.ts:104-106` | LEAVE. Different subject; matched on shape, not on this claim. |

The edits, all in this task's commit:

1. Re-pin both rows as HITS rather than deleting them. A retired limit stays visible as a pin.
2. Correct their comment. It currently attributes the miss to the flag criterion; the actual cause
   was the quoted scalar lexing to one word, which is this arc's defect. Leaving the old cause in
   place would leave a true-looking explanation of a behaviour that no longer exists.
3. Add a "Superseded in part, 2026-08-22" note to §6 item 2 of the predecessor spec, naming this row
   — the same form item 1 of that section already carries from 2026-08-20. The flag criterion for
   `.sh` input is untouched and stands.
4. Point line 292 and the **Quoted YAML `run:` scalars** bullet at that note, so no present-tense "stays ZERO"
   survives uncorrected. One canonical record, cross-references everywhere else — not independent
   rewrites that can drift apart.
5. Correct the module header at `tests/cross-cutting/psqlStartupFiles/scan.ts` line 232. This one
   matters most of the six: it is the guard's OWN description of itself, and a reader checking what
   the scanner does starts there.
6. Point the 2026-08-20 spec's two live sites (disposition rows 6-8, and the limits list at lines
   615-616) at the same canonical note.


<!-- tasks: end -->

---

## Close-out gates (deliberately OUTSIDE the declared task region)

Plan review round 3 found the previous Task 3 marker invalid, and it was right: it declared
`red-state=live` for the AC-5 digest command, which passes on the pre-implementation tree and passes
after. The contract is red-then-green on the SAME command, and a command that is green at both ends
expresses no cycle. Substituting separately constructed mutant evidence does not repair that — it
answers a different question.

The honest reading is that these are GATES, not tasks. A gate asserts a state is preserved; a task
has a red. So the declared region closes above, and they live here where the contract does not reach
them. What used to be Task 3 is now real work with a real live red: the claim sweep genuinely fails
on the current tree and its six edits are what turn it green.

Each gate still carries its constructed mutant-red, and each has been OBSERVED rather than described:

**Gate commands, each with its constructed mutant-red.** A gate that cannot fail is not a gate, so
each is probed against a failing input rather than trusted:

| Gate | Passes on | Constructed failure |
| --- | --- | --- |
| AC-5 digest probe with `--expect` | the clean tree at base and at HEAD | already observed: a stray `.mts` in the worktree holding a psql fixture string injected 7 indirections and the probe exited 2. Recorded in spec §2. |
| AC-6 `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-quoted-scalar-census.mts --expect-quoted 0` | zero quoted executable scalars | **RUN, not described.** A `- run: "echo quoted"` step was appended to `.github/workflows/admin-layout-e2e.yml`; the census reported `run:QUOTE_DOUBLE = 1` and named the planted step by file and line. The workflow was then restored and the census returned to `0`. No line is cited for the planted step: it existed only while the mutant was, and the restored file is shorter. |
| AC-7 `pnpm mutation:sites` | all registry keys resolve — measured clean at base, "all accepted rows resolve" | observed red after every `scan.ts` edit, before the re-key. Concrete: `psqlStartupScan` carries **30** accepted rows, line-anchored. Task 2 inserts helpers above `scanShellIndirection` (~line 3391) and edits at 3416, so every row anchored below shifts — 4 of them sit below 3416 alone. This is why a comment-only edit re-keys exactly as code does. |
| AC-8 `node docs/superpowers/specs/ci/probes/2026-08-22-seam-check.mjs` | this arc's diff | **RUN. Two earlier versions of this gate could not fail; the third is proved against a deletion and against the outer walk.** See below. |
| AC-10 `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-quoted-run-claim-sweep.mts` | the corpus after Task 3 | Gates the script's `DECLARED` list, every site of which is unmarked before the repair, so it exits 1 today. Self-tests the matcher against that same list and exits 2 on a miss. Narrowing the matcher back to an earlier version aborts naming the site lost, so the self-test is non-vacuous. |

### AC-8: three denylists, then an allowlist

This gate was found vacuous three times, each in a new direction, and plan review round 4 caught a
fourth hole in the first allowlist. Recording all of it, because the pattern is the point.

**The three denylists.** Each said "the diff must not touch the delimiter walk", and a denylist
accepts whatever it did not model.

1. Keyed on git's `@@` hunk header, which names the ENCLOSING function. Most of the walk is nested
   arrows, so a mutant planted inside `closeDoubleQuoted` passed. The header is wrong in both
   directions: run against real history it also blames `closingBacktick` for a constant declared
   after it.
2. AST ranges over a hand-written name list. It missed `closeAnsiC`, `closingBacktick` and
   `attachedTargetEnd` — the 95-line outer walk lexically CONTAINING four of the members it did
   name — and it missed pure deletions, whose new-side hunk count is zero.
3. A derived closure, callees plus lexical ancestors. It collected only function-VALUED
   declarations, so `ATTACHED_TARGET_TERMINATOR`, a module-level regex deciding where the walk ends,
   escaped with a live mutant.

**The allowlist, and the hole review found in its first cut.** The question is inverted: what this
arc may touch is small, known and mine to declare, so the check names those seven declarations and
denies the rest of the file. But the first cut skipped `ImportDeclaration` and `ExportDeclaration`
when collecting owners, and accepted any changed line with no owner — so two statement classes were
unowned and therefore exempt. Review demonstrated it with a live wrong report: swapping the imported
`isPair` and `isScalar` bindings flips both predicates from true to false, and the gate said PASS. A
default-deny that leaves a statement class unowned is not default-deny. Every statement class is now
owned; only trivia — comments and blank lines — reaches the unowned branch, which is what lets this
arc edit the module header.

**Observed, against the CURRENT allowlist.** All four historical escapes plus the two review found:

```
clean tree                                        PASS, exit 0
edit inside closeDoubleQuoted (escape 1)          FAIL  scan.ts:1103 in `attachedTargetEnd`
4-line DELETION inside closeAnsiC (escape 2)      FAIL  scan.ts:1092 in `attachedTargetEnd`
edit at 1150, attachedTargetEnd's main loop       FAIL  scan.ts:1150 in `attachedTargetEnd`
edit to ATTACHED_TARGET_TERMINATOR (escape 3)     FAIL  scan.ts:1064 in `ATTACHED_TARGET_TERMINATOR`
swap the isPair/isScalar imports (escape 4)       FAIL  scan.ts:407  in `<ImportDeclaration>`
append a new top-level export                     FAIL  scan.ts:4438 in `PLANTED`
edit inside scanWorkflowSource (permitted)        PASS, exit 0
```

Adding the script moved no finding: the AC-5 digest still reads
`8ebe8b08d43e6308aa471112d9f086d0118e6238` over 76 rows.

Run the AC-5 digest on a CLEAN tree. Then `pnpm heavy pnpm mutation:guards` for the score, and state
the score plus the unaccepted-survivor set in the round-1 diff brief's GUARD SURFACE line.


---

## 4a. Declared-limit pins — one left alone, one retired

Two pins on this surface, with opposite dispositions. Both are named here in full; neither is
assumed.

**Left alone.** `spec:lint` reports `DECLARED_LIMIT_PIN_UNNAMED` for
`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6173`, whose title is
"each quote-concatenated keyword/operand spelling is a declared miss". That pin ranges over `.sh`
input: every row in it calls `scanShellIndirection(source, "x.sh")`. Task 2's change is gated on
`YAML_EXTENSIONS.includes(extensionOf(file))`, the same predicate that already selects the dedent
branch at `scan.ts:3416`, so a `.sh` file never reaches the new code. The verification is that the
block runs green after Task 2, recorded in the task's closure rather than assumed here.

**Retired.** The pin at `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5153-5157`, whose title is "multiword binding value: a quoted run: scalar (%s) stays a limit" — named here in full.
Task 2 retires it and re-pins both rows as hits; the three required edits are in that task, and
AC-10 is the acceptance.

**The linter found the first and was silent on the second.** Its arm reads plan text against pin
titles; it cannot know which pins a change will move. What found the second was running the deciding
suite under the prototype — 2 failures out of 1009, both in that block. This is the reason §3's
prototype is part of the plan rather than an optional nicety, and it is worth stating plainly: a
plan that had trusted the linter's pin list would have shipped a silent limit retirement.

## 5. Fix-round regression budget

After any review-round repair to `scan.ts`: re-run `pnpm mutation:sites` (the repair moves lines
exactly as the original edit did), re-run the deciding suite, and re-run the AC-5 digest on a clean
tree. Record all three in the round closure. The repair's own incidental edits are in scope for the
re-check, not only the patched class.

## 6. Close-out

**impeccable-gate: N/A — no UI surface.**
