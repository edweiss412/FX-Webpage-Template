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

/**
 * Look up the seeded Waldorf show + a small grab-bag of crew identities the
 * Task 4.4 tile suite needs:
 *   - leadCrewId          — LEAD crew member (John Carleo per fixture)
 *   - lodgingNamedCrewId  — any crew whose name appears in the hotel
 *                            reservation `names` array (LEAD qualifies);
 *                            for the LodgingTile-renders test.
 *   - lodgingUnnamedCrewId — any crew whose name does NOT appear in any
 *                            hotel reservation; for the LodgingTile-absent
 *                            test (Calvin Saller per fixture — fixture
 *                            only names Carleo + Weiss).
 */
async function lookupSeededShow(): Promise<{
  slug: string;
  showId: string;
  leadCrewId: string;
  lodgingNamedCrewId: string;
  lodgingUnnamedCrewId: string;
}> {
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
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, name, role_flags")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(
      `crew-page.spec: no crew rows for slug=${showRes.data.slug}; seed corpus must include some.`,
    );
  }

  const lead = crewRes.data.find((c) =>
    Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(
      `crew-page.spec: no LEAD crew member found for slug=${showRes.data.slug}.`,
    );
  }

  // Find hotel reservations to build named/unnamed crew lookups.
  const hotelRes = await admin
    .from("hotel_reservations")
    .select("names")
    .eq("show_id", showId);
  if (hotelRes.error) {
    throw new Error(
      `crew-page.spec: hotel_reservations fetch failed: ${hotelRes.error.message}`,
    );
  }
  const allHotelNames: string[] = (hotelRes.data ?? []).flatMap((r) =>
    Array.isArray(r.names) ? (r.names as string[]) : [],
  );

  const isNamed = (crewName: string) =>
    allHotelNames.some((n) =>
      n.toLowerCase().includes(crewName.toLowerCase()),
    );

  const namedCrew = crewRes.data.find((c) => isNamed(c.name as string));
  const unnamedCrew = crewRes.data.find((c) => !isNamed(c.name as string));
  if (!namedCrew || !unnamedCrew) {
    throw new Error(
      `crew-page.spec: seed corpus must include at least one crew member named in a hotel reservation AND one not. Got named=${namedCrew?.name ?? "none"}, unnamed=${unnamedCrew?.name ?? "none"}.`,
    );
  }

  return {
    slug: showRes.data.slug,
    showId,
    leadCrewId: lead.id as string,
    lodgingNamedCrewId: namedCrew.id as string,
    lodgingUnnamedCrewId: unnamedCrew.id as string,
  };
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

/*
 * Task 4.4 — tile components (Lodging, Venue, Crew, Contacts).
 *
 * The four tile suites below extend the layout-shell coverage with content
 * + presence assertions per the plan's "failing Playwright test asserts the
 * tile's data-testid is visible and contains expected text from a seeded
 * fixture" instruction (plan lines 290-306). Layout-dimension assertions
 * (full §8.4 invariants) are Task 4.13's job; these tests stop at presence
 * + content + empty-state-discipline boundaries.
 */

test.describe("crew page — LodgingTile (Task 4.4)", () => {
  test("renders LodgingTile with hotel name when viewer is named on a reservation", async ({
    page,
  }) => {
    const { slug, lodgingNamedCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${lodgingNamedCrewId}`);
    expect(response?.status(), "page render must succeed").toBe(200);

    const lodging = page.getByTestId("lodging-tile");
    await expect(lodging).toBeVisible();
    // Waldorf fixture (fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md
    // line 69) names the reservation hotel as "Waldorf Astoria Chicago".
    // The tile MUST render the hotel name verbatim.
    await expect(lodging).toContainText(/Waldorf Astoria/i);
  });

  test("LodgingTile is absent (whole-tile-missing reflow per §8.3) when viewer is not named on any reservation", async ({
    page,
  }) => {
    const { slug, lodgingUnnamedCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${lodgingUnnamedCrewId}`);
    expect(response?.status(), "page render must succeed").toBe(200);

    // Whole-tile-missing per spec §8.3 — the tile is NOT rendered at all
    // and the grid reflows. NOT a "no hotel" empty-state placeholder
    // (that branch belongs to required-field-missing inside a rendered
    // tile, not to the whole-tile case).
    await expect(page.getByTestId("lodging-tile")).toHaveCount(0);
  });
});
