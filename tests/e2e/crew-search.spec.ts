/**
 * tests/e2e/crew-search.spec.ts — crew show search on the real crew page
 * (spec §11.5, §6.9; plan Task 19).
 *
 * At a 390px phone viewport and a 1280px wide one, on a seeded show whose
 * venue Wi-Fi is in the split form `parseWifiValue` recognizes:
 *
 * - "wifi" shows grouped results; the password row's copy button writes the
 *   password and shows "Password copied"; tapping the row opens the Venue
 *   section with that line focused, in view and highlighted. Focusing the field
 *   again keeps the section; Enter brings the kept results back.
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

/** Opens the seeded crew page as the crew member, through the picker. */
async function openAsCrew(page: Page): Promise<void> {
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
  const crew = show.crew.find((c) => c.name === CREW_NAME)!;
  await page.goto(`/show/${show.slug}/${show.shareToken}?gate=skip`, { waitUntil: "networkidle" });
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

      // Focusing the field again does not bring the results back on its own
      // (WCAG 3.2.1); Enter, the phone keyboard's Search key, does.
      await searchBox(page).focus();
      await expect(searchBox(page)).toBeFocused();
      await expect(page.getByTestId("crew-search-panel")).toHaveCount(0);
      await expect(page.getByTestId("section-venue")).toBeVisible();
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
