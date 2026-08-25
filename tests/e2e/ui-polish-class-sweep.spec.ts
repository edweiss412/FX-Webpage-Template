/**
 * The ui-polish class sweep, measured in a real engine.
 *
 * Design doc: `docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md`.
 *
 * WHY THIS FILE EXISTS AND THE UNIT SUITES DO NOT REPLACE IT. Two of this arc's
 * claims are undecidable in jsdom, and a unit assertion about either would pass
 * for the wrong reason:
 *
 *   1. A TAP FLOOR is a computed height. jsdom lays nothing out, so every
 *      `getBoundingClientRect()` there returns 0 and `height >= 44` is false —
 *      or, if written the other way, vacuous. The unit suites therefore assert
 *      that the floor CLASS is on the element that toggles, which is the half
 *      they can settle; this file asserts the box.
 *
 *   2. The ShareHub defect is a CASCADE. `border-text-faint` and
 *      `max-sm:border-border` were both on the same element, and which one won
 *      depended on the viewport. No class-list assertion can see that: only a
 *      browser with the compiled stylesheet at a real width can say what colour
 *      the control actually paints. That is why the measurement below runs at
 *      375px as well as 1280px.
 *
 * WHAT THE `classString` CASES ARE. For surfaces whose props are a page's worth
 * of fixture, the spec reads the class string out of the shipped source and
 * hands it to the harness. It is not a copy — it is the file's own string, so a
 * class that changes in the source changes here with no edit. What is under
 * test in those cases is the cascade and the token, not the component's logic.
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { bundleLiveEntry, compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");
// 390px, the width PRODUCT.md names for the crew phone and the width the design
// doc's T12 claims. The first draft used 375 and the claim said 390 — a small
// mismatch, but a proof that measures a different viewport than the one it
// cites is not the proof it says it is.
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
/** AGENTS.md mechanical UI gate; the token is `--spacing-tap-min`. */
const TAP_FLOOR = 44;

let server: Server;
let baseUrl: string;
let workDir: string;

/** Source files whose classes must exist in the compiled stylesheet. */
const SOURCES = [
  ["components", "admin", "RoleRecognizeControl.tsx"],
  ["components", "crew", "primitives", "RunOfShowList.tsx"],
  ["components", "admin", "showpage", "ShareHub.tsx"],
  ["components", "admin", "showpage", "PublishedReviewModal.tsx"],
  ["components", "admin", "StagedPreviewBanner.tsx"],
  ["components", "diagrams", "GalleryLightbox.tsx"],
  ["tests", "e2e", "_uiPolishLiveEntry.tsx"],
];

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "ui-polish-sweep-"));
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  bundleLiveEntry({
    entry: join(REPO_ROOT, "tests", "e2e", "_uiPolishLiveEntry.tsx"),
    outFile: join(workDir, "bundle.js"),
    aliases: {
      "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts"),
      "next/navigation": join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts"),
    },
  });

  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    [
      ...SOURCES.map((parts) => `@source "${join(REPO_ROOT, ...parts)}";`),
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
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
      res.end("nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no addr");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

async function open(page: Page, kase: string, className?: string, plate?: string): Promise<void> {
  if (className !== undefined || plate !== undefined) {
    await page.addInitScript(
      ([c, p]) => {
        if (c !== undefined) window.__UI_POLISH_CLASS = c;
        if (p !== undefined) window.__UI_POLISH_PLATE = p;
      },
      [className, plate] as const,
    );
  }
  await page.goto(`${baseUrl}/live.html?case=${kase}`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId("harness-ready").waitFor({ state: "attached" });
}

/** The className a source file gives the element carrying `testid`. */
function classOf(relPath: string, testid: string): string {
  const src = readFileSync(join(REPO_ROOT, relPath), "utf8");
  const at = src.indexOf(testid);
  if (at < 0) throw new Error(`${testid} is not in ${relPath}`);
  // The two ShareHub arms are a ternary; take the first arm's literal, which is
  // the published branch. The kebab is a template literal with one static head.
  const m = /"([^"]*(?:min-h-tap-min|inline-flex)[^"]*)"/.exec(src.slice(at, at + 4000));
  if (!m) throw new Error(`no class literal after ${testid} in ${relPath}`);
  return m[1]!;
}

/** rgb() as read back from the engine, parsed to three channels. */
function channels(rgb: string): [number, number, number] {
  const m = rgb.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) throw new Error(`unreadable colour ${rgb}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
function relLuminance(rgb: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = channels(rgb);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test.describe("tap floors, measured rather than asserted from a class list", () => {
  for (const [label, viewport] of [
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ] as const) {
    test(`the FINANCIALS label clears ${TAP_FLOOR}px at ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, "role-recognize");
      await page.getByTestId("role-recognize-trigger").click();

      const box = page.locator('label:has([data-testid="role-recognize-check-FINANCIALS"])');
      await expect(box).toBeVisible();
      // POLLED, not read once. The panel animates in, and `toBeVisible()`
      // resolves as soon as the element is rendered — mid-transform, where the
      // box is still short. Reading the rect at that instant made this case
      // fail intermittently against a floor that was genuinely there. Polling
      // waits for the settled box and still fails outright when the floor is
      // absent, because a box that never reaches 44 never will.
      await expect
        .poll(async () => (await box.boundingBox())?.height ?? 0, {
          message: "the FINANCIALS label never settled at or above the tap floor",
        })
        .toBeGreaterThanOrEqual(TAP_FLOOR);

      // The half a class list cannot check: the caution must be OUTSIDE the
      // label, or the checkbox announces a sentence about payroll.
      await expect(box).not.toContainText("payroll", { ignoreCase: true });

      // And the half jsdom cannot check. The unit suite asserts the `htmlFor`
      // ASSOCIATION, because jsdom does not synthesise the label-to-control
      // click a browser does — which makes that assertion close to a restatement
      // of the markup. A real engine does synthesise it, so here the claim is
      // the behaviour itself: clicking the label toggles the box. That is the
      // whole point of moving the floor onto the label rather than the `div`
      // that used to carry it, and a `div` would fail this line.
      const checkbox = page.getByTestId("role-recognize-check-FINANCIALS");
      await expect(checkbox).not.toBeChecked();
      await box.click({ position: { x: 8, y: 8 } });
      await expect(checkbox).toBeChecked();
    });

    test(`the OTHER FINANCIALS label clears ${TAP_FLOOR}px at ${label}`, async ({ page }) => {
      // D6 says both rows take the identical shape. That is a claim about two
      // separate components, and they drifted apart once already — so the second
      // one is measured rather than inferred from the first.
      await page.setViewportSize(viewport);
      await open(page, "role-mapping");
      // The edit trigger is named by its aria-label, not a testid.
      await page.getByRole("button", { name: /edit/i }).first().click();

      const box = page.locator('label:has([data-testid="role-mapping-check-FINANCIALS"])');
      await expect(box).toBeVisible();
      await expect
        .poll(async () => (await box.boundingBox())?.height ?? 0, {
          message: "the RoleMappingRow FINANCIALS label never settled at or above the tap floor",
        })
        .toBeGreaterThanOrEqual(TAP_FLOOR);
      await expect(box).not.toContainText("payroll", { ignoreCase: true });
    });

    test(`the staged-review radio label clears ${TAP_FLOOR}px at ${label}`, async ({ page }) => {
      // The third repaired target. D7 took it out of the class-sweep exception
      // that had been fencing it, so it owes the same measured proof as the
      // other two rather than a class assertion.
      await page.setViewportSize(viewport);
      await open(page, "staged-review");
      const label_ = page.locator('label:has(input[type="radio"])').first();
      await expect(label_).toBeVisible();
      await expect
        .poll(async () => (await label_.boundingBox())?.height ?? 0, {
          message: "the staged-review radio label never settled at or above the tap floor",
        })
        .toBeGreaterThanOrEqual(TAP_FLOOR);
    });

    test(`the run-of-show summary clears ${TAP_FLOOR}px at ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, "run-of-show");
      const summary = page.locator('[data-testid="agenda-title-truncated"] summary');
      await expect(summary).toBeVisible();
      await expect
        .poll(async () => (await summary.boundingBox())?.height ?? 0, {
          message: "the run-of-show summary never settled at or above the tap floor",
        })
        .toBeGreaterThanOrEqual(TAP_FLOOR);

      // The fold cue, painted rather than declared.
      const chevron = summary.locator("svg");
      await expect(chevron).toBeVisible();
      const cbox = await chevron.boundingBox();
      expect(cbox, "the chevron has no box").not.toBeNull();
      expect(cbox!.width).toBeGreaterThan(0);
    });
  }
});

test.describe("the ShareHub outline, which only ever misbehaved below 640px", () => {
  const SHARE_HUB = "components/admin/showpage/ShareHub.tsx";

  for (const [label, viewport] of [
    ["phone (max-sm, where the defect lived)", PHONE],
    ["desktop", DESKTOP],
  ] as const) {
    test(`paints the control-outline token at ${label}`, async ({ page }) => {
      const className = classOf(SHARE_HUB, "share-hub-primary");
      // The fixture is the shipped string, so this cannot drift from the file.
      expect(className, "the arm no longer carries a max-sm outline").toContain(
        "max-sm:border-text-faint",
      );
      await page.setViewportSize(viewport);
      await open(page, "class-string", className, "bg-surface");

      const subject = page.getByTestId("subject");
      const border = await subject.evaluate((el) => getComputedStyle(el).borderTopColor);
      const fill = await page
        .getByTestId("plate")
        .evaluate((el) => getComputedStyle(el).backgroundColor);

      // 3:1 is the SC 1.4.11 non-text floor. Before the repair this measured
      // 1.27:1 at phone width and 3.35:1 at desktop — the same control, twice
      // as invisible on the viewport most of this product is read on.
      expect(contrast(border, fill)).toBeGreaterThanOrEqual(3.0);
    });
  }

  test("paints the SAME outline at both widths", async ({ page }) => {
    const className = classOf(SHARE_HUB, "share-hub-primary");
    const read = async (w: { width: number; height: number }) => {
      await page.setViewportSize(w);
      await open(page, "class-string", className, "bg-surface");
      return page.getByTestId("subject").evaluate((el) => getComputedStyle(el).borderTopColor);
    };
    const phone = await read(PHONE);
    const desktop = await read(DESKTOP);
    // The point of the row: one control, one weight. A pass on both floors
    // above would still allow two DIFFERENT colours that each happen to clear.
    expect(phone).toBe(desktop);
  });
});

test.describe("the tinted-plate outline, measured against the plate it stands on", () => {
  for (const plate of ["bg-warning-bg", "bg-info-bg", "bg-danger-bg"] as const) {
    test(`clears 3:1 on ${plate}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await open(
        page,
        "class-string",
        "inline-flex min-h-tap-min items-center rounded-sm border border-control-outline-tinted bg-transparent px-3",
        plate,
      );
      const border = await page
        .getByTestId("subject")
        .evaluate((el) => getComputedStyle(el).borderTopColor);
      const fill = await page
        .getByTestId("plate")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      // `bg-transparent` is the worst case in the population: both edges of the
      // outline are the plate, so there is no own-fill side that clears easily.
      expect(contrast(border, fill)).toBeGreaterThanOrEqual(3.0);
    });
  }
});
