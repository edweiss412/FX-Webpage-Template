# PLAN — BL-SENDAUTH-ARM-CLASSIFIER-UNIFICATION

Spec: `docs/superpowers/specs/ci/2026-08-21-sendauth-arm-classifier-unification-design.md`. Every
section reference below is to that document. Surface: `sendAuthScan`
(`tests/mutation/source/registry.ts`), source `tests/paneCompaction/sendAuthScan.ts`, deciding suite
`tests/paneCompaction/_metaSendAuthSingleRead.test.ts`.

**Base:** `64c40a68e228d518befa6b5614859fc9ed80728b`. Line numbers below are BASE-stamped and the
SYMBOL is the durable identity — these tasks edit the cited file, so a line is a drafting-time
locator that this plan's own execution invalidates.

---

## 0. The ordering constraint that shapes everything

**Every task that edits `sendAuthScan.ts` or the deciding suite RETIRES the mutation score**, and
rule 27 has no test-side exception: the score is a pure function of source, declared operators,
deciding suites and fixtures. So **the score is measured ONCE, in `task:score-measure`, after the last input
edit** — not per task, and never quoted from an earlier run.

The same applies to the `GUARD SURFACE:` line of any diff-stage review brief: a score cited there is
stale from the moment `task:score-measure`'s inputs move.

**Second ordering constraint:** a guard is not a separate deliverable — **it is the RED of the
change's own cycle**. Plan round 1 showed that splitting the scans from the routing they demand is
not merely an ordering choice but an IMPOSSIBLE cycle: a scan asserting the outstanding
obligations (twelve when measured against the prototype, SIX at HEAD — the population moved, because Tasks 2-6 both added name sites and removed others) is red by construction until they are discharged, so it can never commit green. **`task:scans-and-routing`
therefore holds both**, and §3d records the shrinking-allowlist alternative and why it was declined.

---

## 1. Meta-test inventory

**Creates:** nothing new as a FILE. Three new scans land as cases inside the existing deciding suite
(§5): absence (AC-U16a), adoption (AC-U16b), metamorphic invariance (AC-U16c).

**Extends:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts` and
`tests/paneCompaction/fixtures/sendAuth/`. Two existing expectations change (§3.6), owned by **Task
4** — the task whose change moves them — rather than deferred to a later one that cannot help it go
green.

**Does NOT extend:** `tests/mutation/source/registry.ts` gains no ROW — `sendAuthScan` is already
enrolled; its `control` is EDITED by **`task:score-measure`**. `paneCompactionCore` is untouched.
`EXPECTED_LEDGER_KINDS` and `EXPECTED_ENV_TOUCHING` already carry `sendAuthScan` and change only if
the accepted-survivor set does.

**Advisory-lock topology:** N/A — no `pg_advisory*` surface. **Supabase call boundary:** N/A.
**DB layers:** N/A — no migration, RPC, CHECK or enum. **Flag lifecycle:** N/A — no toggle.
**Mutation surface observability (invariant 10):** N/A — no route handler, no `"use server"` action.

---

## 2. Pre-draft verification pass (run, not described)

Every path, symbol and mechanism this plan names, checked against the live tree at BASE:

```
tests/paneCompaction/sendAuthScan.ts                   TRACKED
tests/paneCompaction/_metaSendAuthSingleRead.test.ts   TRACKED
tests/mutation/source/registry.ts                      TRACKED  (sendAuthScan row present)
tests/mutation/source/expectedLedgerKinds.ts           TRACKED  (sendAuthScan: {} present)
tests/mutation/_metaPremiseContract.test.ts            TRACKED  (sendAuthScan declared)
tests/_shared/premise.ts                               TRACKED
tests/mutation/guardSurfaces.shard0..3.test.ts         TRACKED  (byte-pinned templates)
ignore-file entry for the scoped-shard scratch glob (shards 4-9)          COVERED
grep -c -F 'if (ambient.has(member) && handedOn) return;' sendAuthScan.ts   = 1
fixtures/sendAuth entries = 81 ; files under fixtures/ = 82
prettier --check fixtures/sendAuth/parenthesized-receiver.ts  = clean
.prettierignore has NO tests/paneCompaction entry
inline `// prettier-ignore` directives across the corpus = 1
deciding suite assertions over fixture BYTES = 0
```

**Two of those are load-bearing and easy to misread.** `.prettierignore` does NOT cover this fixture
tree, and exactly ONE fixture carries an inline directive — so the corpus's byte fidelity is
currently unprotected, which `task:corpus-manifest` fixes by a derived assertion rather than by a shared-file edit.

---

## 2b. Acceptance-criteria inventory

Every `ac=` a task marker names, restated here so it resolves in this plan's own text. Full wording
and proof channel live in spec §6; this is the index, not a second definition.

| id | claim | task |
| --- | --- | --- |
| **AC-U1** | `analyzePassReads` counts a read through a property receiver | `sites-consume-rule-a` |
| **AC-U2** | `analyzeHandoffs` reports a handoff through a property receiver | `sites-consume-rule-a` |
| **AC-U3** | parenthesized receivers classify identically to bare ones at every consumer | `sites-consume-rule-a` |
| **AC-U4** | the derivation exemption is void under a competing double declaration, in every scope kind | `rule-b-count` |
| **AC-U5** | a declaration provably NOT the surface does not compete, paired one variable away | `rule-b-count` |
| **AC-U6** | the live corpus scans 0 findings, with its population premise stated executably | `read-set-member-name`, `corpus-preservation` |
| **AC-U7** | all 81 pre-existing fixture verdicts preserved except the two named, additively | `corpus-preservation` |
| **AC-U8** | `shadowedBetween` no longer exists, and no loop's termination rests on a mutable predicate | `score-measure` |
| **AC-U9** | the registry control keys on a line occurring exactly once, asserted by the SUITE not a comment | `score-measure` |
| **AC-U10** | the ledger row's three defects corrected; every NARROWED claim resolves to one FUNCTION | `ledger-closeout` |
| **AC-U11** | the predecessor spec's §4 limit 8 preamble no longer carries a claim false under either reading | `ledger-closeout` |
| **AC-U12** | an annotation that could hold the surface COMPETES; a keyword-typed one does not | `rule-b-count` |
| **AC-U13** | a value reference carrying a `name` classifies as a USE, not a declaration | `declaration-name-accept-set` |
| **AC-U14** | a statically known element-access receiver resolves; a non-literal key stays `opaque` | `resolve-name` |
| **AC-U15** | every transparent wrapper the COMPILER defines is skipped, on BOTH sides | `resolve-name` |
| **AC-U16a** | ABSENCE — no site re-implements the rule | `corpus-manifest`, `scans-and-routing` |
| **AC-U16b** | ADOPTION — every name-resolution site routes or carries one of the three tokens | `corpus-manifest`, `scans-and-routing` |
| **AC-U16c** | METAMORPHIC — the detected site SET is identical under rename and reformat | `scans-and-routing` |

**AC-U16a, AC-U16b and AC-U16c are three different claims and none implies another** — absence of
copies, adoption of the shared rule, and independence from spelling.

---

## 2c. AC-U7's per-fixture verdict diff — RUN at plan time, pasted

The spec requires the before/after diff to be measured and pasted here rather than described as a
check to perform later. **Baseline read through `git show origin/main:<path>`, never from the
worktree the prototype lives in** — a baseline read from disk there compares the prototype against
itself and reports exactly the answer you were hoping for.

```
PER-FIXTURE VERDICT DIFF over 81 fixtures
  identical: 79
  moved:     2

  same-pass-shadowed-derivation.ts
    before: NON-STRAIGHT-LINE-READ@31:panes  NON-STRAIGHT-LINE-READ@32:panes
    after:  NON-STRAIGHT-LINE-READ@31:panes  NON-STRAIGHT-LINE-READ@32:panes  RAW-HANDOFF@35:inner
    added:   RAW-HANDOFF@35:inner
    removed: (none)

  shadowed-param-handoff.ts
    before: RAW-HANDOFF@35:leak
    after:  RAW-HANDOFF@35:leak  RAW-HANDOFF@38:inner
    added:   RAW-HANDOFF@38:inner
    removed: (none)
```

**`removed: (none)` on both is the load-bearing half** — it is what makes the change ADDITIVE rather
than merely small, and it is the per-fixture output the AC's proof channel requires. 79 fixtures are
byte-identical in verdict.

---

## 3. Tasks

**Every task carries a STABLE SLUG, and the number is presentation only.** An ordinal is a
POSITIONAL name — guaranteed to change on any reorder, and carrying nothing a reader or a linter can
check a reference against. Round 2 found the consequence: the restructure renumbered twelve tasks
into ten and every reference OUTSIDE the rebuilt region still named the old ordinals, reading as
perfectly good sentences. **A renumber is a RENAME.** With slugs it is a formatting change, and the
cross-reference sweep becomes mechanical.

**Restructured after plan round 1.** Four findings were one shape: **tasks whose cycle cannot
complete.** the rule tasks required fixtures their `Files:` denied; `task:scans-and-routing`'s scan was deliberately red
until `task:corpus-preservation` edited production code, so it could never commit green; `task:rule-b-count` broke two expectations
`task:score-measure` deferred; and three authored REDs were not entailed. **A task owns every file its own red
needs, and every cycle goes green on its own command before the next task starts.**

## Task 1 — the corpus manifest, its axes, and the directive census  `[task:corpus-manifest]`

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`, `tests/paneCompaction/fixtures/sendAuth/`

**OUTSIDE the red-contract region, and this is the rule applied CONSISTENTLY rather than a fourth
attempt at a marker.** Rounds 3 and 4 both found this task's red unentailed, and the reason is
structural: it authors fixtures and a manifest, changing NO production behaviour, so there is no
production line whose repair turns it green. **A red contract is a contract about production
behaviour**, and a task that has none cannot honestly carry a marker — which is exactly what the
three tasks below already concluded.

**Acceptance:** the manifest case reports zero unaccounted fixtures, the directive census passes, and
every struck cell carries its reason.

**The manifest is authored INSIDE the deciding suite, not as a separate module.** A new module that
the suite imports turns its own absence into a COLLECTION failure, and a collection failure is not a
red for the asserted reason — it goes green when the test file changes rather than when the
implementation lands. The manifest is data in the suite; its red is a value mismatch.

**`task:corpus-manifest` derives ONLY from constants that exist at its own sequence position** — the six decision
sites, the finding codes, the surface registry, and the receiver spellings the corpus already
contains. **The `Receiver` union and the wrapper enum do not exist yet**, so their parity assertions
are authored by the task that INTRODUCES each constant (`task:resolve-name`), not here: importing a symbol a later
task creates turns this cycle's red into a collection failure, and retyping it into the suite is the
retyped axis the design forbids. **Each task adds the parity assertion for the constant it
introduces**, which is why no task has to reach forward.

**The comparison has an independent witness on one side.** Axes are DERIVED from the shipped
constants; the other side is the fixture DIRECTORY ON DISK. **Derivation is right for a COVER and
wrong for BOTH SIDES OF A COMPARISON** — two derivations from one constant cannot disagree, because a
drift moves them together. The filesystem does not know what the constant says.

Unbounded axes get an INDEPENDENCE PROOF over structurally distinct classes (0, 1, 2, deep),
asserting the finding set is IDENTICAL. Struck cells carry their reason.

**The directive census** asserts every syntax-sensitive cell carries `// prettier-ignore` immediately
above its line, by a walk derived from the manifest — not a shared-file ignore entry.

<!-- tasks: depth=2 red-contract -->

## Task 2 — `resolveName`, rule A, and the fixtures that exercise them  `[task:resolve-name]`

**Files:** `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/fixtures/sendAuth/`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:818` why=`receiverRightmostName sees through parentheses only and returns null for an element access, so this task's static-element-key fixture reports an empty findings array where UNDECLARED-PASS naming the enclosing function is expected` ac=AC-U14,AC-U15 -->

One name resolution for every position, unwrapping through `ts.skipOuterExpressions(node,
ts.OuterExpressionKinds.All)` — asked of the compiler — and resolving a static element key from its
literal. `surfaceReceiverOf` returns the three-way `Receiver` **and is the entry point the arms
call**; a type declared and never consumed is decorative. Transparency is symmetric: the identifier
side walks OUT through every transparent wrapper.

## Task 3 — the six decision sites consume rule A  `[task:sites-consume-rule-a]`

**Files:** `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/fixtures/sendAuth/`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:579` why=`analyzePassReads requires ts.isIdentifier on the receiver, so this task's property-receiver double-read fixture reports no MULTI-READ naming panes while its bare control in the SAME function does report, and the equality assertion fails on the missing record` ac=AC-U1,AC-U2,AC-U3 -->

D1 through D6 stop answering for themselves; the member SELECTOR is accepted in either form. **Every
assertion is an EQUALITY over the whole finding set** — a presence check is satisfied by every
superset, and the defect being removed is a report naming the BINDING where the member is owed.

## Task 4 — rule B, and the two expectations it moves  `[task:rule-b-count]`

**Files:** `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/fixtures/sendAuth/`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:994` why=`shadowedBetween enumerates four function-like kinds, so this task's constructor-scope and set-accessor-scope shadow fixtures report an empty findings array where RAW-HANDOFF naming the callee is expected, while the arrow-scope control does report` ac=AC-U4,AC-U5,AC-U12 -->

`shadowedBetween` is DELETED and a COUNT replaces it. The exemption for a name is VOID inside a pass
declaring it more than once with a COMPETING declaration; a declaration competes unless its
annotation is a keyword type that cannot hold an object, **with the complement DEFAULT-DENIED into
the reporting direction**.

**The two moved expectations are updated HERE, in the same task**, because rule B moves them the
moment it lands and a task cannot reach green while leaving its own suite red.
`shadowed-param-handoff.ts` and `same-pass-shadowed-derivation.ts` each gain exactly one ADDITIVE
`RAW-HANDOFF` naming `inner` at their closing `return inner(snap);`. Nothing is removed; both already
report; both declare `snap` twice with competing surface-typed declarations, so every use of `snap`
in that pass is RAW. **The update lands with its reason, because a silently updated expectation is
indistinguishable from a regression somebody accommodated.**

## Task 5 — the declaration-name accept-set, defaulting to USE  `[task:declaration-name-accept-set]`

**Files:** `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/fixtures/sendAuth/`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:491` why=`isDeclarationName enumerates four declaration kinds and misses accessor names, so this task's set-accessor fixture emits a spurious UNCLASSIFIED-USE naming the accessor's own name and the equality assertion fails on that extra record` ac=AC-U13 -->

**The default is chosen by which error survives being wrong**, and the two accept-sets in this arc
default in OPPOSITE directions. Classifying a USE as a declaration SKIPS it and the finding is lost
silently and forever; classifying a DECLARATION as a use REPORTS and costs a line somebody reads.

## Task 6 — the read set's member name is a position too  `[task:read-set-member-name]`

**Files:** `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/fixtures/sendAuth/`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:146` why=`readsFromSourceFile requires ts.isIdentifier on the member name, so readsFor over this task's surface fixture declaring a QUOTED member returns a read set missing that member and the equality assertion fails on the returned array` ac=AC-U6 -->

**The read set is consumed as a COMPLEMENT**, so a dropped member is not one missing entry — it is
reclassified "not a read" and rules 2 and 3 stop constraining it everywhere the set gates.

## Task 7 — the three scans AND the routing they demand, as ONE cycle  `[task:scans-and-routing]`

**Files:** `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`, `tests/paneCompaction/fixtures/sendAuth/`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:632` why=`calleeNameOf and the remaining name-resolution sites resolve a name without routing through resolveName and carry no acknowledgement token, so the adoption scan authored here reports every unfulfilled ROUTE obligation and the assert-empty fails on that list (twelve when measured against the prototype, six as shipped)` ac=AC-U16a,AC-U16b,AC-U16c -->

**Scans and routing are ONE task because splitting them makes the cycle impossible**: a scan whose
whole purpose is to report the outstanding obligations (twelve when measured against the prototype, SIX at HEAD — the population moved, because Tasks 2-6 both added name sites and removed others) is red by construction until they are
discharged, so it can never commit green on its own. The ordering the pair existed to protect —
**a guard built after the thing it guards means the thing shipped ungated** — is preserved WITHIN the
task by TDD order: author the scans, observe the red, then route.

Three scans, three different claims, none implying another:

1. **ABSENCE** — no site RE-IMPLEMENTS the rule. Structural, not lexical.
2. **ADOPTION** — every site that RESOLVES A NAME routes or carries one of the three tokens. Its
   detector's accept-set is DERIVED from the TypeScript API surface for materializing a name.
3. **METAMORPHIC** — the detected site SET is identical under rename and reformat, compared under a
   STRUCTURAL identity carrying no identifier spelling. **Cardinality is not the criterion.**

**Each scan is run against a CONSTRUCTED VIOLATION and observed to fail**, one per accepted form
rather than one representative: a detector recognizing only `.text` and `getText()` passes a single
materializer mutant while silently missing `.escapedText`, `getFullText()` and the destructured
`{ text }`.

**DERIVE THE REQUIREMENT, AUTHOR THE WITNESS, ASSERT THE COVERAGE** — the shape that satisfies both
standing rules at once, and the obvious repair violates one of them. Deriving the planted violations
from the same API-surface set the detector uses would trade a weak fixture set for a VACUOUS one:
both sides from one source cannot disagree. So:

1. **Derived** — the REQUIREMENT that every member of the API set needs a planted violation.
2. **Authored** — each violation fixture, by hand, independently.
3. **Asserted** — the derived requirement list against the hand-authored fixture directory.

Two independent sides, so they CAN disagree; the gap is closed without the comparison going vacuous.
**The same shape applies to rule B's scope recognizer** (§3c).


<!-- tasks: end -->

## Task 8 — fixture preservation, as a MEASUREMENT  `[task:corpus-preservation]`

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

**OUTSIDE the red-contract region, deliberately.** Round 3 was right that its earlier marker was a
TEST-ORACLE red: the command failed on the two differences `task:rule-b-count` deliberately creates,
and green came from editing the suite's own baseline — **no production line whose repair makes it
pass**, which is the test-local red the contract forbids. Manufacturing a marker for it would assert
a red rather than observe one. Its acceptance is the plan-time MEASUREMENT the spec requires, run and
pasted in §2c, plus a committed baseline the suite compares against thereafter.

**The population premise ALREADY SHIPS** — `premiseHolds("an enrolled module is among the walked
files", …)` is live in the deciding suite, and it already proves both a non-empty walk and the
enrolment intersection. Round 1's version of this task claimed to author it, which would have been a
red that passes the moment it is written. **Probed, not assumed**: the reviewer pasted the existing
lines back.

So this task's real instrument is the one that does NOT exist: **AC-U7's whole-corpus preservation
check** — every fixture's verdict compared against a baseline captured at BASE, so the two `task:rule-b-count`
moved are the only differences and any third is a regression. That is a value comparison with an
independent witness on each side: a committed baseline against a live scan.

## Task 9 — the score, the derived control, and the killer audit  `[task:score-measure]`

**Files:** `tests/mutation/source/registry.ts`, `tests/paneCompaction/sendAuthScan.ts`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`, `tests/paneCompaction/fixtures/sendAuth/`

**This task is DELIBERATELY OUTSIDE the red-contract region, and that is the honest disposition
rather than a gap.** It is a MEASUREMENT, not a behaviour change, and **no authored red is available
to it**: this exact surface has already scored **1.0000 with an empty survivor set while the target
defect class was live**, precisely because no declared operator could express it. So "the repairs
move every arm" does NOT entail an unaccepted survivor, and inventing a marker that claims one would
be a red asserted rather than observed.

Its acceptance is stated as a MEASUREMENT with a threshold instead: the gate run completes, the score
meets `scoreFloor`, and **the unaccepted-survivor set is EMPTY** — with every survivor resolved by
DELETE, then totalise, then kill with a case, and only then an equivalence argument. Its `Files:`
includes the scanner, the suite and the fixtures **because that is where a survivor is repaired** —
accepting one is forbidden by the empty-survivor criterion, so a registry-only inventory could not
close.

**The measurement runs against the GATE, not the deciding suite** — the deciding suite does not import the
registry, so it can express no verdict about a survivor set. The gate is the only oracle that knows
which mutants survived.

**The exact commands, because a specified mechanic with no command establishes nothing** — round 4
was right that `pnpm mutation:guards` names shards 0-3 and the gates file, so it can never run a
scoped shard 9:

```
# 1. stamp the DERIVED input set BEFORE, inside the same invocation that measures
tsx -e 'import {SEND_AUTH_SURFACES} from "./tests/paneCompaction/sendAuthScan"; …' \
  && git hash-object tests/paneCompaction/sendAuthScan.ts \
                     tests/paneCompaction/_metaSendAuthSingleRead.test.ts \
                     tests/mutation/source/registry.ts \
                     tests/mutation/source/expectedLedgerKinds.ts \
  && find tests/paneCompaction/fixtures -type f | sort | xargs shasum | shasum

# 2. the scoped run itself: BACKGROUNDED, because a foreground Bash call dies at 600s
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm vitest run --project mutation \
  tests/mutation/guardSurfaces.shard9.test.ts

# 3. observe the EXIT STATUS and the survivor list, not merely that it finished
# 4. stamp the same derived set AFTER, and assert both stamps equal
# 5. delete the shard, then prove the deletion load-bearing in BOTH directions:
pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts   # FAILS with shard9 present
rm tests/mutation/guardSurfaces.shard9.test.ts
pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts   # PASSES once removed
git ls-tree -r --name-only HEAD | grep shard                        # across EVERY commit, not ls-files
```

Mechanics, verified rather than recalled: a temp shard **numbered 9**, since the repository's ignore
file covers the scoped-shard scratch glob for shard numbers four through nine ONLY and an uncovered
scratch shard is the incident that turned four required checks red on this arc family; staged by
path; `git ls-tree` across EVERY commit on the branch, since `ls-files` reports only the current
index; run under `pnpm heavy`, **backgrounded**, because a foreground Bash call dies at the
documented 600s cap; **input set stamped DERIVED from the contract, before AND after** — one stamp
catches a stale read, only the PAIR catches an input moving during the run; the shard deleted and the
deletion **proven load-bearing in BOTH directions**.

**The derived control lands here**, not in a task of its own, because this is where its
discrimination is exercised: a control keyed by text is only as good as that text's uniqueness, the
baseline was **1** at `7159c2a4e`, and this arc moves the code it keys on.

**The killer audit is owed ALONGSIDE the score, and it audits ALL NINE rows of §3c** — not "the
two", which was this plan's own miscount and would have let an executor audit any two and silently
leave seven rules unchecked. The count is DERIVED FROM THE TABLE, not restated in prose: the
correction above read "eight" while the table held nine, so a prose count corrected once was still
wrong. Count the rows. Each row is built by hand as the weaker implementation, run against the
corpus, and recorded ABSENT / PRESENT-BUT-UNPROVEN / PROVEN. A killing check never run against the
mutant it targets is a claim, not a proof, and it fails in the direction that looks green.

### Killer audit — RESULT (run 2026-08-21, against the repaired scanner)

All nine rows, each weaker implementation built by hand and run against the corpus:

| row | verdict | killed by |
| --- | --- | --- |
| rule A, unwrap | PROVEN | the four wrapper-kind sinks |
| rule A, element key — RECEIVER | PROVEN | `element-key-wrapped.ts` |
| rule A, element key — SELECTOR | PROVEN | `selector-key-wrapped.ts` (**authored by this audit**) |
| member SELECTOR | PROVEN | the element-access selector trio |
| rule B, scope | PROVEN (structural) | rule B carries no scope enumeration; it is a count |
| rule B, competing | PROVEN | the four annotation-certainty shadows |
| declaration-name | PROVEN | the value-reference-carrying-a-name case |
| adoption detector | PROVEN | the per-form witness case |
| metamorphic check | PROVEN | the cancelling-pair case, one level down (see below) |
| read set | PROVEN | the element-access receiver and private-identifier cases |

**The audit found a real gap and the class sweep widened it from one to four.** Rule A's element
key came back ABSENT. Sweeping the whole unwrap axis — by DISCOVERING every `skipTransparent` call
site from source rather than listing them — found four unpinned sites, not one. Three were
load-bearing and uncovered (wrapped CALLEE, SELECTOR key, COMPUTED declaration key) and now have one
fixture each. The fourth was dead code and was DELETED; restoring it changes nothing, which is the
proof it was dead rather than merely unpinned. The callee fixture then exposed a behavioural defect,
not just a missing test: `classifyMemberOn` asked `outer.parent` for the call while the member
access's parent was the wrapper, so a wrapped callee degraded to `UNCLASSIFIED-USE`. Repaired.

**Two limits recorded rather than manufactured into findings.** The metamorphic row's cardinality
mutant is EQUIVALENT at the reflow assertion: its input is a meaning-preserving reformat, which
cannot produce a cancelling pair, so no reachable input distinguishes set from count there. The
discrimination that matters is proven one level down, where the cancelling transformation is
actually constructible, in both directions. And a harness that restores with `git checkout` requires
a COMMITTED baseline — an uncommitted one is destroyed on the first iteration, after which every
mutant runs against an already-red suite and scores as killed. That happened once here; the sweep
now refuses to start without a clean tree and a green baseline.

**A perfect score does not subsume it, and this surface is the proof.** See spec §4.6: this exact
surface scored **1.0000 with an empty survivor set while the target defect class was live**, because
no declared operator could express it.

## Task 10 — ledger closeout, EARLY, as ONE commit before whole-diff review  `[task:ledger-closeout]`

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`, `docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md`

**OUTSIDE the red-contract region, for the same reason:** a documentation task has no production
surface, so its `red-target` could only name an already-correct gate constant whose failure the task
itself manufactures. **Acceptance:** `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts
tests/docs/_metaLedgerMintBar.test.ts` passes, the set arithmetic below verifies in BOTH directions,
and the marker is absent at HEAD. (AC-U10, AC-U11.)

Absence is GUARANTEED rather than maintained: gone at commit N is gone at every commit after N, and a
ledger commit placed after whole-diff review is unreviewed code riding into the merge.

**The reconciliation sweeps are authored AND RUN here, with their exact commands, their CURRENT
output, and a per-hit disposition. A figure describing a state the work has not reached is labelled
an EXPECTATION and the real current output is pasted beside it** — a premature figure becomes true at
closeout, so it survives every later check and is false only in the window where somebody is reading
the plan — a described sweep is the shape that cost another plan
six consecutive rounds:

```
comm -12 <(grep -oE '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG.md | sort) \
         <(grep -oE '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md | sort)   -> must be EMPTY
grep -c 'Status:\*\* IN PROGRESS' BACKLOG.md BACKLOG-archive.md
  CURRENT OUTPUT, run at authoring time:  BACKLOG.md:1   BACKLOG-archive.md:0
  the 1 is THIS BRANCH's own live marker, which invariant 12 REQUIRES to be there now
  EXPECTATION AT CLOSEOUT (not a measurement):  0 and 0, once this task removes it
grep -rn 'the read arm' BACKLOG.md docs/superpowers/specs/ci/2026-08-19-*   -> 3 hits at BASE, each
                                                                              resolved to ONE function
```

The row's three defects are corrected: the stale summary sentence, the stale "probed silent" claim
for the handoff instance, and the ambiguous "read arm" naming two different functions fifteen lines
apart. The predecessor spec's §4 limit 8 preamble is corrected, since under one of its two readings it
is FALSE. **Re-verify the set arithmetic after every subsequent merge from main.**


---

## 3b. Tautology audit — population DERIVED from the instruments this plan ships

Round 1 found this audit missing five instrument groups, and the restructure then dropped it
entirely — **which is the sweep-population rule landing on the audit itself, twice.** Its population
was the list I had in mind, not the instruments the plan ships. It is now derived from the tasks:
**every assertion any task authors**. Each row answers BOTH questions, and a row that cannot say what
would break it is the next tautology.

- **Q1 — could it fail if the code compiles?**
- **Q2 — can its two sides EVER disagree, and what event would make them?** If no event moves one
  without the other, the check is decoration however rigorous it reads.

| task | instrument | Q1 | Q2 — the event that separates the sides |
| --- | --- | --- | --- |
| `corpus-manifest` | manifest vs fixture DIRECTORY | yes | a cell added to the derivation with no fixture on disk; the filesystem does not know what the constant says |
| `corpus-manifest` | directive census | yes | a syntax-sensitive fixture authored without `// prettier-ignore` |
| `corpus-manifest` | struck-cell coverage | yes | a struck cell with no recorded reason |
| `corpus-manifest` | depth independence | yes | a rule that reads depth at any position; it FAILED before the §3.7 repair |
| `resolve-name` | wrapper set vs `ts.OuterExpressionKinds` | yes | TypeScript adding a wrapper kind, or a hand-typed list drifting from the enum |
| `resolve-name` | wrapper symmetry, BOTH sides of resolution | yes | the receiver side unwrapping a kind the identifier side does not, which is how the sixth decision site was found |
| `resolve-name` | `Receiver` union parity | yes | a member added to the union with no manifest cell — authored HERE because this task creates the union |
| `resolve-name` | static element key resolves | yes | a key spelling the resolver does not read |
| `sites-consume-rule-a` | six-site equality assertions | yes | any consumer answering differently from rule A; each compares a whole finding SET |
| `rule-b-count` | competing-declaration count | yes | an annotation moved between the keyword accept-set and its complement |
| `rule-b-count` | scope-totality witness | yes | a competing declaration in ANY scope, including one no list names; the implementation must contain no scope enumeration at all |
| `rule-b-count` | AC-U5's clean/report attribution pair | yes | the annotation swapped between surface and keyword on ONE fixture, which is what makes the clean verdict attributable rather than "never got here" |
| `rule-b-count` | the two moved expectations | yes | a finding added or removed at either fixture |
| `declaration-name-accept-set` | declaration-name accept-set | yes | a parent kind entering or leaving the set |
| `read-set-member-name` | read set over a quoted member | yes | the member-name position leaving the rule |
| `scans-and-routing` | ABSENCE scan | yes | a second copy of the rule; copies three, four and five all compiled and shipped green |
| `scans-and-routing` | ADOPTION scan | yes | a name-resolution site neither routed nor acknowledged; reported 12 against the prototype, 0 at HEAD once all six routed |
| `scans-and-routing` | METAMORPHIC scan | yes | a spelling dependence anywhere in the detector; it FAILED at 42 to 44 before the repair |
| `scans-and-routing` | per-form planted violations | yes | a detector recognizing a strict subset of the API set |
| `scans-and-routing` | derived API REQUIREMENT vs authored fixture DIRECTORY | yes | a member of the API set with no hand-authored violation on disk — a DIFFERENT event from a detector recognizing a subset, and the two must not share a row |
| `score-measure` | `shadowedBetween` grep returns zero | yes | the symbol surviving the refactor anywhere in the module |
| `score-measure` | no loop's termination rests on a mutable predicate | yes | a totalisation that moves termination into a predicate, which turns an off-by-one mutant into a NON-TERMINATING one and takes the whole measurement down |
| `scans-and-routing` | stale-row check | yes | a disposition row whose site is gone; reports 2 today |
| `scans-and-routing` | ROUTE compliance | yes | a `ROUTE` row whose site is still unrouted; reported 12 against the prototype, 6 at HEAD |
| `scans-and-routing` | `not-a-name` field invalidation | yes | the site repurposed to read a different field |
| `scans-and-routing` | `grammar` validated against DECLARED FIELD TYPES | yes | a field whose type admits a sibling spelling being granted the durable token — three of nine were, and an access-shaped claim is unfalsifiable by construction |
| `scans-and-routing` | `narrowed` syntax carries consequence AND trigger | yes | a `narrowed` row written without either, which is a shrug wearing a token's name |
| `corpus-preservation` | whole-corpus verdict preservation (AC-U7) | yes | any fixture's verdict differing from the committed baseline beyond the two `task:rule-b-count` moves; a committed baseline against a live scan is two independent sides |
| `corpus-preservation` | live scan empty, with its population premise | **already ships** | recorded here NOT as a new instrument but because round 2 caught this task claiming to author it — the premise is live in the suite today, so authoring it would have been a red that passes on write |
| `score-measure` | survivor set vs GATE report | yes | a mutant surviving that the row does not accept — the gate is the oracle, and the deciding suite could not be |
| `score-measure` | input stamps, before and after | yes | any score input moving during the run |
| `score-measure` | shard integrity, both directions | yes | the temp shard present or absent; proven each way |
| `score-measure` | `grep -c -F` control uniqueness | yes | a refactor duplicating the keyed line; it was 1 at BASE and this arc moves that code |
| `score-measure` | killer audit | yes | a weaker implementation no declared operator can express |
| `ledger-closeout` | ledger set arithmetic | yes | a row in both files, or a marker surviving to HEAD |
| `ledger-closeout` | mint-bar fields on the peer row | yes | the row filed after the cutoff without `Facing` / `Incident` |

**The row that had to be rewritten rather than confirmed:** an early manifest case compared a
DERIVATION AGAINST A DERIVATION — axes from the shipped constants on both sides — which fails Q2 by
construction, since a drift moves both sides together. It would have read as the most rigorous cell
in the table. The shipped form puts the fixture directory on one side, because **derivation is right
for a COVER and wrong for BOTH SIDES OF A COMPARISON.**

---

## 3c. Weaker implementations, and the fixture that kills each

Written down per rule, not per instance: for every rule this plan specifies, the strictly weaker
implementation that would satisfy its fixtures, and the case that kills it.

| rule | weaker implementation that passes the naive fixture set | killing case |
| --- | --- | --- |
| rule A, unwrap | unwraps parentheses only | a receiver wrapped in `as`, `<T>`, `!` and `satisfies` — one fixture each, since one representative leaves the other three unexercised |
| rule A, element key | resolves `this["ch"]` but not `this[("ch")]` | a WRAPPED key, which is the same unwrap applied to a second position |
| **member SELECTOR** | unifies RECEIVER resolution while leaving the SELECTOR dot-only — it satisfies every receiver-shaped red in `task:sites-consume-rule-a`, because those attribute their failure to the receiver's identifier restriction | `this["ch"]["dispatch"]()`, which stays **completely silent** under the weaker form, and doubled `ch["panes"]()`, which reports **the BINDING twice** instead of `MULTI-READ:panes`. Both measured on the live tree. **Receiver and selector are two positions, and a killer for one is not a killer for the other** |
| rule B, scope | ANY enumerator, however long — constructor, setter, blocks, `for` initializers, catch bindings — since each named case only extends the list | **the killing check is STRUCTURAL, not another fixture**: the shipped implementation must contain NO scope enumeration at all. A count needs no notion of scope, so "which scopes does it list" has the answer "none". Fixtures alone cannot kill this class — a competing declaration in a `while` body defeats the five-item list, and a six-item list defeats that fixture — which is the enumeration treadmill in miniature |
| rule B, competing | treats any annotation that is not the surface type as non-competing | `any`, `Readonly<Channel>`, `Channel & {}`, paired with a `string` that must stay silent |
| declaration-name | `parent.name === node` minus a two-item denylist | `Object.values({ ch })` and `export { ch }`, which carry a `name` and are references |
| adoption detector | recognizes `.text` and `getText()` only | one planted violation per accepted form: `.escapedText`, `getFullText()`, destructured `{ text }` |
| metamorphic check | compares CARDINALITY | a transformation that removes one site and adds another, which cancels in a count and not in a set |
| read set | identifier member names only | a QUOTED member, whose loss is a complement loss and therefore everywhere |

---

## 3d. Every red, checked against the three ways an authored red fails

Plan round 1 returned three unentailed reds and they were **three different failures**, so each
rebuilt red is checked against all three rather than against a general feeling of validity:

1. **Does it fail on BEHAVIOUR?** Adding an assertion that would pass is not a red — the absence of a
   check is a coverage gap. (Round 1's Task 10: the control line already occurred once, so the new
   assertion passed the moment it was written.)
2. **Is there an ORACLE THAT CAN DIFFER?** (Round 1's Task 11: `accepted` was `[]` and might remain
   `[]`, and its command ran a suite that does not import the registry it edits — no oracle at all,
   and rule 96 twice over. The rebuilt `task:score-measure` runs THE GATE, which is the only thing that knows a
   survivor set.)
3. **Can it fail AT ITS OWN SEQUENCE POSITION?** (Round 1's Task 12: the marker's branch still exists
   on origin, so the ledger suite could only fail after a branch deletion that happens AFTER the task
   removes the marker — a temporal impossibility, red in a future the task itself creates. The
   rebuilt `task:ledger-closeout` reds on the mint-bar suite, which fails the moment the peer row is filed without
   its `Facing` and `Incident` fields, at that task's own position.)

**The `Files:` rule, stated precisely, because round 2 found it violated three times and a vague
version cannot be checked.** `Files:` lists every path the task WRITES — including the fixtures and
suite cases its own red depends on, which is what rounds 1 and 2 both caught it omitting. A
`red-target=` may name a line the task does NOT write, because it names the line whose BEHAVIOUR
produces the red rather than the file being edited; the ledger task's target is the mint-bar suite's
cutoff constant for exactly that reason. **The check, stated once and without a second reading:** for every task, every path the task
WRITES appears in `Files:`. A path the red merely READS — a gate suite the task does not edit — is
NOT required to appear, which is why the ledger task's command runs two `tests/docs/**` suites that
are absent from its inventory. Run mechanically over the plan before every dispatch, never re-read.

**And on the guard-before-the-change constraint:** round 1 showed Tasks 7 and 8 were not merely
ordered but IMPOSSIBLE. The correction is that **a guard is not a separate deliverable — it is the
RED of the change's own cycle.** Two legal shapes exist: ONE TASK (write the guard, observe red,
route, green), or TWO with a SHRINKING ALLOWLIST where the guard ships green against a declared
baseline of known-unfulfilled sites. **`task:scans-and-routing` takes the first**; the allowlist was considered and
declined because the routings (twelve when measured against the prototype, SIX at HEAD — the population moved, because Tasks 2-6 both added name sites and removed others) are one mechanical class and an allowlist would outlive them.

---

## 4. What each RED actually is

Every `why=` above names output the implementation must PRODUCE, never a symbol's absence. **Naming
an absence is not a failing case**: an absent named half returns no named findings, so a substring
assertion over the output passes vacuously.

**Every task INSIDE the red-contract region authors its own failing case** and names the production
line whose defect makes it fail; none claims `red-state=live`. **The four tasks outside it —
`task:corpus-manifest`, `task:corpus-preservation`, `task:score-measure`, `task:ledger-closeout` —
carry NO marker by design and state their acceptance instead**, because none changes production
behaviour and a marker there would assert a red rather than observe one. Round 1's two live claims were both wrong — one was pre-satisfied
by a guarantee an earlier task already made, the other could only fail in a future the task itself
creates — so the restructure carries no live reds at all rather than carrying a doubtful one.

---

## 5. Checklist

- [ ] the six red-contract tasks (`task:resolve-name` through `task:scans-and-routing`), each
      red-then-green on the SAME command, committed per task
- [ ] the four acceptance tasks (`task:corpus-manifest`, `task:corpus-preservation`,
      `task:score-measure`, `task:ledger-closeout`), each meeting its STATED acceptance — they carry
      no marker, and requiring a red of them is what produced three manufactured reds
- [ ] Self-review
- [ ] Adversarial review (cross-model) — plan stage, to APPROVE
- [ ] Execution handoff

**impeccable-gate: N/A — no UI surface.** No file under `app/`, `components/`, `app/globals.css`,
`DESIGN.md` or a Tailwind config is touched.
