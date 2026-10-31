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
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { refreshFromServer, renderFresh } from "./helpers/crewRefresh";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { setRoleFlagsLocked } from "./helpers/lockedCrewRestriction";
import { updateShowLocked } from "./helpers/lockedShowCopy";
import { deleteSeededShow, seedShowWithCrew } from "./helpers/seedShowWithCrew";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

// Same show_day_n instant the crew-page §4.9 suite freezes to: the seed's first
// show day, noon UTC (a stable morning ET) → a deterministic pass state.
const SHOW_DAY_N_INSTANT = "2026-04-21T12:00:00Z";

const TOL = 0.5;

/** Every PR A section an admin opens, in nav order (spec §5.1). */
const ADMIN_SECTIONS: CrewSectionId[] = [
  ...BASE_SECTION_IDS.flatMap((id) => (id === "today" ? [] : [id])),
  "budget",
];

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
    await row(page, "travel").click();
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "travel");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-crew-controller-ready",
      "true",
      { timeout: 30_000 },
    );
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "travel");
    expect(
      await page.evaluate(() => (history.state as { crewSheet?: boolean } | null)?.crewSheet),
      "a reload keeps the pushed entry's marker",
    ).toBe(true);

    await page.getByRole("button", { name: closeName("travel") }).click();
    await expect(sheetDialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("s")).toBeNull();
    await expect(page.getByTestId("crew-all-sections")).toBeVisible();
  });

  test("sheet: the close button is named Close plus the section name", async ({ page }) => {
    await load(page, "?s=today");
    for (const id of ["gear", "budget"] as const) {
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

  test("compound: a refresh that takes Budget from a previewed lead closes the Budget sheet to home without animation and leaves no Budget value on the page", async ({
    page,
  }) => {
    const FINANCIALS = {
      po: "PO-COMPOUND-7731",
      proposal: "Proposal compound 4410",
      invoice: "Invoice compound 9902",
      invoice_notes: "Compound invoice note 5515",
    };
    const seeded = await seedShowWithCrew({
      title: "Compound Budget Show",
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
      await openFromRow(page, "budget");
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
      // Every DOM change from here on: is the Budget row still listed, is the sheet still mounted.
      await page.evaluate(() => {
        const log: Array<{ row: boolean; sheet: boolean }> = [];
        (window as unknown as { __compoundLog: typeof log }).__compoundLog = log;
        new MutationObserver(() => {
          log.push({
            row:
              document.querySelector(
                '[data-testid="crew-all-sections"] [data-section="budget"]',
              ) !== null,
            sheet: document.querySelector('[data-testid="crew-section-sheet"]') !== null,
          });
        }).observe(document.body, { childList: true, subtree: true, attributes: true });
      });

      await renderFresh(page, BASE_HEADERS);
      await setRoleFlagsLocked(seeded.driveFileId, lead.id, []);
      await refreshFromServer(page);

      await expect(row(page, "budget")).toHaveCount(0);
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
        "PREMISE: the observer saw the Budget row leave",
      ).toBe(true);
      expect(
        log.filter((e) => !e.row && e.sheet),
        "the sheet left in the same commit as the Budget row: no exit slide holding the old body",
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
      await openFromRow(page, "schedule");
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
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "schedule");
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
      await openFromRow(page, "schedule");
      const trigger = sheetDialog(page).getByRole("button", { name: /View agenda/ });
      await activate(page, trigger);
      await expect(page.getByTestId("agenda-sheet")).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(page.getByTestId("agenda-sheet")).toHaveCount(0);
      await expect(sheetDialog(page)).toHaveAttribute("data-section", "schedule");
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
    await openFromRow(page, "venue");
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
    await expect(sheetDialog(page)).toHaveAttribute("data-section", "venue");
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
