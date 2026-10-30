/**
 * tests/e2e/crew-wide-nav.spec.ts: the crew page's wide layout (crew page
 * redesign spec §5.3), at 1024px and up: a left nav listing "Today" then the
 * viewer's sections, and every section stacked in one column below the Today
 * block.
 *
 * What a real browser has to prove here, and jsdom cannot: a nav click scrolls
 * the window (smoothly, or instantly under reduced motion), focuses the
 * section's heading and only REPLACES history; the scroll-spy follows the page
 * and holds the clicked item through the glide; the accent indicator is one
 * measured element that moves with `--duration-fast`; a deep link scrolls after
 * hydration; and Back/Forward over entries a compact session pushed scroll
 * without moving focus.
 *
 * desktop-chromium only (its `testMatch`). Signed in as the admin fixture on the
 * share route, as crew-page.spec.ts does: an admin is entitled to every PR A
 * section, so the expected nav is the full base list plus `budget`. Every case
 * awaits the controller's readiness attribute before its first assertion (plan
 * harness rule "Readiness gate"). The server's clock is pinned with the
 * frozen-time headers and the browser's with `setFixedTime`, which fixes `Date`
 * but keeps timers running, so smooth scrolls and the indicator transition run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { SCROLL_SPY_OFFSET_PX } from "@/lib/ui/scrollSpy";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const SHOW_DAY_N_INSTANT = "2026-04-21T12:00:00Z";
const WIDE = { width: 1280, height: 800 };

/** Every PR A section an admin opens, in nav order (spec §5.1). */
const ADMIN_SECTIONS: CrewSectionId[] = [
  ...BASE_SECTION_IDS.flatMap((id) => (id === "today" ? [] : [id])),
  "budget",
];

async function lookupRoute(): Promise<string> {
  const showRes = await admin
    .from("shows")
    .select("id, slug")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(
      `crew-wide-nav.spec: seeded show not found (run \`pnpm db:seed\`): ${showRes.error?.message ?? "no row"}`,
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
      `crew-wide-nav.spec: no share_token for the seeded show: ${tokenRes.error?.message ?? "no row"}`,
    );
  }
  return `/show/${showRes.data.slug as string}/${tokenRes.data.share_token as string}`;
}

let route = "";

test.describe("crew wide nav (spec §5.3)", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    route = await lookupRoute();
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    await page.setViewportSize(WIDE);
  });

  /** Loads the route and waits for the controller to be hydrated in the given mode. */
  async function load(page: Page, search: string, mode: "wide" | "compact" = "wide") {
    const res = await page.goto(`${route}${search}`, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${route}${search} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", mode);
  }

  function navItem(page: Page, id: CrewSectionId | "today") {
    return page.getByTestId("crew-wide-nav").locator(`[data-section="${id}"]`);
  }

  /** Viewport-relative top of a stacked section, read in one evaluate (detach safety). */
  async function sectionTop(page: Page, id: CrewSectionId): Promise<number> {
    return page.evaluate(
      (sid) =>
        document
          .querySelector(`[data-testid="crew-wide-section"][data-section="${sid}"]`)!
          .getBoundingClientRect().top,
      id,
    );
  }

  test("wide nav: lists Today then the viewer's sections in order, each item exactly its label", async ({
    page,
  }) => {
    await load(page, "?s=today");
    const nav = page.getByTestId("crew-wide-nav");
    await expect(nav).toBeVisible();
    const items = nav.locator("[data-section]");
    const texts = await items.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    expect(texts).toEqual(["Today", ...ADMIN_SECTIONS.map((id) => CREW_SECTION_LABELS[id])]);
    // No counts and no status dots (spec §9.2): nothing beside the label.
    for (const t of texts) expect(t, t).not.toMatch(/\d/);
    // The compact list and the sheet are not part of the wide layout.
    await expect(page.getByTestId("crew-all-sections")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Every section is stacked, in nav order.
    const stacked = await page
      .getByTestId("crew-wide-section")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    expect(stacked).toEqual(ADMIN_SECTIONS);
  });

  test("wide nav: ?s=today loads at the top of the page", async ({ page }) => {
    await load(page, "?s=today");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(navItem(page, "today")).toHaveAttribute("aria-current", "true");
  });

  test("wide nav: a click scrolls to the section, focuses its heading and replaces history only", async ({
    page,
  }) => {
    await load(page, "?s=today");
    const before = await page.evaluate(() => history.length);
    await navItem(page, "crew").click();

    await expect(page).toHaveURL(/[?&]s=crew\b/);
    await expect
      .poll(() => sectionTop(page, "crew"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "crew")).toBeGreaterThanOrEqual(-1);
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent,
      tabIndex: (document.activeElement as HTMLElement | null)?.tabIndex,
    }));
    expect(focused).toEqual({ tag: "H2", text: CREW_SECTION_LABELS.crew, tabIndex: -1 });
    expect(await page.evaluate(() => history.length), "wide mode never pushes").toBe(before);
    await expect(navItem(page, "crew")).toHaveAttribute("aria-current", "true");
  });

  test("wide nav: a click under reduced motion jumps instantly", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await load(page, "?s=today");
    // One frame after the click the window is already at the target: no glide.
    const landed = await page.evaluate(async () => {
      const item = document.querySelector<HTMLElement>(
        '[data-testid="crew-wide-nav"] [data-section="gear"]',
      )!;
      item.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const section = document.querySelector(
        '[data-testid="crew-wide-section"][data-section="gear"]',
      )!;
      return { top: section.getBoundingClientRect().top, scrollY: window.scrollY };
    });
    expect(landed.scrollY).toBeGreaterThan(0);
    expect(landed.top).toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(landed.top).toBeGreaterThanOrEqual(-1);
  });

  test("wide nav: the active item follows the page and holds the clicked item through the glide", async ({
    page,
  }) => {
    await load(page, "?s=today");
    // Follows: an instant scroll to Venue moves the active item there.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="crew-wide-section"][data-section="venue"]')!;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
    });
    await expect(navItem(page, "venue")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("crew-wide-nav").locator('[aria-current="true"]')).toHaveCount(1);

    // Holds: back at the top, a click on Budget glides past every section in between,
    // and every frame of the glide reports Budget, never a section it passes.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await expect(navItem(page, "today")).toHaveAttribute("aria-current", "true");
    const samples = await page.evaluate(async () => {
      const nav = document.querySelector('[data-testid="crew-wide-nav"]')!;
      nav.querySelector<HTMLElement>('[data-section="budget"]')!.click();
      const seen: string[] = [];
      const until = performance.now() + 1500;
      while (performance.now() < until) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        seen.push(nav.querySelector('[aria-current="true"]')?.getAttribute("data-section") ?? "");
      }
      return { seen, scrollY: window.scrollY };
    });
    expect(samples.scrollY, "the glide moved the page").toBeGreaterThan(0);
    expect([...new Set(samples.seen)]).toEqual(["budget"]);
  });

  test("wide nav: the accent indicator is one element that moves to the active item at --duration-fast", async ({
    page,
  }) => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const fast = css.match(/--duration-fast:\s*(\d+)ms/)?.[1];
    if (!fast) throw new Error("app/globals.css must declare --duration-fast in ms");

    await load(page, "?s=today");
    const indicator = page.getByTestId("crew-wide-nav-indicator");
    await expect(indicator).toHaveCount(1);
    await navItem(page, "travel").click();
    await expect(navItem(page, "travel")).toHaveAttribute("aria-current", "true");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const ind = document
            .querySelector('[data-testid="crew-wide-nav-indicator"]')!
            .getBoundingClientRect();
          const item = document
            .querySelector('[data-testid="crew-wide-nav"] [aria-current="true"]')!
            .getBoundingClientRect();
          return ind.top >= item.top - 0.5 && ind.bottom <= item.bottom + 0.5 && ind.height > 0;
        }),
      )
      .toBe(true);
    // Still one indicator, never a per-item render.
    await expect(indicator).toHaveCount(1);
    expect(await indicator.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(
      `${Number(fast) / 1000}s`,
    );
  });

  test("wide nav: a deep link ?s=<id> scrolls to that section after hydration", async ({
    page,
  }) => {
    await load(page, "?s=gear");
    // One copy of the body: the server render's sheet left without an exit slide.
    await expect(page.getByTestId("section-gear")).toHaveCount(1);
    await expect
      .poll(() => sectionTop(page, "gear"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "gear")).toBeGreaterThanOrEqual(-1);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(navItem(page, "gear")).toHaveAttribute("aria-current", "true");
  });

  test("wide nav: Back and Forward over compact-created entries scroll without moving focus", async ({
    page,
  }) => {
    // A compact session pushes an entry: open Venue from the list, then close it.
    await page.setViewportSize({ width: 390, height: 844 });
    await load(page, "", "compact");
    await page.getByTestId("crew-all-sections").locator('[data-section="venue"]').click();
    await expect(page.getByRole("dialog")).toHaveAttribute("data-section", "venue");
    await page
      .getByRole("button", { name: `Close ${CREW_SECTION_LABELS.venue.toLowerCase()}` })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]s=/);

    await page.setViewportSize(WIDE);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");
    const focusBefore = await page.evaluate(() => document.activeElement?.tagName ?? "");

    await page.goForward();
    await expect(page).toHaveURL(/[?&]s=venue\b/);
    await expect
      .poll(() => sectionTop(page, "venue"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).toBe(focusBefore);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]s=/);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).toBe(focusBefore);
  });

  // Crew page redesign Task 7 (spec §4.1): in wide mode the header's search slot
  // sits between the title and the identity chip, on the title's row. The chip
  // exists only for a crew member the picker resolved, so this case leaves the
  // admin session and takes the picker the way theme-toggle.spec.ts's avatar-menu
  // arm does (`?gate=skip`, the first roster row); WebKit cannot store that
  // identity over plain http, and this spec runs under desktop-chromium alone.
  test("header: at 1024px and up the search field sits between the title and the identity chip on the title's row, beside the theme switch", async ({
    page,
  }) => {
    await signOut(page);
    await expect(async () => {
      const res = await page.goto(`${route}?gate=skip`, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${route}?gate=skip must render`).toBe(200);
      await expect(page.getByTestId("picker-interstitial-root")).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });
    await page.locator('[data-testid="picker-roster-row"]').first().click();
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", "wide");

    const header = page.getByTestId("page-header");
    await expect(header.getByTestId("avatar-menu-trigger")).toBeVisible();
    await expect(header.getByTestId("crew-search-input")).toBeVisible();

    // One evaluate (detach safety). The title's box is the item of the search
    // slot's row that holds the h1, so the bound covers the eyebrow, the title
    // row with its status pill, and the date line together.
    const r = await page.evaluate(() => {
      const box = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width };
      };
      const head = document.querySelector('[data-testid="page-header"]')!;
      const search = head.querySelector('[data-testid="page-header-search"]')!;
      let title: Element = head.querySelector("h1")!;
      while (title.parentElement && title.parentElement !== search.parentElement) {
        title = title.parentElement;
      }
      return {
        title: box(title),
        search: box(search),
        field: box(head.querySelector('[data-testid="crew-search-box"]')!),
        chip: box(head.querySelector('[data-testid="avatar-menu-trigger"]')!),
      };
    });
    const TOL = 0.5;
    const overlaps = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
      a.top < b.bottom - TOL && b.top < a.bottom - TOL;

    // Left to right: title, search, identity chip.
    expect(r.search.left, "the search starts after the title ends").toBeGreaterThanOrEqual(
      r.title.right - TOL,
    );
    expect(r.chip.left, "the identity chip starts after the search ends").toBeGreaterThanOrEqual(
      r.search.right - TOL,
    );
    // On the title's row, not a row of its own under it.
    expect(overlaps(r.search, r.title), "search and title share a row").toBe(true);
    expect(overlaps(r.search, r.chip), "search and identity chip share a row").toBe(true);
    // The field is laid out inside its slot, not collapsed by the row.
    expect(r.field.width, "the search field keeps a real width").toBeGreaterThan(r.chip.width);
    expect(r.field.right).toBeLessThanOrEqual(r.search.right + TOL);

    // An identified viewer sees the header's theme switch beside the chip, on
    // the same row (spec §4.1); the avatar menu's checkbox stays as well.
    const toggle = header.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();
    const t = await toggle.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom };
    });
    expect(overlaps(t, r.chip), "theme switch and identity chip share a row").toBe(true);
  });
});
