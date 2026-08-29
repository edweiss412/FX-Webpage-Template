/**
 * tests/e2e/wizard-attention-menu.spec.ts
 *
 * Real-browser geometry pins for the Step 3 attention pill and its warning
 * index (spec 2026-08-27-wizard-review-attention-menu §9). jsdom computes no
 * layout, so a 44px tap floor, a hit band drawn by a pseudo-element, and a
 * right-anchored panel fitting inside the modal's clip are claims only a real
 * engine can settle.
 *
 * HARNESS (standalone, no app boot) — the block below is the agenda spec's,
 * copied verbatim per that spec's own precedent, pointed at the live entry with
 * `?attention=1`. There are no shared bundle()/serve() helpers to reuse.
 *
 * Why no RED marker: a geometry pin has no production-defect red once Task 8 has
 * landed — the dimensions it asserts are already true — and a "No tests found"
 * collection failure is not an observed red. Discrimination is proved by the
 * four mutants recorded in the task's commit instead, each checked for
 * application (file hash), window (Playwright reads after layout settles on a
 * static page) and branch (the mutated class is on the element measured).
 */
// The SHARED fixture, not @playwright/test: it attaches the font-fidelity
// oracle to the documents this spec renders, and a spec that calls
// compileEntryCss without it is dark to that oracle
// (tests/e2e/_metaFontFidelityWiring.test.ts).
import { expect, test } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { VIEWPORT_INSET } from "@/lib/popover/position";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

// CommonJS package — Playwright's CJS loader provides __dirname.
const REPO_ROOT = resolve(__dirname, "..", "..");
const HARNESS_DFID = "drive-abc-123";
const TAP_FLOOR = 44;

// The WIZARD modal's clip element. `[data-review-modal-panel]` is the PUBLISHED
// modal's and must not be used here: Step3ReviewModal passes
// dataAttrPrefix="step3-review" to ReviewModalShell, which stamps
// `data-step3-review-panel`.
const PANEL = "[data-step3-review-panel]";
const CHIP = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-chip"]`;
const MENU = `[data-testid="wizard-step3-card-${HARNESS_DFID}-review-attention-menu"]`;
const ROW = `[data-testid^="wizard-step3-card-${HARNESS_DFID}-attention-row-"]`;
const SCROLLER = `${MENU} [role="group"][aria-label="Warnings to review"]`;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "wizard-attention-menu-"));

  const pagesJson = join(workDir, "pages.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalHarness.tsx"), pagesJson],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  const pages = JSON.parse(readFileSync(pagesJson, "utf8")) as { dfid: string; normal: string };
  expect(pages.dfid, "spec-local dfid matches the harness fixture").toBe(HARNESS_DFID);
  writeFileSync(
    join(workDir, "harness.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"></head><body class="bg-bg">${pages.normal}</body></html>`,
  );

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
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  // The static harness page renders the CLEAN header, so it emits none of the
  // pill's or the menu's classes. Source the three components that own this
  // spec's geometry explicitly, or every assertion below measures unstyled
  // markup and passes for the wrong reason.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(workDir, "harness.html")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "Step3ReviewModal.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "wizard", "WizardAttentionMenu.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "showpage", "AttentionMenu.tsx")}";`,
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

/**
 * Load, wait for hydration, then settle the AUTO-OPEN so every case starts from
 * a deterministic CLOSED menu it opens by click. The attention fixture has
 * n > 0, so the menu opens itself one frame after mount; without this settle a
 * case would race it.
 */
async function openModal(page: Page, width: number, height: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}?attention=1`);
  const chip = page.locator(CHIP);
  await chip.waitFor();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await page.locator(MENU).waitFor({ state: "visible" });
  // Dismissed by PRESSING the pill, not by Escape. Since the §3.5 scoping
  // amendment an auto-opened panel is Escape-transparent until engaged, so
  // Escape here would close the whole modal and every case below would then run
  // against nothing.
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(MENU)).toHaveCount(0);
}

test.describe("wizard attention pill + menu geometry (spec §9)", () => {
  test("the compiled CSS actually carries the rules these assertions depend on", async ({
    page,
  }) => {
    // Anti-vacuity for the whole file: a missing @source makes every geometry
    // assertion below measure unstyled markup, and unstyled markup happens to
    // satisfy some of them.
    await openModal(page, 1280, 800);
    const css = await page.evaluate(async () => {
      const res = await fetch("out.css");
      return res.text();
    });
    expect(css).toContain("min-h-tap-min");
    expect(css).toContain("inset-y-3");
  });

  test("the pill's hit band clears the 44px floor at 1280x800", async ({ page }) => {
    await openModal(page, 1280, 800);
    const probe = await page.evaluate(
      ({ chipSel, floor }) => {
        const el = document.querySelector(chipSel) as HTMLElement;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const before = getComputedStyle(el, "::before");
        const top = parseFloat(before.top);
        const bottom = parseFloat(before.bottom);
        return {
          visible: r.height,
          // The pseudo-element's insets are NEGATIVE when it extends past the
          // box, so the band is the box plus both overhangs.
          band: r.height + Math.abs(top) + Math.abs(bottom),
          hitAbove: document.elementFromPoint(cx, cy - (floor / 2 - 2)) === el,
          hitBelow: document.elementFromPoint(cx, cy + (floor / 2 - 2)) === el,
          tag: el.tagName,
        };
      },
      { chipSel: CHIP, floor: TAP_FLOOR },
    );
    expect(probe.tag).toBe("BUTTON");
    // The premise the band exists to satisfy: the VISIBLE pill is under the
    // floor, so a passing band cannot be the box's own height.
    expect(probe.visible).toBeLessThan(TAP_FLOOR);
    expect(probe.band).toBeGreaterThanOrEqual(TAP_FLOOR);
    expect(probe.hitAbove).toBe(true);
    expect(probe.hitBelow).toBe(true);
  });

  for (const [w, h] of [
    [1280, 800],
    [375, 667],
    // BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW: the declared probe domain is four
    // viewports on both review modals (spec 2026-08-28-attention-menu-clip-placement
    // §10). These two were the wizard half's missing cells.
    [375, 844],
    [390, 560],
  ] as const) {
    test(`every menu row clears the 44px floor at ${w}x${h}`, async ({ page }) => {
      await openModal(page, w, h);
      await page.locator(CHIP).click();
      await page.locator(MENU).waitFor({ state: "visible" });
      const heights = await page.evaluate(
        (rowSel) =>
          [...document.querySelectorAll(rowSel)].map((r) => r.getBoundingClientRect().height),
        ROW,
      );
      // The fixture is composite (two needs-look + one judgment), so a zero-row
      // menu would otherwise satisfy `every`.
      expect(heights.length).toBe(3);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(TAP_FLOOR);
    });

    // Containment on EVERY viewport in the list above, on both horizontal edges
    // and the bottom. This case used to run at 1280 only, with 375 carrying a
    // deliberate CHARACTERIZATION of the overhang
    // (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW) and a note to flip it when the
    // row was fixed. That row is fixed here, so the characterization is gone and
    // both edges are asserted at all four viewports.
    //
    // Two things it now does that the old case could not. It measures AT REST,
    // where the old one measured mid-entrance and so recorded 0.95x the real
    // overhang. And it asserts the natural width is PRESERVED, which is what
    // makes the ratified choice — containment bought with alignment, not with
    // width — falsifiable rather than merely stated.
    test(`the panel stays inside the modal clip at ${w}x${h}`, async ({ page }) => {
      await openModal(page, w, h);
      await page.locator(CHIP).click();
      await page.locator(MENU).waitFor({ state: "visible" });
      // MEASURE AT REST, and settle on `scale` rather than `transform`.
      // Tailwind v4 compiles `scale-*` to the INDIVIDUAL `scale` property, so
      // `transform` reads "none" the whole time the panel is scaled to 95% — a
      // wait on it returns immediately and measures a 0.95x box. That is how
      // this case previously recorded the overhang as -18.85 when at rest it is
      // -36: 343 * 0.95 = 325.85, and `origin-top-right` pins the right edge.
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (el === null) return false;
          const settled = getComputedStyle(el).scale;
          return settled === "1" || settled === "none";
        },
        MENU,
        { timeout: 5_000 },
      );
      const box = await page.evaluate(
        ({ menuSel, panelSel, chipSel }) => {
          const menu = document.querySelector(menuSel)!.getBoundingClientRect();
          const clip = document.querySelector(panelSel)!.getBoundingClientRect();
          const chip = document.querySelector(chipSel)!.getBoundingClientRect();
          return {
            menu: { left: menu.left, right: menu.right, bottom: menu.bottom, width: menu.width },
            clip: { left: clip.left, right: clip.right, bottom: clip.bottom, width: clip.width },
            chip: { right: chip.right },
          };
        },
        { menuSel: MENU, panelSel: PANEL, chipSel: CHIP },
      );
      const TOL = 0.5;
      // Asserted FIRST: a menu that failed to open has a zero-width rect, which
      // satisfies every containment comparison below by rendering nothing.
      expect(box.menu.width).toBeGreaterThan(0);
      // LEFT is the discriminating edge: the panel is right-anchored, so an
      // over-wide panel overflows leftwards.
      expect(box.menu.left).toBeGreaterThanOrEqual(box.clip.left - TOL);
      expect(box.menu.right).toBeLessThanOrEqual(box.clip.right + TOL);
      expect(box.menu.bottom).toBeLessThanOrEqual(box.clip.bottom + TOL);

      // The width is the DECLARED 400px natural, capped by the clip's inset
      // bounds and by nothing else. This is what makes the ratified
      // width-over-alignment choice falsifiable: the declined alternative
      // narrows the panel to the anchor-to-clip-edge distance to stay flush, and
      // would fail here. Derived from the measured clip and the core's own
      // VIEWPORT_INSET, never a pixel constant.
      expect(box.menu.width).toBeCloseTo(Math.min(400, box.clip.width - 2 * VIEWPORT_INSET), 0);

      // Where the clip does NOT bind, the panel stays flush with its trigger, so
      // the placement clamp is proved to fire only when it must. Derived from the
      // measured chip rect rather than a pixel constant.
      if (box.chip.right - box.menu.width >= box.clip.left) {
        expect(box.menu.right).toBeCloseTo(box.chip.right, 0);
      }
    });
  }

  test("a row click scrolls its warning into the scroller's view and flashes it", async ({
    page,
  }) => {
    await openModal(page, 1280, 800);
    await page.locator(CHIP).click();
    await page.locator(MENU).waitFor({ state: "visible" });
    await page.locator(`${ROW}`).first().click();
    await page.locator('[data-attention-anchor="warning:0"]').waitFor();
    const probe = await page.evaluate(() => {
      const li = document.querySelector('[data-attention-anchor="warning:0"]') as HTMLElement;
      const scroller = document.querySelector("[data-step3-review-panel] [class*='overflow-y']");
      const s = (scroller ?? document.documentElement).getBoundingClientRect();
      const r = li.getBoundingClientRect();
      return {
        flashed: li.hasAttribute("data-step3-warning-flash"),
        inView: r.top >= s.top - 1 && r.bottom <= s.bottom + 1,
      };
    });
    expect(probe.flashed).toBe(true);
    expect(probe.inView).toBe(true);
  });

  test("the composite pill leaves the show title legible at 375 (spec §9, PRODUCT.md persona)", async ({
    page,
  }) => {
    // The defect this exists to catch, measured before the fix: the pill carried
    // `whitespace-nowrap` with no wrap or width cap, so the composite state
    // ("2 need a look · 1 judgment call") took 236px of a 375px viewport and the
    // title — `min-w-0 flex-1`, so it absorbs every loss — collapsed to 6.97px.
    // No document overflow, no scrollbar: the damage lands entirely on the one
    // thing Doug needs to see on a venue floor, which show he is reviewing.
    // Both clauses below fail on that geometry and pass on the fixed one
    // (pill 160, title 83).
    await openModal(page, 375, 667);
    const m = await page.evaluate((chipSel) => {
      const chip = document.querySelector(chipSel) as HTMLElement;
      const header = document.querySelector('[data-testid$="-review-header"]') as HTMLElement;
      const title = document.querySelector('[data-testid$="-review-title"]') as HTMLElement;
      return {
        text: chip.innerText.replace(/\s+/g, " ").trim(),
        chipW: chip.getBoundingClientRect().width,
        titleW: title.getBoundingClientRect().width,
        headerW: header.getBoundingClientRect().width,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
      };
    }, CHIP);
    // Premise: the fixture really is in the COMPOSITE state, the widest one.
    // A single-segment pill would satisfy the bounds without exercising them.
    expect(m.text).toContain("need a look");
    expect(m.text).toContain("judgment call");
    // The pill may not eat half the header...
    expect(m.chipW).toBeLessThanOrEqual(m.headerW / 2);
    // ...and the title keeps a legible share of it.
    expect(m.titleW).toBeGreaterThanOrEqual(m.headerW * 0.15);
    // And none of this is bought with a horizontal scrollbar.
    expect(m.docScrollW).toBe(m.docClientW);
  });

  test("the menu's scroller is a nameable, focusable region", async ({ page }) => {
    // The contract most easily lost when a menu is rebuilt: a bare div maps to
    // `generic`, which is naming-prohibited, so the name would be dropped
    // silently rather than failing anything.
    await openModal(page, 375, 667);
    await page.locator(CHIP).click();
    const scroller = page.locator(SCROLLER);
    await expect(scroller).toHaveAttribute("tabindex", "0");
    await expect(scroller).toBeVisible();
  });
});
