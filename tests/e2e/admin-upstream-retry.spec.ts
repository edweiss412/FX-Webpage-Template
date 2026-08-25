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

import { getRequiredDougFacing } from "@/lib/messages/lookup";

import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const FORCE_HEADERS = {
  // One synthetic 502, then the real transport. The wrapper's budget is two retries, so a
  // single injected fault must be absorbed entirely.
  "x-test-force-upstream-502": "1",
  authorization: "Bearer fxav-m3-test-auth-2026-DO-NOT-SHIP",
} as const;

/**
 * What the boundary RENDERS, which is not what the failure LOGS.
 *
 * The first version of this file hardcoded ADMIN_SESSION_LOOKUP_FAILED's copy, and CI showed
 * the difference: the exhausted case threw, the page errored six times over, and the string
 * never appeared, because `app/admin/error.tsx:31` renders ADMIN_ROUTE_LOAD_FAILED. The log
 * code and the rendered code are different codes for the same event.
 *
 * Imported rather than hardcoded, matching `admin-route-boundaries.spec.ts:50` — a literal
 * would pass this file while disagreeing with the catalog.
 */
const BOUNDARY_COPY = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");
const BOUNDARY_TESTID = "admin-route-error-boundary";

test.describe("admin gate absorbs a forced upstream 502", () => {
  test("the admin page renders through an injected gateway fault", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS });

    await page.goto("/admin");

    // The page renders normally. Without the retry the admin gate would throw and this would
    // be the error boundary instead — which is precisely the recorded failure mode.
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId(BOUNDARY_TESTID)).toHaveCount(0);
  });

  // The budget's exact boundary, and the reason this file does not settle AC-5 by grepping the
  // run's log for SUPABASE_UPSTREAM_RETRY. It tried that first, and run 32804414458 showed why
  // it cannot work: nine emits landed in one green job, and three of them are provably not this
  // spec's — two at 03:23:46 during admin-changes-feed-layout, one at 03:24:04 during
  // dev-capture, both windows outside this test entirely. The code appearing in the log is
  // therefore satisfied by background faults alone, and would still be satisfied if the
  // injector here never fired.
  //
  // These two cases settle it from page-observable behavior instead. The wrapper takes
  // MAX_SUPABASE_RETRIES = 2 retries, so it makes three attempts in total: two forced faults
  // are absorbed on the third attempt, and three exhaust the budget and replay the first
  // attempt's 502, which is the recorded failure mode. Neither case can pass without the retry
  // running the exact number of times claimed — a wrapper that never retried would fail the
  // absorbed case, and one that retried more would fail the exhausted case.
  test("two forced faults are absorbed on the last attempt the budget allows", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS, "x-test-force-upstream-502": "2" });

    await page.goto("/admin");

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId(BOUNDARY_TESTID)).toHaveCount(0);
  });

  test("three forced faults exhaust the budget and reach the error boundary", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS, "x-test-force-upstream-502": "3" });

    await page.goto("/admin");

    // Asserting the boundary is PRESENT is also what makes the other two cases mean anything:
    // their toHaveCount(0) would pass just as happily against a misspelled selector.
    await expect(page.getByTestId(BOUNDARY_TESTID)).toBeVisible();
    await expect(page.getByText(BOUNDARY_COPY).first()).toBeVisible();
  });
});
