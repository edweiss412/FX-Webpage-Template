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
  // WIDTH-AWARE since BL-ATTENTION-MENU-AUTOOPEN-COVERS-TOGGLE-PHONE. Below
  // `sm` the auto-open is suppressed, because the panel covers the modal's
  // navigation chips and both routes to the spreadsheet at phone widths
  // (measured, spec 2026-08-29-attention-auto-open-phone-suppression §5.1). At
  // those widths the panel is reached by TAPPING the chip, which is the same
  // tolerant shape popover-clip-fit.spec.ts's openMenu already uses.
  //
  // The assertion is kept in BOTH branches rather than dropped: at ≥`sm` the
  // arrival must still auto-open, and below it the arrival must NOT, so this
  // helper pins the boundary behaviour every case downstream depends on instead
  // of quietly tolerating either.
  const autoOpens = width >= 640;
  await expect(chip).toHaveAttribute("aria-expanded", autoOpens ? "true" : "false");
  if (!autoOpens) await chip.click();
  await page.locator(MENU).waitFor({ state: "visible" });
  // Dismissed by PRESSING the pill, not by Escape. Since the §3.5 scoping
  // amendment an auto-opened panel is Escape-transparent until engaged, so
  // Escape here would close the whole modal and every case below would then run
  // against nothing.
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(MENU)).toHaveCount(0);
}

/**
 * Boot at a DESKTOP width and leave the auto-opened panel OPEN.
 *
 * `openModal` dismisses it by design, and dismissing is a CLICK, which sets
 * `menuAutoOpened` false (Step3ReviewModal.tsx:594-597). Re-clicking to reopen
 * therefore produces a TAP-opened menu, not an auto-opened one — so a defect
 * conditional on `menuAutoOpened` would survive a case that called itself
 * "auto-opened". Round 4 of whole-diff review caught exactly that in the first
 * version of the resize block below.
 */
async function bootAutoOpened(page: Page, width: number, height: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}?attention=1`);
  const chip = page.locator(CHIP);
  await chip.waitFor();
  // Never clicked, so `menuAutoOpened` is still true.
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await page.locator(MENU).waitFor({ state: "visible" });
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
      // BOTH edges: the core clamps x into `[bounds.left, bounds.right - width]`,
      // so flushness also requires the anchor's right edge to sit inside the inset
      // bounds. The one-sided form passed here by luck of geometry and FAILED on
      // the published twin in CI, where the pill extends past `bounds.right`
      // (menu.right 1068.16 against pill.right 1084).
      const boundsLeft = box.clip.left + VIEWPORT_INSET;
      const boundsRight = box.clip.right - VIEWPORT_INSET;
      if (box.chip.right - box.menu.width >= boundsLeft && box.chip.right <= boundsRight) {
        expect(box.menu.right).toBeCloseTo(box.chip.right, 0);
      }

      // AC-5 pins the MEASURED desktop geometry, not a self-consistent relation.
      // `menu.right === pill.right` above is satisfied by ANY anchor position, so
      // a desktop layout shift moving the wrapper would keep every other assertion
      // green while the panel is no longer where it was before this arc. These two
      // literals are the pre-fix measurement, and pinning them is the whole point
      // of a criterion that says "identical to today".
      if (w === 1280) {
        expect(box.menu.left).toBeCloseTo(684, 0);
        expect(box.menu.width).toBeCloseTo(400, 0);
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

  // Decision 7 (Eric, ratified 2026-08-30) applies to THIS pill too, and the
  // impeccable audit is what caught that it had been left behind. The wizard
  // twin ships the identical recipe as the published pill -- `text-sm sm:text-xs`,
  // the same 160px HEADER_ACTION_CAP, `max-sm:flex-wrap`, the same hit band --
  // and its nouns are LONGER ("need a look", "judgment calls" against "issues").
  // Same cap, more text: it wraps at 375 where the published pill no longer does.
  /**
   * The wizard's marks, grounded by MEASUREMENT rather than by the argument the
   * call site passes.
   *
   * This pill is where the plate parameter actually varies: `judgment` resolves
   * to `text-subtle` on the attention plate and `text-faint` on the quiet one,
   * because the same ink is 2.793:1 on one and 3.02:1 on the other. Whole-diff
   * R5's probe was to pass `sunken` for the composite segment, which paints on
   * `warning-bg` -- it type-checks, it satisfies the structural contrast arm
   * (which believes the argument), and it ships an invisible ring.
   *
   * Reading the ink and the ground off the rendered element cannot be fooled
   * that way, because it never reads the argument. The mark COUNT is asserted
   * in the same pass: the judgment-only state is one of the three R5 found with
   * no count guard, where a suppression predicate can regress to two marks.
   */
  test("T-WIZ-GROUND @375: the wizard's marks clear 3:1 on the surface they really paint on", async ({
    page,
  }) => {
    const read = async () =>
      page.locator(CHIP).evaluate((pill) => {
        const parse = (c: string): [number, number, number, number] | null => {
          const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c);
          return m === null
            ? null
            : [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
        };
        const out: { ink: number[]; ground: number[]; opacity: number }[] = [];
        for (const el of Array.from(
          pill.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          const ink = parse(
            parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : cs.backgroundColor,
          );
          if (ink === null || ink[3] === 0) continue;
          let ground: number[] | null = null;
          for (let a: HTMLElement | null = el.parentElement; a !== null; a = a.parentElement) {
            const c = parse(getComputedStyle(a).backgroundColor);
            if (c !== null && c[3]! > 0) {
              ground = c;
              break;
            }
          }
          if (ground === null) continue;
          let opacity = 1;
          for (let a: HTMLElement | null = el; a !== null; a = a.parentElement) {
            opacity *= parseFloat(getComputedStyle(a).opacity);
          }
          out.push({ ink, ground, opacity });
        }
        return out;
      });

    const hex = (c: number[]) =>
      `#${c
        .slice(0, 3)
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`;

    // Token tables read from the LIVE stylesheet, both dark blocks separately:
    // this project themes dark twice, once for first paint and once for the
    // explicit toggle, and a viewer sees one or the other.
    const css = readFileSync(join(REPO_ROOT, "app/globals.css"), "utf8");
    const mediaAt = css.indexOf("@media (prefers-color-scheme: dark)");
    const attrAt = css.indexOf('[data-theme="dark"] {');
    const readTable = (slice: string) => {
      const out: Record<string, string> = {};
      for (const m of slice.matchAll(/--color-([a-z-]+)-runtime:\s*(#[0-9a-fA-F]{6})/g)) {
        if (out[m[1]!] === undefined) out[m[1]!] = m[2]!.toLowerCase();
      }
      return out;
    };
    const [lo, hi] = mediaAt < attrAt ? [mediaAt, attrAt] : [attrAt, mediaAt];
    const TOK = {
      light: readTable(css.slice(0, lo)),
      darkA: readTable(css.slice(lo, hi)),
      darkB: readTable(css.slice(hi)),
    };
    expect(Object.keys(TOK.light).length, "premise: the light token table parsed").toBeGreaterThan(
      5,
    );

    const invert = (names: readonly string[]) =>
      Object.fromEntries(names.map((n) => [TOK.light[n]!, n])) as Record<string, string>;
    const PLATE_BY_LIGHT_HEX = invert(["warning-bg", "surface-sunken"]);
    const INK_BY_LIGHT_HEX = invert([
      "status-review",
      "status-positive",
      "text-faint",
      "text-subtle",
    ]);

    const lum = (h: string) => {
      const ch = [1, 3, 5].map((i) => {
        const s = parseInt(h.slice(i, i + 2), 16) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
    };
    /** Worst of the two dark blocks, so neither can hide behind the other. */
    const tokenContrast = (ink: string, plate: string, mode: "light" | "dark") => {
      const tables = mode === "light" ? [TOK.light] : [TOK.darkA, TOK.darkB];
      return Math.min(
        ...tables.map((tb) => {
          const [x, y] = [lum(tb[ink]!), lum(tb[plate]!)];
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        }),
      );
    };

    await page.setViewportSize({ width: 375, height: 812 });
    for (const [fixture, expected, what] of [
      ["attention=1", 2, "composite (needs-look leads, judgment follows)"],
      ["judgmentOnly=1", 1, "judgment-only"],
    ] as const) {
      await page.goto(`${baseUrl}?${fixture}`);
      await expect(page.locator(CHIP)).toBeVisible();
      {
        const marks = await read();
        expect(marks.length, `${what}: exactly ${expected} mark(s), one per visible segment`).toBe(
          expected,
        );

        for (const [i, m] of marks.entries()) {
          // WHICH PLATE IS THIS, REALLY. The call site declares one; this reads
          // the rendered ground and names it from the live token values, so a
          // wrong argument is caught by the colour on screen rather than
          // believed. That is R5's finding 2 exactly: passing `sunken` for a
          // mark that paints on `warning-bg` type-checks and satisfies every
          // check that trusts the argument.
          const groundHex = hex(m.ground);
          const plate = PLATE_BY_LIGHT_HEX[groundHex];
          expect(
            plate,
            `${what} mark ${i}: painted on ${groundHex}, which is neither warning-bg nor surface-sunken -- the mark has moved to a surface this guard does not know`,
          ).toBeDefined();

          const inkHex = hex(m.ink);
          const ink = INK_BY_LIGHT_HEX[inkHex];
          expect(
            ink,
            `${what} mark ${i}: ink ${inkHex} is not a known token; a mark must be painted with one`,
          ).toBeDefined();

          expect(m.opacity, `${what} mark ${i} is faded to ${m.opacity}`).toBe(1);

          // ...and now BOTH modes, from the stylesheet rather than the fixture.
          // The fixtures paint light, so a rendered-only dark check would depend
          // on the harness expressing dark mode; the token tables do not.
          for (const mode of ["light", "dark"] as const) {
            const r = tokenContrast(ink!, plate!, mode);
            expect(
              r,
              `${what} mark ${i}: ${ink} on ${plate} is ${r.toFixed(3)}:1 in ${mode} mode, under the 3:1 non-text floor (WCAG 1.4.11)`,
            ).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  test("T-WIZ-COUNTS @375: the wizard pill shows counts without nouns, and still ANNOUNCES them", async ({
    page,
  }) => {
    await openModal(page, 375, 812);
    const chip = page.locator(CHIP);
    await expect(chip).toHaveCount(1);

    const seen = await chip.evaluate((el) => {
      const hiddenAncestor = (n: Node): boolean => {
        for (
          let e: HTMLElement | null = n.parentElement;
          e && e !== el.parentElement;
          e = e.parentElement
        ) {
          if (
            (() => {
              const cs = getComputedStyle(e);
              // Whole-diff R2 P1: the old predicate recognised ONLY the sr-only
              // shape (`position:absolute` + hairline width), so an ordinary
              // `max-sm:opacity-0`, `invisible`, or `hidden` on a count wrapper
              // stayed INCLUDED -- the rendered count could vanish while the guard
              // still observed a digit and passed. Every ordinary way to hide a
              // box is checked now, computed rather than inferred from classes.
              if (cs.display === "none" || cs.visibility === "hidden") return true;
              if (parseFloat(cs.opacity) === 0) return true;
              // Whole-diff R3 P1: same defect as the two published-modal
              // walkers. `display: contents` generates no box, so the rects
              // below read 0x0 on an element that hides nothing, and the noun
              // would be dropped while it renders. `return false` is this
              // IIFE's "this ancestor hides nothing"; the remaining ancestors
              // are still checked by the enclosing loop.
              if (cs.display === "contents") return false;
              const r = e.getBoundingClientRect();
              if (cs.position === "absolute" && r.width <= 2) return true;
              if (r.width === 0 || r.height === 0) return true;
              return false;
            })()
          )
            return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let visible = "";
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!hiddenAncestor(n)) visible += n.textContent ?? "";
      }
      return { visible: visible.replace(/\s+/g, " ").trim() };
    });

    for (const noun of ["need a look", "needs a look", "judgment call", "judgment calls"]) {
      expect(seen.visible, `"${noun}" must not be visible below sm`).not.toContain(noun);
    }
    expect(seen.visible, "the counts themselves stay visible").toMatch(/\d/);
    // The nouns survive in the COMPUTED accessible name, not merely in
    // textContent: an aria-label override would satisfy textContent silently.
    // BOTH nouns, never an alternation. Whole-diff R4 hid each in turn and the
    // alternation stayed green both times: "2·1 judgment call" satisfied it with
    // the needs-look noun gone, and "2 need a look·1" satisfied it with judgment
    // gone. One `|` made a two-segment claim into a one-segment claim.
    for (const noun of [/need a look/, /judgment call/]) {
      await expect(chip, `the accessible name must keep ${noun}`).toHaveAccessibleName(noun);
    }

    // The composite pill's LATER segment carries its own mark, which is the
    // published twin's repair swept here -- R4 found it missing as a P0. The
    // leading mark describes needs-look; without this the judgment count was a
    // bare integer separated from it by position alone.
    const wizMarks = await chip.evaluate((el) => {
      const px = (v: string) => parseFloat(v) || 0;
      const marks = Array.from(el.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
        .filter((m) => m.getBoundingClientRect().width > 0)
        .map((m) => {
          const cs = getComputedStyle(m);
          return {
            filled: cs.backgroundColor !== "rgba(0, 0, 0, 0)",
            ringed: px(cs.borderTopWidth) > 0,
          };
        });
      return marks;
    });
    // Two segments visible, so two marks, and they are DIFFERENT shapes.
    expect(wizMarks.length, "the composite pill renders one mark per segment").toBe(2);
    expect(wizMarks[0], "needs-look leads as a filled mark").toEqual({
      filled: true,
      ringed: false,
    });
    expect(wizMarks[1], "judgment carries its own hollow ring").toEqual({
      filled: false,
      ringed: true,
    });
    // The regex above passes on a GLUED name ("2need a look" still contains
    // "need a look"), which is how this shipped defective. Below `sm` the noun
    // is `position:absolute` and so is not a flex item, and the separating
    // space is a whitespace-only text run inside an `inline-flex` -- which
    // generates no box (CSS Flexbox: an anonymous flex item containing only
    // white space is not rendered). The published twin escapes this by wrapping
    // the count and the space in a PLAIN span first; this pill did not.
    // Assert the boundary itself, not the substring.
    // Playwright's OWN accessible-name computation, not `innerText` and not
    // `textContent`. The first draft of this read `innerText`, which excludes
    // the `sr-only` noun entirely and so could never contain a digit-letter
    // boundary -- it passed against the defect it was written to catch.
    // `textContent` fails the other way: it concatenates the whitespace text
    // node whether or not flex rendered it, so it never sees the gluing either.
    // Only the computed name sees what a screen reader would say.
    await expect(
      chip,
      "a digit is glued to its noun in the accessible name",
    ).not.toHaveAccessibleName(/\d(?=[A-Za-z])/);
  });

  // Whole-diff R1 P0 (2026-08-30). The SAME defect the published twin already
  // had, missed on this one: Decision 7 hides the nouns below `sm`, and the
  // wizard's leading dot is SOLID in both states with only its colour changing
  // (`n > 0 ? bg-status-review : bg-text-faint`). So an equal-count needs-look
  // pill and judgment-only pill share dot, count and chevron entirely, leaving
  // meaning on palette alone against DESIGN.md's colour-blind floor.
  //
  // The judgment-only state needed a fixture to be testable at all: the
  // `attention=1` fixture is composite by design, which is exactly why this
  // shipped uncaught.
  test("T-WIZ-MARK @375: needs-look and judgment-only do not share one silhouette", async ({
    page,
  }) => {
    // SHAPE, not hue. A first version of this compared backgroundColor and
    // PASSED against the defect, because the two states already differ in
    // colour (`bg-status-review` vs `bg-text-faint`) -- which is precisely the
    // finding: meaning carried by palette alone. The oracle has to survive
    // colour being removed, so it reduces each mark to whether it is FILLED and
    // whether it is RINGED, and compares those booleans.
    const markOf = async () =>
      page.locator(CHIP).evaluate((el) => {
        const dot = el.querySelector('span[aria-hidden="true"]') as HTMLElement | null;
        if (!dot) return null;
        const cs = getComputedStyle(dot);
        const transparent = (c: string) =>
          c === "transparent" || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
        return {
          filled: !transparent(cs.backgroundColor),
          ringed: parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none",
        };
      });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(`${baseUrl}?attention=1`);
    await page.locator(CHIP).waitFor();
    const composite = await markOf();

    await page.goto(`${baseUrl}?judgmentOnly=1`);
    await page.locator(CHIP).waitFor();
    const judgmentOnly = await markOf();

    expect(composite, "PREMISE: the composite pill rendered a mark").not.toBeNull();
    expect(judgmentOnly, "PREMISE: the judgment-only pill rendered a mark").not.toBeNull();

    // PREMISE that the fixtures really are two states, asserted positively so a
    // flag that silently did nothing fails HERE rather than satisfying the
    // comparison below by rendering the same page twice.
    const seg = async () =>
      page
        .locator(CHIP)
        .evaluate(
          (el) => !!el.querySelector('[data-testid="wizard-attention-pill-judgment-segment"]'),
        );
    const judgmentSeg = await seg();
    await page.goto(`${baseUrl}?attention=1`);
    await page.locator(CHIP).waitFor();
    const compositeSeg = await seg();
    expect(
      { composite: compositeSeg, judgmentOnly: judgmentSeg },
      "PREMISE: both fixtures render a judgment segment, so the two differ by the needs-look segment rather than by nothing",
    ).toEqual({ composite: true, judgmentOnly: true });

    expect(
      judgmentOnly!.filled === composite!.filled && judgmentOnly!.ringed === composite!.ringed,
      `both wizard states paint the same SHAPE (${JSON.stringify(composite)}); they may differ in hue, but a colour-blind reader sees one pill`,
    ).toBe(false);
  });

  test("T-WIZ-COUNTS @1280: the wizard pill's full wording is BACK at sm and up", async ({
    page,
  }) => {
    await openModal(page, 1280, 812);
    const visible = await page.locator(CHIP).evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let out = "";
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const e = n.parentElement as HTMLElement | null;
        const r = e?.getBoundingClientRect();
        if (r && r.width > 1 && r.height > 1) out += n.textContent ?? "";
      }
      return out.replace(/\s+/g, " ").trim();
    });
    expect(visible, "the noun returns above the breakpoint").toMatch(/need a look|judgment call/);
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

  // ── Resize contracts (BL-ATTENTION-MENU-AUTOOPEN-COVERS-TOGGLE-PHONE) ──────
  //
  // The wizard inherits the published surface's whole resize obligation, and
  // whole-diff review round 3 was right that none of it was covered here: the
  // unit suite only changes width before the reveal or while the menu stays
  // suppressed, and every case in this file set the viewport before navigating
  // and never again. A width-change handler that closed the menu, or that made a
  // tap-opened menu Escape-transparent, would have passed the entire wizard
  // suite. There is no such handler today; the point is that nothing said so.
  //
  // The rule the whole design rests on: this change never CLOSES a menu.

  test("AUTO-opened at desktop, then shrunk below sm: the menu stays open", async ({ page }) => {
    // Genuinely auto-opened: never clicked, so `menuAutoOpened` is still true
    // and a defect conditional on it is reachable here.
    await bootAutoOpened(page, 1280, 800);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(250);
    await expect(page.locator(MENU), "shrinking closed an auto-opened menu").toBeVisible();
    // And it is still the AUTO-opened one: shrinking must not quietly convert
    // it into an operator-opened panel, which would flip Escape ownership.
    await expect(page.locator(CHIP)).toHaveAttribute("aria-expanded", "true");
  });

  test("tap-opened at a phone width, then widened past sm: the menu stays open", async ({
    page,
  }) => {
    await openModal(page, 375, 667);
    await page.locator(CHIP).click();
    await expect(page.locator(MENU)).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(250);
    await expect(page.locator(MENU), "widening closed an operator-opened menu").toBeVisible();
  });

  test("a tap-opened menu keeps its Escape after SHRINKING past the boundary", async ({ page }) => {
    // The other direction. Round 4 was right that "either direction" named two
    // and exercised one, so a shrink-only corruption of Escape ownership would
    // have passed.
    await openModal(page, 1280, 800);
    await page.locator(CHIP).click();
    await expect(page.locator(MENU)).toBeVisible();

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(250);
    await page.locator(CHIP).press("Escape");

    await expect(page.locator(MENU), "Escape did not close the menu").toHaveCount(0);
    await expect(page.locator(PANEL), "Escape closed the MODAL, not the menu").toBeVisible();
  });

  test("a tap-opened menu keeps its Escape after WIDENING past the boundary", async ({ page }) => {
    // Escape OWNERSHIP is the wizard-only half. `menuAutoOpened` drives
    // `escTransparentUntilEngaged`, so a menu the operator opened must swallow
    // Escape and close ITSELF, leaving the modal up. If a width change ever set
    // that flag, Escape would start closing the whole modal instead, and only
    // these two cases assert otherwise.
    await openModal(page, 375, 667);
    await page.locator(CHIP).click();
    await expect(page.locator(MENU)).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(250);
    await page.locator(CHIP).press("Escape");

    await expect(page.locator(MENU), "Escape did not close the menu").toHaveCount(0);
    await expect(page.locator(PANEL), "Escape closed the MODAL, not the menu").toBeVisible();
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
