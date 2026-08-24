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

**A text prefilter is allowed, and must be at least as permissive as the AST matcher.** Walking
every tracked file is wasteful when most contain no `.replace` at all, so a cheap regex decides
which files get parsed. That regex is part of the matcher's semantics, not an implementation
detail beneath them: `/\.replace(All)?\s*\(/` looks obviously right and is wrong, because a
wrapped callee spells `(s.replace)(a, v)` — `.replace` followed by `)` — so the file is skipped
before the matcher can see it. This arc shipped exactly that pair for one round: the callee repair
of §3.3 was unreachable in any file whose only `.replace` had a wrapped callee, because the
prefilter had already dropped the file.

The rule is therefore stated rather than left to judgement: **an optimization that can change the
answer is a defect, not an optimization.** The prefilter matches `/\.replace(All)?\b/`, which is
strictly weaker than the AST test it precedes, and AC-4b pins the pair.

### 3.3 Transparent wrappers are asked of the compiler

`("literal")`, `("literal" as string)`, `(fn!)` and `x satisfies string` all denote the
same value as the expression inside them. The judge resolves them with
`skipTransparent` from `tests/_shared/outerExpressions.ts`, which binds TypeScript's own
`skipOuterExpressions` with `OuterExpressionKinds.All`.

**Wrappers are resolved at EVERY kind test, not just the one that happened to be reviewed.** This
arc landed on the same class from three directions: spec round 2 found the ARGUMENT unresolved,
round 4 found the CALLEE unresolved — `(s.replace)(find, repl)` is meaning-preserving, uses no
alias or reflection, and was matched by nothing, so it was neither classified nor reported — and
sweeping after round 4 found the BINDING INITIALIZERS unresolved as well, which made a
`$`-bearing `const TOK = ("$1" as string)` invisible to the cover's pass B and pass C at once.

Three instances of one defect is a signal about placement, not about care. Resolution therefore
happens inside two named helpers that every kind test goes through, rather than at each call site
where the next author can forget it. Measured at the reviewed head: zero live calls use a wrapped
callee and zero `$`-bearing consts use a wrapped initializer, so the repair reds nothing and
closes the class.

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

**The visitor descends through a matched call's receiver.** In `a.replace(x, y).replace(z, w)`
the inner call is nested inside the outer call's callee, so a visitor that stops recursing once
it has classified a call silently drops every link but the last. This is not hypothetical: it is
the defect the round-2 repair of `count-capture-cover.mts` introduced in this very arc, and
neither AC-1 (node kinds) nor AC-6 (a completely empty walk) would have caught it — a
return-after-any-match variant of the shipped classifier reports 44 of 56 and passes both.

**Twelve current sites are reachable only through a matched receiver**, and they are the
regression corpus AC-1b pins, derived by
`docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-chained-receiver.mts`:

```
components/admin/roleRecognizeCopy.ts:127          tests/cross-cutting/psqlStartupFileSuppression.test.ts:2697
lib/sync/feed/shapeHoldEntry.ts:29  (x2)           tests/docs/agentsHeavyPhaseRule.test.ts:914
lib/test/serialAudit.ts:19          (x2)           tests/e2e/_pendingDiscardHarness.tsx:175
scripts/audit-cn-operand-kinds.mjs:1019            tests/e2e/helpers/liveEntryToolchain.ts:191
                                                   tests/e2e/helpers/walkerRoutes.ts:40  (x2)
```

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

Shipping advisory would take the opposite trade: a 4-line diff now, two live product defect
sites left in main — six call sites, both of them reproduced by running the shipped code (§5) — and a second full pipeline — worktree, two adversarial reviews, CI,
merge — to re-earn context this PR already holds. AGENTS.md's disposition rule names that
as the default to avoid.

## 5. What the sweep actually found

The row is filed `**Facing:** process`, and the count contradicts it in the useful
direction. **Six of the 52 sites, in two files**, are on live product paths carrying
operator-authored text straight from the Google Sheets:

| Site | The runtime value | Reachability |
| --- | --- | --- |
| `lib/sync/feed/shapeHoldEntry.ts`, `fill()` | `hold.entity_key`, held and proposed crew names and emails | A crew member named `A$'B` splices the rest of the summary into the middle of Doug's admin feed line. Names are free text in the sheet. |
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

A third product file, `lib/parser/personalization.ts:248`, was listed here in the first draft of
this spec and does NOT belong. Its replacement is `STAGE_CANONICAL[cand] ?? cand`, and `cand`
comes from `closedVocabMatch(cmp, STAGE_VOCAB, 1)` (`lib/parser/personalization.ts:229`), which
returns a member of the vocab it was passed (`lib/parser/fuzzyMatch.ts:58`). `STAGE_VOCAB` is the
four-element constant `["LOAD IN", "SET", "STRIKE", "LOAD OUT"]`
(`lib/parser/personalization.ts:179`) and `STAGE_CANONICAL`
(`lib/parser/personalization.ts:182`) is keyed by exactly those four, so the `?? cand` arm is
dead and `corrected` is one of four fixed display strings. Provably `$`-free. The free-text value at that call is `detected`, which is the PATTERN
argument, where a string matches literally and carries no grammar.

It gets the wrap for hygiene and no behavioural test, because there is no behaviour to change —
and AC-8 is written to exclude it deliberately. A "prove a `$`-bearing input round-trips
literally" test there could only pass by feeding an input the function cannot receive, which is
the premise-on-the-case's-own-inputs defect rather than coverage.

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

That leaves 43, and calling them "tooling and test scaffolding" would hide the second real
finding of this sweep. **Six of them are one class: a harness applying an author-written
`from` → `to` edit through a replacement string.**

| Site | What it does with the result |
| --- | --- |
| `scripts/intraleg-killer-audit.mjs:767` | **`writeFileSync(kill.file, before.replace(kill.from, kill.to))`** |
| `scripts/share-link-flash-adversary-matrix.mjs:876` | **`writeFileSync(p, src.replace(find, replace))`** |
| `tests/mutation/source/surfaceCases.ts:149` | asserts a registry control changes the source |
| `tests/db/connectionCensus.test.ts:1690` | the same assertion, same shape |
| `tests/cross-cutting/pgCronCiVacuity.test.ts:202` | rewrites suite source in memory for a probe |
| `tests/docs/agentsHeavyPhaseRule.test.ts:826` | the `editRule(find, replace)` helper |

The two `writeFileSync` sites are the severe ones. A `$` sequence in an authored `to` there does
not mis-score a test; it writes corrupted source to disk, which is exactly the sibling-arc
incident of the same day.

**And every one of these validates the PATTERN side while none validates the replacement side.**
`intraleg-killer-audit` refuses on `ANCHOR-NOT-UNIQUE`; `share-link-flash-adversary-matrix`
refuses when the anchor is `AMBIGUOUS (${hits} hits)`; `connectionCensus` asserts
`occurrences).toBe(1)`; `pgCronCiVacuity` throws "suite refactored; update the probe anchors".
Meticulous about anchor uniqueness, unaware that the replacement argument is a mini-language.
That is this document's thesis, demonstrated six times over inside the code it repairs — and the
one harness that DID think about it, `tests/mutation/browser/mutate.test.ts:90`, guards precisely
this and is the template for the shared test.

The other 37 substitute fixture ids, CSS class names, digits, a zero-width space, JSON field
names, and AGENTS.md prose. Several substitute JavaScript SOURCE TEXT, which is the input family
where a `$` sequence arrives by accident rather than by design.

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

**The cover has three outcomes, and only two of them are answers.** Counted at the reviewed head,
over all 56 offenders — the `docs/**` four included, since the cover does not know about §3.2's
population subtraction:

| Outcome | Sites | What it means |
| --- | --- | --- |
| Capture found | 2 | A `$` sequence is visible at the call or in a single same-file binding. Repair is capture-preserving. |
| Vouched `$`-free | 9 | The replacement resolves to exactly ONE plain same-file string literal. The wrap provably cannot change behaviour. |
| **Silent** | **45** | The cover can say nothing either way. |

The silent bucket is the honest name for what used to be folded into "takes the ordinary wrap".
A replacement that is a property access, a template expression, a call, or an identifier with no
single literal binding holds a RUNTIME value, and a static pass that reads declarations cannot
know whether that value will contain a `$` sequence — nor, more importantly, whether the author
INTENDED one. For nearly all 45 the wrap is exactly right, because the runtime value reaching a
replacement position IS the defect. But "nearly all" is not "all", and the cover's silence about
a site is not a certificate about it.

`tests/styles/_metaNewTabAnnouncement.test.ts:3697` is why the vouched count is nine rather than
ten: its `hid` has EIGHT same-file bindings, so the repaired pass calls it ambiguous instead of
guessing which one the call sees. That is the R6 rule doing its job, and it moved a site out of
the vouched column rather than into it.

**How large is the residual risk?** Small, and measured rather than asserted. Of the 45 silent
sites, exactly nine mention `$` in the replacement expression at all, and every one of the nine
is a JavaScript template interpolation — `` `./mod${id}` ``, `` `"${field}":9007199254740993` ``,
`` `name="DIAGRAMS${ZWSP}"` `` — which JavaScript evaluates before `.replace` ever receives the
string. None is a `String.replace` capture reference. The other 36 do not mention `$` at all. So
no silent site carries a STATIC hint of deliberate substitution grammar, and the residual is
confined to a value that acquires a `$` sequence at runtime AND was meant to be interpreted.

So the repair rule for a silent site is READ IT, one line each, and the reading is what the
commit records. **All 45 were read at spec time rather than deferred to implementation**, and the
read produced one class of six (§5), two individually-noted sites, and no site needing a
disposition other than the wrap. The two worth naming: `premiseScan.test.ts:5301` substitutes
GENERATED CODE TEXT and looked like a seventh class member, but the call sits inside
`premiseHolds(...)`, so a mis-applied replacement makes the premise false and the suite fails
loudly — a conservative failure, which §2's consequence bound sends to documented limits rather
than to a finding; and `fake-codex.mjs:63` substitutes an environment variable's value, the only
site whose replacement originates outside the process.

**The rule earned its keep on first use.** Reading the silent bucket surfaced
`tests/mutation/source/surfaceCases.ts:149`,
`source.replace(surface.control.from, surface.control.to)` — the source mutation harness applying
a registry row's control to prove its own overlay is live. `control.to` is registry-authored code
text, so a `$` sequence in it applies as something other than its declared text and the liveness
proof silently tests bytes nobody wrote. The project already judged this class worth guarding in
the SIBLING harness: `tests/mutation/browser/mutate.test.ts:90` asserts `applyEdits` inserts a
replacement containing `` $& $` $' $1 `` verbatim, its comment reading "the run would score a
mutant nobody wrote." The browser harness is defended and the source harness is not. No control
value carries a `$` sequence today, so it is latent; the edit that makes it bite is ordinary,
since controls are code snippets and this repo's code contains `"$1[shareToken-redacted]"`. §8 limit 6 states the boundary and the one-edit shape that makes it bite.

Against §4's in-population arithmetic: of the two captures one is the excepted `docs/**` site, so
the 52 repaired here divide as **1 capture-preserving + 9 vouched `$`-free + 42 silent**, and the
51 wraps of §4 are those 9 plus those 42.

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
6. **The capture-preserving cover reads declarations, not values, and its silence is not a
   certificate.** `count-capture-cover.mts` (§6) settles which replacements carry a `$` sequence
   WRITTEN somewhere a static pass can read: at the call, or in a single same-file string-literal
   binding. It positively finds 2 and positively vouches 9. About the other 45 it is SILENT, and
   an earlier draft of this section wrongly called that boundary free on the grounds that a
   runtime `$` is the defect rather than an intent.

   That is not true, and one ordinary edit shows it: rewrite
   `lib/observe/scrubSentryEvent.ts:15` as
   `const TOKEN_PLACEHOLDER = ["$1", "[shareToken-redacted]"].join("")` and the value is
   unchanged, the capture is still deliberate, and the cover drops from "capture found" to
   silent with an empty residual — after which §6's rule would assign the ordinary wrap and
   break the redaction:

   ```
   cover:      {"textual":false,"sameFile":false,"unresolved":true,"residual":false}
   original:   https://example.test/show/rpas-central/[shareToken-redacted]?x=1
   blind-wrap: https://example.test$1[shareToken-redacted]?x=1
   ```

   The mitigation is not a better resolver — that is the widening this arc keeps declining — but
   the repair rule in §6: a silent site is READ before it is wrapped. This limits the AUDIT that
   classifies repairs; the shipped judge is unaffected, because it reports every non-accepted
   form regardless of what the cover can say about it.

## 9. Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | `judgeSource` accepts exactly the four node kinds in §3.1 and reports every other second-argument form, with one fixture case per accepted kind and per reported kind. |
| AC-1b | A CHAINED call reports every offender in the chain, not only the outermost: `s.replace(a, v).replace(b, w)` yields two findings, and a three-link chain yields three. The repo-wide assertion additionally reconciles its total against `count-conservative.mts`, so a visitor that stops descending cannot pass by agreeing with itself. **The comparison oracle must resolve wrappers and prefilter exactly as the judge does** — spec round 5 found it doing neither, which made the cross-check vacuous on precisely the axis under review; both now come from one shared module. |
| AC-2 | Transparent wrappers resolve: `("x" as string)`, `("x")`, `(fn!)` and a `satisfies` form each classify as their inner expression. |
| AC-3 | A call with fewer than two arguments and no spread is not-in-population, counted, and never reported. |
| AC-3b | A call with a `SpreadElement` at argument index 0 or 1 is REPORTED, not bucketed as not-in-population — asserted for `s.replace(...args)`, `s.replace(...args, b)` where `b` is an accepted literal, and `s.replace(a, ...rest)`. |
| AC-4 | The population is derived from disk and excludes `node_modules/**` and `docs/**`; a file added under a new top-level directory is scanned without any edit to the scanner. |
| AC-4b | Any text prefilter admits every file the AST matcher would report on. Asserted by running BOTH over a fixture set that includes each wrapped-callee spelling and comparing the file sets, so a prefilter tightened later fails rather than silently shrinking the population. |
| AC-5 | The repo-wide assertion reports zero offenders at the PR's head. |
| AC-6 | The guard's premise is executable: the suite fails loudly if the walk finds no call sites at all, so a broken walker cannot read as a clean bill. |
| AC-7 | All 52 in-population offenders are repaired; the four `docs/**` sites are outside the population by rule, not by an enumerated exemption. |
| AC-8 | Each of the two live product-path files in §5 carries a behavioural test proving a `$`-bearing input now round-trips literally, in the `$'`, `$&` and `` $` `` spellings. `lib/parser/personalization.ts` is deliberately excluded: its replacement is a four-value closed vocabulary, so no input can exercise the claim and a test there would assert on a fixture the function cannot receive. |
| AC-8b | `scrubSentryEvent` keeps its `$1` capture semantics through the repair: a test asserts a scrubbed `/show/<slug>/<token>` URL still carries the slug, and fails against the blind-wrap form. |
| AC-9 | The scanner is enrolled in `tests/mutation/source/registry.ts` with a score at or above its floor and an empty unaccepted-survivor set. |

## 10. Out of scope

- Other mini-language-in-data-position APIs — `printf` formats, `sed` RHS, SQL string
  building. The general shape is real and named in lessons rule 363; a sweep per API is
  its own arc.
- Escaping helpers of any kind (R1).
- Rewriting `tests/paneCompaction/literalSubstitution.test.ts` (R2, §7).
