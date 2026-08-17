# Assignment bindings read through the lexer — mixed-quoted values (design)

**Ledger:** `BL-SHELL-BINDING-MIXED-QUOTED-VALUE` (BACKLOG.md). **Branch:**
`fix/shell-binding-mixed-quoted-value`. **Surface:**
`tests/cross-cutting/psqlStartupFiles/scan.ts`, function `scanShellIndirection`.
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md`
(referred to below as "the probe record"; every behavioral claim in this spec about current scanner
output or shell semantics is backed by a row there).

## 1. Problem

`scanShellIndirection`'s assignment-binding patterns (`ASSIGNED_VALUE_QUOTED`,
`ASSIGNED_WHOLE_QUOTED`, both built from `DECLARE_KEYWORD`/`ASSIGNED_NAME`/`PSQL_VALUE` — scan.ts,
the constants block above `scanShellIndirection`) model an assignment value as EITHER wholly quoted
or wholly bare: one optional delimiter, a delimiter-free span, the same delimiter closing. A value
the shell reads as a CONCATENATION of quoted and bare segments is one word to the shell and
unreadable to those patterns, so a binding whose reassembled value IS the psql command goes
unreported. Probe record, instrument 1: `PG=p'sql'`, `PG='p'sql`, `PG="ps"ql`,
`PG='/usr/bin/'psql`, `PG=p\sql`, `PG=$'psql'`, `PG=$"psql"`, `declare -x PG=p'sql'` and
`export 'PG=p'sql` all score 0 today; instrument 2 shows bash binds `psql` (or `/usr/bin/psql`)
for every one.

The same probes surfaced the mirror defect: three spellings that bind the value `psql\` —
`PG=psql\` at end of input, `PG=psql\\` at end of input, `PG='psql\'` — all REPORT today, though a
trailing-backslash value is never the psql command (its basename is empty; the ratified contract
test "a trailing backslash at end of input is literal, so it binds nothing" in
`tests/cross-cutting/psqlStartupFileSuppression.test.ts` states the shell fact and pins the
adjacent quoted spellings at zero).

Both defects have one cause: the binding rules re-implement a fragment of shell lexing as regexes
over raw line text, while the module already owns a faithful lexer (`lexShellWords`, scan.ts —
"the shell layer is a LEXER, not a line slicer") whose entire purpose is quote removal, escape
processing and word assembly. The repair routes the assignment family through that lexer and
deletes the regex fragment, per the ledger entry's own repair direction and the AGENTS.md
repair-direction rule (narrow the recognizer toward the existing source of truth; never grow the
regex family one spelling per round).

## 1.1 Resolved scope — do not relitigate

- **Repair direction is lexer routing, not regex widening.** Ratified in the ledger entry ("route
  through `lexShellWords`, NOT regex widening") and in the dispatch brief. A finding that proposes
  covering another spelling by extending a binding regex is out of contract.
- **The trailing-backslash zeros are a contract, in both directions.** The suite's "a trailing
  backslash at end of input is literal, so it binds nothing" block
  (`tests/cross-cutting/psqlStartupFileSuppression.test.ts`) ratifies that `PG='psql'\` and
  `export 'PG=psql'\` at end of input bind `psql\` and must stay zero, and its comment binds any
  future repair of the quoting limitation to keep them. This spec extends the same shell fact to
  the three spellings the current patterns get wrong (§4, precision rows); reverting either
  direction is relitigation.
- **`PG='psql'x` stays zero.** The ledger entry's own correction: the shell reads `psqlx`, which is
  not psql. A repair that reports it has traded a recall gap for a false positive.
- **`githubEnvWrite` is outside the defect class.** Probed non-instance (probe record, reading 3):
  GitHub's env-file parser does no quote removal, so the mixed spelling binds the literal
  `p'sql'` and the current zero is correct. Not a peer; do not propose "fixing" it.
- **The mutation-registry accepted set is maintained, not frozen.** The surface is enrolled
  (`tests/mutation/source/registry.ts`, id `psqlStartupScan`, scoreFloor 1, empty
  unaccepted-survivor set). This diff moves and deletes mutant sites, so accepted `siteId`s are
  re-derived by re-running the gate (§7); a stale line:col in an existing accepted row is
  maintenance fallout of this diff, not a review finding against the enrolment.
- **User review gates are waived.** Autonomous pipeline per the 2026-08-17 arc-I brief; spec and
  plan converge through cross-model adversarial review only.

## 2. Current mechanism (verified against the live tree)

`scanShellIndirection(source, file)` (scan.ts) walks physical lines. Per line it strips the
comment (`commentIndexPerLine`), builds two joined views — `logical` (backslash-newline joined
with a space; feeds `INTERPRETER_POSITIONAL_BINDING` and the `quotedValue` extraction) and
`spliced` (backslash-newline removed outright, the shell's own reading; feeds the assignment
patterns and `githubEnvWrite`) — and evaluates, first-match-wins per line:

1. `assigned` = `ASSIGNED_VALUE_QUOTED.exec(spliced) ?? ASSIGNED_WHOLE_QUOTED.exec(spliced) ??
   READ_HERE_STRING.exec(spliced)`
2. `boundCommand` — a wholly-quoted multiword value (`quotedValue` regex over `logical`) whose
   text lexes to a psql invocation carrying a flag-shaped token
3. `aliased`, `functionDef`, `githubEnvWrite`, `positionalBinding`

Independently, the function lexes the WHOLE source once — `lexShellWords(source, nested)` — but
only to collect nested substitution bodies for the executable-discovery walk (`visitBody`); the
returned words are discarded. The lexer already normalizes every spelling in the gap: quote
removal for `'…'`/`"…"` segments, escape processing (`p\sql`), ANSI-C/locale forms (`$'…'`,
`$"…"`), backslash-newline continuations, `$(...)`/backtick bodies replaced by the opaque word
`${}`, `${…}` expansions consumed whole and kept verbatim.

One lexer infidelity matters here: a dangling backslash at end of input (`next === undefined` in
the backslash branch of `lexShellWords`) is silently DROPPED, where bash keeps it as a literal
character (probe record, instrument 2: `PG='psql'\` at EOF binds `psql\`).

## 3. Design

### 3.1 The assignment family reads lexed words

Capture the words `scanShellIndirection` already computes (`const words = lexShellWords(source,
nested)` at the existing call) and derive assignment bindings from them. A word is a **binding
candidate** when its dequoted text matches the assignment shape

```
^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=(.*)$   (s-flag; the capture is the VALUE, V)
```

(the same name grammar `ASSIGNED_NAME` encodes today: name, optional subscript, optional `+=`).
Candidates are decided by V, keyed on structure:

- **V is empty** → not a binding.
- **V contains whitespace** (inside one lexed word, whitespace is always quoted or escaped data;
  the opaque `${}` introduces none) → the MULTIWORD branch: the word is a command-line
  binding iff `scanShellText(V, file, 0)` yields at least one psql site whose tokens include a
  flag-shaped token (`/^-{1,2}[A-Za-z0-9]/` — the existing `boundCommand` criterion, unchanged).
  This replaces the `quotedValue` regex: the value is now the lexer's dequoted concatenation, so
  `CMD='psq'"l -qAt mydb"` is read exactly as `CMD='psql -qAt mydb'` is.
- **V is a single word** (no whitespace) → the word is a name binding iff ALL of:
  1. V matches the pattern `\bpsql\b` — the existing `PSQL_VALUE` core, case-sensitive,
     unchanged;
  2. V contains none of `"`, `'`, `;`, `|`, `&` — post-dequote these are literal data characters
     the shell was told to keep (probe: `PG='psql;x'` binds `psql;x`, not psql; current zero
     preserved);
  3. V does not end with `\` — a trailing literal backslash makes the expanded word's basename
     empty (`basename`/`isPsqlName`, scan.ts), so the value is never the psql command. This is
     the ratified trailing-backslash contract applied uniformly (§1.1).

Declaration keywords need no grammar: `export`, `readonly`, `declare -x`, `local`, `typeset` and
their flags are SEPARATE words, and whole-argument quoting (`export "PG=psql"`, `export 'PG=p'sql`)
dequotes to the same candidate word. The `DECLARE_KEYWORD` alternation disappears rather than
being ported. Position stays deliberately unchecked (parity: the current patterns fire after any
`[\s;&|(]` boundary, e.g. in `echo PG=psql`; a suspicious word reports regardless of position —
conservative, and `env PG=psql cmd` is a real binding at argument position).

Command substitutions are excluded STRUCTURALLY instead of by lookahead: `$(...)`/backtick values
lex to the opaque word `${}`, which contains no `psql`, so the binding rule is silent and the
executable-discovery walk (`visitBody`) keeps reporting them — the same division of labor the
`(?!\$\(|\`)` lookahead encodes today. `${…}` expansions are kept verbatim by the lexer, so the
parameter-default forms (`PG=${PSQL:-psql}`, quoted or not) keep reporting through clause 1.

**Reporting shape parity.** Hits keep the exact current shape `{file, line, text}`: the rule
contributes at most ONE hit per physical line (first candidate wins, matching today's
one-`assigned`-per-line), `line` is the word's opening physical line (the lexer's per-word `line`,
+1), and `text` is the comment-stripped trimmed physical line the per-line loop already computes.
Implementation shape: the word pass produces a set of binding line indexes consumed by the
existing per-line loop where `assigned`/`boundCommand` sit today, so ordering against
`aliased`/`functionDef`/`githubEnvWrite`/`positionalBinding` and the one-hit-per-line contract are
untouched.

### 3.2 Lexer fidelity: dangling backslash at end of input

`lexShellWords` appends a dangling final backslash as a literal character of the in-progress word
(quoted-flagged, like any escape output) instead of dropping it: bash keeps it (probe record,
instrument 2), and the module header's contract is "read text the way the shell reads it". With
the append, `PG='psql'\` at EOF lexes to the word `PG=psql\` and clause 3 of §3.1 declines it —
the ratified contract test passes through the same shell fact it cites, rather than through a
pattern accident.

Site-path ripple, accepted and pinned: a file whose last byte is a dangling backslash glued to a
psql command word (`…\npsql\` with no trailing newline) currently lexes to the word `psql` and
reports a site; after the fix it lexes to `psql\`, whose basename is empty, and reports nothing —
which is shell truth (bash runs the command `psql\`, which is not psql; psql never executes, so
there is nothing to guard). No file in the live corpus ends in a dangling backslash (files end
with newlines; the walk gate in §7 proves the tree-level no-op). A word ending in a dangling
backslash NOT preceded by an assignment shape changes only its token spelling (`mydb` → `mydb\`
as a positional), never a certification direction, because option recognition keys on `-`-leading
tokens and dbname positionals are opaque.

### 3.3 Deleted, kept, untouched

- **Deleted:** `ASSIGNED_VALUE_QUOTED`, `ASSIGNED_WHOLE_QUOTED`, `ASSIGNED_NAME`,
  `DECLARE_KEYWORD`, the `quotedValue` regex and its `boundCommand` wrapper (replaced by §3.1's
  two branches). The `spliced` view loses its assignment consumers but stays — `githubEnvWrite`
  still reads it. `logical` stays — `INTERPRETER_POSITIONAL_BINDING` reads it.
- **Kept as-is:** `READ_HERE_STRING` (and therefore `PSQL_VALUE`), `aliased`, `functionDef`,
  `githubEnvWrite`, `INTERPRETER_POSITIONAL_BINDING`, the discovery walk, every site-path rule.
  Their mixed-quoted corners are dispositioned in §5/§6, not silently absorbed.

## 4. Behavior deltas (complete, from the probe record)

Recall closures — 0 → 1, oracle value `psql` or a psql path in every row:

| spelling | oracle |
| --- | --- |
| `PG=p'sql'` | `psql` |
| `PG='p'sql` | `psql` |
| `PG="ps"ql` | `psql` |
| `PG='/usr/bin/'psql` | `/usr/bin/psql` |
| `PG=p\sql` | `psql` |
| `PG=$'psql'` | `psql` |
| `PG=$"psql"` | `psql` |
| `declare -x PG=p'sql'` | `psql` |
| `export 'PG=p'sql` | `psql` |
| `CMD='psq'"l -qAt mydb"` + `eval "$CMD"` | `psql -qAt mydb` (multiword branch) |
| `- run: "PG=psql; $PG -qAt mydb"` (`.yml`) | `psql` (quoted `run:` scalar; the `"` before the name defeated the old boundary class — multiword branch reads it) |

Precision closures — 1 → 0, oracle value `psql\` (not a command) in every row: `PG=psql\` (EOF),
`PG=psql\\` (EOF), `PG='psql\'`. Same shell fact as the ratified contract zeros.

Site-path delta — a psql command word glued to a dangling final backslash at end of input stops
reporting as a site (§3.2). No corpus instance; pinned by test.

Everything else in the probe record's tables is PARITY: all ten baseline hits stay hits; all
contract/precision zeros (`PG='psql'x`, `PG='psql'\` EOF, `export 'PG=psql'\` EOF,
`MSG="psql failed"`, `PG=notpsql`, `PG='psql;x'`, `DSN=postgres://x`, comment mention,
`export 'PG=p'\''sql'` — binds `p'sql`) stay zero; discovery, here-string baseline, github-env
rows, bound-command baselines unchanged. One conservative widening inherited from dropping the
lookahead: `PG=$(x)psql` (0 today) reports after the repair — the value's expansion has the
suffix `psql`, the same trailing-path shape `isPsqlCommandWord` treats as psql-capable; direction
is report-not-silence, consistent with the tripwire's contract.

## 5. Class-sweep disposition (peers of the shape, each probed)

The defect shape: "a value grammar admitting one delimiter form where the shell admits a
concatenation." Swept across every rule family in `scanShellIndirection`:

- **Assignment single-word + multiword families — repaired here** (§3.1). The multiword
  bound-command family is included: same shape, same mechanism, same file, near-zero marginal
  cost once values come from the lexer.
- **`READ_HERE_STRING`** (`read -r PG <<< p'sql'` — oracle `psql`, current 0): DEFERRED with
  class-sweep exception (c). The here-string target is a redirection operand the lexer
  deliberately drops before words exist (`dropWord`/attached-target handling in `lexShellWords`),
  so routing it through the lexer requires redesigning redirection-target retention — a lexer
  surface this repair does not otherwise touch, with ripple into every redirection consumer. The
  regex-widening alternative is the forbidden direction. Files as a ledger row
  (`BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE`, probe attached) in this PR; the suite pins the
  current miss as a documented limit so the zero is declared, not silent.
- **`githubEnvWrite`**: probed NON-instance (§1.1; probe record reading 3).
- **`aliased` / `functionDef`** (`alias p'sql'=…` — current 0) and
  **`INTERPRETER_POSITIONAL_BINDING`** (`bash -c '$0 …' p'sql'` — current 0): documented limits
  (§6), not ledger rows. Both need a quote-concatenated spelling of the rule's own KEYWORD or of a
  positional — inside the threat fence these are not ordinary authoring (an ordinary author
  quote-splits a VALUE while editing a path or adding a segment; nobody spells `alias p'sql'=` by
  accident), and the ledger filing bar demands a reachable live surface or probe-backed
  plausibility, which these lack (corpus instances: zero).
- **YAML mixed `run:` scalar** (`- run: "PG=p'sql'; …"` — current 0, still 0 after): documented
  limit (§6) — the inner quotes are data at the YAML layer and shell syntax only one indirection
  deeper; the multiword branch re-lexes the value and correctly finds no flagged psql site
  (`p'sql'` dequotes to `psql` as a lone command with no flag token). Recall here needs
  YAML-aware value extraction, a different surface (`resolveRunShells` family).

## 6. Documented limits (module-header additions, shipped with the diff)

1. A quote-concatenated spelling of a rule KEYWORD or non-assignment operand — `alias p'sql'=…`,
   `function p'sql' …`, a mixed-quoted interpreter positional (`bash -c '$0 …' p'sql'`), a
   mixed-quoted here-string target (`read PG <<< p'sql'`, ledger-filed) — is not recognized by
   those rule families. Failure direction: a missed report (recall), never a false certification;
   the site path is unaffected because it already reads lexed words.
2. A binding spelled inside a quoted YAML scalar with its own inner shell quoting
   (`- run: "PG=p'sql'; …"`) is one indirection deeper than the shell layer reads.
3. `PG=$(x)psql`-shaped values (expansion-prefixed psql suffix) report as bindings — a
   conservative over-report, matching the trailing-path reading of `isPsqlCommandWord`.

## 7. Verification contract

- **Deciding suite:** `tests/cross-cutting/psqlStartupFileSuppression.test.ts` gains an
  accept-set block pinning §4 exhaustively: every recall-closure row red-then-green; every
  precision-closure row (1 → 0) and the site-path delta as behavior-change pins; every parity zero
  and parity hit from the probe record's fixture set re-asserted in the same block (most already
  exist elsewhere in the suite — the block cites rather than duplicates where a pin already
  exists). Premise discipline per `tests/_shared/premise.ts` where a zero rests on a fixture
  actually reaching the rule (the existing trailing-backslash test's premise line is the
  template).
- **Live-tree gate:** the R19 walk test (`the widened binding reading leaves the tree certified`)
  must stay green — the repair changes no verdict on the live corpus.
- **Mutation gate:** surface `psqlStartupScan` stays enrolled with `scoreFloor: 1` and an empty
  unaccepted-survivor set. After the diff, re-run the scoped gate (temporary
  `guardSurfaces.shard*.test.ts` filter per the 2026-08-16 batch mechanics, run in the foreground,
  file deleted afterward), re-derive every accepted `siteId` whose line:col moved, delete rows
  whose mutant site the diff removed (the regex constants carry `regex-quantifier-bound` sites),
  and re-justify any NEW site the word-route code introduces — each new equivalence row argued
  per-site, new kills pinned by the accept-set block. The re-run score and kind counts land in
  the PR body and the registry comment.
- **Review convergence criterion** (every adversarial brief, both stages): consequence bound —
  every input in the probe domain is read correctly or reported, never silently wrong; a
  conservative report plus this spec's documented limits is a LIMIT, not a finding. PROBE DOMAIN:
  the live corpus the guard walks (the repo's `.sh`/`.yml`/JS shell strings) plus the deciding
  suite's committed fixtures plus the probe record's fixture table; a probe more than one ordinary
  edit from that set files to §6. Threat fence: accidental authoring by an ordinary contributor;
  adversarial obfuscation is out of scope and files to documented limits. Score: the §7 mutation
  criterion — a "guard does not pin what it claims" finding is admissible only with a surviving
  mutant from the declared operator set.
