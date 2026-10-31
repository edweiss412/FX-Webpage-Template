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
 *
 * Crew page redesign spec §8 "Dimensional invariants", verbatim (plan Task 13):
 *
 * Tailwind v4 here does not stretch flex children by default; each relationship
 * below names the class that guarantees it, and the plan asserts each with
 * `getBoundingClientRect()` in a real browser.
 *
 * 1. **Day row.** Up to 4 buttons (days plus "Now"): a grid with one equal track
 *    per day (`grid` + `grid-cols-[repeat(N,minmax(0,1fr))]`), every button the
 *    full row height (`items-stretch` on the row, `h-full` on the button). Five or
 *    more: a flex row with `min-w-16` buttons and `snap-x`, buttons still
 *    `self-stretch`.
 * 2. **Pass.** The card keeps a fixed minimum height across day crossfades and
 *    live-state swaps (the existing `--spacing-right-now-min-h`, carried from
 *    `RightNowHero`). The fact grid is `grid-cols-3`, every cell `min-w-0` so
 *    values truncate instead of widening the column.
 * 3. **Quick facts.** `grid-cols-2` with `items-stretch`; every tile `h-full`,
 *    so tiles in one row share a height. A spanning tile is `col-span-2`.
 * 4. **Section sheet (compact).** Fixed to the viewport bottom, `max-h-[90dvh]`,
 *    a flex column: the header row is `shrink-0`, the body is `flex-1 min-h-0
 *    overflow-y-auto`. The sheet never grows past 90% of the dynamic viewport
 *    height, and its body scrolls inside it.
 * 5. **Wide layout.** The nav is `w-60 shrink-0`, sticky under the header, its
 *    height the viewport minus the header (`h-[calc(100dvh-var(--crew-header-h))]`)
 *    with its own scroll. The content column is `flex-1 min-w-0`.
 * 6. **Header.** One fixed height token `--crew-header-h`, used by the header
 *    itself, the wide nav offset and the scroll-margin of every section anchor (so
 *    a nav jump never lands a heading under the header).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { SCROLL_SPY_OFFSET_PX } from "@/lib/ui/scrollSpy";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
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

  /**
   * A stacked section's top, measured from the bottom of the sticky header (the
   * top of the visible page in wide mode, spec §8 item 6), read in one evaluate
   * (detach safety).
   */
  async function sectionTop(page: Page, id: CrewSectionId): Promise<number> {
    return page.evaluate(
      (sid) =>
        document
          .querySelector(`[data-testid="crew-wide-section"][data-section="${sid}"]`)!
          .getBoundingClientRect().top -
        document.querySelector('[data-testid="page-header"]')!.getBoundingClientRect().bottom,
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

  test("headings: every card title sits one level under the heading of the section that holds it, and no level is skipped", async ({
    page,
  }) => {
    // Audit P2-4. The wide stack is one document: a card titled "Where" sat at h2
    // beside the "Venue" h2 that holds it, so heading navigation could not tell a
    // section from a card inside it. The outline is read off the rendered page,
    // every section body included, rather than off a fixture.
    await load(page, "?s=today");
    const outline = await page.evaluate(() => {
      const main = document.querySelector('[data-testid="page-container"]')!;
      const level = (h: Element) => Number(h.tagName[1]);
      const headings = [...main.querySelectorAll("h1, h2, h3, h4, h5, h6")];
      const problems: string[] = [];
      // 1. Each stacked section's own heading is an h2, and every other heading
      //    inside it is deeper. Same for the Today block.
      const sections = [
        ...main.querySelectorAll(
          '[data-testid="crew-wide-section"], [data-testid="crew-today-block"]',
        ),
      ];
      for (const section of sections) {
        const own = document.getElementById(section.getAttribute("aria-labelledby")!)!;
        if (level(own) !== 2) problems.push(`section heading ${own.textContent} is h${level(own)}`);
        for (const h of section.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
          if (h !== own && level(h) <= level(own)) {
            problems.push(`"${h.textContent?.trim()}" h${level(h)} inside "${own.textContent}"`);
          }
        }
      }
      // 2. Inside a card, every heading but the title is deeper than the title.
      for (const card of main.querySelectorAll('[data-testid="section-card"]')) {
        const title = card.querySelector('[data-slot="section-card-title"]');
        if (!title) continue;
        for (const h of card.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
          if (h !== title && level(h) <= level(title)) {
            problems.push(
              `"${h.textContent?.trim()}" h${level(h)} inside card "${title.textContent}"`,
            );
          }
        }
      }
      // 3. Document order never skips a level going down.
      let prev = 1;
      for (const h of headings) {
        if (level(h) > prev + 1) problems.push(`"${h.textContent?.trim()}" skips from h${prev}`);
        prev = level(h);
      }
      return {
        problems,
        sections: sections.length,
        cards: main.querySelectorAll('[data-slot="section-card-title"]').length,
      };
    });
    // PREMISE: the walk reached the Today block, the stacked sections and their cards.
    expect(outline.sections, JSON.stringify(outline)).toBeGreaterThan(3);
    expect(outline.cards, JSON.stringify(outline)).toBeGreaterThan(3);
    expect(outline.problems).toEqual([]);
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
      // Measured from the sticky header's bottom edge, as `sectionTop` does.
      const header = document.querySelector('[data-testid="page-header"]')!;
      return {
        top: section.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        scrollY: window.scrollY,
      };
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

  // ── Dimensional invariants (spec §8 rows 5 and 6, plan Task 13) ──────────────
  // Quoted in the file header. Every read is one `page.evaluate` (detach safety).

  /** The header, the nav, the content column and the header token, in one read. */
  async function readWideLayout(page: Page) {
    return page.evaluate(() => {
      // The token as the page resolves it: an undefined variable gives the probe no height.
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;height:var(--crew-header-h)";
      document.body.append(probe);
      const token = probe.getBoundingClientRect().height;
      probe.remove();
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        };
      };
      const header = document.querySelector<HTMLElement>('[data-testid="page-header"]')!;
      const nav = document.querySelector('[data-testid="crew-wide-nav"]')!;
      const main = document.querySelector('[data-testid="page-container"]')!;
      const row = main.parentElement!;
      const rs = getComputedStyle(row);
      const rowRect = rect(row);
      const ns = getComputedStyle(nav);
      return {
        token,
        innerHeight: window.innerHeight,
        scrollY: window.scrollY,
        header: {
          ...rect(header),
          position: getComputedStyle(header).position,
          clientHeight: header.clientHeight,
          scrollHeight: header.scrollHeight,
        },
        nav: {
          ...rect(nav),
          position: ns.position,
          stickyTop: Number.parseFloat(ns.top),
          overflowY: ns.overflowY,
        },
        main: rect(main),
        row: {
          left: rowRect.left + Number.parseFloat(rs.paddingLeft),
          right: rowRect.right - Number.parseFloat(rs.paddingRight),
          gap: Number.parseFloat(rs.columnGap),
        },
        anchors: [...document.querySelectorAll('[data-testid="crew-wide-section"]')].map((el) => ({
          id: el.getAttribute("data-section"),
          margin: Number.parseFloat(getComputedStyle(el).scrollMarginTop),
        })),
      };
    });
  }

  test("dimensional: wide layout: the nav is 240px wide and sticky under the header at the viewport's height less the header, and the content column fills the rest", async ({
    page,
  }) => {
    const TOL = 0.5;
    await load(page, "?s=today");
    const top = await readWideLayout(page);
    let at = JSON.stringify(top);
    expect(top.token, `the header token resolves ${at}`).toBeGreaterThan(0);
    expect(Math.abs(top.nav.width - 240), at).toBeLessThanOrEqual(TOL);
    expect(top.nav.position, at).toBe("sticky");
    expect(top.nav.overflowY, `the nav scrolls on its own ${at}`).toBe("auto");
    expect(Math.abs(top.nav.top - top.header.bottom), at).toBeLessThanOrEqual(TOL);
    expect(
      Math.abs(top.nav.height - (top.innerHeight - top.header.height)),
      at,
    ).toBeLessThanOrEqual(TOL);
    // The content column takes every pixel the nav and the gap leave.
    expect(Math.abs(top.main.left - (top.nav.right + top.row.gap)), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(top.main.right - top.row.right), at).toBeLessThanOrEqual(TOL);
    expect(
      Math.abs(top.nav.width + top.row.gap + top.main.width - (top.row.right - top.row.left)),
      at,
    ).toBeLessThanOrEqual(TOL);

    // Scrolled well past the header's height: the header stays at the top and
    // the nav stays under it, filling the viewport to the bottom.
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "auto" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top.header.height);
    const scrolled = await readWideLayout(page);
    at = JSON.stringify(scrolled);
    expect(Math.abs(scrolled.header.top), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(scrolled.nav.top - scrolled.header.bottom), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(scrolled.nav.bottom - scrolled.innerHeight), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(scrolled.nav.width - 240), at).toBeLessThanOrEqual(TOL);
  });

  test("header: Shift+Tab back up the wide page never leaves the focused control under the sticky header (WCAG 2.4.11)", async ({
    page,
  }) => {
    // Audit P1-2: with no scroll padding, a reverse Tab scrolled each control
    // only just into view, which on the wide layout is UNDER the 96px sticky
    // header: 8 of 60 focused controls ended up fully covered. Read every stop
    // on the way back up from the page's last control.
    await load(page, "?s=today");
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
    const last = page.locator("a[href], button:not([disabled]), input, summary").last();
    await last.focus();
    const covered: string[] = [];
    let stops = 0;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Shift+Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const header = document.querySelector('[data-testid="page-header"]')!;
        if (!el || el === document.body || header.contains(el)) return null;
        const b = el.getBoundingClientRect();
        const bottom = header.getBoundingClientRect().bottom;
        return {
          name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40),
          top: b.top,
          bottom: b.bottom,
          headerBottom: bottom,
        };
      });
      if (r === null) continue;
      stops += 1;
      // Fully under the header: its whole box sits above the header's bottom edge.
      if (r.bottom <= r.headerBottom + 0.5) covered.push(`${r.name} ${r.top}-${r.bottom}`);
    }
    // PREMISE: the walk visited real controls in the page body.
    expect(stops).toBeGreaterThan(20);
    expect(covered).toEqual([]);
  });

  test("dimensional: header: one token, --crew-header-h, is the header's height, the nav's sticky offset and every section anchor's scroll margin, so a nav jump lands each heading just under the header", async ({
    page,
  }) => {
    const TOL = 0.5;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await load(page, "?s=today");
    const m = await readWideLayout(page);
    const at = JSON.stringify(m);
    expect(m.token, `the header token resolves ${at}`).toBeGreaterThan(0);
    expect(Math.abs(m.header.height - m.token), at).toBeLessThanOrEqual(TOL);
    // Nothing in the header spills past its fixed height.
    expect(m.header.scrollHeight, at).toBeLessThanOrEqual(m.header.clientHeight);
    expect(Math.abs(m.nav.stickyTop - m.token), at).toBeLessThanOrEqual(TOL);
    expect(
      m.anchors.map((a) => a.id),
      at,
    ).toEqual(ADMIN_SECTIONS);
    for (const a of m.anchors) {
      expect(Math.abs(a.margin - m.token), `${at} ${a.id}`).toBeLessThanOrEqual(TOL);
    }
    // A jump (instant under reduced motion) lands the section's top on the
    // header's bottom edge: the heading is never under the header.
    const landed = await page.evaluate(async () => {
      document
        .querySelector<HTMLElement>('[data-testid="crew-wide-nav"] [data-section="gear"]')!
        .click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const heading = document.querySelector(
        '[data-testid="crew-wide-section"][data-section="gear"] h2',
      )!;
      return {
        headingTop: heading.getBoundingClientRect().top,
        headerBottom: document.querySelector('[data-testid="page-header"]')!.getBoundingClientRect()
          .bottom,
        scrollY: window.scrollY,
      };
    });
    expect(landed.scrollY, JSON.stringify(landed)).toBeGreaterThan(0);
    expect(
      Math.abs(landed.headingTop - landed.headerBottom),
      JSON.stringify(landed),
    ).toBeLessThanOrEqual(TOL);
  });

  // ── Compound transitions across the breakpoint (spec §7, plan Task 12) ──────
  // Each starts compact (390px), opens Venue from the "All sections" list (a
  // pushed entry carrying the sheet marker), then resizes across 1024px.

  const COMPACT = { width: 390, height: 844 };

  /** Compact home, then Venue opened from its row with the open slide finished. */
  async function openVenueCompact(page: Page): Promise<void> {
    await page.setViewportSize(COMPACT);
    await load(page, "", "compact");
    await page.getByTestId("crew-all-sections").locator('[data-section="venue"]').click();
    await expect(page.getByRole("dialog")).toHaveAttribute("data-section", "venue");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-testid="crew-section-sheet-panel"]')!
              .getBoundingClientRect().bottom,
        ),
      )
      .toBeCloseTo(COMPACT.height, 0);
  }

  /** Records, on every DOM change, the controller's mode and whether a sheet is mounted. */
  async function watchModeAndSheet(page: Page): Promise<void> {
    await page.evaluate(() => {
      const log: Array<{ mode: string | null; sheet: boolean }> = [];
      (window as unknown as { __modeLog: typeof log }).__modeLog = log;
      new MutationObserver(() => {
        log.push({
          mode:
            document
              .querySelector('[data-testid="crew-shell-sections"]')
              ?.getAttribute("data-crew-mode") ?? null,
          sheet: document.querySelector('[data-testid="crew-section-sheet"]') !== null,
        });
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    });
  }

  async function modeLog(page: Page): Promise<Array<{ mode: string | null; sheet: boolean }>> {
    return page.evaluate(
      () =>
        (window as unknown as { __modeLog: Array<{ mode: string | null; sheet: boolean }> })
          .__modeLog,
    );
  }

  /** The wide page shows Venue at the top, under the scroll margin. */
  async function expectVenueInView(page: Page): Promise<void> {
    await expect
      .poll(() => sectionTop(page, "venue"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "venue")).toBeGreaterThanOrEqual(-1);
    await expect(navItem(page, "venue")).toHaveAttribute("aria-current", "true");
  }

  const marker = (page: Page) =>
    page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet);

  test("compound: crossing into wide with the sheet open dismisses it without animation and shows that section, keeping s and the marker", async ({
    page,
  }) => {
    await openVenueCompact(page);
    const length = await page.evaluate(() => history.length);
    await watchModeAndSheet(page);

    await page.setViewportSize(WIDE);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");

    await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
    const log = await modeLog(page);
    expect(
      log.some((e) => e.mode === "wide"),
      "PREMISE: the observer saw the mode flip",
    ).toBe(true);
    expect(
      log.filter((e) => e.mode === "wide" && e.sheet),
      "the sheet left in the commit that flipped the mode: no exit slide",
    ).toEqual([]);
    await expectVenueInView(page);
    expect(new URL(page.url()).searchParams.get("s")).toBe("venue");
    expect(await marker(page), "the entry keeps its marker").toBe(true);
    expect(await page.evaluate(() => history.length)).toBe(length);
  });

  test("compound: crossing into wide mid-drag cancels the drag, then dismisses the sheet as above", async ({
    page,
  }) => {
    await openVenueCompact(page);
    const length = await page.evaluate(() => history.length);
    const grab = await page.getByTestId("crew-section-sheet-grab").boundingBox();
    const x = grab!.x + grab!.width / 2;
    const y = grab!.y + grab!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 60, { steps: 6 });
    expect(
      await page
        .getByTestId("crew-section-sheet-panel")
        .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42),
      "PREMISE: the drag is under way",
    ).toBeCloseTo(60, 0);

    await page.setViewportSize(WIDE);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");
    // The release lands on the wide page: no close runs, so no history.back().
    await page.mouse.move(x, y + 300, { steps: 4 });
    await page.mouse.up();

    await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
    await expectVenueInView(page);
    expect(new URL(page.url()).searchParams.get("s")).toBe("venue");
    expect(new URL(page.url()).pathname).toBe(route);
    expect(await marker(page)).toBe(true);
    expect(await page.evaluate(() => history.length)).toBe(length);
  });

  test("compound: crossing into wide with a nested dialog open unmounts the dialog with the sheet and leaves the page scrollable", async ({
    page,
  }) => {
    await openVenueCompact(page);
    await page
      .getByRole("dialog")
      .filter({ has: page.getByTestId("crew-section-sheet-body") })
      .getByTestId("card-report-trigger")
      .first()
      .click();
    await expect(page.getByTestId("report-modal-root")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.setViewportSize(WIDE);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");

    await expect(page.getByTestId("report-modal-root")).toHaveCount(0);
    await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
    await expectVenueInView(page);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    const moved = await page.evaluate(async () => {
      const from = window.scrollY;
      window.scrollTo({ top: from + 200, behavior: "auto" });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      return window.scrollY - from;
    });
    expect(moved, "the page scrolls").toBeGreaterThan(0);
  });

  test("compound: crossing back into compact from a scrolled wide page shows the home at the top with no sheet, replacing s and the marker away", async ({
    page,
  }) => {
    await openVenueCompact(page);
    await page.setViewportSize(WIDE);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute("data-crew-mode", "wide");
    // PREMISE: a wide page scrolled to a section, on an entry carrying s and the marker.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="crew-wide-section"][data-section="venue"]')!;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(new URL(page.url()).searchParams.get("s")).toBe("venue");
    expect(await marker(page)).toBe(true);
    const length = await page.evaluate(() => history.length);
    await watchModeAndSheet(page);

    await page.setViewportSize(COMPACT);
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-mode",
      "compact",
    );

    await expect(page.getByTestId("crew-all-sections")).toBeVisible();
    await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
    expect(
      (await modeLog(page)).filter((e) => e.mode === "compact" && e.sheet),
      "no sheet opens on the way into compact, not even for one commit",
    ).toEqual([]);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
    expect(await marker(page), "the marker is replaced away").toBeUndefined();
    expect(await page.evaluate(() => history.length), "replaced, not pushed").toBe(length);
  });

  // Audit P2-3 / critique F8 (spec §4.1 amendment 2026-10-30): the wide header
  // gave the search field more width than the show title, so a 47-character title
  // truncated at 1280 and 1024 with no way to read it. The title now takes the
  // larger share, the status pill moves to the date line, and the h1 carries the
  // full title as `title`. Measured with the crew viewer's full header (search,
  // theme switch, identity chip), the tightest row the header has.
  test("header: at 1024px and 1280px the seeded show title fits its row whole, the status pill sits on the date line, and the h1 names the full title", async ({
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
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(root).toHaveAttribute("data-crew-mode", "wide");
      const header = page.getByTestId("page-header");
      await expect(header.getByTestId("header-status-pill")).toBeVisible();
      const r = await page.evaluate(() => {
        const head = document.querySelector('[data-testid="page-header"]')!;
        const h1 = head.querySelector("h1")!;
        const pill = head
          .querySelector('[data-testid="header-status-pill"]')!
          .getBoundingClientRect();
        const date = head.querySelector("time")!.getBoundingClientRect();
        const title = h1.getBoundingClientRect();
        return {
          text: h1.textContent,
          titleAttr: h1.getAttribute("title"),
          truncated: h1.scrollWidth > h1.clientWidth,
          pillTop: pill.top,
          pillBottom: pill.bottom,
          titleBottom: title.bottom,
          dateTop: date.top,
          dateBottom: date.bottom,
          dateRight: date.right,
          pillLeft: pill.left,
        };
      });
      // PREMISE: the seeded title is long enough to have truncated (47 characters).
      expect(r.text!.length, JSON.stringify(r)).toBeGreaterThan(40);
      expect(r.truncated, `${width}: the title is cut: ${JSON.stringify(r)}`).toBe(false);
      expect(r.titleAttr, "the h1 names the full title").toBe(r.text);
      // The pill sits under the title, beside the date.
      expect(r.pillTop, `${width}: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(
        r.titleBottom - 0.5,
      );
      expect(r.pillTop).toBeLessThan(r.dateBottom);
      expect(r.pillBottom).toBeGreaterThan(r.dateTop);
      expect(r.pillLeft).toBeGreaterThanOrEqual(r.dateRight - 0.5);
    }
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

/**
 * The composed home in the wide layout (crew page redesign plan Task 11, spec
 * §3.1, §3.2): the Today block (day row, pass and run of show, with the quick
 * facts beside them and the show notes and Dress code card inside the block),
 * then every section stacked, and no "All sections" card. One seeded show
 * carries a run of show, a venue with notes, a split Wi-Fi value and a dress
 * code; values are read from the seed input, never typed. Titles carry "home".
 */
test.describe("the composed home, wide (crew page redesign Task 11)", () => {
  test.setTimeout(180_000);

  const SHOW_DAY_1 = "2026-04-21";
  const SHOW_DAYS = [SHOW_DAY_1, "2026-04-22"];
  const VENUE = {
    name: "Wide Home Ballroom",
    address: "300 Plaza Way",
    loadingDock: "Dock 7 off Pine St",
    notes: "Load the freight elevator two carts at a time",
  };
  const EVENT_DETAILS = {
    internet: "SSID: WideHomeCrew code: WIDEPASS26",
    dress_code: "Show blacks",
  };
  const RUN_ROWS = ["Wide Day One Call", "Wide Day One Doors"];
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Wide Home Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: SHOW_DAYS,
        travelOut: "2026-04-23",
      },
      venue: VENUE as never,
      eventDetails: EVENT_DETAILS as never,
      crew: [{ name: "Wide Home Crew", role: "A1" }],
      internal: {
        runOfShow: Object.fromEntries(
          SHOW_DAYS.map((iso) => [
            iso,
            {
              entries: RUN_ROWS.map((title, i) => ({ start: `${7 + i}:00 AM`, title })),
              showStart: "7:00 AM",
              showEnd: null,
              window: null,
            },
          ]),
        ),
      },
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({
      "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    });
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await page.setViewportSize(WIDE);
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  async function loadWide(page: Page, path: string) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", "wide");
  }

  test("home: the wide Today block puts the quick facts beside the run of show, the notes and Dress code card inside it, then every section", async ({
    page,
  }) => {
    await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
    const r = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height };
      };
      const block = document.querySelector('[data-testid="crew-today-block"]');
      const inBlock = (sel: string) => Boolean(block?.querySelector(sel));
      return {
        block: box('[data-testid="crew-today-block"]'),
        dayRow: box('[data-testid="crew-day-row"]'),
        pass: box('[data-testid="crew-pass"]'),
        run: box('[data-testid="today-run-of-show"]'),
        facts: box('[data-testid="crew-quick-facts"]'),
        notes: box('[data-testid="today-notes"]'),
        dress: box('[data-testid="today-dress"]'),
        firstSection: box('[data-testid="crew-wide-section"]'),
        inside: {
          facts: inBlock('[data-testid="crew-quick-facts"]'),
          notes: inBlock('[data-testid="today-notes"]'),
          dress: inBlock('[data-testid="today-dress"]'),
          run: inBlock('[data-testid="today-run-of-show"]'),
        },
      };
    });
    for (const key of [
      "block",
      "dayRow",
      "pass",
      "run",
      "facts",
      "notes",
      "dress",
      "firstSection",
    ] as const) {
      expect(r[key], `${key} renders`).not.toBeNull();
      expect(r[key]!.h, `${key} has height`).toBeGreaterThan(0);
    }
    expect(r.inside).toEqual({ facts: true, notes: true, dress: true, run: true });
    const TOL = 0.5;
    // Beside: the quick facts sit to the right of the run-of-show column and
    // share its vertical span.
    expect(r.facts!.left, JSON.stringify(r)).toBeGreaterThanOrEqual(r.run!.right - TOL);
    expect(r.facts!.top).toBeLessThan(r.run!.bottom);
    expect(r.facts!.left).toBeGreaterThanOrEqual(r.pass!.right - TOL);
    // The notes then the Dress code card under the quick facts, in that column.
    expect(r.notes!.top).toBeGreaterThanOrEqual(r.facts!.bottom - TOL);
    expect(r.dress!.top).toBeGreaterThanOrEqual(r.notes!.bottom - TOL);
    expect(r.notes!.left).toBeGreaterThanOrEqual(r.run!.right - TOL);
    // The left column reads day row, pass, run of show.
    expect(r.pass!.top).toBeGreaterThanOrEqual(r.dayRow!.bottom - TOL);
    expect(r.run!.top).toBeGreaterThanOrEqual(r.pass!.bottom - TOL);
    // Every section follows the Today block.
    expect(r.firstSection!.top).toBeGreaterThanOrEqual(r.block!.bottom - TOL);
    await expect(page.getByTestId("crew-all-sections")).toHaveCount(0);
    await expect(page.getByTestId("today-run-of-show")).toContainText(RUN_ROWS[0]!);
    await expect(page.getByTestId("today-notes")).toContainText(VENUE.notes);
  });

  test("home: on the preview route the crew header sticks under the preview banner, and the nav, a section jump and the scroll padding clear both", async ({
    page,
  }) => {
    // Audit P1-3 / critique F3: banner and header were both sticky at top 0, so
    // once the page scrolled the banner (z above) covered the header's title,
    // search field and theme switch.
    const crewId = seeded.crew[0]!.id;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadWide(page, `/admin/show/${seeded.slug}/preview/${crewId}`);
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "auto" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const read = () =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const banner = box('[data-testid="admin-preview-banner"]');
        const header = box('[data-testid="page-header"]');
        const nav = box('[data-testid="crew-wide-nav"]');
        const search = box('[data-testid="crew-search-input"]');
        const hit = document.elementFromPoint(
          search.left + search.width / 2,
          search.top + search.height / 2,
        );
        return {
          bannerBottom: banner.bottom,
          headerTop: header.top,
          headerBottom: header.bottom,
          navTop: nav.top,
          searchHitsHeader: Boolean(hit?.closest('[data-testid="page-header"]')),
          scrollPadding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
        };
      });
    const m = await read();
    const at = JSON.stringify(m);
    expect(
      Math.abs(m.headerTop - m.bannerBottom),
      `the header sticks under the banner ${at}`,
    ).toBeLessThanOrEqual(0.5);
    expect(m.searchHitsHeader, `the banner covers the header's search field ${at}`).toBe(true);
    expect(
      Math.abs(m.navTop - m.headerBottom),
      `the nav sticks under the header ${at}`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(m.scrollPadding - m.headerBottom),
      `scroll padding clears banner and header ${at}`,
    ).toBeLessThanOrEqual(0.5);
    // A nav jump lands the section's heading just under the header, not under the banner.
    await page.getByTestId("crew-wide-nav").locator('[data-section="crew"]').click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.round(
            document
              .querySelector('[data-testid="crew-wide-section"][data-section="crew"] h2')!
              .getBoundingClientRect().top -
              document.querySelector('[data-testid="page-header"]')!.getBoundingClientRect().bottom,
          ),
        ),
      )
      .toBeGreaterThanOrEqual(0);
  });

  test("home: the preview banner shows above the wide home on the preview route", async ({
    page,
  }) => {
    const crewId = seeded.crew[0]!.id;
    await loadWide(page, `/admin/show/${seeded.slug}/preview/${crewId}`);
    await expect(page.getByTestId("admin-preview-banner")).toBeVisible();
    await expect(page.getByTestId("section-today")).toBeVisible();
    await expect(page.getByTestId("crew-quick-facts")).toBeVisible();
    await expect(page.getByTestId("crew-wide-nav")).toBeVisible();
    const above = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="admin-preview-banner"]')!;
      const h = document.querySelector('[data-testid="crew-today-block"]')!;
      return b.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 0.5;
    });
    expect(above, "the banner sits above the Today block").toBe(true);
  });
});
