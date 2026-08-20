# The lexer keeps what the binding predicate needs — here-string targets and expansion operands (design)

Closes two ledger rows as ONE design statement, in ONE PR (orchestrator ruling, 2026-08-19 batch-2
brief): `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE` (`BACKLOG.md`) and
`BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE` (`BACKLOG.md`). Both were filed by the same class sweep on
`fix/shell-binding-mixed-quoted-value`, both under class-sweep exception (c), and both say the same
thing about the same file: **`lexShellWords` discards information the binding predicate needs, in two
places.** Arm 1 is a redirection target the lexer drops before words exist. Arm 2 is the interior of a
`${…}` operand the lexer keeps verbatim by design.

Surface: `tests/cross-cutting/psqlStartupFiles/scan.ts`. Deciding suite:
`tests/cross-cutting/psqlStartupFileSuppression.test.ts`. Prior design (the arc that filed both rows):
`docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md`.

---

## 1. Problem

**There are zero live corpus instances of either spelling, and this spec does not manufacture one.**
The value here is RECALL on a spelling that is reachable and that bash really binds — proved by a bash
oracle, in the probe record — not the repair of a live miss. The census this guard defends has stayed
75 psql call sites / 0 unprotected through every review round of its history, and neither arm changes
that number. A reader who wants a live-miss justification will not find one, and should not: the
convergence criterion in §7 is a mutation score, not a corpus hit count.

### 1.1 Arm 1 — a here-string target never becomes a word

`READ_HERE_STRING` (`scan.ts`, symbol `READ_HERE_STRING`) reads the here-string value out of the
SPLICED LINE through a single-delimiter `["']?` + `PSQL_VALUE` shape — the same shape the assignment
family retired on 2026-08-17 in favour of lexed words. It reads the line because the lexer cannot
supply the value: a redirection target is discarded before words exist (`scan.ts`, symbol
`lexShellWords`, the `dropWord` flag and the attached-target regex in the redirection branch).

Bash binds `psql` for the mixed spelling; the scanner reports 0.

### 1.2 Arm 2 — a `${…}` operand's interior is data

The lexer consumes a `${…}` expansion whole and appends the raw slice as ONE word, deliberately: the
whole-consumption is what stops brace-protected whitespace from splitting a redirection target into a
phantom argv word. A consequence is that quoting INSIDE the operand is data to every reader
downstream, so only a BARE `psql` in the operand reports.

Bash binds `psql` for every quoted-operand sibling; the scanner reports 0 for each and 1 for the bare
one.

### 1.3 Draft-time probe evidence

Two instruments, both re-run for this spec on the branch point (`4e074d3bc`, before the
`4b5028b44` merge; neither commit touches `scan.ts`). The scanner instrument imports
`scanShellIndirection` and `scanSource` from the live module; the oracle writes each spelling to a
file, sources it under `bash`, and prints `$PG`. Full transcript is appended to the probe record at
`docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md` as the 2026-08-20
supplement; the load-bearing rows:

| id | spelling | bash binds | scanner today |
| --- | --- | --- | --- |
| A1 | `read -r PG <<< p'sql'` | `psql` | 0 |
| A3 | `read -r PG <<<p'sql'` (attached) | `psql` | 0 |
| A5 | `read -r PG <<< 'psql'` | `psql` | 1 |
| A6 | `read -r PG <<< $'p\163ql'` | `psql` | 0 |
| A7 | `X=$(read -r PG <<< p'sql')` | `psql` (in the subshell) | 0 |
| H3 | `read -r PG <<< /usr/bin/psql` | `/usr/bin/psql` | 1 |
| H4 | `read -r PG <<< /usr/'bin'/psql` | `/usr/bin/psql` | 0 |
| C1 | `PG=${U:-'psql'}` | `psql` | 0 |
| C2 | `PG=${U:-p"sql"}` | `psql` | 0 |
| C3 | `PG=${U:-$'p\163ql'}` | `psql` | 0 |
| C4 | `PG=${U:-psql}` | `psql` | 1 |
| C5 | `PG=${U:='psql'}` | `psql` | 0 |
| C6 | `U=1; PG=${U:+'psql'}` | `psql` | 0 |
| C7 | `PG=${U-'psql'}` | `psql` | 0 |
| C9 | `PG=${U:-${V:-'psql'}}` | `psql` | 0 |
| E5 | `PG="${U:-'psql'}"` | `'psql'` (quotes LITERAL) | 0 |

E5 is the row that sets arm 2's boundary and is stated here rather than buried in §3: inside double
quotes the operand's quote characters are literal pathname data, so the correct reading of
`PG="${U:-'psql'}"` is a file named `'psql'`, not the psql command. The scanner's 0 is CORRECT there
and must survive the arm.

---

## 1.1 Resolved scope — do not relitigate

Each row cites its ratification. A reviewer verifying these should verify the citation, not re-derive
the decision.

1. **Both rows ship in one PR, two arms.** Ruled by the orchestrator in the 2026-08-19 batch dispatch
   brief, which is a session artifact rather than a tracked file. Not a reviewable design choice.
2. **The `read` grammar is unchanged.** Which command words and flag shapes constitute a here-string
   read stays exactly as `READ_HERE_STRING` spells it today. Ratified in the ledger row's own "What
   would close it" clause (`BACKLOG.md`, `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE`) and restated in the
   brief. Only the VALUE reading changes.
3. **The flag criterion is unchanged.** The line between a command binding and prose — a multiword
   value must carry a flag-shaped token — is untouched in both arms (`scan.ts`, symbol `valueBinds`).
   Ratified 2026-08-17, design §6 item 2.
4. **The whole-consumption of `${…}` is preserved.** The lexer still emits ONE opaque word whose TEXT
   is the verbatim slice; arm 2 adds a decision alongside it and never rewrites it. This is the
   property that stops brace-protected whitespace from splitting argv (`scan.ts`, symbol
   `lexShellWords`, the `${` branch comment), and preserving it explicitly is a brief requirement.
5. **NARROWING is the standing repair direction.** Under same-axis recurrence the class repair is to
   decline to fire on what the lexer cannot classify and file the documented limit — never lexer
   growth to chase a constructed corner (AGENTS.md, "Repair direction under same-axis recurrence";
   measured on `feat/speclint-prose-count-parity` at 20 diff rounds and a flat finding rate).
6. **Pre-existing over-reports are out of scope in BOTH directions.** `PG=${U#psql}`, `PG=${#psql}`,
   `PG=${!psql}`, `PG=${A[psql]}` and a prose here-string (`read -r MSG <<< 'psql failed to connect'`)
   all report today and bash binds none of them to the psql command. They are conservative
   over-reports in the SAFE direction, they are not this arc's rows, and §3 pins each at its current
   value rather than fixing it. Proposing a fix for one of them is a re-scope decision for the
   orchestrator, not a review finding.
7. **The site path is unchanged BY CONSTRUCTION, not by care.** §3.1 gives `lexShellWords` an optional
   out-parameter; `scanShellText` does not pass one and therefore receives a byte-identical word array.
   A finding of the form "the retained target could be read as argv" must exhibit the call site that
   passes the array, or it is refuted by the signature.
8. **The 2026-08-17 design spec is annotated, not rewritten.** Its §6 items 1 and 7 each gain a dated
   one-line superseded-by pointer to this spec. That spec is the design record of a shipped arc; this
   spec plus the `scan.ts` documented-limits block is the LIVE record. Rewriting a shipped spec's prose
   to match a later arc is how two copies drift.
9. **`BACKLOG-archive.md`'s account of the 2026-08-17 sweep is a dated record and is not corrected.**
   It accurately records what was filed then, including the "ripple into every redirection consumer"
   cost estimate that §3.1 declines to pay. The estimate being superseded is a fact about this spec,
   not an error in that one.
10. **No new mutation operators.** The enrolled operator set for `psqlStartupScan` is
    `relational-boundary` + `regex-quantifier-bound`, ratified as a scoped subset with its own numbers
    (`tests/mutation/source/registry.ts`, the `psqlStartupScan` row's leading comment). A reviewer
    proposing a third family owes a registry change carrying before/after numbers; that is not a round
    on this diff (AGENTS.md, convergence-criterion bullet 4).

---

## 2. Current mechanism (verified against the live tree)

Anchored by file + symbol per the citation rule; line numbers are drafting-time locators only and this
arc's own tasks move them.

- `ShellWord` (`scan.ts`, symbol `ShellWord`) carries `text`, `line`, `offset`, and the per-character
  `quoted[]`, `lines[]`, `offsets[]` arrays plus `operator`.
- The redirection branch (`scan.ts`, symbol `lexShellWords`, the comment beginning "Redirections: an
  optional fd") recognises the operator, discards any pending fd buffer, then splits two ways:
  an ATTACHED target is consumed by a regex whose alternation is `${…}` / `"…"` / `'…'` / `\\.` /
  `[^\s;&|()<>]`, and a DETACHED target sets `dropWord`, which makes the next `flush()` build the word
  and then not push it. Either way no word survives, and no dequoting is ever applied to the attached
  form (the regex consumes raw source).
- The `${…}` branch (`scan.ts`, symbol `lexShellWords`, the `character === "$" && text[i + 1] === "{"`
  case) finds the closing brace with `matchBrace`, re-lexes the interior ONLY to collect nested
  command substitutions into `nested`, and appends the raw slice with `appendRun(slice, i, false)`.
  **This branch is unreachable inside double quotes**: the double-quote branch handles `$(` and
  backtick itself and appends every other character literally, which is exactly why E5's operand quotes
  are data. That structural fact is arm 2's boundary and needs no extra state to enforce.
- `READ_HERE_STRING` (`scan.ts`, symbol `READ_HERE_STRING`) is compiled once at module scope and
  consumed in `scanShellIndirection` against `spliced`, the backslash-newline-joined line.
- The assignment family reads LEXED WORDS: `assignmentBindingLines` → `compoundArrayBinds` →
  `valueBinds` (`scan.ts`, those symbols). `valueBinds` decides a single-word value by
  `isPsqlName(basename(value))` plus the separator/trailing-backslash rejections, and a multiword value
  by two readings (eval and split) that both require a flag-shaped token.
- `lexShellWords` has exactly THREE call sites outside itself: `scanShellText`, and two inside
  `scanShellIndirection` (the file's own words, and each nested body in `visitBody`). Derived cover:
  `rg -n 'lexShellWords\(' tests/cross-cutting/psqlStartupFiles/scan.ts` — rerun it rather than trusting
  this sentence.

---

## 3. Design

### 3.1 Retained redirection targets ride a SIDE CHANNEL, not the word array

`lexShellWords(text, nested, targets?)` gains a third optional out-parameter, exactly like `nested`:

```ts
type RedirectionTarget = {
  /** The redirection operator this target belongs to: `<<<`, `>`, `2>`, … as matched. */
  operator: string;
  /** The DEQUOTED target word: quote removal and escape processing already applied. */
  text: string;
  /** Physical line of the target, 0-based, in the text handed to this lexer. */
  line: number;
  /** Raw index of the target's first character in that text. */
  offset: number;
};
```

Targets are pushed into `targets` and **never into the returned word array.** `scanShellText` passes
no array, so the site path receives a byte-identical `ShellWord[]` and cannot change — the ripple the
ledger's exception-(c) filing priced ("ripple into every redirection consumer") is not paid because
there are no new consumers to ripple into. `assignmentBindingLines` and `compoundArrayBinds` likewise
see nothing new. This is resolved-scope row 7, and it is a property of the signature rather than of
careful editing at each consumer.

Two entry points, ONE dequoting mechanism:

- **Detached** (`>` + whitespace + target). The existing `dropWord` becomes `pendingTarget`: the word
  is built by the ordinary loop, and at `flush()` it is pushed to `targets` instead of `words`. The
  word therefore carries the lexer's full quote removal, ANSI-C decoding and escape handling for free.
- **Attached** (`>target`). The existing regex still bounds CONSUMPTION — where the redirection ends is
  not changing — and its captured slice is handed to `lexShellWords` recursively; the first
  non-operator word of that lex supplies `text`. Offsets are re-anchored by adding the slice's start
  index. An attached target cannot contain a newline (the regex excludes whitespace), so `line` is the
  lexer's current line.

Both paths end in one `pushTarget` helper, so the two spellings cannot drift into two readings of the
same string — the defect shape the 2026-08-17 arc retired when it deleted the per-delimiter pattern
family.

**Why the attached regex is kept rather than deleted.** Letting the main loop lex the attached target
would be less code and is tempting. It is also a probed behavior change outside this arc's rows:
`cat x >$(command -v psql)` reports 0 today and would report 1, because the regex stops at `(` where
the loop would recognise a command substitution and collect its body. The detached spelling
`cat x > $(command -v psql)` already reports 1, so the two spellings genuinely disagree — and closing
that disagreement is recognizer growth in exchange for a corner nobody has written. Under resolved-scope
row 5 it files as a documented limit (§6 item 3) with a re-file trigger, not as work.

### 3.2 The here-string family reads its value from the retained target

The existing `READ_HERE_STRING` regex is **kept and still evaluated**, and a second, word-based
disjunct is added. The rule reports if EITHER fires.

- Existing disjunct: `READ_HERE_STRING` against `spliced`, unchanged.
- New disjunct: a `read`-grammar PREFIX match on the same `spliced` line — the identical grammar with
  the value portion removed — AND a retained target on that line whose `operator` is `<<<` and whose
  dequoted `text` satisfies `valueBinds`.

Union rather than replacement, for two reasons that are both regressions if ignored:

1. **The line-text reading is the one place the word route is blind by construction.** The outer lex
   replaces a `$(…)`/backtick/process-substitution body with the opaque `${}` word, so a here-string
   INSIDE such a body has no target in the outer lex. The raw line carries the body's characters, which
   is precisely why the 2026-08-17 arc could call its nested-body sweep "one consumer rather than a
   family" (that spec's §6 closing paragraph). Replacing the regex would open that blind spot; keeping
   it means the arm cannot.
2. **`valueBinds` is stricter than the current pattern in one probed case.** `read -r MSG <<< 'psql
   failed to connect'` reports 1 today (the pattern matches the `psql` prefix); its dequoted value is
   multiword and carries no flag token, so `valueBinds` alone would decline it. That zero-flip is a
   precision gain nobody asked for and a behavior delta outside the rows — resolved-scope row 6. The
   union keeps it at 1.

Nested bodies get the same treatment the assignment route already has: `visitBody` re-lexes each body,
so it also passes a `targets` array and offsets each target's `line` back to the physical line, exactly
as it already does for `assignmentBindingLines`. This closes A7.

### 3.3 The expansion's default operand is DECIDED; the word text stays verbatim

Inside the `${…}` branch — and therefore, per §2, only outside double quotes — the lexer parses the
expansion far enough to answer one question: *does this expansion supply a default WORD, and what is
it after quote removal?*

- **Value-supplying operators only:** `${U:-word}`, `${U-word}`, `${U:=word}`, `${U=word}`,
  `${U:+word}` and `${U+word}`. For anything else the branch
  behaves exactly as today and records nothing. That is the whole of the narrowing, and it is what pins
  the pattern (`#`, `##`, `%`, `%%`, `/`, `//`), length (`${#name}`), indirection (`${!name}`),
  error (`${U:?word}`, `${U?word}`) and subscript forms at their current values, probed at 1, 1, 1, 0 and 1
  respectively for the psql-shaped spellings in §4, all unchanged.
- **The operand is dequoted by `lexShellWords` itself.** The operand slice is re-lexed, and the
  concatenated text of its words is the recorded default. Mixed quoting, ANSI-C `$'…'`, escapes and a
  NESTED `${…}` all come free, because they are the same lexer — there is no second grammar to keep in
  step, which is the defect the retired pattern family was made of. A nested expansion's own recorded
  defaults are appended transitively, which is what closes C9.
- **The result is recorded on the word, not substituted into it:**
  `ShellWord.expansionDefaults: string[]`. The word's `text` stays the verbatim slice, so every
  existing reading of that text — including the bare-operand hit at C4 and every pattern-operand
  over-report — is bit-for-bit what it is today.
- **`valueBinds(value, file, expansionDefaults = [])` gains ONE disjunct:** a recorded default that
  satisfies the same predicate binds. Same predicate, not a second one, so `${U:-'psql;x'}`,
  `${U:-'psql\'}` and `${M:-'psql failed to connect'}` decline for exactly the reasons a literal
  `psql;x`, a trailing-backslash value and a flagless multiword value decline today — all three probed
  at 0 and unchanged.

E5 needs no guard clause: the branch that records defaults is unreachable inside double quotes, so
`PG="${U:-'psql'}"` records nothing and stays 0. The boundary is structural.

### 3.4 Deleted, kept, untouched

- **Deleted:** nothing. Neither arm retires a pattern.
- **Kept, deliberately:** `READ_HERE_STRING` in full; the attached-target consumption regex; the flag
  criterion; the whole-consumption of `${…}`; the exclusion of redirection targets from argv.
- **Untouched:** `scanShellText`, `scanBinaryIndirection`, `scanWorkflowSource`,
  `scanWorkflowIndirection`, `argvSuppressesStartupFiles`, `tokenSuppressesStartupFiles`, `basename`,
  `isPsqlName`, `decodeAnsiCEscape`.

---

## 4. Behavior deltas (complete, from the probe record)

Every row is probed on both instruments. **Flips (0 → 1), twelve:**

| id | spelling | arm |
| --- | --- | --- |
| A1 | `read -r PG <<< p'sql'` | 1 |
| A3 | `read -r PG <<<p'sql'` | 1 |
| A6 | `read -r PG <<< $'p\163ql'` | 1 |
| A7 | `X=$(read -r PG <<< p'sql')` | 1 |
| H4 | `read -r PG <<< /usr/'bin'/psql` | 1 |
| C1 | `PG=${U:-'psql'}` | 2 |
| C2 | `PG=${U:-p"sql"}` | 2 |
| C3 | `PG=${U:-$'p\163ql'}` | 2 |
| C5 | `PG=${U:='psql'}` | 2 |
| C6 | `PG=${U:+'psql'}` | 2 |
| C7 | `PG=${U-'psql'}` | 2 |
| C9 | `PG=${U:-${V:-'psql'}}` | 2 |

**Unchanged, and each one is a pin the suite must carry** (probed value in parentheses): A5 (1),
A9 here-doc body (1 site — pre-existing, out of scope), A10 `notpsql` (0), A11 prose here-string (1),
H3 (1), B1/B2 a redirection target NAMED psql (0 sites), B3/B4/F10/F11 a psql call carrying a
redirection (1 site each, tokens and suppression verdict unchanged), F1/F2 the attached-versus-detached
substitution target (1 and 0 — §6 item 3), C4 (1), D1/D2/D3 pattern operands (0), D4 length (1),
D5 bare remove-prefix (1), D6 error operand (0), D7 indirection (1), D8 subscript (1), E1 operand prose
(0), E2 `notpsql` operand (0), E3 quoted semicolon operand (0), E4 trailing-backslash operand (0),
E5 double-quoted whole expansion (0), E6 substitution inside operand (1).

**Live-tree census:** unchanged at 75 sites / 0 unprotected / 0 indirections. Both arms only ADD
reports for spellings the corpus does not contain, so the walk's verdict on this repository cannot
move; the plan's verification step asserts this rather than assuming it.

---

## 5. Declared-limit pin disposition

Repairing these rows flips two committed pins from RECORDS into FALSE ASSERTIONS. A pin discovered at
implementation time is an unplanned extra task and is the exact defect
`BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` names, so every declared-limit pin in the deciding suite is
enumerated here with an explicit disposition. **Ten pins, found by hand** (`grep -n -i 'KNOWN
miss\|documented limit\|declared miss\|declared limit\|residual limit'` over the suite, then a
classification pass over all 121 zero-assertions to separate documented misses from correct-behavior
zeros).

| # | pin (suite) | disposition |
| --- | --- | --- |
| 1 | `documented limits — quote-concatenated spellings…` row "a mixed-quoted here-string" | **RETIRE and re-pin as a HIT** (arm 1). |
| 2 | same test, row "a quoted expansion operand" | **RETIRE and re-pin as a HIT** (arm 2). |
| 3 | same test, row "a mixed-quoted alias name" | Left alone — the `aliased` rule's KEYWORD grammar is untouched. |
| 4 | same test, row "a mixed-quoted interpreter positional" | Left alone — `INTERPRETER_POSITIONAL_BINDING` is untouched. |
| 5 | same test, row "a wrapper-prefixed quoted-directory value" | Left alone — both readings in `valueBinds` are untouched (ratified §6 item 6, 2026-08-17). |
| 6 | same test, row "a whitespace directory component" | Left alone — the multiword/flag branch is untouched. |
| 7 | `multiword binding value: a quoted run: scalar (the plain spelling) stays a limit` | Left alone — declined by the flag criterion, which resolved-scope row 3 fixes. |
| 8 | same test, "the mixed spelling" | Left alone — same reason; the assignment word route already dequotes it and the flag criterion still declines. |
| 9 | `a \U escape AT the Unicode maximum still decodes` (its paired zero for `\U00110000psql`) | Left alone — `decodeAnsiCEscape` is untouched; arm 2 re-lexes operands THROUGH it, so the conservative reading is inherited rather than changed. |
| 10 | `the derived roots really were derived…` / `never contains the tracked source root %s` (the §4.2 root-skip stays-quiet pin) | Left alone — different surface (gitignore root-skip derivation); neither arm touches `rootSkipNamesFromGitignore` or the walk. |

Two pins retire; eight are left alone with a reason. The two retiring rows live in ONE test over a
six-row literal array, so the edit is two rows out of that array plus two new positive assertions —
the array's remaining four rows and its premise loop stay as they are.

**Companion sweeps, same commit as the pin edits:**

- `scan.ts` documented-limits block, "Documented limits (mixed-quoted values, 2026-08-17)": the
  here-string clause comes OUT of the first bullet (the interpreter-positional and alias clauses stay),
  and the `${…}`-operand bullet is removed entirely. The first bullet's mechanism sentence ("since the
  lexer drops a redirection operand before words exist") is false after arm 1 and goes with it.
- `scan.ts`, the closing paragraph of that block, which asserts the line-text rules "were never blind"
  inside a nested body: still true, and §3.2's union is why. One clause is added naming the here-string
  family's new word-route disjunct and the `visitBody` targets pass, so a reader cannot conclude the
  claim went stale.
- The inline comment in `scanShellIndirection` that cites `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE` as
  the reason the here-string reads the spliced line.
- `docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md` §6 items 1 and 7:
  one dated superseded-by line each (resolved-scope row 8).
- **`DEFERRED.md`: no pointer to either row exists.** Verified with
  `grep -rn 'BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE\|BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE'` across
  the repository; the hits are `BACKLOG.md` (the two rows), `BACKLOG-archive.md` (the dated 2026-08-17
  record, resolved-scope row 9), `scan.ts` (three sites, above), the deciding suite (two comment
  sites), the 2026-08-17 plan and spec (dated records), and the probe record. Nothing in `DEFERRED.md`.

---

## 6. Documented limits (module-header edits, shipped with the diff)

Retiring two bullets, adding one. Each remaining limit is a MISSED REPORT, never a false certification.

1. Quote-concatenated spellings of a rule KEYWORD — a mixed-quoted `alias`/`function` NAME whose body
   binds another program, and a mixed-quoted interpreter positional. **The here-string clause is
   removed from this bullet** (arm 1).
2. A multiword assignment value whose psql command carries no flag-shaped token, including a quoted
   YAML `run:` scalar and a quoted directory component carrying IFS whitespace. Unchanged.
3. **NEW.** An ATTACHED command-substitution redirection target (`cat x >$(command -v psql)`) is not
   read as executable discovery, while the DETACHED spelling (`cat x > $(…)`) is. The attached form's
   consumption regex stops at `(`, so the substitution body is never collected. Probed both ways:
   0 and 1. Worst case is a missed report on a spelling with zero corpus instances; closing it means
   letting the main loop lex attached targets, which is recognizer growth for a constructed corner.
   **Re-file trigger:** a live corpus instance of an attached substitution redirection target, or any
   arc that needs the main loop to lex attached targets for another reason.
4. **REMOVED** (arm 2): quoting or escapes inside a `${…}` expansion operand. Superseded by §3.3 for
   the value-supplying operators; the pattern, length, indirection, error and subscript forms were
   never covered by that bullet's claim and keep their current conservative readings.
5. A WRAPPER-prefixed multiword value whose psql path needs the split reading. Unchanged.
6. `PG=$(x)psql`-shaped values over-report conservatively. Unchanged.
7. An ANSI-C `\U` escape above the Unicode maximum keeps its raw text rather than throwing. Unchanged,
   and inherited by arm 2's operand re-lex.

---

## 7. Verification contract

### 7.1 Enrolment sets the convergence criterion

The surface is ENROLLED: `tests/mutation/source/registry.ts`, id `psqlStartupScan`, sourcePath
`tests/cross-cutting/psqlStartupFiles/scan.ts`, and **`suitePaths` is exactly one file** —
`tests/cross-cutting/psqlStartupFileSuppression.test.ts`. Every assertion this arc plans lands inside
that suite or the runner cannot see it, and a green suite elsewhere buys zero score (the eight
`#831` survivors are the measured case).

**The convergence criterion in every review brief is the mutation score plus an EMPTY unaccepted-survivor
set.** Both are machine-computed. A "the guard does not pin what it claims" finding is admissible only
with the surviving mutant that demonstrates it — an operator and a site, both from the declared set.

Declared state at the branch point, read from the registry rather than asserted by this spec:
`operators: ["relational-boundary", "regex-quantifier-bound"]`, 63 mutants, 39/39 counted, 24
`equivalent` rows, NO accepted gap, `scoreFloor: 1`; the count is mirrored at
`tests/mutation/source/expectedLedgerKinds.ts` (`psqlStartupScan: { equivalent: 24 }`) and gated by
`registerSurfaceCases`.

### 7.2 The equivalence ledger must be RE-DERIVED, not inherited

`siteId` keys are `<operator>:<line>:<column>:<mutation>` — LINE-KEYED. Both arms edit `lexShellWords`
and the binding rules, so essentially every row below the lexer moves. This is a known, named cost:
`BL-MUTATION-SITEID-LINE-KEYED-CHURN`, whose own entry now records eleven keys for one expression
nobody edited.

Re-keying is the cheap half. The load-bearing half is that **an equivalence ARGUMENT may stop being
true**: several rows reason about `scanShellText`'s command assembly and about `valueBinds`, and arm 2
adds a disjunct to the latter. Every row is re-read against its new site and its reason re-verified;
none is carried over on the strength of having been true before. If the count changes,
`expectedLedgerKinds.ts` changes in the same commit.

### 7.3 Running the gate

`-t` does NOT bound the gate — `runSurface` executes at module scope during collection, so a name
filter prunes reporting only. Scoping requires a TEMPORARY shard file that filters `GUARD_SURFACES`
before `registerSurfaceCases`, run, then DELETED: `tests/mutation/_metaSourceShardIntegrity.test.ts`
pins the shard set byte-for-byte and will fail while the temp file exists. The run goes through
`pnpm heavy` (mutation runs are MUST-wrap) and in the FOREGROUND (a backgrounded run crossing a turn
boundary gets SIGTERM-killed; measured twice).

Score BEFORE closeout, never while holding a mergeable PR. Blob-hash `scan.ts` and the deciding suite
before any re-measure — the score is a pure function of (source, operators, deciding suites), and an
unchanged pair owes no re-run.

### 7.4 Consequence bound, probe domain, threat fence

Stated here so every review brief can cite them, and so a brief-versus-spec mismatch is itself a
finding:

- **Consequence bound.** Every input is handled correctly or signalled; the guard never silently
  certifies a psql invocation it has mis-read. A conservative NON-REPORT plus a declared limit is a
  DOCUMENTED LIMIT, not a finding. Both arms move only in the report direction, and §4 lists every
  probed movement.
- **PROBE DOMAIN.** The instrument set of
  `docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md` including its
  round-1, round-2, round-6 and 2026-08-20 supplements, plus the live tracked corpus
  `scanShellIndirection` walks. A probe more than one ordinary edit away from an input in that domain
  files to documented limits, not to a finding.
- **Threat fence.** Ordinary authoring mistakes by a contributor writing shell in this repository.
  Adversarial shell obfuscation is out of scope and files to documented limits.

### 7.5 Acceptance criteria

Each row names the executable step that proves it and the channel the proof arrives on. A green suite
is not by itself proof for AC-3 or AC-6; the field checklist is named.

| id | criterion | proved by |
| --- | --- | --- |
| AC-1 | The twelve §4 flips report | New positive assertions in the deciding suite, one per row, each with a premise showing its plain sibling already reports. |
| AC-2 | Every §4 "unchanged" row holds its probed value | Assertions in the deciding suite; the pre-existing ones stay, the newly named ones are added. |
| AC-3 | The site path is byte-identical in behavior | `git diff` shows no change to `scanShellText`, AND a suite case asserting a retained target is invisible to `scanSource` (`cat x > psql` → 0 sites; `psql -X -qAt mydb > out.sql` → 1 site, `suppressesStartupFiles: true`). The diff alone is not the proof — the assertion is. |
| AC-4 | Live-tree census unchanged | `collectPsqlUsage` case in the suite: 75 sites, 0 unprotected, 0 indirections. |
| AC-5 | Two pins retired, eight untouched | The §5 table, checked row by row against the suite diff; the four surviving rows of the six-row array are asserted unchanged. |
| AC-6 | Mutation score holds with an EMPTY unaccepted-survivor set | A scoped `pnpm heavy` gate run, pasted into the closeout with its mutant/killed/equivalent counts. A green unit suite does NOT prove this. |
| AC-7 | Ledger-kind count matches the re-derived ledger | `expectedLedgerKinds.ts` equals the registry's actual row count; the gate's own AC-13 case fails otherwise. |
| AC-8 | Documentation sweep complete | Every §5 companion-sweep bullet landed in the same commit as its pin edit. |
