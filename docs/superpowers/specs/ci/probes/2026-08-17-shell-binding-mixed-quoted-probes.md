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
```

Readings: the ANSI-C decode gaps and the double-quote backslash-newline continuation are the
same lexer-infidelity class as the dangling-EOF backslash; `PG="p\sql"` binds a literal-backslash
value (must stay unreported); the `--no-psqlrc` dangling-backslash site is certified today on an
argument bash never passes.

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
   boundary class), an adjacent recall gap the word route closes structurally.
6. **The exotic mixed spellings in non-assignment families** (`bash -c '$0 …' p'sql'` positional,
   `alias p'sql'=…`) score 0 and stay documented limits — see the spec's §6.
