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
| A DB-free real-browser vehicle exists | `tests/e2e/standalone.config.ts` has NO `webServer` entry; each MEMBER SPEC boots its own http server in `beforeAll` and needs no dev server and no Supabase (`tests/e2e/standalone.config.ts:4`). Round 4 was right that the earlier wording put the boot on the config, which matters because it hides real work: a new member has to bring its own server. PROVED rather than assumed: `popover-clip-fit.spec.ts -g "44px floor at 375x667"` passed in 4.3s under `pnpm heavy` while the shared Postgres was under an orchestrator quiet period. |
| The live entry renders the real modal AND the toggle | `tests/e2e/_pillFocusLiveEntry.tsx` mounts the real `PublishedReviewModal` through `_publishedReviewModalHarness.tsx`, whose default state is `archived: false, published: true`, so `StatusStrip` renders the toggle. |
| `__setItems(a, n, s, degraded)`: `a` is the ACTIONABLE arm | `_pillFocusLiveEntry.tsx`, `buildItems` sets `actionable: true` on that arm only. |
| `standalone.config.ts` testMatch is an explicit allow-list | Its own header: a spec not named there "runs nowhere and silently proves nothing". |

### 1.2 Blast radius, enumerated rather than sampled

| Surface | Phone widths | Dependency on arrival auto-open |
| --- | --- | --- |
| `tests/e2e/wizard-attention-menu.spec.ts` | 375x667, 375x844, 390x560 | HARD. `openModal` (`tests/e2e/wizard-attention-menu.spec.ts:136-150`) asserts `aria-expanded="true"` and waits for the panel on arrival. Only touched if P-1 is positive; then it becomes width-aware. |
| `tests/e2e/popover-clip-fit.spec.ts` | same three | NONE. `openMenu` (`tests/e2e/popover-clip-fit.spec.ts:171-181`) already clicks the pill when auto-open did not fire. This is the tolerant shape the wizard helper would adopt. |
| `tests/e2e/published-review-modal.layout.spec.ts` | 375x812 | NONE, but NOT for the reason two earlier versions of this row gave. They said it "never opens or awaits the menu", which is true of the TEST and irrelevant: the menu opens ITSELF there. `openHarness` (`tests/e2e/published-review-modal.layout.spec.ts:247`) boots at 375x812 and the harness supplies `actionable: true` items (`tests/e2e/_publishedReviewModalHarness.tsx:65`), so today's unguarded auto-open fires and all three assertions run with the panel OPEN. Under suppression they run with it closed. The real reason they are unaffected: T-TAP is a hit test that must resolve to the pill, and it passes today WITH the panel open, so the panel occludes neither sample point; removing an overlay can only remove interceptors. The other two measure in-flow geometry, and an absolutely positioned panel is not in the header's flow. That is an ARGUMENT, so **Task 2 runs the suite**, which is what settles it. |
| `tests/e2e/_p1WizardOcclusionProbe.spec.ts` | 375x667, 375x844, 390x560 | HARD, and MISSED by the first two versions of this table. It asserts `aria-expanded="true"` on arrival (`tests/e2e/_p1WizardOcclusionProbe.spec.ts:114`) at exactly the widths Task 3 suppresses. It is this arc's own temporary probe, its result is recorded in spec §5.1, and Task 3 DELETES it rather than repairing it. It is also absent from the standalone baseline, so it reds that gate today. |
| Every jsdom suite that renders an auto-opened menu | n/a | NONE by construction: the global stub (`tests/setup.ts:84`) answers `matches: false` for every query, so the suppression query reads false. This is why §2 of the spec spells the predicate as positive evidence. **Task 2 proves it**, with the six suites named and the command written out, rather than asserting it here. **Note the same fact does double duty and the two uses do not conflict:** the stub's query-blindness is what makes these existing suites safe, and it is also what would make a NEW width assertion vacuous, which is why Task 2 installs a query-aware stub of its own instead of reaching for the ambient one. A suite that never meant to test width behaviour is genuinely unaffected; one that does is genuinely broken. |

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
| The panel's VERTICAL anchor stays the pill's wrapper, never the pill | §8 | **P-2.8: with the menu opened by tap at 375, the panel's top edge sits below the WRAPPER's bottom edge, not the pill's.** Round 4's finding, and the most valuable one of the stage: §8 called this load-bearing and nothing asserted it, yet swapping `panel.offsetParent` for `pillRef.current` passes every suppression, tap, containment and desktop row here while moving the panel up onto the status strip. That is this arc's own defect reached by a different route, and the source already records the attempt and its measured result (`components/admin/showpage/AttentionMenu.tsx:378-388`). The two edges differ because the wrapper carries the title block, so the assertion discriminates. |
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

**Two pieces of CI wiring that every task below touches, stated once here rather than forgotten in each.** Round 3 found both, and one of them is live on this branch right now.

**The standalone baseline.** `.github/workflows/standalone-e2e.yml:70` runs the whole standalone config and compares the report against `tests/e2e/standalone-baseline.json`, and the comparator rejects extra FILES and extra test IDENTITIES alike (`scripts/check-standalone-baseline.mjs:180`). So every task that registers a new spec, or adds a named case to a registered one, regenerates the baseline with `node scripts/check-standalone-baseline.mjs --write` and commits it in the SAME commit. That is Task 1 (new occlusion spec), Task 2 (new suppression spec), Task 3 (the P-1 removal below), and Task 5 (a new named case in a registered file).

**The P-1 probe is unbaselined TODAY, so this gate is already red on this branch.** `tests/e2e/_p1WizardOcclusionProbe.spec.ts` was registered in `tests/e2e/standalone.config.ts:86` when the measurement ran, and `tests/e2e/standalone-baseline.json` was never regenerated — grep it for `_p1Wizard` and there is nothing. That is my defect from commit `787acdef3`, not a consequence of this plan, and it would have surfaced as a red gate on the first PR run.

It also cannot simply be baselined and left: the probe asserts `aria-expanded="true"` on arrival at the three phone widths (`tests/e2e/_p1WizardOcclusionProbe.spec.ts:114`), which is exactly what Task 3 makes false. Its own header says it is temporary and deleted once the result lands, and the result HAS landed, in spec §5.1. **Task 3 deletes the file, removes its `testMatch` entry, and regenerates the baseline.** Round 3 was right that the blast-radius table claimed an enumeration while missing a suite its own arc had added.

**Harness readiness for both new Playwright vehicles, stated once, because `docs/agents/writing-plans.md:33` makes it mandatory and round 4 found it missing.** The standalone config boots nothing; each member spec brings its own server, so a new member that does not is a new member that hangs.

| | occlusion-probe.spec.ts, new in Task 1 | attention-autoopen-suppress.spec.ts, new in Task 2 |
| --- | --- | --- |
| **Boot** | Own http server in `beforeAll`, serving a STATIC fixture page. No bundling, no React: the four occlusion cases are absolutely positioned divs, which is what makes the geometry exact. | Own http server in `beforeAll`, bundling `tests/e2e/_pillFocusLiveEntry.tsx` out of process with pinned esbuild and compiling real Tailwind, mirroring `popover-clip-fit.spec.ts:59-115`. The LIVE entry, never a static page. |
| **Port** | Ephemeral, captured from the listening socket, torn down in `afterAll`. Never a fixed port: members run in one worker but the file may be run alongside others. | Same. |
| **Readiness gate** | `document.fonts.ready`, then the fixture's own sentinel. No hydration to await — nothing mounts. | `document.fonts.ready`, then **`window.__hydrated === true`**, never `networkidle`. This is not optional and is not boilerplate: this arc's P-1 probe served the static harness page instead of the live one, nothing mounted, and its arrival assertion failed in a way indistinguishable from a product finding. The hydration sentinel is what separates those two outcomes. |
| **Detach safety** | N/A — every measurement re-queries inside one `page.evaluate`, and nothing re-renders. | Every measurement re-queries its elements INSIDE the evaluate callback, so no handle outlives a re-render. State is driven through `window.__setItems` (React state, detach-safe), never by reload. |

**Non-vacuity gate on the live vehicle, inherited from P-1's fault.** Before any suppression assertion, the spec asserts the control set is non-empty and the modal actually mounted. A run that reports zero controls is a broken harness, not a clean surface, and the two must never produce the same red.

<!-- tasks: depth=3 red-contract -->

### Task 1 — the shared occlusion helper

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/occlusion-probe.spec.ts` red-state=authored red-target=`tests/e2e/helpers/occlusionProbe.ts` why=`probeOcclusion does not exist; the task lands a stub returning empty results so the new cases fail on their CONTENTS rather than on an unresolved import` ac=AC-OCCLUSION-DISCRIMINATES,AC-OCCLUSION-NONVACUOUS,AC-OCCLUSION-PARTIAL -->

New files: tests/e2e/helpers/occlusionProbe.ts, tests/e2e/occlusion-probe.spec.ts, and its static fixture page. Registered in tests/e2e/standalone.config.ts testMatch in the same commit.

**A real browser, not vitest.** The helper's whole body is `getBoundingClientRect` and `document.elementFromPoint` inside `page.evaluate`. The suite defaults to the `node` environment and a file opts into jsdom with a `// @vitest-environment jsdom` pragma (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:1`). Neither runs this helper usefully: node has no DOM at all, and jsdom computes no layout, so every rect is zero, every control is dropped by the zero-area rule, and the helper throws "control set is empty" — a test asserting that throw passes while proving nothing about occlusion. That is this arc's own recurring class (LIM-NONDISCRIMINATING-FIXTURE), and it survived my first draft.

**The RED is behavioural, not a collection failure — and it is a STEP, not the commit.** Write the fixture, the spec, and a stub `probeOcclusion` returning `{ controls: [], interceptions: [] }`; run the command and observe the assertions fail on their CONTENTS rather than on an unresolved import, which `docs/agents/writing-plans.md` rejects, and which "No tests found" also is not. Then replace the stub with the real helper and run again to green. One commit, at the end, with the real helper in it.

Round 2 was right that the earlier version described the stub as what the commit LANDS, which leaves this task red forever with no later task named to green it.

Fixture stages four cases on one page, absolutely positioned so the geometry is exact: a control covered by a node INSIDE the panel (one interception, `insidePanel: true`); a control covered by an unrelated node (one interception, `insidePanel: false`); an uncovered control (none); and a control covered over its top-left quadrant ONLY (interception at `tl`, none at `centre`). The fourth is what makes the five sample points earn their place — with centre-only sampling it reports clean.

### Task 2 — the predicate: author the failing assertions, then implement

<!-- task: red=`sh -c 'node_modules/.bin/vitest run tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx; j=$?; node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-autoopen-suppress.spec.ts; b=$?; exit $((j|b))'` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:780` why=`the auto-open callback sets the one-shot and opens with no width guard at all, so every suppression case fails on behaviour in BOTH vehicles` ac=AC-SUPPRESS-PHONE,AC-OPEN-DESKTOP,AC-REVEAL-TIME-READ,AC-CANCELLED-FRAME,AC-EMPTY-NO-CONSUME,AC-FOCUS-IDENTITY,AC-ARIA-EXPANDED,AC-BOUNDARY-640,AC-TOGGLE-OPERABLE,AC-PILL-TAP,AC-PILL-COUNT,AC-ANCHOR-WRAPPER,AC-RESIZE-SHRINK-STAYS-OPEN,AC-RESIZE-WIDEN-STAYS-CLOSED,AC-OPERATOR-OPENED-SURVIVES -->

**One red command, both vehicles, and NOT joined by `&&`.** Round 3 caught the version that was, and `docs/agents/writing-plans.md` already rejects that shape by name: a conjunct behind `&&` whose earlier expected failure short-circuits it is "asserted red, never observed", because the conjunction is the GREEN criterion, not the red one. Under `&&` the jsdom command fails, which is the point, and the browser command then never runs at all — so the browser-only ids would be claimed on a vehicle that was never executed. I walked into a trap this repo had already documented.

The marker grammar takes exactly one `red=`, so both run unconditionally and their statuses are OR-ed:

```
sh -c 'CMD_A; a=$?; CMD_B; b=$?; exit $((a|b))'
```

Both are observed on every invocation, the exit is non-zero if either failed, and it is a single honest verdict rather than two smuggled in. Parse-checked with `sh -nc`, which is what the red-contract arm does on dispatch. Round 2 was right that the earlier split marked only the Vitest command while claiming browser-only ids (AC-TOGGLE-OPERABLE, AC-PILL-TAP, AC-ANCHOR-WRAPPER) on the same task: a jsdom command cannot fail for a geometry reason, so those ids had no named pre-implementation execution at all. jsdom computes no layout; a real engine does not let you sample a width inside an animation frame you control. Neither vehicle is optional and neither covers the other.

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

<!-- task: red=`sh -c 'node_modules/.bin/vitest run tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx; j=$?; node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts; b=$?; exit $((j|b))'` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:375` why=`the wizard's rAF opens unconditionally, so the mirrored suppression cases fail in jsdom AND the width-aware openModal fails in the browser` ac=AC-WIZARD-MIRROR,AC-WIZARD-ESC-OWNERSHIP -->

Task 0 measured POSITIVE at 375x667, 375x844 and 390x560 (spec §5.1), so this task runs. The wizard gets the identical predicate at the identical position and inherits the WHOLE obligation set, not a subset. `openModal` becomes width-aware, expecting auto-open at ≥`sm` and opening by tapping the chip below it, which is the tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses.

The red is real: the mirrored suppression cases are authored first and fail against the wizard's unguarded effect (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Same step order as Task 2 — author, observe both reds, implement, green, one commit.

**This task re-runs the wizard's EXISTING jsdom suites after its edit, and round 4 named the mutant that makes this load-bearing.** Task 2 runs `Step3ReviewModal.test.tsx` and `step3ReviewModal.transitions.test.tsx` to prove they are unaffected by the PUBLISHED change — that run happens BEFORE the wizard is touched and says nothing about this task. Drop `setMenuAutoOpened(true)` while editing this callback and every assertion Task 3 owns still passes, because suppression means the callback never runs at phone widths and the browser suite does not exercise auto-opened Escape transparency. The assertion that catches it already exists: `(12a) auto-opened + first Escape closes the MODAL, not the menu` (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:613`). It survives suppression in jsdom because the ambient stub answers desktop, so auto-open still fires there — which is precisely why it is a live oracle for this edit and not collateral.

```
node_modules/.bin/vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx
```

Note what this means for AC-WIZARD-ESC-OWNERSHIP: `(12a)` covers the AUTO-OPENED branch and the new id covers the SUPPRESSED, tap-opened branch. Two branches, two assertions, and neither substitutes for the other.

**This task also retires the P-1 probe**, in the same commit: delete `tests/e2e/_p1WizardOcclusionProbe.spec.ts`, drop `_p1WizardOcclusionProbe` from the `testMatch` alternation at `tests/e2e/standalone.config.ts:86`, and regenerate the baseline. Its arrival assertion is false under this task's own change, and its purpose is discharged — the measurement it produced is in spec §5.1. Deleting it is the plan's only correct move: repairing it would keep a temporary probe alive as a permanent suite asserting a superseded behaviour.

**Both vehicles, for the same reason Task 2 needs both.** Round 2 was right that naming only the Playwright suite cannot establish AC-WIZARD-MIRROR: the inherited obligation set includes the reveal-time read, and §2 of the table says in writing that this case CANNOT be a browser case, because `page.setViewportSize` crosses CDP asynchronously and races the very frame the assertion must land inside. So a wizard implementation that samples width before `requestAnimationFrame` would satisfy a Playwright-only Task 3 while violating the obligation it claims to inherit. The mirrored jsdom cases go in a new tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx, with the same query-aware `matchMedia` Task 2 installs. **There is no shared wizard harness to render against, and the plan should not imply one:** `tests/components/admin/wizard/__fixtures__/` does not exist, the data builders live in `tests/components/admin/wizard/_step3ReviewFixture.ts`, and the render helper is file-local at `tests/components/admin/wizard/Step3ReviewModal.test.tsx:149`. This task extracts that helper into a shared fixture, which is the right moment for it — the mirrored suite is its second consumer. Also note the wizard's predicate reads the NEEDS-LOOK count, not the actionable count the published surface uses (`components/admin/wizard/Step3ReviewModal.tsx:375`), so the mirrored cases build wizard fixtures rather than copying the published ones — the ambient stub at `tests/setup.ts:84-95` is as much a hazard here as there.

**One obligation the mirror cannot reach, so it gets its own id.** The wizard's rAF sets `setMenuAutoOpened(true)` as well as the one-shot ref, and `menuAutoOpened` is passed to the menu as `autoOpened` (`components/admin/wizard/Step3ReviewModal.tsx:647`), forwarded as `escTransparentUntilEngaged` (`components/admin/wizard/WizardAttentionMenu.tsx:102`), and turned into `const engagedRef = useRef(!escTransparentUntilEngaged)` (`components/admin/showpage/AttentionMenu.tsx:347`). Escape passes THROUGH to the modal until the operator engages with a panel they did not open. `PublishedReviewModal` never passes that prop at all, so it defaults false there.

AC-WIZARD-MIRROR quantifies over the published surface's obligations, which is exactly why it is blind to this one: there is no published obligation to mirror. Under suppression the rAF never runs, `menuAutoOpened` stays false, and a tap-opened menu claims Escape immediately — correct, and it falls out of the design. But the coupling runs through three components and a defaulted prop, and an edit that sets `menuAutoOpened` on the suppression path looks harmless (it only records that an auto-open was considered) while silently handing Escape to the modal on every phone-opened menu. AC-WIZARD-ESC-OWNERSHIP asserts the BEHAVIOUR — Escape closes the menu and leaves the modal open — rather than the prop, because the prop is the mechanism and the Escape target is the obligation.

### Task 4 — invariant 8, the UI gate

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-29-attention-auto-open-phone-suppression.md:279` why=`this task's edit is the one that names both gate halves in section 12, which attaches the obligation; the guard then fails until the marker line lands with real counts` ac=AC-IMPECCABLE -->

The red is genuine and mechanical: this task's commit is the one that names both gate halves in §12, and naming them attaches the obligation, so the closeout guard fails until the marker line lands with real counts. It passes once the marker is written. That is exactly the red-then-green shape, using the repo's own guard rather than a lint that cannot see the gate.

### Task 5 — the stale fitted cap that flaps popover-clip-fit on CI

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` red-state=authored red-target=`tests/e2e/popover-clip-fit.spec.ts:172` why=`the structural cover fails against the tree as it stands because all five page.goto sites and all 33 setViewportSize sites are unrouted; it is a text scan over this file, so it cannot pass on a lucky schedule` ac=AC-REFIT-COVER,AC-REFIT-AWAIT,AC-REFIT-CONTRACT -->

**In-arc repair of a defect this arc's investigation attributed** (bl-orch disposition, 2026-08-29). Not scope creep: `tests/e2e/popover-clip-fit.spec.ts` is a surface Task 2 already runs, and the defect was diagnosed here.

**What it is.** `popover-clip-fit.spec.ts` was flapping on CI across branches whose diffs touch nothing in this path, at a constant 20px ("scroller 384 vs available 364"). Not a scrollbar (the band measures 0 on both axes under overlay scrollbars, and it would move width, not height) and not a row (rows are 45.3 and 64.8).

**The failing site, and why 20 is a constant rather than a coincidence.** The message is `tests/e2e/popover-clip-fit.spec.ts:341`, in `settled fit at 390x${height} (reduced motion)`, parameterized over `[844, 667, 560]` in that order. The test branches on `CSS_CAP`, a FILE CONSTANT of 384 (`tests/e2e/popover-clip-fit.spec.ts:143`): where the room exceeds the cap it asserts the scroller is at or under it, and where the room is under the cap it asserts equality with the room. At 390x844 the room (~563) exceeds the cap, so the scroller is genuinely capped at 384. At 390x667 the room is ~364 and the equality branch runs. Run 667 against a stale 844 viewport and a scroller still holding the CSS cap is judged by the branch demanding it equal the room: 384 against 364, every time, because both numbers are fixed. That also explains the direction — only a shrink from a capped cell into an uncapped one produces it, which is why 560 after 667 is benign.

My own earlier account said "the 375x844 cap measured against 375x667 room" and quoted a sweep of the CONTAINMENT loop at `tests/e2e/popover-clip-fit.spec.ts:388` (cells 390x560, 375x667, 375x844, 1280x800; healthy `clientHeight` 273, 364, 384, 384). Those are a different loop's cells at a different width, and 384 is not one of them measured — it is the constant the code applies whenever room allows. Correcting it because a plan that cites the wrong loop has not earned the diagnosis, even when the repair it reaches is right.

**Why it flaps rather than failing outright.** `page.setViewportSize` returns before the renderer has necessarily applied the new size, so the freshly navigated document can run its first placement against the PREVIOUS cell's viewport; the `ResizeObserver` re-fit then lands after the assertion has already sampled. That is why the delta is a CONSTANT 20 (the difference between two fixed cells) rather than a varying magnitude, and why it flaps in both directions per runner. Local evidence: 3 failures in 7 full-file runs, 0 in 6 runs of the same cells in isolation, and 3 passes under deliberate 8-core load, so the trigger is cell ADJACENCY and not load.

**The repair settles EVERY cell boundary, not the two observed pairs** (bl-orch, 2026-08-29), and putting the await in `openMenu` alone would NOT have been that. Counted in the file: 33 `page.setViewportSize` sites and 5 `page.goto` sites. FOUR of the five navigations are already inside helpers — `openMenu` (`tests/e2e/popover-clip-fit.spec.ts:172`), `openToggleBanner` (:284), `placeReplica` (:1166), `bootModal` (:1478) — and one is bare (:1752). My earlier count said two in helpers and three bare. It was wrong in both directions and is corrected here.

The correction does not move the conclusion; it strengthens it. Four helpers each hand-rolling `goto` plus `fonts.ready` plus a `__hydrated` wait is exactly the duplication one entry point collapses. What it DOES move is the mechanism: **none of the four helpers sets the viewport.** The viewport is set at the test site and the helper navigates afterwards, so the race is between the test's `setViewportSize` and the helper's navigation, and awaiting inside the helpers could never have closed it. A correct conclusion reached from a wrong premise is still a premise to fix.

**Only TWO reads are actually exposed, and saying "38 sites" overstates it.** Inventory of every geometry read in the file:

| Site | How it settles | Exposed |
| --- | --- | --- |
| `tests/e2e/popover-clip-fit.spec.ts:726` and its sibling at line 797 | `expect.poll(() => settledGeometry(page))` | NO — poll retries until the two-sample check agrees, so a slow re-fit is waited out |
| `tests/e2e/popover-clip-fit.spec.ts:307` , the `settled fit at 390x${height}` loop | nothing beyond `openMenu`; one `page.evaluate` | YES, and this is where CI failed |
| `tests/e2e/popover-clip-fit.spec.ts:1400`, the anchor-room census | bare `waitForTimeout(80)`, single read | YES |

`settledGeometry` carries a fixed `waitForTimeout(80)` internally (`tests/e2e/popover-clip-fit.spec.ts:241`), which is safe ONLY because both its callers wrap it in `expect.poll`; lifting it out of that wrapper would silently move it into the exposed column. So the repair's value is concentrated in two reads, and the structural cover's justification is not "38 sites race" but "two race today, and nothing stops a third being added." The new `settledFittedGeometry` also returns the geometry rather than `settledGeometry`'s booleans, which is why the census can adopt it at all — the boolean form swallows the numbers, which is exactly why that site hand-rolled a sleep.

**A second shape, which is not a navigation at all.** The anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:1400`) sets 375x844, opens the menu, then sweeps `[844, 667, 560, 400]` calling `setViewportSize` and `await page.waitForTimeout(80)` before each read, never navigating. The 80ms is a sleep that the comment beside it calls a coalesced frame; a runner slower than 80ms reads the previous cell's cap for the same structural reason. So the entry point needs a resize-in-place path as well as a navigating one — the census sweeps four heights against ONE open menu, and re-navigating would destroy the thing it measures.

So: one `settleAtViewport` entry point that owns setting the viewport, navigating, awaiting hydration, waiting until `window.innerWidth`/`innerHeight` actually equal the intended size, and polling the fitted geometry to two agreeing samples. Every test in the file routes through it. The file already carries `settledGeometry` for exactly this purpose; these assertions were the ones not using it.

**Derived cover, not a longer list.** Routing today's sites is an enumeration that reopens the moment someone adds one, so the task also adds a narrow structural assertion over this one file: no `page.goto(` or `page.setViewportSize(` outside the two marked helper call sites. A new entry point then fails by default instead of silently inheriting the race. The assertion builds its needles by concatenation so its own source does not match them, and asserts the two marked sites EXIST, so an empty offender list cannot be satisfied by a file that deleted the helper.

**The one-file scoping is probed, not assumed.** The obvious candidate to extend to is `tests/e2e/wizard-attention-menu.spec.ts`, which has the same SHAPE — `openModal` (`tests/e2e/wizard-attention-menu.spec.ts:137`) sets the viewport and then navigates, exactly the ordering that races here — and which Task 3 edits anyway. It does not carry the defect: `grep -n 'CSS_CAP\|384\|available\|clientHeight\|waitForTimeout'` over that file returns NOTHING. No cap constant, no room arithmetic, no fixed sleep, no capped-versus-uncapped branch. That branch is what turns a stale viewport into a wrong NUMBER rather than a different-but-valid geometry, and without it a stale viewport yields a layout those assertions are indifferent to. A repo-wide ban would be a recognizer this arc has no evidence to justify; a one-file cover is what the evidence supports.

**The marker runs the UNFILTERED file, never a `-g` slice.** Round 2 was right that proving only the shrink case cannot judge a refactor of every site in the file — Task 2's full-file run happens before this refactor. Round 3 was right about the sharper version: a `-g` filter runs the new case in ISOLATION, which is precisely the condition under which the defect never reproduced (0 failures in 6 isolated runs). So the filter is gone entirely. The red is the helper's contract suite plus the whole file, both run unconditionally, and this task's commit is green on both.

A tolerance widening is explicitly NOT the repair. The numbers are correct at every cell, and loosening the bound would hide a real cap regression.

**The RED cannot be a race, and round 3 was right to reject the version that was.** My own evidence says the flap is 3 failures in 7 full-file runs and ZERO in 6 isolated runs, and a `-g` filter runs the new case in isolation — the condition under which it never failed. A red that depends on losing a race is a red that reports green most of the time, and "remove the await and it reads 384" was an assertion I had not earned: without a settle, the read is whatever the renderer happens to have applied, which on a fast machine is usually the NEW value. So the timing case was proving the opposite of what it claimed.

**Round 4 then rejected my replacement, correctly, and the reason is worth stating because it is structural rather than a slip.** I made the red an unresolved import on a new contract suite. `docs/agents/writing-plans.md:15` rejects exactly that: an import that resolves once the task writes its own test helper is made green by writing test code, not by correcting anything. I had already handled this shape properly in Task 1 — land a stub so the failure is behavioural — and then reintroduced it three tasks later in the same document.

**The deeper point: this task is a TEST-ONLY repair, so a production-defect red does not exist for it.** There is no production surface to be defective; the defect IS in the suite. Manufacturing a red by deleting a helper and watching an import fail is theatre. What the current tree genuinely fails is the structural cover: all five `page.goto` sites and all 33 `page.setViewportSize` sites are unrouted TODAY, so the cover is red on arrival, for a reason that is a text scan and therefore cannot pass on a lucky schedule. That is the red, it is `red-state=authored` against a real defect in the file named by `red-target`, and it is the only one of the three assertions honest enough to carry the marker.

The other two are REGRESSION assertions in this plan's own vocabulary, and §4 now labels them so:

1. **AC-REFIT-CONTRACT** (REGRESSION), a scoped unit suite over `settleAtViewport` against a fake page. **Round 4 was right that the first version of this pinned the wrong half.** Lagging only `innerWidth`/`innerHeight` is satisfied by an implementation that returns the instant the viewport matches — which is BEFORE the `ResizeObserver`-driven re-fit lands, and that gap is the entire defect. So the fake lags TWO things independently: the reported viewport, and the fitted geometry behind it. Four cases:

   - viewport lags, geometry immediate: does not return until the viewport matches.
   - viewport immediate, GEOMETRY lags: does not return until two consecutive geometry samples agree. **This is the case that kills the wrong implementation**, and the first version had no equivalent.
   - both lag, by different amounts: returns only after the later of the two.
   - a size that never arrives, and a geometry that never settles: throws in both, rather than returning a value the caller would trust.

   Both lags are parameters, so every case is deterministic on every machine.
2. **AC-REFIT-COVER**, the structural scan, which is red the moment it is authored because five call sites are unrouted, and green when they are routed. Pure text, zero timing.
3. **AC-REFIT-AWAIT**, the settled-value case, kept but demoted to what it can honestly claim: after `settleAtViewport` to 375x844 with the menu open and then to 375x667 in place, the scroller settles to the 375x667 room and not to `CSS_CAP`. It runs in the FULL file, not under `-g`, because cell adjacency is the condition under which the defect was ever observed. It is a REGRESSION assertion in this plan's own vocabulary — green on arrival once the helper exists — and it is excluded from the red claim. Its job is to fail if a later edit removes the settle, which it does deterministically, because by then the helper's absence breaks the contract suite too.

The three together are the closure: one pins the waiting, one pins the routing, one pins the value. None asks a reviewer or a runner to lose a race on cue.

### Task 6 — graduation, and the PR's last commit

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:100` why=`adding this row's id to BACKLOG_GRADUATED while the row is still active in BACKLOG.md fails the archive-only, heading and provenance assertions` ac=AC-GRADUATION -->

Round 1 was right that `_metaLedgerInProgress` accepts both the in-progress and the graduated state and so cannot carry this. `_metaDeferralLedgerGraduation` can: adding this row's id to `BACKLOG_GRADUATED` with its branch as provenance makes the guard FAIL until the row is actually archived with that provenance, and pass once it is.

**This task is LAST, it IS the PR's last commit, and both halves of the cycle are inside it.** Round 3 was right that the earlier version said this while a further task followed it, which would have removed the ledger claim before the work was done and breached invariant 12. Graduation now sits at the end of the numbered order, where the claim it clears is actually finished. The earlier version created the red in this task's commit and cleared it in a later one, which is the same defect round 2 found in Tasks 1 and 2 — the round did not name this third instance; the sweep for the shape did. Invariant 12 requires the marker off and the row archived in the PR's LAST commit, so the resolution is not to move the green earlier but to make this task that commit:

1. Add the row's id to `BACKLOG_GRADUATED` with the branch as provenance. Run the guard, observe the RED.
2. Archive the row into `BACKLOG-archive.md` with that provenance and take the in-progress marker off `BACKLOG.md`. Run again, green.
3. Commit once. That commit is the PR's last, and the tree is green in it.

A committed red here would be worse than elsewhere: it is the commit CI judges before the merge.

<!-- tasks: end -->

### 3.1 Both new reds are probed, not asserted

Round 1's repair replaced two markers that could not fail with two that use the repo's own meta-guards. That repair is only as good as the claim that those guards actually move, so both were run in both directions on 2026-08-29 and reverted. This is the evidence the round-2 brief asks for, supplied rather than promised.

| probe | setup | result |
| --- | --- | --- |
| Task 4 RED | name both gate halves verbatim in Task 4, no marker line | `_metaInvariant8Closeout` FAILS: "declares the invariant-8 dual gate but carries no valid impeccable-gate marker line" |
| Task 4 GREEN | same, plus `impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none` | 14 passed |
| Task 6 RED | add this row's id to `BACKLOG_GRADUATED` with the branch as provenance, leave the row unarchived | `_metaDeferralLedgerGraduation` FAILS on three assertions, including "missing from BACKLOG-archive.md" and "has no heading in the archive" |
| Task 6 GREEN | registry row PRESENT, row archived with `fix/attention-autoopen-suppress-phone` provenance and a `## ` heading, in-progress marker off, absent from `BACKLOG.md` | **143 passed** — one MORE than the 142 baseline, because the registry row adds its own `it.each` case. `_metaLedgerInProgress` passes too (17) on the same staged state. |

**The GREEN leg was re-probed after round 2, because the first one tested the wrong state.** Round 2 was right: the original green reverted the registry row and ran the BASELINE, which says nothing about the state Task 5 produces. Archive-only, heading present, and branch provenance are distinct assertions in that guard (`tests/docs/_metaDeferralLedgerGraduation.test.ts:845`, `tests/docs/_metaDeferralLedgerGraduation.test.ts:854`), and a baseline run exercised none of them. "Both directions were probed" was false as written.

The re-probe stages the real final state — registry row present, the row cut from `BACKLOG.md` and archived under a `## ` heading, the status line rewritten to name the branch, the in-progress marker gone — then reverts. The count is the tell: **143, not 142.** A baseline run cannot produce 143, so the number itself distinguishes the two states, which is exactly the property the original probe lacked.

**One methodological note, because it nearly produced a false result.** The first run of the Task 4 probe reported GREEN, which would have read as "the red does not fire" and condemned the repair. The edit had silently not applied: it targeted wording that the §3 rewrite had already replaced, so the guard was never given a plan naming both halves. A probe that did not apply is not evidence of anything, and the only reason it was caught is that the next step checked the literal strings were present before trusting the run. Same shape as Task 0's harness fault, where a static page served in place of the live one failed an arrival assertion in a way indistinguishable from a product finding.

## 4. Acceptance criteria

Every row of §2 that names an implementable assertion has an id here, and every id maps to a §2 row — with one stated exception, below. The §2 rows with no id say why in the table itself: the hydration property is NOT ASSERTED and holds by construction, the negative wizard branch asserts nothing by design, the panel-clamp and menu-row-floor rows are covered by suites this arc does not modify, and the wizard-occlusion row is discharged by spec §5.1 rather than by a test, because a measurement already taken cannot be given a red.

**The closure rule, stated as a rule because the name-list form has now failed three rounds running.** Round 1 found seven §2 rows with no id, round 2 found the eighth, and round 3 found that my "the exception is these two ids" sentence was itself wrong by three. Each time the repair extended a list, and each time the list went stale the moment an id was added. So it is not a list any more.

**§2 maps the SPEC's claims. §4 holds every acceptance id, and not all of them come from the spec.** The rule, checkable per bullet and immune to additions:

> Every §2 row names an AC or states why it has none. Every §4 id either maps to a §2 row, or its own bullet names the obligation source that is not the spec.

The second half is the part that kept breaking, and it is now local: an id that does not come from the spec says so in the same sentence that defines it, so adding one cannot invalidate a claim made somewhere else. Three non-spec sources appear here — a plan-wide invariant (AGENTS.md invariants 8 and 12), an in-arc repair of a pre-existing defect (Task 5), and a coupling that exists on one surface only (the wizard's Escape ownership, which AC-WIZARD-MIRROR is structurally blind to because the published surface has no counterpart to mirror).

Reconciled mechanically at authoring time rather than described: extracting declared ids from §4 and claimed ids from every task marker gives **25 and 25, with an empty difference in both directions.** Round 3 counted 24 against my stated 23; the count is now derived rather than asserted, and AC-REFIT-CONTRACT is the id this round added.

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
- **AC-PILL-COUNT** — the pill's ACCESSIBLE NAME carries the count at 375 with the menu suppressed. Asserted against the accessible name, not the text of a container that also renders menu rows — and the case where that scoping BITES is the desktop control, not this one: under suppression the panel does not render at all, so a container-scoped query passes trivially and proves nothing, while at desktop the panel IS mounted and its rows carry counts of their own. Premise verified: the pill's name is its own text, `{count} {issue|issues}` with an `sr-only` exact count past 99 (`components/admin/showpage/PublishedReviewModal.tsx:1142`), and none of it reads `menuOpen`.
- **AC-FOCUS-IDENTITY** — `document.activeElement` after arrival is the close button, identically with and without suppression, **read only after effects and frames are flushed.** The flush is not boilerplate: the focus-rescue effect (`components/admin/showpage/PublishedReviewModal.tsx:466`) carries NO dependency array and by its own comment "runs after EVERY commit", so `activeElement` passes through intermediate values on the way to its settled one and an early read can catch a transient — indistinguishable, from the assertion alone, from the real thing. Fails against a change that lets that effect fire on a suppressed arrival: an implementation setting `menuEffectivelyOpen` transiently true would enter the rescue branch and, before focus reached the close button, move it to the pill instead.
- **AC-ARIA-EXPANDED** — a suppressed arrival reports `aria-expanded="false"` on the pill.
- **AC-TOGGLE-OPERABLE** — at 375 the published toggle has zero interceptions at all five sample points, and the pre-fix run of the same assertion names an interceptor.
- **AC-PILL-TAP** — the pill's band is hit-tested 21px above and below centre and returns the pill both times, and tapping opens the menu. Fails against a `pointer-events: none` pseudo-element that keeps the geometry and takes no taps.
- **AC-ANCHOR-WRAPPER** (REGRESSION, green on arrival) — the panel's top edge sits below the pill WRAPPER's bottom edge, which differs from the pill's own because the wrapper carries the title block. Exists because re-anchoring to `pillRef` reintroduces this arc's defect through an otherwise-green suite.
- **AC-WIZARD-MIRROR** — on a positive Task 0 only: the wizard satisfies the same predicate obligations as the published surface, not a chosen subset — including the reveal-time read, which is why Task 3 names a wizard JSDOM command alongside the browser one.
- **AC-WIZARD-ESC-OWNERSHIP** (source: a wizard-only coupling with no published counterpart, so no §2 row — §2 maps claims both surfaces share) — on a suppressed wizard arrival, a menu opened by tapping the pill claims Escape: Escape closes the MENU and the modal stays open. Fails against an implementation that sets `menuAutoOpened` on the suppression path, which no other id here can see.
- **AC-IMPECCABLE** (source: plan-wide invariant 8, not a spec claim, so no §2 row) — both gate halves run on the diff, every P0 and P1 fixed or carrying a `DEFERRED.md` entry, and the marker line written with real counts.
- **AC-REFIT-CONTRACT** (REGRESSION; source: Task 5's in-arc repair of a pre-existing test defect, so no §2 row) — `settleAtViewport` returns only after BOTH the reported viewport matches the requested size AND two consecutive fitted-geometry samples agree, and throws rather than returning when either never settles. Driven against a fake page that lags the two independently, so the case where geometry lags behind an already-correct viewport is exercised on its own — that is the gap a viewport-only contract leaves open, and it is exactly where the real defect lives.
- **AC-REFIT-AWAIT** (REGRESSION; source: Task 5's in-arc repair, so no §2 row) — with the menu opened at 375x844 and the viewport then shrunk to 375x667 without re-navigation, the scroller settles to the 375x667 cap (364) rather than holding the 375x844 cap (384). Fails if the re-fit await is removed. Derived from measured per-cell values, not hardcoded.
- **AC-REFIT-COVER** (carries Task 5's RED; source: Task 5's in-arc repair, so no §2 row) — no bare `page.goto(` or `page.setViewportSize(` survives outside the single settle helper in `popover-clip-fit.spec.ts`. Fails by default when a new entry point is added, which is what makes this a derived cover rather than a list of the five sites that exist today.
- **AC-GRADUATION** (source: plan-wide invariant 12, not a spec claim, so no §2 row) — the in-progress marker is off and the row archived with its branch as provenance, in the PR's last commit.

## 12. Close-out

**Reading CI on this branch, recorded before it can be misread.** This branch holds an invariant-12 ledger claim, and `_metaLedgerClaimCollision` resolves identity from `ev.pull_request.head.repo`, which a `workflow_dispatch` payload does not carry. On a dispatch run identity falls back to `ci-unknown` with `selfBranch` null, so the branch's OWN claim reads as a collision and one shard reds. That is a self-collision artifact of the conservative fallback, pinned by the guard's own test, and it is impossible on a `pull_request` run. So: judge this branch by PR-run CI, and if a dispatch run is needed for signal, use quality or standalone-e2e only. Do not chase that red, and do not remove the claim to make it go away. (bl-orch fleet note, 2026-08-29, from diagrec's find.)

**For the PR body:** this branch carries an in-arc repair of a defect it did not introduce. `popover-clip-fit.spec.ts` was flapping fleet-wide on CI at a constant 20px; this arc's investigation attributed it to a stale fitted cap leaking across parameterized viewport cells in the single worker, and bl-orch dispositioned the repair in-arc (2026-08-29) because this arc already touches that surface. It is a test defect, process-facing, and files no ledger row under the mint freeze. Task 6 and AC-REFIT-AWAIT.

UI surface: `components/admin/showpage/PublishedReviewModal.tsx`, and `components/admin/wizard/Step3ReviewModal.tsx`, since Task 0's probe came back positive. The dual gate is owed before READY.

The machine-checkable `impeccable-gate:` marker line is written HERE at close-out, with the real counts, per the grammar in `tests/docs/_invariant8Closeout.ts`. It is deliberately absent until then, and this plan deliberately does not spell both gate-half names verbatim before that point: the marker's grammar admits `RAN` and `RAN-DEGRADED` and no placeholder, so writing one now would either be a false claim that the gate ran or a malformed line the guard rejects. Naming both halves is what attaches the obligation, so the obligation attaches in the same edit that discharges it. Task 4 owns both.
