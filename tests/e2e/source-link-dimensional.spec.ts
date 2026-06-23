/**
 * tests/e2e/source-link-dimensional.spec.ts — real-browser dimensional-invariant
 * gate for the header SourceLink (tile → source-sheet deep links, spec §5.4).
 *
 * INVARIANT (spec §5.4, mandatory): the `SourceLink` rendered in a SectionCard's
 * HEADER `action` slot must NOT change the height of any data row. The link lives
 * in the header band (right-aligned, `shrink-0`, `h-fit`); a regression — e.g. it
 * stretching its flex parent, or a row losing `shrink-0` so the header forces a
 * reflow — would change a body row's measured height.
 *
 * WHY A REAL BROWSER (jsdom is insufficient): this project's Tailwind v4 does NOT
 * default `.flex` to `align-items: stretch` (AGENTS.md / DESIGN §7). A
 * stretch/shrink regression in the header→body relationship passes every jsdom
 * unit test and only surfaces in a real layout engine. This suite reads
 * `getBoundingClientRect().height` against the live render.
 *
 * HARNESS (plan-R4 finding 1 — explicit control render):
 * `/admin/dev/source-link-dim` (app/admin/dev/source-link-dim/page.tsx) mounts the
 * four measured primitives TWICE with IDENTICAL props — once inside a SectionCard
 * with `action={<SourceLink/>}` (`[data-testid=card-with-link]`), once with
 * `action={undefined}` (`[data-testid=card-no-link]`). Each measured row carries a
 * stable testid: `dim-personrow`, `dim-factrow`, `dim-kvrow`, `dim-keytime`. The
 * control render means the spec does NOT depend on app seed data or the global
 * Task-9 card wiring.
 *
 * ANTI-TAUTOLOGY: the spec measures the ROWS (present in BOTH containers under the
 * same testid), NEVER the link element. A row's height is the thing-under-test;
 * the link is the variable whose presence must not perturb it. Because both cards
 * receive identical children, any per-row delta is attributable ONLY to the
 * header link's presence.
 *
 * ── Project wiring ────────────────────────────────────────────────────────────
 * Runs in the `desktop-chromium` project (port-3000 webServer, baseURL
 * http://127.0.0.1:3000). That webServer is started with ADMIN_DEV_PANEL_ENABLED=
 * true (playwright.config.ts), so the dev-gated harness route is present in the
 * artifact. NOTE: this is intentionally NOT the `dev-build` project — that project
 * (port 3001) targets only `admin-dev.spec.ts`; the dev-flag-on port-3000 server
 * is the correct host at the brief's stated baseURL (127.0.0.1:3000), and it
 * carries the ENABLE_TEST_AUTH + TEST_AUTH_SECRET pair signInAs() needs.
 *
 * AUTH: although the harness page itself does NOT call requireAdmin(), it lives
 * under `app/admin/`, and `app/admin/layout.tsx` calls requireAdminIdentity({
 * layer: "layout" }) for EVERY /admin/* route (app/admin/layout.tsx:54). An
 * unauthenticated visit therefore 307s to /auth/sign-in. So this spec signs in as
 * ADMIN_FIXTURE first (same pattern as admin-dev.spec.ts / crew-layout-dimensions
 * .spec.ts) before navigating to the harness.
 *
 * The ONLY hardcoded number is the ±0.5px tolerance; the expected height for each
 * row is DERIVED from the measured no-link rect (anti-hardcode discipline).
 */
import { test, expect, type Locator } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const HARNESS_PATH = "/admin/dev/source-link-dim";

/** Per-row equal-height tolerance (px). §5.4 mandates ≤ 0.5px. */
const TOL = 0.5;

/** The four measured row testids (present in BOTH containers). */
const ROW_TESTIDS = ["dim-personrow", "dim-factrow", "dim-kvrow", "dim-keytime"] as const;

async function heightOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.getBoundingClientRect().height);
}

test.describe("SourceLink header does not change row heights (spec §5.4)", () => {
  // Cold first-hit render of the harness compiles a small module graph; budget
  // for it. Reads themselves are sub-second once warm.
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    // The /admin/* layout gate (requireAdminIdentity) 307s unauthenticated
    // visitors to sign-in, so authenticate as the admin fixture first.
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);

    const res = await page.goto(HARNESS_PATH, { waitUntil: "domcontentloaded" });
    expect(
      res?.status(),
      `dev harness ${HARNESS_PATH} must render 200 (requires ADMIN_DEV_PANEL_ENABLED=true at build time + admin session)`,
    ).toBe(200);
    // Both control containers must mount before any measurement.
    await expect(page.getByTestId("card-with-link")).toBeVisible();
    await expect(page.getByTestId("card-no-link")).toBeVisible();
  });

  test("each data row has the same height with and without the header SourceLink", async ({
    page,
  }) => {
    // Prove the link is actually present in the with-link card (otherwise the
    // whole comparison is vacuous — both cards would be no-link controls).
    const link = page
      .getByTestId("card-with-link")
      .locator("[data-slot=section-card-action] [data-slot=source-link]");
    await expect(
      link,
      "the with-link card MUST render the header SourceLink (else the test is vacuous)",
    ).toBeVisible();
    // And the control card must NOT render one.
    await expect(
      page
        .getByTestId("card-no-link")
        .locator("[data-slot=section-card-action] [data-slot=source-link]"),
      "the no-link control card MUST NOT render a SourceLink",
    ).toHaveCount(0);

    const withCard = page.getByTestId("card-with-link");
    const noCard = page.getByTestId("card-no-link");

    for (const testid of ROW_TESTIDS) {
      const withRow = withCard.getByTestId(testid);
      const noRow = noCard.getByTestId(testid);

      // Both rows must exist + be laid out (non-zero height) so a tautological
      // 0 === 0 cannot pass.
      await expect(withRow, `${testid} must exist in the with-link card`).toBeVisible();
      await expect(noRow, `${testid} must exist in the no-link card`).toBeVisible();

      const withH = await heightOf(withRow);
      const noH = await heightOf(noRow);

      expect(
        withH,
        `${testid} with-link height must be laid out (>0); got ${withH}`,
      ).toBeGreaterThan(0);
      expect(noH, `${testid} no-link height must be laid out (>0); got ${noH}`).toBeGreaterThan(0);

      // The invariant: the header SourceLink must not change this row's height.
      // Expected = the no-link (control) height; tolerance ±0.5px.
      expect(
        Math.abs(withH - noH),
        `${testid}: header SourceLink changed the row height (spec §5.4). withLink=${withH} noLink=${noH} Δ=${Math.abs(
          withH - noH,
        ).toFixed(3)}px > ${TOL}px`,
      ).toBeLessThanOrEqual(TOL);
    }
  });
});
