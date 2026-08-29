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
| `tests/e2e/published-review-modal.layout.spec.ts` | 375x812 | NONE, checked rather than assumed: its three pill references measure the pill's rect, hit band and text cap and never open or await the menu. Task 2 still runs it, because "a closed menu does not move the pill" is a layout claim and this repo settles those in a real engine. |
| Every jsdom suite that renders an auto-opened menu | n/a | NONE by construction: the global stub answers `matches: false`, so the suppression query reads false. This is why §2 of the spec spells the predicate as positive evidence, and Task 1 proves it by running those suites unchanged. |

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
| Panel width/x clamped inside the clip | §8 | Unchanged and already covered by `popover-clip-fit.spec.ts` |
| The panel's VERTICAL anchor stays the pill's wrapper, never the pill | §8 | **P-2.8: with the menu opened by tap at 375, the panel's top edge sits below the WRAPPER's bottom edge, not the pill's.** Round 4's finding, and the most valuable one of the stage: §8 called this load-bearing and nothing asserted it, yet swapping `panel.offsetParent` for `pillRef.current` passes every suppression, tap, containment and desktop row here while moving the panel up onto the status strip. That is this arc's own defect reached by a different route, and the source already records the attempt and its measured result (`components/admin/showpage/AttentionMenu.tsx:378-382`). The two edges differ because the wrapper carries the title block, so the assertion discriminates. |
| Pill tap band ≥44px, and the band actually TAKES taps | §8 | P-2.3, hit-tested above and below centre rather than measured. A `pointer-events: none` pseudo-element keeps the computed band and loses the taps. |
| Menu rows ≥44px | §8 | Unchanged, `popover-clip-fit.spec.ts` |
| Toggle receives its own pointer events | §8 | P-2.4 |
| Pill tap opens the menu at <`sm` | consequence bound | P-2.5 |
| Wizard occlusion status | §5, §10 | P-1, three viewports |
| **If P-1 is positive:** the wizard gets the IDENTICAL predicate at the IDENTICAL position, so it inherits the IDENTICAL obligations | §5 | **The wizard mirrors EVERY row in this table that concerns the predicate, not a chosen three.** Round 4 was right that naming three (suppression, tap-to-open, desktop) discriminates none of the five ways the predicate can be built wrong, and the wizard effect exposes every one of those ordering points (`components/admin/wizard/Step3ReviewModal.tsx:364-383`). Since the claim is that the two effects are the same code in the same position, the honest obligation is the whole set rather than a subset of it: the boundary pair, the reveal-time read, the cancelled-frame non-consumption, the `n === 0` non-consumption, the consumed-on-suppression row, and the operator-opened resize, each mirrored against the wizard's own harness. Stating it as "the same set" rather than enumerating it twice is deliberate: a second enumeration is a second thing to drift. Round 3's finding: the positive branch changed the wizard's behavior and specified no oracle for the changed state. It also requires editing that file's `openModal` helper (`tests/e2e/wizard-attention-menu.spec.ts:136-150`), which today ASSERTS `aria-expanded="true"` on arrival before dismissing the panel, at 375x667, 375x844 and 390x560. Under suppression that assertion is false at exactly those three viewports, so the helper becomes width-aware: expect auto-open at ≥`sm`, and open by tapping the chip below it. This is the same tolerant shape `popover-clip-fit.spec.ts`'s `openMenu` already uses. |
| **If P-1 is negative:** the wizard is untouched | §5, §10 | No new assertion, by design. The existing wizard suite continues to pass unchanged, which is itself the evidence that nothing moved. |

The two published-surface probes are real-browser assertions. jsdom computes no layout, so `getBoundingClientRect` and `elementFromPoint` are meaningless there; the jsdom half of the test plan asserts only the predicate's effect on `menuOpen`, with `window.matchMedia` stubbed per file.

## 3. Tasks

<!-- tasks: depth=3 -->

### Task 1 — the shared occlusion helper

<!-- task: red=`node_modules/.bin/vitest run tests/e2e/helpers/__tests__/occlusionProbe.test.ts` ac=AC-OCCLUSION-DISCRIMINATES,AC-OCCLUSION-NONVACUOUS -->

New helper tests/e2e/helpers/occlusionProbe.ts (planned), implementing spec §9.1. Two probes consume it, so it is built and proved first.

RED: a fixture where a known overlay covers a known button reports that overlay as interceptor, AND the same fixture without the overlay reports none. **The failure this catches** is the one that cost two review rounds: an oracle positive by construction (counting the panel's own rows, which are `<button>`s) or negative by construction (demanding `elementFromPoint` return the panel element when what intercepts is a row).

Non-vacuity is per-probe, not inside the helper, because the helper is shared by a probe that needs the panel OPEN and one that needs it ABSENT. The helper guards only the universal: a non-empty control set, and the presence of every control the caller names.

### Task 2 — published suppression, jsdom

<!-- task: red=`node_modules/.bin/vitest run tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx` ac=AC-SUPPRESS-PHONE,AC-OPEN-DESKTOP,AC-REVEAL-TIME-READ,AC-CANCELLED-FRAME,AC-FOCUS-IDENTITY -->

Implements spec §2 and §2.1 in `PublishedReviewModal.tsx`: `suppressedByWidth` is a FUNCTION called inside the reveal's `requestAnimationFrame`, never a value sampled before scheduling.

Six cases, each named with the failure it catches, and two of them exist purely as anti-vacuity partners: the desktop control stops the phone case passing on a component that stopped auto-opening at all, and the suppressed-then-widened case stops it passing while the menu silently reopens on the next data change. The reveal-time case lives in jsdom rather than the browser because `page.setViewportSize` crosses CDP asynchronously and would race the very frame it must land inside.

GREEN also requires every jsdom suite in §1.2 to pass UNCHANGED. That is the anti-regression half and it is not optional.

### Task 3 — the browser proof

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-autoopen-suppress.spec.ts` ac=AC-TOGGLE-OPERABLE,AC-BOUNDARY-640,AC-PILL-TAP,AC-ANCHOR-WRAPPER -->

New spec file tests/e2e/attention-autoopen-suppress.spec.ts (planned), registered in `tests/e2e/standalone.config.ts` testMatch in the same commit. Without the registration it proves nothing, by that file's own contract.

Ten cases: suppression at 375, the desktop control, the boundary pair at 639 and 640, the pill's hit-tested band, zero interceptions on the toggle, tap-to-open, the resize pair in both directions, and P-2.8's anchor assertion.

The RED for the toggle case is run against the PRE-FIX build and its interceptor recorded in the commit message. Without that record the case proves the toggle is clear and NOT that it was ever blocked.

### Task 4 — the wizard probe, and exactly one disposition

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts` ac=AC-WIZARD-DISPOSITION -->

Run P-1 at all three phone viewports and record the full result in spec §10. Then take one branch, both of which are already fixed in writing so neither is decided under review pressure:

- **Positive at any viewport:** the wizard gets the identical predicate at the identical position, inherits the WHOLE obligation set from §2 rather than a subset, and `openModal` becomes width-aware.
- **Negative at all three:** nothing is filed. The wizard shares the code shape, not the bug shape, and class-sweep governs the bug shape. The measurement lands in spec §10.

### Task 5 — invariant 8, the UI gate

<!-- task: red=`pnpm exec eslint . && pnpm typecheck` ac=AC-IMPECCABLE -->

The invariant-8 dual gate on the diff, both halves, run with the canonical v3 setup (context load of PRODUCT.md and DESIGN.md, then the register reference read). P0 and P1 findings fixed or deferred with a `DEFERRED.md` entry; findings and dispositions into §12.

### Task 6 — graduation

<!-- task: red=`node_modules/.bin/vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-GRADUATION -->

Marker off and the row archived in the PR's LAST commit, per invariant 12, so it never reaches main.

<!-- tasks: end -->

## 4. Acceptance criteria

Each id is referenced by the task marker that owns it.

- **AC-OCCLUSION-DISCRIMINATES** — the shared helper reports a known covering overlay as the interceptor of a known control, and reports none for the same control when the overlay is absent. Fails against an oracle that is positive by construction (the panel's own rows) or negative by construction (demanding the panel element itself).
- **AC-OCCLUSION-NONVACUOUS** — the helper throws when the control set is empty, and when a caller names a control that is not in the set. A result can never be produced by a harness that rendered nothing, or by a probe that lost the control it is about.
- **AC-SUPPRESS-PHONE** — with `matchMedia` answering phone, actionable items present, and frames flushed, the menu never mounts.
- **AC-OPEN-DESKTOP** — with `matchMedia` answering desktop, the same fixture DOES mount the menu. The anti-vacuity partner of AC-SUPPRESS-PHONE.
- **AC-REVEAL-TIME-READ** — answering desktop while the effect runs and phone inside the frame leaves the menu closed. Fails against a predicate sampled before `requestAnimationFrame`.
- **AC-CANCELLED-FRAME** — a dependency change that cancels a pending frame leaves the one-shot unconsumed, and the reveal still happens on the next frame. Fails against an implementation that consumes the ref before scheduling.
- **AC-FOCUS-IDENTITY** — `document.activeElement` after arrival is the close button, identically with and without suppression.
- **AC-TOGGLE-OPERABLE** — at 375, the published toggle has zero interceptions at all five sample points, and the pre-fix run of the same assertion reports an interceptor by name.
- **AC-BOUNDARY-640** — 639x667 suppresses and 640x667 auto-opens. Fails against any cutoff between 400 and 640, which the 375-plus-desktop pair alone does not.
- **AC-PILL-TAP** — at 375 the pill's band is hit-tested 21px above and below centre and returns the pill both times, and tapping it opens the menu. Fails against a `pointer-events: none` pseudo-element that keeps the geometry and takes no taps.
- **AC-ANCHOR-WRAPPER** — the panel's top edge sits below the pill WRAPPER's bottom edge, which differs from the pill's own because the wrapper carries the title block. Fails against re-anchoring to `pillRef`, which this arc's spec §8 forbids and which reintroduces the defect by another route.
- **AC-WIZARD-DISPOSITION** — P-1 has run at all three phone viewports, its full result is recorded in spec §10, and exactly one of the two pre-committed branches has been taken.
- **AC-IMPECCABLE** — critique and audit both run on the diff, with every P0 and P1 fixed or carrying a `DEFERRED.md` entry.
- **AC-GRADUATION** — the in-progress marker is off and the row archived, in the PR's last commit.

## 12. Close-out

UI surface: `components/admin/showpage/PublishedReviewModal.tsx`, and `components/admin/wizard/Step3ReviewModal.tsx` if Task 4's probe comes back positive. The dual gate is owed before READY.

The machine-checkable `impeccable-gate:` marker line is written HERE at close-out, with the real counts, per the grammar in `tests/docs/_invariant8Closeout.ts`. It is deliberately absent until then, and this plan deliberately does not spell both gate-half names verbatim before that point: the marker's grammar admits `RAN` and `RAN-DEGRADED` and no placeholder, so writing one now would either be a false claim that the gate ran or a malformed line the guard rejects. Naming both halves is what attaches the obligation, so the obligation attaches in the same edit that discharges it. Task 5 owns both.
