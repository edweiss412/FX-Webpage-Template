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
 * section, so the expected nav is the full base list plus `billing`. Every case
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
import { CREW_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import {
  SHOW_SECTION_GROUPS,
  SHOW_SECTIONS,
  showSection,
  type ShowSectionId,
} from "@/lib/showSections/registry";
import { SCROLL_SPY_OFFSET_PX, activeSectionFor } from "@/lib/ui/scrollSpy";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { refreshFromServer, renderFresh } from "./helpers/crewRefresh";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { updateShowLocked } from "./helpers/lockedShowCopy";
import { signInAs, signOut } from "./helpers/signInAs";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import {
  expectClearOfStickyChrome,
  FOCUS_RING_REACH_PX,
  settleScroll,
} from "./helpers/stickyClearance";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";
import { readSectionTextSizes } from "./helpers/sectionTextSizes";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const SHOW_DAY_N_INSTANT = "2026-04-21T12:00:00Z";
const WIDE = { width: 1280, height: 800 };

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
      const cards = [
        ...main.querySelectorAll('[data-testid="section-card"], [data-testid="crew-panel-card"]'),
      ];
      const titleOf = (card: Element) =>
        card.querySelector('[data-slot="section-card-title"], [data-slot="panel-card-header"] h3');
      for (const card of cards) {
        const title = titleOf(card);
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
        cards: cards.filter(titleOf).length,
      };
    });
    // PREMISE: the walk reached the Today block, the stacked sections and their cards.
    expect(outline.sections, JSON.stringify(outline)).toBeGreaterThan(3);
    expect(outline.cards, JSON.stringify(outline)).toBeGreaterThan(3);
    expect(outline.problems).toEqual([]);
  });

  test("home: with no run of show, the wide Today block puts the quick facts beside the pass and the show notes across both under them", async ({
    page,
  }) => {
    // Critique F7: with no run-of-show card (every seeded show), the lead column
    // ended at the pass while the quick facts and show notes ran on in the other
    // column, leaving a blank quadrant beside the page's most important card.
    // The seed fixture has no run of show, so this is that page.
    await load(page, "?s=today");
    await expect(page.getByTestId("today-run-of-show")).toHaveCount(0);
    const r = await page.evaluate(() => {
      const box = (sel: string) => {
        const b = document.querySelector(sel)!.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
      };
      return {
        lead: box('[data-testid="crew-today-lead"]'),
        pass: box('[data-testid="crew-pass"]'),
        facts: box('[data-testid="crew-quick-facts"]'),
        notes: box('[data-testid="today-notes"]'),
        block: box('[data-testid="crew-today-block"]'),
      };
    });
    const at = JSON.stringify(r);
    const TOL = 0.5;
    // The quick facts sit beside the pass; the notes run under both, across
    // both columns, so neither column is left holding air beside the other.
    expect(r.facts.left, at).toBeGreaterThanOrEqual(r.pass.right - TOL);
    expect(r.facts.top, at).toBeLessThan(r.pass.bottom);
    expect(Math.abs(r.notes.left - r.pass.left), at).toBeLessThanOrEqual(TOL);
    expect(Math.abs(r.notes.right - r.facts.right), at).toBeLessThanOrEqual(TOL);
    expect(r.notes.top, at).toBeGreaterThanOrEqual(Math.max(r.pass.bottom, r.facts.bottom) - TOL);
    // No void: the notes start one row gap under whichever top-row item is
    // taller, the lead or the quick facts.
    expect(r.notes.top - Math.max(r.lead.bottom, r.facts.bottom), at).toBeLessThanOrEqual(24 + TOL);
    // The block ends with the notes, not with a column of air.
    expect(r.block.bottom - r.notes.bottom, at).toBeLessThanOrEqual(TOL + 1);
  });

  test("type scale: no text in the stacked sections sits below 12px", async ({ page }) => {
    await load(page, "?s=today");
    const report = await readSectionTextSizes(page, '[data-testid="crew-wide-section"]');
    expect(report.offenders, JSON.stringify(report)).toEqual([]);
    // PREMISE: the walk reached both rules, not only text they leave alone.
    expect(report.labels).toBeGreaterThan(0);
    expect(report.values).toBeGreaterThan(0);
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
        '[data-testid="crew-wide-nav"] [data-section="rooms"]',
      )!;
      item.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const section = document.querySelector(
        '[data-testid="crew-wide-section"][data-section="rooms"]',
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

    // Holds: back at the top, a click on Billing glides past every section in between,
    // and every frame of the glide reports Billing, never a section it passes.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await expect(navItem(page, "today")).toHaveAttribute("aria-current", "true");
    const samples = await page.evaluate(async () => {
      const nav = document.querySelector('[data-testid="crew-wide-nav"]')!;
      nav.querySelector<HTMLElement>('[data-section="billing"]')!.click();
      const seen: string[] = [];
      const until = performance.now() + 1500;
      while (performance.now() < until) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        seen.push(nav.querySelector('[aria-current="true"]')?.getAttribute("data-section") ?? "");
      }
      return { seen, scrollY: window.scrollY };
    });
    expect(samples.scrollY, "the glide moved the page").toBeGreaterThan(0);
    expect([...new Set(samples.seen)]).toEqual(["billing"]);
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
    await navItem(page, "hotels").click();
    await expect(navItem(page, "hotels")).toHaveAttribute("aria-current", "true");
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
    await load(page, "?s=rooms");
    // One copy of the body: the server render's sheet left without an exit slide.
    await expect(page.getByTestId("section-rooms")).toHaveCount(1);
    await expect
      .poll(() => sectionTop(page, "rooms"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "rooms")).toBeGreaterThanOrEqual(-1);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(navItem(page, "rooms")).toHaveAttribute("aria-current", "true");
  });

  // Crew page redesign PR C Task 8: Gear retired, and its id is an alias of `rooms`.
  test("gear alias: ?s=gear lands on Rooms after hydration, with no Gear item or section left", async ({
    page,
  }) => {
    await load(page, "?s=gear");
    // One copy of the body: the server render's sheet left without an exit slide.
    await expect(page.getByTestId("section-rooms")).toHaveCount(1);
    await expect
      .poll(() => sectionTop(page, "rooms"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "rooms")).toBeGreaterThanOrEqual(-1);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(navItem(page, "rooms")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("section-gear")).toHaveCount(0);
    await expect(page.locator('[data-section="gear"]')).toHaveCount(0);
  });

  // Crew page redesign PR C Task 5: Event details is a section of its own.
  test("event details: a deep link ?s=event lands on the stacked section after hydration", async ({
    page,
  }) => {
    await load(page, "?s=event");
    await expect(page.getByTestId("section-event")).toHaveCount(1);
    await expect
      .poll(() => sectionTop(page, "event"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "event")).toBeGreaterThanOrEqual(-1);
    await expect(navItem(page, "event")).toHaveAttribute("aria-current", "true");
    await expect(navItem(page, "event")).toHaveText(showSection("event").label);
  });

  // Crew page redesign PR C Task 7: Rooms is a section of its own, holding Diagrams.
  test("rooms: a deep link ?s=rooms lands on the stacked section after hydration", async ({
    page,
  }) => {
    await load(page, "?s=rooms");
    await expect(page.getByTestId("section-rooms")).toHaveCount(1);
    await expect
      .poll(() => sectionTop(page, "rooms"), { timeout: 5000 })
      .toBeLessThanOrEqual(SCROLL_SPY_OFFSET_PX);
    expect(await sectionTop(page, "rooms")).toBeGreaterThanOrEqual(-1);
    await expect(navItem(page, "rooms")).toHaveAttribute("aria-current", "true");
    await expect(navItem(page, "rooms")).toHaveText(showSection("rooms").label);
    // Diagrams stack under the rooms, and the stacked Venue holds none.
    await expect(page.getByTestId("section-rooms").getByTestId("venue-diagrams")).toHaveCount(1);
    await expect(page.getByTestId("section-venue").getByTestId("venue-where")).toHaveCount(1);
    await expect(page.getByTestId("section-venue").getByTestId("venue-diagrams")).toHaveCount(0);
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
      // The ring allowance and the scroll clearance it builds, resolved the same way.
      probe.style.height = "var(--crew-ring-clearance)";
      const ring = probe.getBoundingClientRect().height;
      probe.style.height = "var(--crew-scroll-clearance)";
      const clearance = probe.getBoundingClientRect().height;
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
        ring,
        clearance,
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
    // Every anchor's scroll margin is the header's bottom edge plus the focus
    // ring's allowance (UI-gate re-run, audit P3-1): a margin of exactly the
    // header put the heading's ring top under it.
    expect(m.ring, `the ring allowance covers the ring's reach ${at}`).toBeGreaterThanOrEqual(
      FOCUS_RING_REACH_PX,
    );
    expect(Math.abs(m.clearance - (m.token + m.ring)), at).toBeLessThanOrEqual(TOL);
    for (const a of m.anchors) {
      expect(Math.abs(a.margin - m.clearance), `${at} ${a.id}`).toBeLessThanOrEqual(TOL);
    }
    // A jump (instant under reduced motion) lands the section's top one ring
    // allowance under the header's bottom edge: neither the heading nor its
    // focus ring is ever under the header.
    const landed = await page.evaluate(async () => {
      document
        .querySelector<HTMLElement>('[data-testid="crew-wide-nav"] [data-section="rooms"]')!
        .click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const heading = document.querySelector(
        '[data-testid="crew-wide-section"][data-section="rooms"] h2',
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
      Math.abs(landed.headingTop - (landed.headerBottom + m.ring)),
      JSON.stringify(landed),
    ).toBeLessThanOrEqual(TOL);
    const heading = page.locator('[data-testid="crew-wide-section"][data-section="rooms"] h2');
    await expect(heading).toBeFocused();
    await expectClearOfStickyChrome(heading, "the Rooms heading after a nav jump");
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
  test("header: at 1024px and 1280px the seeded show title fits its row whole, the status pill sits on the eyebrow line, and the h1 names the full title", async ({
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
        const eyebrow = head
          .querySelector('[data-testid="page-header-eyebrow"]')!
          .getBoundingClientRect();
        return {
          eyebrowTop: eyebrow.top,
          eyebrowBottom: eyebrow.bottom,
          eyebrowRight: eyebrow.right,
          titleTop: title.top,
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
      // The pill sits on the eyebrow's line, after it and above the title: off
      // the title's line (audit P2-3), and off the date's line too, where "April
      // 20, 2026 · Show day 1 of 2" read as if the unlabeled set date were show
      // day 1 (UI-gate re-run, critique N7).
      const at = `${width}: ${JSON.stringify(r)}`;
      expect(r.pillTop, at).toBeLessThan(r.eyebrowBottom);
      expect(r.pillBottom, at).toBeGreaterThan(r.eyebrowTop);
      expect(r.pillLeft, at).toBeGreaterThanOrEqual(r.eyebrowRight - 0.5);
      expect(r.pillBottom, at).toBeLessThanOrEqual(r.titleTop + 0.5);
      expect(r.pillBottom, `${at} the pill is not on the date's line`).toBeLessThanOrEqual(
        r.dateTop + 0.5,
      );
    }
    // The search placeholder fits its field whole on this, the tightest header
    // row, at every width (UI-gate re-run P3-4 / critique N8: at 1024 it read
    // "Find anything: Wi-Fi, dock, ho"). Measured with the field's own font.
    for (const width of [320, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const fit = await page.getByTestId("crew-search-input").evaluate((el) => {
        const input = el as HTMLInputElement;
        const cs = getComputedStyle(input);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return {
          placeholder: input.placeholder,
          text: ctx.measureText(input.placeholder).width,
          box: input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        };
      });
      expect(fit.placeholder.length, "PREMISE: the field has a placeholder").toBeGreaterThan(0);
      expect(fit.text, `${width}: ${JSON.stringify(fit)}`).toBeLessThanOrEqual(fit.box);
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
 * facts beside them and the show notes inside the block), then every section
 * stacked, and no "All sections" card. One seeded show
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

  test("home: the wide Today block puts the quick facts beside the run of show, the notes inside it, then every section", async ({
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
        firstSection: box('[data-testid="crew-wide-section"]'),
        inside: {
          facts: inBlock('[data-testid="crew-quick-facts"]'),
          notes: inBlock('[data-testid="today-notes"]'),
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
      "firstSection",
    ] as const) {
      expect(r[key], `${key} renders`).not.toBeNull();
      expect(r[key]!.h, `${key} has height`).toBeGreaterThan(0);
    }
    expect(r.inside).toEqual({ facts: true, notes: true, run: true });
    const TOL = 0.5;
    // Beside: the quick facts sit to the right of the run-of-show column and
    // share its vertical span.
    expect(r.facts!.left, JSON.stringify(r)).toBeGreaterThanOrEqual(r.run!.right - TOL);
    expect(r.facts!.top).toBeLessThan(r.run!.bottom);
    expect(r.facts!.left).toBeGreaterThanOrEqual(r.pass!.right - TOL);
    // The notes under the quick facts, in that column.
    expect(r.notes!.top).toBeGreaterThanOrEqual(r.facts!.bottom - TOL);
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

  // Spec line 316. Scoped to the home's own root: on the wide page the same card
  // id sits in the stacked Event details section, so a page-wide query cannot tell.
  test("event details: the Dress code card sits in the stacked section and the Today block holds none", async ({
    page,
  }) => {
    await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
    const dress = '[data-card-id="today-dress"]';
    await expect(page.getByTestId("section-today").locator(dress)).toHaveCount(0);
    await expect(page.getByTestId("crew-today-block").locator(dress)).toHaveCount(0);
    // POSITIVE CONTROL: the seeded value is on the page, in its new home.
    await expect(page.getByTestId("section-event").locator(dress)).toContainText(
      EVENT_DETAILS.dress_code,
    );
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
          ring: (() => {
            const probe = document.createElement("div");
            probe.style.cssText =
              "position:absolute;visibility:hidden;height:var(--crew-ring-clearance)";
            document.body.append(probe);
            const h = probe.getBoundingClientRect().height;
            probe.remove();
            return h;
          })(),
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
    expect(m.ring, `the ring allowance covers the ring's reach ${at}`).toBeGreaterThanOrEqual(
      FOCUS_RING_REACH_PX,
    );
    expect(
      Math.abs(m.scrollPadding - (m.headerBottom + m.ring)),
      `scroll padding clears banner, header and a focus ring ${at}`,
    ).toBeLessThanOrEqual(0.5);
    // A nav jump lands the section's heading, ring included, under the header,
    // not under the banner.
    await page.getByTestId("crew-wide-nav").locator('[data-section="crew"]').click();
    const heading = page.locator('[data-testid="crew-wide-section"][data-section="crew"] h2');
    await expect(heading).toBeFocused();
    await expectClearOfStickyChrome(heading, "the Crew heading after a nav jump");
  });

  for (const viewport of [
    { width: 1280, height: 800, mode: "wide" },
    { width: 390, height: 844, mode: "compact" },
  ] as const) {
    test(`home: on the preview route at ${viewport.width}px, a Today search reveal lands the note, ring included, clear of the banner and the header`, async ({
      page,
    }) => {
      // UI-gate re-run, audit P1-1: the Today block had no scroll margin, so a
      // reveal of a show note, the Dress code or a run-of-show line put it at the
      // viewport's top, under the sticky header from 1024px and, on the preview
      // route at every width, under the sticky banner.
      const crewId = seeded.crew[0]!.id;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const path = `/admin/show/${seeded.slug}/preview/${crewId}`;
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must render`).toBe(200);
      const root = page.getByTestId("crew-shell-sections");
      await expect(root).toHaveAttribute("data-crew-controller-ready", "true", {
        timeout: 30_000,
      });
      await expect(root).toHaveAttribute("data-crew-mode", viewport.mode);
      await page.getByRole("searchbox", { name: "Search this show" }).fill("freight elevator");
      const row = page
        .getByTestId("crew-search-row")
        .and(page.locator('[data-entry-id^="today:"]'))
        .filter({ hasText: VENUE.notes });
      await expect(row).toHaveCount(1);
      const entryId = (await row.getAttribute("data-entry-id"))!;
      await row.getByTestId("crew-search-row-open").click();
      const line = page
        .getByTestId("crew-today-block")
        .locator(`[data-search-target="${entryId}"]`);
      await expect(line).toHaveAttribute("data-search-reveal", "");
      await expect(line).toBeFocused();
      // PREMISE: the reveal scrolled, so the line's landing is the reveal's.
      await settleScroll(page);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expectClearOfStickyChrome(line, `the show note at ${viewport.width}px`);
    });
  }

  // Whole-diff review round 2, 2A-3: in the wide layout a Today reveal wrote no
  // history, so the section a nav jump had put in the URL stayed there and a
  // reload went back to it instead of the revealed line's home.
  test("home: after a nav jump to Venue, a Today search reveal leaves the URL at home, so a reload stays home", async ({
    page,
  }) => {
    await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
    await page.getByTestId("crew-wide-nav").locator('[data-section="venue"]').click();
    await expect(
      page.locator('[data-testid="crew-wide-section"][data-section="venue"] h2'),
    ).toBeFocused();
    // PREMISE: the jump put Venue in the URL, so there is an `s` to leave.
    expect(new URL(page.url()).searchParams.get("s")).toBe("venue");

    await page.getByRole("searchbox", { name: "Search this show" }).fill("freight elevator");
    const row = page
      .getByTestId("crew-search-row")
      .and(page.locator('[data-entry-id^="today:"]'))
      .filter({ hasText: VENUE.notes });
    await expect(row).toHaveCount(1);
    const entryId = (await row.getAttribute("data-entry-id"))!;
    await row.getByTestId("crew-search-row-open").click();
    await expect(
      page.getByTestId("crew-today-block").locator(`[data-search-target="${entryId}"]`),
    ).toHaveAttribute("data-search-reveal", "");
    expect(new URL(page.url()).searchParams.has("s"), page.url()).toBe(false);

    // A reload lands on the home: the nav marks Today, not Venue.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId("crew-wide-nav").locator('[aria-current="true"]'),
    ).toHaveAttribute("data-section", "today");
  });

  // Whole-diff review round 2 (round 3), 3A-2: search hides the page and the
  // document collapses; the spy used to read the hidden sections and pick the
  // last one, the nav dropped its bar, and ending search restored neither.
  test("home: a search started from a scrolled section leaves the nav on the section in view, with its bar, when it ends", async ({
    page,
  }) => {
    await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
    const nav = page.getByTestId("crew-wide-nav");
    const activeItem = nav.locator('[aria-current="true"]');
    /** The nav's bar sits on the active item, as the page now lies. */
    const barOnActive = () =>
      page.evaluate(() => {
        const bar = document.querySelector('[data-testid="crew-wide-nav-indicator"]');
        const item = document.querySelector('[data-testid="crew-wide-nav"] [aria-current="true"]');
        if (bar === null || item === null) return false;
        const b = bar.getBoundingClientRect();
        const i = item.getBoundingClientRect();
        return b.height > 0 && b.top >= i.top - 1 && b.bottom <= i.bottom + 1;
      });

    await nav.locator('[data-section="venue"]').click();
    await expect(activeItem, "PREMISE: the jump lands on Venue").toHaveAttribute(
      "data-section",
      "venue",
    );
    await settleScroll(page);
    expect(await page.evaluate(() => window.scrollY), "PREMISE: the page scrolled").toBeGreaterThan(
      0,
    );
    await expect.poll(barOnActive).toBe(true);

    const box = page.getByRole("searchbox", { name: "Search this show" });
    for (const end of ["Cancel", "Escape"] as const) {
      const before = await activeItem.getAttribute("data-section");
      await box.fill("freight elevator");
      await expect(page.getByTestId("page-container")).toBeHidden();
      await settleScroll(page);
      // While hidden, the spy chooses nothing: the item is the one search started from.
      await expect(activeItem, `${end}: the spy read no hidden section`).toHaveAttribute(
        "data-section",
        before!,
      );
      if (end === "Cancel") await page.getByTestId("crew-search-cancel").click();
      else {
        await box.press("Escape"); // clears the query
        await box.press("Escape"); // ends search
      }
      await expect(page.getByTestId("page-container")).toBeVisible();
      await settleScroll(page);
      // After: the nav marks the section the page actually shows, by the spy's
      // own rule over the page as it now lies, with its bar.
      const lay = await page.evaluate(() => {
        const doc = document.documentElement;
        const topOf = (el: Element) =>
          el.getBoundingClientRect().top +
          window.scrollY -
          (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
        const tops = [
          { id: "today", top: topOf(document.querySelector('[data-testid="crew-today-block"]')!) },
          ...[...document.querySelectorAll('[data-testid="crew-wide-section"]')].map((el) => ({
            id: el.getAttribute("data-section")!,
            top: topOf(el),
          })),
        ];
        return { y: window.scrollY, client: doc.clientHeight, height: doc.scrollHeight, tops };
      });
      const expected = activeSectionFor(lay.y, lay.client, lay.height, lay.tops);
      await expect(activeItem, `${end}: the nav marks the section in view`).toHaveAttribute(
        "data-section",
        expected,
      );
      await expect.poll(barOnActive, { message: `${end}: the bar is back on it` }).toBe(true);
    }
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

/** PR B plan Task 4: the `budget` alias in the wide layout (spec §5.1 "Legacy ids"). */
test.describe("billing: the budget alias, wide (PR B Task 4)", () => {
  test.setTimeout(180_000);

  const PO = "PO-WIDE-ALIAS-5120";
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Billing Alias Wide Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
        travelOut: "2026-04-23",
      },
      crew: [
        { name: "Wide Alias Lead", role: "TD", roleFlags: ["LEAD"] },
        { name: "Wide Alias Crew", role: "A1" },
      ],
      internal: {
        financials: {
          po: PO,
          proposal: "Wide proposal",
          invoice: "Wide invoice",
          invoice_notes: null,
        },
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

  function preview(name: string): string {
    const member = seeded.crew.find((c) => c.name === name);
    if (!member) throw new Error(`no seeded crew member ${name}`);
    return `/admin/show/${seeded.slug}/preview/${member.id}`;
  }

  async function loadWide(page: Page, path: string) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", "wide");
  }

  const navItem = (page: Page, id: string) =>
    page.getByTestId("crew-wide-nav").locator(`[data-section="${id}"]`);

  test("billing: ?s=budget lands on Billing for a lead preview", async ({ page }) => {
    await loadWide(page, `${preview("Wide Alias Lead")}?s=budget`);
    const stacked = page.locator('[data-testid="crew-wide-section"][data-section="billing"]');
    await expect(stacked).toContainText(PO);
    await expect(navItem(page, "billing")).toHaveAttribute("aria-current", "true", {
      timeout: 5000,
    });
    await expect(navItem(page, "billing")).toHaveText(CREW_SECTION_LABELS.billing);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("billing: a non-lead's ?s=budget and ?s=billing land at the top on Today", async ({
    page,
  }) => {
    for (const s of ["budget", "billing"]) {
      await loadWide(page, `${preview("Wide Alias Crew")}?s=${s}`);
      await expect(navItem(page, "today"), s).toHaveAttribute("aria-current", "true");
      await expect(navItem(page, "billing"), s).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY), s).toBe(0);
      expect(await page.content(), s).not.toContain(PO);
    }
  });
});

/**
 * PR B plan Task 9: the `travel` alias in the wide layout (spec §5.1 "Legacy
 * ids"), and every PR A id landing where it lands now. A plain admin on the share
 * route, entitled to every section. The new ids are spelled as strings and their
 * labels read from the show section registry, a moved section's label source, so
 * these cases typecheck before the crew id union carries `hotels`.
 */
test.describe("hotels and transport: the travel alias, wide (PR B Task 9)", () => {
  test.setTimeout(180_000);

  const HOTELS_LABEL = showSection("hotels").label;
  const HOTEL_NAME = "Wide Larkspur Inn";
  const GUEST = "Wade Wideguest";
  let seeded: Awaited<ReturnType<typeof seedShowWithCrew>>;

  test.beforeAll(async () => {
    seeded = await seedShowWithCrew({
      title: "Hotels Transport Wide Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
        travelOut: "2026-04-23",
      },
      crew: [{ name: GUEST, role: "A1" }],
      hotelReservations: [
        {
          ordinal: 1,
          hotelName: HOTEL_NAME,
          hotelAddress: "12 Wharf Row",
          checkIn: "2026-04-19",
          checkOut: "2026-04-23",
          names: [GUEST],
        },
      ],
      transportation: {
        driverName: "Wendell Axle",
        vehicle: "Silver Sprinter",
        schedule: [
          {
            stage: "Shuttle to the venue",
            date: "2026-04-21",
            time: "7:00am",
            assigned_names: [GUEST],
          },
        ],
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

  /** The share route, where the signed-in admin views the show as an admin. */
  function share(): string {
    return `/show/${seeded.slug}/${seeded.shareToken}`;
  }

  async function loadWide(page: Page, path: string) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", "wide");
  }

  const navItem = (page: Page, id: string) =>
    page.getByTestId("crew-wide-nav").locator(`[data-section="${id}"]`);

  test("hotels: ?s=travel lands on Hotels for an admin", async ({ page }) => {
    await loadWide(page, `${share()}?s=travel`);
    const stacked = page.locator('[data-testid="crew-wide-section"][data-section="hotels"]');
    await expect(stacked).toContainText(HOTEL_NAME);
    await expect(navItem(page, "hotels")).toHaveAttribute("aria-current", "true", {
      timeout: 5000,
    });
    await expect(navItem(page, "hotels")).toHaveText(HOTELS_LABEL);
    // One section replaced by two: no Travel item or stacked Travel section is left.
    await expect(navItem(page, "travel")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="crew-wide-section"][data-section="travel"]'),
    ).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("gear alias: every historical section id lands on its section, or at the top on Today, in wide", async ({
    page,
  }) => {
    // The historical union at lib/crew/resolveActiveSection.ts:1 as of 7e927e927,
    // then the ids PR B added, each with the nav item it lands on now. This show has
    // no agenda file, so its Agenda is unlisted, has no stacked section, and lands at
    // the top.
    const HISTORICAL_IDS: ReadonlyArray<readonly [string, string]> = [
      ["today", "today"],
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
      ["agenda", "today"],
    ];
    for (const [s, lands] of HISTORICAL_IDS) {
      await loadWide(page, `${share()}?s=${s}`);
      if (lands === "today") {
        await expect(navItem(page, lands), s).toHaveAttribute("aria-current", "true", {
          timeout: 5000,
        });
        await expect.poll(() => page.evaluate(() => window.scrollY), { message: s }).toBe(0);
        continue;
      }
      await expect(
        page.locator(`[data-testid="crew-wide-section"][data-section="${lands}"]`),
        s,
      ).toHaveCount(1);
      // Landed: the section's top sits at its scroll margin below the viewport top
      // (scrollWide's target), unless the page ran out of room first. A short
      // section near the end (Rooms on this show) cannot reach the top, and the
      // scroll-spy then names the last section in view, so the nav's current item
      // is not the landing's evidence here; where the section is.
      await expect
        .poll(
          () =>
            page.evaluate((id) => {
              const el = document.querySelector(
                `[data-testid="crew-wide-section"][data-section="${id}"]`,
              );
              if (!(el instanceof HTMLElement)) return "missing";
              const top = el.getBoundingClientRect().top;
              const margin = parseFloat(getComputedStyle(el).scrollMarginTop || "0");
              const atEnd =
                window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
              return Math.abs(top - margin) <= 1 ||
                (atEnd && top >= margin - 1 && top < window.innerHeight)
                ? "landed"
                : `top ${top}, margin ${margin}, scrollY ${window.scrollY}`;
            }, lands),
          { message: s },
        )
        .toBe("landed");
    }
  });
});

/**
 * PR B plan Task 10: Agenda is its own section, listed only when the show has an
 * agenda link with a file and entitled whenever the viewer's dates are not
 * suppressed (plan decision 1). In wide the nav and the stack iterate members,
 * so an entitled, unlisted Agenda has no stacked section, and a wide landing on
 * it goes to the top of the page with the spy on Today (decision 1 rule d). The
 * crossing case starts compact, scrolled down, with Agenda open, removes its
 * content with a refresh, then widens past 1024px. Each show is seeded per case;
 * the signed-in admin on the share route.
 *
 * DOCUMENTED LIMIT of the crossing case, measured: it pins the end state, not
 * rule d's own scroll. Built with the crossing effect returning early for a
 * section with no stacked element (the behavior before PR B Task 3), the case
 * still passes: the compact page at 1280x800 is no taller than the viewport, so
 * the browser clamps the scroll to 0 as it widens, and at a shorter wide
 * viewport the dismissed sheet hands focus to the Today block (rule e), which
 * scrolls the page to it. Rule d's `window.scrollTo(0)` is pinned by the Task 3
 * controller case "decision 1 rule d: crossing into wide with a sheet open on a
 * section with no stacked element scrolls to the top"
 * (tests/components/crew/crewSections.test.tsx).
 */
test.describe("agenda: the Agenda section, wide (PR B Task 10)", () => {
  test.setTimeout(180_000);

  const BASE_HEADERS = {
    "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
    Authorization: `Bearer ${TEST_AUTH_SECRET}`,
  };
  const COMPACT = { width: 390, height: 640 };
  const AGENDA_LINKS = [
    {
      label: "AGENDA",
      fileId: "agendaSectionWideE2E01",
      extracted: {
        confidence: "high",
        corrections: 0,
        extractorVersion: 2,
        days: [
          {
            dayLabel: "Tuesday, April 21, 2026",
            date: null,
            sessions: [
              {
                time: "9:00 AM",
                title: "Wide keynote rehearsal",
                room: "Ballroom B",
                tracks: [],
                drift: null,
              },
            ],
          },
        ],
      },
    },
  ];

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(BASE_HEADERS);
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  function seedAgendaShow(title: string, schedulePhases?: Record<string, ["Set"]>) {
    return seedShowWithCrew({
      title,
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: ["2026-04-21", "2026-04-22"],
        travelOut: "2026-04-23",
      },
      agendaLinks: AGENDA_LINKS as never,
      ...(schedulePhases === undefined ? {} : { schedulePhases }),
      crew: [{ name: "Wide Agenda Crew", role: "A1" }],
    });
  }

  async function loadIn(page: Page, path: string, mode: "wide" | "compact") {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", mode);
  }

  const navItem = (page: Page, id: string) =>
    page.getByTestId("crew-wide-nav").locator(`[data-section="${id}"]`);
  const stackedAgenda = (page: Page) =>
    page.locator('[data-testid="crew-wide-section"][data-section="agenda"]');

  test("agenda: the wide nav lists Today then the viewer's members in CREW_SECTION_IDS order, each with its registry label, and stacks them in that order", async ({
    page,
  }) => {
    // A pack-list phase on the pinned day (PR C Task 6: Pack list's gate).
    const seeded = await seedAgendaShow("Agenda Wide Order Show", { "2026-04-21": ["Set"] });
    try {
      await page.setViewportSize(WIDE);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}`, "wide");
      // An admin on a show with an agenda file, on a pack-list day, is a member of every
      // crew section.
      const expected = CREW_SECTION_IDS.map((id) => showSection(id as ShowSectionId).label);
      const items = page.getByTestId("crew-wide-nav").locator("[data-section]");
      const sections = await items.evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-section")),
      );
      expect(sections).toEqual(["today", ...CREW_SECTION_IDS]);
      const texts = await items.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
      expect(texts).toEqual(["Today", ...expected]);
      await expect(navItem(page, "agenda")).toHaveText(showSection("agenda").label);
      const stacked = await page
        .getByTestId("crew-wide-section")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
      expect(stacked).toEqual([...CREW_SECTION_IDS]);
      await expect(stackedAgenda(page)).toContainText("Wide keynote rehearsal");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("agenda: crossing into wide from a scrolled compact page with an Agenda sheet whose content a refresh removed lands at the top, keeping s=agenda, with no stacked Agenda", async ({
    page,
  }) => {
    const seeded = await seedAgendaShow("Agenda Crossing Show");
    try {
      await page.setViewportSize(COMPACT);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}`, "compact");
      // Scroll the home so the "All sections" card is in view, then open Agenda from it.
      await page
        .getByTestId("crew-all-sections")
        .locator('[data-section="agenda"]')
        .scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await page.getByTestId("crew-all-sections").locator('[data-section="agenda"]').click();
      await expect(page.getByRole("dialog")).toHaveAttribute("data-section", "agenda");

      await renderFresh(page, BASE_HEADERS);
      updateShowLocked(seeded.driveFileId, { agenda_links: [] });
      await refreshFromServer(page);
      await expect(
        page.getByTestId("crew-all-sections").locator('[data-section="agenda"]'),
      ).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveAttribute("data-section", "agenda");
      await expect(page.getByRole("dialog").getByText("No agenda on file yet.")).toBeVisible();
      // The refresh re-renders the home under the sheet, which leaves the page at the
      // top (measured: scrollY 675 before the refresh, 0 after it), so the page is
      // scrolled again before the crossing. The scroll lock blocks the user's
      // scrolling, not a programmatic one.
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: "auto" }));
      // PREMISE: the page under the sheet is scrolled, so a landing at 0 is a scroll.
      await expect
        .poll(() => page.evaluate(() => window.scrollY), { message: "scrollY before the crossing" })
        .toBeGreaterThan(0);

      await page.setViewportSize(WIDE);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-mode",
        "wide",
      );

      await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      expect(new URL(page.url()).searchParams.get("s")).toBe("agenda");
      await expect(stackedAgenda(page)).toHaveCount(0);
      await expect(navItem(page, "agenda")).toHaveCount(0);
      await expect(navItem(page, "today")).toHaveAttribute("aria-current", "true");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});

/**
 * PR C plan Task 6: Pack list, wide. Its gate is the compact block's (see that
 * block in crew-section-toggle.spec.ts): here the page lands on the stacked section
 * on a member day, has neither nav item nor stacked section on a Show day, and an
 * open sheet crossing into wide lands on the section it held. A plain admin on the
 * share route; each case seeds its own show, the phase its own input.
 */
test.describe("pack list: the Pack list section, wide (PR C Task 6)", () => {
  test.setTimeout(180_000);

  const BASE_HEADERS = {
    "X-Screenshot-Frozen-Now": SHOW_DAY_N_INSTANT,
    Authorization: `Bearer ${TEST_AUTH_SECRET}`,
  };
  const COMPACT = { width: 390, height: 640 };
  /** The pinned clock's day in the show's timezone. */
  const PINNED_DAY = "2026-04-21";
  const CASE_LABEL = "Wide zephyr rack";
  const RAW_SNIPPET = "2 | Audio | Stage | Wide stage box | TRUE";

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(BASE_HEADERS);
    await page.clock.setFixedTime(new Date(SHOW_DAY_N_INSTANT));
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  function seedPackShow(title: string, phase: "Set" | "Show") {
    return seedShowWithCrew({
      title,
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [PINNED_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      schedulePhases: { [PINNED_DAY]: [phase] },
      pullSheet: [
        {
          caseLabel: CASE_LABEL,
          items: [
            { qty: 2, cat: "Audio", subCat: null, item: "Wide stage box", rawSnippet: RAW_SNIPPET },
          ],
        },
      ],
      crew: [{ name: "Wide Pack Crew", role: "A1" }],
    });
  }

  async function loadIn(page: Page, path: string, mode: "wide" | "compact") {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", mode);
  }

  const navItem = (page: Page, id: string) =>
    page.getByTestId("crew-wide-nav").locator(`[data-section="${id}"]`);
  const stackedPack = (page: Page) =>
    page.locator('[data-testid="crew-wide-section"][data-section="packlist"]');

  /**
   * Landed: the section's top sits at its scroll margin, unless the page ran out of room
   * first. A short section near the end cannot reach the top, and the scroll-spy then
   * names the last section in view, so where the section is, not the nav's current item,
   * is the landing's evidence.
   */
  async function expectLandedOnPack(page: Page): Promise<void> {
    await expect
      .poll(() =>
        stackedPack(page).evaluate((el) => {
          const top = el.getBoundingClientRect().top;
          const margin = parseFloat(getComputedStyle(el).scrollMarginTop || "0");
          const atEnd =
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
          return Math.abs(top - margin) <= 1 ||
            (atEnd && top >= margin - 1 && top < window.innerHeight)
            ? "landed"
            : `top ${top}, margin ${margin}, scrollY ${window.scrollY}`;
        }),
      )
      .toBe("landed");
  }

  // Spec line 216, amended 2026-11-06: at wide widths the link lands on the stacked section.
  test("dress code: the home tile's link lands on Event details with the full text in view", async ({
    page,
  }) => {
    const TAIL = "FXAV lanyard at all times on the floor";
    const seeded = await seedShowWithCrew({
      title: "Dress Tile Wide Show",
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [PINNED_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      schedulePhases: { [PINNED_DAY]: ["Show"] },
      eventDetails: {
        dress_code: `Black pants, black polo, black closed-toe shoes, no logos. ${TAIL}`,
      },
      crew: [{ name: "Wide Dress Crew", role: "A1" }],
    });
    try {
      await page.setViewportSize(WIDE);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}`, "wide");
      await page
        .getByTestId("crew-quick-facts")
        .getByRole("link", { name: "Full dress code" })
        .click();
      await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBe("event");
      // Whole and unclipped: `toBeInViewport` alone passes on any intersection, and a
      // paragraph clamped by CSS still matches `getByText`.
      const dress = page
        .locator('[data-testid="crew-wide-section"][data-section="event"]')
        .getByText(TAIL);
      await expect(dress).toBeInViewport({ ratio: 1 });
      expect(await dress.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThan(2);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: on a Set day ?s=packlist lands on the stacked section, in its slot after Rooms", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Wide Set Show", "Set");
    try {
      await page.setViewportSize(WIDE);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}?s=packlist`, "wide");
      await expect(stackedPack(page)).toContainText(CASE_LABEL);
      await expect(navItem(page, "packlist")).toHaveText(showSection("packlist").label);
      await expectLandedOnPack(page);
      const stacked = await page
        .getByTestId("crew-wide-section")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
      expect(stacked.indexOf("packlist")).toBe(stacked.indexOf("rooms") + 1);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: on a Show day the nav has no item, no section stacks, and ?s=packlist lands at the top on Today", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Wide Show Show", "Show");
    try {
      await page.setViewportSize(WIDE);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}?s=packlist`, "wide");
      // PREMISE: the nav is built, so a missing item is the gate's doing.
      await expect(navItem(page, "venue")).toBeVisible();
      await expect(navItem(page, "packlist")).toHaveCount(0);
      await expect(stackedPack(page)).toHaveCount(0);
      await expect(navItem(page, "today")).toHaveAttribute("aria-current", "true");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: an open sheet crossing into wide lands on the stacked section, keeping s", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Wide Crossing Show", "Set");
    try {
      await page.setViewportSize(COMPACT);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}`, "compact");
      await page.getByTestId("crew-all-sections").locator('[data-section="packlist"]').click();
      await expect(page.getByRole("dialog")).toHaveAttribute("data-section", "packlist");
      await expect(page.getByRole("dialog")).toContainText(CASE_LABEL);

      await page.setViewportSize(WIDE);
      await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
        "data-crew-mode",
        "wide",
      );

      await expect(page.getByTestId("crew-section-sheet")).toHaveCount(0);
      await expect(stackedPack(page)).toContainText(CASE_LABEL);
      await expectLandedOnPack(page);
      expect(new URL(page.url()).searchParams.get("s")).toBe("packlist");
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("pack list: the numbered list and its raw rows hold the stacked section at 1280", async ({
    page,
  }) => {
    const seeded = await seedPackShow("Pack Wide Layout Show", "Set");
    try {
      await page.setViewportSize(WIDE);
      await loadIn(page, `/show/${seeded.slug}/${seeded.shareToken}?s=packlist`, "wide");
      const panel = stackedPack(page).locator('[data-card-id="gear-pack-list"]');
      await panel.locator("summary").first().click();
      const m = await panel.evaluate((root) => {
        const li = root.querySelector("details[open] ul > li")!;
        const snippet = li.querySelector('[data-testid$="pack-item-raw-snippet"]')!;
        const range = document.createRange();
        range.selectNodeContents(li.firstChild!);
        const text = range.getBoundingClientRect();
        const raw = snippet.getBoundingClientRect();
        const summary = root.querySelector("summary")!.getBoundingClientRect();
        return {
          summaryHeight: summary.height,
          summaryWidth: summary.width,
          panelWidth: root.getBoundingClientRect().width,
          textBottom: text.bottom,
          textLeft: text.left,
          rawTop: raw.top,
          rawLeft: raw.left,
        };
      });
      expect(m.summaryHeight).toBeGreaterThanOrEqual(44 - 0.5);
      expect(m.rawTop).toBeGreaterThanOrEqual(m.textBottom - 0.5);
      expect(Math.abs(m.rawLeft - m.textLeft)).toBeLessThanOrEqual(0.5);
      // The row spans the card's content box, so the count sits at its far edge.
      expect(m.summaryWidth).toBeGreaterThan(m.panelWidth / 2);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});

/**
 * PR C plan Task 9: the nav shows the registry's groups (spec line 239, AC-10), as runs
 * of a group in entry order (plan decision 11). Everything expected here is derived from
 * `SHOW_SECTIONS`, never typed, so a group or a label that moved in the registry moves
 * the expectation with it. A seeded show of its own: Waldorf has no agenda file and shuts
 * Pack list on the pinned day, so only a seeded admin is a member of every section.
 */
test.describe("registry groups: the wide nav's group headings (PR C Task 9)", () => {
  test.setTimeout(180_000);

  /** The pinned clock's day in the show's timezone. */
  const PINNED_DAY = "2026-04-21";
  const CREW_MEMBER = "Wide Groups Crew";

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

  /** An agenda file, and the pinned day's phase, which is what Pack list's gate reads. */
  function seedGroupsShow(title: string, phase: "Set" | "Show") {
    return seedShowWithCrew({
      title,
      dates: {
        travelIn: "2026-04-19",
        set: "2026-04-20",
        showDays: [PINNED_DAY, "2026-04-22"],
        travelOut: "2026-04-23",
      },
      agendaLinks: [
        {
          label: "AGENDA",
          fileId: "registryGroupsWideE2E01",
          extracted: {
            confidence: "high",
            corrections: 0,
            extractorVersion: 2,
            days: [
              {
                dayLabel: "Tuesday, April 21, 2026",
                date: null,
                sessions: [
                  {
                    time: "9:00 AM",
                    title: "Groups rehearsal",
                    room: "Ballroom B",
                    tracks: [],
                    drift: null,
                  },
                ],
              },
            ],
          },
        },
      ] as never,
      schedulePhases: { [PINNED_DAY]: [phase] },
      crew: [{ name: CREW_MEMBER, role: "A1" }],
    });
  }

  async function loadWide(page: Page, path: string) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} must render`).toBe(200);
    const root = page.getByTestId("crew-shell-sections");
    await expect(root).toHaveAttribute("data-crew-controller-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-crew-mode", "wide");
  }

  // Gate repair 7 (B P2-3, A P3-4): a full nav ran 817px in a 704px box at 1280x800, so
  // Pack list and Billing sat below the fold on a Set day, with no scrollbar on a Mac.
  test("registry groups: a full nav shows every item at rest at 1280x800, each 44px tall", async ({
    page,
  }) => {
    const seeded = await seedGroupsShow("Registry Groups Fit Show", "Set");
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      const m = await navEl(page).evaluate((nav) => {
        const box = nav.getBoundingClientRect();
        return {
          client: nav.clientHeight,
          scroll: nav.scrollHeight,
          items: [...nav.querySelectorAll("a[data-section]")].map((a) => {
            const r = a.getBoundingClientRect();
            return {
              id: a.getAttribute("data-section"),
              height: r.height,
              below: r.bottom > box.bottom,
            };
          }),
        };
      });
      const at = JSON.stringify(m);
      // PREMISE: a full nav, so an overflow would have been the old 113px.
      premise("every section is listed", m.items.length, 11);
      expect(m.scroll, at).toBeLessThanOrEqual(m.client);
      for (const item of m.items) {
        expect(item.height, item.id ?? at).toBeGreaterThanOrEqual(44);
        expect(item.below, item.id ?? at).toBe(false);
      }
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  const navEl = (page: Page) => page.getByTestId("crew-wide-nav");
  const navItem = (page: Page, id: string) => navEl(page).locator(`[data-section="${id}"]`);

  type Run = { heading: string | null; items: string[] };

  /** The nav as a reader meets it, top to bottom: each heading with the items under it. */
  function readRuns(page: Page): Promise<Run[]> {
    return navEl(page).evaluate((nav) => {
      const label = (a: Element) => a.textContent ?? "";
      const runs: Run[] = [];
      for (const child of nav.children) {
        if (child.matches("a[data-section]")) {
          runs.push({ heading: null, items: [label(child)] });
        } else if (child.getAttribute("role") === "group") {
          const id = child.getAttribute("aria-labelledby") ?? "";
          runs.push({
            heading: document.getElementById(id)?.textContent ?? null,
            items: [...child.querySelectorAll("a[data-section]")].map(label),
          });
        }
      }
      return runs;
    });
  }

  test("registry groups: an admin with every member reads Today, then each registry group in order, each followed by exactly its sections", async ({
    page,
  }) => {
    const seeded = await seedGroupsShow("Registry Groups Full Show", "Set");
    try {
      await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      expect(await readRuns(page)).toEqual([
        { heading: null, items: ["Today"] },
        ...SHOW_SECTION_GROUPS.map((group) => ({
          heading: group,
          items: SHOW_SECTIONS.filter((s) => s.group === group).map((s) => s.label),
        })),
      ]);
      // Painted, not only in the DOM: an element a reader cannot see still has text.
      for (const label of await navEl(page).getByTestId("crew-wide-nav-group").all()) {
        await expect(label).toBeVisible();
      }
      // Each run is a labelled group to assistive tech, with its items and only them.
      for (const group of SHOW_SECTION_GROUPS) {
        const run = navEl(page).getByRole("group", { name: group, exact: true });
        await expect(run.getByRole("link"), group).toHaveText(
          SHOW_SECTIONS.filter((s) => s.group === group).map((s) => s.label),
        );
      }
      // A heading is a plain label, so the page outline does not move (decision 11).
      await expect(navEl(page).getByRole("heading")).toHaveCount(0);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("registry groups: a non-lead on a Show day has no Money heading, and Gear lists Rooms alone", async ({
    page,
  }) => {
    const seeded = await seedGroupsShow("Registry Groups Non-Lead Show", "Show");
    try {
      const member = seeded.crew.find((c) => c.name === CREW_MEMBER);
      if (!member) throw new Error(`no seeded crew member ${CREW_MEMBER}`);
      await loadWide(page, `/admin/show/${seeded.slug}/preview/${member.id}`);
      const runs = await readRuns(page);
      // Positive control: this viewer's nav has headings to be absent from.
      expect(runs.map((r) => r.heading)).toContain(showSection("rooms").group);
      const money = showSection("billing").group;
      premiseHolds(
        "Billing is the only section in its group",
        SHOW_SECTIONS.filter((s) => s.group === money).length === 1,
      );
      expect(runs.map((r) => r.heading)).not.toContain(money);
      expect(runs.find((r) => r.heading === showSection("rooms").group)?.items).toEqual([
        showSection("rooms").label,
      ]);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("registry groups: no number sits beside a label, and every item's accessible name is its label alone", async ({
    page,
  }) => {
    const seeded = await seedGroupsShow("Registry Groups Copy Show", "Set");
    try {
      await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      const labels = ["Today", ...SHOW_SECTIONS.map((s) => s.label)];
      await expect(navEl(page).getByRole("link")).toHaveCount(labels.length);
      for (const label of labels) {
        await expect(navEl(page).getByRole("link", { name: label, exact: true })).toHaveCount(1);
      }
      // Spec line 421. The read sees every label and heading, so its silence is evidence.
      const text = (await navEl(page).textContent()) ?? "";
      for (const line of [...labels, ...SHOW_SECTION_GROUPS]) expect(text).toContain(line);
      expect(text).not.toMatch(/\d/);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("registry groups: dimensional: the nav holds spec §8 item 5 with group headings, every item at the tap floor, and the accent bar on the active item under its heading", async ({
    page,
  }) => {
    const TOL = 0.5;
    const seeded = await seedGroupsShow("Registry Groups Dimension Show", "Set");
    try {
      // Crew opens the People run, so a heading sits straight above the active item.
      await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}?s=crew`);
      await expect(navItem(page, "crew")).toHaveAttribute("aria-current", "true");

      const readDims = () =>
        page.evaluate(() => {
          const box = (el: Element) => {
            const r = el.getBoundingClientRect();
            return {
              top: r.top,
              bottom: r.bottom,
              left: r.left,
              right: r.right,
              w: r.width,
              h: r.height,
            };
          };
          const nav = document.querySelector('[data-testid="crew-wide-nav"]')!;
          const header = document.querySelector('[data-testid="page-header"]')!;
          const main = document.querySelector('[data-testid="page-container"]')!;
          const row = main.parentElement!;
          const rs = getComputedStyle(row);
          const ns = getComputedStyle(nav);
          const active = nav.querySelector('[aria-current="true"]')!;
          const run = active.parentElement!;
          return {
            innerHeight: window.innerHeight,
            nav: {
              ...box(nav),
              position: ns.position,
              overflowY: ns.overflowY,
              shrink: ns.flexShrink,
            },
            header: box(header),
            main: { ...box(main), minWidth: getComputedStyle(main).minWidth },
            rowGap: Number.parseFloat(rs.columnGap),
            rowRight: row.getBoundingClientRect().right - Number.parseFloat(rs.paddingRight),
            items: [...nav.querySelectorAll("a[data-section]")].map(box),
            runs: [...nav.querySelectorAll('[role="group"]')].map(box),
            active: box(active),
            bar: box(document.querySelector('[data-testid="crew-wide-nav-indicator"]')!),
            heading: box(run.firstElementChild!),
            activeIsFirstInRun: run.querySelector("a[data-section]") === active,
          };
        });

      // The bar slides at --duration-fast from its first placement: wait until it lands.
      await expect
        .poll(async () => {
          const m = await readDims();
          return Math.abs(m.bar.top - m.active.top - (m.active.bottom - m.bar.bottom));
        })
        .toBeLessThanOrEqual(TOL);

      const m = await readDims();
      const at = JSON.stringify(m);
      // Spec §8 item 5, read through the 2026-10-31 amendment.
      expect(Math.abs(m.nav.w - 240), at).toBeLessThanOrEqual(TOL);
      expect(m.nav.shrink, at).toBe("0");
      expect(m.nav.position, at).toBe("sticky");
      expect(m.nav.overflowY, at).toBe("auto");
      expect(Math.abs(m.nav.top - m.header.bottom), at).toBeLessThanOrEqual(TOL);
      expect(Math.abs(m.nav.bottom - m.innerHeight), at).toBeLessThanOrEqual(TOL);
      expect(Math.abs(m.main.left - (m.nav.right + m.rowGap)), at).toBeLessThanOrEqual(TOL);
      expect(Math.abs(m.main.right - m.rowRight), at).toBeLessThanOrEqual(TOL);
      // `min-w-0`, so a wide child never pushes the column past the row.
      expect(m.main.minWidth, at).toBe("0px");

      // A wrapper changes no item's box: each keeps the tap floor and Today's left edge
      // and width, and every run spans the column the items sit in.
      premise("nav items", m.items.length, SHOW_SECTIONS.length);
      const [today] = m.items;
      for (const item of m.items) {
        expect(item.h, at).toBeGreaterThanOrEqual(44 - TOL);
        expect(Math.abs(item.left - today!.left), at).toBeLessThanOrEqual(TOL);
        expect(Math.abs(item.w - today!.w), at).toBeLessThanOrEqual(TOL);
      }
      premise("nav runs", m.runs.length, 0);
      for (const run of m.runs) {
        expect(Math.abs(run.right - today!.right), at).toBeLessThanOrEqual(TOL);
      }

      // The bar sits on the active item, inside its height, and clear of the heading.
      premiseHolds("the active item opens its run", m.activeIsFirstInRun);
      expect(m.heading.h, at).toBeGreaterThan(0);
      expect(m.heading.bottom, at).toBeLessThanOrEqual(m.active.top + TOL);
      expect(Math.abs(m.bar.top - (m.active.top + 10)), at).toBeLessThanOrEqual(TOL);
      expect(Math.abs(m.bar.bottom - (m.active.bottom - 10)), at).toBeLessThanOrEqual(TOL);
      expect(m.bar.top, at).toBeGreaterThan(m.heading.bottom);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });

  test("registry groups: on a short window a jump keeps the active item inside the nav's box, down to Billing and back up", async ({
    page,
  }) => {
    const seeded = await seedGroupsShow("Registry Groups Short Window Show", "Set");
    try {
      await page.setViewportSize({ width: 1024, height: 640 });
      await loadWide(page, `/show/${seeded.slug}/${seeded.shareToken}`);
      const overflow = await navEl(page).evaluate((nav) => nav.scrollHeight - nav.clientHeight);
      premise("the nav's overflow past its box, in px", overflow, 0);

      // A DOM click, because a Playwright click scrolls its target into view first, which
      // would do the nav's job for it. Then the item's place in the box is the evidence.
      const insideNav = (id: string) =>
        navItem(page, id).evaluate((item) => {
          const nav = item.closest('[data-testid="crew-wide-nav"]')!.getBoundingClientRect();
          const r = item.getBoundingClientRect();
          return r.top >= nav.top - 0.5 && r.bottom <= nav.bottom + 0.5;
        });
      expect(await insideNav("billing"), "the premise: Billing starts below the fold").toBe(false);

      await navItem(page, "billing").evaluate((item) => (item as HTMLElement).click());
      await expect(navItem(page, "billing")).toHaveAttribute("aria-current", "true");
      await expect.poll(() => insideNav("billing")).toBe(true);
      expect(await insideNav("today"), "the premise: Today left the box").toBe(false);

      await navItem(page, "today").evaluate((item) => (item as HTMLElement).click());
      await expect(navItem(page, "today")).toHaveAttribute("aria-current", "true");
      await expect.poll(() => insideNav("today")).toBe(true);
    } finally {
      await deleteSeededShow(seeded.driveFileId);
    }
  });
});
