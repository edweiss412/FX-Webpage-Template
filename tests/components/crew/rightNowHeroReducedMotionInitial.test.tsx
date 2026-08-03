// @vitest-environment jsdom
/**
 * tests/components/crew/rightNowHeroReducedMotionInitial.test.tsx
 *
 * RETARGET (2026-08-03): retargeted from the retired card onto the live
 * `RightNowHero`, which carries this machinery verbatim. Here the retarget
 * IS a root-testid swap, which is exactly why the commit carries a
 * mutation proof instead of a RED: with the code already correct, nothing
 * in the test alone can fail, and a green that only proves two hooks share
 * a name is not coverage.
 *
 * SCOPE, stated so the closeout does not overclaim: this suite uses
 * Testing Library's client-only `render()`. It proves nothing about SSR or
 * hydration and cannot — `usePrefersReducedMotion` returns `null` on the
 * server and on the first hydrating render BY DESIGN
 * (`lib/a11y/usePrefersReducedMotion.ts`'s documented return contract), and the hero treats
 * `null` as "animate at full duration". What it catches is a regression to
 * an event-only read, where a reduced-motion viewer keeps animating until
 * a preference CHANGE that may never arrive.
 *
 * 2026-06-11 bug-audit: framer-motion's `useReducedMotion()` misses the
 * INITIAL matchMedia value — it reports the preference only after a
 * matchMedia `change` event fires. A visitor who ALREADY has reduced motion
 * enabled when the page loads never gets a change event, so the hero
 * treated them as "unknown" and ran the 220ms crossfade at full duration.
 * PageTransition (M12.11) fixed the identical bug with a matchMedia-on-mount
 * hook, which this surface never adopted. This file pins the INITIAL-value path:
 * matchMedia is stubbed to `matches: true` BEFORE render and never fires a
 * change event — exactly the state framer's hook cannot see.
 *
 * No framer-motion mocking here (unlike rightNowHeroRecovery.test.tsx):
 * the point is the real hook wiring from matchMedia to the surface.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RightNowHero } from "@/components/crew/RightNowHero";

function stubMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return mql;
}

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
  showAnchors: [] as import("@/lib/crew/resolveKeyTimes").ShowAnchor[],
  timezone: "America/New_York",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RightNowHero — INITIAL prefers-reduced-motion value (no change event)", () => {
  test("user with reduced motion already on at first load is honored on mount", () => {
    stubMatchMedia(true);
    const { container } = render(<RightNowHero context={ctx} />);
    const card = container.querySelector('[data-testid="right-now-hero"]')!;
    // Pre-fix this read "unknown" (framer's hook returns null until a change
    // event), which maps to full-duration animation for a user who opted out.
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("true");
  });

  test("user without reduced motion resolves to 'false' on mount (not stuck on 'unknown')", () => {
    stubMatchMedia(false);
    const { container } = render(<RightNowHero context={ctx} />);
    const card = container.querySelector('[data-testid="right-now-hero"]')!;
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("false");
  });
});
