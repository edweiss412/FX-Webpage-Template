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
deciding suites and fixtures. So **the score is measured ONCE, in Task 11, after the last input
edit** — not per task, and never quoted from an earlier run.

The same applies to the `GUARD SURFACE:` line of any diff-stage review brief: a score cited there is
stale from the moment Task 11's inputs move.

**Second ordering constraint:** Tasks 7 and 8 are a pair and cannot be reordered. Task 7 builds the
three scans; Task 8 discharges the obligations they report. Building the scans after the routing
would mean the routing was never gated by anything.

---

## 1. Meta-test inventory

**Creates:** nothing new as a FILE. Three new scans land as cases inside the existing deciding suite
(§5): absence (AC-U16a), adoption (AC-U16b), metamorphic invariance (AC-U16c).

**Extends:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts` and
`tests/paneCompaction/fixtures/sendAuth/`. Two existing expectations change (§3.6), owned by Task 9
rather than edited incidentally.

**Does NOT extend:** `tests/mutation/source/registry.ts` gains no ROW — `sendAuthScan` is already
enrolled; its `control` is EDITED by Task 10. `paneCompactionCore` is untouched.
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
| **AC-U6** | the live corpus scans 0 findings, with its population premise stated executably | 6, 9 |
| **AC-U7** | all 81 pre-existing fixture verdicts preserved except the two named, additively | 9 |
| **AC-U8** | `shadowedBetween` no longer exists, and no loop's termination rests on a mutable predicate | 11 |
| **AC-U9** | the registry control keys on a line occurring exactly once, asserted by the SUITE not a comment | 10 |
| **AC-U10** | the ledger row's three defects corrected; every NARROWED claim resolves to one FUNCTION | 12 |
| **AC-U11** | the predecessor spec's §4 limit 8 preamble no longer carries a claim false under either reading | 12 |
| **AC-U12** | an annotation that could hold the surface COMPETES; a keyword-typed one does not | 4 |
| **AC-U13** | a value reference carrying a `name` classifies as a USE, not a declaration | 5 |
| **AC-U14** | a statically known element-access receiver resolves; a non-literal key stays `opaque` | 2 |
| **AC-U15** | every transparent wrapper the COMPILER defines is skipped, on BOTH sides | 2 |
| **AC-U16a** | ABSENCE — no site re-implements the rule | 1, 7 |
| **AC-U16b** | ADOPTION — every name-resolution site routes or carries one of the three tokens | 1, 7, 8 |
| **AC-U16c** | METAMORPHIC — the detected site SET is identical under rename and reformat | 7 |

**AC-U16a, AC-U16b and AC-U16c are three different claims and none implies another** — absence of
copies, adoption of the shared rule, and independence from spelling.

---

## 3. Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — the corpus manifest, its axes, and the directive census

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`,
a new manifest module beside the fixture corpus (created by this task, so it is
untracked at plan time and is deliberately not cited as a path)

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/_metaSendAuthSingleRead.test.ts:42` why=`the manifest module does not exist, so the case asserting the fixture directory equals the enumerated cross-product reports the directory's 81 entries against an empty expected set and fails on a VALUE` ac=AC-U16a,AC-U16b -->

Ships §2.5 whole, and it ships FIRST because the corpus is what makes a diff-stage round closable.

**Two mechanisms, not one.** Finite-and-read axes are crossed completely, each axis DERIVED from the
shipped constant — binding kind from the `Receiver` union, position from the exported consumer list,
wrapper kind from `ts.OuterExpressionKinds`, exemption state and the depth-factored receiver shapes.
**Never retyped into the manifest:** a retyped axis drifts the moment the constant gains a member and
nothing says it did.

Unbounded axes — paren depth, member-chain depth — get an INDEPENDENCE PROOF over structurally
distinct classes (0, 1, 2, deep), asserting the finding set is IDENTICAL, not that four depths were
tried. **This is the case that found the sixth decision site (§3.7), so it is a first-class suite
case rather than a probe transcript.**

**Struck cells carry their reason in the manifest**, so a later reader meets the argument rather than
an absence.

**The directive census.** Every syntax-sensitive cell is asserted to carry `// prettier-ignore`
immediately above its line, by a walk DERIVED from the manifest. **Not a `.prettierignore` entry:**
that is a shared file and four arcs are merging around each other this batch, and a derived
assertion fails by default for a fixture added without the directive where a directory fence does
not.

**Anti-tautology:** the red is a VALUE assertion — the manifest names cells with no fixture — never
"a symbol is absent". Expect-a-REPORT everywhere it can be: an expect-CLEAN fixture is satisfied by
any implementation that fails to look.

## Task 2 — `resolveName`, and rule A on top of it

**Files:** `tests/paneCompaction/sendAuthScan.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:818` why=`receiverRightmostName sees through parentheses only and returns null for an element access, so the static-element-key fixture this task adds reports an empty findings array where UNDECLARED-PASS is expected` ac=AC-U14,AC-U15 -->

One name resolution for every position (§2.2). It unwraps through `ts.skipOuterExpressions(node,
ts.OuterExpressionKinds.All)` — **asked of the compiler, never enumerated**, and that enum is where
`Satisfies` comes from — and resolves a statically known element key from its literal.

`surfaceReceiverOf` returns the three-way `Receiver`, and **it is the entry point the arms call**;
a type declared and never consumed is decorative, which spec round 2 F4 measured against this
design's own prototype.

**Transparency is symmetric.** Rule A unwraps the receiver EXPRESSION; the identifier side needs the
mirror — walk OUT through every transparent wrapper before asking which branch an identifier reaches,
on the member-receiver, call-argument and spread paths alike.

## Task 3 — the six decision sites consume rule A

**Files:** `tests/paneCompaction/sendAuthScan.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:579` why=`analyzePassReads requires ts.isIdentifier on the receiver and analyzeHandoffs on the argument, so the property-receiver double-read fixture reports no MULTI-READ and the property-receiver handoff fixture reports no RAW-HANDOFF while their bare controls in the same function do report` ac=AC-U1,AC-U2,AC-U3 -->

D1 through D6 (§2.1) each stop answering for themselves. The member SELECTOR is accepted in either
form, so `this["ch"]["dispatch"]()` is a sink and `ch["panes"]()` doubled is a `MULTI-READ` naming
`panes` rather than the binding.

**Every assertion is an EQUALITY over the whole finding set, never a presence check** — a presence
check is satisfied by every superset, and the defect this task removes is a report naming the
BINDING where the member is owed.

## Task 4 — rule B: delete the shadow walk, hold a competing-declaration count

**Files:** `tests/paneCompaction/sendAuthScan.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:994` why=`shadowedBetween enumerates four function-like kinds, so the constructor-scope and set-accessor-scope shadow fixtures report an empty findings array where RAW-HANDOFF is expected, while the arrow-scope control fixture does report` ac=AC-U4,AC-U5,AC-U12 -->

`shadowedBetween` is DELETED (§2.3). A predicate that must enumerate the scopes which can shadow
falls silent — fail-OPEN, into the forbidden direction — on every kind it does not list, and it has
already been measured missing three.

**A COUNT replaces it, and a count cannot be argued with.** The exemption for a name is VOID inside a
pass declaring that name more than once with a COMPETING declaration, and a declaration competes
unless its annotation is a keyword type that cannot hold an object. **The accept-set is the escape;
the complement is DEFAULT-DENIED into the reporting direction** — `any`, `unknown`,
`Readonly<Channel>`, `Channel & {}` and every unlisted form all compete.

AC-U5's pair is one variable apart and is what makes the silent verdict attributable rather than
"never got here".

## Task 5 — the declaration-name accept-set, defaulting to USE

**Files:** `tests/paneCompaction/sendAuthScan.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:491` why=`isDeclarationName enumerates four declaration kinds and misses accessor, method and property-assignment names, so the set-accessor fixture emits a spurious UNCLASSIFIED-USE naming the accessor's own name and the equality assertion fails on that extra record` ac=AC-U13 -->

An accept-set of DECLARING PARENTS whose default is USE.

**The default direction is the design, and it is chosen by which error survives being wrong.** This
is NOT "default-deny" — the two accept-sets in this arc default in OPPOSITE directions. Classifying a
USE as a declaration SKIPS it and the finding is lost forever, silently. Classifying a DECLARATION as
a use REPORTS, and costs a line somebody reads. `ShorthandPropertyAssignment` and `ExportSpecifier`
carry a `name` and are value references; a `parent.name === node` rule alone reads them as
declarations.

## Task 6 — the read set's member name is a position too

**Files:** `tests/paneCompaction/sendAuthScan.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:146` why=`readsFromSourceFile requires ts.isIdentifier on the member name, so readsFor over a surface declaring a QUOTED member returns a read set missing that member and the equality assertion fails on the returned array` ac=AC-U6 -->

`"panes"(): string[]` is ordinary TypeScript and one ordinary edit from the live declaration, and it
was DROPPED from the read set.

**Why a drop from THIS set costs more than from any other: the read set is consumed as a
COMPLEMENT.** A drop from a positively-consumed set costs one false negative at that member; a drop
from a complement costs a false negative **everywhere the set gates**, silently, in the permissive
direction — the member is reclassified "not a read" and rules 2 and 3 stop constraining it entirely.

## Task 7 — the three scans, each proven able to FAIL

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/sendAuthScan.ts:632` why=`twelve name-resolution sites in the module resolve a name without routing through resolveName and carry no acknowledgement token, so the adoption scan reports twelve unfulfilled obligations and the assert-empty fails on that list` ac=AC-U16a,AC-U16b,AC-U16c -->

Three scans, and they are **three genuinely different claims** — this is the task where that
distinction is load-bearing:

1. **ABSENCE** (AC-U16a) — no site RE-IMPLEMENTS the rule. Structural, not lexical: a grep is blind
   to a copy spelled differently, which is how copies three, four and five survived earlier greps.
2. **ADOPTION** (AC-U16b) — every site that RESOLVES A NAME routes through the rule or carries one of
   the three tokens. **Absence does not imply adoption**: every duplicate can be gone while nothing
   calls the replacement. Its detector's accept-set is DERIVED from the TypeScript API surface for
   materializing a name — `text`, `escapedText`, `getText`, `getFullText`, and the destructured form
   — because naming only `.text` left three ordinary equivalents able to evade it.
3. **METAMORPHIC INVARIANCE** (AC-U16c) — the detected site SET is identical under rename and
   reformat, compared under a STRUCTURAL identity carrying no identifier spelling.

   **Comparing SETS requires a stable ELEMENT IDENTITY, and this is where the implementation will
   quietly degrade back into a count.** `28 → 28` is not set equality: one missed site and one
   spurious site CANCEL, the count is identical and the sets are not — a count is a lossy projection
   of a set and the loss is exactly the information the criterion needs. The identity is the AST
   child-index path plus the materializer name, proven identical across a rename. **Reordering
   independent declarations is DECLARED OUT of the invariant**, because a child-index path is not
   stable under reorder and no transformation-stable identity is claimed for it — stating that is the
   honest half of the criterion.

**Each is run against a CONSTRUCTED VIOLATION and observed to fail**, because a guard whose premise
is false where it runs passes unconditionally and would forever. The violations: a hand-written
second copy of the rule; a site switched to `getText()`; a site whose disposition row is removed.

## Task 8 — route the twelve, and write the acknowledgements

**Files:** `tests/paneCompaction/sendAuthScan.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=live why=`Task 7's adoption scan is live and reports twelve unfulfilled ROUTE obligations plus the undisposed sites, so the suite fails until each site either routes or carries a token` ac=AC-U16b -->

**ALL TWELVE route in this PR.** The class-sweep disposition default is that every instance of one
shape is repaired in the same commit, and "same defect, different site" is precisely the case that
default covers. A deferral of any of the twelve needs exception (a), (b) or (c) named on a ledger
row; twelve mechanical routings through one function should not need one.

The acknowledgements use the three tokens of §2.5, and **a `narrowed` row without its consequence and
its re-file trigger is a shrug wearing a token's name** — §3.14's table carries all three.

## Task 9 — the live-corpus premise, and the two moved fixtures

**Files:** `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/paneCompaction/_metaSendAuthSingleRead.test.ts:444` why=`the two shadow fixtures gain one additive RAW-HANDOFF naming inner, so their existing equality assertions fail on the extra record until the expectations are updated in the same commit that states why the record is correct` ac=AC-U7 -->

The live scan asserts empty **with its premise stated executably**: the walk visited a non-zero file
count (576 at BASE) and the enrolled module was among them. `0 of 0` and `0 of N` render identically
and mean opposite things.

**The two moved fixtures are owned here, not edited incidentally.** `shadowed-param-handoff.ts` and
`same-pass-shadowed-derivation.ts` each gain exactly one ADDITIVE `RAW-HANDOFF` naming `inner` at
their closing `return inner(snap);`. Both already report, so neither goes silent-to-noisy, and both
declare `snap` twice with competing surface-typed declarations, so every use of `snap` in that pass
is RAW by §2.3 — including the one a human resolves to the derivation. **A silently updated
expectation is indistinguishable from a regression somebody accommodated**, which is why the update
lands with its reason.

## Task 10 — the registry control, derived rather than claimed

**Files:** `tests/mutation/source/registry.ts`, `tests/paneCompaction/_metaSendAuthSingleRead.test.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:2712` why=`the sendAuthScan row's control keys on a source line whose uniqueness is asserted only in a comment, so the case asserting that line occurs exactly once in the shipped source has nothing to read it from and fails on the absent derivation` ac=AC-U9 -->

The row's comment reads *"Verified unique on the current source (`grep -c -F` = 1)"*. **True when
written, and this arc moves the code it keys on.** Baseline recorded BEFORE any consolidation
existed, because it becomes unrecoverable afterwards: **1**, at `7159c2a4e`, source blob
`412cadd3dd4c21513c5cbee6c514f033b7cdb859`.

Two obligations: re-verify `grep -c -F` = 1 after every refactor commit that touches the file, and
**replace the prose claim with a suite-asserted one** — a comment cannot fail.

## Task 11 — the score, ONCE, after the last input edit

**Files:** `tests/mutation/source/registry.ts`

<!-- task: red=`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:2719` why=`the accepted-survivor set recorded in the row is the one from the predecessor arc's measurement, so the case asserting the row's accepted list matches this arc's measured survivor set fails on the stale list` ac=AC-U8 -->

Mechanics, verified rather than recalled:

- Temp shard **numbered 9**, NOT one named `shardTMP` — the repository's ignore file already covers the scoped-shard scratch glob for shard
  numbers four through nine ONLY, and an uncovered scratch shard is the incident that turned
  four required checks red on this very arc family. Stage by path; `git ls-files | grep shard` before
  every push; verify with `git ls-tree` across EVERY commit on the branch, since `ls-files` reports
  only the current index.
- Run under `pnpm heavy`, **backgrounded** — a foreground Bash call dies at the documented 600s cap.
- **Stamp the input set DERIVED from the contract, before AND after**: source, registry row and
  `expectedLedgerKinds` (the operators and the floor), suite paths read OUT of the registry row,
  fixtures expanded by the same command that stamps them. One stamp catches a stale read; only the
  PAIR catches an input moving during the run.
- Delete the shard and **prove the deletion load-bearing** by running `_metaSourceShardIntegrity`
  BOTH ways — it fails with the file present and passes once removed.
- **The killer audit is owed ALONGSIDE the score, not subsumed by it.** A perfect score covers what
  the declared operators can express; a hand-built weaker implementation covers what they cannot.
  Neither dominates.
- Any survivor: **DELETE the site, else totalise, else kill with a case, and only then argue
  equivalence** — and a totalisation must not move termination into a mutable predicate, which turns
  an off-by-one mutant into a non-terminating one and takes the whole measurement down.

## Task 12 — ledger closeout, EARLY, as ONE commit before whole-diff review

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`,
`docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md`

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=live why=`the branch's IN PROGRESS marker is still on the row, and the meta-test requires an in-progress entry to carry a resolvable Branch that exists on origin, so the suite fails once the branch is deleted at merge and passes only when the marker is removed here` ac=AC-U10,AC-U11 -->

Absence is then GUARANTEED rather than maintained: gone at commit N is gone at every commit after N.
A ledger commit placed after whole-diff review is unreviewed code riding into the merge.

The whole change, in one commit: the graduating row archived; **its three defects corrected** — the
stale summary sentence, the stale "probed silent" claim for the handoff instance, and the ambiguous
"read arm" that names two different functions fifteen lines apart; the predecessor spec's §4 limit 8
preamble corrected, since under one of its two readings it is FALSE; the peer row of §4.2 filed with
`**Facing:** process` and an `**Incident:**`, because the mint-bar cutoff is 2026-08-19 and this row
is filed after it; and the IN PROGRESS marker removed.

**Verify by SET ARITHMETIC in both directions** — union of `BL-`/`DEF-` ids exact, `comm -12`
archived-versus-open EMPTY, in-progress marker count zero — and **re-verify after every subsequent
merge from main**, since a later merge can reintroduce a row or a marker.

<!-- tasks: end -->

---

## 3b. Tautology audit — run over every instrument this plan ships

For each runtime assertion: **which of these could still fail if the code compiles?** Those that
could not are tautologies. Run before dispatch, on the plan's own instruments.

| assertion | can it fail on compiling code? | what makes it discriminate |
| --- | --- | --- |
| ABSENCE — no site re-implements the rule | **yes** | a duplicate compiles fine; three, four and five all did, and all shipped green |
| ADOPTION — every site routes or is acknowledged | **yes** | reports 12 unfulfilled obligations on the current design |
| METAMORPHIC — site set identical under rename | **yes** | it FAILED before the repair (42 to 44 under a rename); it is the check that caught the spelling dependence |
| detector accept-set covers `getText()` | **yes** | proven at the reviewer's own position: widened gives 30 / 4 and names the site, `.text`-only gives 28 / 2 and is blind |
| manifest equals the fixture DIRECTORY | **yes** | one side is read from DISK and the other is derived from the shipped constants, so they are independent sources |
| live corpus scans empty | **yes** | it is `0 of 576`, and the premise asserts the 576 so an empty walk cannot masquerade as a clean one |
| `grep -c -F` on the control line = 1 | **yes** | it was 1 at BASE and this arc moves that code |
| the two moved fixtures' equality expectations | **yes** | they compare whole finding SETS by equality, so an extra or missing record fails |

**The one that needed rewriting rather than confirming:** an early form of the manifest case compared
a derivation against a derivation — axes derived from the shipped constants on BOTH sides — which is
vacuous by construction, since a drift in the constant moves both sides together. **The shipped form
compares the fixture DIRECTORY ON DISK against the derivation**, which is the only pairing where the
two sides can disagree.

---

## 4. What each RED actually is

Every `why=` above names output the implementation must PRODUCE, never a symbol's absence. **Naming
an absence is not a failing case**: an absent named half returns no named findings, so a substring
assertion over the output passes vacuously.

Tasks 8 and 12 carry `red-state=live` because their failing condition exists on the tree at plan
time — Task 8's after Task 7 lands, Task 12's on the marker this branch already pushed. Every other
task authors its own failing case, and names the production line whose defect makes it fail.

---

## 5. Checklist

- [ ] Tasks 1-12, each red-then-green on the SAME command, committed per task
- [ ] Self-review
- [ ] Adversarial review (cross-model) — plan stage, to APPROVE
- [ ] Execution handoff

**impeccable-gate: N/A — no UI surface.** No file under `app/`, `components/`, `app/globals.css`,
`DESIGN.md` or a Tailwind config is touched.
