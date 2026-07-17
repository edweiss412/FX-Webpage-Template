/**
 * tests/e2e/showPageLayout.spec.ts (Task 14 — spec §8 dimensional invariants)
 *
 * Real-browser layout assertions for the consolidated admin show page shell
 * (<PublishedReviewPage>: pinned <StatusStrip> over <ShowReviewSurface
 * layout="page">). jsdom computes NO layout, so the two-pane stretch, the
 * sticky strip, and the single-row chip rail MUST be measured end-to-end in a
 * real browser — Tailwind v4 does not default `.flex` to `align-items: stretch`
 * (DESIGN.md §7), and `position: sticky` / `overflow` are layout-time behaviors.
 *
 * STANDALONE static harness (no app boot / no Supabase / no seed), modelled on
 * tests/e2e/step3-review-modal.layout.spec.ts:
 *   1. `tsx` runs tests/e2e/_showPageLayoutHarness.tsx OUT of process (its JSX +
 *      the imported real component tree break react-dom/server under
 *      Playwright's test transform) → { dfid, normal }. HASH_FOR_LOG_PEPPER is
 *      set for the subprocess only to satisfy a module-load guard on a
 *      transitively-imported auth helper; no email is ever hashed here.
 *   2. compile the real token CSS from app/globals.css via the Tailwind CLI with
 *      `@source` pointing at the rendered page so every class generates.
 *   3. serve harness.html over node:http; measure `getBoundingClientRect()`.
 *
 * The page renders inside the REAL admin-layout document-flow shell, so the
 * WINDOW is the scroll container (the admin layout has a non-sticky nav and no
 * height cap — window-scroll model, task-13 §Watchpoints). That is precisely
 * what the strip's `sticky top-0` (nav-offset 0) needs.
 *
 * Invariants (spec §8):
 *   §8.1 (≥ lg): the pane container stretches the side rail to the panel column
 *        height — `rail.height === content.height` within 0.5px. The rail's own
 *        nav content is well short of the column, so the equality is a real
 *        stretch (items-stretch), not a coincidence.
 *   §8.2: `strip.width === content-column width` within 0.5px, and the strip
 *        holds `getBoundingClientRect().top === 0` after a 2000px window scroll
 *        (sticky, nav-offset 0).
 *   §8.3 (< lg): the chip rail is a single horizontal-scroll row —
 *        `scrollHeight === clientHeight` within 1px (no vertical overflow); the
 *        side rail is hidden.
 *   §8.4: every documented fixed-dimension-parent testid (strip, side rail, chip
 *        rail, panel column) is measured at the viewport where it is live.
 *
 * Runs via tests/e2e/standalone.config.ts (no webServer / Supabase).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

// NOT imported from the harness (its JSX breaks under Playwright's loader — see
// header): duplicated here and cross-checked against the harness JSON so the
// two can never drift silently.
const DFID = "drive-showpage-1";
const LG = { width: 1360, height: 900 };
const MOBILE = { width: 390, height: 800 };

/** Every surface node's testid is `wizard-step3-card-<dfid>-review-<name>`. */
function tid(name: string): string {
  return `wizard-step3-card-${DFID}-review-${name}`;
}

function pageHtml(cssHref: string, body: string): string {
  return `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg">${body}</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;
// The pathological long title the harness rendered into harness-long.html (§8.5).
let longTitleText: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "showpage-layout-"));

  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_showPageLayoutHarness.tsx"), pagesJson],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      // Satisfies the module-load guard in lib/email/hashForLog.ts reached via a
      // transitively-imported auth helper; the static render hashes nothing.
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as {
    dfid: string;
    normal: string;
    longTitle: string;
    longTitleText: string;
  };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(DFID);
  longTitleText = pages.longTitleText;

  writeFileSync(join(workDir, "harness.html"), pageHtml("out.css", pages.normal));
  // §8.5 fixture: the SAME page with a pathological long strip title. It reuses
  // out.css (identical class strings — only the h1 text differs), so no second
  // Tailwind compile is needed.
  writeFileSync(join(workDir, "harness-long.html"), pageHtml("out.css", pages.longTitle));

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const bodyBuf = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(bodyBuf);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

test.describe("Consolidated admin show page — dimensional invariants (spec §8)", () => {
  test("§8.1 (≥lg): the pane container stretches the side rail to the panel-column height", async ({
    page,
  }) => {
    await page.setViewportSize(LG);
    await page.goto(baseUrl);

    const rail = page.getByTestId(tid("rail"));
    const content = page.getByTestId(tid("content"));

    // The side rail is live at ≥lg (it is `hidden lg:flex`).
    await expect(rail).toBeVisible();

    const railHeight = await rail.evaluate((el) => el.getBoundingClientRect().height);
    const contentHeight = await content.evaluate((el) => el.getBoundingClientRect().height);

    // Anti-tautology: measure the rail's INTRINSIC nav-content extent — the last
    // rail item's bottom relative to the rail top. (A stretched overflow-y-auto
    // scroller reports scrollHeight === clientHeight, so scrollHeight cannot
    // reveal the natural content height; the last child's position can.) The
    // nav content ends well short of the panel column, so equal box heights can
    // only come from the pane container's items-stretch, not coincidence.
    const contentExtent = await rail.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const items = el.querySelectorAll('[data-testid*="-review-rail-item-"]');
      const last = items[items.length - 1];
      return last ? last.getBoundingClientRect().bottom - top : el.getBoundingClientRect().height;
    });
    expect(
      contentExtent,
      "rail nav content must end well short of the panel column (else the stretch is vacuous)",
    ).toBeLessThan(contentHeight - 100);

    // The invariant: rail outer wrapper height === panel column height.
    expect(Math.abs(railHeight - contentHeight)).toBeLessThanOrEqual(0.5);
    // …and the rail box is genuinely taller than its own content (it stretched).
    expect(railHeight).toBeGreaterThan(contentExtent + 100);
  });

  test("§8.2 (≥lg): strip width matches the content column and it stays pinned on scroll", async ({
    page,
  }) => {
    await page.setViewportSize(LG);
    await page.goto(baseUrl);

    const strip = page.getByTestId("show-status-strip");
    const main = page.getByTestId(tid("main"));

    const stripWidth = await strip.evaluate((el) => el.getBoundingClientRect().width);
    const mainWidth = await main.evaluate((el) => el.getBoundingClientRect().width);
    // The strip spans the same content column as the two-pane region below it.
    expect(Math.abs(stripWidth - mainWidth)).toBeLessThanOrEqual(0.5);

    // Precondition: the page is genuinely scrollable (else the sticky assertion
    // is vacuous — nothing moves).
    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(maxScroll, "page must be tall enough for the sticky test to bite").toBeGreaterThan(1000);

    // Sticky (nav-offset 0): after a 2000px window scroll the strip is pinned to
    // the viewport top.
    await page.evaluate(() => window.scrollBy(0, 2000));
    const stripTop = await strip.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(stripTop - 0)).toBeLessThanOrEqual(0.5);
  });

  test("§8.3 (<lg): the chip rail is a single horizontal-scroll row and the side rail is hidden", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(baseUrl);

    const chiprail = page.getByTestId(tid("chiprail"));
    const rail = page.getByTestId(tid("rail"));

    await expect(chiprail).toBeVisible();
    // The side rail is hidden below lg (`hidden lg:flex`).
    await expect(rail).toBeHidden();

    const box = await chiprail.evaluate((el) => ({
      scrollHeight: (el as HTMLElement).scrollHeight,
      clientHeight: (el as HTMLElement).clientHeight,
      scrollWidth: (el as HTMLElement).scrollWidth,
      clientWidth: (el as HTMLElement).clientWidth,
    }));

    // Single row — NO vertical overflow (the chips must not wrap onto a 2nd row).
    expect(Math.abs(box.scrollHeight - box.clientHeight)).toBeLessThanOrEqual(1);
    // Horizontal scroll is the intended axis: the chips exceed the viewport
    // width at 390px (overflow-x: auto), proving the no-wrap row is real.
    expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
  });

  test("§8.4: every fixed-dimension-parent testid is measured at its live viewport", async ({
    page,
  }) => {
    // ≥lg: strip, side rail, panel column are the live fixed-dimension parents.
    await page.setViewportSize(LG);
    await page.goto(baseUrl);
    for (const id of ["show-status-strip", tid("rail"), tid("content")]) {
      const box = await page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      expect(box.w, `${id} width`).toBeGreaterThan(0);
      expect(box.h, `${id} height`).toBeGreaterThan(0);
    }

    // <lg: strip, chip rail, panel column are live (the side rail is hidden).
    await page.setViewportSize(MOBILE);
    await page.goto(baseUrl);
    for (const id of ["show-status-strip", tid("chiprail"), tid("content")]) {
      const box = await page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      expect(box.w, `${id} width`).toBeGreaterThan(0);
      expect(box.h, `${id} height`).toBeGreaterThan(0);
    }
  });

  // §8.5: a pathological long strip title TRUNCATES and the strip does NOT
  // overflow at any viewport. This is the successor to the deleted
  // admin-lifecycle-layout `per-show long-title header` test (the rebuild dropped
  // AdminPageHeader; the strip's <h1 data-testid="strip-title"> — min-w-0 truncate
  // in a flex-wrap/sm:flex-nowrap strip — is now the page heading). jsdom can't
  // verify truncation (it computes no layout) and Tailwind v4 does not default
  // `.flex` to align-items/min-width behaviors — so this is measured end-to-end.
  for (const [label, vp] of [
    ["≥lg (flex-nowrap)", LG],
    ["<sm (flex-wrap)", MOBILE],
  ] as const) {
    test(`§8.5 ${label}: a long strip title truncates and the strip does not overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto(`${baseUrl}harness-long.html`);

      const strip = page.getByTestId("show-status-strip");
      const title = page.getByTestId("strip-title");
      await expect(strip).toBeVisible();
      await expect(title).toBeVisible();

      // Anti-tautology: the long fixture actually loaded (the h1 carries the long
      // title text), so the truncation assertion below is exercising the real
      // pathological case — not the short default fixture.
      const titleText = (await title.textContent()) ?? "";
      expect(titleText, "the long-title fixture is loaded").toBe(longTitleText);

      const box = await title.evaluate((el) => ({
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
      }));
      // Truncation is real: the intrinsic text is wider than the rendered box.
      // This only holds if `min-w-0` lets the h1 shrink below its content and
      // `truncate` (overflow:hidden) clips it — the exact behavior jsdom misses.
      expect(
        box.scrollWidth,
        `long title truncates (content wider than box) at ${label}`,
      ).toBeGreaterThan(box.clientWidth);

      // No horizontal overflow: neither the document nor the strip gains a
      // horizontal scrollbar from the long title (the truncated h1 must not push
      // the strip wider than its column).
      const overflow = await strip.evaluate((el) => {
        const root = document.documentElement;
        const stripRect = el.getBoundingClientRect();
        const offenders: number[] = [];
        for (const child of Array.from(el.children)) {
          const r = child.getBoundingClientRect();
          if (r.right > stripRect.right + 0.5) offenders.push(r.right);
        }
        return {
          docScrollW: root.scrollWidth,
          docClientW: root.clientWidth,
          stripScrollW: (el as HTMLElement).scrollWidth,
          stripClientW: (el as HTMLElement).clientWidth,
          offenders,
        };
      });
      expect(
        overflow.docScrollW,
        `document has no horizontal overflow at ${label}`,
      ).toBeLessThanOrEqual(overflow.docClientW + 0.5);
      expect(
        overflow.stripScrollW,
        `strip content does not overflow its box at ${label}`,
      ).toBeLessThanOrEqual(overflow.stripClientW + 0.5);
      // No individual strip child (title, toggle, badges) spills past the strip's
      // right edge.
      expect(
        overflow.offenders,
        `no strip child overflows the strip right edge at ${label}`,
      ).toEqual([]);
    });
  }
});
