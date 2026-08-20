# Send-authorization single-read lint — implementation plan

Spec: `docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md`, canonical
throughout. Row: `BL-SEND-AUTH-SINGLE-READ-LINT` (`BACKLOG.md:1350`).
Branch: `feat/send-auth-single-read-lint`.

**This plan is derived from the NARROWED spec, and a pre-narrowing draft was discarded rather than
patched.** Spec rounds 1 and 2 returned seven findings on one axis — every one an evasion of a claim
that tried to prove an EXECUTION property. The mandated repair direction for same-axis recurrence on a
recognizer is narrowing (`AGENTS.md`, repair-direction bullet), so the spec withdrew sink dominance and
deleted the call-graph traversal. That removed two of the earlier draft's three analysis mechanisms, so
patching it would have carried dominance and traversal reasoning inside task bodies. Every block below
either points at a surviving spec section or is new.

## Global constraints

- **TDD per task** (invariant 1). Every task: observed red on the stated command, minimal
  implementation, the SAME command green, one commit.
- **No behavior change to `scripts/pane-compaction.ts`.** The only edit to that file is one comment
  line (Task 7). The send path is fenced and owned by `BL-PANE-COMPACTION-SEND-AUTHORIZATION`
  (spec §1.1 item 1).
- **The scanner is an importable module with a referring suite from the start**, because it is a guard
  surface and the source-mutation runner overlays a target only when a Vitest suite imports it
  (`AGENTS.md`, convergence bullet 4). No terminal CLI script, no module-scope `process.exit`.
- **No control-flow reasoning anywhere in the implementation.** The scanner has no call graph, no path
  counting and no dominance analysis (spec §1.1 item 5, §4 limit 1). A task step that would need to
  know whether, when, or how often code RUNS is out of scope by ratified decision, not by omission.
- **Every guard states its premise executably** (`tests/_shared/premise.ts`). The live-tree assertions
  in Task 7 are the ones that would otherwise pass vacuously — an empty registry or a mis-rooted walk
  must not read as green.
- **Findings are data, not strings.** Every finding is a typed record with `code`, `file`, `line`, and
  the method or callee it names; assertions compare records by equality, never a rendered substring.
- **Silence is never a certificate.** Every task adding a classification adds, in the same commit, the
  fixture proving the UNCLASSIFIED form is REPORTED rather than dropped (spec §0).
- **Heavy-phase discipline.** `pnpm mutation:guards` is a MUST-WRAP command: it runs as
  `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards`, never bare, and likewise for any scoped
  `--project mutation` run (`AGENTS.md`, heavy-phase rule).

## File structure

```
tests/paneCompaction/sendAuthScan.ts                  # NEW: SEND_AUTH_SURFACES, scanModule, scanRepo, Finding
tests/paneCompaction/_metaSendAuthSingleRead.test.ts  # NEW: the gate (live-tree scan + fixtures)
tests/paneCompaction/fixtures/sendAuth/*.ts           # NEW: one fixture per verdict
scripts/pane-compaction.ts                            # EDIT: one comment line above `authorize`
tests/mutation/source/registry.ts                     # EDIT: one row, id "sendAuthScan"
tests/mutation/source/expectedLedgerKinds.ts          # EDIT: the surface's ledger-kinds entry
tests/mutation/_metaPremiseContract.test.ts           # EDIT: EXPECTED_ENV_TOUCHING declaration
BACKLOG.md                                            # EDIT: the row's stale claim; graduation at close
```

## Pre-draft verification pass — RUN by this session, with outputs

Every citation below was re-derived against the live tree at `b7dbb60ed` for THIS draft rather than
inherited from the discarded one. **Two citations in the discarded draft had already drifted** —
it cited `tests/mutation/source/registry.ts:83` for the `scoreFloor` check (line 83 is blank; the check is at
`tests/mutation/source/registry.ts:81`) and, in the draft's own unqualified form, `stripComments.ts:12`
for `commentRanges` — line 12 there is a comment, and the export is at
`tests/_shared/stripComments.ts:13`. Both are quoted here as the WRONG citations they were, not used
as references. That is the class that dominates
round-1 findings, and it is the concrete reason this plan was re-derived rather than patched.

- **Registry row shape.** `GuardSurface` (`tests/mutation/source/registry.ts:12`) requires `id`,
  `sourcePath`, `suitePaths`, `operators`, `scoreFloor`, `control`, `accepted`. Validation:
  `scoreFloor` must be finite in `(0,1]` (`tests/mutation/source/registry.ts:81`); `control.from` and
  `control.to` must differ (`tests/mutation/source/registry.ts:86`); `control.from` must occur in the
  source (`tests/mutation/source/registry.ts:91`) and EXACTLY once
  (`tests/mutation/source/registry.ts:94`).
- **Accepted survivors.** `AcceptedSurvivor` is `{siteId, kind: "equivalent"|"accepted-gap", reason,
  ref?}` (`tests/mutation/source/ledger.ts:18-24`); `reason` is required. `equivalent` rows are
  EXCLUDED from the denominator (`tests/mutation/source/ledger.ts:80-81`) while `accepted-gap` rows
  stay in it. A free-text ref makes an accepted gap look tracked while resolving to nothing, and is
  rejected (`tests/mutation/source/registry.ts:124`).
- **Operator names** are `OPERATOR_NAMES` (`tests/mutation/source/operators.ts:17`). Site ids are
  LINE-KEYED, so they re-key on any edit above them — the ledger is re-derived after any source edit,
  never carried across one.
- **Enrolment is THREE declarations, not one.** Besides the `GUARD_SURFACES` row: a row in
  `EXPECTED_LEDGER_KINDS` (`tests/mutation/source/expectedLedgerKinds.ts:24`), consumed by
  `tests/mutation/guardSurfaces.gates.test.ts:11` and by
  `tests/mutation/source/surfaceCases.ts:59`; and every enrolled suite path must declare its
  environment-touching count in `EXPECTED_ENV_TOUCHING`
  (`tests/mutation/_metaPremiseContract.test.ts:32`), which asserts the declared key set EQUALS the
  enrolled suite list (`tests/mutation/_metaPremiseContract.test.ts:376`), so an undeclared suite reds
  immediately. A registry row alone leaves the corpus gate red.
- **`-t` cannot scope the gate, and neither can a temporary shard.** `runSurface` executes in the
  `describe.each` body at collection (`tests/mutation/source/surfaceCases.ts`), so a name filter prunes
  reporting only after every surface has already run. A temporary shard file does not work either — the
  `mutation:guards` script names the four committed shard files explicitly, so a new one is never
  collected. Task 8 carries the scoping that does work, with its exact command; this bullet states only
  what does NOT, so the two cannot drift apart.
- **`premise` API is exactly two functions.** `premise(description, actual, mustExceed)` — strict `>`
  (`tests/_shared/premise.ts:26`) — and `premiseHolds(description, condition)`
  (`tests/_shared/premise.ts:36`).
- **Comment extraction must be impostor-safe.** A raw line-regex over a function span matches a token
  inside a string literal or JSX. The repo's impostor-safe mechanism is `commentRanges`
  (`tests/_shared/stripComments.ts:13`), single-source-enforced by
  `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`. The scanner uses `commentRanges`; this
  is what makes AC-5's "a token inside a string literal is not a declaration" hold.
- **`walkSourceFiles`** (`lib/messages/__internal__/walkSourceFiles.ts:8`) takes
  `(roots, options)`, returns paths joined to the roots it is given, defaults to `.ts`/`.tsx`, and
  skips ONLY `__generated__` (`lib/messages/__internal__/walkSourceFiles.ts:23`) — it does NOT skip
  `node_modules`, so the roots this scanner passes are narrow and explicit.
- **Vitest and CI wiring: nothing new to register.** `BASE_INCLUDE` already covers
  `tests/**/*.test.ts` (`vitest.projects.ts:34`), and the fixtures carry a plain TypeScript extension
  rather than a test one, so they are never collected as suites. `tests/paneCompaction/**` is absent from `PARALLEL_TEST_GLOBS`
  (`vitest.projects.ts:104`), so the gate runs in the serial project — a partition pinned by
  `tests/cross-cutting/vitest-projects-partition.test.ts`.
- **The live probes reproduce.** All five fenced transcripts in spec §3 were re-executed at base
  `4b5028b44` immediately before the round-3 spec dispatch and reproduce exactly as printed, including
  §3.3's r2 F1 mutant scanning CLEAN. The command is in spec §3; the throwaway prototypes live under
  the gitignored `.claude/` tree and are deliberately not tracked.

### Every `red=` swept under `--exec-red`, and the silence distinguished from the pass

Plan round 1 found a red that could not fail. The class repair is not to re-check the named markers but
to run the arm that decides the question over ALL of them:

```sh
$ pnpm spec:lint --exec-red docs/superpowers/plans/ci/2026-08-19-send-auth-single-read-lint.md
summary: 0 hard, <n> advisory
```

**Zero hard is the claim; the advisory count is deliberately not pinned.** An exact advisory total
changes on almost every edit to this document, so a number written here is stale by the next commit —
and a count the reader cannot reproduce is precisely the defect this plan asks its own tasks to avoid.
(It was pinned once, at 24, and was 22 two commits later.) What IS stable and checkable: every
red-contract advisory is `RED_SUITE_UNVERIFIED` naming the gate suite this plan creates, which is the
correct signal for an `authored` red pointing at a file that does not exist yet; the remainder are the
document-level advisories `spec:lint` emits for any prose of this length.

**Silence must be distinguished from a pass, because this arm is silent on some command shapes.**
Probed while drafting: `spec:lint --exec-red` mints NO finding — not even the `RED_PROBE_UNVERIFIED`
advisory it emits for a probe it cannot derive — when a `red=` is wrapped in `pnpm heavy`, because
`deriveCollectionProbe` returns kind `none` and `collectionProbePlan` drops the marker
(`lib/specLint/redContract.ts:721`). So "no finding" is evidence of collection only where the arm can
see the shape at all.

**Task 8's marker is one the arm CANNOT see, deliberately.** Its command is a `--project mutation` run,
which the heavy-phase rule requires be wrapped, and wrapping it puts it in exactly the blind spot
above. The invariant wins over the lint's convenience, so the collection question is answered for that
marker by EXECUTION instead: all three of its commands were run by hand at plan time and collect and
pass — the gates file collects 5 tests under the wrapped form, and the premise-contract and
registry meta-tests both collect and pass. Every OTHER marker in this plan is a shape the arm does see,
which is what makes the `0 hard` above meaningful for them. The blind spot itself is filed as the
second peer row in the closeout rather than worked around here.

### Fixture-collision check — settled by EXECUTION, after two greps failed

The fixtures deliberately contain violating code and a `// send-auth: pass` token, so any other suite
that walks `tests/` could claim them. **Three attempts at a static cover are recorded here because the
third failure is the one that settles the method question.**

*Attempt 1, too broad to act on.* `rg -l "walkSourceFiles|readdirSync" tests/` returns on the order of
190 files — every suite that walks anything. The exact total is not quoted because it is not
reproducible across environments: review measured 194 against 193 here, a difference in ignore-file
handling, and nothing in the argument depends on which is right. A disposition list of that size is a
sweep authored but not usefully run at any of those numbers.

*Attempt 2, unsound.* Grepping for the literal `paneCompaction` can only find suites that already name
the directory, so a GENERIC walker is invisible to it by construction.
`tests/cross-cutting/_metaStripCommentsSingleSource.test.ts:304-317` walks all of `tests/` and never
contains the token.

*Attempt 3, ALSO unsound, and by the same mechanism one level up.* Deriving the cover from walk-root
VARIABLE NAMES (`TESTS_DIR|TESTS_ROOT|ROOTS|SCANNED_DIRS`) is still a name grep — it just greps for a
different name, so a walker whose root is spelled inline, or held in a constant named anything else,
stays invisible. **It fails on its own terms before any of that matters: the command as printed returns
ZERO files, not the five rows it was used to justify.** A cover that cannot reproduce itself is not
evidence, and no further grep repairs the class — "walks a directory that contains my fixtures" is not
a lexical property, so no static pattern can decide it.

**The cover is therefore EXECUTION, and it belongs to Task 1 rather than to plan time.** The fixtures
do not exist yet, so nothing can be run against them today; that is a fact about the question, not a
gap in this plan. Task 1's procedure, in its own commit:

1. Create `tests/paneCompaction/fixtures/sendAuth/` with the full fixture set.
2. Run the whole suite once: `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm test`.
3. **Every suite that newly fails is a collision, and each is dispositioned in that commit** — either
   the fixture is adjusted, or the walker gains a skip entry, with the reason recorded.
4. A green run IS the cover. It ranges over every walker that actually exists, including ones no grep
   would name, because a walker that would claim these fixtures must execute to do so.

This is the only method whose blind spot is empty. The two known-relevant walkers
(`_metaStripCommentsSingleSource`, `vitest-projects-partition`) are called out in Task 1 as the ones
most likely to fire, but the disposition list is produced by the run, not by this paragraph.

### `paneCompactionCore`'s ledger is NOT disturbed by this arc — checked, not assumed

Mutation site ids are line-keyed, so an edit that shifts lines in an enrolled source invalidates that
surface's accepted rows. Task 7 adds one comment line to `scripts/pane-compaction.ts`. The enrolled
surface is a DIFFERENT file: `paneCompactionCore.sourcePath` is `scripts/lib/pane-compaction-core.ts`
(`tests/mutation/source/registry.ts:233`). Its EIGHT accepted rows are keyed on lines in that file
(`integer-literal:557:53:0>1` and its siblings) and are untouched by anything this arc edits, so they
are inherited legitimately rather than by assumption. The count is stated because it was first written
as seven — an `awk` range that clipped the last row — and a number nobody re-derives is exactly the
kind of claim this plan asks its own tasks to produce by command. Recorded here so a reviewer does not re-derive
it, and so that a later task which DOES touch the core file knows the rule it would then owe.

## Meta-test inventory (mandatory declaration)

<!-- spec-lint: ignore — created by this plan's implementation; not tracked yet -->

- **CREATES:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts` — the gate itself.
- **EXTENDS:** `tests/mutation/source/registry.ts` (one `GUARD_SURFACES` row),
  `tests/mutation/source/expectedLedgerKinds.ts` (one entry),
  `tests/mutation/_metaPremiseContract.test.ts` (one `EXPECTED_ENV_TOUCHING` key).
- **Not applicable, with reason:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) —
  no Supabase client call. Advisory-lock topology — no `pg_advisory*` in the diff. Admin-alert catalog
  and sentinel-hiding — no admin alert and no tile. Mutation-surface observability
  (`tests/log/_metaMutationSurfaceObservability.test.ts`) — the diff adds no mutating route and no
  `"use server"` action.

## Mutation-operator families — the closure set for review

The scanner is enrolled with the registry's declared operator set
(`tests/mutation/source/operators.ts:17`); that set, plus an empty unaccepted-survivor list, IS the
convergence criterion for the diff rounds. A reviewer-proposed new family is admissible only with a
live escaping mutant demonstrated against the shipped guard, not hypothesized.

## String-presence mutants — N/A by construction, and why that is stated

The writing-plans rule requires four pre-dispatch mutants for any assertion of the shape “this string
appears in this output”. This plan has none: every assertion compares typed finding RECORDS by
equality (`code`, `file`, `line`, and the method or callee named), never a rendered message. The rule
is satisfied by construction rather than waived — and the construction is load-bearing, because a
substring pin on a rendered message is exactly the shape that survives a scanner reporting the right
code for the WRONG site.

## The renamed-surface fixture — every fixture varies the registry row, and none uses the live spellings

**The whole fixture set would otherwise be satisfiable by a scanner hardcoded to the live instance.**
Every mandated case so far describes a `Surface` type, a binding named `s`, a sink named `send`, a pass
named `authorize`, and the ten live member names. A scanner that pattern-matches those literals passes
all of them while completely ignoring `SEND_AUTH_SURFACES` — and then reports nothing the first time
someone renames the binding or enrols a second module, which is the contract the registry exists to
carry.

So the fixture set is authored against a DELIBERATELY DIFFERENT row, and this is a requirement on every
fixture rather than one extra case:

```ts
{ module: "<fixture path>", surfaceType: "Channel",
  sinks: ["dispatch"],
  effects: ["emit", "trace"],
  ambient: ["clock"],
  derivationHelpers: ["snapshotOf"] }
```

The fixtures use `Channel`, a binding named `ch`, a pass named `settle`, reads named for that type, and
`snapshotOf` as the derivation helper. **Not one live spelling appears in the fixture corpus.** A
scanner specialized to `Surface` / `s` / `send` / `authorize` / `cacheOf` fails every fixture
immediately, which is exactly the discrimination the set is for.

The live instance is then covered by exactly one case — Task 7's live-tree scan — and that split is the
point: the fixtures prove the rules are driven by the registry row, and the live tree proves the shipped
row is correct. A rule that only ever sees one vocabulary cannot tell those two claims apart.

Two further variations ride in the fixture set for the same reason: a row whose `sinks` names a member
that is NOT called anywhere (so discovery finds no send-bearing function and the module scans clean),
and a second registered module in one `scanRepo` run (so nothing may assume a single-row registry).

## Weaker-implementation cover — every rule, its weaker form, and the fixture that kills it

Three findings across plan rounds 2 and 3 were ONE class: **the fixture set was satisfiable by
something that is not the thing the rule specifies.** A scanner hardcoded to the live spellings passed
the whole corpus; a per-file marker counter satisfied a rule about association; a helper-only
recognizer satisfied "exactly one derivation" and would then have reported against the live tree, since
the shipped memo at `scripts/pane-compaction.ts:797` is a SPREAD. Three instances in two rounds is the
same-vector trigger, and the prescribed answer is a derived cover rather than another round.

This is the cover, applied in ONE pass to every rule the plan specifies. It is distinct from the
anti-tautology rule and both apply: anti-tautology asks whether an assertion can fail at all; this asks
whether it can fail for the RIGHT REASON. A fixture set that a weaker implementation passes is green
about a property it never tested.

| Rule | Strictly weaker implementation that would pass | Fixture that kills it | Task |
| --- | --- | --- | --- |
| Read set derived from the type | Hardcode the ten live read names | Fixture surface with an undeclared eleventh member | T1 |
| Discovery anchored on SINKS | Anchor on any effect | `effects-only-no-pass` — many `emit`/`trace` calls, no sink, no pass: must scan CLEAN | T2 |
| Marker attaches to a FUNCTION | Count markers per file | `detached-marker`, `two-sends-one-marker` | T2 |
| Marker read impostor-safely | Line-regex over the function span | Marker token inside a string literal | T2 |
| Exempt needs a reason | Accept the bare token | Empty-reason fixture | T2 |
| Totality is MODULE-WIDE | Scope totality to the pass | `destructure-outside-pass` | T3 |
| Ambient callbacks exempt | Exempt every member handed as a callback | Same shape with a READ member: must report | T3 |
| Injection outside vs handoff inside | Report every raw-surface argument anywhere | Ordinary injection outside a pass: must NOT report | T3, T5 |
| Reads must be straight-line | Report every in-pass direct read | `single-read-clean` | T4 |
| At most one read per method | Report on the first read | `single-read-clean`; and exactly two must report BOTH lines | T4 |
| EXACTLY one derivation | At most one | `zero-derivations` | T5 |
| A spread IS a derivation | Recognize declared helpers only | `spread-derivation` (the live memo's own shape) | T5 |
| Derivation position checked | Ban derivations under any nesting | Shipped-memo shape on the straight-line path: must NOT report | T5 |
| Declared helper list | Treat any call taking the surface as a derivation | The round-4 fixture (an "any call" reading silences it entirely) | T5 |
| Unregistered importers report | Iterate the registry only | Fixture module under the walked root with no row | T6 |
| ...and only UNregistered ones | Report every module importing the type | `registered-importer` — a module WITH a row importing the type: must NOT report | T6 |
| Rules are registry-driven | Hardcode `Surface`/`s`/`send`/`authorize` | The whole corpus is authored on the `Channel` row | all |
| Registry may hold many rows | Assume a single row | Two registered modules in one `scanRepo` run | T6 |
| A declared sink may be absent | Assume the sink is always called | Row whose sink is never called: module scans clean | T2 |
| Live-tree emptiness is meaningful | Assert cardinalities | Intersection premise + positive control in a second invocation | T7 |

Two rows in that table were GAPS when it was written — `effects-only-no-pass` and
`registered-importer` — and both are added to their tasks by this pass rather than left for a reviewer
to find as instance four.

## Acceptance criterion to task

| AC | Task | AC | Task |
| --- | --- | --- | --- |
| AC-1 totality, module-wide | T3 | AC-9 `UNREGISTERED-IMPORTER` | T6 |
| AC-2 ambient callback stays clean | T3 | AC-10 live tree green, red without the marker | T7 |
| AC-3 injection outside vs handoff inside | T3, T5 | AC-11 the gate's own premise | T7 |
| AC-4 read set derived from the type | T1 | AC-12 mutation score, no unaccepted survivors | T8 |
| AC-5 declared / undeclared / ambiguous pass | T2 | AC-13 the ledger row's stale claim | closeout |
| AC-6 `NON-STRAIGHT-LINE-READ` | T4 | AC-14 discovery anchored on sinks | T2 |
| AC-7 `MULTI-READ` | T4 | AC-15 the withdrawn claim, pinned both ways | T2 |
| AC-8 one declared derivation | T5 | AC-7b derivation position | T5 |

## Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — the scanner module, and the read set derived from the surface type

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`readsFor returns the hardcoded live read names, so the fixture surface's extra undeclared member is absent from the returned set and the equality assertion fails on a VALUE, not on an unresolved import` ac=AC-4 -->

**This task OWNS the fixture-collision cover, and it is executable rather than grepped.** After the
fixtures land, run `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm test` and disposition every newly failing suite
in this same commit. A green run IS the cover, and it is the only form whose blind spot is empty —
three static covers were attempted while drafting and the third was unsound by the same mechanism as
the second (see the verification section). Two walkers are the most likely to fire, named here as
starting points rather than as the disposition list:

- `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` requires a walked file not to implement
  its own comment handling. The fixtures are inert data and the scanner uses the shared
  `commentRanges`, so both should comply.
- `tests/cross-cutting/vitest-projects-partition.test.ts` pins that every non-nightly test file lands
  in exactly one default project. The fixtures carry a plain TypeScript extension rather than a test
  one, so it never claims them; the GATE SUITE does land in exactly one, because
  `tests/paneCompaction/**` is absent from `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:104`) and so runs
  in the serial project.

Create the scanner module exporting `SEND_AUTH_SURFACES`, `scanModule(file, row): Finding[]`,
`scanRepo(roots): Finding[]`, the `Finding` type, **and `readsFor(sourceText, row): string[]`** — an
importable module, no module-scope `process.exit`, with the gate suite importing it in the same commit
(spec §2.5 edits 1-2).

**`readsFor` exists because AC-4 is otherwise UNOBSERVABLE, and that is a real design constraint rather
than a convenience.** The read set is the COMPLEMENT: every member of the `Surface` type declaration
minus the row's declared `sinks`, `effects` and `ambient`. But a correctly-counted single read produces
NO finding, so nothing in a findings-only API distinguishes "this member is in the read set" from "this
member is ignored". Proving AC-4 through `scanModule` would require provoking a VIOLATION, and every
violation code belongs to Tasks 3-5 — implementing one here would invalidate a later task's RED, and
omitting it would leave this task's discriminator vacuous. Exposing the derived set directly resolves
both: the assertion compares `readsFor(...)` against the expected complement by equality.

**`readsFor` is a FOURTH export beyond the three the approved spec names** (§2.5 edit 1 lists
`SEND_AUTH_SURFACES`, `scanModule` and `scanRepo`). It is additive and contradicts no spec claim — the
read set and its derivation are exactly as §2.2 defines them; this only makes the derivation readable
by a test. Recorded rather than slipped in, because the spec is ratified and a silent divergence from a
ratified artifact is the kind of drift review exists to catch.

**The RED is an assertion failure, not a collection failure, and the distinction is load-bearing.** A
red that comes from an unresolved import is invalid by construction — it goes green when the test file
changes rather than when the implementation lands (`docs/agents/writing-plans.md`, RED-validity
bullet). So the module is created in this task with `readsFor` present but returning the ten live read
names as a hardcoded list. The suite then feeds it a FIXTURE surface type carrying an eleventh member
declared in none of the three sets, and asserts the returned set contains it. That fails on a value the
implementation controls. GREEN is deriving the complement from the parsed type declaration.

## Task 2 — declared passes, anchored on sinks and read impostor-safely

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`the scanner has no pass discovery, so UNDECLARED-PASS is never emitted and the fixture asserting it gets an empty findings array` ac=AC-5 -->

A send-bearing function is one whose body calls a declared SINK on a surface binding. Exactly one
declared `// send-auth: pass` per send-bearing function, or `// send-auth: exempt: <reason>` with a
non-empty reason. Zero is `UNDECLARED-PASS`; two or more is `AMBIGUOUS-PASS` (spec §2.1).

Four failure modes this task must catch, each with its own fixture. The first two are about the token:
an empty exempt reason does NOT suppress; and a `// send-auth: pass` token inside a string literal or
JSX is NOT a declaration — which is why extraction goes through `commentRanges`
(`tests/_shared/stripComments.ts:13`) and not a line-regex over the function span.

**The other two exist because the rule is about ASSOCIATION, and a module-wide marker COUNT would
satisfy everything else.** The spec requires the marker immediately above the pass, and exactly one
pass lexically inside each send-bearing function. An implementation that merely counts markers per
FILE passes every fixture above:

- `detached-marker` — the module contains a `// send-auth: pass` marker, but it sits above something
  that is not the pass (a helper, a type, a blank run). The send-bearing function therefore has NO
  declared pass and must report `UNDECLARED-PASS`, even though the file's marker count is 1.
- `two-sends-one-marker` — TWO send-bearing functions and a single marker, correctly attached to a pass
  inside the first. The second must report `UNDECLARED-PASS`. A per-file counter sees one marker and
  one-or-more send-bearing functions and says nothing.

Both are authored against the `Channel` row like the rest of the corpus.

**`effects-only-no-pass` is the fixture that makes AC-14 discriminating**, and it was a gap until the
weaker-implementation pass above: a `Channel` module whose functions call only `emit` and `trace`, with
no sink call and no declared pass anywhere, must scan CLEAN. A scanner anchored on effects reports
`UNDECLARED-PASS` against it. Paired with it, a row whose declared sink is NEVER called must also scan
clean, so discovery cannot assume the sink is present.

AC-14 rides here: a function whose only effect calls are `out` is NOT send-bearing. The live module is
the proof — `main` carries fifteen `s.out(...)` calls and no pass (spec §3.5), so a scanner anchored on
effects reports against correct code.

**AC-15 rides in this task's commit, and it is deliberately an assertion with no red of its own.** A
fixture whose pass is called CONDITIONALLY must scan CLEAN, asserted with a comment naming spec §4
limit 1 and citing the §3.3 probe. There is no honest red-then-green cycle for it: the scanner already
declines to analyze control flow, so the assertion passes the moment it is written. That is what a
characterization pin IS, and manufacturing a `red=` for it would be the
marker-whose-cycle-cannot-complete shape the red contract rejects — the same reasoning that keeps the
ledger correction out of the task list. Its value is directional: spec round 2 defeated a dominance
rule with one conditional, and the design responded by WITHDRAWING the claim. Without this assertion
the fence holds in one direction only — a later contributor "fixes" the apparent gap, control-flow
analysis re-enters, and the round-1-through-round-3 ratchet restarts. With it, that edit fails a test
that explains why.

## Task 3 — totality, MODULE-WIDE

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`nothing classifies surface occurrences, so the alias and destructure fixtures report no UNCLASSIFIED-USE` ac=AC-1 -->

Every occurrence of a surface binding ANYWHERE in an enrolled module is one of: a direct member call,
a declared derivation source, an ordinary injection argument OUTSIDE a pass, a parameter or
declaration name, or an AMBIENT member handed on as a callback. Anything else — `const m = s.marker`,
`const { send } = s`, `s[name]`, a bare mention — is `UNCLASSIFIED-USE` and fails the gate
(spec §2.3 rule 1).

**Module-wide is the point, not an implementation detail.** Spec round 2's F3 evaded a pass-scoped
totality rule with `const { send } = s` in a branch OUTSIDE the pass. Fixture `destructure-outside-pass`
is that exact shape and must report.

**AC-2 is the false-positive guard and it must land in this same commit:** `random: s.random` at
`scripts/pane-compaction.ts:850` is an ambient member handed on as a callback, and it appears in
correct live code. A rule that reports it fails the live tree. The paired fixture does the same thing
with a READ member and MUST report — the two together are what make the exemption discriminating
rather than a hole.

## Task 4 — in-pass reads are straight-line and single

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`no read-position analysis exists, so the nested-callback and twice-read fixtures both report an empty findings array` ac=AC-6 -->

Inside the declared pass, a read call must sit on the pass's own straight-line path: no enclosing
nested function, callback, or loop between it and the pass body (`NON-STRAIGHT-LINE-READ`). Each read
method may appear at most once on that path (`MULTI-READ`, naming BOTH lines) (spec §2.3 rule 2).

**This one rule replaces the discarded draft's per-invocation counting and its cycle detection.** Spec
round 2's F2 — a NAMED local callback invoked twice — is caught because the read sits behind a nested
function, with no need to know how many times it runs. Round 1's F2 repeated helper is caught by
Task 5's `RAW-HANDOFF`. FOUR fixtures, all authored against the `Channel` row rather than the live spellings (see the
renamed-surface section), and the fourth is what makes the other three mean anything: `nested-function`,
`named-callback` (asserted by that name, per AC-6), `loop-read`, and **`single-read-clean` — an
ordinary straight-line read of one method, which must scan CLEAN**. Without that counterpart this
task's green is satisfiable by reporting EVERY in-pass direct read, which would pass all three
violation fixtures and fail the live tree. AC-7's `MULTI-READ` case pairs the same way: two
straight-line reads of one method report and name BOTH lines, one read scans clean.

## Task 5 — exactly one declared derivation, and no raw handoff inside the pass

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`derivations are not recognized, so the round-4 fixture reports no RAW-HANDOFF, the two-derivation fixture reports no MULTI-DERIVATION, and the looped-derivation fixture reports no NON-STRAIGHT-LINE-DERIVATION` ac=AC-8 -->

A derivation is a declaration inside the pass whose initializer spreads the surface or calls a
DECLARED derivation helper with it (`cacheOf`, `memoize`). Two derivations is `MULTI-DERIVATION`.
Reads through a derived binding are unconstrained; raw reads inside the derivation's own initializer
are exempt from rule 2's per-method limit — that is the shipped memo at
`scripts/pane-compaction.ts:797`. **The exemption is POSITIONAL, not temporal, and the difference is
this task's whole point:** the derivation's DECLARATION must itself sit on the straight-line path, or
it reports `NON-STRAIGHT-LINE-DERIVATION` (spec §2.3 rules 2 and 3). Passing the raw surface to
anything else inside the pass is `RAW-HANDOFF`.

**Two fixtures carry the r3 F1 shapes and one carries the false-positive check** (AC-7b). Spec round 3
defeated a temporal exemption — "evaluated once per pass" — by declaring the derivation under a
two-iteration loop, and separately inside a named callback invoked twice; both scanned clean and both
must now report. The third fixture is the shipped-memo shape, a derivation ON the straight-line path,
which must NOT report. Without that third fixture this rule could be satisfied by banning derivations
outright, which would fail the live tree.

**Two more cases, because "exactly one" and "a spread is a derivation" are both currently unproved.**
The listed fixtures exercise multiple, helper-based and looped derivations, all of which a
helper-only, at-most-one implementation satisfies:

- `zero-derivations` — a pass with NO derivation at all must report `MULTI-DERIVATION`'s counterpart:
  "exactly one" is violated by zero as well as by two. State the code the scanner emits for it and
  assert that record, so the rule cannot quietly degrade into "at most one".
- `spread-derivation` — a derivation whose initializer SPREADS the surface (`{ ...ch, marker: … }`)
  rather than calling a declared helper. It must be recognized as a derivation, and reads through the
  resulting binding must be unconstrained. Without this case an implementation that only recognizes
  `snapshotOf(...)` passes the whole set, and would then report against the live tree — where the
  shipped memo at `scripts/pane-compaction.ts:797` is a SPREAD, not a helper call.

**The declared helper list is the measurement, not a preference.** Spec §3.2: an “any call taking the
surface is a derivation” reading silenced the round-4 shape ENTIRELY, because
`observe(freshPane, freshRoster, as, s, cacheOf(s))` read as one. The round-4 fixture is the regression
pin — it must report two `RAW-HANDOFF` findings, and the test asserts both records.

AC-3's other half rides here: the same `observe(..., s, ...)` shape OUTSIDE a pass is ordinary
injection and must NOT report.

## Task 6 — `scanRepo` walks from disk, and unregistered importers are reported

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`scanRepo exists from Task 1 but walks nothing and knows no import edges, so the fixture module importing Surface without a registry row yields no UNREGISTERED-IMPORTER` ac=AC-9 -->

`scanRepo` walks the declared roots from disk via `walkSourceFiles`
(`lib/messages/__internal__/walkSourceFiles.ts:8`) — not from a hardcoded file list, so a module added
under a walked root is covered by default rather than silently exempt. Any module importing a
registered `surfaceType` symbol without its own row is `UNREGISTERED-IMPORTER` (spec §2.4).

**The red reason is stated against the tree AS OF THIS TASK, not against an empty repo.** Task 1
already creates and exports `scanRepo`, so "it does not exist" would be false here; what is missing at
this point is the filesystem walk and the import-edge arm behind it. A red whose stated reason is
already untrue is a plan defect even when the command still fails, because the next reader cannot tell
which defect the cycle is proving.

**What makes the red discriminating:** the fixture module is added under the walked root with NO
registry edit, and the assertion is that it is discovered anyway. A scanner iterating
`SEND_AUTH_SURFACES` alone cannot pass it.

**And its counterpart, a gap until the weaker-implementation pass above:** `registered-importer` — a
module that imports the surface type and DOES have a registry row — must NOT report. Without it, an
implementation that reports every importer of the type passes the unregistered case and then fires on
every enrolled module. Two registered modules also appear in one `scanRepo` run, so nothing may assume
a single-row registry.

## Task 7 — declare the pass on the live adapter, with the gate's own premise

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`scripts/pane-compaction.ts:785` why=`drive() calls s.send at three sites with no // send-auth: pass declaration anywhere in the file, so once Task 1 has authored the suite the live-tree scan reports UNDECLARED-PASS and the assert-empty fails` ac=AC-10 -->

**The `red=` is `authored`, not `live`, and the distinction was probed rather than assumed.** The
DEFECT is live: `rg -n "send-auth: pass" scripts/pane-compaction.ts` returns nothing, while `s.send(`
appears at `scripts/pane-compaction.ts:857`, `scripts/pane-compaction.ts:873` and
`scripts/pane-compaction.ts:898`, all lexically inside `drive()` (`scripts/pane-compaction.ts:700`).
But the COMMAND is not live — the suite is authored by Task 1, so running it on today's tree reports no
test files found rather than the stated failure. That is a red exiting non-zero for a COLLECTION
reason, which the red contract names as believed rather than observed, so classifying it `live` would
have been exactly the defect that contract exists to catch.

GREEN is ONE line — `// send-auth: pass` above `authorize` (`scripts/pane-compaction.ts:785`). No
behavior change, no reordering, nothing else in that file.

**AC-11, and it is the reason this task is not tautological.** The live-tree assertion is
`expect(scanRepo(roots)).toEqual([])`, which passes trivially whenever the scanner looked at nothing —
the exact PR #701 shape where a guard's premise was false where it ran, so it passed unconditionally
and would have forever.

**Counting is not enough, and that is the correction this task carries.** `SEND_AUTH_SURFACES.length > 0`
plus `walked.length > 0` are both satisfiable while the two sets never INTERSECT: nonempty unrelated
roots, a registry naming modules the walk never reaches, or a `scanRepo` that ignores its walk
entirely all keep the assertion green. A premise must be proven on the case's OWN inputs, not on
adjacent ones. So the premises assert the intersection and the analysis, not the cardinalities:

- `premiseHolds("an enrolled module is among the walked files", walked.some((w) => SEND_AUTH_SURFACES.some((r) => w.endsWith(r.module))))`
- a POSITIVE CONTROL in a SECOND invocation, because one call cannot be both empty and non-empty:
  `scanRepo(LIVE_ROOTS)` is the claim and must equal `[]`, while
  `scanRepo([...LIVE_ROOTS, FIXTURE_ROOT])` must report exactly the known-violating fixture's findings.
  The only delta between the two calls is one added root, so the second proves that this roots
  configuration reaches files and runs the analysis — which is what makes the first call's emptiness
  mean "found nothing wrong" instead of "looked at nothing".

Both execute UNCONDITIONALLY relative to what they guard — never inside a `.each` callback, whose case
count can be zero (`tests/_shared/premise.ts:26` and `tests/_shared/premise.ts:36`).

**Recorded because it was a repair that broke something:** the round-1 version of this premise put the
positive control in the SAME `scanRepo` call whose emptiness the assertion depends on, which is
internally unsatisfiable — the round-2 reviewer caught it. Two of the owning PR's repairs introduced
the following round's defect, and this plan has now done it once too; that is why the fix-round rule
asks for a re-read of the repair itself, not only of the class it patched.

## Task 8 — enrol the scanner and score it

<!-- task: red=`FX_HEAVY_PRIORITY=1 pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`the gate asserts the EXPECTED_LEDGER_KINDS key set EQUALS the enrolled surface list, so the registry row this task adds without its companion entry reds on the key-set comparison` ac=AC-12 -->

**The red command needed correcting TWICE at plan time, and both defects are worth recording.**

*First,* the command originally drafted was `pnpm vitest run tests/mutation/guardSurfaces.gates.test.ts`.
Run on the live tree it **exits 0** — the gate file is in `NIGHTLY_ONLY_EXCLUDES`
(`vitest.projects.ts:100`), so every default project excludes it and the run collects nothing. That is
the fail-open shape the red contract names outright: a command whose target it cannot collect reports
green from the moment it is written, and no later edit would ever make it fail. It needs the project
and env gate CI uses (`.github/workflows/mutation-harness.yml:190`).

*Second,* even corrected, that single command proves only ONE of the three declarations.
`tests/mutation/guardSurfaces.gates.test.ts` imports `EXPECTED_LEDGER_KINDS` and `GUARD_SURFACES` and
compares those two key sets; it never imports `EXPECTED_ENV_TOUCHING` and never calls `validateSurface`.
So it goes GREEN with the third declaration missing and proves nothing about the exactly-once `control`
constraint this task also relies on. The red is therefore stated over all three, and each is a distinct
command run in the task:

```sh
FX_HEAVY_PRIORITY=1 pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 \
  pnpm exec vitest run --project mutation \
  tests/mutation/guardSurfaces.gates.test.ts   # EXPECTED_LEDGER_KINDS vs GUARD_SURFACES
pnpm vitest run tests/mutation/_metaPremiseContract.test.ts     # EXPECTED_ENV_TOUCHING vs enrolled suites
pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts # validateSurface over every row
```

The third command is where `validateSurface`'s constraints actually live — `scoreFloor` in `(0,1]`,
`control.from` differing from `control.to`, and `control.from` occurring EXACTLY ONCE in `sourcePath`
— asserted over every enrolled row at `tests/mutation/_metaGuardSurfaceRegistry.test.ts:41`. The task
asserts them where they live rather than where the first draft assumed they did, and all three
commands are run and observed in this task.

Enrolment is THREE declarations, and a registry row alone leaves the corpus gate red: the
`GUARD_SURFACES` row (`id: "sendAuthScan"`), the `EXPECTED_LEDGER_KINDS` entry
(`tests/mutation/source/expectedLedgerKinds.ts:24`), and the `EXPECTED_ENV_TOUCHING` key
(`tests/mutation/_metaPremiseContract.test.ts:32`), whose meta-test asserts the declared key set
EQUALS the enrolled suite list (`tests/mutation/_metaPremiseContract.test.ts:376`).

`control` is a deliberately behavior-changing edit the suite MUST notice, with `control.from` occurring
EXACTLY ONCE in `sourcePath` (`tests/mutation/source/registry.ts:94`).

**EVERY assertion about the scanner lives in the enrolled suite, and this is not a style preference.**
`suitePaths` holds exactly the gate suite this plan creates (spec §5), and only a suite listed
there decides KILLED versus SURVIVED. An assertion placed in a neighbouring file still runs,
still passes, and contributes NOTHING to the score — the failure mode is probed rather than theorized
on the sibling arc, where eight surviving mutants in one round existed solely because their covering
assertions sat in `tests/paneCompaction/adapter.test.ts`, outside that surface's `suitePaths`; moving
the same assertions into an enrolled suite killed all eight with no change to the assertions
(`BL-ENROLLED-SUITE-PLACEMENT-METATEST`, `BACKLOG.md:1381`). Nothing signals the omission: the suite is
green, the tests are real, and the only symptom is a score that will not move for a reason the author
cannot see. So if a later task wants a second file, it is added to `suitePaths` in the same commit or
the assertions do not count.

Then, and BEFORE the round-1 diff dispatch: `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards`.

**How to scope it, corrected against the `mutation:guards` script definition in the repo manifest.** `-t` does not bound the gate, because
`runSurface` executes in the `describe.each` body at COLLECTION, so a name filter prunes reporting only
after every surface has already run. Nor does adding a temporary shard file help: `mutation:guards`
names the four committed shard files and the corpus gate EXPLICITLY, so a new shard is simply not
collected, filtering one committed shard leaves the other three running, and filtering the shared
registry breaks the corpus-wide key and partition assertions that range over the whole of
`GUARD_SURFACES`. The scoping that actually works is to run ONE COMMITTED shard file, after DERIVING which shard owns
`sendAuthScan` rather than guessing — the partition is deterministic
(`SOURCE_SHARD_COUNT` is 4, `tests/mutation/source/shardPartition.ts:26`):

```sh
npx tsx -e "
import { SOURCE_SHARD_COUNT, surfacesForShard } from './tests/mutation/source/shardPartition';
for (let i = 0; i < SOURCE_SHARD_COUNT; i++)
  if (surfacesForShard(i).some((s) => s.id === 'sendAuthScan')) console.log(i);"
# then, with N the shard it printed:
FX_HEAVY_PRIORITY=1 pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 \
  pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shardN.test.ts
```

Verified at plan time by running the derivation against an already-enrolled id: `paneCompactionCore`
resolves to shard 2. That single-shard run is a `--project mutation` run and so is wrapped too.

**Wrapping these costs the `--exec-red` collection check, and that trade is deliberate.** A `pnpm heavy`
command is invisible to `deriveCollectionProbe`, so the arm mints nothing for these two markers — the
gap filed as the second peer row in the closeout. The heavy rule is an `AGENTS.md` invariant about
machine-wide admission control and wins over a lint's convenience; the collection question is answered
for these commands by RUNNING them, which was done at plan time (the gates file collects 5 tests, the
registry meta-test collects and passes). The full `mutation:guards` run is what produces the number
quoted in the round-1 brief; the single-shard run is only for iterating.
`scoreFloor` records the MEASURED value; every accepted survivor carries its argument, with
`equivalent` excluded from the denominator and `accepted-gap` retained
(`tests/mutation/source/ledger.ts:80-81`). Site ids are line-keyed, so the ledger is re-derived after
any source edit and never carried across one. The round-1 diff brief states
`MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on its `GUARD SURFACE:` line, or the wrapper
exits 2 before dispatching.

<!-- tasks: end -->

## The ledger row's stale claim, and graduation (AC-13)

This is a documentation correction plus the invariant-12 graduation, and it is deliberately NOT a task:
it has no production surface, so it can carry no honest red-then-green cycle on one command. Inventing
a `red=` for it would be exactly the marker-whose-cycle-cannot-complete shape the red contract rejects.
It lands in the arc's last commits, and its correctness is settled by the citation check below rather
than by a suite.

`BACKLOG.md` claims the round-4 case is pinned by `tests/paneCompaction/adapter.test.ts` counting
marker reads. Verified false: that file's only counter is the `reads` array at
`tests/paneCompaction/adapter.test.ts:411`, asserted `toEqual([])` at
`tests/paneCompaction/adapter.test.ts:442` — it pins that the send FENCE observes nothing, a different
contract that became true only when the fence landed. The contract that DOES pin an
authorization-ordering case is `tests/paneCompaction/revalidate.test.ts:121` (“compares the nonce the
marker holds AFTER revalidation, not before”). Correct the row to say so (spec §3.7, §2.5 edit 6).

Per invariant 12 the in-progress marker comes off in the PR's LAST commit, before the merge, in the
same commit that archives the row — archives categorically reject in-progress entries.

**Verified at plan time, which is what makes this a correction rather than a claim.**
`tests/paneCompaction/adapter.test.ts:411` is a `const reads: string[] = []` and
`tests/paneCompaction/adapter.test.ts:442` is `expect(reads).toEqual([])` — both read directly from the
live tree while drafting this plan.

## Whole-diff review and closeout

1. Self-review against this plan, then `pnpm spec:lint` on both artifacts.
2. `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards` BEFORE the round-1 diff dispatch; the score
   and the empty unaccepted-survivor set go on the brief's `GUARD SURFACE:` line.
3. Whole-diff cross-model review to APPROVE, round cap 4 per stage. Every diff brief carries the
   spec's CURRENT bound, fence and probe domain — diffed against the spec before every dispatch past
   round 1 — and names no remaining attack surface.
4. `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`,
   `pnpm format:check`.
5. Real CI green, then `gh pr merge --merge`, then fast-forward local `main` and verify
   `git rev-list --left-right --count main...origin/main` reports `0  0`.

## Peer filings owed in the graduation commit

Both rows land in the SAME ledger commit that archives `BL-SEND-AUTH-SINGLE-READ-LINT`. Filing peers
alongside a graduation is standard here and costs no extra PR. Each is process-facing, so each carries
an `**Incident:**` citing a cost event that has ALREADY happened — a surviving mutant or a "this could
miss X" is probe evidence, not an incident.

**Row 1 — the round corpus re-bases on a mid-arc merge, and the threshold gate fails OPEN.**
`**Facing:** process`. Rounds are keyed `(branch, baseSha12)`, so merging `origin/main` mid-stage
splits an arc's rounds across two corpus files and the `ROUND_THRESHOLD` gate counts per file. An arc
can therefore sit below the trigger while genuinely owing a filing — the gate stays green by counting
less, which is the fail-open direction.
`**Incident:**` this arc. Its four spec rounds sit 3 + 1 across `4b5028b446a4` and `03953337388b` after
PR #854 was merged mid-stage; the gate saw at most three and stayed green, and the filing at
`docs/review-rounds/feat/send-auth-single-read-lint/4b5028b446a4.md` was written voluntarily rather
than because anything demanded it. The same merge also tripped the contiguity check, because the round
after it was dispatched as `--round 4` into a base holding no rounds 1-3.

**Row 2 — `spec:lint --exec-red`'s collection arm is SILENT on any `pnpm heavy` command.**
`**Facing:** process`. `deriveCollectionProbe` returns kind `none` for that shape and
`collectionProbePlan` drops it (`lib/specLint/redContract.ts:721`), so the marker never enters the
probe plan and no finding is minted — not even the `RED_PROBE_UNVERIFIED` advisory the same function
emits for a probe it cannot derive. **That asymmetry is the difference between a gap and a bug:** the
code carries a deliberate, named path for "I could not derive a probe for this", and the heavy-wrapped
shape does not take it. So this is an unclassified shape falling THROUGH the classifier, not an
exemption anyone chose. Since `AGENTS.md` MANDATES `pnpm heavy` for every heavy phase, the
arm is silent on exactly the class of command the repo requires to be wrapped, and silent reads as
clean. This is `BL-GUARD-PREMISE-REACHABILITY`'s shape: the condition is false where the guard runs, so
it passes unconditionally and would forever.
`**Incident:**` this plan's Task 8 red. Wrapped per the heavy rule, it exited 0 on the live tree —
green from birth — while `pnpm spec:lint --exec-red` reported nothing about it. It was found by running
the command by hand. Isolated in four runs at plan time: the bare form and the env-var-prefixed form
both FAIL `RED_COLLECTS_NOTHING`; both `pnpm heavy` forms are silent. So neither the
`NIGHTLY_ONLY_EXCLUDES` shape nor the env-var prefix is the cause — the wrapper is.
**Not repaired by this arc**, which owns the lint's subject rather than the lint.

## 12. Closeout

impeccable-gate: N/A — no UI surface

The diff touches `tests/**`, `scripts/pane-compaction.ts` (one comment line) and `BACKLOG.md`. No file
under `app/` or `components/`, no `@theme` token block, no change to `DESIGN.md` or a tailwind config,
so the invariant-8 dual gate does not apply.
