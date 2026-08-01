// @vitest-environment jsdom
/**
 * tests/cross-cutting/rtlAutoCleanup.test.tsx
 *
 * Pins that React Testing Library's cleanup runs between tests.
 *
 * WHY THIS EXISTS: RTL registers its own auto-cleanup only when a GLOBAL
 * `afterEach` is present. This suite runs with `globals: false`
 * (vitest.config.ts:69), so RTL's registration silently no-ops and every
 * `render()` leaves its tree mounted for the remainder of the file. All 412
 * RTL-importing test files were in that state, and none registered cleanup
 * themselves.
 *
 * A mounted tree can still hold scheduled React work. On a fast enough runner
 * that callback lands after the jsdom environment is torn down and throws
 * `ReferenceError: window is not defined` inside
 * `scheduler.performWorkUntilDeadline`; vitest surfaces it as an unhandled
 * error and fails the job while EVERY assertion passes — a green-tests/red-job
 * symptom that is expensive to diagnose, on `unit-suite`, which is a required
 * merge gate. Filed as BL-TEST-FLOW8REPICK-ASYNC-LEAK, first reproduced by the
 * Namespace runner trial (PR #514, run 29754822376).
 *
 * The fix is the guarded `afterEach(cleanup)` in tests/setup.ts. This file is
 * its regression pin: delete that block and the second test below fails.
 *
 * ANTI-TAUTOLOGY: the assertion reads `document.body`, the thing teardown
 * actually mutates — not a spy on `cleanup`, which would pass whether or not
 * unmounting occurred. The two tests are order-dependent BY DESIGN: the first
 * establishes that a tree really mounted (so the second is not vacuously
 * green against a render that never happened), the second observes the state
 * the NEXT test inherits.
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

function Probe() {
  return <div data-testid="rtl-cleanup-probe">mounted</div>;
}

describe("RTL auto-cleanup is registered despite globals:false", () => {
  test("a render mounts exactly one container into document.body", () => {
    render(<Probe />);
    // Anti-vacuity: proves the render really landed, so the next test is
    // observing teardown rather than an empty body that was never populated.
    expect(document.body.childElementCount).toBe(1);
    expect(document.querySelector('[data-testid="rtl-cleanup-probe"]')).not.toBeNull();
  });

  test("the next test inherits a CLEAN body — the previous tree was unmounted", () => {
    expect(document.body.childElementCount).toBe(0);
    expect(document.querySelector('[data-testid="rtl-cleanup-probe"]')).toBeNull();
  });
});
