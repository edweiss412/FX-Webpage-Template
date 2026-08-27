# A hung switch-person clear re-enables the menu row after a watchdog

**Row:** `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` · **Branch:** `fix/avatar-menu-switch-pending-watchdog` · **Worktree:** `../FX-worktrees/switchwatch` · **Implementer:** Claude Code (Opus; UI surface, so Opus-class per ROUTING).

No spec. The design is the same-route sibling's shape and the row names it, so this plan carries the transition inventory and the guard conditions itself. What the arc does amend is the CANONICAL inventory the menu already has: `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.6 enumerated four states and six pairs on one axis. This arc replaces that model outright with two independent axes and seven observable configurations, because the always-mounted announcer makes closed-while-pending and closed-while-timed-out observably different. Leaving that section unamended would make it false, which invariant 7 forbids.

## Reachability, probed rather than inferred

The row shipped `**Reachability:** INFERRED, NOT PROBED` and named the probe that would settle it. The probe was run first, on the branch tree at `b0d9f8dbb`, as a throwaway case against the UNMODIFIED component:

```
 ✓ tests/components/auth/__probeWatchdog.test.tsx (1 test) 36ms
   ✓ REACHABILITY PROBE — today's behaviour
     ✓ a clear that never settles leaves the row dimmed past 8s
```

The case held a `clearAction` unresolved, advanced fake timers by 60,000 ms, and observed `aria-disabled="true"`, `aria-busy="true"`, the announcer still reading `Switching person`, and a second tap leaving `clearAction` at exactly one call. The row is reachable and the fault is permanent short of a reload. The file was deleted; its assertions return in Task 1 pointing the other way.

A second throwaway probe measured the MECHANISM before it was designed into the component, because two of its claims are framework behaviour rather than repo behaviour: that Vitest fake timers cohabit with `useTransition` (they do; React DOM schedules on MessageChannel, which Vitest does not fake, and Vitest fakes neither `queueMicrotask` nor `nextTick` by default, so the awaited promise still settles), and that calling `startTransition` a SECOND time while the first is still in flight invokes the action again and re-asserts `isPending`. Both held, including the compound where the stale first settle lands after the retry. That probe was deleted too.

One typographic note, so it does not read as sloppiness: the new module's path appears WITHOUT backticks throughout. A backticked source path is a citation to `spec:lint`, and it hard-fails a path that is not tracked yet, which is correct of it and true of every file a plan is about to create.

## Round 1 review, and what it changed

Codex, plan stage, round 1: BLOCKING, three findings. Two of them were right about the mechanism rather than about the prose, which is the useful kind.

**F1 (P1) — the five-state model was false, not merely incomplete.** The draft derived busy from `switchPending` and treated it as this attempt's flag. One `useTransition` hook entangles every transition started from it, so with the retry settling BEFORE the older hung attempt, the flag is still true: a successful retry would sit busy until a second watchdog fired, and a failed one would put the error state and a still-pending row on screen together, then paint the timeout notice on top of the alert. Three combinations outside the declared five. Repaired structurally: the component now owns a three-valued `switchPhase` and never reads React's flag, so the extra combinations are unreachable rather than undocumented. Two cases (AC-9) cover both directions of that settlement order.

**F2 (P1) — "a rejection is recovered by the watchdog" was false.** Probed by the reviewer against the installed React 19.2.4: a rejected async transition action surfaces as a render error and the nearest boundary replaces the component, so there is no row left for a watchdog to re-enable. Rejection is inside this arc's own threat fence, so the honest options were to narrow the fence or handle it. Handled: the `await` is wrapped, a Next control-flow `digest` is rethrown untouched, and anything else renders the generic failure the component already owns. AC-10 covers it.

**F3 (P2) — AC-6's premise was satisfiable by an unrelated state.** It asserted only that the row read enabled before the close, which is equally true of ordinary idle. Class-swept rather than patched at the named instance: every case's premise was re-read against the question "what else makes this true?", and both AC-2 and AC-7 carried the same defect. All three now state a premise no other state satisfies.

The three findings share one root, which is worth naming because it is what the sweep should look for next time: each was a claim about a state the tests never entered. F1's order was never driven, F2's rejection was never thrown, F3's premise was never contradicted. The repair in each case is a case that enters the state, not a sentence that describes it.

## Round 2 review, and what it changed

BLOCKING again, six findings, and four of them are the kind that only show up when someone drives the state rather than reads about it.

**F1 (P1) — batching does not make the states exclusive; the callback's own predicate does.** A watchdog callback can already be QUEUED when the settle schedules its update, and `clearTimeout` in the effect cleanup cannot unfire it. The reviewer probed `Open-timedout` with `Open-error`, the exact combination the table calls impossible. Reproduced here, then closed with a functional read inside the callback that refuses to leave `pending` unless it finds `pending`. AC-12 drives the interleaving. A second guard, an attempt ordinal in the callback, was added in the same repair and REMOVED in round 3 for want of a failing case; round 4 found three places still describing it, all now gone.

**F2 (P1) — a string `digest` is not Next control flow.** Next stamps ORDINARY server failures with an opaque string digest too; the reviewer's probe on the installed Next 16.3.0 returned `"3693416880"` for one. The digest sniff would therefore rethrow exactly the failures the catch exists to report, and AC-10's plain `Error("network")` passed while the production shape still escaped. Replaced with `unstable_rethrow` from `next/navigation`, which is Next's own classifier: probed returning for the opaque digest and rethrowing `NEXT_REDIRECT`. AC-14 asserts both directions, because a case with only a bare `Error` passes under either implementation and proves neither.

**F3 (P1) — the declared RED was not reproducible in TDD order.** The cases imported `PENDING_TIMEOUT_MS` from a module the GREEN step creates, so collection would fail on the unresolved import before any named assertion ran; the recorded failures were obtained with the module already present. Closed by removing the import, which F4 made free.

**F4 (P2) — AC-7's embedded case proved nothing.** A component-local `8_000` produces identical behaviour, so the case passed by numeric coincidence while claiming to pin linkage. The case is gone and AC-7 is discharged by the derived inventory guard, which does pin it.

**F5 (P1) — no transition audit for the component whose inventory this plan amends.** Mandatory contract, and the only structural audit in the gate list was the sibling's. AC-15 adds tests/components/auth/avatarMenuTransitionAudit.test.ts. F5 also caught that C5 ("theme flip while timed out") had no case that ever enters timed-out; AC-16 does.

**F6 (P2) — the GREEN checklist still said `switchTimedOut`**, the first draft's boolean, contradicting the mechanism section twenty lines above it and capable of recreating the states round 1 removed.

Both rounds share a root worth naming, and it is not the same one round 1 had. Round 1's findings were states the tests never entered. Round 2's are states the tests never entered *because the plan believed a general mechanism made them unreachable* — batching, a cleanup, a type test. Each time, the belief was about a mechanism rather than about this code, and each time the probe was one interleaving away. The rule the next round should apply to itself: when a plan says a combination is impossible, the sentence has to name the LINE that refuses it, not the framework behaviour that usually would.

## Round 3 review, and what it changed

BLOCKING, five findings, and the useful thing about them is that four are about MY CASES rather than about the mechanism. The mechanism has been stable since round 2's repair; what kept moving was whether the cases could see it.

**F1 (P1) — AC-13 never queued the stale callback it claimed to catch**, so removing the attempt ordinal left it green and the mandated mutant would have proved nothing. The honest follow-up was to run the mutant rather than rewrite the case, and it settled the question the other way: three interleavings, with the ordinal and without, identical output. With the effect keyed on the phase, every phase change cancels the previous timer before a later attempt can exist, so no interleaving reaches the callback with a stale ordinal. The ordinal is gone, AC-13 is gone, its mutant is gone. Two rounds asserted that guard was load-bearing on the strength of a probe that never tested it.

**F2 (P1) — AC-14's redirect half could not go green.** Calling `unstable_rethrow` in the test asserts Next's classifier, not this component, and letting the control-flow rejection escape a bare `act` fails the case rather than proving the rethrow. Replaced with an error-boundary harness: one helper rejects a clear with a given throwable and reports what the boundary caught. Probed before it was written: `REDIRECT boundaryCaught=true rowPresent=false` against `OPAQUE boundaryCaught=false rowPresent=true status=error`. AC-10 moved onto the same harness.

**F3 (P1) — the five-state model was still false, and this time the reason is a node rather than a race.** The announcer is outside the popover and always mounted, so closed-while-pending and closed-while-timed-out differ observably and there is a reachable transition between them. Rounds 1 to 3 each patched a model that collapsed `Closed` into one state. The inventory is now a PRODUCT of two independent axes with one stated coupling, which is both true and shorter, and AC-6 was rewritten into the case that proves the independence rather than assuming it: close while PENDING, cross the window while still closed, read the announcer without reopening.

**F4 (P1)** — a RED-step line still told the implementer to import the constant two other sections said had been removed, and omitted the import the harness needs. **F5 (P2)** — the unmount guard promised "no setState on an unmounted node", which the plan's own queued-callback analysis disproves; React discards the update, but the guarantee was not this mechanism's to give.

The pattern across three rounds, stated so round 4 can check itself against it: every finding has been a claim the plan made about a mechanism it did not own, believed because the mechanism usually behaves that way. React's pending flag, batching, `clearTimeout`, a digest's type, and a state model that quietly assumed a node was inside the popover. In each case the code was fine and the SENTENCE was wrong. The check that would have caught all five: for every "cannot", name the line that refuses it, and for every "proved", name the mutant that reds.

## What this plan is allowed to claim

**Framework mechanism claims are not asserted in prose; each is pinned by a deciding case or absent.** bl-orch's ruling at the plan-stage cap, and it is the class repair for the axis all four rounds shared. Every finding across those rounds was a sentence about a mechanism this plan does not own, believed because that mechanism usually behaves that way: `useTransition`'s pending flag, batched updates, `clearTimeout` ordering, what a `digest` identifies, and where a node sits. In each case the code was defensible and the sentence was wrong, which is exactly why self-review kept passing them: self-review re-reads the sentence and agrees with it.

So the plan now says what a case OBSERVES and names the case. Where no case pins a claim, the claim is stated as an observation with the probe that produced it and no explanation of why, or it is gone. The same rule applies to the code comments this plan pastes, because those ship: each one names the case that fails if someone simplifies the line away, rather than explaining a framework behaviour the next reader would have to take on trust.

This is deliberately not a promise to understand React better. It is a promise to stop putting load on sentences that no test can hold up.

## Round 4 review, the cap round, and what it changed

BLOCKING, three findings, and all three are mine rather than the mechanism's.

**F1 (P1) — round 3's removal of the callback ordinal was incomplete.** Three places still described a guard that no longer exists: a compound, the GREEN checklist, and a comment claiming "two guards"; and the audit row that declared it aliased the settle-path ordinal it shares a spelling with, so it identified nothing. The arithmetic followed: the audit declared 24 rows against a mechanism producing 23. All three descriptions are gone, the settle-path row is anchored on what follows it so it cannot alias, and the count is reconciled below.

**F2 (P1) — the §4.6 amendment instruction still described the table round 3 deleted**, a five-state, ten-pair inventory, which would have left the canonical spec asserting a model this plan replaced. It now says what it replaces §4.6 with. The same finding caught a false row in the new table: `error→idle` is not the first step of a retry, because `setSwitchStatus("idle")` and `setSwitchPhase("pending")` are one batched update and there is no intervening render. Probed on a React 19 render log. The row now says error→idle happens only when a retry SUCCEEDS.

**F3 (P1) — the supersession ordinal ran after the rethrow**, so a superseded attempt rejecting with Next control flow escaped before the ordinal could drop it and would have taken the row down while a newer attempt was live. That contradicts the plan's own "a superseded attempt reports nothing, either way". The check now comes first and gates the rethrow: a redirect requested by a clear the person has already superseded by tapping again is not this row's to follow, and the live attempt decides the navigation. That is the fifth `if` the mechanism adds, and it is why this round's count is 24 where round 4 computed 23.

Round 4 is this stage's cap. The filing is at `docs/review-rounds/fix/avatar-menu-switch-pending-watchdog/4cb585b3508a.md`, and whether the plan gets a fifth round is the orchestrator's call rather than this arc's.

## Diff rounds, and the class that took three of them

Diff round 1 at base `4cb585b3508a`: BLOCKING, 2. Round 1 at base `5fccaaac7804`: BLOCKING, 4. Round 2 there: BLOCKING, 1. Every one of those seven findings was in one of two classes, and the second is the one worth writing down.

**The guard class.** The transition audit claimed more than it checked, twice. First its regex census saw 7 of 12 ternaries, missed the keyboard `switch` and counted a comment; that was replaced with an AST walk. Then its "bijection" turned out to be many-to-many, so deleting the catch's supersession guard left it green because the row still matched a textually identical twin. That is closed with a match key carrying the following statement, and three assertions: exactly one site per row, exactly one row per site, equal counts. Both repairs were verified against the reviewer's own escaping mutant rather than argued.

**The stale-prose class, which is the one that recurred.** Rounds kept finding sentences describing a mechanism the code no longer had: the plan's opening, eight test comments, the canonical spec's pending bullet, a second spec's state list, and finally a code block in this plan that still showed the phase write inside `onSwitchSubmit`. That last one was not cosmetic. An implementer following it would have moved the phase back into the form action and recreated the exact defect the arc exists to fix, because React holds updates scheduled inside an action until that action settles.

**The repair is subtraction, not a guard.** Every instance was a COPY of the implementation living where a reader could follow it, so the structural answer is fewer copies. The plan no longer restates the submit path at all; it carries the contract and the reasons, which no copy of the code can hold, and points at the component. A recognizer over prose would have been the other option, and this repo already records where those go: the round after next widens it, and the round after that widens it again. What remains in the corpus naming `switchPending` is either historical by construction (a past plan, this plan's own pre-draft verification table dated to the tree it read, the round narratives) or the guard assertion that forbids the identifier outright.

## Citation drift, swept and bounded

This diff adds roughly twenty-five lines near the top of `components/auth/AvatarMenu.tsx` and removes fourteen from the sibling, so every line-form citation into either file moves. Derived cover: every an AvatarMenu.tsx or _ClaimedRowButton.tsx line citation citation in a LIVE document, with historical records excluded by path (`docs/superpowers/plans/**`, `docs/review-rounds/**`, `**/probes/**`, `BACKLOG-archive.md`) because those record a past tree and rewriting them would falsify the record. Twenty live citations, across four specs and `BACKLOG.md`.

Repaired here, because the diff makes these claims FALSE rather than merely off by N: the citations naming `onSwitchSubmit`, the result-reading seam and the pending affordances, which this diff rewrites (`docs/superpowers/specs/2026-08-25-switch-person-google-signout-design.md` lines 42, 73, 85, 107, 111, 130; `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` line 242). Repaired alongside them: `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` line 240, which is already stale on main and flagged `CITATION_SYMBOL_UNMATCHED` there, pointing at the trigger's class list rather than the identity header it claims; the file is open for the §4.6 amendment anyway. Also repaired, and for a different reason: `docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md` lines 289 and 607 are the PAPER TWIN of the `tests/styles/tapTargetCensus.ts` row this diff edits, and updating one while leaving the other is the two-copies-drift defect. And `BACKLOG.md` line 309, a live OPEN row, three numbers on one line.

Not repaired, and this goes in the PR body under unfixed peers rather than into a ledger row (the process mint freeze is in force): pure line drift in live specs whose CODE this diff does not rewrite. Line-form citation drift is a repo-wide, ungated property, already recorded as a documented limit in `docs/agents/writing-plans.md`, and repairing it corpus-wide is a citation audit of documents this arc does not otherwise touch, which is class-sweep exception (c).

## The transition audit (AC-15)

tests/components/auth/avatarMenuTransitionAudit.test.ts. It started in the shape `tests/show/claimedRowTransitionAudit.test.ts:24` uses on the sibling and no longer is: that one is a regex census with an at-least-one mapping, and four demonstrated escapes moved this one to an AST census with a one-to-one mapping in both directions, a `text + after + within` match key, and every logical operator counted. The file's own header records each escape and the mutant that showed it; this plan does not restate the file, for the reason the section above gives.

**Diff round 1 replaced a regex census with this, and the reason is worth keeping.** The first version counted `? (`, `&& (` and `if (`, the way the same-route sibling's audit does. Measured against the AST it saw 7 of 12 ternaries, missed the keyboard `switch` entirely, and counted the module header's prose "`Not you?`" as a branch: an identifier, brace or numeric consequent (`activeIndex === 0 ? 0 : -1`) is invisible to that pattern. The completeness the file advertised was therefore false. Widening the pattern would only move the next hole, which is the recognizer-growth trap this repo already documents; the AST cannot miss a node, and a comment is not a node.

The population is 38 sites: 15 `if`, 12 ternaries, 1 `switch`, and 10 logical operators. EVERY logical operator counts, with no test of its operands: the earlier rule counted `&&` only with a JSX right operand and skipped `||` entirely, and both omissions were demonstrated by live mutants that left the census byte-identical while the row rendered wrong. Proved reachable rather than assumed: planting `switchBusy ? 0 : 1`, a shape the original regex could never have seen, reds the suite by name.

**The audit is NOT pasted here, for the third time this arc has learned the same thing.** The copy in this plan was the pre-repair version: no `||`, no `after` match key, no C6b, and "at least one" where the shipped file requires exactly one. Following it would have restored both defects earlier rounds repaired. That is the identical failure the submit path and the transition inventory each produced before they were removed from this document, and the identical repair applies. The audit lives in tests/components/auth/avatarMenuTransitionAudit.test.ts, which is executable and therefore cannot drift from itself.

What the plan owes is why the guard has the shape it does, which the file's own header now carries and which no third copy improves:

- The census is the TypeScript AST, not a regex. A regex saw 7 of 12 ternaries, missed the keyboard `switch`, and counted a comment.
- The mapping is one-to-one in both directions with an equal-count check, so a row cannot cover two sites. It was many-to-many once, and deleting a supersession guard stayed green because its row still matched a textually identical twin.
- EVERY logical operator counts, with no test of operand or JSX-ness. That rule was narrower twice and escaped twice, each time with a live mutant: `||` invisible let a widened busy definition disable the row in Open-error, and `&&`-only-with-JSX let a narrowed one enable the row in Open-pending. Both left the census byte-identical. All logical operators are branches; a predicate guessing which ones "really" are is a corner someone will find.
- The key carries the following statement and a slice of the parent, because two `if` statements and two `&&` expressions in this component are byte-identical and differ only in context.

What it does NOT claim: it is a census of conditional NODES. A mutation that changes an operand without changing node structure (`===` to `!==`) is invisible to it by construction, and the behavioural cases are what catch those.

## Pre-draft code verification (run 2026-08-27, tree at `b0d9f8dbb`)

| Claim | Where | Verified |
| --- | --- | --- |
| `switchPending` comes from `useTransition`, no watchdog beside it | `components/auth/AvatarMenu.tsx:108` | yes |
| `onSwitchSubmit`'s re-entry guard is `if (switchPending) return;` | `components/auth/AvatarMenu.tsx:113`, `components/auth/AvatarMenu.tsx:116` | yes |
| The pending affordances: `aria-disabled`, `aria-busy`, announcer text | `components/auth/AvatarMenu.tsx:408`, `components/auth/AvatarMenu.tsx:413`, `components/auth/AvatarMenu.tsx:459` | yes |
| The announcer is always mounted and OUTSIDE the popover | `components/auth/AvatarMenu.tsx:458` | yes |
| `openAt` resets via `setSwitchStatus` and touches no other switch state | `components/auth/AvatarMenu.tsx:185` | yes |
| Sibling constant and its timer | `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:49`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:118` | yes |
| The §5.5 row pinned in both directions | `DESIGN.md:740`; `tests/docs/_metaInteractionTimingInventory.test.ts:83`, `tests/docs/_metaInteractionTimingInventory.test.ts:96` | yes |
| Row key is `file :: label = value`, order-independent (both sides sorted) | `tests/docs/_metaInteractionTimingInventory.test.ts:72`, `tests/docs/_metaInteractionTimingInventory.test.ts:88` | yes |
| `UNIVERSE_ROOTS` is `app` + `components` | `scripts/scan-interaction-timings.ts:150` | yes |
| `EXPLICIT_INCLUDES` is how a `lib/**` timing gets scanned | `scripts/scan-interaction-timings.ts:167` | yes |
| Module-level `deferredPending<T>()` helper, and the module-level `openMenu()` | `tests/components/auth/avatarMenu.test.tsx:49`, `tests/components/auth/avatarMenu.test.tsx:54` | yes |
| The existing pending-announcement case, which must keep passing | `tests/components/auth/avatarMenu.test.tsx:647` | yes |
| The existing "re-activation while pending is a no-op" case | `tests/components/auth/avatarMenu.test.tsx:674` | yes |
| Sibling's both-sides timing pin idiom (7,900 then 200) | `tests/show/pickerAffordance.test.tsx:153`, `tests/show/pickerAffordance.test.tsx:158` | yes |
| The sibling's conditional census counts `? (`, `&& (`, `if (` and pins the total | `tests/show/claimedRowTransitionAudit.test.ts:77` | yes |
| The sanctioned-island grep is scoped to the picker route directory | `tests/components/StaleCleanupAutoSubmit.test.tsx:63` | yes |
| `itemClass` already carries `min-h-tap-min` | `components/auth/AvatarMenu.tsx:237` | yes |
| The tap-target census pins the sibling's button by LINE, and the hoist moves it | `tests/styles/tapTargetCensus.ts:438`, `tests/styles/tapTargetCensus.ts:439` | yes; `line: 101` becomes 87 |
| `ClearIdentityResult` is `{ ok: true } \| { ok: false; code: string }` | `lib/auth/picker/clearIdentity.ts:39` | yes |
| The sibling action that DOES redirect, so the digest rethrow is not hypothetical | `lib/auth/picker/clearIdentity.ts:119` | yes |
| The canonical four-state inventory this arc amends | `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md:274` | yes |

## Where the shared constant lives, and why not `lib/ui/`

`COPY_FEEDBACK_RESET_MS` sits in `lib/ui/copyFeedback.ts` with an `EXPLICIT_INCLUDES` row carrying its reason, so lib/ui/pendingTimeout.ts is the obvious-looking home. It is the wrong one here, for two reasons that point the same way.

The scanner's own model says `lib/**` is infrastructure and `app/**` + `components/**` is where interaction timing lives (`scripts/scan-interaction-timings.ts:147-150`). A timing shared by a route file and a component is interaction timing in both consumers, and `components/**` is a tree `app/**` already imports from freely. Putting it there agrees with the model instead of needing an exemption from it.

And `scripts/scan-interaction-timings.ts` is an ENROLLED mutation surface (`tests/mutation/source/registry.ts:2325`). Adding an include row to it would edit that surface and oblige this arc to score it, arbitrate the class lock, and re-score at the shipping head, for a constant that needs no exemption at all. Measured rather than argued: with the constant at components/shared/pendingTimeout.ts and both consumers importing it, `node --import tsx scripts/scan-interaction-timings.cli.ts` reported

```
components/shared/pendingTimeout.ts	PENDING_TIMEOUT_MS	8000
312 files, 31 rows, 0 unclassified
```

one row, resolved from both call sites, nothing unclassified, and the scanner untouched.

## The corpus sweep for the constant, run at plan time

`grep -rn "PENDING_TIMEOUT_MS" --include='*.ts' --include='*.tsx' --include='*.md' .` returns nine occurrences. Dispositions:

| Occurrence | Disposition |
| --- | --- |
| `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:49` (declaration) | moves to the shared module |
| `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:118` (the timer) | unchanged; resolves through the import |
| `DESIGN.md:740` | the owning-file cell changes; this is the live citation |
| `BACKLOG.md:15` | the row's own prose, archived by this arc |
| `docs/superpowers/plans/2026-08-03-picker-signin-flow-cluster.md:478` | historical record of a shipped disposition; names no file, still true |
| `docs/superpowers/specs/2026-08-03-picker-signin-flow-cluster-design.md:520` | ratified amendment text; names no file, still true |
| `docs/superpowers/plans/2026-08-25-switch-person-google-signout/closeout.md:16` | the deferral that filed this row; historical, left as written |
| `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md:182` and `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md:219` | pasted probe OUTPUT anchored to a past tree; rewriting it would falsify a record |

Only the first three are live claims about where the constant is, and all three land in Task 1. At close-out the mechanical arm runs the same question the other way: `pnpm spec:lint --repair HEAD --claim-about PENDING_TIMEOUT_MS --also DESIGN.md`, advisory by construction.

## Meta-test inventory

- **Runs unchanged, and is the gate for the move:** `tests/docs/_metaInteractionTimingInventory.test.ts`. Its population is derived from the scanner, so the moved declaration needs no registry edit; only `DESIGN.md`'s row follows it.
- **Runs unchanged:** `tests/show/claimedRowTransitionAudit.test.ts`. It counts conditionals in `_ClaimedRowButton.tsx` and pins the total at `DECLARED.length`. The hoist deletes a `const` and a comment carrying no `?`, `&&` or `if (`, and adds an import, so the count is unmoved. Asserted, not assumed: the suite is in Task 1's gate list.
- **EDITED, and it is the one registry this diff must touch:** `tests/styles/tapTargetCensus.ts`. Its row for `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` pins `line: 101`, and the census is DERIVED from a scan, so the row has to follow the button the hoist moves to 87. This was NOT in the plan's first draft; it came out of a sweep run against the whole class after round 1. The derived cover, so the answer is not a list someone has to keep up to date: every row in `tests/**` pairing a `line:` field with any file this diff edits. Two hits, one real, the other a constructed fixture in `tests/styles/_metaControlOutlineResidue.test.ts` whose `file:` names a constructed component that does not exist on disk. `components/auth/AvatarMenu.tsx` is pinned by line nowhere, which is why its own +25 lines cost nothing.
- **Runs unchanged:** `tests/components/StaleCleanupAutoSubmit.test.tsx`'s sanctioned-island grep, which walks only the picker route directory (`tests/components/StaleCleanupAutoSubmit.test.tsx:63`). The new module is under `components/` and carries no `"use client"`.
- **Mutation registry:** none of `components/auth/AvatarMenu.tsx`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` and the new components/shared/pendingTimeout.ts is an enrolled `sourcePath` (`grep -n sourcePath tests/mutation/source/registry.ts`, checked at Stage 0). The one enrolled surface in the neighbourhood, `scripts/scan-interaction-timings.ts`, is deliberately NOT edited. No enrolled surface is touched and nothing is enrolled under review pressure.
- **Advisory locks (invariant 2):** none. No table is mutated by this diff.
- **Invariant 9 (Supabase call boundary):** no new Supabase call. `clearAction` arrives as a prop and is unchanged.
- **Invariant 10 (mutation-surface observability):** no route handler and no `"use server"` action is added or edited. `AvatarMenu` is a client island.
- **Layout-dimensions task:** N/A. No fixed-height or fixed-width parent gains a flex or grid child; the announcer is an `sr-only` span and the menu item's box is unchanged.

## The mechanism

**Round 1 rewrote this section, and the rewrite is structural rather than documentary.** The first draft derived busy from `switchPending`, React's own `useTransition` flag, and treated it as if it described THIS attempt. The consequence was measured rather than reasoned about: start a clear, let the watchdog fire, retry, and let the RETRY settle while the first is still hung, and the row stayed busy with a successful clear behind it. A failed retry put the alert on a busy row, and the timeout then painted the timed-out affordance and the alert together. Those are observable states outside the five the inventory declared, so the model was not merely incomplete, it was false. AC-9 is the pair of cases that now holds this closed, in both settlement orders.

The repair is to stop reading React's flag at all. This component's busy-ness is its own three-valued phase, set synchronously at submit and cleared by the attempt that owns it:

```tsx
import { unstable_rethrow } from "next/navigation";

const [switchPhase, setSwitchPhase] = useState<"idle" | "pending" | "timedout">("idle");
// `useTransition` stays as the SCHEDULING wrapper for the async work, and is
// NOT the source of truth for anything rendered. Reading its pending flag put
// the row in states the inventory forbids; the case that catches a return to
// it is avatarMenu.test.tsx's "the RETRY settles ok while the first is still
// hung", which requires the row enabled once the live attempt lands.
const [, startSwitch] = useTransition();

/** Every pending affordance reads THIS. */
const switchBusy = switchPhase === "pending";

useEffect(() => {
  if (switchPhase !== "pending") return;
  const timer = setTimeout(() => {
    // Reading the phase functionally, so a callback arriving after the settle
    // finds "idle" and returns. Do not simplify this to a bare
    // setSwitchPhase("timedout"): the cleanup above does not cover every
    // arrival order, and the case that fails when it is simplified is
    // avatarMenu.test.tsx's "a settle and a due watchdog in one flush leave
    // the alert standing alone".
    setSwitchPhase((phase) => (phase === "pending" ? "timedout" : phase));
  }, PENDING_TIMEOUT_MS);
  return () => clearTimeout(timer);
}, [switchPhase]);
```

The retry arms a fresh window for free: it moves the phase `timedout` to `pending`, the effect's only dependency changes, and a new timer is armed. Unmount and an ordinary settle both clear the old one through the cleanup. What the cleanup cannot do is unfire a callback that has already run, which is why the callback carries its own predicate rather than trusting that it was cancelled.

**There was a SECOND guard here and round 3 removed it.** Rounds 2 and 3 both stated that an attempt ordinal inside the callback was load-bearing, stopping a stale callback from ending a later attempt's window. Round 3 pointed out that the case meant to prove it never queued a stale callback at all, and the honest follow-up was to run the mutant instead of rewriting the case. Three interleavings, each with the ordinal and without it, produced identical output: with the effect keyed on the phase, every phase change cancels the previous timer before a later attempt exists, so no interleaving reaches the callback with a stale ordinal. The ordinal was defensive code with no failing case behind it, so it is gone, along with the acceptance criterion that claimed to prove it and the mutant that claimed to check it. The ordinal in the SETTLE path stays, because AC-5 does demonstrate that one.

The announcement is derived from the phase, one branch each, so no state can hold pending text while the row is enabled:

```tsx
let switchAnnouncement = "";
if (switchPhase === "pending") switchAnnouncement = "Switching person";
else if (switchPhase === "timedout") switchAnnouncement = SWITCH_TIMEOUT_NOTICE;
```

The submit path carries the other two round-1 repairs. A monotonic attempt ordinal drops a superseded attempt's late result, because enabling a retry is what makes a first attempt's failure arrive while a second is in flight (AC-5). And the `await` is wrapped: unwrapped, a rejected clear took the whole component off screen instead of reporting, which AC-10 pins by wrapping the menu in an error boundary and requiring that the boundary catch nothing. Losing the whole crew page because one switch tap's round trip failed is worse than the failure it reports, and this component already owns the right copy for it.

**The submit path is NOT restated here, and that is the structural repair.** Three review rounds in a row found stale prose about this component's mechanism, and every one of them was a COPY of the implementation living somewhere a reader could follow. This block was the worst of them: it still showed the phase write and the re-entry guard inside `onSwitchSubmit`, and an implementer following it would have moved the phase back into the form action and recreated the defect where a hung action never commits its own pending state. Fewer copies is the only repair that terminates; a guard over prose is a recognizer, and this repo already documents where those go.

What the plan owes is the CONTRACT and the reasons, which no copy of the code can carry:

- The re-entry guard and the phase write live in the submit button's `onClick`, never in the form action. React 19 holds updates scheduled inside an action until the action settles, so a clear that never settles never commits its own pending state. Measured at `aria-disabled="false"` with the action already called.
- A monotonic attempt ordinal drops a superseded attempt's late result, and it comes BEFORE the rethrow, so a redirect requested by a clear the person already superseded is not this row's to follow.
- The classifier is `unstable_rethrow` from `next/navigation`, not a `digest` type test, because Next stamps ordinary server failures with opaque string digests too.
- The failure branch writes the same generic copy whichever way the clear failed.

The implementation is `components/auth/AvatarMenu.tsx`, and its comments name the case that fails if any of the four is simplified away.

An error is never observed while the row is busy. That is pinned by AC-9's fail-order case, which reads `aria-disabled` at the moment the alert appears and requires `"false"`; the plan does not say why beyond that, because the why is React's and the case is ours.

**Probed before it was written into this plan, both rounds.** A standalone component with exactly this shape, driven under fake timers:

```
round 1 F1  retry settles ok while the first hangs    row enabled  status ""
round 1 F1  then the stale first settles              row enabled  status ""
round 1 F1  retry FAILS while the first hangs         row enabled  status ""  alert present
round 1 F1  …and 30s later                            row enabled  status ""
round 1 F1  then the stale first failure lands        alert count 1
round 1 F2  rejected action                           row enabled  status ""  alert present  still mounted

round 2 F1  settle and a due watchdog together, NO callback guards   phase=timedout status=error
round 2 F1  the same interleaving, WITH both guards                  phase=idle     status=error
round 2 F1  a stale watchdog against a NEW attempt's window          phase=pending  (window intact)
round 2 F2  unstable_rethrow on an opaque digest "3693416880"        returns; the typeof-string test would have rethrown
round 2 F2  unstable_rethrow on digest "NEXT_REDIRECT;replace;/x;307;"  rethrows
```

The first round-2 line is the fault reproduced: `Open-timedout` and `Open-error` at once, which the five-state model calls impossible. The second is the same interleaving with the callback's functional read in place. The third line was cited in rounds 2 and 3 as proof that a second guard, an attempt ordinal in the callback, was also necessary; round 3 ran the mutant and it was not, so that guard is gone and the line proves only that a later attempt's window is intact, which it is either way.

**Ratified residual, stated rather than hidden, and the sibling's R10 in the menu's own terms.** Once the watchdog has fired, a second tap issues a second `clearIdentity`. That is the accepted price of not stranding the row: the action clears a cookie entry and signs the device out, so a second one lands on an already-cleared entry and a session that is already gone. It is not made impossible and this plan does not claim it is.

## Guard conditions

| Input or condition | Behaviour |
| --- | --- |
| `clearAction` settles inside the window (the ordinary case) | unchanged from today in every observable: `aria-busy` set then removed, announcer `Switching person` then empty, no timeout copy ever rendered |
| `clearAction` never settles | at `PENDING_TIMEOUT_MS` the row re-enables, `aria-busy` is removed, the announcer changes to the timeout notice |
| `clearAction` rejects | caught: the phase returns to idle and the generic failure alert renders, the same copy a `{ ok: false }` produces, with the component still mounted. Pinned by AC-10, whose discriminating assertion is that an error boundary wrapping the menu caught nothing. NOT the same as never settling, and the first draft said it was |
| The component unmounts mid-window | the effect cleanup clears a timer that has not fired. A callback ALREADY QUEUED at that moment still runs and still calls the state setter, and React discards an update to an unmounted component without warning since React 18. Round 3 F5 was right that the earlier wording, "no setState on an unmounted node", promised something this mechanism does not provide; nothing is broken by it, and claiming a guarantee the code does not give is how the next reader gets misled |
| `clearAction` throws Next control flow (a redirect, a not-found) | reaches the error boundary rather than the alert. Pinned by AC-14's redirect case. `clearIdentity` does not redirect today, but its sibling `clearIdentityAndSkip` in the same module does, and a catch that swallowed a redirect would be a live bug |
| `clearAction` rejects with a SERVER-shaped error carrying an opaque digest | reported inline like any other failure, boundary untouched. Pinned by AC-14's opaque-digest case, whose companion redirect case pins the other direction; the pair is what makes the row a claim rather than an assumption |
| A superseded attempt settles, either way | reports nothing at all: the live attempt reports itself |
| The menu is closed mid-window | the window keeps running and the announcer keeps reporting it, both observable with the menu shut; reopening shows the state as it then stands. Pinned by AC-6 |
| Blank `name` and `role` | untouched by this arc; the fallback label contract at `components/auth/AvatarMenu.tsx:71` is not read by anything here |
| `PENDING_TIMEOUT_MS` imported but the module absent | a build error, not a runtime state; there is no defaulting and none is wanted |

## Transition inventory

**Round 3 replaced the five-state model, and the reason is one node.** The announcer is deliberately OUTSIDE the popover and always mounted, so it renders the phase's text whether the menu is open or closed. "Closed" is therefore not one state: closed-while-pending says `Switching person` and closed-while-timed-out says the notice, and there is a reachable transition between them that nobody has to open the menu to observe. Rounds 1 through 3 each patched a model that collapsed those, and a model that collapses an observable difference will keep producing findings, because the findings are correct.

So the state is a PAIR, and saying so makes the table smaller rather than larger. The menu is `closed` or `open`. The switch is `idle`, `pending`, `timedout`, or `error`. They are INDEPENDENT, with exactly one coupling, and the independence is the claim worth testing rather than asserting:

- Opening and closing neither advances nor cancels the switch axis. C4 is the case that proves it, by letting the window expire while the menu is CLOSED and reading the announcer without reopening. The claim is the case; the reason it holds is where the nodes sit, and that is not asserted here.
- The one coupling is `openAt`, which resets `switchStatus` to idle and touches nothing else (`components/auth/AvatarMenu.tsx:185`). So `error` cannot survive a reopen, which is why closed-while-error is not an observable configuration: the alert lives inside the popover, and the reopen that would reveal it clears it first.
- `error` excludes `pending` and `timedout` on the switch axis. Pinned by AC-9's fail-order case: the alert is present and the row reads enabled in the same assertion.

That leaves seven observable configurations rather than five: `closed × {idle, pending, timedout}` and `open × {idle, pending, timedout, error}`. Enumerating all twenty-one pairs would be a table nobody reads and the code does not need, because the two axes are independent: what needs enumerating is each axis's own transitions, plus the cases where they interact. Both are below, and the interactions are the compounds.

**The two tables are NOT restated here.** They live in the canonical §4.6 of `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md`, which this arc amends, and invariant 7 makes that copy the one that governs. Keeping a second copy in the plan is what produced the last finding of the arc: both copies claimed `error→idle` happens "only when a retry SUCCEEDS", and both were wrong in the same way, because a close-then-reopen resets `switchStatus` without submitting anything (`tests/components/auth/avatarMenu.test.tsx:592` pins it). Two copies of one table drift together until a reviewer reads the code instead, and then they are wrong in stereo.

What the plan keeps is the part the spec does not carry: the compounds, and which case pins each.

Compounds, which is where this class of bug actually lives:

- **C1 — the settle lands after the watchdog re-enabled the row, with no retry.** The announcer must empty rather than hold the timeout notice, and the row must not bounce back to disabled.
- **C2 — a retry starts while the first clear is still in flight.** `clearAction` is called a second time, the row is busy again, and the new window is a full `PENDING_TIMEOUT_MS` rather than the remainder of the old one.
- **C3 — the first attempt fails after the retry started.** No alert paints; the ordinal drops the superseded result and the live attempt keeps the row busy.
- **C4 — the menu is closed WHILE PENDING and the window expires while it is still closed.** This is the independence claim made executable, and round 3 was right that the earlier version did not test it: advancing past the window and only then closing proves that a timed-out phase survives a close, which is a much weaker statement and cannot detect a watchdog that was cancelled by the close or conditioned on `open`. The announcer is outside the popover, so the flip from `Switching person` to the notice is observable WITHOUT reopening, and the case reads it there. Reopening afterwards must then show the row enabled.
- **C5 — a theme flip while timed out.** Independent state; the menu stays open and the switch row keeps its own state.
- **C6 — the INVERSE settlement order: the retry settles while the first attempt is still hung** (round 1 F1). Both directions of it, because they fail differently. Retry succeeds: the row returns to enabled and the region empties, rather than staying busy until a second watchdog fires. Retry fails: exactly one alert, the row enabled, the region empty, and it must STAY that way past the moment the retry's own watchdog would have fired, since a phase that never returned to idle would paint the timeout notice on top of the alert. The stale first attempt then settling adds nothing in either direction.
- **C8 — the settle and the watchdog come due together** (round 2 F1). The queued callback must not write `timedout` over a phase the settle already returned to idle, and the error the settle reported must stand alone.
- **C9 — a timer left over from a SETTLED attempt arrives during a later attempt's window** (diff round 1 F2 restored this row; an earlier C9 described a guard round 3 deleted, and the id was reused by the behavioural suite without the list following). Attempt 1 settles well inside its window so its timer is still armed, the retry starts before that timer is due, and the stale callback would find the phase at `pending`, which is the NEW attempt's. What the effect cleanup is for, and AC-13 is the case that proves it.
- **C10 — the action rejects with a SERVER-shaped error carrying an opaque digest** (round 2 F2). Reported inline like any other failure, because an opaque digest is what an ordinary server-action failure looks like; only real Next control flow is rethrown.
- **C7 — the action REJECTS rather than resolving** (round 1 F2). The component stays mounted, the row returns to enabled, the region empties, and the generic failure alert renders. Without the catch the nearest error boundary replaces the component and none of the above is observable.

## Copy

`SWITCH_TIMEOUT_NOTICE = "Still switching. Try again."` Accurate at the moment it renders: the clear has NOT been abandoned, it has stopped being a reason to keep the row inert. Two sentences rather than one clause, because the second is the instruction and it should not have to be inferred. No em dash, no apostrophe, no error code (invariant 5 does not apply: this is UI copy, not a catalogued code). The pre-code mechanical checklist otherwise finds nothing to change: `itemClass` already carries `min-h-tap-min` (`components/auth/AvatarMenu.tsx:237`), the announcer inherits `sr-only`, and no colour token is added or repurposed.

## Files touched

components/shared/pendingTimeout.ts (new), `components/auth/AvatarMenu.tsx`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`, `tests/styles/tapTargetCensus.ts`, `DESIGN.md`, `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md`, `tests/components/auth/avatarMenu.test.tsx`, tests/components/auth/avatarMenuTransitionAudit.test.ts (new), this plan and its `closeout.md`, `BACKLOG.md`, `BACKLOG-archive.md`.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the watchdog, on one shared constant

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` red-state=authored red-target=`components/auth/AvatarMenu.tsx:108` why=`switchPending comes straight from useTransition with no watchdog beside it and onSwitchSubmit guards re-entry on that raw flag, so every new case asserting the row re-enables at 8s, that a retry reaches clearAction a second time, that the announcer swaps to the timeout notice, or that a rejected clear leaves the component mounted with an alert, fails until the switchPhase machine, its timer and its catch land` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11,AC-12,AC-13,AC-14,AC-15,AC-16,AC-17 -->

**What is red and why.** A new describe in `tests/components/auth/avatarMenu.test.tsx` holds a `clearAction` unresolved and advances fake timers past 8,000 ms. On the live tree `switchPending` is the raw `useTransition` flag (`components/auth/AvatarMenu.tsx:108`) and the re-entry guard reads it (`components/auth/AvatarMenu.tsx:116`), so the row stays `aria-disabled="true"`, `aria-busy="true"`, the announcer keeps reading `Switching person`, and the second tap never reaches `clearAction`. That was measured, not predicted: the reachability probe above ran exactly this shape against the unmodified component and passed. Every new case therefore fails until the implementation lands.

**Acceptance criteria.**

- AC-1: with a clear that never settles, at 7,900 ms the row still reads `aria-disabled="true"` with `aria-busy="true"` and the announcer reads `Switching person`; at 8,100 ms `aria-disabled` is `"false"`, `aria-busy` is absent, and the announcer reads the timeout notice. Pinned from both sides, so a mutant with any shorter timeout fails the first half. (discharged by Task 1)
- AC-2: after the watchdog has fired, a second submit calls `clearAction` a second time, returns the row to `aria-disabled="true"`, and arms a FRESH window: still busy 7,900 ms after the RETRY, which is 16,000 ms after the first tap, and enabled 200 ms later. The premise is stated on the case's own inputs BEFORE the retry: busy at the start, then the timeout notice present, which together are true of no other state. Asserting only that the row is enabled would have been satisfied by ordinary idle (the round-1 F3 shape, swept across every case here). (discharged by Task 1)
- AC-3: a clear that settles at 500 ms behaves exactly as today: busy then not, announcer `Switching person` then empty, and the timeout notice never appears in the document. The existing cases at `tests/components/auth/avatarMenu.test.tsx:647` and `tests/components/auth/avatarMenu.test.tsx:674` pass with no edit. (discharged by Task 1)
- AC-4: compound C1. The clear settles at 20,000 ms with no retry: the announcer is empty, the row is enabled, and `clearAction` was called exactly once. (discharged by Task 1)
- AC-5: compound C3. The first attempt resolves `{ ok: false }` AFTER a retry has started: no `role="alert"` is in the document and the row is still busy for the live attempt. When the retry then fails on its own, the alert DOES appear, so the case cannot pass by the component having stopped reporting failures at all. (discharged by Task 1)
- AC-6: compound C4, and it is the independence claim rather than a survival claim. The menu is closed while the row is PENDING, the clock then crosses the window with the menu still closed, and the announcer, which is outside the popover, is read there: it must have flipped from `Switching person` to the notice with nobody reopening anything. Reopening then shows the row enabled. Round 3 F3: the earlier version advanced past the window BEFORE closing, which proves only that an already-timed-out phase survives a close and cannot detect a watchdog cancelled by the close or conditioned on `open`. (discharged by Task 1)
- AC-7: `PENDING_TIMEOUT_MS` has exactly one declaration and both consumers import it. **Discharged entirely by `tests/docs/_metaInteractionTimingInventory.test.ts`, with NO embedded case, and round 2 F4 is why.** A case that advances the imported constant and asserts the row flips cannot tell the shared constant from a component-local `8_000`: both produce the same behaviour, so it would pass by numeric coincidence while claiming to pin linkage. The derived guard genuinely pins it, because a second declaration anywhere under `app/**` or `components/**` (a named constant, or a bare literal delay the scanner reports as `timer(8000)`) becomes a new scanner row and reds the parity test until `DESIGN.md` lists it. Dropping the case also removes the test file's import of a module the GREEN step creates, which is what made the declared RED unreproducible in TDD order (round 2 F3). (discharged by Task 1)
- AC-8: `tests/show/pickerAffordance.test.tsx` and `tests/show/claimedRowTransitionAudit.test.ts` pass with no edit, so the hoist changed the sibling's behaviour and its conditional census not at all. Verified at plan time: the census counts `? (`, `&& (` and `if (` and totals 7 before the hoist and 7 after, against `DECLARED.length` of 7. (discharged by Task 1)
- AC-9: compound C6, both directions. With the first attempt still hung, a retry that RESOLVES ok leaves the row enabled, the announcer empty and no alert, and the stale first settle changes nothing. A retry that FAILS leaves the row enabled, the announcer empty and exactly ONE alert, and it is still exactly that 30,000 ms later, so a phase that never returned to idle would paint the timeout notice over the alert and fail here. The stale first failure adds no second alert. (discharged by Task 1)
- AC-10: compound C7, on the same boundary harness. A rejection with NO digest at all (`new Error("network")`, a transport fault rather than a server-reported one) leaves the boundary untouched, the component mounted, the row enabled, the announcer empty and the generic alert rendered. Kept as its own case because it is the shape with no digest to classify at all, and because it is the case round 1 filed. (discharged by Task 1)
- AC-11: `tests/styles/tapTargetCensus.ts`'s row for the sibling names line 87 rather than 101, and `tests/styles/interactiveScanCore.test.ts` passes. The census is DERIVED from a scan, so the row must follow the button the hoist moved. (discharged by Task 1)
- AC-12: compound C8. With the settle resolved and the watchdog due in the same flush, the phase ends `idle` and the alert stands alone. **Green before and after, and mutant-directed rather than tree-directed:** with no watchdog at all nothing writes over the settled state either, so this case does not discriminate against today's tree. It discriminates against the shipped mechanism with the functional read removed, which is the mutant that reintroduces round 2 F1. That mutant is MANDATED in the task's mutant list, not assumed: the standalone probe reported `phase=timedout status=error` without the guard and `phase=idle status=error` with it, and the same must be observed on the real component before the diff is dispatched. (discharged by Task 1)
- AC-13: compound C9, and it exists because a mutant said it had to. Round 3 deleted an earlier AC-13 whose target turned out not to be load-bearing; running the mandated mutant list at implementation found the reverse case, the effect's `clearTimeout` cleanup, reddening NOTHING. Attempt 1 settles well inside its window so its timer is still armed, the retry starts before that timer is due, and the stale callback would find the phase at `"pending"` (the NEW attempt's) and end a window that is not its own. Verified: with the cleanup deleted this is the one case that reds. (discharged by Task 1)
- AC-14: compound C10, both directions of the classifier, asserted THROUGH THE COMPONENT rather than through Next's classifier. The menu renders inside a test error boundary and the same harness runs twice. A rejection carrying `"NEXT_REDIRECT;replace;/x;307;"` must reach the boundary: `boundaryCaught` true, the row gone. A rejection carrying the opaque `"3693416880"`, the shape the installed Next 16.3.0 produced for an ordinary server failure, must NOT: boundary untouched, row present and enabled, the generic alert rendered. Probed on that harness before it was written down, and the two lines are the whole finding: `REDIRECT boundaryCaught=true rowPresent=false` against `OPAQUE boundaryCaught=false rowPresent=true status=error`. Round 3 F2: the earlier version called `unstable_rethrow` directly, which tests Next's classifier and not this component, and then let the redirect reject inside a bare `act`, where the rethrow fails the case rather than being asserted. (discharged by Task 1)
- AC-15: tests/components/auth/avatarMenuTransitionAudit.test.ts exists and passes. Every conditional the TypeScript AST finds in `components/auth/AvatarMenu.tsx` carries a DECLARED row with a §4.6 treatment, and the check is one-to-one in BOTH directions, a bIJECTION rather than a count: every AST site must be matched by a row and every row must match a site, so a branch added later fails by NAME with its line and text. Thirty sites today. Round 2 F5 required the audit at all; diff round 1 F1 replaced its regex census with the AST after measuring that the regex saw 7 of 12 ternaries, missed the keyboard `switch`, and counted a comment. Reachability proved rather than assumed: a planted `switchBusy ? 0 : 1` reds it by name. (discharged by Task 1)
- AC-17: the impeccable critique's P1, fixed in-branch. The timed-out phase renders a VISIBLE note as a sibling of `role="menu"`, carrying the same sentence the announcer does, `aria-hidden` so exactly one node speaks. Absent while merely pending. The critique's finding was that a sighted crew member otherwise watches the row silently un-dim after eight seconds with nothing explaining it, which for a glancing one-handed reader is close to no state change at all. (discharged by Task 1)
- AC-16: compound C5, which round 2 F5 correctly observed had no case. A theme flip performed while the row is TIMED OUT leaves the menu open, the row enabled and the timeout notice intact, and the theme change survives. The existing compound at `tests/components/auth/avatarMenu.test.tsx:305` runs from open-idle and does not reach this state. (discharged by Task 1)

**RED — write the cases.** A new describe at the end of `tests/components/auth/avatarMenu.test.tsx`, using the module-level `deferredPending` (`tests/components/auth/avatarMenu.test.tsx:49`) and `openMenu` (`tests/components/auth/avatarMenu.test.tsx:54`).

**The block was spliced into the real file at plan time and RUN, and the first draft failed its own RED-validity check.** Every case resolved its held promise at the END of its body, which is fine while the case passes and useless while it does not: AC-1's assertion threw before its resolve, the transition it left in flight was tracked past unmount, and the unchanged-behaviour case (AC-3) then went red because its submit was swallowed by the pending guard — the leak the file already records against `onSwitchSubmit` at `tests/components/auth/avatarMenu.test.tsx:675-681`. A red that a later edit to the test file turns green is not evidence about the implementation. The shipped block retires deferreds in an inner `afterEach` instead, so each case's verdict is its own. Re-run after that repair, against the UNMODIFIED component with the constant module present:

```
 × re-enables the row at the timeout and says so (AC-1)     re-enabled just after 8s: expected 'true' to be 'false'
 × admits a retry after the timeout (AC-2)                  timed out, not merely idle
 × COMPOUND C1 (AC-4)                                       timed out, waiting on the stale settle
 × COMPOUND C3 (AC-5)                                       two attempts in flight: expected 2 times, got 1
 × COMPOUND C4 window expires while CLOSED (AC-6)           the watchdog fired while closed
 × COMPOUND C6 ok-order (AC-9)                              two attempts in flight, the older one hung
 × COMPOUND C6 fail-order (AC-9)                            two attempts in flight, the older one hung
 × COMPOUND C5 theme flip while timed out (AC-16)           timed out before the theme flip
 × COMPOUND C7 transport rejection (AC-10)                  not framework control flow: expected true to be false
 × COMPOUND C10 opaque digest (AC-14)                       an opaque digest is not control flow: expected true to be false
 Tests  10 failed | 40 passed (50)

 tests/components/auth/avatarMenuTransitionAudit.test.ts
 Tests  10 failed | 16 passed (26)   bijection: every AST site declared
```

Ten red in the behavioural suite and ten in the audit, each on its own first assertion, with the 38 existing cases untouched. The two rejection reds are the fault stated as a boundary observation rather than as an escaping error: today there is no catch, so BOTH a transport rejection and an opaque server digest reach the boundary, and `expected true to be false` is that. The third rejection case, the real `NEXT_REDIRECT`, is green in this run and stays green, because reaching the boundary is what SHOULD happen to control flow; it is the invariant the repair must not break. **This run had NO components/shared/pendingTimeout.ts on disk**, which is the point of round 2 F3: the cases no longer import a module the GREEN step creates, so the RED is reproducible in the order the plan states rather than only with the implementation half-landed. `pnpm typecheck` was clean over the splice.

Three of the four rejection-shaped reds are the fault itself escaping: `Error: network`, `Error: server` and `Error: NEXT_REDIRECT` are unhandled rejections leaving the transition, which is exactly what the catch converts into the inline alert for the first two and deliberately preserves for the third.

**AC-3, AC-12 and AC-14's redirect half are green in this run and stay green after**, and each says so at its own site. AC-3 is the unchanged-behaviour guard: green before, green after, red if the watchdog ever leaks into the ordinary path. AC-12 is mutant-directed, because with no watchdog nothing writes over a settled state either. AC-14's redirect half is the preserved invariant. All three have mandated mutants below rather than assumed ones. `pnpm typecheck` was clean over the spliced file, so the snippets compile under `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` as written. The splice was then reverted; the tree is back to the plan commit.

```tsx
describe("the switch-person watchdog (BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG)", () => {
  const NOTICE = "Still switching. Try again.";
  /**
   * The window these cases step over, as a LITERAL. Deliberately not the
   * imported constant: a case that reads the constant cannot tell it from a
   * component-local copy of the same number, so it would pass by coincidence
   * while claiming to pin linkage (round 2 F4), and importing a module the
   * GREEN step creates is what made the declared RED unreproducible in TDD
   * order (round 2 F3). One definition is pinned by the DERIVED inventory guard
   * instead, which can actually tell the difference.
   */
  const PENDING_WINDOW_MS = 8_000;

  /**
   * Every deferred this describe hands out, retired after the case whatever the
   * case did. A FAILING assertion returns before its own resolve, and the
   * transition it leaves in flight is tracked past unmount, so the next case's
   * submit is swallowed by the pending guard and it fails for a reason that is
   * not its own. That is measured, not feared: it is the same leak the file
   * already records against the pending guard at
   * tests/components/auth/avatarMenu.test.tsx:675-681, and the first draft of
   * this describe reproduced it (one red case turned the unchanged-behaviour
   * case red too, which would have made a harness artifact look like the
   * implementation's absence).
   */
  const outstanding: ((value: ClearIdentityResult) => void)[] = [];

  function held() {
    const d = deferredPending<ClearIdentityResult>();
    outstanding.push(d.resolve);
    return d;
  }

  /** A deferred this describe can REJECT, for the rejection cases. */
  function rejectable() {
    let reject!: (reason: unknown) => void;
    let resolve!: (value: ClearIdentityResult) => void;
    const promise = new Promise<ClearIdentityResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    outstanding.push(resolve);
    return { promise, reject };
  }

  afterEach(async () => {
    const pending = outstanding.splice(0);
    // Resolve BEFORE the file-level cleanup unmounts, which is why this hook
    // sits in the inner describe: an inner afterEach runs first.
    await act(async () => {
      for (const resolve of pending) resolve({ ok: true });
      await Promise.resolve();
    });
    vi.useRealTimers();
  });

  /** The menu, open, plus the two nodes every case reads. */
  function mount(action: (formData: FormData) => Promise<ClearIdentityResult>) {
    render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);
    openMenu();
    return {
      item: screen.getByTestId("avatar-menu-switch-person"),
      region: screen.getByTestId("avatar-menu-switch-announcer"),
    };
  }

  /** Two attempts, in order, for every case that drives a retry. */
  function twoAttempts() {
    const first = held();
    const second = held();
    const action = vi
      .fn<(formData: FormData) => Promise<ClearIdentityResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    return { first, second, action };
  }

  it("re-enables the row at the timeout and says so, pinned from both sides (AC-1)", () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise: the case only discriminates if the tap actually started a clear.
    // An action never called would end idle too, and every assertion below
    // would hold for the wrong reason.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    // A 1s-to-7s timeout mutant also ends enabled, so the window is pinned from
    // BOTH sides, the sibling's idiom at tests/show/pickerAffordance.test.tsx:153.
    expect(item.getAttribute("aria-disabled"), "still busy just before 8s").toBe("true");
    expect(item.getAttribute("aria-busy"), "still busy just before 8s").toBe("true");
    expect(region.textContent, "still announcing just before 8s").toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "re-enabled just after 8s").toBe("false");
    expect(item.getAttribute("aria-busy"), "not busy just after 8s").toBeNull();
    expect(region.textContent).toBe(NOTICE);
  });

  it("admits a retry after the timeout, on a fresh window (AC-2)", () => {
    vi.useFakeTimers();
    const { action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise, stated so that no other state satisfies it: busy first, then the
    // TIMEOUT NOTICE. Asserting only "enabled" would be equally true of
    // ordinary idle, which is the round-1 F3 defect swept across every case.
    expect(item.getAttribute("aria-disabled"), "busy before the window elapses").toBe("true");
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    expect(region.textContent, "timed out, not merely idle").toBe(NOTICE);

    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the second tap reached clearAction").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    // A FRESH window, not the remainder of the old one: 7,900ms past the retry
    // is 16,000ms past the first tap.
    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    expect(item.getAttribute("aria-disabled"), "the retry has its own 8s").toBe("true");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "and it expires on schedule").toBe("false");
  });

  it("a clear that settles inside the window is untouched by the watchdog (AC-3)", async () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Premise: the clear ran and is still inside the window at the moment it
    // settles, so this case is the ordinary path and not a disguised timeout.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-busy"), "settling inside the window").toBe("true");
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(item.getAttribute("aria-busy")).toBeNull();
    expect(region.textContent).toBe("");
    expect(document.body.textContent).not.toContain(NOTICE);

    // …and the notice does not arrive late, once the old timer's moment passes.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(region.textContent).toBe("");
  });

  it("COMPOUND C1: the stale settle empties the region and does not re-disable the row (AC-4)", async () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(region.textContent, "timed out, waiting on the stale settle").toBe(NOTICE);

    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(region.textContent).toBe("");
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("COMPOUND C3: a superseded failure paints no alert, but the live one still does (AC-5)", async () => {
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    // Premise: there really are two attempts in flight, so "no alert" below is
    // the ordinal dropping a superseded result and not an absent one.
    expect(action, "two attempts in flight").toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(screen.queryByRole("alert"), "the superseded failure is dropped").toBeNull();
    expect(item.getAttribute("aria-disabled"), "the live retry keeps the row busy").toBe("true");

    // The component has NOT stopped reporting failures: the LIVE attempt's
    // failure still paints. Without this half, a mutant that never sets the
    // error state at all would pass the assertion above.
    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    // getBy, not findBy: findBy polls on REAL timers and this case holds fake
    // ones, so it would sit until vitest's 30s deadline. Measured.
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("COMPOUND C4: the window expires while the menu is CLOSED (AC-6)", () => {
    // Round 3 F3. The earlier version timed out BEFORE closing, which proves
    // only that a timed-out phase survives a close: it cannot tell a live
    // watchdog from one the close cancelled or that was conditioned on `open`.
    // Here the menu is closed while PENDING and the clock crosses the window
    // with it still closed. The announcer sits outside the popover, so the flip
    // is observable without reopening, and that is the independence claim.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(region.textContent, "pending, not yet timed out, before the close").toBe(
      "Switching person",
    );

    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-trigger")); // close, still pending
    });
    expect(screen.queryByTestId("avatar-menu-popover"), "the menu really is closed").toBeNull();
    expect(
      screen.getByTestId("avatar-menu-switch-announcer").textContent,
      "still pending while closed",
    ).toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    // The whole case: the watchdog ran while the menu was closed, and the
    // always-mounted announcer says so without anyone reopening it.
    expect(
      screen.getByTestId("avatar-menu-switch-announcer").textContent,
      "the watchdog fired while closed",
    ).toBe(NOTICE);

    openMenu();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe(NOTICE);
  });

  it("COMPOUND C6: the RETRY settles ok while the first is still hung (AC-9)", async () => {
    // Round 1 F1. React entangles pending across transitions from one hook, so
    // a busy flag derived from it stays true here and the row would sit
    // disabled until a SECOND watchdog fired. The phase is this component's
    // own, so it does not.
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "two attempts in flight, the older one hung").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled"), "busy on the retry").toBe("true");

    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(item.getAttribute("aria-disabled"), "the retry settling ends the busy state").toBe(
      "false",
    );
    expect(region.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();

    // The older attempt is still hung. Its window would have expired long ago;
    // nothing may come back on screen.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(region.textContent).toBe("");

    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(region.textContent).toBe("");
  });

  it("COMPOUND C6: the RETRY fails while the first is still hung (AC-9)", async () => {
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "two attempts in flight, the older one hung").toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    expect(screen.getByRole("alert")).toBeTruthy(); // getBy: fake timers, see AC-5
    expect(screen.queryAllByRole("alert")).toHaveLength(1);
    expect(item.getAttribute("aria-disabled"), "a reported failure is not a busy row").toBe(
      "false",
    );
    expect(region.textContent).toBe("");

    // Past the moment the retry's own window would have closed. A phase that
    // never returned to idle would paint the timeout notice over the alert.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(region.textContent, "no late timeout notice on top of the alert").toBe("");
    expect(screen.queryAllByRole("alert")).toHaveLength(1);

    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(screen.queryAllByRole("alert"), "the stale failure adds nothing").toHaveLength(1);
  });

  it("COMPOUND C8: a settle and a due watchdog in one flush leave the alert standing alone (AC-12)", async () => {
    // Round 2 F1. The callback is already QUEUED when the settle schedules its
    // update, and clearTimeout cannot unfire it. Probed without the callback's
    // the guard: phase=timedout status=error, the combination §4.6 forbids.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled"), "busy before the boundary").toBe("true");

    // Resolve OUTSIDE act so the transition update is scheduled but not yet
    // committed, then let the due timer fire before that commit. This exact
    // interleaving is what reproduces the fault; resolving inside act does not.
    first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    await Promise.resolve();
    await Promise.resolve();
    await act(async () => {
      vi.advanceTimersByTime(PENDING_WINDOW_MS);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(region.textContent, "no timeout notice over a settled clear").toBe("");
    expect(item.getAttribute("aria-disabled"), "settled, not timed out").toBe("false");
    expect(screen.getByRole("alert")).toBeTruthy(); // getBy: fake timers, see AC-5
  });

  it("COMPOUND C5: a theme flip while TIMED OUT leaves the row and the notice alone (AC-16)", () => {
    // Round 2 F5: C5 was declared with no case that ever enters timed-out. The
    // existing compound at tests/components/auth/avatarMenu.test.tsx:305 runs
    // from open-idle.
    vi.useFakeTimers();
    document.documentElement.dataset.theme = "light";
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_WINDOW_MS + 100);
    });
    // Premise on this case's own inputs: genuinely timed out before the flip.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(region.textContent, "timed out before the theme flip").toBe(NOTICE);

    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-theme"));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("menu"), "the menu stays open").toBeInTheDocument();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe(NOTICE);
  });
  /**
   * The rejection cases render the menu inside an error boundary, because
   * "did the component rethrow" is only answerable by asking what the boundary
   * caught. Round 3 F2: calling `unstable_rethrow` directly in the test asserts
   * Next's classifier rather than this component, and letting a control-flow
   * rejection escape a bare `act` fails the case instead of proving anything.
   */
  class CatchBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
    // `override` on both: this repo's tsconfig sets noImplicitOverride, and
    // without it typecheck fails TS4114 while vitest passes, which is the
    // strip-types trap the writing-plans rule exists for.
    override state = { caught: false };
    static getDerivedStateFromError() {
      return { caught: true };
    }
    override render() {
      return this.state.caught ? <div data-testid="switch-boundary" /> : this.props.children;
    }
  }

  /** Reject one clear with `thrown`, and report what the boundary saw. */
  async function rejectWith(thrown: unknown) {
    const attempt = rejectable();
    const action = vi.fn(() => attempt.promise);
    render(
      <CatchBoundary>
        <AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />
      </CatchBoundary>,
    );
    openMenu();
    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    // React logs a caught boundary error; silence it so a PASSING case is quiet.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        attempt.reject(thrown);
        await attempt.promise.catch(() => {});
      });
    } catch {
      // A rethrown control-flow error surfaces here. That it surfaced is not
      // the assertion; what the boundary caught is.
    }
    logged.mockRestore();
    return { caught: screen.queryByTestId("switch-boundary") !== null };
  }

  it("COMPOUND C7: a transport rejection with no digest reports inline (AC-10)", async () => {
    const { caught } = await rejectWith(new Error("network"));
    expect(caught, "not framework control flow, so nothing reaches the boundary").toBe(false);
    expect(screen.queryByTestId("avatar-menu"), "the component is still mounted").not.toBeNull();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe("");
  });

  it("COMPOUND C10: an OPAQUE server digest reports inline, it does not reach the boundary (AC-14)", async () => {
    // "3693416880" is the shape the installed Next produced for an ORDINARY
    // server failure. The digest test round 2 refuted would send this one to
    // the boundary, which is the fault the catch exists to prevent.
    const { caught } = await rejectWith(
      Object.assign(new Error("server"), { digest: "3693416880" }),
    );
    expect(caught, "an opaque digest is not control flow").toBe(false);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("COMPOUND C9: a timer left over from a settled attempt does not end the next one's window (AC-13)", async () => {
    // What the effect cleanup is FOR, and the case exists because deleting the
    // cleanup reds nothing else in this file. Attempt 1 settles well inside its
    // window, so its timer is still armed; the retry then starts before that
    // timer is due, and the stale callback would find the phase at "pending",
    // which is the NEW attempt's, and end a window that is not its own.
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    // Premise on this case's own inputs: attempt 1 really settled, and it did so
    // with its timer still armed, which is the only situation this case is about.
    expect(item.getAttribute("aria-disabled"), "attempt 1 settled inside its window").toBe("false");

    act(() => {
      vi.advanceTimersByTime(100);
      fireEvent.click(item);
    });
    expect(action, "attempt 2 started").toHaveBeenCalledTimes(2);

    // t = 8,100 from the first tap, so attempt 1's timer was due 100ms ago.
    // Attempt 2 is only 7,500ms into its own window and must still be busy.
    act(() => {
      vi.advanceTimersByTime(7_500);
    });
    expect(item.getAttribute("aria-disabled"), "attempt 2's window is its own").toBe("true");

    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
  });

  it("the timeout is VISIBLE, not only announced, and does not double-announce (AC-17)", () => {
    // Impeccable critique P1. A sighted person otherwise watches the row
    // silently un-dim after eight seconds with nothing saying why. The note is
    // aria-hidden so the always-mounted status region stays the single channel
    // to assistive tech; two nodes carrying this sentence would announce twice.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("avatar-menu-switch-timeout-note"),
      "no note while merely pending",
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    const note = screen.getByTestId("avatar-menu-switch-timeout-note");
    expect(note.textContent).toBe(NOTICE);
    expect(note.getAttribute("aria-hidden"), "hidden from AT, seen by eyes").toBe("true");
    // A sibling of role=menu, never a child: a non-item child of a menu role is
    // invalid ARIA, the same reason the alert sits outside it.
    expect(screen.getByRole("menu").contains(note)).toBe(false);
    // And exactly ONE node speaks: the sr-only region.
    expect(region.textContent).toBe(NOTICE);
    expect(region.getAttribute("aria-hidden")).toBeNull();
  });

  it("COMPOUND C10: a NEXT_REDIRECT digest DOES reach the boundary (AC-14)", async () => {
    // The other direction, and the pair is the point: a case that only ever
    // rejects a bare Error passes under the refuted digest test and under
    // `unstable_rethrow` alike, and so distinguishes nothing.
    //
    // GREEN BEFORE AND AFTER: today there is no catch at all, so control flow
    // reaches the boundary by default. This case is the invariant that the
    // repair must not break, and it is mutant-directed against a catch that
    // swallows everything, which is mandated below.
    const { caught } = await rejectWith(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" }),
    );
    expect(caught, "real control flow is rethrown untouched").toBe(true);
    expect(screen.queryByTestId("avatar-menu-switch-person"), "the row went with it").toBeNull();
  });
});
```

The file needs two new imports for these cases: `Component` and `type ReactNode` from `react`, for the boundary harness; `ClearIdentityResult` is already imported (`tests/components/auth/avatarMenu.test.tsx:27`). `unstable_rethrow` is NOT imported by the test at all any more (round 3 F2: asserting through Next's classifier tests Next, not this component). It must NOT import `PENDING_TIMEOUT_MS` either: that module does not exist until GREEN, and importing it is what made the declared RED unreproducible in TDD order (round 2 F3). Round 3 F4 caught this line still instructing the opposite.

**GREEN — the implementation.**

1. components/shared/pendingTimeout.ts: the constant, carrying the rationale currently at `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:35-48` plus a paragraph for the menu consumer. No `"use client"` — it is a constant, and adding one would put a needless boundary on both importers.
2. `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`: delete the declaration and its comment, import the constant at the top with the other imports. Nothing else in that file moves.
3. `components/auth/AvatarMenu.tsx`: the three-valued `switchPhase` state, the `switchAttempt` ordinal, the watchdog effect whose callback carries ONE guard, the functional read, the derived `switchBusy` and `switchAnnouncement`, the `unstable_rethrow` import, and the wrapped `await` whose catch checks the supersession ordinal BEFORE it rethrows. `aria-disabled` and `aria-busy` on the item read `switchBusy`; the announcer renders `switchAnnouncement`; the re-entry guard reads `switchBusy`. **There is no `switchTimedOut` boolean** — round 2 F6 caught this checklist still naming one from the first draft, and a separate boolean is exactly the shape whose extra state combinations round 1 removed.
4. `DESIGN.md:740`: the owning-file cell becomes components/shared/pendingTimeout.ts, placed in the scanner's walk order.
5. tests/components/auth/avatarMenuTransitionAudit.test.ts (new, authored in RED): the structural audit AC-15 describes.
6. `tests/styles/tapTargetCensus.ts:439`: `line: 101` becomes `line: 87`. Nothing else in that row changes; the reason text is still accurate.
7. `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.6: a dated amendment carrying the TWO-AXIS inventory above (seven observable configurations, the switch-axis table, the menu-axis table, the independence claim and its one coupling) plus the compounds, in the same shape §3 of the connector spec already uses for a ratified change. It replaces §4.6's four-state, six-pair table outright rather than extending it: round 4 F2 caught this step still describing a five-state, ten-pair table that round 3 had already deleted.

**Gate commands.** Each as its own command, none chained into the commit:

```
pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/components/auth/avatarMenuTransitionAudit.test.ts tests/show/pickerAffordance.test.tsx tests/show/claimedRowTransitionAudit.test.ts tests/components/StaleCleanupAutoSubmit.test.tsx tests/docs/_metaInteractionTimingInventory.test.ts tests/styles/interactiveScanCore.test.ts tests/messages/no-inline-error-strings.test.ts
node --import tsx scripts/scan-interaction-timings.cli.ts
pnpm typecheck
pnpm exec eslint .
pnpm format:check
```

**Mutants run before the diff dispatch, each recorded in the commit with the case it reds.** Two groups, and the second exists because two acceptance criteria are green before and after by construction, so a mutant is the ONLY thing that can demonstrate they discriminate at all.

String-presence, per the standing four: (a) `SWITCH_TIMEOUT_NOTICE` emptied; (b) the notice with an appended suffix; (c) the notice present in the module but not rendered, the announcer left on the old two-branch text; (d) the discriminating parameter varied, `PENDING_TIMEOUT_MS` set to 4,000 and to 12,000 in turn.

Mechanism, one per guard the plan claims is load-bearing. **All nine were run at implementation and each red the case named here**; (h) initially red NOTHING, and rather than accept an unheld guard the arc wrote AC-13 for it and re-ran. That is the same move round 3 made in the other direction, where the mutant said to delete the guard instead. (e) the watchdog callback's functional read replaced by a bare `setSwitchPhase("timedout")`, which must red AC-12; (f) `unstable_rethrow(error)` replaced by the `typeof digest === "string"` test round 2 refuted, which must red AC-14's opaque-digest case; (h) the ordinal check in the SETTLE path deleted, which must red AC-5. A guard whose mutant reds nothing is a guard the suite does not actually hold, and it is better to learn that here than from the next reviewer.

**Anti-tautology.** Every case states its premise on its OWN inputs before the assertion that rests on it: the tap reached `clearAction`; the watchdog fired before the retry; the settle landed inside the window; two attempts really were in flight. AC-5 carries the live-failure half specifically so a component that stopped reporting failures at all cannot pass it, and AC-1 pins the window from both sides so a shorter timeout cannot pass by also ending enabled.

**Commit.** `fix(crew-page): a hung switch-person clear re-enables the menu row after 8s`

<!-- tasks: end -->

## Close-out (after Task 1, in this order)

- C1. `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, then `pnpm heavy pnpm test` at the shipping head.
- C2. Invariant 8: both halves of `/impeccable` on the diff, with the canonical v3 setup gates: the context load over PRODUCT.md and DESIGN.md, then the register reference read. Findings and dispositions go in `closeout.md` beside this plan, with the marker line the invariant-8 closeout spec §3.3 defines. The two half-names are spelled out THERE and not here on purpose: `tests/docs/_metaInvariant8Closeout.test.ts` treats a plan unit naming both halves as declaring the gate and demands a conforming marker in the same tree state, so naming them in a plan committed before the gate runs would red the suite for the whole implementation window.
- C3. `pnpm spec:lint docs/superpowers/plans/2026-08-27-avatar-menu-switch-watchdog/plan.md` to 0 hard, and the advisory claim sweep `pnpm spec:lint --repair HEAD --claim-about PENDING_TIMEOUT_MS --also DESIGN.md`.
- C4. Re-read the `red-target=` citation on Task 1's marker and confirm the line it now resolves to still names `useTransition`; record what it resolved to. Confirming that it RESOLVES establishes nothing.
- C5. Whole-diff Codex review to APPROVE. The brief carries REVIEWER ONLY, the consequence bound, the `PROBE DOMAIN:` line, the threat fence, and the do-not-relitigate list from the arc brief.
- C6. Merge `origin/main`; resolve any `BACKLOG.md` conflict by set arithmetic across both parents; archive `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` into `BACKLOG-archive.md` with its reachability now PROBED, and remove the IN PROGRESS marker, both in the PR's LAST commit.
- C7. Push; twelve required contexts green by GraphQL `statusCheckRollup` on the head sha; `git merge-base origin/main HEAD` equal to `git rev-parse origin/main`; READINESS to bl-orch at `wP:p1A`. This arc does not merge.
