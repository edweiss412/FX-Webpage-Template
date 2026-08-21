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
deciding suites and fixtures. So **the score is measured ONCE, in TASK 9, after the last input
edit** — not per task, and never quoted from an earlier run.

The same applies to the `GUARD SURFACE:` line of any diff-stage review brief: a score cited there is
stale from the moment Task 9's inputs move.

**Second ordering constraint:** a guard is not a separate deliverable — **it is the RED of the
change's own cycle**. Plan round 1 showed that splitting the scans from the routing they demand is
not merely an ordering choice but an IMPOSSIBLE cycle: a scan asserting twelve outstanding
obligations is red by construction until they are discharged, so it can never commit green. **Task 7
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
enrolled; its `control` is EDITED by **Task 9**. `paneCompactionCore` is untouched.
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
currently unprotected, which Task 1 fixes by a derived assertion rather than by a shared-file edit.

---

## 2b. Acceptance-criteria inventory

Every `ac=` a task marker names, restated here so it resolves in this plan's own text. Full wording
and proof channel live in spec §6; this is the index, not a second definition.

| id | claim | task |
| --- | --- | --- |
| **AC-U1** | `analyzePassReads` counts a read through a property receiver | 3 |
| **AC-U2** | `analyzeHandoffs` reports a handoff through a property receiver | 3 |
| **AC-U3** | parenthesized receivers classify identically to bare ones at every consumer | 3 |
| **AC-U4** | the derivation exemption is void under a competing double declaration, in every scope kind | 4 |
| **AC-U5** | a declaration provably NOT the surface does not compete, paired one variable away | 4 |
| **AC-U6** | the live corpus scans 0 findings, with its population premise stated executably | 6, 8 |
| **AC-U7** | all 81 pre-existing fixture verdicts preserved except the two named, additively | 8 |
| **AC-U8** | `shadowedBetween` no longer exists, and no loop's termination rests on a mutable predicate | 9 |
| **AC-U9** | the registry control keys on a line occurring exactly once, asserted by the SUITE not a comment | 9 |
| **AC-U10** | the ledger row's three defects corrected; every NARROWED claim resolves to one FUNCTION | 10 |
| **AC-U11** | the predecessor spec's §4 limit 8 preamble no longer carries a claim false under either reading | 10 |
| **AC-U12** | an annotation that could hold the surface COMPETES; a keyword-typed one does not | 4 |
| **AC-U13** | a value reference carrying a `name` classifies as a USE, not a declaration | 5 |
| **AC-U14** | a statically known element-access receiver resolves; a non-literal key stays `opaque` | 2 |
| **AC-U15** | every transparent wrapper the COMPILER defines is skipped, on BOTH sides | 2 |
| **AC-U16a** | ABSENCE — no site re-implements the rule | 1, 7 |
| **AC-U16b** | ADOPTION — every name-resolution site routes or carries one of the three tokens | 1, 7 |
| **AC-U16c** | METAMORPHIC — the detected site SET is identical under rename and reformat | 7 |

**AC-U16a, AC-U16b and AC-U16c are three different claims and none implies another** — absence of
copies, adoption of the shared rule, and independence from spelling.

---

## 3. Tasks

**Every task carries a STABLE SLUG, and the number is presentation only.** An ordinal is a
POSITIONAL name — guaranteed to change on any reorder, and carrying nothing a reader or a linter can
check a reference against. Round 2 found the consequence: the restructure renumbered twelve tasks
into ten and every reference OUTSIDE the rebuilt region still named the old ordinals, reading as
perfectly good sentences. **A renumber is a RENAME.** With slugs it is a formatting change, and the
cross-reference sweep becomes mechanical.

**Restructured after plan round 1.** Four findings were one shape: **tasks whose cycle cannot
complete.** Tasks 2-6 required fixtures their `Files:` denied; Task 7's scan was deliberately red
until Task 8 edited production code, so it could never commit green; Task 4 broke two expectations
Task 9 deferred; and three authored REDs were not entailed. **A task owns every file its own red
needs, and every cycle goes green on its own command before the next task starts.**

<!-- tasks: depth=2 red-contract -->

## Task 1 — the corpus manifest, its axes, and the directive census  `[task:corpus-manifest]`

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`, `tests/paneCompaction/fixtures/sendAuth/`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/_metaSendAuthSingleRead.test.ts:42` why=`the manifest case compares the fixture DIRECTORY read from disk against the cross-product derived from the shipped constants, and the corpus has no fixture for the element-access, wrapper or annotation-certainty cells, so the assertion fails on a VALUE - the missing cell names - not on an unresolved import` ac=AC-U16a,AC-U16b -->

**The manifest is authored INSIDE the deciding suite, not as a separate module.** A new module that
the suite imports turns its own absence into a COLLECTION failure, and a collection failure is not a
red for the asserted reason — it goes green when the test file changes rather than when the
implementation lands. The manifest is data in the suite; its red is a value mismatch.

**Task 1 derives ONLY from constants that exist at its own sequence position** — the six decision
sites, the finding codes, the surface registry, and the receiver spellings the corpus already
contains. **The `Receiver` union and the wrapper enum do not exist yet**, so their parity assertions
are authored by the task that INTRODUCES each constant (Task 2), not here: importing a symbol a later
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

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:632` why=`calleeNameOf and the remaining name-resolution sites resolve a name without routing through resolveName and carry no acknowledgement token, so the adoption scan authored here reports twelve unfulfilled ROUTE obligations and the assert-empty fails on that list` ac=AC-U16a,AC-U16b,AC-U16c -->

**Scans and routing are ONE task because splitting them makes the cycle impossible**: a scan whose
whole purpose is to report twelve outstanding obligations is red by construction until they are
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

## Task 8 — the live-corpus premise, and fixture preservation  `[task:corpus-preservation]`

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/_metaSendAuthSingleRead.test.ts:444` why=`no case compares the whole 81-fixture verdict corpus against a committed baseline, so the preservation case authored here reports the two fixtures Task 4 moved as differences against a baseline captured at BASE and fails on those two records` ac=AC-U7 -->

**The population premise ALREADY SHIPS** — `premiseHolds("an enrolled module is among the walked
files", …)` is live in the deciding suite, and it already proves both a non-empty walk and the
enrolment intersection. Round 1's version of this task claimed to author it, which would have been a
red that passes the moment it is written. **Probed, not assumed**: the reviewer pasted the existing
lines back.

So this task's real instrument is the one that does NOT exist: **AC-U7's whole-corpus preservation
check** — every fixture's verdict compared against a baseline captured at BASE, so the two Task 4
moved are the only differences and any third is a regression. That is a value comparison with an
independent witness on each side: a committed baseline against a live scan.

<!-- tasks: end -->

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

**The RED command is the GATE, not the deciding suite** — the deciding suite does not import the
registry, so it can express no verdict about a survivor set. The gate is the only oracle that knows
which mutants survived.

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

**The killer audit is owed ALONGSIDE the score, and it audits ALL EIGHT rows of §3c** — not "the
two", which was this plan's own miscount and would have let an executor audit any two and silently
leave six rules unchecked. Each row is built by hand as the weaker implementation, run against the
corpus, and recorded ABSENT / PRESENT-BUT-UNPROVEN / PROVEN. A killing check never run against the
mutant it targets is a claim, not a proof, and it fails in the direction that looks green.

**A perfect score does not subsume it, and this surface is the proof.** See spec §4.6: this exact
surface scored **1.0000 with an empty survivor set while the target defect class was live**, because
no declared operator could express it.

<!-- tasks: depth=2 red-contract -->

## Task 10 — ledger closeout, EARLY, as ONE commit before whole-diff review  `[task:ledger-closeout]`

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`, `docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md`

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerMintBar.test.ts:58` why=`the peer row this task files carries a Filed date after the 2026-08-19 mint-bar cutoff, so until it also carries Facing and Incident fields the mint-bar suite fails naming that row, which is a value failure on the row's own fields` ac=AC-U10,AC-U11 -->

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

<!-- tasks: end -->

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
| 1 | manifest vs fixture DIRECTORY | yes | a cell added to the derivation with no fixture on disk; the filesystem does not know what the constant says |
| 1 | directive census | yes | a syntax-sensitive fixture authored without `// prettier-ignore` |
| 1 | struck-cell coverage | yes | a struck cell with no recorded reason |
| 1 | depth independence | yes | a rule that reads depth at any position; it FAILED before the §3.7 repair |
| 2 | wrapper set vs `ts.OuterExpressionKinds` | yes | TypeScript adding a wrapper kind, or a hand-typed list drifting from the enum |
| 2 | wrapper symmetry, BOTH sides of resolution | yes | the receiver side unwrapping a kind the identifier side does not, which is how the sixth decision site was found |
| 2 | `Receiver` union parity | yes | a member added to the union with no manifest cell — authored HERE because this task creates the union |
| 2 | static element key resolves | yes | a key spelling the resolver does not read |
| 3 | six-site equality assertions | yes | any consumer answering differently from rule A; each compares a whole finding SET |
| 4 | competing-declaration count | yes | an annotation moved between the keyword accept-set and its complement |
| 4 | scope-totality witness | yes | a competing declaration in ANY scope, including one no list names; the implementation must contain no scope enumeration at all |
| 4 | AC-U5's clean/report attribution pair | yes | the annotation swapped between surface and keyword on ONE fixture, which is what makes the clean verdict attributable rather than "never got here" |
| 4 | the two moved expectations | yes | a finding added or removed at either fixture |
| 5 | declaration-name accept-set | yes | a parent kind entering or leaving the set |
| 6 | read set over a quoted member | yes | the member-name position leaving the rule |
| 7 | ABSENCE scan | yes | a second copy of the rule; copies three, four and five all compiled and shipped green |
| 7 | ADOPTION scan | yes | a name-resolution site neither routed nor acknowledged; reports 12 today |
| 7 | METAMORPHIC scan | yes | a spelling dependence anywhere in the detector; it FAILED at 42 to 44 before the repair |
| 7 | per-form planted violations | yes | a detector recognizing a strict subset of the API set |
| 7 | stale-row check | yes | a disposition row whose site is gone; reports 2 today |
| 7 | ROUTE compliance | yes | a `ROUTE` row whose site is still unrouted; reports 12 today |
| 7 | `not-a-name` field invalidation | yes | the site repurposed to read a different field |
| 7 | `grammar` validated against DECLARED FIELD TYPES | yes | a field whose type admits a sibling spelling being granted the durable token — three of nine were, and an access-shaped claim is unfalsifiable by construction |
| 7 | `narrowed` syntax carries consequence AND trigger | yes | a `narrowed` row written without either, which is a shrug wearing a token's name |
| 8 | whole-corpus verdict preservation (AC-U7) | yes | any fixture's verdict differing from the committed baseline beyond the two Task 4 moves; a committed baseline against a live scan is two independent sides |
| 8 | live scan empty, with its population premise | **already ships** | recorded here NOT as a new instrument but because round 2 caught this task claiming to author it — the premise is live in the suite today, so authoring it would have been a red that passes on write |
| 9 | survivor set vs GATE report | yes | a mutant surviving that the row does not accept — the gate is the oracle, and the deciding suite could not be |
| 9 | input stamps, before and after | yes | any score input moving during the run |
| 9 | shard integrity, both directions | yes | the temp shard present or absent; proven each way |
| 9 | `grep -c -F` control uniqueness | yes | a refactor duplicating the keyed line; it was 1 at BASE and this arc moves that code |
| 9 | killer audit | yes | a weaker implementation no declared operator can express |
| 10 | ledger set arithmetic | yes | a row in both files, or a marker surviving to HEAD |
| 10 | mint-bar fields on the peer row | yes | the row filed after the cutoff without `Facing` / `Incident` |

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
   and rule 96 twice over. The rebuilt Task 9 runs THE GATE, which is the only thing that knows a
   survivor set.)
3. **Can it fail AT ITS OWN SEQUENCE POSITION?** (Round 1's Task 12: the marker's branch still exists
   on origin, so the ledger suite could only fail after a branch deletion that happens AFTER the task
   removes the marker — a temporal impossibility, red in a future the task itself creates. The
   rebuilt Task 10 reds on the mint-bar suite, which fails the moment the peer row is filed without
   its `Facing` and `Incident` fields, at that task's own position.)

**And on the guard-before-the-change constraint:** round 1 showed Tasks 7 and 8 were not merely
ordered but IMPOSSIBLE. The correction is that **a guard is not a separate deliverable — it is the
RED of the change's own cycle.** Two legal shapes exist: ONE TASK (write the guard, observe red,
route, green), or TWO with a SHRINKING ALLOWLIST where the guard ships green against a declared
baseline of known-unfulfilled sites. **Task 7 takes the first**; the allowlist was considered and
declined because twelve routings are one mechanical class and an allowlist would outlive them.

---

## 4. What each RED actually is

Every `why=` above names output the implementation must PRODUCE, never a symbol's absence. **Naming
an absence is not a failing case**: an absent named half returns no named findings, so a substring
assertion over the output passes vacuously.

**Every task authors its own failing case** and names the production line whose defect makes it
fail; none claims `red-state=live`. Round 1's two live claims were both wrong — one was pre-satisfied
by a guarantee an earlier task already made, the other could only fail in a future the task itself
creates — so the restructure carries no live reds at all rather than carrying a doubtful one.

---

## 5. Checklist

- [ ] Tasks 1-10, each red-then-green on the SAME command, committed per task
- [ ] Self-review
- [ ] Adversarial review (cross-model) — plan stage, to APPROVE
- [ ] Execution handoff

**impeccable-gate: N/A — no UI surface.** No file under `app/`, `components/`, `app/globals.css`,
`DESIGN.md` or a Tailwind config is touched.
