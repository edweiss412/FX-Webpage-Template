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
 * Gated to mobile-safari (the project that runs the crew-page seed-reads as a
 * single writer). desktop-chromium early-returns from every test so it never
 * re-runs the same seed reads at the wrong widths.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Locator, type Page } from "@playwright/test";
import { DRAG_DISMISS_THRESHOLD_PX } from "@/components/shared/sheetConstants";
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
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

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer: mobile-safari only
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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

  test("sheet: browser Back from an open sheet closes it", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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

  test("sheet: a row link keeps the allow-listed gate into the sheet's URL", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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

  test("sheet: the close button is named Close plus the section name", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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

  test("sheet: a drag released before the threshold springs back to open", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  test("5: record first-load payload bytes + FCP (perf-tradeoff evidence)", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;

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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
