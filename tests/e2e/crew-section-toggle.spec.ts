/**
 * Playwright E2E suite for the crew page's COMPACT section sheet (crew page
 * redesign spec §5.2), below 1024px: the home lists every section the viewer
 * may open under "All sections", and a row opens that section in a bottom
 * sheet over the home.
 *
 * Opening, switching and closing are history calls on the client
 * (`pushState` / `replaceState` / `history.back()`, never `router.push`), so a
 * section opens with ZERO network: `_CrewShell` renders every body on the
 * server and the controller (`components/crew/CrewSections.tsx`) only chooses
 * where it shows. The cases pin the §5.2 history table row by row ("realtime
 * refresh removes the open section" is Task 12's, the in-sheet link row runs
 * as a Vitest case until a section body holds one), the server render of an
 * open sheet (read on the raw response: the route's loading boundary hides
 * streamed content without JavaScript, see `tests/e2e/nojs-loading-notice.spec.ts`),
 * the sheet's name, width and drag, and the first-load cost the dual layout
 * pays.
 *
 * HARNESS: sign in as ADMIN_FIXTURE (the `admin` arm of resolveShowPageAccess
 * renders the full CrewShell for the seeded crew route), resolve the seeded
 * Waldorf show's slug + share_token, pin the server clock with the frozen-time
 * headers and the browser clock with `setFixedTime` (fixes `Date`, keeps timers
 * running: an installed clock stalls framer's AnimatePresence under WebKit, see
 * crew-page.spec.ts). Every case awaits the controller's readiness attribute
 * before its first assertion.
 *
 * Runs under mobile-safari alone: playwright.config.ts names this file in that
 * project's testMatch and not in desktop-chromium's, so one project reads and
 * writes the seed. No test body checks the project. It used to: every case
 * opened with `if (testInfo.project.name !== "mobile-safari") return;`, and a
 * project that collected the file would have reported each one PASSED having
 * asserted nothing, which the crew-e2e executed-count oracle credits as
 * coverage. tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts enrolls this
 * file and refuses any read of the project here (whole-diff review R4-F6).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Locator, type Page } from "@playwright/test";
import { DRAG_DISMISS_THRESHOLD_PX } from "@/components/shared/sheetConstants";
import { CREW_MOVED_IDS, CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";
import { CREW_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { showSection, type ShowSectionId } from "@/lib/showSections/registry";
import { refreshFromServer, renderFresh } from "./helpers/crewRefresh";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { setDateRestrictionLocked, setRoleFlagsLocked } from "./helpers/lockedCrewRestriction";
import { updateShowLocked } from "./helpers/lockedShowCopy";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { signInAs, signOut } from "./helpers/signInAs";
import { expectClearOfStickyChrome } from "./helpers/stickyClearance";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

// Same show_day_n instant the crew-page §4.9 suite freezes to: the seed's first
// show day, noon UTC (a stable morning ET) → a deterministic pass state.
const SHOW_DAY_N_INSTANT = "2026-04-21T12:00:00Z";

const TOL = 0.5;

/**
 * Every section an admin is listed on the Waldorf seed, in nav order (spec §5.1,
 * `CREW_SECTION_IDS`): all of them but Agenda, which is listed only when the show
 * has an agenda link with a file (PR B plan, decision 1), and the Waldorf
 * fixture's parsed agenda_links is empty, so its Agenda is entitled and unlisted;
 * and but Pack list, whose gate shuts on the pinned show day (PR C plan, decision 1).
 */
const ADMIN_SECTIONS: CrewSectionId[] = CREW_SECTION_IDS.filter(
  (id) => (id as string) !== "agenda" && (id as string) !== "packlist",
);

type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

async function rectOf(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

/** Resolve the seeded show's slug + share token (required path segments for the crew route). */
async function lookupSlugAndToken(): Promise<{ slug: string; shareToken: string }> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `crew-section-toggle.spec: seeded show not found (run \`pnpm db:seed\`). drive_file_id=${SEED_DRIVE_FILE_ID}, error=${showRes.error?.message ?? "no row"}`,
    );
  }
  const tokenRes = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showRes.data.id as string)
    .limit(1)
    .maybeSingle();
  if (tokenRes.error || !tokenRes.data?.share_token) {
    throw new Error(
      `crew-section-toggle.spec: no share_token for show ${showRes.data.id} (run \`pnpm db:seed\`). error=${tokenRes.error?.message ?? "no row"}`,
    );
  }
  return { slug: showRes.data.slug as string, shareToken: tokenRes.data.share_token as string };
}

/** The sheet's dialog: one per page, whatever section it holds. */
function sheetDialog(page: Page): Locator {
  return page.getByTestId("crew-section-sheet-dialog");
}

/** An "All sections" row on the home. */
function row(page: Page, id: CrewSectionId): Locator {
  return page.getByTestId("crew-all-sections").locator(`[data-section="${id}"]`);
}

function closeName(id: CrewSectionId): string {
  return `Close ${CREW_SECTION_LABELS[id].toLowerCase()}`;
}

/** Waits until the sheet's open slide has finished: its bottom edge sits on the viewport's. */
async function settleOpen(page: Page): Promise<void> {
  const vh = page.viewportSize()!.height;
  await expect
    .poll(async () => (await rectOf(page.getByTestId("crew-section-sheet-panel"))).bottom, {
      timeout: 5000,
    })
    .toBeCloseTo(vh, 0);
}

test.describe("crew compact home and section sheet (spec §5.2)", () => {
  // First-hit cold render of the crew shell touches a wide module graph; the
  // budget absorbs that. The sheet itself is sub-second once warm.
  test.setTimeout(180_000);

  let slug = "";
  let shareToken = "";
  let route = "";

  test.beforeEach(async ({ page }) => {
    const resolved = await lookupSlugAndToken();
    slug = resolved.slug;
    shareToken = resolved.shareToken;
    route = `/show/${slug}/${shareToken}`;
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  /** Loads the crew route and waits for the controller to hydrate. */
  async function load(page: Page, search: string): Promise<void> {
    const res = await page.goto(`${route}${search}`, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `crew route ${route}${search} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  // ── The win: opening a section does ZERO network ──────────────────────────
  // Load the home, let the page fully settle (networkidle) so no late
  // hydration/prefetch request is mis-attributed to the tap, THEN attach a
  // request recorder and open a section. The controller only pushes history,
  // so not a single document, RSC or fetch request fires. Benign `<Link>`
  // prefetch is tolerated; static assets and the realtime socket are ignored.
  test("sheet: opening a row from home pushes one entry and opens the sheet with zero network", async ({
    page,
  }) => {
    await load(page, "?s=today");
    await page.waitForLoadState("networkidle");

    const offending: string[] = [];
    page.on("request", (r) => {
      const type = r.resourceType();
      if (type !== "document" && type !== "fetch" && type !== "xhr") return;
      const h = r.headers();
      const isPrefetch =
        h["next-router-prefetch"] === "1" ||
        h["purpose"] === "prefetch" ||
        (h["sec-purpose"] ?? "").includes("prefetch");
      if (isPrefetch) return;
      offending.push(`${type} ${r.url()}`);
    });

    const before = await page.evaluate(() => history.length);
    await row(page, "venue").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    await expect(sheetDialog(page).getByTestId("section-venue")).toBeVisible();

    expect(
      offending,
      `opening a section must fire ZERO data requests; got ${offending.length}: ${JSON.stringify(offending)}`,
    ).toHaveLength(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("venue");
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    expect(
      await page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet),
    ).toBe(true);
  });

  test("sheet: closing with the marker goes back to home, and Forward reopens the section", async ({
    page,
  }) => {
    await load(page, ""); // the home entry carries no `s`, so Back/close must land without one
    await row(page, "crew").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "crew");
    const length = await page.evaluate(() => history.length);

    await page.getByRole("button", { name: closeName("crew") }).click();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
    expect(await page.evaluate(() => history.length), "close went back, it did not push").toBe(
      length,
    );
    await expect(page.getByTestId("crew-all-sections")).toBeVisible();

    await page.goForward();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "crew");
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("crew");
  });

  test("sheet: browser Back from an open sheet closes it", async ({ page }) => {
    await load(page, ""); // the home entry carries no `s`, so Back/close must land without one
    await row(page, "schedule").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "schedule");
    await page.goBack();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
    await expect(page.getByTestId("section-today")).toBeVisible();
  });

  test("sheet: closing a deep-linked sheet replaces the URL without s and adds no entry", async ({
    page,
  }) => {
    await load(page, "?s=venue&gate=skip");
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    expect(
      await page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet),
      "a fresh deep link carries no marker",
    ).toBeUndefined();
    const length = await page.evaluate(() => history.length);

    await page.getByRole("button", { name: closeName("venue") }).click();
    await expect(sheetDialog(page)).toHaveCount(0);
    const url = new URL(page.url());
    expect(url.searchParams.get("s")).toBeNull();
    expect(url.searchParams.get("gate")).toBe("skip");
    expect(await page.evaluate(() => history.length)).toBe(length);
  });

  test("sheet: closing a deep-linked sheet with Esc focuses its All sections row, on screen (UI-gate re-run P2-1)", async ({
    page,
  }) => {
    // A deep link has no opener, so focus goes to the row that opens the same
    // section (audit P2-5). It used to go there without scrolling: the page sat
    // at its top while the row was 800 to 1100px down, focused and out of sight.
    // The list's last row for this viewer is the farthest from the top, and Rooms
    // holds the most on the way back (the paths table's row-focus case).
    await load(page, "?s=today");
    const listed = await page
      .getByTestId("crew-all-sections")
      .locator("[data-section]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-section")));
    const last = CREW_SECTION_IDS.filter((id) => listed.includes(id)).at(-1)!;
    for (const id of new Set<CrewSectionId>(["rooms", last])) {
      await load(page, `?s=${id}`);
      await expect(sheetDialog(page), id).toHaveAttribute("data-section", id);
      // PREMISE: the row starts below the fold, so landing on screen is the close's doing.
      expect(
        await row(page, id).evaluate((el) => el.getBoundingClientRect().top - innerHeight),
        id,
      ).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await expect(sheetDialog(page), id).toHaveCount(0);
      await expect(row(page, id), id).toBeFocused();
      await expectClearOfStickyChrome(row(page, id), `the ${id} row`);
      const box = await row(page, id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, innerHeight };
      });
      expect(box.bottom, `${id} ${JSON.stringify(box)}`).toBeLessThanOrEqual(box.innerHeight + 0.5);
    }
  });

  test("sheet: a popstate to an unknown s drops it from the URL and shows the home", async ({
    page,
  }) => {
    await load(page, "?s=today");
    await page.evaluate(() => {
      history.pushState(null, "", `${location.pathname}?s=not-a-section`);
      history.pushState(null, "", location.pathname);
    });
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect(page.getByTestId("crew-all-sections")).toBeVisible();
  });

  test("sheet: a row link keeps the allow-listed gate into the sheet's URL", async ({ page }) => {
    await load(page, "?s=today&gate=skip");
    const href = await row(page, "crew").getAttribute("href");
    const hrefParams = new URL(href!, page.url()).searchParams;
    expect(hrefParams.get("s")).toBe("crew");
    expect(hrefParams.get("gate")).toBe("skip");

    await row(page, "crew").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "crew");
    const url = new URL(page.url());
    expect(url.searchParams.get("s")).toBe("crew");
    expect(url.searchParams.get("gate")).toBe("skip");
  });

  test("sheet: a refresh with the sheet open lands with it open, and its close goes back home", async ({
    page,
  }) => {
    await load(page, ""); // the home entry carries no `s`, so Back/close must land without one
    await row(page, "hotels").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "hotels");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "hotels");
    expect(
      await page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet),
      "a reload keeps the pushed entry's marker",
    ).toBe(true);

    await page.getByRole("button", { name: closeName("hotels") }).click();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
    await expect(page.getByTestId("crew-all-sections")).toBeVisible();
  });

  test("sheet: the close button is named Close plus the section name", async ({ page }) => {
    await load(page, "?s=today");
    for (const id of ["rooms", "billing"] as const) {
      await row(page, id).click();
      const close = sheetDialog(page).getByRole("button", { name: closeName(id) });
      await expect(close).toBeVisible();
      // The title the dialog is labelled by is the section's label.
      await expect(sheetDialog(page)).toHaveAccessibleName(CREW_SECTION_LABELS[id]);
      await close.click();
      await expect(sheetDialog(page)).toHaveCount(0);
    }
  });

  // Spec §5.2: focus is trapped inside the sheet. Opening focuses the title,
  // which is `tabindex="-1"` and so is not itself one of the trap's stops: a
  // Tab from it must still land inside, as must every Tab after it.
  test("sheet: Tab and Shift+Tab stay inside the sheet", async ({ page }) => {
    await load(page, "?s=today");
    await row(page, "venue").click();
    await settleOpen(page);
    /** Where focus is, and the sheet's own stops in order (the trap's rule). */
    const where = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[data-testid="crew-section-sheet-dialog"]')!;
        const stops = [
          ...dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.offsetParent !== null && el.tabIndex >= 0);
        const active = document.activeElement as HTMLElement | null;
        return {
          inside: active !== null && dialog.contains(active),
          tag: active?.tagName ?? null,
          name: active?.getAttribute("aria-label") ?? null,
          index: active ? stops.indexOf(active) : -1,
          stops: stops.length,
        };
      });
    await expect.poll(async () => (await where()).tag).toBe("H2");
    const opened = await where();
    expect(opened.inside, JSON.stringify(opened)).toBe(true);
    // PREMISE: the sheet holds more than one stop, so a wrap is observable.
    expect(opened.stops, JSON.stringify(opened)).toBeGreaterThan(1);

    // Forward from the title: the sheet's first stop, its close button.
    await page.keyboard.press("Tab");
    const first = await where();
    expect(first, JSON.stringify(first)).toMatchObject({
      inside: true,
      tag: "BUTTON",
      name: closeName("venue"),
      index: 0,
    });
    // Backward from the first stop: the sheet's last stop, never out of it.
    await page.keyboard.press("Shift+Tab");
    const last = await where();
    expect(last, JSON.stringify(last)).toMatchObject({ inside: true, index: last.stops - 1 });
    // Forward from the last stop: around to the first again, every stop on the
    // way inside the sheet.
    await page.keyboard.press("Tab");
    const wrapped = await where();
    expect(wrapped, JSON.stringify(wrapped)).toMatchObject({ inside: true, index: 0 });
    for (let i = 1; i < wrapped.stops; i++) {
      await page.keyboard.press("Tab");
      const step = await where();
      expect(step, `Tab ${i}: ${JSON.stringify(step)}`).toMatchObject({ inside: true, index: i });
    }
  });

  test("sheet: a drag released before the threshold springs back to open", async ({ page }) => {
    await load(page, "?s=today");
    await row(page, "venue").click();
    await settleOpen(page);

    const grab = await rectOf(page.getByTestId("crew-section-sheet-grab"));
    const x = grab.left + grab.width / 2;
    const y = grab.top + grab.height / 2;
    const travel = DRAG_DISMISS_THRESHOLD_PX - 40;
    const panelY = () =>
      page
        .getByTestId("crew-section-sheet-panel")
        .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + travel, { steps: 8 });
    expect(await panelY(), "the panel follows the pointer").toBeCloseTo(travel, 0);
    await page.mouse.up();

    await expect.poll(panelY, { timeout: 5000 }).toBeCloseTo(0, 0);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    expect(new URL(page.url()).searchParams.get("s")).toBe("venue");
  });

  test("sheet: full width below 640px and centred at the panel max width from 640px", async ({
    page,
  }) => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const max = Number(css.match(/--spacing-panel-max:\s*(\d+)px/)?.[1]);
    expect(max, "app/globals.css declares --spacing-panel-max in px").toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await load(page, "?s=venue");
    await settleOpen(page);
    const narrow = await rectOf(page.getByTestId("crew-section-sheet-panel"));
    expect(Math.abs(narrow.width - 390), `width ${narrow.width}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(narrow.left), `left ${narrow.left}`).toBeLessThanOrEqual(TOL);

    await page.setViewportSize({ width: 768, height: 1024 });
    await load(page, "?s=venue");
    await settleOpen(page);
    const mid = await rectOf(page.getByTestId("crew-section-sheet-panel"));
    expect(Math.abs(mid.width - max), `width ${mid.width}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(mid.left - (768 - max) / 2), `left ${mid.left}`).toBeLessThanOrEqual(TOL);
  });

  // ── The server render, read on the raw response ────────────────────────────
  // With JavaScript off the route's loading boundary keeps streamed content
  // hidden, so a no-JS browser proves nothing; the HTML itself must carry the
  // open sheet and real links, so a pre-hydration tap or "open in new tab" lands
  // on the sheet.
  test("sheet: the server renders ?s=venue with the Venue sheet open, and every row links with s and gate", async ({
    page,
  }) => {
    const res = await page.request.get(`${route}?s=venue&gate=skip`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    const dialogAt = html.search(/<[^>]*data-testid="crew-section-sheet-dialog"[^>]*>/);
    expect(dialogAt, "the open sheet is in the server HTML").toBeGreaterThan(-1);
    const dialogTag = html.slice(dialogAt, html.indexOf(">", dialogAt) + 1);
    expect(dialogTag).toContain('role="dialog"');
    expect(dialogTag).toContain('aria-modal="true"');
    expect(dialogTag).toContain('data-section="venue"');
    expect(html.indexOf('data-testid="section-venue"', dialogAt)).toBeGreaterThan(dialogAt);
    // Exactly once: the hidden wide stack does not carry a second copy of the open
    // body, so a test id, a heading id or a search target never resolves twice
    // before hydration.
    expect(html.split('data-testid="section-venue"').length - 1).toBe(1);

    const rows = [...html.matchAll(/<a\b[^>]*data-testid="crew-all-sections-row"[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(rows.map((tag) => /data-section="([^"]+)"/.exec(tag)?.[1])).toEqual(ADMIN_SECTIONS);
    for (const tag of rows) {
      const href = /href="([^"]+)"/.exec(tag)?.[1]?.replaceAll("&amp;", "&");
      const params = new URL(href!, "http://x").searchParams;
      const id = /data-section="([^"]+)"/.exec(tag)![1];
      expect(params.get("s"), tag).toBe(id);
      expect(params.get("gate"), tag).toBe("skip");
    }
  });

  // Crew page redesign PR C Task 5: Event details is a section of its own.
  test("event details: ?s=event opens the sheet on initial load, in the server HTML and after hydration", async ({
    page,
  }) => {
    const res = await page.request.get(`${route}?s=event`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const dialogAt = html.search(/<[^>]*data-testid="crew-section-sheet-dialog"[^>]*>/);
    expect(dialogAt, "the open sheet is in the server HTML").toBeGreaterThan(-1);
    const dialogTag = html.slice(dialogAt, html.indexOf(">", dialogAt) + 1);
    expect(dialogTag).toContain('data-section="event"');
    expect(html.indexOf('data-testid="section-event"', dialogAt)).toBeGreaterThan(dialogAt);

    await load(page, "?s=event");
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "event");
    await expect(sheetDialog(page).getByTestId("section-event")).toBeVisible();
    await expect(sheetDialog(page).getByRole("heading", { level: 2 })).toHaveText(
      showSection("event").label,
    );
    expect(new URL(page.url()).searchParams.get("s")).toBe("event");
  });

  // Crew page redesign PR C Task 7: Rooms is a section of its own, holding Diagrams.
  test("rooms: ?s=rooms opens the sheet on initial load, in the server HTML and after hydration", async ({
    page,
  }) => {
    const res = await page.request.get(`${route}?s=rooms`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const dialogAt = html.search(/<[^>]*data-testid="crew-section-sheet-dialog"[^>]*>/);
    expect(dialogAt, "the open sheet is in the server HTML").toBeGreaterThan(-1);
    const dialogTag = html.slice(dialogAt, html.indexOf(">", dialogAt) + 1);
    expect(dialogTag).toContain('data-section="rooms"');
    expect(html.indexOf('data-testid="section-rooms"', dialogAt)).toBeGreaterThan(dialogAt);

    await load(page, "?s=rooms");
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "rooms");
    await expect(sheetDialog(page).getByTestId("section-rooms")).toBeVisible();
    await expect(sheetDialog(page).getByRole("heading", { level: 2 })).toHaveText(
      showSection("rooms").label,
    );
    expect(new URL(page.url()).searchParams.get("s")).toBe("rooms");
  });

  test("rooms: Diagrams render inside the Rooms sheet and not in Venue", async ({ page }) => {
    await load(page, "?s=rooms");
    const inRooms = sheetDialog(page).getByTestId("section-rooms");
    await expect(inRooms.getByTestId("venue-diagrams")).toHaveCount(1);
    await expect(inRooms.getByTestId("diagrams-tile")).toBeVisible();

    await load(page, "?s=venue");
    const inVenue = sheetDialog(page).getByTestId("section-venue");
    // POSITIVE CONTROL: Venue rendered its own cards.
    await expect(inVenue.getByTestId("venue-where")).toBeVisible();
    await expect(inVenue.getByTestId("venue-diagrams")).toHaveCount(0);
    await expect(inVenue.getByTestId("diagrams-tile")).toHaveCount(0);
    await expect(inVenue.getByTestId("venue-column")).toHaveCount(0);
  });

  // Crew page redesign PR C Task 8: Gear retired, and its id is an alias of `rooms`.
  test("gear alias: ?s=gear opens the Rooms sheet on initial load, in the server HTML and after hydration", async ({
    page,
  }) => {
    const res = await page.request.get(`${route}?s=gear`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const dialogAt = html.search(/<[^>]*data-testid="crew-section-sheet-dialog"[^>]*>/);
    expect(dialogAt, "the open sheet is in the server HTML").toBeGreaterThan(-1);
    const dialogTag = html.slice(dialogAt, html.indexOf(">", dialogAt) + 1);
    expect(dialogTag).toContain('data-section="rooms"');
    expect(html.indexOf('data-testid="section-rooms"', dialogAt)).toBeGreaterThan(dialogAt);

    await load(page, "?s=gear");
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "rooms");
    await expect(sheetDialog(page).getByTestId("section-rooms")).toBeVisible();
    await expect(sheetDialog(page)).toHaveAccessibleName(showSection("rooms").label);
    // One section left where two were: no Gear body or row stays on the page, and the
    // list still reads the section that replaced it.
    await expect(page.getByTestId("section-gear")).toHaveCount(0);
    await expect(page.locator('[data-section="gear"]')).toHaveCount(0);
    await expect(row(page, "rooms")).toHaveCount(1);
  });

  test("gear alias: Back then Forward over an in-app entry carrying s=gear closes and reopens Rooms", async ({
    page,
  }) => {
    await load(page, "");
    await row(page, "rooms").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "rooms");
    await settleOpen(page);
    // The pushed entry now carries the old value, as an old in-app link left it.
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("s", "gear");
      window.history.replaceState(window.history.state, "", url);
    });

    await page.goBack();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();

    await page.goForward();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "rooms");
    await expect(sheetDialog(page).getByTestId("section-rooms")).toBeVisible();
    // An alias the viewer may open is not stripped (a canonicalized alias is kept).
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("gear");
  });

  test("sheet: ?s=today renders the home with no sheet, in the HTML and after hydration", async ({
    page,
  }) => {
    const html = await (await page.request.get(`${route}?s=today`)).text();
    expect(html).toContain('data-testid="crew-all-sections"');
    expect(html).not.toContain('data-testid="crew-section-sheet-dialog"');

    await load(page, "?s=today");
    await expect(page.getByTestId("crew-all-sections")).toBeVisible();
    await expect(page.getByTestId("section-today")).toBeVisible();
    await expect(sheetDialog(page)).toHaveCount(0);
  });

  // ── Dimensional (real browser, 390px): the All sections rows ───────────────
  // Every row spans the card and clears the 44px tap floor. jsdom CANNOT
  // verify this (no layout; Tailwind v4 does not default .flex to
  // align-items:stretch), so it is a real-browser assertion.
  test("4: All sections rows span the card and clear the 44px tap floor (390px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await load(page, "?s=today");
    const card = page.getByTestId("crew-all-sections-card");
    await expect(card).toBeVisible();
    const cardBox = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: r.left + parseFloat(cs.borderLeftWidth),
        right: r.right - parseFloat(cs.borderRightWidth),
      };
    });
    const rows = page.getByTestId("crew-all-sections-row");
    const n = await rows.count();
    expect(n, "the list renders the admin's sections").toBe(ADMIN_SECTIONS.length);
    for (let i = 0; i < n; i++) {
      const r = await rectOf(rows.nth(i));
      expect(r.height, `row ${i} height`).toBeGreaterThanOrEqual(44 - TOL);
      expect(Math.abs(r.left - cardBox.left), `row ${i} left`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.right - cardBox.right), `row ${i} right`).toBeLessThanOrEqual(TOL);
    }
  });

  // Crew page redesign Task 7 (spec §4.1, §1.2): below 1024px the header's search
  // slot is a full-width row of its own under the title, and the status slot is
  // an empty element directly after the header bar. The admin share route has no
  // identity chip, so the right slot holds the theme switch; the search row must
  // clear it too.
  test("header: below 1024px the search field is a full-width row under the title, and the status slot sits directly under the header bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await load(page, "?s=today");
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-mode",
      "compact",
    );
    await expect(page.getByTestId("crew-search-input")).toBeVisible();

    // One evaluate (detach safety). The row's content box is the row's rect
    // inside its padding; the title's box is the row item that holds the h1.
    const r = await page.evaluate(() => {
      const box = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
      };
      const head = document.querySelector('[data-testid="page-header"]')!;
      const search = head.querySelector('[data-testid="page-header-search"]')!;
      const row = search.parentElement!;
      const rowBox = row.getBoundingClientRect();
      const cs = getComputedStyle(row);
      let title: Element = head.querySelector("h1")!;
      while (title.parentElement && title.parentElement !== row) title = title.parentElement;
      const next = head.nextElementSibling;
      return {
        contentLeft: rowBox.left + parseFloat(cs.paddingLeft),
        contentRight: rowBox.right - parseFloat(cs.paddingRight),
        search: box(search),
        title: box(title),
        rightSlot: box(head.querySelector('[data-testid="page-header-right-slot"]')!),
        next: next?.getAttribute("data-testid") ?? next?.tagName ?? null,
        nextChildNodes: next?.childNodes.length ?? -1,
      };
    });

    // Full width: the row's whole content box, edge to edge.
    expect(Math.abs(r.search.left - r.contentLeft), "search left edge").toBeLessThanOrEqual(TOL);
    expect(Math.abs(r.search.right - r.contentRight), "search right edge").toBeLessThanOrEqual(TOL);
    // Under the title, and under the right slot beside it: a row of its own.
    expect(r.search.top, "search below the title").toBeGreaterThanOrEqual(r.title.bottom - TOL);
    expect(r.search.top, "search below the right slot").toBeGreaterThanOrEqual(
      r.rightSlot.bottom - TOL,
    );
    expect(
      Math.abs(r.search.left - r.title.left),
      "search aligns with the title",
    ).toBeLessThanOrEqual(TOL);
    // The status slot: the element right after the header bar, empty.
    expect(r.next, "the element after the header bar").toBe("page-header-status-slot");
    expect(r.nextChildNodes, "the status slot is empty").toBe(0);
  });

  // ── Payload + FCP record (perf-tradeoff evidence) ──────────────────────────
  // The tradeoff: ship ALL section bodies on first load in exchange for
  // zero-network opens. This RECORDS that first-load cost (document + RSC
  // bytes from response events, which WebKit reports; FCP where supported) so
  // CI logs carry the evidence. The assertions are GENEROUS sanity ceilings
  // only; the CREW_PERF console line is the durable record.
  test("5: record first-load payload bytes + FCP (perf-tradeoff evidence)", async ({ page }) => {
    const docRscBytes: number[] = [];
    const pendingBodies: Promise<void>[] = [];
    page.on("response", (r) => {
      const type = r.request().resourceType();
      if (type !== "document" && type !== "fetch" && type !== "xhr") return;
      const cl = r.headers()["content-length"];
      if (cl) {
        docRscBytes.push(Number(cl) || 0);
        return;
      }
      pendingBodies.push(
        r
          .body()
          .then((b) => {
            docRscBytes.push(b.length);
          })
          .catch(() => {
            /* body unavailable (redirect/opaque) — skip */
          }),
      );
    });

    await load(page, "?s=today");
    await page.waitForLoadState("networkidle");
    await Promise.all(pendingBodies);

    const payloadBytes = docRscBytes.reduce((a, b) => a + b, 0);
    const fcpMs = await page.evaluate(() => {
      const e = performance.getEntriesByName("first-contentful-paint")[0];
      return e ? e.startTime : -1;
    });
    console.log("CREW_PERF " + JSON.stringify({ payloadBytes, fcpMs }));

    expect(
      payloadBytes,
      `document+RSC payload must be captured (>0); got ${payloadBytes} (see CREW_PERF log)`,
    ).toBeGreaterThan(0);
    expect(
      payloadBytes,
      `first-load document+RSC payload should be under the 2MB sanity ceiling; got ${payloadBytes} bytes (see CREW_PERF log)`,
    ).toBeLessThan(2_000_000);
    if (fcpMs >= 0) {
      expect(
        fcpMs,
        `first-contentful-paint should be under the 8s sanity ceiling; got ${fcpMs}ms (see CREW_PERF log)`,
      ).toBeLessThan(8000);
    }
  });

  // ── Duration tokens reach Tailwind utilities (BL-DURATION-TOKENS-EMIT-NO-CSS) ──
  // A list row carries literal `transition-colors duration-fast` classes. The
  // expected value is DERIVED from the token in globals.css, not hardcoded, and
  // reduced motion must collapse it to 0s.
  test("All sections row duration comes from --duration-fast and zeroes under reduced motion", async ({
    page,
  }) => {
    const tokenCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const m = tokenCss.match(/--duration-fast:\s*(\d+)ms/);
    if (!m?.[1]) throw new Error("app/globals.css must declare --duration-fast in ms");
    const expected = `${Number(m[1]) / 1000}s`;

    await load(page, "?s=today");
    await expect(row(page, "venue")).toBeVisible();
    expect(await row(page, "venue").evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(
      expected,
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await load(page, "?s=today");
    await expect(row(page, "venue")).toBeVisible();
    expect(await row(page, "venue").evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(
      "0s",
    );
  });
});

/**
 * Compound transitions, compact (crew page redesign spec §7 "Compound
 * transitions", §5.2 nested dialogs and scroll lock; plan Task 12). Titles carry
 * "compound". The wide-layout rows (crossing into wide, mid-drag, with a nested
 * dialog, and back into compact) live in crew-wide-nav.spec.ts, the project that
 * resizes across 1024px.
 *
 * A realtime refresh is driven by helpers/crewRefresh.ts: `renderFresh` makes
 * every later render revalidate (the app's write paths call `revalidateShow`),
 * then a locked fixture write, then `refreshFromServer`, the bridge's own
 * `router.refresh()`. Every case that writes data seeds
 * its own show, so no write reaches the shared Waldorf seed; the cases that only
 * read (the lightbox and the report modal, the theme switch) use Waldorf.
 */
test.describe("crew compact compound transitions (spec §7, plan Task 12)", () => {
  test.setTimeout(180_000);

  const BASE_HEADERS = {
    "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
    Authorization: `Bearer ${TEST_AUTH_SECRET}`,
  };
  const DATES = {
    travelIn: "2026-04-19",
    set: "2026-04-20",
    showDays: ["2026-04-21", "2026-04-22"],
    travelOut: "2026-04-23",
  };

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders(BASE_HEADERS);
  });

  /** Loads a crew path and waits for the controller to hydrate. */
  async function loadPath(page: Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /** Opens a section from its "All sections" row and waits for the slide to finish. */
  async function openFromRow(page: Page, id: CrewSectionId): Promise<void> {
    await row(page, id).click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", id);
    await settleOpen(page);
  }

  async function waldorfRoute(): Promise<string> {
    const { slug, shareToken } = await lookupSlugAndToken();
    return `/show/${slug}/${shareToken}`;
  }

  /**
   * Opens a nested dialog from the keyboard: focus its trigger, press Enter. A
   * tap does not focus a button in WebKit, so focus restoration is the keyboard
   * path's contract (WCAG 2.4.3), and the one these cases pin.
   */
  async function activate(page: Page, trigger: Locator): Promise<void> {
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
  }

  /** True when focus sits inside the open sheet's dialog. */
  function focusInsideSheet(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="crew-section-sheet-dialog"]');
      const active = document.activeElement;
      return dialog !== null && active !== null && active !== dialog && dialog.contains(active);
    });
  }

  /** The page's text and attributes, without the inline scripts that carry the first render's payload. */
  function renderedPage(page: Page): Promise<string> {
    return page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      for (const el of clone.querySelectorAll("script, template")) el.remove();
      return clone.outerHTML;
    });
  }

  test("compound: a realtime refresh with the sheet open keeps it open on the same section and updates its body in place", async ({
    page,
  }) => {
    const VENUE = { name: "Compound Hall Before", address: "41 Refresh Way" };
    const RENAMED = "Compound Hall After";
    const seeded = await seedShowWithCrew({
      title: "Compound Refresh Show",
      dates: DATES,
      venue: VENUE as never,
      crew: [{ name: "Compound Crew", role: "A1" }],
    });
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      await openFromRow(page, "venue");
      const body = page.getByTestId("crew-section-sheet-body");
      await expect(body).toContainText(VENUE.name);
      // Mark the dialog and the body's crossfade wrapper: a remount or a re-keyed
      // crossfade would replace them, and the marks would be gone.
      await page.evaluate(() => {
        for (const sel of [
          '[data-testid="crew-section-sheet-dialog"]',
          '[data-testid="crew-section-transition"]',
        ]) {
          (document.querySelector(sel) as unknown as { __compound?: true }).__compound = true;
        }
      });

      await renderFresh(page, BASE_HEADERS);
      updateShowLocked(seeded.driveFileId, { venue: { ...VENUE, name: RENAMED } });
      await refreshFromServer(page);

      await expect(body).toContainText(RENAMED);
      await expect(body).not.toContainText(VENUE.name);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
      const kept = await page.evaluate(() =>
        [
          '[data-testid="crew-section-sheet-dialog"]',
          '[data-testid="crew-section-transition"]',
        ].map(
          (sel) =>
            (document.querySelector(sel) as unknown as { __compound?: true } | null)?.__compound ===
            true,
        ),
      );
      expect(kept, "the same dialog and the same crossfade wrapper: updated in place").toEqual([
        true,
        true,
      ]);
      expect(new URL(page.url()).searchParams.get("s")).toBe("venue");
      expect(
        await page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet),
      ).toBe(true);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("compound: a refresh that takes Billing from a previewed lead closes the Billing sheet to home without animation and leaves no Billing value on the page", async ({
    page,
  }) => {
    const FINANCIALS = {
      po: "PO-COMPOUND-7731",
      proposal: "Proposal compound 4410",
      invoice: "Invoice compound 9902",
      invoice_notes: "Compound invoice note 5515",
    };
    const seeded = await seedShowWithCrew({
      title: "Compound Billing Show",
      dates: DATES,
      crew: [{ name: "Compound Lead", role: "TD", roleFlags: ["LEAD"] }],
      internal: { financials: FINANCIALS },
    });
    const lead = seeded.crew[0]!;
    try {
      // One refresh in flight, this case's own. A `crew_members` write broadcasts
      // (its statement trigger), so the bridge would refresh too; under WebKit two
      // overlapping refreshes cancel each other's RSC fetch and Next falls back to
      // a full document load (measured 2026-10-30: three fetches "cancelled", then
      // "Failed to fetch RSC payload ... Falling back to browser navigation"), which
      // tests Next, not the controller. Without a token the bridge never
      // subscribes (it fails open, components/realtime/ShowRealtimeBridge.tsx).
      await page.route("**/api/realtime/subscriber-token", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
      );
      await loadPath(page, `/admin/show/${seeded.slug}/preview/${lead.id}`);
      await openFromRow(page, "billing");
      // Positive control: the values this case searches for are on the page now.
      const before = await renderedPage(page);
      for (const v of Object.values(FINANCIALS)) expect(before, v).toContain(v);
      expect(
        await page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet),
      ).toBe(true);

      // The close row this entry takes: back over the marker (spec §5.2).
      await page.evaluate(() => {
        const w = window as unknown as { __backs: number };
        w.__backs = 0;
        const back = history.back.bind(history);
        history.back = () => {
          w.__backs += 1;
          back();
        };
      });
      // Every DOM change from here on: is the Billing row still listed, is the sheet still mounted.
      await page.evaluate(() => {
        const log: Array<{ row: boolean; sheet: boolean }> = [];
        (window as unknown as { __compoundLog: typeof log }).__compoundLog = log;
        new MutationObserver(() => {
          log.push({
            row:
              document.querySelector(
                '[data-testid="crew-all-sections"] [data-section="billing"]',
              ) !== null,
            sheet: document.querySelector('[data-testid="crew-section-sheet"]') !== null,
          });
        }).observe(document.body, { childList: true, subtree: true, attributes: true });
      });

      await renderFresh(page, BASE_HEADERS);
      await setRoleFlagsLocked(seeded.driveFileId, lead.id, []);
      await refreshFromServer(page);

      await expect(row(page, "billing")).toHaveCount(0);
      await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();
      expect(
        await page.evaluate(() => (window as unknown as { __backs: number }).__backs),
        "closed through history.back(), the pushed entry's close row",
      ).toBe(1);
      const log = await page.evaluate(
        () =>
          (window as unknown as { __compoundLog: Array<{ row: boolean; sheet: boolean }> })
            .__compoundLog,
      );
      expect(
        log.some((e) => !e.row),
        "PREMISE: the observer saw the Billing row leave",
      ).toBe(true);
      expect(
        log.filter((e) => !e.row && e.sheet),
        "the sheet left in the same commit as the Billing row: no exit slide holding the old body",
      ).toEqual([]);
      const after = await renderedPage(page);
      for (const v of Object.values(FINANCIALS)) expect(after, v).not.toContain(v);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("compound: a refresh that removes the selected day from the day set returns the selection to live", async ({
    page,
  }) => {
    const SELECTED = "2026-04-22";
    const seeded = await seedShowWithCrew({
      title: "Compound Day Show",
      dates: DATES,
      crew: [{ name: "Compound Crew", role: "A1" }],
    });
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      const button = page.locator(`[data-testid="crew-day-button"][data-day="${SELECTED}"]`);
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("crew-pass")).toHaveAttribute(
        "data-selection",
        `day:${SELECTED}`,
      );

      await renderFresh(page, BASE_HEADERS);
      updateShowLocked(seeded.driveFileId, {
        dates: { ...DATES, showDays: DATES.showDays.filter((d) => d !== SELECTED) },
      });
      await refreshFromServer(page);

      await expect(button).toHaveCount(0);
      await expect(page.getByTestId("crew-pass")).toHaveAttribute("data-selection", "live");
      // Today (show day 1) is still in the set, so its button carries `live`.
      const today = SHOW_DAY_N_INSTANT.slice(0, 10);
      await expect(
        page.locator(`[data-testid="crew-day-button"][data-day="${today}"]`),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("compound: a refresh that removes a nested dialog's owner unmounts the dialog alone, and the sheet keeps the page locked", async ({
    page,
  }) => {
    const seeded = await seedShowWithCrew({
      title: "Compound Agenda Owner Show",
      dates: DATES,
      agendaLinks: [{ label: "AGENDA", fileId: "compoundOwnerAgenda01" }] as never,
      crew: [{ name: "Compound Crew", role: "A1" }],
    });
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      // The agenda's own section since PR B Task 10 (spec §6.2 `agenda` row).
      await openFromRow(page, "agenda");
      await sheetDialog(page)
        .getByRole("button", { name: /View agenda/ })
        .click();
      await expect(page.getByTestId("agenda-sheet")).toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

      await renderFresh(page, BASE_HEADERS);
      updateShowLocked(seeded.driveFileId, { agenda_links: [] });
      await refreshFromServer(page);

      await expect(page.getByTestId("agenda-embed")).toHaveCount(0);
      await expect(page.getByTestId("agenda-sheet")).toHaveCount(0);
      // Agenda left the list with its content, and stays open on its fresh state.
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
      // Focus was in the viewer, which left the page: it is back in the sheet,
      // not on <body> behind an inert page (whole-diff review round 2, 2A-R2-1).
      await expect
        .poll(() =>
          page.evaluate(() => {
            const sheet = document.querySelector('[data-testid="crew-section-sheet-dialog"]');
            return sheet !== null && sheet.contains(document.activeElement);
          }),
        )
        .toBe(true);
      expect(
        await page.evaluate(() => document.body.style.overflow),
        "the sheet still holds the scroll lock",
      ).toBe("hidden");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("compound: Esc with the agenda viewer open closes only the viewer, and focus returns inside the sheet", async ({
    page,
  }) => {
    const seeded = await seedShowWithCrew({
      title: "Compound Agenda Esc Show",
      dates: DATES,
      agendaLinks: [{ label: "AGENDA", fileId: "compoundEscAgenda01" }] as never,
      crew: [{ name: "Compound Crew", role: "A1" }],
    });
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      await openFromRow(page, "agenda");
      const trigger = sheetDialog(page).getByRole("button", { name: /View agenda/ });
      await activate(page, trigger);
      await expect(page.getByTestId("agenda-sheet")).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(page.getByTestId("agenda-sheet")).toHaveCount(0);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
      await expect.poll(() => focusInsideSheet(page)).toBe(true);
      await expect(trigger).toBeFocused();
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("compound: Esc with the diagram lightbox open closes only the lightbox, and focus returns inside the sheet", async ({
    page,
  }) => {
    await loadPath(page, await waldorfRoute());
    await openFromRow(page, "rooms");
    // The first AVAILABLE slot: the seed's first embedded diagram has no snapshot
    // and renders as a placeholder with no button.
    const thumb = sheetDialog(page)
      .locator('[data-testid^="diagram-slot-"]:not([data-unavailable])')
      .first()
      .getByRole("button");
    await activate(page, thumb);
    await expect(page.getByTestId("diagrams-lightbox")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("diagrams-lightbox")).toHaveCount(0);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "rooms");
    await expect.poll(() => focusInsideSheet(page)).toBe(true);
    await expect(thumb).toBeFocused();
  });

  test("compound: Esc with the report modal open closes only the report modal, and focus returns inside the sheet", async ({
    page,
  }) => {
    await loadPath(page, await waldorfRoute());
    await openFromRow(page, "venue");
    const trigger = sheetDialog(page).getByTestId("card-report-trigger").first();
    await activate(page, trigger);
    await expect(page.getByTestId("report-modal-root")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("report-modal-root")).toHaveCount(0);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    await expect.poll(() => focusInsideSheet(page)).toBe(true);
    await expect(trigger).toBeFocused();
  });

  test("compound: Back to another route with the sheet and a nested dialog open leaves the destination page scrollable", async ({
    page,
  }) => {
    const route = await waldorfRoute();
    const res = await page.goto("/help/getting-started", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    // A client navigation into the crew page, so Back is the app router's own
    // route change (both trees swap in one commit), not a document load.
    await page.evaluate((href) => {
      (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push(
        href,
      );
    }, `${route}?s=venue`);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    await sheetDialog(page).getByTestId("card-report-trigger").first().click();
    await expect(page.getByTestId("report-modal-root")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.goBack();

    await expect(page).toHaveURL(/\/help\/getting-started$/);
    await expect(page.getByTestId("crew-shell-sections")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    const scrolled = await page.evaluate(async () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.min(200, max), behavior: "auto" });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      return { max, y: window.scrollY };
    });
    expect(scrolled.max, "PREMISE: the destination is taller than the viewport").toBeGreaterThan(0);
    expect(scrolled.y, "the destination page scrolls").toBeGreaterThan(0);
  });

  test("compound: a second day tap mid-crossfade wins: the running fade is replaced at once, never queued", async ({
    page,
  }) => {
    const SHOW_DAYS = ["2026-04-21", "2026-04-22", "2026-04-23"];
    const [, FIRST, SECOND] = SHOW_DAYS as [string, string, string];
    const seeded = await seedShowWithCrew({
      title: "Compound Crossfade Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: SHOW_DAYS,
        travelOut: "2026-04-24",
      },
      crew: [{ name: "Compound Crew", role: "A1" }],
      internal: {
        runOfShow: Object.fromEntries(
          SHOW_DAYS.map((iso) => [
            iso,
            {
              entries: [{ start: "7:00 AM", title: `Compound call ${iso}` }],
              showStart: "7:00 AM",
              showEnd: null,
              window: null,
            },
          ]),
        ),
      },
    });
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      await expect(page.getByTestId("today-run-of-show")).toBeVisible();
      const frames = await page.evaluate(
        ({ first, second }) =>
          new Promise<
            Array<{
              afterSecond: boolean;
              pass: Array<{ key: string; exiting: boolean; opacity: number }>;
              run: Array<{ exiting: boolean; opacity: number; text: string }>;
            }>
          >((resolve) => {
            const tap = (iso: string) =>
              document
                .querySelector<HTMLButtonElement>(
                  `[data-testid="crew-day-button"][data-day="${iso}"]`,
                )!
                .click();
            const out: Array<{
              afterSecond: boolean;
              pass: Array<{ key: string; exiting: boolean; opacity: number }>;
              run: Array<{ exiting: boolean; opacity: number; text: string }>;
            }> = [];
            let afterSecond = false;
            const read = () =>
              out.push({
                afterSecond,
                pass: [...document.querySelectorAll('[data-testid="crew-pass-body"]')].map((b) => ({
                  key: b.getAttribute("data-body") ?? "",
                  exiting: b.hasAttribute("data-exiting"),
                  opacity: Number(getComputedStyle(b).opacity),
                })),
                run: [...document.querySelectorAll('[data-testid="crew-run-body"]')].map((b) => ({
                  exiting: b.hasAttribute("data-exiting"),
                  opacity: Number(getComputedStyle(b).opacity),
                  text: b.textContent ?? "",
                })),
              });
            tap(first);
            const start = performance.now();
            const loop = () => {
              read();
              const t = performance.now() - start;
              // The second tap lands mid-fade: well inside --duration-normal (220ms).
              if (!afterSecond && t >= 60) {
                tap(second);
                afterSecond = true;
              }
              if (t < 900) requestAnimationFrame(loop);
              else resolve(out);
            };
            requestAnimationFrame(loop);
          }),
        { first: FIRST, second: SECOND },
      );
      const firstKey = `day:${FIRST}`;
      const secondKey = `day:${SECOND}`;
      const before = frames.filter((f) => !f.afterSecond);
      expect(
        before.some((f) => f.pass.some((b) => b.key === firstKey && !b.exiting && b.opacity < 1)),
        "PREMISE: the second tap landed while the first day was still fading in",
      ).toBe(true);
      const after = frames.filter((f) => f.afterSecond);
      // Never queued: from the first frame after the second tap, the second day's
      // body is mounted and present, and the first day's is leaving.
      expect(after[0]!.pass.some((b) => b.key === secondKey && !b.exiting)).toBe(true);
      for (const f of after) {
        expect(f.pass.filter((b) => !b.exiting).map((b) => b.key)).toEqual([secondKey]);
      }
      expect(
        after.filter((f) => f.pass.some((b) => b.key === firstKey && !b.exiting)),
        "the first day never comes back present",
      ).toEqual([]);
      // The second selection wins, on one opaque body in the pass and the run card.
      expect(frames.at(-1)!.pass).toEqual([{ key: secondKey, exiting: false, opacity: 1 }]);
      expect(frames.at(-1)!.run.map((b) => [b.exiting, b.opacity])).toEqual([[false, 1]]);
      expect(frames.at(-1)!.run[0]!.text).toContain(`Compound call ${SECOND}`);
      await expect(page.getByTestId("crew-pass")).toHaveAttribute("data-selection", secondKey);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("compound: the theme switch is unreachable while the sheet is open: the header is inert behind the scrim", async ({
    page,
  }) => {
    await loadPath(page, await waldorfRoute());
    const toggle = page.getByTestId("page-header").getByTestId("theme-toggle");
    await expect(toggle, "PREMISE: the header carries the theme switch").toBeVisible();
    expect(await toggle.evaluate((el) => el.closest("[inert]") !== null)).toBe(false);
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    // Opened without scrolling the page (a pointer click first scrolls the row
    // into view, which would take the header off screen and prove nothing).
    await row(page, "venue").dispatchEvent("click");
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    await settleOpen(page);
    const box = await rectOf(toggle);
    expect(box.top, "PREMISE: the header is on screen behind the sheet").toBeGreaterThanOrEqual(0);

    expect(await toggle.evaluate((el) => el.closest("[inert]") !== null), "inert").toBe(true);
    const hit = await toggle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top !== null && top.closest('[data-testid="crew-section-sheet"]') !== null;
    });
    expect(hit, "the sheet (its scrim or its panel) covers the theme switch").toBe(true);
    // Inert: focus cannot land on it, from a script or from anywhere else.
    expect(
      await toggle.evaluate((el) => {
        (el as HTMLElement).focus();
        return document.activeElement === el;
      }),
      "the inert switch refuses focus",
    ).toBe(false);
    expect(await focusInsideSheet(page), "focus stays in the sheet").toBe(true);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      theme,
    );
  });
});

/**
 * PR B plan Task 4: `budget` became `billing`, with `budget` kept as a legacy
 * alias (spec §5.1 "Legacy ids"). Old links keep opening the section for a lead
 * and land home for anyone the gate excludes; Back and Forward over an entry that
 * still carries the old value reopen Billing without stripping it. A seeded show
 * of its own: a lead holding financials and a crew member who is not one, each
 * viewed through the admin preview route (the harness rule "Viewer per case").
 */
test.describe("billing: the budget alias, compact (PR B Task 4)", () => {
  test.setTimeout(180_000);

  const FINANCIALS = {
    po: "PO-ALIAS-6604",
    proposal: "Proposal alias 3317",
    invoice: "Invoice alias 7720",
    invoice_notes: "Alias invoice note 2281",
  };
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Billing Alias Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
        travelOut: "2026-04-23",
      },
      crew: [
        { name: "Alias Lead", role: "TD", roleFlags: ["LEAD"] },
        { name: "Alias Crew", role: "A1" },
      ],
      internal: { financials: FINANCIALS },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  function preview(name: string): string {
    const member = seeded.crew.find((c) => c.name === name);
    if (!member) throw new Error(`no seeded crew member ${name}`);
    return `/admin/show/${seeded.slug}/preview/${member.id}`;
  }

  async function loadPath(page: Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  test("billing: ?s=budget opens the Billing sheet for a lead preview on initial load", async ({
    page,
  }) => {
    await loadPath(page, `${preview("Alias Lead")}?s=budget`);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "billing");
    await expect(sheetDialog(page)).toHaveAccessibleName(CREW_SECTION_LABELS.billing);
    const section = sheetDialog(page).getByTestId("section-billing");
    await expect(section).toBeVisible();
    for (const value of Object.values(FINANCIALS)) await expect(section).toContainText(value);
  });

  test("billing: Back then Forward over an in-app entry carrying s=budget closes and reopens Billing", async ({
    page,
  }) => {
    await loadPath(page, preview("Alias Lead"));
    await row(page, "billing").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "billing");
    await settleOpen(page);
    // The pushed entry now carries the old value, as an old in-app link left it.
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("s", "budget");
      window.history.replaceState(window.history.state, "", url);
    });

    await page.goBack();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();

    await page.goForward();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "billing");
    await expect(sheetDialog(page).getByTestId("section-billing")).toContainText(FINANCIALS.po);
    // An alias the viewer may open is not stripped (a canonicalized alias is kept).
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("budget");
  });

  test("billing: a non-lead's ?s=budget and ?s=billing land home with no Billing value", async ({
    page,
  }) => {
    for (const s of ["budget", "billing"]) {
      await loadPath(page, `${preview("Alias Crew")}?s=${s}`);
      await expect(sheetDialog(page), s).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections"), s).toBeVisible();
      await expect(row(page, "billing"), s).toHaveCount(0);
      const html = await page.content();
      for (const value of Object.values(FINANCIALS))
        expect(html, `${s}: ${value}`).not.toContain(value);
    }
    // Positive control: the lead's page carries every value.
    await loadPath(page, `${preview("Alias Lead")}?s=billing`);
    const html = await page.content();
    for (const value of Object.values(FINANCIALS)) expect(html, value).toContain(value);
  });
});

/**
 * PR B plan Task 9: Travel became two sections, Hotels and Transport, with
 * `travel` kept as a legacy alias of `hotels` (spec §5.1 "Legacy ids"), as Task 4
 * kept `budget` for `billing`. An old link opens Hotels; Back and Forward over an
 * entry that still carries `s=travel` reopen Hotels without stripping it.
 * Transport is listed for an admin, for a viewer the transport gate admits and for
 * a viewer with a flight of their own, and its sheet shows the crew-only "Your
 * flight" card above the transport body only the gate admits. A seeded show of its
 * own; a plain admin on the share route, every crew identity through the admin
 * preview route (the harness rule "Viewer per case").
 *
 * The new ids are spelled as strings here and their labels read from the show
 * section registry, which is where a moved section's label comes from
 * (`isCrewMovedSection` in lib/crew/crewSections.ts): these cases are written
 * before the crew id union carries `hotels` and `transport`, and typecheck on
 * both trees.
 */
test.describe("hotels and transport: the travel alias and the transport gate, compact (PR B Task 9)", () => {
  test.setTimeout(180_000);

  const HOTELS_LABEL = showSection("hotels").label;
  const TRANSPORT_LABEL = showSection("transport").label;

  /** 2026-04-21 is a Tuesday: the leg's time line below names it. */
  const LEG_DAY = "2026-04-21";
  /** On the leg: the transport gate admits her by name. */
  const RIDER = { name: "Rhea Rider", role: "A1" };
  /** A flight of her own and no leg: Transport is listed for her flight alone. */
  const FLYER = {
    name: "Fiona Flyer",
    role: "V1",
    flightInfo: "QF77 4/19 AA2201 LGA - ORD 9:05am - 10:50am",
  };
  /** No flight and no leg: no Transport. */
  const GROUNDED = { name: "Gus Grounded", role: "L1" };
  /** Days unconfirmed, so every date of hers is suppressed; on the leg too. */
  const UNCONFIRMED = {
    name: "Uma Unconfirmed",
    role: "A2",
    dateRestriction: { kind: "unknown_asterisk", days: null } as const,
  };
  /** Stay dates outside the show's own days, so no show date can stand in for them. */
  const HOTEL = {
    ordinal: 1,
    hotelName: "Larkspur Harbor Hotel",
    hotelAddress: "88 Quay Street",
    checkIn: "2026-04-18",
    checkOut: "2026-04-24",
    confirmationNo: "LHH-60417",
    notes: "Late checkout approved for the crew",
    names: [RIDER.name, FLYER.name, GROUNDED.name, UNCONFIRMED.name],
  };
  const HOTEL_DATES = [HOTEL.checkIn, HOTEL.checkOut];
  const LEG = {
    stage: "Shuttle to the venue",
    date: LEG_DAY,
    time: "2:00pm",
    assigned_names: [RIDER.name, UNCONFIRMED.name],
  };
  const TRANSPORT = {
    driverName: "Marta Kestrel",
    driverPhone: "215-555-0177",
    vehicle: "White Transit 350",
    licensePlate: "KTR5521",
    parking: "Lot C behind the loading dock",
    notes: "Call the driver from baggage claim",
    loadoutName: "Lou Dockhand",
    loadoutPhone: "215-555-0190",
    schedule: [LEG],
  };
  /** Every transport value a viewer the gate excludes must not receive. */
  const TRANSPORT_FIELDS = [
    TRANSPORT.driverName,
    TRANSPORT.driverPhone,
    TRANSPORT.vehicle,
    TRANSPORT.licensePlate,
    TRANSPORT.parking,
    TRANSPORT.notes,
    TRANSPORT.loadoutName,
    TRANSPORT.loadoutPhone,
    LEG.stage,
  ];

  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Hotels Transport Split Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [LEG_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      crew: [RIDER, FLYER, GROUNDED, UNCONFIRMED],
      hotelReservations: [HOTEL],
      transportation: TRANSPORT,
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  /** The share route, where the signed-in admin views the show as an admin. */
  function share(): string {
    return `/show/${seeded.slug}/${seeded.shareToken}`;
  }

  function preview(name: string): string {
    const member = seeded.crew.find((c) => c.name === name);
    if (!member) throw new Error(`no seeded crew member ${name}`);
    return `/admin/show/${seeded.slug}/preview/${member.id}`;
  }

  async function loadPath(page: Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /** An "All sections" row, by an id spelled as a string (see the block comment). */
  function listRow(page: Page, id: string): Locator {
    return page.getByTestId("crew-all-sections").locator(`[data-section="${id}"]`);
  }

  /** The page's server response: the HTML document (its inline RSC included) and the RSC payload. */
  async function payloadOf(page: Page, path: string): Promise<string> {
    const html = await page.request.get(path);
    expect(html.status(), `${path} HTML`).toBe(200);
    const rsc = await page.request.get(path, { headers: { RSC: "1" } });
    expect(rsc.status(), `${path} RSC`).toBe(200);
    const rscBody = await rsc.text();
    // PREMISE: the RSC request returned the flight payload, not the document again.
    expect(rscBody.startsWith("<!DOCTYPE"), `${path} RSC answered with HTML`).toBe(false);
    return `${await html.text()}\n${rscBody}`;
  }

  test("hotels: ?s=travel opens the Hotels sheet on initial load, the stay whole", async ({
    page,
  }) => {
    await loadPath(page, `${share()}?s=travel`);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "hotels");
    await expect(sheetDialog(page)).toHaveAccessibleName(HOTELS_LABEL);
    const section = sheetDialog(page).getByTestId("section-hotels");
    await expect(section).toBeVisible();
    const card = section.locator('[data-card-id="travel-hotels"]');
    await expect(card.getByRole("heading", { level: 3, name: HOTELS_LABEL })).toBeVisible();
    const stay = card.getByTestId("crew-panel-hotel-card");
    await expect(stay).toHaveCount(1);
    for (const value of [HOTEL.hotelName, HOTEL.hotelAddress, HOTEL.confirmationNo, HOTEL.notes])
      await expect(stay, value).toContainText(value);
    await expect(
      stay.getByTestId("hotel-stay-check-in").locator(`time[datetime="${HOTEL.checkIn}"]`),
    ).toHaveCount(1);
    await expect(
      stay.getByTestId("hotel-stay-check-out").locator(`time[datetime="${HOTEL.checkOut}"]`),
    ).toHaveCount(1);
    // One section replaced by two: no Travel body is left on the page.
    await expect(page.getByTestId("section-travel")).toHaveCount(0);
  });

  test("hotels: Back then Forward over an in-app entry carrying s=travel closes and reopens Hotels", async ({
    page,
  }) => {
    await loadPath(page, share());
    await listRow(page, "hotels").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "hotels");
    await settleOpen(page);
    // The pushed entry now carries the old value, as an old in-app link left it.
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("s", "travel");
      window.history.replaceState(window.history.state, "", url);
    });

    await page.goBack();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();

    await page.goForward();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "hotels");
    await expect(sheetDialog(page).getByTestId("section-hotels")).toContainText(HOTEL.hotelName);
    // An alias the viewer may open is not stripped (a canonicalized alias is kept).
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("travel");
  });

  test("transport: a flight-only viewer sees Transport listed with Your flight alone, and the HTML and RSC payload carry no transport field (preview route)", async ({
    page,
  }) => {
    await loadPath(page, preview(FLYER.name));
    await expect(listRow(page, "transport")).toBeVisible();
    await listRow(page, "transport").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "transport");
    await expect(sheetDialog(page)).toHaveAccessibleName(TRANSPORT_LABEL);
    const section = sheetDialog(page).getByTestId("section-transport");
    const flight = section.locator('[data-card-id="travel-flight"]');
    await expect(flight.getByText("Your flight", { exact: true }).first()).toBeVisible();
    await expect(flight.getByTestId("travel-flight")).toContainText("AA2201");
    // The flight card is the only card: the transport body is the gate's, and the gate
    // does not admit her.
    const cardIds = await section
      .locator("[data-card-id]")
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("data-card-id")))]);
    expect(cardIds).toEqual(["travel-flight"]);
    await expect(section.locator('[data-card-id="travel-getting-there"]')).toHaveCount(0);

    const flyer = await payloadOf(page, preview(FLYER.name));
    // PREMISE: the payload is this viewer's page with the Transport body in it, so a
    // missing field is withheld, not unrendered.
    expect(flyer).toContain("AA2201");
    expect(flyer).toContain(HOTEL.hotelName);
    expect(flyer).toContain('data-testid="section-transport"');
    expect(TRANSPORT_FIELDS.filter((f) => flyer.includes(f))).toEqual([]);
    // POSITIVE CONTROL: a viewer the gate admits, on the leg, gets every field.
    const rider = await payloadOf(page, preview(RIDER.name));
    expect(rider).toContain('data-card-id="travel-getting-there"');
    expect(TRANSPORT_FIELDS.filter((f) => !rider.includes(f))).toEqual([]);
  });

  test("transport: a viewer with no flight and no leg has no Transport row, and ?s=transport lands home (preview route)", async ({
    page,
  }) => {
    for (const search of ["", "?s=transport"]) {
      await loadPath(page, `${preview(GROUNDED.name)}${search}`);
      // PREMISE: the list carries Task 9's ids, so a missing Transport row is the gate's doing.
      await expect(listRow(page, "hotels"), search).toBeVisible();
      await expect(listRow(page, "transport"), search).toHaveCount(0);
      await expect(sheetDialog(page), search).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections"), search).toBeVisible();
      // Not entitled, so no Transport body is built for this viewer at all.
      await expect(page.getByTestId("section-transport"), search).toHaveCount(0);
      const html = await page.content();
      for (const f of TRANSPORT_FIELDS) expect(html, `${search}: ${f}`).not.toContain(f);
    }
  });

  test("hotels: a date-suppressed viewer's Hotels sheet shows the stay without its dates, and the HTML and RSC payload carry no hotel date (preview route)", async ({
    page,
  }) => {
    await loadPath(page, `${preview(UNCONFIRMED.name)}?s=hotels`);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "hotels");
    const stay = sheetDialog(page)
      .getByTestId("section-hotels")
      .getByTestId("crew-panel-hotel-card");
    await expect(stay).toHaveCount(1);
    await expect(stay).toContainText(HOTEL.hotelName);
    await expect(stay.getByTestId("hotel-stay-check-in")).toHaveCount(0);
    await expect(stay.getByTestId("hotel-stay-check-out")).toHaveCount(0);
    await expect(stay.locator("time")).toHaveCount(0);
    const suppressed = await payloadOf(page, preview(UNCONFIRMED.name));
    // PREMISE: the payload is this viewer's page with the stay in it.
    expect(suppressed).toContain(HOTEL.hotelName);
    expect(HOTEL_DATES.filter((d) => suppressed.includes(d))).toEqual([]);

    // POSITIVE CONTROL: an unrestricted viewer on the same stay gets both dates.
    await loadPath(page, `${preview(RIDER.name)}?s=hotels`);
    const open = sheetDialog(page)
      .getByTestId("section-hotels")
      .getByTestId("crew-panel-hotel-card");
    await expect(
      open.getByTestId("hotel-stay-check-in").locator(`time[datetime="${HOTEL.checkIn}"]`),
    ).toHaveCount(1);
    await expect(
      open.getByTestId("hotel-stay-check-out").locator(`time[datetime="${HOTEL.checkOut}"]`),
    ).toHaveCount(1);
    const rider = await payloadOf(page, preview(RIDER.name));
    expect(HOTEL_DATES.filter((d) => !rider.includes(d))).toEqual([]);
  });

  test("transport: a leg's time line reads leaves, its short date and its time, and drops the date for a date-suppressed viewer", async ({
    page,
  }) => {
    await loadPath(page, `${share()}?s=transport`);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "transport");
    const card = sheetDialog(page)
      .getByTestId("section-transport")
      .locator('[data-card-id="travel-getting-there"]');
    await expect(card.getByRole("heading", { level: 3, name: TRANSPORT_LABEL })).toBeVisible();
    for (const cell of ["Driver", "Load out", "Vehicle", "Parking"])
      await expect(card, cell).toContainText(cell);
    await expect(card).toContainText(LEG.stage);
    await expect(card).toContainText(TRANSPORT.notes);
    // "2:00pm" through normalizeMeridiem, on Tuesday April 21, the date in a <time>
    // (spec line 419 as amended by the PR B invariant-8 gate, row 8).
    await expect(card).toContainText("leaves Tue Apr 21, 2:00 PM");
    await expect(card.locator(`time[datetime="${LEG_DAY}"]`)).toHaveText("Tue Apr 21, 2:00 PM");

    // On the leg with her days unconfirmed: the gate admits her, the weekday is withheld.
    await loadPath(page, `${preview(UNCONFIRMED.name)}?s=transport`);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "transport");
    const suppressed = sheetDialog(page)
      .getByTestId("section-transport")
      .locator('[data-card-id="travel-getting-there"]');
    await expect(suppressed).toContainText(LEG.stage);
    await expect(suppressed).toContainText("leaves 2:00 PM");
    await expect(suppressed).not.toContainText("Tue");
  });

  test("gear alias: every historical section id opens its section, or the home, for an admin", async ({
    page,
  }) => {
    // The historical union at lib/crew/resolveActiveSection.ts:1 as of 7e927e927,
    // then the ids PR B added, each with the sheet it opens now (null: the home, no
    // sheet). An entitled, unlisted Agenda opens from a link all the same.
    const HISTORICAL_IDS: ReadonlyArray<readonly [string, string | null]> = [
      ["today", null],
      ["schedule", "schedule"],
      ["venue", "venue"],
      ["travel", "hotels"],
      ["crew", "crew"],
      ["gear", "rooms"],
      ["budget", "billing"],
      ["billing", "billing"],
      ["contacts", "contacts"],
      ["hotels", "hotels"],
      ["transport", "transport"],
      ["agenda", "agenda"],
    ];
    for (const [s, opens] of HISTORICAL_IDS) {
      await loadPath(page, `${share()}?s=${s}`);
      if (opens === null) {
        await expect(sheetDialog(page), s).toHaveCount(0);
        await expect(page.getByTestId("crew-all-sections"), s).toBeVisible();
      } else {
        await expect(sheetDialog(page), s).toHaveAttribute("data-section", opens);
        await expect(sheetDialog(page).getByTestId(`section-${opens}`), s).toBeVisible();
      }
    }
  });
});

/**
 * PR B plan Task 10: the agenda leaves the Schedule section for an Agenda section
 * of its own (spec §6.2 `agenda` row). Agenda is entitled whenever the viewer's
 * dates are not suppressed and listed only when the show has an agenda link with
 * a file (plan decision 1), so it is the one section that can be entitled and
 * unlisted: a refresh that removes its content keeps an open sheet on its empty
 * state, a deep link or a history entry opens it with no row behind it, and a
 * viewer whose dates are suppressed has neither the section nor any agenda line.
 * Shows that a case mutates are seeded per case; a plain admin on the share
 * route, every crew identity through the admin preview route.
 *
 * The id is spelled as a string and its label read from the show section
 * registry, so these cases typecheck before the crew id union carries `agenda`.
 */
test.describe("agenda: the Agenda section, compact (PR B Task 10)", () => {
  test.setTimeout(180_000);

  const BASE_HEADERS = {
    "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
    Authorization: `Bearer ${TEST_AUTH_SECRET}`,
  };
  const DATES = {
    travelIn: "2026-04-19",
    set: "2026-04-20",
    showDays: ["2026-04-21", "2026-04-22"],
    travelOut: "2026-04-23",
  };
  const AGENDA_LABEL = showSection("agenda").label;
  /** The one session line, distinctive enough that its absence means withheld. */
  const SESSION_TITLE = "Zephyr keynote rehearsal";
  const DAY_LABEL = "Tuesday, April 21, 2026";
  /** One agenda PDF with a file and a high-confidence schedule, so the section lists. */
  const AGENDA_LINKS = [
    {
      label: "AGENDA",
      fileId: "agendaSectionE2E01",
      extracted: {
        confidence: "high",
        corrections: 0,
        extractorVersion: 2,
        days: [
          {
            dayLabel: DAY_LABEL,
            date: null,
            sessions: [
              {
                time: "9:00 AM",
                title: SESSION_TITLE,
                room: "Ballroom A",
                tracks: [],
                drift: null,
              },
            ],
          },
        ],
      },
    },
  ];
  /** Dates confirmed: Agenda is hers whenever the show has one. */
  const ADA = { name: "Ada Agenda", role: "A1" };
  /** Days unconfirmed, so every date of hers is suppressed: no Agenda at all. */
  const UNA = {
    name: "Una Unconfirmed",
    role: "A2",
    dateRestriction: { kind: "unknown_asterisk", days: null } as const,
  };

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders(BASE_HEADERS);
  });

  async function loadPath(page: Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /** An "All sections" row, by an id spelled as a string (see the block comment). */
  function listRow(page: Page, id: string): Locator {
    return page.getByTestId("crew-all-sections").locator(`[data-section="${id}"]`);
  }

  function seedAgendaShow(title: string, schedulePhases?: Record<string, ["Set"]>) {
    return seedShowWithCrew({
      title,
      dates: DATES,
      agendaLinks: AGENDA_LINKS as never,
      ...(schedulePhases === undefined ? {} : { schedulePhases }),
      crew: [ADA, UNA],
    });
  }

  function previewOf(seeded: Awaited<ReturnType<typeof seedShowWithCrew>>, name: string): string {
    const member = seeded.crew.find((c) => c.name === name);
    if (!member) throw new Error(`no seeded crew member ${name}`);
    return `/admin/show/${seeded.slug}/preview/${member.id}`;
  }

  /** The page's text and attributes, without the inline scripts that carry the first render's payload. */
  function renderedPage(page: Page): Promise<string> {
    return page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      for (const el of clone.querySelectorAll("script, template")) el.remove();
      return clone.outerHTML;
    });
  }

  test("agenda: a refresh that removes the open Agenda section's content keeps the sheet open on its empty state, in place, while the list drops Agenda", async ({
    page,
  }) => {
    const seeded = await seedAgendaShow("Agenda Refresh Show");
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      await listRow(page, "agenda").click();
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
      await expect(sheetDialog(page)).toHaveAccessibleName(AGENDA_LABEL);
      await settleOpen(page);
      const section = sheetDialog(page).getByTestId("section-agenda");
      await expect(section).toContainText(SESSION_TITLE);
      // Mark the dialog and the body's crossfade wrapper: a remount or a re-keyed
      // crossfade (an animation) would replace them, and the marks would be gone.
      await page.evaluate(() => {
        for (const sel of [
          '[data-testid="crew-section-sheet-dialog"]',
          '[data-testid="crew-section-transition"]',
        ]) {
          (document.querySelector(sel) as unknown as { __agenda?: true }).__agenda = true;
        }
      });

      await renderFresh(page, BASE_HEADERS);
      updateShowLocked(seeded.driveFileId, { agenda_links: [] });
      await refreshFromServer(page);

      await expect(listRow(page, "agenda")).toHaveCount(0);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
      await expect(section.getByText("No agenda on file yet.", { exact: true })).toBeVisible();
      await expect(section).not.toContainText(SESSION_TITLE);
      const kept = await page.evaluate(() =>
        [
          '[data-testid="crew-section-sheet-dialog"]',
          '[data-testid="crew-section-transition"]',
        ].map(
          (sel) =>
            (document.querySelector(sel) as unknown as { __agenda?: true } | null)?.__agenda ===
            true,
        ),
      );
      expect(kept, "the same dialog and the same crossfade wrapper: updated in place").toEqual([
        true,
        true,
      ]);
      expect(new URL(page.url()).searchParams.get("s")).toBe("agenda");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("agenda: ?s=agenda on a show with no agenda link opens the Agenda sheet on its empty state, with no Agenda row", async ({
    page,
  }) => {
    // The Waldorf seed's parsed agenda_links is empty: its Agenda is entitled and unlisted.
    const { slug, shareToken } = await lookupSlugAndToken();
    await loadPath(page, `/show/${slug}/${shareToken}?s=agenda`);
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
    await expect(sheetDialog(page)).toHaveAccessibleName(AGENDA_LABEL);
    await expect(
      sheetDialog(page)
        .getByTestId("section-agenda")
        .getByText("No agenda on file yet.", { exact: true }),
    ).toBeVisible();
    // PREMISE: the list is rendered, and lists the sections around Agenda's slot.
    await expect(listRow(page, "schedule")).toHaveCount(1);
    await expect(listRow(page, "agenda")).toHaveCount(0);
  });

  test("agenda: Back then Forward over an in-app entry carrying s=agenda with no content reopens the Agenda sheet", async ({
    page,
  }) => {
    const { slug, shareToken } = await lookupSlugAndToken();
    await loadPath(page, `/show/${slug}/${shareToken}`);
    await listRow(page, "venue").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
    await settleOpen(page);
    // The pushed entry now names the unlisted Agenda, as an in-page link would.
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("s", "agenda");
      window.history.replaceState(window.history.state, "", url);
    });

    await page.goBack();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();

    await page.goForward();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
    await expect(
      sheetDialog(page)
        .getByTestId("section-agenda")
        .getByText("No agenda on file yet.", { exact: true }),
    ).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("agenda");
    await expect(listRow(page, "agenda")).toHaveCount(0);
  });

  test("agenda: a date-suppressed viewer's ?s=agenda lands home, and a popstate to it replaces s away (preview route)", async ({
    page,
  }) => {
    const seeded = await seedAgendaShow("Agenda Suppressed Show");
    try {
      await loadPath(page, `${previewOf(seeded, UNA.name)}?s=agenda`);
      await expect(sheetDialog(page)).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();
      await expect(listRow(page, "agenda")).toHaveCount(0);
      await expect(page.getByTestId("section-agenda")).toHaveCount(0);
      expect(await renderedPage(page)).not.toContain(SESSION_TITLE);

      await listRow(page, "venue").click();
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
      await settleOpen(page);
      await page.evaluate(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("s", "agenda");
        window.history.replaceState(window.history.state, "", url);
      });
      await page.goBack();
      await expect(sheetDialog(page)).toHaveCount(0);
      await page.goForward();
      // Not entitled: the controller has no body to open and replaces s away.
      await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
      await expect(sheetDialog(page)).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();

      // POSITIVE CONTROL: a viewer whose dates are confirmed opens Agenda on the same show.
      await loadPath(page, `${previewOf(seeded, ADA.name)}?s=agenda`);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
      await expect(sheetDialog(page).getByTestId("section-agenda")).toContainText(SESSION_TITLE);
      await expect(listRow(page, "agenda")).toHaveCount(1);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("agenda: a refresh after which the previewed viewer's dates are suppressed closes the Agenda sheet to home and leaves no agenda line on the page", async ({
    page,
  }) => {
    const seeded = await seedAgendaShow("Agenda Lost Show");
    const ada = seeded.crew.find((c) => c.name === ADA.name)!;
    try {
      // One refresh in flight, this case's own (the billing lost-entitlement case's reason).
      await page.route("**/api/realtime/subscriber-token", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
      );
      await loadPath(page, previewOf(seeded, ADA.name));
      await listRow(page, "agenda").click();
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "agenda");
      await settleOpen(page);
      // Positive control: the lines this case searches for are on the page now.
      const before = await renderedPage(page);
      expect(before).toContain(SESSION_TITLE);
      expect(before).toContain(DAY_LABEL);
      await page.evaluate(() => {
        const w = window as unknown as { __backs: number };
        w.__backs = 0;
        const back = history.back.bind(history);
        history.back = () => {
          w.__backs += 1;
          back();
        };
      });

      await renderFresh(page, BASE_HEADERS);
      await setDateRestrictionLocked(seeded.driveFileId, ada.id, {
        kind: "unknown_asterisk",
        days: null,
      });
      await refreshFromServer(page);

      await expect(listRow(page, "agenda")).toHaveCount(0);
      await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();
      expect(
        await page.evaluate(() => (window as unknown as { __backs: number }).__backs),
        "closed through history.back(), the pushed entry's close row",
      ).toBe(1);
      const after = await renderedPage(page);
      expect(after).not.toContain(SESSION_TITLE);
      expect(after).not.toContain(DAY_LABEL);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("agenda: the list follows CREW_SECTION_IDS over the viewer's members, each moved id with its registry label", async ({
    page,
  }) => {
    // A pack-list phase on the pinned day (PR C Task 6: Pack list's gate).
    const seeded = await seedAgendaShow("Agenda Order Show", { "2026-04-21": ["Set"] });
    try {
      await loadPath(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      // An admin on a show with an agenda file, on a pack-list day, is a member of every
      // crew section.
      const ids = await page
        .getByTestId("crew-all-sections-row")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
      expect(ids).toEqual([...CREW_SECTION_IDS]);
      expect(ids.indexOf("agenda")).toBe(ids.indexOf("schedule") + 1);
      const moved: readonly string[] = CREW_MOVED_IDS;
      for (const id of CREW_SECTION_IDS) {
        const label = page.locator(`#crew-all-sections-label-${id}`);
        if (moved.includes(id)) {
          await expect(label, id).toHaveText(showSection(id as ShowSectionId).label);
        } else {
          // A section not yet moved keeps the crew's own label, which is not the registry's.
          await expect(label, id).toHaveText(CREW_SECTION_LABELS[id]);
        }
      }
      await expect(page.locator("#crew-all-sections-label-schedule")).not.toHaveText(
        showSection("schedule").label,
      );
      // The moved set, pinned whole in this one place: the seven sections spec line
      // 324 moves in PR B, and each PR C moves in its own task. Every other check
      // reads CREW_MOVED_IDS, so this is what catches a section left out of it (it
      // would keep its crew label and glyph).
      expect([...moved].sort()).toEqual(
        [
          "agenda",
          "billing",
          "contacts",
          "crew",
          "event",
          "hotels",
          "packlist",
          "rooms",
          "transport",
          "venue",
        ].sort(),
      );
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});

/**
 * PR C plan Task 6: the pack list leaves Gear for a section of its own, and its
 * visibility rule becomes an entitlement gate (plan decision 1): on a day whose
 * phases hold none of `PACK_LIST_VISIBLE_PHASES`, or for a viewer whose stages
 * exclude the day's phase, no body is built, `?s=packlist` resolves home, a
 * `popstate` replaces it away, and a refresh that crosses into such a day closes an
 * open sheet through the lost-entitlement path (spec lines 240, 257, 258, 372).
 * There is no content rule: a member with no pull sheet opens the empty state.
 *
 * Each case seeds its own show, whose phase for the pinned day is the case's input
 * (harness rule "Pack list seeds"). A plain admin on the share route, a crew
 * identity through the admin preview route. The id is spelled as a string, as the
 * Agenda block's is, so these cases typecheck before the crew id union carries it.
 */
test.describe("pack list: the Pack list section, compact (PR C Task 6)", () => {
  test.setTimeout(180_000);

  const BASE_HEADERS = {
    "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
    Authorization: `Bearer ${TEST_AUTH_SECRET}`,
  };
  /** The pinned clock's day in the show's timezone. */
  const PINNED_DAY = "2026-04-21";
  const DATES = {
    travelIn: "2026-04-19",
    set: "2026-04-20",
    showDays: [PINNED_DAY, "2026-04-22"],
    travelOut: "2026-04-23",
  };
  const PACK_LABEL = showSection("packlist").label;
  const EMPTY_STATE = "No pack list on file yet.";
  /** The one case label, distinctive enough that its absence means withheld. */
  const CASE_LABEL = "Zephyr audio rack";
  const ITEM_NAME = "Quartz stage box";
  const RAW_SNIPPET = "2 | Audio | Stage | Quartz stage box | TRUE";
  const PULL_SHEET = [
    {
      caseLabel: CASE_LABEL,
      items: [{ qty: 2, cat: "Audio", subCat: null, item: ITEM_NAME, rawSnippet: RAW_SNIPPET }],
    },
  ];
  /** No stage restriction: the day's phase alone decides. */
  const PIA = { name: "Pia Packer", role: "A1" };
  /** Works the Strike alone, so a Set day is not hers. */
  const STELLA = {
    name: "Stella Strike",
    role: "A2",
    stageRestriction: { kind: "explicit", stages: ["Strike"] } as const,
  };

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders(BASE_HEADERS);
  });

  async function loadPath(page: Page, path: string): Promise<void> {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
  }

  /** An "All sections" row, by an id spelled as a string (see the block comment). */
  function listRow(page: Page, id: string): Locator {
    return page.getByTestId("crew-all-sections").locator(`[data-section="${id}"]`);
  }

  function seedPackShow(
    title: string,
    phase: "Set" | "Strike" | "Load Out" | "Show" | "Load In",
    pullSheet: typeof PULL_SHEET | null = PULL_SHEET,
  ) {
    return seedShowWithCrew({
      title,
      dates: DATES,
      schedulePhases: { [PINNED_DAY]: [phase] },
      pullSheet,
      crew: [PIA, STELLA],
    });
  }

  type Seeded = Awaited<ReturnType<typeof seedPackShow>>;
  const share = (seeded: Seeded) => `/show/${seeded.slug}/${seeded.shareToken}`;

  function previewOf(seeded: Seeded, name: string): string {
    const member = seeded.crew.find((c) => c.name === name);
    if (!member) throw new Error(`no seeded crew member ${name}`);
    return `/admin/show/${seeded.slug}/preview/${member.id}`;
  }

  /**
   * The page's server response: the HTML document (its inline RSC included) and the RSC
   * payload. The frozen clock rides on each request: `page.setExtraHTTPHeaders` reaches
   * the page's own requests, not `page.request`, and the gate reads the server's day.
   */
  async function payloadOf(page: Page, path: string): Promise<string> {
    const html = await page.request.get(path, { headers: BASE_HEADERS });
    expect(html.status(), `${path} HTML`).toBe(200);
    const rsc = await page.request.get(path, { headers: { ...BASE_HEADERS, RSC: "1" } });
    expect(rsc.status(), `${path} RSC`).toBe(200);
    const rscBody = await rsc.text();
    // PREMISE: the RSC request returned the flight payload, not the document again.
    expect(rscBody.startsWith("<!DOCTYPE"), `${path} RSC answered with HTML`).toBe(false);
    return `${await html.text()}\n${rscBody}`;
  }

  /** The page's text and attributes, without the inline scripts that carry the first render's payload. */
  function renderedPage(page: Page): Promise<string> {
    return page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      for (const el of clone.querySelectorAll("script, template")) el.remove();
      return clone.outerHTML;
    });
  }

  test("pack list: on a Set day the section is listed with its peek, and ?s=packlist opens the sheet on initial load, in the server HTML and after hydration", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Set Day Show", "Set");
    try {
      await loadPath(page, share(seeded));
      await expect(listRow(page, "packlist")).toBeVisible();
      await expect(listRow(page, "packlist")).toContainText(PACK_LABEL);
      await expect(listRow(page, "packlist")).toContainText("1 case");

      const res = await page.request.get(`${share(seeded)}?s=packlist`, { headers: BASE_HEADERS });
      const html = await res.text();
      const dialogAt = html.search(/<[^>]*data-testid="crew-section-sheet-dialog"[^>]*>/);
      expect(dialogAt, "the open sheet is in the server HTML").toBeGreaterThan(-1);
      expect(html.slice(dialogAt, html.indexOf(">", dialogAt) + 1)).toContain(
        'data-section="packlist"',
      );
      expect(html.indexOf('data-testid="section-packlist"', dialogAt)).toBeGreaterThan(dialogAt);

      await loadPath(page, `${share(seeded)}?s=packlist`);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "packlist");
      await expect(sheetDialog(page)).toHaveAccessibleName(PACK_LABEL);
      const section = sheetDialog(page).getByTestId("section-packlist");
      await expect(section).toContainText(CASE_LABEL);
      const panel = section.locator('[data-card-id="gear-pack-list"]');
      await expect(panel.getByRole("heading", { level: 3 })).toHaveText(PACK_LABEL);
      // The numbered list, its item and raw row behind the case's own disclosure.
      await expect(panel.locator("ol > li")).toHaveCount(PULL_SHEET.length);
      await panel.locator("summary").first().click();
      await expect(panel.getByTestId("crew-panel-pack-item-raw-snippet")).toHaveText(RAW_SNIPPET);
      expect(new URL(page.url()).searchParams.get("s")).toBe("packlist");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: on a Show day it is unlisted, ?s=packlist lands home, a popstate to it replaces s away, and neither the HTML nor the RSC payload holds a case label", async ({
    page,
  }) => {
    const showDay = await seedPackShow("Pack Show Day Show", "Show");
    const setDay = await seedPackShow("Pack Control Day Show", "Set");
    try {
      await loadPath(page, `${share(showDay)}?s=packlist`);
      await expect(sheetDialog(page)).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();
      // PREMISE: the list is built, so a missing row is the gate's doing.
      await expect(listRow(page, "venue")).toBeVisible();
      await expect(listRow(page, "packlist")).toHaveCount(0);
      await expect(page.getByTestId("section-packlist")).toHaveCount(0);

      await listRow(page, "venue").click();
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
      await settleOpen(page);
      await page.evaluate(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("s", "packlist");
        window.history.replaceState(window.history.state, "", url);
      });
      await page.goBack();
      await expect(sheetDialog(page)).toHaveCount(0);
      await page.goForward();
      // Not entitled: the controller has no body to open and replaces s away.
      await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
      await expect(sheetDialog(page)).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();

      const withheld = await payloadOf(page, `${share(showDay)}?s=packlist`);
      // PREMISE: the payload is the page, with the rest of its bodies in it.
      expect(withheld).toContain('data-testid="section-venue"');
      expect(withheld).not.toContain('data-testid="section-packlist"');
      for (const line of [CASE_LABEL, ITEM_NAME, RAW_SNIPPET]) {
        expect(withheld, line).not.toContain(line);
      }
      // POSITIVE CONTROL: the same request on a Set day carries every line.
      const shown = await payloadOf(page, `${share(setDay)}?s=packlist`);
      expect(shown).toContain('data-testid="section-packlist"');
      for (const line of [CASE_LABEL, ITEM_NAME, RAW_SNIPPET]) expect(shown, line).toContain(line);
    } finally {
      await deleteSeededShow(showDay.driveFileId);
      await deleteSeededShow(setDay.driveFileId);
    }
  });

  test("pack list: a refresh that moves the show's phase off a pack-list phase closes the open sheet to home without animation and leaves no case label on the page", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Lost Show", "Strike");
    try {
      // One refresh in flight, this case's own (the billing lost-entitlement case's reason).
      await page.route("**/api/realtime/subscriber-token", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
      );
      await loadPath(page, share(seeded));
      await listRow(page, "packlist").click();
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "packlist");
      await settleOpen(page);
      // Positive control: the label this case searches for is on the page now.
      expect(await renderedPage(page)).toContain(CASE_LABEL);
      await page.evaluate(() => {
        const w = window as unknown as { __backs: number };
        w.__backs = 0;
        const back = history.back.bind(history);
        history.back = () => {
          w.__backs += 1;
          back();
        };
      });
      // Every DOM change from here on: is the row still listed, is the sheet still mounted.
      await page.evaluate(() => {
        const log: Array<{ row: boolean; sheet: boolean }> = [];
        (window as unknown as { __compoundLog: typeof log }).__compoundLog = log;
        new MutationObserver(() => {
          log.push({
            row:
              document.querySelector(
                '[data-testid="crew-all-sections"] [data-section="packlist"]',
              ) !== null,
            sheet: document.querySelector('[data-testid="crew-section-sheet"]') !== null,
          });
        }).observe(document.body, { childList: true, subtree: true, attributes: true });
      });

      await renderFresh(page, BASE_HEADERS);
      updateShowLocked(seeded.driveFileId, {
        event_details: { schedule_phases: { [PINNED_DAY]: ["Show"] } },
      });
      await refreshFromServer(page);

      await expect(listRow(page, "packlist")).toHaveCount(0);
      await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();
      expect(
        await page.evaluate(() => (window as unknown as { __backs: number }).__backs),
        "closed through history.back(), the pushed entry's close row",
      ).toBe(1);
      const log = await page.evaluate(
        () =>
          (window as unknown as { __compoundLog: Array<{ row: boolean; sheet: boolean }> })
            .__compoundLog,
      );
      expect(
        log.some((e) => !e.row),
        "PREMISE: the observer saw the row leave",
      ).toBe(true);
      expect(
        log.filter((e) => !e.row && e.sheet),
        "the sheet left in the same commit as the row: no exit slide holding the old body",
      ).toEqual([]);
      expect(await renderedPage(page)).not.toContain(CASE_LABEL);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: a Set day with no pull sheet lists the section and opens its empty state", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Empty Show", "Set", null);
    try {
      await loadPath(page, share(seeded));
      await expect(listRow(page, "packlist")).toBeVisible();
      // A section with nothing to count has no peek line.
      await expect(listRow(page, "packlist")).toHaveText(PACK_LABEL);
      await listRow(page, "packlist").click();
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "packlist");
      const section = sheetDialog(page).getByTestId("section-packlist");
      await expect(section.getByText(EMPTY_STATE, { exact: true })).toBeVisible();
      await expect(section.locator('[data-card-id="gear-pack-list"]')).toHaveCount(0);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: a stage-restricted viewer whose stages exclude the day's phase is not listed, and ?s=packlist lands home (preview route)", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Stage Show", "Set");
    try {
      await loadPath(page, `${previewOf(seeded, STELLA.name)}?s=packlist`);
      await expect(sheetDialog(page)).toHaveCount(0);
      await expect(page.getByTestId("crew-all-sections")).toBeVisible();
      await expect(listRow(page, "venue")).toBeVisible();
      await expect(listRow(page, "packlist")).toHaveCount(0);
      expect(await renderedPage(page)).not.toContain(CASE_LABEL);

      // POSITIVE CONTROL: an unrestricted viewer opens it on the same show and day.
      await loadPath(page, `${previewOf(seeded, PIA.name)}?s=packlist`);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "packlist");
      await expect(sheetDialog(page).getByTestId("section-packlist")).toContainText(CASE_LABEL);
      await expect(listRow(page, "packlist")).toHaveCount(1);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: the numbered list and its raw rows hold the sheet at every phone width", async ({
    page,
  }) => {
    const TOL = 0.5;
    const NUMBERED = Array.from({ length: 11 }, (_, i) => ({
      caseLabel:
        i === 9
          ? "Road case 10 with the FOH console, stage racks, spare looms and the long pack note"
          : `Road case ${i + 1}`,
      items: [
        {
          qty: 2,
          cat: "Audio",
          subCat: "Mics",
          item: `Quartz stage box ${i + 1}`,
          rawSnippet: RAW_SNIPPET,
        },
        { qty: null, cat: null, subCat: null, item: "Spare loom" },
        {
          qty: 1,
          cat: "Video",
          subCat: null,
          item: "Unbroken".repeat(9),
          rawSnippet: "row|".repeat(30),
        },
      ],
    }));
    const seeded = await seedShowWithCrew({
      title: "Pack Layout Show",
      dates: DATES,
      schedulePhases: { [PINNED_DAY]: ["Set"] },
      pullSheet: NUMBERED,
      crew: [PIA],
    });
    try {
      for (const width of [320, 390, 430, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await loadPath(page, `${share(seeded)}?s=packlist`);
        await settleOpen(page);
        const panel = sheetDialog(page).locator('[data-card-id="gear-pack-list"]');
        await panel
          .locator("details")
          .nth(9)
          .evaluate((d) => ((d as HTMLDetailsElement).open = true));
        const at = `at ${width}px`;
        const m = await panel.evaluate((root) => {
          const rect = (el: Element | Range) => {
            const { top, bottom, left, right, width: w, height } = el.getBoundingClientRect();
            return { top, bottom, left, right, width: w, height };
          };
          const rows = [...root.querySelectorAll("summary")].map((s) => ({
            summary: rect(s),
            index: rect(s.querySelector('[aria-hidden="true"].tabular-nums')!),
            label: rect(s.querySelector("span.flex-1")!),
            pill: rect(s.querySelector("span.rounded-pill")!),
          }));
          const open = root.querySelector("details[open]")!;
          const items = [...open.querySelectorAll("ul > li")].map((li) => {
            const snippet = li.querySelector('[data-testid$="pack-item-raw-snippet"]');
            const range = document.createRange();
            range.selectNodeContents(li.firstChild!);
            return {
              li: rect(li),
              text: rect(range),
              snippet: snippet === null ? null : rect(snippet),
            };
          });
          return {
            panel: rect(root),
            rows,
            items,
            overflow: [...root.querySelectorAll("*")].filter(
              (el) => el.getBoundingClientRect().right > root.getBoundingClientRect().right + 0.5,
            ).length,
          };
        });
        const pageWidth = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(pageWidth.scroll, at).toBeLessThanOrEqual(pageWidth.client);
        expect(m.overflow, `no element leaves the panel ${at}`).toBe(0);
        expect(m.rows.length, at).toBe(NUMBERED.length);
        // One column of labels, whatever the index's digits: "9." and "10." share a slot.
        expect(new Set(m.rows.map((r) => r.label.left.toFixed(1))).size, at).toBe(1);
        for (const r of m.rows) {
          expect(r.summary.height, at).toBeGreaterThanOrEqual(44 - TOL);
          expect(r.index.right, at).toBeLessThanOrEqual(r.label.left + TOL);
          expect(r.label.right, at).toBeLessThanOrEqual(r.pill.left + TOL);
          expect(r.pill.right, at).toBeLessThanOrEqual(m.panel.right + TOL);
          // A count stays one line beside its label, however long the label runs.
          expect(r.pill.height, at).toBeLessThanOrEqual(32);
        }
        // Every raw row sits under its own item's label, flush with it.
        const raw = m.items.filter((i) => i.snippet !== null);
        expect(raw.length, `PREMISE: the open case holds raw rows ${at}`).toBe(2);
        for (const i of raw) {
          expect(i.snippet!.top, at).toBeGreaterThanOrEqual(i.text.bottom - TOL);
          expect(Math.abs(i.snippet!.left - i.text.left), at).toBeLessThanOrEqual(TOL);
          expect(i.snippet!.right, at).toBeLessThanOrEqual(m.panel.right + TOL);
        }
      }
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});

/**
 * PR B invariant-8 UI gate rows 1 and 3: the crew Transport body on a phone and
 * in the 446px sheet. The route was a horizontal rail at every width, so an
 * eight-leg route gave each leg 24px at 320 and 44px in the 768 sheet, and its
 * stage names and time lines painted over the next leg's (the gate's audit
 * counted 20 overlapping text-box pairs at 320, 13 at 390 and 5 at 768). The
 * cells went to three columns on a 560px window, which in the 768 sheet broke
 * the driver's phone and email mid-token.
 *
 * The route here is the RPAS Central show's eight legs as the sheet lists them
 * (fixtures/shows/raw/2026-03-rpas-central-four-seasons.md:59-66), with riders
 * on two of them.
 */
test.describe("transport: the route and cells fit a phone and the sheet (gate rows 1, 3)", () => {
  test.setTimeout(180_000);

  const DRIVER = {
    name: "Doug Larson",
    phone: "917-331-4885",
    email: "dlarson@fxav.net",
  };
  const ROUTE = [
    { stage: "Rental Pickup", date: null, time: null, assigned_names: [] },
    { stage: "Load at Warehouse", date: "2026-03-18", time: null, assigned_names: [] },
    {
      stage: "Pick Up Warehouse",
      date: "2026-03-19",
      time: "12:00 PM",
      assigned_names: ["Rhea Rider"],
    },
    { stage: "Load In at Venue", date: "2026-03-23", time: "8:00 AM", assigned_names: [] },
    { stage: "Pick Up Venue", date: "2026-03-25", time: "3:30 PM", assigned_names: [] },
    {
      stage: "Drop Off Warehouse",
      date: "2026-03-26",
      time: "8:00 PM",
      assigned_names: ["Rhea Rider", "Gus Grounded"],
    },
    { stage: "Unload at Warehouse", date: "2026-03-27", time: null, assigned_names: [] },
    { stage: "Rental Return", date: null, time: null, assigned_names: [] },
  ];

  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Transport Route Fit Show",
      dates: {
        travelIn: "2026-03-18",
        set: "2026-03-23",
        showDays: ["2026-03-24", "2026-03-25"],
        travelOut: "2026-03-26",
      },
      crew: [
        { name: "Rhea Rider", role: "A1" },
        { name: "Gus Grounded", role: "L1" },
      ],
      transportation: {
        driverName: DRIVER.name,
        driverPhone: DRIVER.phone,
        driverEmail: DRIVER.email,
        vehicle: "26' Box Truck",
        parking: "Lot C behind the loading dock",
        schedule: ROUTE,
      },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
  });

  /**
   * Pairs of text boxes in the route that paint over each other: every line box
   * of every non-blank text node, compared across nodes, counted when they share
   * more than a pixel each way. Two lines of one node never overlap, and
   * neighbouring inline runs only touch.
   */
  async function routeOverlaps(route: Locator): Promise<{ pairs: string[]; boxes: number }> {
    return route.evaluate((ol) => {
      const boxes: { node: number; text: string; r: DOMRect }[] = [];
      const walker = document.createTreeWalker(ol, NodeFilter.SHOW_TEXT);
      let node = 0;
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        const text = (n as Text).data;
        if (text.trim() === "") continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects())
          if (r.width > 0 && r.height > 0) boxes.push({ node, text: text.trim(), r });
        node += 1;
      }
      const pairs: string[] = [];
      for (let i = 0; i < boxes.length; i += 1)
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.node === b.node) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 1) pairs.push(`"${a.text}" x "${b.text}"`);
        }
      return { pairs, boxes: boxes.length };
    });
  }

  for (const width of [320, 390, 768]) {
    test(`transport ${width}px: no text in the eight-leg route paints over another, and the driver's phone and email each hold one line`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const path = `/show/${seeded.slug}/${seeded.shareToken}?s=transport`;
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must render`).toBe(200);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-controller-ready",
        "true",
        { timeout: 30_000 },
      );
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "transport");
      await settleOpen(page);
      const card = sheetDialog(page)
        .getByTestId("section-transport")
        .locator('[data-card-id="travel-getting-there"]');
      const route = card.locator("ol");
      // PREMISE: all eight legs rendered, so a zero below is about this route.
      await expect(route.locator(":scope > li")).toHaveCount(ROUTE.length);
      const { pairs, boxes } = await routeOverlaps(route);
      expect(boxes, "text boxes measured").toBeGreaterThan(ROUTE.length);
      expect(pairs).toEqual([]);

      for (const value of [DRIVER.phone, DRIVER.email]) {
        const text = card.getByText(value, { exact: true });
        await expect(text, value).toBeVisible();
        const lines = await text.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        });
        expect(lines, `${value} at ${width}px`).toBe(1);
      }
    });
  }
});
