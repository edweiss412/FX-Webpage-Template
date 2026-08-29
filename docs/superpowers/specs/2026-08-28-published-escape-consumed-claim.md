# Escape on the published review modal: a claim that outlives the panel

**Row:** `BL-PUBLISHED-ATTENTION-ESCAPE-CLOSES-MODAL-RACE` (BACKLOG.md). **Branch:** `fix/published-attention-escape-race`. **Filed:** 2026-08-28.

## 1. What is wrong

The attention menu auto-opens when the published review modal arrives. Pressing Escape should dismiss the menu and leave the modal open. Occasionally it closes the whole modal, and the operator loses the scroll position and the section they had reached.

Two listeners decide the key. While the menu is open, `AttentionMenuFrame` claims Escape from a document CAPTURE listener and calls `stopPropagation` (`components/admin/showpage/AttentionMenu.tsx`, the `onKeyDown` inside the listener effect). `ReviewModalShell` closes the dialog from a document BUBBLE listener that fires on any Escape (`components/admin/review/ReviewModalShell.tsx:245-250`):

```ts
function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    requestClose();
  }
}
```

There is no test of `event.defaultPrevented` and no test of whether anything else handled the key. The shell closes because an Escape happened, not because the Escape was unclaimed. `ShareHub` already records this in its own safety-net comment: the shell "closes the ENTIRE review modal on any Escape without checking defaultPrevented" (`components/admin/showpage/ShareHub.tsx`, the Escape safety net effect).

So whenever the menu is down for even one frame while the modal is up, the operator's Escape lands on the modal.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Candidate 1, "the capture listener outliving its element", is RETIRED. | Four jsdom methods and 19 live arrivals; `frame:onKeyDown` reports `panelInDoc: true` in 19 of 19. BACKLOG.md, the row's live-trace section. |
| The row's 8-run `captureSawMenu: false` reading is INSTRUMENT ERROR, not a phenomenon. | The spec file's `MENU` constant is compound and requires the modal's title, so a title-less frame reads as menu-absent (`tests/e2e/published-show-attention.spec.ts:28-31`). BACKLOG.md, the corrections section. |
| Candidate 2 as the row writes it, an actionable-count blip, is RETIRED for this fixture. | `interactive` is `needsYou.length > 0 \|\| k > 0 \|\| selfHeal.length > 0` (`components/admin/showpage/PublishedReviewModal.tsx`, the `interactive` derivation), and the e2e fixture seeds one parse warning, so `k` stays 1. Arm D. |
| `escTransparentUntilEngaged` is NOT involved on this surface. Its only opt-in is the wizard menu (`components/admin/wizard/WizardAttentionMenu.tsx:102`); the published `AttentionMenu` never passes it, so it defaults false and `engagedRef` starts true. | Verified repo-wide with no exclusions, 2026-08-28. |
| The defect was NOT reproduced in 19 instrumented arrivals. The repair proceeds anyway, because the mechanism is proven independently of its trigger rate. | §2.3. |
| The StrictMode `modal:unmount` seen in every live trace is dev-only and is NOT part of any conclusion. CI builds for production. | §2.2. |
| The claim is held by the MODAL, not by the menu frame, and not by the event object alone. | §3.2. This is the one place this spec extends the ruled shape rather than restating it; the reasoning is given there so it can be overridden rather than re-derived. |

## 2. Evidence

Every claim below was measured before drafting, per the empirical-spike rule for lifecycle and race surfaces.

### 2.1 What the DB-free arms established

Six arms rendered the real `PublishedReviewModal` through the committed jsdom harness (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx`) and dispatched Escape:

| arm | setup | frame claimed | shell ran |
| --- | --- | --- | --- |
| A | baseline, menu up | yes | no |
| C | no attention items at all | n/a | yes |
| D | actionable 1-0-1 with a sheet warning present | yes | no |
| E | items AND warnings blip to zero, then back | no | yes |
| F | loaded modal swapped for `ShowReviewModalSkeleton` | no | yes |
| G | modal remounted, Escape before the auto-open frame | no | yes |

Arm C is the positive control and arm A the no-defect baseline, so the "shell ran" column is a measurement rather than a dead probe. Arms E, F and G are each sufficient to produce the reported failure.

### 2.2 What the live trace established

19 instrumented arrivals, each a fresh navigation plus auto-open plus one Escape, produced ONE event sequence, identical in every iteration, and zero losses. `frame:onKeyDown` reported `panelInDoc: true` in 19 of 19 and the shell's handler ran in 0 of 19. None of E, F or G occurred.

The sequence contains a `modal:unmount` between two `modal:mount` records. That is React's StrictMode double-invoke, which runs in development only; CI builds for production (`playwright.config.ts`, the CI branch of the baseline `webServer` command). Nothing about it belongs in a conclusion.

### 2.3 What the non-reproduction does and does not license

P(0 losses in 19 | p = 1/7) = 0.054. The row's own baseline is ONE observation in seven runs, whose 95% interval runs from roughly 0.4% to 58%, so the rate was never well determined in either direction. This run establishes that the passing path is deterministic and that the losing path is rarer than a 20-sample probe reaches. It does not confirm or refute any candidate.

Two deviations from the row's original conditions are recorded rather than argued: the trace ran under `BASELINE_SERVER_ONLY`, which skips the dev-gate servers on ports 3001, 3002 and 3003 that the row's runs booted, and the machine was under heavy concurrent load, with `/admin` reaching 75s on the final iteration.

**Consequence for the repair.** The repair is justified by the mechanism, which is proven, and not by the rate, which is not measured. A reviewer who wants the rate measured is asking for a different and much longer experiment than this arc ran, and §8 records that as a documented limit rather than a gap.

## 3. The repair

### 3.1 The contract

An Escape that dismisses an overlay inside the modal is CONSUMED. The shell closes the dialog only on an Escape that no overlay consumed.

### 3.2 The central invariant: the mark is a classifier

The literal reading of "the overlay marks the event and the shell honors the mark" does not close the windows this row is about. In arms E, F and G the panel is already gone when the key arrives, so there is no handler to mark anything and the shell closes correctly by its own lights. A `defaultPrevented` test would change nothing in any of the three.

So the claim has to outlive the panel, and the moment it does, it has a job it did not have before. It must distinguish two ways the panel can be down:

- **Transient unmount.** The panel went away without the operator asking. Their next Escape was aimed at the panel, so the shell DEFERS and the claim is consumed.
- **Intentional dismissal.** The operator dismissed the panel. Their next Escape is aimed at the modal, so the claim is CLEARED and the shell closes.

Get this wrong in the permissive direction and Escape stops closing the modal after an ordinary dismissal, which is a worse defect than the one being fixed and is on a path every operator takes. That is the invariant a reviewer should attack, and §3.3 states it from the state writes rather than from the handlers, because the handlers are where the two columns look alike.

### 3.3 Every write that takes the panel down, classified

`menuEffectivelyOpen` is `menuOpen && interactive` (`components/admin/showpage/PublishedReviewModal.tsx`, the derivation above the reconciliation branch), so the panel goes down either by a write to `menuOpen` or by `interactive` going false. Enumerated from the writes, not from the events that trigger them:

| # | write | classification | claim |
| --- | --- | --- | --- |
| W1 | render-phase `setMenuOpen(false)` under `menuOpen && !interactive` | transient | SURVIVES |
| W2 | `onResolved`, last actionable item cleared | intentional | cleared |
| W3 | pill `onClick` toggle | intentional | cleared |
| W4 | the `onClose` prop passed to `AttentionMenu` (`components/admin/showpage/PublishedReviewModal.tsx:1173`) | intentional, all five sources | cleared |
| W5 | `interactive` falsifies while `menuOpen` stays true | transient | SURVIVES (this is W1's trigger; listed separately because the panel is gone in the same render, before the write commits) |

W4 is ONE write with FIVE event sources, and the distinction matters because an enumeration by handler misses two of them. Adversarial review round 1 caught exactly that: the first draft listed the three sources inside `AttentionMenuFrame` and missed the two inside `AttentionMenu` itself.

| source | site |
| --- | --- |
| the frame's own Escape handler | `components/admin/showpage/AttentionMenu.tsx:354-363` |
| pointerdown outside the panel | `components/admin/showpage/AttentionMenu.tsx`, `onPointerDown` in the listener effect |
| focus moving outside the panel | `components/admin/showpage/AttentionMenu.tsx`, `onFocusIn` in the listener effect |
| selecting an ALERT row | `components/admin/showpage/AttentionMenu.tsx:182-185` |
| selecting a SHEET WARNING row | `components/admin/showpage/AttentionMenu.tsx:221-224` |

All five are the operator dismissing the panel on purpose, so all five clear the claim and W4 needs no per-source split. The two row sources are exercised by the live e2e fixture, which is why their omission would have shipped an unpinned path rather than a theoretical one.

The frame's own Escape source cannot reach the shell at all: the frame calls `stopPropagation` on that key. It clears the claim anyway, because a second Escape must close the modal.

**The enumeration produces a result that changes the repair's reach.** Every row above is a WRITE inside `PublishedReviewModal`. Candidates F and G are not writes at all: in F the component is replaced by `ShowReviewModalSkeleton`, and in G it remounts. Nothing in the table fires, and a claim held in a ref inside that component dies with it. So:

- A modal-held claim closes **E** (W1 and W5), the only candidate that is a state write.
- Closing **F** and **G** needs a holder ABOVE the Suspense boundary, since both destroy the component that would hold it.

This spec ships the modal-held claim and records F and G as documented limits with the exact trace signature that re-files them (§8). The alternative, a module-scoped claim that survives any unmount, closes all three and is a larger change: it needs an explicit clear on modal close and on navigation, or a stale claim leaks into the next modal and swallows that operator's first Escape. Trading a rare, unobserved failure for a claim that can leak across modals is the wrong direction while F and G remain unobserved in 19 live arrivals.

### 3.4 Shape

`PublishedReviewModal` holds the claim in a ref, set when the panel opens and written per the table above. `ReviewModalShell` gains an optional predicate prop and closes only when it returns false. Absent the prop the shell behaves exactly as today, so the wizard modal and the skeleton are unaffected.

The claim is a ref, not state: it is read at event time and must not re-render the panel.

## 4. Guard conditions

| Input | Behavior |
| --- | --- |
| predicate prop absent or undefined | shell closes on Escape, unchanged from today |
| predicate present, returns false | shell closes |
| predicate present, returns true | shell does not close, and consumes the claim |
| panel never opened this mount | claim never set, so the first Escape closes the modal |
| panel dismissed by click-outside, focus-out, or the pill (W3, W4) | claim cleared, so the next Escape closes the modal |
| panel dismissed by SELECTING a row, alert or sheet warning (W4) | claim cleared, so the next Escape closes the modal |
| panel dismissed by its own Escape (W4) | shell never sees that key; claim cleared, so the NEXT Escape closes the modal |
| panel taken down by a data blip (W1, W5) | claim survives; the next Escape is consumed and the modal stays |
| a second Escape after a deferred one | the first Escape from state N consumed the claim, so this one closes the modal. Stated N-relative to match §5 and §6.2; an earlier draft counted from state M and said "the third", which contradicted both. |
| two Escapes in rapid succession | the first is consumed if a claim is pending, the second closes the modal |

Every INTENTIONAL row can regress shipped behavior if its clear is missed, so each of W2, W3 and all five sources of W4 gets its own red in §6.2. An earlier draft asserted that coverage while §6.2 listed only the W4 sources, leaving W2 and W3 promised and unproven; round 2 caught the gap. The deferred-then-close row carries the exact-once guarantee and gets its own red too.

## 5. Transition inventory

States: **M** panel up, **N** panel down with a claim pending, **O** panel down with no claim.

| pair | on Escape |
| --- | --- |
| M -> N | transient unmount (W1, W5). No key involved in the transition itself. |
| M -> O | intentional dismissal (W2, W3, and all five sources of W4). No key involved except the frame's own Escape source, which the frame consumes. |
| N -> O | shell sees the key, predicate returns true, claim consumed, modal STAYS. Instant, no animation. |
| O -> closed | shell sees the key, predicate returns false, modal closes. Existing exit animation, unchanged. |
| N -> closed | cannot occur in one key. N always consumes its Escape into O first, which is the whole point. |

Compound: a panel torn down WHILE its exit animation runs is still classified by which write took it down, because the claim is written at the write and not at animation end.

## 6. Test plan

### 6.1 The six arms become a permanent contract suite

Arms A, C, D, E, F and G move from the deleted probe into a committed suite beside the existing frame tests; the plan names its path. They run against the real component through the existing harness and need no instrumentation. Each asserts the outcome the repair actually produces, which is NOT the same for every arm:

| arm | post-repair outcome asserted | role |
| --- | --- | --- |
| A | modal survives | pins the shipped contract |
| C | modal CLOSES | positive control; nothing claimed the key |
| D | modal survives | pins that an actionable-only blip does not take the panel down |
| E | modal survives | the repair's own red, and the window it closes |
| F | modal CLOSES | executable record of a documented limit (§8) |
| G | modal CLOSES | executable record of a documented limit (§8) |

**F and G assert a CLOSE, and saying otherwise was a defect in the first draft.** §3.3 establishes that a modal-held claim cannot survive either window, so a suite demanding the modal stay open in F or G would be red forever against the repair this spec defines. Adversarial review round 1 caught the contradiction. What F and G are worth keeping for is different and narrower: they are change detectors over a documented limit. If someone later closes either window, its arm fails and has to be updated deliberately, which is how the limit stops being silent. That is a weaker claim than "the suite reds the moment a window becomes reachable", and the weaker claim is the true one.

### 6.2 New reds

1. Panel up, Escape, modal stays and menu closes. Fails today only if the frame regresses; it pins the existing contract.
2. Panel torn down by a whole-data blip, then Escape, modal stays. **Red before the repair** (arm E measures the shell running today).
3. Panel replaced by the skeleton, then Escape, modal CLOSES. Not a red: this is arm F recording the §8 limit executably, and demanding a survival here is the contradiction rounds 1 and 2 both caught. Round 1 fixed §6.1's table and left this line, which is why the round-2 sweep is derived from a grep over every F and G outcome claim rather than from the words the previous repair touched.
4. Panel dismissed by click-outside, then Escape, modal CLOSES. Guards the §4 regression.
5. Panel dismissed by SELECTING a row, alert and sheet warning separately, then Escape, modal CLOSES. Same guard for the two sources §3.3's first draft missed.
6. Panel dismissed by RESOLVING the last actionable item (W2), then Escape, modal CLOSES. Without it an implementation can leave the claim pending on that dismissal, pass every other red, and swallow the operator's next Escape.
7. Panel dismissed by the PILL toggle (W3), then Escape, modal CLOSES. Same reasoning as red 6; these two are the intentional writes that do not pass through `onClose` at all, so no W4 red covers them.
8. **Claim acquisition through the pill.** Open the panel with the PILL rather than the auto-open, take it down transiently (W1), then Escape: the modal STAYS. Arms A, D and E all auto-open, so an implementation that sets the claim only on the auto-open path passes all of them and then fails the first operator who opens the panel by hand. Round 2 found this; it is an acquisition gap, not a clearing gap, and no other red reaches it.
9. No panel at any point, Escape, modal closes. Guards against a claim that is never cleared.
10. **The claim is consumed exactly once.** From N, the first Escape leaves the modal open and the SECOND closes it. This is the only assertion standing between the repair and a predicate that returns true forever: an implementation that sets the claim in E and never clears it satisfies reds 1 through 9 while silently swallowing every later Escape, which is precisely the consequence bound this spec is written against. Round 1 found the gap; the existing two-Escape e2e case cannot cover it, because that case starts in M, where the frame handles and clears the first key, so it never observes state N at all.

### 6.3 Anti-tautology

Each assertion reads the shell's own outcome, not a container that renders both. The fixtures derive their attention items and warnings from the harness builders rather than hardcoding, so a fixture that cannot express the difference cannot pass by accident. Arm C is retained precisely as the case that must still close.

## 6.4 Dimensional invariants

None. This spec changes key handling and adds no rendered element, no layout, and no parent-to-child dimension relationship. `AttentionMenuFrame`'s existing height cap through `useFitWithinClip` is untouched, and the panel's own width and clipping are the subject of a different row (`BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW`) and a concurrent arc. The section is present and states this rather than being waived, so a reviewer can check the claim instead of the waiver.

## 7. Out of scope

- The wizard attention menu. It opts into `escTransparentUntilEngaged` and has its own dismissal contract.
- Measuring the failure rate. See §2.3 and §8.
- The cold-build cost of the dev-gate servers on ports 3001, 3002 and 3003, which this arc measured only incidentally.

## 8. Documented limits

- **The rate is unmeasured.** The repair is justified by a proven mechanism, not by a measured frequency. Re-file trigger: the row's own expansion trigger, an Esc-contract case that flakes, is unchanged and still applies.
- **Candidates F and G are NOT closed by this repair, and both are recorded here rather than only one.** A ref held inside `PublishedReviewModal` dies when that component is replaced by the Suspense fallback (F) or remounted (G), so neither window is closed and each keeps its arm as an executable record (§6.1). The first draft named only G, which round 1 caught. Closing either fully means holding the claim above the Suspense boundary, which is the module-scoped alternative §3.3 rejects on the stale-claim trade.
  - Re-file trigger for F: a losing trace carrying `modal:unmount` paired with `skeleton:mount`, and a `doc:capture` record with `modalInDom: true` and `titleInDom: false`.
  - Re-file trigger for G: a losing trace carrying `modal:unmount` followed by a second `modal:mount` with no `skeleton:mount`.
- **The instrument had a gap.** The repeat probe registered its `addInitScript` in a different test, so its iterations carry no `doc:capture` record. Component emits still separated E, F and G, so no conclusion rests on the missing records.
