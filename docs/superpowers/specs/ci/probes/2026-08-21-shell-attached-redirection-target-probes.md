# Probe record — ATTACHED redirection target substitution

Evidence for `docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md`
(ledger `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION`).

All five probes are committed at
`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/` and resolve the repo
root from their own location, so a reviewer re-runs them from any checkout:

```
pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/<probe>.mts
```

Measured at `e5d1d723d`.

---

## 1. `slice-shape.mts` — what the attached regex consumes

Reads the attached-target pattern OUT OF the shipped source rather than retyping it, then runs it
against eight spellings.

```
A bare backtick   >`psql -c 'select 1'`      CONSUMED "`psql"    NO  — stops mid-construct
B $() in dquote   >"$(psql -c 'select 1')"   CONSUMED whole      yes
C `` in dquote    >"`psql -c 'select 1'`"    CONSUMED whole      yes
D locale-quoted   >$"$(psql -c 'select 1')"  CONSUMED whole      yes
E ${} operand     >${OUT:-$(psql …)}         CONSUMED whole      yes
F here-string     <<<p'sql'                  CONSUMED whole      yes
control plain     >/dev/null                 CONSUMED whole      yes
control $()       >$(psql)                   CONSUMED "$"        NO  — stops mid-construct
```

**Design-shaping result.** The pattern is not a target recognizer; it is a character-run muncher.
For the two substitution-OPENING forms it stops mid-construct and hands a fragment to the outer
loop. A repair that merely re-lexes `attached[0]` inherits both fragments — which is why §3 of the
spec delimits by construct instead.

## 2. `probe-attached.mts` — the acceptance set is silent, attributably

Ten cases through the shipped `scanSource` / `scanShellIndirection`. Aborts exit 2 if any control
goes silent, because a control that does not fire makes every zero below it unattributable.

```
REPORTS  sites=1 indirection=0  CONTROL detached backtick target
REPORTS  sites=1 indirection=0  CONTROL detached dollar-paren target
REPORTS  sites=1 indirection=0  CONTROL plain call
REPORTS  sites=0 indirection=1  CONTROL detached here-string binding
silent   sites=0 indirection=0  A bare backtick ATTACHED target
silent   sites=0 indirection=0  B dollar-paren inside ATTACHED double-quoted target
silent   sites=0 indirection=0  C backtick inside ATTACHED double-quoted target
silent   sites=0 indirection=0  D locale-quoted ATTACHED target with substitution
silent   sites=0 indirection=0  E substitution inside ATTACHED brace target
silent   sites=0 indirection=0  F plain ATTACHED here-string binding

population: 10 cases, 4 controls
controls reporting: 4/4
```

## 3. `oracle.mts` — the silence is about a command that really runs

Materialises each snippet into a tmpdir with a fake `psql` on PATH and runs it under bash.

```
CONTROL-detached-backtick      executions=1
A-bare-backtick-attached       executions=1
B-dollarparen-in-dq            executions=1
C-backtick-in-dq               executions=1
D-locale-quoted                executions=1
E-brace-default-operand        executions=1
F-attached-here-string         executions=1

7/7 snippets executed the command
```

**The snippets are base64 in the tracked bytes, and that is load-bearing.** They are instances of
the family this arc censuses, so a `.sh` file carrying them enters the scanner's own corpus.
Measured: committing them as `oracle-run.sh` took the shell surface from **19 attached targets / 0
substitution-bearing to 28 / 5 — every one of the five mine**. Encoding restores the census to its
true population. This is the "your fixtures become the corpus your guard scans" trap, caught by
re-running the census after committing rather than by reading the diff.

## 4. `corpus-family3.mts` — live population, by EXECUTION SURFACE

```
=== whole-file shell (.sh/.bash) — 5 chunks
attached targets: 19          ...substitution-bearing: 0
=== workflow run: scalars — 154 chunks
attached targets: 27          ...substitution-bearing: 0
=== package.json scripts — 74 chunks
attached targets: 0           ...substitution-bearing: 0
  chunks containing any < or > character: 0
  zero ATTRIBUTABLE: no redirection character exists anywhere on this surface.

TOTAL substitution-bearing attached targets across all three surfaces: 0
```

Each surface prints witnesses so its zero is attributable. The `package.json` surface has no
witnesses to print, so its zero is attributed by an independent route instead — 74 script entries
contain not one `<` or `>` character, so no redirection can exist there. The probe ABORTS rather
than reporting clean if a surface holds redirection characters and yields no targets.

**Two superseded versions of this census, recorded so the numbers are not re-derived:**

| version | population | result | disposition |
|---|---|---|---|
| take 1 | raw bytes of every tracked file | 123865 attached, 12483 substitution-bearing | **RETRACTED** — scanned markdown prose, measured mentions not shell text |
| take 2 | `SHELL_EXTENSIONS` slice | 19 attached, 0 substitution-bearing | sound but UNDERCOUNTS — misses `run:` blocks and package scripts |
| take 3 | three execution surfaces | 46 attached, 0 substitution-bearing | current |

## 5. `baseline-corpus.mts` — the digest-pinned finding set

```
sites: 76      indirections: 0      unreadable: 0
digest: 7a315aa397df9179bec3f11f25f7ea7efcc0c688
```

Re-run AFTER committing all five probes: **byte-identical**, same digest, finding set diffs clean
against the pre-commit capture. So the evidence does not move the thing it measures.

This digest is the spec's AC-5 drift detector.
