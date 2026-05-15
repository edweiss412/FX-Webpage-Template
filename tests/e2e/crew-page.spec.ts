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
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
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

  const lead = crewRes.data.find(
    (c) => Array.isArray(c.role_flags) && (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) {
    throw new Error(`crew-page.spec: no LEAD crew member found for slug=${showRes.data.slug}.`);
  }

  // Find hotel reservations to build named/unnamed crew lookups.
  const hotelRes = await admin.from("hotel_reservations").select("names").eq("show_id", showId);
  if (hotelRes.error) {
    throw new Error(`crew-page.spec: hotel_reservations fetch failed: ${hotelRes.error.message}`);
  }
  const allHotelNames: string[] = (hotelRes.data ?? []).flatMap((r) =>
    Array.isArray(r.names) ? (r.names as string[]) : [],
  );

  const isNamed = (crewName: string) =>
    allHotelNames.some((n) => n.toLowerCase().includes(crewName.toLowerCase()));

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

/*
 * M9 C1 / R3 — active layout-invariants suite. The legacy ?crew=/?as=admin
 * suites below stay skipped pending the §B follow-up (per-test crew identity
 * needs custom seeded auth.users rows). For the M4-D6 mobile 2-col tile-grid
 * assertion AND the M4-D2 TODAY-band dimensional invariant we don't need
 * crew-specific identity — admin sees every show — so this block runs as
 * ADMIN_FIXTURE via signInAs() and pins the mobile viewport explicitly.
 *
 * Restricted to the mobile-safari project: the §8.4 contract being verified
 * is "<640px = 2 cols", which only holds at mobile widths. The desktop-
 * chromium project at 1280px renders the 4-col grid and would (correctly)
 * fail this assertion.
 *
 * IMPORTANT: This suite requires the production-build webserver path
 * because Next.js's `next/font/google` Inter import in
 * `app/show/[slug]/layout.tsx` hangs indefinitely under `pnpm dev` on
 * first show-page request (8 ESTABLISHED HTTPS connections to
 * fonts.gstatic.com that never resolve, despite the URL being directly
 * reachable in <100ms via curl — appears to be a Next 16 + Turbopack
 * dev-mode font-fetch bug). Production builds pre-fetch fonts at build
 * time, so the request renders in ~150ms.
 *
 * Run sequence (manual until the dev-mode font fetch is fixed):
 *   1. pnpm build   (with ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true ...)
 *   2. pnpm start -H 127.0.0.1   (background, same env)
 *   3. MS_ONLY=1 pnpm exec playwright test crew-page \
 *        --project=mobile-safari -g "layout invariants" --workers=1
 *
 * MS_ONLY=1 restricts playwright.config.ts to the mobile-safari/desktop-
 * chromium baseline webserver only — without it, the other webservers
 * (3001/3002/3003) race on the with-admin-dev-flag.mjs lock and one of
 * the prod-* builds wins the rename window mid-build for port 3000.
 * `reuseExistingServer: !CI` (default) makes playwright use the manually-
 * started server.
 */
test.describe("crew page — layout invariants (M9 C1 / M4-D6 + M4-D2)", () => {
  // 180s per-test budget absorbs the production-build first-hit cost
  // (cold-start serverful render of the show page touches a wide module
  // graph). The render itself is sub-second once warm; the budget is the
  // first-hit cost only.
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-safari",
      "mobile-only invariants — §8.4 mobile-2-col + TODAY-band stretch at mobile width",
    );
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("tile-grid resolves to 2 grid tracks at mobile width (M4-D6)", async ({ page }) => {
    // Pin viewport explicitly — defense-in-depth even though mobile-safari's
    // project default is 390x844. The R1 finding for M4-D6 was that the
    // desktop-chromium project would silently render the 4-col grid; the
    // explicit setViewportSize makes the assertion robust to project-config
    // drift even within the mobile-safari run.
    await page.setViewportSize({ width: 390, height: 667 });

    const { slug } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), "page render must succeed").toBe(200);

    await expect(page.getByTestId("tile-grid")).toBeVisible();

    const cols = await page
      .getByTestId("tile-grid")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    const trackCount = cols.trim().split(/\s+/).filter(Boolean).length;
    expect(trackCount, `mobile tile-grid must be 2 columns (§8.4); got "${cols}"`).toBe(2);
  });

  test("today-band tiles share equal height + match parent height (M4-D2 dimensional invariant)", async ({
    page,
  }) => {
    // Per shape brief §5.5: Tailwind v4 does NOT default `.flex` to
    // `align-items: stretch`. The TODAY band uses grid + items-stretch +
    // h-full on each child WrappedTile. Real-browser layout is the only
    // way to catch a Tailwind v4 stretch regression — jsdom doesn't
    // compute layout. Tolerance is 0.5px to absorb sub-pixel rendering.
    await page.setViewportSize({ width: 390, height: 667 });

    const { slug } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), "page render must succeed").toBe(200);

    await expect(page.getByTestId("today-band")).toBeVisible();
    await expect(page.getByTestId("today-band-tiles")).toBeVisible();

    // Read the rendered child rects directly — assert based on what the
    // page actually mounted, not what we assumed it would. Phase varies
    // with calendar date relative to fixture dates, so the test must
    // adapt to either the 1-tile or 2-tile branch.
    const layout = await page.getByTestId("today-band-tiles").evaluate((parent) => {
      const parentRect = parent.getBoundingClientRect();
      const childRects = Array.from(parent.children).map((c) =>
        (c as HTMLElement).getBoundingClientRect(),
      );
      return {
        parentHeight: parentRect.height,
        parentWidth: parentRect.width,
        childRects: childRects.map((r) => ({ height: r.height, width: r.width })),
      };
    });

    const rects = layout.childRects;
    expect(rects.length, "TODAY band must render at least one tile").toBeGreaterThan(0);

    if (rects.length === 1) {
      const [a] = rects;
      if (!a) throw new Error("unreachable: rects.length === 1 implies rects[0] exists");
      // Single-tile branch: the lone tile fills the full parent width
      // (per shape brief §5.5 — promotion is positional, no half-width
      // orphan in the 2-col grid).
      expect(
        Math.abs(a.width - layout.parentWidth),
        `single-tile TODAY must fill full parent width within 0.5px; got tile=${a.width} parent=${layout.parentWidth}`,
      ).toBeLessThanOrEqual(0.5);
    } else if (rects.length === 2) {
      const [a, b] = rects;
      if (!a || !b) throw new Error("unreachable: rects.length === 2 implies both indexes exist");
      // Two-tile branch: equal heights (items-stretch + h-full contract).
      // At mobile width the brief specifies 1-col below `sm:` (640px), so
      // children stack and EACH child width === parent width. We pin
      // 390px (<640px), so assert stacked behaviour.
      expect(
        Math.abs(a.height - b.height),
        `two-tile TODAY must have equal child heights; a=${a.height} b=${b.height}`,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(a.width - layout.parentWidth),
        `mobile <640px TODAY tiles must fill full parent width (1-col stack); a=${a.width} parent=${layout.parentWidth}`,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(b.width - layout.parentWidth),
        `mobile <640px TODAY tiles must fill full parent width (1-col stack); b=${b.width} parent=${layout.parentWidth}`,
      ).toBeLessThanOrEqual(0.5);
    }
  });
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — layout shell (Task 4.2)", () => {
  test("renders page-shell + tile-grid (2 cols mobile) + right-now-card + footer at /show/[slug]?crew=…", async ({
    page,
  }) => {
    // M9 C1 / M4-D6: assertion is mobile-specific (§8.4: 2 cols < 640px).
    // Without setViewportSize the desktop-chromium project (default 1280px)
    // would render the 4-col desktop grid and the trackCount assertion
    // would fail. Pin the viewport at the mobile target (390×667 — iPhone
    // 12/13/14 reference) so the assertion runs at the breakpoint it tests.
    await page.setViewportSize({ width: 390, height: 667 });

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
    expect(trackCount, `mobile tile-grid must be 2 columns (§8.4); got "${cols}"`).toBe(2);
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

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — LodgingTile (Task 4.4)", () => {
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

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — VenueTile (Task 4.4)", () => {
  test("renders VenueTile with the venue name + address from a complete fixture", async ({
    page,
  }) => {
    const { slug, leadCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status()).toBe(200);

    const venue = page.getByTestId("venue-tile");
    await expect(venue).toBeVisible();
    // Waldorf fixture (line 75-76 of the markdown): venue name is
    // "Waldorf Astoria Chicago"; address is "11 E Walton St Chicago, IL 60611".
    await expect(venue).toContainText(/Waldorf Astoria Chicago/i);
    await expect(venue).toContainText(/11 E Walton St/i);
  });
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — CrewTile (Task 4.4)", () => {
  test("renders CrewTile with every crew member + tap-to-call/email anchors", async ({ page }) => {
    const { slug, leadCrewId } = await lookupSeededShow();
    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status()).toBe(200);

    const crew = page.getByTestId("crew-tile");
    await expect(crew).toBeVisible();

    // Waldorf fixture (lines 50-52 of the markdown) seeds three crew rows:
    // John Carleo, Eric Weiss, Calvin Saller. The viewer (LEAD) MUST see
    // all three including themselves — see plan §4.4 "Do NOT filter the
    // viewer themselves out".
    await expect(crew.getByTestId("crew-row")).toHaveCount(3);
    await expect(crew).toContainText(/John Carleo/i);
    await expect(crew).toContainText(/Eric Weiss/i);
    await expect(crew).toContainText(/Calvin Saller/i);

    // Tap-to-call: Calvin Saller's phone is "480-330-1848"; the tel:
    // href digits-strips the formatting.
    await expect(crew.locator('a[href="tel:4803301848"]')).toBeVisible();

    // Tap-to-email: Eric Weiss's email is "edweiss412@gmail.com".
    await expect(crew.locator('a[href="mailto:edweiss412@gmail.com"]')).toBeVisible();
  });
});

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — ContactsTile (Task 4.4)", () => {
  test("renders ContactsTile with at least one contact when seeded", async ({ page }) => {
    const { slug, leadCrewId, showId } = await lookupSeededShow();

    // Pre-flight: assert the seed corpus has at least one contact for this
    // show. The Waldorf fixture seeds the venue contact "Isabella Vizzini"
    // (line 31 of the markdown). If this assertion fails, the seed has
    // drifted — either re-seed or update the fixture-name expectation
    // below.
    const contactsRes = await admin
      .from("contacts")
      .select("name, email, phone")
      .eq("show_id", showId);
    expect(contactsRes.error, "contacts fetch must succeed").toBeNull();
    expect(
      (contactsRes.data ?? []).length,
      "Waldorf fixture must seed at least one contact",
    ).toBeGreaterThan(0);

    const response = await page.goto(`/show/${slug}?crew=${leadCrewId}`);
    expect(response?.status()).toBe(200);

    const contacts = page.getByTestId("contacts-tile");
    await expect(contacts).toBeVisible();

    // Assert the seeded contact name appears (Isabella Vizzini per
    // Waldorf fixture). We match on the first row's name from the live
    // seed result rather than hard-coding so a fixture rename doesn't
    // break the test silently.
    const firstName = (contactsRes.data?.[0]?.name as string | null) ?? null;
    if (firstName) {
      // Match the first non-empty token of the first contact name to
      // avoid coupling to formatting (whitespace, &#13; carriage-return
      // entities in upstream sources, etc.).
      const firstToken = firstName.trim().split(/\s+/)[0];
      if (firstToken) {
        await expect(contacts).toContainText(firstToken);
      }
    }
  });
});
