# Plan: the nav badge counts announce their first arrival

Spec: `docs/superpowers/specs/2026-08-31-nav-badge-arrival-announce-design.md`.
Row: `DEFERRED.md` › `NAV-BADGE-ARRIVAL-ANNOUNCE-1`. Branch
`feat/nav-badge-arrival-announce`.

## Global constraints

- Invariant 1, TDD per task: every task is red then green on the SAME command.
- Invariant 6, one commit per task, conventional style, scope `admin`.
- Invariant 8, UI quality gate: `components/admin/nav/**` is a UI surface, so
  the invariant-8 dual gate (both halves of the v3 pair) runs before the
  whole-diff review, and the CLOSEOUT commit carries the `impeccable-gate:`
  marker line with the values that run reported. See Task 5.
- Invariant 12: the IN PROGRESS marker comes off in the PR's LAST commit, in the
  same commit that archives the row.
- No new `BL-`/`DEF-` row of any facing. Peers are repaired in-branch or
  reported in the PR body under "Unfixed peers".
- Invariants 2, 3, 4, 9, 10 are N/A: no DB mutation, no advisory lock, no email
  boundary, no sync cursor, no Supabase client call, no route handler, no server
  action. Invariant 5 is satisfied by spec §3.5, which mints no code.

## Pre-draft verification record

Run at authoring time against this branch's head. Commands and their answers,
not a description of checks to perform later.

| Claim | Command | Answer |
|---|---|---|
| A new suite under `tests/components/admin/nav/` needs no testMatch or workflow wiring | `grep -n 'tests/components' vitest.projects.ts` | `vitest.projects.ts:105` — `"tests/components/**/*.test.{ts,tsx}"` is already in `PARALLEL_TEST_GLOBS` |
| `useBellBadge` never commits `null` to `count` | `grep -n 'setCount(' components/admin/nav/useBellBadge.ts` | three sites, `components/admin/nav/useBellBadge.ts:111` (`body.count`, guarded by a `typeof === "number"` check at `components/admin/nav/useBellBadge.ts:107`), `components/admin/nav/useBellBadge.ts:143` (`0`), `components/admin/nav/useBellBadge.ts:169` (`value.count`, inside the `kind === "ok"` branch). None nullable |
| `useNeedsAttentionBadge` HAS nulling commit sites | `grep -n 'setCount(' components/admin/nav/useNeedsAttentionBadge.ts` | `components/admin/nav/useNeedsAttentionBadge.ts:65` takes `next: number \| null`, reached with `null` from `components/admin/nav/useNeedsAttentionBadge.ts:114`; `components/admin/nav/useNeedsAttentionBadge.ts:88` commits `null` directly. Two, not one. This is why the attention half reads settlement from the promise |
| `tests/components/notifBell.test.tsx` mocks the hook under test | `grep -n 'vi.mock' tests/components/notifBell.test.tsx` | `tests/components/notifBell.test.tsx:25` mocks `@/components/admin/nav/useBellBadge`. The new NotifBell suite must NOT live in this file |
| A real-hook, real-promise precedent exists | head of `tests/components/admin/nav/navPromiseSeamStreaming.test.tsx` | `tests/components/admin/nav/navPromiseSeamStreaming.test.tsx:102-109` renders `AdminNav` with real hooks, `fetch` stubbed to a never-resolving promise |
| The layout's region testId | `sed -n '205p' app/admin/layout.tsx` | `<AdminAnnounceProvider testId="admin-undo-status" label="Status updates">` |
| `announce` is referentially stable | `components/admin/AdminAnnounceProvider.tsx:52`, `components/admin/announceLog.tsx:88` and `components/admin/announceLog.tsx:106` | memoised context value over a `useCallback` keyed only on `ttlMs`. Safe in an effect's deps |
| `premise` helper API | `grep -n '^export' tests/_shared/premise.ts` | `premise(description, actual, mustExceed)` at `tests/_shared/premise.ts:26`, `premiseHolds(description, condition)` at `tests/_shared/premise.ts:36` |
| Comment-stripping helper | `grep -n '^export' tests/_shared/stripComments.ts` | `stripCommentsForFile(src, filePath)` at `tests/_shared/stripComments.ts:215` |
| No enrolled mutation surface | `grep -n sourcePath tests/mutation/source/registry.ts` | no path under `components/admin/nav/`. **No surface is scored this arc** |

## Meta-test inventory

**Creates:** none. Task 4 EXTENDS the existing
`tests/components/_metaLiveRegionMounting.test.ts` and adds one assertion to the
Task 3 suite; it creates no meta-test file. An earlier draft of this plan named
a `_metaNavArrivalReport.test.ts (removed)` that no task builds, and that name is removed
everywhere rather than left as a file nobody creates.

**Extends:** one, `tests/components/_metaLiveRegionMounting.test.ts` (Task 4:
the detector widens to `role="log"`, plus the independent AC-10 source scan).
"Creates none" above is about NEW meta-test files; this is an extension of an
existing one.

**N/A, each with its reason:** `tests/auth/_metaInfraContract.test.ts` (no
Supabase call boundary added); `tests/log/_metaMutationSurfaceObservability.test.ts`
(no mutating route handler, no `"use server"` action);
`tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*`);
`tests/messages/_metaAdminAlertCatalog.test.ts` (no `admin_alerts` code).
`tests/components/_metaLiveRegionMounting.test.ts` already walks `components/`
and covers this surface by default; it stays green because no `role="log"`,
`role="status"` or `aria-live` attribute is added anywhere, and the announcement
rides `UndoAnnounceContext`. `tests/styles/_metaUndoAnnounceProvider.test.ts`
A1/A2/A3 are unaffected: no `<AdminAnnounceProvider>` is added or moved.

## File structure

| File | Change |
|---|---|
| `components/admin/nav/navArrivalAnnounce.ts (new)` | NEW. `navBadgeArrivalAnnouncement(bell, attention)` and the two sentence builders |
| `components/admin/nav/NotifBell.tsx` | one optional prop `onBellState`, reporting `{settled, announceable}` on every change of that tuple, and an `aria-label` derived from `bellAccessibleName` |
| `components/admin/nav/AdminNav.tsx` | the join: two settle slots, one effect, one `useContext(UndoAnnounceContext)` |
| `tests/components/admin/nav/navArrivalAnnounce.test.ts (new)` | NEW, Task 1 |
| `tests/components/admin/nav/notifBellFirstSettled.test.tsx (new)` | NEW, Task 2 |
| `tests/components/admin/nav/navArrivalAnnounceIntegration.test.tsx (new)` | NEW, Task 3 |
| `tests/components/_metaLiveRegionMounting.test.ts` | Task 4: the detector widens to `role="log"`, and a separate source assertion covers AC-10 |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | Task 5: the row id joins the `GRADUATED` registry |
| `DEFERRED.md`, `DEFERRED-archive.md` | Task 5: the row graduates and its IN PROGRESS marker comes off |
| `docs/superpowers/plans/2026-08-31-nav-badge-arrival-announce.md` | Task 5 writes this plan's own §12 closeout and its `impeccable-gate:` marker line |
| `docs/superpowers/specs/2026-08-31-nav-badge-arrival-announce-design.md` | already repaired across spec rounds 1 to 4, in `f76848175`, `adc7057ca`, `1df419636` and `d54b5b8b7`. NO task in this plan edits the spec; an earlier draft called this "Task 0" and no such task exists |

## Spec rounds 1 to 4, answered before this plan was dispatched

Round 1 returned NEEDS-ATTENTION with three findings. All three were confirmed
against the live tree, none disputed, and all are repaired in `f76848175`, so
this plan is written against a corrected document rather than carrying the
repairs as tasks.

| Finding | Disposition |
|---|---|
| The bell's report was frozen at settle time, so `zeroNow` after settling made it false | §3.2 rewritten: settlement LATCHES, the value is read LIVE at announce time, and it comes from `bellAnnounceableCount`, which returns `null` under `degraded` |
| `.catch` claimed to make both promises settle | Restated as non-rejection; the pending case points at §6 limit 2 |
| The `setCount` census could not derive its class | Guard DELETED. `bellAccessibleName` is defined on `bellAnnounceableCount`, so the drift is unrepresentable |
| `_metaLiveRegionMounting` does not recognize `role="log"`, so R5 and AC-10 cited a protection it does not give | Citation corrected; the widening lands here as Task 4 |

Three criteria were added by that commit: AC-13, AC-14, AC-15.

Rounds 2 to 4 ran after this plan's body was drafted, and the plan was
reconciled against them before dispatch. None changed the design; each corrected
what the spec SAID about it. Six criteria were added, AC-16 through AC-19 plus
the widened AC-8 and the reworded AC-11, and every one is carried into the task
tables above rather than left to the coverage map.

| Round | Finding | Disposition, and what it cost this plan |
|---|---|---|
| R2 | `zeroNow` suppression was described as permanent; two live routes restore the count (`useBellBadge.ts:205-210` to `useBellBadge.ts:111`, and `onOpened={refetch}` at `NotifBell.tsx:112`), and `degraded` clears at `useBellBadge.ts:112` | Spec §3.8 and AC-11 restated at announce time; AC-16 and AC-17 added. Task 2 gains the restoration and degraded-clears reports, Task 3 gains both orderings |
| R3 | AC-8 announces the true count while both pills cap at `9+`, which contradicted the bound as then worded | Spec §3.3 now names the referent invariant once. AC-8 ranges over BOTH halves, so Task 1 gains `(null, 12)`; the bell-only case was passing vacuously for the attention side |
| R4 | Settlement had contradictory rules; the §3.11 closure claim was wider than the construction; the referent invariant was stated as total; limit 4 was factually wrong about React StrictMode | Spec §3.2 scopes the promise to the attention failure path only; §3.11 states its two remaining representable instances; limit 7 added; limit 4 corrected against React 19.2.4. AC-18 pins the attention label against the sentence, AC-19 pins StrictMode to one entry |

**One defect in this plan's own draft, found while reconciling.** The drafted
Task 2 asserted that `onBellState` is "called exactly once" and named a missing
ref guard as the failure it caught. That is the R1 defect wearing a test: spec
§3.2 and the §3.6 prop table both say the report is NOT once-only, because a
frozen report goes stale. Implemented as drafted, the parent would hold a stale
pair and AC-16 and AC-17 would be unsatisfiable. The case now asserts the
opposite, and the suite states plainly that reporting is continuous while
ANNOUNCING is once, since conflating those two latches is what produced the
error.

## Acceptance criteria

Declared in spec §7, AC-1 through AC-19. This plan declares exactly ONE of its
own, AC-20 in Task 3, for the transition audit the spec has no criterion for.
An earlier revision said the plan declared none, which stopped being true when
the audit landed. The
coverage map at the end is the plan-side record. The map is a table, and a table
row is not a declaration under the recognizer, which reads a list item or ATX
heading whose content BEGINS with the id.

<!-- tasks: depth=3 red-contract -->

### Task 1: the shared selectors and the copy builder

<!-- task: red=`pnpm vitest run tests/components/admin/nav/navArrivalAnnounce.test.ts` red-state=authored red-target=`components/admin/nav/navArrivalAnnounce.ts:40` why=`the module ships first as an unconditional joiner with no zero/NaN/negative filter, with HARDCODED PLURAL nouns, and with bellAnnounceableCount ignoring its degraded argument, so the guard cases, the singular cases, the cross-wiring cases, the non-integer case and the degraded selector case all fail; measured 15 failed 4 passed, the four being (3,2), both positive bellAnnounceableCount rows and bellAccessibleName(12,false)` ac=AC-2,AC-3,AC-7,AC-8,AC-13,AC-17 -->

**What is red and why.** The module lands in the RED step as an unconditional
joiner with hardcoded plural nouns: it builds both sentences from whatever it is
handed. The cases that PASS against that scaffold are FOUR, observed rather than
predicted when the scaffold was run: `(3, 2)`; the two positive selector rows
`bellAnnounceableCount(4, false)` and `bellAnnounceableCount(2.5, false)`,
because a selector that merely ignores its `degraded` argument still returns a
positive count unchanged; and `bellAccessibleName(12, false)`, because the
scaffold's hardcoded `Notifications: ${n} unseen` happens to be right at a
positive count. Round 2 caught an earlier revision claiming only `(3, 2)`
passed, round 4 caught the revision that claimed three, and this is the measured
answer: 15 failed, 4 passed. The guard cases (`0`, `null`, `NaN`,
negative, `Infinity`, both-empty) fail, because a zero is spoken as
`"0 unseen notifications."` and a `null` throws or renders `"null"`; the `(1, 1)`
case fails on the hardcoded plural; the non-integer case fails if the scaffold
reaches for `Number.isInteger`; and the `bellAnnounceableCount` degraded case
fails because the scaffold ignores that argument. The GREEN step adds the
`Number.isFinite(n) && n > 0` filter, the per-half singular/plural choice, the
`null` return for the empty case, and the degraded arm. Same command both times,
and the red discriminates each BEHAVIOR rather than the file's existence.

The plural hardcoding is deliberate and load-bearing: a scaffold that already
pluralized correctly would leave AC-7 with no case that can fail before the
implementation, which is a coverage claim the map could not support.

This shape is chosen over the "module absent, import unresolvable" red that
`docs/superpowers/plans/2026-08-30-pill-size-draft-restored-note.md:190` uses,
because `docs/agents/writing-plans.md`'s RED-validity rule rejects a red that
derives from an unresolved import: it goes green when the test file changes
rather than when the implementation lands.

Cases, each with the concrete failure mode it catches:

| Case | Expected | Catches |
|---|---|---|
| `(3, 2)` | `"3 unseen notifications. 2 items need attention."` | wrong order, wrong join, a missing half |
| `(1, 1)` | `"1 unseen notification. 1 item needs attention."` | a plural-only implementation |
| `(1, 2)` | `"1 unseen notification. 2 items need attention."` | each half choosing its noun from the OTHER argument. Round 4 probed the cross-wired mutant against the then-current table and all 12 builder cases passed, because `(1,1)` and `(3,2)` agree under cross-wiring |
| `(3, 1)` | `"3 unseen notifications. 1 item needs attention."` | the same mutant in the other direction, so neither half can borrow the other's grammar |
| `(3, 0)` | `"3 unseen notifications."` | a zero leaking into the sentence (R3) |
| `(0, 2)` | `"2 items need attention."` | same, other half |
| `(0, 0)` | `null` | announcing an empty or whitespace sentence |
| `(2.5, null)` | `"2.5 unseen notifications."` | `Number.isInteger(n) && n > 0` substituted for `Number.isFinite`, which passes every other positive case here and violates the total contract at spec §3.6. Neither loader can produce a fraction; the function is specified total, so the case pins totality |
| `(null, null)` | `null` | pending read as zero |
| `(NaN, 2)` | `"2 items need attention."` | `Number.isFinite` omitted |
| `(-1, 2)` | `"2 items need attention."` | `> 0` written as `>= 0` |
| `(Infinity, 2)` | `"2 items need attention."` | `Number.isFinite` omitted |
| `(12, null)` | `"12 unseen notifications."` | the `9+` display cap leaking into speech, bell half (AC-8) |
| `(null, 12)` | `"12 items need attention."` | the same cap on the ATTENTION half. R3 made AC-8 range over both, and only this case pins the second |
| `bellAnnounceableCount(4, true)` | `null` | a retained count spoken while the degraded branch displays no number (AC-13) |
| `bellAnnounceableCount(4, false)` | `4` | a selector that returns `null` unconditionally, which would pass every other degraded case vacuously |
| `bellAnnounceableCount(2.5, false)` | `2.5` | the same integer-only mutant on the selector rather than the builder (spec §3.6's `count` finite and above zero row) |
| `bellAccessibleName(12, false)` | `"Notifications: 12 unseen"` | the BELL label dropping to `9+` at a capped count. Not AC-18, which is specifically the ATTENTION link name against the attention sentence (spec AC-18); this row is the bell analogue and belongs to AC-8 |
| `bellAccessibleName(0, false)` | `"Notifications"` | a name that interpolates a zero |

**Expected strings are literals, deliberately.** Deriving them from the case's
own numbers would mean the test reimplementing the function, which is the
tautology the anti-tautology rule forbids. The copy IS the contract here, so a
literal is the assertion.

**Four mutants, run against the GREEN suite as Task 1's exit condition, not
before dispatch.** An earlier draft of this plan claimed they had already run
and that their results were recorded in the plan's commit. They had not: at plan
time neither the module nor its suite exists, so there was nothing to mutate.
The claim is withdrawn and restated as the obligation it should have been. Task 1
is not complete until each of these is applied to the GREEN module, observed to
turn the suite red, and reverted, with the four results recorded in Task 1's own
commit message: (a) the return value emptied; (b) the sentence plus an appended
suffix; (c) the sentence present but behind a `false` condition; (d) each of the
two parameters varied in turn. A mutant that does NOT turn the suite red is a
finding against the suite and is repaired before the task closes.

### Task 2: NotifBell reports its first definite answer

<!-- task: red=`pnpm vitest run tests/components/admin/nav/notifBellFirstSettled.test.tsx` red-state=authored red-target=`components/admin/nav/NotifBell.tsx:25` why=`NotifBell accepts no onBellState prop, so every case that expects a report observes none, and its aria-label is still the inline ternary rather than bellAccessibleName. The prop-absent case is the exception and is a non-red regression pin, disclosed in this task` ac=AC-9,AC-11,AC-13,AC-16,AC-17 -->

New suite, NOT an addition to `tests/components/notifBell.test.tsx`, because
that file mocks `useBellBadge` at `tests/components/notifBell.test.tsx:25` and a mocked hook cannot exercise the
settle predicate. This suite drives the REAL hook, with `fetch` stubbed to a
never-resolving promise so only the seam under test moves.

**Every case counts the mount report.** The effect fires on every change of the
tuple, and the tuple's first value is `{settled:false, announceable:null}` on
mount, so a case whose inputs begin UNSETTLED sees that report first and the
counts below include it. Round 2 caught these counts omitting it, which would
have directed an implementation to suppress unsettled reports while the same
task said it reports every change. Cases whose inputs begin SETTLED (a
synchronous `initialCount`, or neither input supplied) never hold an unsettled
tuple and so report once.

| Case | Expects | Catches |
|---|---|---|
| `countPromise` resolves `{kind:"ok",count:4}` | TWO reports: `{false,null}` on mount, then `{true,4}` | the callback never wired |
| resolves `{kind:"infra_error"}`, no initial | TWO reports: `{false,null}`, then `{true,null}`. The pair repeats its VALUE while `settled` flips, so a suite comparing only the announceable half would see no change and miss the latch | a failed read stalling the join forever |
| neither `initialCount` nor `countPromise` | ONE report, `{true,null}`: nothing will ever arrive, so the half is settled from the first render and no unsettled tuple exists | the "nothing will ever arrive" case stalling the join |
| `initialCount` `{kind:"ok",count:2}`, no promise | ONE report, `{true,2}`: settled from the first render | a synchronous count treated as pending |
| resolves 4, then a pathname change refetches to `7` | THREE reports, `{false,null}`, `{true,4}`, `{true,7}` | a once-only report, which is the R1 defect exactly: the parent then holds a frozen pair and announces a count the badge has moved off. Spec §3.6 prop table: "Not once-only" |
| resolves 4, panel opened (`zeroNow` commits 0), the panel's `onOpened` refetch commits 2 | FOUR reports, `{false,null}`, `{true,4}`, `{true,null}`, `{true,2}`; the LAST pair is `{settled:true, announceable:2}` | a report that stops after the first settle, which would leave AC-16 unsatisfiable from the parent. Named as the ONOPENED route, not the demoted-seed one: a seed that already resolved cannot also demote, so the row as first written described a mechanism its own ordering excluded. The demoted-seed route is Task 3's, where the seed is still in flight when the panel opens |
| resolves `{kind:"infra_error"}` (degraded), then a later fetch succeeds with 5 | THREE reports, `{false,null}`, `{true,null}` under degraded, `{true,5}` when `degraded` clears | a degraded latch, which would silence AC-17 forever (`useBellBadge.ts:112`) |
| panel opened before the promise resolves | TWO reports, `{false,null}` then `{true,null}`. `zeroNow` commits 0 and `bellAnnounceableCount(0,false)` is `null`, so the ANNOUNCEABLE value is `null`, never the number `0` | reporting the raw count instead of the selector output, which would announce "0 unseen notifications" |
| prop absent | no throw; every existing NotifBell behavior holds (AC-9) | a required-prop regression on the four existing call sites |
| count 12, not degraded, rendering the REAL `NotifBell` | its `aria-label` equals `bellAccessibleName(12, false)`, compared by CALLING the imported selector rather than by a literal | the label and the selector disagreeing at a capped count, in either direction |
| count 0, not degraded | `aria-label` equals `bellAccessibleName(0, false)`, i.e. `"Notifications"` | the same on the other arm |
| count 4, degraded | `aria-label` is the degraded branch's name, NOT `bellAccessibleName`'s output | over-applying the selector to a branch spec §3.3 excludes (`components/admin/nav/NotifBell.tsx:56-74`) |
| SOURCE: `components/admin/nav/NotifBell.tsx` after comment-stripping | it imports `bellAccessibleName` and its `aria-label` expression references that identifier; no `Notifications: ${` template literal remains in the file | the refactor being skipped entirely, which no behavioural case can catch (see below) |

**Why one of those cases is a SOURCE assertion, stated rather than smuggled.**
Round 3 asked for a case forcing the `bellAccessibleName` refactor, and round 4
proved the case I wrote does not force it. The inline ternary at
`components/admin/nav/NotifBell.tsx:79-81` ALREADY returns exactly what the
selector is specified to return, verified by that round's probe:

```text
count=12 inline="Notifications: 12 unseen" selector="Notifications: 12 unseen" equal=true
count=0  inline="Notifications"           selector="Notifications"            equal=true
```

That is not a gap in the test, it is the nature of the property. The refactor is
BEHAVIOUR-PRESERVING by construction: §3.3's whole claim is that the label and
the sentence are two callers of one decision, and two implementations that agree
today are exactly what it removes. No behavioural assertion can distinguish them,
because there is nothing behavioural to distinguish. So the property is asserted
where it lives, in the source, and the three behavioural rows above stay because
they pin the AGREEMENT the structure is supposed to guarantee.

Its red is real and is implementation-driven, unlike AC-10's: today `NotifBell`
does not import `bellAccessibleName` at all, and the file does contain the
template literal the assertion forbids. Task 2's implementation is what makes
both halves true. The assertion is scoped to the one file and reads it through
`stripCommentsForFile` (`tests/_shared/stripComments.ts:215`), so a comment
quoting the old label cannot green or red it.

**Reporting is continuous; ANNOUNCING is once.** These are different latches
and the pre-staged draft of this plan conflated them, asserting a once-only
report. `onBellState` fires on every change of the tuple so the parent's ref
stays current (spec §3.2, §3.6). The once-per-mount property belongs to the
announce effect and is Task 3's AC-6, not this suite's. A suite that pins a
once-only report would go green on an implementation that reinstates the R1
staleness defect, which is the failure mode this note exists to prevent.

**Premise, executable.** Before asserting that the SECOND report is
`{true,4}` (the first is the mount's `{false,null}`),
`premiseHolds("the seed resolved and the badge shows 4", ...)` on the rendered
badge text. Without it, a case where nothing ever arrived passes by never
calling the callback and never reaching the assertion, which is the degenerate
shape `docs/agents/writing-plans.md` names.

### Task 3: the join, and the announcement

<!-- task: red=`pnpm vitest run tests/components/admin/nav/navArrivalAnnounceIntegration.test.tsx` red-state=authored red-target=`components/admin/nav/AdminNav.tsx:89` why=`AdminNav holds no announce context and calls nothing, so the provider region stays empty in every case` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-11,AC-12,AC-13,AC-16,AC-17,AC-18,AC-19,AC-20 -->

Renders
`<AdminAnnounceProvider testId="admin-undo-status" label="Status updates"><AdminNav ... /></AdminAnnounceProvider>`
with real hooks and controlled deferred promises.

**Anti-tautology.** Every assertion reads
`screen.getByTestId("admin-undo-status")` and counts its `<span>` children and
their text. AC-18 is the one case that reads TWO places, and they must be two:
the accessible name from the attention link's `aria-label`, the sentence from
the region. Reading both off one container would let a single shared string
satisfy the pair and prove nothing about the drift §3.11 instance 1 names, so
the case asserts the region's text after removing the nav subtree from a clone,
the technique the anti-tautology rule prescribes for a label that two subtrees
can independently render. No spy on `announce`, no spy on `navBadgeArrivalAnnouncement`. The
expected text is stated from the counts the test resolved the promises with, so
the assertion fails if the join reads the wrong half or the copy builder is
bypassed.

| AC | Case | Catches |
|---|---|---|
| AC-1 | both resolve nonzero | one entry, both sentences, bell first |
| AC-2 | bell 3, attention 0 | a zero half appearing in the sentence |
| AC-3 | both 0 | any entry at all |
| AC-6 | both 0, region empty, THEN a later push takes the bell to 5 | STILL empty. This is the terminality case, and without it an implementation that sets `spokenRef` only when `message !== null` passes every other row here and then announces after a silent resolution. Spec §3.2's `(0, 0)` paragraph: silence is a resolution and the mount is marked spoken |
| AC-6 | both halves settle as failed reads, region empty, THEN a successful refetch commits 4 | STILL empty. The same terminality through the failure path rather than the zero path, so the mutant cannot survive on one branch |
| AC-4 | bell `infra_error`, attention 2 | a failed half suppressing the good one |
| AC-4 | bell 4, attention promise settles NON-`ok` | the load-bearing direction, and the one the drafted table omitted. `useNeedsAttentionBadge` commits `null` on failure (`components/admin/nav/useNeedsAttentionBadge.ts:88`), which is also its pending value, so ONLY the promise can settle this half (spec §3.2). An implementation that never latches attention failure stalls here and announces nothing, while still passing the bell-failure row above |
| AC-5 | both `infra_error` | any entry at all. Paired with the AC-4 attention-failure row above so it cannot pass accidentally: a join that never latches attention leaves the region empty here too, and only the AC-4 row distinguishes "correctly silent" from "stalled" |
| AC-6 | after AC-1, a pathname change refetches both to new counts | a re-announce on later change, the likeliest slip |
| AC-11 | bell panel opened mid-pending, then both resolve | the bell sentence surviving a `zeroNow()` |
| AC-11 | bell settles 4, THEN the panel opens (count stays 0), THEN attention settles 3 | the second of AC-11's two required timings. The drafted table carried only the mid-pending one while the plan claimed both, so this row is what makes that claim true |
| AC-12 | source assertion on the onboarding branch | the onboarding chrome gaining a nav |
| AC-16 | both pending, panel opened (`zeroNow` commits 0) while the seed is STILL IN FLIGHT, the panel refetch lands 7, the seed then resolves into the claimed hook and DEMOTES to a second fetch landing 2, THEN attention settles 3 | a frozen bell value, and separately a dead demote branch. Successive fetches return different values so 2 is reachable only through the demote path: deleting `useBellBadge.ts`'s `claimedRef` branch leaves 7 and reds this case. The entry must read "2 unseen notifications. 3 items need attention." |
| AC-16 | the reverse order, attention settles 3 BEFORE the restoration commits | one entry with the attention sentence only. Pins that the outcome follows the value at announce time rather than the interaction |
| AC-16 | the panel's OWN `onOpened={refetch}` route in isolation: panel opens, `zeroNow` commits 0, that refetch commits 6, then attention settles | the second restoration route (`components/admin/nav/NotifBell.tsx:112`). The demoted-seed row above exercises `useBellBadge.ts:205-210`; without this row "both restoration routes" is an unsupported claim, since one code path would carry the whole criterion |
| AC-17 | bell settles degraded, `degraded` clears to a count of 5, then attention settles | the bell sentence present with 5. A degraded latch fails this |
| AC-13 | bell settles with a POSITIVE retained count, then degrades before attention settles, then attention settles while still degraded | the third §3.8 compound transition, which round 2 found claimed and uncovered. The entry carries the attention sentence only: the count is retained but the degraded branch displays no number, so `bellAnnounceableCount` returns `null`. Reachability of `{count:4, degraded:true}` is pinned live at `tests/components/admin/nav/badgeSeedInterleavings.test.tsx:525-536`, so this is not a constructed state |
| AC-18 | attention 12, bell absent | the rendered attention `aria-label` reads `"Needs attention, 12 items"` AND the entry says "12 items need attention.", neither showing `9+` |
| AC-19 | both nonzero, rendered inside `<StrictMode>` | exactly ONE entry. React 19.2.4 replays effects without recreating the spoken ref (spec §6 limit 4), so a double entry means the latch was put in the wrong place |

Plus both settle ORDERS, bell-then-attention and attention-then-bell, each
asserting exactly one entry and never an early partial.

**One more ordering case, because the two above do not catch what they claimed
to.** A parent that latches attention whenever its promise resolves, INCLUDING
`kind:"ok"`, passes both orders, because React batches the hook's `setCount` and
the parent's latch together so the wrong rule is unobservable. The case that
separates them: resolve the attention promise `{kind:"ok", count:3}` while the
hook's own commit is held off by keeping the component from processing it in the
same tick, and assert the region is STILL EMPTY at that point. The announcement
must wait for the observable `badgeCount` commit, never for the promise's
success. Spec §3.2 scopes the promise to the attention FAILURE path only, and
this is the case that pins that scope rather than assuming it.

**The transition audit ships here, in this task, and the deviation is declared.**
`docs/agents/writing-plans.md:9` makes a transition-audit TDD task mandatory
whenever the spec carries a Transition Inventory, and spec §3.8 is one. Round 1
was right that declining it was wrong. Round 2 was then right that the separate
task I added could not work: placed after Task 3 the audit passes on arrival,
placed before it there is no production change in its own commit that turns it
green, and it sat after Task 5, which must be the PR's last commit.

The reason is structural, not a scheduling accident. The rule's red/green shape
assumes an ANIMATED component, where the audit fails until animation props are
added. This arc adds no animation surface at all, so no production change exists
whose absence reds an audit and whose presence greens it. A separate task would
therefore have to manufacture its red from test-only scaffolding, which round 2
correctly refused for AC-10 and which is no better here.

So the audit's assertions are authored in THIS task's red step, run by this
task's command, and land in this task's commit. They are red before the join
exists for the same reason every other case here is: the enumeration finds no
announce branch, so the assertion that every inventory entry has a corresponding
source branch fails. The inventory table the rule requires in the task body is
§3.8's, reproduced:

| From | To | Treatment |
|---|---|---|
| pending | spoken | Instant. One `announce()` appends one keyed child to the existing `role="log"` region. No animation: the region is `sr-only` (`components/admin/announceLog.tsx:134`) and has no visual presence |
| pending | settled-silent | Instant, and invisible by definition. No call is made |
| spoken | settled-silent | Unreachable. The spoken ref is set once and never cleared, so no transition out of either terminal state exists |

The rule requires the task to LIST every conditional site, so it does, and the
list is derived from the TREE rather than from a diff or a hand-written set: the
audit walks the AST of the three files this arc touches and pins the identity of
every conditional render and early return in them, as normalised condition
texts, alongside an empty animation-prop set.

**An earlier revision derived the list from `git diff` against the merge base,
and this paragraph described that.** It was removed for being non-portable by
construction: on a push to `main` the merge base IS `HEAD`, so the derived set is
empty and the premise fails, and any later branch not touching these files fails
it too. It went red in real CI while passing locally. Deriving from the tree
cannot go silently empty, and a membership change surfaces as an ordinary diff
to the pinned table.

The consequence for THIS table is that it covers the whole population of the
three files, not only the lines this arc added: fourteen branches, including
pre-existing renders this arc never touches and the pure selector's own guards.
That is the trade the portable form makes, and it is the better one, because a
population that includes untouched neighbours still fails on a real change
whereas an empty one fails on nothing.

| Site | Kind | Treatment |
|---|---|---|
| `AdminNav`, three conditional renders: `healthRollup`, `showBadge`, `overflow` | ternary and `&&` renders | instant. All pre-existing, none touched by this arc; they are in the population because the census is whole-file |
| `AdminNav`, the attention-promise subscription's `!attentionCountPromise` bail | early return inside an effect | instant. No render, no DOM. Added here |
| `AdminNav`, the announce effect's `spokenRef.current` terminality guard | early return inside an effect | instant. This is what makes the utterance once-per-mount. Added here |
| `AdminNav`, the announce effect's `!bellSettled \|\| !attentionSettled` guard | early return inside an effect | instant, and invisible. When it falls through it appends to an `sr-only` region (`components/admin/announceLog.tsx:134`), so there is nothing to animate. Added here |
| `NotifBell`, three conditional renders: the degraded/normal trigger, the badge pill, the panel | ternary renders | instant. Text and chrome swaps on already-mounted elements |
| `NotifBell`, the report effect's `!onBellState` bail | early return inside an effect | instant. The four existing call sites pass no prop and take this branch. Added here |
| `NotifBell`, the report effect's `lastReport.current === key` dedup | early return inside an effect | instant. No render, no DOM. Added here |
| `navArrivalAnnounce`, the selector's `degraded` and not-finite guards, and the both-halves composition | early returns in a pure function | instant by construction: no React, no DOM |

FIVE sites, every one an effect guard, ZERO conditional renders and zero
animation props. An earlier revision of this table said two, counting only the
guards it found interesting; the audit asserts per-file EQUALITY against these
counts, so the table and the code cannot drift, and the pure selector module's
own two guards are asserted to contribute NOTHING to the inventory, which is the
over-count the whole-diff review caught. That is the honest shape of an arc that adds no visual branch: the one
JSX conditional it touches, `NotifBell`'s `aria-label` ternary, is REMOVED
rather than added, replaced by a `bellAccessibleName` call, so it leaves the
added set rather than joining it.

The audit asserts the derived set EQUALS that table, so both a missing site and
an unlisted extra fail, and asserts that no `exit`, `initial`, `animate` or
`AnimatePresence` appears anywhere in the added lines. Pre-existing conditionals
in the same files are deliberately OUT of scope: they are not this arc's
transitions, the inventory does not describe them, and pulling them in is how a
scoped audit turns into an unbounded one. `premiseHolds("the audit enumerated the announce
effect", ...)` (`tests/_shared/premise.ts:36`) fails loudly if the derivation
returns an empty set, which is the vacuous pass this shape is most prone to.

Every compound entry in §3.8 has a behavioral case in the table above: the panel
opening while pending (AC-11), the panel opening after the bell settles
(AC-11), the bell degrading between settling and announcing (AC-13), both
restoration routes (AC-16), the degraded-clears path (AC-17), and both settle
orderings.

The plan's own criterion, declared here as a list item so the recognizer sees a
declaration rather than prose:

- AC-20 The transition audit walks the AST of the three files this arc touches
  and pins the IDENTITY of every conditional render and early return in them, as
  normalised condition texts, together with an empty animation-prop set. An
  added guard fails it wherever it sits in its block, and a SUBSTITUTED
  condition fails it even though the count is unchanged. It reads the tree, not
  the merge-base diff: a diff-derived population is empty on a push to main and
  on any later branch that does not touch these files, which is why the
  first version went red in CI while passing locally.

AC-12 is a source assertion rather than a render, because the onboarding branch
is a server-component branch: read `app/admin/layout.tsx` through
`stripCommentsForFile` (the helper `navPromiseSeamStreaming.test.tsx` already
uses) and assert the `inOnboarding` return renders `OnboardingTopBar` and
contains no `AdminNav`. Comment-stripping is load-bearing: that file's prose
names both identifiers.

### Task 4: teach the live-region guard about `role="log"`

<!-- task: red=`pnpm vitest run tests/components/_metaLiveRegionMounting.test.ts` red-state=authored red-target=`tests/components/_metaLiveRegionMounting.test.ts:461` why=`the detector fires on role=status or aria-live=polite only, so the planted gated role=log shape returns 0 where the self-test expects 1` ac=AC-10,AC-14 -->

R1's third finding, and the one I would not have found: R5 and AC-10 cited
`tests/components/_metaLiveRegionMounting.test.ts` for a protection it does not
provide. Its detector fires on `role === "status" || aria-live === "polite"` and
on nothing else (`tests/components/_metaLiveRegionMounting.test.ts:461`), so a
conditionally-mounted raw `<span role="log">` evades the guard whose entire
subject is regions born populated.

To BE repaired in this branch rather than deferred, per the class-sweep default;
nothing under these trees is edited yet, and `git diff --name-only
origin/main...HEAD` shows only docs until Task 1 lands. The finding is a defect
in a shipped guard, not a peer of my own diff, and the
marginal cost while already holding this context is one line of detector plus
one planted case.

**What is red and why.** The file's existing self-test block
(`"PREMISE: both scanners reject every shape review named (self-test)"`) asserts
planted source strings against the SAME matcher functions the real scan uses. A
new planted case goes in beside the `aria-live` and `role="alert"` rows it
already carries:

```ts
// role="log" is a live region too: polite and append-shaped, so a log
// inserted together with its text announces nothing, which is the very
// defect this file exists to catch. role="alert" stays excluded on its own
// merits one line above, because alerts DO announce on insertion.
expect(gated('const C = () => <div>{a && <p role="log">{m}</p>}</div>;')).toBe(1);
```

Against the shipped detector that returns `0`, so the case fails. GREEN adds
`role === "log"` to the recognized set. Same command both ends, and the red is
behavioral rather than an unresolved import.

**The widening is free, swept rather than assumed.** Two greps at plan time:

- `grep -rn 'role="log"' components/ app/` returns nine lines. Eight are prose
  inside comments (`Gallery.tsx:223`, `GalleryLightbox.tsx:953`, `GalleryLightbox.tsx:1113`,
  `announceLog.tsx:24`, `announceLog.tsx:99`, `announceLog.tsx:120`, `ShowReviewSurface.tsx:1192`,
  `CopyFactValue.tsx:577`). The one real JSX attribute is
  `components/admin/announceLog.tsx:134`, inside `AnnounceLogRegion`'s single
  return, which is ungated and therefore not a hit.
- `grep -rn 'role={' components/ app/` returns six dynamic sites
  (`IdentityChip.tsx:77`, `CollapsePanel.tsx:61`, `HoverHelp.tsx:593`,
  `_CrewShell.tsx:510`, `_PickerInterstitial.tsx:218`, `Callout.tsx:48`). None
  can matter: the detector reads the attribute's literal text through
  `attrText`, so an expression yields no match either way.

So `REGISTERED_SITES`, the unregistered-file scan, and the `PENDING` exactness
test are all unaffected, and AC-14's second half (the corpus stays green under
the widened detector) is discharged by running the suite.

**No new guard file.** The census this task used to be is deleted, per R1's
third finding and §3.11. The drift it watched for is unrepresentable once
`bellAccessibleName` is defined on `bellAnnounceableCount`: one decision, two
callers. Deleting the mechanism beats guarding it.

**AC-10 needs its own assertion, and the drafted claim that the widened walk
discharges it was false.** The walk pushes a hit only when `gated(el)` is true
(`tests/components/_metaLiveRegionMounting.test.ts:463-464`), because its
subject is regions born populated. An UNCONDITIONAL `<span role="log">` added under the nav
is exactly what AC-10 forbids and exactly what that walk ignores, so the map row
claimed a protection the mechanism does not give.

Task 4 therefore adds a SECOND, independent assertion, in the same file and run
by the same command: a source scan over `components/admin/nav/**` asserting that
no file there carries `role="log"`, `role="status"`, or `aria-live`, gated or
not. It reads the directory from disk rather than a file list, so a nav file
added later is in scope by default. Comments are stripped with
`stripCommentsForFile` (`tests/_shared/stripComments.ts:215`) first, because
this plan's own prose names all three attributes and a future nav comment could
too.

**The AC-10 scan matches BOTH spellings of the attribute.** An earlier revision
said an expression-form role never matches, which is false: `attrText` unwraps
`role={"log"}` to the same literal as `role="log"`
(`tests/components/_metaLiveRegionMounting.test.ts:303-315`), and the existing
self-test expects exactly that
(`tests/components/_metaLiveRegionMounting.test.ts:679`). So the AC-10 scan
compares unwrapped literals, not raw source text, and an unconditional
`<span role={"log"}>` under the nav fails it exactly as the quoted form does.
That spelling is one ordinary edit away, so it is named rather than left to
inference.

**AC-10 is a NON-RED regression pin, and round 2 was right to reject the red I
claimed for it.** The assertion passes on the pre-implementation tree, because
no file under `components/admin/nav/` carries any of the three attributes today.
Probe, reproduced from that round:

```text
$ rg -n 'role\s*=\s*["{]|aria-live' components/admin/nav
components/admin/nav/UserMenu.tsx:74: role="menu"
components/admin/nav/UserMenu.tsx:91: role="menuitem"
```

Neither is a live-region role. So no implementation makes this assertion pass;
it passes already, and its job is to keep passing. Same shape as AC-9 and
AC-12, and now classified with them rather than counted as
implementation-driven coverage. Planting a forbidden fixture to manufacture a
red would show the assertion discriminates but would not make it TDD, and this
plan does not claim it does.

Its value is real: AC-10 is a "do not add" criterion, and the only way such a
criterion fails is a later edit, which is what a regression pin is for. It reads
the directory from disk, so a nav file added later is in scope by default.

### Task 5: the impeccable pair, graduation and closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the row is still in DEFERRED.md carrying its IN PROGRESS marker, so the archive-only assertion fails on that id` ac=AC-15 -->

Both halves of the v3 pair on the diff, invoked as the two `/impeccable`
subcommands named in AGENTS.md rule 8, with the canonical v3 setup gates
(`context.mjs (impeccable v3 setup)` context load, then the register reference
read). P0 and P1 findings are FIXED in this branch. They are not deferred: this arc
files no new `BL-`/`DEF-` row of any facing (global constraints above), and the
one row it owns is graduating under AC-15, so there is no entry to defer into.
An earlier revision copied the generic "fix or defer with a DEFERRED.md entry"
wording from invariant 8 and contradicted its own constraint. If a P0 or P1
turns out to be too large to fix in this branch, that is a message to the
orchestrator, not a row and not a silent deferral.
Dispositions into the closeout §12.

**This plan carries NO `impeccable-gate:` marker, deliberately, and Task 5 adds
one.** An earlier revision carried the RAN form with zeroed counts plus a
paragraph calling it provisional. Plan round 1 rejected that, correctly: the
marker is machine-readable and asserts `critique=RAN audit=RAN` to its consumer
no matter what the prose beside it says, so a disclosure cannot make it true.
The two valid forms both assert an outcome, and this arc has no outcome yet,
because the pair cannot run before the components it critiques exist.

So the plan states the obligation instead of pre-claiming its result, and the
guard (`tests/docs/_metaInvariant8Closeout.test.ts`) arms when Task 5 writes
BOTH the marker and the closeout §12 that names the two halves. That is a real
weakening for exactly as long as Task 5 is open: between now and that commit,
nothing mechanical forces the gate to run. It is recorded here rather than
hidden, and it is the reason Task 5 is not complete until all four of these
land in ONE commit:

1. the closeout §12 naming both halves and their dispositions,
2. the `impeccable-gate:` line in the RAN form carrying the OBSERVED
   `critique=`, `audit=`, `p0=`, `p1=` and `dispositions=` values,
3. `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` green on the
   result, which it can only be once 1 and 2 are both present,
4. the row graduation and marker removal this task already owns.

Writing a number into that line that the run did not report is a fabricated
gate claim, which is the finding this revision exists to answer. Escalated to
the orchestrator as a process question, since every UI arc in this repo meets
the same wall: a closeout guard cannot be satisfied truthfully by a plan that
has not reached closeout.

**Tell the gate what the surface is.** This arc adds no rendered element, so the
critique surface is the COPY and the announcement's TIMING, not layout or
contrast. A gate run that goes looking for a visual diff finds nothing and
reports nothing useful.

Then, in the PR's LAST commit and nowhere earlier: archive the row into
`DEFERRED-archive.md`, remove it from `DEFERRED.md`, and take the
`**Status:** IN PROGRESS · **Branch:** ...` marker off in that same commit. A
marker that reaches `main` names a branch the merge just deleted and reds
`tests/docs/_metaLedgerInProgress.test.ts` on `main` until someone clears it.

<!-- tasks: end -->

## Acceptance-criteria coverage map

| AC | Task |
|---|---|
| AC-1 | 3 |
| AC-2 | 1, 3 |
| AC-3 | 1, 3 |
| AC-4 | 3 |
| AC-5 | 3 |
| AC-6 | 3 |
| AC-7 | 1 |
| AC-8 | 1 |
| AC-9 | 2 |
| AC-10 | 4 |
| AC-11 | 2, 3 |
| AC-12 | 3 |
| AC-13 | 1, 2, 3 |
| AC-14 | 4 |
| AC-15 | 5 |
| AC-16 | 2, 3 |
| AC-17 | 1, 2, 3 |
| AC-18 | 3 |
| AC-19 | 3 |
| AC-20 | 3 |

## Layout-dimensions and transition-audit tasks

**The layout-dimensions task does not apply; the transition audit DOES and
ships inside Task 3.**

The layout-dimensions task is mandatory for a fixed-dimension parent with flex
or grid children. This arc adds no element and no class, so there is no
parent-to-child dimension relationship to assert, and jsdom could not settle one
if there were.

The transition-audit task is mandatory whenever the spec carries a Transition
Inventory (`docs/agents/writing-plans.md:9`), and spec §3.8 is one. This plan
declined it in its first draft, added it as a standalone Task 6 in its second,
and now ships it inside Task 3, which is where its red is real. The full
reasoning, the inventory table the rule requires, and AC-20 are in Task 3; the
short version is that the rule's separate-task red/green shape assumes an
animated component, and a task with no production change of its own can only
manufacture a red from test-only scaffolding. Two rounds converged on that, and
the audit itself is not weakened by where it lives: same assertions, same
inventory, same command, one commit earlier.

## Red-command validation record

Run at plan-authoring time, 2026-08-31 15:45 CDT. Every `red=` above, parse-
checked on the default invocation with `sh -nc`, which is what the
VERDICT-CAPABILITY arm does by default: a command the executing shell cannot
parse expresses no verdict in either direction, and today's classifier would
read its non-zero exit as red observed.

Membership is every task's `red=` and nothing else. Round 2 found this table
carrying a removed command, missing two live ones, and including a `spec:lint`
invocation that is no task's red at all.

| Task | Command | `sh -nc` |
|---|---|---|
| 1 | `pnpm vitest run tests/components/admin/nav/navArrivalAnnounce.test.ts` | OK |
| 2 | `pnpm vitest run tests/components/admin/nav/notifBellFirstSettled.test.tsx` | OK |
| 3 | `pnpm vitest run tests/components/admin/nav/navArrivalAnnounceIntegration.test.tsx` | OK |
| 4 | `pnpm vitest run tests/components/_metaLiveRegionMounting.test.ts` | OK |
| 5 | `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` | OK |

Five tasks, five reds, one row each. There is no Task 6: the transition audit
ships inside Task 3 for the reason stated there.

Three properties of the set, each checked rather than asserted:

- **No `-t` name filter anywhere.** A `-t` that matches nothing exits 0 and
  reports green from the moment it is written, which is why it draws an advisory.
- **No `&&` conjunct in any red command.** A conjunct behind `&&` where an
  earlier expected failure short-circuits it is asserted red and never observed;
  the conjunction becomes the GREEN criterion. The one `&&` in this document is
  at the `Number.isFinite(n) && n > 0` prose in Task 1, describing the JavaScript
  filter, not a shell command.
- **Every command is an explicit FILE list, so none is a heavy phase.** Per the
  fleet rule, a directory-scoped vitest run is heavy and wraps; an explicit file
  list does not. None of the FIVE red commands takes `pnpm heavy`. The
  closeout's full-suite run does, and it is the only heavy phase this arc
  starts: `pnpm heavy pnpm test` at the shipping head, once, per the arc's
  readiness contract.

No `red-state=live` marker appears in this plan, so `spec:lint --exec-red` has
nothing to execute here: every red is `authored`, its failing case written by
its own task, and each names the production line whose absence or defect makes
it fail.


## Red-target validation, done offline against the recognizer

`lib/specLint/redContract.ts`'s `targetProblem` was read rather than guessed,
and it rejected three of the five targets this plan first carried. Recording the
rule here so the next plan on this branch does not rediscover it:

| Target form | Verdict | Source |
|---|---|---|
| bare filename, no slash | always illegal, "use the full path" | `redContract.ts`, the `cls.bare` branch |
| path-only, untracked | LEGAL, and the intended form for a file the task creates | the `cls.start === undefined` branch, which returns null when the path is untracked |
| path-only, tracked | illegal, "cite the defective line instead of the bare path" | same branch, tracked arm |
| path plus line, tracked, line in range | LEGAL | the EOF check below it |
| path plus line, untracked | illegal, "cited file not tracked" | the `!tracked.has` guard |

The two repairs:

1. Task 1's `components/admin/nav/navArrivalAnnounce.ts:1 (new)` lost its line number.
   The module does not exist yet, so path-only is the only legal form, and it is
   also the more honest one: the target DECLARES an absent production file
   rather than pointing at a line in it. It is the only path-only target here.
2. Task 5 could not cite `DEFERRED.md` at all. A repo-root file has no slash, so
   it is bare by construction and no marker may name it. The target is now
   `tests/docs/_metaDeferralLedgerGraduation.test.ts:72`, the `GRADUATED`
   registry row whose addition is what makes the archive-only assertion fail
   while the row still sits in `DEFERRED.md`. That is the same target
   `docs/superpowers/plans/2026-08-30-pill-size-draft-restored-note.md:341`
   uses for its own graduation task.

All FOUR tracked line targets were range-checked against the live files:
`components/admin/nav/NotifBell.tsx:25` against 118 lines,
`components/admin/nav/AdminNav.tsx:89` against 275,
`tests/components/_metaLiveRegionMounting.test.ts:461` against 737, and
`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` against 1881. All in
range. An earlier revision said two, counting only the production files and
missing both test targets.

## 12. Closeout: the invariant-8 dual gate

Both halves of the v3 pair ran against the diff on 2026-08-31, with the canonical
setup gates: `context.mjs (impeccable v3 setup)` context load (PRODUCT.md, and DESIGN.md where the
surface touches it), then the product register reference, since this is admin
tooling where design serves the product rather than a brand surface.

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=0 dispositions=none

**Why the critique half is RAN-DEGRADED, stated rather than rounded up.** The
impeccable critique contract requires Assessment A (design review) and
Assessment B (detector plus browser evidence) to run as two ISOLATED sub-agents,
and treats an inline run as degraded with a mandatory banner. Two sub-agents were
spawned and both went idle without ever delivering a report, as did a third
earlier in the arc; a direct request to each produced nothing. Both assessments
were therefore completed inline, which is the fallback the contract names, and
the banner is this paragraph. Two consequences a reader should weigh: the two
assessments were not isolated from each other, and Assessment A was performed by
the same session that wrote the code, so it is self-review rather than fresh
eyes. Browser evidence was separately unavailable, because a fleet-wide order in
force at the time forbade starting any playwright or dev-server process. The
deterministic half was NOT skipped: `detect.mjs (impeccable v3 detector)` ran over
`components/admin/nav` and returned exit 0 with an empty finding array.

The independent-eyes property this run lacks is supplied by the whole-diff
cross-model review that follows, which is a different model reading the same
diff without having written it.

### Critique half

No AI-slop tells. The change adds no element, no class, no color, no token and
no motion; the only rendered output is one entry appended to an existing
`sr-only` region. The product register's test is whether a user fluent in the
category would trust the surface, and the surface here is a sentence.

Heuristics, scored where they apply and marked where they do not:

| Heuristic | Score | Reason |
|---|---|---|
| Visibility of system status | 4/4 | This change IS the repair for a status-visibility gap: a count that arrived with nothing announcing it |
| Match with the real world | 4/4 | The nouns are taken verbatim from the control names the sentence explains, so the utterance and the label say the same words |
| User control and freedom | N/A | A polite, once-per-mount utterance blocks nothing and needs no escape |
| Consistency and standards | 4/4 | Rides the one existing announce channel; terminal punctuation matches `undoneAnnouncement`'s precedent for prosody |
| Error prevention | N/A | No input, no destructive action |
| Recognition over recall | 3/4 | The sentence carries counts but no anchor naming where they live. See P2-1 |
| Flexibility and efficiency | N/A | No path to accelerate |
| Aesthetic and minimalist design | 4/4 | One sentence per half and nothing else, and silence when there is nothing true to say |
| Error recovery | N/A | A failed read is silent by ratified fail-quiet D-4, and the degraded control carries its own Doug-facing label |
| Help and documentation | N/A | Not a documented surface |

Cognitive load is low by construction: at most two short sentences, at most once
per admin-shell mount. Emotional journey: the arrival was the silent moment and
is now the resolved one, which is the peak this change exists to fix.

Strengths worth keeping named, because a later edit could remove any of them:

1. One decision with two callers. `bellAccessibleName` is DEFINED on
   `bellAnnounceableCount`, so the label and the utterance cannot drift, and a
   source assertion pins the construction because no behavioural test can.
2. Silence is terminal. A both-zero or both-failed arrival consumes the
   once-per-mount allowance, so the surface can never become chatty later.
3. It speaks the true count, never the `9+` pill, because the pill is a
   decorative width constraint and the accessible name is the referent.

### Audit half

| Dimension | Score | Evidence |
|---|---|---|
| Accessibility | 4/4 | The announce region is mounted UNCONDITIONALLY above `{children}` (`components/admin/AdminAnnounceProvider.tsx:55-56`), so it is born empty and stable rather than born populated, which is the defect class the widened guard exists for. Both `aria-label` branches say something true in every state including degraded and zero. No interactive target is added or altered |
| Performance | 4/4 | The bell VALUE lands in a ref and triggers no render; only the settled latch does. Every dependency of the announce effect is stable: `announce` is memoised at `components/admin/AdminAnnounceProvider.tsx:52`, and `onBellState` is a `useCallback` with empty deps. The report path dedupes on a string key so an unchanged tuple re-reports nothing |
| Theming | N/A | The diff adds zero colors, tokens, classes or theme-dependent values. Scored N/A rather than 4/4, because a vacuous full mark is the kind of number that later reads as evidence |
| Responsive | 4/4 | No layout is added and the 840px behaviour is unchanged. The one cross-breakpoint consequence, that the attention sentence explains no control above 840px, is recorded as §6 limit 7 of the spec rather than left implicit |
| Anti-patterns | 4/4 | `detect.mjs (impeccable v3 detector)` over `components/admin/nav`: exit 0, `[]` |

### Dispositions

**P0: none. P1: none**, which is why the marker above reads
`dispositions=none`. That field is the disposition of P0 and P1 findings, and
the guard cross-checks it: a zero count with `dispositions=recorded` is rejected
as malformed, correctly, because there is nothing at that severity to have
disposed of. The three records below are P2 and P3 and live in this prose. Nothing required a fix under the arc's rule that P0 and
P1 are repaired in-branch.

Three lower-severity findings, all recorded rather than fixed, each with its
reason:

- **P2-1, the utterance carries no context anchor.** A listener whose focus is
  elsewhere hears "3 unseen notifications. 2 items need attention." with nothing
  naming where those counts live. NOT fixed. The copy is spec §3.3, it survived
  four adversarial rounds, and an anchor lengthens every utterance to serve a
  case the once-per-mount cadence already bounds. Changing it now would be a
  spec amendment taken under closeout pressure, which is the worst moment to
  take one.
- **P2-2, the desktop attention half explains no control.** Above 840px the
  attention tab is out of the accessibility tree, so that sentence has no
  referent there and its number is a second snapshot of a count the dashboard
  reads through a different call. NOT fixed, and already carried as §6 limit 7
  with the two call sites cited. Closing it means sharing a snapshot across two
  subtrees this arc does not otherwise touch.
- **P3-1, the bell sentence leads.** Spec §3.3 argues bell-first because the
  bell is present at every width while the attention tab is not. PRODUCT.md's
  "lead with the answer" could argue the other way, since items needing
  attention are work and unseen notifications are information. NOT fixed: the
  ordering is argued in the spec with a reason, and reversing it on a coin-flip
  at closeout would replace one defensible order with another.

No `DEFERRED.md` entry is filed for any of the three. This arc files no new row
of any facing, and none of these is a P0 or P1 that the rule would require to be
fixed. They are recorded here, which is where a reader looking at this surface
will find them.
