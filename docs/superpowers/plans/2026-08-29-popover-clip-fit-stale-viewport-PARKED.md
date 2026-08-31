# PARKED, then recounted — the stale fitted cap that flapped popover-clip-fit on CI

**Status:** parked 2026-08-29 by bl-orch ruling, split out of `fix/attention-autoopen-suppress-phone`. **Recounted 2026-08-30 against `origin/main` at `8171e7bb0`: the core premise is REFUTED as stated. The defect does not reproduce on this host, at a rate the former measurement rules out.** Nothing was implemented. This document is the arc's record; the design it would have built is preserved at `docs/superpowers/plans/2026-08-29-popover-clip-fit-settle-cover-design.md`.

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

### This class already had a slug, and this arc is its missing reproduction

The class is `LIM-E2E-1280-CONTAINMENT-FLAKE` (`docs/review-rounds/LIMITS.md`), and it is the same defect from the other end: a placement measured once, in this file, without polling for settle. No twin slug is coined here, per the README's rule that a later arc cites the existing slug.

Two things this arc contributes to it.

**The reproduction that entry says it never obtained.** It records "No reproduction was obtained, and none is claimed," resting the repair on the defect shape and on `components/admin/showpage/AttentionMenu.tsx:479`. The neuter probe here is that reproduction: with `settledSample` reduced to a single read, 33 full-file runs produced a failure at `placement is RE-COMPUTED once the entrance settles`, which is one of the two cases that entry names by symptom. The mechanism it inferred is the mechanism that fires when the poll is removed. The repair was right, and now something observed says so.

**One in-class site the sweep missed.** That entry derived its population from the mechanism rather than from known symptoms, which is the right method, and it reached six cases across four reads. The anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:1472`) also opens the menu and asserts on placement-derived geometry from a single sample, so it is in-class by that definition, and it is NOT routed through `settledSample`; it still carries a bare `waitForTimeout(80)`. It is not among the entry's two stated exclusions. It is in-class and, on the margin argued above, harmless — which is why it is recorded here rather than filed. It also literally satisfies that entry's re-file trigger ("a placement read in that file that does not go through the settle poll"), so it is named explicitly rather than left for someone to trip over.

## Re-file trigger: the procedure, not a description

The design un-parks if the defect reproduces. That is testable rather than a matter of judgement, and the procedure is short enough to state in full:

1. In `tests/e2e/popover-clip-fit.spec.ts`, replace the body of `settledSample` with `return read();`, so it takes one sample instead of polling to agreement. This restores the pre-`#954` behaviour at all four of its call sites at once.
2. Run the FULL unfiltered file, repeatedly, never under `-g`: cell adjacency is the condition, and an isolated case never reproduced.

   ```
   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts
   ```
3. Restore the file. Do not commit the neutered form.

**What each outcome means.** A failure at `settled fit at 390x${height}` with a delta of exactly 20px is the parked defect, and the design un-parks with its work already written. A failure elsewhere in the file is the broader class, which belongs to `LIM-E2E-1280-CONTAINMENT-FLAKE`. No failure across a comparable number of runs reproduces what this arc measured, and the parking stands.

**And the trigger that does not need the neuter at all:** the flake recurring on the SHIPPING tree, with `settledSample` intact. That would mean the poll narrows the window rather than closing it, which this document already names as a live possibility rather than excluding.

## What does NOT come with it

The P-1 probe deletion stayed on the PRODUCT arc, which has since merged. Only the popover-clip-fit flap ever rode this branch.

## Ledger

No row, and the recount does not create one. The defect was process-facing, and the 2026-08-25 mint freeze admits a process row only under `invariant` or `product-blocked`. Neither applies, and no reproducing defect remains to file against. This document is the record.
