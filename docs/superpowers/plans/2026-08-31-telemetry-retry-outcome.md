# Plan: telemetry retry outcome announcement

**Date:** 2026-08-31 · **Branch:** `feat/telemetry-retry-outcome` · **Spec:** `docs/superpowers/specs/2026-08-31-telemetry-retry-outcome-announcement.md` · **Row:** `TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1`

Acceptance criteria live in the sibling spec §9 (AC-1 through AC-11); this plan cites them via `ac=` and declares none locally (coverage-map style).

## Pre-draft code-verification pass (run 2026-08-31, this branch at 34d422e07)

- `components/admin/telemetry/TelemetryRetryButton.tsx:51` — `export function TelemetryRetryButton({ what, testId }: { what: string; testId: string })`. Verified.
- `components/admin/telemetry/TelemetryRetryButton.tsx:80-86` — status region + `attempts % 2` parity render. Verified at plan time; REPLACED during execution by the shared append channel, per the impeccable gate (see the amendment note in Task 2).
- Call sites: `app/admin/dev/telemetry/page.tsx:90` (has `now` from `app/admin/dev/telemetry/page.tsx:28`), `components/admin/telemetry/EventTimeline.tsx:23` (has `now: Date` prop, `components/admin/telemetry/EventTimeline.tsx:12`), `components/admin/telemetry/HealthAlertsPanel.tsx:295` (has `now` from `components/admin/telemetry/HealthAlertsPanel.tsx:272-276`). Verified.
- `tests/components/telemetry/telemetryRetryButtonSites.test.ts` — `CANONICAL` regex (two literal props), totality bridge `tagMentions === found.length`, literal-3 count. Verified.
- `tests/components/telemetry/telemetryRetryButton.test.tsx` — 7 cases incl. namespace ban and rendered-text assertions. Verified.
- `tests/time/now.test.ts` — existing suite for `lib/time/now.ts`, node env, fake-timer + `vi.resetModules` dynamic-import pattern. Verified.
- `tests/app/admin/telemetryPage.test.tsx:47` — retry cases install a re-rendering `refresh` implementation. Verified.
- `tests/components/telemetry/transitionAudit.test.tsx` — derived-population instant check. Verified.
- `tests/docs/_metaInvariant8Closeout.test.ts` — walks plan units for `impeccable-gate:` marker. (Red observed at plan time once this plan lands; see Task 5.)

## Meta-test inventory

- EXTENDS: `tests/components/telemetry/telemetryRetryButtonSites.test.ts` (census — widened canonical form + threading assertion, spec §5.2). This is the structural defense for "a site forgets to thread the prop."
- None of the registry meta-tests (Supabase call-boundary, advisory-lock, admin-alert catalog, sentinel-hiding, email-normalization) applies: no DB, no auth, no alerts, client/RSC prop threading only.
- Mutation-operator families for the new guard surface, enumerated up front (closure set): (a) memoized clock (module-level cache in `nowDate`); (b) baseline never recorded (tap handler drops the record); (c) baseline never cleared (outcome repeats on every render); (d) **any one-edit substitution at a decision or a write in the announcement path** — derived from the two inventories in Task 3, not from a fixed list: for decisions, comparator inversion (`!==` → `===`), comparator ordering (`!==` → `>`/`<`), truthiness for finite/null checks, `!Number.isNaN` for `Number.isFinite`; for writes, a dropped, duplicated, or cross-branch value (the settlement's `seq + 1` is the one member expected to survive as equivalent, with the reachability argument recorded in Task 3 rather than a red claimed for it); (e) outcome string emptied / suffixed / not-live (the four string mutants), plus, after the channel swap, the region's accessible name reverting to the button's command string and the pruning rule widening to every tap; (f) prop unthreaded at one site (census). A reviewer-proposed NEW family needs a live escaping mutant.

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1 — the signal guard (spec §5.1, AC-8)

<!-- task: red=`pnpm vitest run tests/time/now.test.ts` red-state=authored red-target=`lib/time/now.ts:22` why=`the new freshness case passes on the live tree as authored (nowDate is fresh today), so the observed red comes from the planted memoization mutant — a module-level cached Date returned from nowDate at now.ts:22 — which is the defect shape the row names (a memoized clock silently kills the announcement); the unplanted tree turns the SAME command green` ac=AC-8 -->

RED: add to `tests/time/now.test.ts` (production shape: no `ENABLE_TEST_AUTH`):

```ts
it("signal guard: nowDate returns a fresh instant per call under an advancing clock", async () => {
  const BASE = new Date("2099-01-01T00:00:00.000Z").getTime();
  const ADVANCE_MS = 20;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASE));
  const { nowDate } = await import("@/lib/time/now");
  const first = (await nowDate()).getTime();
  vi.setSystemTime(new Date(BASE + ADVANCE_MS));
  const second = (await nowDate()).getTime();
  // Exact delta, not merely greater-than: a fresh clock tracks the advance to the
  // millisecond under fake timers, while any cached value yields delta 0.
  expect(second - first).toBe(ADVANCE_MS);
});
```

(The expected delta derives from `ADVANCE_MS`, the same constant that drives the clock, so the assertion cannot pass on a stale pair; no separate `premise` call is needed because the fixture's own arithmetic is the premise.)

Mutant-red proof (recorded in the commit message): plant a module-level cache in `nowDate`, run the command, observe the new case red, revert, observe green. Failure mode caught: a cross-render memoization of the display clock, which would make `renderedAt` stable and the outcome announcement silently dead (the row's stated fragility).

**Where the plant goes, corrected against what execution measured.** This step was drafted saying a cache at the HEAD of `nowDate` would red this case while the frozen-header cases stayed green. That is false and the arc proved it false: a cache at the head bypasses the frozen-header branch entirely and redded SEVEN cases (`c045d703f`), which is a strawman mutant, since no plausible memoization lands where it disables the test-auth path. Re-planted on the production path alone (`__mutantCache ??= new Date()` behind the `ENABLE_TEST_AUTH` guard), exactly one case reds: the new one, 20 passed. That is the shape the defect would actually take.

GREEN: no production change (the guard pins current behavior). Commit: `test(admin): guard nowDate freshness — the outcome announcement's signal`.

### Task 2 — outcome mechanism, threading, census widening (spec §2-§6, AC-1..AC-7, AC-9)

<!-- task: red=`pnpm vitest run tests/components/telemetry/telemetryRetryButton.test.tsx tests/components/telemetry/telemetryRetryButtonSites.test.ts tests/app/admin/telemetryPage.test.tsx` red-state=authored red-target=`components/admin/telemetry/TelemetryRetryButton.tsx:51` why=`the new behavior cases rerender with a changed renderedAt after a tap and assert the outcome string, which no production line renders today (the component at :51 takes only what/testId and its region renders only the intent string); the widened census CANONICAL demands renderedAt={now.getTime()} at every site while all three sites pass two props, so the bridge and count red; the page-level case asserts the outcome after a simulated refresh re-render and reds for the same missing mechanism; only the component gaining the baseline mechanism plus all three sites threading the timestamp turns the SAME command green` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-9 -->

Pre-code mechanical UI checklist (run before writing any component line): outcome copy `Still couldn’t load {what}` — curly apostrophe, no em dash, no `--`; no new interactive element (tap targets unchanged); no new classes (sr-only region only); no motion.

RED (all authored in one wave, observed red together):

1. `telemetryRetryButton.test.tsx` — new cases, rendered-text assertions per the file's own anti-tautology posture:
   - changed `renderedAt` after tap announces `Still couldn’t load {WHAT}` (literal in the test, pinning copy) and clears the baseline (a further rerender with another changed value announces nothing new until the next tap) — AC-2, AC-4;
   - changed `renderedAt` with no tap: region unchanged — AC-3;
   - unchanged `renderedAt` after tap: region still the intent string — AC-4;
   - **zero is a valid instant, both sides.** Tap at `renderedAt={0}` then rerender at `1_000`: outcome announced (a truthiness guard `if (renderedAt)` at the tap records nothing and suppresses it). Tap at `1_000` then rerender at `0`: outcome announced (a truthiness guard `if (baseline)` at settlement suppresses it). Spec §6's table declares `0` a valid epoch — AC-2, AC-5;
   - **the whole non-finite domain, not just NaN.** `Number.NaN`, `Number.POSITIVE_INFINITY`, `Number.NEGATIVE_INFINITY` each as the tap value (baseline never recorded, no later outcome) and each as the arriving value after a finite tap (never settles the outcome). A `!Number.isNaN(...)` guard is strict-clean and passes a NaN-only case while accepting `±Infinity` as a completed render — AC-5;
   - **a decreasing timestamp settles the outcome too.** Tap at `2_000`, rerender at `1_000`: outcome announced. The contract is any-difference (spec §3.3), so the one-edit comparator `renderedAt > baseline` must red here; a monotonic-only case cannot see it — AC-2;
   - tap → outcome → tap → outcome sequence: four announcements pairwise perceivable (each differs from its predecessor in text, or is a separate keyed entry when the text repeats) — AC-6;
   - **the adjacency property itself, walked over a sequence, not asserted as arithmetic about any particular pair** — AC-6. Drive tap, tap, change, tap, change, change through one mounted control and assert that every non-empty region text differs from the one rendered immediately before it. That is the property spec §3.6 states; a parity claim about any particular pair is arithmetic about the implementation, and round 3 caught the round-2 version of this bullet asserting a pair that the stated implementation renders identically (outcomes land at even `seq` both times). The walk cannot go stale that way, because it reads what rendered rather than predicting it;
   - **the recurrence property, pinned on the shape that carries it.** Two taps with no settlement between them carry identical copy, so they are the pair that separates an appending channel from a rewriting one: assert two distinctly keyed entries, not one rewritten node — AC-6;
   - **both copy literals, pinned exactly on the rendered text.** Deriving an intent expectation from `retryAnnouncement` states a property and pins no copy: rewording that constant to `Retried {what}` would leave every property case green while announcing a settled outcome before any re-read has happened — AC-9;
   - intent and outcome strings differ for the fixture `what` — AC-9;
   - existing 7 cases updated only where the render helper gains `renderedAt={1_000}`.
2. `telemetryRetryButtonSites.test.ts` — widen `CANONICAL` to exactly `<TelemetryRetryButton\s+what="([^"]*)"\s+testId="([^"]*)"\s+renderedAt=\{now\.getTime\(\)\}\s*\/>`; the totality bridge, literal-3 count, uniqueness, plate cases unchanged — AC-7. (The bridge reds on the live tree the moment the regex widens, because the three shipped sites are two-prop; that IS the observed red.)
3. `telemetryPage.test.tsx` — extend the existing "one tap re-reads" retry case (its `refresh` implementation already re-renders): after the simulated refresh re-render with a DIFFERENT page `now`, the health fallback's status region contains the outcome string. Different, not later: the page case proves the wiring end to end, and direction coverage lives in the component suite above, so this case must not smuggle a monotonic assumption the contract does not make.

GREEN:

- `TelemetryRetryButton.tsx`: prop `renderedAt: number`; export `retryOutcomeAnnouncement`; a `baseline: number | null`; the tap handler records the baseline when `Number.isFinite(renderedAt)`; a render-time adjustment (React's adjust-state-during-render idiom, guarded by inequality so it cannot loop) announces the outcome and clears the baseline when `baseline !== null && Number.isFinite(renderedAt) && renderedAt !== baseline`. Three shapes are forbidden by the cases above and named here so the implementation cannot drift into one: a truthiness test in place of either `Number.isFinite` or the `!== null`, an `isNaN` test in place of either `Number.isFinite`, and an ordering comparator in place of `!==`.

  **Amended during execution, at the impeccable gate.** The announcement state was drafted here as a local `{text, seq}` with a parity suffix. DESIGN.md §15 mandates the shared `role="log"` append channel whenever the same message text can recur and says not to hand-roll a third copy, and this region is exactly that case, so the shipped implementation takes `useAnnounceLog` + `AnnounceLogRegion` instead: the counter, the modulo and the suffix are gone. Two rules came with it, each pinned by a test and a mutant: the region is named for its content rather than with the button's command string, and the channel is pruned only at a cycle boundary, because pruning on every tap would collapse two impatient taps into one node.

- Three call sites: add `renderedAt={now.getTime()}` verbatim.
- Typecheck the wave (`pnpm typecheck`) — the required prop and the three sites land in the same commit, so no transient red.

Commit: `feat(admin): the telemetry retry announces its outcome`.

### Task 3 — string-mutant verification (writing-plans four-mutant rule)

<!-- task: red=`pnpm vitest run tests/components/telemetry/telemetryRetryButton.test.tsx` red-state=authored red-target=`components/admin/telemetry/TelemetryRetryButton.tsx:80` why=`four planted mutants against the outcome string assertion — value emptied, suffix appended, content behind a false condition, and each discriminating parameter varied (what swapped, renderedAt comparison inverted) — must each red at least one case; a green on any mutant is a test-side escape repaired before review dispatch` ac=AC-2 -->

Run all four string mutants (emptied / suffixed / not-live / parameter-varied) plus family (c) baseline-never-cleared and family (d) comparison-or-guard-substituted from the closure set. The arm is derived rather than listed, over BOTH kinds of site the announcement path contains, the decisions and the writes, because round 2 found its survivor in the second kind after round 1 had swept the first:

- **Every boolean operand:** `Number.isFinite(renderedAt)` at the tap, `baseline !== null`, `Number.isFinite(renderedAt)` at settlement, `renderedAt !== baseline`, and the cycle-boundary `baseline === null` that gates the reset. Mutate each to the ordinary authoring substitutes for its type: a truthiness test for a finite/null check, `!Number.isNaN` for `Number.isFinite`, `>` and `<` for `!==`, and the reset's gate widened to fire on every tap.
- **Every state write:** the tap's announcement, the tap's `baseline = renderedAt`, the tap's cycle-boundary `reset()`, the settlement's announcement, the settlement's `baseline = null`. Mutate each to the ordinary substitutes for a write: dropped (the value carried through unchanged), duplicated, or written with the sibling branch's value.

Both inventories are read off the shipped implementation at mutation time, so a site added later is covered by re-running the derivation rather than by remembering a list.

**Amended by the channel swap.** As drafted, one write was expected to survive as equivalent: the settlement's `seq + 1`, since two consecutive announcements can share their text only when both are intents. That counter no longer exists, so the survivor is moot rather than accepted, and the sweep run against the shipped implementation covers the writes listed above plus the two rules the swap introduced. Record each mutant, the case that redded, and the revert in the commit message. No production change; any surviving mutant is repaired test-side in this task.

### Task 4 — transition audit + a11y posture (spec §7.2)

<!-- task: red=`pnpm vitest run tests/components/telemetry/transitionAudit.test.tsx` red-state=authored red-target=`components/admin/telemetry/TelemetryRetryButton.tsx:37` why=`the derived instant population must still cover the changed component: a motion. token planted into TelemetryRetryButton reds the population case, proving coverage is live for this file after the diff; unplanted tree green` ac=AC-6 -->

Transition Inventory from the spec (verbatim): empty↔intent instant; intent↔outcome instant; empty↔outcome unreachable by construction, instant if ever rendered; compound none (single invisible stateful element). Verify by plant: `motion.span` import planted into the component reds `transitionAudit.test.tsx`'s derived population case; revert. No `AnimatePresence`, no ternary render gains an animation. Record in commit message. (No layout-dimensions task: spec §7.1 declares no fixed-dimension parent; the census plate case pins the container.)

### Task 5 — invariant-8 dual gate + closeout marker (AC-10)

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live why=`this plan names both halves of the impeccable dual gate and no sibling closeout carries the impeccable-gate marker yet, so the conformance case names this plan by filename; only writing the closeout with a real marker line turns the SAME command green` ac=AC-10 -->

Run `/impeccable critique` and `/impeccable audit` on the affected diff (canonical v3 setup gates: context.mjs PRODUCT.md + DESIGN.md load, register reference). Fix P0/P1 or defer with a DEFERRED.md entry (none expected: the diff's only perceivable change is a screen-reader announcement). Write the sibling closeout document beside this plan (stem-named, `-closeout` suffix, created by this task) with `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=recorded` and the findings table.

<!-- tasks: end -->

### Task 6 — graduation, in the PR's last commit (AC-11; outside the enrolled region — the marker grammar cannot cite a root-level file as a red-target, and DEFERRED.md lives at the repo root)

Move the `TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1` row from DEFERRED.md to `DEFERRED-archive.md` with a closing note (mechanism shipped, guard landed), removing the `**Status:** IN PROGRESS · **Branch:**` marker in the same edit. Verification is the two-step observed by hand: mid-edit, the row parked in the archive with its marker still attached reds `tests/docs/_metaLedgerInProgress.test.ts` ("archived work cannot be in flight", its `isArchive` walk at `tests/docs/_metaLedgerInProgress.test.ts:52`); removing the marker in the same edit turns the same command green, and the committed state is green. This is the last commit before readiness; the marker never reaches main. Discharges AC-11.

## Checklist

1. Tasks 1-4 (TDD, commit per task)
2. Task 5 impeccable dual gate
3. Self-review (this file's passes re-run)
4. Adversarial review (cross-model) — whole-diff Codex, split briefs if needed
5. Task 6 graduation
6. Twelve green + readiness suite + READINESS message to bl-orch (execution handoff)

## Test wiring

All touched suites are existing files already matched by the default vitest config (`tests/**`); no new test file is created except cases added to existing suites, so no `testMatch` or workflow path-filter change is needed. The one new doc is the closeout, covered by the filesystem-walked `_metaInvariant8Closeout` suite by default.
