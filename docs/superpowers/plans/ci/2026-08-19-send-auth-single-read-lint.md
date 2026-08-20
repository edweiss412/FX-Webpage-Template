# Send-authorization single-read lint — implementation plan

Spec: `docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md`, canonical
throughout. Row: `BL-SEND-AUTH-SINGLE-READ-LINT` (`BACKLOG.md:1291`).
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
  line (Task 8). The send path is fenced and owned by `BL-PANE-COMPACTION-SEND-AUTHORIZATION`
  (spec §1.1 item 1).
- **The scanner is an importable module with a referring suite from the start**, because it is a guard
  surface and the source-mutation runner overlays a target only when a Vitest suite imports it
  (`AGENTS.md`, convergence bullet 4). No terminal CLI script, no module-scope `process.exit`.
- **No control-flow reasoning anywhere in the implementation.** The scanner has no call graph, no path
  counting and no dominance analysis (spec §1.1 item 5, §4 limit 1). A task step that would need to
  know whether, when, or how often code RUNS is out of scope by ratified decision, not by omission.
- **Every guard states its premise executably** (`tests/_shared/premise.ts`). The live-tree assertions
  in Task 8 are the ones that would otherwise pass vacuously — an empty registry or a mis-rooted walk
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
`tests/mutation/source/registry.ts:81`) and `stripComments.ts:12` for `commentRanges` (line 12 is a
comment; the export is at `tests/_shared/stripComments.ts:13`). That is the class that dominates
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
- **`-t` cannot scope the gate.** `runSurface` executes in the `describe.each` body at collection
  (`tests/mutation/source/surfaceCases.ts`), so a name filter prunes reporting only after every
  surface has already run. Scope with a temporary `GUARD_SURFACES` filter placed BEFORE
  `registerSurfaceCases`, and delete the shard after the run.
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

### Fixture-collision check — RUN, with output and per-hit disposition

The fixtures deliberately contain violating code and a `// send-auth: pass` token, so any OTHER
filesystem-walking meta-test that claims `tests/**` could trip on them.

The first sweep drafted for this check was `rg -l "walkSourceFiles|readdirSync" tests/`, and it is
recorded here because it was WRONG in an instructive way: it returns **193** files, since it matches
every meta-test that walks anything at all. A 193-row disposition list is a sweep authored but not
usefully run, which is the defect the reconciliation rule names. The question is narrower — which
walkers could actually CLAIM `tests/paneCompaction/fixtures/sendAuth/`:

```sh
$ rg -ln "paneCompaction" tests/ --glob '!tests/paneCompaction/**'
tests/mutation/source/registry.ts
tests/mutation/source/expectedLedgerKinds.ts
tests/mutation/_metaPremiseContract.test.ts
```

**Three hits, and all three are the mutation-enrolment declarations that Task 9 edits by design.** Each
names its `tests/paneCompaction` suite paths EXPLICITLY
(`tests/mutation/source/registry.ts:235-251`, `tests/mutation/_metaPremiseContract.test.ts:52-61`) —
none walks the directory, so none can claim a fixture that is not itself a test file. No walker outside
`tests/paneCompaction/` is rooted broadly enough to reach the fixtures, and no skip-list edit is owed.

### `paneCompactionCore`'s ledger is NOT disturbed by this arc — checked, not assumed

Mutation site ids are line-keyed, so an edit that shifts lines in an enrolled source invalidates that
surface's accepted rows. Task 8 adds one comment line to `scripts/pane-compaction.ts`. The enrolled
surface is a DIFFERENT file: `paneCompactionCore.sourcePath` is `scripts/lib/pane-compaction-core.ts`
(`tests/mutation/source/registry.ts:233`). Its seven accepted rows are keyed on lines in that file
(`integer-literal:557:53:0>1` and its siblings) and are untouched by anything this arc edits, so they
are inherited legitimately rather than by assumption. Recorded here so a reviewer does not re-derive
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

## Acceptance criterion to task

| AC | Task | AC | Task |
| --- | --- | --- | --- |
| AC-1 totality, module-wide | T3 | AC-9 `UNREGISTERED-IMPORTER` | T6 |
| AC-2 ambient callback stays clean | T3 | AC-10 live tree green, red without the marker | T8 |
| AC-3 injection outside vs handoff inside | T3, T5 | AC-11 the gate's own premise | T8 |
| AC-4 read set derived from the type | T1 | AC-12 mutation score, no unaccepted survivors | T9 |
| AC-5 declared / undeclared / ambiguous pass | T2 | AC-13 the ledger row's stale claim | closeout |
| AC-6 `NON-STRAIGHT-LINE-READ` | T4 | AC-14 discovery anchored on sinks | T2 |
| AC-7 `MULTI-READ` | T4 | AC-15 the withdrawn claim, pinned both ways | T7 |
| AC-8 one declared derivation | T5 | | |

## Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — the scanner module, and the read set derived from the surface type

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`SEND_AUTH_SURFACES and scanModule do not exist, so the suite throws on an unresolved import before any assertion runs` ac=AC-4 -->

The fixture-collision sweep above is already dispositioned at plan time — three hits, all explicit
suite-path lists, no skip-list edit owed — so this task does not re-run it.

Create the scanner module exporting `SEND_AUTH_SURFACES`, `scanModule(file, row): Finding[]`,
`scanRepo(roots): Finding[]`, and the `Finding` type — an importable module, no module-scope
`process.exit`, with the gate suite importing it in the same commit (spec §2.5 edits 1-2).

The read set is the COMPLEMENT: parse the `Surface` type declaration, take every member, subtract the
row's declared `sinks`, `effects` and `ambient`. **What makes this red discriminating:** the test adds a
member to a fixture surface type and declares it nowhere, then asserts a read through it is counted —
so an implementation that hardcodes the ten live read names passes nothing. Spec §2.2 is the table;
AC-4 is the contract.

## Task 2 — declared passes, anchored on sinks and read impostor-safely

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`the scanner has no pass discovery, so UNDECLARED-PASS is never emitted and the fixture asserting it gets an empty findings array` ac=AC-5 -->

A send-bearing function is one whose body calls a declared SINK on a surface binding. Exactly one
declared `// send-auth: pass` per send-bearing function, or `// send-auth: exempt: <reason>` with a
non-empty reason. Zero is `UNDECLARED-PASS`; two or more is `AMBIGUOUS-PASS` (spec §2.1).

Two failure modes this task must catch, each with its own fixture: an empty exempt reason does NOT
suppress; and a `// send-auth: pass` token inside a string literal or JSX is NOT a declaration — which
is why extraction goes through `commentRanges` (`tests/_shared/stripComments.ts:13`) and not a
line-regex over the function span.

AC-14 rides here: a function whose only effect calls are `out` is NOT send-bearing. The live module is
the proof — `main` carries fifteen `s.out(...)` calls and no pass (spec §3.5), so a scanner anchored on
effects reports against correct code.

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
Task 5's `RAW-HANDOFF`. Three fixtures: `nested-function`, `named-callback` (asserted by that name,
per AC-6), `loop-read`.

## Task 5 — exactly one declared derivation, and no raw handoff inside the pass

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`derivations are not recognized, so the round-4 fixture reports no RAW-HANDOFF and the two-derivation fixture reports no MULTI-DERIVATION` ac=AC-8 -->

A derivation is a declaration inside the pass whose initializer spreads the surface or calls a
DECLARED derivation helper with it (`cacheOf`, `memoize`). Two derivations is `MULTI-DERIVATION`.
Reads through a derived binding are unconstrained; raw reads inside the derivation's own initializer
count ONCE, because the initializer is evaluated once per pass — that is the shipped memo at
`scripts/pane-compaction.ts:797`. Passing the raw surface to anything else inside the pass is
`RAW-HANDOFF` (spec §2.3 rule 3).

**The declared helper list is the measurement, not a preference.** Spec §3.2: an “any call taking the
surface is a derivation” reading silenced the round-4 shape ENTIRELY, because
`observe(freshPane, freshRoster, as, s, cacheOf(s))` read as one. The round-4 fixture is the regression
pin — it must report two `RAW-HANDOFF` findings, and the test asserts both records.

AC-3's other half rides here: the same `observe(..., s, ...)` shape OUTSIDE a pass is ordinary
injection and must NOT report.

## Task 6 — `scanRepo` walks from disk, and unregistered importers are reported

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts` why=`scanRepo does not exist, so the fixture module importing Surface without a registry row yields no UNREGISTERED-IMPORTER` ac=AC-9 -->

`scanRepo` walks the declared roots from disk via `walkSourceFiles`
(`lib/messages/__internal__/walkSourceFiles.ts:8`) — not from a hardcoded file list, so a module added
under a walked root is covered by default rather than silently exempt. Any module importing a
registered `surfaceType` symbol without its own row is `UNREGISTERED-IMPORTER` (spec §2.4).

**What makes the red discriminating:** the fixture module is added under the walked root with NO
registry edit, and the assertion is that it is discovered anyway. A scanner iterating
`SEND_AUTH_SURFACES` alone cannot pass it.

## Task 7 — the withdrawn claim, pinned as a limit in both directions

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/fixtures/sendAuth/conditional-pass.ts` why=`the fixture does not exist, so the assertion that a conditionally-called pass scans CLEAN has nothing to scan` ac=AC-15 -->

A fixture in which the pass is called CONDITIONALLY scans clean, and the suite asserts that clean
result with a comment naming spec §4 limit 1 and citing the §3.3 probe.

**This is the only task whose deliverable is an assertion that something is NOT reported, and it is
deliberate.** Spec round 2's F1 defeated the dominance rule with one conditional; the spec responded by
withdrawing the claim rather than widening the recognizer. Without this assertion the fence holds in
one direction only — a later contributor "fixes" the gap, control-flow analysis re-enters, and the
round-1-through-round-2 ratchet restarts. With it, that edit fails a test that explains why.

The comment above the assertion states the disposition in full: control flow is a DOCUMENTED LIMIT of
this gate on its own terms, filing no ledger row, and `BL-PANE-COMPACTION-SEND-AUTHORIZATION` owns the
separate question of what authorizes a send.

## Task 8 — declare the pass on the live adapter, with the gate's own premise

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=live red-target=`scripts/pane-compaction.ts:785` why=`drive() calls s.send at three sites with no // send-auth: pass declaration anywhere in the file, so the live-tree scan reports UNDECLARED-PASS and the assert-empty fails` ac=AC-10 -->

The `red=` here is `red-state=live`: the failing case exists on the tree at plan time, because the
declaration comment has not been added. Verified — `rg -n "send-auth: pass" scripts/pane-compaction.ts`
returns nothing, while `s.send(` appears at `scripts/pane-compaction.ts:857`,
`scripts/pane-compaction.ts:873` and `scripts/pane-compaction.ts:898`, all lexically inside `drive()` (`scripts/pane-compaction.ts:700`).

GREEN is ONE line — `// send-auth: pass` above `authorize` (`scripts/pane-compaction.ts:785`). No
behavior change, no reordering, nothing else in that file.

**AC-11, and it is the reason this task is not tautological.** The live-tree assertion is
`expect(scanRepo(roots)).toEqual([])`, which passes trivially against an empty registry or a mis-rooted
walk — the exact PR #701 shape where a guard's premise was false where it ran, so it passed
unconditionally and would have forever. Both premises execute UNCONDITIONALLY relative to the
assertion, never inside a `.each` callback: `premise("enrolled surfaces", SEND_AUTH_SURFACES.length, 0)`
and `premise("modules resolved by the walk", walked.length, 0)`
(`tests/_shared/premise.ts:26`, strict `>`).

## Task 9 — enrol the scanner and score it

<!-- task: red=`FX_HEAVY_PRIORITY=1 pnpm heavy pnpm vitest run tests/mutation/guardSurfaces.gates.test.ts` red-state=live red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`the gate asserts the EXPECTED_LEDGER_KINDS key set EQUALS the enrolled surface list, so the registry row added in this task without its companion entry reds on the key-set comparison` ac=AC-12 -->

Enrolment is THREE declarations, and a registry row alone leaves the corpus gate red: the
`GUARD_SURFACES` row (`id: "sendAuthScan"`), the `EXPECTED_LEDGER_KINDS` entry
(`tests/mutation/source/expectedLedgerKinds.ts:24`), and the `EXPECTED_ENV_TOUCHING` key
(`tests/mutation/_metaPremiseContract.test.ts:32`), whose meta-test asserts the declared key set
EQUALS the enrolled suite list (`tests/mutation/_metaPremiseContract.test.ts:376`).

`control` is a deliberately behavior-changing edit the suite MUST notice, with `control.from` occurring
EXACTLY ONCE in `sourcePath` (`tests/mutation/source/registry.ts:94`).

Then, and BEFORE the round-1 diff dispatch: `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards`.
Scope it with a temporary `GUARD_SURFACES` filter placed BEFORE `registerSurfaceCases` — `-t` does not
bound the gate, because `runSurface` executes at collection — and DELETE the shard after the run.
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

## 12. Closeout

impeccable-gate: N/A — no UI surface

The diff touches `tests/**`, `scripts/pane-compaction.ts` (one comment line) and `BACKLOG.md`. No file
under `app/` or `components/`, no `@theme` token block, no change to `DESIGN.md` or a tailwind config,
so the invariant-8 dual gate does not apply.
