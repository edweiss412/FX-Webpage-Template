# Probe record — ATTACHED redirection target substitution

Evidence for `docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md`
(ledger `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION`).

**Every block below is the PASTED OUTPUT of a committed probe, re-runnable from any checkout:**

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/<probe>.mts
```

Measured at `e5d1d723d`. Six probes, all re-run after the round-3 repairs: `slice-shape`, `probe-attached`, `oracle`, `corpus-family3`,
`baseline-corpus`, `digest-sensitivity`.

> **Sandbox note.** A reviewer running under a read-only sandbox could not create the IPC socket
> `pnpm exec` needs, and ran them as `node --import tsx <probe>.mts` instead. Same results.

---

## 1. `slice-shape.mts` — what the attached regex consumes

**Pinned to the BASE revision `e5d1d723d`, and it prints which one it read.** The design DELETES the
pattern this probe measures, so this section is a RECORD of the pre-repair matcher rather than a
description of current behaviour. Reading the working tree would abort — that is the repair having
landed, not a broken probe — and a record updated to stay current stops being evidence.

Reads the attached-target pattern OUT OF the shipped source rather than retyping it.

```
shipped pattern: /^(?:\$\{[^}]*\}|"[^"]*"|'[^']*'|\\.|[^\s;&|()<>])+/ 
A bare backtick
  CONSUMED : "`psql"
  remainder: " -c 'select 1'`"
  whole?   : NO — partial
B $() in double-quoted
  CONSUMED : "\"$(psql -c 'select 1')\""
  remainder: ""
  whole?   : YES — target eaten whole
C backtick in double-quoted
  CONSUMED : "\"`psql -c 'select 1'`\""
  remainder: ""
  whole?   : YES — target eaten whole
D locale-quoted
  CONSUMED : "$\"$(psql -c 'select 1')\""
  remainder: ""
  whole?   : YES — target eaten whole
E ${} default operand
  CONSUMED : "${OUT:-$(psql -c 'select 1')}"
  remainder: ""
  whole?   : YES — target eaten whole
F attached here-string
  CONSUMED : "p'sql'"
  remainder: ""
  whole?   : YES — target eaten whole
-- control: plain path
  CONSUMED : "/dev/null"
  remainder: ""
  whole?   : YES — target eaten whole
-- control: $() no spaces
  CONSUMED : "$"
  remainder: "(psql)"
  whole?   : NO — partial
```

**Design-shaping result.** The pattern is not a target recognizer; it is a character-run muncher.
For the two substitution-OPENING forms it stops MID-CONSTRUCT and hands a fragment to the outer
loop. A repair that merely re-lexes `attached[0]` inherits both fragments — which is why §3 of the
spec delimits by construct instead.

## 2. `probe-attached.mts` — the acceptance set, with per-case predicates

Baseline mode. Each SUBJECT declares the post-change expectation it must come to satisfy; the probe
asserts none holds today, and under `--expect-report` that all hold after. It ABORTS exit 2 if any
positive control goes silent, because a control that does not fire makes every subject result
unattributable.

```
HOLDS    sites=1 indirection=0  CONTROL detached backtick target
HOLDS    sites=1 indirection=0  CONTROL detached dollar-paren target
HOLDS    sites=1 indirection=0  CONTROL plain call
HOLDS    sites=0 indirection=1  CONTROL detached here-string binding
not yet  sites=0 indirection=0  A bare backtick ATTACHED target
not yet  sites=0 indirection=0  B dollar-paren inside ATTACHED double-quoted target
not yet  sites=0 indirection=0  C backtick inside ATTACHED double-quoted target
not yet  sites=0 indirection=0  D locale-quoted ATTACHED target with substitution
not yet  sites=0 indirection=0  E substitution inside ATTACHED brace target
not yet  sites=0 indirection=0  F plain ATTACHED here-string binding
not yet  sites=0 indirection=0  G brace inside an ATTACHED double-quoted target (composition of B and E)
not yet  sites=0 indirection=0  H escaped backtick in an ATTACHED double-quoted target (silent)
not yet  sites=0 indirection=0  J backslash continuation inside an ATTACHED double-quoted target (multiline)
not yet  sites=0 indirection=0  K file-descriptor-prefixed operator before an ATTACHED substitution
not yet  sites=1 indirection=0  I mid-construct stop mis-attributes a backtick body (attribution)

population: 15 cases — 4 controls, 11 subjects
controls reporting: 4/4
subjects whose expectation HOLDS: 0/11

BASELINE: no subject expectation holds yet, with 4/4 controls reporting.
```

**`--expect-report` on the unrepaired tree exits 1 and names all eleven subjects**, which is what
makes it usable as AC-1's proof rather than a printer.

## 3. `oracle.mts` — the silence is about commands that really run

```
CONTROL-detached-backtick      executions=1
A-bare-backtick-attached       executions=1
B-dollarparen-in-dq            executions=1
C-backtick-in-dq               executions=1
D-locale-quoted                executions=1
E-brace-default-operand        executions=1
F-attached-here-string         executions=1
G-brace-in-double-quote        executions=1
H-escaped-backtick             executions=1
I-midconstruct-attribution     executions=1
J-multiline-continuation-in-dq executions=1
K-fd-prefixed-operator         executions=1

12/12 snippets executed the command
```

## `region-underapprox.mts` — the census region reader, attacked

Eighteen adversarial cases against the quote-aware region reader `corpus-family3.mts` uses, five of
them multiline. It exists because round 3 found that reader blind to backslash continuations while
every control was single-line, and the first draft of this probe was single-line too — the same
blind axis, in the instrument written to defend against it.

It was ALSO a reporter until the void-branch sweep below: it counted disagreements and exited 0.
Blinding the reader in a mirror copy produced `5/18 correct` and a clean exit status. It now exits 1
naming the count. **It was cited nowhere in this record until now**, which is the other half of the
same defect: a committed probe nobody references and that cannot fail is a file, not evidence.

## Every VOID branch, executed

A probe that cannot fail proves nothing, and each of these carries a branch that voids its own
result. Those branches were prose until they were run. Technique: copy the probe into a
depth-matching mirror (six directories under a root whose `tests/` is a symlink to the real one),
mutate the COPY, run it. The shipped probes are untouched by this.

| probe | mutation applied to the copy | required | observed |
|---|---|---|---|
| `probe-attached.mts` | one positive control's source commented out, so it cannot report | exit 2 | exit 2 — `PROBE VOID: 1 positive control(s) went silent, so every subject zero is unattributable`, at 3/4 controls |
| `corpus-family3.mts` | `attachedRegion` returns `null` unconditionally, blinding the scan | exit 2 | exit 2 — `ABORT: 11 control(s) failed — the scan cannot see the family, so a corpus zero would mean nothing` |
| `digest-sensitivity.mts` | serialisation narrowed to the PRE-REPAIR field set (`key`, `file`, `line`, `text`) | exit 1 | exit 1 — `0/7 perturbations detected`, `FAIL: the digest is blind to 7 field(s) it claims to pin` |
| `oracle.mts` | a snippet added that ECHOES the psql command instead of running it — the round-1 case-H shape | non-zero | exit 2 — `ABORT: a snippet did not execute - the oracle proves nothing about it`, at 12/13 |
| `region-underapprox.mts` | its region reader returns `null` unconditionally | non-zero | **exit 0 at 5/18 — IT WAS A REPORTER.** Repaired in the same commit; now exits 1 naming the count |
| `baseline-corpus.mts` | a wrong `--expect` value | exit 1 | exit 1; bare invocation exits 0 on any digest, which is why the flag IS the gate |

**The digest row is a regression proof for the round-2 repair, not just a branch test.** Narrowing
the serialisation back to what it hashed BEFORE that repair takes it from 7/7 perturbations detected
to 0/7. The repair is therefore load-bearing rather than decorative, and anyone who later "simplifies"
that serialisation to the fields that look like they matter will rebuild the exact blindness.

## Resolved scope — do not relitigate

- **The 123865 figure is RETRACTED.** It scanned raw bytes of every tracked file and so counted
  markdown prose: mentions, not shell text. The replacement is the 53 in the three-surface census.
- **The 19- and 46-target takes are SUPERSEDED**, not competing measurements. The first sliced by
  extension and never saw workflow `run:` scalars or package scripts; the second was keyed on the
  attached-target regex this arc REPLACES, so it stopped meaning anything the moment the repair
  landed and it misread `>$(psql)` as `>$` besides.
- **`package.json` scripts are censused but are NOT in the guard's probe domain.** Production's
  `SCANNED_EXTENSIONS` excludes `.json`. The distinction is stated in the design spec's §2.3 and
  §5; a probe on that surface measures a pre-existing documented limit of the scanner rather than
  anything this arc decides.
- **The oracle's snippets stay base64.** Committing them as runnable shell text puts this arc's own
  fixtures into the corpus it measures, which is the measurement recorded below.

**The snippets are base64 in the tracked bytes, and that is load-bearing.** They are instances of
the family this arc censuses, so a `.sh` file carrying them enters the scanner's own corpus.
Measured: committing them as a plain runnable shell script took the shell surface from 19 attached targets / 0
substitution-bearing to 28 / 5 — every one of the five mine.

**Round 2 replaced an H that did not execute.** The oracle measured the original escaped-backtick
fixture at `executions=0`: it echoed the psql rather than running it, so it witnessed nothing. The
two that shipped are the class's two directions — H executes and is SILENT, I executes and is
MIS-ATTRIBUTED.

## 3b. `operator-oracle.mts` — which operators bash EXPANDS an attached target for

The scanner's `LITERAL_TARGET_REDIRECTIONS` is a claim about the SHELL, so the shell settles it.
One real bash script per operator, a fake psql on PATH, executions counted.

```
positive control: psql executed 1x — the harness can observe an execution

ok    &>>  executions=1  declared=EXPANDED
ok    &>   executions=1  declared=EXPANDED
ok    <<<  executions=1  declared=EXPANDED
ok    <<-  executions=0  declared=LITERAL delimiter
ok    <<   executions=0  declared=LITERAL delimiter
ok    >>   executions=1  declared=EXPANDED
ok    >&   executions=1  declared=EXPANDED
ok    <&   executions=1  declared=EXPANDED
ok    <>   executions=1  declared=EXPANDED
ok    >|   executions=1  declared=EXPANDED
ok    <    executions=1  declared=EXPANDED
ok    >    executions=1  declared=EXPANDED

population: 12 operators — 10 expand an attached substitution, 2 take the target literally
PASS: bash agrees with LITERAL_TARGET_REDIRECTIONS on every shipped operator.
```

**Two results refuted the obvious reading, in opposite directions**, which is the whole reason this
is measured rather than declared. `>&` and `<&` take a DESCRIPTOR, so the intuitive answer is that
no substitution runs there — bash expands the word FIRST and fails the descriptor check afterwards,
so psql really executes and a scanner that declined would carry a silent miss. And `<<` / `<<-`
look like ordinary redirections while executing nothing at all, so collecting bodies from them is a
FALSE advisory. The first draft of the deciding suite's operator row asserted the opposite pair and
was simply wrong.

**Why deriving both sides is sound here and nowhere else.** The operator LIST comes from the shipped
array and the expected split from the shipped set — normally a vacuous check, since a drift in the
constant moves both sides together. It is not vacuous because BASH supplies the observation, and
bash cannot be moved by editing `REDIRECTION_PARTITION`.

**The positive control is an ABORT, not a step someone might skip.** A harness that cannot execute
anything — wrong PATH, unwritable log, no bash — reports zero executions for every operator, and a
uniform zero renders identically to a real finding about the shell. If the bare `psql -c 'select 1'`
control does not run exactly once, the probe exits 2 and reports nothing.

**PROVEN to discriminate:** declaring `>` a literal delimiter yields
`MISS  >    executions=1  declared=LITERAL delimiter` and exit 1; restored, exit 0.

**The snippets are BASE64.** They are instances of the very family this arc censuses, and a literal
shell-shaped string in a committed file is corpus — measured on this arc, committing the sibling
oracle's snippets as a runnable script took the shell surface from 19 attached targets with 0
substitution-bearing to 28 with 5, every one of them the author's.

## 4. `corpus-family3.mts` — live population, by EXECUTION SURFACE

```
POSITIVE CONTROL — the acceptance set must be detected:
  ok    A bare backtick
  ok    B $() in double quotes
  ok    C backtick in double quotes
  ok    D locale-quoted
  ok    E brace operand
  ok    G brace inside double quotes
  ok    bare $( ) — the spelling the OLD census missed
  ok    a plain path must NOT count
  ok    a DETACHED substitution must NOT count as attached
  ok    MULTILINE: continuation inside a quoted target
  ok    MULTILINE: substitution spanning a newline inside quotes
  ok    an UNQUOTED newline must END the region

=== whole-file shell (.sh/.bash) — 5 chunks
attached targets: 21
  ...substitution-bearing: 0
  witnesses (proves the scan fires here):
    scripts/ci/assert-pnpm-sources-clean.sh:33  >&2
    scripts/ci/assert-pnpm-sources-clean.sh:105  <(printf
    scripts/ci/assert-pnpm-sources-clean.sh:119  <(env)
    scripts/ci/assert-pnpm-sources-clean.sh:39  >/dev/null
    scripts/ci/supabase-local-bootstrap.sh:92  >&2
    scripts/ci/supabase-local-bootstrap.sh:95  >&2

=== workflow run: scalars — 154 chunks
attached targets: 32
  ...substitution-bearing: 0
  witnesses (proves the scan fires here):
    .github/workflows/admin-layout-e2e.yml run::1  >/dev/null
    .github/workflows/app-e2e.yml run::1  >/dev/null
    .github/workflows/crew-e2e.yml run::1  >/dev/null
    .github/workflows/dev-gate-e2e.yml run::1  >/dev/null
    .github/workflows/help-affordances.yml run::1  >/dev/null
    .github/workflows/lifecycle-layout-e2e.yml run::1  >/dev/null

=== package.json scripts — 74 chunks
attached targets: 0
  ...substitution-bearing: 0
  chunks containing any < or > character: 0
  zero ATTRIBUTABLE: no redirection character exists on this surface.

TOTAL substitution-bearing attached targets: 0
PASS: zero substitution-bearing attached targets across all three surfaces.
```

**Round 3 finding 1 changed the scan SHAPE.** It reads the whole chunk rather than physical
lines, so quote state and backslash continuations survive a newline as they do in bash. The
continuation case `cat >"/dev/null\` + newline + `$(psql)"` executes psql (oracle: 1 execution)
and previously read as `"/dev/null\` with `subst: false`. Every control was single-line, which is
precisely why none of them saw it; three multiline controls now pin it.

**Round 4 carried the same axis one layer along, and added a second.** The census was repaired for
multiline input at round 3 and the ACCEPTANCE SET was not, so every case A-I still kept its
attached target on one physical line — a same-line-only implementation would have satisfied AC-1,
AC-5 and AC-8 while staying silent on a form bash executes. That is subject **J**. Round 4 also
found that every substitution-bearing case wrote a BARE `>` immediately after the command word, so
nothing crossed the file-descriptor-prefix axis; `cat 2>"$(psql -c 'select 1')"` executes once and
both shipped scanners return zero. That is subject **K**, and a thirteenth census control pins the
same axis on this side. Both are one ordinary edit from B, both were measured silent BEFORE they
were written up, and the oracle puts both at one execution.

**The attribution predicate was existential and is now universal.** Round 4 finding 4: accepting
when SOME site carries `nestedInBacktick === true` lets a repair add a correct record and leave the
wrong one, so `[wrong, correct]` passed. It now requires the attribution on EVERY site the snippet
produces, with a non-empty guard so an empty read cannot pass vacuously.

**Three further properties, each bought by a round-2 finding.** The scan is INDEPENDENT of the
attached-target regex §3 replaces — a census keyed on the instrument under repair stops meaning
anything the moment the repair lands. It is quote-aware, so it sees `>$(psql)`, which that regex
consumes as only `>$`. And it ASSERTS its zero rather than printing it.

**Superseded versions, recorded so the numbers are not re-derived:**

| version | population | result | disposition |
|---|---|---|---|
| take 1 | raw bytes of every tracked file | 123865 attached, 12483 substitution-bearing | **RETRACTED** — measured mentions, not shell text |
| take 2 | `SHELL_EXTENSIONS` slice | 19 attached, 0 substitution-bearing | UNDERCOUNTS — misses `run:` blocks and package scripts |
| take 3 | three surfaces, regex-derived detector | 46 attached, 0 substitution-bearing | **SUPERSEDED** — detector keyed on the regex under repair |
| take 4 | three surfaces, independent quote-aware scan | 53 attached, 0 substitution-bearing | current |

The count rose 46 → 53 because the independent scan also sees `<(…)` process substitutions the
regex missed. The load-bearing number is unchanged.

## 5. `baseline-corpus.mts` — the digest-pinned finding set

```
sites: 76
indirections: 0
unreadable: 0

TOTAL ROWS: 76
DIGEST: 8ebe8b08d43e6308aa471112d9f086d0118e6238
```

`--expect <digest>` turns it into a gate: exit 1 printing expected and actual when the set moves,
exit 2 on a zero-row or thin-record read.

## 6. `digest-sensitivity.mts` — the digest DISCRIMINATES

```
baseline digest: 8ebe8b08d43e6308aa471112d9f086d0118e6238  over 76 sites

flip sites[0].suppressesStartupFiles   DETECTED
flip sites[0].nested                   DETECTED
flip sites[0].nestedInBacktick         DETECTED
flip sites[0].exemptReason             DETECTED
flip sites[0].hasDynamicTokens         DETECTED
exemptReason null->undefined           DETECTED
exemptReason null->ABSENT              DETECTED

7/7 perturbations detected
PASS: the digest discriminates on every field section 5 cares about.
```

**Round 3 finding 2 added the last two rows.** `?? null` collapsed `undefined` into `null`, and
those are behaviourally different — `dropSharedExemptions` branches on `exemptReason === null`, and
`undefined === null` is false — so an `undefined` could suppress an advisory with the digest
unchanged. ABSENT is a third state and gets its own token. **The digest did NOT move**, because
every live `exemptReason` is `null`: the repair changed what the digest DISCRIMINATES, not what it
reads, and this probe is what proves it landed.

**Round 2 finding 2 is why this probe exists.** The original digest hashed only collection key,
file, line and text-or-form. Every one of the 76 live sites carries `suppressesStartupFiles: true`,
`nested: false`, `nestedInBacktick: false` and `exemptReason: null` — so flipping any of them left
the digest IDENTICAL. A false advisory and an attribution regression, the two directions §5
forbids, were both invisible to the check written to BE the consequence bound. Changing the digest
is not evidence that it now discriminates; this probe is.
