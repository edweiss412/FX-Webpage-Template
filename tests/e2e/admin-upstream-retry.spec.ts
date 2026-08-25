/**
 * tests/e2e/admin-upstream-retry.spec.ts — AC-5 of the transient-502 spec.
 *
 * The deterministic proof, on the real runner, that the retry absorbs the recorded fault.
 *
 * Why deterministic rather than statistical: at the measured red rate, waiting for a natural
 * occurrence is not a reproducer and cannot be scheduled. A CI-only forced fault makes the
 * runner produce the mechanism on demand.
 *
 * The injector (lib/supabase/server.ts, search maybeForceUpstreamFaults) WRAPS the real fetch
 * and delegates after N, gated exactly as `x-test-force-infra-fail` is — ENABLE_TEST_AUTH, a
 * real TEST_AUTH_SECRET, the matching Bearer header, and this request-scoped header. It never
 * short-circuits the wrapper: if it returned success directly, this spec could pass without a
 * retry ever running, which is the tautology AC-5 exists to avoid.
 */
import { test, expect } from "@playwright/test";

import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const FORCE_HEADERS = {
  // One synthetic 502, then the real transport. The wrapper's budget is two retries, so a
  // single injected fault must be absorbed entirely.
  "x-test-force-upstream-502": "1",
  authorization: "Bearer fxav-m3-test-auth-2026-DO-NOT-SHIP",
} as const;

test.describe("admin gate absorbs a forced upstream 502", () => {
  test("the admin page renders through an injected gateway fault", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS });

    await page.goto("/admin");

    // The page renders normally. Without the retry the admin gate would throw and this would
    // be the error boundary instead — which is precisely the recorded failure mode.
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("This admin page couldn't load")).toHaveCount(0);

    // AND the fault was actually ABSORBED rather than never injected. The first version of
    // this spec asserted only the render, and CI proved that insufficient: the run went green
    // with no SUPABASE_UPSTREAM_RETRY anywhere, because the emit did not exist yet. A render
    // assertion alone passes when the injector misfires, so the arc verifies the emit from the
    // run's own server output — see the AC-5 evidence step in the plan's Task 7.
  });
});
