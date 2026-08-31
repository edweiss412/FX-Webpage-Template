# PARKED, then recounted — the stale fitted cap that flapped popover-clip-fit on CI

**Status:** parked 2026-08-29 by bl-orch ruling, split out of `fix/attention-autoopen-suppress-phone`. **Recounted 2026-08-30 against `origin/main` at `8171e7bb0`: the core premise is REFUTED as stated. The defect does not reproduce on this host, at a rate the former measurement rules out.** Nothing was implemented. This document is the arc's record, and §Appendix preserves the design so a later reader can see what was proposed and why it stopped being needed.

## Stage 0 recount, 2026-08-30

The arc was parked before three merges landed on its own surface, so the first job was to check whether the plan still described reality. It does not.

**What the evidence supports, stated precisely.** The measurements below reject the parked 3-in-7 failure rate on this host with a wide margin. They do NOT prove the race is impossible, and this document does not claim they do. Two alternative readings survive and are named rather than left implicit. First, `settledSample` compares two samples taken 80ms apart, so a geometry that has not begun moving yet yields two identical stale reads and the poll returns on them; it narrows the window rather than closing it. Second, dropping the spec from the default config removes an execution path, which is not the same as fixing a race on the path that remains. So a rarer or runner-dependent recurrence is compatible with everything measured here. The claim is that the parked repair is no longer justified by a reproducing defect, not that the defect has been proven impossible.

**Verdict: closed as subsumed.** `#954` (`2c5b718a4`) did two independent things, either of which bears on the flap:

1. It wrapped four single-sample geometry reads in a new `settledSample` helper (`tests/e2e/popover-clip-fit.spec.ts:315`), which re-reads on an 80ms gap until two consecutive samples agree and throws at a 5s deadline. One of those four is `settled fit at 390x${height}` (`tests/e2e/popover-clip-fit.spec.ts:357`), the exact site this plan named as the failure.
2. It removed `popover-clip-fit` from the `testMatch` in `playwright.config.ts`, so the spec no longer runs in the `desktop-chromium` project. It is standalone-only now. That halves the aggregate execution across the two paths; it does NOT reduce cell adjacency within a single invocation, which still runs one complete 42-test sequence.

### What was measured

All runs are the full unfiltered file on the standalone config, which is compute-only and needs no database grant:

```
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts
```

| Tree | Runs | Result |
| --- | --- | --- |
| Shipping tree, idle machine | 13 | 42 passed, every run |
| Shipping tree, under deliberate 8-core load on a 12-core host | 13 | 42 passed, every run |
| `settledSample` neutered to a single read (pre-#954 behaviour) | 33 | 32 clean; **1 failure** |

Zero of the 26 shipping-tree runs produced the failure signature this plan was written against, and a grep for `vs available` across every run log returns nothing. The parked measurement was 3 failures in 7 full-file runs. Against that rate, 26 consecutive clean runs is not a quiet sample.

**The causal probe is the part worth keeping.** Neutering `settledSample` to `return read()` restores the pre-#954 single-sample behaviour at all four sites. It did produce a failure, so the settle poll is doing real work. But the failure was **not this plan's defect**: it landed at `placement is RE-COMPUTED once the entrance settles` (`tests/e2e/popover-clip-fit.spec.ts:656`, failing assertion at `tests/e2e/popover-clip-fit.spec.ts:693`) with a delta of 15.375px, not at the `settled fit` loop with the constant 20px this plan traced to `CSS_CAP` minus the 390x667 room. The site this document diagnosed did not fire in 33 runs even with its settle removed.

### Premise-by-premise

| Premise as parked | Status against `8171e7bb0` |
| --- | --- |
| Failing site is `settled fit at 390x${height}` over `[844, 667, 560]` | Test still exists, now at `tests/e2e/popover-clip-fit.spec.ts:357`. **Not observed failing**: 26 clean runs, and 33 more with its settle removed. Not a proof of impossibility, per the note above |
| `CSS_CAP` is a file constant of 384 | Holds, `tests/e2e/popover-clip-fit.spec.ts:143`, same line |
| Five `page.goto` sites, 33 `page.setViewportSize` sites | Holds exactly |
| `settledGeometry` carries an internal `waitForTimeout(80)` safe only under its `expect.poll` callers | Holds, `tests/e2e/popover-clip-fit.spec.ts:241`; the two poll callers are now `tests/e2e/popover-clip-fit.spec.ts:786` and `tests/e2e/popover-clip-fit.spec.ts:857` |
| Two reads are exposed: the `settled fit` loop, and the anchor-room census | **Half refuted.** The loop is now polled. The census survives at `tests/e2e/popover-clip-fit.spec.ts:1472` with its bare `waitForTimeout(80)` |
| `wizard-attention-menu.spec.ts` carries no cap constant, room arithmetic, or fixed sleep | Holds in substance, one clause refuted: that file now has four `waitForTimeout(250)` calls. It still has no `CSS_CAP`, no `available`, no `clientHeight`, so the capped-versus-uncapped branch that turns a stale viewport into a wrong number is still absent |

### The surviving exposed read is a documented limit, not a defect

The anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:1472`) still sets a viewport, sleeps a fixed 80ms, and takes a single `fittedGeometry` read. It is genuinely exposed to a stale viewport, and its oracle is a pair of lower bounds: `available > FLOOR` and `min(available) > FLOOR * 2`, with `FLOOR = 48` (`tests/e2e/popover-clip-fit.spec.ts:145`).

**The exemption is bounded, and it rests on an assumption this arc did not manage to test.** If a stale read returns the previous cell's settled room, then because the sweep `[844, 667, 560, 400]` shrinks monotonically, staleness moves every value UP and away from both bounds. That is the argument, and it is only as good as its premise: that the stale value IS the previous cell's settled value, rather than some intermediate geometry sampled mid-resize. **That premise is not established here.** The probe below observed no stale `available` value, which is narrower than observing no stale read: it samples `available` alone, so it says nothing about the fitted scroller behind it, and it therefore cannot map a stale read either.

**What the probe did and did not establish, 2026-08-30.** Removing the census sleep entirely still produced correct `available` values on this host. That is the exact scope of the observation, and it is narrower than it first looks: the probe samples `available` alone, and `available` can settle before the fitted scroller does, so this shows neither that the re-fit completes within one round trip nor that no stale read occurred. What it does show is that no stale `available` value appeared, which is why the mapping above stays untested. What the probe does give is the four settled values, and with them a margin. Measured with the sleep removed:

```
CENSUSPROBE height=844 available=562.453125
CENSUSPROBE height=667 available=412
CENSUSPROBE height=560 available=321.0625
CENSUSPROBE height=400 available=185.0625
```

Under the shifted-by-one reading, a stale sweep would be `562.45, 562.45, 412, 321.06`; both lists clear every bound, and the tightest value rises from 185.06 to 321.06, further from `FLOOR * 2` rather than nearer.

**The residual, stated rather than argued away.** A failure needs some cell to read at or under 96. The smallest settled value on this surface is 185.06 and the largest is 562.45, so 96 is about 51.9% of the smallest and about 17.1% of the largest. (An earlier draft said "below half the smallest and a sixth of the largest"; both fractions were wrong in the unsafe direction, since half of 185.06 is 92.53 and a sixth of 562.45 is 93.74, and a read of 95 fails while clearing both.) Nothing measured here demonstrates such a transient exists, and nothing measured here excludes it either. That is the honest shape of this limit: the assertion has a wide margin in the direction staleness is believed to push, and the belief is untested. It is recorded as a limit for that reason, not retired as impossible.

That is the same shape this plan itself used to scope away from `wizard-attention-menu.spec.ts`: a stale viewport there "yields a layout those assertions are indifferent to." The argument applies to the census too, and it files as a documented limit rather than a finding, per the 2026-08-04 filing bar.

### Why this does not come back as a guard

The remaining implementable piece is AC-REFIT-COVER, the structural scan asserting no bare `page.goto(` or `page.setViewportSize(` outside the settle helper. It is still red against the tree, because it is a text scan and all 38 sites are unrouted. Shipping it now would mean a 38-site refactor plus a new recognizer to harden a defect that does not reproduce, on a surface whose done condition is a property of the guard rather than a number outside the process. The 2026-08-25 mint freeze names that case directly, and `AGENTS.md` names the repair direction under same-axis recurrence as narrowing, not parser growth. The `2d9d0ba11`-style kill already happened when this was split; the recount is the second half of it.

## What does NOT come with it

The P-1 probe deletion stayed on the PRODUCT arc, which has since merged. Only the popover-clip-fit flap ever rode this branch.

## Ledger

No row, and the recount does not create one. The defect was process-facing, and the 2026-08-25 mint freeze admits a process row only under `invariant` or `product-blocked`. Neither applies, and no reproducing defect remains to file against. This document is the record.

## Appendix — the parked design, recovered

**Recovered 2026-08-30.** The original of this section lived in this branch's copy of `docs/superpowers/plans/2026-08-29-attention-auto-open-phone-suppression.md`, which the PARKED note called its only home. Merging `origin/main` took main's deletion of that section, because the product branch had removed it and this branch never touched the file, so the merge was clean and the loss silent. It is restored here from `ee9f1fdb4`. The Task 5 prose and the three acceptance-criteria bullets match it exactly. Three things are added and are NOT in the source: the two fence delimiters wrapping the task marker, so specLint treats it as inert (`lib/specLint/taskContract.ts:466`); a trailing blank line where the two extracts were joined; and the `### The acceptance criteria, as declared in that plan` heading, which is this document's own, since the bullets sat under a different section in the original. Line numbers inside it are as-of 2026-08-29 and are superseded by the recount table above.

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
