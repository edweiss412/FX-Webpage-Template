# Replacement-string class sweep — a repo-wide judge for `String.replace`'s second argument

**Row:** `BL-REPLACEMENT-STRING-CLASS-SWEEP` (`BACKLOG.md`)
**Base:** `origin/main` at `8bf8709914a3af247fc816f7c3e5329854a322c7`
**Branch:** `fix/replacement-string-class-sweep`
**Probe record:** [`docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count.md`](./ci/probes/2026-08-24-replacement-string-count.md)

---

## 1. The defect

`String.prototype.replace` and `replaceAll` parse their SECOND argument when it is a
string. `$&` is the matched text, `` $` `` is everything before the match, `$'` is
everything after it, `$1`/`$<name>` are capture references, and `$$` is a literal dollar.
A runtime value placed there is therefore INTERPRETED, not inserted. It is the same shape
as SQL injection and format-string injection with a different mini-language: a position
that looks like data and is secretly a grammar.

The call succeeds. The output is wrong. Nothing throws.

`feat/pane-compaction-send-auth` diff round 3 spent a P1 on one instance: `addressPayload`
passed a branch name into the replacement position, so a branch git accepts —
`git check-ref-format --branch 'feat/$&'` returns `feat/$&` — produced an address line
naming `feat/<BRANCH>`, and the command exited 0 having told every recipient to ignore a
message it reported sending. That arc repaired its two files and deferred the class under
disposition exception (c). This is the deferred sweep.

### 1.1 Resolved scope — do not relitigate

Each decision below is settled. A review round re-opening one is a round spent on a
question this section already answers.

| # | Decision | Where it was settled |
| --- | --- | --- |
| R1 | **The repair is a replacer FUNCTION, never an escaping helper.** `text.replace(token, () => value)` has no substitution grammar to escape. Escaping the replacement string leaves the grammar live and one missed character away from the same defect. | `BL-REPLACEMENT-STRING-CLASS-SWEEP`, "Shape of the repair"; lessons rule 363 |
| R2 | **`scripts/lib/pane-compaction-core.ts` and `scripts/pane-compaction.ts` are already closed** by `tests/paneCompaction/literalSubstitution.test.ts` and are not re-litigated here. | `BL-REPLACEMENT-STRING-CLASS-SWEEP`, "Scope note" |
| R3 | **Report-only came first.** The count was run and committed before any design choice, because the count is what decides the gate's tier. It is not a step to re-order. | Row's "First scheduled step"; probe record §2 |
| R4 | **The gate ships `fail`, not advisory**, because this PR repairs the population it would otherwise red. The standing advisory-first rule governs a gate whose historical offenders SURVIVE the PR; §4 states the arithmetic. | §4 |
| R5 | **`docs/**` is outside the population.** Its JS/TS files are dated probe and spike artifacts whose value is that they record what was run. §3.2 gives the rule and §6 names the four sites. | §3.2, §6 |
| R6 | **Same-file const folding is declined.** It buys 11 of 56 sites and costs a name-keyed map that clears a shadowed inner declaration wrongly. Measured, not assumed. | Probe record §3 |
<!-- spec-lint: not-ui — the only `components/` path this spec resolves is a copy-building pure function whose repair wraps a replacement argument; no layout, token, or visual surface moves, so invariant 8 and the UI section requirements do not attach (R7). -->

| R7 | **`components/admin/roleRecognizeCopy.ts` is a mechanical repair, not UI work.** The change is `X.replace(a, b)` to `X.replace(a, () => b)` in a copy-building pure function; no layout, token, or visual surface moves, so the invariant-8 impeccable dual-gate does not attach. | AGENTS.md invariant 8 (UI surface definition); arc brief |

## 2. Convergence criterion

**Consequence bound.** Every `.replace`/`.replaceAll` call site in the population is
classified into exactly one of three buckets — accepted, not-in-population, or REPORTED
BY NAME. A site the judge cannot classify is reported, never silently accepted. The gate
reads source and emits findings; it never rewrites code, so its worst case is a named
site a human dispositions, not a silent wrong output.

**Probe domain.** The repository's live `.replace`/`.replaceAll` call sites at the reviewed
head, enumerated from disk by

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-conservative.mts
```

**The domain is that command, and this section deliberately states no cardinality for it.** Every
artifact this arc commits is itself a `.ts`/`.mts` file containing `.replace` calls, so the
population counts its own instruments and moves on every commit that adds one — it did so twice,
and both times a number written here went stale between the writing and the review. A figure that
invalidates itself on the next commit is not a specification, it is a snapshot; the command is the
specification, and the probe record's dated blocks are where snapshots live.

What does NOT move is the offender count: **56 sites across 32 files**, unchanged at the base and
at every head since, which is the figure §4's tier decision rests on. A probe drawn from outside
this corpus, or more than one ordinary edit away from a site in it, files to §8 rather than to a
review round.

**Threat fence.** The guard defends against an ordinary contributor accidentally
interpolating a runtime value into a replacement position. Adversarial obfuscation —
aliasing `replace` through a variable, spelling the call as `s["replace"](…)`, reaching it
through `Reflect.apply` — is OUT OF SCOPE and files to §8. A wider recognizer is a bigger
target for the next round, and the defect this closes is an authoring mistake.

**Score.** The scanner is enrolled in `tests/mutation/source/registry.ts`. The round-1
diff brief states the mutation score, the empty unaccepted-survivor set, and the operator
set the score ranges over.

## 3. The judge

### 3.1 Accept-set, keyed on node type

The judge examines `node.arguments[1]` of every call whose callee is a property access
named `replace` or `replaceAll`, after stripping transparent wrappers (§3.3). It ACCEPTS
exactly four node kinds:

| Accepted | Why it carries no runtime value |
| --- | --- |
| `StringLiteral` | The author wrote every character, including any `$`. |
| `NoSubstitutionTemplateLiteral` | Same, in backticks. |
| `ArrowFunction` | A replacer function's return value is inserted literally; there is no grammar to parse. |
| `FunctionExpression` | Same. |

Everything else is REPORTED. This is an accept-set, not a denylist: an argument form
nobody has thought of yet is reported rather than accepted, which is the direction a
static guard must fail in.

Positional indexing is what makes `node.arguments[1]` mean "the replacement", and a SPREAD
breaks that equivalence: in `s.replace(...[find, repl])` the AST has ONE argument, so
`arguments[1]` is `undefined` while the call receives two. The judge therefore classifies in
this order:

1. **Any argument at index 0 or 1 is a `SpreadElement` — REPORTED.** The call has a
   replacement position the judge cannot see, so it is unclassifiable, and §2's consequence
   bound says an unclassifiable site is reported rather than accepted.
2. **Fewer than two arguments and no spread — NOT IN THE POPULATION.** There is genuinely no
   replacement position. The judge counts these separately and the suite asserts the count, so
   the bucket cannot quietly absorb real sites.
3. Otherwise `arguments[1]` is classified against the accept-set above.

Rule 1 exists because rule 2 without it is an ACCEPTANCE path wearing the not-in-population
label — the one direction §2 forbids. It is a narrowing, not a new grammar: the judge learns to
decline a shape, not to understand it. Measured at `8bf870991`, no live call has a spread at
either position, and neither bucket 1 nor bucket 2 is currently occupied at all (probe record
§7), so the rule reds nothing today and closes the path before someone writes it.

### 3.2 Population, derived from disk

The population is every tracked file whose extension is `.ts`, `.tsx`, `.js`, `.jsx`,
`.mjs`, `.cjs`, `.mts` or `.cts`, MINUS `node_modules/**` and `docs/**`.

The exclusion is stated as a subtraction, never as a list of included directories: a new
top-level directory is covered by default rather than silently exempt. `docs/**` is
excluded because its JS/TS files are dated probe and spike artifacts, and editing one
falsifies the record it exists to be — the probes README makes that binding explicit. The
judge REPORTS the excluded population's site count on every run so the exclusion cannot
grow in silence.

### 3.3 Transparent wrappers are asked of the compiler

`("literal")`, `("literal" as string)`, `(fn!)` and `x satisfies string` all denote the
same value as the expression inside them. The judge resolves them with
`skipTransparent` from `tests/_shared/outerExpressions.ts`, which binds TypeScript's own
`skipOuterExpressions` with `OuterExpressionKinds.All`.

This is deliberate reuse and not a convenience. A hand-written wrapper list is a
completeness claim nothing checks, and this repo has already paid for one: `premiseScan.ts`
shipped a list covering three of six kinds and whole-diff review found a false
certification through `satisfies`. The shipped two-file template
(`tests/paneCompaction/literalSubstitution.test.ts`) does not skip wrappers, so
`s.replace(t, ("x" as string))` reads as an offender there. Widening the judge here fixes
that in the general instrument rather than in a second copy.

### 3.4 Output

`judgeSource(filePath, source)` returns findings, one per reported site, each carrying
`file`, `line`, and the call's source text truncated for legibility. The suite renders
them as `file:line  text` and asserts the list is empty. A finding is a name and a
location; the gate proposes no repair.

## 4. The count, and why the gate ships hard

The probe record is the authority; the figures are quoted here at authoring time.

**56 offender sites across 32 files.** The surrounding population is quoted from the probe
record's dated block rather than restated as a live figure (§2 explains why): at the base
`8bf870991` the walk saw 1201 call sites in 496 files, 1120 passing a string literal and 25
already passing a replacer function, with the sub-two-argument bucket empty — checked directly,
not assumed. The offender count is the part that has not moved since.

By top-level directory, sites and then files. The two columns differ because chained calls
put several sites on one line:

| Directory | Offender sites | Offender files |
| --- | --- | --- |
| `tests/` | 35 | 18 |
| `lib/` | 9 | 5 |
| `scripts/` | 5 | 4 |
| `docs/` | 4 | 4 |
| `components/` | 3 | 1 |
| **Total** | **56** | **32** |

The standing tier rule says a gate that instantly reds N historical files ships
advisory-first with named offenders and a dated hardening step. **That rule's premise is a
population that survives the PR**, and here it does not.

Four of the 56 live under `docs/**` and leave the population by §3.2. Of the **52 that are
repaired in this PR**, 51 take the wrap — `.replace(a, b)` becomes `.replace(a, () => b)`,
mechanical, behaviour-identical wherever `b` holds no `$` sequence, one line each — and
exactly one takes the capture-preserving form, because its replacement is a deliberate
`$1` reference (§6). The split is derived, not eyeballed:

```
$ pnpm exec tsx …/count-conservative.mts --list      # the 56, by name
$ pnpm exec tsx …/count-capture-cover.mts            # which replacements carry a `$`
```

So the gate reds nothing on its first run and ships `fail`.

Shipping advisory would take the opposite trade: a 4-line diff now, three live product
defects left in main, and a second full pipeline — worktree, two adversarial reviews, CI,
merge — to re-earn context this PR already holds. AGENTS.md's disposition rule names that
as the default to avoid.

## 5. What the sweep actually found

The row is filed `**Facing:** process`, and the count contradicts it in the useful
direction. **Seven of the 52 sites, in three files**, are on live product paths carrying
operator-authored text straight from the Google Sheets:

| Site | The runtime value | Reachability |
| --- | --- | --- |
| `lib/sync/feed/shapeHoldEntry.ts`, `fill()` | `hold.entity_key`, held and proposed crew names and emails | A crew member named `A$'B` splices the rest of the summary into the middle of Doug's admin feed line. Names are free text in the sheet. |
| `lib/parser/personalization.ts`, the stage-word rebuild | `STAGE_CANONICAL[cand] ?? cand` — the `?? cand` arm is sheet text | A role cell whose stage word is not in the canonical map is inserted as grammar. |
| `components/admin/roleRecognizeCopy.ts`, `scopeLine` / `savedSummary` | the raw role-cell word | Rendered in the admin role-recognize card. |

The third row is not a reading of the code, it is a run of it. Against the live tree at
`8bf870991`:

```
scopeLine("A$'B")
  -> "Applies to anyone whose role says A, on this show and every show after.B, on this
      show and every show after."
savedSummary("T$'Z", [])
  -> "People with T now see the standard show page.Z now see <SUMMARY>."
```

The first splices the sentence tail into the middle of itself. The second does that AND leaks a
raw `<SUMMARY>` placeholder into admin copy, because the splice moved the text that the NEXT
`.replace("<SUMMARY>", …)` in the chain was going to match. A defect that ends in an unreplaced
template marker on screen is not a subtle one.

The class also recurred on a sibling arc the same day this spec was written: a plan-rewriting
script substituted a block containing the shell predicate `grep -vE '^docs/|\.md$'`, whose `$'`
expanded to "everything after the match" and spliced the rest of the document into the block.
`prettier --check` passed on the corrupted file and so did the script's own
`next !== previous` write-assert; only a diff against the original caught it. Two independent
occurrences in one day is the argument for a repo-wide judge rather than a third repair.

Two more `lib/` sites are redaction paths rather than sheet text, and one of them is the
sharpest finding in the sweep. `lib/log/sanitize.ts:6` substitutes the const
`REDACTED = "[email-redacted]"`, which carries no `$` and takes the ordinary wrap.
`lib/observe/scrubSentryEvent.ts:18` substitutes
`TOKEN_PLACEHOLDER = "$1[shareToken-redacted]"`, where the `$1` is a DELIBERATE capture
reference that carries the `/show/<slug>/` prefix through the scrub. Wrapping that site
blindly would emit a literal `$1` and drop the slug from every scrubbed Sentry URL — the
guard's repair breaking a redaction path is the one outcome this sweep must not produce.
§6 gives it the capture-preserving form, and the probe record's §6 is the derivation
that found it rather than a reviewer.

The remaining 43 sites are tooling and test scaffolding, and the mutation-harness ones are
not cosmetic either: several substitute JavaScript SOURCE TEXT, which is exactly the input
family where a `$` sequence appears by accident.

## 6. Disposition of every offender

Per AGENTS.md's class-sweep disposition rule, every instance of one shape is repaired in
the same PR unless a named exception applies. **52 repaired. 4 excepted.**

Repairs take one of two forms:

- **Wrap.** `X.replace(a, b)` becomes `X.replace(a, () => b)`. Behaviour-identical unless
  `b` contained a `$` sequence, in which case the old behaviour was the defect.
- **Capture-preserving.** Where the replacement deliberately uses a `$n` capture
  reference, the repair is a replacer function taking capture PARAMETERS. A blind wrap
  turns a live capture reference into literal text, so this shape has to be found before
  the wrap, not after it.

The capture-preserving sites are identified by derivation rather than by reading 56 lines.
`count-capture-cover.mts` runs three complementary passes, because no single one covers the
class: (A) the call's own replacement text carries a `$` sequence, which catches any node kind;
(B) the replacement resolves to a same-file string-literal const bearing a `$`, which pass A
cannot see because the `$` is in the declaration; and (C) every replacement pass B could not
resolve, intersected against every `$`-bearing string const in the repository. A and B are the
finding set. **C is the completeness argument** — 13 unresolved or ambiguous names against 12
`$`-bearing consts repo-wide, intersection EMPTY — and it is what lets the union of A and B be
called a cover rather than a list of what happened to be noticed. The script exits non-zero if C
or the spread bucket is ever non-empty, so the claim re-checks itself.

**The cover's classification is the JUDGE'S, never its own.** Spec round 2 found three
independent ways an independently-derived cover drifts from the judge it audits: it read the RAW
argument while the judge strips transparent wrappers, so `(TOK)`, `TOK as string`, `TOK!` and
`TOK satisfies string` escaped every pass; it had no spread rule, so §3.1's unclassifiable calls
were invisible to it; and its name map was last-write-wins, which is precisely the shadowing
unsoundness R6 rejects — an inner `const TOK = "plain"` hid an outer `$`-bearing one and the
audit prescribed a corrupting wrap. Two were reported and the third was found by sweeping the
class instead of patching the reports.

So the rule, and it is structural rather than a list of three fixes: **a cover that re-derives
the judge's decisions is a second implementation, and it will drift again.** Pass B now records
EVERY binding per name and treats more than one as unresolved rather than guessing; the shipped
audit consumes `judgeSource`'s own reported sites, inheriting wrapper resolution, the spread rule
and the accept-set by construction. The script in the probe directory is the pre-implementation
stand-in and mirrors those rules explicitly, which is the only reason its numbers can be trusted
before the scanner module exists. (Its own repair drew the same lesson one level down: removing
the duplication introduced an early `return` that skipped recursion into a chained call's
receiver, dropping two of `shapeHoldEntry`'s three sites and reading 54 where the judge reads 56.
The cover and `count-conservative.mts` agreeing at 56 is what caught it.)

Pass A finds one site, the `docs/**` one already excepted. Pass B finds **exactly one
in-population site**:

| Site | Const | Repair |
| --- | --- | --- |
| `lib/observe/scrubSentryEvent.ts:18` | `TOKEN_PLACEHOLDER = "$1[shareToken-redacted]"` | `value.replace(SHOW_TOKEN_RE, (_m, prefix: string) => `${prefix}[shareToken-redacted]`)` |

The other ten same-file consts resolve to plain literals and take the ordinary wrap. An
offender whose replacement is a property access, template expression, or call holds a RUNTIME
value — the defect the wrap exists to fix, not a capture reference to preserve — so their
absence from the finding set is the expected reading. §8 limit 6 states that boundary.

The four exceptions, each naming its clause:

| Site | Clause | Reason |
| --- | --- | --- |
| `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-acmovement.mts` | (b) | Dated probe artifact; a probe record binds to what was run, and editing it falsifies the record. |
| `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/operator-oracle.mts` | (b) | Same. |
| `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs` | (b) | Dated spike artifact. |
| `docs/superpowers/specs/admin/2026-07-16-consolidated-admin-show-page-mock/support.js` | (b) | Frozen design-mock support script; it uses `"$1" + alias` where `$1` is a DELIBERATE capture reference, so it is also the capture-preserving shape. |

Clause (b) is AGENTS.md's "a ratified scope decision already fences it": §3.2 fences
`docs/**` out of the population, and R5 ratifies that fence.

## 7. Where the gate lives

Two files are CREATED by this PR and so are named here as a layout rather than cited —
nothing tracked answers to them yet:

```
tests/cross-cutting/replacementString/scan.ts    scanner module, pure functions:
                                                 judgeSource(filePath, source) takes
                                                 source TEXT; the disk walk is a
                                                 separate export
tests/cross-cutting/replacementString.test.ts    suite: fixture cases over judgeSource,
                                                 plus the repo-wide assertion
```

The third piece already exists: the enrolment row lands in
`tests/mutation/source/registry.ts` before the first diff dispatch.

The split matters for the score. The mutant overlay rewrites the MODULE GRAPH, so a check
that reads its subject off disk with `readFileSync` reads unmutated bytes and passes
unconditionally — the reason `literalSubstitution.test.ts` documents its own
non-enrollment. Keeping `judgeSource` a pure function of a source STRING means the
fixture cases run against the mutated module and can kill mutants; the repo-wide
assertion is the standing gate and contributes no kills.

The new suite supersedes nothing.
`tests/paneCompaction/literalSubstitution.test.ts` stays where it is: it also pins a
single-pass-substitution ordering property that this general judge does not model, and
deleting it to avoid a redundant check would drop that pin.

## 8. Documented limits

Each of these is a known non-detection, stated so a probe that finds it files here rather
than as a round.

1. **Aliased or element-access spellings.** `const r = s.replace; r(a, b)`,
   `s["replace"](a, b)`, and `String.prototype.replace.call(s, a, b)` are not matched. Outside
   the threat fence (§2), and measured at zero live instances (probe record §7) rather than
   assumed rare.
2. **Non-string receivers.** The judge matches on method NAME, so a `.replace` on a
   non-string object would be reported if it took a non-literal second argument. Measured
   at `8bf870991`: zero such sites, and the empty single-argument bucket is checked
   directly in the probe record rather than assumed.
3. **A const-bound literal is reported.** `const SEP = "-"; s.replace(x, SEP)` is a
   finding. Declined resolver, R6; the repair is a wrap.
4. **`docs/**` is unscanned** beyond a reported site count (§3.2).
5. **The judge does not evaluate values.** It cannot tell a runtime value that can contain
   `$` from one that provably cannot; it reports both and the repair is identical.
6. **The capture-preserving cover reads declarations, not values.** `count-capture-cover.mts`
   (§6) settles which replacements carry a `$` sequence WRITTEN somewhere a static pass can
   read: at the call, or in a string-literal const binding. It cannot see a `$` that only
   exists at runtime — one read from a file, built by a template, or returned by a call. Those
   are runtime values, which is the defect the wrap fixes rather than a capture to preserve, so
   the limit costs nothing here; it is stated because the cover's pass C is a completeness
   claim and a completeness claim needs its boundary written down. This limits the AUDIT that
   classifies repairs, not the shipped judge, which reports every non-accepted form regardless.

## 9. Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | `judgeSource` accepts exactly the four node kinds in §3.1 and reports every other second-argument form, with one fixture case per accepted kind and per reported kind. |
| AC-2 | Transparent wrappers resolve: `("x" as string)`, `("x")`, `(fn!)` and a `satisfies` form each classify as their inner expression. |
| AC-3 | A call with fewer than two arguments and no spread is not-in-population, counted, and never reported. |
| AC-3b | A call with a `SpreadElement` at argument index 0 or 1 is REPORTED, not bucketed as not-in-population — asserted for `s.replace(...args)`, `s.replace(...args, b)` where `b` is an accepted literal, and `s.replace(a, ...rest)`. |
| AC-4 | The population is derived from disk and excludes `node_modules/**` and `docs/**`; a file added under a new top-level directory is scanned without any edit to the scanner. |
| AC-5 | The repo-wide assertion reports zero offenders at the PR's head. |
| AC-6 | The guard's premise is executable: the suite fails loudly if the walk finds no call sites at all, so a broken walker cannot read as a clean bill. |
| AC-7 | All 52 in-population offenders are repaired; the four `docs/**` sites are outside the population by rule, not by an enumerated exemption. |
| AC-8 | Each of the three product-path files in §5 carries a behavioural test proving a `$`-bearing input now round-trips literally. |
| AC-8b | `scrubSentryEvent` keeps its `$1` capture semantics through the repair: a test asserts a scrubbed `/show/<slug>/<token>` URL still carries the slug, and fails against the blind-wrap form. |
| AC-9 | The scanner is enrolled in `tests/mutation/source/registry.ts` with a score at or above its floor and an empty unaccepted-survivor set. |

## 10. Out of scope

- Other mini-language-in-data-position APIs — `printf` formats, `sed` RHS, SQL string
  building. The general shape is real and named in lessons rule 363; a sweep per API is
  its own arc.
- Escaping helpers of any kind (R1).
- Rewriting `tests/paneCompaction/literalSubstitution.test.ts` (R2, §7).
