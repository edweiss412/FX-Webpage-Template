# An executing psql hidden inside an ATTACHED redirection target

**Ledger:** `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION` (`BACKLOG.md:87`).
**Surface:** `tests/cross-cutting/psqlStartupFiles/scan.ts`, enrolled as `psqlStartupScan`
(`tests/mutation/source/registry.ts:2388`).
**Base:** `e5d1d723d`. Every number below was measured at that revision and carries the command
that produced it.

---

## 1. The defect

`lexShellWords` (`tests/cross-cutting/psqlStartupFiles/scan.ts:1193`) consumes an ATTACHED
redirection target with a character-class run and discards the result
(`tests/cross-cutting/psqlStartupFiles/scan.ts:1581`):

```js
const attached = /^(?:\$\{[^}]*\}|"[^"]*"|'[^']*'|\\.|[^\s;&|()<>])+/.exec(rest);
if (attached) i += attached[0].length;
```

Nothing in that path collects nested shell bodies, so a target containing a command substitution
is never lexed and its body never reaches `scanShellText`
(`tests/cross-cutting/psqlStartupFiles/scan.ts:1822`). **Bash executes that body.** The failure
direction is the forbidden one — a missed SITE for an executing psql, not a conservative
non-report.

It is PRE-EXISTING and was not made worse by the arc that filed it.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratified at |
|---|---|---|
| 1 | **Handing the attached slice to `lexShellWords` recursively and exposing the result to the SITE path is REFUSED.** It breaks the by-construction site-path identity the detached-target arm rests on. | `BACKLOG.md:95`; `tests/cross-cutting/psqlStartupFiles/scan.ts:293` |
| 2 | **Recursive lexing that keeps the bodies PRIVATE is REFUSED.** It is machinery with the miss still in place. | `BACKLOG.md:95`; `tests/cross-cutting/psqlStartupFiles/scan.ts:294` |
| 3 | **The repair changes no live behaviour today.** The corpus holds zero instances (§2.3). This is a PROSPECTIVE guard, fail-closed against future authoring, and that is the whole of its value. A finding that it fixes nothing observable is answered here. | §2.3 |
| 4 | **No resolver.** The design decides nothing about what a target EVALUATES to. It delimits, collects, and reports. | §3 |
| 5 | **The attached target still never becomes an argv word.** That property is what rows 1 and 2 exist to protect, and §3 preserves it. | §3 |
| 6 | The withdrawn-scope prose in the surface header and in the deciding suite is RETIRED by this arc, not contradicted. Both sites are named in §6. | §6 |

---

## 2. Measurements

### 2.1 What the attached regex actually consumes

Eight spellings through the SHIPPED pattern, read out of the source rather than retyped
(`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/slice-shape.mts`):

| spelling | consumed | whole? |
|---|---|---|
| A bare backtick `` >`psql -c 'select 1'` `` | `` `psql `` | **NO — stops mid-construct** |
| B `$()` in attached double quotes | whole target | yes |
| C backtick in attached double quotes | whole target | yes |
| D locale-quoted `$"…"` | whole target | yes |
| E `${OUT:-$(…)}` | whole target | yes |
| F attached here-string `<<<p'sql'` | whole target | yes |
| control: plain path `>/dev/null` | whole target | yes |
| control: `>$(psql)` | `$` | **NO — stops mid-construct** |

**This refutes the obvious model, and the design turns on it.** The pattern is not a target
recognizer; it is a character-run muncher that neither respects construct boundaries nor reports
when it cannot delimit one. For the two substitution-OPENING forms it stops mid-construct and
hands a fragment to the outer loop, which then mis-lexes it. A repair that merely re-lexes
`attached[0]` would inherit both fragments.

### 2.2 The acceptance set is silent, and the zeros are attributable

Ten cases through the shipped `scanSource` and `scanShellIndirection`
(`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/probe-attached.mts`):

| case | sites | indirection |
|---|---|---|
| CONTROL detached backtick target | 1 | 0 |
| CONTROL detached `$( )` target | 1 | 0 |
| CONTROL plain call | 1 | 0 |
| CONTROL detached here-string binding | 0 | 1 |
| A bare backtick ATTACHED target | **0** | **0** |
| B `$()` inside ATTACHED double-quoted target | **0** | **0** |
| C backtick inside ATTACHED double-quoted target | **0** | **0** |
| D locale-quoted ATTACHED target | **0** | **0** |
| E substitution inside ATTACHED brace target | **0** | **0** |
| F plain ATTACHED here-string binding | **0** | **0** |

**4 of 4 positive controls report**, so the six zeros are attributable rather than the artefact of
a broken read. A bash oracle with a fake `psql` on PATH confirms **7 of 7 snippets execute psql
exactly once** (`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/oracle.mts`) — the scanner is silent about a command that really
runs.

### 2.3 Live population: zero, on three execution surfaces

Census by EXECUTION SURFACE rather than by extension, with witnesses printed per surface
(`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts`):

| surface | chunks | attached targets | substitution-bearing |
|---|---|---|---|
| whole-file shell (`.sh`/`.bash`) | 5 | 19 | **0** |
| workflow `run:` scalars | 154 | 27 | **0** |
| `package.json` scripts | 74 | 0 | **0** |
| **total** | | **46** | **0** |

The first two zeros are attributable by their witness lists. The third has no witnesses to print,
so it is attributed by an independent route: **74 script entries contain not one `<` or `>`
character**, so no redirection — attached or detached — can exist there. The probe ABORTS rather
than reporting a clean zero if a surface holds redirection characters and yields no targets.

An earlier census of this family reported 123865 attached targets over raw file bytes; **that
number is retracted and replaced by the 46 above**, because it scanned markdown prose and so
measured mentions rather than shell text.

### 2.4 Corpus baseline, digest-pinned

`collectPsqlUsage` over the worktree at `e5d1d723d`:

**76 sites, 0 indirections, 0 unreadable**, finding-set digest
`7a315aa397df9179bec3f11f25f7ea7efcc0c688` (`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts`). The digest is the
drift detector: the repair must leave it unchanged apart from this arc's own constructed fixtures.

---

## 3. The design

**Delimit the attached target with the construct-aware machinery the lexer already ships, collect
its nested bodies into `nested`, and REPORT anything the machinery cannot delimit.**

Three parts, no new grammar:

1. **Delimit by construct, not by character run.** Walk the attached slice using the handlers that
   already exist: `matchBrace` (`tests/cross-cutting/psqlStartupFiles/scan.ts:946`) for `${…}` and
   `$(…)`, the backtick scan, and the quote scanners. This is what fixes §2.1's two mid-construct
   stops — the boundary comes from the construct, so it cannot land inside one.

2. **Collect into `nested`.** Re-anchor each body into the outer `nested` array exactly as the
   `${…}` branch already does (`tests/cross-cutting/psqlStartupFiles/scan.ts:1340`), so
   `scanShellText` reads them as it reads every other substitution body. This is the ledger's
   ratified closing reading.

3. **Report the unlexable.** A slice the machinery cannot delimit — an unterminated backtick,
   brace or quote — is REPORTED, never silently discarded. A declined input needs a channel, not
   an exclusion.

**Why this is not either REFUSED reading.** The target's own text never becomes an argv word and
is never exposed to the site path, so the by-construction identity that rows 1.1/1 and 1.1/2
protect is untouched. Only the nested BODIES — which already have a well-defined route through
`scanShellText` — are surfaced, and they are surfaced by the mechanism that already carries every
other substitution body.

### 3.1 Accept-set with default-deny

The attached slice's interior is delimited by an ACCEPT-SET of construct openers, keyed on
STRUCTURE rather than spelling:

| opener | delimiter |
|---|---|
| `${` | `matchBrace` |
| `$(` | `matchBrace` |
| `` ` `` | backtick scan |
| `"` … `$"` | double-quote scanner |
| `'` … `$'` | single-quote / ANSI-C scanner |
| `\` | escape pair |
| any other non-metacharacter | literal run |

**Everything outside this set is REPORTED as an unlexable target, by default rather than by
enumeration.** A later finding INSIDE the accept set is a bug in scope this spec promised to
handle. A spelling OUTSIDE it is a documented limit by construction and is not an admissible
finding — which is what makes the axis closable rather than an open grammar to chase.

---

## 4. Acceptance criteria

Each row names the command that proves it.

| id | criterion | proved by |
|---|---|---|
| AC-1 | All six §2.2 acceptance-set spellings report the executing psql. | the §2.2 probe, re-run, expecting REPORT |
| AC-2 | All four §2.2 positive controls still report. | same probe |
| AC-3 | An unterminated backtick / brace / quote in an attached target is REPORTED as unlexable, not discarded. | a constructed case per opener |
| AC-4 | `F11 a psql call, ATTACHED output redirection` still reports 1 site with `suppressesStartupFiles === false`. | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5566` |
| AC-5 | The live-corpus finding set is unchanged apart from this arc's fixtures: 76 sites, digest `7a315aa397df9179bec3f11f25f7ea7efcc0c688`. | `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts`, re-run |
| AC-6 | The two retired declared-limit pins are retired deliberately, with their new values pinned. | §6 |
| AC-7 | `psqlStartupScan` scores at or above its floor with an empty unaccepted-survivor set. | `pnpm mutation:guards` |

**AC-5 is the consequence bound made executable.** It distinguishes a guard that got stricter
from one that merely got louder, and it is the one check no reading of the diff can substitute
for.

---

## 5. Convergence criterion

- **Consequence bound.** Every attached-target form is either lexed and its nested bodies scanned,
  or REPORTED as unlexable — never silently discarded. Zero false advisories on the live corpus:
  the corpus has ZERO instances of this family today (§2.3), so a corpus scan before and after the
  change must show the same finding set apart from this arc's own constructed fixtures (§2.4).

- **PROBE DOMAIN:** the three execution surfaces censused in §2.3 — 46 attached targets across
  whole-file shell, workflow `run:` scalars and `package.json` scripts — plus the eight spellings
  in §2.1, the ten cases in §2.2, and the bash oracle that confirms each executes. A constructed
  input more than one ordinary edit from that set files to documented limits, not to a finding.

- **Threat fence.** Ordinary authoring by a contributor writing a shell script, a workflow `run:`
  block or a package script in this repo. Adversarial obfuscation is out of scope and files to
  documented limits.

- **Score.** `MUTATION SCORE: <k>/<t>` plus an empty unaccepted-survivor set on the
  `GUARD SURFACE:` line of the round-1 `--stage diff` brief, measured by `pnpm mutation:guards`
  BEFORE the first dispatch. The registry row's operator set is deliberately narrow
  (`relational-boundary`, `regex-quantifier-bound`); widening it is a registry change carrying its
  own numbers, not a finding against this arc.

Every admissibility clause cites the fence and the domain above.

---

## 6. Declared-limit pins — named, per the planlint obligation

The deciding suite carries an executable table pinning this family at zero. **This arc RETIRES two
rows and must not move a third.**

| row | site | today | after |
|---|---|---|---|
| `A3 the ATTACHED here-string, withdrawn scope` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5539` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5551` | 0 hits | **RETIRED — reports** |
| `F2 the ATTACHED substitution target` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5543` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5555` | 0 hits | **RETIRED — reports** |
| `F11 a psql call, ATTACHED output redirection` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5566` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5580` | 1 site, `[false]` | **UNCHANGED — control** |

A pinned zero is a RECORD of current behaviour, not a guarantee about it. Changing the recognizer
under one without naming it converts the record into a false assertion, which is exactly the
collision the obligation exists to catch.

**Prose that must move with the code**, or it becomes a stale citation that still reads true:

- the surface's documented-limits block (`tests/cross-cutting/psqlStartupFiles/scan.ts:280` through `tests/cross-cutting/psqlStartupFiles/scan.ts:297`),
  which currently calls this family "not read at all" and "the sharpest limit in this list";
- the deciding suite's note declaring the attached `<<<p'sql'` spelling withdrawn scope that lives
  in scan.ts's documented-limits block rather than in the suite
  (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6171`).

---

## 7. Documented limits

1. **Shell strings inside JS.** The §2.3 census covers three execution surfaces. Shell text passed
   to `execSync`/`spawn` with `shell: true` inside JS files is a fourth, and reaching it needs the
   extractors the module does not export. AC-5's before/after corpus equality covers it
   operationally — any movement there fails the digest — but it is not separately censused, and
   that is stated rather than implied.

2. **A target whose construct the accept-set cannot delimit is REPORTED, not resolved.** The
   report names the target as unlexable; it does not say what the target would have evaluated to.
   Conservative-and-loud is the permitted direction; wrongly-silent is not.

3. **This repair is prospective.** With zero live instances, no shipped behaviour changes today.
   Its value is fail-closed coverage of a family a contributor could author tomorrow, and the
   §2.2 probe is what will notice.

---

## 8. Touched set

| file | change |
|---|---|
| `tests/cross-cutting/psqlStartupFiles/scan.ts` | the attached-target branch at `tests/cross-cutting/psqlStartupFiles/scan.ts:1581`; the documented-limits block at `tests/cross-cutting/psqlStartupFiles/scan.ts:280` through `tests/cross-cutting/psqlStartupFiles/scan.ts:297` |
| `tests/cross-cutting/psqlStartupFileSuppression.test.ts` | two pins retired, one control held, new cases for §4 |
| `tests/mutation/source/registry.ts` | `psqlStartupScan` accepted rows re-derived — the source edit moves every site below the lexer |
| `BACKLOG.md` / `BACKLOG-archive.md` | ledger closeout |

**A source edit voids the score.** The registry row's accepted rows are re-derived for this
change, and no `equivalent` or `accepted-gap` row is carried across the edit on the strength of
having been true before.
