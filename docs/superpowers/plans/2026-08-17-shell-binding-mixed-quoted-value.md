# Mixed-Quoted Assignment Bindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the psql startup-file scanner's assignment-binding recognition through
`lexShellWords` so quote-concatenated values (`PG=p'sql'`) are read the way the shell reads them,
and retire the wholly-quoted-or-wholly-bare regex family.

**Architecture:** One new module-scope helper in `scan.ts` derives assignment-binding line indexes
from the words `scanShellIndirection` already lexes; the per-line rule chain consumes that set in
place of `ASSIGNED_VALUE_QUOTED`/`ASSIGNED_WHOLE_QUOTED` (single-word values) and
`quotedValue`/`boundCommand` (multiword values). Four lexer fidelity fixes (spec §3.2: dangling
final backslash literal, double-quote backslash-newline removed, double-quote backslash literal
except before its four specials, ANSI-C escapes decoded) make the words bash-faithful first, so
the ratified trailing-backslash zeros fall out of shell semantics instead of pattern accidents.

**Tech Stack:** TypeScript, vitest, the repo's source-mutation gate (`pnpm mutation:guards`
scoped-run mechanics).

**Spec:** `docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md`
(sections cited as §N below). Probe record:
`docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md`.

## Global Constraints

- Invariant 1 (TDD per task), invariant 6 (commit per task, `fix(...)`/`test(...)`/`docs(...)`),
  invariant 11 (work in the `fix/shell-binding-mixed-quoted-value` worktree only).
- The R4 prefilter contract: the guard module must not contain `includes("psql")`
  (`tests/cross-cutting/psqlStartupFileSuppression.test.ts`, test "the walk has NO psql prefilter
  — it would undo every decoding fix"). The new helper's cheap skip uses regex tests on the
  DEQUOTED value only (Task 3 step 3 comment explains why that is not the forbidden shape).
- The trailing-backslash zeros are a ratified two-direction contract (spec §1.1): `PG='psql'\`
  and `export 'PG=psql'\` at end of input stay ZERO, and the same shell fact now also zeroes
  `PG=psql\`, `PG=psql\\`, `PG='psql\'`.
- Mutation enrolment (spec §7): surface `psqlStartupScan` keeps `scoreFloor: 1` and an EMPTY
  unaccepted-survivor set; the scoped gate re-runs in Task 6 and its numbers land in the PR body.
- Heavy-phase discipline: full-suite and mutation runs go through `pnpm heavy`; scoped
  single-file vitest runs stay unwrapped. Mutation runs happen in the FOREGROUND (2026-08-16
  batch lesson: backgrounded-across-turn runs get SIGTERM-killed).
- No new files except the temporary Task 6 shard filter (deleted before commit) and the plan/spec
  docs themselves. All production edits land in
  `tests/cross-cutting/psqlStartupFiles/scan.ts`; all test edits in
  `tests/cross-cutting/psqlStartupFileSuppression.test.ts`; ledger edits in `BACKLOG.md`;
  registry edits in `tests/mutation/source/registry.ts`.

**Meta-test inventory (mandatory declaration):** this plan EXTENDS no registry-bearing meta-test
and CREATES none. Affected existing structural guards, all exercised as-is: the R4 prefilter test,
`tests/mutation/_metaSourceShardIntegrity.test.ts` (which is why the Task 6 filter file is
deleted before any non-mutation suite run), `tests/mutation/_metaPremiseContract.test.ts`
(the deciding suite is referenced by an enrolled surface, so new premise lines must use
`tests/_shared/premise.ts` helpers). None of the auth/DB/admin registries applies — no Supabase,
DB, or UI surface is touched; `impeccable-gate: N/A — no UI surface` (closeout section).

**Mutation-family closure (mandatory for guard work):** the declared operator families for this
surface are exactly the registry row's `["relational-boundary", "regex-quantifier-bound"]`
(`tests/mutation/source/registry.ts`, id `psqlStartupScan`). This plan adds no family. A reviewer-
proposed new family is admissible only with a live escaping mutant demonstrated against the
shipped guard (AGENTS.md convergence criterion bullet 4).

**Registry count reconciliation (authored at plan time, from the live registry):** no accepted
row of `psqlStartupScan` cites a site inside the code this plan DELETES — the 18 `equivalent`
rows sit at scan.ts sites in `commentIndexPerLine`, `matchBrace`, `exemptionOnLines`,
`scanShellText`, `mapRawToLines`, `isStrongPrefixWord`, `prefixIsCommandish`,
`INTERPRETER_POSITIONAL_BINDING` (2107:21), the `logical` join (2155:54), and the YAML alias
resolvers; the deleted constants (`ASSIGNED_VALUE_QUOTED`, `ASSIGNED_WHOLE_QUOTED`,
`ASSIGNED_NAME`, `DECLARE_KEYWORD`, `quotedValue`) carried only KILLED mutants, which need no
rows. Expected Task 6 maintenance (corrected by plan round-1 finding 4): `decodeAnsiCEscape`
lands ABOVE `lexShellWords` (near current line 789), so FIFTEEN of the eighteen accepted rows
move — 1223, 1304, 1314, 1394, 1568, 1569, 1754, 1755, 1771, 1772, 2107, 2155, 2455, 2587,
2697 — and only 635, 695, 761 keep their coordinates; plus mutant-count drop from the deleted
regex sites, and fresh disposition of any NEW site the helper introduces. The spliced-loop kill
site (relational-boundary:2167:54) disappears with its consumers' rewrite only if the `spliced`
loop itself moves — it stays (`githubEnvWrite` still reads `spliced`), so its killing test keeps
working unchanged. `decodeAnsiCEscape` (Task 1) contributes NEW sites in both declared
families — `regex-quantifier-bound` on its `{1,3}`/`{1,2}` bounded quantifiers,
`relational-boundary` on the `next >= "0" && next <= "7"` octal guard. The quantifier mutants
are killed PREEMPTIVELY by the two digit-boundary zero pins in the Task 2 block (plan round-1
finding 3): `PG=$'\0160sql'` decodes to control-14 + `0sql` under the shipped `{1,3}` but to
`psql` under a widened `{1,4}` (the fourth octal digit turns 016 into 0160 = 0x70), and
`PG=$'\x070sql'` decodes to bell + `0sql` under `{1,2}` but to `psql` under `{1,3}` — so each
mutant flips a pinned zero to a hit. The octal-guard relational mutant is killable with a
`$'\7…'`-boundary case or argued per-site if genuinely equivalent.

---

<!-- tasks: depth=3 red-contract -->

### Task 1: Lexer fidelity — escape semantics per quoting context (spec §3.2, all four fixes)

**Files:**
- Modify: `tests/cross-cutting/psqlStartupFiles/scan.ts` (the backslash branch of
  `lexShellWords`'s character loop; the double-quote branch's escape handling; the `$'…'` skip;
  one new module-private helper `decodeAnsiCEscape`)
- Test: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**
- Consumes: `lexShellWords` (module-private), `appendRun`/`append` (its inner helpers), `sitesIn`
  (existing suite helper wrapping `scanSource`).
- Produces: words that carry a literal trailing `\` at end of input; double-quote bodies with
  bash's backslash rules (pair-removed continuations, literal backslash except before `$`,
  `` ` ``, `"`, `\`); decoded ANSI-C `$'…'` content via
  `decodeAnsiCEscape(text: string, at: number): { decoded: string; consumed: number }`. Task 2's
  predicate depends on all four.

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "lexer escape fidelity"` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:872` why=`the backslash branch drops a dangling final backslash, the double-quote branch appends the newline of a backslash-newline pair and drops the backslash of every other escape, and the ANSI-C skip feeds $'…' through the plain single-quote branch undecoded - so the new site assertions (psql-backslash not a site, "p\sql" not a site, --no-psqlrc-backslash uncertified) all read the wrong words today` ac=AC-6 -->

- [ ] **Step 1: Write the failing tests.** Add to the suite, next to the existing "a trailing
  backslash at end of input is literal, so it binds nothing" block:

```ts
// Spec §3.2: the lexer's escape infidelities, repaired as one class. Bash is
// the oracle for every row (probe record, round-1 supplement).
describe("lexer escape fidelity (spec 3.2)", () => {
  test("a psql command word glued to a dangling final backslash is not psql", () => {
    // The zero below is attributable to the backslash, not to a fixture that
    // never reaches the scanner (tests/_shared/premise.ts contract).
    premise("the same command WITH a newline is a site", sitesIn("psql\n", "x.sh").length, 0);
    expect(sitesIn("psql\\", "x.sh")).toHaveLength(0);
  });

  test("a certified flag glued to a dangling final backslash loses certification", () => {
    // Bash passes the argument `--no-psqlrc\` (supplement g7), which psql's
    // exact long-option recognition does not accept. Certifying it was a
    // false SAFE; the site stays, unsuppressed.
    const sites = sitesIn("psql --no-psqlrc\\", "x.sh");
    expect(sites).toHaveLength(1);
    expect(sites[0]!.suppressesStartupFiles).toBe(false);
  });

  test('a double-quoted "p\\sql" command word is not psql', () => {
    // Inside double quotes a backslash is LITERAL except before $ ` " \
    // (supplement g5: `PG="p\sql"` binds p-backslash-sql).
    premise(
      "the plainly double-quoted command word is a site",
      sitesIn('"psql" -X -qAt mydb\n', "x.sh").length,
      0,
    );
    expect(sitesIn('"p\\sql" -X -qAt mydb\n', "x.sh")).toHaveLength(0);
  });

  test("a double-quoted backslash-newline pair is removed, keeping the word whole", () => {
    // The R34 wrapped-path fixture reads through the word route once the
    // spliced consumer is gone (Task 2); this pins the LEXER half: the glued
    // path word is one site, on the opening line.
    const source = '"/opt/pg/\\\npsql" -X -qAt mydb\n';
    const sites = sitesIn(source, "x.sh");
    expect(sites).toHaveLength(1);
  });

  test("ANSI-C escapes decode, so an escaped spelling of psql is still psql", () => {
    // $'p\163ql' and $'\x70sql' both expand to psql (supplement g1/g2). As
    // COMMAND words they must be sites; before the decode they lexed as their
    // raw escape text and were silently nothing.
    expect(sitesIn("$'p\\163ql' -X -qAt mydb\n", "x.sh").length).toBeGreaterThan(0);
    expect(sitesIn("$'\\x70sql' -X -qAt mydb\n", "x.sh").length).toBeGreaterThan(0);
    // An unknown escape keeps BOTH characters, as bash does: $'p\zsql' is
    // p\zsql, never psql.
    expect(sitesIn("$'p\\zsql' -X -qAt mydb\n", "x.sh")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify the red set.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "lexer escape fidelity"`
Expected: all five FAIL (observed at plan time) — the dangling-backslash site reports today,
`--no-psqlrc\` certifies today, `"p\sql"` reports as a site today, the wrapped-path word carries
the appended NEWLINE so its basename is `\n`+psql and no site reports today, and both ANSI-C
spellings are invisible today.

- [ ] **Step 3: Implement.** Three edits in `lexShellWords` plus one helper.

(a) The top-level backslash branch — replace the final bare `continue` (the
`next === undefined` fall-through) with:

```ts
  // A dangling backslash at end of input escapes NOTHING, so bash keeps it as
  // a literal character of the word (`PG='psql'\` at EOF binds `psql\`).
  // Dropping it lexed the word as bare `psql` - a site for a command that is
  // not psql, and (post word-route) a binding the shell never makes.
  begin(i);
  append("\\", i, true);
  continue;
```

(b) The double-quote branch's escape handling — currently:

```ts
if (text[i] === "\\" && text[i + 1] !== undefined) {
  i++;
  if (text[i] === "\n") line++; // a continuation still eats a line
  append(text[i]!, i, true);
  continue;
}
```

becomes:

```ts
if (text[i] === "\\" && text[i + 1] !== undefined) {
  const escaped = text[i + 1]!;
  if (escaped === "\n") {
    // Bash REMOVES a backslash-newline pair inside double quotes outright
    // (line continuation), so `"/opt/pg/\` + newline + `psql"` is the single
    // word /opt/pg/psql. Appending the newline split the value the shell
    // glues together.
    line++;
    i++;
    continue;
  }
  if (escaped === "$" || escaped === "`" || escaped === '"' || escaped === "\\") {
    append(escaped, i + 1, true); // the backslash removes its meaning
    i++;
    continue;
  }
  // Before any other character the backslash is LITERAL and both survive:
  // "p\sql" is p-backslash-sql, never psql.
  append("\\", i, true);
  continue;
}
```

(the enclosing `for (; i < text.length && text[i] !== '"'; i++)` supplies one `i++` per
`continue`, so the two-character consumptions advance by two and the literal-backslash case
leaves the next character to the following iteration).

(c) The ANSI-C/locale skip — currently:

```ts
// ANSI-C (`$'…'`) and locale (`$"…"`) quoting are ordinary quoted words.
if (character === "$" && (text[i + 1] === "'" || text[i + 1] === '"')) {
  continue; // the quote itself is handled on the next iteration
}
```

becomes:

```ts
// ANSI-C quoting `$'…'` DECODES its escapes (\n, \163, \x70, …) and `\'` does
// NOT close the string; feeding it through the plain single-quote branch read
// the raw escape text, so $'p\163ql' was never psql. Locale quoting `$"…"`
// keeps double-quote semantics: skip the `$`, let the double-quote branch run.
if (character === "$" && text[i + 1] === "'") {
  begin(i);
  let k = i + 2;
  while (k < text.length && text[k] !== "'") {
    if (text[k] === "\\") {
      const { decoded, consumed } = decodeAnsiCEscape(text, k);
      // append, NOT appendRun: a DECODED "\n" is data, not a physical line -
      // appendRun's per-character line counting is for source text only.
      append(decoded, k, true);
      k += consumed;
      continue;
    }
    appendRun(text[k]!, k, true); // physical chars (incl. a literal newline) count lines
    k++;
  }
  i = k; // the closing quote (or end of input)
  continue;
}
if (character === "$" && text[i + 1] === '"') {
  continue; // the quote itself is handled on the next iteration
}
```

(d) The helper, at module scope above `lexShellWords`:

```ts
/**
 * Decode one ANSI-C escape at `text[at] === "\\"` inside `$'…'`, per bash:
 * the simple table, octal \nnn (1-3 digits), hex \xHH (1-2), \uHHHH (1-4),
 * \UHHHHHHHH (1-8), control \cX. An UNKNOWN escape keeps both characters,
 * exactly as bash does.
 */
function decodeAnsiCEscape(text: string, at: number): { decoded: string; consumed: number } {
  const next = text[at + 1];
  if (next === undefined) return { decoded: "\\", consumed: 1 };
  const simple: Record<string, string> = {
    a: "\x07",
    b: "\b",
    e: "\x1b",
    E: "\x1b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"',
    "?": "?",
  };
  const mapped = simple[next];
  if (mapped !== undefined) return { decoded: mapped, consumed: 2 };
  if (next >= "0" && next <= "7") {
    const octal = /^[0-7]{1,3}/.exec(text.slice(at + 1))![0];
    return { decoded: String.fromCharCode(parseInt(octal, 8) & 0xff), consumed: 1 + octal.length };
  }
  if (next === "x") {
    const hex = /^[0-9A-Fa-f]{1,2}/.exec(text.slice(at + 2));
    if (hex) return { decoded: String.fromCharCode(parseInt(hex[0], 16)), consumed: 2 + hex[0].length };
  }
  if (next === "u" || next === "U") {
    const width = next === "u" ? 4 : 8;
    const hex = new RegExp(`^[0-9A-Fa-f]{1,${width}}`).exec(text.slice(at + 2));
    if (hex) return { decoded: String.fromCodePoint(parseInt(hex[0], 16)), consumed: 2 + hex[0].length };
  }
  const control = text[at + 2];
  if (next === "c" && control !== undefined)
    return {
      decoded: String.fromCharCode(control.toUpperCase().charCodeAt(0) & 0x1f),
      consumed: 3,
    };
  return { decoded: `\\${next}`, consumed: 2 };
}
```

- [ ] **Step 4: Run the fidelity block plus every backslash/spelling test.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`
Expected: PASS across the file. The binding REGEXES are still live in this task and read raw
text, so no binding verdict moves yet; the R34 describe, the R3 spelling tests
(`p"s"ql`, `p\s\q\l`), and the ratified trailing-backslash block all stay green.

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts
git commit -m "fix(infra): lexer escape fidelity - EOF backslash, double-quote escapes, ANSI-C decode"
```

### Task 2: Single-word assignment bindings read lexed words

**Files:**
- Modify: `tests/cross-cutting/psqlStartupFiles/scan.ts` (delete `DECLARE_KEYWORD`,
  `ASSIGNED_NAME`, `ASSIGNED_VALUE_QUOTED`, `ASSIGNED_WHOLE_QUOTED`; add the helper; rewire
  `scanShellIndirection`)
- Test: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**
- Consumes: `lexShellWords` word array (already computed inside `scanShellIndirection` for nested
  bodies — capture its return value), `ShellWord` type, `READ_HERE_STRING` (kept).
- Produces: module-scope `assignmentBindingLines(words: ShellWord[], file: string): Set<number>`
  returning 0-indexed opening line numbers of binding words. Task 3 extends its multiword branch;
  in this task multiword values are still handled by the untouched `quotedValue`/`boundCommand`
  path.

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "mixed-quoted assignment"` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2070` why=`ASSIGNED_VALUE_QUOTED and ASSIGNED_WHOLE_QUOTED admit one optional delimiter around a delimiter-free span, so every quote-concatenated value (PG=p'sql') fails both and scanShellIndirection returns zero hits for the thirteen recall rows` ac=AC-1,AC-3,AC-4,AC-5,AC-7 -->

- [ ] **Step 1: Write the failing accept-set block.** Add a new describe to the suite:

```ts
describe("mixed-quoted assignment values (BL-SHELL-BINDING-MIXED-QUOTED-VALUE)", () => {
  // The shell reads an assignment value as a CONCATENATION of quoted, escaped
  // and bare segments; the retired regex pair read one delimiter form. Oracle
  // per row: the probe record (instrument 2) - every value below reassembles
  // to psql or a psql path.
  test.each([
    ["quoted then bare", "PG=p'sql'\n"],
    ["bare then quoted", "PG='p'sql\n"],
    ["double-quoted split", 'PG="ps"ql\n'],
    ["quoted path prefix", "PG='/usr/bin/'psql\n"],
    ["escaped spelling", "PG=p\\sql\n"],
    ["ANSI-C quoted", "PG=$'psql'\n"],
    ["ANSI-C octal escape", "PG=$'p\\163ql'\n"],
    ["ANSI-C hex escape", "PG=$'\\x70sql'\n"],
    ["locale quoted", 'PG=$"psql"\n'],
    ["mixed inside declare", "declare -x PG=p'sql'\n"],
    ["mixed whole-argument quoting", "export 'PG=p'sql\n"],
    // Word-splitting trims an unquoted expansion (spec §3.1 trim; supplement
    // g3/g6): both of these run psql at their use sites.
    ["quoted leading space", "PG=' psql'\n"],
    ["ANSI-C trailing newline", "PG=$'psql\\n'\n"],
  ])("%s binds the psql command and is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  // The same shell fact as the ratified trailing-backslash contract, applied
  // uniformly: a value whose expansion ends in a literal backslash has an
  // empty basename and is never the psql command. All three REPORTED before
  // this repair (probe record, instrument 1) - shell-false hits.
  test.each([
    ["bare value, dangling final backslash", "PG=psql\\"],
    ["bare value, escaped backslash at end of input", "PG=psql\\\\"],
    ["single-quoted literal trailing backslash", "PG='psql\\'\n"],
  ])("%s binds a trailing-backslash value and is NOT reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });

  // Precision survivors: values whose dequoted text is NOT the psql command.
  // `PG='psql'x` and the EOF-backslash pair are already pinned by the ledger
  // entry's corrected non-instances and the ratified contract test; these two
  // are the NEW spellings this block must hold at zero.
  test.each([
    ["quoted semicolon value", "PG='psql;x'\n"], // binds `psql;x`
    ["whole-argument quoting with a literal quote", "export 'PG=p'\\''sql'\n"], // binds `p'sql`
    ["double-quoted literal backslash", 'PG="p\\sql"\n'], // binds `p\sql` (supplement g5)
    ["ANSI-C unknown escape", "PG=$'p\\zsql'\n"], // binds `p\zsql` (bash keeps both chars)
    // Digit-boundary pins, doubling as PREEMPTIVE mutant kills for the
    // decodeAnsiCEscape quantifier sites (Task 6 / Global Constraints): a
    // widened octal {1,4} would decode \0160 as 0x70 (`psql`) where bash's
    // three-digit read yields control-14 + `0sql`; a widened hex {1,3} would
    // decode \x070 as 0x70 where bash's two-digit read yields bell + `0sql`.
    ["ANSI-C octal digit bound", "PG=$'\\0160sql'\n"], // binds SO + `0sql`, never psql
    ["ANSI-C hex digit bound", "PG=$'\\x070sql'\n"], // binds BEL + `0sql`, never psql
  ])("%s does not bind psql and stays unreported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh")).toHaveLength(0);
  });

  // The R34 wrapped-path binding must survive the spliced consumer's deletion:
  // the double-quote continuation fix (Task 1) glues the word, the word route
  // reads it. Premise-style duplicate of the committed R34 fixture, kept here
  // because THIS block is the one that owns the regex deletion.
  test("a double-quoted backslash-newline wrapped path still binds", () => {
    expect(
      scanShellIndirection('PSQL="/opt/postgresql/17/bin/\\\npsql"\n"$PSQL" -qAt mydb\n', "x.sh")
        .length,
    ).toBeGreaterThan(0);
  });

  // Conservative widening, spec §4: the expansion-prefixed psql suffix is the
  // same trailing-path shape isPsqlCommandWord treats as psql-capable.
  test("an expansion-prefixed psql suffix is reported", () => {
    expect(scanShellIndirection("PG=$(x)psql\n", "x.sh").length).toBeGreaterThan(0);
  });

  // Structural handoff, spec §3.1: a substitution VALUE is the discovery
  // walk's jurisdiction, not the binding rule's - the opaque `${}` word
  // carries no psql text, and visitBody still reports the body.
  test("a binding inside a substitution body is still reported by discovery", () => {
    expect(
      scanShellIndirection('X=$(PG=psql; "$PG" -qAt mydb)\n', "x.sh").length,
    ).toBeGreaterThan(0);
  });

  // Spec 3.1 reporting parity (round-2 finding 2): every assignment-shaped
  // word is examined independently - a non-qualifying one neither reports nor
  // shadows a later binding on the same line.
  test("a non-qualifying assignment does not shadow a later binding on the line", () => {
    expect(scanShellIndirection("A=no PG=psql\n", "x.sh").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify the red set.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "mixed-quoted assignment"`
Expected: the thirteen recall rows FAIL (0 hits each), the three trailing-backslash rows FAIL
(1 hit each today), `PG=$(x)psql` FAILS (0 hits today). The six precision survivors (including
both digit-boundary mutant-kill pins), the R34 wrapped-path duplicate, the discovery handoff,
and the non-shadowing parity pin PASS (regression premises for the green step, not red cases —
the ANSI-C-dependent zero rows read correctly because Task 1's decode landed first).

- [ ] **Step 3: Implement.** In `scan.ts`:

(a) Delete the four constants `DECLARE_KEYWORD`, `ASSIGNED_NAME`, `ASSIGNED_VALUE_QUOTED`,
`ASSIGNED_WHOLE_QUOTED` and their doc comments. `PSQL_VALUE` STAYS (`READ_HERE_STRING` is built
from it). Replace the deleted block's narrative with:

```ts
/**
 * Assignment bindings are read from LEXED WORDS, not from raw line text. The
 * lexer already performs the quote removal, escape processing and word
 * assembly the shell does, so `PG=psql`, `export "PG=psql"`, `PG=p'sql'`,
 * `PG=p\sql` and `PG=$'psql'` are all the same word once lexed - the regex
 * family this replaces admitted exactly one delimiter form per pattern and
 * needed a new spelling per review round (BL-SHELL-BINDING-MIXED-QUOTED-VALUE;
 * design: docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md).
 */
const ASSIGNMENT_WORD = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=([\s\S]*)$/;
```

(b) Add the helper directly below `ASSIGNMENT_WORD` (Task 3 fills the multiword branch; in this
task it falls through, leaving multiword values to the still-live `quotedValue` path):

```ts
/**
 * Opening line indexes (0-based) of words that BIND the psql command name.
 * Position-independent on purpose: `env PG=psql cmd` binds at argument
 * position, and the retired patterns fired anywhere after a separator too.
 * A `$(…)`/backtick value lexes to the opaque `${}` and stays the discovery
 * walk's jurisdiction; a `${…}` expansion is kept verbatim, so the
 * parameter-default forms still report here.
 */
function assignmentBindingLines(words: ShellWord[], file: string): Set<number> {
  const found = new Set<number>();
  for (const word of words) {
    if (word.operator) continue;
    const match = ASSIGNMENT_WORD.exec(word.text);
    if (!match) continue;
    // Trim default-IFS edges (space, tab, newline): an unquoted expansion
    // word-splits, so `PG=' psql'` and `PG=$'psql\n'` both run psql at their
    // use sites (spec 3.1; probe supplement g3/g6).
    const value = match[1]!.replace(/^[ \t\n]+|[ \t\n]+$/g, "");
    if (value.length === 0) continue;
    if (/\s/.test(value)) continue; // multiword values: Task 3
    // The PSQL_VALUE core, decided on the DEQUOTED value: psql with word
    // boundaries, no surviving quote or separator DATA characters (a quoted
    // `;` binds `psql;x`, which is not the psql command), and no trailing
    // literal backslash - the expanded word's basename would be empty, the
    // same shell fact the ratified trailing-backslash contract test pins.
    if (!/\bpsql\b/.test(value)) continue;
    if (/["';|&]/.test(value)) continue;
    if (value.endsWith("\\")) continue;
    found.add(word.line);
  }
  return found;
}
```

(c) In `scanShellIndirection`, capture the words and consume the set:

```ts
const nested: NestedShell[] = [];
const words = lexShellWords(source, nested);
```

(the existing `lexShellWords(source, nested);` call — same call, return value now captured), then
immediately after the `visitBody` loop:

```ts
const bindingLines = assignmentBindingLines(words, file);
```

and in the per-line loop replace

```ts
const assigned =
  ASSIGNED_VALUE_QUOTED.exec(spliced) ??
  ASSIGNED_WHOLE_QUOTED.exec(spliced) ??
  READ_HERE_STRING.exec(spliced);
```

with

```ts
const assigned = bindingLines.has(index) ? ["", ""] : READ_HERE_STRING.exec(spliced);
```

The `file` parameter is unused by the single-word branch; it is part of the signature because
Task 3's multiword branch passes it to `scanShellText`. If lint flags the unused parameter in
this intermediate state, name it `file` anyway and add the Task 3 branch in the same PR — the
tasks are sequential commits, not separate PRs.

- [ ] **Step 4: Run the block, the binding sections, and the walk.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`
Expected: PASS across the file — the new block green; the existing "%s is reported as an
indirection" families (R17/R18/R19/R29 binding tests), the prose zero (`MSG="psql failed"`), the
comment-mention zero, the ratified trailing-backslash block, and the live-tree walk ("the widened
binding reading leaves the tree certified") all unchanged. This full-file run is the scoped
regression gate for the regex deletion.

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts
git commit -m "fix(infra): assignment bindings read lexed words — mixed-quoted values close"
```

### Task 3: Multiword command bindings through the same helper

**Files:**
- Modify: `tests/cross-cutting/psqlStartupFiles/scan.ts` (fill the multiword branch; delete the
  `quotedValue` regex and `boundCommand`)
- Test: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**
- Consumes: `assignmentBindingLines` (Task 2), `scanShellText` (existing, signature
  `scanShellText(text: string, file: string, lineOffset: number): PsqlSite[]`).
- Produces: the multiword branch inside `assignmentBindingLines`; `quotedValue`/`boundCommand`
  deleted from `scanShellIndirection`.

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "multiword binding value"` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2204` why=`the quotedValue regex requires the whole multiword value inside ONE quote pair, so a segment-split value (CMD='psq'"l -qAt mydb") and an inner-quoted spelling (CMD='p"s"ql -X mydb') both return zero hits` ac=AC-2 -->

- [ ] **Step 1: Write the failing tests.** Append to the Task 2 describe:

```ts
  // A MULTIWORD command binding read as the lexer's dequoted concatenation:
  // the retired quotedValue regex required the whole value inside ONE quote
  // pair, so a segment split anywhere lost it.
  test.each([
    ["a segment-split command binding", "CMD='psq'\"l -qAt mydb\"\neval \"$CMD\"\n"],
    ["an inner-quoted spelling in the value", "CMD='p\"s\"ql -X mydb'\neval \"$CMD\"\n"],
  ])("multiword binding value: %s is reported", (_label, source) => {
    expect(scanShellIndirection(source, "x.sh").length).toBeGreaterThan(0);
  });

  // Documented limit, spec §6 item 2 (round-1 finding 1): a quoted YAML `run:`
  // scalar lexes to ONE assignment word whose multiword value's psql command
  // carries no flag token - the -qAt below belongs to the $PG command - and
  // the flag criterion (deliberately unchanged) is the line between a command
  // binding and prose. Plain and mixed spellings alike are declared misses.
  test.each([
    ["the plain spelling", '- run: "PG=psql; $PG -qAt mydb"\n'],
    ["the mixed spelling", "- run: \"PG=p'sql'; $PG -qAt mydb\"\n"],
  ])("multiword binding value: a quoted run: scalar (%s) stays a limit", (_label, source) => {
    expect(scanShellIndirection(source, ".github/workflows/x.yml")).toHaveLength(0);
  });
```

- [ ] **Step 2: Run to verify the red set.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "multiword binding value"`
Expected: the two recall rows FAIL (0 hits each today); both documented-limit zeros PASS
(regression premises).

- [ ] **Step 3: Implement.** In `assignmentBindingLines`, replace
`if (/\s/.test(value)) continue; // multiword values: Task 3` with:

```ts
    if (/\s/.test(value)) {
      // A MULTIWORD value binds a command LINE (`CMD='psql -qAt mydb'; eval
      // "$CMD"`): re-lex the dequoted value and require a psql site carrying a
      // flag-shaped token - the same criterion the retired quotedValue path
      // used, which keeps prose (`MSG="psql failed to connect"`) out. The
      // cheap skip below is NOT the forbidden R4 prefilter: it runs on the
      // already-DEQUOTED value, and any spelling of psql the literal test
      // misses must still carry a quote or backslash character, which the
      // second alternative admits.
      if (!/\bpsql\b/.test(value) && !/["'\\]/.test(value)) continue;
      const bound = scanShellText(value, file, 0).some((site) =>
        site.tokens.some((token) => /^-{1,2}[A-Za-z0-9]/.test(token)),
      );
      if (bound) found.add(word.line);
      continue;
    }
```

Then in `scanShellIndirection` delete the `quotedValue` regex, the `boundCommand` ternary, and
remove `boundCommand` from the hit chain:

```ts
const hit = assigned ?? aliased ?? functionDef ?? githubEnvWrite ?? positionalBinding;
```

(the `logical` join stays — `INTERPRETER_POSITIONAL_BINDING` still reads it; its comment block
loses the "bound-command rule uses it" sentence, which moves to the helper's comment above).

- [ ] **Step 4: Run the full deciding suite.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`
Expected: PASS — including the existing bound-command pins: "a multiline quoted command binding
is an indirection", "the single-line binding still reports, and prose still does not"
(`CMD='psql -qAt mydb'` → 1, `MSG="psql failed to connect"` → 0), and the live-tree walk.

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts
git commit -m "fix(infra): multiword command bindings read the lexer's dequoted value"
```

<!-- tasks: end -->

### Task 4: Documented limits, here-string peer ledger row

(Deliberately OUTSIDE the task-marker regions, like Task 5: it authors declarations and pins of
CURRENT behavior — there is no defective production line whose repair turns a red green, so a
red-contract marker cannot be truthfully written for it. Plan round-1 finding 1.)

**Files:**
- Modify: `tests/cross-cutting/psqlStartupFiles/scan.ts` (module-header documented-limits note)
- Modify: `BACKLOG.md` (new entry `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE`)
- Test: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the documented-limit pin tests and the ledger row later work schedules from.

- [ ] **Step 1: Write the documented-limit pins.** New describe in the suite:

```ts
describe("documented limits - quote-concatenated spellings outside the assignment family", () => {
  // Spec §6: these families still read their KEYWORD or operand through a
  // per-line pattern, so a quote-concatenated spelling of it is missed. The
  // failure direction is a missed report, never a false certification. Each
  // zero is DECLARED here so it cannot drift silently. Premises use
  // tests/_shared/premise.ts and run in ONE test over a literal array - never
  // inside a .each callback, per the executable-premise rule (plan round-1
  // finding 5).
  test("each quote-concatenated keyword/operand spelling is a declared miss", () => {
    const rows: Array<[label: string, missed: string, plain: string]> = [
      // ledger: BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE - the here-string
      // target is a redirection operand the lexer drops before words exist.
      ["a mixed-quoted here-string", "read -r PG <<< p'sql'\n", "read -r PG <<< psql\n"],
      ["a mixed-quoted alias name", "alias p'sql'='psql -F'\n", "alias psql='psql -F'\n"],
      [
        "a mixed-quoted interpreter positional",
        "bash -c '$0 -qAt mydb' p'sql'\n",
        "bash -c '$0 -qAt mydb' psql\n",
      ],
    ];
    for (const [label, missed, plain] of rows) {
      premiseHolds(
        `${label}: the plain spelling reaches the rule`,
        scanShellIndirection(plain, "x.sh").length > 0,
      );
      expect(scanShellIndirection(missed, "x.sh"), label).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Run the block.**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts -t "documented limits"`
Expected: PASS — these pin CURRENT behavior (all three rows probed green at plan time). This
task's substance is declarations, which is why it sits outside the red-contract regions.

- [ ] **Step 3: Add the module-header documented-limits note.** In the scan.ts header comment
block (the "Documented limits" region near the R28–R40 narrative — append after the existing
numbered items):

```
 *  - Quote-concatenated spellings of a rule KEYWORD or non-assignment operand
 *    (`alias p'sql'=…`, `function p'sql' …`, a mixed-quoted interpreter
 *    positional, a mixed-quoted here-string target — ledger
 *    BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE) are not recognized by those rule
 *    families; assignment VALUES are lexer-read and immune. Missed report,
 *    never a false certification. A binding inside a quoted YAML scalar with
 *    its own inner shell quoting is one indirection deeper than the shell
 *    layer reads. `PG=$(x)psql`-shaped values over-report conservatively.
```

- [ ] **Step 4: File the ledger row.** In `BACKLOG.md`, after the
`BL-SHELL-BINDING-MIXED-QUOTED-VALUE` entry (which the closing PR moves to the archive), insert:

```markdown
## BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE — a mixed-quoted here-string target is not read as a binding

**Status:** OPEN · **Filed:** 2026-08-17 (`fix/shell-binding-mixed-quoted-value`, class sweep of the mixed-quoted-value repair). **Severity:** LOW (guard recall; needs `read` + a here-string + a quote-concatenated value). **Class:** guard coverage. **Effort:** M. **Class-sweep exception:** (c) — the repair requires retaining redirection TARGETS in `lexShellWords`, a lexer surface the assignment-binding repair does not otherwise touch, with ripple into every redirection consumer. **Reachability:** PROBED — `read -r PG <<< p'sql'` binds `psql` (bash oracle) and `scanShellIndirection` reports 0 (probe record `docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md`, instruments 1–2); zero live corpus instances.

`READ_HERE_STRING` (`tests/cross-cutting/psqlStartupFiles/scan.ts`) reads the here-string value through the single-delimiter `["']?` + `PSQL_VALUE` shape the assignment family retired in the 2026-08-17 mixed-quoted-value repair; the lexer cannot supply the dequoted value because a redirection target is dropped before words exist (`dropWord`). The deciding suite declares the miss ("documented limits — quote-concatenated spellings outside the assignment family"). **What would close it:** retain redirection targets as non-argv words (flagged, not certified) so `READ_HERE_STRING`'s value can be read dequoted, and re-pin the declared miss as a hit; the flag criterion and the `read` grammar stay unchanged.
```

- [ ] **Step 5: Run the docs meta-suites and commit.**

Run: `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`
Expected: PASS (the new row declares no flight fields).

```bash
git add tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts BACKLOG.md
git commit -m "docs(infra): declare the quote-concatenation limits; file the here-string peer"
```

### Task 5: Whole-tree gates

(Verification-only — deliberately OUTSIDE the task-marker regions: it authors no red and changes
no behavior; each command below is its own pass criterion. Fix-forward if anything reds, then
re-run from step 1.)

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: everything above.
- Produces: the green tree the mutation re-run (Task 6) baselines against.

- [ ] **Step 1: Full deciding suite + walk (scoped, unwrapped).**

Run: `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts`
Expected: PASS, including "the widened binding reading leaves the tree certified" — the repair
changes no verdict on the live corpus (spec §7 live-tree gate).

- [ ] **Step 2: Typecheck + lint + spec lint.**

Run: `pnpm typecheck && pnpm exec eslint tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts && pnpm spec:lint docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md`
Expected: exit 0; spec:lint reports 0 hard findings per document.

- [ ] **Step 3: Full suite (wrapped).**

Run: `pnpm heavy pnpm test`
(`pnpm heavy test` would execvp the external `test` builtin, not the package script — plan
round-1 finding 2.)
Expected: PASS. The temporary Task 6 filter file must NOT exist yet
(`_metaSourceShardIntegrity` walks `tests/mutation/` from disk).

- [ ] **Step 4: Commit only if fixes were needed;** otherwise nothing to commit.

<!-- tasks: depth=3 red-contract -->

### Task 6: Scoped mutation gate re-run + registry maintenance

**Files:**
- Create (TEMPORARY): a filter file inside `tests/mutation/` whose basename is
  "guardSurfaces.shardScoped" plus the test-file suffix, so it matches the mutation project's
  shard glob — deleted in step 5, never committed, and deliberately not written here as a
  citation-shaped path because the file must never be tracked.
- Modify: `tests/mutation/source/registry.ts` (the `psqlStartupScan` row: accepted `siteId`
  line:col refresh, row-comment kind counts, any new-site dispositions)
- Modify (as reconciliation demands - plan round-1 finding 3):
  `tests/cross-cutting/psqlStartupFileSuppression.test.ts` (kill tests for new surviving sites;
  the two digit-boundary quantifier kills are pre-planted by Task 2) and
  `tests/mutation/source/expectedLedgerKinds.ts` (its exact kind-count assertion moves whenever
  the accepted row set's counts move)

**Interfaces:**
- Consumes: `GUARD_SURFACES`, `registerSurfaceCases` (`tests/mutation/source/surfaceCases.ts`),
  the mutation project glob `tests/mutation/guardSurfaces.shard*.test.ts` (vitest.projects.ts).
- Produces: a passing enrolled surface at `scoreFloor: 1` with an empty unaccepted-survivor set
  over the POST-REPAIR source; the run's numbers for the PR body.

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardScoped.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:1790` why=`the accepted rows pin pre-repair line:col siteIds (e.g. relational-boundary:2155:54); after the scan.ts edits those coordinates no longer name their sites, so the gate reports ledger rows that match no mutant and/or unaccepted survivors at the shifted coordinates` ac=AC-9 -->

- [ ] **Step 1: Create the temporary scoped filter file** (matches the mutation project's
`guardSurfaces.shard*` glob; fails `_metaSourceShardIntegrity` while present, which is why it is
deleted in step 5 before any non-mutation suite run):

```ts
// TEMPORARY scoped mutation run for the psqlStartupScan surface - NEVER COMMIT.
// Mechanics per the 2026-08-16 batch lessons: filter before registerSurfaceCases;
// a -t name filter prunes only reporting (runSurface executes at module scope).
import { GUARD_SURFACES } from "./source/registry";
import { registerSurfaceCases } from "./source/surfaceCases";

registerSurfaceCases(GUARD_SURFACES.filter((surface) => surface.id === "psqlStartupScan"));
```

- [ ] **Step 2: Run it — FOREGROUND, wrapped.**

Run: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardScoped.test.ts`
Expected: FAIL on first run — stale accepted `siteId`s (see the marker's why). Roughly 93s per
enrolled-surface run (2026-08-16 measurement).

- [ ] **Step 3: Reconcile the registry row.** Using the run's reported mutant list:
  - refresh each accepted row's `siteId` line:col to the post-repair coordinates of the SAME site
    (the reasons already anchor by symbol; verify each still describes its site);
  - drop nothing else: no accepted row cites deleted code (plan-time reconciliation, Global
    Constraints) — if the run proves otherwise, that row's mutant no longer exists and the row is
    deleted with a note in the commit message;
  - for any NEW site in `assignmentBindingLines` or the lexer edit that survives: kill it with a
    test in the deciding suite if it is a real gap, or add a per-site `equivalent` row with its
    own argued reason and boundary pin (spec §7); an `accepted-gap` row requires moving
    `scoreFloor` per the row's own floor comment;
  - update the row's narrative comment: post-repair mutant count and kind counts from the run.

- [ ] **Step 4: Re-run until green.**

Run: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardScoped.test.ts`
Expected: PASS — score 1.0 counted, empty unaccepted-survivor set.

- [ ] **Step 5: Delete the temporary file, prove it, run the meta.**

```bash
rm tests/mutation/guardSurfaces.shardScoped.test.ts
git status --porcelain tests/mutation/  # expect: only registry.ts modified
```

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts \
  tests/cross-cutting/psqlStartupFileSuppression.test.ts
git commit -m "test(infra): re-derive psqlStartupScan accepted sites over the lexer-routed scan"
```

(Stage `expectedLedgerKinds.ts` and the deciding suite only when step 3 actually changed them;
`git add` on an unchanged path is a no-op, so the command is safe either way.)

<!-- tasks: end -->

---

## Plan-time observed red set (executed 2026-08-17, pre-implementation tree; re-run after the
spec's round-1 revision)

Every fenced test block above was spliced into a temporary suite file and RUN against the
unmodified tree (2026-08-16 batch lesson: executable plan blocks are executed, not read).
Re-executed after the plan round-1 repairs with the final block contents (premise helpers, the
two digit-boundary zero pins, the non-shadowing parity pin, Task 4 as a single looped test):
36 tests, 24 failed, 12 passed — matching the tasks' predictions exactly. Red: all five Task 1
fidelity tests, the thirteen Task 2 recall rows, the three trailing-backslash rows, the
expansion-prefix widening, and both Task 3 multiword recall rows. Green (regression premises):
the six Task 2 precision-survivor zeros (including both digit-boundary mutant-kill pins, probed
against bash: `\0160sql` binds SO+`0sql`, `\x070sql` binds BEL+`0sql`), the R34 wrapped-path
binding duplicate, the discovery handoff, the non-shadowing parity pin, both Task 3
quoted-scalar limits, and the Task 4 documented-limits test. The splice file was deleted after
the run. Red: all five Task 1
fidelity tests (including the wrapped-path site test — the current double-quote branch appends
the newline into the word, so no site reports today), all thirteen Task 2 recall rows, all three
trailing-backslash rows, the expansion-prefix widening, and both Task 3 multiword recall rows.
Green (regression premises, as predicted): the four Task 2 precision survivors, the R34
wrapped-path binding duplicate (today via the `spliced` regex consumer), the discovery handoff,
both Task 3 quoted-scalar limits, and the three Task 4 documented-limit rows. The splice file
was deleted after the run.

## Acceptance criteria (from spec §4)

- **AC-1:** the thirteen single-word recall rows (Task 2 block) report ≥1 indirection each.
- **AC-2:** the segment-split multiword binding and the inner-quoted spelling report; both quoted
  `run:` scalar spellings (plain and mixed) stay declared limits (spec §6 item 2).
- **AC-3:** the three trailing-backslash-value spellings report ZERO (were 1).
- **AC-4:** every parity zero from the probe record stays zero (`PG='psql'x`, the ratified EOF
  pair, prose, `PG=notpsql`, `PG='psql;x'`, `export 'PG=p'\''sql'`, comment mention, `DSN=…`).
- **AC-5:** every baseline hit from the probe record still reports (bare/quoted/whole-argument/
  path/param-default/subscript/append/declare rows), and the full suite passes.
- **AC-6:** the Task 1 fidelity block passes in full — the dangling-backslash psql word is not a
  site, `psql --no-psqlrc\` at EOF reports UNSUPPRESSED, `"p\sql"` is not a site, the
  double-quoted wrapped path is one site, the ANSI-C spellings are sites and the unknown escape
  is not — and the live-tree walk test passes unchanged.
- **AC-7:** substitution values stay the discovery walk's jurisdiction (`PG=$(command -v psql)`
  and `X=$(PG=psql; …)` still report exactly once, via discovery).
- **AC-8:** the documented-limits describe declares the here-string/alias/positional misses with
  premises, and `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE` is filed with probe evidence.
- **AC-9:** the scoped mutation gate passes at `scoreFloor: 1` with an empty unaccepted-survivor
  set over the post-repair source; numbers land in the PR body.

## Closeout

impeccable-gate: N/A — no UI surface

Closing-PR mechanics (implementation session): graduate
`BL-SHELL-BINDING-MIXED-QUOTED-VALUE` to `BACKLOG-archive.md` and strip its
`**Status:** IN PROGRESS · **Branch:** …` marker in the PR's LAST commit (invariant 12 — the
marker never reaches main; the archive move and the marker strip are one commit). Whole-diff
cross-model review before merge; `gh pr merge --merge --auto` re-armed after every push; Stage
4.4 `0  0` check, cron delete, pane/agent label clear.
