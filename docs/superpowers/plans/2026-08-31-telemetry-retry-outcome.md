# Plan: telemetry retry outcome announcement

**Date:** 2026-08-31 · **Branch:** `feat/telemetry-retry-outcome` · **Spec:** `docs/superpowers/specs/2026-08-31-telemetry-retry-outcome-announcement.md` · **Row:** `TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1`

Acceptance criteria live in the sibling spec §9 (AC-1 through AC-11); this plan cites them via `ac=` and declares none locally (coverage-map style).

## Pre-draft code-verification pass (run 2026-08-31, this branch at 34d422e07)

- `components/admin/telemetry/TelemetryRetryButton.tsx:51` — `export function TelemetryRetryButton({ what, testId }: { what: string; testId: string })`. Verified.
- `components/admin/telemetry/TelemetryRetryButton.tsx:80-86` — status region + `attempts % 2` parity render. Verified.
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
- Mutation-operator families for the new guard surface, enumerated up front (closure set): (a) memoized clock (module-level cache in `nowDate`); (b) baseline never recorded (tap handler drops the record); (c) baseline never cleared (outcome repeats on every render); (d) comparison inverted or removed (`!==` → `===` / constant `false`); (e) outcome string emptied / suffixed / not-live (the four string mutants); (f) prop unthreaded at one site (census). A reviewer-proposed NEW family needs a live escaping mutant.

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

Mutant-red proof (recorded in the commit message): plant `let cached: Date | undefined;` + `if (cached) return cached; cached = new Date(); return cached;` at the head of `nowDate`, run the command, observe this case red while the frozen-header cases stay green (they import fresh modules per test via `vi.resetModules`, so the plant must be observed on THIS case specifically); revert, observe green. Failure mode caught: a cross-render memoization of the display clock, which would make `renderedAt` stable and the outcome announcement silently dead (the row's stated fragility).

GREEN: no production change (the guard pins current behavior). Commit: `test(admin): guard nowDate freshness — the outcome announcement's signal`.

### Task 2 — outcome mechanism, threading, census widening (spec §2-§6, AC-1..AC-7, AC-9)

<!-- task: red=`pnpm vitest run tests/components/telemetry/telemetryRetryButton.test.tsx tests/components/telemetry/telemetryRetryButtonSites.test.ts tests/app/admin/telemetryPage.test.tsx` red-state=authored red-target=`components/admin/telemetry/TelemetryRetryButton.tsx:51` why=`the new behavior cases rerender with a changed renderedAt after a tap and assert the outcome string, which no production line renders today (the component at :51 takes only what/testId and its region renders only the intent string); the widened census CANONICAL demands renderedAt={now.getTime()} at every site while all three sites pass two props, so the bridge and count red; the page-level case asserts the outcome after a simulated refresh re-render and reds for the same missing mechanism; only the component gaining the baseline mechanism plus all three sites threading the timestamp turns the SAME command green` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-9 -->

Pre-code mechanical UI checklist (run before writing any component line): outcome copy `Still couldn’t load {what}` — curly apostrophe, no em dash, no `--`; no new interactive element (tap targets unchanged); no new classes (sr-only region only); no motion.

RED (all authored in one wave, observed red together):

1. `telemetryRetryButton.test.tsx` — new cases, rendered-text assertions per the file's own anti-tautology posture:
   - changed `renderedAt` after tap announces `Still couldn’t load {WHAT}` (literal in the test, pinning copy) and clears the baseline (a further rerender with another changed value announces nothing new until the next tap) — AC-2, AC-4;
   - changed `renderedAt` with no tap: region unchanged — AC-3;
   - unchanged `renderedAt` after tap: region still the intent string — AC-4;
   - `renderedAt={Number.NaN}`: tap announces intent, changed later values never announce outcome — AC-5;
   - tap → outcome → tap → outcome sequence: four announcements pairwise perceivable (each differs from its predecessor in text or parity suffix) — AC-6;
   - intent and outcome strings differ for the fixture `what` — AC-9;
   - existing 7 cases updated only where the render helper gains `renderedAt={1_000}`.
2. `telemetryRetryButtonSites.test.ts` — widen `CANONICAL` to exactly `<TelemetryRetryButton\s+what="([^"]*)"\s+testId="([^"]*)"\s+renderedAt=\{now\.getTime\(\)\}\s*\/>`; the totality bridge, literal-3 count, uniqueness, plate cases unchanged — AC-7. (The bridge reds on the live tree the moment the regex widens, because the three shipped sites are two-prop; that IS the observed red.)
3. `telemetryPage.test.tsx` — extend the existing "one tap re-reads" retry case (its `refresh` implementation already re-renders): after the simulated refresh re-render with a later page `now`, the health fallback's status region contains the outcome string.

GREEN:

- `TelemetryRetryButton.tsx`: prop `renderedAt: number`; export `retryOutcomeAnnouncement = (what: string) => "Still couldn’t load " + what` (template literal); replace `attempts` with `{ text, seq }` announcement state plus `baseline: number | null`; tap handler records baseline when `Number.isFinite(renderedAt)`; render-time adjustment (React adjust-state-during-render idiom, guarded by inequality so it cannot loop): when `baseline !== null && Number.isFinite(renderedAt) && renderedAt !== baseline`, set announcement to the outcome and clear the baseline; region renders `seq % 2` parity suffix. Component doc block gains the outcome paragraph and drops nothing.
- Three call sites: add `renderedAt={now.getTime()}` verbatim.
- Typecheck the wave (`pnpm typecheck`) — the required prop and the three sites land in the same commit, so no transient red.

Commit: `feat(admin): the telemetry retry announces its outcome`.

### Task 3 — string-mutant verification (writing-plans four-mutant rule)

<!-- task: red=`pnpm vitest run tests/components/telemetry/telemetryRetryButton.test.tsx` red-state=authored red-target=`components/admin/telemetry/TelemetryRetryButton.tsx:80` why=`four planted mutants against the outcome string assertion — value emptied, suffix appended, content behind a false condition, and each discriminating parameter varied (what swapped, renderedAt comparison inverted) — must each red at least one case; a green on any mutant is a test-side escape repaired before review dispatch` ac=AC-2 -->

Run all four string mutants (emptied / suffixed / not-live / parameter-varied) plus family (c) baseline-never-cleared and family (d) comparison-inverted from the closure set. Record each mutant, the case that redded, and the revert in the commit message. No production change; any surviving mutant is repaired test-side in this task.

### Task 4 — transition audit + a11y posture (spec §7.2)

<!-- task: red=`pnpm vitest run tests/components/telemetry/transitionAudit.test.tsx` red-state=authored red-target=`components/admin/telemetry/TelemetryRetryButton.tsx:37` why=`the derived instant population must still cover the changed component: a motion. token planted into TelemetryRetryButton reds the population case, proving coverage is live for this file after the diff; unplanted tree green` ac=AC-6 -->

Transition Inventory from the spec (verbatim): empty↔intent instant; intent↔outcome instant; empty↔outcome unreachable by construction, instant if ever rendered; compound none (single invisible stateful element). Verify by plant: `motion.span` import planted into the component reds `transitionAudit.test.tsx`'s derived population case; revert. No `AnimatePresence`, no ternary render gains an animation. Record in commit message. (No layout-dimensions task: spec §7.1 declares no fixed-dimension parent; the census plate case pins the container.)

### Task 5 — invariant-8 dual gate + closeout marker (AC-10)

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live why=`this plan names both halves of the impeccable dual gate and no sibling closeout carries the impeccable-gate marker yet, so the conformance case names this plan by filename; only writing the closeout with a real marker line turns the SAME command green` ac=AC-10 -->

Run `/impeccable critique` and `/impeccable audit` on the affected diff (canonical v3 setup gates: context.mjs PRODUCT.md + DESIGN.md load, register reference). Fix P0/P1 or defer with a DEFERRED.md entry (none expected: the diff's only perceivable change is a screen-reader announcement). Write the sibling closeout document beside this plan (stem-named, `-closeout` suffix, created by this task) with `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=recorded` and the findings table.

### Task 6 — graduation, in the PR's last commit (AC-11)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`DEFERRED.md:111` why=`the graduation edit itself authors the failing state: moving the row to the archive with the IN PROGRESS marker at DEFERRED.md:111 still attached reds the archive-rejects-in-flight case (archives categorically reject in-progress entries); removing the marker in the same edit turns the SAME command green — the red is observed mid-edit during the two-step, and the committed state is green` ac=AC-11 -->

Move the `TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1` row from DEFERRED.md to its archive with a closing note (mechanism shipped, guard landed), removing the `**Status:** IN PROGRESS · **Branch:**` marker in the same edit. This is the last commit before readiness; the marker never reaches main.

<!-- tasks: end -->

## Checklist

1. Tasks 1-4 (TDD, commit per task)
2. Task 5 impeccable dual gate
3. Self-review (this file's passes re-run)
4. Adversarial review (cross-model) — whole-diff Codex, split briefs if needed
5. Task 6 graduation
6. Twelve green + readiness suite + READINESS message to bl-orch (execution handoff)

## Test wiring

All touched suites are existing files already matched by the default vitest config (`tests/**`); no new test file is created except cases added to existing suites, so no `testMatch` or workflow path-filter change is needed. The one new doc is the closeout, covered by the filesystem-walked `_metaInvariant8Closeout` suite by default.
