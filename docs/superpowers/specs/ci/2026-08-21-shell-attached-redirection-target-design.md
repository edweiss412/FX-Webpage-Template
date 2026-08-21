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
| 4 | **No resolver.** The design decides nothing about what a target EVALUATES to. It delimits, retains, collects, and reports. | §3 |
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

### 2.2 The acceptance set, and the zeros are attributable

Thirteen cases through the shipped `scanSource` and `scanShellIndirection`
(`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/probe-attached.mts`).
Each SUBJECT declares the post-change expectation it must come to satisfy; the probe asserts that
none of them holds today and, under `--expect-report`, that all of them hold after.

| case | expectation | today |
|---|---|---|
| CONTROL detached backtick target | reports | REPORTS |
| CONTROL detached `$( )` target | reports | REPORTS |
| CONTROL plain call | reports | REPORTS |
| CONTROL detached here-string binding | reports | REPORTS |
| A bare backtick ATTACHED target | reports | silent |
| B `$()` inside ATTACHED double-quoted target | reports | silent |
| C backtick inside ATTACHED double-quoted target | reports | silent |
| D locale-quoted ATTACHED target | reports | silent |
| E substitution inside ATTACHED brace target | reports | silent |
| F plain ATTACHED here-string binding | reports | silent |
| G brace inside an ATTACHED double-quoted target | reports | silent |
| H escaped backtick in an ATTACHED double-quoted target | reports | silent |
| I mid-construct stop mis-attributes a backtick body | **attributed to the backtick body** | **REPORTS, WRONGLY** |

**4 of 4 positive controls report**, so the subject results are attributable rather than the
artefact of a broken read. A bash oracle confirms **10 of 10 snippets execute psql exactly once**
(`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/oracle.mts`) — the
scanner is silent about a command that really runs.

**G, H and I arrived through review, and I is why the expectation is a PREDICATE rather than a
report/silent binary.** I already REPORTS today, with `nested:false, nestedInBacktick:false` for a
psql that genuinely sits inside a backtick body — the outcome right and the reason wrong, which a
binary asking only "did anything report" is structurally blind to.

**Round 2 replaced an earlier H that did not execute at all.** The oracle measured it at
`executions=0`, so it witnessed nothing: a fixture that does not run the command cannot demonstrate
a scanner is wrong to be silent about it. The two that shipped are the class's two directions —
H executes and is SILENT, I executes and is MIS-ATTRIBUTED.

### 2.3 Live population: zero, on three execution surfaces

Census by EXECUTION SURFACE rather than by extension, with witnesses printed per surface
(`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts`):

| surface | chunks | attached targets | substitution-bearing |
|---|---|---|---|
| whole-file shell (`.sh`/`.bash`) | 5 | 21 | **0** |
| workflow `run:` scalars | 154 | 32 | **0** |
| `package.json` scripts | 74 | 0 | **0** |
| **total** | | **53** | **0** |

**The scan is INDEPENDENT of the recognizer under repair.** An earlier version extracted the
lexer's attached-target regex — the very thing §3 replaces — and that regex consumes `>$(psql)`
as only `>$`, so it classified an in-domain spelling as non-substitution-bearing. The census now
reads the target region with its own quote-aware scan, which is why the target counts here are
HIGHER than the 46 an earlier draft reported (a historical comparison, kept deliberately): it
also sees `<(…)` process substitutions the
regex missed. The load-bearing number, zero, is unchanged and is now asserted rather than
printed.

The first two zeros are attributable by their witness lists. The third has no witnesses to print,
so it is attributed by an independent route: **74 script entries contain not one `<` or `>`
character**, so no redirection — attached or detached — can exist there. The probe ABORTS rather
than reporting a clean zero if a surface holds redirection characters and yields no targets.

An earlier census of this family reported 123865 attached targets over raw file bytes; **that
number is retracted and replaced by the 53 above**, because it scanned markdown prose and so
measured mentions rather than shell text.

### 2.4 Corpus baseline, digest-pinned

`collectPsqlUsage` over the worktree at `e5d1d723d`:

**76 sites, 0 indirections, 0 unreadable**, finding-set digest
`8ebe8b08d43e6308aa471112d9f086d0118e6238` (`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts`). The digest is the
drift detector: the repair must leave it unchanged apart from this arc's own constructed fixtures.

---

## 3. The design

**Delimit the attached target with the construct-aware machinery the lexer already ships; RETAIN
the dequoted target for the callers that ask for one; collect its nested bodies into `nested`; and
REPORT anything the machinery cannot delimit.**

Four parts, no new grammar. Part 2 is new at spec round 1 — the three-part design could not
satisfy case F at all, and finding 1 is why.

1. **Delimit by construct, not by character run.** Walk the attached slice using the handlers that
   already exist: `matchBrace` (`tests/cross-cutting/psqlStartupFiles/scan.ts:946`) for `${…}` and
   `$(…)`, the backtick scan, and the quote scanners. This is what fixes §2.1's two mid-construct
   stops — the boundary comes from the construct, so it cannot land inside one.

2. **Retain the DEQUOTED target as a `RedirectionTarget`** in the optional `targets` array
   (`tests/cross-cutting/psqlStartupFiles/scan.ts:1041`), carrying `operator`, `line`, `offset` and
   `operatorOffset` exactly as the DETACHED arm already does.

   **Why this part exists, and why it is not either REFUSED reading.** The here-string family
   binds from the TARGET, not from a nested body — `<<<p'sql'` has no nested body at all — and
   `hereStringBindingLines` (`tests/cross-cutting/psqlStartupFiles/scan.ts:2970`) reads only that
   array. Without retention, case F is unreachable by construction.

   The `targets` array is also precisely the mechanism that PRESERVES site-path identity, in the
   type's own words: *"Targets never enter the returned word array: `scanShellText` passes no array
   and so receives a byte-identical `ShellWord[]`, which is what makes the site path unchanged BY
   CONSTRUCTION rather than by care at each consumer."* `scanShellText` passes no `targets` array;
   `scanShellIndirection` does (`tests/cross-cutting/psqlStartupFiles/scan.ts:3080`). So retention
   reaches the binding path and cannot reach the site path — which is the property §1.1 rows 1 and
   2 protect, obtained by construction rather than by care.

3. **Collect nested bodies into `nested`.** Re-anchor each body into the outer array exactly as the
   `${…}` branch already does (`tests/cross-cutting/psqlStartupFiles/scan.ts:1340`), so
   `scanShellText` reads them as it reads every other substitution body. This is the ledger's
   ratified closing reading, and it serves the SUBSTITUTION family (cases A–E, G, H).

4. **Report the unlexable, on a named channel.** A slice the accept-set cannot delimit — an
   unterminated backtick, brace or quote — emits an **`IndirectionHit`**
   (`tests/cross-cutting/psqlStartupFiles/scan.ts:438`) from `scanShellIndirection`, carrying
   `{ file, line, text }` where `text` names the undelimitable target.

   **That channel is named rather than left to prose because finding 2 showed silent consumption
   and several incompatible loud behaviours all satisfied the earlier wording.** It is an existing
   surfaced channel — `collectPsqlUsage` already collects `indirections` for non-JS files — so this
   adds no type and no result shape. It does NOT throw, does NOT extend `PsqlUsage`, and does NOT
   emit a `PsqlSite`: an unlexable target is a "something here I cannot read" signal, which is what
   an indirection hit already means.

   **The report fires only when the undelimitable span contains a substitution opener** (`$(`,
   `` ` `` or `${`). A plain `>"${OUT}"` is an ordinary attached target and must stay quiet; the
   live corpus holds 53 such targets (§2.3) and none may become an advisory.

### 3.1 Accept-set with default-deny, applied at EVERY depth

The attached slice's interior is delimited by an ACCEPT-SET of construct openers, keyed on
STRUCTURE rather than spelling:

| opener | delimiter | precedence |
|---|---|---|
| `\` | escape pair — consumes the NEXT character whatever it is | **highest** |
| `${` | `matchBrace` | |
| `$(` | `matchBrace` | |
| `` ` `` | backtick scan | |
| `"` and `$"` | double-quote scanner | |
| `'` and `$'` | single-quote / ANSI-C scanner | |
| any other non-metacharacter | literal run | lowest |

**Two precedence rules are normative, and each answers a round-1 finding:**

- **The accept-set applies RECURSIVELY, at every nesting depth inside the attached slice,
  including inside quotes.** Finding 3: `cat >"${OUT:-$(psql -c "select 1")}"` is one ordinary
  edit from cases B and E, bash executes it, and it is silent today because the main `${…}` branch
  is unreachable inside double quotes (`tests/cross-cutting/psqlStartupFiles/scan.ts:1329`) while
  the double-quote scanner recognises `$(` and backticks but not `${`
  (`tests/cross-cutting/psqlStartupFiles/scan.ts:1445`). Uniform recursion is what makes the
  accept-set mean inside a quoted target what it means outside one. Anything the recursion cannot
  delimit routes to part 4 rather than being consumed.

- **The escape pair binds TIGHTER than every other opener.** Finding 4: both shipped backtick paths
  close on `indexOf("` `` `")` (`tests/cross-cutting/psqlStartupFiles/scan.ts:1371` and `tests/cross-cutting/psqlStartupFiles/scan.ts:1482`), so
  an ESCAPED backtick closes the span early and the remainder is attributed to top-level shell
  text. Measured: the psql reports with `nested:false, nestedInBacktick:false` while it genuinely
  sits inside a backtick body — WRONG ATTRIBUTION, which §5 forbids outright. The escape pair
  taking precedence is what stops a `\`` from terminating anything.

**Everything outside this set is REPORTED through part 4, by default rather than by enumeration.**
A later finding INSIDE the accept set is a bug in scope this spec promised to handle. A spelling
OUTSIDE it is a documented limit by construction and is not an admissible finding — which is what
makes the axis closable rather than an open grammar to chase.

## 4. Acceptance criteria

Each row names a command that can FAIL for the thing the row asserts. Round 1 finding 6 caught the
earlier table naming probes that only printed: a command that exits 0 whatever it observes proves
nothing, and an AC citing prose is decoration.

| id | criterion | proved by, and it fails when the criterion does |
|---|---|---|
| AC-1 | All nine §2.2 subjects meet their expectation. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/probe-attached.mts --expect-report` — exits 1 naming every subject still unmet |
| AC-2 | All four §2.2 positive controls still report. | same command — a silent control ABORTS the run with exit 2, so a subject pass can never rest on a broken read |
| AC-3 | An attached target carrying an unterminated backtick, brace or quote emits an `IndirectionHit` naming it; its terminated sibling emits none. | a paired case per opener in the deciding suite: `pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` |
| AC-4 | `F11 a psql call, ATTACHED output redirection` still reports 1 site with `suppressesStartupFiles === false`. | the same suite — the row is an executable `toEqual` at `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5566` |
| AC-5 | The live-corpus finding set is unchanged: 76 rows, digest `8ebe8b08d43e6308aa471112d9f086d0118e6238`, over EVERY field of every record. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238` — exits 1 printing expected and actual when the set moves, exits 2 on a zero-row or thin-record read |
| AC-5b | That digest DISCRIMINATES on the fields §5 forbids moving — a flipped `suppressesStartupFiles`, `nested`, `nestedInBacktick`, `exemptReason` or `hasDynamicTokens` must change it. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/digest-sensitivity.mts` — exits 1 naming any field the digest is blind to |
| AC-6 | Every declared-limit pin in §6 moves deliberately, and none moves silently. | the same suite: each retired row is re-pinned at its NEW value, and each held row at its old one, so a recognizer change that moves an unlisted pin reds |
| AC-7 | `psqlStartupScan` scores at or above its floor with an empty unaccepted-survivor set. | `pnpm heavy pnpm mutation:guards` |
| AC-8 | The three-surface census still finds ZERO substitution-bearing attached targets, so the repair manufactured no live instance. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts` — ASSERTS the zero and exits 1 listing witnesses otherwise; ABORTS exit 2 if any of its nine controls fails, so the zero can never rest on a scan that cannot see the family |

**The digest did NOT move when round 3 repaired the serialisation, and that is correct.** Every
live `exemptReason` is `null`, so distinguishing `null` from `undefined` from ABSENT changes what
the digest DISCRIMINATES rather than what it currently reads. `digest-sensitivity.mts` is what
proves the repair landed; an unchanged digest is not evidence that it did not.

**AC-5 is the consequence bound made executable.** It distinguishes a guard that got stricter from
one that merely got louder, and it is the one check no reading of the diff can substitute for.

## 5. Convergence criterion

- **Consequence bound.** Every attached-target form is either lexed and its nested bodies scanned,
  or REPORTED as unlexable: **correct or signaled, never silently wrong.** A worst case of
  conservative-over-report-plus-surfaced-signal is a DOCUMENTED LIMIT, not a finding; silent
  discard and wrong attribution are the two forbidden directions. Zero false advisories on the live
  corpus: it holds ZERO instances of this family today (§2.3), so a corpus scan before and after
  the change must show the same finding set apart from this arc's own constructed fixtures (§2.4).

- **PROBE DOMAIN:** the three execution surfaces censused in §2.3 — 53 attached targets across
  whole-file shell, workflow `run:` scalars and `package.json` scripts — plus the eight spellings
  in §2.1, the thirteen cases in §2.2, and the bash oracle that confirms all ten executing snippets
  really run. A constructed
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

The deciding suite pins this family at zero in **two separate blocks**. Round 1 finding 5 caught
the earlier inventory naming only the first; a pinned zero is a RECORD of current behaviour, not a
guarantee about it, and changing the recognizer under an unnamed one converts the record into a
false assertion.

**Block 1 — the section-4 unchanged-rows table.**

| row | site | today | after |
|---|---|---|---|
| `A3 the ATTACHED here-string, withdrawn scope` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5539` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5551` | 0 hits | **RETIRED — reports** |
| `F2 the ATTACHED substitution target` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5543` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5555` | 0 hits | **RETIRED — reports** |
| `F11 a psql call, ATTACHED output redirection` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5566` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5580` | 1 site, `[false]` | **UNCHANGED — control** |

**Block 2 — `F3: recording an attached operator does not read an attached TARGET`
(`tests/cross-cutting/psqlStartupFileSuppression.test.ts:5927`).** This block pins the attached here-string AND its overridden sibling, and it is the
one the earlier inventory missed.

| row | today | after |
|---|---|---|
| `attached target, no override` | 0 hits | **RETIRED — reports** (this is case F exactly) |
| `attached target, overridden` (`<<<p'sql' < /dev/null`) | 0 hits | **UNCHANGED — control** |

**The overridden sibling is a second control worth having**, and it arrived free with the finding:
a later `< /dev/null` on fd 0 overrides the here-string, so bash makes no binding and the zero must
survive. A repair that reported BOTH rows would be loud in a direction the shell does not license.

**Prose that must move with the code**, or it becomes a stale citation that still reads true:

- the surface's documented-limits block (`tests/cross-cutting/psqlStartupFiles/scan.ts:280` through
  `tests/cross-cutting/psqlStartupFiles/scan.ts:297`), which calls this family "not read at all"
  and "the sharpest limit in this list";
- the block-2 comment declaring that "the attached TARGET is still never read as a binding. The
  zero below is the withdrawn family, unchanged by this arc" (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:5921`);
- the deciding suite's note declaring the attached `<<<p'sql'` spelling withdrawn scope that lives
  in scan.ts's documented-limits block rather than in the suite (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6171`).

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
| `tests/cross-cutting/psqlStartupFiles/scan.ts` | the attached-target branch at `tests/cross-cutting/psqlStartupFiles/scan.ts:1581`, which gains construct-aware delimiting, target RETENTION into the `targets` array, nested-body collection and the unlexable report; the documented-limits block at `tests/cross-cutting/psqlStartupFiles/scan.ts:280` through `tests/cross-cutting/psqlStartupFiles/scan.ts:297` |
| `tests/cross-cutting/psqlStartupFileSuppression.test.ts` | THREE pins retired across two blocks, two controls held, new cases for §4 |
| `tests/mutation/source/registry.ts` | `psqlStartupScan` accepted rows re-derived — the source edit moves every site below the lexer |
| `BACKLOG.md` / `BACKLOG-archive.md` | ledger closeout |

**A source edit voids the score.** The registry row's accepted rows are re-derived for this
change, and no `equivalent` or `accepted-gap` row is carried across the edit on the strength of
having been true before.
