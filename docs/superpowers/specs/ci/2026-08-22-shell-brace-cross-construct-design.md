# The delimiter walk counts its own pair across other constructs

**Ledger:** `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND` (`BACKLOG.md:263`).
**Surface:** `tests/cross-cutting/psqlStartupFiles/scan.ts`, enrolled as `psqlStartupScan`
(`tests/mutation/source/registry.ts:2420`).
**Base:** `50ca72a56`, where `scan.ts` is blob `61adf448c3447533db0f54178e0242aa9afca04b`. Every
number below was measured at that revision and carries the command that produced it.

**Every `file:line` here is BASE-STAMPED at `50ca72a56`, and the SYMBOL beside it is the durable
identity.** §3 edits `matchBraceSpan`, so every line below it moves; a citation re-pointed at HEAD
is stale within the hour, and the sibling arc measured the sharper failure — a citation that still
RESOLVES while pointing at different code, which `RED_TARGET_INVALID` cannot see. Resolve any
citation by grepping the named symbol, never by trusting the number. The only lint figure this
document owes is **0 hard**; re-derive the advisory count rather than reading a written one:

```
pnpm spec:lint docs/superpowers/specs/ci/2026-08-22-shell-brace-cross-construct-design.md
```

**Sequencing.** `arc-yamlquote` (`BL-SHELL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE`, branch
`fix/yaml-run-scalar-quoting-decode`) edits the same file's YAML decode path and merges FIRST.
Implementation of this design starts after that merge and opens with a rebase, a re-key
(`pnpm mutation:sites`) and a re-run of every probe below. The two diffs do not overlap: that arc
owns `scanWorkflowSource`'s decode, this one owns `matchBraceSpan`.

---

## 1. The defect, and the fork the ledger row poses

`matchBraceSpan` (`tests/cross-cutting/psqlStartupFiles/scan.ts:973`) walks forward counting one
delimiter pair. It tracks quotes and escapes, and it knows nothing else — so a delimiter belonging
to a DIFFERENT construct is counted as its own:

```js
if (character === open) depth++;
else if (character === close) {
  depth--;
  if (depth === 0) return { index: i, closed: true };
}
```

A `}` inside a nested `$()` therefore closes the enclosing `${` early, and a `)` inside a nested
`${}` closes the enclosing `$()` early. Both readings disagree with bash, and the two failure
directions are the two the consequence bound forbids: one shape is a SILENT MISS, the other a WRONG
ATTRIBUTION.

**Seven consumers, one walk.** The ledger row says five callers; the measured figure is six call
sites of `matchBrace` plus one of `matchBraceEnd`, all funnelling through `matchBraceSpan`
(`grep -n 'matchBrace(\|matchBraceEnd(' tests/cross-cutting/psqlStartupFiles/scan.ts`, minus the two
definitions):

| consumer | at base | what it wants from the walk |
|---|---|---|
| `lexShellWords`, `${…}` branch | `scan.ts:1561` | the end of an expansion consumed whole, whose operand is then re-lexed |
| `lexShellWords`, `$((` arithmetic | `scan.ts:1600` | the end of an arithmetic span, whose interior stays a live lexing context |
| `lexShellWords`, `$(`/`<(`/`>(` | `scan.ts:1630` | the end of a substitution body, collected into `nested` |
| `lexShellWords`, `$((` inside double quotes | `scan.ts:1728` | the same, in the double-quoted alphabet |
| `lexShellWords`, `$(` inside double quotes | `scan.ts:1745` | the same |
| `acceptedExpansionOperand` | `scan.ts:1975` | a BOUNDARY test — is this span, in its entirety, one expansion? |
| `attachedTargetEnd`'s `substitutionOpenerEnd` | `scan.ts:1131` | the end of a construct inside an attached redirection target, via `matchBraceEnd` |

The seventh is the only one that distinguishes closed from unclosed; the other six take the index
either way. That asymmetry is load-bearing in §3: a repair that changed what `matchBrace` RETURNS on
an unclosed span would change six call sites' behaviour at once, and this design does not.

### 1.1 The fork, argued, with the perf bound that decides it

The ledger row states that the obvious repair is not viable as written: a construct-aware prototype
fixed all four shapes and then took 400s over the live corpus against the shipped walk's 13s, so its
digest-stability was unprovable. The row names three ways forward. All three are argued here, and
the deciding input is a measurement, not a preference.

**Branch A — a single-pass tokeniser.** Rewrite `lexShellWords` to emit a construct tree once and
have every consumer read the tree instead of re-walking the text. It is the structurally right
answer to "seven consumers each re-deriving the same boundaries", and it is REFUSED for this arc:
it rewrites the whole lexer on an ENROLLED guard surface, re-keys all thirty registry rows, and
lands a diff whose review scope is the blowup AGENTS.md's class-sweep exception (c) exists to name.
It also buys nothing measurable — see the numbers below. A tokeniser is a defensible future arc
carrying its own numbers; it is not this repair.

**Branch B — memoise the walk.** Cache `matchBraceSpan` per `(text, start, open, close)` so a span
re-entered by an enclosing construct is computed once. This is the row's own suggested remedy, and
it is DECLINED on measurement: §2.4 shows the construct-aware walk costs nothing detectable over the
live corpus, so the cache would be machinery bounding a cost that is not being paid. It also adds a
failure mode the walk does not have today — a cache keyed on a string identity, invalidated by
nothing, inside a module whose callers pass overlapping slices of the same text. **Re-file trigger:**
a live-corpus scan time that exceeds the §4 AC-6 budget, which is what would make the cost real.

**Branch C — decline and surface.** Keep the shipped walk, detect a cross-construct delimiter
lexically, and emit an advisory instead of resolving it — closing the row as a documented limit.
This is a first-class outcome when the repair cannot be afforded, and it is REFUSED here for a
reason independent of cost: the live corpus holds **6 mixed `${…}`/`$(…)` nestings across 2 files**
(§2.3), none of them a crossing, and an advisory that fires on lexical mixing would fire on all six.
False advisories on the live corpus are the direction the consequence bound forbids, so branch C
trades a silent miss with zero live population for a loud wrong answer with six.

**Branch D — construct-aware delegation, and it is what §3 specifies.** When the walk meets an
opener belonging to another construct, it asks THAT construct's own closer where the construct ends
and resumes past it. No new grammar: the closers already exist and are already shared
(`closingBacktick` at `scan.ts:1042`, the double-quote scan `closeDoubleQuoted` that `attachedTargetEnd`
already carries at `tests/cross-cutting/psqlStartupFiles/scan.ts:1102`). Recursion is over strictly shorter spans, so it terminates on length alone.

**The perf bound, stated before the design and measured after it.** The walk visits each character
once per ENCLOSING construct, so its cost is **O(n · d)** where `d` is construct nesting depth — no
re-entrant rescan of a span already passed, and no back-tracking. `d` is what turns that into a
claim rather than a hope, so `d` is measured: the live corpus's deepest file reports **20** by a
deliberately over-counting census (§2.5), and the whole distribution sits at 12 or below apart from
two files. The bound this design accepts is §4's AC-6: **the repaired walk's median CPU over the
live corpus is within 1.5× the shipped walk's, both measured in the same session**, because a
machine running nine arcs against two heavy slots cannot compare a number today against one
recorded yesterday.

**The row's 400s is not reproduced by this design, and the honest statement of that is narrow.**
This design's prototype scans the live corpus in the same time as the shipped walk (§2.4). What
that establishes is a fact about THIS construct-aware walk, measured at `50ca72a56`. It establishes
nothing about the prototype the row describes, whose source is not in the tree and whose 400s is not
re-runnable — that measurement stands as the row records it. The row's close condition (b) is
satisfied on its own terms: the live-corpus scan completes within the shipped walk's order of
magnitude.

### 1.2 Resolved scope — do not relitigate

| # | Decision | Ratified at |
|---|---|---|
| 1 | **The defect is PRE-EXISTING with ZERO live population.** Severity MEDIUM. "It fixes nothing observable today" is answered: this is a prospective limit repair on a guard, and that is the whole of its value. | `BACKLOG.md:265`, `BACKLOG.md:278`; §2.3 |
| 2 | **No parser growth.** The walk becomes construct-aware for the delimiter families in §3.1's accept-set. It does not become a shell grammar: comments, `case` patterns, here-document bodies and ANSI-C spans stay exactly as they read today, recorded as documented limits in §7 with their measurements. | §3.1, §7 |
| 3 | **Branch A (tokeniser) and branch B (memoisation) are DECLINED with their reasons in §1.1**, each carrying a re-file trigger. Proposing either is not a finding unless it comes with a measurement that moves AC-6. | §1.1 |
| 4 | **Branch C (decline-and-surface) is REFUSED on the six live mixed nestings**, not on cost. | §1.1, §2.3 |
| 5 | **`matchBrace`'s contract is unchanged for its six index-only consumers.** An unclosed span still returns the last index; only `matchBraceEnd`'s seventh consumer reads `closed`. This design does not add a reporting channel to the site path. | §1, §3.2 |
| 6 | **The `${…}` expansion still becomes ONE opaque word.** Target retention, the site-path identity, and the refusals the 2026-08-21 arc ratified are untouched. | `tests/cross-cutting/psqlStartupFiles/scan.ts:291`; §3.2 |
| 7 | **The five documented limits in §7 are UNCHANGED-versus-shipped, measured pairwise.** Each is a pre-existing divergence from bash that this arc deliberately does not close. A finding that one of them exists is answered here; a finding that the repair MOVED one is admissible and is exactly what `shapes.mts`'s limit rows check. | §7; `shapes.mts` |

---

## 2. Measurements

Every row below is produced by a committed probe, re-runnable from any checkout. The probes live
under `docs/`, which the walk skips at the repo ROOT (`ROOT_SKIP_LITERALS`,
`tests/cross-cutting/psqlStartupFiles/scan.ts:516`), so they are not themselves corpus — confirmed
rather than assumed: the digest in §2.4 was measured with all four probe files present and matches
the pinned baseline byte for byte.

### 2.1 The four shapes, plus what the crossing does elsewhere

`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts`

Each row runs under bash with a fake `psql` on `PATH` that logs its invocations, and through
`scanSource` + `scanShellIndirection`. `ran` is bash's count.

| case | input | ran | shipped scanner | verdict |
|---|---|---|---|---|
| R1-attached | `cat >"$(echo ${A:-)}; psql -c 'x')"` | 1 | **0 sites, 0 advisories** | SILENT MISS |
| R1-detached | `cat > "$(echo ${A:-)}; psql -c 'x')"` | 1 | **0 sites, 0 advisories** | SILENT MISS |
| R2-attached | `cat >${OUT:-$(echo }; psql -c 'x')}` | 2 | 1 site, `nested: false` | WRONG ATTRIBUTION |
| R2-detached | `cat > ${OUT:-$(echo }; psql -c 'x')}` | 2 | 1 site, `nested: false` | WRONG ATTRIBUTION |
| R1-bare-word | `echo $(echo ${A:-)}; psql -c 'x')` | 1 | 1 site, `nested: false` | WRONG ATTRIBUTION |
| R2-bare-word | `echo ${OUT:-$(echo }; psql -c 'x')}` | 1 | 1 site, `nested: false` | WRONG ATTRIBUTION |
| R1-attached-nodq | `cat >$(echo ${A:-)}; psql -c 'x')` | 1 | 1 site, `nested: false` | WRONG ATTRIBUTION |
| Q2-backtick-inside-subst | ``cat >$(echo `echo )`; psql -c 'x')`` | 1 | **0 sites**, 1 advisory | SILENT MISS on the site |
| Q3-subst-inside-backtick-in-brace | ``cat >${OUT:-`echo }`; psql -c 'x'}`` | **0** | 0 sites, **1 advisory** | FALSE ADVISORY |

**Three things the row's own table does not say, and each changes the scope of the repair.**

1. **The crossing is not a redirection-target defect.** R1-bare-word and R2-bare-word put the same
   crossing in ordinary argument position, with no redirection and no quotes, and the scanner is
   wrong there too. The defect belongs to `matchBraceSpan`, which is why the repair is in the walk
   rather than in any one of its seven consumers.
2. **Backticks cross the same way.** Q2 is a `)` inside a backtick body inside `$()`. The shipped
   walk has no backtick case at all, so the body's `)` closes the substitution and the executing
   psql after it is invisible.
3. **The shipped walk already emits a FALSE ADVISORY.** Q3 executes nothing under bash — inside a
   `${…}` operand the `;` is literal — and the scanner reports an unlexable target anyway, because
   the mis-counted `}` leaves a construct apparently open. The repair removes an over-report as well
   as two misses, which is worth stating because "the loud direction is permitted" is otherwise a
   licence to leave it.

**Two positive-control families**, so the subject results are attributable rather than the artefact
of a broken read. Six controls report correctly today and must still report after: a top-level call;
the sibling arc's plain attached substitution; the quoted `)` the shipped walk's own comment cites;
same-pair nesting; `$((` arithmetic; and — from the ledger row's own note — **psql placed BEFORE the
crossing delimiter, which attributes correctly today**, which is precisely why the filing arc's
three probes did not discriminate. EVERY row is asserted against bash: the probe ABORTS with
exit 2 if any row's execution count disagrees with its declared column, so a scanner comparison is
never made against a snippet whose behaviour is unestablished.

**The row counts are the probe's, not this document's.** `shapes.mts` prints its own inventory and
its own tally, and those two lines are the figures to read:

```
ROWS: 22 total = 17 accept-set + 5 documented-limit
8/17 accept-set rows meet their post-repair expectation
5/5 documented-limit rows reported (shipped module, nothing to compare against)
```

at `50ca72a56` against the shipped scanner. A count written here would go stale the next time a row
is added; the lines above are dated evidence of one run, and the probe re-derives them on every run.

**The two populations reconcile against their own denominators**, because they answer different
questions: an accept-set row asks whether the repair LANDED, a documented-limit row asks whether the
repair stayed inside its scope. An earlier cut of this probe folded a moved limit into the
accept-set tally and reported `16/17 accept-set` for a run in which all seventeen accept-set rows
passed and one LIMIT had moved — one population's failure against the other's denominator.

**Against the §3 prototype the same probe prints `17/17 accept-set rows meet their post-repair
expectation` and `5/5 documented-limit rows UNCHANGED against the shipped module`.**

### 2.1b The probes are proven to fail, in both populations

A probe that only prints cannot be an acceptance criterion, so each gate was run against a planted
defect and against a no-defect baseline. Two defects, chosen so that each targets one population and
neither targets both:

| planted defect | accept-set | documented limits | exit |
|---|---|---|---|
| none (the §3 prototype) | 17/17 | 5/5 UNCHANGED | 0 |
| the bare walk stops delimiting `'` | **16/17** — control C4, the quoted `)` | 5/5 UNCHANGED | **1** |
| the walk grows a `#`-comment rule (parser growth) | 17/17 | **4/5** — L2 reports `MOVED` | **1** |

**The second defect is the one worth having.** It is not a bug in the ordinary sense — it makes the
walk agree with bash on a case where today it does not — and it is exactly the scope creep §1.2 row
2 forbids. Nothing in the accept-set notices it; only the limit rows do. That is what those five
rows are for, and it is why they compare against the shipped module rather than against a written
expectation.

`corpus-time.mts`'s ratio gate was proved the same way: `--max-cpu-ratio 1.5 --baseline-cpu-ms 10`
exits 1 printing `median cpu 16636 ms exceeds 1.5 x baseline 10 ms = 15 ms`; the same command at a
real baseline exits 0 printing `PASS`. `depth.mts` and `cost-curve.mts` are REPORTERS, not gates —
they abort on an empty read and otherwise only print, and nothing in §4 rests on them alone.

```
SCAN_MODULE=<candidate> pnpm exec tsx \
  docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts --expect-repaired
```

### 2.2 The deciding suite is unmoved

With the §3 prototype swapped in for `scan.ts`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts`
reports **1009 passed (1009)**. No pinned zero moves, including the six rows of
`a construct whose LAST character is its delimiter without closing is REPORTED, not resolved`
(`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6674`) and the seven of
`a quote character that is LITERAL inside a double-quoted target does not open a span`
(`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6700`), which are the two blocks nearest
this walk.

That is a measurement of the prototype, not a promise about the implementation: §6 names the pins
this design expects to hold, and AC-2 is what proves it for whatever actually ships.

### 2.3 Live population: zero, and the six near-misses are why branch C fails

```
grep -rEn --include='*.sh' --include='*.bash' --include='*.yml' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=.git \
  '\$\([^)]*\$\{|\$\{[^}]*\$\(' .          # 6 hits across 2 files — mixed nestings
grep -rEn … '\$\{[^}]*\$\([^)]*\}|\$\([^)]*\$\{[^}]*\)' .   # 0 hits — a crossing delimiter
```

**Zero live instances of the defect, six live instances of the shape branch C would fire on.** The
first zero is what makes this a prospective repair; the six are what make an advisory-only closure
worse than the defect it would announce.

### 2.4 Live-corpus cost and the AC-5 digest, both modules

`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts --runs 3`,
then the same with `SCAN_MODULE` naming the prototype. Three runs each; the probe ABORTS if two runs of one module digest differently, so a
timing number is never reported for a scan that is not deterministic.

| module | median wall | median CPU | sites | digest |
|---|---|---|---|---|
| shipped `scan.ts` | 13940 ms | 14222 ms | 76 | `8ebe8b08d43e6308aa471112d9f086d0118e6238` |
| §3 prototype | 13806 ms | 14132 ms | 76 | `8ebe8b08d43e6308aa471112d9f086d0118e6238` |

A second, strictly sequential pass on the same machine under different contention read shipped at
17682 ms wall / 17462 ms CPU and the prototype at 13133 / 13333 — the prototype ahead, which is
contention noise rather than a speed-up and is recorded to show the spread. **Both readings put the
prototype at or below the shipped walk, and neither is anywhere near a 30× regression.** The
absolute numbers belong to a contended machine and are not the bound; AC-6's same-session RATIO is.

**The digest is close condition (c), and it does not move.** Identical over 76 rows and every field
of every record, which is the serialisation the 2026-08-21 arc hardened after finding an earlier one
blind to exactly the fields a wrong attribution would flip.

### 2.5 The cost curve, and where `d` actually lives

`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/cost-curve.mts`, three families parameterised by size, median of three:

| case | bytes | shipped | prototype | ratio |
|---|---|---|---|---|
| FLAT n=128000 | 128000 | 225.24 ms | 342.68 ms | 1.52× |
| NESTED d=128 | 1799 | 6.34 ms | 6.37 ms | 1.00× |
| NESTED d=512 | 7175 | 172.34 ms | 247.54 ms | 1.44× |
| WIDE k=3200 | 51206 | 13.86 ms | 20.01 ms | 1.44× |

**The prototype is a constant factor, not a complexity class.** Both walks are already superlinear
on the FLAT family — 437 µs/KB at 2 KB against 1802 µs/KB at 128 KB for the SHIPPED walk — which is
a pre-existing property of `scanSource` over one enormous line, not something this repair
introduces. On the WIDE family, which is the shape the live corpus actually has, both are flat in
µs/KB.

`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/depth.mts` measures `d` over the surfaces production reads: **the deepest file
is `.github/workflows/mutation-harness.yml` at 20**, and every other file sits at 15 or below with
the mass at 12 and under. That census counts an unmatched backtick in embedded JavaScript as an
opener, so it OVER-approximates — which is the conservative direction for a bound and is stated
rather than quietly enjoyed.

---

## 3. The design

**When the delimiter walk meets an opener belonging to a construct other than the pair it is
counting, it asks that construct's own closer where the construct ends and resumes past it.** No new
grammar, no resolver, no new channel, and no change to what any consumer receives for an input the
shipped walk already reads correctly.

### 3.1 The accept-set, default-denied, per lexical context

Two contexts, because a recognizer shared across lexical contexts imports the wrong alphabet — the
defect the sibling arc measured when `'` inside a double-quoted target was read as opening a span.

**Context 1 — the bare walk** (`matchBraceSpan`'s own scan):

| opener | delimited by | precedence |
|---|---|---|
| `\` | the escape pair: consumes the NEXT character whatever it is | **highest** |
| `'` | the next `'`; no escapes inside, as POSIX single quotes have none | |
| `"` | the double-quoted scan of context 2 | |
| `` ` `` | `closingBacktick` (`tests/cross-cutting/psqlStartupFiles/scan.ts:1042`), which is escape-aware | |
| `${` | this walk, recursively, on `{`/`}` | |
| `$(` | this walk, recursively, on `(`/`)` | |
| the counted pair | `depth++` / `depth--`, exactly as today | |
| anything else | ordinary text | lowest |

**Context 2 — inside a double-quoted span**, where the alphabet is narrower because bash's is:

| opener | delimited by |
|---|---|
| `\` | the escape pair |
| `` ` ``, `${`, `$(` | as context 1 |
| `"` | CLOSES the span |
| `'`, `$'`, `$"` | **literal text — not openers** |

**The complement is default-denied**: an opener nobody listed terminates nothing and is counted as
ordinary text, which is exactly today's behaviour, so a spelling outside the set cannot regress. That
is what makes this axis closable rather than an open grammar — and §7 records, with measurements,
the five places where today's behaviour and bash's disagree and this design leaves them disagreeing.

**Recursion terminates on length alone.** Every delegated span starts strictly after the opener and
its closer returns an index at or before the end of the input, so each level is handed a strictly
shorter remainder. No depth counter is needed, and one would be a bound nothing could reach — the
sibling arc deleted exactly such a counter rather than write a fixture for it.

### 3.2 What does NOT change, stated because it is the part a repair breaks

- **`matchBrace`'s return contract.** Six of the seven consumers take the index either way; an
  unclosed span still yields the last index. Only `matchBraceEnd` reads `closed`, and it keeps
  reading the walk's OWN flag rather than re-deriving closure from the character it landed on —
  the defect the sibling arc's diff round 1 found.
- **The unlexable report's firing condition.** A construct opened and never closed still makes the
  enclosing span unclosed, so `attachedTargetEnd` still reports it through `SUBSTITUTION_OPENER`
  (`tests/cross-cutting/psqlStartupFiles/scan.ts:1058`). The repair changes WHERE a construct ends,
  never WHICH spans are reportable.
- **The `${…}` word is still opaque**, targets still never reach `words`, and `scanShellText` still
  passes no `targets` array — so the site path stays byte-identical by construction, as
  `tests/cross-cutting/psqlStartupFiles/scan.ts:291` states and
  `tests/cross-cutting/psqlStartupFiles/scan.ts:1862` implements.
- **`ATTACHED_TARGET_TERMINATOR`** (`tests/cross-cutting/psqlStartupFiles/scan.ts:1064`) is
  untouched: which characters END an ordinary attached target is a different question from where a
  construct closes.

### 3.3 Where the code goes

One function gains the delegation (`matchBraceSpan`), and two small helpers appear beside it: a
foreign-opener resolver for context 1 and a double-quoted scan for context 2. `attachedTargetEnd`
already carries near-identical private helpers (`closeDoubleQuoted`, `substitutionOpenerEnd` and `openerEnd`, all private to
`attachedTargetEnd` at `tests/cross-cutting/psqlStartupFiles/scan.ts:1085`); whether the implementation SHARES those or keeps the
walk's own is an implementation choice the plan settles, under one constraint that is not
negotiable: **if they are shared, the two contexts stay two recognizers, never one parameterised by
a flag.** The two alphabets differ in what `'` means, and a flag is how that difference gets lost.

---

## 4. Acceptance criteria

Each row names a command that FAILS when the criterion does. A green suite is not the proof for
AC-5, AC-6 or AC-8; each names its own instrument.

| id | criterion | proved by, and it fails when the criterion does |
|---|---|---|
| AC-1 | EVERY accept-set row of §2.1 meets its post-repair expectation, including the ledger row's four shapes in both placements. The probe's own tally is the count. | `SCAN_MODULE=<candidate> pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts --expect-repaired` — exits 1 naming every unmet row |
| AC-2 | Every §2.1 control still reports, and the bash column holds for EVERY row. | the same command — a bash disagreement ABORTS with exit 2, so no subject result rests on an unestablished snippet |
| AC-3 | Every §7 documented limit reports byte-identically to the merge-base scanner, so the repair has not grown into a shell grammar. | the same command with `SCAN_MODULE` set: each limit row is compared against the shipped module, prints `MOVED` on divergence, and is counted in its OWN tally line. Proven to fire by the §2.1b widening defect |
| AC-4 | The deciding suite is green, with the two nearest pin blocks (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6674` and `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6700`) unmoved. | `pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` |
| AC-5 | The live-corpus finding set is unchanged: 76 rows, digest `8ebe8b08d43e6308aa471112d9f086d0118e6238`, over every field of every record. **This is the ledger row's close condition (c).** | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238` — exits 1 printing expected and actual, exit 2 on a zero-row or thin-record read |
| AC-6 | **The ledger row's close condition (b).** The repaired walk's median CPU over the live corpus is within **1.5×** the shipped walk's, both measured in the SAME session so heavy-slot contention cancels. | `SCAN_MODULE=<a checkout of the merge-base scanner> pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/corpus-time.mts` for the baseline, then the same probe against HEAD with `--max-cpu-ratio 1.5 --baseline-cpu-ms <that number>`; exits 1 printing both |
| AC-7 | `psqlStartupScan` scores at or above its floor with an EMPTY unaccepted-survivor set, after `pnpm mutation:sites` re-keys every row the edit moved. | `pnpm heavy pnpm mutation:guards` |
| AC-8 | No prose in `scan.ts` or the deciding suite still describes the pre-repair walk. | the §6 sweep, run and pasted in the plan, not described |

**AC-5 and AC-6 are the row's close condition; AC-1 is (a).** AC-6 is a RATIO and not a wall-clock
figure on purpose: this machine runs nine arcs against two heavy slots, and §2.4's own two passes
differ by 3.5 s on the identical shipped module.

---

## 5. Convergence criterion

- **Consequence bound.** Every delimiter the walk resolves is the delimiter bash resolves, or the
  span is REPORTED as unlexable through the existing `IndirectionHit` channel: **correct or
  signaled, never silently wrong.** Silent discard and wrong attribution are the two forbidden
  directions. A worst case of conservative-over-report-plus-surfaced-signal is a DOCUMENTED LIMIT,
  not a finding. Zero false advisories on the live corpus, and the AC-5 finding set unmoved —
  the corpus holds ZERO instances of this family (§2.3), so the digest is the executable form of
  this bound.

- **PROBE DOMAIN:** the execution surfaces production READS — whole-file shell (`.sh`/`.bash`) and
  workflow `run:` scalars, per `SCANNED_EXTENSIONS` (`tests/cross-cutting/psqlStartupFiles/scan.ts:474`)
  — plus the rows of `shapes.mts` (22 at `50ca72a56`: 17 accept-set, 5 documented-limit), each with its bash run as
  oracle, and the three families of `cost-curve.mts`. The probe prints its own inventory, which is
  the authority; the parenthetical above is that line as it read at `50ca72a56`, not a count this
  document maintains. A constructed input more than
  one ordinary edit from that set files to §7, not to a finding. `package.json` scripts are outside
  the domain: `SCANNED_EXTENSIONS` excludes `.json` and the walk never admits one
  (`tests/cross-cutting/psqlStartupFiles/scan.ts:116` has recorded that since 2026-08-03).

- **Threat fence.** Ordinary authoring by a contributor writing a shell script or a workflow `run:`
  block in this repository. Adversarial obfuscation is out of scope and files to documented limits.

- **Score.** `MUTATION SCORE: <k>/<t>` plus an empty unaccepted-survivor set on the
  `GUARD SURFACE:` line of the round-1 `--stage diff` brief, measured by `pnpm mutation:guards`
  BEFORE the first dispatch, after `pnpm mutation:sites` has re-keyed the rows this edit moves. The
  registry row's operator set (`relational-boundary`, `regex-quantifier-bound`) is deliberately
  narrow; widening it is a registry change carrying its own numbers, not a finding here.

**The closed criterion is the ledger row's three parts, and nothing else:** the four shapes red then
green (AC-1), the live-corpus scan within the stated bound (AC-6), the AC-5 digest unmoved. It is
NOT an enumeration of nestings — that ranges over an open grammar and does not terminate. Every
admissibility clause in a review brief for this arc cites the fence and the domain above.

---

## 6. Prose that must move with the code

Each of these describes the pre-repair walk and becomes a false statement the moment §3 lands. They
are named here so the sweep is a checklist rather than a reviewer's attention. The plan runs the
sweep and pastes its output.

- **`matchBraceSpan`'s own comment** (the block comment above `tests/cross-cutting/psqlStartupFiles/scan.ts:973`),
  including the quoted-`)` example — still true, now true for a different reason.
- **`matchBrace`'s "Preserved verbatim for the four callers that only ever wanted the index"**
  (the comment above `tests/cross-cutting/psqlStartupFiles/scan.ts:1009`) — the measured figure is
  SIX.
- **`matchBraceEnd`'s comment** (above `tests/cross-cutting/psqlStartupFiles/scan.ts:1025`), which
  describes the walk it delegates to.
- **The lexer header's blind-spot claim** (`tests/cross-cutting/psqlStartupFiles/scan.ts:359`), which
  states the lexed-word route has exactly ONE blind spot by construction. The crossing is a second
  one today, and the sentence is only true again after the repair.
- **The `${…}` branch comment** (above `tests/cross-cutting/psqlStartupFiles/scan.ts:1559`) on
  consuming the expansion whole.
- **The ledger row itself** (`BACKLOG.md:263`), archived at closeout with the measured outcome,
  including the corrected caller count and the 400s statement's disposition per §1.1.

---

## 7. Documented limits

Each is a pre-existing divergence between this walk and bash that the design deliberately does not
close, each measured pairwise against the shipped module by `shapes.mts`'s limit rows, and each
UNCHANGED by this repair. They are recorded here because a limit found later reads as a defect
unless someone wrote it down first.

1. **ANSI-C `$'…'` inside a counted span** (`L1`). `$'` is not in the accept-set, so the `'` opens a
   plain single-quote span. Bash's ANSI-C escapes (`\'` in particular) can therefore be misread.
   Measured unchanged; the site still reports.
2. **A `#` comment inside `$(…)`** (`L2`). Bash takes the rest of the line as a comment, so a `)`
   there does not close the substitution; the walk counts it. Measured unchanged.
3. **A `case` pattern's `)`** (`L3`). Not a closer in bash; the walk counts it. Measured unchanged.
4. **A here-document body inside `$(…)`** (`L4`). Literal to bash; the walk reads its `)`.
   Measured unchanged, and consistent with `LITERAL_TARGET_REDIRECTIONS`
   (`tests/cross-cutting/psqlStartupFiles/scan.ts:1344`), which already declines here-document
   bodies on the target path for the same reason.
5. **Quotes inside a `${…}` operand inside double quotes** (`L5`). Probed against bash:
   `A=; echo "${A:-'}'; psql -c x}"` prints `'}'; psql -c x`, so the quotes are LITERAL there while
   the walk's nested `${` reads them as quotes. The span is bounded by the enclosing double quote
   either way, so the reading agrees on the boundary and differs only on what is inside it.
   Measured unchanged: 0 sites before and after.

**Why recorded rather than closed.** Each needs the walk to model a bash construct it does not model
today — comment syntax, `case` grammar, here-document bodies, ANSI-C escape rules, per-context quote
semantics inside expansions. That is branch A wearing a smaller hat, and the standing repair
direction under same-axis recurrence is narrowing, not parser growth. **Re-file trigger for all
five:** a live-corpus instance, which `2.3`'s greps report on every run.

6. **Shell text inside JS strings** is not separately censused, exactly as the sibling arc records
   (`docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md:455`). AC-5's
   before/after corpus equality covers it operationally, since any movement there fails the digest.

---

## 8. Touched set

| file | change |
|---|---|
| `tests/cross-cutting/psqlStartupFiles/scan.ts` | `matchBraceSpan` (`tests/cross-cutting/psqlStartupFiles/scan.ts:973`) gains construct-aware delegation plus its two context helpers; the six prose sites in §6 |
| `tests/cross-cutting/psqlStartupFileSuppression.test.ts` | new cases for the §2.1 shapes and the §7 limits; no existing pin retired (§2.2) |
| `tests/mutation/source/registry.ts` | `psqlStartupScan` rows re-keyed — the source edit moves every site below the walk; every argument re-read at its new site, none carried over on the strength of having been true before |
| `docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/` | the four probes, committed with the arc |
| `docs/superpowers/specs/ci/README.md` | index row for this document |
| `BACKLOG.md` / `BACKLOG-archive.md` | ledger closeout, one commit before whole-diff review |

**A source edit voids the score.** The registry row's accepted rows are re-derived for this change,
and no `equivalent` row is carried across the edit on the strength of having been true before.
