// @vitest-environment jsdom
/**
 * tests/components/crew/crewPassReducedMotionInitial.test.tsx
 *
 * RETARGET (crew page redesign plan Task 9): this suite pinned `RightNowHero`,
 * which the pass replaces with its machinery carried over (spec §4.3), so it
 * follows the reduced-motion read there. The input changed shape (the pass
 * takes the server's props, `buildPassProps`), the failure mode did not.
 *
 * SCOPE, stated so the closeout does not overclaim: this suite uses
 * Testing Library's client-only `render()`. It proves nothing about SSR or
 * hydration and cannot: `usePrefersReducedMotion` returns `null` on the
 * server and on the first hydrating render BY DESIGN
 * (`lib/a11y/usePrefersReducedMotion.ts`'s documented return contract), and the pass treats
 * `null` as "animate at full duration". What it catches is a regression to
 * an event-only read, where a reduced-motion viewer keeps animating until
 * a preference CHANGE that may never arrive.
 *
 * 2026-06-11 bug-audit: framer-motion's `useReducedMotion()` misses the
 * INITIAL matchMedia value; it reports the preference only after a
 * matchMedia `change` event fires. A visitor who ALREADY has reduced motion
 * enabled when the page loads never gets a change event, so the surface
 * treated them as "unknown" and ran the 220ms crossfade at full duration.
 * This file pins the INITIAL-value path: matchMedia is stubbed to
 * `matches: true` BEFORE render and never fires a change event, exactly the
 * state framer's hook cannot see.
 *
 * No framer-motion mocking here (unlike crewPassRecovery.test.tsx):
 * the point is the real hook wiring from matchMedia to the surface.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CrewPass } from "@/components/crew/CrewPass";

import { passPropsFor, showData } from "./_passFixture";

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

const props = passPropsFor(showData());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pass: INITIAL prefers-reduced-motion value (no change event)", () => {
  test("pass: a user with reduced motion already on at first load is honored on mount", () => {
    stubMatchMedia(true);
    const { container } = render(<CrewPass {...props} />);
    const card = container.querySelector('[data-testid="crew-pass"]')!;
    // Pre-fix this read "unknown" (framer's hook returns null until a change
    // event), which maps to full-duration animation for a user who opted out.
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("true");
  });

  test("pass: a user without reduced motion resolves to 'false' on mount (not stuck on 'unknown')", () => {
    stubMatchMedia(false);
    const { container } = render(<CrewPass {...props} />);
    const card = container.querySelector('[data-testid="crew-pass"]')!;
    expect(card.getAttribute("data-prefers-reduced-motion")).toBe("false");
  });
});
