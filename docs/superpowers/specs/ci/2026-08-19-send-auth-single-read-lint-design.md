# BL-SEND-AUTH-SINGLE-READ-LINT — one read per send-authorization pass, enforced structurally

**Row:** `BL-SEND-AUTH-SINGLE-READ-LINT` (BACKLOG.md) · **Branch:** `feat/send-auth-single-read-lint` · **Effort:** M — a TS-AST scanner, a declared enrolment surface, and one declaration comment on the live instance.

## §0 The bound this arc is held to

One defect class produced a P0 in four consecutive diff rounds of `feat/orchestrator-pane-compaction`: a
send was authorized by a decision assembled from several surface reads taken at DIFFERENT INSTANTS
(`docs/review-rounds/feat/orchestrator-pane-compaction/7d332074ec97.md`, diff §). Four green suites
coexisted with it, because no suite assertion can express
"these two values came from different instants".

This arc ships the structural form of the closing repair. Every send-authorization pass in an enrolled
module is either CHECKED against the single-read rule, or the scanner REPORTS by name the form it could
not check and the gate fails. A conservative report — refusing to analyze, naming an undeclared pass,
declining to count a read under iteration — is a DOCUMENTED LIMIT, never a finding. Silence is never a
certificate: every occurrence of the injected surface inside a pass is classified or reported, and no
fall-through drops one.

## §1.1 Resolved scope — do not relitigate

1. **The send path itself is not reopened.** `--checkpoint`, `--compact` and `--resume` ship DISABLED
   behind the fence at `scripts/pane-compaction.ts:587` (`SENDING`, `scripts/pane-compaction.ts:550`),
   and the authorization redesign is owned by `BL-PANE-COMPACTION-SEND-AUTHORIZATION`. This arc adds a
   scanner, its gate, its fixtures, one registry row, and ONE declaration comment. It changes no
   behavior of `scripts/pane-compaction.ts`.
2. **`drive()` being unreachable today is not a defect and not this arc's business.** The live instance
   is analyzed statically; a lint does not require its subject to execute. (Fence ratified in the owning
   arc's spec, `docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md:631`.)
3. **The pass grain is DECLARED, never inferred.** Ratified by measurement in §3.3, not by preference:
   at command grain the shipped, CORRECT code reports three findings. A recognizer over function names
   ("authorize", "send") is the exact shape this corpus exists to prevent
   (`docs/agents/spec-self-review.md`, declared-task-contract bullet).
4. **The rule ranges over READS, and the read set is DERIVED from the `Surface` type declaration** —
   every member minus the declared sink, effect and ambient sets. This settles the ledger row's first
   scheduled step ("every `Surface` method, or only the ones feeding a classification"). Deriving it
   from the type means a member added later is a READ by default, which is the strict direction; a
   "feeds a classification" boundary would need dataflow and is declined in §4 limit 6.
5. **The r1 shape is a MEASURED limit, not an oversight** (§3.5, §4 limit 1). The taint arm that would
   catch it fires on the shipped, correct stale-versus-fresh comparison at
   `scripts/pane-compaction.ts:825`, and that comparison is the entire point of revalidation. Declining
   to fire on what the scanner cannot classify is the narrowing direction the same-axis recurrence rule
   mandates (`AGENTS.md`, repair-direction bullet).
6. **The BACKLOG row's claim about `adapter.test.ts` is stale and this arc corrects it** (§3.7). The row
   says the round-4 case is pinned by that file counting marker reads; the file asserts ZERO reads
   behind the send fence (`tests/paneCompaction/adapter.test.ts:442`), which is a different contract.
   Correcting it is part of this arc, not scope creep.
7. **Spec round 1 (4 findings, BLOCKING) is repaired here and every repair is PROBED**, not argued:
   §2.2's sink-versus-effect split (r1 F4), the totality rule in §2.3 (r1 F3), the per-path counting
   in the same section, with iteration and cycles reported (r1 F2), and §2.4's sink dominance
   (r1 F1). Each carries a transcript in §3. Every r1 finding was accepted; none was argued away.

## §1.2 Convergence criterion (all four, stated in every review brief)

- **Consequence bound.** Every send-bearing function in an enrolled module is checked against the
  single-read rule, or the form the scanner could not check is named and the gate FAILS. A conservative
  report is a DOCUMENTED LIMIT, not a finding.
- **PROBE DOMAIN — DERIVED, and deliberately carrying no site census.** The modules named by the
  scanner's own enrolment registry (`SEND_AUTH_SURFACES`, in the scanner module of §2.6) on the live
  tree, plus the fixtures under `tests/paneCompaction/fixtures/sendAuth/`. A probe outside that domain,
  or more than one ordinary edit away from an input in it, files to documented limits rather than to a
  round. The population is read from the registry and never quoted as a number here: a bound that moves
  whenever someone adds a module is not a bound. The dated census lives in §3.
- **Threat fence.** Ordinary authoring by a contributor extending the pane-compaction adapter or adding
  a second send path against a declared `Surface` — including the ordinary TypeScript spellings of a
  read: a direct call, a call through a same-module helper, an alias, a destructure, a call under a
  loop. Deliberately obfuscated access — a computed member, the surface stored in a container and read
  back, re-export laundering, dynamic dispatch — is OUT OF SCOPE and files to documented limits. Out of
  scope means "reported and not analyzed", never "passed": the totality rule in §2.3 ranges over EVERY occurrence of the
  raw binding, so an unmodelled spelling fails the gate rather than slipping through it.
- **Score.** `sendAuthScan` IS enrolled in the source-mutation registry (§5). `pnpm mutation:guards`
  runs BEFORE the round-1 diff dispatch and the brief states the score plus the empty
  unaccepted-survivor set. A "the guard does not pin what it claims" finding is admissible only with the
  surviving mutant that demonstrates it: an operator and a site, both from the declared set.

## §2 The rule, stated whole

### §2.1 What a pass is — declared, and undeclared is a finding

A **send-authorization pass** is the function that assembles the decision immediately before a send. It
is declared in source, on the line above the function, in the shape the two closest analogues already
use for their inline tokens (`// no-telemetry: <reason>`, `tests/log/mutationSurface/exemptions.ts:12`;
`// not-subject-to-meta: <reason>`, `tests/data/_metaLibDataCallBoundary.test.ts:206`):

```ts
// send-auth: pass
const authorize = (): Authz => { ... };
```

Discovery is fail-by-default and anchored on the SINK, not on prose. A **send-bearing function** is one
whose body contains a call to a declared SINK method on a surface binding — in the live instance,
`s.send(...)` at `scripts/pane-compaction.ts:857`, `scripts/pane-compaction.ts:873` and
`scripts/pane-compaction.ts:898`, all lexically inside `drive()` (`scripts/pane-compaction.ts:700`).
Every send-bearing function MUST lexically contain exactly one declared pass, or carry
`// send-auth: exempt: <reason>` with a non-empty reason. Zero declared passes is `UNDECLARED-PASS`;
two or more is `AMBIGUOUS-PASS`. Both fail the gate.

**The sink set is NOT the effect set, and the difference is load-bearing** (r1 F4). Anchoring discovery
on every effect method makes `main()` send-bearing through its fifteen `s.out(...)` calls, so the rule
would report `UNDECLARED-PASS` on correct live code — measured in §3.6. Sinks are the members that drive
another session; effects are the wider set excluded from the read complement.

### §2.2 Member classification — three declared sets, reads are the complement

| Class | Members (live instance, `scripts/pane-compaction.ts:83-138`) | Count |
| --- | --- | --- |
| Sinks (declared; discovery anchor) | `send` :98 | 1 |
| Other effects (declared; neither read nor anchor) | `out` :106, `outRaw` :117, `nonceWrite` :119, `nonceConsume` :120 | 4 |
| Ambient (declared) | `now` :104, `random` :105 | 2 |
| **Reads (derived: everything else)** | `roster` :84, `branches` :96, `screen` :97, `purview` :99, `marker` :100, `git` :101, `gh` :102, `corpus` :103, `nonceRead` :118, `resolveTarget` :137 | 10 |

Sinks are a subset of the effects; the read set is the type's members minus every declared class. A
member added to the type and left unclassified is a READ, which is the strict direction: the new member
is covered on the commit that adds it rather than on the commit someone remembers to classify it.
`now` and `random` are declared ambient because they are generators, not observations of the world the
decision is about — `random` is called per nonce mint by construction, and a second `now()` is a second
instant of the clock rather than a second read of a pane.

### §2.3 The single-read rule

Inside a declared pass, over the pass's intra-module reachable set (the pass body plus every function in
the same module it calls, parameters propagated):

1. **Totality — `UNCLASSIFIED-USE`.** Every occurrence of the raw injected binding is classified as
   exactly one of: a direct read call (`s.marker(...)`), a sink or effect call, or a declared derivation
   (rule 4). Anything else — `const m = s.marker` without a call, `const { marker } = s`, a bare
   mention passed somewhere unmodelled, a computed member — is REPORTED and fails the gate. Without
   this rule an alias performs two reads while exposing zero `s.marker()` call sites (r1 F3, measured
   in §3.4).
2. **`MULTI-READ`, counted per INVOCATION PATH.** Each read method may be reached at most once per
   pass. A helper containing one raw read, invoked from two sites, is TWO reads and is reported; an AST
   site count would report one (r1 F2, measured in §3.4). A raw read under a loop or an iteration
   callback is `ITERATED-READ`, and a cycle in the pass's call graph is `CYCLIC-PASS` — both REPORTED
   rather than counted, because neither has a static count.
3. **`RAW-HANDOFF`.** The raw binding may not be passed as an argument to another function. A pass hands
   its per-pass DERIVATION down, never the raw surface; handing the raw surface down is how the round-4
   defect got its second read into `observe()` without a second call site in the pass body.
4. **Derived bindings are unconstrained, and their construction counts once.** A binding whose
   initializer spreads the surface (`{ ...s, marker: … }`) or passes it to a derivation helper
   (`cacheOf(s)`, `scripts/pane-compaction.ts:362`) is DERIVED. Reads through a derived binding are not
   counted — the derivation is where memoization lives, and whether it memoizes is pinned by tests, not
   by this lint (§4 limit 3). A raw read inside the derivation's own initializer counts ONCE, because
   the initializer is evaluated once per pass; that is exactly the shipped memo at
   `scripts/pane-compaction.ts:797`.

### §2.4 Sink dominance — a declared pass must actually run before the send

Rules §2.1 and §2.3 make the pass honest; they do not connect it to the send. A fourth send branch
placed before revalidation leaves `authorize()` clean and still sends unauthorized (r1 F1, measured in
§3.2). So: **every sink call site inside a send-bearing function must be preceded, in its own statement
chain up to the function body, by a statement that EXECUTES the declared pass** — directly, or through a
same-module function whose reachable set calls it. Otherwise `UNAUTHORIZED-SINK`.

A function DECLARATION that calls the pass does not count as an execution of it. That distinction is not
decorative: with declarations counted, the r1 F1 bypass reads as dominated, because
`const revalidateNow = () => { pass = authorize(); … }` textually precedes every branch. §3.2 records
both readings.

What this rule does NOT claim is §4 limit 8: it proves a pass RAN before the send, not that the send
honoured the pass's verdict.

### §2.5 The enrolment registry

`SEND_AUTH_SURFACES`, in the scanner module (§2.6 edit 1), one row per module:

```ts
{ module: "scripts/pane-compaction.ts", surfaceType: "Surface",
  sinks: ["send"],
  effects: ["out", "outRaw", "nonceWrite", "nonceConsume"],
  ambient: ["now", "random"] }
```

**Discovery beyond the registry** is an import-edge arm, exact and checker-free: walking the roots, any
module that imports the `surfaceType` symbol from a registered module and is not itself registered is
reported as `UNREGISTERED-IMPORTER`. That closes
"someone builds a second send path against the same surface in another file". A brand-new surface type
with its own sink is outside the scanner's range until it is enrolled, exactly as with the mutation
registry — enrolment is an act (§4 limit 4).

### §2.6 The implementation surface, stated whole

Six edits, and no more:

<!-- spec-lint: ignore — created by this spec's implementation; not tracked yet -->

1. **The scanner module** (`sendAuthScan.ts`, under `tests/paneCompaction/`) — NEW. Exports
   `SEND_AUTH_SURFACES`, `scanModule(file, row): Finding[]`, and `scanRepo(roots): Finding[]`.
   Importable module with a referring suite from the start, because it is a guard surface and the
   registry can only overlay a target a Vitest suite imports (`AGENTS.md`, convergence bullet 4).

<!-- spec-lint: ignore — created by this spec's implementation; not tracked yet -->

2. **The gate** (`_metaSendAuthSingleRead.test.ts`, alongside it) — NEW. `scanRepo` over the live roots
   asserted empty, plus the fixture cases. No pnpm script — both closest analogues are gated by
   `pnpm test` through their meta-test (`tests/log/_metaMutationSurfaceObservability.test.ts:676`;
   `tests/data/_metaLibDataCallBoundary.test.ts`), and a third invocation surface would be a fourth
   thing to remember to run.
3. **The fixtures** (`fixtures/sendAuth/`, under the same directory) — NEW. One fixture per verdict: the
   passing shape, `MULTI-READ` by path, `ITERATED-READ`, `CYCLIC-PASS`, `RAW-HANDOFF`,
   `UNCLASSIFIED-USE` (alias and destructure), `UNDECLARED-PASS`, `AMBIGUOUS-PASS`, `UNAUTHORIZED-SINK`,
   and the exempted shape.
4. **`scripts/pane-compaction.ts`** — ONE line: `// send-auth: pass` above `authorize`
   (`scripts/pane-compaction.ts:785`). No behavior change, no reordering, nothing else in that file.
5. **`tests/mutation/source/registry.ts`** — one row, `id: "sendAuthScan"` (§5), with its companion rows
   in `tests/mutation/source/expectedLedgerKinds.ts` and the suite's `EXPECTED_ENV_TOUCHING`
   declaration.
6. **`BACKLOG.md`** — the row's stale `adapter.test.ts` claim corrected (§3.7), and the row graduated at
   close in the same commit that removes its in-progress marker (invariant 12).

## §3 Probes (run 2026-08-19 against the branch base, worktree `FX-worktrees/send-auth-single-read-lint`)

Throwaway prototypes implementing the rule were run against the live module BEFORE this design was
written, and again after every round-1 repair, per the empirical-spike rule
(`docs/agents/spec-self-review.md`, spike bullet). They take the pass name and raw binding on the CLI
instead of reading declarations — they measure the RULE, not the enrolment mechanics. Transcripts are
dated observations at base `4b5028b44` and are never corrected.

### §3.1 The shipped pass PASSES, under the round-2 rule

```
$ tsx proto3.ts scripts/pane-compaction.ts Surface authorize s \
    send,out,outRaw,nonceWrite,nonceConsume now,random
reads=roster,branches,screen,purview,marker,git,gh,corpus,nonceRead,resolveTarget
raw reads: roster x1  marker x1
  no findings
exit=0
```

The one raw `marker` read is the read inside the shipped memo initializer, counted once by rule 4.

### §3.2 Sink dominance: the round-1 F1 bypass is caught, and the live sinks stay clean

```
$ tsx proto-dominance.ts scripts/pane-compaction.ts drive s send authorize
scripts/pane-compaction.ts:857  s.send(...)  dominated-by-authorize=true
scripts/pane-compaction.ts:873  s.send(...)  dominated-by-authorize=true
scripts/pane-compaction.ts:898  s.send(...)  dominated-by-authorize=true
sink sites: 3; undominated: 0

$ tsx proto-dominance.ts .claude/mutant-f1.ts drive s send authorize
.claude/mutant-f1.ts:844  s.send(...)  dominated-by-authorize=false
sink sites: 4; undominated: 1
exit=1
```

The second run is the reviewer's own bypass shape: a fourth `--checkpoint` branch that sends before any
revalidation. The FIRST version of this probe counted a function DECLARATION that calls the pass as
domination and reported `undominated: 0` on that same mutant. §2.4's "declaration is not execution"
clause is that measurement, not a precaution.

### §3.3 The grain is the pass, and that is measured rather than preferred

The same rule at COMMAND grain reports three findings against code that is correct:

```
$ tsx proto-sendauth.ts scripts/pane-compaction.ts Surface drive s ...
raw reads: ... marker x3 @382/733/800 ...
  FINDING RAW-HANDOFF scripts/pane-compaction.ts:708 the pass hands the RAW surface to cacheOf()
  FINDING RAW-HANDOFF scripts/pane-compaction.ts:709 the pass hands the RAW surface to observe()
  FINDING MULTI-READ scripts/pane-compaction.ts marker() read 3x on the raw surface at lines 382, 733, 800
```

Those reads are the REPORT phase — the `report` binding at `scripts/pane-compaction.ts:709` and the
`marker` read at `scripts/pane-compaction.ts:733` — and they are deliberately stale-tolerant:
revalidation exists because they are. At `main` grain it reports seven. Hence §2.1: the pass is
declared.

### §3.4 The ordinary read spellings, each caught

Fixtures one ordinary edit apart, all inside the declared fixture path:

```
=== pass-clean ===        raw reads: roster x1  marker x1        no findings
=== helper-twice ===      FINDING MULTI-READ marker() reaches 2 raw reads per pass (sites 4, 4)
                          FINDING RAW-HANDOFF the raw surface is handed to read()
=== loop-read ===         FINDING ITERATED-READ marker() is read under iteration; not countable
=== property-alias ===    FINDING UNCLASSIFIED-USE `s.marker` is referenced without being called
=== destructure ===       FINDING UNCLASSIFIED-USE the surface is destructured; reads through the
                          bindings are invisible
```

`helper-twice` is round-1 F2's repeated-helper case: one AST site, two invocation paths, reported. The
alias and destructure cases are round-1 F3, both ordinary TypeScript rather than obfuscation, and both
now fail rather than pass silently.

### §3.5 The round-4 defect is CAUGHT; the round-1 shape is NOT — measured, not assumed

The r4 shape reconstructed on the live file (no snapshot, `observe()` handed the raw surface, the nonce
read a second time):

```
$ tsx proto3.ts .claude/mutant-r4.ts Surface authorize s ...
  FINDING RAW-HANDOFF .claude/mutant-r4.ts:796 the raw surface is handed to observe()
  FINDING MULTI-READ .claude/mutant-r4.ts marker() reaches 2 raw reads per pass (sites 382, 797)
exit=1
```

The r1 shape (the pass re-reads for the classification but authorizes against `markerNonce`, a value
captured OUTSIDE the pass at `scripts/pane-compaction.ts:733`) reports nothing:

```
$ tsx proto-sendauth.ts .claude/mutant-r1.ts Surface authorize s ...
raw reads: roster x1  marker x1
  no findings
exit=0
```

Files to §4 limit 1 with its own reason, not to a round.

### §3.6 Sinks versus effects, on the live module

With the planned comment inserted in memory, counted per function:

```
main:  send=0, out=15, outRaw=0, nonceWrite=0, nonceConsume=0; pass markers=0
drive: send=3, out=7,  outRaw=3, nonceWrite=1, nonceConsume=1; pass markers=1
```

Anchoring discovery on effects makes `main` send-bearing with no pass — a report against correct code.
Anchoring on sinks leaves `main` outside the rule and `drive` inside it, which is §2.1 as written.

### §3.7 The live population, and one stale claim it turned up

`rg` over `scripts/` and `lib/` for a herdr send finds exactly one call site,
`scripts/pane-compaction.ts:1091` (`sh("herdr", ["agent", "send", target, text])`), reached only through
`Surface.send`. One enrolled module today; the import-edge arm's gap list is empty on this tree.

The citation pass also refuted a claim in the ledger row itself. `BACKLOG.md` says the round-4 case is
pinned by `tests/paneCompaction/adapter.test.ts` counting marker reads. That file's only counter is the
`reads` push-array at `tests/paneCompaction/adapter.test.ts:411`, asserted `toEqual([])` at
`tests/paneCompaction/adapter.test.ts:442` under the describe at
`tests/paneCompaction/adapter.test.ts:396` — it pins that the send FENCE observes nothing, which is a
different contract and became true only when the fence landed. The contract that does pin an
authorization-ordering case is `tests/paneCompaction/revalidate.test.ts:121`
("compares the nonce the marker holds AFTER revalidation, not before"). §2.6 edit 6 corrects the row.

## §4 Documented limits

1. **A value captured outside the pass is invisible** (§3.5). The taint arm that would catch it —
   flagging references to outer bindings whose initializer contains a surface read — fires on the
   shipped, correct comparison `fresh.verdict !== report.verdict` (`scripts/pane-compaction.ts:825`),
   whose whole purpose is comparing an OLD report against a fresh one, since `report` is initialized
   from `observe(...)` at `scripts/pane-compaction.ts:709`. Declining is the narrowing direction; the
   ordering contract is pinned executably instead at `tests/paneCompaction/revalidate.test.ts:121`.
2. **Cross-module passes are not followed.** A pass whose helpers live in another module gets a
   `CROSS-MODULE-HANDOFF` report at the call site rather than an analysis. Reported, never passed.
3. **Memoization is not verified.** Reads through a derived binding are unconstrained, so a derivation
   that fails to memoize is not a lint finding. Whether the live snapshot memoizes is pinned by tests
   (`scripts/pane-compaction.ts:797` is the shape; the read-count contract lives in the suite).
4. **Enrolment is an act.** A new surface type with its own sink method, in a module importing nothing
   from a registered one, is outside the scanner's range until it is enrolled — the same posture as the
   mutation registry. The import-edge arm (§2.5) covers the reachable case, which is the one the corpus
   produced.
5. **Obfuscated access is reported, not analyzed.** A computed member, the surface stored in a
   container, or a re-exported alias yields `UNCLASSIFIED-USE` and fails the gate. Per §1.2's fence this
   is out of scope for admissibility, and the failure direction is conservative.
6. **"Feeds a classification" is declined as the read boundary.** It needs dataflow, it moves whenever
   the classifier changes, and the strict complement in §2.2 is a superset of it.
7. **`drive()` is unreachable on this tree** (`scripts/pane-compaction.ts:587`). The live instance is
   analyzed statically. When the send path ships under `BL-PANE-COMPACTION-SEND-AUTHORIZATION`, nothing
   about this gate changes.
8. **Dominance proves a pass RAN, not that its verdict was honoured.** A sink placed after a pass call
   whose refusal is ignored satisfies §2.4. Modelling "the refusal returns" is control-flow analysis
   over a value, which is the recognizer growth this arc declines; that behavioral contract belongs to
   the suite and to `BL-PANE-COMPACTION-SEND-AUTHORIZATION`. The gate's claim is exactly: a send with no
   preceding pass execution fails.
9. **Iteration and cycles are reported, not counted.** A read under a loop, an iteration callback, or a
   cyclic call graph has no static count, so it is named (`ITERATED-READ`, `CYCLIC-PASS`) and fails. A
   pass that legitimately needs a per-item read routes it through a derivation, which rule 4 leaves
   free.

### Dimensional Invariants

N/A — no UI surface. No component, no fixed-dimension parent.

### Transition Inventory

N/A — no UI surface, no visual states.

## §5 Meta-test / registry inventory

**Creates:** the gate of §2.6 edit 2 — filesystem-walked discovery over the declared roots, so a new
importer of a registered surface type fails by default rather than being silently exempt. Modelled on
`tests/log/_metaMutationSurfaceObservability.test.ts:676` and
`tests/data/_metaLibDataCallBoundary.test.ts`, both of which walk their roots with `readdirSync`
(`lib/messages/__internal__/walkSourceFiles.ts:8`; `tests/data/_metaLibDataCallBoundary.test.ts:670`)
and carry a per-site inline exemption token parsed from leading comment ranges. Comment extraction goes
through `commentRanges` (`tests/_shared/stripComments.ts:12`) so a token inside a string or JSX is not a
declaration.

**Extends:** `tests/mutation/source/registry.ts` — one new row, in the shape of the scanner rows already
there (`tapTargetScan`, `tests/mutation/source/registry.ts:2031`) — plus the companion row in
`EXPECTED_LEDGER_KINDS` (`tests/mutation/source/expectedLedgerKinds.ts:24`) and the suite's
`EXPECTED_ENV_TOUCHING` declaration (`tests/mutation/_metaPremiseContract.test.ts`), both of which red
if omitted.

```ts
{ id: "sendAuthScan", sourcePath: "tests/paneCompaction/sendAuthScan.ts",
  suitePaths: ["tests/paneCompaction/_metaSendAuthSingleRead.test.ts"],
  operators: [...OPERATOR_NAMES], scoreFloor: <measured>, control: { … }, accepted: [] }
```

`scoreFloor` and `accepted` are filled from the FIRST `pnpm mutation:guards` run, which happens before
the round-1 diff dispatch, not predicted here.

**Does NOT extend:** `paneCompactionCore` (`tests/mutation/source/registry.ts:232`). Its `sourcePath` is
`scripts/lib/pane-compaction-core.ts`; the adapter this arc annotates is not enrolled there, and this
arc does not enrol it — that is a separate decision with its own cost, and nothing here depends on it.

**Advisory-lock topology:** N/A — no `pg_advisory*` surface. **Supabase call boundary:** N/A — no
Supabase client call. **DB layers:** N/A — no migration, no RPC, no CHECK.

## §6 Acceptance criteria

- **AC-1** `scanModule` reports `MULTI-READ` when a declared pass reaches one read method twice, naming
  the method and every site. Red without the rule: the r4 fixture scans clean.
- **AC-2** `scanModule` reports `RAW-HANDOFF` when a declared pass passes the raw binding as an argument
  to another function, naming the callee.
- **AC-3** Reads through a derived binding are NOT reported, and a pass reading the same method twice
  through one derivation scans clean; a raw read inside the derivation's own initializer counts once.
- **AC-4** The read set is DERIVED from the surface type declaration: a member added to the type and
  absent from `sinks`, `effects` and `ambient` is treated as a read on the next run, with no registry
  edit. Proved by a fixture whose type carries a member no row mentions.
- **AC-5** A send-bearing function with no declared pass is `UNDECLARED-PASS`; with two,
  `AMBIGUOUS-PASS`. Both fail. An `// send-auth: exempt: <reason>` with a non-empty reason suppresses
  the first; an empty reason does not; a token inside a string literal or JSX is not a declaration.
- **AC-6** Parameters propagate: a read performed inside a same-module helper that received the RAW
  surface counts against the pass, and the same read counts as derived when the helper received the
  snapshot.
- **AC-7** Totality: every occurrence of the raw binding is classified or reported. A property alias
  (`const m = s.marker`), a destructure (`const { marker } = s`), and a computed member each yield
  `UNCLASSIFIED-USE` and fail the gate.
- **AC-8** `CROSS-MODULE-HANDOFF` is reported when a pass hands a surface binding to an imported
  function, rather than the call being ignored.
- **AC-9** `scanRepo` walks the declared roots from disk and reports `UNREGISTERED-IMPORTER` for a
  module importing a registered surface type without its own row. A fixture module added under the
  walked root is discovered without any registry edit.
- **AC-10** The gate is green on the live tree with `// send-auth: pass` added above `authorize`, and
  RED on that same tree without it (`UNDECLARED-PASS` on `drive`). This is the passing-instance pin and
  its own premise, stated executably.
- **AC-11** The live-tree assertion carries a premise that the enrolled population is non-empty
  (`tests/_shared/premise.ts`), so an empty registry or a mis-rooted walk cannot report green.
- **AC-12** `pnpm mutation:guards` scores `sendAuthScan` with zero unaccepted survivors; the row's
  `scoreFloor` records the measured value and every accepted survivor carries its argument.
- **AC-13** The ledger row's stale `adapter.test.ts` claim is corrected to what that file asserts, and
  names `tests/paneCompaction/revalidate.test.ts:121` as the contract that does pin an ordering case.
- **AC-14** Counting is per invocation path: a helper holding one raw read, invoked twice from the pass,
  reports `MULTI-READ` with a count of two. A single invocation of the same helper scans clean.
- **AC-15** A raw read under a loop or an iteration callback is `ITERATED-READ`; a cyclic call graph is
  `CYCLIC-PASS`. Both fail the gate rather than being counted as one.
- **AC-16** Every sink call site in a send-bearing function is dominated by an execution that reaches
  the declared pass, else `UNAUTHORIZED-SINK`. A function DECLARATION that calls the pass does not count
  as an execution: the fixture pair is the live shape (clean) and the round-1 F1 bypass branch
  (reported).
- **AC-17** Discovery is anchored on SINKS, not effects: a function whose only effect calls are `out` is
  not send-bearing and needs no pass. Proved on the live module, where `main` carries fifteen `out`
  calls and no pass declaration.

## §7 Lint disposition

`pnpm spec:lint docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md` is run before
every spec dispatch and its full report — every finding plus the `summary:` line — is attached to the
dispatch, per `docs/agents/spec-self-review.md`. `codex-guard --lint-doc` records `lintArm` in the
wrapper's result file.
