/**
 * tests/e2e/warning-card-layout.spec.ts
 * (warning-card-fixes spec §13.1 Dimensional Invariants; plan Task 7)
 *
 * Real-browser geometry pins for the wizard warning card's title row: the sheet
 * icon link at its end, the Judgment call tag inside the text cluster. jsdom
 * computes no layout, and the anchor's 44px hit area is an out-of-flow ::before
 * overlay that `getBoundingClientRect()` cannot see (components/admin/SheetIconLink.tsx
 * header), so every overlay claim below is either computed from the anchor rect
 * plus its resolved insets (12 / 10 / 14 px) or settled by hit testing.
 *
 * DI-1 to DI-9 run at 320, 375, 430, 640 and 1280 widths on the needs-look,
 * judgment and info rows; DI-2 on the link-less row; DI-10 on the 120-character
 * title row at 320, 375 and 430; DI-11 measures the tag's single-line height at
 * 1280 and compares it at every width. Before any DI assertion each row proves
 * it rendered its link (and the judgment row its tag), so three copies of one
 * row cannot pass as three kinds, and the panel proves real Tailwind emitted
 * (`p-tile-pad` resolves to 20px).
 *
 * HARNESS (standalone, no app boot, no Supabase), per the plan's checklist:
 *   1. bundles tests/e2e/_warningCardLiveEntry.tsx through
 *      tests/e2e/_step3ReviewModalBundle.mjs (elides "use server" modules and
 *      node builtins, proven on the real Step3ReviewModal tree);
 *   2. compiles the real token CSS over app/globals.css with explicit @source
 *      lines for every file whose classes these assertions measure;
 *   3. serves live.html over node:http on port 0.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/warning-card-layout.spec.ts
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

// CommonJS package — Playwright's CJS loader provides __dirname.
const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const TAP_FLOOR = 44;
const TILE_PAD_PX = "20px";
const WIDTHS = [320, 375, 430, 640, 1280] as const;
const LONG_TITLE_WIDTHS = [320, 375, 430] as const;
const HEIGHT = 900;

type RowKey = "needsLook" | "judgment" | "info" | "linkless" | "longTitle";
type FixtureMeta = { dfid: string; rows: Record<RowKey, number> };

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "warning-card-layout-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_warningCardLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // A client-only mount: no static page carries these classes, so each file
  // whose classes the assertions measure is sourced explicitly. The modal
  // shell and surface are sourced too, so the scroller and panel the rows sit
  // in are laid out as in production rather than as unstyled blocks.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "step3ReviewSections.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "JudgmentCallTag.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "SheetIconLink.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "attentionMark.ts")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "Step3ReviewModal.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "DataQualityWarningControls.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "archivedTabOffer.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "ReviewModalShell.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "ShowReviewSurface.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_warningCardLiveEntry.tsx")}";`,
      globals,
    ].join("\n"),
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(body);
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

const rowTestId = (meta: FixtureMeta, key: RowKey) =>
  `wizard-step3-card-${meta.dfid}-warning-${meta.rows[key]}`;

/**
 * Load at a width, wait for fonts and the first fixture row, and settle the
 * attention menu, whose panel auto-opens above `sm` and would sit over the rows
 * a hit test reads. Then a CSS premise: the rows' panel resolves `p-tile-pad`.
 */
async function load(page: Page, width: number): Promise<FixtureMeta> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(`${baseUrl}?scenario=layout`);
  await page.evaluate(() => document.fonts.ready);
  const raw = await page.locator("html").getAttribute("data-warning-card-rows");
  if (!raw) throw new Error("live entry did not publish data-warning-card-rows");
  const meta = JSON.parse(raw) as FixtureMeta;
  await expect(page.getByTestId(`${rowTestId(meta, "needsLook")}-title-row`)).toBeVisible();

  // Two frames so a one-frame-later auto-open has landed before it is read.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  const chip = page.getByTestId(`wizard-step3-card-${meta.dfid}-review-chip`);
  if ((await chip.count()) > 0 && (await chip.getAttribute("aria-expanded")) === "true") {
    await chip.click();
    await expect(chip).toHaveAttribute("aria-expanded", "false");
  }

  const padding = await page.evaluate(
    (id) => {
      const row = document.querySelector(`[data-testid="${id}"]`);
      if (!row) throw new Error(`missing ${id}`);
      const panel = row.closest('[data-testid$="-panel-card"]');
      if (!panel) throw new Error(`no panel card around ${id}`);
      return getComputedStyle(panel).paddingLeft;
    },
    `${rowTestId(meta, "needsLook")}-title-row`,
  );
  expect(padding, "CSS premise: the panel's p-tile-pad compiled to 20px").toBe(TILE_PAD_PX);
  return meta;
}

type Box = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};
type RowGeometry = {
  row: Box;
  cluster: Box;
  column: Box;
  link: Box | null;
  tag: Box | null;
  titleHeight: number;
  titleLineHeight: number;
  hitTrailing: boolean | null;
  hitLeading: boolean | null;
};

/** Scroll the row into the middle of the modal scroller, then read every box in
 *  one evaluate (explicit null checks, never a locator on a node a step could
 *  unmount). */
async function geometry(page: Page, base: string): Promise<RowGeometry> {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing ${id}`);
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }, `${base}-title-row`);
  return page.evaluate((b) => {
    const need = (sel: string): Element => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    const box = (el: Element) => {
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
    const row = need(`[data-testid="${b}-title-row"]`);
    const cluster = row.firstElementChild;
    if (!cluster) throw new Error("title row has no text cluster");
    const column = row.parentElement;
    if (!column) throw new Error("title row has no content column");
    const title = cluster.querySelector(".font-medium.text-text-strong");
    if (!title) throw new Error("title row has no title node");
    const link = document.querySelector(`[data-testid="${b}-sheetlink"]`);
    const tag = document.querySelector(`[data-testid="${b}-judgment-tag"]`);
    const isAnchor = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && link !== null && (hit === link || link.contains(hit));
    };
    const l = link ? box(link) : null;
    return {
      row: box(row),
      cluster: box(cluster),
      column: box(column),
      link: l,
      tag: tag ? box(tag) : null,
      titleHeight: title.getBoundingClientRect().height,
      titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
      hitTrailing: l ? isAnchor(l.right + 13, l.top + 10) : null,
      hitLeading: l ? isAnchor(l.left - 9, l.top + 10) : null,
    };
  }, base);
}

const near = (a: number, b: number) => Math.abs(a - b) <= TOL;

test.describe("wizard warning title row (spec §13.1)", () => {
  for (const width of WIDTHS) {
    test(`DI-1 to DI-9 on the needs-look, judgment and info rows at ${width}px`, async ({
      page,
    }) => {
      const meta = await load(page, width);
      for (const key of ["needsLook", "judgment", "info"] as const) {
        const g = await geometry(page, rowTestId(meta, key));
        const at = `${key} @${width}`;
        // Premise: the row rendered its link, and only the judgment row its tag.
        expect(g.link, `${at}: link rendered`).not.toBeNull();
        if (key === "judgment") expect(g.tag, `${at}: tag rendered`).not.toBeNull();
        else expect(g.tag, `${at}: no tag`).toBeNull();
        const link = g.link!;
        const row = g.row;
        // DI-1
        expect(row.height, `${at} DI-1`).toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
        // DI-3
        expect(
          near(link.width, 20) && near(link.height, 20),
          `${at} DI-3 ${link.width}x${link.height}`,
        ).toBe(true);
        // DI-4
        expect(near(link.top - row.top, row.bottom - link.bottom), `${at} DI-4`).toBe(true);
        // DI-5
        expect(link.top - 12, `${at} DI-5 top`).toBeGreaterThanOrEqual(row.top - TOL);
        expect(link.bottom + 12, `${at} DI-5 bottom`).toBeLessThanOrEqual(row.bottom + TOL);
        // DI-6
        expect(link.left - g.cluster.right, `${at} DI-6`).toBeGreaterThanOrEqual(10 - TOL);
        // DI-7
        expect(near(link.right, row.right), `${at} DI-7 ${link.right} vs ${row.right}`).toBe(true);
        // DI-8
        expect(g.hitTrailing, `${at} DI-8 trailing overlay`).toBe(true);
        // DI-9
        expect(near(row.width, g.column.width), `${at} DI-9`).toBe(true);
        // Tap floor on the heading side.
        expect(g.hitLeading, `${at} heading-side overlay`).toBe(true);
      }
      // DI-2: the link-less single-line row keeps no 44px floor.
      const linkless = await geometry(page, rowTestId(meta, "linkless"));
      expect(linkless.link, `linkless @${width}: premise, no link`).toBeNull();
      expect(
        linkless.titleHeight,
        `linkless @${width}: premise, the title is one line`,
      ).toBeLessThan(linkless.titleLineHeight * 1.5);
      expect(linkless.row.height, `linkless @${width} DI-2`).toBeLessThan(TAP_FLOOR);
    });
  }

  for (const width of LONG_TITLE_WIDTHS) {
    test(`DI-10: a 120-character title wraps inside the cluster at ${width}px`, async ({
      page,
    }) => {
      const meta = await load(page, width);
      const g = await geometry(page, rowTestId(meta, "longTitle"));
      expect(g.link, "premise: the long-title row has its link").not.toBeNull();
      // Premise: the title really wrapped, or "never under the link" is vacuous.
      expect(g.titleHeight, "premise: the long title wraps").toBeGreaterThan(
        g.titleLineHeight * 1.5,
      );
      const link = g.link!;
      expect(g.cluster.right, "DI-10 cluster clears the link").toBeLessThanOrEqual(
        link.left - 10 + TOL,
      );
      expect(link.top, "DI-10 link stays inside the row").toBeGreaterThanOrEqual(g.row.top - TOL);
    });
  }

  test("DI-11: the Judgment call tag keeps its single-line height at every width", async ({
    page,
  }) => {
    const meta = await load(page, 1280);
    const single = await geometry(page, rowTestId(meta, "judgment"));
    expect(single.tag, "premise: tag rendered").not.toBeNull();
    const singleHeight = single.tag!.height;
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const g = await geometry(page, rowTestId(meta, "judgment"));
      expect(g.tag, `@${width}: tag rendered`).not.toBeNull();
      expect(
        near(g.tag!.height, singleHeight),
        `@${width}: ${g.tag!.height} vs ${singleHeight}`,
      ).toBe(true);
    }
  });
});

/**
 * The archived pull sheet card's include button (warning-card-fixes spec §7.3, §13 tap
 * floors; plan Task 13): the shared `ArchivedTabIncludeButton` on the card is at least
 * 44px tall by rect at 375 and 1280. Readiness: the entry's archived fixture published,
 * the include visible, and real Tailwind emitted (the rows' panel resolves `p-tile-pad`).
 */
test.describe("archived pull sheet card include (spec §7.3)", () => {
  for (const width of [375, 1280] as const) {
    test(`the include button meets the 44px tap floor at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: HEIGHT });
      await page.goto(`${baseUrl}?scenario=archived`);
      await page.evaluate(() => document.fonts.ready);
      const raw = await page.locator("html").getAttribute("data-warning-card-archived");
      if (!raw) throw new Error("live entry did not publish data-warning-card-archived");
      const meta = JSON.parse(raw) as { dfid: string; row: number };
      const include = `wizard-step3-card-${meta.dfid}-warning-${meta.row}-archived-include`;
      await expect(page.getByTestId(include)).toBeVisible();
      const geometry = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) throw new Error(`missing ${id}`);
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        const panel = el.closest('[data-testid$="-panel-card"]');
        if (!panel) throw new Error(`no panel card around ${id}`);
        return {
          height: el.getBoundingClientRect().height,
          padding: getComputedStyle(panel).paddingLeft,
        };
      }, include);
      expect(geometry.padding, "CSS premise: the panel's p-tile-pad compiled to 20px").toBe(
        TILE_PAD_PX,
      );
      expect(geometry.height, `include @${width}`).toBeGreaterThanOrEqual(TAP_FLOOR - TOL);
    });
  }
});
