# Plan: suppress the attention menu auto-open below `sm`

**Spec:** `docs/superpowers/specs/2026-08-29-attention-auto-open-phone-suppression.md`. **Row:** `BL-ATTENTION-MENU-AUTOOPEN-COVERS-TOGGLE-PHONE`. **Branch:** `fix/attention-autoopen-suppress-phone`.

## 1. What this plan is, and why the obligations table is in it

The spec ratifies a small design: at viewports below `sm` the attention menu stops opening itself, the pill stays, and desktop is untouched. The spec stage then ran four adversarial rounds and produced eleven findings, none of them on that design. Every one was about the account of how it would be PROVEN.

bl-orch ruled at the cap (2026-08-29) that this is the routing error rather than a quality problem: proof plumbing is plan-grade content, so it belongs here and draws this stage's review budget. §2 is that table, moved with its form intact.

One obligation stays stated in the spec as well, deliberately: the panel's vertical anchor must remain the pill's wrapper. That is a design constraint whose violation is the arc's own defect by another route, so the spec carries the requirement and this plan carries the assertion, and the constraint survives unless both are dropped.

### 1.1 Pre-draft code verification

Every named file, symbol, testid and harness API below was checked against the live tree before this plan was drafted.

| Claim | Verified |
| --- | --- |
| Auto-open sites are exactly two | `PublishedReviewModal.tsx` and `Step3ReviewModal.tsx`, both the `autoOpenFiredRef` effect. The two menu components take `open` as a prop and mount nothing themselves. |
| jsdom stub answers `matches: false` to every query | `tests/setup.ts:84-95`; per-file assignment overrides it, per that file's own comment. |
| `sm` is 640px | `app/globals.css:318`; already the modal's sheet/popup boundary at `components/admin/review/ReviewModalShell.tsx:386` and `components/admin/review/ReviewModalShell.tsx:571`. |
| Published toggle testid | `strip-publish-toggle`, `components/admin/showpage/StatusStrip.tsx:281`, rendered inside the modal via `PublishedReviewModal.tsx:1360`. |
| A DB-free real-browser vehicle exists | `tests/e2e/standalone.config.ts` boots its own server, network-free, no Supabase. PROVED rather than assumed: `popover-clip-fit.spec.ts -g "44px floor at 375x667"` passed in 4.3s under `pnpm heavy` while the shared Postgres was under an orchestrator quiet period. |
| The live entry renders the real modal AND the toggle | `tests/e2e/_pillFocusLiveEntry.tsx` mounts the real `PublishedReviewModal` through `_publishedReviewModalHarness.tsx`, whose default state is `archived: false, published: true`, so `StatusStrip` renders the toggle. |
| `__setItems(a, n, s, degraded)`: `a` is the ACTIONABLE arm | `_pillFocusLiveEntry.tsx`, `buildItems` sets `actionable: true` on that arm only. |
| `standalone.config.ts` testMatch is an explicit allow-list | Its own header: a spec not named there "runs nowhere and silently proves nothing". |

### 1.2 Blast radius, enumerated rather than sampled

| Surface | Phone widths | Dependency on arrival auto-open |
| --- | --- | --- |
| `tests/e2e/wizard-attention-menu.spec.ts` | 375x667, 375x844, 390x560 | HARD. `openModal` (`tests/e2e/wizard-attention-menu.spec.ts:136-150`) asserts `aria-expanded="true"` and waits for the panel on arrival. Only touched if P-1 is positive; then it becomes width-aware. |
| `tests/e2e/popover-clip-fit.spec.ts` | same three | NONE. `openMenu` (`tests/e2e/popover-clip-fit.spec.ts:171-181`) already clicks the pill when auto-open did not fire. This is the tolerant shape the wizard helper would adopt. |
| `tests/e2e/published-review-modal.layout.spec.ts` | 375x812 | NONE, checked rather than assumed: its three pill references measure the pill's rect, hit band and text cap and never open or await the menu. **Task 2 still runs it**, because "a closed menu does not move the pill" is a layout claim and this repo settles those in a real engine. |
| Every jsdom suite that renders an auto-opened menu | n/a | NONE by construction: the global stub answers `matches: false`, so the suppression query reads false. This is why §2 of the spec spells the predicate as positive evidence. **Task 2 proves it**, with the six suites named and the command written out, rather than asserting it here. |

## 2. Obligations: every claim in the spec, and the assertion that settles it

Spec review round 2's finding 4 was that §9 had drifted from what the rest of the document promised: §6 said the arrival-focus identity was asserted, §8 said the pill's band was, and the consequence bound needed the phone-width tap path, and §9 carried none of the three. The repair is this table rather than three added sentences, so the next claim added without an assertion is visible as a missing row.

| Claim | Where | Settled by |
| --- | --- | --- |
| Suppressed at <`sm`, with actionable items | §2 | P-2.1; jsdom phone case |
| Auto-opens at ≥`sm` | §2 | P-3; jsdom desktop control |
| The cutoff is 640, not merely "some phone width" | §2 | **P-2 boundary cells at 639x667 (suppressed) and 640x667 (auto-opens).** Round 3's finding: 375 plus a desktop width is satisfied by `(max-width: 400px)` just as well as by the specified query, and that impostor wrongly auto-opens at 500, below the project's `sm`. Only a pair straddling the boundary pins the constant, and the pair also pins the 639.98 complement: at exactly 640 the query must read false. |
| Width is read at REVEAL time, not effect time | §2.1 | jsdom: answer desktop while the effect runs, phone inside the frame, assert closed. NOT a browser case: `page.setViewportSize` crosses CDP asynchronously and would race the frame it must land inside, giving a case that is flaky or vacuous. |
| `actionable.length === 0` still does not consume | §2.1, §4 row 3 | jsdom: empty at phone, widen, then items arrive, assert it opens |
| A CANCELLED frame leaves the one-shot unconsumed | §2.1 | jsdom: at a desktop width, change a dependency so the effect re-runs and cancels its pending frame BEFORE it fires, then let the next frame settle, and assert the menu opens. Round 3's finding: §2.1 calls this load-bearing and nothing asserted it, so an implementation that consumed the ref before scheduling would pass every other row here while silently losing the reveal whenever a dependency changed inside the frame window. |
| No width read during render, so no hydration branch | §3 | NOT ASSERTED, and the row says so rather than implying cover. Round 3 was right that the earlier claim was false: the jsdom harness uses Testing Library's client-only `render` (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:177`), which never produces server markup and so cannot discriminate a hydration mismatch at all. The property holds by construction instead: the predicate is a function called only inside the effect's animation frame (§2.1), and effects do not run on the server. An implementation that moved the read into render would be a different design, not a regression this suite could catch, and it would be caught by review of that change. Recorded in §10 as a documented limit. |
| Auto-opened then shrunk STAYS OPEN | §4 row 1 | P-2 sibling case at desktop then phone |
| Suppressed then widened stays closed | §4 row 2 | P-2 sibling case, re-running the effect via an item change |
| An OPERATOR-opened menu survives a resize in either direction | §4 row 4 | P-2 sibling cases: open by tapping the pill at 375, widen past `sm`, assert still open; and open by tapping at desktop, shrink below `sm`, assert still open. §4 promises this in both directions and only the auto-opened shrink was covered. It is the row that pins "this spec never closes a menu", which is the fence the whole design rests on. |
| Pill accessible name carries the count | §6 | P-2.2 |
| Arrival focus identical with and without suppression | §6 | jsdom: `document.activeElement` is the close button in both |
| `aria-expanded` reads false on a suppressed arrival | §6 | jsdom phone case |
| Panel width/x clamped inside the clip | §8 | Unchanged, covered by `tests/e2e/popover-clip-fit.spec.ts`, which **Task 2 runs** rather than merely citing |
| The panel's VERTICAL anchor stays the pill's wrapper, never the pill | §8 | **P-2.8: with the menu opened by tap at 375, the panel's top edge sits below the WRAPPER's bottom edge, not the pill's.** Round 4's finding, and the most valuable one of the stage: §8 called this load-bearing and nothing asserted it, yet swapping `panel.offsetParent` for `pillRef.current` passes every suppression, tap, containment and desktop row here while moving the panel up onto the status strip. That is this arc's own defect reached by a different route, and the source already records the attempt and its measured result (`components/admin/showpage/AttentionMenu.tsx:378-382`). The two edges differ because the wrapper carries the title block, so the assertion discriminates. |
| Pill tap band ≥44px, and the band actually TAKES taps | §8 | P-2.3, hit-tested above and below centre rather than measured. A `pointer-events: none` pseudo-element keeps the computed band and loses the taps. |
| Menu rows ≥44px | §8 | Unchanged, `tests/e2e/popover-clip-fit.spec.ts`, run by Task 2 |
| Toggle receives its own pointer events | §8 | P-2.4 |
| Pill tap opens the menu at <`sm` | consequence bound | P-2.5 |
| The occlusion test discriminates, and is non-vacuous | spec §9.1 | AC-OCCLUSION-DISCRIMINATES, AC-OCCLUSION-PARTIAL, AC-OCCLUSION-NONVACUOUS. Added after plan review round 1: §9.1 is a spec claim and the table carried no row for it, so the helper both probes depend on was itself unobligated. |
| Wizard occlusion status | §5, §10 | **NO AC, and here is why.** Round 2 was right that this row had neither an id nor a disposition, and right that AC-WIZARD-MIRROR does not cover it: the mirror covers the positive branch's IMPLEMENTATION, while this row's obligation is that the measurement was TAKEN and is on the record where the next arc will look. That is discharged by spec §5.1 carrying the three viewports, the per-viewport control count, and every intercepted control with its interceptor — a documentation artifact, not an executable claim. An AC would need a red, and no task can produce one: Task 0 has already run, and a test asserting a spec section contains a table pins prose rather than behaviour. Task 3 is the enforcement that matters — it cannot start without §5.1, because §5.1 is what says the positive branch is the live one. |
| **If P-1 is positive:** the wizard gets the IDENTICAL predicate at the IDENTICAL position, so it inherits the IDENTICAL obligations | §5 | **The wizard mirrors EVERY row in this table that concerns the predicate, not a chosen three.** Round 4 was right that naming three (suppression, tap-to-open, desktop) discriminates none of the five ways the predicate can be built wrong, and the wizard effect exposes every one of those ordering points (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Since the claim is that the two effects are the same code in the same position, the honest obligation is the whole set rather than a subset of it: the boundary pair, the reveal-time read, the cancelled-frame non-consumption, the `n === 0` non-consumption, the consumed-on-suppression row, and the operator-opened resize, each mirrored against the wizard's own harness. Stating it as "the same set" rather than enumerating it twice is deliberate: a second enumeration is a second thing to drift. Round 3's finding: the positive branch changed the wizard's behavior and specified no oracle for the changed state. It also requires editing that file's `openModal` helper (`tests/e2e/wizard-attention-menu.spec.ts:136-150`), which today ASSERTS `aria-expanded="true"` on arrival before dismissing the panel, at 375x667, 375x844 and 390x560. Under suppression that assertion is false at exactly those three viewports, so the helper becomes width-aware: expect auto-open at ≥`sm`, and open by tapping the chip below it. This is the same tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses. |
| **If P-1 is negative:** the wizard is untouched | §5, §10 | No new assertion, by design. The existing wizard suite continues to pass unchanged, which is itself the evidence that nothing moved. |

The two published-surface probes are real-browser assertions. jsdom computes no layout, so `getBoundingClientRect` and `elementFromPoint` are meaningless there; the jsdom half of the test plan asserts only the predicate's effect on `menuOpen`, with `window.matchMedia` stubbed per file.

## 3. Tasks

Ordered so that every production change is preceded by a test that fails against the tree as it stands. Round 1 was right that the first draft did not do this: it changed production in Task 2 and authored the browser assertions in Task 3, where they arrive green.

**Round 2 was right that the repair over-corrected into the opposite defect.** Splitting authoring from implementing gave three tasks that END red and are greened by a LATER task: Task 1 committed a stub, Task 2 committed failing assertions for Task 3 to fix, and Task 6 created its red in one commit and cleared it in the PR's last. Invariant 1 is `failing test → minimal implementation → passing test → commit`, and all four steps are inside ONE task. A task that commits red hands the next task a tree that does not build its own case, and if the arc stops there, main gets a red suite.

So the cycle is now stated as STEPS WITHIN a task, never as a boundary between tasks. Every task below ends green on every command it names. Where a red must be observed and recorded before the fix — the pre-fix interceptor for AC-TOGGLE-OPERABLE is the one that matters — the observation is a step in the same task, and what gets recorded is the OUTPUT, in the commit message, not a committed failing suite. Round 2 found three instances; the sweep for the shape found the third, Task 6, which the round did not name.

**Two kinds of assertion, named apart, because conflating them is what produced the original defect.** A RED-carrying assertion fails against current production and passes after the change. A REGRESSION assertion is green on arrival by construction and exists to fail if a LATER edit breaks it. AC-ANCHOR-WRAPPER and the pill hit-band are regression assertions and are marked as such; claiming a red for them would be a false claim.

### Task 0 — the wizard measurement (no RED, deliberately)

Outside the enrolled region below, because it changes no production code and therefore has no red. Round 1 was right that an enrolled marker here would be green on arrival and stay green under the negative disposition.

Run P-1 at 375x667, 375x844 and 390x560 against the existing wizard harness and record the full result in spec §5.1 — the viewports, the control count per viewport, and every intercepted control with its interceptor. §10 carries only the one-line disposition and points at §5.1. **DONE, and the result is in spec §5.1.** Round 2 was right that the earlier version asserted POSITIVE while the number lived only in a commit message and a temporary probe, and pointed at a §5.1 that did not exist.

```
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts
```

Its output selects the branch Task 3 takes. It runs FIRST because that branch decides how much of the work exists.

<!-- tasks: depth=3 -->

### Task 1 — the shared occlusion helper

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/occlusion-probe.spec.ts` ac=AC-OCCLUSION-DISCRIMINATES,AC-OCCLUSION-NONVACUOUS,AC-OCCLUSION-PARTIAL -->

New files: tests/e2e/helpers/occlusionProbe.ts, tests/e2e/occlusion-probe.spec.ts, and its static fixture page. Registered in tests/e2e/standalone.config.ts testMatch in the same commit.

**A real browser, not vitest.** The helper's whole body is `getBoundingClientRect` and `document.elementFromPoint` inside `page.evaluate`. The suite defaults to the `node` environment and a file opts into jsdom with a `// @vitest-environment jsdom` pragma (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:1`). Neither runs this helper usefully: node has no DOM at all, and jsdom computes no layout, so every rect is zero, every control is dropped by the zero-area rule, and the helper throws "control set is empty" — a test asserting that throw passes while proving nothing about occlusion. That is this arc's own recurring class (LIM-NONDISCRIMINATING-FIXTURE), and it survived my first draft.

**The RED is behavioural, not a collection failure — and it is a STEP, not the commit.** Write the fixture, the spec, and a stub `probeOcclusion` returning `{ controls: [], interceptions: [] }`; run the command and observe the assertions fail on their CONTENTS rather than on an unresolved import, which `docs/agents/writing-plans.md` rejects, and which "No tests found" also is not. Then replace the stub with the real helper and run again to green. One commit, at the end, with the real helper in it.

Round 2 was right that the earlier version described the stub as what the commit LANDS, which leaves this task red forever with no later task named to green it.

Fixture stages four cases on one page, absolutely positioned so the geometry is exact: a control covered by a node INSIDE the panel (one interception, `insidePanel: true`); a control covered by an unrelated node (one interception, `insidePanel: false`); an uncovered control (none); and a control covered over its top-left quadrant ONLY (interception at `tl`, none at `centre`). The fourth is what makes the five sample points earn their place — with centre-only sampling it reports clean.

### Task 2 — the predicate: author the failing assertions, then implement

<!-- task: red=`sh -c 'node_modules/.bin/vitest run tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx && node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-autoopen-suppress.spec.ts'` ac=AC-SUPPRESS-PHONE,AC-OPEN-DESKTOP,AC-REVEAL-TIME-READ,AC-CANCELLED-FRAME,AC-EMPTY-NO-CONSUME,AC-FOCUS-IDENTITY,AC-ARIA-EXPANDED,AC-BOUNDARY-640,AC-TOGGLE-OPERABLE,AC-PILL-TAP,AC-PILL-COUNT,AC-ANCHOR-WRAPPER,AC-RESIZE-SHRINK-STAYS-OPEN,AC-RESIZE-WIDEN-STAYS-CLOSED,AC-OPERATOR-OPENED-SURVIVES -->

**One red command, both vehicles, conjoined under `sh -c`.** The marker grammar takes exactly one `red=`, and both vehicles must pass, so the conjunction is the honest single verdict rather than a way to smuggle in two. The `sh -c '…'` wrapping is this repo's established form for a compound red (`docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138`). Round 2 was right that the earlier split marked only the Vitest command while claiming browser-only ids (AC-TOGGLE-OPERABLE, AC-PILL-TAP, AC-ANCHOR-WRAPPER) on the same task: a jsdom command cannot fail for a geometry reason, so those ids had no named pre-implementation execution at all. jsdom computes no layout; a real engine does not let you sample a width inside an animation frame you control. Neither vehicle is optional and neither covers the other.

**Steps, in order, one commit at the end.**

1. Author both suites: the jsdom cases in a new tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx, and the browser spec tests/e2e/attention-autoopen-suppress.spec.ts with its `testMatch` entry. Both paths are unbackticked because neither file exists yet, which is this repo's form for a planned file.
2. Run both. They fail for the right reason: the live callback sets the ref and opens with no width guard at all (`components/admin/showpage/PublishedReviewModal.tsx:780`), so every suppression case fails on behaviour, not on collection. **Record the pre-fix AC-TOGGLE-OPERABLE output — the interceptor's identity — for the commit message.** That measurement is the arc's evidence and it is unobtainable after the fix.
3. Implement spec §2 and §2.1 in `PublishedReviewModal.tsx`.
4. Run both again, green.
5. Run the unchanged-suite claims from §1.2, also green:

```
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts tests/e2e/published-review-modal.layout.spec.ts
node_modules/.bin/vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/showpage/pillFocusReconcile.test.tsx tests/components/admin/showpage/publishedEscapeClaim.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/dev/fullSplitCompositeRender.test.tsx
```

6. Commit. The tree is green at every named command.

**The jsdom vehicle needs a QUERY-AWARE `matchMedia`, and the ambient one is a hazard.** `tests/setup.ts:84-95` installs a global `window.matchMedia` for every jsdom file that returns `matches: false` for EVERY query, ignoring the argument. Two consequences, both of which would have shipped green and vacuous:

- **AC-OPEN-DESKTOP passes with no configuration at all**, because "not phone" is the ambient default. It is named in §4 as AC-SUPPRESS-PHONE's anti-vacuity partner, and against the mutant it exists to catch — a predicate that is never true — it passes. A partner that cannot fail against its own mutant is not a partner.
- **AC-BOUNDARY-640 cannot discriminate 639 from 640** against a stub that ignores the query. Reaching instead for a fixed true/false per case asserts the STUB's value and never the predicate's, so it passes against a predicate asking `(max-width: 9999px)` — precisely the impostor the boundary pair exists to reject.

So the suite installs its own stub that PARSES `(max-width: Npx)` and compares against a per-case width, and additionally records every query string the component asked for. AC-OPEN-DESKTOP asserts `(max-width: 639.98px)` is among them, so "desktop opens" is no longer satisfiable by a component that never consults `matchMedia`. The real-browser half is unaffected: a real engine answers the query itself, which is why the arc carries both vehicles.

The regression assertions in the browser spec (AC-ANCHOR-WRAPPER, the pill hit-band) are green throughout, are labelled REGRESSION in the file, and are excluded from this task's red claim.

### Task 3 — the wizard repair (Task 0 came back POSITIVE, so this runs)

<!-- task: red=`sh -c 'node_modules/.bin/vitest run tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx && node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts'` ac=AC-WIZARD-MIRROR,AC-WIZARD-ESC-OWNERSHIP -->

Task 0 measured POSITIVE at 375x667, 375x844 and 390x560 (spec §5.1), so this task runs. The wizard gets the identical predicate at the identical position and inherits the WHOLE obligation set, not a subset. `openModal` becomes width-aware, expecting auto-open at ≥`sm` and opening by tapping the chip below it, which is the tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses.

The red is real: the mirrored suppression cases are authored first and fail against the wizard's unguarded effect (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Same step order as Task 2 — author, observe both reds, implement, green, one commit.

**Both vehicles, for the same reason Task 2 needs both.** Round 2 was right that naming only the Playwright suite cannot establish AC-WIZARD-MIRROR: the inherited obligation set includes the reveal-time read, and §2 of the table says in writing that this case CANNOT be a browser case, because `page.setViewportSize` crosses CDP asynchronously and races the very frame the assertion must land inside. So a wizard implementation that samples width before `requestAnimationFrame` would satisfy a Playwright-only Task 3 while violating the obligation it claims to inherit. The mirrored jsdom cases go in a new tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx, against the wizard's own harness, with the same query-aware `matchMedia` Task 2 installs — the ambient stub at `tests/setup.ts:84-95` is as much a hazard here as there.

**One obligation the mirror cannot reach, so it gets its own id.** The wizard's rAF sets `setMenuAutoOpened(true)` as well as the one-shot ref, and `menuAutoOpened` is passed to the menu as `autoOpened` (`components/admin/wizard/Step3ReviewModal.tsx:647`), forwarded as `escTransparentUntilEngaged` (`components/admin/wizard/WizardAttentionMenu.tsx:102`), and turned into `const engagedRef = useRef(!escTransparentUntilEngaged)` (`components/admin/showpage/AttentionMenu.tsx:347`). Escape passes THROUGH to the modal until the operator engages with a panel they did not open. `PublishedReviewModal` never passes that prop at all, so it defaults false there.

AC-WIZARD-MIRROR quantifies over the published surface's obligations, which is exactly why it is blind to this one: there is no published obligation to mirror. Under suppression the rAF never runs, `menuAutoOpened` stays false, and a tap-opened menu claims Escape immediately — correct, and it falls out of the design. But the coupling runs through three components and a defaulted prop, and an edit that sets `menuAutoOpened` on the suppression path looks harmless (it only records that an auto-open was considered) while silently handing Escape to the modal on every phone-opened menu. AC-WIZARD-ESC-OWNERSHIP asserts the BEHAVIOUR — Escape closes the menu and leaves the modal open — rather than the prop, because the prop is the mechanism and the Escape target is the obligation.

### Task 4 — invariant 8, the UI gate

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-IMPECCABLE -->

The red is genuine and mechanical: this task's commit is the one that names both gate halves in §12, and naming them attaches the obligation, so the closeout guard fails until the marker line lands with real counts. It passes once the marker is written. That is exactly the red-then-green shape, using the repo's own guard rather than a lint that cannot see the gate.

### Task 5 — graduation

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` ac=AC-GRADUATION -->

Round 1 was right that `_metaLedgerInProgress` accepts both the in-progress and the graduated state and so cannot carry this. `_metaDeferralLedgerGraduation` can: adding this row's id to `BACKLOG_GRADUATED` with its branch as provenance makes the guard FAIL until the row is actually archived with that provenance, and pass once it is.

**This task IS the PR's last commit, and both halves of the cycle are inside it.** The earlier version created the red in this task's commit and cleared it in a later one, which is the same defect round 2 found in Tasks 1 and 2 — the round did not name this third instance; the sweep for the shape did. Invariant 12 requires the marker off and the row archived in the PR's LAST commit, so the resolution is not to move the green earlier but to make this task that commit:

1. Add the row's id to `BACKLOG_GRADUATED` with the branch as provenance. Run the guard, observe the RED.
2. Archive the row into `BACKLOG-archive.md` with that provenance and take the in-progress marker off `BACKLOG.md`. Run again, green.
3. Commit once. That commit is the PR's last, and the tree is green in it.

A committed red here would be worse than elsewhere: it is the commit CI judges before the merge.

### Task 6 — the stale fitted cap that flaps popover-clip-fit on CI

<!-- task: red=`sh -c 'node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "re-fits when the viewport shrinks under an open menu" && node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts'` ac=AC-REFIT-AWAIT,AC-REFIT-COVER -->

**In-arc repair of a defect this arc's investigation attributed** (bl-orch disposition, 2026-08-29). Not scope creep: `tests/e2e/popover-clip-fit.spec.ts` is a surface Task 2 already runs, and the defect was diagnosed here.

**What it is.** `popover-clip-fit.spec.ts` was flapping on CI across branches whose diffs touch nothing in this path, at a constant 20px ("scroller 384 vs available 364"). Not a scrollbar (the band measures 0 on both axes under overlay scrollbars, and it would move width, not height) and not a row (rows are 45.3 and 64.8).

**The failing site, and why 20 is a constant rather than a coincidence.** The message is `tests/e2e/popover-clip-fit.spec.ts:341`, in `settled fit at 390x${height} (reduced motion)`, parameterized over `[844, 667, 560]` in that order. The test branches on `CSS_CAP`, a FILE CONSTANT of 384 (`tests/e2e/popover-clip-fit.spec.ts:143`): where the room exceeds the cap it asserts the scroller is at or under it, and where the room is under the cap it asserts equality with the room. At 390x844 the room (~563) exceeds the cap, so the scroller is genuinely capped at 384. At 390x667 the room is ~364 and the equality branch runs. Run 667 against a stale 844 viewport and a scroller still holding the CSS cap is judged by the branch demanding it equal the room: 384 against 364, every time, because both numbers are fixed. That also explains the direction — only a shrink from a capped cell into an uncapped one produces it, which is why 560 after 667 is benign.

My own earlier account said "the 375x844 cap measured against 375x667 room" and quoted a sweep of the CONTAINMENT loop at `tests/e2e/popover-clip-fit.spec.ts:388` (cells 390x560, 375x667, 375x844, 1280x800; healthy `clientHeight` 273, 364, 384, 384). Those are a different loop's cells at a different width, and 384 is not one of them measured — it is the constant the code applies whenever room allows. Correcting it because a plan that cites the wrong loop has not earned the diagnosis, even when the repair it reaches is right.

**Why it flaps rather than failing outright.** `page.setViewportSize` returns before the renderer has necessarily applied the new size, so the freshly navigated document can run its first placement against the PREVIOUS cell's viewport; the `ResizeObserver` re-fit then lands after the assertion has already sampled. That is why the delta is a CONSTANT 20 (the difference between two fixed cells) rather than a varying magnitude, and why it flaps in both directions per runner. Local evidence: 3 failures in 7 full-file runs, 0 in 6 runs of the same cells in isolation, and 3 passes under deliberate 8-core load, so the trigger is cell ADJACENCY and not load.

**The repair settles EVERY cell boundary, not the two observed pairs** (bl-orch, 2026-08-29), and putting the await in `openMenu` alone would NOT have been that. Counted in the file: 33 `page.setViewportSize` sites and 5 `page.goto` sites. FOUR of the five navigations are already inside helpers — `openMenu` (`tests/e2e/popover-clip-fit.spec.ts:172`), `openToggleBanner` (:284), `placeReplica` (:1166), `bootModal` (:1478) — and one is bare (:1752). My earlier count said two in helpers and three bare. It was wrong in both directions and is corrected here.

The correction does not move the conclusion; it strengthens it. Four helpers each hand-rolling `goto` plus `fonts.ready` plus a `__hydrated` wait is exactly the duplication one entry point collapses. What it DOES move is the mechanism: **none of the four helpers sets the viewport.** The viewport is set at the test site and the helper navigates afterwards, so the race is between the test's `setViewportSize` and the helper's navigation, and awaiting inside the helpers could never have closed it. A correct conclusion reached from a wrong premise is still a premise to fix.

**A second shape, which is not a navigation at all.** The anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:1400`) sets 375x844, opens the menu, then sweeps `[844, 667, 560, 400]` calling `setViewportSize` and `await page.waitForTimeout(80)` before each read, never navigating. The 80ms is a sleep that the comment beside it calls a coalesced frame; a runner slower than 80ms reads the previous cell's cap for the same structural reason. So the entry point needs a resize-in-place path as well as a navigating one — the census sweeps four heights against ONE open menu, and re-navigating would destroy the thing it measures.

So: one `settleAtViewport` entry point that owns setting the viewport, navigating, awaiting hydration, waiting until `window.innerWidth`/`innerHeight` actually equal the intended size, and polling the fitted geometry to two agreeing samples. Every test in the file routes through it. The file already carries `settledGeometry` for exactly this purpose; these assertions were the ones not using it.

**Derived cover, not a longer list.** Routing today's sites is an enumeration that reopens the moment someone adds one, so the task also adds a narrow structural assertion over this one file: no `page.goto(` or `page.setViewportSize(` outside the two marked helper call sites. A new entry point then fails by default instead of silently inheriting the race. The assertion builds its needles by concatenation so its own source does not match them, and asserts the two marked sites EXIST, so an empty offender list cannot be satisfied by a file that deleted the helper.

**The filtered command is not sufficient on its own, so the marker runs the whole file too.** Round 2 was right: this task rewrites every viewport and navigation site in the file and then proves only the shrink case, while Task 2's full-file run happens BEFORE this refactor and cannot judge its result. A helper that passes the regression and the structural scan can still break a caller the `-g` filter never selects — the toggle-page callers have no attention-menu geometry at all. So the red is the filtered case AND the unfiltered file, conjoined, and this task's commit is green on both.

A tolerance widening is explicitly NOT the repair. The numbers are correct at every cell, and loosening the bound would hide a real cap regression.

**The regression case, which fails under a simulated stale cap.** Open the menu at 375x844 so the cap is 384, then shrink to 375x667 WITHOUT re-navigating, and assert the scroller settles to 364. Remove the await and it reads 384 and fails; keep it and it re-fits. The stale cap is staged rather than mocked, so the case exercises the real `ResizeObserver` path.

<!-- tasks: end -->

### 3.1 Both new reds are probed, not asserted

Round 1's repair replaced two markers that could not fail with two that use the repo's own meta-guards. That repair is only as good as the claim that those guards actually move, so both were run in both directions on 2026-08-29 and reverted. This is the evidence the round-2 brief asks for, supplied rather than promised.

| probe | setup | result |
| --- | --- | --- |
| Task 4 RED | name both gate halves verbatim in Task 4, no marker line | `_metaInvariant8Closeout` FAILS: "declares the invariant-8 dual gate but carries no valid impeccable-gate marker line" |
| Task 4 GREEN | same, plus `impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none` | 14 passed |
| Task 5 RED | add this row's id to `BACKLOG_GRADUATED` with the branch as provenance, leave the row unarchived | `_metaDeferralLedgerGraduation` FAILS on three assertions, including "missing from BACKLOG-archive.md" and "has no heading in the archive" |
| Task 5 GREEN | registry row PRESENT, row archived with `fix/attention-autoopen-suppress-phone` provenance and a `## ` heading, in-progress marker off, absent from `BACKLOG.md` | **143 passed** — one MORE than the 142 baseline, because the registry row adds its own `it.each` case. `_metaLedgerInProgress` passes too (17) on the same staged state. |

**The GREEN leg was re-probed after round 2, because the first one tested the wrong state.** Round 2 was right: the original green reverted the registry row and ran the BASELINE, which says nothing about the state Task 5 produces. Archive-only, heading present, and branch provenance are distinct assertions in that guard (`tests/docs/_metaDeferralLedgerGraduation.test.ts:845`, `tests/docs/_metaDeferralLedgerGraduation.test.ts:854`), and a baseline run exercised none of them. "Both directions were probed" was false as written.

The re-probe stages the real final state — registry row present, the row cut from `BACKLOG.md` and archived under a `## ` heading, the status line rewritten to name the branch, the in-progress marker gone — then reverts. The count is the tell: **143, not 142.** A baseline run cannot produce 143, so the number itself distinguishes the two states, which is exactly the property the original probe lacked.

**One methodological note, because it nearly produced a false result.** The first run of the Task 4 probe reported GREEN, which would have read as "the red does not fire" and condemned the repair. The edit had silently not applied: it targeted wording that the §3 rewrite had already replaced, so the guard was never given a plan naming both halves. A probe that did not apply is not evidence of anything, and the only reason it was caught is that the next step checked the literal strings were present before trusting the run. Same shape as Task 0's harness fault, where a static page served in place of the live one failed an arrival assertion in a way indistinguishable from a product finding.

## 4. Acceptance criteria

Every row of §2 that names an implementable assertion has an id here, and every id maps to a §2 row — with one stated exception, below. The §2 rows with no id say why in the table itself: the hydration property is NOT ASSERTED and holds by construction, the negative wizard branch asserts nothing by design, the panel-clamp and menu-row-floor rows are covered by suites this arc does not modify, and the wizard-occlusion row is discharged by spec §5.1 rather than by a test, because a measurement already taken cannot be given a red.

**The exception: AC-REFIT-AWAIT and AC-REFIT-COVER have no §2 row, deliberately.** §2 maps the SPEC's claims, and Task 7 does not implement a spec claim; it repairs a pre-existing test defect this arc's investigation attributed, dispositioned in-arc by bl-orch. Giving it a §2 row would assert a spec obligation that does not exist. Its obligation is stated where the work is, in Task 6, and it carries the same anti-vacuity structure the rest of §4 does: a regression case that fails under a simulated stale cap, plus a derived cover rather than a list of today's sites. So the closure check over §2 and §4 is two-sided everywhere except these two ids, which are one-sided by construction.

- **AC-OCCLUSION-DISCRIMINATES** — the helper reports a known covering node as interceptor, and reports none when it is absent. Fails against an oracle positive by construction (the panel's own rows) or negative by construction (demanding the panel element itself).
- **AC-OCCLUSION-PARTIAL** — a control covered over its top-left quadrant only is reported intercepted at `tl` and clean at `centre`. Fails against centre-only sampling.
- **AC-OCCLUSION-NONVACUOUS** — the helper throws on an empty control set, and when a caller names a control absent from it.
- **AC-SUPPRESS-PHONE** — phone answer, actionable items, frames flushed: the menu never mounts.
- **AC-OPEN-DESKTOP** — desktop answer, same fixture: it does mount. Anti-vacuity partner of AC-SUPPRESS-PHONE.
- **AC-BOUNDARY-640** — 639x667 suppresses, 640x667 opens. Fails against any cutoff between 400 and 640, which 375-plus-desktop alone does not.
- **AC-REVEAL-TIME-READ** — desktop while the effect runs, phone inside the frame: stays closed. Fails against a predicate sampled before `requestAnimationFrame`.
- **AC-CANCELLED-FRAME** — a dependency change cancelling a pending frame leaves the one-shot unconsumed and the reveal still happens. Fails against consuming before scheduling.
- **AC-EMPTY-NO-CONSUME** — a phone arrival with zero actionable items does not consume the one-shot; widening and then receiving items opens the menu. Fails against consuming on the empty-arrival return.
- **AC-RESIZE-SHRINK-STAYS-OPEN** — auto-opened at desktop, shrunk below `sm`: still open. Nothing force-closes.
- **AC-RESIZE-WIDEN-STAYS-CLOSED** — suppressed at 375, widened, effect re-run by an item change: still closed. Fails against returning on suppression without consuming.
- **AC-OPERATOR-OPENED-SURVIVES** — a menu opened by tapping the pill survives a resize in BOTH directions. This is the fence the design rests on: the change never closes a menu.
- **AC-PILL-COUNT** — the pill's ACCESSIBLE NAME carries the count at 375 with the menu suppressed. Asserted against the accessible name, not the text of a container that also renders menu rows.
- **AC-FOCUS-IDENTITY** — `document.activeElement` after arrival is the close button, identically with and without suppression. Fails against a change that lets the focus-rescue effect fire on a suppressed arrival.
- **AC-ARIA-EXPANDED** — a suppressed arrival reports `aria-expanded="false"` on the pill.
- **AC-TOGGLE-OPERABLE** — at 375 the published toggle has zero interceptions at all five sample points, and the pre-fix run of the same assertion names an interceptor.
- **AC-PILL-TAP** — the pill's band is hit-tested 21px above and below centre and returns the pill both times, and tapping opens the menu. Fails against a `pointer-events: none` pseudo-element that keeps the geometry and takes no taps.
- **AC-ANCHOR-WRAPPER** (REGRESSION, green on arrival) — the panel's top edge sits below the pill WRAPPER's bottom edge, which differs from the pill's own because the wrapper carries the title block. Exists because re-anchoring to `pillRef` reintroduces this arc's defect through an otherwise-green suite.
- **AC-WIZARD-MIRROR** — on a positive Task 0 only: the wizard satisfies the same predicate obligations as the published surface, not a chosen subset — including the reveal-time read, which is why Task 3 names a wizard JSDOM command alongside the browser one.
- **AC-WIZARD-ESC-OWNERSHIP** — on a suppressed wizard arrival, a menu opened by tapping the pill claims Escape: Escape closes the MENU and the modal stays open. Fails against an implementation that sets `menuAutoOpened` on the suppression path, which no other id here can see.
- **AC-IMPECCABLE** — both gate halves run on the diff, every P0 and P1 fixed or carrying a `DEFERRED.md` entry, and the marker line written with real counts.
- **AC-REFIT-AWAIT** — with the menu opened at 375x844 and the viewport then shrunk to 375x667 without re-navigation, the scroller settles to the 375x667 cap (364) rather than holding the 375x844 cap (384). Fails if the re-fit await is removed. Derived from measured per-cell values, not hardcoded.
- **AC-REFIT-COVER** — no bare `page.goto(` or `page.setViewportSize(` survives outside the single settle helper in `popover-clip-fit.spec.ts`. Fails by default when a new entry point is added, which is what makes this a derived cover rather than a list of the five sites that exist today.
- **AC-GRADUATION** — the in-progress marker is off and the row archived with its branch as provenance, in the PR's last commit.

## 12. Close-out

**Reading CI on this branch, recorded before it can be misread.** This branch holds an invariant-12 ledger claim, and `_metaLedgerClaimCollision` resolves identity from `ev.pull_request.head.repo`, which a `workflow_dispatch` payload does not carry. On a dispatch run identity falls back to `ci-unknown` with `selfBranch` null, so the branch's OWN claim reads as a collision and one shard reds. That is a self-collision artifact of the conservative fallback, pinned by the guard's own test, and it is impossible on a `pull_request` run. So: judge this branch by PR-run CI, and if a dispatch run is needed for signal, use quality or standalone-e2e only. Do not chase that red, and do not remove the claim to make it go away. (bl-orch fleet note, 2026-08-29, from diagrec's find.)

**For the PR body:** this branch carries an in-arc repair of a defect it did not introduce. `popover-clip-fit.spec.ts` was flapping fleet-wide on CI at a constant 20px; this arc's investigation attributed it to a stale fitted cap leaking across parameterized viewport cells in the single worker, and bl-orch dispositioned the repair in-arc (2026-08-29) because this arc already touches that surface. It is a test defect, process-facing, and files no ledger row under the mint freeze. Task 6 and AC-REFIT-AWAIT.

UI surface: `components/admin/showpage/PublishedReviewModal.tsx`, and `components/admin/wizard/Step3ReviewModal.tsx`, since Task 0's probe came back positive. The dual gate is owed before READY.

The machine-checkable `impeccable-gate:` marker line is written HERE at close-out, with the real counts, per the grammar in `tests/docs/_invariant8Closeout.ts`. It is deliberately absent until then, and this plan deliberately does not spell both gate-half names verbatim before that point: the marker's grammar admits `RAN` and `RAN-DEGRADED` and no placeholder, so writing one now would either be a false claim that the gate ran or a malformed line the guard rejects. Naming both halves is what attaches the obligation, so the obligation attaches in the same edit that discharges it. Task 4 owns both.
