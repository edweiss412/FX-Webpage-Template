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
| `tests/e2e/published-review-modal.layout.spec.ts` | 375x812 | NONE, checked rather than assumed: its three pill references measure the pill's rect, hit band and text cap and never open or await the menu. **Task 3 still runs it**, because "a closed menu does not move the pill" is a layout claim and this repo settles those in a real engine. |
| Every jsdom suite that renders an auto-opened menu | n/a | NONE by construction: the global stub answers `matches: false`, so the suppression query reads false. This is why §2 of the spec spells the predicate as positive evidence. **Task 3 proves it**, with the six suites named and the command written out, rather than asserting it here. |

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
| Panel width/x clamped inside the clip | §8 | Unchanged, covered by `tests/e2e/popover-clip-fit.spec.ts`, which **Task 3 runs** rather than merely citing |
| The panel's VERTICAL anchor stays the pill's wrapper, never the pill | §8 | **P-2.8: with the menu opened by tap at 375, the panel's top edge sits below the WRAPPER's bottom edge, not the pill's.** Round 4's finding, and the most valuable one of the stage: §8 called this load-bearing and nothing asserted it, yet swapping `panel.offsetParent` for `pillRef.current` passes every suppression, tap, containment and desktop row here while moving the panel up onto the status strip. That is this arc's own defect reached by a different route, and the source already records the attempt and its measured result (`components/admin/showpage/AttentionMenu.tsx:378-382`). The two edges differ because the wrapper carries the title block, so the assertion discriminates. |
| Pill tap band ≥44px, and the band actually TAKES taps | §8 | P-2.3, hit-tested above and below centre rather than measured. A `pointer-events: none` pseudo-element keeps the computed band and loses the taps. |
| Menu rows ≥44px | §8 | Unchanged, `tests/e2e/popover-clip-fit.spec.ts`, run by Task 3 |
| Toggle receives its own pointer events | §8 | P-2.4 |
| Pill tap opens the menu at <`sm` | consequence bound | P-2.5 |
| The occlusion test discriminates, and is non-vacuous | spec §9.1 | AC-OCCLUSION-DISCRIMINATES, AC-OCCLUSION-PARTIAL, AC-OCCLUSION-NONVACUOUS. Added after plan review round 1: §9.1 is a spec claim and the table carried no row for it, so the helper both probes depend on was itself unobligated. |
| Wizard occlusion status | §5, §10 | Task 0, P-1 at three viewports |
| **If P-1 is positive:** the wizard gets the IDENTICAL predicate at the IDENTICAL position, so it inherits the IDENTICAL obligations | §5 | **The wizard mirrors EVERY row in this table that concerns the predicate, not a chosen three.** Round 4 was right that naming three (suppression, tap-to-open, desktop) discriminates none of the five ways the predicate can be built wrong, and the wizard effect exposes every one of those ordering points (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Since the claim is that the two effects are the same code in the same position, the honest obligation is the whole set rather than a subset of it: the boundary pair, the reveal-time read, the cancelled-frame non-consumption, the `n === 0` non-consumption, the consumed-on-suppression row, and the operator-opened resize, each mirrored against the wizard's own harness. Stating it as "the same set" rather than enumerating it twice is deliberate: a second enumeration is a second thing to drift. Round 3's finding: the positive branch changed the wizard's behavior and specified no oracle for the changed state. It also requires editing that file's `openModal` helper (`tests/e2e/wizard-attention-menu.spec.ts:136-150`), which today ASSERTS `aria-expanded="true"` on arrival before dismissing the panel, at 375x667, 375x844 and 390x560. Under suppression that assertion is false at exactly those three viewports, so the helper becomes width-aware: expect auto-open at ≥`sm`, and open by tapping the chip below it. This is the same tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses. |
| **If P-1 is negative:** the wizard is untouched | §5, §10 | No new assertion, by design. The existing wizard suite continues to pass unchanged, which is itself the evidence that nothing moved. |

The two published-surface probes are real-browser assertions. jsdom computes no layout, so `getBoundingClientRect` and `elementFromPoint` are meaningless there; the jsdom half of the test plan asserts only the predicate's effect on `menuOpen`, with `window.matchMedia` stubbed per file.

## 3. Tasks

Ordered so that every production change is preceded by a test that fails against the tree as it stands. Round 1 was right that the first draft did not do this: it changed production in Task 2 and authored the browser assertions in Task 3, where they arrive green.

**Two kinds of assertion, named apart, because conflating them is what produced that defect.** A RED-carrying assertion fails against current production and passes after the change. A REGRESSION assertion is green on arrival by construction and exists to fail if a LATER edit breaks it. AC-ANCHOR-WRAPPER and the pill hit-band are regression assertions and are marked as such; claiming a red for them would be a false claim.

### Task 0 — the wizard measurement (no RED, deliberately)

Outside the enrolled region below, because it changes no production code and therefore has no red. Round 1 was right that an enrolled marker here would be green on arrival and stay green under the negative disposition.

Run P-1 at 375x667, 375x844 and 390x560 against the existing wizard harness and record the full result in spec §10:

```
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts
```

Its output selects the branch Task 5 takes. It runs FIRST because that branch decides how much of the work exists.

<!-- tasks: depth=3 -->

### Task 1 — the shared occlusion helper

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/occlusion-probe.spec.ts` ac=AC-OCCLUSION-DISCRIMINATES,AC-OCCLUSION-NONVACUOUS,AC-OCCLUSION-PARTIAL -->

New files: tests/e2e/helpers/occlusionProbe.ts, tests/e2e/occlusion-probe.spec.ts, and its static fixture page. Registered in tests/e2e/standalone.config.ts testMatch in the same commit.

**A real browser, not vitest.** The helper's whole body is `getBoundingClientRect` and `document.elementFromPoint` inside `page.evaluate`. The suite defaults to the `node` environment and a file opts into jsdom with a `// @vitest-environment jsdom` pragma (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:1`). Neither runs this helper usefully: node has no DOM at all, and jsdom computes no layout, so every rect is zero, every control is dropped by the zero-area rule, and the helper throws "control set is empty" — a test asserting that throw passes while proving nothing about occlusion. That is this arc's own recurring class (LIM-NONDISCRIMINATING-FIXTURE), and it survived my first draft.

**The RED is behavioural, not a collection failure.** The commit lands the fixture, the spec, AND a stub `probeOcclusion` returning `{ controls: [], interceptions: [] }`. Imports resolve, the suite collects, and the assertions fail on their contents. An absent module would give an unresolved-import red, which `docs/agents/writing-plans.md` rejects, and "No tests found" is not an observed red.

Fixture stages four cases on one page, absolutely positioned so the geometry is exact: a control covered by a node INSIDE the panel (one interception, `insidePanel: true`); a control covered by an unrelated node (one interception, `insidePanel: false`); an uncovered control (none); and a control covered over its top-left quadrant ONLY (interception at `tl`, none at `centre`). The fourth is what makes the five sample points earn their place — with centre-only sampling it reports clean.

### Task 2 — author every failing assertion, change no production code

<!-- task: red=`node_modules/.bin/vitest run tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx` ac=AC-SUPPRESS-PHONE,AC-OPEN-DESKTOP,AC-REVEAL-TIME-READ,AC-CANCELLED-FRAME,AC-EMPTY-NO-CONSUME,AC-FOCUS-IDENTITY,AC-ARIA-EXPANDED -->

Two new suites, both RED against the tree as it stands: the jsdom cases, and the browser spec tests/e2e/attention-autoopen-suppress.spec.ts with its testMatch entry.

They fail for the right reason. The live callback sets the ref and opens with no width guard at all (`components/admin/showpage/PublishedReviewModal.tsx:780`), so every suppression case fails on behaviour rather than on collection.

The regression assertions in the browser spec (AC-ANCHOR-WRAPPER, the pill hit-band) are green on arrival, are labelled REGRESSION in the file, and are excluded from this task's red claim.

### Task 3 — implement the predicate

<!-- task: red=`node_modules/.bin/vitest run tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx` ac=AC-BOUNDARY-640,AC-TOGGLE-OPERABLE,AC-PILL-TAP,AC-PILL-COUNT,AC-ANCHOR-WRAPPER,AC-RESIZE-SHRINK-STAYS-OPEN,AC-RESIZE-WIDEN-STAYS-CLOSED,AC-OPERATOR-OPENED-SURVIVES -->

Spec §2 and §2.1 in `PublishedReviewModal.tsx`. Turns Task 2's two suites green.

Also runs, because §1.2 and §2 cite them as dispositive and round 1 was right that nothing invoked them:

```
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-autoopen-suppress.spec.ts tests/e2e/popover-clip-fit.spec.ts tests/e2e/published-review-modal.layout.spec.ts
node_modules/.bin/vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/showpage/pillFocusReconcile.test.tsx tests/components/admin/showpage/publishedEscapeClaim.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/dev/fullSplitCompositeRender.test.tsx
```

The second command is §1.2's "every jsdom suite passes unchanged" claim, enumerated rather than gestured at. The pre-fix RED of AC-TOGGLE-OPERABLE is captured before this task's implementation commit and its interceptor recorded in that commit's message.

### Task 4 — the wizard repair (Task 0 came back POSITIVE, so this runs)

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts` ac=AC-WIZARD-MIRROR -->

Task 0 measured POSITIVE at 375x667, 375x844 and 390x560 (spec §5.1), so this task runs. The wizard gets the identical predicate at the identical position and inherits the WHOLE obligation set, not a subset. `openModal` becomes width-aware, expecting auto-open at ≥`sm` and opening by tapping the chip below it, which is the tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses.

The red is real: the mirrored suppression cases are authored first and fail against the wizard's unguarded effect (`components/admin/wizard/Step3ReviewModal.tsx:364-383`).

### Task 5 — invariant 8, the UI gate

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-IMPECCABLE -->

The red is genuine and mechanical: this task's commit is the one that names both gate halves in §12, and naming them attaches the obligation, so the closeout guard fails until the marker line lands with real counts. It passes once the marker is written. That is exactly the red-then-green shape, using the repo's own guard rather than a lint that cannot see the gate.

### Task 6 — graduation

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` ac=AC-GRADUATION -->

Round 1 was right that `_metaLedgerInProgress` accepts both the in-progress and the graduated state and so cannot carry this. `_metaDeferralLedgerGraduation` can: adding this row's id to `BACKLOG_GRADUATED` with its branch as provenance makes the guard FAIL until the row is actually archived with that provenance, and pass once it is. The marker comes off and the row is archived in the PR's LAST commit, per invariant 12.

<!-- tasks: end -->

### 3.1 Both new reds are probed, not asserted

Round 1's repair replaced two markers that could not fail with two that use the repo's own meta-guards. That repair is only as good as the claim that those guards actually move, so both were run in both directions on 2026-08-29 and reverted. This is the evidence the round-2 brief asks for, supplied rather than promised.

| probe | setup | result |
| --- | --- | --- |
| Task 5 RED | name both gate halves verbatim in Task 5, no marker line | `_metaInvariant8Closeout` FAILS: "declares the invariant-8 dual gate but carries no valid impeccable-gate marker line" |
| Task 5 GREEN | same, plus `impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none` | 14 passed |
| Task 6 RED | add this row's id to `BACKLOG_GRADUATED` with the branch as provenance, leave the row unarchived | `_metaDeferralLedgerGraduation` FAILS on three assertions, including "missing from BACKLOG-archive.md" and "has no heading in the archive" |
| Task 6 GREEN | registry row reverted, baseline | 142 passed |

**One methodological note, because it nearly produced a false result.** The first run of the Task 5 probe reported GREEN, which would have read as "the red does not fire" and condemned the repair. The edit had silently not applied: it targeted wording that the §3 rewrite had already replaced, so the guard was never given a plan naming both halves. A probe that did not apply is not evidence of anything, and the only reason it was caught is that the next step checked the literal strings were present before trusting the run. Same shape as Task 0's harness fault, where a static page served in place of the live one failed an arrival assertion in a way indistinguishable from a product finding.

## 4. Acceptance criteria

Every row of §2 that names an implementable assertion has an id here, and every id maps to a §2 row. The three §2 rows with no id say why in the table itself: the hydration property is NOT ASSERTED and holds by construction, the negative wizard branch asserts nothing by design, and the panel-clamp and menu-row-floor rows are covered by suites this arc does not modify.

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
- **AC-WIZARD-MIRROR** — on a positive Task 0 only: the wizard satisfies the same predicate obligations as the published surface, not a chosen subset.
- **AC-IMPECCABLE** — both gate halves run on the diff, every P0 and P1 fixed or carrying a `DEFERRED.md` entry, and the marker line written with real counts.
- **AC-GRADUATION** — the in-progress marker is off and the row archived with its branch as provenance, in the PR's last commit.

## 12. Close-out

UI surface: `components/admin/showpage/PublishedReviewModal.tsx`, and `components/admin/wizard/Step3ReviewModal.tsx` if Task 4's probe comes back positive. The dual gate is owed before READY.

The machine-checkable `impeccable-gate:` marker line is written HERE at close-out, with the real counts, per the grammar in `tests/docs/_invariant8Closeout.ts`. It is deliberately absent until then, and this plan deliberately does not spell both gate-half names verbatim before that point: the marker's grammar admits `RAN` and `RAN-DEGRADED` and no placeholder, so writing one now would either be a false claim that the gate ran or a malformed line the guard rejects. Naming both halves is what attaches the obligation, so the obligation attaches in the same edit that discharges it. Task 5 owns both.
