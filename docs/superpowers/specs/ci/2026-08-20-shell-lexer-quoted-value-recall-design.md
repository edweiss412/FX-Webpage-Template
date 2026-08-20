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
oracle, in the probe record — not the repair of a live miss. The census this guard defends reads
76 psql call sites / 0 unprotected / 0 indirections as of this arc's branch point (measured
2026-08-20; the number grows whenever an unrelated arc adds a psql call, and the `scan.ts` header's
three surviving `75`s are that drift, swept in §5). Neither arm changes it, and §7.5 asserts that as
an INVARIANCE between two measurements rather than as a literal, so the criterion cannot go stale
under someone else's diff. A reader who wants a live-miss justification will not find one, and should not: the
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
| K1 | `PG=${U='psql'}` | `psql` | 0 |
| K2 | `PG=${U+'psql'}` | `psql` | 0 |
| L1 | `PG=${U:-psql -X}` | `psql -X` | 0 |
| M1 | `U=xpsql; PG=${U:1}` | `psql` | 0 |
| M4 | `U=psql; PG=${U^}` | `Psql` | 1 |
| N1 | `read -r PG \` + newline + ` <<< p'sql'` | `psql` | 0 |
| N3 | `read -r PG \` + newline + ` <<< psql` | `psql` | 1 |

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
7. **The ATTACHED redirection family is WITHDRAWN SCOPE, settled at spec round 1, and does not go to
   a nearest-sounding ledger row.** Arm 1 covers DETACHED targets only. The attached family's real
   worst case — a command substitution inside an attached target hiding an executing psql from both
   scanners — is PRE-EXISTING, untouched by this diff, and recorded in this surface's own limits
   record at §6 item 3 with its probe and a re-file trigger, per the 2026-08-04 filing bar. Re-proposing
   recursive lexing of attached targets is refused in §3.1 with the reason; re-proposing it is a
   re-scope decision for the orchestrator, not a review finding.
8. **The site path is unchanged BY CONSTRUCTION, not by care.** §3.1 gives `lexShellWords` an optional
   out-parameter; `scanShellText` does not pass one and therefore receives a byte-identical word array.
   A finding of the form "the retained target could be read as argv" must exhibit the call site that
   passes the array, or it is refuted by the signature.
9. **The 2026-08-17 design spec is annotated, not rewritten.** Its §6 items 1 and 7 each gain a dated
   one-line superseded-by pointer to this spec. That spec is the design record of a shipped arc; this
   spec plus the `scan.ts` documented-limits block is the LIVE record. Rewriting a shipped spec's prose
   to match a later arc is how two copies drift.
10. **`BACKLOG-archive.md`'s account of the 2026-08-17 sweep is a dated record and is not corrected.**
   It accurately records what was filed then, including the "ripple into every redirection consumer"
   cost estimate that §3.1 declines to pay. The estimate being superseded is a fact about this spec,
   not an error in that one.
11. **No new mutation operators.** The enrolled operator set for `psqlStartupScan` is
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

**ONE entry point: the DETACHED spelling.** The existing `dropWord` becomes `pendingTarget`: the word
is built by the ordinary loop, and at `flush()` it is pushed to `targets` instead of `words`. The word
therefore carries the lexer's full quote removal, ANSI-C decoding and escape handling for free, because
it IS an ordinary lexer word that simply lands in a different array. There is no second dequoting path
and therefore nothing that can drift from the first — the defect shape the 2026-08-17 arc retired when
it deleted the per-delimiter pattern family.

**The ATTACHED spelling (`>target`) is untouched, and that is a narrowing, not an omission.** Spec
round 1 established the reason with a probe, and it is stronger than the F1/F2 inconsistency this spec
originally cited. The attached-target regex wholly consumes its match, so an attached target that
CONTAINS A COMMAND SUBSTITUTION hides an executing command from both scanners: `cat x >"$(psql -qAt
mydb)"`, the bare-backtick and double-quoted-backtick spellings, the locale-quoted `$"…"` form, and a
substitution inside an attached `${…}` target all report zero sites AND zero indirection hits today,
while bash executes the body (round-1 probe, reproduced in the probe record's 2026-08-20 supplement
reading 5). The first draft of this spec proposed handing the attached slice to `lexShellWords`
recursively. That is refused: exposing those nested bodies to `scanShellText` is exactly what would
make the site path non-identical, and NOT exposing them leaves the miss in place while adding
machinery. Under the standing repair direction (§1.1 row 5) the class repair is to decline the whole
attached family, keep its consumption byte-for-byte as it is, and record the limit accurately (§6
item 3) — never to grow the lexer toward a corner with zero corpus instances.

The cost is one probed spelling: `read -r PG <<<p'sql'` (attached here-string, probe A3) stays at 0
and joins §6 item 3. `read -r PG <<< p'sql'` — the spelling the ledger row actually names — is
detached and is closed.

### 3.2 The here-string family reads its value from the retained target

The existing `READ_HERE_STRING` regex is **kept and still evaluated**, and a second, word-based
disjunct is added. The rule reports if EITHER fires.

- Existing disjunct: `READ_HERE_STRING` against `spliced`, unchanged.
- New disjunct: a `read`-grammar PREFIX match on a `spliced` line — the identical grammar with the
  value portion removed — AND a retained `<<<` target belonging to THAT LOGICAL LINE whose dequoted
  `text` satisfies `valueBinds`.

**The association is by LOGICAL line, and getting that wrong was spec round 2 finding 1.** `spliced` is
built by joining backslash-newline continuations, so the logical line at index `i` covers physical
lines `i..k`; a `RedirectionTarget.line` is the PHYSICAL line its target starts on. Requiring the
target to sit on line `i` therefore fails for both ordinary continuation positions — a continuation
before the `<<<` and one between `<<<` and its target — and the probe confirms it: `read -r PG \`
+ newline + ` <<< p'sql'` and `read -r PG <<< \` + newline + ` p'sql'` both bind `psql` in bash and
both report 0 today, while their unquoted siblings report 1 through the old pattern. Left unfixed the
arm would announce the here-string closed and leave a FALSE CERTIFICATION behind a continuation. The
rule is therefore: a target belongs to logical line `i` when its physical line falls in the span
`i..k` that `scanShellIndirection` already computes while building `spliced`. No new grammar, no line
arithmetic invented for this arm — the span is the loop's own.

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

- **An ACCEPT-SET of exactly six operators, and DEFAULT-DENY for the whole complement.** The accepted
  set is `${U:-word}`, `${U-word}`, `${U:=word}`, `${U=word}`, `${U:+word}` and `${U+word}`.
  **Every other `${…}` interior — whatever its operator, whether or not this spec names it, whether or
  not bash has it today — records nothing and keeps its current reading, by default rather than by
  enumeration.** This is stated as a default-deny on purpose, and it is spec round 2's structural
  repair: rounds 1 and 2 both spent findings on operators a list had failed to mention (round 2 found
  substring expansion missing from a partition that claimed to be exhaustive), and a list over a
  grammar can always be extended by one more round. A six-member accept-set plus a complement default
  cannot. Consequences that follow from the default rather than from a promise: the pattern
  (`#`, `##`, `%`, `%%`, `/`, `//`), length (`${#name}`), indirection (`${!name}`), error
  (`${U:?word}`, `${U?word}`), subscript, SUBSTRING (`${U:1}`, `${U:1:4}`, `${U: -4}`),
  case-modification (`^`, `^^`, `,`, `,,`) and transformation (`${U@Q}` and its siblings) forms all
  keep exactly today's behavior. §4 records what each of them measures today; §6 item 4 records the
  complement as ONE limit rather than a list.
- **ONE substituted CANDIDATE word, not a list of recorded defaults.** The lexer produces
  `ShellWord.expandedCandidate: string | null` — the word's text with every ACCEPTED expansion
  replaced by its dequoted operand, recursively, and `null` when the word contains no accepted
  expansion. `valueBinds` runs its EXISTING predicate on the candidate as well as on the verbatim
  text; there is no new predicate and no new disjunct grammar.

  **This replaces the recorded-defaults model the first two drafts carried, and the replacement is
  smaller than what it replaces.** Spec round 3 finding 1 showed why an array of operands cannot
  work: a value ASSEMBLED from an accepted expansion and adjacent text — `PG=p${U:-"sql"}` and its
  literal-after, nested-suffix and nested-middle siblings — has an operand (`sql`) that does not bind
  and a verbatim text that does not bind, so no disjunct over the parts can ever see the whole. All
  nine probed spellings bind `psql` in bash and report 0. Composition is not a family to enumerate
  alongside the others; it is what a word IS, and the model has to answer "what could this word
  expand to?" rather than "what defaults does it contain?". One candidate string answers it, and
  three consequences fall out instead of being specified:
  - Composition in every position works, including nested (`${U:-${V:-p}sql}`) — the substitution is
    recursive because the lexer already recurses.
  - The separator problem round 2 finding 3 raised disappears: the operand's DEQUOTED TEXT is
    substituted, so `${U:-psql -X}` yields the candidate `psql -X` with its whitespace intact and
    `valueBinds` reaches its multiword branch on the ordinary path. Nothing is joined and nothing is
    normalized, so the arm no longer has a lossy step.
  - Default-deny is preserved exactly: a non-accepted expansion is not substituted, so a word
    containing only non-accepted expansions has a candidate equal to its own text and cannot change
    verdict.
- **The verbatim `text` is still tested, unchanged.** Every existing reading — the bare-operand hit at
  C4, every pattern-operand over-report — is bit-for-bit what it is today, because the candidate is
  an ADDITIONAL string to test, never a replacement for the one already tested.
- **The predicate is not weakened, so precision holds where it held.** `${U:-'psql;x'}` yields the
  candidate `psql;x` and is rejected on the separator; `${U:-'psql\'}` is rejected on the trailing
  backslash; `${M:-'psql failed to connect'}` reaches the multiword branch and is declined for
  carrying no flag. All three probed at 0 and unchanged, as is `PG=p${U:-"sql;x"}` (bash binds
  `psql;x`).
- **One conservative OVER-report is created, and it is declared rather than discovered.** A word that
  mixes an accepted expansion with a NON-accepted one — `U=xy; PG=${U#x}${V:-"psql"}` — yields the
  candidate `${U#x}psql`, which the predicate accepts on its bare `psql` while bash binds `ypsql`.
  The direction is safe and it is the same conservative reading the ratified `PG=$(x)psql` case
  already has (§6 item 6), so it is consistent rather than novel. Probed: 0 today, 1 after.

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

Every row is probed on both instruments, and the set is complete over the PROBE DOMAIN's instrument
set — not over the open input space, which no document can enumerate. **Flips (0 → 1), twenty-nine:**

| id | spelling | arm |
| --- | --- | --- |
| A1 | `read -r PG <<< p'sql'` | 1 |
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
| K1 | `PG=${U='psql'}` | 2 |
| K2 | `PG=${U+'psql'}` | 2 |
| L1 | `PG=${U:-psql -X}` | 2 |
| L2 | `PG=${U:-'psql' -X}` | 2 |
| L3 | `PG=${U:-'psql -X'}` | 2 |
| N1 | `read -r PG \` + newline + ` <<< p'sql'` | 1 |
| N2 | `read -r PG <<< \` + newline + ` p'sql'` | 1 |
| P1 | `PG=p${U:-"sql"}` | 2 |
| P2 | `PG=p${U-"sql"}` | 2 |
| P3 | `PG=p${U:="sql"}` | 2 |
| P4 | `PG=p${U="sql"}` | 2 |
| P5 | `PG=p${U:+"sql"}` | 2 |
| P6 | `PG=p${U+"sql"}` | 2 |
| P7 | `PG=${U:-"p"}sql` | 2 |
| P8 | `PG=${U:-${V:-p}sql}` | 2 |
| P9 | `PG=${U:-p${V:-s}ql}` | 2 |
| P10 | `PG=p${U:-sql}` (bare operand, composed) | 2 |
| Q4 | `U=xy; PG=${U#x}${V:-"psql"}` — CONSERVATIVE OVER-REPORT, bash binds `ypsql` (§3.3) | 2 |

**Unchanged, and each one is a pin the suite must carry** (probed value in parentheses): A5 (1),
A9 here-doc body (1 site — pre-existing, out of scope), A10 `notpsql` (0), A11 prose here-string (1),
H3 (1), A3 the ATTACHED here-string (0 — withdrawn scope, §6 item 3), B1/B2 a redirection target NAMED
psql (0 sites), B3/B4/F10/F11 a psql call carrying a redirection (1 site each, tokens and suppression
verdict unchanged), F1/F2 the attached-versus-detached substitution target (1 and 0 — §6 item 3),
C4 (1), D1/D2/D3 pattern operands (0), D4 length (1),
D5 bare remove-prefix (1), D6 error operand (0), D7 indirection (1), D8 subscript (1), E1 operand prose
(0), E2 `notpsql` operand (0), E3 quoted semicolon operand (0), E4 trailing-backslash operand (0),
E5 double-quoted whole expansion (0), E6 substitution inside operand (1), K3/K4 the BARE `=` and `+`
operands (1 each — they already report through the verbatim text), M1/M2/M3 substring expansion
(0 each — bash derives `psql` from all three and the scanner is silent before and after; §6 item 4),
M4 `${U^}` (1, and bash binds `Psql` — a pre-existing over-report), M5 `${U,,}` (1, bash binds `psql`
— a correct report), M6 `${U@Q}` (1, bash binds `'psql'` — over-report), M7 `${U@U}` (1, bash binds
`PSQL` — over-report), N3/N4 the PLAIN continuation here-strings (1 each, already closed by the
existing pattern), Q2 `PG="p${U:-sql}"` (0 — bash binds `psql`, but the `${…}` branch is unreachable
inside double quotes, so this stays a declared MISS; §6 item 8), Q3 `PG="p${U:-'sql'}"` (0 — and here
the zero is CORRECT, bash binds `p'sql'`, the same boundary working in the other direction),
Q5 composed `notpsql` (0), Q6 composed prose (0), Q7 `PG=p${U:-"sql;x"}` (0 — candidate `psql;x`
rejected on the separator).

**Live-tree census:** UNCHANGED by this diff. Measured 76 sites / 0 unprotected / 0 indirections at
the branch point on 2026-08-20; both arms only ADD reports for spellings the corpus does not contain,
so the walk's verdict on this repository cannot move. AC-4 asserts the INVARIANCE (same tree, before
and after, equal) rather than the literal, because the literal belongs to whoever last added a psql
call and this spec must not own their number.

---

## 5. Declared-limit pin disposition

Repairing these rows flips two committed pins from RECORDS into FALSE ASSERTIONS. A pin discovered at
implementation time is an unplanned extra task and is the exact defect
`BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` names, so every declared-limit pin in the deciding suite is
listed here with an explicit disposition.

**The inventory is produced by a stated PROCEDURE, and the table is its output as of 2026-08-20** —
not a list somebody remembered. Spec round 3 found the first version short by one, and the miss is
instructive: the procedure was "grep the limit phrases, then classify the zero-assertions", and the
pin it missed asserts no zero at all. A template literal whose `\u{…}` sits at the Unicode maximum
still produces a SITE; what degrades is the LINE. So the procedure is now: (1) grep the suite for
`KNOWN miss`, `documented limit`, `declared miss`, `declared limit`, `residual limit`; (2) classify
every zero-assertion in the file; (3) **also** classify every assertion whose expected value encodes a
DEGRADED-BUT-PRESENT result — a fallback line, a dropped token, a demoted verdict — because a
documented limit does not have to be a zero. The plan re-runs all three steps against the tree it is
about to edit and disposes of whatever they return, which is the same derivation
`BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` proposes to mechanize.

**Eleven pins as of 2026-08-20.**

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
| 11 | `a template literal's \u{...} AT the Unicode maximum still maps its lines` | Left alone — `mapRawToLines` and the template path are untouched. Listed because round 3 showed it is a DISTINCT limit from pin 9 and a differently shaped one: the site is still reported and only its LINE degrades to the literal's opening line, so it is a conservative REPORT, not a missed one. It asserts a line, not a zero, which is why the first procedure could not see it. |

Two pins retire; nine are left alone with a reason. The two retiring rows live in ONE test over a
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
- **`scan.ts`'s three stale `75`s** (the module header's census sentences) go to the measured 76, or
  to a form that does not carry a literal at all. They are pre-existing drift from an unrelated arc
  that added a psql call, found by spec round 1's census probe; the block is one this diff already
  edits, so leaving them is knowingly shipping a false number in a file under the cursor.
- **A new ledger row, `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION`**, filed with the round-1
  probe as its evidence and this arc's spec round 1 as its incident, recording the withdrawn attached
  family (§1.1 row 7, §6 item 3).
- **`DEFERRED.md`: no pointer to either row exists.** Verified with
  `grep -rn 'BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE\|BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE'` across
  the repository; the hits are `BACKLOG.md` (the two rows), `BACKLOG-archive.md` (the dated 2026-08-17
  record, resolved-scope row 9), `scan.ts` (three sites, above), the deciding suite (two comment
  sites), the 2026-08-17 plan and spec (dated records), and the probe record. Nothing in `DEFERRED.md`.

---

## 6. Documented limits (module-header edits, shipped with the diff)

Two bullets retire, two are added. **Most limits below are MISSED REPORTS; several are not, and saying
so plainly is the point of this sentence.** Item 3 is a missed SITE, items 4 and 7 include conservative
OVER-reports, and the template-literal line-map limit (§5 pin 11) is a report whose LINE degrades
rather than one that is absent. No limit in this list is a false certification.

1. Quote-concatenated spellings of a rule KEYWORD — a mixed-quoted `alias`/`function` NAME whose body
   binds another program, and a mixed-quoted interpreter positional. **The here-string clause is
   removed from this bullet** (arm 1).
2. A multiword assignment value whose psql command carries no flag-shaped token, including a quoted
   YAML `run:` scalar and a quoted directory component carrying IFS whitespace. Unchanged.
3. **NEW, and it is the sharpest limit in this list.** The ATTACHED redirection target family is not
   read at all. The attached-target regex wholly consumes its match, so a target that CONTAINS A
   COMMAND SUBSTITUTION hides an executing command from BOTH scanners — zero sites and zero
   indirection hits — while bash runs it. The complete family, each spelling probed at 0/0 with the
   bash oracle confirming the call really happens (spec round 1; probe record 2026-08-20 supplement
   reading 5): a bare backtick target; `$(…)` or a backtick inside an attached DOUBLE-QUOTED target;
   a locale-quoted `$"…"` target; and a command substitution inside an attached `${…}` target. The
   plain attached here-string (`read -r PG <<<p'sql'`) is the same family's benign end and is also
   missed.
   **This is a MISSED SITE for an executing psql, not merely a missed discovery hit**, and the earlier
   draft of this spec described it as the latter. It is PRE-EXISTING — every probe above reports the
   same zeros before this diff — and this arc does not make it worse, but it must not be understated
   here.
   Why it is not closed in this arc: the only readings that would close it either expose the nested
   bodies to `scanShellText`, which breaks the by-construction identity arm 1 rests on, or add
   recursive lexing that still does not report. Both are recognizer growth toward a corner with zero
   corpus instances, against the standing repair direction. Filed as a ledger row with this round as
   its incident (`BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION`).
   **Re-file trigger:** a live corpus instance of any spelling above, or any arc that needs attached
   targets lexed for another reason.
4. **REPLACED** (arm 2), and deliberately stated as a COMPLEMENT rather than a list. Quoting or
   escapes inside a `${…}` operand are read for the six value-supplying operators in §3.3's
   accept-set. **For every other `${…}` interior the operand is not read at all** — pattern, length,
   indirection, error, subscript, substring, case-modification, transformation, and any operator bash
   adds after this is written. Each keeps exactly today's behavior, which §4 records per family. The
   failure direction across the complement is mixed and is stated rather than glossed: substring
   expansion is a silent MISS (`U=xpsql; PG=${U:1}` binds `psql`, scanner 0 before and after), while
   `${U^}`, `${U@Q}` and `${U@U}` are conservative OVER-reports (they report 1 while bash binds
   `Psql`, `'psql'` and `PSQL`). Neither direction is changed by this arc.
   This entry is written as a complement because spec rounds 1 and 2 each spent a finding on an
   operator a list had failed to name, and a list over a grammar admits one more round indefinitely.
   **Re-file trigger:** a live corpus instance of a psql binding through any non-value-supplying
   expansion operator.
5. A WRAPPER-prefixed multiword value whose psql path needs the split reading. Unchanged.
6. `PG=$(x)psql`-shaped values over-report conservatively. Unchanged.
7. An ANSI-C `\U` escape above the Unicode maximum keeps its raw text rather than throwing. Unchanged,
   and inherited by arm 2's operand re-lex. Its TEMPLATE-LITERAL sibling is a DIFFERENT limit and is
   listed separately at §5 pin 11: there the site is still reported and only its LINE degrades to the
   literal's opening line, so it is a conservative REPORT rather than a missed one.
8. **NEW.** A value COMPOSED inside double quotes (`PG="p${U:-sql}"`) is not read: the `${…}` branch
   that produces the candidate is unreachable inside double quotes, and that unreachability is exactly
   what makes `PG="p${U:-'sql'}"` correct (bash binds `p'sql'` there, and the scanner's zero is right).
   The bare-operand case inside double quotes is therefore a declared MISS — bash binds `psql`,
   scanner 0 before and after. Reading it would mean deciding per-operand whether its quotes are
   syntax or data inside a double-quoted span, which is the boundary §3.3 keeps structural.
   **Re-file trigger:** a live corpus instance of a composed double-quoted expansion value.

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

**Measured cost, 2026-08-20, on this branch: 899s for a green baseline run of the seven gate cases**
(temporary single-surface shard, `pnpm heavy`, foreground). The batch-level "~93s per surface" figure
does not apply to this surface: 63 mutants against an 897-test deciding suite that takes about 14s per
execution. Budget ~15 minutes per re-measure and plan the number of re-measures accordingly — this is
why §7.2's blob-hash rule earns its place rather than being a nicety.

### 7.4 Consequence bound, probe domain, threat fence

Stated here so every review brief can cite them, and so a brief-versus-spec mismatch is itself a
finding:

- **Consequence bound.** Every input is handled correct or signaled, never silently wrong: the guard
  never silently certifies a psql invocation it has mis-read, and never attributes a report to the
  wrong line or file. A conservative NON-REPORT plus a declared limit is a DOCUMENTED LIMIT, not a
  finding. Both arms move only in the report direction, and §4 lists every probed movement.
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
| AC-1 | The twenty-nine §4 flips report | New positive assertions in the deciding suite, one per row, each with a premise showing its plain sibling already reports. |
| AC-2 | Every §4 "unchanged" row holds its probed value | Assertions in the deciding suite; the pre-existing ones stay, the newly named ones are added. |
| AC-3 | The site path is byte-identical in behavior | `git diff` shows no change to `scanShellText` and none to the attached-target regex, AND a suite case asserting a retained target is invisible to `scanSource` (`cat x > psql` → 0 sites; `psql -X -qAt mydb > out.sql` → 1 site, `suppressesStartupFiles: true`). The diff alone is not the proof — the assertion is. |
| AC-4 | Live-tree census unchanged BY THIS DIFF | Two `collectPsqlUsage` measurements on the same tree, at `origin/main` and at HEAD, asserted EQUAL on sites / unprotected / indirections. No literal is asserted: the count is 76 / 0 / 0 on 2026-08-20 and belongs to whoever last added a psql call, so a literal would fail under an unrelated arc's diff. |
| AC-5 | Two pins retired, nine untouched, and the PROCEDURE re-run | The §5 table, checked row by row against the suite diff, AND a fresh run of §5's three-step procedure against the tree being edited — the table is that procedure's 2026-08-20 output, not a substitute for running it. The four surviving rows of the six-row array are asserted unchanged. |
| AC-6 | Mutation score holds with an EMPTY unaccepted-survivor set | A scoped `pnpm heavy` gate run, pasted into the closeout with its mutant/killed/equivalent counts. A green unit suite does NOT prove this. |
| AC-7 | Ledger-kind count matches the re-derived ledger | `expectedLedgerKinds.ts` equals the registry's actual row count; the gate's own AC-13 case fails otherwise. |
| AC-8 | Documentation sweep complete | Every §5 companion-sweep bullet landed in the same commit as its pin edit. |
