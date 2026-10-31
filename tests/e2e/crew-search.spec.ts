/**
 * tests/e2e/crew-search.spec.ts — crew show search on the real crew page
 * (spec §11.5, §6.9; plan Task 19).
 *
 * At a 390px phone viewport and a 1280px wide one, on a seeded show whose
 * venue Wi-Fi is in the split form `parseWifiValue` recognizes:
 *
 * - "wifi" shows grouped results; the password row's copy button writes the
 *   password and shows "Password copied"; tapping the row opens the Venue
 *   section with that line focused, in view and highlighted: inside the Venue
 *   sheet on the phone, on the wide page's Venue section at 1280px (crew page
 *   redesign spec §1.2). Focusing the field again keeps the page as it is; Enter
 *   brings the kept results back. On the phone the sheet is modal and the header
 *   behind it inert (redesign spec §5.2), so the sheet is closed first.
 * - A zero-hit query sends one miss POST, after the debounce (intercepted, so
 *   this spec observes the client and writes nothing). Cancel puts focus back
 *   on the empty field.
 * - Focus alone changes nothing (WCAG 3.2.1): the page stays in view.
 * - The spec §6.9 dimensions, measured with getBoundingClientRect (0.5px).
 *
 * Identity: a CREW viewer, since misses are not sent for admin viewers (spec
 * §7.1). The spec drives the picker (`?gate=skip`, tap the roster row) the way
 * tests/e2e/picker-flow.spec.ts does, and waits on the resolved identity before
 * its first assertion. It runs under desktop-chromium only: over plain http
 * WebKit does not store the `__Host-` picker cookie (playwright.config.ts).
 *
 * Clipboard: headless Chromium on http rejects `navigator.clipboard.writeText`,
 * so an init script replaces it with a recorder that resolves (precedent:
 * tests/e2e/share-link-flash.spec.ts).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { deleteSeededShow, seedShowWithCrew, type SeededShow } from "./helpers/seedShowWithCrew";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

const CREW_NAME = "Sam Rivera";
const NETWORK = "FXAV_Crew";
const PASSWORD = "LoadIn2026";
/** A query no line of the seeded show matches. */
const ZERO_HIT = "zqxjv";
/** spec §6.9 tolerance. */
const TOLERANCE = 0.5;
/** The miss debounce is 2000 ms; the floor leaves room for when the test reads its own clock. */
const MISS_DEBOUNCE_FLOOR_MS = 1500;

/** A Server Action round trip plus an RSC render on a cold dev server (picker-flow.spec.ts). */
const AFTER_SERVER_ACTION = { timeout: 30_000 } as const;

let show: SeededShow;

test.beforeAll(async () => {
  show = await seedShowWithCrew({
    title: "Crew Search E2E Show",
    crew: [{ name: CREW_NAME, role: "A1" }],
    eventDetails: { internet: `SSID: ${NETWORK}\nPassword: ${PASSWORD}` },
  });
});

// The seeded show is deleted under the per-show advisory lock (invariant 2),
// through the seed helper, never by an unlocked PostgREST write.
test.afterAll(async () => {
  if (show !== undefined) await deleteSeededShow(show.driveFileId);
});

/** Opens a seeded crew page (the file's show by default) as the crew member, through the picker. */
async function openAsCrew(page: Page, seeded: SeededShow = show): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __clipboardWrites: string[] };
    w.__clipboardWrites = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          w.__clipboardWrites.push(text);
          return Promise.resolve();
        },
      },
    });
  });
  const crew = seeded.crew.find((c) => c.name === CREW_NAME)!;
  await page.goto(`/show/${seeded.slug}/${seeded.shareToken}?gate=skip`, {
    waitUntil: "networkidle",
  });
  await expect(page.getByTestId("picker-interstitial-root")).toBeVisible();
  await page.locator(`[data-testid="picker-roster-row"][data-crew-member-id="${crew.id}"]`).click();
  await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
  // The picker spec's readiness gate: the header's identity trigger names the
  // resolved viewer (its accessible name starts with the name).
  const trigger = page.getByTestId("avatar-menu-trigger");
  await expect(trigger).toBeVisible(AFTER_SERVER_ACTION);
  await expect(trigger).toHaveAttribute("aria-label", new RegExp(`^${CREW_NAME},`));
}

function searchBox(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Search this show" });
}

async function rect(locator: Locator) {
  const box = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      width: r.width,
      height: r.height,
      innerHeight: r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth),
    };
  });
  return box;
}

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "wide", width: 1280, height: 800 },
] as const) {
  test.describe(`crew search at ${viewport.name} width (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("wifi: grouped results, copy the password, open the line in Venue", async ({ page }) => {
      await openAsCrew(page);

      await searchBox(page).fill("wifi");

      // Grouped results with section chips; the body behind them is hidden.
      await expect(
        page.getByRole("navigation", { name: "Filter results by section" }),
      ).toBeVisible();
      const venueGroup = page.locator('[data-testid="crew-search-group"][data-section="venue"]');
      await expect(venueGroup).toBeVisible();
      await expect(venueGroup.getByRole("heading")).toContainText("Venue");
      await expect(page.getByTestId("page-container")).toBeHidden();

      // Copy the password from its result row.
      const copy = page.getByRole("button", { name: "Copy Wi-Fi password" });
      await expect(copy).toHaveCount(1);
      await copy.click();
      await expect(page.getByTestId("crew-search-toast")).toHaveText("Password copied");
      expect(
        await page.evaluate(
          () => (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites,
        ),
      ).toEqual([PASSWORD]);

      // Open the password line: the Venue section, the line focused, in view, highlighted.
      const row = page.getByTestId("crew-search-row").filter({ has: copy });
      const entryId = await row.getAttribute("data-entry-id");
      expect(entryId).toMatch(/^venue:/);
      await row.getByTestId("crew-search-row-open").click();

      await expect(page).toHaveURL(/[?&]s=venue/);
      await expect(page.getByTestId("crew-search-panel")).toHaveCount(0);
      const line = page.getByTestId("section-venue").locator(`[data-search-target="${entryId}"]`);
      await expect(line).toHaveAttribute("data-search-reveal", "");
      await expect(line).toBeFocused();
      await expect(line).toBeInViewport();
      await expect(line).toContainText(PASSWORD);
      // Ending search by a result tap keeps the query (spec §6.2).
      await expect(searchBox(page)).toHaveValue("wifi");

      // Below 1024px the line opened inside the Venue sheet, a modal whose page
      // behind is inert (redesign spec §5.2), so the field is reachable again only
      // once the sheet closes; the wide page has no sheet.
      const sheet = page.getByRole("dialog");
      if (viewport.width < 1024) {
        await expect(sheet).toBeVisible();
        await expect(sheet.locator(`[data-search-target="${entryId}"]`)).toHaveCount(1);
        await page.getByRole("button", { name: "Close venue" }).click();
        await expect(sheet).toHaveCount(0);
      } else {
        await expect(sheet).toHaveCount(0);
      }

      // Focusing the field again does not bring the results back on its own
      // (WCAG 3.2.1); Enter, the phone keyboard's Search key, does.
      await searchBox(page).focus();
      await expect(searchBox(page)).toBeFocused();
      await expect(page.getByTestId("crew-search-panel")).toHaveCount(0);
      await expect(page.getByTestId("page-container")).toBeVisible();
      if (viewport.width >= 1024) await expect(page.getByTestId("section-venue")).toBeVisible();
      await searchBox(page).press("Enter");
      await expect(venueGroup).toBeVisible();
      await expect(page.getByTestId("page-container")).toBeHidden();
    });

    test("a zero-hit query sends one miss after the debounce", async ({ page }) => {
      const posted: { body: string | null }[] = [];
      await page.route("**/api/show/*/search-miss", async (route) => {
        posted.push({ body: route.request().postData() });
        await route.fulfill({ status: 204 });
      });
      await openAsCrew(page);

      const missed = page.waitForRequest(
        (req) =>
          req.method() === "POST" && req.url().endsWith(`/api/show/${show.slug}/search-miss`),
      );
      await searchBox(page).fill(ZERO_HIT);
      const typedAt = Date.now();
      await expect(page.getByText("No matches. Try dock, hotel, or a name.")).toBeVisible();

      const request = await missed;
      expect(Date.now() - typedAt).toBeGreaterThanOrEqual(MISS_DEBOUNCE_FLOOR_MS);
      expect(request.postDataJSON()).toEqual({ query: ZERO_HIT });

      // Ending search on the same query would send it at once if it had not
      // gone already; it has, so nothing more is sent.
      await page.getByRole("button", { name: "Cancel" }).click();
      // Cancel puts focus back on the field, idle and empty (impeccable audit U2).
      await expect(searchBox(page)).toBeFocused();
      await expect(searchBox(page)).toHaveValue("");
      await expect(page.getByTestId("page-container")).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
      await page.waitForTimeout(500);
      expect(posted).toHaveLength(1);
    });

    test("field and result row dimensions (spec §6.9)", async ({ page }) => {
      await openAsCrew(page);
      await searchBox(page).fill("wifi");

      const box = await rect(page.getByTestId("crew-search-box"));
      const input = await rect(searchBox(page));
      const clear = await rect(page.getByRole("button", { name: "Clear search" }));
      const cancel = await rect(page.getByRole("button", { name: "Cancel" }));
      const copy = await rect(page.getByRole("button", { name: "Copy Wi-Fi password" }));

      expect(Math.abs(box.height - 52)).toBeLessThanOrEqual(TOLERANCE);
      // The input fills the field box inside its border.
      expect(Math.abs(input.height - box.innerHeight)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(clear.width - 44)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(clear.height - 44)).toBeLessThanOrEqual(TOLERANCE);
      expect(cancel.height).toBeGreaterThanOrEqual(44 - TOLERANCE);
      expect(Math.abs(copy.width - 44)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(copy.height - 44)).toBeLessThanOrEqual(TOLERANCE);
    });

    // Impeccable gate A3/U3: the global unlayered :focus-visible outline beat the
    // input's layered focus:outline-none, so the focused field drew a second ring
    // inside the box's own. The box is the one ring; forced colors drop its
    // box-shadow, so there the box carries an outline instead.
    test("the focused field draws one ring, and keeps one under forced colors", async ({
      page,
    }) => {
      await openAsCrew(page);
      await searchBox(page).focus();

      // Focus alone changes nothing (WCAG 3.2.1, impeccable audit U1): the page
      // body stays in view and no Cancel appears.
      await expect(searchBox(page)).toBeFocused();
      await expect(page.getByTestId("page-container")).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);

      const styles = async () =>
        page.evaluate(() => {
          const input = document.querySelector<HTMLInputElement>(
            '[data-testid="crew-search-input"]',
          )!;
          const box = document.querySelector<HTMLElement>('[data-testid="crew-search-box"]')!;
          return {
            inputFocusVisible: input.matches(":focus-visible"),
            inputOutline: getComputedStyle(input).outlineStyle,
            boxShadow: getComputedStyle(box).boxShadow,
            boxOutline: getComputedStyle(box).outlineStyle,
          };
        });

      const normal = await styles();
      // Premise: the input is in the state the global ring targets.
      expect(normal.inputFocusVisible).toBe(true);
      expect(normal.inputOutline).toBe("none");
      expect(normal.boxShadow).not.toBe("none");

      await page.emulateMedia({ forcedColors: "active" });
      const forced = await styles();
      expect(forced.inputFocusVisible).toBe(true);
      expect(forced.inputOutline).toBe("none");
      expect(forced.boxOutline).toBe("solid");
    });
  });
}

/**
 * A Today "Run of show" result on a show day (whole-diff review R1-F1). The
 * search index holds the run card's lines for the server's request day only,
 * while the card shows the day picked in the day row, or in live the device
 * clock's day. Tapping such a result used to do nothing visible when the two
 * differed. It now selects the server's day and reveals the line.
 *
 * Both clocks are pinned: the server's through the frozen-now header (honored
 * with the test-auth bearer, lib/time/now.ts), the browser's with
 * `page.clock.setFixedTime`. The query is the card's title, "run of show", which
 * reaches the run card's lines through their group: Schedule's copies group
 * under the day's label, so the Today hits are the ones kept (lib/search/match.ts).
 */
test.describe("crew search: a Today run-of-show result shows the day it was indexed for", () => {
  const TRAVEL_IN = "2026-05-10";
  const SET_DAY = "2026-05-11";
  const SHOW_DAY_1 = "2026-05-12";
  const SHOW_DAY_2 = "2026-05-13";
  const TRAVEL_OUT = "2026-05-14";
  /** The run of show, by day; titles are unique to their day. */
  const RUN_ROWS: Record<string, string[]> = {
    [SHOW_DAY_1]: ["Zephyr Rigging Call", "Zephyr Doors"],
    [SHOW_DAY_2]: ["Quartz Breakfast", "Quartz Keynote"],
  };
  /** The line under test: on the server's day, absent from the other one. */
  const LINE = RUN_ROWS[SHOW_DAY_1]![0]!;

  let dated: SeededShow;

  test.beforeAll(async () => {
    dated = await seedShowWithCrew({
      title: "Crew Search Run Card Show",
      crew: [{ name: CREW_NAME, role: "A1" }],
      dates: {
        travelIn: TRAVEL_IN,
        set: SET_DAY,
        showDays: [SHOW_DAY_1, SHOW_DAY_2],
        travelOut: TRAVEL_OUT,
      },
      internal: {
        runOfShow: Object.fromEntries(
          Object.entries(RUN_ROWS).map(([iso, titles]) => [
            iso,
            {
              entries: titles.map((title, i) => ({ start: `${8 + i}:00 AM`, title })),
              showStart: null,
              showEnd: null,
              window: null,
            },
          ]),
        ),
      },
    });
  });

  test.afterAll(async () => {
    if (dated !== undefined) await deleteSeededShow(dated.driveFileId);
  });

  /** Pin the server's request clock and the browser's clock, each to its own instant. */
  async function pinClocks(page: Page, server: string, browser: string): Promise<void> {
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": server,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    await page.clock.setFixedTime(new Date(browser));
  }

  /** Search "run of show", tap the Today result for `LINE`, and return its entry id. */
  async function openLineResult(page: Page): Promise<string> {
    await searchBox(page).fill("run of show");
    const row = page
      .getByTestId("crew-search-row")
      .filter({ hasText: LINE })
      .and(page.locator('[data-entry-id^="today:"]'));
    await expect(row).toHaveCount(1);
    const entryId = (await row.getAttribute("data-entry-id"))!;
    await row.getByTestId("crew-search-row-open").click();
    await expect(page.getByTestId("crew-search-panel")).toHaveCount(0);
    return entryId;
  }

  /** The line is on the card, revealed and focused, and no gone-line message follows. */
  async function expectRevealed(page: Page, entryId: string): Promise<void> {
    const line = page.getByTestId("today-run-of-show").locator(`[data-search-target="${entryId}"]`);
    await expect(line).toHaveAttribute("data-search-reveal", "");
    await expect(line).toBeFocused();
    await expect(line).toBeInViewport();
    await expect(line).toContainText(LINE);
    // Past the reveal's 1500 ms wait: a reveal that found its line never announces.
    await page.waitForTimeout(1_600);
    await expect(page.getByTestId("crew-reveal-status")).toHaveText("");
  }

  for (const viewport of [
    { name: "phone", width: 390, height: 844 },
    { name: "wide", width: 1280, height: 800 },
  ] as const) {
    test.describe(`at ${viewport.name} width (${viewport.width}px)`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("after the viewer picks another day, the result selects the server's day and reveals the line", async ({
        page,
      }) => {
        // Noon in New York (the default show timezone) on show day 1, on both clocks.
        await pinClocks(page, `${SHOW_DAY_1}T16:00:00.000Z`, `${SHOW_DAY_1}T16:00:00.000Z`);
        await openAsCrew(page, dated);
        const card = page.getByTestId("today-run-of-show");
        await page.locator(`[data-testid="crew-day-button"][data-day="${SHOW_DAY_2}"]`).click();
        // PREMISE: the card shows the picked day, so the line is not on the page.
        await expect(card).toHaveAttribute("data-selection", `day:${SHOW_DAY_2}`);
        await expect(card).toContainText(RUN_ROWS[SHOW_DAY_2]![0]!);
        await expect(card).not.toContainText(LINE);

        const entryId = await openLineResult(page);
        // Show day 1 is the device's today too, so selecting it is live.
        await expect(card).toHaveAttribute("data-selection", "live");
        await expectRevealed(page, entryId);
      });

      test("when the device clock is past midnight, the result selects the server's day and reveals the line", async ({
        page,
      }) => {
        // Served at 11:30 PM on show day 1 in New York; read at 12:30 AM on show day 2.
        await pinClocks(page, `${SHOW_DAY_2}T03:30:00.000Z`, `${SHOW_DAY_2}T04:30:00.000Z`);
        await openAsCrew(page, dated);
        const card = page.getByTestId("today-run-of-show");
        // PREMISE: live shows the device's day, so the line is not on the page.
        await expect(card).toHaveAttribute("data-selection", "live");
        await expect(card).toContainText(RUN_ROWS[SHOW_DAY_2]![0]!);
        await expect(card).not.toContainText(LINE);

        const entryId = await openLineResult(page);
        await expect(card).toHaveAttribute("data-selection", `day:${SHOW_DAY_1}`);
        await expectRevealed(page, entryId);
      });
    });
  }
});
