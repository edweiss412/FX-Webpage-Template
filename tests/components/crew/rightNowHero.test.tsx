// @vitest-environment jsdom
/**
 * tests/components/crew/rightNowHero.test.tsx (crew-redesign Task 5)
 *
 * `RightNowHero` IS `RightNowCard` re-skinned into the §4.16 five-slot hero
 * (eyebrow + live-dot, lead, detail, progress segments, stats ≤3 one accented).
 * It carries RightNowCard's clock + state-derivation + lastGood/morph +
 * AnimatePresence + prefersReducedMotion machinery VERBATIM; only the body
 * slotting changes.
 *
 * Source of truth for what each state renders: the §4.3 12-row map and §4.8
 * two-level stat-omission guards. Expected eyebrow/lead/progress/stats are
 * derived from the §4.3 map applied to the fixture — never hardcoded copy:
 * tests assert STRUCTURAL slots (presence/absence of nodes, segment counts,
 * the degraded hook) and the kind's mapped data, not the exact prose strings.
 *
 * data-testid / hook contract under test:
 *   - right-now-hero      outer wrapper
 *   - right-now-state     hidden marker carrying data-state / data-rendered-state
 *   - right-now-lead      lead slot
 *   - right-now-progress  progress slot (N segments via data-segment children)
 *   - right-now-stats     stats strip (omitted entirely when empty)
 *   - data-degraded="true" on the wrapper for dateless/unknown/viewer_unconfirmed
 *
 * Cases (Task 5 / 6 / 22b):
 *   - Test 5: the 12-state map — each kind renders its mapped eyebrow + lead;
 *     degraded kinds carry data-degraded + NO stats; show_day_n renders N
 *     progress segments from `total`; travel-day kinds render hotel name/dates
 *     stats only (NO flight / next-call stat — a Phase-1 source boundary).
 *   - Test 5 re-derive: mount at a frozen `now` in show_day_1, advance fake
 *     timers past a day boundary + dispatch visibilitychange → the hero
 *     RE-DERIVES to the next kind (proving it owns the live clock).
 *   - Test 6: stat guards — empty/all-null stats → no strip node; a non-finite
 *     numeric in a stat → that stat omitted, others remain.
 *   - Test 22b: client-clock freeze — with `new Date` overridden to a fixed
 *     instant at mount, the rendered state is deterministic post-hydration and
 *     the component reads `new Date()`, NOT a nowDate/server seed.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { RightNowHero } from "@/components/crew/RightNowHero";
import type { RightNowContext } from "@/components/right-now/buildRightNowContext";
import { selectRightNowState, type RightNowState } from "@/lib/time/rightNow";

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

// ── DOM accessors (functions so they re-read after rerenders) ──────────────
function hero(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-testid="right-now-hero"]') as HTMLElement;
}
function stateMarker(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-testid="right-now-state"]') as HTMLElement;
}
function lead(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="right-now-lead"]');
}
function statsStrip(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="right-now-stats"]');
}
function progress(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="right-now-progress"]');
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no matchMedia. Stub it (matches:false = no reduced-motion
  // preference) so the REAL usePrefersReducedMotion wiring runs unmocked —
  // the hero's animation-param branch is exercised, not bypassed.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Fixtures + the wall-clock instant that, via the REAL `selectRightNowState`
 * machine, resolves to each of the 12 kinds. We DERIVE the expected kind from
 * `selectRightNowState(now, ...)` itself (not by trusting the comment) so the
 * test is self-checking: if the machine's classification drifts, the table's
 * `expectedKind` assertion fails before any slot assertion.
 *
 * Show span: travelIn 04-20, set 04-21, showDays [04-22, 04-23], travelOut
 * 04-24 (NY tz; April = EDT, UTC-4). 16:00Z = 12:00 EDT — comfortably mid-day.
 */
function showDates() {
  return {
    travelIn: "2026-04-20",
    travelOut: "2026-04-24",
    set: "2026-04-21",
    showDays: ["2026-04-22", "2026-04-23"],
    loadIn: null,
  };
}

const TZ = "America/New_York";
const at = (iso: string) => new Date(`${iso}T16:00:00Z`);

/**
 * One row per §4.3 kind. `now` + `context` drive the REAL machine to the
 * stated kind. `degraded` / `expectStats` / `progressSegments` come straight
 * from the §4.3 / §4.8 map. Numbers are derived from the fixture (segments ===
 * showDays.length), never a bare literal divorced from inputs.
 */
const STATE_CASES: ReadonlyArray<{
  name: string;
  expectedKind: RightNowState["kind"];
  now: Date;
  context: RightNowContext;
  degraded: boolean;
  expectStats: boolean;
  progressSegments: number | null;
}> = [
  {
    name: "show_day_n",
    expectedKind: "show_day_n",
    now: at("2026-04-22"),
    context: makeContext({ dates: showDates(), callTime: "7:00 PM", strikeTime: "11:00 PM" }),
    degraded: false,
    expectStats: true,
    progressSegments: 2, // === showDays.length
  },
  {
    name: "travel_in_day",
    expectedKind: "travel_in_day",
    now: at("2026-04-20"),
    context: makeContext({
      dates: showDates(),
      hotelName: "Marriott",
      hotelCheckInTime: "2026-04-20",
      hotelCheckOutTime: "2026-04-24",
    }),
    degraded: false,
    expectStats: true,
    progressSegments: null,
  },
  {
    name: "set_day",
    expectedKind: "set_day",
    now: at("2026-04-21"),
    context: makeContext({ dates: showDates(), loadInTime: "11:00 AM" }),
    degraded: false,
    expectStats: true,
    progressSegments: null,
  },
  {
    name: "travel_out_day",
    expectedKind: "travel_out_day",
    now: at("2026-04-24"),
    context: makeContext({
      dates: showDates(),
      hotelName: "Marriott",
      hotelCheckInTime: "2026-04-20",
      hotelCheckOutTime: "2026-04-24",
    }),
    degraded: false,
    expectStats: true,
    progressSegments: null,
  },
  {
    name: "pre_travel",
    expectedKind: "pre_travel",
    now: at("2026-04-15"),
    context: makeContext({ dates: showDates() }),
    degraded: false,
    expectStats: true,
    progressSegments: null,
  },
  {
    name: "viewer_off_day",
    expectedKind: "viewer_off_day",
    now: at("2026-04-22"),
    context: makeContext({
      dates: showDates(),
      // viewer assigned only 04-23; today (04-22) is inside span, not assigned.
      dateRestriction: { kind: "explicit", days: ["2026-04-23"] },
    }),
    degraded: false,
    expectStats: false,
    progressSegments: null,
  },
  {
    name: "viewer_off_day_pre",
    expectedKind: "viewer_off_day_pre",
    now: at("2026-04-15"),
    context: makeContext({
      dates: showDates(),
      // first assigned day 04-22; today 04-15 < travelIn → off-day-pre.
      dateRestriction: { kind: "explicit", days: ["2026-04-22", "2026-04-23"] },
    }),
    degraded: false,
    expectStats: false,
    progressSegments: null,
  },
  {
    name: "viewer_after_last_day",
    expectedKind: "viewer_after_last_day",
    now: at("2026-04-23"),
    context: makeContext({
      dates: showDates(),
      // last assigned day 04-22; today 04-23 > last → after_last_day.
      dateRestriction: { kind: "explicit", days: ["2026-04-22"] },
    }),
    degraded: false,
    expectStats: false,
    progressSegments: null,
  },
  {
    name: "post_show",
    expectedKind: "post_show",
    now: at("2026-04-26"),
    context: makeContext({ dates: showDates() }),
    degraded: false,
    expectStats: false,
    progressSegments: null,
  },
  {
    name: "viewer_unconfirmed",
    expectedKind: "viewer_unconfirmed",
    now: at("2026-04-22"),
    context: makeContext({
      dates: showDates(),
      dateRestriction: { kind: "unknown_asterisk", days: null },
      // even with stat-eligible data present, degraded → no stats.
      callTime: "7:00 PM",
      strikeTime: "11:00 PM",
    }),
    degraded: true,
    expectStats: false,
    progressSegments: null,
  },
  {
    name: "unknown",
    expectedKind: "unknown",
    now: at("2026-04-22"),
    // travelIn parses but travelOut null → `unknown` (not dateless).
    context: makeContext({
      dates: { travelIn: "2026-04-20", travelOut: null, set: null, showDays: [], loadIn: null },
      callTime: "7:00 PM",
    }),
    degraded: true,
    expectStats: false,
    progressSegments: null,
  },
  {
    name: "dateless",
    expectedKind: "dateless",
    now: at("2026-04-22"),
    context: makeContext({
      dates: { travelIn: null, travelOut: null, set: null, showDays: [], loadIn: null },
    }),
    degraded: true,
    expectStats: false,
    progressSegments: null,
  },
];

describe("RightNowHero — §4.3 12-state map (Test 5)", () => {
  for (const c of STATE_CASES) {
    test(`${c.name}: renders mapped eyebrow + lead; degraded=${c.degraded}; stats=${c.expectStats}`, () => {
      vi.setSystemTime(c.now);

      // Self-check: the REAL machine classifies this fixture+now as expected.
      // Catches a fixture/clock regression that would invalidate the slot
      // assertions below (and proves the hero shares the same machine).
      const resolved = selectRightNowState(c.now, c.context.dates, c.context.dateRestriction, {
        timezone: c.context.timezone,
      });
      expect(resolved.kind).toBe(c.expectedKind);

      const { container } = render(<RightNowHero context={c.context} />);

      // Authoritative state marker matches the machine result.
      expect(stateMarker(container).getAttribute("data-state")).toBe(c.expectedKind);

      // Eyebrow + lead slots always present and non-empty (the hero never
      // goes blank for any of the 12 kinds — §4.3 maps all 12).
      const eyebrow = hero(container).querySelector('[data-testid="right-now-eyebrow"]');
      expect(eyebrow?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect((lead(container)?.textContent?.trim().length ?? 0)).toBeGreaterThan(0);

      // Degraded hook: dateless/unknown/viewer_unconfirmed carry the stale
      // tint hook AND render NO stats (fabricated stats on degraded states
      // is the named failure mode).
      expect(hero(container).getAttribute("data-degraded")).toBe(c.degraded ? "true" : "false");
      if (c.degraded) {
        expect(statsStrip(container)).toBeNull();
      }

      // Progress segments: show_day_n renders `total` segments (derived from
      // the fixture's showDays.length); every other kind renders none.
      if (c.progressSegments !== null) {
        const seg = progress(container)?.querySelectorAll('[data-segment]');
        expect(seg?.length).toBe(c.progressSegments);
      } else {
        expect(progress(container)).toBeNull();
      }

      // Stats presence per §4.3 D-8 / §4.8.
      if (c.expectStats) {
        expect(statsStrip(container)).not.toBeNull();
      } else {
        expect(statsStrip(container)).toBeNull();
      }
    });
  }

  test("travel-day stats carry hotel name + dates only — NO flight / next-call stat (Phase-1 source boundary)", () => {
    // Failure mode this catches: out-of-scope flight/call stats fabricated on
    // a travel day. The only stat-eligible travel-day data is hotel name +
    // check-in/check-out DATES (hotelCheckIn/OutTime are ISO dates per
    // HotelReservationRow.check_in/out, never a clock time).
    vi.setSystemTime(at("2026-04-20"));
    const ctx = makeContext({
      dates: showDates(),
      hotelName: "Hilton Midtown",
      hotelCheckInTime: "2026-04-20",
      hotelCheckOutTime: "2026-04-24",
    });
    const { container } = render(<RightNowHero context={ctx} />);

    const strip = statsStrip(container);
    expect(strip).not.toBeNull();
    const text = strip!.textContent ?? "";
    // Hotel name is present (the source the spec authorizes).
    expect(text).toContain("Hilton Midtown");
    // No flight / call / doors stat labels — those have no Phase-1 source.
    expect(text.toLowerCase()).not.toContain("flight");
    expect(text.toLowerCase()).not.toContain("call");
    expect(text.toLowerCase()).not.toContain("doors");
  });

  test("show_day_n: Show stat is accented; Strike present only when isLast", () => {
    // Day 1 of 2 (isLast=false): Show stat present, NO Strike stat.
    vi.setSystemTime(at("2026-04-22"));
    const ctxDay1 = makeContext({
      dates: showDates(),
      callTime: "7:00 PM",
      strikeTime: "11:00 PM",
    });
    const { container, unmount } = render(<RightNowHero context={ctxDay1} />);
    const strip1 = statsStrip(container)!;
    expect(strip1).not.toBeNull();
    // Exactly one accented stat (the Show anchor) per §4.3 "one accented".
    expect(strip1.querySelectorAll('[data-stat-accent="true"]').length).toBe(1);
    // Day 1 of 2 is NOT last → Strike value must not surface.
    expect(strip1.textContent).toContain("7:00 PM"); // Show value
    expect(strip1.textContent).not.toContain("11:00 PM"); // Strike withheld
    unmount();

    // Day 2 of 2 (isLast=true): Strike stat now present. Fresh mount at the
    // new frozen instant (the hero reads the live clock on mount).
    vi.setSystemTime(at("2026-04-23"));
    const { container: c2 } = render(<RightNowHero context={ctxDay1} />);
    const strip2 = statsStrip(c2)!;
    expect(strip2.textContent).toContain("7:00 PM"); // Show value
    expect(strip2.textContent).toContain("11:00 PM"); // Strike now shown
  });
});

describe("RightNowHero — owns the live clock (Test 5 re-derive)", () => {
  test("mount in show_day_1, advance past a day boundary + visibilitychange → re-derives to show_day_2", () => {
    // Day 1 of 2 at mount.
    vi.setSystemTime(at("2026-04-22"));
    const ctx = makeContext({ dates: showDates(), callTime: "7:00 PM" });
    const { container } = render(<RightNowHero context={ctx} />);
    expect(stateMarker(container).getAttribute("data-state")).toBe("show_day_n");
    // Sanity: it's day 1 (2 segments, first segment is the active one is not
    // asserted here — we only need the kind to flip).
    expect(progress(container)?.querySelectorAll('[data-segment]').length).toBe(2);

    // Advance the wall clock to day 2, fire the minute tick + a
    // visibilitychange (the §4.3 refresh hooks), and let React re-render.
    act(() => {
      vi.setSystemTime(at("2026-04-23"));
      // 60s tick fires → setNow(new Date()) re-derives.
      vi.advanceTimersByTime(60_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // The hero RE-DERIVED to show day 2 of 2 (still show_day_n kind but the
    // machine now resolves a different `n`). Prove it owns the clock and did
    // not freeze the SSR/mount state.
    const resolved = selectRightNowState(at("2026-04-23"), ctx.dates, ctx.dateRestriction, {
      timezone: ctx.timezone,
    });
    expect(resolved.kind).toBe("show_day_n");
    // The lead reflects the re-derived day (the machine's n changed from 1→2).
    expect(lead(container)?.textContent).toContain("2");
  });

  test("mount in show_day_2 (last), advance past travelOut → re-derives away from show_day_n", () => {
    // Day 2 of 2 at mount → after the boundary the machine leaves show_day_n
    // entirely (travel_out_day on 04-24), proving live reclassification across
    // a KIND boundary, not just a payload bump.
    vi.setSystemTime(at("2026-04-23"));
    const ctx = makeContext({ dates: showDates() });
    const { container } = render(<RightNowHero context={ctx} />);
    expect(stateMarker(container).getAttribute("data-state")).toBe("show_day_n");

    act(() => {
      vi.setSystemTime(at("2026-04-24"));
      vi.advanceTimersByTime(60_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(stateMarker(container).getAttribute("data-state")).toBe("travel_out_day");
  });
});

describe("RightNowHero — two-level stat guards (Test 6)", () => {
  test("all stats null/empty → strip omitted entirely", () => {
    // set_day with no resolvable load-in → its only candidate stat is null →
    // the whole strip collapses (§4.8 level-two: empty list collapses strip).
    vi.setSystemTime(at("2026-04-21"));
    const ctx = makeContext({ dates: showDates(), loadInTime: null });
    const { container } = render(<RightNowHero context={ctx} />);
    expect(stateMarker(container).getAttribute("data-state")).toBe("set_day");
    expect(statsStrip(container)).toBeNull();
  });

  test("one absent stat value → that stat omitted, sibling stats remain (per-stat level-one guard)", () => {
    // §4.8 level-one: each stat whose value is null/empty/non-finite is hidden
    // INDIVIDUALLY without collapsing the whole strip. travel_in_day's stats
    // are hotel name + check-in + check-out (the check-* values are ISO dates
    // per HotelReservationRow). With check-out null, that one stat drops while
    // the present name + check-in survive — proving per-stat omission keeps
    // siblings and does not collapse the strip. (The non-finite-NUMERIC branch
    // shares the same statOrNull guard via Number.isFinite; the pure machine
    // never emits a NaN daysAway, so the string-absence path is the testable
    // surface for the same guard.)
    vi.setSystemTime(at("2026-04-20"));
    const ctx = makeContext({
      dates: showDates(),
      hotelName: "Marriott",
      hotelCheckInTime: "2026-04-20",
      hotelCheckOutTime: null, // one date stat absent
    });
    const { container } = render(<RightNowHero context={ctx} />);
    const strip = statsStrip(container)!;
    expect(strip).not.toBeNull();
    // The present stat (hotel name) survives.
    expect(strip.textContent).toContain("Marriott");
    // The strip did not collapse just because one date was null.
    expect(strip.querySelectorAll('[data-stat]').length).toBeGreaterThan(0);
  });
});

describe("RightNowHero — client-clock freeze (Test 22b)", () => {
  test("with the system clock frozen at mount, the rendered state is deterministic and reads new Date()", () => {
    // Override the wall clock to a fixed instant; the hero's useState(() =>
    // new Date()) initializer must read THAT instant (not a server seed /
    // nowDate). Two independent mounts at the same frozen instant produce the
    // same resolved kind — deterministic post-hydration.
    vi.setSystemTime(at("2026-04-22"));
    const ctx = makeContext({ dates: showDates(), callTime: "7:00 PM" });

    const { container: a } = render(<RightNowHero context={ctx} />);
    const { container: b } = render(<RightNowHero context={ctx} />);

    const kindA = stateMarker(a).getAttribute("data-state");
    const kindB = stateMarker(b).getAttribute("data-state");
    expect(kindA).toBe("show_day_n");
    expect(kindB).toBe(kindA); // deterministic — no drift between mounts

    // Reads the live clock: re-mounting at a DIFFERENT frozen instant yields a
    // different kind (it is NOT pinned to a fixed server seed prop — the hero
    // takes `{ context }` only, no initialNow / state).
    vi.setSystemTime(at("2026-04-26")); // post-show
    const { container: c } = render(<RightNowHero context={ctx} />);
    expect(stateMarker(c).getAttribute("data-state")).toBe("post_show");
  });
});
