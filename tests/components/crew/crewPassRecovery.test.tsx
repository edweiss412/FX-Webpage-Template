// @vitest-environment jsdom
/**
 * The machinery the pass carries from `RightNowHero` (crew page redesign spec
 * §4.3: "keeps all of its machinery"; plan Task 9, "the `rightNowHero*` Vitest
 * suites migrate to the pass").
 *
 * Retargeted from tests/components/crew/rightNowHero.test.tsx (the live clock
 * and the client-clock freeze), rightNowHeroRecovery.test.tsx (the `lastGood`
 * morph and its unwind) and rightNowHeroReducedMotionInitial.test.tsx (the
 * INITIAL reduced-motion value). The failure modes are the same; only the input
 * changed shape: the pass takes the server's props (`buildPassProps`), so a sync
 * error that breaks the dates reaches it as `mode: "degraded"` props, where the
 * hero saw a `RightNowContext` with partial dates.
 *
 * The anti-`lastGood` guarantee survives the move: the recovered render carries
 * a show start (9:45 AM) that no earlier render had, so a stuck-on-lastGood pass
 * cannot satisfy it.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CrewPass } from "@/components/crew/CrewPass";
import type { PassProps } from "@/lib/crew/passModel";
import { DATES, at, crewViewer, passPropsFor, renderHome, showData } from "./_passFixture";

const SHOW_DAY_1 = DATES.showDays[0]!;
const SHOW_DAY_2 = DATES.showDays[1]!;

const pass = () => screen.getByTestId("crew-pass");
const marker = () => screen.getByTestId("crew-pass-state");
const bigTime = () =>
  pass().querySelector(
    '[data-testid="crew-pass-body"]:not([data-exiting]) [data-testid="crew-pass-big-time"]',
  );

/** The show with day 1's start rewritten, so two renders carry different times. */
function withDay1Start(start: string): PassProps {
  const data = showData();
  return passPropsFor({
    ...data,
    runOfShow: {
      ...data.runOfShow,
      [SHOW_DAY_1]: { entries: [], showStart: start, showEnd: null, window: null },
    },
  });
}

const unknownProps = () =>
  passPropsFor(
    showData({ dates: { travelIn: DATES.travelIn, set: null, showDays: [], travelOut: null } }),
  );
const datelessProps = () =>
  passPropsFor(showData({ dates: { travelIn: null, set: null, showDays: [], travelOut: null } }));

const reducedMotion = vi.hoisted(() => ({ value: false as boolean | null }));
vi.mock("@/lib/a11y/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => reducedMotion.value,
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(at(SHOW_DAY_1, "12:00"));
  reducedMotion.value = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("pass: the lastGood morph unwinds on recovery", () => {
  for (const [name, degraded] of [
    ["unknown", unknownProps],
    ["dateless", datelessProps],
  ] as const) {
    test(`pass: show_day_n → ${name} → show_day_n: the stale tint clears and the NEW body renders`, () => {
      const { rerender } = render(<CrewPass {...withDay1Start("7:30am")} />);
      expect(marker()).toHaveAttribute("data-state", "show_day_n");
      expect(pass()).toHaveAttribute("data-stale", "false");
      expect(bigTime()).toHaveTextContent("7:30 AM");

      // Degrade: a refresh whose dates no longer parse arrives as degraded props.
      const degradedProps = degraded();
      expect(degradedProps.mode).toBe("degraded");
      rerender(<CrewPass {...degradedProps} />);
      expect(marker()).toHaveAttribute("data-state", name);
      // morph-to-last-good: the previous body stays on screen under the stale tint.
      expect(marker()).toHaveAttribute("data-rendered-state", "show_day_n");
      expect(pass()).toHaveAttribute("data-stale", "true");
      expect(bigTime()).toHaveTextContent("7:30 AM");

      // Recover, with a start no earlier render carried.
      rerender(<CrewPass {...withDay1Start("9:45am")} />);
      expect(marker()).toHaveAttribute("data-state", "show_day_n");
      expect(marker()).toHaveAttribute("data-rendered-state", "show_day_n");
      expect(pass()).toHaveAttribute("data-stale", "false");
      expect(bigTime()).toHaveTextContent("9:45 AM");
      expect(bigTime()).not.toHaveTextContent("7:30 AM");
    });
  }
});

describe("pass: owns the live clock", () => {
  test("pass: past a day boundary plus visibilitychange, the live body re-derives to the next show day", () => {
    render(<CrewPass {...passPropsFor(showData())} />);
    expect(screen.getByTestId("crew-pass-eyebrow")).toHaveTextContent(
      `Show day 1 of ${DATES.showDays.length}`,
    );
    act(() => {
      vi.setSystemTime(at(SHOW_DAY_2, "12:00"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(marker()).toHaveAttribute("data-state", "show_day_n");
    expect(screen.getByTestId("crew-pass-eyebrow")).toHaveTextContent(
      `Show day 2 of ${DATES.showDays.length}`,
    );
    // The new day's own start, never day 1's (no stale freeze).
    expect(bigTime()).toHaveTextContent("8:15 AM");
    expect(bigTime()).not.toHaveTextContent("7:30 AM");
  });

  test("pass: the 60-second tick alone re-derives the state", () => {
    render(<CrewPass {...passPropsFor(showData())} />);
    expect(marker()).toHaveAttribute("data-state", "show_day_n");
    act(() => {
      vi.setSystemTime(at(DATES.travelOut!, "11:59"));
      vi.advanceTimersByTime(60_000);
    });
    expect(marker()).toHaveAttribute("data-state", "travel_out_day");
  });

  test("pass: with the system clock frozen at mount, the rendered state is deterministic and reads new Date()", () => {
    vi.setSystemTime(at(DATES.set!, "12:00"));
    render(<CrewPass {...passPropsFor(showData())} />);
    expect(marker()).toHaveAttribute("data-state", "set_day");
  });

  test("pass: degraded props render without a clock: the server's state, whatever the instant", () => {
    const props = passPropsFor(showData({ restriction: { kind: "unknown_asterisk", days: null } }));
    for (const instant of [
      at("2026-01-01", "12:00"),
      at(SHOW_DAY_1, "12:00"),
      at("2027-06-01", "12:00"),
    ]) {
      cleanup();
      vi.setSystemTime(instant);
      render(<CrewPass {...props} />);
      expect(marker()).toHaveAttribute("data-state", "viewer_unconfirmed");
    }
  });
});

describe("pass: prefers-reduced-motion", () => {
  test("pass: under reduced motion a day switch keeps one body and swaps its content in place", () => {
    const bodies = () => [...document.querySelectorAll('[data-testid="crew-pass-body"]')];
    const tap = (iso: string) =>
      fireEvent.click(
        screen.getAllByTestId("crew-day-button").find((b) => b.getAttribute("data-day") === iso)!,
      );
    for (const reduce of [true, false]) {
      cleanup();
      reducedMotion.value = reduce;
      const data = showData();
      renderHome(data, crewViewer, <CrewPass {...passPropsFor(data)} />);
      tap(SHOW_DAY_2);
      expect(pass()).toHaveAttribute("data-selection", `day:${SHOW_DAY_2}`);
      if (reduce) {
        expect(bodies()).toHaveLength(1);
        expect(bodies()[0]).toHaveAttribute("data-body", `day:${SHOW_DAY_2}`);
        expect(bodies()[0]).toHaveTextContent(`Show day 2 of ${DATES.showDays.length}`);
      } else {
        // POSITIVE CONTROL: with motion, the outgoing body is still mounted, fading.
        expect(bodies()).toHaveLength(2);
        expect(bodies().filter((b) => b.hasAttribute("data-exiting"))).toHaveLength(1);
      }
    }
  });

  test("pass: data-prefers-reduced-motion reflects the hook's true, false and unknown", () => {
    for (const [value, expected] of [
      [true, "true"],
      [false, "false"],
      [null, "unknown"],
    ] as const) {
      cleanup();
      reducedMotion.value = value;
      render(<CrewPass {...passPropsFor(showData())} />);
      expect(pass()).toHaveAttribute("data-prefers-reduced-motion", expected);
    }
  });
});
