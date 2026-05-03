/**
 * Playwright E2E suite for /show/[slug] — Task 4.2 layout shell (M4 plan
 * lines 188-194). Failing-first test per AGENTS.md §1.1 (TDD per task).
 *
 * What this asserts (Task 4.2 baseline only — full §8.4 dimensional invariants
 * are Task 4.13's job):
 *
 *   1. Page renders for a seeded slug at the mobile-primary viewport
 *      (390x667, the `mobile-safari` project default per playwright.config.ts).
 *   2. Five `data-testid` markers are present and visible:
 *        - page-shell           outer container
 *        - page-container       max-width content container (Task 4.13 width invariant)
 *        - right-now-card       slot for the RightNow card (Task 4.11)
 *        - tile-grid            responsive tile-grid container
 *        - page-footer          footer (Task 4.13 footer invariant)
 *   3. The tile grid resolves to a 2-column `grid-template-columns` at
 *      mobile width, matching the §8.4 contract (mobile <640px = 2 cols).
 *
 * Slug source: the seed corpus (supabase/seed.ts) loads the 10 fixtures in
 * fixtures/shows/raw/ on every `pnpm db:seed` run and writes deterministic
 * slugs derived via lib/parser/slug.ts. The Waldorf fixture
 * (`2026-04-asset-mgmt-cfo-coo-waldorf.md`) lands at the slug below — the
 * helper looks it up via service-role at test start so a re-seed with a
 * different ASCII-fold would still pass.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

async function lookupSeededShow(): Promise<{ slug: string; leadCrewId: string }> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `crew-page.spec: seeded show not found (run \`pnpm db:seed\` first). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const crewRes = await admin
    .from("crew_members")
    .select("id, role_flags")
    .eq("show_id", showRes.data.id)
    .contains("role_flags", ["LEAD"])
    .limit(1)
    .single();
  if (crewRes.error || !crewRes.data) {
    throw new Error(
      `crew-page.spec: no LEAD crew member found for slug=${showRes.data.slug}; seed corpus must include one.`,
    );
  }
  return { slug: showRes.data.slug, leadCrewId: crewRes.data.id };
}

test.describe("crew page — layout shell (Task 4.2)", () => {
  test("renders page-shell + tile-grid (2 cols mobile) + right-now-card + footer at /show/[slug]?crew=…", async ({
    page,
  }) => {
    const { slug, leadCrewId } = await lookupSeededShow();

    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status(), "page render must succeed").toBe(200);

    await expect(page.getByTestId("page-shell")).toBeVisible();
    await expect(page.getByTestId("page-container")).toBeVisible();
    await expect(page.getByTestId("right-now-card")).toBeVisible();
    await expect(page.getByTestId("tile-grid")).toBeVisible();
    await expect(page.getByTestId("page-footer")).toBeVisible();

    // grid-template-columns at mobile must resolve to TWO tracks. Browsers
    // serialize the computed value as a space-separated list of resolved
    // pixel widths (e.g. "163px 163px"). Counting the tracks is the safe
    // assertion across viewports — content widths vary.
    const cols = await page
      .getByTestId("tile-grid")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    const trackCount = cols.trim().split(/\s+/).filter(Boolean).length;
    expect(
      trackCount,
      `mobile tile-grid must be 2 columns (§8.4); got "${cols}"`,
    ).toBe(2);
  });
});
