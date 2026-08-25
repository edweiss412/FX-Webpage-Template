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

/**
 * The LAYOUT's catch, not the page boundary, and the distinction is the whole point.
 *
 * `app/admin/layout.tsx:82` catches `AdminInfraError` from its own gate and renders this
 * surface; `app/admin/error.tsx` is the per-route boundary that catches a fault raised AFTER
 * the layout resolved. `admin-route-boundaries.spec.ts:24` exists to keep those apart, and it
 * reaches the page boundary by forcing the fault at `layer=page` — a layer selector this
 * spec's injector does not have.
 *
 * This injector fails the FIRST N requests of each client, and the first Supabase call in an
 * `/admin` request is the layout's gate. So the layout catch is the deterministic surface here.
 *
 * It is also the one the ledger row documents: `BL-ADMIN-LOADER-CI-TRANSIENT`'s first
 * occurrence records the failing page as "the whole page as 'Admin session unavailable'", which
 * is this component's heading. Two CI rounds were spent guessing at surfaces while the row
 * already named this one.
 */
const BOUNDARY_TESTID = "admin-layout-infra-error";

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

  // Why this file does not settle AC-5 by grepping the run's log for SUPABASE_UPSTREAM_RETRY.
  // It tried that first, and run 32804414458 showed why it cannot work: nine emits landed in
  // one green job, and three are provably not this spec's — two at 03:23:46 during
  // admin-changes-feed-layout, one at 03:24:04 during dev-capture, both windows outside this
  // test entirely. The code appearing in the log is satisfied by background faults alone, and
  // would still be satisfied if the injector here never fired.
  //
  // What these cases assert instead is page-observable and attributable to THIS request.
  //
  // What they deliberately do NOT assert is the exact retry budget. An earlier revision tried
  // to pin MAX_SUPABASE_RETRIES = 2 with a 1/2/3-fault differential, on the assumption that a
  // forced count is spent by ONE request. It is not: the injector's counter belongs to the
  // CLIENT and is shared by every request that client makes, and app/admin/layout.tsx:77 issues
  // three in one Promise.all. Run 32806860141 is the disproof — many distinct `fn` values each
  // at `attempt: 1`, the budget spread thin, no single request reliably exhausting. The exact
  // budget is pinned where it can be: retryingFetch.test.ts, with injected timers and exact
  // call counts.
  test("two forced faults are absorbed and the page still renders", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS, "x-test-force-upstream-502": "2" });

    await page.goto("/admin");

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId(BOUNDARY_TESTID)).toHaveCount(0);
  });

  // The other side of the consequence bound: absorbed OR signaled, never silently wrong. A
  // fault that outlasts the budget must still reach the recorded surface rather than hang or
  // quietly succeed.
  //
  // 50 rather than 3 because of the shared-counter finding above: every request the layout
  // makes must run out of attempts, so the count has to cover all of them, not one. This asserts
  // that a persistent fault SURFACES — it makes no claim about how many retries preceded it.
  test("a fault that outlasts the budget reaches the recorded failure surface", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS, "x-test-force-upstream-502": "50" });

    await page.goto("/admin");

    // Asserting a surface is PRESENT is also what makes the two absorbed cases mean anything:
    // their toHaveCount(0) would pass just as happily against a testid that never existed.
    await expect(page.getByTestId(BOUNDARY_TESTID)).toBeVisible();
    await expect(page.getByText(BOUNDARY_COPY).first()).toBeVisible();
  });
});
