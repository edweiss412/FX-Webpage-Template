// @vitest-environment jsdom
/**
 * tests/components/RightNowCardRecovery.test.tsx
 *
 * Pins the §8.2 stale-tint UNWIND contract on degradation → recovery
 * sequences. Codex round-9 fresh-eyes M4 review (2026-05-04) caught
 * that `RightNowCard.tsx:467-471` evaluated `treatment ===
 * "morph-to-last-good"` symmetrically — both `show_day_n → unknown`
 * (degradation) AND `unknown → show_day_n` (recovery) followed the
 * "render lastGood + apply stale tint" branch, leaving the card stuck
 * on the OLD body with stale tint indefinitely after a sync error
 * recovered. This file pins the recovery direction so the bug cannot
 * silently regress.
 *
 * Spec context:
 *   - §8.2 lines 2414-2426 (`unknown` / `dateless` semantics).
 *   - Matrix header (lib/time/rightNowTransitions.ts:19-22) declares
 *     the matrix-level treatment is symmetric — visual treatment is
 *     "no body crossfade, surface tint flip" in both directions. The
 *     symmetry is intentional and pinned by 7+ existing matrix tests.
 *     The fix is in the consumer's interpretation of the treatment,
 *     not the matrix.
 *   - Compound 4 docstring in tests/e2e/right-now-transitions.spec.ts
 *     (line 416-435) explicitly DEFERS this scenario to M6 because
 *     mid-session sync errors require Realtime push. Round-9 caught
 *     that the production code never honored the compound-4
 *     intent — recovery shipped behaving exactly like degradation.
 *
 * Driving strategy:
 *   - jsdom + vi fake timers; clock pinned to a show-day boundary.
 *   - `now` is captured ONCE at mount via `useState(() => new Date())`;
 *     it doesn't change during the test (we never advance fake
 *     timers, so the 60s tick never fires). Kind transitions are
 *     driven purely by re-rendering with different `context.dates`,
 *     which the card re-derives state from on every render.
 *
 * Anti-tautology guarantees:
 *   - The recovery assertion checks a callTime DIFFERENT from the
 *     pre-degradation render (15:30 vs 14:00). A buggy implementation
 *     cannot satisfy "Call: 15:30" by reusing lastGood — that string
 *     only exists in the recovered render's body.
 *   - Expected strings derive from fixture inputs (callTime values),
 *     not from importing the production renderBody function.
 *   - Each assertion names the concrete failure mode it catches (in
 *     comments above the `expect`).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RightNowCard } from "@/components/right-now/RightNowCard";
import type { RightNowContext } from "@/components/right-now/buildRightNowContext";

/** Build a complete RightNowContext from just the bits a test cares about. */
function makeContext(overrides: Partial<RightNowContext>): RightNowContext {
  return {
    dates: { travelIn: null, travelOut: null, set: null, showDays: [] },
    dateRestriction: { kind: "none" },
    showTitle: "Test Show",
    hotelName: null,
    hotelCheckInTime: null,
    hotelCheckOutTime: null,
    venueName: null,
    loadInTime: null,
    callTime: null,
    roomName: null,
    strikeTime: null,
    timezone: "America/New_York",
    ...overrides,
  };
}

/**
 * A 2-day show whose showDays span 2026-04-21..22. Combined with the
 * pinned clock at 2026-04-21 (NY tz), `selectRightNowState` resolves
 * to `show_day_n` with n=1, total=2, isLast=false.
 *
 * Returned from a factory (not a frozen `as const` literal) because
 * the production `ShowRow["dates"]` type uses mutable `string[]` for
 * `showDays`; `as const` would make showDays readonly and the type
 * assignment fails.
 */
function validDates() {
  return {
    travelIn: "2026-04-20",
    travelOut: "2026-04-23",
    set: "2026-04-20",
    showDays: ["2026-04-21", "2026-04-22"],
  };
}

/**
 * `unknown` trigger: `hasFullDates` returns false because travelOut
 * is null. countParseableDates is non-zero (travelIn parses) so it
 * does NOT collapse to `dateless`. Per
 * lib/time/rightNow.ts:201-203.
 */
function partialDates() {
  return {
    travelIn: "2026-04-20",
    travelOut: null,
    set: null,
    showDays: [],
  };
}

/**
 * `dateless` trigger: all date fields null/empty so
 * countParseableDates === 0. Per lib/time/rightNow.ts:198-200.
 */
function noDates() {
  return {
    travelIn: null,
    travelOut: null,
    set: null,
    showDays: [],
  };
}

beforeEach(() => {
  // Pin the system clock to mid-day on showDay 1 (NY tz, EDT in April,
  // UTC-4). 16:00Z = 12:00 EDT — comfortably past the day boundary so
  // small computed offsets never accidentally roll into the previous
  // day. selectRightNowState formats `today` to NY tz internally.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-21T16:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RightNowCard — stale-tint UNWINDS on recovery (Codex round-9 HIGH)", () => {
  test("show_day_n → unknown → show_day_n: stale clears, NEW body renders", () => {
    // ── Step 1: mount in a good state (show_day_n with callTime 14:00). ──
    const ctxA = makeContext({
      dates: validDates(),
      callTime: "14:00",
    });
    const { container, rerender } = render(<RightNowCard context={ctxA} />);
    const card = () => container.querySelector('[data-testid="right-now-card"]')!;
    const stateMarker = () => container.querySelector('[data-testid="right-now-state"]')!;
    const detail = () => container.querySelector('[data-testid="right-now-detail"]');

    // Sanity: initial render resolved to show_day_n with the v1 callTime.
    // Catches: a fixture or pinned-clock regression that would invalidate
    // every later assertion silently.
    expect(stateMarker().getAttribute("data-state")).toBe("show_day_n");
    expect(card().getAttribute("data-stale")).toBe("false");
    expect(detail()?.textContent).toContain("Call: 14:00");

    // ── Step 2: degrade — partial dates trigger the `unknown` branch. ──
    // The §8.2 contract says the card should KEEP showing the lastGood
    // body (Call: 14:00) under a stale tint, NOT swap to the unknown
    // body. This is the existing degradation contract; we assert it
    // here so the test exercises both directions and the "fix" cannot
    // silently break degradation while fixing recovery.
    const ctxDegraded = makeContext({
      dates: partialDates(),
      callTime: null, // unknown body wouldn't read callTime anyway
    });
    rerender(<RightNowCard context={ctxDegraded} />);

    // Authoritative state machine resolved to `unknown`, but the
    // RENDERED body is still lastGood (Call: 14:00) with stale tint.
    // Catches: a regression that would render the unknown body during
    // degradation (which is allowed by the matrix — morph-to-last-good
    // says we should NOT do that).
    expect(stateMarker().getAttribute("data-state")).toBe("unknown");
    expect(stateMarker().getAttribute("data-rendered-state")).toBe("show_day_n");
    expect(card().getAttribute("data-stale")).toBe("true");
    expect(detail()?.textContent).toContain("Call: 14:00");

    // ── Step 3: RECOVER — valid dates restored, with a DIFFERENT call
    // time (15:30) so the test can distinguish "recovered body" from
    // "stuck-on-lastGood body". Bug case: card stays on Call: 14:00
    // with data-stale=true. Fixed case: card shows Call: 15:30 with
    // data-stale=false. ─────────────────────────────────────────────
    const ctxRecovered = makeContext({
      dates: validDates(),
      callTime: "15:30",
    });
    rerender(<RightNowCard context={ctxRecovered} />);

    // The bug-pinning assertions. Each names the concrete failure mode
    // a regression would produce.

    // (a) State machine resolved back to show_day_n.
    // Catches: matrix lookup or selectRightNowState regression.
    expect(stateMarker().getAttribute("data-state")).toBe("show_day_n");

    // (b) Stale tint CLEARED. The §8.2 unwind contract.
    // Catches: the round-9 bug — the card sitting permanently in
    // stale-tint after a sync error recovers.
    expect(card().getAttribute("data-stale")).toBe("false");

    // (c) The RENDERED body reflects the recovered (NEW) callTime, not
    // the pre-degradation one. This is the strictest anti-tautology
    // check — a passing assertion here cannot have come from lastGood
    // because "Call: 15:30" never existed before this rerender.
    // Catches: the round-9 bug's user-visible regression — crew seeing
    // an outdated call time after Realtime refresh restores valid data.
    expect(detail()?.textContent).toContain("Call: 15:30");
    expect(detail()?.textContent).not.toContain("Call: 14:00");

    // (d) data-rendered-state is the recovered state, not the lastGood
    // state. Belt-and-braces — if (c) passes by accident through some
    // future render-text quirk, this still pins the rendered-state
    // semantics from the file-header data-testid contract.
    expect(stateMarker().getAttribute("data-rendered-state")).toBe("show_day_n");
  });

  test("show_day_n → dateless → show_day_n: stale clears (parallel to unknown branch)", () => {
    // Same shape as the unknown variant but exercising the OTHER
    // degraded state (dateless). Codex's recommendation called out
    // both `unknown` and `dateless` explicitly — covering both
    // ensures the directional fix's `isDegradedState` predicate
    // includes both kinds, not just `unknown`.

    const ctxA = makeContext({
      dates: validDates(),
      callTime: "09:00",
    });
    const { container, rerender } = render(<RightNowCard context={ctxA} />);
    const card = () => container.querySelector('[data-testid="right-now-card"]')!;
    const stateMarker = () => container.querySelector('[data-testid="right-now-state"]')!;
    const detail = () => container.querySelector('[data-testid="right-now-detail"]');

    expect(stateMarker().getAttribute("data-state")).toBe("show_day_n");
    expect(card().getAttribute("data-stale")).toBe("false");
    expect(detail()?.textContent).toContain("Call: 09:00");

    // Degrade to dateless (total date loss).
    const ctxDateless = makeContext({
      dates: noDates(),
      callTime: null,
    });
    rerender(<RightNowCard context={ctxDateless} />);
    expect(stateMarker().getAttribute("data-state")).toBe("dateless");
    expect(card().getAttribute("data-stale")).toBe("true");

    // Recover with new callTime.
    const ctxRecovered = makeContext({
      dates: validDates(),
      callTime: "10:45",
    });
    rerender(<RightNowCard context={ctxRecovered} />);

    // Same three pinning assertions as the unknown variant.
    expect(stateMarker().getAttribute("data-state")).toBe("show_day_n");
    expect(card().getAttribute("data-stale")).toBe("false");
    expect(detail()?.textContent).toContain("Call: 10:45");
    expect(detail()?.textContent).not.toContain("Call: 09:00");
  });

  test("show_day_n → unknown: stale tint APPLIED, lastGood body preserved (degradation control)", () => {
    // Pure control test: the degradation direction must STILL behave
    // correctly after the recovery fix lands. If a too-aggressive fix
    // makes morph-to-last-good a no-op, this test catches it — the
    // degradation should still hold the previous body on screen with
    // a stale tint, not flicker to the unknown body.

    const ctxA = makeContext({
      dates: validDates(),
      callTime: "11:11",
    });
    const { container, rerender } = render(<RightNowCard context={ctxA} />);
    const card = () => container.querySelector('[data-testid="right-now-card"]')!;
    const stateMarker = () => container.querySelector('[data-testid="right-now-state"]')!;
    const detail = () => container.querySelector('[data-testid="right-now-detail"]');

    expect(detail()?.textContent).toContain("Call: 11:11");

    // Degrade.
    const ctxDegraded = makeContext({ dates: partialDates() });
    rerender(<RightNowCard context={ctxDegraded} />);

    // Authoritative state is unknown; rendered state is the lastGood
    // (show_day_n); stale tint applied; OLD body still on screen.
    expect(stateMarker().getAttribute("data-state")).toBe("unknown");
    expect(stateMarker().getAttribute("data-rendered-state")).toBe("show_day_n");
    expect(card().getAttribute("data-stale")).toBe("true");
    expect(detail()?.textContent).toContain("Call: 11:11");
  });
});

// ── Codex round-19 — prefers-reduced-motion wiring ────────────────────
//
// We mock framer-motion to override `useReducedMotion` per-test. A
// matchMedia mock at the test level is too late: framer-motion may
// capture matchMedia at module-load time, so the late override is
// ignored. vi.mock at module scope replaces the hook itself, which
// is the only level of override that's reliable across versions.

const reducedMotionMock = { value: false as boolean };

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => reducedMotionMock.value,
  };
});

describe("RightNowCard — prefers-reduced-motion (Codex round-19 MEDIUM)", () => {
  test("data-prefers-reduced-motion='true' when useReducedMotion returns true", () => {
    reducedMotionMock.value = true;
    const ctx = {
      dates: {
        travelIn: "2026-04-20",
        travelOut: "2026-04-23",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
      },
      dateRestriction: { kind: "none" as const },
      showTitle: "Test Show",
      hotelName: null,
      hotelCheckInTime: null,
      hotelCheckOutTime: null,
      venueName: null,
      loadInTime: null,
      callTime: "14:00",
      roomName: null,
      strikeTime: null,
      timezone: "America/New_York",
    };
    const { container } = render(<RightNowCard context={ctx} />);
    const card = container.querySelector('[data-testid="right-now-card"]')!;
    // Catches the round-19 bug: pre-fix, useReducedMotion was never
    // called, so the attribute defaulted (or was missing) regardless
    // of the user preference.
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("true");
  });

  test("data-prefers-reduced-motion='false' when useReducedMotion returns false", () => {
    reducedMotionMock.value = false;
    const ctx = {
      dates: {
        travelIn: "2026-04-20",
        travelOut: "2026-04-23",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
      },
      dateRestriction: { kind: "none" as const },
      showTitle: "Test Show",
      hotelName: null,
      hotelCheckInTime: null,
      hotelCheckOutTime: null,
      venueName: null,
      loadInTime: null,
      callTime: "14:00",
      roomName: null,
      strikeTime: null,
      timezone: "America/New_York",
    };
    const { container } = render(<RightNowCard context={ctx} />);
    const card = container.querySelector('[data-testid="right-now-card"]')!;
    // Anti-tautology: confirm the attribute is NOT always "true" or
    // "unknown" — it correctly reflects the user opt-out.
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("false");
  });
});
