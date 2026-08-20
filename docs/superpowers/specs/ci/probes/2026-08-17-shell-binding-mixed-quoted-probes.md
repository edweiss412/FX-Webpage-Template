# Probe record — mixed-quoted assignment values in `scanShellIndirection` (2026-08-17)

Draft-time probes for the `2026-08-17-shell-binding-mixed-quoted-value-design.md` spec, per the
probe-before-argue rule (`docs/agents/spec-self-review.md`, detector/heuristic bullet). Two
instruments: the scanner itself (current behavior), and bash (the oracle for what value each
spelling actually binds). This is a dated historical record; the numbers are not corrected later.

## Instrument 1 — current scanner behavior

Probe script (uncommitted, worktree-local `probe-mixed-quoted.ts`): imports `scanShellIndirection`
from `tests/cross-cutting/psqlStartupFiles/scan.ts` and prints hit counts per fixture. Run:
`pnpm exec tsx probe-mixed-quoted.ts` on `fix/shell-binding-mixed-quoted-value` at branch point
`59a9ef25a`. Output, verbatim:

```
{"label":"bare value","text":"PG=psql\n","hits":1}
{"label":"wholly single-quoted","text":"PG='psql'\n","hits":1}
{"label":"wholly double-quoted","text":"PG=\"psql\"\n","hits":1}
{"label":"whole-argument quoted","text":"export \"PG=psql\"\n","hits":1}
{"label":"exported path","text":"export PG=/usr/bin/psql\n","hits":1}
{"label":"param default unquoted","text":"PG=${PSQL:-psql}\n","hits":1}
{"label":"param default quoted","text":"PG=\"${PSQL:-psql}\"\n","hits":1}
{"label":"indexed element","text":"PG[0]=psql\n","hits":1}
{"label":"append","text":"PG+=psql\n","hits":1}
{"label":"declare with flag","text":"declare -x PG=psql\n","hits":1}
{"label":"quoted then bare","text":"PG=p'sql'\n","hits":0}
{"label":"bare then quoted","text":"PG='p'sql\n","hits":0}
{"label":"double-quoted split","text":"PG=\"ps\"ql\n","hits":0}
{"label":"quoted path prefix","text":"PG='/usr/bin/'psql\n","hits":0}
{"label":"escaped spelling","text":"PG=p\\sql\n","hits":0}
{"label":"ANSI-C quoted","text":"PG=$'psql'\n","hits":0}
{"label":"mixed inside declare","text":"declare -x PG=p'sql'\n","hits":0}
{"label":"mixed whole-arg quoted peer","text":"export 'PG=p'\\''sql'\n","hits":0}
{"label":"adjacent bare suffix","text":"PG='psql'x\n","hits":0}
{"label":"trailing backslash at EOF","text":"PG='psql'\\","hits":0}
{"label":"prose value","text":"MSG=\"psql failed\"\n","hits":0}
{"label":"notpsql","text":"PG=notpsql\n","hits":0}
{"label":"unrelated variable","text":"DSN=postgres://x\n","hits":0}
{"label":"quoted semicolon value","text":"PG='psql;x'\n","hits":0}
{"label":"discovery substitution","text":"PG=$(command -v psql)\n\"$PG\" -qAt mydb\n","hits":1}
{"label":"comment mention","text":"# PG=psql would be indirection\n","hits":0}
{"label":"here-string mixed","text":"read -r PG <<< p'sql'\n","hits":0}
{"label":"here-string baseline","text":"read -r PG <<< psql\n","hits":1}
{"label":"github env mixed","text":"echo \"PSQL=p'sql'\" >> \"$GITHUB_ENV\"\n","hits":0}
{"label":"github env baseline","text":"echo \"PSQL=psql\" >> \"$GITHUB_ENV\"\n","hits":1}
{"label":"bound command mixed","text":"CMD='psql -qAt'\" mydb\"\neval \"$CMD\"\n","hits":1}
{"label":"bound command baseline","text":"CMD='psql -qAt mydb'\neval \"$CMD\"\n","hits":1}
{"label":"bare trailing backslash EOF","hits":1}
{"label":"quoted value trailing backslash","hits":1}
{"label":"double backslash EOF","hits":1}
{"label":"bound command mixed split","hits":0}
{"label":"yaml quoted run binding","hits":0}
{"label":"yaml quoted run mixed","hits":0}
{"label":"positional mixed","hits":0}
{"label":"alias mixed name","hits":0}
{"label":"substitution prefix value","hits":0}
{"label":"locale quoted","hits":0}
{"label":"space then dangling backslash","hits":1}
{"label":"backslash-newline then EOF","hits":1}
```

The second block's fixtures (labels only above; source strings):

| label | fixture |
| --- | --- |
| bare trailing backslash EOF | `PG=psql\` (backslash is the last byte, no newline) |
| quoted value trailing backslash | `PG='psql\'` + newline |
| double backslash EOF | `PG=psql\\` (two backslashes, last byte, no newline) |
| bound command mixed split | `CMD='psq'"l -qAt mydb"` + newline + `eval "$CMD"` |
| yaml quoted run binding | `- run: "PG=psql; $PG -qAt mydb"` (scanned as `.yml`) |
| yaml quoted run mixed | `- run: "PG=p'sql'; $PG -qAt mydb"` (scanned as `.yml`) |
| positional mixed | `bash -c '$0 -qAt mydb' p'sql'` |
| alias mixed name | `alias p'sql'='psql -F'` |
| substitution prefix value | `PG=$(x)psql` |
| locale quoted | `PG=$"psql"` |
| space then dangling backslash | `PG=psql \` (space before the final backslash, no newline) |
| backslash-newline then EOF | `PG='psql'\` + newline (continuation to end of input) |

## Instrument 2 — bash oracle

Each spelling written to a file, sourced, `$PG` printed. Runner:
`printf '%s\n' "$spelling" > f.sh; bash -c ". ./f.sh; printf '%s' \"\$PG\""` (the two EOF cases
written with `printf` without the trailing newline). Output, verbatim:

```
PG=p'sql'                    -> <psql>
PG='p'sql                    -> <psql>
PG="ps"ql                    -> <psql>
PG='/usr/bin/'psql           -> </usr/bin/psql>
PG=p\sql                     -> <psql>
PG=$'psql'                   -> <psql>
declare -x PG=p'sql'         -> <psql>
export 'PG=p'sql             -> <psql>
PG='psql'x                   -> <psqlx>
PG='psql;x'                  -> <psql;x>
read -r PG <<< p'sql'        -> <psql>
PG='psql'\ EOF               -> <psql\> (backslash is last byte, no newline)
PG='psql'\ NL                -> <psql> (backslash-newline then EOF)
```

## Round-1 supplement (2026-08-17, after the spec's first adversarial round)

The round-1 review surfaced a wider lexer-fidelity class (double-quote backslash semantics,
ANSI-C escapes) and one flag-criterion consequence. Probes, same two instruments:

Scanner (current tree, same probe-script method):

```
{"label":"ANSI-C octal escape","hits":0}            PG=$'p\163ql'
{"label":"ANSI-C hex escape","hits":0}              PG=$'\x70sql'
{"label":"ANSI-C trailing newline escape","hits":0} PG=$'psql\n'
{"label":"dq backslash-newline continuation","hits":1}  PSQL="/opt/pg/\<newline>psql"
{"label":"dq literal backslash","hits":0}           PG="p\sql"
{"label":"quoted leading space","hits":0}           PG=' psql'
{"label":"site: psql --no-psqlrc<dangling backslash EOF>","sites":1,"suppresses":true}
```

Bash oracle (same runner; `g7` read back as words):

```
g1 PG=$'p\163ql'        -> <psql>
g2 PG=$'\x70sql'        -> <psql>
g3 PG=$'psql\n'         -> <psql> followed by a newline; unquoted use word-splits to <psql>
g4 PSQL="/opt/pg/\<NL>psql" -> </opt/pg/psql>
g5 PG="p\sql"           -> <p\sql>
g6 PG=' psql'           -> < psql>; unquoted use word-splits to <psql>
g7 psql --no-psqlrc\<EOF>   -> the argument is <--no-psqlrc\>
h1 PG=$'\0160sql'       -> <^N0sql> (SO control + 0sql; a fourth octal digit would make 0x70 `p`)
h2 PG=$'\x070sql'       -> <^G0sql> (BEL + 0sql; a third hex digit would make 0x70 `p`)
```

(h1/h2 added with the plan round-1 repairs: digit-boundary fixtures whose zeros preemptively
kill the decode helper's widened-quantifier mutants; scanner today reports 0 for both.)

Readings: the ANSI-C decode gaps and the double-quote backslash-newline continuation are the
same lexer-infidelity class as the dangling-EOF backslash; `PG="p\sql"` binds a literal-backslash
value (must stay unreported); the `--no-psqlrc` dangling-backslash site is certified today on an
argument bash never passes.

## Round-2 supplement (2026-08-17, after the plan's second adversarial round)

Parameter-expansion operands with INTERNAL quoting (plan round-2 finding 1). Bash oracle:
`PG=${U:-'psql'}` -> <psql>; `PG=${U:-p"sql"}` -> <psql>; `PG=${U:-$'p\163ql'}` -> <psql>;
`PG=${U:-psql}` -> <psql>. Scanner (current tree): the three quoted/escaped-operand spellings
report 0; the bare-operand spelling reports 1. The zeros persist after the repair by design
(the `${…}` word is verbatim) and are the `BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE` documented
limit, spec §6 item 7 (renumbered twice: the round-4 whitespace-directory and round-6 wrapper insertions).

## Round-6 supplement (2026-08-17, after the plan's sixth adversarial round)

Wrapper-prefixed quoted-directory value (round-6 finding; orchestrator disposition b). Bash:
`CMD="sudo /tmp/O'Reilly/psql -X mydb"` word-splits to argv `sudo`, `/tmp/O'Reilly/psql`, `-X`,
`mydb`. Scanner: 0 (current and planned — split reading requires psql at argv[0]; eval reading
reads the pathname quote as syntax). Premise: `CMD='sudo psql -X mydb'` reports 1 (eval reading,
current and planned). Declared as spec §6 item 6.

## Readings the spec relies on

1. **The filed gap reproduces, wider than filed.** Six mixed/concatenated spellings the shell
   reassembles to the psql command (or a psql path) score 0 today: the four from the ledger entry
   plus the escaped spelling `PG=p\sql` and ANSI-C `PG=$'psql'` (locale `PG=$"psql"` too). All are
   ordinary lexical spellings of one word; `lexShellWords` already normalizes every one of them for
   the site path (scan.ts header, "p\"s\"ql, p\s\q\l — ordinary lexical spellings of the command
   word").
2. **Three current hits are shell-false.** `PG=psql\` (EOF), `PG=psql\\` (EOF) and `PG='psql\'`
   all bind the value `psql\` — trailing backslash literal, basename empty — which is not the psql
   command, yet all three report today. The ratified zeros at
   `tests/cross-cutting/psqlStartupFileSuppression.test.ts` ("a trailing backslash at end of input
   is literal, so it binds nothing") pin the QUOTED-adjacent spellings only; these three are the
   same shell fact the patterns happen to get wrong in the other direction.
3. **`GITHUB_ENV` is a probed NON-instance.** GitHub's env-file parser does no shell quote
   removal: `echo "PSQL=p'sql'" >> "$GITHUB_ENV"` binds the literal `p'sql'`, not `psql`, so the
   current 0 is correct and the `githubEnvWrite` rule is outside the defect class.
4. **Two probed peers in other rule families**: the here-string (`read -r PG <<< p'sql'` binds
   `psql`, scores 0) and the multiword bound command split across segments
   (`CMD='psq'"l -qAt mydb"`, scores 0 — the single-segment `CMD='psql -qAt'" mydb"` scores 1 only
   because `psql` happens to sit wholly inside the first quoted segment).
5. **Quoted workflow `run:` scalars never reached the binding rules at all** — the plain
   `- run: "PG=psql; $PG -qAt mydb"` scores 0 today (the `"` before `PG` fails the patterns'
   boundary class). *Corrected after spec round 1:* the word route does NOT close this row — the
   scalar lexes to one assignment word whose multiword value's psql carries no flag token (the
   `-qAt` belongs to `$PG`), so the flag criterion declines it and the zero PERSISTS as a
   documented limit (spec §6 item 2). The measured zero above stands; this reading's original
   forward-looking claim was wrong.
6. **The exotic mixed spellings in non-assignment families** (`bash -c '$0 …' p'sql'` positional,
   `alias p'sql'=…`) score 0 and stay documented limits — see the spec's §6.

## 2026-08-20 supplement (draft-time probes for the quoted-value RECALL arc)

Draft-time probes for `docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md`
(ledger rows `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE` and `BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE`).
Same two instruments and the same method as instruments 1-2 above. Scanner run on
`fix/shell-lexer-quoted-value-recall` at branch point `4e074d3bc` via a worktree-local
`probe-arm.ts` importing `scanShellIndirection` and `scanSource`; `hits` is the indirection count and
`sites` the psql-site count. This is a dated historical record; the numbers are not corrected later.

### Instrument 1 — current scanner behavior

```
{"label":"A1 here-string mixed (detached)","hits":0,"sites":0}
{"label":"A2 here-string plain (detached)","hits":1,"sites":0}
{"label":"A3 here-string mixed ATTACHED","hits":0,"sites":0}
{"label":"A4 here-string plain ATTACHED","hits":1,"sites":0}
{"label":"A5 here-string single-quoted whole","hits":1,"sites":0}
{"label":"A6 here-string ANSI-C","hits":0,"sites":0}
{"label":"A7 here-string in nested body","hits":0,"sites":0}
{"label":"A8 here-string plain in nested body","hits":2,"sites":0}
{"label":"A9 here-doc (<<) not here-string","hits":0,"sites":1}
{"label":"A10 here-string notpsql","hits":0,"sites":0}
{"label":"A11 here-string prose","hits":1,"sites":0}
{"label":"B1 plain redirect to psql-named file","hits":0,"sites":0}
{"label":"B2 redirect target quoted psql","hits":0,"sites":0}
{"label":"B3 psql call with redirect","hits":0,"sites":1}
{"label":"B4 psql call redirect no -X","hits":0,"sites":1}
{"label":"B5 assignment-shaped redirect target","hits":0,"sites":0}
{"label":"C1 operand single-quoted","hits":0,"sites":0}
{"label":"C2 operand double-quoted","hits":0,"sites":0}
{"label":"C3 operand ANSI-C","hits":0,"sites":0}
{"label":"C4 operand bare (baseline)","hits":1,"sites":0}
{"label":"C5 operand := form quoted","hits":0,"sites":0}
{"label":"C6 operand :+ form quoted","hits":0,"sites":0}
{"label":"C7 operand - form quoted","hits":0,"sites":0}
{"label":"C8 nested expansion operand","hits":1,"sites":0}
{"label":"C9 nested expansion quoted inner","hits":0,"sites":0}
{"label":"D1 remove-prefix pattern operand","hits":0,"sites":0}
{"label":"D2 remove-suffix pattern operand","hits":0,"sites":0}
{"label":"D3 substitution pattern operand","hits":0,"sites":0}
{"label":"D4 length operator","hits":1,"sites":0}
{"label":"D5 bare remove-prefix (current)","hits":1,"sites":0}
{"label":"D6 error operand","hits":0,"sites":0}
{"label":"D7 indirection","hits":1,"sites":0}
{"label":"D8 array subscript","hits":1,"sites":0}
{"label":"E1 operand prose","hits":0,"sites":0}
{"label":"E2 operand notpsql","hits":0,"sites":0}
{"label":"E3 operand quoted semicolon","hits":0,"sites":0}
{"label":"E4 operand trailing backslash","hits":0,"sites":0}
{"label":"E5 whole expansion double-quoted","hits":0,"sites":0}
{"label":"E6 substitution inside operand","hits":1,"sites":0}
{"label":"F1 detached subst target","hits":1,"sites":0}
{"label":"F2 ATTACHED subst target","hits":0,"sites":0}
{"label":"F3 ATTACHED subst target psql call","hits":0,"sites":1,"tokens":[["-qAt","mydb"]],"sup":[false]}
{"label":"F4 detached subst target psql call","hits":0,"sites":1,"tokens":[["-qAt","mydb"]],"sup":[false]}
{"label":"F5 attached quoted target","hits":0,"sites":0}
{"label":"F6 attached brace target","hits":0,"sites":0}
{"label":"F7 fd-prefixed target psql","hits":0,"sites":0}
{"label":"F8 append target psql","hits":0,"sites":0}
{"label":"F9 input redirect psql","hits":0,"sites":0}
{"label":"F10 psql with input redirect","hits":0,"sites":1,"tokens":[["-X","-qAt","mydb"]],"sup":[true]}
{"label":"F11 psql no -X with attached redirect","hits":0,"sites":1,"tokens":[["-qAt","mydb"]],"sup":[false]}
{"label":"G1 heredoc body psql","hits":0,"sites":1,"tokens":[["-qAt","mydb"]],"sup":[false]}
{"label":"G2 heredoc quoted delim","hits":0,"sites":1,"tokens":[["-qAt","mydb"]],"sup":[false]}
{"label":"H1 read plain no herestring","hits":0,"sites":0}
{"label":"H2 herestring var target","hits":0,"sites":0}
{"label":"H3 herestring path","hits":1,"sites":0}
{"label":"H4 herestring mixed path","hits":0,"sites":0}
```

Fixtures for the labelled rows, in the same order they appear above where the source string is not
already evident from the label:

| label | fixture |
| --- | --- |
| A1 / A2 | `read -r PG <<< p'sql'` / `read -r PG <<< psql` |
| A3 / A4 | `read -r PG <<<p'sql'` / `read -r PG <<<psql` (no space after the operator) |
| A5 / A6 | `read -r PG <<< 'psql'` / `read -r PG <<< $'p\163ql'` |
| A7 / A8 | `X=$(read -r PG <<< p'sql')` / `X=$(read -r PG <<< psql)` |
| A9 | `read -r PG <<EOF` + newline + `psql` + newline + `EOF` |
| A11 | `read -r MSG <<< 'psql failed to connect'` |
| B1 / B2 / B5 | `cat x > psql` / `cat x > 'psql'` / `cat x > PG=psql` |
| B3 / B4 | `psql -X -qAt mydb > out.sql` / `psql -qAt mydb > out.sql` |
| C1..C3 | `PG=${U:-'psql'}` / `PG=${U:-p"sql"}` / `PG=${U:-$'p\163ql'}` |
| C5..C7 | `PG=${U:='psql'}` / `PG=${U:+'psql'}` / `PG=${U-'psql'}` |
| C8 / C9 | `PG=${U:-${V:-psql}}` / `PG=${U:-${V:-'psql'}}` |
| D1..D3 | `PG=${U#'psql'}` / `PG=${U%'psql'}` / `PG=${U/'psql'/x}` |
| D4..D8 | `PG=${#psql}` / `PG=${U#psql}` / `PG=${U:?'psql'}` / `PG=${!psql}` / `PG=${A[psql]}` |
| E1..E4 | `MSG=${M:-'psql failed to connect'}` / `PG=${U:-'notpsql'}` / `PG=${U:-'psql;x'}` / `PG=${U:-'psql\'}` |
| E5 / E6 | `PG="${U:-'psql'}"` / `PG=${U:-$(command -v psql)}` |
| F1 / F2 | `cat x > $(command -v psql)` / `cat x >$(command -v psql)` |
| F3 / F4 | `cat x >$(psql -qAt mydb)` / `cat x > $(psql -qAt mydb)` |
| F5..F9 | `cat x >'psql'` / `cat x >${DIR}/psql` / `cat x 2>psql` / `cat x >>psql` / `cat < psql` |
| F10 / F11 | `psql -X -qAt mydb < in.sql` / `psql -qAt mydb>out.sql` |
| G1 / G2 | `cat <<EOF` and `cat <<'EOF'`, body `psql -qAt mydb` |
| H1..H4 | `read -r PG` / `read -r PG <<< $PSQL` / `read -r PG <<< /usr/bin/psql` / `read -r PG <<< /usr/'bin'/psql` |

### Instrument 2 — bash oracle

Same runner as instrument 2 above (`printf '%s\n' "$spelling" > f.sh; bash -c ". ./f.sh; printf '%s' \"\$PG\""`).

```
A1 herestring mixed                    -> <psql>
A3 herestring attached                 -> <psql>
A5 herestring quoted                   -> <psql>
A6 herestring ansic                    -> <psql>
C1 operand sq                          -> <psql>
C2 operand dq                          -> <psql>
C5 operand :=                          -> <psql>
C6 operand :+ (U set)                  -> <psql>
C7 operand -                           -> <psql>
C9 nested quoted inner                 -> <psql>
D1 remove-prefix pattern               -> <psql>      (U=xpsql; PG=${U#'x'})
D1b pattern operand psql               -> <x>         (U=psqlx; PG=${U#'psql'})
D4 length                              -> <0>
D5 bare remove-prefix                  -> <x>         (U=psqlx; PG=${U#psql})
D7 indirection                         -> <>          (psql=inner; PG=${!psql})
E3 operand semicolon                   -> <psql;x>
E4 operand trailing bs                 -> <psql\>
E5 whole dq                            -> <'psql'>
```

### Readings the design relies on

1. **Both filed rows reproduce, and each is wider than filed.** Arm 1 covers the ATTACHED here-string
   spelling (A3) and a mixed-quoted PATH target (H4), neither named in the ledger row; arm 2 covers
   the `:=`, `:+` and bare-`-` operators (C5-C7) and a nested quoted operand (C9), where the row named
   only `:-`.
2. **E5 is the boundary, and it points the other way.** `PG="${U:-'psql'}"` binds the literal
   `'psql'` — inside double quotes the operand's quotes are pathname data, not syntax. The scanner's
   0 is CORRECT and must survive. The lexer's `${…}` fast path is unreachable inside double quotes, so
   the boundary is structural rather than a guard clause.
3. **Pattern, length, indirection and subscript operands are pre-existing over-reports, in the safe
   direction.** D4, D5, D7 and D8 report today and bash binds none of them to psql. They are outside
   both rows and the design pins them at their current values rather than repairing them.
4. **A11 shows the current here-string rule is coarser than the assignment family.** A prose value
   reports (1) because the pattern matches on the `psql` prefix; the dequoted value is multiword with
   no flag token, so the assignment family's predicate alone would decline it. The design keeps the
   existing pattern as a disjunct precisely so this zero-flip does not happen.
5. **Attached and detached substitution targets already disagree** (F2 = 0, F1 = 1): the attached
   consumption regex stops at `(` and the body is never collected. Declared as a documented limit with
   a re-file trigger rather than closed, since closing it is recognizer growth for a corner with zero
   corpus instances.

   **Extended by spec round 1 (2026-08-20), same arc, same day.** The reviewer probed the family this
   reading had characterised only through F1/F2 and found it both wider and worse. A target that
   CONTAINS a command substitution is wholly consumed by the attached regex, so the body is invisible
   to BOTH scanners while bash executes it. Reviewer's transcript, verbatim:

   ```text
   {"id":"dq-dollar-paren","hits":[],"sites":[]}
   {"id":"bare-backtick","hits":[],"sites":[]}
   {"id":"dq-backtick","hits":[],"sites":[]}
   {"id":"locale-dq-dollar-paren","hits":[],"sites":[]}
   {"id":"brace-default-dollar-paren","hits":[],"sites":[]}
   {"id":"baseline-attached-dollar-paren","hits":[],"sites":[{"line":1,"tokens":["-qAt","mydb"],"suppressesStartupFiles":false}]}
   {"id":"baseline-detached-dq","hits":[],"sites":[{"line":1,"tokens":["-qAt","mydb"],"suppressesStartupFiles":false}]}
   ```

   Bash oracle, with `psql` replaced by a harmless shell function that reports its arguments:

   ```text
   dq-dollar-paren: CALLED <-qAt mydb>
   bare-backtick: CALLED <-qAt mydb>
   dq-backtick: CALLED <-qAt mydb>
   locale-dq-dollar-paren: CALLED <-qAt mydb>
   brace-default-dollar-paren: CALLED <-qAt mydb>
   ```

   So the worst case is a MISSED SITE for an executing command, not a missed discovery hit, and this
   reading's original "missed report" phrasing understated it. The correction is recorded here rather
   than by rewriting the measurements above, which stand as taken. Disposition: the arc WITHDREW its
   attached-target scope, filed `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION` with this round as
   the incident, and covers detached targets only.

7. **Live-tree census, measured 2026-08-20 at the branch point:** 76 sites, 0 unprotected,
   0 indirections, 0 unreadable, 3425 files scanned. The `scan.ts` module header still says 75 in
   three places — pre-existing drift from an unrelated arc that added a psql call, not a scanner
   defect. Surfaced by spec round 1 finding 2 and confirmed independently with
   `collectPsqlUsage(process.cwd())` on this branch. **A scratch `.ts` file left in the worktree root
   is scanned like any other source file:** an uncommitted probe script containing psql spellings put
   the deciding suite RED and the mutation baseline into `BaselineNotGreenError` until it was removed.
   Worth knowing before blaming a code change for a red baseline.

8. **Scoped mutation-gate cost for `psqlStartupScan`, measured 2026-08-20:** 899s wall clock for a
   green baseline run of the seven gate cases, via a temporary single-surface shard under
   `pnpm heavy`. The batch-level "~93s per surface" figure does not hold here — this surface pairs 63
   mutants with an 897-test deciding suite that takes about 14s per execution. Budget roughly 15
   minutes per re-measure.
6. **A here-DOC body is read as command text today** (G1, G2 both produce a site). Pre-existing,
   untouched by either arm, and recorded here so a later reader does not attribute it to this arc.

### Spec round-2 addendum (2026-08-20, same arc, same day)

Spec round 2 returned four BLOCKING findings, all on one axis: input families the design's operator
partition and behavior table had failed to name. Every family below was probed on both instruments
before the repair. Scanner (`hits` = indirection count, `sites` = psql-site count):

```
{"label":"K1 op = quoted","hits":0,"sites":0}          PG=${U='psql'}
{"label":"K2 op + quoted","hits":0,"sites":0}          U=1; PG=${U+'psql'}
{"label":"K3 op = bare","hits":1,"sites":0}            PG=${U=psql}
{"label":"K4 op + bare","hits":1,"sites":0}            U=1; PG=${U+psql}
{"label":"L1 multiword bare operand","hits":0,"sites":0}    PG=${U:-psql -X}
{"label":"L2 multiword quoted head","hits":0,"sites":0}     PG=${U:-'psql' -X}
{"label":"L3 multiword quoted whole","hits":0,"sites":0}    PG=${U:-'psql -X'}
{"label":"M1 substring offset","hits":0,"sites":0}     U=xpsql; PG=${U:1}
{"label":"M2 substring off:len","hits":0,"sites":0}    U=xpsql; PG=${U:1:4}
{"label":"M3 substring negative","hits":0,"sites":0}   U=xpsql; PG=${U: -4}
{"label":"M4 case upper","hits":1,"sites":0}           U=psql; PG=${U^}
{"label":"M5 case lower all","hits":1,"sites":0}       U=PSQL; PG=${U,,}
{"label":"M6 at-operator Q","hits":1,"sites":0}        U=psql; PG=${U@Q}
{"label":"M7 at-operator U","hits":1,"sites":0}        U=psql; PG=${U@U}
{"label":"N1 cont before redir","hits":0,"sites":0}    read -r PG \<newline> <<< p'sql'
{"label":"N2 cont after redir","hits":0,"sites":0}     read -r PG <<< \<newline> p'sql'
{"label":"N3 cont plain baseline","hits":1,"sites":0}  read -r PG \<newline> <<< psql
{"label":"N4 cont after redir plain","hits":1,"sites":0}  read -r PG <<< \<newline> psql
```

Bash oracle, same runner:

```
K1 op= quoted              -> <psql>
K2 op+ quoted              -> <psql>
L1 multiword bare          -> <psql -X>
L2 multiword q-head        -> <psql -X>
L3 multiword q-whole       -> <psql -X>
M1 substring off           -> <psql>
M2 substring o:l           -> <psql>
M3 substring neg           -> <psql>
M4 case upper              -> <Psql>
M5 case lower all          -> <psql>
M6 at Q                    -> <'psql'>
M7 at U                    -> <PSQL>
N1 cont before             -> <psql>
N2 cont after              -> <psql>
```

Readings:

1. **The two operators the design promised but never measured** are K1 and K2; their BARE siblings
   K3/K4 already report through the verbatim word text, which is why nobody noticed the quoted ones
   were absent from the behavior table.
2. **A multiword operand needs its separators.** L1-L3 all bind `psql -X`, and `valueBinds` decides a
   multiword value only after finding whitespace in it, so a default reassembled by CONCATENATING the
   operand's lexed words could never reach the branch that binds them. Reassembly joins with a single
   space instead — faithful here because an assignment RHS is not word-split.
3. **Substring expansion is a silent MISS in every form** (M1-M3: bash derives `psql`, both scanners
   report nothing, before and after this arc). Case-modification and transformation go the other way:
   M4, M6 and M7 report 1 while bash binds `Psql`, `'psql'` and `PSQL` — conservative over-reports.
   M5 reports 1 and bash really does bind `psql`. The mixed directions are why the design states the
   non-value-supplying complement as a DEFAULT-DENY with the directions recorded, rather than as a
   list of operators it happens to have thought of.
4. **A continuation defeats line-based association.** N1 and N2 bind `psql` and report 0, while their
   unquoted siblings N3/N4 report 1 through the existing pattern. `spliced` joins continuations, so a
   target's PHYSICAL line is not the LOGICAL line the `read` prefix matched on; associating the two by
   physical line would have shipped the here-string arm with a false certification behind any
   continuation.

### Spec round-3 addendum (2026-08-20, same arc, same day)

Round 3 returned two BLOCKING findings. The first is the one that changed the design's MODEL rather
than its lists.

Scanner, composition family (`hits` = indirection count; all sites 0):

```
{"label":"P1 literal-before :-","hits":0}      PG=p${U:-"sql"}
{"label":"P2 literal-before -","hits":0}       PG=p${U-"sql"}
{"label":"P3 literal-before :=","hits":0}      PG=p${U:="sql"}
{"label":"P4 literal-before =","hits":0}       PG=p${U="sql"}
{"label":"P5 literal-before :+","hits":0}      PG=p${U:+"sql"}
{"label":"P6 literal-before +","hits":0}       PG=p${U+"sql"}
{"label":"P7 literal-after","hits":0}          PG=${U:-"p"}sql
{"label":"P8 nested suffix","hits":0}          PG=${U:-${V:-p}sql}
{"label":"P9 nested middle","hits":0}          PG=${U:-p${V:-s}ql}
{"label":"P10 bare literal-before","hits":0}   PG=p${U:-sql}
{"label":"P11 accepted + non-accepted mix","hits":0}   U=xy; PG=${U#x}${V:-"psql"}
```

Scanner, the double-quote boundary and the precision cases:

```
{"label":"Q1 dq whole expansion bare","hits":1}   PG="${U:-psql}"
{"label":"Q2 dq composed bare","hits":0}          PG="p${U:-sql}"
{"label":"Q3 dq composed quoted op","hits":0}     PG="p${U:-'sql'}"
{"label":"Q5 composed notpsql","hits":0}          PG=p${U:-"gcli"}
{"label":"Q6 composed prose","hits":0}            MSG=p${M:-"sql failed to connect"}
{"label":"Q7 composed semicolon","hits":0}        PG=p${U:-"sql;x"}
```

Bash oracle:

```
P1 literal-before :-         -> <psql>
P7 literal-after             -> <psql>
P8 nested suffix             -> <psql>
P9 nested middle             -> <psql>
P10 bare lit-before          -> <psql>
P11 mixed                    -> <ypsql>
Q2 dq composed bare          -> <psql>
Q3 dq composed q-op          -> <p'sql'>
Q7 composed semicolon        -> <psql;x>
```

Readings:

1. **Composition defeats any model built out of PARTS.** In P1-P10 the operand alone does not bind and
   the verbatim word does not bind, so no disjunct over "the defaults this word contains" can ever
   report them, while bash binds `psql` in all ten. P10 is the sharpest: its operand is BARE, so this
   is not a quoting gap at all — composition was broken independently of the arc's subject. The design
   answer is one substituted CANDIDATE word rather than a list of recorded defaults; composition then
   stops being a family to enumerate.
2. **The candidate model creates exactly one new over-report, and it is safe.** P11 mixes an accepted
   expansion with a non-accepted one; substituting only the accepted one yields `${U#x}psql`, which the
   predicate accepts on the bare `psql` while bash binds `ypsql`. Same direction and same reason as the
   ratified `PG=$(x)psql` reading.
3. **The double-quote boundary holds in BOTH directions, which is why it stays structural.** Q3 binds
   `p'sql'` — the operand's quotes are literal there — so the scanner's zero is CORRECT. Q2 binds
   `psql` and stays a declared miss. Reading Q2 without breaking Q3 would mean deciding per operand
   whether its quotes are syntax or data inside a double-quoted span.
4. **Precision survives the model change:** Q5 (`notpsql`), Q6 (prose) and Q7 (`psql;x`) all stay 0,
   each rejected by the predicate that already rejects the same shape as a literal value.

### Option A addendum (2026-08-20, orchestrator disposition after spec round 4)

Round 4 returned five findings. Two turned on how far arm 2 should reach and were escalated; the
orchestrator ruled **whole-value accepted expansions only**. Probes taken for that design, both
instruments, before the spec was rewritten.

Scanner (current tree — every row below is the BEFORE measurement):

```
{"label":"R1 target :- quoted","hits":0}       read -r PG <<< ${U:-'psql'}
{"label":"R2 target :- dq","hits":0}           read -r PG <<< ${U:-p"sql"}
{"label":"R3 target := quoted","hits":0}       read -r PG <<< ${U:='psql'}
{"label":"R4 target :+ quoted","hits":0}       read -r PG <<< ${U:+'psql'}
{"label":"R5 target - quoted","hits":0}        read -r PG <<< ${U-'psql'}
{"label":"R6 target = quoted","hits":0}        read -r PG <<< ${U='psql'}
{"label":"R7 target + quoted","hits":0}        read -r PG <<< ${U+'psql'}
{"label":"R8 target nested","hits":0}          read -r PG <<< ${U:-${V:-'psql'}}
{"label":"R9 target bare (today)","hits":1}    read -r PG <<< ${U:-psql}
{"label":"R10 target pattern op","hits":0}     read -r PG <<< ${U#'psql'}
{"label":"R11 target substring","hits":0}      read -r PG <<< ${U:1}
{"label":"S1 whole :- quoted","hits":0}        PG=${U:-'psql'}
{"label":"S2 whole multiword","hits":0}        PG=${U:-psql -X}
{"label":"S3 composed literal-before","hits":0}   PG=p${U:-"sql"}
{"label":"S4 mixed accepted+pattern","hits":0}    U=xy; PG=${U#x}${V:-"psql"}
{"label":"S5 nested inside complement","hits":0}  U=xpsql; PG=${U#${V:-'psql'}}
```

Bash oracle:

```
R1 target :- quoted      -> <psql>
R2 target :- dq          -> <psql>
R3 target := quoted      -> <psql>
R4 target :+ (U set)     -> <psql>
R5 target - quoted       -> <psql>
R6 target = quoted       -> <psql>
R7 target + (U set)      -> <psql>
R8 target nested         -> <psql>
S5 nested in complement  -> <xpsql>
```

Readings:

1. **The two arms compose through ONE rule, not a new mechanism.** R1-R8 are here-string targets whose
   ENTIRE text is a single accepted expansion; the same whole-value rule an assignment value gets,
   applied at a second site, closes all eight. R9 shows the bare spelling was already reported by the
   existing pattern, so the gain is exactly the quoted and nested ones. R10/R11 confirm the fence
   travels with the rule: a complement operator inside a target stays unread.
2. **S5 is the case that settles the model.** Bash binds `xpsql`, so any reading that reports it is
   WRONG, not merely eager. The round-3 substitution model reported it, because it substituted an
   accepted child inside a non-accepted parent. Whole-value-only cannot: the value is not a single
   accepted expansion, so no candidate exists. The false report is removed by construction rather than
   by a guard clause, which is the whole reason the narrower model was chosen over patching the wider
   one.
3. **The cost is composition, and it is scope this arc never owned.** S3, S4 and the P-family stay 0
   before and after. Both ledger rows name whole-value spellings; composition entered through review
   rounds rather than through either requirement.

### Spec round-5 addendum (2026-08-20) — the may-bind reading, and two record defects of this arc's own

Round 5 raised the unconditional operand read as a NEW false-report class. It is not new. The probe,
taken in the reviewer's own units (what the scanner reports today, and what bash binds), settles it:

```
{"label":"T1 BARE :- U set elsewhere","hits":1}   U=other / PG=${U:-psql}
{"label":"T2 BARE :- no U at all","hits":1}       PG=${U:-psql}
{"label":"T3 BARE :+ U unset","hits":1}           PG=${U:+psql}
{"label":"T4 BARE = U set","hits":1}              U=other / PG=${U=psql}
{"label":"T5 BARE herestring :- U set","hits":1}  U=other / read -r PG <<< ${U:-psql}
```

```
T1 bare :- U set               -> <other>
T3 bare :+ U unset             -> <>
T4 bare = U set                -> <other>
```

**The scanner reports 1 in every one of those cases today, while bash binds `other` or empty.** A
static reader cannot know a parameter's runtime state, so an accepted operand is necessarily read as a
MAY-BIND. That posture is ratified — the bare-operand hit is the baseline the ledger row itself cites
— and arm 2 extends the identical treatment from bare operands to quoted ones rather than widening it.
The spec's consequence bound has been corrected accordingly: an earlier draft said "never reports a
binding bash does not make", which condemned behavior that shipped long before this arc.

**Two defects in THIS arc's own records, found by the same round and repaired with it:**

1. **Fixture/oracle state mismatch.** The C6 scanner fixture is `PG=${U:+'psql'}` while its oracle line
   ran `U=1; …`; R4 and R7 have the same shape. The scanner's verdict does not depend on the state, so
   no measurement changes — but a reader comparing the two columns sees an oracle that binds `psql` and
   a fixture that could not. The spec's §4 rows now carry the enabling state explicitly.
2. **P5/P6 in the composition record are wrong as recorded.** With `U` unset, `PG=p${U:+"sql"}` and
   `PG=p${U+"sql"}` yield `p`, not `psql`; the oracle column was filled from the selected-state
   reading. Composition is out of scope as of the 2026-08-20 disposition, so nothing downstream depends
   on those two rows, but the record should not carry a wrong oracle value: **treat P5 and P6's oracle
   entries as requiring `U` set, and their unset readings as `p`.** The other eight composition rows
   are unaffected.
