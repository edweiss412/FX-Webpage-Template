// Spec: docs/superpowers/specs/2026-08-03-nojs-loading-shell-notice-design.md §7.2
//
// A visitor with JavaScript disabled never leaves a route's loading skeleton:
// React streams the real content into a `hidden` div and reveals it with an
// inline `$RC()` call that cannot run. LoadingShell's <noscript> block says so,
// and its scoped <style> hides the shell so nothing pretends to still be
// loading. jsdom cannot evaluate <noscript> semantics -- scripting is always
// "enabled" there, so a <noscript>-scoped rule never applies, and React's client
// renderer leaves the subtree empty besides. (Its CSS support is not the gap: it
// does compute display:none from a stylesheet-backed rule.) So this is the only
// place the behavior is actually observed.
//
// TWO describe blocks, each with its own test.use. NEVER a file-scoped one — a
// file-scoped `javaScriptEnabled: false` would silently apply to the JS-on
// control too, testing the same configuration twice.
//
// Runs on desktop-chromium (playwright.config.ts) AND is named explicitly in
// .github/workflows/admin-layout-e2e.yml. Both registrations are required.
// Most Playwright workflows here pass an explicit spec-file list -- 8 of the 11
// that invoke `playwright test`; the exceptions (standalone-e2e, help-affordances,
// dev-gate-e2e) run whole configs or projects, and desktop-chromium is in none of
// them. So a spec present only in `testMatch` executes on no CI job at all. That
// is how this test's predecessor sat failing on main from M12.11 until it was
// deleted. A third registration is also required: a reasoned row in
// tests/ci/_metaE2eWorkflowCoverage.test.ts, because the coverage scanner treats
// a path-filtered workflow as not PR-blocking-capable.
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";

const LOADING = "admin-dashboard-loading";
const NOTICE = "loading-nojs-notice";

test.describe("JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("the admin route serves its loading fallback and cannot resolve it", async ({ page }) => {
    // signInAs POSTs through page.request, not browser JS, so it works with
    // scripting disabled (tests/e2e/helpers/signInAs.ts).
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin", { waitUntil: "commit" });

    // Pins the route. /admin can resolve to a checkpoint or onboarding branch,
    // so without this the assertions below could be measuring another page.
    await expect(page.getByTestId(LOADING)).toBeAttached();
  });

  test("shows the notice", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin", { waitUntil: "commit" });

    // Visibility, not attachment: this also proves the notice is not itself
    // caught by the hide rule.
    await expect(page.getByTestId(NOTICE)).toBeVisible();
    await expect(page.getByTestId(NOTICE)).toContainText("JavaScript is required");
  });

  test("hides the skeleton, so nothing pretends to still be loading", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin", { waitUntil: "commit" });

    // The one assertion that proves the <noscript> <style> actually applied.
    // The notice being visible does not: the rule could be absent entirely and
    // the notice would still show, with the shimmer beneath it. Scoped through
    // the admin testId so a stray wrapper elsewhere cannot satisfy it.
    //
    // toBeAttached() FIRST, and it is not decoration. Playwright reports a
    // locator that matches nothing as hidden, so `toBeHidden()` alone passes
    // against a LoadingShell with no wrapper at all — verified 2026-08-03 by
    // reverting the component and watching this case stay green while its two
    // siblings failed. Requiring the wrapper to exist AND be invisible is what
    // makes it a test.
    const shell = page.getByTestId(LOADING).locator("[data-loading-shell-content]");
    await expect(shell).toBeAttached();
    await expect(shell).toBeHidden();
  });
});

test.describe("JavaScript enabled (control)", () => {
  test.use({ javaScriptEnabled: true });

  test("never shows the notice to a visitor who has JavaScript", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin", { waitUntil: "commit" });

    // Read at commit, before anything can have settled...
    await expect(page.getByTestId(NOTICE)).toHaveCount(0);

    // ...and again once the fallback has been replaced by the real dashboard.
    // The fallback's disappearance is a positive edge, not a timeout.
    await expect(page.getByTestId(LOADING)).toHaveCount(0);
    await expect(page.getByTestId(NOTICE)).toHaveCount(0);

    // The server sent the notice markup regardless — it is the browser that
    // declines to materialize <noscript> contents. Asserting both halves is
    // what makes the counts above evidence rather than an absence of markup.
    const html = await (await page.request.get("/admin")).text();
    expect(html).toContain(NOTICE);

    // Deliberately NOT asserted here: "the fallback was attached and the notice
    // count was 0 at that instant." That would be the strongest form, but it is
    // unobservable — measured 2026-08-03, /admin resolves before any assertion
    // can poll, so `toBeAttached()` on the fallback fails with JS on. The
    // failure mode it would guard (a notice rendered OUTSIDE <noscript>, visible
    // during load and gone by settle) is instead caught deterministically by the
    // component test's first assertion, which requires the notice to be absent
    // from the non-<noscript> half of the server markup. See spec §7.2.
  });
});
