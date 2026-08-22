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
single  (nothing)                                          (still silent — Task 2's job)
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

and the pin asserts two properties over the §2.5 spelling corpus: the constant is DISJOINT from the
two quoted styles, and their union COVERS every `type` the installed `yaml` actually emits. Both
directions discriminate — adding `QUOTE_SINGLE` to the constant breaks disjointness, dropping
`BLOCK_FOLDED` breaks coverage — which a bare "the library emits five styles" assertion does not,
since it never mentions the constant at all.

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

**RED.** Add a `describe("YAML quoted scalar advisory")` block:

- **AC-2** — the canonical body single-quoted yields exactly one indirection hit, at the `run:`
  key's line, with the same `text` the plain spelling reports.
- **AC-2, second style** — the DOUBLE-quoted spelling of the same body also yields exactly one
  advisory at the key's line. This is the swept twin of Task 1's AC-4 gap: a single-style acceptance
  passes an implementation that is correct on one quote style and blind on the other. It also yields
  no fabricated advisory for a body with no unlexable target.
- A benign quoted scalar (`run: "echo hello"`) yields no advisory. This is the case that keeps the
  hard-red assertion at `psqlStartupFileSuppression.test.ts:1609` from breaking correct authoring,
  and it is the AC-4 twin for this channel.

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

1. Parse the document with the same `parseDocument` the workflow reader uses and collect the source
   ranges of every executable scalar whose `type` is `QUOTE_SINGLE` or `QUOTE_DOUBLE`.
2. Blank each range in `lexedSource`: every non-newline character becomes a space, newlines are
   kept. Byte count and line count are both preserved, so every other word's physical line is
   unchanged and the lexer sees whitespace where YAML syntax used to be. Spec §2.5 measures why the
   alternative — splicing the decoded value in at the same offsets — is wrong: a double-quoted `\n`
   escape has zero raw newlines and one decoded newline, so splicing shifts every line after it.
3. Rescan each blanked scalar's decoded value through the same lexer-and-report path, pinning every
   resulting hit to the `run:` key's line — the anchoring contract `scan.ts:4109-4113` already
   states for decoded findings.

**Also in this task — AC-10, the limit this change retires.** Running the deciding suite under the
prototype flipped two declared-limit rows at
`tests/cross-cutting/psqlStartupFileSuppression.test.ts:5153-5157` from their pinned zero to one hit
each: `- run: "PG=psql; $PG -qAt mydb"` and its `PG=p'sql'` spelling. That is the improving
direction, and the predecessor arc predicted it: its own spec says recall there needs YAML-aware value extraction on a different surface
(`docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md:322-328`).

**The corpus was swept for every other place asserting that zero, and the sweep is why this is four
edits rather than three.** Commands and dispositions:

```
grep -rn 'run: \\"' tests/ --include='*.ts' | grep -i 'toHaveLength(0)\|toEqual(\[\])'
  -> no other executable assertion of the zero
grep -rn 'quoted YAML `run:`\|quoted workflow `run:`' docs/ --include='*.md'
  -> 5 prose hits
```

The prose hits, each dispositioned:

| Hit | Disposition |
| --- | --- |
| predecessor spec, line 292 — "the quoted workflow `run:` scalar ... **stays ZERO**" | SUPERSEDE. A present-tense claim this change falsifies. |
| predecessor spec, lines 322-328 — the documented-limit bullet | SUPERSEDE by cross-reference to §6 item 2. |
| predecessor spec, line 346 — §6 item 2 | SUPERSEDE. This is the canonical record and carries the note. |
| predecessor PLAN, line 666 — the test comment, quoted verbatim | LEAVE. An execution record of a completed arc, like a probe transcript. |
| `docs/review-rounds/fix/shell-attached-redirection-target/0ba72c23774f.md:33` | LEAVE. A dated round record; those are never corrected. |

Four edits, all in this task's commit:

1. Re-pin both rows as HITS rather than deleting them. A retired limit stays visible as a pin.
2. Correct their comment. It currently attributes the miss to the flag criterion; the actual cause
   was the quoted scalar lexing to one word, which is this arc's defect. Leaving the old cause in
   place would leave a true-looking explanation of a behaviour that no longer exists.
3. Add a "Superseded in part, 2026-08-22" note to §6 item 2 of the predecessor spec, naming this row
   — the same form item 1 of that section already carries from 2026-08-20. The flag criterion for
   `.sh` input is untouched and stands.
4. Point line 292 and the lines 322-328 bullet at that note, so no present-tense "stays ZERO" survives
   uncorrected. One canonical record, two cross-references — not three independent rewrites that can
   drift apart.

**Then, in the same task:** `pnpm mutation:sites`.

## Task 3 — score and close-out

<!-- task: red=`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238` red-state=live why=`this is a GATE command, not an authored red — it asserts the live finding set has not moved and it passes on the clean tree at base, which is the state this task must preserve; its mutant-red is constructed below rather than observed on the tree` ac=AC-5,AC-6,AC-7,AC-8 -->

**Gate commands, each with its constructed mutant-red.** A gate that cannot fail is not a gate, so
each is probed against a failing input rather than trusted:

| Gate | Passes on | Constructed failure |
| --- | --- | --- |
| AC-5 digest probe with `--expect` | the clean tree at base and at HEAD | already observed: a stray `.mts` in the worktree holding a psql fixture string injected 7 indirections and the probe exited 2. Recorded in spec §2. |
| AC-6 census | zero quoted executable scalars | **RUN, not described.** A `- run: "echo quoted"` step was appended to `.github/workflows/admin-layout-e2e.yml`; the census reported `run:QUOTE_DOUBLE = 1` and named the planted step by file and line. The workflow was then restored and the census returned to `0`. No line is cited for the planted step: it existed only while the mutant was, and the restored file is shorter. |
| AC-7 `pnpm mutation:sites` | all registry keys resolve — measured clean at base, "all accepted rows resolve" | observed red after every `scan.ts` edit, before the re-key. Concrete: `psqlStartupScan` carries **30** accepted rows, line-anchored. Task 2 inserts helpers above `scanShellIndirection` (~line 3391) and edits at 3416, so every row anchored below shifts — 4 of them sit below 3416 alone. This is why a comment-only edit re-keys exactly as code does. |
| AC-8 `node docs/superpowers/specs/ci/probes/2026-08-22-seam-check.mjs` | this arc's diff | **RUN, and the first version of this gate FAILED to fire.** See below. |

### AC-8: the gate that could not fail, and why

The plan first stated AC-8 as a `git diff` showing no hunk inside `matchBrace`, `closeDoubleQuoted`,
`openerEnd` or `substitutionOpenerEnd`, called that trivially failing if the seam is touched, and
left its mutant-red as a description. Running that mutant-red is what found the gate was VACUOUS.

Two independent defects, both measured:

1. **Git's `@@` hunk header names the ENCLOSING function.** Every member of this seam except the
   `matchBrace*` family is a nested arrow inside `lexShellWords`, so a header-pattern check can
   never match one. A one-character edit planted inside `closeDoubleQuoted` returned `PASS (no seam
   hunk)`.
2. **The seam list was under-scoped to a thin wrapper.** It named `matchBrace` (3 lines, a
   pass-through) and missed `matchBraceSpan` (33 lines, the actual delimiter walk) and
   `matchBraceEnd`. An edit to the implementation would have passed a gate named after its wrapper.

The replacement keys on LINE RANGES from the TypeScript parser — the suite already imports
`typescript`, so this delegates to a real parser rather than growing a second one. A hand-rolled
brace-balance walk was tried first and is recorded as the third trap: it put `substitutionOpenerEnd`
at 952 lines, because braces inside strings, regex literals and comments are not structure.

Observed, clean tree and planted mutant:

```
seam matchBraceSpan: 973-1005 (33)   matchBrace: 1009-1011 (3)   matchBraceEnd: 1025-1028 (4)
seam closeDoubleQuoted: 1102-1116 (15)  substitutionOpenerEnd: 1127-1135 (9)  openerEnd: 1139-1148 (10)
clean:  changed lines: 0 -> PASS, exit 0
mutant: FAIL: 1 changed line(s) inside the arc-bracecross seam:
          tests/cross-cutting/psqlStartupFiles/scan.ts:1010 inside matchBrace (1009-1012)
        exit 1
```

The script also exits 2 rather than passing when it locates fewer than all six seam functions: a
check that cannot find what it ranges over must not report clean. Adding it moved no finding — the
AC-5 digest still reads `8ebe8b08d43e6308aa471112d9f086d0118e6238` over 76 rows.

Run the AC-5 digest on a CLEAN tree. Then `pnpm heavy pnpm mutation:guards` for the score, and state
the score plus the unaccepted-survivor set in the round-1 diff brief's GUARD SURFACE line.

<!-- tasks: end -->

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
