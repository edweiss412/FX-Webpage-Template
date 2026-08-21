# BL-SEND-AUTH-SINGLE-READ-LINT — one read per send-authorization pass, enforced structurally

**Row:** `BL-SEND-AUTH-SINGLE-READ-LINT` (BACKLOG.md) · **Branch:** `feat/send-auth-single-read-lint` · **Effort:** M — a TS-AST scanner, a declared enrolment surface, and one declaration comment on the live instance.

## §0 The bound this arc is held to

One defect class produced a P0 in four consecutive diff rounds of `feat/orchestrator-pane-compaction`: a
send was authorized by a decision assembled from several surface reads taken at DIFFERENT INSTANTS
(`docs/review-rounds/feat/orchestrator-pane-compaction/7d332074ec97.md`, diff §). Four green suites
coexisted with it, because no suite assertion can express
"these two values came from different instants".

**What this gate claims, exactly.** Inside a declared authorization pass, every use of the injected
surface is one the scanner has classified, and each read method is read at most once, on a
straight-line path, in that pass — as is the declaration of any derivation. Any use it cannot classify — an alias, a destructure, a computed
member, a read behind a nested function or a loop, a handoff of the raw surface — is REPORTED BY NAME
and the gate FAILS.

**What it does NOT claim** is that a send was authorized at all. That is a control-flow property, and
this gate withdraws the claim rather than deferring it: the probe that withdrew it and the disposition
are §4 limit 1, which stands on its own terms and files no ledger row. The separate question of what
authorizes a send belongs to `BL-PANE-COMPACTION-SEND-AUTHORIZATION`, which owes this gate nothing.
A conservative report is a DOCUMENTED LIMIT; silence is never a certificate.

## §1.1 Resolved scope — do not relitigate

1. **The send path itself is not reopened.** `--checkpoint`, `--compact` and `--resume` ship DISABLED
   behind the fence at `scripts/pane-compaction.ts:587` (`SENDING`, `scripts/pane-compaction.ts:550`),
   and the authorization redesign is owned by `BL-PANE-COMPACTION-SEND-AUTHORIZATION`. This arc adds a
   scanner, its gate, its fixtures, one registry row, and ONE declaration comment. It changes no
   behavior of `scripts/pane-compaction.ts`.
2. **`drive()` being unreachable today is not a defect and not this arc's business.** The live instance
   is analyzed statically; a lint does not require its subject to execute. (Fence ratified in the owning
   arc's spec, `docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md:631`.)
3. **The pass grain is DECLARED, never inferred.** Ratified by measurement in §3.6, not by preference:
   at command grain the shipped, CORRECT code reports findings. A recognizer over function names
   ("authorize", "send") is the exact shape this corpus exists to prevent
   (`docs/agents/spec-self-review.md`, declared-task-contract bullet).
4. **The read set is DERIVED from the `Surface` type declaration** — every member minus the declared
   sink, effect and ambient sets. This settles the ledger row's first scheduled step, which asked whether the
   rule ranges over every `Surface` method or only the ones feeding a classification. A member added later is a READ by default,
   which is the strict direction; a "feeds a classification" boundary would need dataflow and is
   declined in §4 limit 5.
5. **CONTROL FLOW IS OUT OF SCOPE, and that is a decision made under the repair-direction rule, not an
   omission.** The first two review rounds returned seven findings; every one was an evasion of a part of the design
   that tried to prove an EXECUTION property — sink dominance (r1 F1, r2 F1), invocation counting
   (r1 F2, r2 F2), sink discovery through arbitrary bindings (r2 F3). Each repair widened the analysis
   and the next round found a wider evasion, which is precisely the same-axis recurrence pattern whose
   mandated answer is NARROWING, never recognizer growth (`AGENTS.md`, repair-direction bullet). So the
   dominance rule of the round-2 draft is WITHDRAWN, the call-graph traversal is deleted, and the
   analysis is now local: uses of the surface binding, classified. §3.3 records the r2 F1 probe still
   passing under the narrowed rule — it is the documented limit in §4 limit 1, stated in both
   directions so neither side is relitigated.
6. **The narrowing is not a loss of coverage.** Measured in §3.2 and §3.4: the round-4 shape, the
   named-callback shape (r2 F2) and the destructured-sink shape (r2 F3) are all caught by the narrowed
   rule, several of them by a simpler code than before. The scanner has no call graph, no path
   counting, and no dominance analysis.
7. **The BACKLOG row's claim about `adapter.test.ts` is stale and this arc corrects it** (§3.7).

## §1.2 Convergence criterion (all four, stated in every review brief)

- **Consequence bound.** Every occurrence of an enrolled surface binding is handled correctly or
  signaled — never silently wrong: it is classified by the scanner or REPORTED BY NAME, and every
  report fails the gate. Inside a declared pass this ranges over read POSITION as well as read count,
  and over the position of a derivation's DECLARATION (§2.3 rules 2-3, tightened by the r3 F1 repair in
  §3.8). A conservative report — an unclassified use, a read behind a nested function, a derivation
  declared under a loop, an undeclared pass — is a DOCUMENTED LIMIT, not a finding. A finding
  requires a probe showing a SILENT pass: the scanner reporting nothing while a surface use it claims
  to cover is present.
- **PROBE DOMAIN — DERIVED, AND DERIVED ON BOTH HALVES.** The modules named by the scanner's
  enrolment registry (`SEND_AUTH_SURFACES`, in the scanner module of §2.5) on the live tree, plus
  EVERY file under EVERY fixture root the gate scans — today `FIXTURE_ROOT` and `CONTROL_ROOT` in
  the gate module, `tests/paneCompaction/fixtures/sendAuth/` and
  `tests/paneCompaction/fixtures/sendAuthLiveControl/` — **including files and roots added after this
  line was written.** The second root was omitted while this read as a single directory, which is
  the enumeration failure in miniature: correct when written, and wrong the moment the gate grew a
  root. An enumeration over a growing corpus decays through ADDITION rather than through mistake,
  so review cannot see it; the domain is therefore stated as the roots the gate scans rather than as
  a list of the directories it scanned on the day.

  It cuts both ways, which is why it is worth the words: a reviewer can rule the arc's own probes
  out of domain, and the arc can cite evidence its brief does not admit. Either way the round is
  spent arguing scope instead of substance. A probe outside that domain, or more than one ordinary
  edit away from an input in it, files to documented limits rather than to a round. The population is
  read from the registry and never quoted as a number here; the dated census lives in §3.
- **Threat fence.** Ordinary authoring by a contributor who EDITS THE SURFACE USES of an enrolled
  module: a direct call, a call through a helper, an alias, a destructure, a read inside a callback or
  a loop, a derivation moved under one. **Control flow is outside the fence** — whether a send is reachable without the pass, whether
  a refusal is honoured, whether a branch is taken. Those file to §4 limit 1, which cites the probe
  that settles them, and are not findings.
- **Score.** `sendAuthScan` IS enrolled in the source-mutation registry (§5). `pnpm mutation:guards`
  runs BEFORE the round-1 diff dispatch and the brief states the score plus the empty
  unaccepted-survivor set. A "the guard does not pin what it claims" finding is admissible only with
  the surviving mutant that demonstrates it.

  **AMENDED AT IMPLEMENTATION TIME, BY MEASUREMENT.** The score alone does NOT close the
  weaker-implementation class. It closes what the DECLARED OPERATORS can express; an unanchored
  marker matcher (`body.includes(...)` for `body === ...`) passed the entire fixture corpus, and no
  operator in the declared set produces that edit, so no score could have reported it. The criterion
  is therefore the score AND a killer audit over every weaker implementation the plan's table names,
  each one BUILT and observed to red. Neither cover dominates the other, and a perfect score is not
  permission to skip the audit. A finding is still admissible only with its demonstrating mutant —
  hand-built counts, and names which weaker implementation it instantiates.

## §2 The rule, stated whole

### §2.1 What a pass is — declared, and undeclared is a finding

A **send-authorization pass** is the function that assembles the decision before a send. It is declared
in source, on the line above the function, in the shape the two closest analogues already use for their
inline tokens (`// no-telemetry: <reason>`, `tests/log/mutationSurface/exemptions.ts:12`;
`// not-subject-to-meta: <reason>`, `tests/data/_metaLibDataCallBoundary.test.ts:206`):

```ts
// send-auth: pass
const authorize = (): Authz => { ... };
```

**"On the line above" is resolved in SOURCE TEXT, past whitespace AND any further comment run.**
Diff r1 F4 read the sentence above as an exact-adjacency rule and correctly called the shipped
behaviour a deviation from it, so the rule is stated here rather than left to the reader. The
looser reading is the RATIFIED one and this is the direction it is ratified in: an explanatory
comment written between the marker and the declaration it describes is ordinary authoring, and
refusing to attach there would report `UNDECLARED-PASS` against a pass a human plainly declared —
a WRONG ATTRIBUTION, which the consequence bound forbids in the same breath as silence. What the
grammar does NOT admit is a marker attaching to something that is not a function: a marker whose
next real token starts a non-function declaration attaches to nothing, its function stays
undeclared, and the module reports. Both directions are pinned executably — `marker-then-comment`
scans clean, `marker-then-comment-detached` reports — so neither side is relitigated.

**What discovery cannot reach is REPORTED, not skipped (diff r1 F2/F3).** The population walk ranges
over module-level functions, and three shapes fell outside it silently: a surface binding introduced by
DESTRUCTURING a parameter (`settle({ dispatch }: Channel)`, where no property access on a binding
exists for any member-based arm to see), a sink called from a CLASS OR OBJECT METHOD, and a sink called
at MODULE SCOPE. The repair is DEFAULT-DENY rather than a wider recognizer — each is reported, the
destructure as `UNCLASSIFIED-USE` naming every bound member and the others as `UNDECLARED-PASS` naming
the enclosing declaration — so the complement of the accept set is answered by construction instead of
one grammar corner per round. The module-scope case previously asserted CLEAN as a documented limit;
that disposition is WITHDRAWN, because the bound forbids silence about a send with no pass and a
conservative over-report is a limit while silence is not.

Discovery is fail-by-default and anchored on the SINK: a **send-bearing function** is one whose body
calls a declared SINK method on a surface binding — in the live instance, `s.send(...)` at
`scripts/pane-compaction.ts:858`, `scripts/pane-compaction.ts:874` and `scripts/pane-compaction.ts:899`,
all lexically inside `drive()` (`scripts/pane-compaction.ts:700`). Every send-bearing function MUST
lexically contain exactly one declared pass, or carry `// send-auth: exempt: <reason>` with a non-empty
reason. Zero is `UNDECLARED-PASS`; two or more is `AMBIGUOUS-PASS`.

Discovery exists to LOCATE the pass whose reads §2.3 then checks. It is not a claim that every send is
authorized (§4 limit 1). **The sink set is NOT the effect set**: anchoring on every effect makes
`main()` send-bearing through its fifteen `s.out(...)` calls and reports `UNDECLARED-PASS` against
correct live code (§3.5).

### §2.2 Member classification — three declared sets, reads are the complement

| Class | Members (live instance, `scripts/pane-compaction.ts:83-138`) | Count |
| --- | --- | --- |
| Sinks (declared; discovery anchor) | `send` :98 | 1 |
| Other effects (declared; neither read nor anchor) | `out` :106, `outRaw` :117, `nonceWrite` :119, `nonceConsume` :120 | 4 |
| Ambient (declared) | `now` :104, `random` :105 | 2 |
| **Reads (derived: everything else)** | `roster` :84, `branches` :96, `screen` :97, `purview` :99, `marker` :100, `git` :101, `gh` :102, `corpus` :103, `nonceRead` :118, `resolveTarget` :137 | 10 |

Sinks are a subset of the effects; reads are the complement of every declared class, so a member added
to the type and left unclassified is a READ — covered on the commit that adds it rather than on the
commit someone remembers to classify it. `now` and `random` are ambient because they are generators,
not observations: `random` is called per nonce mint by construction, and a second `now()` is a second
instant of the clock rather than a second read of a pane.

### §2.3 The three rules

1. **Totality, MODULE-WIDE — `UNCLASSIFIED-USE`.** Every occurrence of a surface binding anywhere in an
   enrolled module is one of: a direct member call (`s.marker(...)`), a declared derivation source
   (rule 3), an ordinary injection argument OUTSIDE a pass, a parameter or declaration name, or an
   AMBIENT member handed on as a callback (`random: s.random`, `scripts/pane-compaction.ts:851`).
   Anything else — `const m = s.marker`, `const { send } = s`, `s[name]`, a bare mention — is REPORTED
   and fails the gate. Module-wide rather than pass-scoped, because the destructured-sink evasion
   (r2 F3) lives OUTSIDE the pass; an ambient reference is exempt because a generator carries no
   observation and so cannot hold a stale one.
2. **In-pass reads are straight-line and single — `NON-STRAIGHT-LINE-READ`, `MULTI-READ`.** Inside the
   declared pass, a read call must sit on the pass's own straight-line path: no enclosing nested
   function, callback, or loop between it and the pass body. Each read method may appear at most once
   on that path, and so must the DECLARATION of a derivation (rule 3) —
   `NON-STRAIGHT-LINE-DERIVATION`. A read behind a nested function has no static count — that is
   r2 F2's named callback and r1 F2's repeated helper, and both are now reported by ONE rule instead of
   counted by a call graph. Extending the same predicate to the derivation declaration is what closes
   r3 F1, and it costs no new mechanism: the check already existed and simply was not applied there.
3. **Exactly one declared derivation, and no raw handoff inside the pass — `MULTI-DERIVATION`,
   `RAW-HANDOFF`.** A derivation is a variable declaration inside the pass whose initializer either
   spreads the surface (`{ ...s, marker: … }`) or calls a DECLARED derivation helper with it
   (`cacheOf`, `scripts/pane-compaction.ts:362`; `memoize`, `scripts/pane-compaction.ts:343`). Reads
   through the derived binding are unconstrained, and raw reads inside the derivation's own initializer
   are not counted against rule 2's per-method limit — that is the shipped memo at
   `scripts/pane-compaction.ts:798`. **The exemption is positional, not temporal**, and the earlier
   draft's temporal wording is deleted rather than reworded: "the initializer is evaluated once per
   pass" is an EXECUTION property, and r3 F1 defeated it by declaring the derivation under a
   two-iteration loop and under a named callback invoked twice, both scanning clean (§3.8). What the
   exemption now rests on is checkable in the source text: the declaration itself sits on the
   straight-line path, enforced by rule 2. Passing the raw surface to anything else inside the pass is
   `RAW-HANDOFF`. **The helper list is DECLARED, not inferred.** Accepting any call that merely takes the
   surface made `observe(freshPane, freshRoster, as, s, cacheOf(s))` read as a derivation and silenced
   the round-4 shape entirely (measured, §3.2).

### §2.4 The enrolment registry

`SEND_AUTH_SURFACES`, in the scanner module (§2.5 edit 1), one row per module:

```ts
{ module: "scripts/pane-compaction.ts", surfaceType: "Surface",
  sinks: ["send"],
  effects: ["out", "outRaw", "nonceWrite", "nonceConsume"],
  ambient: ["now", "random"],
  derivationHelpers: ["cacheOf", "memoize"] }
```

**Discovery beyond the registry** is an import-edge arm, exact and checker-free: walking the roots, any
module that imports the `surfaceType` symbol from a registered module and is not itself registered is
reported as `UNREGISTERED-IMPORTER`. **A NAMESPACE import reaches the symbol through a qualified name
and is reported on the same rule** (`import * as registered from "./m"` plus `registered.Channel`).
Diff r1 F5 found the arm skipping namespace imports entirely while the suite called that "a documented
limit, held explicitly" — a limit this section never stated and §4 never excepted, so it was silence
wearing a limit's label. The match stays EXACT rather than blanket: a namespace import whose module
never mentions the type is not reported, pinned by the one-variable pair `namespace-importer` /
`namespace-importer-unused`. A brand-new surface type with its own sink is outside the
scanner's range until it is enrolled, exactly as with the mutation registry — enrolment is an act
(§4 limit 4).

### §2.5 The implementation surface, stated whole

Six edits, and no more:

1. **The scanner module** (`sendAuthScan.ts`, under `tests/paneCompaction/`) — NEW. Exports
   `SEND_AUTH_SURFACES`, `scanModule(file, row): Finding[]`, and `scanRepo(roots): Finding[]`.
   Importable module with a referring suite from the start, because it is a guard surface and the
   registry can only overlay a target a Vitest suite imports (`AGENTS.md`, convergence bullet 4).

2. **The gate** (`_metaSendAuthSingleRead.test.ts`, alongside it) — NEW. `scanRepo` over the live roots
   asserted empty, plus the fixture cases. No pnpm script — both closest analogues are gated by
   `pnpm test` through their meta-test (`tests/log/_metaMutationSurfaceObservability.test.ts:676`;
   `tests/data/_metaLibDataCallBoundary.test.ts`), and a third invocation surface would be a fourth
   thing to remember to run.
3. **The fixtures** (`fixtures/sendAuth/`, under the same directory) — NEW. One per verdict:
   the passing shape, `UNCLASSIFIED-USE` (alias, destructure, computed member, bare mention),
   `NON-STRAIGHT-LINE-READ` (nested function, named callback, loop), `MULTI-READ`, `RAW-HANDOFF`,
   `MULTI-DERIVATION`, `UNDECLARED-PASS`, `AMBIGUOUS-PASS`, `UNREGISTERED-IMPORTER`, the exempted
   shape, and the ambient-callback shape that must stay clean.
4. **`scripts/pane-compaction.ts`** — ONE line: `// send-auth: pass` above `authorize`
   (`scripts/pane-compaction.ts:785`). No behavior change, no reordering, nothing else in that file.
5. **`tests/mutation/source/registry.ts`** — one row, `id: "sendAuthScan"` (§5), with its companion rows
   in `tests/mutation/source/expectedLedgerKinds.ts` and the suite's `EXPECTED_ENV_TOUCHING`
   declaration.
6. **`BACKLOG.md`** — the row's stale `adapter.test.ts` claim corrected (§3.7), and the row graduated at
   close in the same commit that removes its in-progress marker (invariant 12).

## §3 Probes (run 2026-08-19 against the branch base, worktree `FX-worktrees/send-auth-single-read-lint`)

Throwaway prototypes were run against the live module before each revision of this design, per the
empirical-spike rule (`docs/agents/spec-self-review.md`, spike bullet). They take the pass name and raw
binding on the CLI instead of reading declarations — they measure the RULE, not the enrolment
mechanics. Transcripts are dated observations at base `4b5028b44` and are never corrected.

### §3.1 The shipped pass PASSES, under the narrowed rule

```
$ tsx proto5.ts scripts/pane-compaction.ts Surface authorize s \
    send out,outRaw,nonceWrite,nonceConsume now,random cacheOf,memoize
reads=roster,branches,screen,purview,marker,git,gh,corpus,nonceRead,resolveTarget
pass authorize line 785; derivations=1; straight-line reads: roster x1  marker x1
  no findings
exit=0
```

Two raw reads, both straight-line: `s.roster()` at `scripts/pane-compaction.ts:787`, and the memo's
`s.marker(cwd)` inside the single derivation's initializer, exempt from rule 2's per-method limit
because the derivation's DECLARATION is itself straight-line. This transcript is the one that had to
be re-taken after the r3 F1 repair, and it is the repair's false-positive check: the shipped memo IS a
derivation, so a rule that reported it would fail against correct live code.

### §3.2 The round-4 defect is CAUGHT, and the declared-helper list is why

```
$ tsx proto4.ts .claude/mutant-r4.ts Surface authorize s send ... cacheOf,memoize
pass authorize line 785; derivations=0; straight-line reads: roster x1  marker x1
  FINDING RAW-HANDOFF .claude/mutant-r4.ts:796 the raw surface is passed to observe()
  FINDING RAW-HANDOFF .claude/mutant-r4.ts:796 the raw surface is passed to cacheOf()
exit=1
```

An earlier iteration of this probe treated ANY call taking the surface as a derivation. Under that
reading the same mutant reported `no findings`, because `observe(..., s, cacheOf(s))` looked like one.
Rule 3's declared helper list is that measurement.

### §3.3 The withdrawn claim, and the probe that withdrew it

The round-2 reviewer's F1: revalidation made conditional while the syntactic reference survives.

```
$ tsx proto4.ts .claude/mutant-r2f1.ts Surface authorize s send ... cacheOf,memoize
pass authorize line 785; derivations=1; straight-line reads: roster x1  marker x1
  no findings
exit=0
```

The mutant is `const freshOk = opts.json ? revalidateNow() : ({ ok: true } as const);` — with the
default `opts.json === false` the checkpoint path sends without executing the pass, and the scanner
says nothing. That is CORRECT under the narrowed claim and it is §4 limit 1: this gate does not decide
whether a send was authorized. The round-2 draft's dominance rule was an attempt to decide it by
statement order, and the same reviewer defeated it with one conditional.

### §3.4 The evasions that ARE in scope, each caught

```
=== r2 F2, a NAMED callback invoked twice inside the pass ===
  FINDING NON-STRAIGHT-LINE-READ .claude/mutant-r2f2.ts:787 screen() is read inside a nested function or loop

=== r2 F3, a destructured sink in a pre-authorization branch ===
  FINDING UNCLASSIFIED-USE .claude/mutant-r2f3.ts:844 the surface is destructured; calls through the bindings are invisible

=== fixture family, one ordinary edit apart ===
pass-clean       no findings
helper-twice     FINDING RAW-HANDOFF the raw surface is passed to read()
loop-read        FINDING NON-STRAIGHT-LINE-READ marker() is read inside a nested function or loop
property-alias   FINDING UNCLASSIFIED-USE `s.marker` is referenced without being called
destructure      FINDING UNCLASSIFIED-USE the surface is destructured; calls through the bindings are invisible
```

`helper-twice` is round-1 F2's repeated-helper case. Under the round-2 draft it needed path counting;
under the narrowed rule it is a raw handoff, caught by a simpler check.

### §3.5 Sinks versus effects, on the live module

With the planned comment inserted in memory, counted per function:

```
main:  send=0, out=15, outRaw=0, nonceWrite=0, nonceConsume=0; pass markers=0
drive: send=3, out=7,  outRaw=3, nonceWrite=1, nonceConsume=1; pass markers=1
```

Anchoring discovery on effects makes `main` send-bearing with no pass — a report against correct code.
Anchoring on sinks leaves `main` outside the rule and `drive` inside it, which is §2.1 as written.

### §3.6 The grain is the pass, and that is measured rather than preferred

An earlier prototype run at COMMAND grain reported three findings against correct code — the REPORT
phase's reads at `scripts/pane-compaction.ts:709` and `scripts/pane-compaction.ts:733`, which are
deliberately stale-tolerant because revalidation exists. At program grain it reported seven. Hence
§2.1: the pass is declared, and the report phase is outside it.

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
("compares the nonce the marker holds AFTER revalidation, not before"). §2.5 edit 6 corrects the row.

### §3.8 The round-3 F1 repair, and the regression sweep that admitted it

r3 F1: the derivation exemption still rested on an execution property. The reviewer declared the
derivation itself under a two-iteration loop, and separately inside a named callback invoked twice,
with an eager `s.marker(...)` in the initializer. Both scanned CLEAN against the round-2 design.
Reproduced here rather than accepted on report — the loop mutant wraps the snapshot declaration at
`scripts/pane-compaction.ts:798`:

```
$ tsx proto4.ts .claude/mutant-r3f1-loop.ts Surface authorize s send ... cacheOf,memoize
pass authorize line 785; derivations=1; straight-line reads: roster x1  marker x1
  no findings
```

The repair is SUBTRACTIVE: delete the exemption's temporal justification and apply rule 2's existing
`straightLine` predicate to the derivation DECLARATION. No new mechanism, no call graph, no path
counting, and §2.3 gets shorter. Under the repair-direction rule this is the narrowing direction —
which matters, because every earlier repair on this axis WIDENED the analysis and each widening was a
bigger target for the next round.

The sweep that admitted it. A repair on this arc is not accepted on the strength of the case it
closes: two of the owning PR's repairs introduced the following round's defect, so the whole corpus is
re-run and the false-positive check is the one that decides.

```
live tree            no findings          <- decides it; the shipped memo IS a derivation
r3F1 loop            NON-STRAIGHT-LINE-DERIVATION :798
r3F1 named callback  NON-STRAIGHT-LINE-DERIVATION :798
round-4              RAW-HANDOFF x2       <- regression holds
r2 F2 named callback NON-STRAIGHT-LINE-READ
r2 F3 destructure    UNCLASSIFIED-USE
r2 F1 conditional    no findings          <- limit 1's fence did not move
```

The last row is the one to read twice. r2 F1 must STAY clean: it is the withdrawn control-flow claim,
and a repair that started reporting it would have re-opened the axis this design closed by declining
it. AC-15 pins that in both directions and AC-7b pins this one.

## §4 Documented limits

1. **Control flow is not analyzed, and no claim rests on it** (§3.3). A send reachable without the pass,
   a refusal that is ignored, a conditional that skips revalidation — none is reported. The round-2
   draft tried statement-order dominance and one conditional defeated it; widening again is the
   recognizer growth the repair-direction rule forbids. **This is a documented limit of this gate on
   its own terms, and not a pointer to open-queue work.** Its worst case is conservative behavior plus
   a surfaced signal — the gate reports nothing about control flow and §0 withdraws the claim in the
   same breath — which under the 2026-08-04 filing bar is a DOCUMENTED LIMIT rather than a `BL-`/`DEF-`
   row, so no row is filed for it and none is owed. The authorization PROPERTY is separately owned, and
   that is a different subject from this gate's scope: `BL-PANE-COMPACTION-SEND-AUTHORIZATION`
   (`BACKLOG.md:1346`) holds the send path's authorization model, its first scheduled step being whether
   one atomic snapshot per authorization suffices. That row owns deciding whether a send is authorized;
   it does not owe this gate a control-flow arm, and this gate does not wait on it. The behavioral
   contract is pinned executably by the suite (`tests/paneCompaction/revalidate.test.ts:121`).
   **Fenced in both directions:** this is not a gap to be closed by a later round of this arc, and it
   is not a claim this gate makes.
2. **A value captured outside the pass is invisible.** The taint arm that would catch it fires on the
   shipped, correct comparison `fresh.verdict !== report.verdict` (`scripts/pane-compaction.ts:826`),
   whose whole purpose is comparing an OLD report against a fresh one, since `report` is initialized
   from `observe(...)` at `scripts/pane-compaction.ts:709`. Pinned executably instead at
   `tests/paneCompaction/revalidate.test.ts:121`.
3. **Memoization is not verified, and after the r3 F1 repair that is the ONLY thing left unverified
   about a derivation.** Reads through a derived binding are unconstrained, so a derivation that fails
   to memoize is not a lint finding. What the gate DOES now check is positional and textual: the
   derivation's declaration sits on the straight-line path (rule 2). What it does not check is what the
   initializer computes or how many times the runtime evaluates it — that is behavior, pinned by tests
   (`scripts/pane-compaction.ts:798` is the shape). The earlier draft blurred these by claiming the
   initializer "is evaluated once per pass"; that claim is deleted, not softened (§3.8).
4. **Enrolment is an act.** A new surface type with its own sink, in a module importing nothing from a
   registered one, is outside the scanner's range until it is enrolled — the same posture as the
   mutation registry. The import-edge arm (§2.4) covers the reachable case.
5. **"Feeds a classification" is declined as the read boundary.** It needs dataflow, it moves whenever
   the classifier changes, and the strict complement in §2.2 is a superset of it.
6. **Cross-module passes are not followed.** The scanner has no call graph at all; a helper in another
   module can only receive the surface through an argument, which inside a pass is `RAW-HANDOFF` and
   outside one is ordinary injection.
7. **`drive()` is unreachable on this tree** (`scripts/pane-compaction.ts:587`). The live instance is
   analyzed statically. When the send path ships under `BL-PANE-COMPACTION-SEND-AUTHORIZATION`, nothing
   about this gate changes.

8. **Four shapes are SILENT, each named with its probe and its re-file trigger.** Diff rounds 3 and 4
   returned twelve findings between them; two were silent defects and are REPAIRED — **named by
   FUNCTION, because "the read arm" resolves to two of them and this sentence was false under one
   reading**: `classifyUses`'s member classification and `analyzeHandoffs` now fail closed (§2.5).
   `analyzePassReads` was NOT narrowed at r4 and still required a bare identifier receiver; it is
   narrowed by `BL-SENDAUTH-ARM-CLASSIFIER-UNIFICATION`, which is where that half was actually
   closed. A NARROWED claim is only as precise as the name it is recorded against. The four below remain silent, and they are fenced here rather than
   repaired because each needs a recognizer this scanner has declined to grow — the repair-direction rule
   under same-axis recurrence. A documented limit with a re-file trigger is a decision; without one it is
   an excuse, so every entry carries one.

   Each was probed in-process against the shipped scanner at `f88690111`, each returned **0 findings**,
   and each has **0 occurrences in the live corpus** (`SEND_AUTH_SURFACES` = `scripts/pane-compaction.ts`,
   which scans clean — measured, not assumed). **The direction of every miss is the same: a MISS, never a
   false advisory.** The gate does not fire wrongly on any of them; it says nothing.

   - **(a) A parenthesized TYPE annotation** — `settle(ch: (Channel))`. `isSurfaceRef` inspects the type
     node without unwrapping, so the parameter is not a surface binding and the whole module scans as
     `[]`. **Re-file when:** any file under a scanned root is authored with a parenthesized type
     annotation on a surface binding, or `isSurfaceRef` is edited for any other reason.
   - **(b) A sink or read reached through a member of an object TYPE** — `type Holder = { ch: Channel }`,
     then `h.ch.dispatch(...)`. `ch` is a member of an alias, not a binding, and resolving it needs a
     checker — the same one limit 5 declines. **Re-file when:** a scanned module introduces a holder type
     around an enrolled surface, or the scanner acquires a `ts.TypeChecker` for any reason.
   - **(c) An accessor-shaped function-like** — a `get`ter or a constructor whose body holds a declared
     pass. The function-like predicate is hand-written and enumerates declarations, so an accessor body is
     read as straight-line. **Re-file when:** any scanned module declares a pass inside an accessor or a
     constructor, or the predicate is edited.
   - **(d) A type-position `import()` edge** — `type Local = import("./m").Channel`. Import-edge discovery
     visits `ImportDeclaration` only, so an importer written this way is not registered. **Re-file when:**
     any file under a scanned root imports an enrolled surface type in type position, or
     `importEdgeFindings` is edited.

   **What makes this fence honest rather than convenient:** the two shapes that were SILENT AND ORDINARY —
   an unclassified member through a property receiver, and a raw handoff of a name-shadowing parameter —
   were NOT fenced. They were repaired, because a silent miss is not the conservative behaviour this
   spec's bound permits, and fencing them would have been one notch weaker than the bound this gate is
   held to. The unification that would close all four is filed as
   `BL-SENDAUTH-ARM-CLASSIFIER-UNIFICATION`.

### Dimensional Invariants

N/A — no UI surface. No component, no fixed-dimension parent.

### Transition Inventory

N/A — no UI surface, no visual states.

## §5 Meta-test / registry inventory

**Creates:** the gate of §2.5 edit 2 — filesystem-walked discovery over the declared roots, so a new
importer of a registered surface type fails by default rather than being silently exempt. Modelled on
`tests/log/_metaMutationSurfaceObservability.test.ts:676` and
`tests/data/_metaLibDataCallBoundary.test.ts`, both of which walk their roots with `readdirSync`
(`lib/messages/__internal__/walkSourceFiles.ts:8`; `tests/data/_metaLibDataCallBoundary.test.ts:670`).
Comment extraction goes through `commentRanges` (`tests/_shared/stripComments.ts:12`) so a token inside
a string or JSX is not a declaration.

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
arc does not enrol it.

**Advisory-lock topology:** N/A — no `pg_advisory*` surface. **Supabase call boundary:** N/A — no
Supabase client call. **DB layers:** N/A — no migration, no RPC, no CHECK.

## §6 Acceptance criteria

- **AC-1** Totality is module-wide: an alias (`const m = s.marker`), a destructure (`const { send } = s`),
  a computed member, and a bare mention each report `UNCLASSIFIED-USE` and fail the gate — including
  when they sit OUTSIDE the declared pass.
- **AC-2** An AMBIENT member handed on as a callback (`random: s.random`) does NOT report, and the same
  shape with a READ member does. The live module carries the ambient case at
  `scripts/pane-compaction.ts:851`, so a rule that reported it would fail on correct code.
- **AC-3** Ordinary injection outside a pass — `drive(opts, pane, roster, s)`, `cacheOf(s)`,
  `observe(pane, roster, as, s, cache)` in the report phase — does NOT report. Inside a pass the same
  shape reports `RAW-HANDOFF`.
- **AC-4** The read set is DERIVED from the surface type declaration: a member absent from `sinks`,
  `effects` and `ambient` is treated as a read on the next run, with no registry edit.
- **AC-5** A send-bearing function with no declared pass is `UNDECLARED-PASS`; with two,
  `AMBIGUOUS-PASS`. An `// send-auth: exempt: <reason>` with a non-empty reason suppresses the first;
  an empty reason does not; a token inside a string literal or JSX is not a declaration.
- **AC-6** A read call inside a nested function, a named callback, or a loop within the pass reports
  `NON-STRAIGHT-LINE-READ`. The named-callback case is the round-2 F2 shape and is asserted by that
  name.
- **AC-7** Two straight-line reads of the same method in the pass report `MULTI-READ` naming both
  lines; one read scans clean.
- **AC-7b** A derivation DECLARED inside a loop, or inside a named callback invoked more than once,
  reports `NON-STRAIGHT-LINE-DERIVATION`. Both shapes are the round-3 F1 probes (§3.8) and are asserted
  by name. The shipped memo at `scripts/pane-compaction.ts:798` — a derivation on the straight-line
  path — must NOT report, and the two together are what make this rule discriminating rather than a
  blanket ban on derivations.
- **AC-8** Exactly one derivation per pass: two report `MULTI-DERIVATION`. A derivation is recognized
  only for a DECLARED helper or a spread — a call to an undeclared function taking the raw surface
  inside the pass is `RAW-HANDOFF`, and the round-4 fixture proves it (an "any call" reading silences
  that fixture entirely).
- **AC-9** `scanRepo` walks the declared roots from disk and reports `UNREGISTERED-IMPORTER` for a
  module importing a registered surface type without its own row. A fixture module added under the
  walked root is discovered without any registry edit.
- **AC-10** The gate is green on the live tree with `// send-auth: pass` added above `authorize`, and
  RED on that same tree without it (`UNDECLARED-PASS` on `drive`).
- **AC-11** The live-tree assertion carries a premise that the enrolled population is non-empty and the
  walk resolved at least one module (`tests/_shared/premise.ts`), so an empty registry or a mis-rooted
  walk cannot report green.
- **AC-12** `pnpm mutation:guards` scores `sendAuthScan` with zero unaccepted survivors; the row's
  `scoreFloor` records the measured value and every accepted survivor carries its argument. A survivor
  demonstrating that a WEAKER IMPLEMENTATION passes the suite — an unexamined node kind, an
  unrecognized comment syntax, an unfollowed import form, an exemption reaching past its rule — is
  BLOCKING and must end up KILLED; neither `accepted-gap` nor `equivalent` is available for that shape.
- **AC-13** The ledger row's stale `adapter.test.ts` claim is corrected to what that file asserts, and
  names `tests/paneCompaction/revalidate.test.ts:121` as the contract that does pin an ordering case.
- **AC-14** Discovery is anchored on SINKS, not effects: a function whose only effect calls are `out`
  is not send-bearing. Proved on the live module, where `main` carries fifteen `out` calls and no pass.
- **AC-15** The withdrawn claim is pinned as a limit, not left ambiguous: a fixture in which the pass is
  called conditionally scans CLEAN, and the suite asserts that clean result with a comment naming §4
  limit 1. A later edit that starts reporting it would fail this assertion, which is how the fence
  holds in both directions.

- **AC-16** Every shape the population walk cannot reach REPORTS, and each is proven by a case that
  fails when the arm is removed rather than by an assertion that it exists. A destructured surface
  parameter reports `UNCLASSIFIED-USE` naming each bound member; a sink called from a class or object
  method, or at module scope, reports `UNDECLARED-PASS` named for its enclosing declaration; a class
  FIELD holding the surface binds, and a sink reached through `this.ch` is found by taking the
  receiver at its rightmost name. The one shape still declined — a receiver that is a CALL RESULT — is
  DECLARED SILENCE under §4's no-call-graph fence, and it is named here so that silence is a stated
  disposition rather than an omission.
- **AC-17** A namespace import that reaches the surface type by qualified name reports
  `UNREGISTERED-IMPORTER`; one that never reaches it does NOT. The negative half is proven
  ATTRIBUTABLE rather than accidental: the arm prefilters on the surface-type NAME before parsing, so
  the declining fixture deliberately carries that token in its header prose. Without it the file is
  skipped before the qualified-name check runs and the clean verdict would prove only that the
  prefilter works — two bounds can reject the input, so the fixture is constructed in the gap where
  only the bound under test can.
- **AC-18** No loop in the scanner has its termination decided by a mutable predicate. The two that
  did are gone: the whitespace walk is a regex match for the leading run, carrying no comparison
  operator at all, and the comment walk is bounded by `ranges.length`, a ceiling no mutant can lift.
  The remaining two ascend a finite tree assigning `cursor = cursor.parent` in the BODY, so a mutated
  predicate can only stop them earlier. This is a property of the module, not a list of repairs — the
  worst case for any mutant is a survivor that can be read, never a hang that takes the measurement
  down while reporting nothing.
- **AC-19** No assertion in the gate can pass while the scanner looked at nothing. The one case built
  entirely from negative assertions carries its premise IN THE SAME CASE, and the premise is proven to
  fire by forcing the read set empty.

## §7 Lint disposition

`pnpm spec:lint docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md` is run before
every spec dispatch and its full report — every finding plus the `summary:` line — is attached to the
dispatch, per `docs/agents/spec-self-review.md`. `codex-guard --lint-doc` records `lintArm` in the
wrapper's result file.
