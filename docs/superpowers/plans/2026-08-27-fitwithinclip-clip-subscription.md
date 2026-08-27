# Plan: `useFitWithinClip` resubscribes its observed ancestors on every signal

**Spec:** `docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md`.
**Row:** `BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION`. **Branch:** `fix/fitwithinclip-stale-clip-subscription`. **Base:** `4cb585b35`.
**Out of scope:** `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN` is a sibling arc on `components/admin/AnchoredPortal.tsx`; this branch does not touch that file.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit. The `red=` on each marker is the command that must fail before the implementation and pass after.

## Pre-draft code-verification pass

Run before drafting. Every file, symbol, line and case name below was read on this base. Four things it caught, recorded because they are the reason the pass is mandatory:

- **The arc brief says "the three shipped consumers". There is one.** `components/admin/showpage/AttentionMenu.tsx:72` is the only call site. `ReSyncButton` and `PublishedToggle` moved onto `placeWithinVisibleViewport` (`components/admin/ReSyncButton.tsx:206`, `components/admin/PublishedToggle.tsx:268`), recorded at `tests/components/admin/_metaPopoverViewportSource.test.ts:183`. The suite's `(h15)`, `(h16)`, `(h17)` still pin those historical SHAPES, so "unchanged on the shipped consumers" is one live consumer plus three pinned shapes.
- **`useFitWithinClip.ts` is not an enrolled mutation surface.** No `sourcePath` in `tests/mutation/source/registry.ts` names it, checked at Stage 0. No score is owed and none is taken under review pressure.
- **`offsetParent` is `undefined`, not `null`, in unstubbed jsdom.** The existing code guards with `positioned instanceof Element` (`components/admin/useFitWithinClip.ts:183`). A repair that switches to a `!== null` test silently treats `undefined` as a live ancestor. The resolved pair is normalized inside `apply()` so the rest of the hook sees `Element | null` and nothing else.
- **The suite's `(h19)` at `tests/components/admin/useFitWithinClip.test.tsx:579` already builds the first three steps of the row's probe** (mount unclipped, re-render so `outer` clips with `reapplyKey` unchanged, one window resize) and stops at the step before the defect. Task 1's case is its fourth step, not a new fixture.

Baseline: `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` is 33 passed on `4cb585b35`.

## Meta-test inventory

Mandatory per `docs/agents/writing-plans.md`, which accepts "none applies" only when the reason is declared.

**This plan creates no structural meta-test and EXTENDS exactly one.**

`tests/docs/_metaDeferralLedgerGraduation.test.ts` holds a `BACKLOG_GRADUATED` registry at `tests/docs/_metaDeferralLedgerGraduation.test.ts:100`, and every row that leaves the open queue gets an entry there. Task 5 adds one:

```ts
{ id: "BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION", provenance: "fix/fitwithinclip-stale-clip-subscription" },
```

The registry is not decorative and the `provenance` field is not a comment. The guard slices the archive from this id's heading to the next heading at either level and asserts the section CONTAINS that string (`tests/docs/_metaDeferralLedgerGraduation.test.ts:1412-1426`), because the IN PROGRESS marker was the section's only mention of the branch and graduation must REPLACE that mention rather than delete it. So the archived entry names the branch in its own prose, and task 5's gate checks it.

Found by the pre-draft verification pass, not by review. An earlier draft of this section said "extends none", which was the exact shape the meta-test-inventory rule exists to catch at plan time.

The five registries that rule names are Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`), sentinel hiding (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), `admin_alerts.upsert` catalog completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`), advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`), and no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). This diff touches no Supabase call boundary, no DB write, no advisory lock, no `admin_alerts` row and no email path, so none has a new member to register.

Three walkers DO cover the touched file and are checked rather than extended, because their populations do not change:

- `tests/components/_metaScrollNeutralMeasurement.test.ts` walks for cap-clearing assignments outside `withNaturalSize`. This diff adds no `.style.maxHeight = ""` and no `.style.maxWidth = ""`.
- `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` pins `useFitWithinClip` as the DEFINER of the hook and a CONSUMER of `createRafCoalescer` (`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:142`, `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:169`). This diff keeps both roles and adds no new shared helper.
- `tests/components/admin/_metaPopoverViewportSource.test.ts` pins which surfaces read the viewport. This diff adds no viewport read.

**Deliberately NOT proposing a new meta-test for the subscription contract.** The obvious candidate is a walker asserting that every `observer.observe` call site in `components/**` sits behind an identity guard. The population is one file, added by the arc that would add the walker, and its done condition would be a property of the walker rather than a number a product arc or a human would notice moving. That is the shape the 2026-08-25 process mint freeze declines. The contract is held instead by the executable cases in task 3, which assert behaviour rather than syntax.

## Acceptance-criteria coverage map

The criteria are declared in the spec's §8 and are not re-declared here, so the ids below are cited by task markers only.

| Criterion | Task | How it is proved |
| --- | --- | --- |
| AC-1 resolved clip is in the target set | 1 | The row's probe case: the target set is asserted after the corrective signal. |
| AC-2 an unchanged derived set issues no observer call | 4 | Observe and unobserve call logs, delta zero across three signals. Plant: drop the difference guard. |
| AC-3 attach path unchanged on the non-aliasing fixtures | 4 | Target set, ORDER and observer count on both, alongside the existing `(d)`, `(h21)`, `(h22)`. |
| AC-4 the probe transcript ends deliverable | 1 | The stub delivers only to observed targets, so `deliverable` is the assertion rather than a comment. |
| AC-5 positioned role and listener follow | 2 | A positioned swap with no re-attach. |
| AC-6 a resolved null retains that role and its target | 4 | Both roles, each with its own plant. |
| AC-7 no ResizeObserver: no throw, window resize still correct | 4 | The existing `(f)` extended to the new transition and to every reconcile site. |
| AC-8 one extra apply when the reconcile adds a target WITH A BOX, zero otherwise | 4 | The existing counting cases `(h)`, `(h8)`, `(h15)`, `(h17)`, `(h13)` stay green, plus apply-count and walk-count deltas across all four delta classes: adds-with-a-box, adds-only-0x0, removes-only, neither. Expected deltas 1, 0, 0, 0 for BOTH counts, since a walk rides every apply. Run with `deliverInitial: true`. |
| AC-10 every observe requests `{ box: "border-box" }` | 1 | The recorded observe calls, at attach and after a reconcile. Argument-level, with its limit stated: jsdom computes no layout. |
| AC-9 both halves: nothing wanted is unobserved, nothing held is re-observed | 3, 4 | Task 3 asserts the first half on every arrangement where a role re-targets away from an element the other role still wants; task 4 asserts the second from the observe log, which is the only place it is visible. |

## Anti-tautology notes that apply to every case below

- **The `ResizeObserver` stub models the real contract: it delivers ONLY to observed targets.** Every existing stub in this suite accepts a callback and fires it at whatever target the test names, so a case that fires at an unobserved node re-measures anyway and the subscription assertion is decorative. The new stub keeps a target `Set`, and its `resize(target)` returns `false` without firing when the target is not in it. That boolean is the probe transcript's `deliverable` field, promoted from a log line to an assertion.
- **Expected caps are derived through the real `computeFittedMaxHeight`** via the suite's `expectedPx` helper (`tests/components/admin/useFitWithinClip.test.tsx:109`), never typed. A hardcoded `"222px"` would pass against a fixture that cannot reach it.
- **Every case that asserts a changed cap also asserts it DIFFERS from the pre-change cap**, so a case whose geometry mutation silently failed to take cannot report green.
- **Each case states its own premise on its own inputs** with `premiseHolds` (`tests/_shared/premise.ts`), never on a sibling case's.
- **A case whose subject is which observer CALLS were made asserts the CALL LOGS, never a downstream apply count.** The stub delivers only when a test says so, by design, so a spurious `observe()` on an already-held target produces no callback and no apply: an apply-count assertion is blind to exactly the defect it was written for. Plan review round 1 found two cases and one plant resting on that proxy. The rule is derived, not a list: if the acceptance criterion says "issues no observe" or "does not re-observe", the assertion reads `observeLog` and `unobserveLog`.
- **A case whose subject is a DELIVERY consequence needs the stub to model delivery.** AC-8's cost rule is about the initial observation `observe()` emits, which the default stub never emits, so those cases run with `installTargetTrackingObserver({ deliverInitial: true })`. When on, `observe()` schedules ONE delivery through the same held-frame queue the rest of the suite uses, and only when the target's stubbed rect is non-zero, which is how the 0x0 class becomes testable at all. It is off everywhere else, because coupling the subscription cases to delivery behaviour they are not about is how the previous draft's counts became unreadable.
- **A fixture must not let the element under test be held for the OTHER reason.** Round 1's sharpest finding: task 2's original fixture moved the positioned role onto `outer`, which the default harness already holds as the CLIP ancestor, so "outer is observed" and "resize(outer) is deliverable" both passed without any positioned-role reconciliation existing. Aliasing is the subject of task 3 and must be absent from task 2, so task 2 gets a three-level fixture where the positioned role moves between two nodes, neither of which is the clip.

## The real-browser half: a geometry regression gate on the one live consumer

Spec §4.3 claims that conditional re-targeting is what makes the coalesced path terminate, because `ResizeObserver.observe()` delivers an initial observation.

**Every claim about what this suite proves lives in this section and in task 5, and nowhere else.** Three rounds were spent on three versions of that claim, and plan round 4 found the fourth round's repair had corrected two copies and stranded two. Anything asserting what the browser run establishes belongs here; a sentence elsewhere that starts to say it should instead point at this section.

**What a stub can and cannot settle.** Task 4's four AC-8 cases run the stub with `deliverInitial: true`, so they DO observe an initial delivery and they are the actual proof of AC-8's arithmetic. What they cannot check is the MODELLING ASSUMPTION underneath: that the real platform delivers once for an added target with a box and stays silent for one that is 0x0.

**Nothing in this arc checks that assumption, and the third round of saying otherwise is where the plan stops trying.** Two drafts claimed the browser suite carried it; both were wrong for different reasons, and round 3 enumerated why: no case there observes whether adding a sized target produces a callback, no case adds a 0x0 target, and no case counts applies or frames. The assumption is taken from the Resize Observer specification's broadcast step, where each observation's last-reported size starts at `(0, 0)` and only targets whose current size differs are reported. It is a citation, not a measurement, and this plan says so rather than dressing it up.

**What that costs, so the exposure is bounded rather than hand-waved.** If the model is wrong about the 0x0 case, the consequence is one extra coalesced `apply()` on a transition no shipped consumer takes: a wrong number in AC-8, never a stale cap. Termination is safe in the direction that matters, because the loop of spec §4.3 REQUIRES `observe()` to deliver, so a platform that delivers LESS than the model says cannot loop more. Task 4's class-1 case is what actually pins termination, and it does so against the same delivery the loop would need.

The real cover already exists: `tests/e2e/popover-clip-fit.spec.ts` drives the one live consumer in a real browser, including the settled fit, the animated path that awaits `transitionend`, containment against the clip edge, and the held-open flip that lands mid-entrance (`tests/e2e/popover-clip-fit.spec.ts:271`, `tests/e2e/popover-clip-fit.spec.ts:308`, `tests/e2e/popover-clip-fit.spec.ts:332`, `tests/e2e/popover-clip-fit.spec.ts:409`, `tests/e2e/popover-clip-fit.spec.ts:447`). What it catches is a geometry regression on the shipped surface, on a real browser with a real `ResizeObserver`.

**What it does and does not verify.** It verifies that the ONE live consumer's geometry is still correct after this change, on a real browser with a real `ResizeObserver`, across the settled fit, the animated path, containment, and the held-open flip mid-entrance. That is a regression gate on the attach path and it is worth running.

It does NOT verify termination, and the earlier draft claiming it would "thrash and time out" was wrong. A per-frame re-measure loop rewrites the SAME cap, and the suite's settle helper compares two geometry samples 80ms apart (`tests/e2e/popover-clip-fit.spec.ts:214-218`), so stable geometry and a spinning loop are indistinguishable to it. It also does not verify AC-8's count, and it induces no subscription addition at all, since no shipped consumer takes the transition. Termination and the count are both task 4's, against the model.

So that gate is run on the shipping head, wrapped, since a non-interactive Playwright run is a heavy phase:

`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts`

It is stated here rather than as a `red=` because it is green before this arc and must stay green after. It is a regression gate, not a red-then-green cycle, and pretending otherwise would manufacture a red the branch does not have.

**The `--config` is load-bearing and the earlier draft omitted it, which made this a fail-open gate.** `popover-clip-fit` appears only in the standalone config's `testMatch` (`tests/e2e/standalone.config.ts:86`), and the suite's own header says so (`tests/e2e/popover-clip-fit.spec.ts:26`). Run at plan time under both, because a declared gate is verified by RUNNING it and never by reading it:

```
$ pnpm heavy pnpm exec playwright test tests/e2e/popover-clip-fit.spec.ts --list
Total: 0 tests in 0 files
$ pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts \
    tests/e2e/popover-clip-fit.spec.ts --list
Total: 34 tests in 1 file
```

Zero collected is the whole failure: a gate that collects nothing observes nothing, and 34 is the number the closeout must see.

## Every command this plan declares, run at plan time

Round 2's first finding was a gate that collected nothing because I read the command instead of running it. The class-level answer is not "check the Playwright command", it is a derived cover: grep this document for every declared command and run each one, recording what it actually did. The extraction is mechanical (`pnpm`, `node`, `sh -c`, `npx`, `git` in backticks or as a fenced shell line), so a command added later is covered by re-running the sweep rather than by remembering to add a row.

| Command | Run at plan time | Observed |
| --- | --- | --- |
| `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` | yes | 33 passed, 1 file. Collects, so tasks 1 to 3 have a `red=` that can express a verdict. |
| `pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` | yes, as `--list` | `Total: 34 tests in 1 file` |
| the same without `--config` (the earlier draft's form, kept as the probe that condemns it) | yes, as `--list` | `Total: 0 tests in 0 files` |
| task 4's `sh -c` gate | yes | exit 1, on the missing `plant-N` row |
| task 5's `sh -c` gate | yes | exit 1, on the missing `impeccable-gate:` marker |

Four distinct commands, six occurrences. No declared command in this plan is unrun.

<!-- tasks: depth=2 -->

## Task 1: the row's probe, as a deciding case, and the clip re-target

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` ac=AC-1,AC-4,AC-10 -->

**What is red and why.** A new case `(h25)` extends `(h19)`'s three steps with the fourth: resize ONLY the newly clipping ancestor. On today's hook the ancestor is not in the observer's target set, so the new stub's `resize(outer)` returns `false`, nothing is delivered, and the cap stays at its pre-change value. Two assertions fail: the target-set membership and the cap. The production line whose defect makes it fail is the attach-only `observer.observe(clip)` at `components/admin/useFitWithinClip.ts:182`, whose result is never revisited.

RED, one case, mirroring the row's transcript step for step:

1. Mount unclipped under the offsetParent stub with `reapplyKey` fixed. Premise: nothing is capped, and `outer` is NOT in the target set.
2. Re-render with `clips` true and `reapplyKey` unchanged. The cap must still be empty: a stable-ref re-render does not re-measure, which `(h19)` already pins.
3. One window resize plus a frame. The cap becomes `expectedPx()` for the attach geometry. This is the step the current hook already passes.
4. Assert `outer` is now in the target set. **This is the assertion the current hook fails.**
5. Move `clipBottom` to `CLIP_BOTTOM_AFTER`, call `resize(outer)`, and assert it returned `true` (the transcript's `deliverable`). Flush. The cap is `expectedPx()` for the new geometry and DIFFERS from step 3's.
6. AC-10, a second case rather than a sixth step: every recorded `observe` call, at attach and after the reconcile above, carries `{ box: "border-box" }`. Red on today's bare `observer.observe(clip)`. **Its limit is stated in the case body, not left for a reviewer to find:** jsdom computes no layout, so no unit case can show a border-box observation firing where a content-box one would not. It asserts the argument, whose failure mode is concrete, and the behavioural cover is the real-browser suite named above.

GREEN, in `components/admin/useFitWithinClip.ts`:

- `apply()` returns the resolved pair `{ clip, positioned }` instead of the clip alone, both read inside the one `withNaturalSize` window so the subscription can never be synced from a different pass than the cap. `positioned` is normalized through `instanceof Element` so the rest of the hook never sees `undefined`.
- The ref callback holds an `observedClip` ROLE and re-targets it from the coalesced path: unobserve the old, observe the new, but **only when the newly resolved clip is non-null and differs**. The conditional is not an optimisation. `observe()` delivers an initial observation, so an unconditional rebuild feeds its own next measure forever (spec §4.3), and retain-on-null is spec §4.1.
- **Every `observe()` passes `{ box: "border-box" }`.** Spec §4.1a: `observe(target)` defaults to the CONTENT box while the cap is computed from two `getBoundingClientRect()` reads, which are border-box viewport rectangles, so padding toggled on an auto-height ancestor moves the cap and delivers nothing. Its RED is part of this task's case set and is red on today's bare `observer.observe(clip)` at `components/admin/useFitWithinClip.ts:182`. The options object is module-level so the two call sites cannot drift apart.
- The hook header is corrected in this commit. It says "Three signals re-measure" (`components/admin/useFitWithinClip.ts:18`) while the implementation wires a fourth, the window listener, at `components/admin/useFitWithinClip.ts:206`. Spec §1.1 quotes that header as the declared source set, so the header has to be true for the bound to mean anything. Recorded as spec L-7. No test forces a comment, and none is added for one: a doc-string guard is the shape the 2026-08-25 process mint freeze declines.

The mount measure stays synchronous and still bypasses the coalescer, so `(g2)` and `(h)` are unchanged.

**Deliberately minimal: the observer is told per role here.** With one role changing, a per-role `unobserve`/`observe` and a set difference are indistinguishable, so nothing in this task can force the difference. Task 3 is the case that does, and its RED is the defect this commit leaves in place.

## Task 2: the positioned ancestor follows too

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` ac=AC-5 -->

**What is red and why.** After task 1 the clip slot re-targets and the positioned slot is still fixed at attach (`components/admin/useFitWithinClip.ts:175`), and its `transitionend` listener still filters against the attach-time node (`components/admin/useFitWithinClip.ts:200`). A new case `(h26)` swaps which ancestor is positioned without a re-attach; on the task-1 tree the new ancestor is not observed, its resize is not deliverable, and its own `transitionend` is rejected by the stale identity check. Three assertions fail.

RED, one case:

- A new `withMarkedOffsetParent` helper resolves `offsetParent` to the nearest ancestor carrying `data-positioned="true"`, so a case can move it.
- **A new THREE-LEVEL fixture, `outer` (the clip) wrapping `mid` wrapping `inner` wrapping the fitted node**, with the positioned role moving `inner` to `mid`. Neither is the clip, so the element under test is never held for the clip role's reason. Round 1 found the two-level version tautological for exactly that reason: it moved the positioned role onto `outer`, which was already the clip target, so the observer assertions passed with no positioned reconciliation at all. A separate fixture rather than a change to `Harness`, because adding a level to the shared one moves `offsetParent` under `withOffsetParent` and would silently rewrite `(d)`, `(h12)`, `(h21)` and `(h22)`.
- Mount with the positioned role on `inner`. Premise, on this case's own inputs: `inner` is a target, `mid` is NOT a target, and `outer` is the clip. The middle clause is the one round 1's version lacked.
- Re-render with the positioned role on `mid` and `reapplyKey` unchanged, then one window resize plus a frame.
- Assert `mid` is now observed and `resize(mid)` is deliverable and re-measures, that `inner` is no longer a target (nothing else wants it), and that a `transform` `transitionend` on `mid` schedules a frame while one on `inner` no longer does.

GREEN: the positioned ROLE re-targets by the same rule as the clip role, and the `transitionend` listener moves with it. The listener's identity check reads the CURRENT positioned role, and the teardown removes the listener from the current one rather than the attach-time one.

Still per-role at the observer, which is now a real defect rather than a simplification: two roles reconciling independently against one flat target set is exactly what task 3 breaks.

## Task 3: the roles alias, and a per-role unobserve kills a target the other role still needs

<!-- task: red=`pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` ac=AC-9 -->

**What is red and why.** This is spec review round 1 finding 2 as an executable case, and it is the finding that would have shipped a live bug. `ResizeObserver` holds a flat set of element TARGETS, not role-scoped subscriptions (spec §4.1), so after tasks 1 and 2 a role that re-targets calls `unobserve` on an element the OTHER role may still want. The configuration is not exotic: a `position: relative; overflow: clip` modal panel holds both roles at once, which is the likely real shape of the review-modal panel the one live consumer sits in.

The production defect that makes it fail is the per-role `observer.unobserve(...)` written in tasks 1 and 2, which no test before this one can discriminate from a set difference.

RED, drawn from spec §5.2's derivation 1 rather than from a family count. The derivation says a per-role reconcile diverges exactly when a role re-targets away from an element the OTHER role still wants, so the cases assert that property directly and a shape the spec's table does not list fails them too. On a two-element aliasing fixture the arrangements satisfying the derivation are:

- `(A, A)` to `(B, A)`: the clip role moves off `A` while `A` still holds the positioned role. Assert `A` is STILL a target and its resize is still deliverable. A per-role reconcile unobserves it.
- `(A, A)` to `(A, B)`: the mirror, on the positioned role.
- `(A, B)` to `(B, A)`: the roles swap and the target set does not. Assert NO observer call at all, and that both targets are still deliverable. A per-role reconcile leaves one alive and one dropped, depending on operation order.

Plus the two removal-only arrangements, which a per-role reconcile gets to the right SET by the wrong route: `(A, B)` to `(A, A)` and its mirror `(A, B)` to `(B, B)`. Assert exactly one `unobserve`, the survivor still deliverable, and **that the observe LOG gained no entry** for the survivor. That last clause is the whole discriminating power of these two cases and plan round 1 found the first draft without it: the defective sequence is `unobserve(B); observe(A)`, which leaves `A` deliverable and, under a stub that delivers only on demand, produces no apply at all, so an apply-count assertion passes against the exact defect it was written for. The observe log sees it. Spec review round 2 found the first draft missing the second of these two rows and miscosting both, which is why they are cases and not prose.

The existing harness cannot reach any of these: it keeps the two ancestors distinct on purpose (`tests/components/admin/useFitWithinClip.test.tsx:8`), and collapsing them is what made the old case (d) tautological. So the aliasing fixture is a NEW `Harness` shape, not a re-use, and the existing distinct-ancestor fixture stays exactly as it is.

GREEN: the observer's target set is DERIVED from the two roles and reconciled by SET DIFFERENCE. Unobserve every held target that is no longer desired; observe every desired target not yet held. The roles keep driving retain-on-null and the `transitionend` listener; only the observer's view changes. Set difference cannot express the per-role mistake, because an element wanted by either role is in the desired set and is therefore never unobserved. That is a structural repair rather than a guard against the named instance.

## Task 4: the guards, each proved by a named plant

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md; grep -qE "^\\| plant-[0-9]+ \\|" $P || exit 1; pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx'` ac=AC-2,AC-3,AC-6,AC-7,AC-8,AC-9 -->

**What is red and why.** These cases pin properties tasks 1 to 3 already satisfy, so none of them can be red against the branch, and a guard test that passes the moment it is authored proves nothing. Each is therefore proved by planting the specific defect it claims to catch, observing the red, reverting the plant, and recording the result in the section this task's `red=` greps for. The command is red before the section exists and green after, on the same command, with the suite green in both readings of the second half.

Cases, one per row of spec §5 plus the three invariants:

- **AC-2, termination.** After the attach, three window resizes that each derive the same target set record zero `observe` and zero `unobserve` calls. Plant: reconcile unconditionally.
- **AC-9's second property, that no already-held target is re-observed.** Round 1 found this half unproved anywhere: it is invisible to apply counts and to deliverability, and only the observe log sees it. Asserted STRUCTURALLY, by the stub rather than by a call anyone has to remember. `observe()` on a target the stub already holds records the violation, and `afterEach` asserts that record is empty, so every case using the stub is covered by construction and a case added later is covered without being told.

**It took three rounds to get here and the intermediate step is the lesson.** Round 1's version asserted the property per site, which whole-diff round 2 defeated by naming four ADDITION paths that had not called it. The round-2 repair added the helper at those four sites and claimed it was called at every reconcile; a sweep afterwards found four more sites that still had not, and round 3 named three of them independently. A per-site assertion cannot cover a site that forgot it, and each repair that added more call sites was the same bet again at longer odds. Moving the check into the stub ends it.

The per-site `expectObservedExactly(log, before, added)` calls stay, at every reconcile in the file, because they assert exactly WHICH targets a reconcile added, which is strictly more than "none was re-observed". They are now a sharpening rather than the guarantee.

Plants: re-observe an already-held target (plant-1, reds the unchanged, swap and removal paths); re-observe every desired target whenever the set GREW (plant-10, reds exactly the four addition paths); re-observe retained targets when a role resolves null (plant-11, reds seven cases including `(h25)`, `(h34)` and `(h35)`, the three that no per-site call reached).
- **AC-3, attach invariance.** Target set, ORDER and observer count on the clipping and non-clipping non-aliasing fixtures, read from the observe LOG rather than from the target set, since a set has no order to assert. `(d)`, `(h21)` and `(h22)` pin three of the four; this case adds the order. Plant: reverse the desired-set insertion order.
- **AC-6, retain on null, clip role.** A clip ancestor that stops clipping keeps its target, so its clipping again is still delivered. Plant: re-target the role to null.
- **AC-6, retain on null, positioned role.** `positioned="none"` mid-life keeps the target and the listener, so showing the overlay again still delivers. Plant: re-target the role to null. This is the one that matters most: `offsetParent` reads null for a `display: none` subtree, so the naive repair converts every hide-then-show into the silent stale cap this arc exists to remove.
- **AC-7, no ResizeObserver.** With the constructor absent the hook must not throw at any reconcile site, the reconcile is skipped whole, the roles still update so the `transitionend` listener still follows, and the window-resize path still writes the correct cap across the transitions of spec §5.1. Plant: call `observer.observe` without the null check.
  **The target-set cases must not be run in this configuration**, and each states that as its premise rather than leaving it implicit. Spec §8's precondition is that the six target-mentioning criteria range over a constructed observer; with none there is no target set, so an assertion like "the resolved clip is in the target set" would be inapplicable rather than satisfied, and a case that quietly passed there would be vacuous in exactly the environment it is least able to notice.
- **AC-8, the apply-count bound, over its FOUR delta classes, run with `deliverInitial: true`.** Every spec round and plan round 1 landed here, so the cover is stated as the spec derives it rather than as a list that keeps growing. The cost is driven by ADDITIONS THAT HAVE A BOX, so the closed cover is four, not three, and plan round 1 found the fourth missing:
  1. adds a target with a non-zero box: exactly one extra coalesced apply, and ZERO more on the following frame, because the follow-up derives the same set;
  2. adds only a target that is currently 0x0: **zero extra applies, AND the 0x0 target is in the observe log and in the held set.** Both halves, because round 3 found that the count alone is satisfied by a hook that simply skips `observe()` for a zero-sized target, which is the opposite of the required behaviour and would leave that ancestor permanently dark. The count proves the platform stays quiet; the log proves the hook still subscribed (spec §4.3);
  3. only removes: zero;
  4. neither: zero.

  **Walk counts TRACK apply counts exactly: 1, 0, 0, 0, not "unchanged".** `apply()` walks the chain on every invocation (`components/admin/useFitWithinClip.ts:81`), so the one extra apply in class 1 necessarily carries one extra walk, and an expectation of "unchanged" could not go green after a correct implementation. Round 2 caught it; the earlier wording would have made this task unpassable. The walk assertion is kept rather than dropped because it is what pins the ratio: one apply, one walk, and never an apply that walks twice.

  **These four are the only cases in the suite that run the stub with `deliverInitial: true`**, and the case body says why: the criterion is ABOUT the initial observation, and the default stub emits none, so plan round 1 was right that the previous draft's addition case could not prove the follow-up apply it promised. With the flag off, class 1 and class 2 are indistinguishable, which is precisely the distinction the spec's cost rule turns on.

  Plants: call `apply()` twice in the coalesced path (catches all four); drop the difference guard so the follow-up re-observes (catches class 1, and it is §4.3's loop caught at one frame's remove); make `observe()` deliver unconditionally in the stub's model (catches class 2's count); and skip `observe()` in the HOOK whenever the resolved target is currently 0x0 (catches class 2's log assertion, and it is the plant round 3's finding names, since it satisfies both counts while subscribing to nothing).

### Mutant plants, run and recorded

Written by this task; empty until it runs. One row per plant, keyed `plant-N`: the exact edit, the command, and which cases went red. A plant that reds nothing is a case with no discriminating power and is rewritten, not recorded as passing.

This task's `red=` greps for a `| plant-N |` row rather than for the heading above, because the heading ships with the plan and a `red=` satisfied by the plan's own scaffolding is green from the moment it is written.

| Plant | Edit | Cases that went red |
| --- | --- | --- |
| plant-1 | drop the "already held" guard on additions, so every reconcile re-observes | (h29) (h30) (h31) (h32) (h37) |
| plant-2 | reverse the desired-set insertion order | (h33b) |
| plant-3 | clip role re-targets on null too, dropping retain-on-null | (h34) |
| plant-4 | positioned role re-targets on null too | (h35) |
| plant-5 | reconcile without the `observer === null` guard | (h36), and (f) |
| plant-6 | call `apply()` twice in the coalesced path | (h27) (h37) |
| plant-7 | skip `observe()` when the resolved target is currently 0x0 | (h37) |
| plant-8 | teardown removes the listener from the ATTACH-TIME node instead of the current role | (h38) |
| plant-9 | `reconcile` returns before updating the roles when there is no observer | (h36) |
| plant-10 | re-observe every desired target whenever the set GREW | (h26) (h27) (h28) (h37) |
| plant-11 | re-observe retained targets when either role resolves null | (h21) (h22) (h25) (h33) (h33b) (h34) (h35) |
| plant-12 | pass `{ box: "border-box" }` at the attach only, not on later reconciles | (h26) |
| plant-13 | construct a second `ResizeObserver` at the attach | (h21) (h22) (h33b) |

Command for every row: `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx`, with the plant applied to `components/admin/useFitWithinClip.ts` and reverted after. Baseline with no plant: 48 passed.

**plants 11 to 13 are whole-diff round 3's findings.** plant-12 is the sharpest of the three because it isolates something no earlier case could see: AC-10 was checked by `(h33)`, which moves `reapplyKey`, and a `reapplyKey` change TEARS DOWN and re-attaches the ref, so every call that case ever recorded was an attach call. The stub now records the box option and `(h26)` asserts it on a live reconcile, and plant-12, which passes the option at the attach and drops it afterwards, reds `(h26)` alone. plant-13 covers the other half of AC-3: the observe LOG is satisfied by two observers logging one target each, so the observer COUNT is asserted too.

**plant-10 is whole-diff round 2's finding**, and its four reds are exactly the four cases that round named, which is the check that the gap is closed rather than moved. **plant-8 and plant-9 were added by whole-diff round 1**, which found three of these cases satisfiable without the behaviour they claimed. Worth recording as a pattern rather than three fixes: all three were the same mistake in different clothes, an assertion whose precondition was already true. `(h35)` asserted a frame appears after a `transitionend` while a frame from the preceding `resize()` was still queued, so it read 1 either way; the repair drains the queue and asserts it is empty first. `(h36)` exercised only the clip role, so an implementation returning early with no observer kept the positioned half untested; the repair adds that half and plant-9 is its proof. `(h24)` pinned teardown only for a listener that never moved, so a teardown reading the attach-time node passed while leaking a moved one; `(h38)` is the missing case and plant-8 is its proof.

The sweep for that class was over every `frames.size` assertion in the file, not over the three lines the review named. Nine sites; one was defective.

Two rows are worth reading rather than counting. **plant-1** reds five cases, which is the shape of the termination argument: an unconditional reconcile is not one defect but the same defect seen from five angles, and (h32) is the one that names it. **plant-7** is round 3's finding made executable: it satisfies both of AC-8's class-2 COUNTS, zero applies and zero walks, while subscribing to nothing at all, so only the observe-log half of that class can see it. A version of this suite that asserted counts alone would have shipped a hook that leaves every zero-sized ancestor permanently dark.

## Task 5: close-out

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; grep -qE "^#{2,3} BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION" BACKLOG.md && exit 1; awk "/^#+ BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION/{f=1;next} f&&/^#/{f=0} f" BACKLOG-archive.md > /tmp/fwc-entry.txt; test -s /tmp/fwc-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/fwc-entry.txt && exit 1; grep -q "fix/fitwithinclip-stale-clip-subscription" /tmp/fwc-entry.txt || exit 1; grep -q "BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION" tests/docs/_metaDeferralLedgerGraduation.test.ts || exit 1; exit 0'` ac=AC-3 -->

**What is red and why.** Before the task the closeout marker line is absent, the row is still open in `BACKLOG.md` carrying its IN PROGRESS marker, the archive holds nothing under this id, and `BACKLOG_GRADUATED` has no row for it. Each is a non-zero exit; all four hold after, on the same command. Run against the live tree at plan time, and each half was confirmed red: the marker regex misses (no marker line exists), the open-queue grep HITS at `BACKLOG.md` heading level 2 and so takes the `exit 1`, and the archive extraction yields zero lines.

Run `pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` at the shipping head and record the counts (34 collected, per the probe above), per the section above.

**Why this task cites AC-3 and not AC-8.** Two earlier drafts gave it `ac=AC-8` on two different rationales and both were false; round 3 showed the suite proves neither the platform model nor termination. What it does prove is the one thing it actually exercises: the live consumer ATTACHES and gets the right cap, on a real browser, which is AC-3's claim that the attach path is unchanged. Task 4 proves AC-3 in jsdom against stubs; this is the only place it runs against a real `ResizeObserver` and the real component. AC-8's count and its termination argument are task 4's, against the model, and the model itself is an unmeasured citation this plan declares as such. The hook file lives under `components/admin/`, so the invariant-8 dual gate runs on the diff even though no render path changes. The gate command accepts only the RAN form and NOT the `N/A` one, deliberately: this arc runs the pair, so accepting `N/A` would be grammar the closeout can never legally use, and a gate that accepts an outcome the task forbids is a gate with a hole in it. Expect "no visual change" dispositions; record them rather than skipping the gate.

The ledger row graduates into `BACKLOG-archive.md` and its IN PROGRESS marker comes off in this branch's LAST commit, before readiness, so no marker reaches main. The archived section names `fix/fitwithinclip-stale-clip-subscription` in its own prose, because the marker was the section's only mention of the branch and the graduation guard asserts the replacement rather than the deletion.

**The `impeccable-gate:` line is written by this task and by nothing before it.** `tests/docs/_invariant8Closeout.ts:49` treats any line starting `impeccable-gate:` that is not one of the two §3.3 forms as MALFORMED, and one malformed line reds the unit regardless of any valid one. A scaffolding placeholder is therefore not merely useless, it is red, so the plan carries no marker line until this task writes a conforming one.

### Findings and dispositions

Both halves ran on the merged head, after `origin/main` was absorbed. Each ran as an isolated sub-agent per the command's hard invariant, so neither is a degraded single-context run.

**`/impeccable critique` — P0 0, P1 0.**

- Assessment A (design review): no user-visible surface change. The diff is subscription and observation logic; JSX, CSS, tokens and copy are untouched, and `AttentionMenu.tsx` does not appear in the diffstat at all. AI-slop verdict N/A, since nothing new is rendered to judge. Of the ten heuristics only error prevention is even plausibly touched, and it does not move: the change is latent robustness, not a repaired user-facing failure.
- Assessment B (detector plus evidence): the skill's bundled detector exited 0 with **0 findings** over `components/admin/showpage/AttentionMenu.tsx` and `components/admin/useFitWithinClip.ts`. Browser visualization unavailable: no dev server, and none started for this run. The critique ignore file the command consults, under a dot-impeccable critique directory, is confirmed absent from this repo. Neither the detector script nor that ignore path is written here as a backticked path, because both live outside the tracked tree and the citation arm reads any such token as a citation it can resolve.

**The critique's one substantive observation, answered rather than filed.** Assessment A traced the live consumer and found BOTH hardening branches unreached by it today: `AttentionMenu`'s clip ancestor is the review-modal panel, which clips from the first measurement, and the menu fully unmounts when closed (`if (!open) return null`) rather than toggling `display: none`, so the `offsetParent`-null path cannot be reached either. That is not a contradiction, it is the backlog row's own reachability bound restated from the UI side, and it is why the row is MEDIUM rather than HIGH. This lands as prophylaxis on a SHARED hook against a class the row PROBED, not ahead of a named second consumer. Recorded here because a future reader deserves the answer without re-deriving it.

**`/impeccable audit` — P0 0, P1 0, one P3, fixed in branch.**

Scores: accessibility 4, performance 4, theming 4, responsive 4, anti-patterns 4. **One dimension of five moved: performance, net positive.**

- The attach path lost a reflow. `offsetParent` is now read INSIDE `withNaturalSize`'s measure callback, in the same read phase as the two `getBoundingClientRect()` calls, whereas the previous code read it after `apply()` returned, which is after the helper's `finally` restores the caps: a write, and therefore a second forced reflow. Attach is now one reflow rather than two; the steady-state per-signal count is unchanged at one.
- The reconcile allocates a `Set` and one spread per coalesced frame even when nothing changed. Real, bounded to at most two elements, and accepted.
- Retention is bounded rather than a leak: teardown disconnects the observer, removes the listener from the CURRENT role, and clears the node ref, so nothing outlives unmount.
- Coalescing intact: one shared `RafCoalescer` backs all three signal sources, so a burst still costs one apply per frame.
- **P3, fixed:** a comment above `onTransitionEnd` named `subscribePositioned`, an identifier task 3 renamed to `reconcile`. Corrected in the same commit as these dispositions. No TDZ hazard (the function declaration hoists), no listener leak, no `unobserve` on an unwatched node, teardown ordering correct.

Nothing is deferred, so no `DEFERRED.md` entry is owed.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

<!-- tasks: end -->

## Unfixed peers

Written at close-out. Peers this arc found and did not repair go here and into the PR body, with the reason. This arc files no new ledger row of any facing; anything too large to repair is a message to bl-orch.

## Why there is no layout-dimensions task

`docs/agents/writing-plans.md` makes a real-browser `getBoundingClientRect` task mandatory for fixed-dimension parents with flex or grid children, because Tailwind v4 does not default `.flex` to `align-items: stretch` and jsdom computes no layout.

**None applies here, and the reason is the mechanism rather than the subject matter.** The spec's §6 invariants are not stretch relationships between a sized parent and a flex child. Each is an arithmetic relationship between a written inline `max-height` and two `getBoundingClientRect` reads, and the arithmetic is a pure function (`lib/layout/fitWithinClip.ts:75`) the suite calls directly. There is no computed-layout step for jsdom to get wrong: the values the hook reads are stubbed at the fixture, and the value it writes is asserted through the same pure function. A Playwright assertion would re-test the browser's `getBoundingClientRect`, not this diff.

This arc also changes none of those invariants. It changes which ancestors deliver the signal that re-runs the computation, which is what AC-3 and AC-8 exist to hold fixed.
