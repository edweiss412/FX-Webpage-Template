// @vitest-environment jsdom
/**
 * tests/components/RightNowCardReducedMotionInitial.test.tsx
 *
 * 2026-06-11 bug-audit: framer-motion's `useReducedMotion()` misses the
 * INITIAL matchMedia value — it reports the preference only after a
 * matchMedia `change` event fires. A visitor who ALREADY has reduced motion
 * enabled when the page loads never gets a change event, so RightNowCard
 * treated them as "unknown" and ran the 220ms crossfade at full duration.
 * PageTransition (M12.11) fixed the identical bug with a matchMedia-on-mount
 * hook; RightNowCard never adopted it. This file pins the INITIAL-value path:
 * matchMedia is stubbed to `matches: true` BEFORE render and never fires a
 * change event — exactly the state framer's hook cannot see.
 *
 * No framer-motion mocking here (unlike RightNowCardRecovery.test.tsx):
 * the point is the real hook wiring from matchMedia to the surface.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RightNowCard } from "@/components/right-now/RightNowCard";

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
  timezone: "America/New_York",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RightNowCard — INITIAL prefers-reduced-motion value (no change event)", () => {
  test("user with reduced motion already on at first load is honored on mount", () => {
    stubMatchMedia(true);
    const { container } = render(<RightNowCard context={ctx} />);
    const card = container.querySelector('[data-testid="right-now-card"]')!;
    // Pre-fix this read "unknown" (framer's hook returns null until a change
    // event), which maps to full-duration animation for a user who opted out.
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("true");
  });

  test("user without reduced motion resolves to 'false' on mount (not stuck on 'unknown')", () => {
    stubMatchMedia(false);
    const { container } = render(<RightNowCard context={ctx} />);
    const card = container.querySelector('[data-testid="right-now-card"]')!;
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("false");
  });
});
