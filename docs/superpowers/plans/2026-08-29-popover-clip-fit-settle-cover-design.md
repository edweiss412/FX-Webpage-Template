# The settle-cover design, recovered — popover-clip-fit

**Status: NOT IMPLEMENTED, and deliberately so.** This is the design the parked `fix/popover-clip-fit-stale-viewport` arc would have built. Its premise was refuted on measurement 2026-08-30 and the arc closed as subsumed; the subsumption record, with the numbers, is `docs/superpowers/plans/2026-08-29-popover-clip-fit-stale-viewport-PARKED.md`. The design is preserved here so that if the defect ever reproduces, the repair does not have to be re-derived.

**Why this file exists at all.** The original lived inside `docs/superpowers/plans/2026-08-29-attention-auto-open-phone-suppression.md`, and the parked note named that section as its only home. When this branch merged `origin/main`, the merge took main's deletion of that section: the product branch had removed it, this branch had never touched the file, so there was no conflict and the loss was silent. A referenced document quietly disappearing under a clean merge is worth repairing on its own, which is why the recovery is a file rather than a footnote.

**Re-file trigger.** See the subsumption record's trigger section, and `LIM-E2E-1280-CONTAINMENT-FLAKE` in `docs/review-rounds/LIMITS.md`. This design un-parks if the flake recurs after `#954`, or if a placement read in `tests/e2e/popover-clip-fit.spec.ts` outside the settle poll is shown to produce a value its oracle rejects.

**The second arm is deliberately narrower than the trigger `LIM-E2E-1280-CONTAINMENT-FLAKE` states**, and the reason matters: one such read is already known. The anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:1472`) is unrouted and in-class, so the LIMITS entry's trigger as literally worded is ALREADY satisfied, while this design stays parked. That is not an oversight in either document. An unrouted read only justifies building the cover if it can actually fail, and the census has never been observed to, with a wide gap to its bound — a margin rather than a proof, resting on a premise the record marks untested. So the known site is named instead of triggering, and a NEW unrouted read, or evidence that the census can cross its bound, is what moves this.

## Provenance

Restored from `ee9f1fdb4`. The Task 5 prose and the three acceptance-criteria bullets match that source exactly. Three things are added here and are NOT in it: the two fence delimiters wrapping the task marker, so specLint treats it as inert (`lib/specLint/taskContract.ts:466`); a blank line where the two extracts were joined; and the acceptance-criteria heading below, which is this document's own, since those bullets sat under a different section in the original.

**Line numbers inside the recovered text are as of 2026-08-29** and several have since moved. The subsumption record carries the corrected ones.

## The design, as written on 2026-08-29

### Task 5 — the stale fitted cap that flaps popover-clip-fit on CI

```
<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` red-state=authored red-target=`tests/e2e/popover-clip-fit.spec.ts:172` why=`the structural cover fails against the tree as it stands because all five page.goto sites and all 33 setViewportSize sites are unrouted; it is a text scan over this file, so it cannot pass on a lucky schedule` ac=AC-REFIT-COVER,AC-REFIT-AWAIT,AC-REFIT-CONTRACT -->
```

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


### The acceptance criteria, as declared in that plan

- **AC-REFIT-CONTRACT** (REGRESSION; source: Task 5's in-arc repair of a pre-existing test defect, so no §2 row) — `settleAtViewport` returns only after BOTH the reported viewport matches the requested size AND two consecutive fitted-geometry samples agree, and throws rather than returning when either never settles. Driven against a fake page that lags the two independently, so the case where geometry lags behind an already-correct viewport is exercised on its own — that is the gap a viewport-only contract leaves open, and it is exactly where the real defect lives.
- **AC-REFIT-AWAIT** (REGRESSION; source: Task 5's in-arc repair, so no §2 row) — with the menu opened at 375x844 and the viewport then shrunk to 375x667 without re-navigation, the scroller settles to the 375x667 cap (364) rather than holding the 375x844 cap (384). Fails if the re-fit await is removed. Derived from measured per-cell values, not hardcoded.
- **AC-REFIT-COVER** (carries Task 5's RED; source: Task 5's in-arc repair, so no §2 row) — no bare `page.goto(` or `page.setViewportSize(` survives outside the single settle helper in `popover-clip-fit.spec.ts`. Fails by default when a new entry point is added, which is what makes this a derived cover rather than a list of the five sites that exist today.
