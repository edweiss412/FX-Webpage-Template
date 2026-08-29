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
| tests/e2e/_p1WizardOcclusionProbe.spec.ts (deleted in Step 0.5) | 375x667, 375x844, 390x560 | HARD, and MISSED by the first two versions of this table. It asserts `aria-expanded="true"` on arrival (tests/e2e/_p1WizardOcclusionProbe.spec.ts line 114 (deleted in Step 0.5)) at exactly the widths Task 3 suppresses. It is this arc's own temporary probe, its result is recorded in spec §5.1, and Task 3 DELETES it rather than repairing it. It is also absent from the standalone baseline, so it reds that gate today. |
| Every jsdom suite that renders an auto-opened menu | n/a | NONE by construction: the global stub (`tests/setup.ts:84`) answers `matches: false` for every query, so the suppression query reads false. This is why §2 of the spec spells the predicate as positive evidence. **Task 2 proves it**, with the six suites named and the command written out, rather than asserting it here. **Note the same fact does double duty and the two uses do not conflict:** the stub's query-blindness is what makes these existing suites safe, and it is also what would make a NEW width assertion vacuous, which is why Task 2 installs a query-aware stub of its own instead of reaching for the ambient one. A suite that never meant to test width behaviour is genuinely unaffected; one that does is genuinely broken. |

## 2. Obligations: every claim in the spec, and the assertion that settles it

Spec review round 2's finding 4 was that §9 had drifted from what the rest of the document promised: §6 said the arrival-focus identity was asserted, §8 said the pill's band was, and the consequence bound needed the phone-width tap path, and §9 carried none of the three. The repair is this table rather than three added sentences, so the next claim added without an assertion is visible as a missing row.

| Claim | Where | Settled by |
| --- | --- | --- |
| Suppressed at <`sm`, with actionable items | §2 | **AC-SUPPRESS-PHONE.** P-2.1; jsdom phone case |
| Auto-opens at ≥`sm` | §2 | **AC-OPEN-DESKTOP.** P-3; jsdom desktop control |
| The cutoff is 640, not merely "some phone width" | §2 | **AC-BOUNDARY-640.** **P-2 boundary cells at 639x667 (suppressed) and 640x667 (auto-opens).** Round 3's finding: 375 plus a desktop width is satisfied by `(max-width: 400px)` just as well as by the specified query, and that impostor wrongly auto-opens at 500, below the project's `sm`. Only a pair straddling the boundary pins the constant, and the pair also pins the 639.98 complement: at exactly 640 the query must read false. |
| Width is read at REVEAL time, not effect time | §2.1 | **AC-REVEAL-TIME-READ.** jsdom: answer desktop while the effect runs, phone inside the frame, assert closed. NOT a browser case: `page.setViewportSize` crosses CDP asynchronously and would race the frame it must land inside, giving a case that is flaky or vacuous. |
| `actionable.length === 0` still does not consume | §2.1, §4 row 3 | **AC-EMPTY-NO-CONSUME.** jsdom: empty at phone, widen, then items arrive, assert it opens |
| A CANCELLED frame leaves the one-shot unconsumed | §2.1 | **AC-CANCELLED-FRAME.** jsdom: at a desktop width, change a dependency so the effect re-runs and cancels its pending frame BEFORE it fires, then let the next frame settle, and assert the menu opens. Round 3's finding: §2.1 calls this load-bearing and nothing asserted it, so an implementation that consumed the ref before scheduling would pass every other row here while silently losing the reveal whenever a dependency changed inside the frame window. |
| No width read during render, so no hydration branch | §3 | NOT ASSERTED, and the row says so rather than implying cover. Round 3 was right that the earlier claim was false: the jsdom harness uses Testing Library's client-only `render` (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:177`), which never produces server markup and so cannot discriminate a hydration mismatch at all. The property holds by construction instead: the predicate is a function called only inside the effect's animation frame (§2.1), and effects do not run on the server. An implementation that moved the read into render would be a different design, not a regression this suite could catch, and it would be caught by review of that change. Recorded in §10 as a documented limit. |
| Auto-opened then shrunk STAYS OPEN | §4 row 1 | **AC-RESIZE-SHRINK-STAYS-OPEN.** P-2 sibling case at desktop then phone |
| Suppressed then widened stays closed | §4 row 2 | **AC-RESIZE-WIDEN-STAYS-CLOSED.** P-2 sibling case, re-running the effect via an item change |
| An OPERATOR-opened menu survives a resize in either direction | §4 row 4 | **AC-OPERATOR-OPENED-SURVIVES.** P-2 sibling cases: open by tapping the pill at 375, widen past `sm`, assert still open; and open by tapping at desktop, shrink below `sm`, assert still open. §4 promises this in both directions and only the auto-opened shrink was covered. It is the row that pins "this spec never closes a menu", which is the fence the whole design rests on. |
| Pill accessible name carries the count | §6 | **AC-PILL-COUNT.** P-2.2 |
| Arrival focus identical with and without suppression | §6 | **AC-FOCUS-IDENTITY.** jsdom: `document.activeElement` is the close button in both |
| `aria-expanded` reads false on a suppressed arrival | §6 | **AC-ARIA-EXPANDED.** jsdom phone case |
| Panel width/x clamped inside the clip | §8 | Unchanged, covered by `tests/e2e/popover-clip-fit.spec.ts`, which **Task 2 runs** rather than merely citing |
| The panel hangs BELOW its anchor, never over the content above it | §8 | **AC-ANCHOR-PANEL-HANGS-BELOW.** Round 1 of whole-diff review was right that this row still described the retired comparison while §4 recorded its retirement — the row stayed normative after the criterion it named was gone. What it used to claim: that the panel's top sits below the pill WRAPPER's bottom, which differs from the pill's own. **Measured with the menu open: `wrapper.bottom - pill.bottom` is 0.0 at 375x667, 640x800 and 1280x800.** The wrapper is 0.6px taller at the TOP and identical at the bottom, so that comparison is satisfied identically by both anchors and could never fail. The row now asserts what IS falsifiable — the panel's top at or below the pill's bottom, so it hangs off its anchor rather than overlaying the content above — and the design constraint that `offsetParent` remains the anchor is kept in the spec, guarded by AC-TOGGLE-OPERABLE, which asserts the measured consequence directly. |
| Pill tap band ≥44px, and the band actually TAKES taps | §8 | **AC-PILL-TAP.** P-2.3, hit-tested above and below centre rather than measured. A `pointer-events: none` pseudo-element keeps the computed band and loses the taps. |
| Menu rows ≥44px | §8 | Unchanged, `tests/e2e/popover-clip-fit.spec.ts`, run by Task 2 |
| Toggle receives its own pointer events | §8 | **AC-TOGGLE-OPERABLE.** P-2.4 |
| Pill tap opens the menu at <`sm` | consequence bound | **AC-PILL-TAP** (the same id: one assertion hit-tests the band and then taps it, because a band that takes no taps and a tap that opens nothing are the same failure to an operator). P-2.5 |
| The occlusion test discriminates, and is non-vacuous | spec §9.1 | AC-OCCLUSION-DISCRIMINATES, AC-OCCLUSION-PARTIAL, AC-OCCLUSION-NONVACUOUS. Added after plan review round 1: §9.1 is a spec claim and the table carried no row for it, so the helper both probes depend on was itself unobligated. |
| Wizard occlusion status | §5, §10 | **NO AC, and here is why.** Round 2 was right that this row had neither an id nor a disposition, and right that AC-WIZARD-MIRROR does not cover it: the mirror covers the positive branch's IMPLEMENTATION, while this row's obligation is that the measurement was TAKEN and is on the record where the next arc will look. That is discharged by spec §5.1 carrying the three viewports, the per-viewport control count, and every intercepted control with its interceptor — a documentation artifact, not an executable claim. An AC would need a red, and no task can produce one: Task 0 has already run, and a test asserting a spec section contains a table pins prose rather than behaviour. Task 3 is the enforcement that matters — it cannot start without §5.1, because §5.1 is what says the positive branch is the live one. |
| **If P-1 is positive:** the wizard gets the IDENTICAL predicate at the IDENTICAL position, so it inherits the IDENTICAL obligations | §5 | **AC-WIZARD-MIRROR and AC-WIZARD-ESC-OWNERSHIP.** **The wizard mirrors EVERY row in this table that concerns the predicate, not a chosen three.** Round 4 was right that naming three (suppression, tap-to-open, desktop) discriminates none of the five ways the predicate can be built wrong, and the wizard effect exposes every one of those ordering points (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Since the claim is that the two effects are the same code in the same position, the honest obligation is the whole set rather than a subset of it: the boundary pair, the reveal-time read, the cancelled-frame non-consumption, the `n === 0` non-consumption, the consumed-on-suppression row, and the operator-opened resize, each mirrored against the wizard's own harness. Stating it as "the same set" rather than enumerating it twice is deliberate: a second enumeration is a second thing to drift. Round 3's finding: the positive branch changed the wizard's behavior and specified no oracle for the changed state. It also requires editing that file's `openModal` helper (`tests/e2e/wizard-attention-menu.spec.ts:136-150`), which today ASSERTS `aria-expanded="true"` on arrival before dismissing the panel, at 375x667, 375x844 and 390x560. Under suppression that assertion is false at exactly those three viewports, so the helper becomes width-aware: expect auto-open at ≥`sm`, and open by tapping the chip below it. This is the same tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses. |
| **If P-1 is negative:** the wizard is untouched | §5, §10 | No new assertion, by design. The existing wizard suite continues to pass unchanged, which is itself the evidence that nothing moved. |

The two published-surface probes are real-browser assertions. jsdom computes no layout, so `getBoundingClientRect` and `elementFromPoint` are meaningless there; the jsdom half of the test plan asserts only the predicate's effect on `menuOpen`, with `window.matchMedia` stubbed per file.

## 3. Tasks

Ordered so that every production change is preceded by a test that fails against the tree as it stands. Round 1 was right that the first draft did not do this: it changed production in Task 2 and authored the browser assertions in Task 3, where they arrive green.

**Round 2 was right that the repair over-corrected into the opposite defect.** Splitting authoring from implementing gave three tasks that END red and are greened by a LATER task: Task 1 committed a stub, Task 2 committed failing assertions for Task 3 to fix, and the graduation task created its red in one commit and cleared it in the PR's last. Invariant 1 is `failing test → minimal implementation → passing test → commit`, and all four steps are inside ONE task. A task that commits red hands the next task a tree that does not build its own case, and if the arc stops there, main gets a red suite.

So the cycle is now stated as STEPS WITHIN a task, never as a boundary between tasks. Every task below ends green on every command it names. Where a red must be observed and recorded before the fix — the pre-fix interceptor for AC-TOGGLE-OPERABLE is the one that matters — the observation is a step in the same task, and what gets recorded is the OUTPUT, in the commit message, not a committed failing suite. Round 2 found three instances; the sweep for the shape found the third, graduation, which the round did not name.

**Two kinds of assertion, named apart, because conflating them is what produced the original defect.** A RED-carrying assertion fails against current production and passes after the change. A REGRESSION assertion is green on arrival by construction and exists to fail if a LATER edit breaks it. AC-ANCHOR-PANEL-HANGS-BELOW and the pill hit-band are regression assertions and are marked as such; claiming a red for them would be a false claim.

### Task 0 — the wizard measurement (no RED, deliberately)

Outside the enrolled region below, because it changes no production code and therefore has no red. Round 1 was right that an enrolled marker here would be green on arrival and stay green under the negative disposition.

Run P-1 at 375x667, 375x844 and 390x560 against the existing wizard harness and record the full result in spec §5.1 — the viewports, the control count per viewport, and every intercepted control with its interceptor. §10 carries only the one-line disposition and points at §5.1. **DONE, and the result is in spec §5.1.** Round 2 was right that the earlier version asserted POSITIVE while the number lived only in a commit message and a temporary probe, and pointed at a §5.1 that did not exist.

```
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts
```

Its output selects the branch Task 3 takes. It runs FIRST because that branch decides how much of the work exists.

**Two pieces of CI wiring that every task below touches, stated once here rather than forgotten in each.** Round 3 found both, and one of them is live on this branch right now.

**The standalone baseline.** `.github/workflows/standalone-e2e.yml:70` runs the whole standalone config and compares the report against `tests/e2e/standalone-baseline.json`, and the comparator rejects extra FILES and extra test IDENTITIES alike (`scripts/check-standalone-baseline.mjs:180`). So every task that registers a new spec, or adds a named case to a registered one, regenerates the baseline with `node scripts/check-standalone-baseline.mjs --write` and commits it in the SAME commit. That is Task 1 (new occlusion spec) and Task 2 (new suppression spec). Step 0.5 removes a file that was never IN the baseline, so it regenerates nothing. The fourth case, a new named case added to an already-registered file, left with Task 5 when the popover repair was split onto its own branch.

**Step 0.5 — delete the P-1 probe, BEFORE Task 1.** Round 5 found the sequencing defect: the deletion used to sit in Task 3, so Task 1's baseline regeneration would have run first and ADDED the probe to the baseline — blessing a file two tasks later delete, and greening a red that Task 0 had left behind. A task that depends on a later task to restore green is the defect this plan has now been caught on twice, and this was its third instance hiding in the CI wiring rather than in a marker.

It is a deletion with no red and no dependents, so it is not a TDD task and sits outside the contract region, like Task 0. Remove tests/e2e/_p1WizardOcclusionProbe.spec.ts (deleted in Step 0.5), drop `_p1WizardOcclusionProbe` from the `testMatch` alternation at `tests/e2e/standalone.config.ts:86`, and leave the baseline alone — the probe was never in it, so removing the file is what makes the config and the baseline agree again. One commit, and the `standalone-e2e` gate is green from that point on rather than at the end.

**Why it can go first, and why it must.** Its purpose is discharged: the measurement is in spec §5.1, with the viewports, the control counts and every interceptor. Nothing downstream reads it. And it asserts `aria-expanded="true"` on arrival at the three phone widths, which Task 3 makes false — so leaving it alive past Task 3 breaks the branch, and leaving it alive past Task 1 corrupts the baseline. First is the only position that is correct on both counts.

**The gate is red on this branch TODAY, and that is Task 0's residue.** tests/e2e/_p1WizardOcclusionProbe.spec.ts (deleted in Step 0.5) was registered in `tests/e2e/standalone.config.ts:86` when the measurement ran, and `tests/e2e/standalone-baseline.json` was never regenerated — grep it for `_p1Wizard` and there is nothing. That is my defect from commit `787acdef3`, not a consequence of this plan, and it would have surfaced as a red gate on the first PR run.

It also cannot simply be baselined and left: the probe asserts `aria-expanded="true"` on arrival at the three phone widths (tests/e2e/_p1WizardOcclusionProbe.spec.ts line 114 (deleted in Step 0.5)), which is exactly what Task 3 makes false. Its own header says it is temporary and deleted once the result lands, and the result HAS landed, in spec §5.1. **Task 3 deletes the file, removes its `testMatch` entry, and regenerates the baseline.** Round 3 was right that the blast-radius table claimed an enumeration while missing a suite its own arc had added.

**Harness readiness for both new Playwright vehicles, stated once, because `docs/agents/writing-plans.md:33` makes it mandatory and round 4 found it missing.** The standalone config boots nothing; each member spec brings its own server, so a new member that does not is a new member that hangs.

| | occlusion-probe.spec.ts, new in Task 1 | attention-autoopen-suppress.spec.ts, new in Task 2 |
| --- | --- | --- |
| **Boot** | Own http server in `beforeAll`, serving a STATIC fixture page. No bundling, no React: the four occlusion cases are absolutely positioned divs, which is what makes the geometry exact. | Own http server in `beforeAll`, mirroring `tests/e2e/popover-clip-fit.spec.ts:59-115`. Bundle `tests/e2e/_pillFocusLiveEntry.tsx` through the EXISTING helper `tests/e2e/_step3ReviewModalBundle.mjs` rather than hand-rolling esbuild: that helper exists to replicate Next's elision of `"use server"` actions and node builtins the modal's import graph reaches, and a plain esbuild call fails on them. Compile real Tailwind via `compileEntryCss`. The LIVE entry, never a static page. |
| **Port** | `server.listen(0, "127.0.0.1")`, port read back from `server.address()`, closed in `afterAll` — the shape at `tests/e2e/popover-clip-fit.spec.ts:110-117`. Never a fixed port: members run in one worker, but the file may be run alongside others. | Same. |
| **Readiness gate** | `document.fonts.ready`, then the fixture's own sentinel. No hydration to await — nothing mounts. | `document.fonts.ready`, then **`window.__hydrated === true`**, never `networkidle`. This is not optional and is not boilerplate: this arc's P-1 probe served the static harness page instead of the live one, nothing mounted, and its arrival assertion failed in a way indistinguishable from a product finding. The hydration sentinel is what separates those two outcomes. |
| **Detach safety** | N/A — every measurement re-queries inside one `page.evaluate`, and nothing re-renders. | Every measurement re-queries its elements INSIDE the evaluate callback, so no handle outlives a re-render. State is driven through `window.__setItems` (React state, detach-safe), never by reload. |

**Non-vacuity gate on the live vehicle, inherited from P-1's fault.** Before any suppression assertion, the spec asserts the control set is non-empty and the modal actually mounted. A run that reports zero controls is a broken harness, not a clean surface, and the two must never produce the same red.

<!-- tasks: depth=3 red-contract -->

### Task 1 — the shared occlusion helper

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/occlusion-probe.spec.ts` red-state=authored red-target=`tests/e2e/helpers/occlusionProbe.ts:80` why=`probeOcclusion does not exist; the task lands a stub returning empty results so the new cases fail on their CONTENTS rather than on an unresolved import` ac=AC-OCCLUSION-DISCRIMINATES,AC-OCCLUSION-NONVACUOUS,AC-OCCLUSION-PARTIAL -->

New files: tests/e2e/helpers/occlusionProbe.ts, tests/e2e/occlusion-probe.spec.ts, and its static fixture page. Registered in tests/e2e/standalone.config.ts testMatch in the same commit.

**A real browser, not vitest.** The helper's whole body is `getBoundingClientRect` and `document.elementFromPoint` inside `page.evaluate`. The suite defaults to the `node` environment and a file opts into jsdom with a `// @vitest-environment jsdom` pragma (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:1`). Neither runs this helper usefully: node has no DOM at all, and jsdom computes no layout, so every rect is zero, every control is dropped by the zero-area rule, and the helper throws "control set is empty" — a test asserting that throw passes while proving nothing about occlusion. That is this arc's own recurring class (LIM-NONDISCRIMINATING-FIXTURE), and it survived my first draft.

**The RED is behavioural, not a collection failure — and it is a STEP, not the commit.** Write the fixture, the spec, and a stub `probeOcclusion` returning `{ controls: [], interceptions: [] }`; run the command and observe the assertions fail on their CONTENTS rather than on an unresolved import, which `docs/agents/writing-plans.md` rejects, and which "No tests found" also is not. Then replace the stub with the real helper and run again to green. One commit, at the end, with the real helper in it.

Round 2 was right that the earlier version described the stub as what the commit LANDS, which leaves this task red forever with no later task named to green it.

Fixture stages four cases on one page, absolutely positioned so the geometry is exact: a control covered by a node INSIDE the panel (one interception, `insidePanel: true`); a control covered by an unrelated node (one interception, `insidePanel: false`); an uncovered control (none); and a control covered over its top-left quadrant ONLY (interception at `tl`, none at `centre`). The fourth is what makes the five sample points earn their place — with centre-only sampling it reports clean.

### Task 2 — the predicate: author the failing assertions, then implement

<!-- task: red=`sh -c 'node_modules/.bin/vitest run tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx; j=$?; node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-autoopen-suppress.spec.ts; b=$?; exit $((j|b))'` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:780` why=`the auto-open callback sets the one-shot and opens with no width guard at all, so every suppression case fails on behaviour in BOTH vehicles` ac=AC-SUPPRESS-PHONE,AC-OPEN-DESKTOP,AC-REVEAL-TIME-READ,AC-CANCELLED-FRAME,AC-EMPTY-NO-CONSUME,AC-FOCUS-IDENTITY,AC-ARIA-EXPANDED,AC-BOUNDARY-640,AC-TOGGLE-OPERABLE,AC-PILL-TAP,AC-PILL-COUNT,AC-ANCHOR-PANEL-HANGS-BELOW,AC-RESIZE-SHRINK-STAYS-OPEN,AC-RESIZE-WIDEN-STAYS-CLOSED,AC-OPERATOR-OPENED-SURVIVES -->

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

The regression assertions in the browser spec (AC-ANCHOR-PANEL-HANGS-BELOW, the pill hit-band) are green throughout, are labelled REGRESSION in the file, and are excluded from this task's red claim.

### Task 3 — the wizard repair (Task 0 came back POSITIVE, so this runs)

<!-- task: red=`sh -c 'node_modules/.bin/vitest run tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx; j=$?; node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts; b=$?; exit $((j|b))'` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:375` why=`the wizard's rAF opens unconditionally, so the mirrored suppression cases fail in jsdom AND the width-aware openModal fails in the browser` ac=AC-WIZARD-MIRROR,AC-WIZARD-ESC-OWNERSHIP -->

Task 0 measured POSITIVE at 375x667, 375x844 and 390x560 (spec §5.1), so this task runs. The wizard gets the identical predicate at the identical position and inherits the WHOLE obligation set, not a subset. `openModal` becomes width-aware, expecting auto-open at ≥`sm` and opening by tapping the chip below it, which is the tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses.

The red is real: the mirrored suppression cases are authored first and fail against the wizard's unguarded effect (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Same step order as Task 2 — author, observe both reds, implement, green, one commit.

**This task re-runs the wizard's EXISTING jsdom suites after its edit, and round 4 named the mutant that makes this load-bearing.** Task 2 runs `Step3ReviewModal.test.tsx` and `step3ReviewModal.transitions.test.tsx` to prove they are unaffected by the PUBLISHED change — that run happens BEFORE the wizard is touched and says nothing about this task. Drop `setMenuAutoOpened(true)` while editing this callback and every assertion Task 3 owns still passes, because suppression means the callback never runs at phone widths and the browser suite does not exercise auto-opened Escape transparency. The assertion that catches it already exists: `(12a) auto-opened + first Escape closes the MODAL, not the menu` (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:613`). It survives suppression in jsdom because the ambient stub answers desktop, so auto-open still fires there — which is precisely why it is a live oracle for this edit and not collateral.

```
node_modules/.bin/vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx
```

Note what this means for AC-WIZARD-ESC-OWNERSHIP: `(12a)` covers the AUTO-OPENED branch and the new id covers the SUPPRESSED, tap-opened branch. Two branches, two assertions, and neither substitutes for the other.

**The P-1 probe is already gone by now** — Step 0.5 deleted it, because leaving it until here would have let Task 1's baseline regeneration bless a doomed file. Recorded so the ordering is not quietly undone: its arrival assertion is false under THIS task's change, which is why it could not survive, and repairing it instead would have kept a temporary probe alive as a permanent suite asserting a superseded behaviour.

**Both vehicles, for the same reason Task 2 needs both.** Round 2 was right that naming only the Playwright suite cannot establish AC-WIZARD-MIRROR: the inherited obligation set includes the reveal-time read, and §2 of the table says in writing that this case CANNOT be a browser case, because `page.setViewportSize` crosses CDP asynchronously and races the very frame the assertion must land inside. So a wizard implementation that samples width before `requestAnimationFrame` would satisfy a Playwright-only Task 3 while violating the obligation it claims to inherit. The mirrored jsdom cases go in a new tests/components/admin/wizard/wizardAutoOpenWidthSuppression.test.tsx, with the same query-aware `matchMedia` Task 2 installs. **There is no shared wizard harness to render against, and the plan should not imply one:** `tests/components/admin/wizard/__fixtures__/` does not exist, the data builders live in `tests/components/admin/wizard/_step3ReviewFixture.ts`, and the render helper is file-local at `tests/components/admin/wizard/Step3ReviewModal.test.tsx:149`. This task extracts that helper into a shared fixture, which is the right moment for it — the mirrored suite is its second consumer. Also note the wizard's predicate reads the NEEDS-LOOK count, not the actionable count the published surface uses (`components/admin/wizard/Step3ReviewModal.tsx:375`), so the mirrored cases build wizard fixtures rather than copying the published ones — the ambient stub at `tests/setup.ts:84-95` is as much a hazard here as there.

**One obligation the mirror cannot reach, so it gets its own id.** The wizard's rAF sets `setMenuAutoOpened(true)` as well as the one-shot ref, and `menuAutoOpened` is passed to the menu as `autoOpened` (`components/admin/wizard/Step3ReviewModal.tsx:647`), forwarded as `escTransparentUntilEngaged` (`components/admin/wizard/WizardAttentionMenu.tsx:102`), and turned into `const engagedRef = useRef(!escTransparentUntilEngaged)` (`components/admin/showpage/AttentionMenu.tsx:347`). Escape passes THROUGH to the modal until the operator engages with a panel they did not open. `PublishedReviewModal` never passes that prop at all, so it defaults false there.

AC-WIZARD-MIRROR quantifies over the published surface's obligations, which is exactly why it is blind to this one: there is no published obligation to mirror. Under suppression the rAF never runs, `menuAutoOpened` stays false, and a tap-opened menu claims Escape immediately — correct, and it falls out of the design. But the coupling runs through three components and a defaulted prop, and an edit that sets `menuAutoOpened` on the suppression path looks harmless (it only records that an auto-open was considered) while silently handing Escape to the modal on every phone-opened menu. AC-WIZARD-ESC-OWNERSHIP asserts the BEHAVIOUR — Escape closes the menu and leaves the modal open — rather than the prop, because the prop is the mechanism and the Escape target is the obligation.

### Task 4 — invariant 8, the UI gate

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-29-attention-auto-open-phone-suppression.md:277` why=`this task's edit is the one that names both gate halves in section 12, which attaches the obligation; the guard then fails until the marker line lands with real counts` ac=AC-IMPECCABLE -->

The red is genuine and mechanical: this task's commit is the one that names both gate halves in §12, and naming them attaches the obligation, so the closeout guard fails until the marker line lands with real counts. It passes once the marker is written. That is exactly the red-then-green shape, using the repo's own guard rather than a lint that cannot see the gate.

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

**The closure rule, stated as a rule because the name-list form has now failed three rounds running.** Round 1 found seven §2 rows with no id, round 2 found the eighth, and round 3 found that my "the exception is these two ids" sentence was itself wrong by three. Each time the repair extended a list, and each time the list went stale the moment an id was added. So it is not a list any more.

**§2 maps the SPEC's claims. §4 holds every acceptance id, and not all of them come from the spec.** The rule, checkable per bullet and immune to additions:

> Every §2 row names an AC or states why it has none. Every §4 id either maps to a §2 row, or its own bullet names the obligation source that is not the spec.

The second half is the part that kept breaking, and it is now local: an id that does not come from the spec says so in the same sentence that defines it, so adding one cannot invalidate a claim made somewhere else. Three non-spec sources appear here — a plan-wide invariant (AGENTS.md invariants 8 and 12), an in-arc repair of a pre-existing defect (Task 5), and a coupling that exists on one surface only (the wizard's Escape ownership, which AC-WIZARD-MIRROR is structurally blind to because the published surface has no counterpart to mirror).

Reconciled mechanically at authoring time rather than described. **Round 5 was right that the earlier reconciliation checked the wrong pair** — it compared §4's declarations against the task markers and never looked at §2 at all, so a rule that talks about §2 rows was verified without reading them. Seventeen rows named a probe (`P-2.1`, "jsdom phone case") where the rule requires an acceptance id, which is the fifth consecutive round this axis has produced a finding, and the fifth time the defect was that the linkage existed in prose rather than in a form anything could check.

Every §2 row now carries its AC id as the first token of its "Settled by" cell, so both directions are greps rather than readings:

```
# every §2 row has an AC id or a stated disposition
awk '/^## 2\./,/^## 3\./' <plan> | grep '^| ' | grep -v '^| ---' | grep -v 'AC-' \
  | grep -vE 'NOT ASSERTED|Unchanged|No new assertion|NO AC'      # expect: empty

# declared ids and claimed ids agree
grep -oE '^- \*\*(AC-[A-Z0-9-]+)\*\*' <plan> | sed 's/- \*\*//;s/\*\*//' | sort > /tmp/d
grep -oE 'ac=[A-Z0-9,-]+' <plan> | sed 's/ac=//' | tr ',' '\n' | sort -u > /tmp/c
diff /tmp/d /tmp/c                                                # expect: empty
```

**One id left §4 in this round, and the reason is the rule working rather than an exception to it.** AC-GRADUATION was declared here while graduation was Task 5. Graduation is now a close-out step rather than a task, no marker claims the id, and `TASK_AC_UNCLAIMED` says so mechanically. Rather than manufacture a task to hold it, the obligation moves to where the work is — the close-out step states it, in the same form the wizard-occlusion row uses. §4 holds ids that TASKS claim; close-out obligations belong to close-out.

Both run clean at authoring time: the first returns nothing, and the second reports **21 declared, 21 claimed, empty difference in both directions.** It was 25 before the split took the three AC-REFIT-* ids, and 22 before AC-GRADUATION moved to close-out. The probe names stay in the cells after the id, because they say WHICH case settles the row and the id alone does not.

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
- **AC-ANCHOR-PANEL-HANGS-BELOW** (REGRESSION, green on arrival) — with the menu open, the panel's top edge sits at or below the pill's bottom edge, so the panel hangs off its anchor rather than overlaying the content above it. Falsifiable: a mutant anchoring the panel higher puts its top above that edge. **Renamed and re-scoped in-arc after measurement, because the id it replaces could not fail.** AC-ANCHOR-WRAPPER asserted that the panel's top sits below the WRAPPER's bottom, on the plan's claim that the wrapper's bottom differs from the pill's because it carries the title block. Measured at 375x667, 640x800 and 1280x800 with the menu open: `wrapper.bottom - pill.bottom` is **0.0 at every width** — the wrapper (`div.relative.min-w-0`) is 0.6px taller only at the TOP, and its bottom edge is the pill's exactly. So the wrapper-versus-pill comparison is satisfied identically by both anchors and cannot discriminate the mutant it named. The source comment at `components/admin/showpage/AttentionMenu.tsx:383` describes a taller wrapper; whatever element that described, it is not this one, and I propagated the claim into an acceptance criterion without measuring it. What DOES catch a re-anchoring is the measured consequence the same comment records — the published toggle becoming unclickable — which is AC-TOGGLE-OPERABLE's job, and this id is now the narrower, honest structural companion to it.
- **AC-WIZARD-MIRROR** — on a positive Task 0 only: the wizard satisfies the same predicate obligations as the published surface, not a chosen subset — including the reveal-time read, which is why Task 3 names a wizard JSDOM command alongside the browser one.
- **AC-WIZARD-ESC-OWNERSHIP** (source: a wizard-only coupling with no published counterpart, so no §2 row — §2 maps claims both surfaces share) — on a suppressed wizard arrival, a menu opened by tapping the pill claims Escape: Escape closes the MENU and the modal stays open. Fails against an implementation that sets `menuAutoOpened` on the suppression path, which no other id here can see.
- **AC-IMPECCABLE** (source: plan-wide invariant 8, not a spec claim, so no §2 row) — both gate halves run on the diff, every P0 and P1 fixed or carrying a `DEFERRED.md` entry, and the marker line written with real counts.

## 12. Close-out

**Reading CI on this branch, recorded before it can be misread.** This branch holds an invariant-12 ledger claim, and `_metaLedgerClaimCollision` resolves identity from `ev.pull_request.head.repo`, which a `workflow_dispatch` payload does not carry. On a dispatch run identity falls back to `ci-unknown` with `selfBranch` null, so the branch's OWN claim reads as a collision and one shard reds. That is a self-collision artifact of the conservative fallback, pinned by the guard's own test, and it is impossible on a `pull_request` run. So: judge this branch by PR-run CI, and if a dispatch run is needed for signal, use quality or standalone-e2e only. Do not chase that red, and do not remove the claim to make it go away. (bl-orch fleet note, 2026-08-29, from diagrec's find.)

**For the PR body:** this arc DIAGNOSED a fleet-wide CI flap it did not introduce, and does not repair it here. `popover-clip-fit.spec.ts` was failing at a constant 20px on branches whose diffs touch nothing in that path; the investigation attributed it to a stale fitted cap leaking across parameterized viewport cells, root-caused it to `CSS_CAP` measured against the 390x667 room, and refuted both competing hypotheses by measurement.

The repair was folded in as a task and then **split back out on 2026-08-29 by bl-orch ruling**, onto `fix/popover-clip-fit-stale-viewport`, which carries the full diagnosis and design. The reason is worth stating in the PR because it is a general one: a test-only repair has no production surface to be defective, so plan-wide invariant 1's red cycle does not fit it, and arguing a red for it three times cost 5 of this stage's 18 plan-review findings on a plan whose design was never contested. That is the documented `2d9d0ba11`-style kill in `AGENTS.md` — split the hardening out of the shipping PR.

**What this arc DOES still own on that surface:** the P-1 probe deletion. tests/e2e/_p1WizardOcclusionProbe.spec.ts (deleted in Step 0.5) asserts `aria-expanded="true"` on arrival at the three phone widths, and Task 3's suppression is what makes that false, so it must die here or this branch breaks its own `standalone-e2e` gate. That gate has been red since `787acdef3` for the separate reason that the probe was registered and never baselined. Both are this arc's, and both close in Task 3.

UI surface: `components/admin/showpage/PublishedReviewModal.tsx`, and `components/admin/wizard/Step3ReviewModal.tsx`, since Task 0's probe came back positive. The dual gate is owed before READY.

The machine-checkable `impeccable-gate:` marker line is written HERE at close-out, with the real counts, per the grammar in `tests/docs/_invariant8Closeout.ts`. Naming both gate halves is what attaches the obligation, so the obligation attaches in the same edit that discharges it. Task 4 owns both.

### 12.1 The invariant-8 dual gate, run 2026-08-29

**Both halves RAN, neither degraded.** The critique's hard invariant is that its two assessments run as isolated sub-agents; they did, in parallel, neither seeing the other's output, so no `RAN-DEGRADED` banner applies. The audit ran against the same diff with the detector evidence the critique's Assessment B had already gathered.

Setup gates: the impeccable context script loaded PRODUCT.md (the script lives in the plugin cache, not in this worktree's `.claude/skills`), register = **product** (admin tool; design SERVES the product), no critique ignore file.

**Scope, stated because it decides what the gate could usefully say.** The UI diff is 54 inserted lines across two files, of which exactly eight are code — the same four lines twice, symmetrically. No JSX, no `className`, no copy, no tokens. So this is a BEHAVIOURAL change on an existing surface, and the useful output is about the UX of a removed cue, not about composition, typography, or palette.

**Audit health score: 19/20 (Excellent).** Accessibility 4, Performance 4, Theming 4, Responsive 3, Anti-patterns 4. The single point off is Responsive, and it is the deferred P1 below. Detector: the bundled detector returned `[]`, exit 0, zero rules fired — and Assessment B did not trust an empty result, running positive controls that correctly fired `overused-font` and `bounce-easing`, so the engine was verified working on `.tsx` before the clean result was believed. B also recorded the honest limit: the regex engine matches CSS-declaration shapes, not Tailwind arbitrary values or JSX style objects, so its greps rather than the detector are load-bearing for that class. Those greps pass: zero raw hex, zero arbitrary values introduced, zero em-dashes in added lines, `min-h-tap-min` on eleven interactive elements, the pill's `before:-inset-y-3` band intact on both surfaces.

**Critique: AI-slop verdict NOT SLOP.** Nielsen across the ten heuristics, scored as they apply to this change: 3, 4, 4, 3, 4, 2, 3, 4, 3, 2. The two 2s are recognition-over-recall and help, and both are the same finding as the deferred P1.

**Findings and dispositions. P0: none. P1: two, one fixed and one deferred. P2: two. P3: one.**

| # | Finding | Disposition |
| --- | --- | --- |
| P1 | The occlusion assertion filtered pill-band interceptions out as "pre-existing and not this arc's", so it would have stayed green while an invisible 12px `before:-inset-y-3` band ate taps on the publish control. | **FIXED in-arc.** The assertion now covers EVERY interceptor, not the panel's share: with the menu suppressed, nothing may intercept the toggle. Verified green, so the toggle takes all five of its own sample points. |
| P1 | The pill is under-built for the sole-affordance duty this change hands it: `text-xs` in a `max-sm:max-w-40` cluster (`components/admin/review/headerActionCap.ts:21`) shared with a 44px Close, leaving ~108px, so both segments wrap to two 12px lines. Measured live at 375x667: the pill renders 84.4px tall because it has wrapped. | **DEFERRED**, `ATTENTION-PILL-PHONE-LEGIBILITY-1` in `DEFERRED.md`. Class-sweep exception (a): demoting the monitoring segment to `sr-only` so the urgent count owns the width is a product decision about what Doug is told at a glance, and this arc is strictly subtractive on a surface it does not otherwise touch. |
| P2 | No once-ever hint that the pill discloses a list (heuristic 10 = 2). | Deferred with the row above; it is the same compensation question and splitting it would file two rows against one decision. |
| P2 | Phone and desktop now diverge with no cue to an operator who uses both. | Same row. |
| P3 | Cap placement differs between the two surfaces — on the button in the wizard (`components/admin/wizard/Step3ReviewModal.tsx:599`), on the wrapper in published (`components/admin/showpage/PublishedReviewModal.tsx:1096`). | Not filed. Pre-existing, cosmetic, invisible to users, and untouched by this diff. |

**Two findings the gate produced that are worth keeping in the record**, because both make the change look better founded than the abstract worry suggested:

- **Auto-open never moved focus and never announced.** The only `focus()` call in `components/admin/showpage/AttentionMenu.tsx` is at line 564, on Escape-close, returning focus to the pill. So for a screen-reader user the auto-opened panel was a purely visual event; suppressing it costs assistive tech nothing.
- **The menu is an INDEX over items that are already on the page.** The derived list is "the ONE source for the pill, menu, nav badges/dots, and inline banners" (`components/admin/showpage/PublishedReviewModal.tsx:127-129`), and every actionable item renders as an `AttentionBanner` in its own section (the `bannerFor` builder at line 865, wired as `renderCard` at line 896). Suppression removes a shortcut, not the content: the items remain reachable by inline banner, by nav badge, and by tapping the pill.

### 12.2 Deviation from invariants 1 and 6: task commits were split

**Recorded on bl-orch's ruling (2026-08-29), accepted rather than rewritten.** Whole-diff review round 2 was factually right: invariant 1 puts the whole red-then-green cycle inside one task and invariant 6 asks for one commit per task, and neither Task 2 nor Task 3 landed that way.

**Why it is not being repaired by a rewrite.** The cost of the violation is historical granularity. The cost of the rewrite is invalidating two rounds of reviewed lineage on a diff that would not change by one byte — review covers what merges, and what merges is the diff, not its commit boundaries.

**The cause, plainly.** Round 1 of plan review found three tasks that ENDED red, and the repair merged authoring into implementing. I applied that repair to the plan but implemented against the older shape, landing the jsdom vehicle with the production change and the browser vehicle after it. Then round 1 of DIFF review found four acceptance ids claimed with no test behind them, and those cases necessarily landed later still. Each commit was individually honest about its own red and green; the boundaries drifted.

**Invariant 6's purpose is traceability, so here is the tracing it lost.**

Round 4 of whole-diff review found this table's FIRST version incomplete — it listed two commits for Task 3 and omitted two more, which is the same defect one level up: a record of a split that is itself missing pieces of the split. Corrected below, and the correction is the point rather than an embarrassment: a commit that serves two tasks (`b3f32600a`) is exactly what a per-task boundary would have prevented and exactly what this table has to say out loud.

| Task | Commits | Where its red-then-green evidence lives |
| --- | --- | --- |
| Task 1 — the occlusion helper | `d92ac8afa` | That commit's own message: 5 cases failed against a stub returning an empty report, 5 passed after the real helper. Single commit, invariant satisfied. |
| Task 2 — the published predicate | `f9bf93fdc`, then `19716fcd9`, then `b3f32600a` | `f9bf93fdc` records the jsdom red/green (3 of 5 fail without the predicate, 5 pass with it) and the polarity measurement that rejected the shell's min-width query (23 assertions across two suites). `19716fcd9` records the browser red/green (5 of 7 fail with the predicate disabled) and the pre-fix interceptor identity, `attention-menu-row-alert:n1`, which is the arc's core evidence. `b3f32600a` records the four state-machine mutants, one failure each. |
| Task 3 — the wizard mirror | `7bc515e73`, then `b3f32600a`, `a871c4deb`, `e16b1383f`, `b3ac52e69` | `7bc515e73` records the mirror's red/green (4 cases fail against the unguarded effect) and the `(12a)` oracle proof: with `setMenuAutoOpened` dropped, `Step3ReviewModal.tsx:613` fails 1 of 202. `b3f32600a` adds the wizard's reveal-time and suppression-consumption cases and the shared rerender helper they need — **it is a Task 2 AND a Task 3 commit, which is the split this table exists to make legible.** `a871c4deb` adds the remaining state-machine cases, including the empty-arrival case that escaped its own mutant twice before reaching the guard it names. `e16b1383f` adds the three open-menu resize contracts with their 3-of-16 mutant evidence. `b3ac52e69` corrects two of those three: the auto-opened case was not auto-opened, and "either direction" tested one direction. |
| Task 4 — the invariant-8 gate | `e45724630` | §12.1 above, and that commit's message. Single commit. |
| Step 0.5 — the P-1 probe retirement | `685412abc` | That commit's message: the baseline gate proven exit 1 naming the probe, then exit 0. Single commit. |

**The fleet lesson bl-orch logged from this**, kept here because the next arc reading this plan is the audience: a mid-task commit split gets squashed BEFORE the first diff dispatch, or not at all. After that, the review lineage is worth more than the boundary.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

### Close-out step (NOT a numbered task, and outside the contract region) — graduation

**Round 5 was right that this could not be Task 5.** The pipeline runs whole-diff cross-model review AFTER the implementation tasks (`AGENTS.md`, the autonomous-ship section), and any finding there produces repair commits. A graduation numbered among the TDD tasks therefore has commits after it by construction, and the ledger claim would already be gone while work continued — which is the precise failure invariant 12 exists to prevent, arrived at from the opposite direction to the usual one.

So graduation is not a task. It is the close-out step that runs after review has CONVERGED and CI is green, and it is the last commit because nothing follows it. It sits outside the `red-contract` region for the same reason Task 0 and Step 0.5 do: its cycle is real but it is bookkeeping against a guard, not production code, and numbering it among the TDD tasks is what created the ordering claim it could not keep.

Round 1 was right that `_metaLedgerInProgress` accepts both the in-progress and the graduated state and so cannot carry this. `_metaDeferralLedgerGraduation` can: adding this row's id to `BACKLOG_GRADUATED` with its branch as provenance makes the guard FAIL until the row is actually archived with that provenance, and pass once it is.

**The obligation, stated here because it is no longer a §4 id:** the in-progress marker comes off and the row is archived with `fix/attention-autoopen-suppress-phone` as provenance, in the PR's LAST commit, and `_metaDeferralLedgerGraduation` passes on that commit. Probed in both directions — see §3.1, where the green leg reports 143 against a 142 baseline because the registry row adds its own case.

**This is the PR's last commit, and both halves of the cycle are inside it.** Round 3 was right that the earlier version said this while a further task followed it, which would have removed the ledger claim before the work was done and breached invariant 12. Graduation now sits at the end of the numbered order, where the claim it clears is actually finished. The earlier version created the red in this task's commit and cleared it in a later one, which is the same defect round 2 found in Tasks 1 and 2 — the round did not name this third instance; the sweep for the shape did. Invariant 12 requires the marker off and the row archived in the PR's LAST commit, so the resolution is not to move the green earlier but to make this task that commit:

1. Add the row's id to `BACKLOG_GRADUATED` with the branch as provenance. Run the guard, observe the RED.
2. Archive the row into `BACKLOG-archive.md` with that provenance and take the in-progress marker off `BACKLOG.md`. Run again, green.
3. Commit once. That commit is the PR's last, and the tree is green in it.

A committed red here would be worse than elsewhere: it is the commit CI judges before the merge.
