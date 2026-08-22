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

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:4076` why=`the raw pass at scan.ts:4076 runs unconditionally, so for a QUOTE_DOUBLE scalar the YAML delimiters reach the shell lexer, the leading quote opens a double-quoted span, the $( inside it consumes the YAML closing quote, and a psql command word is recovered from a substitution body that exists only because two YAML delimiters were read as shell — the new AC-1 case requires zero sites there and the current tree returns one with nested true` ac=AC-1,AC-3,AC-4 -->

**What is red and why:** the new case for AC-1 asserts `scanWorkflowSource` returns no site for a
double-quoted `run:` scalar carrying the spec's canonical body; the current tree returns one
fabricated site, because `scan.ts:4076` scans the raw slice regardless of the scalar's YAML style.

**RED.** Add to the deciding suite a `describe("YAML scalar style")` block:

- **AC-1** — the canonical body double-quoted yields `[]` from `scanWorkflowSource`.
- **AC-3** — the same body plain still yields `[]` sites and exactly one advisory at the `run:` key's
  line; a `BLOCK_LITERAL` body still yields its site at its physical line, not at the key's.
- **AC-4** — all six rows of §3's table, asserted on `suppressesStartupFiles` and not merely on
  presence. The `"\x70sql -qAt mydb"` row is the decoded-only case and is mandatory.

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
- The double-quoted spelling of a body whose target carries a substitution opener also yields its
  advisory, and yields no fabricated one for a body that has no unlexable target.
- A benign quoted scalar (`run: "echo hello"`) yields no advisory. This is the case that keeps the
  hard-red assertion at `psqlStartupFileSuppression.test.ts:1609` from breaking correct authoring,
  and it is the AC-4 twin for this channel.

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

**Then, in the same task:** `pnpm mutation:sites`.

## Task 3 — pin the accept-set against the library

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:4076` why=`the accept-set introduced in Task 1 is an allowlist of three style names with no executable statement of what the library can emit, so a yaml upgrade that adds a sixth scalar style would silently take the not-shell-text branch for a style that IS shell text, losing sites with nothing reported — the new case requires the set of styles the installed library produces over a spelling corpus to equal the five the accept-set models, and no such assertion exists on the tree` ac=AC-9 -->

**What is red and why:** nothing on the tree states executably which scalar styles `yaml` can
produce, so the accept-set's completeness rests on a reading of the library rather than on a check.

The spec's §3.1 last row said an unmodelled style is "REPORTED by name". That branch is unreachable
with `yaml@2.9.0` and a report mechanism nothing can execute is a description, not a criterion
(`docs/agents/writing-plans.md` — a criterion nothing runs). It is replaced by an executable pin
with the same intent and a reachable failure: parse the §2.5 spelling corpus, collect the distinct
`type` values the installed library actually emits, and assert the set equals the five the
accept-set models. A library upgrade introducing a sixth fails this by name instead of silently
taking the wrong branch.

**AC-9** is that pin, and it supersedes the prose in spec §3.1's last row. The spec is amended in
the same commit rather than left contradicting the plan.

## Task 4 — score and close-out

<!-- task: red=`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238` red-state=live why=`this is a GATE command, not an authored red — it asserts the live finding set has not moved and it passes on the clean tree at base, which is the state this task must preserve; its mutant-red is constructed below rather than observed on the tree` ac=AC-5,AC-6,AC-7,AC-8 -->

**Gate commands, each with its constructed mutant-red.** A gate that cannot fail is not a gate, so
each is probed against a failing input rather than trusted:

| Gate | Passes on | Constructed failure |
| --- | --- | --- |
| AC-5 digest probe with `--expect` | the clean tree at base and at HEAD | already observed: a stray `.mts` in the worktree holding a psql fixture string injected 7 indirections and the probe exited 2. Recorded in spec §2. |
| AC-6 census | zero quoted executable scalars | add one quoted `run:` scalar to a workflow, confirm the census reports it, remove it |
| AC-7 `pnpm mutation:sites` | all registry keys resolve | observed red after every `scan.ts` edit in Tasks 1-3, before the re-key |
| AC-8 `git diff origin/main -- tests/cross-cutting/psqlStartupFiles/scan.ts` shows no hunk inside `matchBrace` / `closeDoubleQuoted` / `openerEnd` / `substitutionOpenerEnd` | this arc's diff | trivially fails if the seam is touched |

Run the AC-5 digest on a CLEAN tree. Then `pnpm heavy pnpm mutation:guards` for the score, and state
the score plus the unaccepted-survivor set in the round-1 diff brief's GUARD SURFACE line.

<!-- tasks: end -->

---

## 4a. Declared-limit pin — named, and left alone

`spec:lint` reports `DECLARED_LIMIT_PIN_UNNAMED`: this plan moves a recognizer on `psqlStartupScan`,
and the deciding suite carries a declared-limit pin at
`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6173`, whose title is
"each quote-concatenated keyword/operand spelling is a declared miss" — named here in full.

**It is left alone, and it is not merely believed to be unaffected.** That pin ranges over `.sh`
input: every row in it calls `scanShellIndirection(source, "x.sh")`. Task 2's change is gated on
`YAML_EXTENSIONS.includes(extensionOf(file))`, the same predicate that already selects the dedent
branch at `scan.ts:3416`, so a `.sh` file never reaches the new code at all. The obligation is
discharged by naming it; the verification is that the block runs green after Task 2, recorded in the
task's own closure rather than assumed here.

## 5. Fix-round regression budget

After any review-round repair to `scan.ts`: re-run `pnpm mutation:sites` (the repair moves lines
exactly as the original edit did), re-run the deciding suite, and re-run the AC-5 digest on a clean
tree. Record all three in the round closure. The repair's own incidental edits are in scope for the
re-check, not only the patched class.

## 6. Close-out

**impeccable-gate: N/A — no UI surface.**
